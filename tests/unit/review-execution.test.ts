import { expect, it, vi } from "vitest";
import { abortable, executionConfig } from "../../modules/review/execution";

it("rejects before starting work and prevents late completion after cancellation", async () => {
  const controller = new AbortController(); let complete!: (value: number) => void;
  const work = vi.fn(() => new Promise<number>((resolve) => { complete = resolve; }));
  const running = abortable(controller.signal, work);
  await Promise.resolve(); controller.abort(new Error("deadline"));
  await expect(running).rejects.toThrow("deadline"); complete(1);
  expect(() => abortable(controller.signal, work)).toThrow("deadline");
  expect(work).toHaveBeenCalledTimes(1);
});

it("validates admission and run deadline configuration", () => {
  expect(executionConfig.parse({})).toEqual({ REVIEW_MAX_PENDING: 10, REVIEW_RUN_TIMEOUT_MS: 600000 });
  for (const config of [{ REVIEW_MAX_PENDING: 0 }, { REVIEW_RUN_TIMEOUT_MS: -1 }, { REVIEW_MAX_PENDING: 101 }]) expect(() => executionConfig.parse(config)).toThrow();
});
