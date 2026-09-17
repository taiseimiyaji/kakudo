## 目的

Node / Document / Workspaceの参考資料を登録し、SSRF対策を施した共通取得経路を提供する。
Source of Truth: `docs/poc-spec.md` §16, 23, 27, 30, 37–38, 41, 44–46, 50。

## 実装範囲

- `resources`, `node_resources`, `document_resources` とREST API、Resource一覧・登録・関連付けUI。
- url / title / type（WEB, OFFICIAL_DOC, RFC, PAPER, OTHER）/ createdAtを保持。
- Paste PolicyのURL-only Dialogを保存APIへ接続。
- RFC 6749 / RFC 7636など仕様§44の参考URLを冪等seedへ追加。本文やノートは生成しない。
- 取得は共通Resource Fetcherだけを経由する。http(s)以外、localhost、loopback / private / link-local / reserved IPv4・IPv6（IPv4-mapped IPv6含む）を拒否。
- DNSの全A / AAAAを検証し、検証済みIPへ接続を固定してDNS rebindingを防ぐ。Host / TLS検証を維持。
- RedirectごとにURL / DNS / IP再検証、redirect数上限、request timeout、streaming response size上限、HTML sanitize。
- 取得不能をエラーとして区別し、内容が誤りだと判定しない。URL登録だけで未防御のfetchを行わない。

## 受け入れ条件

- [ ] NodeとDocumentのどちらにも資料URLを登録・表示・関連付けできる。
- [ ] URL Paste経由で登録できる。
- [ ] private IP、redirect-to-private、DNS rebinding、IPv6経由でも取得不能。
- [ ] timeout / 過大response / 悪性HTMLが安全に処理される。

## 検証

- [ ] lint / typecheck
- [ ] unit: URL/IP分類、redirect、DNS検証・接続先固定、sanitize
- [ ] integration: Mock resolver / transportによるrebinding・private redirect・timeout・size limit、Resource関連DB制約
- [ ] browser: Node / Document登録、URL Paste、エラー表示、出典リンク

Vector DB / Embedding / Generic RAGは実装しない。外部LLM不要でテストする。

## 依存関係

前提: #3 の完了。実装順序を維持する。

## Architecture update (2026-09-17)

Hono + Node.js is confirmed. Use REST APIs under `server/`, React SPA under `client/`, and domain services under `modules/`. Vite builds the SPA; Hono serves the production SPA and API on one origin. Support both a local host behind Cloudflare Tunnel and a conventional server; Cloudflare Workers is not required. TanStack Router was confirmed by the user on 2026-09-17. See `docs/architecture.md` and the updated `docs/poc-spec.md`.
