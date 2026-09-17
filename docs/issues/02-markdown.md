## 目的

学習者がOAuth Nodeへ複数のノートを関連付け、自分でMarkdownを書いて通常の `.md` として保存できるようにする。
Source of Truth: `docs/poc-spec.md` §6, 10–12, 17–18, 35–38, 45, 50。

## 実装範囲

- `documents`, `document_nodes` schema / migration。NodeとDocumentを分離し、Workspace境界とpathの一意性を保証。
- ContentStorageのread / write / delete / existsとLocalFileSystemStorage。Document Serviceからfsを直接呼ばない。
- `workspace-data/<workspace>/docs/**/*.md`へ実体を保存。path traversal、絶対path、symlink経由のroot逸脱を拒否し、安全なatomic writeを行う。
- Document CRUD REST（§38のGET / POST / PUTを含む）とNodeからのノート作成・選択。
- CodeMirror 6、remark / rehypeによるPreview。Raw HTML / 危険URLはsanitize。AI補完は実装しない。
- 最小Front Matter（id / title / tags）の保持、改行・コード・既存Markdownのfidelityを維持。
- 未保存変更と保存失敗を明示し、DBとfileの片側失敗を回復可能にする。

## 受け入れ条件

- [ ] OAuth Nodeから複数Documentを作成でき、DBのpathが実際の `.md` を指す。
- [ ] 手入力・保存・再読込でMarkdown本文が一致し、Previewが表示される。
- [ ] Nodeを削除しても学習ノートの扱いが明確で、意図せず本文を消さない。
- [ ] DBだけに本文を保存しない。Storage差し替えが可能。

## 検証

- [ ] lint / typecheck
- [ ] unit: Storageの境界、Markdown round-trip、Preview sanitize
- [ ] integration: REST→Document Service→DB / 一時ディレクトリの実 `.md`、失敗時整合性
- [ ] browser: Node→Document作成→手入力→Preview→保存→再読込

Revisionは§50の最終順序に従ってSources後の専用Issueで実装し、それまでReviewは有効にしない。本文は人間が書く。

## 依存関係

前提: #1 の完了。実装順序を維持する。

## Architecture update (2026-09-17)

Hono + Node.js is confirmed. Use REST APIs under `server/`, React SPA under `client/`, and domain services under `modules/`. Vite builds the SPA; Hono serves the production SPA and API on one origin. Support both a local host behind Cloudflare Tunnel and a conventional server; Cloudflare Workers is not required. TanStack Router was confirmed by the user on 2026-09-17. See `docs/architecture.md` and the updated `docs/poc-spec.md`.
