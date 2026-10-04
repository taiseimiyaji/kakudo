import { label } from "../../client/labels";
import { useEffect, useId, useRef, useState } from "react";
import { resourceInput, resourceTypes, type Resource } from "../../shared/resource";
import { UnknownMutationOutcome } from "../../client/api";
import { Feedback } from "../common/feedback";
import type { z } from "zod";
type Input = z.infer<typeof resourceInput>;
export function ResourceForm({ initialUrl = "", onSave, onCheck, onConfirmed, onDraftProtectionChange }: { initialUrl?: string; onSave: (input: Input) => Promise<void>; onCheck: (input: Input) => Promise<Resource | null>; onConfirmed: (resource: Resource) => void; onDraftProtectionChange?: (protectedDraft: boolean) => void }) {
  const id = useId();
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [unknown, setUnknown] = useState<Input | null>(null);
  const [input, setInput] = useState({ url: initialUrl, title: "", type: "WEB" });
  const protectedDraft = busy || !!unknown || input.url !== initialUrl || input.title !== "" || input.type !== "WEB";
  useEffect(() => { onDraftProtectionChange?.(protectedDraft); }, [onDraftProtectionChange, protectedDraft]);
  useEffect(() => () => { onDraftProtectionChange?.(false); }, [onDraftProtectionChange]);
  const resetInput = () => setInput({ url: initialUrl, title: "", type: "WEB" });
  async function check() {
    if (pending.current || !unknown) return;
    pending.current = true; setBusy(true); setError(""); setStatus("");
    try {
      const resource = await onCheck(unknown);
      if (!mounted.current) return;
      if (resource) {
        setUnknown(null); resetInput(); setStatus("登録済みの資料を確認しました。"); onConfirmed(resource);
      } else setError("登録済み一覧で一致する資料を確認できませんでした。結果はまだ不明です。再登録せず、時間をおいてもう一度確認してください。");
    } catch {
      if (mounted.current) setError("登録結果を確認できませんでした。接続を確認して、もう一度確認してください。入力内容は保持されています。");
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  const disabled = busy || !!unknown;
  return <form noValidate aria-busy={busy} onSubmit={(event) => {
    event.preventDefault();
    if (pending.current || unknown) return;
    const form = event.currentTarget; const values = new FormData(form);
    const result = resourceInput.safeParse({ url: values.get("url"), title: values.get("title"), type: values.get("type") });
    setError(""); setStatus(""); setFields({});
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = String(issue.path[0]);
        errors[field] = field === "url" ? "HTTP(S)のURLを入力してください。" : field === "title" ? "タイトルは500文字以内で入力してください。" : "資料の種類を選択してください。";
      }
      setFields(errors);
      (form.elements.namedItem(Object.keys(errors)[0]) as HTMLElement | null)?.focus();
      return;
    }
    pending.current = true; setBusy(true);
    void onSave(result.data).then(() => { if (mounted.current) { resetInput(); setStatus("資料を登録しました。"); } }).catch((error) => {
      if (!mounted.current) return;
      if (error instanceof UnknownMutationOutcome) { setUnknown(result.data); setError("登録結果を受け取れなかったため、結果は不明です。入力内容は保持されています。再登録せず、登録済みの資料を確認してください。"); }
      else setError("資料を登録できませんでした。接続と入力内容を確認して再試行してください。入力内容は保持されています。");
    }).finally(() => { pending.current = false; if (mounted.current) setBusy(false); });
  }}>
    <label>資料URL（必須）<input name="url" type="url" value={input.url} onChange={(event) => setInput((current) => ({ ...current, url: event.target.value }))} required maxLength={4096} disabled={disabled} aria-invalid={!!fields.url} aria-describedby={fields.url ? `${id}-url` : undefined} /></label>
    {fields.url && <Feedback error id={`${id}-url`}>{fields.url}</Feedback>}
    <label>資料名（任意）<input name="title" value={input.title} onChange={(event) => setInput((current) => ({ ...current, title: event.target.value }))} maxLength={500} disabled={disabled} aria-invalid={!!fields.title} aria-describedby={fields.title ? `${id}-title` : undefined} /></label>
    {fields.title && <Feedback error id={`${id}-title`}>{fields.title}</Feedback>}
    <label>資料の種類（必須）<select name="type" value={input.type} onChange={(event) => setInput((current) => ({ ...current, type: event.target.value }))} disabled={disabled} aria-invalid={!!fields.type} aria-describedby={fields.type ? `${id}-type` : undefined}>{resourceTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></label>
    {fields.type && <Feedback error id={`${id}-type`}>{fields.type}</Feedback>}
    {error && <Feedback error>{error}</Feedback>}{status && <Feedback>{status}</Feedback>}
    {busy && <Feedback>{unknown ? "登録済みの資料を確認しています。" : "資料を登録しています。"}</Feedback>}
    {unknown && <button type="button" disabled={busy} onClick={() => { void check(); }}>{busy ? "確認中…" : "登録結果を確認"}</button>}
    <button disabled={disabled}>{busy && !unknown ? "登録中…" : "資料を登録"}</button>
  </form>;
}
