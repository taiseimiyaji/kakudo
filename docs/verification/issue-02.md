# Issue #2 検証記録

2026-09-17。lint / typecheck / build成功。unit 15件、実DB integration 9件、Chromium 7件成功。

- Nodeから空のDocument作成→CodeMirrorで手入力→Preview→保存→再読込→rename→削除。
- CRLF / Front Matter / 日本語 / コードを実.mdへ保持。
- Node削除後もDocumentを保持、workspace境界と競合Hashを検証。
- 絶対path / traversal / symlinkを拒否し、atomic writeで置換。
- DB commit失敗後のfile補償、file書込み失敗時のmetadata保持、永続journalからの中断回復を検証。
- Previewからscript / javascript URL / 外部画像取得を除外。

保存先は1プロセスが所有するPoC。ローカルの悪意ある別プロセスによる同時filesystem操作や複数サーバーで共有した保存先への書込みは対象外。
Revisionは#5で追加。Paste Policyは#3で追加。Map / Editorは画面単位で遅延ロードするが、Editor chunkには500 kB超のbuild警告が残る。
