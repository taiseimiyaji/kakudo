import { useId, useRef, useState } from "react";
import { resourceInput, resourceTypes } from "../../shared/resource";
import { Feedback } from "../common/feedback";
import type { z } from "zod";
export function ResourceForm({ initialUrl = "", onSave }: { initialUrl?: string; onSave: (input: z.infer<typeof resourceInput>) => Promise<void> }) {
  const id = useId();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  return <form noValidate aria-busy={busy} onSubmit={(event) => {
    event.preventDefault();
    if (pending.current) return;
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
    void onSave(result.data).then(() => { form.reset(); setStatus("資料を登録しました。"); }).catch(() => setError("資料を登録できませんでした。接続と入力内容を確認して再試行してください。入力内容は保持されています。")).finally(() => { pending.current = false; setBusy(false); });
  }}>
    <label>Resource URL（必須）<input name="url" type="url" defaultValue={initialUrl} required maxLength={4096} disabled={busy} aria-invalid={!!fields.url} aria-describedby={fields.url ? `${id}-url` : undefined} /></label>
    {fields.url && <Feedback error id={`${id}-url`}>{fields.url}</Feedback>}
    <label>Resource Title（任意）<input name="title" maxLength={500} disabled={busy} aria-invalid={!!fields.title} aria-describedby={fields.title ? `${id}-title` : undefined} /></label>
    {fields.title && <Feedback error id={`${id}-title`}>{fields.title}</Feedback>}
    <label>Resource Type<select name="type" disabled={busy} aria-invalid={!!fields.type} aria-describedby={fields.type ? `${id}-type` : undefined}>{resourceTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
    {fields.type && <Feedback error id={`${id}-type`}>{fields.type}</Feedback>}
    {error && <Feedback error>{error}</Feedback>}{status && <Feedback>{status}</Feedback>}
    {busy && <Feedback>資料を登録しています。</Feedback>}
    <button disabled={busy}>{busy ? "登録中…" : "資料を登録"}</button>
  </form>;
}
