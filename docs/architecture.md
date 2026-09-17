# 技術選定と実行構成

2026-09-17、ユーザーとの協議で **Honoを採用**。
本書は当初仕様§35 / §36 / §43のNext.js指定に優先する。プロダクトの原則と機能Scopeは変更しない。

## 確定事項

| 領域 | 選択 |
| --- | --- |
| Backend | Hono + Node.js 24、REST API |
| Frontend | ReactのSPA。Viteで開発・build |
| 配置 | PC + Cloudflare Tunnel、または通常サーバー |
| 本番配信 | Honoがbuild済みSPAとAPIを同一originで提供 |
| DB | 既存のPostgreSQL / Drizzle構成を維持 |
| Content | ローカルfilesystem上のMarkdown。ContentStorageは後続Issueで実装 |

Honoの採用はユーザーが明示的に確定。ViteはNext.jsを外したReact SPAのbuild / 開発環境として採用する。
2026-09-17にユーザー指定でTanStack Routerを採用。TanStack StartとReact Routerは導入しない。

## 実行時の構造

```text
ブラウザ → Tunnel またはサーバー側の入口
                    ↓
             Hono / Node.js
             ├── /api/*       REST API → modules → PostgreSQL / ContentStorage
             └── /、/workspaces/default、/assets/* → build済みReact SPA
```

Cloudflare Tunnelは外部からの入口で、コードの実行先はPCまたはサーバー。
Cloudflare Workers / Pages / D1 / R2を前提にしない。クラウドアカウントやTunnelをこの変更で作成・公開しない。

開発時はVite（43170）からHono（標準43171）へ `/api` をproxyする。
本番は `npm run build` → `npm start` でHonoのみ起動。Viteの開発サーバーは不要。
標準bindは127.0.0.1。HOST / PORTでサーバーの配置に合わせて変更する。

## データと責務

- `client/`: ブラウザ用React。DB / fs / server secretをimportしない。
- `server/`: Hono routeとHTTP / static配信。Domain Logicはmodulesへ委譲。
- `shared/`: ブラウザへ公開できるAPI schema / 型のみ。Workspace APIの日時はISO 8601文字列。
- `modules/`: Domain Service。既存のWorkspace service / Seederを継続利用。
- `db/`: schema / client / migration。buildでは接続しない。
- `.local/postgres/`: 開発DBの永続データ。
- `workspace-data/`: 学習者のMarkdown正本。サーバー配置時はそのサーバー上のファイルとなり、PC同期はPoC外。

秘密の環境変数にVITE_ prefixを付けない。APIの未定義パスはJSON 404を返し、SPA HTMLにfallbackしない。
本番の静的配信対象はdist/clientに限定し、DB・学習データ・.envを配信しない。

## 選定理由

フロントとバックでTypeScriptのAPI契約とMarkdown処理を共有しやすくし、PoCでの仕様変更に対応する。
Goは今回採用しない。Honoの採用理由はWorkersへの配置や性能の優劣ではない。

## 参考

- [Hono Node.js adapter / static配信](https://hono.dev/docs/getting-started/nodejs)
- [Vite development server / proxy](https://vite.dev/config/server-options)
- [Vite build](https://vite.dev/config/build-options)
