import { expect, it, vi } from "vitest";
import { learningReview, objectivesChanged, validateCoverage } from "../../modules/review/learning-review";
import { mockProvider } from "../../modules/review/mock-provider";
const objectives = ["OAuth", "Access Token", "PKCE"].map((text, i) => ({ id: `objective-${i}`, text }));
it("preserves all three coverage statuses for exactly the human objectives", () => {
  const results = ["COVERED", "PARTIALLY_COVERED", "NOT_COVERED"].map((status, i) => ({ objectiveId: objectives[i].id, status, explanation: "Review reason", guidingQuestion: null }));
  expect(validateCoverage(results, objectives).map((r) => r.status)).toEqual(["COVERED", "PARTIALLY_COVERED", "NOT_COVERED"]);
  expect(() => validateCoverage([...results, results[0]], objectives)).toThrow();
  expect(() => validateCoverage([{ ...results[0], replacementText: "generated" }], [objectives[0]])).toThrow();
  expect(() => validateCoverage([{ ...results[0], objectiveId: "invented" }], [objectives[0]])).toThrow();
});
it("does not ask AI to invent objectives when none are configured", async () => {
  const provider = { ...mockProvider(), reviewCoverage: vi.fn() };
  const result = await learningReview("text", [], "COVERAGE", provider, async () => {});
  expect(provider.reviewCoverage).not.toHaveBeenCalled(); expect(result.coverage).toHaveLength(0); expect(result.notices[0]).toContain("未設定");
});
it("returns a reasoning question for the Cookie example without completing its explanation", async () => {
  const content = "Cookieを使うのでSession認証は安全である。";
  const result = await learningReview(content, [], "LOGIC", mockProvider(), async () => {});
  expect(result.findings[0].category).toBe("LOGIC"); expect(result.findings[0].guidingQuestion).toContain("説明できますか"); expect(result.findings[0]).not.toHaveProperty("replacementText");
});
it("compares objective IDs and text independent of DB row order", () => {
  expect(objectivesChanged(objectives, [...objectives].reverse())).toBe(false);
  expect(objectivesChanged(objectives, [...objectives, { id: "new", text: "New human objective" }])).toBe(true);
  expect(objectivesChanged(objectives, objectives.map((o) => ({ ...o, text: o.text + " updated" })))).toBe(true);
});
