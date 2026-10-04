import { Link } from "@tanstack/react-router";
import type { useCreationRecovery } from "../../client/hooks/use-creation-recovery";

export function CreationRecovery({ kind, workspaceId, recovery, onRead }: { kind: "map" | "note" | "node"; workspaceId: string; recovery: ReturnType<typeof useCreationRecovery>; onRead: () => void }) {
  if (!recovery.blocked) return null;
  const name = ({ map: "マップ", note: "ノート", node: "学習項目" } as const)[kind];
  return <section aria-label={`${name}の作成結果の確認`} aria-busy={recovery.reading}>
    <p role="alert">「{recovery.title}」の作成結果は不明です。作成された可能性があります。入力は保持しています。再作成する前に一覧を確認してください。</p>
    <button type="button" className="secondary" disabled={recovery.reading} onClick={onRead}>作成済みの{name}を確認</button>
    {recovery.reading && <p role="status">一覧を確認しています…</p>}
    {recovery.error && <p role="alert">{recovery.error}</p>}
    {recovery.candidates !== null && <>
      <p>同じ名前の{name}を表示します。同じ作成要求の結果とは限りません。見つからなくても、先の作成が遅れて完了する可能性があります。</p>
      <ul>{recovery.candidates.filter((item) => item.title === recovery.title?.trim()).map((item) => <li key={item.id}>{kind === "map"
        ? <Link to="/workspaces/$workspaceId/roadmaps/$roadmapId" params={{ workspaceId, roadmapId: item.id }}>{item.title}</Link>
        : kind === "note" ? <Link to="/workspaces/$workspaceId/documents/$documentId" params={{ workspaceId, documentId: item.id }}>{item.title}</Link>
        : <span>{item.title}</span>}</li>)}</ul>
      <button type="button" className="secondary" disabled={recovery.reading} onClick={() => { if (window.confirm(`先の作成が完了している場合、${name}が重複します。新しい${name}の作成を可能にしますか？`)) recovery.allowNew(); }}>一覧を確認しました。新しく作成</button>
    </>}
  </section>;
}
