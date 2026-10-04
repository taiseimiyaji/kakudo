import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GraphSaveCurrent, GraphSaveTarget } from "../graph-save";

type Scope = { workspaceId: string; mapId: string | undefined };
type Attempt = { scope: Scope; target: GraphSaveTarget };
type Recovery = { attempt: Attempt; current: GraphSaveCurrent | null; reading: boolean; error: string };
type State = { scope: Scope; recovery: Recovery | null };
const empty = (scope: Scope): State => ({ scope, recovery: null });

export function useGraphSaveRecovery(workspaceId: string, mapId: string | undefined) {
  const scope = useMemo(() => ({ workspaceId, mapId }), [workspaceId, mapId]); const scopeRef = useRef(scope); const mounted = useRef(true);
  const unknown = useRef<Attempt | null>(null); const reading = useRef<Attempt | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useLayoutEffect(() => { if (scopeRef.current !== scope) { unknown.current = null; reading.current = null; } scopeRef.current = scope; }, [scope]);
  const [state, setState] = useState(() => empty(scope)); let current = state;
  if (state.scope !== scope) { current = empty(scope); setState(current); }
  const active = () => mounted.current && scopeRef.current === scope;
  function update(change: (value: State) => State) { if (active()) setState((value) => value.scope === scope ? change(value) : value); }
  function updateRecovery(attempt: Attempt, change: (value: Recovery) => Recovery) {
    if (unknown.current === attempt) update((value) => value.recovery?.attempt === attempt ? { ...value, recovery: change(value.recovery) } : value);
  }
  const recovery = current.recovery;
  return {
    recovery, blocked: !!recovery,
    unknown(target: GraphSaveTarget) {
      if (!active() || target.workspaceId !== workspaceId || target.mapId !== mapId) return;
      const attempt = { scope, target: structuredClone(target) }; unknown.current = attempt;
      update((value) => ({ ...value, recovery: { attempt, current: null, reading: false, error: "" } }));
    },
    async read(load: (target: GraphSaveTarget) => Promise<GraphSaveCurrent>) {
      if (!active() || !recovery || unknown.current !== recovery.attempt || reading.current) return;
      const attempt = recovery.attempt; reading.current = attempt; updateRecovery(attempt, (value) => ({ ...value, current: null, reading: true, error: "" }));
      try { const result = await load(attempt.target); updateRecovery(attempt, (value) => ({ ...value, current: result })); }
      catch { updateRecovery(attempt, (value) => ({ ...value, error: "現在の保存済み内容を取得できませんでした。保存結果はまだ不明です。接続を確認して再取得してください。" })); }
      finally { if (reading.current === attempt) reading.current = null; updateRecovery(attempt, (value) => ({ ...value, reading: false })); }
    },
    allowNew() {
      if (!active() || !recovery || recovery.current === null || recovery.reading || reading.current || unknown.current !== recovery.attempt) return;
      unknown.current = null; update((value) => ({ ...value, recovery: null }));
    },
  };
}
