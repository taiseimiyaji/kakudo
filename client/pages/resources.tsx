import { WorkspaceNav } from "../../components/navigation/workspace-nav";
import { useParams } from "@tanstack/react-router";
import { ResourcePanel } from "../../components/resources/resource-panel";
export default function ResourcesPage() { const { workspaceId = "default" } = useParams({ strict: false }); return <main className="workspace"><WorkspaceNav workspaceId={workspaceId} /><h1>参考資料</h1><p className="intro">学びの根拠になる記事や公式資料を登録します。ノートや学習項目にも関連付けられます。</p><ResourcePanel workspaceId={workspaceId} showHeading={false} /></main>; }
