# Issue #7 検証記録

2026-09-17。lint / typecheck / build成功。unit 60件、integration 29件、Chromium 11件成功。

- Review開始時のRevision・Objectives・引用・資料関連を固定、documentId/revisionId複合FK、処理中の本文編集で対象不変。
- Document→Node→Workspace→Web Searchの探索順、登録資料で根拠が足りれば検索しないことを検証。
- Finding / Evidence保存、Provider失敗→FAILEDと再実行、Workspace境界、外部編集後のReview拒否、本文不変を実DBで検証。
- 引用照合のVERIFIED / PARTIAL_MATCH / NOT_FOUND / UNAVAILABLEを区別。
- ブラウザからMockのCheck Factsを起動し、完了・CONTRADICTED・RFC URL・Mock表示・再読込を確認。
- 実Codex SDK + 実RFC取得 + 実DBのpipeline smokeはCOMPLETED、CONTRADICTED、RFC Editorの最終URLを返し、本文不変。検証Documentは削除済み。
- Codex検索も実行してRFC 6749の公式URLを取得。検索では実際のweb_searchイベントを必須にした。OpenAI検索はstub契約テストのみ（API認証未設定）。

検索と検証は別呼び出し。検索時だけweb search / code-mode hostを有効にし、shell / MCP / plugins / hooksは引き続き無効。取得した根拠は安全なFetcherで再取得する。
アプリ再起動時に中断ReviewをFAILEDに変更する。PoCは1プロセス運用。
長い資料の抜粋・各範囲12資料・検索3件・主張20件の制限はREADMEと結果のnoticeに明記する。
