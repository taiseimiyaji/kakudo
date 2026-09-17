## 目的

人間が定義したObjectivesに対するCoverageと説明のLogic / Clarityを確認し、答えを与えず問いかけで思考を支える。
Source of Truth: `docs/poc-spec.md` §7–8, 28–29, 39–40, 43, 48, 50。

## 実装範囲

- ReviewProvider.reviewCoverage / reviewLogicをpipelineへ接続し、Check Coverage / Check Logic / FULLを実装。
- CoverageはCovered / Partially Covered / Not Covered。対象ObjectivesとReview時点の内容を固定して追跡可能にする。
- Logic / Clarity Findingは飛躍・不足を説明し、guidingQuestionを返す。正解文・置換文は返さない。
- Objectivesが未設定、複数NodeにDocumentが関連する場合の対象選択を明確化。AIがObjectivesを補完しない。
- Reviewer-only policy / strict schemaを実Providerにも適用。
- UIにObjective単位の判定と問い、Evidenceを表示。

## 受け入れ条件

- [ ] OAuthのユーザー定義4 Objectivesに対し3段階のCoverageが表示される。
- [ ] 未記載のPKCEに対して説明本文や回答を生成しない。
- [ ] 「Cookieを使うのでSession認証は安全」等の飛躍をFindingで示す。
- [ ] FULL実行でも本文を変更せず、Fact / Source / Logic / Coverageを同じRevisionへ固定する。

## 検証

- [ ] lint / typecheck
- [ ] unit: Coverage 3状態、Objective未設定、strict schemaと禁止output
- [ ] integration: Mock ProviderでLOGIC / COVERAGE / FULL、Objective対象の保持
- [ ] browser: Objectives手編集→Review→Coverage / Logic表示→人間による修正

## 依存関係

前提: #8 の完了。実装順序を維持する。

## Architecture update (2026-09-17)

Hono + Node.js is confirmed. Use REST APIs under `server/`, React SPA under `client/`, and domain services under `modules/`. Vite builds the SPA; Hono serves the production SPA and API on one origin. Support both a local host behind Cloudflare Tunnel and a conventional server; Cloudflare Workers is not required. Router library selection remains pending user discussion. See `docs/architecture.md` and the updated `docs/poc-spec.md`.
