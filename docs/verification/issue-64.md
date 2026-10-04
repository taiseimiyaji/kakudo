# Issue #64 — 資料登録の通信結果不明とGETによる確認

## 実測と範囲

2026-10-04、修正前main `2c51f1a`、接続MacのChromium、PostgreSQL 17の専用DB、一時Markdown、Review/Search Mockを使用。
実POST201の後にブラウザへの応答だけを切断すると、引用/資料DialogとSourcesの両方で「資料を登録できませんでした…再試行」と表示された。入力は保持されたが一覧は古いまま。独立GETは登録済み1件を返し、再読込後の一覧にも出た。

応答保留10秒では入力・登録中表示・DialogのEscape/キャンセル抑止を確認。これは無限待機の実証とは区別する。
本文保存済みなら再読込とinline登録中のMap移動は警告なしで、未送信の資料入力が消えた。本文dirtyの場合は既存の警告キャンセルで本文/資料入力を保持できた。
遅いinline登録成功が別の引用Dialogの出典入力を消さないことも独立に確認した。
6件の観察probeと既存2件成功（18.3秒）、独立の離脱キャンセル/遅延inline応答probe1件成功（2.0秒）。

今回は通信結果不明の案内とGET確認（scope A）を修正する。未完了Promiseのタイムアウト、全フォームのdraft保存・離脱guard（scope B）は別の候補として保留した。

## 修正

資料登録helperだけがAPI通信エラー・成功JSONの解釈/shape不正を結果不明として扱う。APIのopt-inなし、GET、既知HTTPエラーの案内は従来どおり。
結果不明の場合はURL/名/種類を保持し、同じフォームの再POSTを無効化する。「登録結果を確認」は対象scopeのGETだけを実行する。自動再送なし。
URLが1件だけ一致し、workspace・名前・種類・Resource shapeも一致する場合だけ登録済みの状態を確認する。これは現在の登録済み状態の確認であり、特定POSTの成功原因を断定する表示ではない。
一致なし・重複・metadata不一致・不正payload・GET失敗は入力と結果不明を維持する。一覧陰性を登録失敗とは扱わない。
キャンセル/別scopeへの移動後のGETはunmount guardで破棄する。Document側も当該pasteのidentityが一致する場合だけ閉じる。古い応答で次の引用Dialogを閉じない。

## 検証

- unit：opt-in mutationだけの結果不明分類、GET/既知HTTP/204の境界、成功payload不正、重複・metadata・workspace不一致、GETだけの確認。
- browser新規7件：Dialog/inline×応答切断/不正JSONの実POST登録→GET回復、GET失敗→実一覧陰性、古いGET→キャンセル→次の引用入力保持、workspace資料のGET回復。
- 本文の未保存draftとサーバー保存内容を別々に確認。資料確認が本文を保存しないこと、POSTが1件だけであることを確認。
- 既存#62の登録中キャンセル保護、継続入力/Undo、HTTP500時の入力保持も全browserで成功。

最初のtargeted検証は4件がselectラベルのexact locatorでtimeoutした。combobox roleに修正後、新規7件すべて成功（4.1秒）。
`npm run check`成功：lint/typecheck、unit 118件、integration 44件、build、browser 47件（15.3秒）。既知のchunkサイズ警告のみ継続。
integration/browserは別専用DB。元checkoutの未コミット45ファイル、ユーザーデータ、認証、実AI、本番への変更なし。

残存候補：Promiseが未完了のままなら今回の確認ボタンは出ない。全フォームの資料draft/離脱guardも追加していない。これらを結果不明のGET確認と分離して次の設計で検討する。
