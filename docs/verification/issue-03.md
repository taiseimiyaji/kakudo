# Issue #3 検証記録

2026-09-17。lint / typecheck / build成功。unit 19件、実DB integration 10件、Chromium 8件成功。

- ネイティブCmd/Ctrl+Vで通常文を遮断、引用Dialogのキャンセルで本文不変。
- URL必須をUI / APIで検証、複数行引用と出典をMarkdown / DBに保存。
- DOM pasteイベント（コンテキストメニューと共通経路）でURL Dialogを検証。OSのコンテキストメニュー自体は自動操作していない。
- fenced / indented code、空code、閉じていないfence、境界、複数カーソル、選択範囲をunitで検証。実ブラウザでcode内Paste→保存した文字列を照合。
- 競合HashのQuote追加を409で拒否し、重複Quoteを保存しない。
- CodeMirrorの正規化位置を元の改行形式のoffsetへ変換する。

URL-onlyの登録保存は仕様どおり次のIssue #4で接続。AI接続先の確定（Codex SDK既定 / OpenAI API切替）を設計とIssue #6へ追記した。
