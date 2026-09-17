import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet } from "@tanstack/react-router";
import Home from "./pages/home";
import WorkspacePage from "./pages/workspace";
const RoadmapPage = lazyRouteComponent(() => import("./pages/roadmap"));
const DocumentPage = lazyRouteComponent(() => import("./pages/document"));
const DocumentsPage = lazyRouteComponent(() => import("./pages/documents"));
const ResourcesPage = lazyRouteComponent(() => import("./pages/resources"));
const root = createRootRoute({ component: Outlet, notFoundComponent: () => <main className="workspace"><h1>ページが見つかりません</h1><a href="/">Kakudoへ戻る</a></main> });
const home = createRoute({ getParentRoute: () => root, path: "/", component: Home });
const workspace = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId", component: WorkspacePage });
const maps = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId/roadmaps", component: RoadmapPage });
const map = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId/roadmaps/$roadmapId", component: RoadmapPage });
const document = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId/documents/$documentId", component: DocumentPage });
const documents = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId/documents", component: DocumentsPage });
const resources = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId/resources", component: ResourcesPage });
export const router = createRouter({ routeTree: root.addChildren([home, workspace, maps, map, documents, document, resources]) });
declare module "@tanstack/react-router" { interface Register { router: typeof router } }
