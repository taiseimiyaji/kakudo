# Issue #28: サービス実行ユーザーでの実Provider確認

2026-09-18、このMacでのlocalhost運用を仮の配置先として検証。Node 24.13.0、Codex CLI/SDK 0.154.0、Review/Search Providerはcodex、modelはgpt-6-astra、実行ユーザーはuid 501。ChatGPTログイン済みの既存認証をサービスから利用し、認証cacheの内容は取得・公開していない。

生成した一時launchd設定でproduction buildを127.0.0.1:43175に起動。専用の一時DB（db-test内）とMarkdown保存先を使用し、開発サービス・運用データは使っていない。仕様の人間が指定したOAuth誤記例とRFC 6749を入力した。

- 不正なCODEX_PATHでReviewがFAILEDになることを確認（run `a1dbd19d-6577-42d5-82ca-8b7c11b09f9a`）。設定を直し、launchdから再起動後に同じDocumentで再実行。
- 実Review `5f97356c-ea12-4893-bcdb-316c9d7de1f8` は21.8秒でCOMPLETED。RFC 6749をSSRF対策付き取得経路で参照し、Evidence付きCONTRADICTEDを確認。
- 対象Revision `0cc9e9bd-85c2-40e8-9718-a7ee7fb31eb7` は開始時のまま。実行中の空白追加後はstale=trueとなり、Reviewは現在本文を書き換えていない。
- 同じuid・HOME・最小PATH・サービス設定でSearch Providerを実呼出しし、web_searchイベントとRFC 7636の公式URLを確認。
- 一時サービスの登録・DB・保存先は検証後に削除。

最初の検証ハーネスはbootout直後の同名bootstrapでlaunchctlエラー5となった。設定修正後の再起動をkickstartへ変更して再検証し、上記結果を得た。アプリの失敗とは区別する。

`npm run smoke:deployment` を追加。人間の検証用.mdを読み、稼働APIのProvider、Evidence、Revision固定、stale、本文不変を確認し、作成Documentを削除する。通常E2Eでは期待Providerを明示的にmockとし、実AIは呼ばない。

`PG_BIN_DIR=/opt/homebrew/opt/libpq/bin npm run check`: lint / typecheck / unit 80件 / 専用DB integration 39件 / build / Chromium 15件成功。

恒久サービスの設置・ホスト再起動は#25に残る。別サーバー・別実行ユーザー・OpenAI API Provider・公開HTTPS経路は未検証。配置先が変わる場合は本確認を再実施する。
