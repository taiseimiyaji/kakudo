# Issue #24: バックアップと復元

2026-09-18。停止中のDB custom dumpとMarkdownを一組にし、SHA-256 manifestを最後に作るCLIを追加。別名の空DB・未作成保存先へ復元し、既存データを上書きしない。運用手順に取得頻度・世代・別媒体退避・月次復元・migration失敗時の切戻しを記載。

`PG_BIN_DIR=/opt/homebrew/opt/libpq/bin npm run check` 成功。

- lint / typecheck: 成功。
- unit: 75件成功。symlinkと保存先内へのbackupを拒否。
- integration: 33件成功。PostgreSQL 17.4のpg_dump/pg_restoreを実行。TEST_DATABASE_URLの検証Workspaceから一時専用DB（末尾_test）へ復元し、本文・current Revision・Review詳細・引用・資料関連を照合した。既存backup、元と同名DB、空でない復元DB、改変済みbackupを拒否。元データ不変を確認。終了後に検証Workspaceと復元用DB・一時ファイルを削除。
- build: 成功（既存Editor chunk警告あり）。
- Chromium: E2E専用DBで14件成功。

実際の運用DBの停止・取得や、運用者の別媒体へのコピーは未実施。CLIの `--offline` は停止済みの前提を明示するもので、プロセスを停止する機能ではない。
