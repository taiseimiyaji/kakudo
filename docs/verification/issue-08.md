# Issue #8 検証記録

2026-09-17。lint / typecheck / build成功。unit 64件、integration 30件、Chromium 12件成功。Map / Sourcesの表示調整後に該当browser 2件も再確認。

- CRLF原文offsetをCodeMirrorへ変換し、一致するRevision / Snapshotだけをハイライト。編集transactionで即解除。
- Resolve / Dismiss / ReopenのAPI入力・workspace境界・永続化と本文不変を実DBで検証。
- BrowserでFinding選択→highlight→Resolve→reload→Dismiss→手修正→Outdated→保存→Review Again→旧履歴選択を検証。
- Workspace Reviews一覧とDocument履歴から結果を開ける。
- Map集計はDoc / Source重複排除、各Documentの最新完了ReviewのみのOPEN、旧Revision件数を実データで検証。
- 開発画面もBrowserでDOM / screenshot確認。Sources変更時に編集中のNodeフォームを再マウントしない。

過去offsetを変更後の本文へ適用せず、AI結果を本文へ適用する操作を持たない。未保存の本文がある間は再Review前に保存を求める。
