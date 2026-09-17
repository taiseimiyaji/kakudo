# Issue #1 検証記録

2026-09-17。TanStack Routerはユーザーが明示指定。

- lint / typecheck / build: 成功
- unit: 12件成功（Node / Edge検証、部分更新で既存状態を初期化しない回帰を含む）
- 実PostgreSQL integration: 5件成功（API CRUD、workspace境界、複合FK、重複接続、seedの編集・削除保持）
- Chromium: 6件成功（Map→3 Node→接続→手編集→drag→reload→永続化確認→Edge / Node / Map削除）
- 開発Vite上のWorkspace遷移: 1件成功
- BrowserスキルでSeed Mapの実画面を確認

マイグレーションを開発DBに適用し、Backend Engineeringの8 Nodeと6 Edge、OAuthの4 Objectivesをseed。
Docs / Sources / Review件数は架空の数値を表示せず、準備中と明示。

検証中に修正：同一React keyによる重複描画、保存後に古いMap stateが残る問題、Zodのdefault付きpartialによる学習状態の初期化、Viteが/api.tsをAPIへ転送する問題。

buildはMapライブラリを含むchunkが500 kBを超える警告あり。機能上の失敗ではなく、後続のEditor導入時に画面単位の遅延ロードを検討する。
