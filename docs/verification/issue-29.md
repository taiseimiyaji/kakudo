# Issue #29: 公開設定の準備と未検証範囲

2026-09-18。Cloudflare公式のself-hosted application手順を確認し、`docs/public-access.md`へ設定順序、全pathの保護、token検証、origin迂回対策、CSRFとの共存、受け入れ確認表、停止方法を記載した。READMEから参照できる。

現行Nodeの既定bindは127.0.0.1、ComposeのDB 3種も127.0.0.1に限定されていることをコード上で確認。これは実際の公開ホスト・ネットワーク設定の検証を意味しない。

未確定: 恒久配置先、公開の有無、ドメイン、Cloudflareアカウント、許可利用者。公開route・Access設定は変更していない。未認証/許可外ユーザーの拒否、originへの外部接続不可、許可ユーザーのHTTPS保存/Review、ホスト再起動は未実施。Issue #29は閉じない。

`PG_BIN_DIR=/opt/homebrew/opt/libpq/bin npm run check`: lint / typecheck / unit 80件 / 専用DB integration 39件 / build / Chromium 15件成功。これらはlocalhost/Mock検証で、公開経路の受け入れ条件の代用ではない。
