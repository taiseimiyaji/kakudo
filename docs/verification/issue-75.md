# Issue #75 — 遅延作成と現在の画面context

main `145ab653` の実ブラウザで、node Aのノート作成をserverで成功させた後に応答をholdし、node Bまたは別mapへ移動してからreleaseすると、旧node Aの新ノートへ強制的に移動した。新map作成からホームへ移動した場合も遅い応答が新mapへnavigateした。3ケースの実測とJSONをtask/creation-context-evidenceに保持。

修正はPR #74がマージされたmain `99336816` をベースとする。NodeDocumentsは作成開始時のworkspace/node訪問identityを保持し、identity変更・unmount後の成功・失敗・finallyを現在の画面へ伝播させない。node A→B→Aも新しい訪問identityであり、旧Aの結果はnavigate/入力reset/busy/errorを変更しない。作成前のノート名は既存の方針どおり別nodeを選んでも保持する。同じsessionでの成功だけ、空のノートへ従来どおり移動する。既存draftguardがその移動を取り消す場合は、作成成功を表示して元nodeの一覧を更新し、作成済みノートへアクセスできる。

RoadmapSessionもunmount後の作成結果でnavigateしない。新mapはDB上に残り、一覧へ戻ればアクセスできる。ノート・map作成は同期的なpending refで二重submitを止める。既知の失敗ではタイトルを保持し、手動再試行する。登録結果を受け取れなかった際のclient timeout・作成の冪等性/結果照会API・永続draftは今回追加しない。古いcontextで開始したPOST自体はserverで完了し得るため、キャンセルされた作成/失敗とは表示しない。

9つのfocused browser回帰が成功: ノート作成の別node/別map/同node往復/旧error、新map作成のホーム/同画面往復、ノート/mapの既知失敗→保持→再試行・同期二重submit防止・同contextでの移動、既存目標draftによる移動キャンセル後の成功表示/一覧/本文不変。元nodeへの関連と空Markdownを実APIで確認し、fixtureを終了時に除去。全ケースMock providerと所有隔離DBのみ。実ユーザーデータ・実AI・認証/公開設定は不変。

資料draftguard、手動座標、選択/viewport、ノートautosave、本文は人間が書く方針を維持する。Chromiumでの操作でありnative zoomや包括的a11yは検証済みとは主張しない。

最初のfull checkは81browser成功・既存NodeDocumentsテスト1件失敗。フォーム全体をkeyでremountする案が、既存の未送信タイトル保持を失わせたため破棄し、フォームを保持してリクエストの訪問identityのみ切り替える方式へ修正した。既存テストの期待値は変更していない。

修正後のfull `npm run check` は全成功: lint/typecheck、unit **132**、専用PostgreSQL integration **44**、build、Chromium **82**（21.5秒）。既存NodeDocumentsのテストは期待値を変えず成功。
