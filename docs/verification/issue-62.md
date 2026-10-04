# Issue #62 — PasteDialogの登録中キャンセルと本文への復帰

## 実測

2026-10-04、main `e002995`、接続Macのブラウザ、PostgreSQL 17専用DB、一時Markdown、Review/Search Mockでキーボード操作を確認した。
引用/URL Paste後のTab・Shift+Tab・Escape・キャンセルボタンEnter、引用登録、Review開始、履歴選択、指摘の「本文で確認」、未保存本文からMapへの移動キャンセルを操作した。

- 引用/資料DialogをキャンセルするとfocusがWebAreaへ戻り、そのまま本文を書き続けられなかった。引用登録成功後も同様だった。
- 資料登録中は入力フォームだけbusyで、親DialogのEscape/キャンセルが有効だった。MacではDB lock中にEscapeで閉じられることを確認した。
- 修正前ブラウザテストでは、実POSTの成功応答だけを保留し、Escape→次の引用Dialog→出典URL/名入力→古い応答を返すと、次のDialogと入力が消えた。サーバー側登録成功も確認した。
- MacのDB lock試行は一度timeoutし、別の短いlockは送信前に解除された。遅い成功応答による次の入力消失の根拠は、上記の制御したブラウザ再現である。
- Review操作と離脱キャンセルは期待どおりで、今回の修正対象にしなかった。

元checkoutと#39の範囲をread-onlyで比較した。元の未コミットPasteDialog差分は表示名であり、このfocus/登録中キャンセルの保護はなかった。元変更の統合やUI再設計は行わない。

## 修正と検証

PasteDialogで開く前のfocus先を保持し、終了時に接続済み要素へ戻す。資料登録のPromise中も親Dialogをbusyにする。成功/失敗でbusyを解除する。
引用挿入、履歴、本文保存、通常Pasteの引用化、URLの資料化の規則は既存のまま。

7件のbrowser回帰テスト：引用/資料×Escape/キャンセルEnter、実POSTの応答遅延中のEscape抑止と重複送信抑止、失敗時のURL/名保持と安全な案内・キャンセル回復、引用Enter登録後の継続入力とUndo。
本文とサーバーの保存内容を別々に確認し、キャンセルや資料登録が下書きを保存しないことも確認した。
Macの修正版でも引用Escape、資料Tab/Shift+Tab→キャンセルEnterの後に本文focusと続けて手入力できることを確認した。

`npm run check`成功：lint/typecheck、unit 113件、integration 44件、build、browser 40件（12.8秒）。既知のchunkサイズ警告のみ継続。
integrationとbrowserは別の専用DBを使用。既存ユーザーデータ、元checkoutの未コミット45ファイル、認証、実AI通信、本番に変更なし。
