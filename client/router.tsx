import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import Home from "./pages/home";
import WorkspacePage from "./pages/workspace";
import RoadmapPage from "./pages/roadmap";
const root = createRootRoute({ component: Outlet, notFoundComponent: () => <main className="workspace"><h1>ページが見つかりません</h1><a href="/">Kakudoへ戻る</a></main> });
const home = createRoute({ getParentRoute: () => root, path: "/", component: Home });
const workspace = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId", component: WorkspacePage });
const maps = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId/roadmaps", component: RoadmapPage });
const map = createRoute({ getParentRoute: () => root, path: "/workspaces/$workspaceId/roadmaps/$roadmapId", component: RoadmapPage });
export const router = createRouter({ routeTree: root.addChildren([home, workspace, maps, map]) });
declare module "@tanstack/react-router" { interface Register { router: typeof router } }
