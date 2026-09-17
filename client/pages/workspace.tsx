import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { workspaceResponseSchema } from "../../shared/workspace";

type State = { status: "loading" | "missing" | "error" } | { status: "ready"; name: string };

export default function WorkspacePage() {
  const { workspaceId = "default" } = useParams({ strict: false });
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}`, { signal: controller.signal });
        if (response.status === 404) { setState({ status: "missing" }); return; }
        if (!response.ok) throw new Error("Workspace unavailable");
        const { workspace } = workspaceResponseSchema.parse(await response.json());
        setState({ status: "ready", name: workspace.name });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    }
    void load();
    return () => controller.abort();
  }, [workspaceId]);
  if (state.status !== "ready") {
    const title = state.status === "loading" ? "Workspaceを読み込んでいます" : state.status === "missing" ? "Workspaceの準備が必要です" : "Workspaceに接続できません";
    return <main className="workspace"><a href="/">← Kakudo</a><h1>{title}</h1>{state.status !== "loading" && <p>READMEの初期セットアップとデータベースの起動を確認してください。</p>}</main>;
  }
  return (
    <main className="workspace">
      <a href="/">← Kakudo</a>
      <p className="eyebrow">YOUR WORKSPACE</p>
      <h1>{state.name}</h1>
      <p className="connection"><span aria-hidden="true">●</span> Workspaceの準備ができました</p>
      <p className="intro">学びの道筋と、自分の理解をここに。</p>
      <Link className="primary-link" to="/workspaces/$workspaceId/roadmaps" params={{ workspaceId }}>Knowledge Mapを開く</Link>
      <Link className="primary-link" to="/workspaces/$workspaceId/documents" params={{ workspaceId }}>Documentsを開く</Link>
      <div className="workspace-grid">
        {[ ["Knowledge Map", "学習する概念と、そのつながり。"], ["Documents", "自分の言葉で書くMarkdownノート。"], ["Sources / Quotes", "読んだ資料と、出典のある引用。"], ["Reviews", "問題点と根拠をもとに、理解を確かめる。"] ].map(([title, description]) => (
          <section key={title}><span className="badge">{(title === "Knowledge Map" || title === "Documents") ? "利用可能" : "準備中"}</span><h2>{title}</h2><p>{description}</p></section>
        ))}
      </div>
      <p className="muted">Knowledge Mapを利用できます。ノートとレビュー機能は順次実装します。</p>
    </main>
  );
}
