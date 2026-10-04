/** Bound state reads; the existing backoff owns every retry. Never replay writes. */
export function pollReview<T>({ load, onData, onError, pending }: { load: (signal: AbortSignal) => Promise<T>; onData: (data: T) => void; onError: (error: unknown) => void; pending: (data: T) => boolean }) {
  let active = true; let failures = 0; let timer: ReturnType<typeof setTimeout> | undefined;
  let currentRead: { controller: AbortController; deadline?: ReturnType<typeof setTimeout> } | null = null;
  const schedule = (delay: number) => { if (active) timer = setTimeout(() => { void read(); }, delay); };
  async function read() {
    const attempt = { controller: new AbortController(), deadline: undefined as ReturnType<typeof setTimeout> | undefined }; currentRead = attempt;
    try {
      const deadline = new Promise<never>((_, reject) => {
        attempt.deadline = setTimeout(() => {
          // Settle once with a safe timeout, then abort the underlying GET. Its
          // rejection or later response cannot start a second retry.
          reject(new Error("応答が時間内に届きませんでした。接続を確認して再取得してください。")); attempt.controller.abort();
        }, 20000);
      });
      const data = await Promise.race([load(attempt.controller.signal), deadline]);
      if (!active || currentRead !== attempt) return;
      failures = 0; onData(data);
      if (pending(data)) schedule(1000);
    } catch (error) {
      if (!active || currentRead !== attempt) return;
      onError(error); schedule(Math.min(1000 * 2 ** Math.min(failures++, 4), 10000));
    } finally { clearTimeout(attempt.deadline); if (currentRead === attempt) currentRead = null; }
  }
  void read();
  return () => { active = false; clearTimeout(timer); if (currentRead) { clearTimeout(currentRead.deadline); currentRead.controller.abort(); } };
}
