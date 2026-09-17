import { z } from "zod";
export const reviewTypes = ["FACT_CHECK", "LOGIC", "COVERAGE", "SOURCE", "FULL"] as const;
export const reviewStart = z.object({ revisionId: z.string().min(1), type: z.enum(reviewTypes).default("FULL") }).strict();
export const findingStatusInput = z.object({ status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]) }).strict();
export type SourceCheck = { quoteId: string; status: "VERIFIED" | "PARTIAL_MATCH" | "NOT_FOUND" | "UNAVAILABLE"; url: string; title: string; accessedAt: string };
export type QuoteSnapshot = { id: string; text: string; sourceUrl: string; sourceTitle: string | null };
export type SourceSnapshot = { id: string; url: string; title: string; type: string };
export type ReviewDetail = {
  run: { id: string; documentId: string; revisionId: string; type: typeof reviewTypes[number]; status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED"; provider: string; stage: string; error: string | null; createdAt: string; sourceChecks: SourceCheck[]; notices: string[]; coverage: { objectiveId: string; status: string; explanation: string; guidingQuestion: string | null }[]; objectives: { id: string; text: string }[] };
  findings: { id: string; category: string; severity: string; status: "OPEN" | "RESOLVED" | "DISMISSED"; targetText: string | null; startOffset: number | null; endOffset: number | null; explanation: string; guidingQuestion: string | null; verdict: string | null; evidence: { id: string; url: string; title: string; excerpt: string | null; sourceType: string; accessedAt: string }[] }[];
  revision: { id: string; contentHash: string; contentSnapshot: string }; stale: boolean;
};
