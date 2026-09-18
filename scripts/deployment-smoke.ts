import "dotenv/config";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import type { ReviewDetail } from "../shared/review";

const origin = process.env.SMOKE_BASE_URL;
const input = process.env.SMOKE_MARKDOWN_PATH;
if (!origin || new URL(origin).origin !== origin || !input) throw new Error("Set SMOKE_BASE_URL (origin only) and SMOKE_MARKDOWN_PATH (human-written verification note).");
const content = await readFile(input, "utf8");
const expectedProvider = process.env.SMOKE_EXPECT_PROVIDER ?? "codex";
const type = process.env.SMOKE_REVIEW_TYPE === "FULL" ? "FULL" : "FACT_CHECK";
async function api<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(`${origin}/api${path}`, { method, headers: { Origin: origin!, ...(data === undefined ? {} : { "Content-Type": "application/json" }) }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Smoke API ${response.status}; request ID ${response.headers.get("x-request-id") ?? "unavailable"}`);
  return response.status === 204 ? undefined as T : await response.json() as T;
}
type Saved = { document: { id: string; currentRevisionId: string }; content: string; contentHash: string };
let id: string | undefined;
try {
  const { document } = await api<Saved>("/documents", "POST", { title: "[verification] Deployment smoke", content }); id = document.id;
  await api(`/documents/${id}/resources`, "POST", { url: "https://www.rfc-editor.org/rfc/rfc6749", title: "RFC 6749", type: "RFC" });
  const { run } = await api<{ run: { id: string; provider: string } }>(`/documents/${id}/reviews`, "POST", { revisionId: document.currentRevisionId, type });
  assert.equal(run.provider, expectedProvider, "Unexpected Provider; do not mistake Mock for a real run");
  const before = await api<Saved>(`/documents/${id}`);
  // Whitespace-only edit tests Revision pinning without generating educational content.
  await api(`/documents/${id}`, "PUT", { title: "[verification] Deployment smoke", content: content + "\n", baseHash: before.contentHash });
  const deadline = Date.now() + 660000;
  let result: ReviewDetail;
  while (true) {
    result = await api<ReviewDetail>(`/reviews/${run.id}`);
    if (["COMPLETED", "FAILED"].includes(result.run.status)) break;
    if (Date.now() > deadline) throw new Error("Smoke polling deadline exceeded");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(result.run.status, "COMPLETED", "Review failed; inspect the run and server log");
  assert.equal(result.run.revisionId, document.currentRevisionId);
  assert.equal(result.revision.contentSnapshot, content);
  assert.equal(result.stale, true);
  assert.equal((await api<Saved>(`/documents/${id}`)).content, content + "\n");
  assert(result.findings.some((finding) => finding.verdict === "CONTRADICTED" && finding.evidence.length > 0), "Use the specification's OAuth contradiction as the smoke note");
  console.log(JSON.stringify({ provider: run.provider, reviewId: run.id, revisionId: document.currentRevisionId, status: result.run.status, stale: result.stale, contentUnchangedByReview: true, evidence: result.findings.flatMap((finding) => finding.evidence.map((item) => item.url)) }));
} finally { if (id) await api(`/documents/${id}`, "DELETE"); }
