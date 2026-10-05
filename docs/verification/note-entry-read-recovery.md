# ノート入口の読取回復

Issue #115。実main eef4b1bでUI作成・人間の本文入力・明示保存したノートの詳細、workspace一覧、node一覧の実GET200を保持すると、制御browser時計45秒後もGET1／書込0で読み込み中のまま、失敗や再取得操作が出ないことを3経路で測定した。

`modules/document/reading.ts` の一回の読取に20秒期限を設け、3入口の既存GETへsignalを渡す。期限はfetchだけでなくJSON読取・schema判定までを含む。期限とabortの競合は一回の安全な失敗に集約する。期限は再取得を予約せず、画面内の明示retryが一回の新しいGETを開始する。

cleanupはinactiveにしてから期限を消しabortする。古いloadがabortを無視して遅れて成功／失敗してもcallbackに届かない。文書詳細はworkspace/documentごとのkey、一覧は既存scope keyを維持し、旧errorや旧データを新しいscopeへ持ち越さない。schemaと対象workspace、詳細のdocument IDが合致する応答だけを採用する。

正常に開いたDocumentSessionの本文・名前・Undo・autosave・引用・reviewは変更しない。NodeDocumentsの作成フォームとマップ・項目・資料draftも読取と別に保持する。Review pollingの既存backoff、結果不明の保存／作成／受付／Finding回復、一般API、server、Providerには変更なし。

## 検証

- 修正前の追加6ブラウザ: deadline3＋詳細/workspaceのHTTP失敗後retry2の5期待失敗、既存node HTTP retry1成功。
- 追加単体9件: 20秒境界、一回失敗・自動retryなし、timeout後とcleanup後の遅い成功／拒否、期限直前成功、abort競合、同期/schema失敗、既存requestのJSON待機と明示GET置換。
- 追加ブラウザ13件: 3入口の実200保持→期限→GET再取得・書込0、HTTP失敗、切替取消と旧期限排除、人間のdraft保持、別ノートへのerror非継承、他workspaceの形式上正しい応答を拒否。
- 初回の追加13件は8成功／5並行fixture同名衝突。fixtureの固有名に修正し13成功。初回全体は226成功／既存遅延node-listテスト1失敗。旧scopeのGETが取消されるため旧HTTP応答待ちを取消通知のassertionへ変更し、以前のscope非表示・error回復・現在の一覧・旧payload非表示のassertionを維持。
- 最終の集中14件、lint/typecheck/build、単体220件、所有隔離DB統合60件、全ブラウザ227件が成功。

Mock、所有隔離DB、一時Markdownのみ。時計は制御されたbrowser時計で、実ネットワーク経過時間・native IME・実AIの検証を主張しない。元の未コミット作業・ユーザーデータ、認証、デプロイに変更なし。
