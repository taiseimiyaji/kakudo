# 運用開始前の調査

調査日: 2026-09-18。対象commit: `5808d168a54e759f73fe6455a818258cc15b6b3e`。
仕様・設計・実装・検証記録・GitHubの未完了IssueとCIを確認した。機能変更・公開設定・実Provider呼び出しは実施していない。

PoC機能の受け入れは完了している。一方、継続して学習データを保存する運用には、以下の準備が必要。外部公開は入口のアクセス制御と実経路での検証を終えてから開始する。
アプリ内認証、チーム機能、複数Replica等の仕様§42外の機能追加は前提にしない。

## 開始前に対応する項目

### 1. 外部公開時のアクセス制御と実経路の確認

- 根拠: `README.md:53`。アプリ内認証はなく、Tunnel・実サーバーdeployは未実施と記載。リポジトリには公開経路の設定がない。実アカウント側の設定有無は未確認。
- 対応: Cloudflare Tunnelを使う場合、Cloudflare Accessで利用者を限定し、UIと `/api/*` の両方を保護する。originへの迂回経路を閉じる。通常サーバーも入口で同等の制御を行う。
- 完了条件: 未認証・許可外ユーザーの閲覧と更新が拒否され、許可ユーザーがHTTPS経由で保存・Review・再読込できる。PostgreSQLを外部公開しない。
- localhost限定で試す段階では公開設定は不要。

Cloudflare公式はAccess applicationの作成と、Tunnel側の「Protect with Access」による検証を案内している。[公式手順](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)

### 2. 更新APIのCSRF対策

- 根拠: `server/app.ts` / `server/api.ts` にOriginやFetch Metadataの検証がない。`server/roadmap-routes.ts:10` はContent-Typeを制限せずJSONとして読む。
- 再現: `createApp` に模擬DBを注入し、`POST /api/roadmaps` へ `Content-Type: text/plain`、`Origin: https://untrusted.example`、`Sec-Fetch-Site: cross-site` とJSON本文を渡すと、HTTP 201で模擬insertが1回呼ばれた。実DBは使っていない。
- 解釈: サーバーが別originの単純POSTを受理することは確認済み。実ブラウザのローカルネットワーク制限やAccessのCookieを含む攻撃成立性は未検証であり、被害発生を確認したものではない。
- 対応: 更新APIで許可Originを検証し、JSON Content-Typeを強制する。proxy経由での公開originを明示的に扱い、開発Vite経由も確認する。
- 完了条件: 不正Origin・単純POSTを更新前に拒否し、正規UIのCRUDは通過する。アプリ内のユーザー認証を追加せず対応できる。

### 3. DBとMarkdownのバックアップ・復元

- 根拠: `README.md:69` に両方のバックアップが必要との説明はあるが、取得・復元の手順や自動化、復元試験の記録はない。
- 対応: 初期運用ではアプリと外部Markdown編集を止めて書込みを静止し、DBの論理バックアップと `CONTENT_STORAGE_ROOT` を同じ組として取得する。保存世代、別媒体への退避、取得頻度を決める。稼働中のPostgreSQLデータディレクトリを単純コピーする手順にはしない。
- 完了条件: 別のDB・保存先に復元し、Markdown本文、current Revision、過去Review、引用・資料関連を確認する。アップデート前の取得と、失敗時に戻す手順も残す。

### 4. テスト環境と運用データの分離

- 根拠: `playwright.config.ts:14` は別ポートでサーバーを立てるが、DBと保存先を分離していない。READMEも開発DBへのテストデータ作成を明記している。
- 具体的な影響: `server/index.ts:10` の起動処理が `recoverInterrupted()` を呼び、`modules/review/service.ts:64` で接続DBのQUEUED/RUNNINGを一括FAILEDにする。運用DBを共有してブラウザテストを開始すると、運用中のレビューに干渉する。またMarkdown保存の直列化はプロセス内だけである。
- 対応: E2E専用DB・専用保存先を用意し、運用環境の値を使った場合はテストを拒否する。integrationの専用DBを併用する場合も、同時実行や初期化による衝突を避ける。
- 完了条件: テスト前後で運用DB・Markdown・進行中レビューが不変。運用データを扱うNodeプロセスは1つに固定する。

## 継続運用を始める際に整備する項目

### 5. 常駐・再起動・配置手順

- `docker-compose.yml` にあるのはDBとテストDBで、restart policyはない。Nodeは `npm start` で起動する構成。リポジトリにはサービス登録の手順がない。
- PCならスリープ・再起動後、通常サーバーならプロセス異常終了後に、DB→Node→入口の順で復旧できるようにする。単一プロセスの制約を守る。
- 作業ディレクトリ・Node 24・保存先の絶対パス・実行ユーザーとファイル権限を固定する。現状はstatic配信や保存先に相対パスがある。
- 完了条件: ホスト再起動後に既存データを読み書きでき、中断ReviewのFAILED表示・再実行を確認する。更新時の停止、migration、起動、復旧手順を記録する。

### 6. Review受付の重複抑止・待ち行列上限・総時間制限

- `modules/review/service.ts:23,65,83` は全Reviewを1本のPromise列で実行し、受付件数の上限と同一Revision/typeの進行中重複拒否がない。UIのボタン制御は別タブやAPIからの追加を防がない。
- `REVIEW_TIMEOUT_MS` はProviderの個々の呼び出しに適用され、Review全体の制限ではない。主張ごとに資料範囲を辿るため、1件のReviewで複数回のLLM・検索呼び出しが起きる。
- 対応: サーバー側の重複拒否、受付上限、Review全体の時間上限と失敗状態の確定を追加する。初期運用では利用量・所要時間を記録して上限を決める。
- 完了条件: 別タブからの連続受付やProvider/DB障害でも、キューが無制限に増えず、後続Reviewが長期間止まらない。

### 7. 障害を追えるログと保存領域の確認

- `server/api.ts` は想定外エラーを500へ変換するが、原因をサーバーログへ記録していない。`reviewQueue` の末尾catchもエラーを記録しない。
- `/api/health` はDB接続のみ確認し、Markdown保存先の権限・容量・書込み可否は確認しない。
- 対応: request/review IDと原因を秘密情報・本文を除いて記録し、ログ保存先・ローテーションを決める。DB、保存先、空き容量、FAILED Reviewを確認する手順を用意する。
- 完了条件: 保存先権限エラー・DB停止・Provider失敗を、ユーザー表示と管理側ログで追跡できる。

### 8. 配置先で使う実Providerの確認

- 過去の記録ではローカルCodex実接続は成功、OpenAI APIは契約テストのみ。今回、実Providerの呼び出しは行っていない。
- 実際のサービス実行ユーザー・環境で、採用Providerの認証、検索、資料取得、Review完了を確認する。ローカル開発ユーザーでの成功を別サーバーやサービスユーザーに引き継いだとはみなさない。
- 完了条件: 配置先で人間が書いた検証用ノートをReviewし、Evidence、Revision固定、本文不変、失敗後の再実行を確認する。使わないProviderの実接続は開始条件にしない。

## 運用後でもよい項目

- Editor chunkの500 kB超警告への対応。今回のbuildは成功しており、直ちに起動を妨げない。
- PDF・圧縮応答対応、一覧のページング、履歴の保持方針は利用資料・蓄積量を見て判断する。
- 学習効果の5仮説は未評価。運用開始を待つ条件ではなく、`learning-evaluation.md` に従って初期利用時に評価する。
- 認証機能の内製、複数Replica、Git同期等のScope外開発は追加しない。

## 今回の検証結果

| 項目 | 結果 |
| --- | --- |
| lint / typecheck | 成功 |
| unit | 70件成功 |
| integration | 専用TEST_DATABASE_URLを使う既存テスト31件成功 |
| production build | 成功。Editor chunk 690.45 kBの警告あり |
| `npm audit --omit=dev` | 検出0件。対象はproduction依存、調査時点の結果 |
| GitHub | 未完了Issue 0件。対象commitのCI成功 |
| API境界の追加調査 | 模擬DBで別Originのtext/plain POSTが201となることを確認 |
| browser verification | 今回未実行。既存設定が運用/開発DBを共有するため。過去記録ではChromium 13件成功 |
| 公開経路・バックアップ復元・再起動・実Provider | 今回未検証 |

CI: https://github.com/taiseimiyaji/kakudo/actions/runs/35207663454

進める順序は、CSRF対策とテスト分離 → バックアップ復元 → 常駐・ログ・Review制限 → 配置先Provider確認 → アクセス制御付き公開経路の検証とする。ローカル限定の初期利用なら公開経路の作業は後でよい。
