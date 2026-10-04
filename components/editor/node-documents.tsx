import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { documentSchema, type DocumentMetadata } from "../../shared/document";
import { request } from "../../client/api";
export function NodeDocuments({ nodeId, workspaceId }: { nodeId: string; workspaceId: string }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState("");
  const mounted = useRef(true);
  const activeScope = useRef({ nodeId, workspaceId });
  const pending = useRef<typeof activeScope.current | null>(null);
  if (activeScope.current.nodeId !== nodeId || activeScope.current.workspaceId !== workspaceId) {
    // Keep the title input, but a new visit must not inherit old requests or feedback.
    activeScope.current = { nodeId, workspaceId };
    pending.current = null; setBusy(false); setError(""); setStatus(""); setVersion(0);
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const navigate = useNavigate(); const scope = `workspaceId=${encodeURIComponent(workspaceId)}`;
  return <section className="node-documents"><h2>ノート</h2>{error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
    <NodeDocumentList key={`${workspaceId}:${nodeId}`} nodeId={nodeId} workspaceId={workspaceId} refresh={version} />
    <form onSubmit={(event) => {
      event.preventDefault(); if (pending.current) return;
      const scopeIdentity = activeScope.current;
      const form = event.currentTarget; const title = String(new FormData(form).get("title")); pending.current = scopeIdentity; setBusy(true); setError(""); setStatus("");
      void request<{ document: DocumentMetadata }>(`/documents?${scope}`, "POST", { title, nodeIds: [nodeId] }).then(({ document }) => {
        if (!mounted.current || activeScope.current !== scopeIdentity) return;
        form.reset(); setVersion((value) => value + 1); setStatus("ノートを作成しました。");
        return navigate({ to: "/workspaces/$workspaceId/documents/$documentId", params: { workspaceId, documentId: document.id } });
      }).catch((e) => { if (mounted.current && activeScope.current === scopeIdentity) setError(e.message); }).finally(() => {
        if (pending.current === scopeIdentity) pending.current = null;
        if (mounted.current && activeScope.current === scopeIdentity) setBusy(false);
      });
    }}>
      <label>新しいノート（必須）<input name="title" required maxLength={200} disabled={busy} /></label><button disabled={busy}>ノートを作成</button>
    </form>
  </section>;
}

function NodeDocumentList({ nodeId, workspaceId, refresh }: { nodeId: string; workspaceId: string; refresh: number }) {
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [load, setLoad] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const scope = `workspaceId=${encodeURIComponent(workspaceId)}`;
  useEffect(() => {
    let active = true;
    request(`/documents?${scope}&nodeId=${encodeURIComponent(nodeId)}`)
      .then((data) => {
        if (!active) return;
        setDocuments(z.object({ documents: z.array(documentSchema) }).parse(data).documents);
        setLoad("ready");
      })
      .catch((e) => { if (active) { setError(e.message); setLoad("failed"); } });
    return () => { active = false; };
  }, [nodeId, scope, version, refresh]);
  return <div aria-busy={load === "loading"}>
    {load === "loading" && <p role="status">ノート一覧を読み込んでいます…</p>}
    {load === "failed" && <><p role="alert">{error}</p><button className="secondary" onClick={() => { setLoad("loading"); setVersion((value) => value + 1); }}>ノート一覧を再読み込み</button></>}
    {load === "ready" && <>
      <ul>{documents.map((doc) => <li key={doc.id}><Link to="/workspaces/$workspaceId/documents/$documentId" params={{ workspaceId, documentId: doc.id }}>{doc.title}</Link></li>)}</ul>
      {!documents.length && <p className="muted">この学習項目に関連するノートはありません。</p>}
    </>}
  </div>;
}
