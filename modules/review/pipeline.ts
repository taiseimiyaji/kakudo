import type { ReviewProvider, ReviewFindingInput, EvidenceDocument, ClaimVerification } from "./contracts";
import type { ResourceFetcher } from "../resource/fetcher";
import type { QuoteSnapshot, SourceSnapshot, SourceCheck } from "../../shared/review";
import { evidenceRetriever, type SearchProvider } from "./evidence";
import { matchQuote } from "./source-check";
export type FindingResult = ReviewFindingInput & { verdict: string | null; evidence: EvidenceDocument[] };
export function verdictFinding(verification: ClaimVerification): Pick<ReviewFindingInput, "category" | "severity"> | null {
  if (verification.verdict === "SUPPORTED") return null;
  return { category: verification.verdict === "TIME_SENSITIVE" ? "FRESHNESS" : "FACT", severity: verification.verdict === "CONTRADICTED" ? "IMPORTANT" : verification.verdict === "INSUFFICIENT_EVIDENCE" ? "INFO" : "WARNING" };
}
export async function factSourcePipeline(input: { markdown: string; type: "FACT_CHECK" | "SOURCE" | "FULL"; groups: SourceSnapshot[][]; quotes: QuoteSnapshot[] }, deps: { provider: ReviewProvider; fetcher: ResourceFetcher; search: SearchProvider; stage: (stage: string) => Promise<void> }) {
  const findings: FindingResult[] = []; const notices: string[] = []; const sourceChecks: SourceCheck[] = []; const retriever = evidenceRetriever(deps.fetcher, deps.search, notices);
  if (input.type !== "SOURCE") {
    await deps.stage("CLAIM_EXTRACTION_AND_CLASSIFICATION");
    const claims = await deps.provider.extractClaims(input.markdown);
    if (claims.length > 20) throw new Error("Review supports at most 20 claims; split the document.");
    for (const claim of claims) {
      if (["OPINION", "UNVERIFIABLE"].includes(claim.type)) { notices.push(`${claim.type}: ${claim.text}`); continue; }
      await deps.stage("EVIDENCE_RETRIEVAL_AND_VERIFICATION");
      const { verification, evidence } = await retriever.verify(claim, input.groups, deps.provider);
      const display = verdictFinding(verification); if (!display) continue;
      findings.push({ ...display, targetText: claim.text, startOffset: claim.startOffset, endOffset: claim.endOffset, explanation: verification.explanation, guidingQuestion: verification.guidingQuestion, verdict: verification.verdict, evidence });
    }
  }
  if (input.type !== "FACT_CHECK") {
    await deps.stage("SOURCE_VERIFICATION");
    for (const quote of input.quotes) {
      const doc = await retriever.fetch(quote.sourceUrl); const status = matchQuote(quote.text, doc?.text ?? null); const accessedAt = new Date().toISOString();
      sourceChecks.push({ quoteId: quote.id, status, url: quote.sourceUrl, title: quote.sourceTitle || doc?.title || quote.sourceUrl, accessedAt });
      if (status !== "VERIFIED") findings.push({ category: "SOURCE", severity: status === "UNAVAILABLE" ? "INFO" : "WARNING", targetText: null, startOffset: null, endOffset: null, explanation: status === "UNAVAILABLE" ? "引用元を取得できませんでした。引用内容の正誤は判断していません。" : status === "PARTIAL_MATCH" ? "引用の一部は確認できましたが、全体は一致していません。" : "取得した引用元で、この引用を確認できませんでした。", guidingQuestion: "引用元の該当箇所と、引用の範囲を確認できますか？", verdict: status, evidence: [{ id: quote.id, url: doc?.url ?? quote.sourceUrl, title: quote.sourceTitle || doc?.title || quote.sourceUrl, text: doc ? doc.text.slice(0, 1000) : "", sourceType: "USER_RESOURCE", accessedAt }] });
    }
  }
  return { findings, notices: [...new Set(notices)], sourceChecks };
}
