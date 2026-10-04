export const NOTE_READ_TIMEOUT_MS = 20_000;

/** One read at a note entry point; the caller owns explicit retry and scope changes. */
export function readNote<T>({ load, onData, onError }: {
  load: (signal: AbortSignal) => Promise<T>;
  onData: (data: T) => void;
  onError: (error: Error) => void;
}) {
  let active = true; let timedOut = false;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function read() {
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error("Note read deadline"));
          controller.abort();
        }, NOTE_READ_TIMEOUT_MS);
      });
      const data = await Promise.race([load(controller.signal), deadline]);
      if (active) onData(data);
    } catch {
      if (active) onError(new Error(timedOut
        ? "ノートの応答が時間内に届きませんでした。接続を確認して再取得してください。"
        : "ノートを読み取れませんでした。接続や対象を確認して再取得してください。"));
    } finally { clearTimeout(timer); }
  }
  void read();
  return () => { active = false; clearTimeout(timer); controller.abort(); };
}
