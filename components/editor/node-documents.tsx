import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { documentSchema, type DocumentMetadata } from "../../shared/document";
import { request } from "../../client/api";
export function NodeDocuments({ nodeId, workspaceId }: { nodeId: string; workspaceId: string }) {
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const navigate = useNavigate(); const scope = `workspaceId=${encodeURIComponent(workspaceId)}`;
  useEffect(() => {
    let active = true;
    request(`/documents?${scope}&nodeId=${encodeURIComponent(nodeId)}`).then((data) => { if (active) setDocuments(z.object({ documents: z.array(documentSchema) }).parse(data).documents); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [nodeId, scope]);
  return <section className="node-documents"><h2>Documents</h2>{error && <p role="alert">{error}</p>}
    <ul>{documents.map((doc) => <li key={doc.id}><Link to="/workspaces/$workspaceId/documents/$documentId" params={{ workspaceId, documentId: doc.id }}>{doc.title}</Link></li>)}</ul>
    <form onSubmit={(event) => { event.preventDefault(); const title = String(new FormData(event.currentTarget).get("title")); setBusy(true); setError(""); void request<{ document: DocumentMetadata }>(`/documents?${scope}`, "POST", { title, nodeIds: [nodeId] }).then(({ document }) => navigate({ to: "/workspaces/$workspaceId/documents/$documentId", params: { workspaceId, documentId: document.id } })).catch((e) => setError(e.message)).finally(() => setBusy(false)); }}>
      <label>新しいDocument<input name="title" required maxLength={200} /></label><button disabled={busy}>Documentを作成</button>
    </form>
  </section>;
}
