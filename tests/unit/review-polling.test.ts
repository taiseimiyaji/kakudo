import { afterEach, expect, it, vi } from "vitest";
import { pollReview } from "../../modules/review/polling";
afterEach(() => vi.useRealTimers());

it("backs off to at most ten seconds, resets on success and stops at a terminal state", async () => {
  vi.useFakeTimers();
  const load = vi.fn().mockRejectedValue(new Error("offline")); const onData = vi.fn(); const onError = vi.fn();
  const stop = pollReview({ load, onData, onError, pending: (status) => status === "RUNNING" });
  await vi.advanceTimersByTimeAsync(0); expect(load).toHaveBeenCalledTimes(1);
  for (const [index, delay] of [1000, 2000, 4000, 8000, 10000, 10000].entries()) {
    await vi.advanceTimersByTimeAsync(delay - 1); expect(load).toHaveBeenCalledTimes(index + 1);
    await vi.advanceTimersByTimeAsync(1); expect(load).toHaveBeenCalledTimes(index + 2);
  }
  load.mockResolvedValueOnce("RUNNING").mockResolvedValue("COMPLETED");
  await vi.advanceTimersByTimeAsync(10000); expect(onData).toHaveBeenLastCalledWith("RUNNING");
  await vi.advanceTimersByTimeAsync(1000); expect(onData).toHaveBeenLastCalledWith("COMPLETED");
  const count = load.mock.calls.length; await vi.advanceTimersByTimeAsync(60000); expect(load).toHaveBeenCalledTimes(count);
  expect(onError).toHaveBeenCalledTimes(7); stop();
});

it.each([false, true])("ignores old in-flight responses after switching or leaving (failure=%s)", async (failure) => {
  vi.useFakeTimers();
  let finish!: (value: string) => void; let fail!: (error: Error) => void;
  const stalled = new Promise<string>((resolve, reject) => { finish = resolve; fail = reject; });
  const onData = vi.fn(); const onError = vi.fn();
  const stop = pollReview({ load: () => stalled, onData, onError, pending: () => true });
  stop(); if (failure) fail(new Error("late")); else finish("RUNNING");
  await vi.advanceTimersByTimeAsync(60000);
  expect(onData).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});

it("cancels a scheduled retry when the view leaves", async () => {
  vi.useFakeTimers(); const load = vi.fn().mockRejectedValue(new Error("offline"));
  const stop = pollReview({ load, onData: vi.fn(), onError: vi.fn(), pending: () => true });
  await vi.advanceTimersByTimeAsync(0); stop(); await vi.advanceTimersByTimeAsync(60000);
  expect(load).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});
