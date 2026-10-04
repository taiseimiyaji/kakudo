import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { UnknownMutationOutcome } from "../api";
import { readFindingDecision, requestFindingDecision, type FindingDecisionTarget, type FindingStatus } from "../finding-decision";

type Scope = { documentId: string; workspaceId: string };
type Attempt = FindingDecisionTarget & { scope: Scope; description: string };
type Recovery = { attempt: Attempt; currentStatus: FindingStatus | null; reading: boolean; error: string };
type State = { scope: Scope; busy: boolean; recovery: Recovery | null };
const empty = (scope: Scope): State => ({ scope, busy: false, recovery: null });

export function useFindingDecision(documentId: string, workspaceId: string) {
  const scope = useMemo(() => ({ documentId, workspaceId }), [documentId, workspaceId]);
  const scopeRef = useRef(scope); const mounted = useRef(true);
  const pending = useRef<Attempt | null>(null); const unknown = useRef<Attempt | null>(null); const reading = useRef<Attempt | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useLayoutEffect(() => { if (scopeRef.current !== scope) { pending.current = null; unknown.current = null; reading.current = null; } scopeRef.current = scope; }, [scope]);
  const [state, setState] = useState(() => empty(scope));
  let current = state;
  if (state.scope !== scope) { current = empty(scope); setState(current); }
  const active = () => mounted.current && scopeRef.current === scope;
  function update(change: (value: State) => State) { if (active()) setState((value) => value.scope === scope ? change(value) : value); }
  function updateRecovery(attempt: Attempt, change: (value: Recovery) => Recovery) {
    if (unknown.current === attempt) update((value) => value.recovery?.attempt === attempt ? { ...value, recovery: change(value.recovery) } : value);
  }
  const recovery = current.recovery;
  return {
    busy: current.busy, blocked: !!recovery, recovery,
    async change(runId: string, revisionId: string, findingId: string, status: FindingStatus, description: string, callbacks: { onStart: () => void; onConfirmed: (target: FindingDecisionTarget, status: FindingStatus) => void; onRejected: (message: string) => void }) {
      if (!active() || pending.current || unknown.current) return;
      const attempt = { ...scope, scope, runId, revisionId, findingId, status, description }; pending.current = attempt;
      update((value) => ({ ...value, busy: true })); callbacks.onStart();
      try { const result = await requestFindingDecision(attempt); if (active() && pending.current === attempt) callbacks.onConfirmed(attempt, result); }
      catch (error) {
        if (active() && pending.current === attempt) {
          if (error instanceof UnknownMutationOutcome) { unknown.current = attempt; update((value) => ({ ...value, recovery: { attempt, currentStatus: null, reading: false, error: "" } })); }
          else callbacks.onRejected((error as Error).message);
        }
      } finally { if (pending.current === attempt) { pending.current = null; update((value) => ({ ...value, busy: false })); } }
    },
    async read(onRead: (target: FindingDecisionTarget, status: FindingStatus) => void) {
      if (!recovery || !active() || unknown.current !== recovery.attempt || reading.current) return;
      const attempt = recovery.attempt; reading.current = attempt; updateRecovery(attempt, (value) => ({ ...value, currentStatus: null, reading: true, error: "" }));
      try {
        const status = await readFindingDecision(attempt);
        if (active() && unknown.current === attempt && reading.current === attempt) { updateRecovery(attempt, (value) => ({ ...value, currentStatus: status })); onRead(attempt, status); }
      } catch { updateRecovery(attempt, (value) => ({ ...value, error: "指摘の現在状態を取得できませんでした。更新結果はまだ不明です。接続を確認して再取得してください。" })); }
      finally { if (reading.current === attempt) reading.current = null; updateRecovery(attempt, (value) => ({ ...value, reading: false })); }
    },
    allowNew() {
      if (!active() || !recovery || recovery.currentStatus === null || recovery.reading || unknown.current !== recovery.attempt) return;
      unknown.current = null; update((value) => ({ ...value, recovery: null }));
    },
  };
}
