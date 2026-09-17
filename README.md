# Kakudo（カクドー）

**書いて、辿って、確かめる。 / Write. Trace. Verify.**

学習ロードマップ、Markdownノート、参考資料・引用、AIレビューをつなぐKnowledge Workspace。
Markdownを書くのは人間。AIは問題点・根拠・考えるための問いを提示します。

## 仕様と現在の実装

- [PoC仕様](docs/poc-spec.md) / [当初の提示仕様](docs/poc-spec-original.md)
- [確定した技術選定：Hono + Node.js / React SPA](docs/architecture.md)
- [実装順序とGitHub Issues](docs/implementation-plan.md)
- [実装エージェントのルール](AGENTS.md) / [検証記録](docs/verification.md)

現在はPhase 1。Hono REST API、React SPA、Vite、PostgreSQL、Drizzle migration、冪等Workspace Seeder、起動画面、DB接続確認、テストとCIを実装しています。
Knowledge Map / Editor / Resources / AI Reviewは後続Issueの対象です。Router libraryは未選定です。

## 開発

Node.js 24、npm、Docker Composeを使用します。LLM APIキーは不要です。

```sh
cp .env.example .env
npm ci
docker compose up -d --wait db
npm run db:setup
npm run dev
```

http://127.0.0.1:43170 から「Workspaceを開く」を選択してください。
`npm run dev` はVite（43170）とHono（標準43171）を起動します。Ctrl+Cで両方停止します。
Viteは `/api` をHonoへ転送するため、ブラウザ側は相対URLでアクセスします。

| API | 内容 |
| --- | --- |
| GET /api/health | DB接続を確認。200または503 |
| GET /api/workspaces/:id | WorkspaceとISO形式のcreatedAt。未登録404、接続不能503 |

## 本番・ローカル常用

同じ手順をPCでも通常サーバーでも使用できます。

```sh
npm ci
npm run db:setup
npm run build
npm start
```

標準URLは http://127.0.0.1:43171 。Honoが `dist/client` のSPAとAPIを同じoriginから配信します。
`HOST`（標準127.0.0.1）/ `PORT`（標準43171）でlisten先を指定できます。
例えば別ポートで起動する場合は `PORT=8080 npm start`。
PostgreSQLの接続先は `DATABASE_URL`、Markdown保存先は `CONTENT_STORAGE_ROOT` で設定します（ContentStorage実装は後続Issue）。

Cloudflare Tunnelを使う場合は、この本番HTTPサーバーをTunnelのoriginに指定します（標準では `http://127.0.0.1:43171`）。
Workersへのdeployは不要です。通常サーバーでも同じNodeアプリを起動し、入口のproxy等から転送します。
アプリ内認証はPoC外のため、外部からの利用は入口側のアクセス制御と組み合わせます。今回Tunnelの公開設定は行っていません。

## データ

- 開発PostgreSQL: `127.0.0.1:54329/kakudo`
- DB永続データ: `.local/postgres/`（git管理外のbind mount）
- Markdown: `workspace-data/default/docs/`（git管理外）
- 調査資料: `workspace-data/default/research/`
- 接続設定: `.env`（git管理外）、雛形 `.env.example`

`npm run db:setup` はmigrationとseedを順番に実行。再実行してもWorkspaceを重複作成せず、既存の名前を上書きしません。
現在のschemaはworkspacesのみ。学習ノート本文は生成しません。

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
```

`docker compose down` で停止しても `.local/postgres/` は残ります。サーバーに置いたMarkdownはそのサーバーのファイルであり、PCへの同期は別機能です。

## 検証

```sh
docker compose --profile test up -d --wait
npm run db:setup
npx playwright install chromium
npm run check
```

`check` はlint / typecheck / unit / integration / production build / browserを順番に実行します。
ブラウザテストはbuild済みHonoアプリをポート43172で起動します。
個別コマンドは `npm run lint`、`npm run typecheck`、`npm run test:unit`、`npm run test:integration`、`npm run build`、`npm run test:browser`。

結合テストは `TEST_DATABASE_URL` の明示指定が必須。DB名が `_test` で終わり、開発DBと異なることを検証します。
ComposeのテストDBは `127.0.0.1:54330/kakudo_test` のtmpfs上に分離し、専用DB内のdefault Workspaceを作成・削除します。
GitHub Actionsでも独立した2つのPostgreSQL serviceで同じ検証を実行します。

## 構成

```text
client/              React SPA / HTML / CSS
server/              Hono REST API / Node.js起動 / SPA配信
shared/              API schema / 型（ブラウザへ公開可能なもののみ）
components/          各機能のUI
modules/             Domain Service / Workspace Seeder
db/                  Drizzle schema / client / migrations
scripts/             migrate / seed CLI
tests/               unit / integration / e2e
docs/                仕様 / 計画 / 技術選定 / 検証記録 / Issue本文
workspace-data/      Markdown正本の保存領域
dist/                build生成物（git管理外）
```

ComponentへDomain Logicを持ち込まずmodulesに分離します。ContentStorageとReviewProviderは対応Issueで導入します。
依存の正確なversionとnpm lockfileを保存。Drizzle Kitの推移依存esbuildは修正済み0.25系へoverrideしています。
