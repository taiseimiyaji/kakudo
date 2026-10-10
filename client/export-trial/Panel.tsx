import { lazy, Suspense, useState } from "react";
import "./panel.css";

const Widgets = lazy(() => import("./Widgets"));
export default function ExportTrialPanel() {
  const [mode, setMode] = useState<"baseline" | "iframe" | "direct">("baseline");
  const [screen, setScreen] = useState("widgets");
  return <aside className="export-trial-panel" aria-label="Export 試用パネル">
    <nav aria-label="試用表示">
      <button type="button" onClick={() => setMode("baseline")}>比較前</button>
      <button type="button" onClick={() => setMode("iframe")}>iframe 比較</button>
      <button type="button" onClick={() => setMode("direct")}>直接読み込み</button>
    </nav>
    <p role="status">{mode === "baseline" ? "既存UI・Export未読込" : mode === "iframe" ? "iframe内だけにCSSとRuntimeThemeを適用" : "ZIP CSSをdocument全体に適用・既存UIはRuntimeThemeの外"}</p>
    {mode === "iframe" && <><label>比較画面<select value={screen} onChange={e => setScreen(e.target.value)}><option value="widgets">代表部品</option><option value="list">ListPage</option></select></label><iframe title="Tasteprint Export" src={`/export-trial-render.html?screen=${screen}`} /></>}
    {mode === "direct" && <Suspense fallback={<p>読み込み中…</p>}><Widgets /></Suspense>}
    {mode === "direct" && <p>比較前へ戻しても、直接読み込んだCSSは残ります。元の表示はページを再読込して確認してください。</p>}
  </aside>;
}
