import { Link } from "@tanstack/react-router";

export default function Home() {
  return (
    <main className="landing">
      <div className="wordmark"><span className="brand-symbol" aria-hidden="true">角</span>Kakudo<span className="badge">PoC</span></div>
      <p className="eyebrow">WRITE. TRACE. VERIFY.</p>
      <h1>書いて、辿って、<br />確かめる。</h1>
      <p className="intro">自分の言葉で書く。資料へ戻る。理解を確かめる。<br />あなたの思考を積み重ねる、学習のワークスペース。</p>
      <Link to="/workspaces/$workspaceId" params={{ workspaceId: "default" }} className="primary-link">Workspaceを開く <span aria-hidden="true">↗</span></Link>
      <div className="principles">
        <article><span>01 / WRITE</span><h2>自分の言葉で。</h2><p>学んだことをMarkdownに書き、理解を形にする。</p></article>
        <article><span>02 / TRACE</span><h2>根拠を辿る。</h2><p>知識と参考資料をつなぎ、出典へ戻る。</p></article>
        <article><span>03 / VERIFY</span><h2>考えて、確かめる。</h2><p>AIは問題点と根拠を提示する。判断と修正はあなた自身で。</p></article>
      </div>
      <footer>カクドー / Knowledge Workspace <span>Phase 1 · 初期セットアップ</span></footer>
    </main>
  );
}
