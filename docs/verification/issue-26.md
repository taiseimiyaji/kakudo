# Issue #26: Review受付・実行期限

2026-09-18。受付は保存処理と同じprocess内直列化で判定し、同一Document/Revision/typeの進行中重複を409、待機＋実行件数上限を429で拒否する。DB所有lockによる単一processを前提とする。

実行開始からの期限をProvider単体timeoutと分離し、Codex/OpenAI・検索・資料取得へAbortSignalを渡す。期限切れ後のstage更新、Finding保存、COMPLETEDへの変更を防止する。DB queryも15秒で打ち切り、FAILED記録がDB障害で失敗した場合は復旧後に再試行する。DB切断時は所有process自体も停止してサービス再起動時に回復する。

`PG_BIN_DIR=/opt/homebrew/opt/libpq/bin npm run check` 成功。

- lint / typecheck / build成功。
- unit 77件成功。中断前後の呼び出しと設定値を検証。
- 専用TEST_DATABASE_URLのintegration 39件成功。並行重複受付、上限、完了後再受付、応答しないProviderの期限切れ、後続job完了、遅延結果がFAILEDを上書きしないこと、DB更新障害注入からのFAILED再記録、両SDKへのsignal伝搬を確認。
- E2E専用DBのChromium 14件成功。本文は変更せず、既存Review操作を維持。

Mock/注入transportでの検証。実Providerの期限切れ・実サーバー障害の長時間運用は未検証。実行期限にキュー待ち時間は含まない。期限到達後のDB終端状態記録には接続回復や最大15秒のquery timeoutが別途かかり得る。
