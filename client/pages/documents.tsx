import { WorkspaceNav } from "../../components/navigation/workspace-nav";
import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { z } from "zod";
import { documentSchema, type DocumentMetadata } from "../../shared/document";
import { request } from "../api";
export default function DocumentsPage() {
  const { workspaceId = "default" } = useParams({ strict: false });
  return <DocumentsList key={workspaceId} workspaceId={workspaceId} />;
}
function DocumentsList({ workspaceId }: { workspaceId: string }) {
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;

    request(`/documents?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then((data) => { if (active) setDocuments(z.object({ documents: z.array(documentSchema) }).parse(data).documents); })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspaceId]);
  return <main className="workspace">
    <WorkspaceNav workspaceId={workspaceId} /><h1>ノート</h1>
    <p className="intro">自分の言葉で書いた、学びの記録。学習項目を削除しても、ノートはここに残ります。</p>
    {error && <p role="alert" className="error">{error}</p>}
    {loading ? <p role="status">ノートを読み込んでいます…</p> : !error && !documents.length && <div className="empty-state">
      <h2>最初のノートを作りましょう</h2><p>学習マップで項目を選び、詳細にある「ノートを作成」から書き始められます。</p>
      <Link to="/workspaces/$workspaceId/roadmaps" params={{ workspaceId }}>学習マップへ進む →</Link>
    </div>}
    <ul>{documents.map((doc) => <li key={doc.id}><Link to="/workspaces/$workspaceId/documents/$documentId" params={{ workspaceId, documentId: doc.id }}>{doc.title}</Link></li>)}</ul>
  </main>;
}
