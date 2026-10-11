import { useId, useState } from "react";
import type { DocumentDetail, DocumentNode } from "../../shared/document";

export function NoteSaveComparison({ title, content, nodes, latest }: { title: string; content: string; nodes: DocumentNode[]; latest: DocumentDetail }) {
  const [comparing, setComparing] = useState(false);
  const comparisonId = useId();
  return <div className="note-save-comparison">
    <button type="button" className="secondary" aria-expanded={comparing} aria-controls={comparisonId} onClick={() => setComparing((value) => !value)}>現在の入力と比べる</button>
    <p>取得した保存内容は確認時点のものです。比較は書き込みを行いません。</p>
    <div id={comparisonId} className={`note-save-comparison-grid${comparing ? " is-comparing" : ""}`}>
      {comparing && <section key="current" aria-label="現在の入力">
        <h3>現在の入力</h3><h4>名前</h4><p>{title}</p><h4>Markdown本文</h4>
        <pre role="region" aria-label="現在のMarkdown本文" tabIndex={0}>{content}</pre>
        <ConfirmedNodes label="この画面の確定済み関連" nodes={nodes} />
      </section>}
      <section key="fetched" aria-label="取得した最新保存">
        <h3>取得した最新保存</h3><h4>名前</h4><p>{latest.document.title}</p><h4>Markdown本文</h4>
        <pre role="region" aria-label="取得したMarkdown本文" tabIndex={0}>{latest.content}</pre>
        <ConfirmedNodes label="取得時の保存済み関連" nodes={latest.nodes} />
      </section>
    </div>
    <p>本文と名前の再試行に関連の変更は含まれません。未保存の関連選択は「関連を保存」で別に確定します。</p>
  </div>;
}

function ConfirmedNodes({ label, nodes }: { label: string; nodes: DocumentNode[] }) {
  return <><h4>{label}</h4>{nodes.length ? <ul>{nodes.map((node) => <li key={node.id}>{node.roadmapTitle} / {node.title}</li>)}</ul> : <p>関連する学習項目はありません。</p>}</>;
}
