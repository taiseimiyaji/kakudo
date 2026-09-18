# Issue #22: 更新APIのCSRF対策

2026-09-18。許可Originを固定し、Origin欠落/null/許可外/cross-siteを更新前に拒否。JSONを読むAPIはContent-Typeを必須化。空のDELETEと資料fetchは本文解析を要求しない。Host/Forwardedを許可判定に使わない。

- lint / typecheck: 成功。
- unit: 72件成功。不正Origin・転送ヘッダー・各更新methodでDBに触れないことを検証。
- integration: TEST_DATABASE_URLの専用DBで32件成功。拒否前後でDB不変。
- build: 成功。既存のEditor chunk警告は残る。
- browser: productionとVite proxyの両方でChromium各14件成功。別Originの実ブラウザから単純POSTを送信し403・DB不変を確認。既存CRUD・Review・削除も成功。

ブラウザ最終検証はdb-test上に一時専用DBを作成し、別の一時CONTENT_STORAGE_ROOTへseed。終了時に専用DB・保存先を削除した。

途中の失敗: 型エラー、旧buildに対する検証、空DELETEの誤拒否を修正。Vite検証では既存のreuseExistingServer設定により開発サーバーを再利用してしまい、Mock指定が効かず4件失敗した。失敗traceの作成IDでテスト用Documentの削除済みを確認し、残ったテスト用Roadmapを削除。再利用を無効化し、Vite/API専用ポート43173/43174で再実行して全件成功。完全なDB・保存先分離の恒久対応は #23。

Cloudflare等の公開経路は未検証（#29）。OriginはCSRF対策であり、アクセス制御の代替ではない。
