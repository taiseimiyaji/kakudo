import type { ReactNode } from "react";

/** Keep feedback next to its operation; only trusted, local messages belong here. */
export function Feedback({ error = false, children, id }: { error?: boolean; children: ReactNode; id?: string }) {
  return <p id={id} className={error ? "error" : "operation-status"} role={error ? "alert" : "status"} aria-atomic="true">{children}</p>;
}
