import { expect, it } from "vitest";
import { contentHash } from "../../modules/document/hash";
import { needsRevision, reviewIsStale } from "../../shared/revision";
it("hashes exact UTF-8 including line endings", () => {
  expect(contentHash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  expect(contentHash("あ\r\n")).not.toBe(contentHash("あ\n"));
});
it("deduplicates only the previous revision, retaining A to B to A", () => {
  expect(needsRevision(undefined, "a")).toBe(true); expect(needsRevision("a", "a")).toBe(false);
  expect(needsRevision("a", "b")).toBe(true); expect(needsRevision("b", "a")).toBe(true);
});
it("marks changed revision or unsaved/external content stale", () => {
  expect(reviewIsStale("r1", "r1", "a", "a")).toBe(false);
  expect(reviewIsStale("r1", "r2", "a", "a")).toBe(true);
  expect(reviewIsStale("r1", "r1", "a", "b")).toBe(true);
  expect(reviewIsStale("r1", null, "a", "a")).toBe(true);
});
