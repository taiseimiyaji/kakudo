## 目的

Document保存時に内容のSHA-256とsnapshotを保存し、後続Reviewが特定内容に固定される基盤を作る。
Source of Truth: `docs/poc-spec.md` §19–21, 32, 37, 45–46, 50。

## 実装範囲

- `document_revisions`: id / documentId / contentHash / contentSnapshot / createdAt。
- ContentStorage保存→SHA-256→Revision作成。本文のHashとSnapshotが必ず一致する。
- 直前と同内容の保存ではRevisionを増やさない。A→B→Aへの復帰を含む履歴・current Revisionの意味を明確にする。
- DBとfileの失敗・同時保存の扱いを定義し、保存失敗を成功と表示しない。
- Reviewで利用するRevision lookupとcurrent Revision比較をDomain Serviceに用意。

## 受け入れ条件

- [ ] Document初回保存・変更保存でRevisionが作成される。
- [ ] 同一内容の再保存で不要なRevisionが増えない。
- [ ] 過去Snapshotは後の本文編集で変化しない。
- [ ] 競合 / 失敗でfile・Hash・Snapshotの不一致を黙って残さない。

## 検証

- [ ] lint / typecheck
- [ ] unit: SHA-256、同内容判定、A→B→A、staleness比較
- [ ] integration: 保存→Revision永続化、file/DB失敗、同時保存
- [ ] browser: 保存→再保存→変更→再読込でRevisionと本文を確認

§43はRevisionをPhase 3に含むが、詳細な最終指示§50を優先してSources後・Fact Check前に実施する。

## 依存関係

前提: #4 の完了。実装順序を維持する。

## Architecture update (2026-09-17)

Hono + Node.js is confirmed. Use REST APIs under `server/`, React SPA under `client/`, and domain services under `modules/`. Vite builds the SPA; Hono serves the production SPA and API on one origin. Support both a local host behind Cloudflare Tunnel and a conventional server; Cloudflare Workers is not required. Router library selection remains pending user discussion. See `docs/architecture.md` and the updated `docs/poc-spec.md`.
