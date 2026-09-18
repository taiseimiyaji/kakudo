# Issue #23: E2Eデータの分離

2026-09-18。E2E_DATABASE_URLを必須にし、DB名は `_e2e_test`、アプリ・integrationとは異なる名前に限定。runnerは専用DBのmigration/初期化/seedと一時Markdown directoryの作成・削除を担当する。advisory lockで同時実行を拒否。既存サーバー再利用は不可。

- `npm run check`: lint / typecheck / unit 74件 / integration 32件 / build / Chromium 14件成功。
- `E2E_DEV=1 npm run test:browser`: Chromium 14件成功。
- TEST_DATABASE_URLに一意な検証Workspace・Document・RUNNING Reviewを作成し、そのDBと保存先をアプリ設定としてE2E runnerに渡した。E2E終了後にReview行全体・current Revision・Markdown本文の不変を確認し、検証データを削除した。実際の運用データはこの試験に使っていない。
- E2E DBのadvisory lock保持中はrunnerが非0で終了。直接 `npx playwright test --list` も拒否。
- 初回はE2E環境変数未設定で停止し、設定後に成功。初回Vite実行も非0終了だったため通過扱いにせず、ログを保存して再実行し14件成功を確認した。
- Composeは54331の専用tmpfs DB、CIはtest用PostgreSQL内の独立DBを利用。終了時にpublic tableを初期化し、失敗テストの残存データを次回へ持ち越さない。

本番のデータ復元、実Provider、公開経路はこのIssueの検証対象外。
