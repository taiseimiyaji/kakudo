import { useEffect, useRef } from "react";

type Intent = { cancelled: boolean; stop: () => void };

/** Resume an explicit history destination once; user activity cancels late reads. */
export function useReviewResume(requestedId: string | undefined, loadedId: string | undefined) {
  const heading = useRef<HTMLHeadingElement>(null);
  const pending = useRef<Intent | null>(null);
  useEffect(() => {
    if (!requestedId) return;
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    const intent: Intent = { cancelled: false, stop: () => { for (const event of events) window.removeEventListener(event, cancel, true); } };
    function cancel() { intent.cancelled = true; intent.stop(); }
    pending.current = intent;
    for (const event of events) window.addEventListener(event, cancel, true);
    return () => { cancel(); if (pending.current === intent) pending.current = null; };
  }, [requestedId]);
  useEffect(() => {
    const intent = pending.current;
    if (!requestedId || loadedId !== requestedId || !intent || intent.cancelled) return;
    const frame = requestAnimationFrame(() => {
      if (pending.current !== intent || intent.cancelled) return;
      intent.cancelled = true; intent.stop();
      const element = heading.current; if (!element) return;
      const header = element.closest("main")?.querySelector(".note-header")?.getBoundingClientRect().height ?? 0;
      window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - header - 16, behavior: "instant" });
      element.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [requestedId, loadedId]);
  return heading;
}
