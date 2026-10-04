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

it("times out one read once and retains the existing capped backoff and success reset", async () => {
  vi.useFakeTimers(); const signals: AbortSignal[] = [];
  const load = vi.fn((signal: AbortSignal) => { signals.push(signal); return new Promise<string>(() => {}); }); const onData = vi.fn(); const onError = vi.fn();
  const stop = pollReview({ load, onData, onError, pending: (status) => status === "RUNNING" });
  for (const [index, delay] of [1000, 2000, 4000, 8000, 10000, 10000].entries()) {
    await vi.advanceTimersByTimeAsync(19999); expect(onError).toHaveBeenCalledTimes(index); expect(load).toHaveBeenCalledTimes(index + 1);
    await vi.advanceTimersByTimeAsync(1); expect(onError).toHaveBeenCalledTimes(index + 1); expect(signals[index].aborted).toBe(true); expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(delay - 1); expect(load).toHaveBeenCalledTimes(index + 1);
    await vi.advanceTimersByTimeAsync(1); expect(load).toHaveBeenCalledTimes(index + 2);
  }
  load.mockResolvedValueOnce("RUNNING").mockRejectedValueOnce(new Error("offline")).mockResolvedValue("COMPLETED");
  await vi.advanceTimersByTimeAsync(20000); await vi.advanceTimersByTimeAsync(10000); expect(onData).toHaveBeenLastCalledWith("RUNNING");
  await vi.advanceTimersByTimeAsync(1000); expect(onError).toHaveBeenCalledTimes(8);
  await vi.advanceTimersByTimeAsync(999); expect(load).toHaveBeenCalledTimes(9);
  await vi.advanceTimersByTimeAsync(1); expect(onData).toHaveBeenLastCalledWith("COMPLETED"); expect(load).toHaveBeenCalledTimes(10);
  await vi.advanceTimersByTimeAsync(60000); expect(load).toHaveBeenCalledTimes(10); expect(vi.getTimerCount()).toBe(0); stop();
});

it.each([false, true])("ignores late timed-out read fulfillment or rejection without a second retry (failure=%s)", async (failure) => {
  vi.useFakeTimers(); let finish!: (value: string) => void; let fail!: (error: Error) => void;
  const old = new Promise<string>((resolve, reject) => { finish = resolve; fail = reject; }); const load = vi.fn().mockReturnValueOnce(old).mockResolvedValue("COMPLETED"); const onData = vi.fn(); const onError = vi.fn();
  const stop = pollReview({ load, onData, onError, pending: () => false }); await vi.advanceTimersByTimeAsync(20000); expect(onError).toHaveBeenCalledTimes(1);
  if (failure) fail(new Error("late")); else finish("RUNNING"); await vi.advanceTimersByTimeAsync(0); expect(onData).not.toHaveBeenCalled(); expect(onError).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(1000); expect(onData).toHaveBeenCalledExactlyOnceWith("COMPLETED"); await vi.advanceTimersByTimeAsync(60000); expect(load).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0); stop();
});

it("deadline and abort rejection converge on one safe error and one retry", async () => {
  vi.useFakeTimers(); const load = vi.fn((signal: AbortSignal) => new Promise<string>((_, reject) => { signal.addEventListener("abort", () => reject(new Error("private diagnostic")), { once: true }); })); const onError = vi.fn();
  const stop = pollReview({ load, onData: vi.fn(), onError, pending: () => false }); await vi.advanceTimersByTimeAsync(20000); expect(onError).toHaveBeenCalledTimes(1); expect(onError.mock.calls[0][0].message).toBe("応答が時間内に届きませんでした。接続を確認して再取得してください。"); expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(1000); expect(load).toHaveBeenCalledTimes(2); stop(); await vi.advanceTimersByTimeAsync(60000); expect(onError).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});

it("cleanup aborts a pending read and clears its deadline without reporting failure", async () => {
  vi.useFakeTimers(); let signal!: AbortSignal; const load = vi.fn((value: AbortSignal) => { signal = value; return new Promise<string>(() => {}); }); const onData = vi.fn(); const onError = vi.fn(); const stop = pollReview({ load, onData, onError, pending: () => true });
  expect(signal.aborted).toBe(false); expect(vi.getTimerCount()).toBe(1); stop(); expect(signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0); await vi.advanceTimersByTimeAsync(60000); expect(load).toHaveBeenCalledTimes(1); expect(onData).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
});

it("manual replacement cancels the old backoff instead of starting a duplicate request", async () => {
  vi.useFakeTimers(); const load = vi.fn().mockReturnValueOnce(new Promise<string>(() => {})).mockResolvedValue("COMPLETED"); const onError = vi.fn(); const onData = vi.fn(); const stopOld = pollReview({ load, onData, onError, pending: () => false }); await vi.advanceTimersByTimeAsync(20000); expect(onError).toHaveBeenCalledTimes(1); stopOld();
  const stopCurrent = pollReview({ load, onData, onError, pending: () => false }); await vi.advanceTimersByTimeAsync(0); expect(load).toHaveBeenCalledTimes(2); expect(onData).toHaveBeenCalledExactlyOnceWith("COMPLETED"); await vi.advanceTimersByTimeAsync(60000); expect(load).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0); stopCurrent();
});

it("successful terminal data just before the deadline cancels that deadline", async () => {
  vi.useFakeTimers(); let finish!: (value: string) => void; const promise = new Promise<string>(resolve => { finish = resolve; }); const load = vi.fn(() => promise); const onData = vi.fn(); const onError = vi.fn(); const stop = pollReview({ load, onData, onError, pending: () => false });
  await vi.advanceTimersByTimeAsync(19999); finish("COMPLETED"); await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(60000); expect(onData).toHaveBeenCalledExactlyOnceWith("COMPLETED"); expect(onError).not.toHaveBeenCalled(); expect(load).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0); stop();
});

it("a synchronously thrown read clears its deadline and uses only the existing failure backoff", async () => {
  vi.useFakeTimers(); const load = vi.fn((): Promise<string> => { throw new Error("offline"); }); const onError = vi.fn(); const stop = pollReview({ load, onData: vi.fn(), onError, pending: () => false }); await vi.advanceTimersByTimeAsync(0); expect(onError).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(1); await vi.advanceTimersByTimeAsync(1000); expect(load).toHaveBeenCalledTimes(2); expect(onError).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(1); stop();
});
