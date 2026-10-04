import { useState } from "react";

// Only edited fields override refreshed server data; clean fields follow the server.
export function useFormDraft<T extends Record<string, string>>(identity: string, source: T) {
  const sourceKey = JSON.stringify(source);
  const [state, setState] = useState<{ identity: string; sourceKey: string; edits: Partial<T>; confirmed: Partial<T> | null; retainEdits: boolean }>({ identity, sourceKey, edits: {}, confirmed: null, retainEdits: false });
  let edits: Partial<T> = state.identity === identity ? state.edits : {};
  const confirmed = state.identity === identity ? state.confirmed : null;
  const retainEdits = state.identity === identity && state.retainEdits;
  const base = { ...source, ...confirmed };
  if (state.identity !== identity) setState({ identity, sourceKey, edits: {}, confirmed: null, retainEdits: false });
  else if (state.sourceKey !== sourceKey) {
    edits = { ...edits };
    if (!retainEdits) for (const key of Object.keys(edits) as (keyof T)[]) if (edits[key] === base[key]) delete edits[key];
    setState({ identity, sourceKey, edits, confirmed, retainEdits });
  }
  const values = { ...base, ...edits };
  const dirty = (retainEdits && Object.keys(edits).length > 0) || Object.keys(base).some((key) => values[key] !== base[key]);
  return {
    values, dirty,
    // An uncertain write makes the old baseline unreliable. A later ABA edit is
    // still human intent until an explicit write is confirmed, not merely read.
    retainEdits() { setState((current) => current.identity === identity ? { ...current, retainEdits: true } : current); },
    change(key: keyof T, value: string) {
      setState((current) => {
        const next = { ...current.edits, [key]: value };
        if (!current.retainEdits && value === (current.confirmed?.[key] ?? source[key])) delete next[key];
        return { ...current, identity, sourceKey, edits: next };
      });
    },
    acknowledge(saved: Partial<T>, submitted: Partial<T> = saved) {
      setState((current) => {
        if (current.identity !== identity) return current;
        const edits = { ...current.edits };
        for (const key of Object.keys(saved) as (keyof T)[]) if (edits[key] === submitted[key]) delete edits[key];
        // A confirmed position-only write cannot acknowledge unknown goal/title edits.
        const wholeFormConfirmed = Object.keys(source).every((key) => Object.hasOwn(saved, key));
        return { ...current, edits, confirmed: { ...current.confirmed, ...saved }, retainEdits: current.retainEdits && !wholeFormConfirmed };
      });
    },
    reconcile(server: T) {
      setState((current) => {
        if (current.identity !== identity) return current;
        const edits = { ...current.edits };
        if (!current.retainEdits) for (const key of Object.keys(edits) as (keyof T)[]) if (edits[key] === server[key]) delete edits[key];
        return { identity, sourceKey: JSON.stringify(server), edits, confirmed: null, retainEdits: current.retainEdits };
      });
    },
    reset() { setState({ identity, sourceKey, edits: {}, confirmed: null, retainEdits: false }); },
  };
}
