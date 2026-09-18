# Kakudo（カクドー）

**書いて、辿って、確かめる。 / Write. Trace. Verify.**

学習ロードマップ、Markdownノート、参考資料・引用、AIレビューをつなぐKnowledge Workspace。
Markdownを書くのは人間。AIは問題点・根拠・考えるための問いを提示します。

## PoCでできること

- Knowledge MapのRoadmap / Node / Edge編集、位置保存、学習状態・人間が定義するObjectives。
- Nodeと独立したDocument、CodeMirror 6によるMarkdown編集、Preview、実 `.md` ファイル保存。
- 通常Pasteは出典必須のQuote、URLのみはResource、Code Block内は直接Paste。
- Node / Document / Workspaceの資料管理、SSRF対策付き取得、引用元の照合。
- 保存時のSHA-256 / Revision、同一内容の重複抑制、外部編集との競合検出。
- Review / Check Facts / Check Sources / Check Logic / Check Coverage、根拠URL・問い・対象箇所の表示。
- Resolve / Dismiss / Reopen、履歴、本文やObjectives変更後のOutdated Review。

AIの本文生成・補完・Rewrite・修正文・自動適用機能はありません。

[PoC仕様](docs/poc-spec.md) / [技術選定](docs/architecture.md) / [実装計画](docs/implementation-plan.md) / [受け入れ検証](docs/verification/issue-10.md) / [学習体験の評価手順](docs/learning-evaluation.md)。当初仕様は[別途保存](docs/poc-spec-original.md)しています。

## 起動

Node.js 24、npm、Docker Composeを使用します。

```sh
cp .env.example .env
npm ci
docker compose up -d --wait db
npm run db:setup
npm run dev
```

http://127.0.0.1:43170 からWorkspaceを開きます。開発時はViteが43170、Honoが43171。Ctrl+Cで両方停止します。RouterはTanStack Routerです。

Backend Engineeringの8 Node、OAuthの4 Objectives、RFC 6749 / RFC 7636をseedします。学習ノートは作りません。Seedは繰り返し実行でき、既存のMap編集を上書きしません。

初期Reviewerは **ローカルCodex SDK** です。ローカルで `codex login` を済ませてください。APIキーは不要ですが、実レビューにはCodexの認証とネットワーク接続が必要です。外部LLMなしで試す場合は `.env` に `REVIEW_PROVIDER=mock` を設定します。

## 本番ビルド・Cloudflare Tunnel・通常サーバー

DBと `.env` を用意し、同じNodeアプリをPCでもサーバーでも起動できます。

```sh
npm ci
npm run db:setup
npm run build
npm start
```

Honoが http://127.0.0.1:43171 でSPAとREST APIを同じoriginから配信します。`HOST` / `PORT` で変更可能。Cloudflare TunnelのoriginもこのHTTPサーバーを指定します。**Cloudflare Workersは不要**です。通常サーバーでは入口のproxyから転送します。

アプリ内認証はPoCの対象外です。外部からの利用は入口側のアクセス制御と組み合わせます。Tunnelの公開設定・実サーバーへのdeployは未実施です。

更新APIは `ALLOWED_ORIGINS` に列挙したOriginのみ許可します（既定は `http://127.0.0.1:43170,http://127.0.0.1:43171`）。公開時はブラウザが使うHTTPS originを設定し、パス・末尾スラッシュは含めません。Host / Forwardedヘッダーから許可先を推測しません。Originなし・null・許可外・cross-siteは403、本文付きの非JSONリクエストは415です。スクリプトからの更新も許可Originヘッダーと、本文があれば `Content-Type: application/json` が必要です。これはCSRF対策であり、入口のアクセス制御は別途必要です。

## データと保存

| 設定・保存先 | 既定値 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL `127.0.0.1:54329/kakudo` |
| PostgreSQL永続データ | `.local/postgres/` |
| `CONTENT_STORAGE_ROOT` | `./workspace-data` |
| Markdown正本 | `workspace-data/default/docs/` |
| 接続設定 | `.env`（git管理外） |

Node Detailsから空のDocumentを作り、自分で本文を書いて保存します。Front Matterを含むMarkdownを保持し、Node削除後もDocumentはDocuments一覧に残ります。PreviewはRaw HTML・画像自動取得を無効にしています。

ContentStorage経由のatomic renameとDBの補償journalで保存し、中断した保存は次のアクセス時に回復します。前回Hashを照合して外部編集の上書きを防ぎます。**1つのNode.jsプロセスがDB・保存先を所有する構成**です。複数レプリカによる同時書込みは対象外です。

作成・保存・引用追加時にRevisionを記録。同じ本文なら直前のRevisionを再利用し、A→B→Aは3つのRevisionです。タイトルのみの変更では増えません。DBとMarkdownの両方を一緒にバックアップしてください。サーバーのファイルをPCへ同期する機能は含みません。

`docker compose down` でも `.local/postgres/` は残ります。Schema変更時は `npm run db:generate`、適用は `npm run db:migrate`、Seedは `npm run db:seed`。

## AI Reviewerの設定

| 接続先 | `.env` |
| --- | --- |
| Codex SDK（初期設定） | `REVIEW_PROVIDER=codex`。任意で `CODEX_MODEL` / `CODEX_PATH` |
| OpenAI API | `REVIEW_PROVIDER=openai`、`OPENAI_MODEL`、`OPENAI_API_KEY` |
| オフラインMock | `REVIEW_PROVIDER=mock` |

共通timeoutは `REVIEW_TIMEOUT_MS=120000`。キーは `.env` に置き、ブラウザへ公開される `VITE_` 変数には入れません。

Codex Reviewerは一時作業ディレクトリ、read-only sandboxで動き、shell / MCP / plugin / hook / web searchを無効にします。本文の保存先を渡しません。認証・標準ログ保存はローカルCodex設定に従います。OpenAIはResponses APIのstrict JSON schema、toolsなし、store=falseです。両Adapterとも置換文などのフィールドを出力Schemaから除外し、未知フィールドを拒否します。自由記述の説明が方針に従うことまでSchemaのみで保証するものではありません。

保存後にReviewを起動すると、Revision・Objectives・引用・資料関連を固定します。進行中の編集は対象を変えません。再起動で中断したReviewはFAILEDとなり、再実行できます。本文・Revision・関連Objectivesが変わるとOutdatedとなり、古い本文位置はハイライトしません。Resolve / Dismiss / Reopenは指摘状態だけを変更します。

Coverageは人間のObjectivesだけをCovered / Partially Covered / Not Coveredで評価します。未設定なら評価しません。Logicは論理の飛躍や説明不足を指摘し、問いを提示します。Mockは保守的なデモ判定で、画面に明示します。

### 根拠の探索と取得

Document → Node → Workspace → Web Searchの順序です。登録資料は各範囲12件まで（範囲内は一次資料優先）、検索は3件まで。探索制限・取得不能を結果に表示します。1回のReviewは60,000文字・主張20件以内です。

`SEARCH_PROVIDER` は既定でReviewerに追従し、codex / openai / mock / noneを指定できます。検索はURL探索用の別呼び出しです。Codex検索時だけweb searchと実行hostを有効にし、shell等は無効のままです。OpenAI検索はcitation annotationのURLだけを採用します。どちらもSSRF対策付きFetcherで再取得します。

FetcherはHTTP(S)標準ポート、公開IPのHTML / plain text / Markdownに対応。DNS全応答検証・接続IP固定、redirect再検証（5回）、10秒timeout、2 MB上限、HTML sanitizeを行います。PDF・圧縮応答は未対応。取得不能はUNAVAILABLEであり、誤りとは判定しません。登録だけでは通信しません。引用照合は、引用Dialogで登録され、対象Revisionに引用表記が残っているものが対象です。

MapのDocs / Sourcesは関連件数（資料は重複除外）。Review件数はDocumentごとの最新完了Reviewの未解決件数で、過去すべての累積ではありません。

## 検証

```sh
docker compose --profile test up -d --wait
npm run db:setup
npx playwright install chromium
npm run check
```

lint → typecheck → unit → 実PostgreSQL integration → build → Chromiumの順で実行します。Integrationは開発DBとは別の `TEST_DATABASE_URL`（DB名末尾 `_test` 必須）を使います。ComposeのテストDBは54330、tmpfs上に分離します。

Browserは `E2E_DATABASE_URL`（DB名末尾 `_e2e_test`）の専用DBを必須とし、開発・integrationと同名のDBを拒否します。ComposeのE2E用DBは54331です。`npm run test:browser` が専用DBのmigration・初期化・seed、一時Markdown保存先の作成、終了時のデータと一時保存先の削除を行います。E2E専用DBの内容は毎回消去されるため、学習データを入れないでください。DB advisory lockで同時実行を拒否します。

本番ビルドは43172、`E2E_DEV=1 npm run test:browser` はVite/APIを43173/43174で起動します。既存サーバーは再利用せず、ポート使用中なら失敗します。直接 `npx playwright test` は拒否します。通常テストはMockで外部LLM不要です。CIも開発・integration・E2Eを別DBに分離します。強制終了で残った一時directoryはプロセス停止を確認して削除できます。

実Providerの確認は設定後に明示して実行します。Codex SDKは実接続済み、OpenAI APIは認証未設定のため契約テストのみです。

```sh
npx tsx scripts/review-smoke.ts
npx tsx scripts/review-pipeline-smoke.ts
npx tsx scripts/learning-review-smoke.ts
```

最初と最後は仕様中の例を送信します。Pipeline smokeは検証用Documentを作成し、終了時に削除します。MockモードのRFC根拠はfixtureで、実取得と区別されます。

## 構成・範囲

`client/` はReact SPA、`server/` はHono API・配信、`shared/` は公開可能な型、`components/` はUI、`modules/` はDomain / Storage / Provider、`db/` はSchema / migration、`tests/` はunit / integration / e2eです。

Authentication、Team、Git連携、Vector DB、AI生成などは仕様どおり対象外。Editorを含む遅延読込chunkに500 kB超のbuild警告が残ります。PoC機能の検証は完了しましたが、学習効果の5仮説は利用者による評価が必要です。
