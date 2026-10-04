import { useState } from "react";

// Only edited fields override refreshed server data; clean fields follow the server.
export function useFormDraft<T extends Record<string, string>>(identity: string, source: T) {
  const sourceKey = JSON.stringify(source);
  const [state, setState] = useState<{ identity: string; sourceKey: string; edits: Partial<T>; confirmed: Partial<T> | null }>({ identity, sourceKey, edits: {}, confirmed: null });
  let edits: Partial<T> = state.identity === identity ? state.edits : {};
  const confirmed = state.identity === identity ? state.confirmed : null;
  const base = { ...source, ...confirmed };
  if (state.identity !== identity) setState({ identity, sourceKey, edits: {}, confirmed: null });
  else if (state.sourceKey !== sourceKey) {
    edits = { ...edits };
    for (const key of Object.keys(edits) as (keyof T)[]) if (edits[key] === base[key]) delete edits[key];
    setState({ identity, sourceKey, edits, confirmed });
  }
  const values = { ...base, ...edits };
  const dirty = Object.keys(base).some((key) => values[key] !== base[key]);
  return {
    values, dirty,
    change(key: keyof T, value: string) {
      setState((current) => {
        const next = { ...current.edits, [key]: value };
        if (value === (current.confirmed?.[key] ?? source[key])) delete next[key];
        return { ...current, identity, sourceKey, edits: next };
      });
    },
    acknowledge(saved: Partial<T>, submitted: Partial<T> = saved) {
      setState((current) => {
        if (current.identity !== identity) return current;
        const edits = { ...current.edits };
        for (const key of Object.keys(saved) as (keyof T)[]) if (edits[key] === submitted[key]) delete edits[key];
        return { ...current, edits, confirmed: { ...current.confirmed, ...saved } };
      });
    },
    reconcile(server: T) {
      setState((current) => {
        if (current.identity !== identity) return current;
        const edits = { ...current.edits };
        for (const key of Object.keys(edits) as (keyof T)[]) if (edits[key] === server[key]) delete edits[key];
        return { identity, sourceKey: JSON.stringify(server), edits, confirmed: null };
      });
    },
    reset() { setState({ identity, sourceKey, edits: {}, confirmed: null }); },
  };
}
