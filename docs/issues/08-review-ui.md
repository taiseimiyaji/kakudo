## 目的

GitHub Review風に問題点・根拠・問いを示し、学習者自身が判断・修正するUIを提供する。
Source of Truth: `docs/poc-spec.md` §22–23, 31–34, 45–46, 50。

## 実装範囲

- Finding一覧：category / severity / targetText / explanation / guidingQuestion、Evidenceリンクとexcerpt。
- CodeMirror上のoffset highlightとFindingの選択連動。offsetは対象Revisionに限定し、編集後の本文を誤って指さない。
- Resolve / Dismissとstatus永続化API（OPEN / RESOLVED / DISMISSED）。操作で本文を変更しない。
- Outdated Reviewの判定・警告・Review Again。保存後だけでなく編集中の内容差分も考慮。
- 再Reviewで新Revisionを明確に指定し、過去結果を保持。
- Node Details / MapへDocs・Sources・未解決Finding件数を実データで反映。
- Review履歴・実行中・失敗・Findingなし・根拠不足の状態を区別する。

## 受け入れ条件

- [ ] 対象文章からFindingと出典へ移動できる。
- [ ] Resolve / Dismissが再読込後も保持され、本文は変わらない。
- [ ] Revision AへのReview後に本文を変更するとOutdated Reviewになる。
- [ ] Review Againは現在内容を保存したRevisionに紐付き、古いoffsetは適用しない。
- [ ] Accept Fix / Apply / Rewriteなど本文適用機能が存在しない。

## 検証

- [ ] lint / typecheck
- [ ] unit: staleness、offset境界、status遷移、件数集計
- [ ] integration: status API、Revision固定、再Reviewと履歴
- [ ] browser: Review→Evidence→手修正→Outdated Review→Review Again、Resolve / Dismiss

## 依存関係

前提: #7 の完了。実装順序を維持する。

## Architecture update (2026-09-17)

Hono + Node.js is confirmed. Use REST APIs under `server/`, React SPA under `client/`, and domain services under `modules/`. Vite builds the SPA; Hono serves the production SPA and API on one origin. Support both a local host behind Cloudflare Tunnel and a conventional server; Cloudflare Workers is not required. Router library selection remains pending user discussion. See `docs/architecture.md` and the updated `docs/poc-spec.md`.
