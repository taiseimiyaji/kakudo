# Issue #48: Review取得通信の回復

2026-10-04、専用worktree、Node 24.13.0 / PostgreSQL 17、Mockで検証。

変更前のbrowserで、RUNNING取得→GETの一度の通信失敗後にCOMPLETED/FAILEDを取得せず止まることを再現。変更後は状態GETを1/2/4/8/10秒のbackoffで自動再試行し、間隔は10秒で上限にする。正常取得後は1秒に戻し、終端状態で停止する。「状態を再取得」で即時再試行も可能。ReviewのPOSTを再送しない。

通信エラーはReview実行のFAILEDと別表示し、正常取得で解消する。本文を変更せず未保存入力を保持する。画面離脱／Review切替でtimerを取消し、古い通信の成功・失敗を無効化する。状態が未取得のReviewがある間も新規開始を抑制する。

lint / typecheck / unit 98件 / 専用DB integration 42件 / build / browser 26件成功。新規browserの後片付け時にGET先が削除される競合で最初の全実行は1件失敗（24成功）。テスト側の後片付けを修正し、遅延応答の履歴切替ケースを追加して全browserを再実行（26成功）。lint/typecheckも再実行。

Unitは連続失敗の間隔上限、成功後のリセット、終端停止、画面離脱の取消、遅い成功／失敗の無効化をfake timerで確認。BrowserはCOMPLETED/FAILED両方の回復、未保存本文、復旧後ボタン、開始POSTが1回のみ、履歴切替後の遅延応答を確認した。

既存ユーザーDB・元の未コミット作業・実AI通信は変更なし。一時DBとMarkdown保存先を使用。既存buildサイズ警告は残る。修正headのGitHub CIはPRで確認する。
