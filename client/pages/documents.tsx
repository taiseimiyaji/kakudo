import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { z } from "zod";
import { documentSchema, type DocumentMetadata } from "../../shared/document";
import { request } from "../api";
export default function DocumentsPage() {
  const { workspaceId = "default" } = useParams({ strict: false });
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]); const [error, setError] = useState("");
  useEffect(() => { let active = true; request(`/documents?workspaceId=${encodeURIComponent(workspaceId)}`).then((data) => { if (active) setDocuments(z.object({ documents: z.array(documentSchema) }).parse(data).documents); }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; }; }, [workspaceId]);
  return <main className="workspace"><Link to="/workspaces/$workspaceId" params={{ workspaceId }}>← Workspace</Link><h1>Documents</h1>{error && <p role="alert">{error}</p>}<p>Nodeから作成したノートを一覧できます。Nodeを削除してもノートはここに残ります。</p><ul>{documents.map((doc) => <li key={doc.id}><Link to="/workspaces/$workspaceId/documents/$documentId" params={{ workspaceId, documentId: doc.id }}>{doc.title}</Link></li>)}</ul></main>;
}
