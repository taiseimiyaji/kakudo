import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { documentSchema, type DocumentMetadata } from "../../shared/document";
import { request } from "../../client/api";
export function NodeDocuments({ nodeId, workspaceId }: { nodeId: string; workspaceId: string }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const navigate = useNavigate(); const scope = `workspaceId=${encodeURIComponent(workspaceId)}`;
  return <section className="node-documents"><h2>Documents</h2>{error && <p role="alert">{error}</p>}
    <NodeDocumentList key={`${workspaceId}:${nodeId}`} nodeId={nodeId} workspaceId={workspaceId} />
    <form onSubmit={(event) => { event.preventDefault(); const title = String(new FormData(event.currentTarget).get("title")); setBusy(true); setError(""); void request<{ document: DocumentMetadata }>(`/documents?${scope}`, "POST", { title, nodeIds: [nodeId] }).then(({ document }) => navigate({ to: "/workspaces/$workspaceId/documents/$documentId", params: { workspaceId, documentId: document.id } })).catch((e) => setError(e.message)).finally(() => setBusy(false)); }}>
      <label>新しいDocument<input name="title" required maxLength={200} /></label><button disabled={busy}>Documentを作成</button>
    </form>
  </section>;
}

function NodeDocumentList({ nodeId, workspaceId }: { nodeId: string; workspaceId: string }) {
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
  }, [nodeId, scope, version]);
  return <div aria-busy={load === "loading"}>
    {load === "loading" && <p role="status">Document一覧を読み込んでいます…</p>}
    {load === "failed" && <><p role="alert">{error}</p><button className="secondary" onClick={() => { setLoad("loading"); setVersion((value) => value + 1); }}>Document一覧を再読み込み</button></>}
    {load === "ready" && <>
      <ul>{documents.map((doc) => <li key={doc.id}><Link to="/workspaces/$workspaceId/documents/$documentId" params={{ workspaceId, documentId: doc.id }}>{doc.title}</Link></li>)}</ul>
      {!documents.length && <p className="muted">このNodeに関連するDocumentはありません。</p>}
    </>}
  </div>;
}
