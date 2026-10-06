import { lazy, Suspense } from "react";
import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet } from "@tanstack/react-router";
import Home from "./pages/home";
import WorkspacePage from "./pages/workspace";
const RoadmapPage = lazyRouteComponent(() => import("./pages/roadmap"));
const DocumentPage = lazyRouteComponent(() => import("./pages/document"));
const DocumentsPage = lazyRouteComponent(() => import("./pages/documents"));
const ResourcesPage = lazyRouteComponent(() => import("./pages/resources"));
const ReviewsPage = lazyRouteComponent(() => import("./pages/reviews"));
const ExportTrialPanel = lazy(() => import("./export-trial/Panel"));
// Explicit opt-in keeps the experiment away from ordinary writing sessions.
const trial = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tasteprintTrial") === "1";
function TrialOutlet() {
  return <><Outlet />{trial && <Suspense fallback={null}><ExportTrialPanel /></Suspense>}</>;
}
const root = createRootRoute({ component: TrialOutlet, notFoundComponent: () => <main className="workspace"><h1>ページが見つかりません</h1><a href="/">Kakudoへ戻る</a></main> });
const home = createRoute({ getParentRoute: () => root, path: "/", component: Home });
const workspace = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId", component: WorkspacePage });
const maps = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId/roadmaps", component: RoadmapPage });
const map = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId/roadmaps/$roadmapId", validateSearch: (search: Record<string, unknown>): { nodeId?: string } => ({ nodeId: typeof search.nodeId === "string" ? search.nodeId : undefined }), component: RoadmapPage });
const document = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId/documents/$documentId", validateSearch: (search: Record<string, unknown>): { reviewId?: string } => ({ reviewId: typeof search.reviewId === "string" ? search.reviewId : undefined }), component: DocumentPage });
const documents = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId/documents", component: DocumentsPage });
const resources = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId/resources", component: ResourcesPage });
const reviews = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId/reviews", component: ReviewsPage });
const exportTrial = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId/export-trial", component: () => <main className="workspace"><h1>Export 試用</h1><p>iframeと直接読み込みを比較する、採用前の実験です。既存ノートURLに ?tasteprintTrial=1 を付けても試せます。</p>{!trial && <Suspense fallback={<p>読み込み中…</p>}><ExportTrialPanel /></Suspense>}</main> });
export const router = createRouter({ routeTree: root.addChildren([home, workspace, maps, map, documents, document, resources, reviews, exportTrial]) });
declare module "@tanstack/react-router" { interface Register { router: typeof router } }
