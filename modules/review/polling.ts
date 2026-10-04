/** Retry state reads only. Cancellation also invalidates an in-flight response. */
export function pollReview<T>({ load, onData, onError, pending }: { load: () => Promise<T>; onData: (data: T) => void; onError: (error: unknown) => void; pending: (data: T) => boolean }) {
  let active = true; let failures = 0; let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (delay: number) => { timer = setTimeout(() => { void read(); }, delay); };
  async function read() {
    try {
      const data = await load(); if (!active) return;
      failures = 0; onData(data);
      if (pending(data)) schedule(1000);
    } catch (error) {
      if (!active) return;
      onError(error); schedule(Math.min(1000 * 2 ** Math.min(failures++, 4), 10000));
    }
  }
  void read();
  return () => { active = false; clearTimeout(timer); };
}
