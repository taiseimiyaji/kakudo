import { z } from "zod";
import { coverageSchema, findingInput, ReviewProviderError, type CoverageResult, type LearningObjective, type ReviewProvider } from "./contracts";
import { reviewSpans } from "./claims";
import type { FindingResult } from "./pipeline";
export function objectivesChanged(before: LearningObjective[], after: LearningObjective[]) {
  const canonical = (items: LearningObjective[]) => JSON.stringify(items.map(({ id, text }) => ({ id, text })).sort((a, b) => a.id.localeCompare(b.id)));
  return canonical(before) !== canonical(after);
}
export function validateCoverage(raw: unknown, objectives: LearningObjective[]): CoverageResult[] {
  const result = z.array(coverageSchema).max(100).parse(raw);
  if (result.length !== objectives.length || new Set(result.map((r) => r.objectiveId)).size !== objectives.length || result.some((r) => !objectives.some((o) => o.id === r.objectiveId))) throw new ReviewProviderError("人間が定義したObjectivesと結果が一致しません。");
  return result;
}
export async function learningReview(markdown: string, objectives: LearningObjective[], type: "LOGIC" | "COVERAGE" | "FULL", provider: ReviewProvider, stage: (value: string) => Promise<void>) {
  const findings: FindingResult[] = []; let coverage: CoverageResult[] = []; const notices: string[] = [];
  if (type !== "COVERAGE") {
    await stage("LOGIC_REVIEW");
    const result = z.array(findingInput).max(50).parse(await provider.reviewLogic(markdown)); const spans = reviewSpans(markdown);
    for (const finding of result) {
      if (!["LOGIC", "CLARITY"].includes(finding.category)) throw new ReviewProviderError();
      if (finding.targetText !== null) {
        const { startOffset: start, endOffset: end } = finding;
        if (start === null || end === null || start >= end || markdown.slice(start, end) !== finding.targetText || !spans.some((span) => start >= span.startOffset && end <= span.endOffset)) throw new ReviewProviderError("Logicの指摘位置が原文と一致しません。");
      } else if (finding.startOffset !== null || finding.endOffset !== null) throw new ReviewProviderError();
      findings.push({ ...finding, verdict: null, evidence: [] });
    }
  }
  if (type !== "LOGIC") {
    await stage("COVERAGE_REVIEW");
    if (!objectives.length) notices.push("Learning Objectivesが未設定のため、Coverageは評価していません。Nodeに自分で目標を設定してください。");
    else {
      coverage = validateCoverage(await provider.reviewCoverage(markdown, objectives), objectives);
      for (const item of coverage) if (item.status !== "COVERED") findings.push({ category: "COVERAGE", severity: "INFO", targetText: null, startOffset: null, endOffset: null, explanation: `${objectives.find((o) => o.id === item.objectiveId)!.text}\n${item.explanation}`, guidingQuestion: item.guidingQuestion, verdict: item.status, evidence: [] });
    }
  }
  return { findings, coverage, notices };
}
