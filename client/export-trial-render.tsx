import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Widgets from "./export-trial/Widgets";
import ListPage from "./tasteprint-export/examples/ListPage";
const screen = new URLSearchParams(window.location.search).get("screen");
createRoot(document.getElementById("export-root")!).render(<StrictMode>{screen === "list" ? <ListPage /> : <Widgets />}</StrictMode>);
