import { Link } from "@tanstack/react-router";

export function WorkspaceNav({ workspaceId }: { workspaceId: string }) {
  return <nav className="workspace-nav" aria-label="メインメニュー">
    {([
      ["/workspaces/$workspaceId", "ホーム"],
      ["/workspaces/$workspaceId/roadmaps", "学習マップ"],
      ["/workspaces/$workspaceId/documents", "ノート"],
      ["/workspaces/$workspaceId/resources", "参考資料"],
      ["/workspaces/$workspaceId/reviews", "レビュー履歴"],
    ] as const).map(([to, title]) => <Link key={to} to={to} params={{ workspaceId }} activeOptions={{ exact: to === "/workspaces/$workspaceId" }} activeProps={{ className: "current", "aria-current": "page" }}>{title}</Link>)}
  </nav>;
}
