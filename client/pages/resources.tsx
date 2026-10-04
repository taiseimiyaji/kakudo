import { WorkspaceNav } from "../../components/navigation/workspace-nav";
import { useBlocker, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { ResourcePanel } from "../../components/resources/resource-panel";
export default function ResourcesPage() {
  const { workspaceId = "default" } = useParams({ strict: false });
  const [resourceProtected, setResourceProtected] = useState(false);
  useBlocker({ shouldBlockFn: () => resourceProtected && !window.confirm("未登録または登録結果を確認中の資料があります。このまま移動しますか？"), enableBeforeUnload: resourceProtected });
  return <main className="workspace"><WorkspaceNav workspaceId={workspaceId} /><h1>参考資料</h1><p className="intro">学びの根拠になる記事や公式資料を登録します。ノートや学習項目にも関連付けられます。</p><ResourcePanel workspaceId={workspaceId} showHeading={false} onDraftProtectionChange={setResourceProtected} /></main>;
}
