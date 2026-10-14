import { expect, it } from "vitest";
import { LOCAL_DRAFT_MAX_BYTES, localCandidateKey, localDocumentKey, localDraftBytes, putLocalCandidate, validCandidate, type LocalCandidate } from "../../client/local-recovery";

const documentKey = localDocumentKey("default", "document-id");
const candidate: LocalCandidate = { version: 1, key: localCandidateKey(documentKey, "session-id"), documentKey, sessionId: "session-id", generation: 1,
  title: "  ", content: "人間の本文\r\n次の行", baseHash: "hash", baseWriteId: null, outcomeUnknown: false, updatedAt: 1 };

it("validates exact whitespace and CRLF drafts without using the server's trimmed save schema", () => {
  expect(validCandidate(candidate)).toBe(true);
  expect(candidate.title).toBe("  "); expect(candidate.content).toContain("\r\n");
  expect(localDraftBytes(candidate.title, candidate.content)).toBe(new TextEncoder().encode(candidate.title + candidate.content).length);
  expect(validCandidate({ ...candidate, version: 2 })).toBe(false);
  expect(validCandidate({ ...candidate, generation: 0 })).toBe(false);
  expect(validCandidate({ ...candidate, key: "wrong-key" })).toBe(false);
  expect(validCandidate({ ...candidate, updatedAt: 8.64e15 + 1 })).toBe(false);
});

it("rejects an oversized candidate before touching browser storage", async () => {
  const oversized = { ...candidate, content: "あ".repeat(Math.floor(LOCAL_DRAFT_MAX_BYTES / 3) + 1) };
  expect(localDraftBytes(oversized.title, oversized.content)).toBeGreaterThan(LOCAL_DRAFT_MAX_BYTES);
  await expect(putLocalCandidate(oversized, 1)).rejects.toMatchObject({ kind: "limit" });
});
