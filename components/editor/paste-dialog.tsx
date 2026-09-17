import { useEffect, useRef, useState } from "react";
import type { InterceptedPaste } from "../../modules/editor/paste-policy";
export function PasteDialog({ paste, onClose, onQuote }: { paste: InterceptedPaste; onClose: () => void; onQuote: (url: string, title: string) => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} aria-labelledby="paste-dialog-title">
    <h2 id="paste-dialog-title">{paste.kind === "quote" ? "引用として追加" : "Resourceとして登録"}</h2>
    {paste.kind === "quote" ? <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(""); void onQuote(String(data.get("url")), String(data.get("title"))).catch((e) => { setError(e.message); setBusy(false); }); }}>
      <label>引用Text<textarea readOnly value={paste.text} rows={6} /></label>
      <label>Source URL *<input name="url" type="url" required maxLength={4096} /></label>
      <label>Source Title<input name="title" maxLength={500} /></label>
      <p className="muted">引用を追加すると、編集中の本文も一緒に保存します。</p>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy}>Add Quote</button>
    </form> : <><p>{paste.text}</p><p>URLは本文へ貼り付けません。資料登録の保存機能は次のIssueで追加します。</p></>}
    <button type="button" className="secondary" disabled={busy} onClick={onClose}>キャンセル</button>
  </dialog>;
}
