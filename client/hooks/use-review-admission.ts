import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { request, UnknownMutationOutcome } from "../api";
import { requestReviewAdmission, reviewHistoryItemSchema, type ReviewAdmissionTarget, type ReviewHistoryItem } from "../review-admission";

type Scope = { documentId: string; workspaceId: string };
type Attempt = ReviewAdmissionTarget & { scope: Scope; knownIds: Set<string> };
type Recovery = { attempt: Attempt; rows: ReviewHistoryItem[] | null; reading: boolean; error: string };
type State = { scope: Scope; busy: boolean; recovery: Recovery | null };
const empty = (scope: Scope): State => ({ scope, busy: false, recovery: null });

export function useReviewAdmission(documentId: string, workspaceId: string) {
  const scope = useMemo(() => ({ documentId, workspaceId }), [documentId, workspaceId]);
  const scopeRef = useRef(scope); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const pending = useRef<Attempt | null>(null); const unknown = useRef<Attempt | null>(null); const reading = useRef<Attempt | null>(null);
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
  const candidates = recovery?.rows?.filter((run) => run.revisionId === recovery.attempt.revisionId && run.type === recovery.attempt.type && !recovery.attempt.knownIds.has(run.id)) ?? null;
  return {
    busy: current.busy, blocked: !!recovery, recovery, candidates,
    async start(revisionId: string, type: ReviewAdmissionTarget["type"], knownIds: string[], callbacks: { onStart: () => void; onAccepted: (id: string) => void; onRejected: (message: string) => void }) {
      if (!active() || pending.current || unknown.current) return;
      const attempt = { ...scope, scope, revisionId, type, knownIds: new Set(knownIds) }; pending.current = attempt;
      update((value) => ({ ...value, busy: true })); callbacks.onStart();
      try { const run = await requestReviewAdmission(attempt); if (active() && pending.current === attempt) callbacks.onAccepted(run.id); }
      catch (error) {
        if (active() && pending.current === attempt) {
          if (error instanceof UnknownMutationOutcome) { unknown.current = attempt; update((value) => ({ ...value, recovery: { attempt, rows: null, reading: false, error: "" } })); }
          else callbacks.onRejected((error as Error).message);
        }
      } finally { if (pending.current === attempt) { pending.current = null; update((value) => ({ ...value, busy: false })); } }
    },
    async read() {
      if (!recovery || !active() || unknown.current !== recovery.attempt || reading.current) return;
      const attempt = recovery.attempt; reading.current = attempt; updateRecovery(attempt, (value) => ({ ...value, rows: null, reading: true, error: "" }));
      try {
        const payload = await request(`/documents/${encodeURIComponent(attempt.documentId)}/reviews?workspaceId=${encodeURIComponent(attempt.workspaceId)}`);
        const { reviews } = z.object({ reviews: z.array(reviewHistoryItemSchema) }).parse(payload);
        updateRecovery(attempt, (value) => ({ ...value, rows: reviews }));
      } catch { updateRecovery(attempt, (value) => ({ ...value, error: "履歴を取得できませんでした。受付結果はまだ不明です。接続を確認して再取得してください。" })); }
      finally { if (reading.current === attempt) reading.current = null; updateRecovery(attempt, (value) => ({ ...value, reading: false })); }
    },
    open(id: string, onOpen: (id: string, rows: ReviewHistoryItem[]) => void) {
      if (!active() || !recovery || recovery.reading || unknown.current !== recovery.attempt || !candidates?.some((run) => run.id === id)) return;
      unknown.current = null; update((value) => ({ ...value, recovery: null })); onOpen(id, recovery.rows!);
    },
    allowNew() {
      if (!active() || !recovery || recovery.rows === null || recovery.reading || unknown.current !== recovery.attempt) return;
      unknown.current = null; update((value) => ({ ...value, recovery: null }));
    },
  };
}
