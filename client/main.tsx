import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "./pages/home";
import WorkspacePage from "./pages/workspace";
import "./styles.css";

// Foundation only: router selection remains a separate user decision.
const page = window.location.pathname === "/" ? <Home />
  : window.location.pathname === "/workspaces/default" ? <WorkspacePage />
  : <main className="workspace"><h1>ページが見つかりません</h1><a href="/">Kakudoへ戻る</a></main>;

createRoot(document.getElementById("root")!).render(<StrictMode>{page}</StrictMode>);
