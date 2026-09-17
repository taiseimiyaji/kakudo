## 目的

概念（Learning Node）とノート（Document）を分離したKnowledge Mapを作り、学習順序をユーザー自身が定義できるようにする。
Source of Truth: `docs/poc-spec.md` §4–9, 33–38, 44–46, 50。

## 実装範囲

- `roadmaps`, `learning_nodes`, `roadmap_edges` のDrizzle schema / migration。Workspace外の関連付けを拒否する。
- Roadmap CRUD、Node CRUD、Edge作成・削除のREST API。§38の一覧にない削除などのCRUD endpointは一貫したREST規約で補う。
- Nodeの座標、説明、4種のstatus、ユーザー定義のlearningObjectives / guidingQuestionsを保存。
- EdgeはPREREQUISITE / PARENT / RELATED。存在しないNode・別Roadmapへの接続を拒否。
- React FlowによるExplorer / Knowledge Map / Node Details。ドラッグ後の座標を保存。
- §44のBackend Engineering、HTTP、Authentication、Session、Cookie、OAuth、Authorization Code、PKCE、DatabaseとOAuthの4 Objectivesを冪等seedに追加。ユーザーの変更は上書きしない。
- Docs / Sources / Reviewの件数表示は関連機能実装までは未実装と明示し、架空の値を表示しない。

## 受け入れ条件

- [ ] UIからAuthentication → OAuth → PKCEを作成・接続・保存でき、リロードしても座標・接続・statusが残る。
- [ ] Roadmap / Nodeの編集・削除とEdge削除が永続化される。
- [ ] 人間がObjectives / Guiding Questionsを編集できる。AIでMapやObjectivesを生成しない。
- [ ] Seeder再実行で重複せず、ユーザー編集を維持する。

## 検証

- [ ] lint / typecheck
- [ ] unit: Node / Edgeの入力検証、関係の制約
- [ ] integration: RESTと実PostgreSQLのCRUD、workspace境界、seed冪等性
- [ ] browser: Map作成→接続→ドラッグ→リロード→編集→削除

Domain Logicはmodules/roadmapへ置く。本文生成・AI回答・Apply Fixは禁止。

## 依存関係

前提: Phase 1初期セットアップ（仕様保存、Hono + Node.js / React SPA / Vite / PostgreSQL / Drizzle / Workspace Seeder / CI）。

## Architecture update (2026-09-17)

Hono + Node.js is confirmed. Use REST APIs under `server/`, React SPA under `client/`, and domain services under `modules/`. Vite builds the SPA; Hono serves the production SPA and API on one origin. Support both a local host behind Cloudflare Tunnel and a conventional server; Cloudflare Workers is not required. Router library selection remains pending user discussion. See `docs/architecture.md` and the updated `docs/poc-spec.md`.

Before extending screen navigation, agree on the frontend router with the user; do not assume Next.js, TanStack Start, TanStack Router, or React Router.
