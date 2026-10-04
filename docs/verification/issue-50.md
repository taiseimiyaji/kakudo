# Issue #50: 安全なエラー表示とMap E2E

2026-10-04、main `03b3b0d` の専用worktreeで検証。

変更前のmap-context E2Eは、500の任意error「保存失敗のテスト」を期待し、実際のクライアント定義文言と不一致で失敗した。変更後は安全な文言との完全一致と、任意errorが表示されないことを確認する。client/api.tsと診断非露出unit testは変更していない。

`npm run check` 成功：lint、typecheck、unit 92件、integration 39件、build、Chromium 21件。Mapのrollback、座標入力保持、viewport・選択・scroll保持、応答喪失後の整合性、1440/1024/768/390pxをすべて最後まで実行した。

Node 24.13.0 / PostgreSQL 17。一時コンテナの専用integration/E2E DB、Mock Reviewer/Search、一時Markdown保存先を使用した。既存開発DB、元の未コミット作業、実AI通信には触れていない。既存の500kB超build警告は残る。

差分レビュー：変更はE2E契約と本記録のみ。skip・テスト削除・プロダクト変更なし。GitHubの修正headのCIはPRで別途確認する。
