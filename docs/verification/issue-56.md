# Issue #56: Review履歴一覧の取得回復

2026-10-04、専用worktree、Mock・隔離PostgreSQL・一時Markdown保存先で検証。

既存の完了済みReviewがあるノートで、履歴一覧の最初のGETだけを失敗させた。未保存本文を入力し、8秒後にも履歴selectが存在しないことをbrowserで再現した。個別Review自体はCOMPLETEDであり、#48の個別状態GET回復とは別の入口だった。重複Issueがないことを確認し#56に起票した。

履歴GETにも既存の取消可能なbackoffを適用し、取得エラーをReview開始／Finding操作エラーと分離した。成功で取得エラーを解消し、既存Reviewを表示する。手動の「履歴を再取得」も可能。履歴が未取得の間は新規Review開始を抑制する。本文・名前・履歴選択を保持し、回復のためにPOSTは送信しない。画面離脱・切替時はtimerと古い応答を無効化する。

`npm run check` 成功：lint、typecheck、unit 98件、専用DB integration 43件、build、Chromium 28件。新規browserは初回GET失敗→自動回復→既存結果表示、未保存本文保持、サーバー本文不変、Review開始POSTが0回を確認する。backoffと取消のunit、既存の通信回復・履歴切替browserも通過した。

人間が本文を書きAIはレビューする方針を維持。既存ユーザーデータ・原worktreeの変更なし、認証変更・実AI通信・本番deploy・強制pushなし。既存buildサイズ警告は残る。修正headのGitHub CIはPRで確認する。
