## 目的

Reviewer専用Provider境界とClaim Extraction / Classificationを作り、本文生成をOutput契約から排除する。
Source of Truth: `docs/poc-spec.md` §3, 22–26, 39–40, 46, 50。

## 実装範囲

- ReviewProvider interface（extractClaims / verifyClaim / reviewLogic / reviewCoverage）、Claim / ClaimVerification / EvidenceDocument / CoverageResult型。
- Promptと厳格なruntime output schemaで共通AI Policyを適用。unknown fieldsも拒否する。
- correctedText / replacementText / suggestedMarkdown / patchを許可しない。ProviderにContentStorageへの書込み権限を渡さない。
- Markdown ASTでCode Block / Quote Block / Front Matterを除外し、原文offsetを維持してClaim抽出。
- FACTUAL / TIME_SENSITIVE / OPINION / UNVERIFIABLE分類。
- SUPPORTED / CONTRADICTED / PARTIALLY_SUPPORTED / INSUFFICIENT_EVIDENCE / TIME_SENSITIVE verdict。
- deterministic Mock Providerと、設定で差し替え可能な実Provider adapter。実Providerは同じpolicy/schemaを必須とし、テスト時は外部LLM API / API key不要。
- 資料内の命令をuntrusted contentとして扱い、prompt injectionが本文生成やツール操作に繋がらない設計。

## 受け入れ条件

- [ ] Code / Quote / Front MatterがClaimにならず、抽出offsetが元Revisionの該当文字列に一致する。
- [ ] replacementTextなど生成用fieldを含む出力はvalidationで拒否する。
- [ ] ProviderをMockへ差し替えて同じ契約を検証できる。
- [ ] AIが本文・Objectives・回答を生成しない。

## 検証

- [ ] lint / typecheck
- [ ] unit: 除外領域 / offset / 分類 / verdict / 禁止field / policy
- [ ] integration: Mock Providerの契約、破損output・provider失敗の扱い
- [ ] browser: 既存学習・保存フローの回帰確認（Review操作UIの接続は次Issue）

Markdown全体へ「間違いを探して」とだけ投げる実装は禁止。

## 依存関係

前提: #5 の完了。実装順序を維持する。

## Architecture update (2026-09-17)

Hono + Node.js is confirmed. Use REST APIs under `server/`, React SPA under `client/`, and domain services under `modules/`. Vite builds the SPA; Hono serves the production SPA and API on one origin. Support both a local host behind Cloudflare Tunnel and a conventional server; Cloudflare Workers is not required. TanStack Router was confirmed by the user on 2026-09-17. See `docs/architecture.md` and the updated `docs/poc-spec.md`.

## 接続先の確定（2026-09-17）

ローカルCodex SDKとOpenAI APIを実装し、初期設定はCodex SDKとする。環境設定で切替可能にし、テストではMockを使用する。本文への書き込みを許可せず、同一の厳格なReviewer output schemaを適用する。
