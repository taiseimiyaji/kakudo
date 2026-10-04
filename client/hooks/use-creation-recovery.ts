import { useEffect, useRef, useState } from "react";

export type CreationCandidate = { id: string; title: string };
type RecoveryState = { scope: string; identity: object; title: string | null; candidates: CreationCandidate[] | null; reading: boolean; error: string };
const empty = (scope: string): RecoveryState => ({ scope, identity: {}, title: null, candidates: null, reading: false, error: "" });

export function useCreationRecovery(scope: string) {
  const [state, setState] = useState(() => empty(scope));
  let current = state;
  if (state.scope !== scope) { current = empty(scope); setState(current); }
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const identity = current.identity;
  function update(change: (value: RecoveryState) => RecoveryState) {
    if (mounted.current) setState((value) => value.identity === identity ? change(value) : value);
  }
  return {
    ...current,
    blocked: current.title !== null,
    unknown(title: string) { update((value) => ({ ...value, title, candidates: null, reading: false, error: "" })); },
    async read(load: () => Promise<CreationCandidate[]>) {
      if (current.reading || current.title === null) return;
      update((value) => ({ ...value, reading: true, candidates: null, error: "" }));
      try { const candidates = await load(); update((value) => ({ ...value, candidates })); }
      catch { update((value) => ({ ...value, error: "一覧を取得できませんでした。作成結果はまだ不明です。接続を確認して再取得してください。" })); }
      finally { update((value) => ({ ...value, reading: false })); }
    },
    allowNew() { if (current.candidates !== null && !current.reading) update((value) => ({ ...value, title: null, candidates: null, error: "" })); },
  };
}
