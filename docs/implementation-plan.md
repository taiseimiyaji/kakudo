# Kakudo PoC 実装計画

Source of Truth: [PoC仕様（全50節）](poc-spec.md)。確定した技術選定は [architecture.md](architecture.md)。
フロントのRouterは2026-09-17にユーザー指定でTanStack Routerに確定。

## Phase 1：今回の初期セットアップ

実装済み：

- Hono + Node.js REST API / React SPA / Vite / TypeScriptとnpm lockfile
- PostgreSQL 17 / Docker Compose、開発DBの永続化と専用テストDB
- Drizzle schema / version管理されたmigration / CLI
- `default` Workspaceの冪等・非破壊Seeder
- 起動画面 / DBからのWorkspace表示 / DB health endpoint
- lint / typecheck / unit / 実PostgreSQL integration / browserテストとGitHub Actions
- 仕様保存、AGENTS.md、起動手順、後続Issue作成

検証結果は [verification.md](verification.md) を参照。

## 実装順序

仕様§43ではRevisionがPhase 3に含まれますが、最終指示§50の
Knowledge Map → Markdown → Paste Policy → Sources → Revision → Fact Check → Review UI → Coverage / Logic
を優先します。RevisionはPhase 5.5、Fact CheckはProvider / Claim基盤とpipelineの2件に分割しています。
各Issueは直前のIssue完了を前提とし、最後に全体Acceptanceを検証します。

| 順序 | GitHub Issue | ローカルの本文 |
| --- | --- | --- |
| 1 | [#1 [Phase 2] Knowledge Map：Roadmap / Node / Edge CRUDとReact Flow](https://github.com/taiseimiyaji/kakudo/issues/1) | [詳細](issues/01-knowledge-map.md) |
| 2 | [#2 [Phase 3] Markdown Documents：ContentStorage・CodeMirror・Preview](https://github.com/taiseimiyaji/kakudo/issues/2) | [詳細](issues/02-markdown.md) |
| 3 | [#3 [Phase 4] Paste Policy：引用必須・URL分岐・Code Block例外](https://github.com/taiseimiyaji/kakudo/issues/3) | [詳細](issues/03-paste-policy.md) |
| 4 | [#4 [Phase 5] Sources：Node / Document資料管理とSSRF対策](https://github.com/taiseimiyaji/kakudo/issues/4) | [詳細](issues/04-resources-security.md) |
| 5 | [#5 [Phase 5.5] Revision：保存時Snapshot・SHA-256・重複抑制](https://github.com/taiseimiyaji/kakudo/issues/5) | [詳細](issues/05-revisions.md) |
| 6 | [#6 [Phase 6a] Review Provider：Reviewer契約・Mock・Claim抽出](https://github.com/taiseimiyaji/kakudo/issues/6) | [詳細](issues/06-review-provider-claims.md) |
| 7 | [#7 [Phase 6b] Fact / Source Check：根拠探索・Revision固定・Finding保存](https://github.com/taiseimiyaji/kakudo/issues/7) | [詳細](issues/07-fact-source-review.md) |
| 8 | [#8 [Phase 7] Review UI：Evidence・Resolve / Dismiss・Outdated Review](https://github.com/taiseimiyaji/kakudo/issues/8) | [詳細](issues/08-review-ui.md) |
| 9 | [#9 [Phase 8] Coverage / Logic：Objectives検証とGuiding Questions](https://github.com/taiseimiyaji/kakudo/issues/9) | [詳細](issues/09-coverage-logic.md) |
| 10 | [#10 [PoC検証] 全Acceptance Criteria・必須テスト・学習体験の確認](https://github.com/taiseimiyaji/kakudo/issues/10) | [詳細](issues/10-poc-acceptance.md) |

## 各Issueの完了条件

- 仕様に対応する受け入れ条件を満たす。
- lint / typecheck / unit / integration / browser verificationの5項目を実施し、結果を記録する。
- AIは本文・回答・修正文を生成しない。レビュー結果を適用する仕組みを作らない。
- 人間のObjectives、Markdownの実ファイル、Revision固定、SSRF対策を維持する。
- 外部LLMなしのMockテストを維持し、Mockと実Providerの結果を混同しない。

## Scopeと引き継ぎ

Phase 7のReview UIまで実装済み。Logic / Coverageは後続Issueです。
次のIssueは [#9 Coverage / Logic](https://github.com/taiseimiyaji/kakudo/issues/9) です。
各ドメインのtableは実装Issueでmigrationとともに追加します。
Source Verificationは#7、MapのDocs / Sources / Review件数は#8に含めています。
学習ノート本文はseedで生成しません。仕様§44の人間が指定したMap / Objectives / Resourceだけを該当Phaseでseedへ追加します。
