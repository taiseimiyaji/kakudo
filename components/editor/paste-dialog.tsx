import { ResourceForm } from "../resources/resource-form";
import type { resourceInput, Resource } from "../../shared/resource";
import type { z } from "zod";
import { useEffect, useRef, useState } from "react";
import type { InterceptedPaste } from "../../modules/editor/paste-policy";
export function PasteDialog({ paste, onClose, onQuote, onResource, onResourceCheck, onResourceConfirmed }: { paste: InterceptedPaste; onClose: () => void; onQuote: (url: string, title: string) => Promise<void>; onResource: (input: z.infer<typeof resourceInput>) => Promise<void>; onResourceCheck: (input: z.infer<typeof resourceInput>) => Promise<Resource | null>; onResourceConfirmed: (resource: Resource) => void }) {
  const ref = useRef<HTMLDialogElement>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return <dialog ref={ref} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} aria-labelledby="paste-dialog-title">
    <h2 id="paste-dialog-title">{paste.kind === "quote" ? "引用として追加" : "参考資料として登録"}</h2>
    {paste.kind === "quote" ? <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(""); void onQuote(String(data.get("url")), String(data.get("title"))).catch((e) => { setError(e.message); setBusy(false); }); }}>
      <label>引用する文章<textarea readOnly value={paste.text} rows={6} /></label>
      <label>出典URL（必須）<input name="url" type="url" required maxLength={4096} /></label>
      <label>出典名（任意）<input name="title" maxLength={500} /></label>
      <p className="muted">引用を追加すると、編集中の本文も一緒に保存します。</p>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy}>引用を追加</button>
    </form> : <ResourceForm initialUrl={paste.text.trim()} onSave={async (input) => {
      setBusy(true);
      try { await onResource(input); } finally { setBusy(false); }
    }} onCheck={onResourceCheck} onConfirmed={onResourceConfirmed} />}
    <button type="button" className="secondary" disabled={busy} onClick={onClose}>キャンセル</button>
  </dialog>;
}
