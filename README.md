# Kakudo（カクドー）

**書いて、辿って、確かめる。 / Write. Trace. Verify.**

学習ロードマップ、Markdownノート、参考資料・引用、AIレビューをつなぐKnowledge Workspace。
Markdownを書くのは人間。AIは問題点・根拠・考えるための問いを提示します。

## PoCでできること

- Knowledge MapのRoadmap / Node / Edge編集、位置保存、学習状態・人間が定義するObjectives。接続点は上下左右から選択・ドラッグでき、既存接続の出口・入口も編集できます。
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

アプリ内認証はPoCの対象外です。外部からの利用は入口側のアクセス制御と組み合わせます。[公開設定・受け入れ手順](docs/public-access.md)を用意していますが、Tunnelの公開設定・HTTPS実経路・恒久配置先へのdeployは未実施です。

更新APIは `ALLOWED_ORIGINS` に列挙したOriginのみ許可します（既定は `http://127.0.0.1:43170,http://127.0.0.1:43171`）。公開時はブラウザが使うHTTPS originを設定し、パス・末尾スラッシュは含めません。Host / Forwardedヘッダーから許可先を推測しません。Originなし・null・許可外・cross-siteは403、本文付きの非JSONリクエストは415です。スクリプトからの更新も許可Originヘッダーと、本文があれば `Content-Type: application/json` が必要です。これはCSRF対策であり、入口のアクセス制御は別途必要です。

## データと保存

| 設定・保存先 | 既定値 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL `127.0.0.1:54329/kakudo` |
| PostgreSQL永続データ | `.local/postgres/` |
| `CONTENT_STORAGE_ROOT` | `./workspace-data` |
| Markdown正本 | `workspace-data/default/docs/` |
| 接続設定 | `.env`（git管理外） |

学習項目の詳細から空のノートを作り、自分で本文を書きます。本文またはノート名に変更があれば、1秒ごとに自動保存します。保存中の追加入力は次の保存対象となり、変更がなければ通信しません。保存失敗時は自動保存を停止して入力を保持し、「保存を再試行」から再開できます。競合時は別の保存内容を自動で上書きしません。

本文があるノートは「閲覧」、空のノートは「編集」で開き、いつでも切り替えられます。編集時のプレビューは表示・非表示を選択でき、設定をブラウザに記憶します。モード切替でも編集中の本文とUndo履歴を保持します。Front Matterを含むMarkdownを保持し、Node削除後もDocumentはDocuments一覧に残ります。PreviewはRaw HTML・画像自動取得を無効にしています。

引用・URL貼付けのダイアログを開いている間は、本文が保存済みでも画面を離れる前に確認します。離脱を取り消すと入力を保持し、ダイアログのキャンセル後は通常の保存状態に応じて確認します。

資料など本文外の操作からTab / Shift+Tabで本文へ戻ると、選択を保ったまま入力位置が見えるように最小限スクロールします。マウス操作、「閲覧／編集」の復帰、レビューの「本文で確認」は、それぞれの操作で指定した位置を保ちます。

競合や保存結果を受け取れなかった場合は、入力を保持したまま「最新の保存内容を確認」で保存済み本文・名前を確認できます。「現在の入力と比べる」で現在の本文・名前と取得時の保存内容を並べられます。関連は確定済みの情報だけを比較し、未保存の関連選択は「関連を保存」で別に確定します。比較の開閉は書き込みを行いません。「確認した内容を基準に再試行」の後も自動保存は再開せず、明示的に「保存を再試行」を押します。外部で編集したMarkdownを再読込した場合も「保存」でレビュー対象の保存版を記録できます。

ContentStorage経由のatomic renameとDBの補償journalで保存し、中断した保存は次のアクセス時に回復します。前回Hashを照合して外部編集の上書きを防ぎます。**1つのNode.jsプロセスがDB・保存先を所有する構成**です。複数レプリカによる同時書込みは対象外です。

作成・保存・引用追加時にRevisionを記録。同じ本文なら直前のRevisionを再利用し、A→B→Aは3つのRevisionです。タイトルのみの変更では増えません。DBとMarkdownの両方を一緒にバックアップしてください。サーバーのファイルをPCへ同期する機能は含みません。

バックアップ・復元コマンドと世代管理・切戻し手順は [運用手順](docs/operations.md) を参照してください。PostgreSQL 17のclient toolsが必要です（PATH外では `PG_BIN_DIR` を設定）。integrationも実pg_dump/pg_restoreで専用DBへの復元を検証します。

`docker compose down` でも `.local/postgres/` は残ります。Schema変更時は `npm run db:generate`、適用は `npm run db:migrate`、Seedは `npm run db:seed`。

## AI Reviewerの設定

| 接続先 | `.env` |
| --- | --- |
| Codex SDK（初期設定） | `REVIEW_PROVIDER=codex`。任意で `CODEX_MODEL` / `CODEX_PATH` |
| OpenAI API | `REVIEW_PROVIDER=openai`、`OPENAI_MODEL`、`OPENAI_API_KEY` |
| オフラインMock | `REVIEW_PROVIDER=mock` |

共通timeoutは `REVIEW_TIMEOUT_MS=120000`。キーは `.env` に置き、ブラウザへ公開される `VITE_` 変数には入れません。

`REVIEW_TIMEOUT_MS` は1回のProvider呼び出しの上限です。Review全体の実行期限は `REVIEW_RUN_TIMEOUT_MS=600000`、待機中＋実行中の受付上限は `REVIEW_MAX_PENDING=10`。同じDocument/Revision/typeの進行中Reviewは409、受付上限は429となり画面に理由を表示します。期限切れはFAILEDとなり、Provider・検索・取得へ中断を伝え、遅れて返った結果を保存しません。DB queryは15秒でtimeoutし、FAILED記録時にDBが停止していた場合は復旧後に再試行します。待ち時間は実行期限に含まず、1件ずつ処理します。

Codex Reviewerは一時作業ディレクトリ、read-only sandboxで動き、shell / MCP / plugin / hook / web searchを無効にします。本文の保存先を渡しません。認証・標準ログ保存はローカルCodex設定に従います。OpenAIはResponses APIのstrict JSON schema、toolsなし、store=falseです。両Adapterとも置換文などのフィールドを出力Schemaから除外し、未知フィールドを拒否します。自由記述の説明が方針に従うことまでSchemaのみで保証するものではありません。

保存後にReviewを起動すると、Revision・Objectives・引用・資料関連を固定します。進行中の編集は対象を変えません。再起動で中断したReviewはFAILEDとなり、再実行できます。本文・Revision・関連Objectivesが変わるとOutdatedとなり、古い本文位置はハイライトしません。Resolve / Dismiss / Reopenは指摘状態だけを変更します。

Coverageは人間のObjectivesだけをCovered / Partially Covered / Not Coveredで評価します。未設定なら評価しません。Logicは論理の飛躍や説明不足を指摘し、問いを提示します。Mockは保守的なデモ判定で、画面に明示します。

### 確認する観点を選ぶ

本文を保存し、ノート本文の下にある「レビュー」を開いて、確かめたい観点を選びます。

| 画面の操作 | 確認する範囲 |
| --- | --- |
| 全体を確認 | 事実・引用と出典・論理・人間が定義した学習目標との対応 |
| 事実を確認 | 本文から抽出した主張と、根拠資料との対応 |
| 出典を確認 | 引用Dialogで登録した引用と、引用元の該当箇所との照合 |
| 論理を確認 | 論理の飛躍や説明不足、考えるための問い |
| 学習目標を確認 | 関連する学習項目に人間が設定した目標との対応。目標未設定なら評価しない |

全種類で本文は60,000文字以内です。「事実を確認」「全体を確認」は、抽出された主張が20件までです。主張数は抽出結果で決まり、文字数だけでは上限内か判断できません。20件を超えると失敗し、一部だけを確認して完了扱いにはしません。

主張数の制限に達した場合は、人間が対象を短いノートに分けて確認するか、確認したい観点に応じて「論理を確認」「学習目標を確認」を選べます。これらは事実・出典の確認の代わりにはなりません。

指摘の「本文で確認」で該当箇所へ戻り、自分で本文を修正します。変更後は過去のレビューとして表示されるため、保存してから「もう一度レビュー」で新しい保存版を確認します。AIが本文を修正・置換する操作はありません。

### 根拠の探索と取得

Document → Node → Workspace → Web Searchの順序です。登録資料は各範囲12件まで（範囲内は一次資料優先）、検索は3件まで。探索制限・取得不能を結果に表示します。

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
