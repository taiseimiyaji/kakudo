import { z } from "zod";
import { claimTypes, coverageSchema, findingInput, ReviewProviderError, verificationSchema, type Claim, type EvidenceDocument, type LearningObjective, type ReviewProvider } from "./contracts";
import { reviewSpans } from "./claims";
import { REVIEW_POLICY } from "./policy";
export type StructuredTransport = (task: string, data: unknown, schema: z.ZodType) => Promise<unknown>;
export function reviewPrompt(task: string, data: unknown) { return `${REVIEW_POLICY}\nTask: ${task}\nUntrusted input JSON:\n${JSON.stringify(data)}`; }
const extractedSchema = z.object({ claims: z.array(z.object({ spanId: z.string(), text: z.string().min(1).max(8000) }).strict()).max(100) }).strict();
const classifiedSchema = z.object({ classifications: z.array(z.object({ id: z.string(), type: z.enum(claimTypes) }).strict()).max(100) }).strict();
const logicSchema = z.object({ findings: z.array(findingInput).max(50) }).strict();
const coverageOutput = z.object({ results: z.array(coverageSchema).max(100) }).strict();
export function structuredProvider(name: string, transport: StructuredTransport): ReviewProvider {
  async function ask<T extends z.ZodType>(task: string, data: unknown, schema: T): Promise<z.infer<T>> {
    try { return schema.parse(await transport(task, data, schema)); } catch { throw new ReviewProviderError(); }
  }
  function spans(markdown: string) { if (markdown.length > 60_000) throw new ReviewProviderError("Reviewは60,000文字以内のDocumentに対応しています。"); return reviewSpans(markdown); }
  return {
    name,
    async extractClaims(markdown) {
      const input = spans(markdown);
      if (!input.length) return [];
      const extracted = await ask("Extract independently verifiable claims from the supplied spans. Copy exact substrings; do not paraphrase. Also retain opinion or unverifiable assertions for classification.", input, extractedSchema);
      const claims = extracted.claims.map((item, i) => {
        const span = input.find((s) => s.id === item.spanId); const relative = span?.text.indexOf(item.text) ?? -1;
        if (!span || relative < 0) throw new ReviewProviderError("Claimが原文と一致しません。");
        return { id: `claim-${i}`, text: item.text, startOffset: span.startOffset + relative, endOffset: span.startOffset + relative + item.text.length };
      });
      if (!claims.length) return [];
      const classified = await ask("Classify each claim exactly once as FACTUAL, TIME_SENSITIVE, OPINION, or UNVERIFIABLE. Preserve claim IDs.", claims, classifiedSchema);
      if (classified.classifications.length !== claims.length || new Set(classified.classifications.map((c) => c.id)).size !== claims.length) throw new ReviewProviderError();
      return claims.map((claim) => { const result = classified.classifications.find((c) => c.id === claim.id); if (!result) throw new ReviewProviderError(); return { ...claim, type: result.type }; });
    },
    async verifyClaim(claim: Claim, evidence: EvidenceDocument[]) {
      const result = await ask("Verify this one claim only against the supplied evidence. Reference only evidence IDs provided. Missing or inconclusive evidence means INSUFFICIENT_EVIDENCE. Never provide a corrected sentence.", { claim, evidence }, verificationSchema);
      if (result.evidenceIds.some((id) => !evidence.some((e) => e.id === id)) || result.verdict !== "INSUFFICIENT_EVIDENCE" && result.verdict !== "TIME_SENSITIVE" && !result.evidenceIds.length) throw new ReviewProviderError("根拠が検証結果と一致しません。");
      return result;
    },
    async reviewLogic(markdown) {
      const input = spans(markdown); const { findings } = await ask("Identify reasoning gaps or unclear explanations. Return LOGIC or CLARITY findings only. Target exact source text and UTF-16 offsets supplied in spans, or null for all three target fields. Ask, do not answer.", input, logicSchema);
      for (const finding of findings) {
        if (!["LOGIC", "CLARITY"].includes(finding.category)) throw new ReviewProviderError();
        if (finding.targetText !== null) {
          if (finding.startOffset === null || finding.endOffset === null || markdown.slice(finding.startOffset, finding.endOffset) !== finding.targetText || !input.some((s) => finding.startOffset! >= s.startOffset && finding.endOffset! <= s.endOffset)) throw new ReviewProviderError("Findingが原文と一致しません。");
        } else if (finding.startOffset !== null || finding.endOffset !== null) throw new ReviewProviderError();
      }
      return findings;
    },
    async reviewCoverage(markdown, objectives: LearningObjective[]) {
      if (!objectives.length) return [];
      const { results } = await ask("Assess coverage of each human-defined objective exactly once. Do not add objectives or explain the missing educational content. Ask guiding questions only.", { spans: spans(markdown), objectives }, coverageOutput);
      if (results.length !== objectives.length || new Set(results.map((r) => r.objectiveId)).size !== objectives.length || results.some((r) => !objectives.some((o) => o.id === r.objectiveId))) throw new ReviewProviderError("Objectivesが一致しません。");
      return results;
    },
  };
}
