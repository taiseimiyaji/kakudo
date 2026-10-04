# Issue #46: Document名も含む競合検出

2026-10-04、専用worktree、Node 24.13.0、PostgreSQL 17で検証。

変更前：Old/Aを開いた後、別タブでNew/Aを保存しても、古いOld/Bの保存が成功することを専用DB integrationで再現した。

変更後：通常保存・引用追加に `baseWriteId` を必須とし、本文SHA-256と既存の `lastWriteId` の両方を照合する。タイトルだけの変更にも新しい保存識別子が割り当てられる。既存のjournalによる回復、本文同一時のRevision重複抑制は維持する。DB migrationは不要。古いAPIクライアントは再読み込みが必要。

競合時の本文・名前・Undo履歴は保持する。最新の保存内容を別表示し、確認後に保存基準を更新して現在の入力を再試行できる。引用の競合でもDialogを保持し、閉じてから同じ確認操作を利用できる。

`npm run check` 成功：lint、typecheck、unit 92件、integration 40件、build、Chromium 22件。タイトル変更→古い本文保存／引用追加／別タイトルの各競合、2タブの入力保持・最新内容確認・再試行・再読込を検証した。既存の回復・保存失敗・同時保存テストも成功。

一時コンテナのintegration/E2E専用DB、Mock、一時Markdown保存先を使用。元の作業ツリー・既存ユーザーDB・実AI通信は変更していない。既存のbuildサイズ警告は残る。GitHubの修正head CIはPRで別途確認する。
