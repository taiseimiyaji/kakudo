import { useState } from "react";

// Only edited fields override refreshed server data; clean fields follow the server.
export function useFormDraft<T extends Record<string, string>>(identity: string, source: T) {
  const sourceKey = JSON.stringify(source);
  const [state, setState] = useState<{ identity: string; sourceKey: string; edits: Partial<T> }>({ identity, sourceKey, edits: {} });
  let edits: Partial<T> = state.identity === identity ? state.edits : {};
  if (state.identity !== identity) setState({ identity, sourceKey, edits: {} });
  else if (state.sourceKey !== sourceKey) {
    edits = { ...edits };
    for (const key of Object.keys(edits) as (keyof T)[]) if (edits[key] === source[key]) delete edits[key];
    setState({ identity, sourceKey, edits });
  }
  const values = { ...source, ...edits };
  const dirty = Object.keys(source).some((key) => values[key] !== source[key]);
  return {
    values, dirty,
    change(key: keyof T, value: string) {
      setState((current) => {
        const next = { ...current.edits, [key]: value };
        if (value === source[key]) delete next[key];
        return { identity, sourceKey, edits: next };
      });
    },
    reset() { setState({ identity, sourceKey, edits: {} }); },
  };
}
