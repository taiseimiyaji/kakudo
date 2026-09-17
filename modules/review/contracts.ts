import { z } from "zod";
export const claimTypes = ["FACTUAL", "TIME_SENSITIVE", "OPINION", "UNVERIFIABLE"] as const;
export const verdicts = ["SUPPORTED", "CONTRADICTED", "PARTIALLY_SUPPORTED", "INSUFFICIENT_EVIDENCE", "TIME_SENSITIVE"] as const;
export const categories = ["FACT", "SOURCE", "LOGIC", "COVERAGE", "FRESHNESS", "CLARITY"] as const;
export const severities = ["INFO", "WARNING", "IMPORTANT"] as const;
export const claimSchema = z.object({ id: z.string(), text: z.string().min(1), startOffset: z.number().int().nonnegative(), endOffset: z.number().int().nonnegative(), type: z.enum(claimTypes) }).strict();
export type Claim = z.infer<typeof claimSchema>;
export type EvidenceDocument = { id: string; url: string; title: string; text: string; sourceType: "USER_RESOURCE" | "OFFICIAL" | "PRIMARY" | "SECONDARY"; accessedAt: string };
export const findingInput = z.object({ category: z.enum(categories), severity: z.enum(severities), targetText: z.string().max(8000).nullable(), startOffset: z.number().int().nonnegative().nullable(), endOffset: z.number().int().nonnegative().nullable(), explanation: z.string().min(1).max(3000), guidingQuestion: z.string().max(1000).nullable() }).strict();
export type ReviewFindingInput = z.infer<typeof findingInput>;
export const verificationSchema = z.object({ verdict: z.enum(verdicts), explanation: z.string().min(1).max(3000), guidingQuestion: z.string().max(1000).nullable(), evidenceIds: z.array(z.string()).max(20) }).strict();
export type ClaimVerification = z.infer<typeof verificationSchema>;
export type LearningObjective = { id: string; text: string; nodeTitle?: string };
export const coverageSchema = z.object({ objectiveId: z.string(), status: z.enum(["COVERED", "PARTIALLY_COVERED", "NOT_COVERED"]), explanation: z.string().max(3000), guidingQuestion: z.string().max(1000).nullable() }).strict();
export type CoverageResult = z.infer<typeof coverageSchema>;
export interface ReviewProvider {
  readonly name: string;
  extractClaims(markdown: string): Promise<Claim[]>;
  verifyClaim(claim: Claim, evidence: EvidenceDocument[]): Promise<ClaimVerification>;
  reviewLogic(markdown: string): Promise<ReviewFindingInput[]>;
  reviewCoverage(markdown: string, objectives: LearningObjective[]): Promise<CoverageResult[]>;
}
export class ReviewProviderError extends Error { constructor(message = "Review Providerが失敗しました。接続設定または出力形式を確認してください。") { super(message); } }
