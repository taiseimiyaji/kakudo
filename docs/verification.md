# Hono移行・Phase 1 検証記録

実施日: 2026-09-17（JST）。対象は初期セットアップのHono移行。PoC全機能の完成を意味しない。

## 変更

- Next.jsとeslint-config-next、その設定・旧app/・build生成物を削除。
- Hono + Node.jsのREST API、React SPA + Viteへ移行。
- Workspace service / PostgreSQL / Drizzle / Seederと既存データを維持。
- API schemaをshared/に置き、ブラウザがWorkspace日時のISO形式を含めて検証。
- 本番はbuild済みSPAとAPIをHonoから同一originで配信。開発はViteのAPI proxyを使用。
- README / AGENTS / 現行仕様 / 実装計画 / GitHub Issue #1〜#10を更新。
- 当初仕様はpoc-spec-original.mdに保存。Routerは未選定として明示。

## 検証結果

Node.js 24.13.0、npm 11.6.2、PostgreSQL 17。

| 検証 | 結果 |
| --- | --- |
| `npm run lint` | 成功 |
| `npm run typecheck` | 成功 |
| `npm run test:unit` | 9件成功 |
| `npm run test:integration` | 実PostgreSQLで3件成功 |
| `npm run build` | Vite SPA / Node.js serverのbuild成功 |
| `npm run test:browser` | 本番Honoサーバー上のChromiumで5件成功 |
| `npm run check` | 上記一式が成功 |
| `npm audit` | 0 vulnerabilities |
| `npm ls next eslint-config-next` | 両方なし |
| Docker Compose | 開発DB / テストDBともhealthy |

API unitは404と503を区別し、未知のAPIへHTMLを返さず、DBエラー詳細を漏らさないことを検証。
Integrationはseedの冪等性・編集保持・並行実行、DBからのWorkspace取得を既存テストに加え、Hono経由のDB health / Workspace取得 / schema適合を検証。
BrowserはWorkspace遷移、DB health、狭いviewport、deep link / reload、.env非公開、未登録 / API障害表示を検証。
開発用ViteからHono APIへのproxyもBrowserスキルで画面を操作して確認。

## 制約・稼働状態

- Map / Markdown Editor / Paste / Sources / Revision / Reviewは後続Issue。学習ノートは生成していない。
- Node.jsとfilesystemを使用する構成。WorkersやTunnelアカウントの作成・公開は行っていない。
- 本番ビルドをローカルで検証済み。実サーバーへのdeployとCloudflare Tunnel経由の接続は未実施。
- GitHub Actionsは同じnpm scriptsを実行する構成。リモートCI結果はPRのChecksで確認する。
- 開発UI: http://127.0.0.1:43170 、Hono API: http://127.0.0.1:43171 。
- 開発サーバーは所有Herdr session `codex-kakudo-foundation-0917` / pane `w1:p1` で起動中。
- DBも起動中。停止する場合は `docker compose --profile test down`。開発DBのbind mountは残る。

## PR準備時のポート変更

使用中のポートを調べ、開発UI 43170、Hono API / 本番 43171、ブラウザテスト 43172に変更。変更時点で3ポートのbind可能性を確認した。設定・環境変数雛形・起動手順も更新。
