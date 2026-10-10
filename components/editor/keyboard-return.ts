import type { EditorSelection, Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export type KeyboardReturn = { cancel: () => void; destroy: () => void };

/** One native Tab focus transition may reveal the retained writing head. */
export function installKeyboardReturn(view: EditorView): KeyboardReturn {
  const doc = view.dom.ownerDocument, win = doc.defaultView!;
  const main = view.dom.closest("main");
  let intent: { event: KeyboardEvent; origin: Element } | null = null;
  let expiry = 0;
  let pending: { doc: Text; selection: EditorSelection; x: number; y: number; editorX: number; editorY: number } | null = null;
  const measureKey = Symbol("keyboard-return");
  const cancel = () => {
    win.clearTimeout(expiry); expiry = 0; intent = null; pending = null;
  };
  const unchangedScroll = () => pending && win.scrollX === pending.x && win.scrollY === pending.y && view.scrollDOM.scrollLeft === pending.editorX && view.scrollDOM.scrollTop === pending.editorY;
  const onKey = (event: KeyboardEvent) => {
    cancel();
    const origin = doc.activeElement;
    if (!event.isTrusted || event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey || !origin || !main?.contains(origin) || view.dom.contains(origin)) return;
    intent = { event, origin };
    // The browser's default focus transition happens in this key event's turn.
    expiry = win.setTimeout(() => { intent = null; expiry = 0; }, 0);
  };
  const onFocus = (event: FocusEvent) => {
    const tab = intent;
    cancel();
    if (!tab || tab.event.defaultPrevented || event.target !== view.contentDOM || event.relatedTarget !== tab.origin) return;
    const token = { doc: view.state.doc, selection: view.state.selection, x: win.scrollX, y: win.scrollY, editorX: view.scrollDOM.scrollLeft, editorY: view.scrollDOM.scrollTop };
    pending = token;
    const valid = () => pending === token && unchangedScroll() && view.hasFocus && view.dom.isConnected && view.state.doc === token.doc && view.state.selection.eq(token.selection);
    // CodeMirror renders both selection endpoints, including long selections.
    // Measure after its focus/viewport work, without changing state or history.
    view.requestMeasure({ key: measureKey, read: () => {
      if (!valid()) return null;
      const range = token.selection.main;
      const rect = view.coordsAtPos(range.head, range.assoc || (range.head > range.anchor ? -1 : 1));
      if (!rect || !view.dom.getClientRects().length) return null;
      const viewport = win.visualViewport;
      const top = Math.max(viewport?.offsetTop ?? 0, main?.querySelector(".note-header")?.getBoundingClientRect().bottom ?? 0) + 4;
      const bottom = (viewport ? viewport.offsetTop + viewport.height : win.innerHeight) - 4;
      if (bottom <= top) return null;
      return rect.top < top ? rect.top - top : rect.bottom > bottom ? rect.bottom - bottom : 0;
    }, write: (delta) => {
      const allowed = valid();
      if (pending === token) pending = null;
      // This editor grows with the note; the page owns vertical scrolling.
      if (allowed && delta) win.scrollBy({ top: delta, behavior: "instant" });
    } });
  };
  const onScroll = () => { if (pending && !unchangedScroll()) cancel(); };
  doc.addEventListener("keydown", onKey, true);
  doc.addEventListener("focus", onFocus, true);
  for (const event of ["pointerdown", "wheel", "touchstart", "resize"] as const) win.addEventListener(event, cancel, true);
  win.addEventListener("blur", cancel);
  win.addEventListener("scroll", onScroll, true);
  return { cancel, destroy() {
    cancel();
    doc.removeEventListener("keydown", onKey, true);
    doc.removeEventListener("focus", onFocus, true);
    for (const event of ["pointerdown", "wheel", "touchstart", "resize"] as const) win.removeEventListener(event, cancel, true);
    win.removeEventListener("blur", cancel);
    win.removeEventListener("scroll", onScroll, true);
  } };
}
