# Issue #9 検証記録

2026-09-17。lint / typecheck / build成功。unit 69件、実PostgreSQL integration 31件、Chromium 13件成功。

- Coverageの3状態、目標IDの過不足・重複・未知フィールド拒否、未設定時のProvider非呼出を検証。
- 複数NodeのObjectives固定、Logic / Coverage / Full実行、本文不変を実DBで検証。
- 目標変更後も以前のSnapshotを保持し、DocumentとMapのOutdated表示、新しい目標での再Reviewを検証。
- ブラウザで人間が4目標を設定→本文を入力→Coverage→Logic→問いを確認→手入力でOutdatedを検証。
- 実Codex SDKでも仕様のCookieの論理飛躍を1件指摘し、本文で扱っていないOAuthの4目標をNOT_COVEREDと評価。`scripts/learning-review-smoke.ts` を使用。

外部APIなしのMockは保守的なデモ判定であり、理解度の精密な評価ではない。OpenAI APIは契約テストのみで、認証情報未設定のため実接続は未検証。
