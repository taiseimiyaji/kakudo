# Issue #10：PoC受け入れ検証

実施日：2026-09-17。Hono + Node.js / React SPA + TanStack Router。Node.js 24.13.0、PostgreSQL 17、Chromium。

## 仕様§45の照合

| 条件 | 検証・結果 |
| --- | --- |
| Authentication → OAuth → PKCEの作成・保存 | `tests/e2e/roadmap.spec.ts`：UIで3 Node / 2 Edge作成、移動、再読込して状態保持 |
| OAuth NodeのDocumentを人間が編集、実 `.md` 保存 | `tests/e2e/document.spec.ts`：空Documentへキーボード入力、Preview、保存、再読込。`tests/integration/document.test.ts`：実filesystemとの完全一致 |
| 通常Pasteを本文へ直接挿入しない | `tests/e2e/paste.spec.ts`：ネイティブPasteでQuote Dialog、Cancel後本文不変 |
| QuoteのSource URL必須 | 同browser、`tests/unit/paste.test.ts`、Document integrationでUI / API双方を検証 |
| Code Block内Paste許可 | Paste browser / unitでfenced / indented、delimiterや複数選択の境界を検証 |
| Node / DocumentへのURL登録 | `tests/e2e/resources.spec.ts`：Node登録、Document関連付け、URL Paste。実DBで重複排除・関連解除 |
| 保存時Revision生成 | `tests/e2e/revisions.spec.ts`、Document integration：同内容抑制、タイトルのみ不増、A→B→A、Snapshot不変 |
| 誤った事実にFinding、根拠URL | `tests/e2e/reviews.spec.ts`：OAuthの例→CONTRADICTEDとRFC URL。実Codex + 実RFCでも手動smoke成功 |
| 編集後Outdated Review | Review browser：未保存編集時の即時表示、highlight解除、保存・再Review、新Revisionと過去履歴。Objectives変更もintegrationで確認 |
| AI生成文章の本文適用機能なし | Review後・Resolve / Dismiss後の本文不変、禁止ボタン不存在、厳格な出力Schemaを検証 |
| Seed | Roadmap / Resource integration：8 Node、指定OAuth Objectives、RFC 6749 / RFC 7636、冪等性、ユーザー編集保持 |

## 仕様§46の必須テスト

- Paste拒否・Code例外・Quote URL必須：`tests/unit/paste.test.ts` / `tests/e2e/paste.spec.ts`。
- Revision生成・重複抑制：`tests/integration/document.test.ts` / `tests/e2e/revisions.spec.ts`。
- ReviewとRevision関連・変更後stale：`tests/integration/review-service.test.ts` / `tests/e2e/reviews.spec.ts`。
- ClaimからCode / Quote / Front Matter除外：`tests/unit/reviewer.test.ts`。元Markdownのoffsetも照合。
- replacementText / correctedText / suggestedMarkdown / patch等の拒否：Reviewer unit / transport integration。
- private IP・DNS rebinding・redirect経由の禁止：`tests/unit/resource-fetcher.test.ts` / `tests/integration/resource-fetcher.test.ts`。
- Mock可能・外部LLM不要：`npm run check` 全体をMock、注入可能なtransport / fetcherで実行。

最終監査でCR単独改行が引用外へ出るケースを修正。混在するCR / LF / CRLFをすべて引用行にし、Markdown ASTでもClaim対象にならない回帰テストを追加した。

## 全体検証

`npm run check`：lint / typecheck / build、unit **70件**、実PostgreSQL integration **31件**、Chromium **13件**。

Issue #1〜#9の各Phaseの結果は同directoryの `issue-01.md` 〜 `issue-09.md`、初期構成は [Phase 1記録](../verification.md)。各実装PRはpush / PR双方のGitHub Actions成功を確認してマージ。

## クリーン起動

Issue #9のコミット `6cf7c24` を `git archive` で独立した一時directoryへ展開し、既存node_modules / .env / build / 学習データを引き継がずに検証した。

1. `npm ci` 成功。
2. db-test内に専用DB `kakudo_clean_1789638466_test` を新規作成。
3. 専用 `DATABASE_URL` / `CONTENT_STORAGE_ROOT` で `npm run db:setup` を2回実行。8 Node、0 Document、2 Resourcesを確認。
4. `npm run build` → `npm start`。空きポート49727でhealthがDB connected、SPA deep linkがHTMLを返すことを確認。
5. 空Document作成→保存→実 `.md` の内容一致・Revision更新を確認。
6. 検証Document削除、専用サーバー停止、専用DB削除。既存DB・ノートは変更しない。

その後の変更は引用改行処理・回帰テスト・説明文のみで、最終branchでも全体checkを実行した。

## 実Provider

- **Codex SDK**：ローカル認証で実行。Claim抽出・根拠付きCONTRADICTED、実RFC取得を含むReview pipeline、web検索による実URL探索、Logic / Coverageのsmokeに成功。詳細は #6 / #7 / #9 の検証記録。
- **OpenAI API**：Adapter / strict schema / web citation採用を注入transportで検証。API認証未設定のため実接続未検証。
- **Mock**：RFC fixture・決定的な判定によるテスト用実装。実資料取得や実AI評価と明確に区別する。

初期設定は `REVIEW_PROVIDER=codex`。APIキーをGit・チャットへ記録しない。

## 残る制約と評価

- 単一Nodeプロセス、ローカルfilesystem。複数Replica、認証、Git同期など仕様Scope外は未実装。
- 実サーバーdeploy / Cloudflare Tunnel経由は未検証。本番Nodeサーバーをoriginとして使う構成で、Workersを必要としない。
- FetcherはHTML / plain text / MarkdownとHTTP(S)標準ポートに対応。PDF・圧縮応答はUNAVAILABLE。探索件数・サイズ・timeoutの上限をREADMEに記載。
- 自由記述のレビュー説明が常に方針に従うことはSchemaだけでは保証しない。Provider policyと厳格な契約を併用し、自動適用経路を持たない。
- Editor chunkの500 kB超警告が残る。buildは成功。
- 5つの学習仮説について利用者評価はまだ実施していない。[評価手順](../learning-evaluation.md) に観察・比較・記録方法を記載。機能検証の成功を学習効果の証明とは扱わない。
