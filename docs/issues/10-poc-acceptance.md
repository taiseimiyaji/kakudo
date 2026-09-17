## 目的

仕様§45の全Acceptance Criteriaと§46の必須テストを満たし、学習体験の仮説を検証できるPoCとして引き渡す。
Source of Truth: `docs/poc-spec.md` §42–50（および関連全節）。

## 受け入れシナリオ

- [ ] Web UIでAuthentication → OAuth → PKCEを作成・保存。
- [ ] OAuth NodeにDocumentを作り、人間がMarkdownを書いて実 `.md` として保存。
- [ ] 通常Pasteは拒否、Code Block内は許可、QuoteはSource URL必須。
- [ ] Node / Document双方へURLを登録し、保存時Revision生成・同内容重複抑制を確認。
- [ ] 誤った主張をReviewし、Findingと一次根拠URLを確認。
- [ ] Review後に編集するとOutdated Review。新Reviewは新Revisionに固定。
- [ ] AI本文生成・Rewrite・自動補完・適用ボタンが存在しない。
- [ ] Backend Engineering seedが仕様§44に一致し、ノート本文を勝手に生成しない。

## 必須テストの照合

- [ ] 通常Paste拒否 / Code Block Paste許可 / Quote URL必須
- [ ] 保存時Revision作成 / 同内容Revision抑制 / ReviewとRevisionの関連 / 編集後stale
- [ ] Claim ExtractionからCode Block / Quote / Front Matter除外
- [ ] Review OutputのreplacementText等禁止
- [ ] private IP / DNS rebinding / redirect経由のResource fetch拒否
- [ ] Mock Providerで全CIを外部LLMなしで実行可能

## 検証・引き渡し

- [ ] lint / typecheck / unit / 実PostgreSQL integration / browser verificationを全Phaseの回帰として実行。
- [ ] クリーン環境からREADMEの手順でmigrate / seed / 起動が成功。
- [ ] Mock動作と実Provider動作を区別し、実Providerの手動確認結果・制約を記録。
- [ ] §47の5仮説について「書く→読む→Review→根拠へ戻る→自分で修正する」の手動評価手順をdocsへ記録。
- [ ] 未達・既知制限は明記し、PoC完成と偽らない。

Authentication / Team / Git連携 / Vector DB / AI Quiz / Gamificationなど§42のScope外を追加しない。

## 依存関係

前提: #9 の完了。実装順序を維持する。

## Architecture update (2026-09-17)

Hono + Node.js is confirmed. Use REST APIs under `server/`, React SPA under `client/`, and domain services under `modules/`. Vite builds the SPA; Hono serves the production SPA and API on one origin. Support both a local host behind Cloudflare Tunnel and a conventional server; Cloudflare Workers is not required. TanStack Router was confirmed by the user on 2026-09-17. See `docs/architecture.md` and the updated `docs/poc-spec.md`.
