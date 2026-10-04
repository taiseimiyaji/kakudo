# Issue #60 — Review受付拒否の理由と回復手順

## 実測

2026-10-04、修正前main `974efdf`、Node.js 24、PostgreSQL 17の専用DBとE2E一時Markdown、Review/Search Mockで4つの受付拒否を再現した。

| ケース | HTTP | 修正前の画面 |
| --- | --- | --- |
| 保存本文60,001文字 | 400 | 入力内容を確認して再試行してください。 |
| 関連Nodeの目標100+1件 | 400 | 同上 |
| ファイルで外部Markdown変更 | 409 | 別の変更と競合しました。最新の状態を確認してください。 |
| 履歴取得後に別タブ相当のQUEUED run受付 | 409 | 同上 |

回復方法を期待する4件のブラウザテストがそれぞれ上記の一般文言で失敗した。
外部変更はE2E runnerの一時保存先のみ、重複は専用DBのfixtureのみを使用した。

## 対象・安全境界

POST `/api/documents/:id/reviews` の上記4つだけに安定codeを付けた。
サービスの例外をこのPOSTで捕捉し、`{ code }`だけを応答する。例外messageや診断を返さない。
クライアントは対象POST・4つの既知code・期待HTTP statusがすべて一致する場合だけ、クライアント自身が定義した日本語案内を表示する。
未知code、prototype名、status不一致、他API/メソッド、非JSONは既存の安全な一般案内に戻る。
raw error、stack、provider診断、URLや秘密情報は表示しない。
汎用DomainErrorや他APIのエラーハンドラは変更していない。
キュー上限429/Revision不一致、実行済みReviewの結果・失敗表示、受付上限自体は今回変更していない。
未コミットUI、日本語化統合、#39、#25/#29、認証、本番、実AIにも変更なし。

## 回復と検証

- 本文を手入力で短縮して保存 → 同じノートのReviewがCOMPLETED。
- ノートの関連選択UIで目標の多いNodeの関連を減らす → ReviewがCOMPLETED。
- 外部変更の退避→再読込→確認・保存の案内 → 外部本文を読み、保存してReviewがCOMPLETED。元ファイルを勝手に上書きしない。
- 重複の履歴確認・待機案内 → 再読込で既存QUEUED runを表示。完了を確認するまで再実行ボタンを無効化し、runは1件を保持。自動再送なし。

専用DB integrationで実Hono APIの4つのcode/statusと余計なrunの不作成を確認。60,000文字・100目標の境界は受付可能であることを確認。
unitではサーバーの秘密情報を含めてもクライアント定義の案内だけが表示され、未知・不正・別スコープ・非JSONではfallbackすることを確認。
`npm run check`成功：lint/typecheck、unit 113件、integration 44件、build、browser 33件（13.9秒）。既知のchunkサイズ警告は継続。
