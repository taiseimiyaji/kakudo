import { useEffect, useRef, useState } from "react";
import { request } from "../../client/api";
import type { Resource, ResourceTarget } from "../../shared/resource";
import { Feedback } from "../common/feedback";
import { ResourceForm } from "./resource-form";

type Props = { workspaceId: string; target?: ResourceTarget; refresh?: number; onChange?: () => void };
export function ResourcePanel(props: Props) {
  // A new scope must never inherit another document/node's pending operations.
  return <ScopedResourcePanel key={`${props.workspaceId}:${props.target?.kind}:${props.target?.id}`} {...props} />;
}
function ScopedResourcePanel({ workspaceId, target, refresh = 0, onChange }: Props) {
  const [items, setItems] = useState<Resource[]>([]);
  const [all, setAll] = useState<Resource[]>([]);
  const [load, setLoad] = useState<"loading" | "ready" | "failed">("loading");
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMessage, setLinkMessage] = useState({ text: "", error: false });
  const linkPending = useRef(false);
  const suffix = `?workspaceId=${encodeURIComponent(workspaceId)}`;
  const path = target ? `/${target.kind}s/${encodeURIComponent(target.id)}/resources` : "/resources";
  useEffect(() => {
    let active = true;
    Promise.all([request<{ resources: Resource[] }>(path + suffix), target ? request<{ resources: Resource[] }>("/resources" + suffix) : Promise.resolve(null)])
      .then(([linked, available]) => { if (active) { setItems(linked.resources); setAll(available?.resources ?? linked.resources); setLoad("ready"); } })
      .catch(() => { if (active) setLoad("failed"); });
    return () => { active = false; };
  }, [path, suffix, version, refresh, target?.kind, target?.id]);
  const retry = () => { setLoad("loading"); setVersion((v) => v + 1); };
  const added = (resource: Resource) => {
    setItems((current) => [...current.filter((item) => item.id !== resource.id), resource]);
    setAll((current) => [...current.filter((item) => item.id !== resource.id), resource]);
    onChange?.();
  };
  return <section className="resource-panel" aria-label="Sources"><h2>Sources</h2>
    {load === "loading" && <Feedback>資料を読み込んでいます…</Feedback>}
    {load === "failed" && <><Feedback error>資料を読み込めませんでした。接続を確認して再試行してください。</Feedback><button className="secondary" onClick={retry}>資料を再読み込み</button></>}
    {load === "ready" && <>
      <ul>{items.map((item) => <ResourceRow key={item.id} item={item} suffix={suffix} unlinkPath={target ? `${path}/${encodeURIComponent(item.id)}${suffix}` : undefined} onUnlink={() => { setItems((current) => current.filter((r) => r.id !== item.id)); setLinkMessage({ text: `「${item.title || item.url}」の関連を外しました。資料は登録済み一覧に残っています。`, error: false }); onChange?.(); }} />)}</ul>
      {!items.length && <p className="muted">登録された資料はありません。</p>}
    </>}
    <ResourceForm onSave={async (input) => { const { resource } = await request<{ resource: Resource }>(path + suffix, "POST", input); added(resource); if (load !== "ready") retry(); }} />
    {target && <form aria-busy={linkBusy} onSubmit={(event) => {
      event.preventDefault(); if (linkPending.current || !selected || load !== "ready") return;
      linkPending.current = true; setLinkBusy(true); setLinkMessage({ text: "", error: false });
      const name = all.find((r) => r.id === selected)?.title || all.find((r) => r.id === selected)?.url || "資料";
      void request<{ resource: Resource }>(path + suffix, "POST", { resourceId: selected }).then(({ resource }) => {
        added(resource); setSelected(""); setLinkMessage({ text: `「${name}」を関連付けました。`, error: false });
      }).catch(() => setLinkMessage({ text: `「${name}」を関連付けられませんでした。接続を確認して再試行してください。`, error: true })).finally(() => { linkPending.current = false; setLinkBusy(false); });
    }}>
      <label>登録済み資料<select name="resourceId" required value={selected} disabled={linkBusy || load !== "ready"} onChange={(event) => { setSelected(event.target.value); setLinkMessage({ text: "", error: false }); }}><option value="">選択してください</option>{all.filter((r) => !items.some((i) => i.id === r.id)).map((r) => <option key={r.id} value={r.id}>{r.title || r.url}</option>)}</select></label>
      {linkBusy && <Feedback>選択した資料を関連付けています…</Feedback>}
      {linkMessage.text && <Feedback error={linkMessage.error}>{linkMessage.text}</Feedback>}
      <button disabled={linkBusy || load !== "ready" || !selected}>{linkBusy ? "関連付け中…" : "資料を関連付け"}</button>
    </form>}
  </section>;
}
function ResourceRow({ item, suffix, unlinkPath, onUnlink }: { item: Resource; suffix: string; unlinkPath?: string; onUnlink: () => void }) {
  const pending = useRef(false);
  const [busy, setBusy] = useState<"fetch" | "unlink" | null>(null);
  const [message, setMessage] = useState({ text: "", error: false });
  async function operate(action: "fetch" | "unlink") {
    if (pending.current) return;
    pending.current = true; setBusy(action); setMessage({ text: "", error: false });
    try {
      await request(action === "fetch" ? `/resources/${encodeURIComponent(item.id)}/fetch${suffix}` : unlinkPath!, action === "fetch" ? "POST" : "DELETE");
      if (action === "unlink") onUnlink();
      else setMessage({ text: "資料を取得できました。内容の正確性を判定する操作ではありません。", error: false });
    } catch {
      setMessage({ text: action === "fetch" ? "資料を取得できませんでした（UNAVAILABLE）。内容が間違っているという意味ではありません。接続や公開状況を確認し、再試行してください。" : "関連を外せませんでした。接続を確認して再試行してください。", error: true });
    } finally { pending.current = false; setBusy(null); }
  }
  return <li aria-busy={!!busy}>
    <a href={item.url} target="_blank" rel="noreferrer">{item.title || item.url}</a> <small>{item.type}</small>
    <button className="secondary" disabled={!!busy} onClick={() => void operate("fetch")}>{busy === "fetch" ? "取得確認中…" : "取得を確認"}</button>
    {unlinkPath && <button className="secondary" disabled={!!busy} onClick={() => void operate("unlink")}>{busy === "unlink" ? "解除中…" : "関連を外す"}</button>}
    {busy && <Feedback>{busy === "fetch" ? "この資料の取得を確認しています…" : "この資料の関連を外しています…"}</Feedback>}
    {message.text && <Feedback error={message.error}>{message.text}</Feedback>}
  </li>;
}
