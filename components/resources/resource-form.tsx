import { useState } from "react";
import { resourceInput, resourceTypes } from "../../shared/resource";
import type { z } from "zod";
export function ResourceForm({ initialUrl = "", onSave }: { initialUrl?: string; onSave: (input: z.infer<typeof resourceInput>) => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <form onSubmit={(event) => {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    const result = resourceInput.safeParse({ url: values.get("url"), title: values.get("title"), type: values.get("type") });
    if (!result.success) { setError("HTTP(S)のURLと資料情報を確認してください。"); return; }
    setBusy(true); setError(""); void onSave(result.data).then(() => form.reset()).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }}>
    <label>Resource URL<input name="url" type="url" defaultValue={initialUrl} required maxLength={4096} /></label>
    <label>Resource Title<input name="title" maxLength={500} /></label>
    <label>Resource Type<select name="type">{resourceTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
    {error && <p role="alert">{error}</p>}<button disabled={busy}>資料を登録</button>
  </form>;
}
