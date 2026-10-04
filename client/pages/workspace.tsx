import { WorkspaceNav } from "../../components/navigation/workspace-nav";
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
    const title = state.status === "loading" ? "ワークスペースを読み込んでいます" : state.status === "missing" ? "ワークスペースの準備が必要です" : "ワークスペースに接続できません";
    return <main className="workspace"><a href="/">← Kakudo</a><h1>{title}</h1>{state.status !== "loading" && <p>READMEの初期セットアップとデータベースの起動を確認してください。</p>}</main>;
  }
  return (
    <main className="workspace workspace-home">
      <a className="brand-home" href="/">Kakudo <span>カクドー</span></a>
      <WorkspaceNav workspaceId={workspaceId} />
      <div className="workspace-heading">
        <p className="eyebrow">あなたの学びを、ここに。</p>
        <h1>{state.name}</h1>
        <p className="intro">学ぶことを整理して、自分の言葉で書く。<br />資料とレビューを手がかりに、理解を深めていきましょう。</p>
      </div>
      <div className="workspace-actions">
        <Link className="primary-link" to="/workspaces/$workspaceId/roadmaps" params={{ workspaceId }}>学習マップを開く <span aria-hidden="true">→</span></Link>
        <Link className="secondary-link" to="/workspaces/$workspaceId/documents" params={{ workspaceId }}>ノートを開く <span aria-hidden="true">→</span></Link>
      </div>
      <section className="getting-started" aria-labelledby="getting-started-title">
        <h2 id="getting-started-title">どこから始める？</h2>
        <p>まずは学習マップで、学びたい項目を選びましょう。項目の詳細からノートを作成できます。</p>
      </section>
      <div className="workspace-grid">
        {([
          ["/workspaces/$workspaceId/roadmaps", "01", "学習マップ", "学びたいことと、そのつながりを整理します。学習目標や進み具合もここで確認。"],
          ["/workspaces/$workspaceId/documents", "02", "ノート", "学んだことを自分の言葉で書く場所。これまでに作成したノートを一覧できます。"],
          ["/workspaces/$workspaceId/resources", "03", "参考資料", "読んだ記事や公式資料をまとめて、いつでも根拠に戻れるようにします。"],
          ["/workspaces/$workspaceId/reviews", "04", "レビュー履歴", "ノートへの指摘や根拠を振り返ります。新しいレビューはノートから始められます。"],
        ] as const).map(([to, number, title, description]) => (
          <Link className="workspace-card" key={to} to={to} params={{ workspaceId }}>
            <span className="card-number" aria-hidden="true">{number}</span><h2>{title}</h2><p>{description}</p><span className="card-arrow" aria-hidden="true">↗</span>
          </Link>
        ))}
      </div>
      <p className="connection"><span aria-hidden="true">●</span> 学習スペースに接続しています</p>
    </main>
  );
}
