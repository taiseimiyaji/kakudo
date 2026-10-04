# Issue #47: 引用をUndo可能なtransactionとして追加

2026-10-04、専用worktree、Node 24.13.0 / PostgreSQL 17で検証。

変更前のブラウザで、手入力→引用追加→Undoが引用を取り消せないことを再現した。変更後は既存EditorViewへ、前後の編集と独立した履歴transactionを送る。引用をUndo/Redoでき、さらに引用前の手入力もUndoできる。挿入位置だけを変更し、エディタの表示位置を初期化しない。

CRLFの元本文offsetをCodeMirrorのLF offsetへ変換し、引用はTextとして挿入する。サーバーでも元本文の改行に合わせる。Source snapshotの照合は改行表現の差を吸収する。引用Metadataは過去の記録として保持し、保存後に引用表記がない新RevisionのSource Check対象から除外する。

`npm run check` 成功：lint、typecheck、unit 94件、integration 42件、build、Chromium 23件。手入力→引用→Undo→Redo→過去入力Undo、未保存表示、保存・再読込、A→B→AのRevision、Source Check対象と過去ReviewのOutdated/snapshot保持を検証。LF/CRLF双方をunit・専用DB integrationで確認した。

新規テストのFetcher型不一致は既存Mock fixtureを使って解消し、全チェックを再実行した。DBとMarkdownは新規一時コンテナ／一時保存先、Reviewer/SearchはMock。実AI通信・既存データ・原作業の変更はない。既存buildサイズ警告は残る。修正headのGitHub CIはPRで確認する。
