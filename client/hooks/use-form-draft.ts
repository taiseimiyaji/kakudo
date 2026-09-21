import { useState } from "react";

// Only edited fields override refreshed server data; clean fields follow the server.
export function useFormDraft<T extends Record<string, string>>(identity: string, source: T) {
  const [state, setState] = useState<{ identity: string; edits: Partial<T> }>({ identity, edits: {} });
  if (state.identity !== identity) setState({ identity, edits: {} });
  const edits = state.identity === identity ? state.edits : {};
  const values = { ...source, ...edits };
  const dirty = Object.keys(source).some((key) => values[key] !== source[key]);
  return {
    values, dirty,
    change(key: keyof T, value: string) {
      setState((current) => {
        const next = { ...current.edits, [key]: value };
        if (value === source[key]) delete next[key];
        return { identity, edits: next };
      });
    },
    reset() { setState({ identity, edits: {} }); },
  };
}
