# レビュー履歴・状態の読取期限と既存backoff

Issue #111。PR110の実マージmain `94ba022`上で、サーバーではCOMPLETEDの実Mockレビューの履歴／選択run詳細の実200応答だけをbrowserへ保持した。制御browser時計45秒後もGET1、開始5ボタン無効、状態・読取失敗・手動再取得なし。解放後は既存runが表示され、browser ReviewPOST0。人間の後のdraftとサーバー本文は保持された。初回時計fixtureはautosaveを混ぜて失敗したため保存し、未編集で45秒を測定した後、時計停止中にdraftを書く方法で2測定を成功させた。実ネットワーク45秒経過とは区別する。

pollReviewがloadの完了／拒否を待つため、未完了のGETは既存backoffに到達しなかった。履歴と詳細の二つのloadにGET signalを渡し、共有pollに各読取20秒の期限を設ける。期限は安全な失敗で一度settleしてからそのGETをabortする。retryを予約するのは既存catchだけ。期限・abortの競合や旧promiseの解決／拒否で二重onError・二重予約しない。

既存1/2/4/8/10秒（上限10秒）の失敗backoff、成功reset、QUEUED/RUNNING成功後1秒poll、terminal成功停止を維持する。例: GET1をt0に開始→t20秒の失敗1→t21秒GET2→t41秒の失敗2→t43秒GET3。期限用の独立retryや追加pollerを作らない。手動再取得は旧effectの予約・期限を解除し、読取をabortしてから一つの新pollを始める。

activeとread attempt identityでscope／選択切替・cleanup後の旧応答を排除する。期限raceを既にsettleした旧promiseの遅い成功／失敗も現在のonData／onError／retryに届かない。signalを無視するdeferred unit loaderでも期限を保証する。初期読取には状態文を表示し、期限切れは既存の読取失敗・手動GETのUIに渡す。空履歴やFAILED Reviewと見なさず、cached pending状態・現在の選択・人間の本文と名前・資料draftを保つ。

| 境界 | 検証 |
| --- | --- |
| deadline直前・直後、timeoutの連続backoffと成功reset | 単体。20秒で失敗1、予約1、各backoff境界でGET1回。terminalでtimer0 |
| timeout済み旧promiseのresolve/reject、deadlineとabortの競合 | 単体。onError一回、安全なメッセージ、追加retryなし |
| pendingのcleanup、手動poll置換、deadline直前terminal成功、同期throw | 単体。signal abort、deadline/retry timer消去、既存backoffのみ |
| 履歴／詳細×auto／manual回復 | ブラウザ4。実Mock run、20秒で読取失敗、GET2で回復、ReviewPOST0、後の未保存本文／名前／資料保持 |
| 手動GETと旧automatic backoff | ブラウザ1。旧予約時刻後もGET2で停止 |
| 旧履歴snapshot→別画面の新run→freshGET→新runを選択→旧応答 | ブラウザ1。新しいoptionと選択を維持 |
| 旧選択run詳細／旧文書履歴を保持→新scope→旧応答 | ブラウザ2。新しい選択・詳細・draft優先、旧deadline/retryなし |
| controlled cachedRUNNING→次の実COMPLETED応答を保持→期限→手動GET | ブラウザ1。cached状態をFAILEDにせず既存runを再開 |

追加単体8件は修正前6期待失敗・2既存成功（合計旧203＋2成功）、修正後は合計211単体成功。追加ブラウザ9件は修正前7期待失敗・旧応答保護2成功、修正後9成功。lint/typecheck/build・211単体・60専用DB統合・全214ブラウザが成功した。390px主要フローも検証する。初回全ブラウザは213成功・旧テストのHTTP応答待ち1失敗。切替後に旧GETをabortする新契約のため、旧テストをrequestfailedのabort確認と旧handler完了待ちに変更し、現在の履歴と状態・旧payload非表示のassertは維持した。

対象はReviewPanelの二つの状態読取だけ。受付／Finding判断の専用回復GET、POST/PATCH、一般API期限、サーバーjob/providerは変更しない。実AI・実資料取得・認証変更・本番デプロイなし。GETの再試行はこの画面が存在する間の既存backoffを使い、文書／workspace／履歴切替・離脱で止める。
