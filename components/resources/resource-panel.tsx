import { useEffect, useState } from "react";
import { request } from "../../client/api";
import type { Resource, ResourceTarget } from "../../shared/resource";
import { ResourceForm } from "./resource-form";
export function ResourcePanel({ workspaceId, target, refresh = 0, onChange }: { workspaceId: string; target?: ResourceTarget; refresh?: number; onChange?: () => void }) {
  const [items, setItems] = useState<Resource[]>([]); const [all, setAll] = useState<Resource[]>([]); const [error, setError] = useState(""); const [status, setStatus] = useState(""); const [version, setVersion] = useState(0);
  const suffix = `?workspaceId=${encodeURIComponent(workspaceId)}`; const path = target ? `/${target.kind}s/${encodeURIComponent(target.id)}/resources` : "/resources";
  useEffect(() => { let active = true; Promise.all([request<{ resources: Resource[] }>(path + suffix), request<{ resources: Resource[] }>("/resources" + suffix)]).then(([linked, available]) => { if (active) { setItems(linked.resources); setAll(available.resources); } }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; }; }, [path, suffix, version, refresh]);
  const reload = () => { setVersion((v) => v + 1); onChange?.(); };
  return <section className="resource-panel" aria-label="Sources"><h2>Sources</h2>{error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
    <ul>{items.map((item) => <li key={item.id}><a href={item.url} target="_blank" rel="noreferrer">{item.title || item.url}</a> <small>{item.type}</small>
      <button className="secondary" onClick={() => { setError(""); void request(`/resources/${item.id}/fetch${suffix}`, "POST").then(() => setStatus("資料を取得できました（内容の正確性を判定する操作ではありません）。")).catch((e) => setError(`UNAVAILABLE: ${e.message}`)); }}>取得を確認</button>
      {target && <button className="secondary" onClick={() => { void request(`${path}/${item.id}${suffix}`, "DELETE").then(reload).catch((e) => setError(e.message)); }}>関連を外す</button>}
    </li>)}</ul>
    {!items.length && <p className="muted">登録された資料はありません。</p>}
    <ResourceForm onSave={async (input) => { await request(path + suffix, "POST", input); reload(); }} />
    {target && <form onSubmit={(e) => { e.preventDefault(); const resourceId = new FormData(e.currentTarget).get("resourceId"); void request(path + suffix, "POST", { resourceId }).then(reload).catch((e) => setError(e.message)); }}><label>登録済み資料<select name="resourceId" required defaultValue=""><option value="">選択してください</option>{all.filter((r) => !items.some((i) => i.id === r.id)).map((r) => <option key={r.id} value={r.id}>{r.title || r.url}</option>)}</select></label><button>資料を関連付け</button></form>}
  </section>;
}
