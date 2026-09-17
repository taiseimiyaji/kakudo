## 目的

Revisionに固定したFact Check / Source Verification pipelineを実装し、問題点と根拠をFindingとして永続化する。
Source of Truth: `docs/poc-spec.md` §20–27, 30, 37–41, 45–46, 50。

## 実装範囲

- `review_runs`, `review_findings`, `finding_evidence` とFK制約。documentIdとrevisionIdの不一致を拒否。
- POST /api/documents/:id/reviews とGET /api/reviews/:id。QUEUED / RUNNING / COMPLETED / FAILEDと失敗理由を扱う。
- Claim Extraction→Classification→Evidence Retrieval→Verification→Findingの段階を明示。
- Evidence探索順はDocument→Node→Workspace→Web Search。登録資料優先、一次資料優先、実際に使った出典URL・title・excerpt・sourceType・accessedAtを保存。
- Web Searchもadapter化してテストはfixtureで完結。資料取得はSSRF対策済みFetcherのみ。
- SUPPORTEDは通常非表示。根拠不足を断定的な誤りと扱わない。
- QuoteとSourceを照合しVERIFIED / PARTIAL_MATCH / NOT_FOUND / UNAVAILABLEを記録。取得不能をINCORRECTとしない。
- 学習者がReview / Check Facts / Check Sourcesを起動する最小UIと処理statusを接続。
- Mockでの結果はMockと明示。実モデルと実検索の設定・実行手順もREADMEへ追加。

## 受け入れ条件

- [ ] 誤った事実主張へのReviewでFindingとEvidence URLが返る。
- [ ] ReviewRunは実行開始時のRevisionに固定され、処理中の編集で対象が変わらない。
- [ ] 登録資料が先に使われる。根拠URLを捏造せず、取得不能はUNAVAILABLE。
- [ ] Provider失敗がFAILEDとなり、本文は変更されない。

## 検証

- [ ] lint / typecheck
- [ ] unit: 探索順・verdict→Finding・引用照合4状態
- [ ] integration: Mock Provider / Search / Fetcher→実DBのReview→Finding→Evidence、Revision FK、失敗と再実行
- [ ] browser: Review起動・状態・結果、Review前後で本文不変

PoCにVector DB / Generic RAG / 本文生成を追加しない。

## 依存関係

前提: #6 の完了。実装順序を維持する。

## Architecture update (2026-09-17)

Hono + Node.js is confirmed. Use REST APIs under `server/`, React SPA under `client/`, and domain services under `modules/`. Vite builds the SPA; Hono serves the production SPA and API on one origin. Support both a local host behind Cloudflare Tunnel and a conventional server; Cloudflare Workers is not required. TanStack Router was confirmed by the user on 2026-09-17. See `docs/architecture.md` and the updated `docs/poc-spec.md`.
