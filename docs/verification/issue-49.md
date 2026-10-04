# Issue #49: ノートと学習項目・目標の文脈

2026-10-04、専用worktree、Node 24.13.0 / PostgreSQL 17で検証。

ノート画面に関連Node名・人間が定義したLearning Objectives・元マップのNodeへ戻るリンクを追加した。既存の移動ガードで未保存本文と名前を保護する。関連先は同一Workspaceの既存Nodeから複数選択でき、関連なし・解除・削除後の再関連付けにも対応する。

関連更新APIはWorkspace境界を検証し、保存識別子で古い更新を拒否する。関連とMetadataだけをtransactionで変更し、Markdown・本文Revisionは変更しない。過去ReviewのObjectivesはsnapshotとして維持する。関連変更や目標の再取得でReview状態を更新し、対象目標が変わった結果をOutdatedにする。再レビューは新しい人間の目標を使う。

lint / typecheck / unit 98件 / 専用DB integration 43件 / build / Chromium 27件成功。初回lintの選択状態effect・未使用importを修正して全チェックを再実行した。視覚確認後にcheckbox配置と目標再取得時のReview更新を調整し、lint/typecheck/build/全browserを再実行（27件成功）。

Integrationは複数関連・重複排除・関連なし・解除・Node削除後の再関連付け、Workspace外への更新／取得拒否、古い保存識別子の拒否、本文・タイトル・Revision不変、Coverage/FULLの新しい目標と過去snapshot/Outdatedを確認。Browserは未保存本文と名前を保持した関連変更、削除済みNodeのノート再利用、目標再取得・再レビュー、移動キャンセル、元マップのNode選択を確認。`document-objectives.png`で表示も確認した。

一時コンテナのintegration/E2E専用DB、Mockと一時Markdownを使用。AIによる本文・目標生成なし、原作業とユーザーデータの変更なし。既存buildサイズ警告は残る。修正headのGitHub CIはPRで確認する。
