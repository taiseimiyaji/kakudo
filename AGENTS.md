# Kakudo implementation instructions

## Source of Truth

作業前に [docs/poc-spec.md](docs/poc-spec.md) を読む。全50節がユーザー指定のPoC仕様。技術選定は [docs/architecture.md](docs/architecture.md) の確定事項を優先する。
実装状況と順序は [docs/implementation-plan.md](docs/implementation-plan.md) を参照する。

## Invariants

- Markdownを書くのは人間。AIはAuthorではなくReviewer。
- 本文生成、回答生成、補完、Rewrite、Suggested Patch、Apply Fixを実装しない。
- Review Outputに correctedText / replacementText / suggestedMarkdown / patch を設けない。
- Learning Objectivesは人間が定義する。AIはCoverageの判定のみ行う。
- Markdownの正本は通常の `.md`。Document ServiceはContentStorage経由で扱う。
- NodeとDocumentを分離する。Reviewは必ず特定Revisionに固定する。
- 通常Pasteは引用へ、URLのみはResourceへ、Code Block内だけ直接Pasteを許可する。
- 外部URL取得はSSRF対策・DNS rebinding対策・redirect再検証・timeout・size limit・sanitizeを必須とする。
- ComponentにDomain Logicを書かずmodulesへ置く。LLMはProvider interfaceで抽象化し、テストではMock可能にする。
- 仕様§42のScope外機能は追加しない。

## Delivery and verification

各Phaseでlint、typecheck、unit test、integration test、browser verificationを実施する。
未実行・失敗は明記し、通過とみなさない。DB integration testはTEST_DATABASE_URLの専用DBだけを使用する。
GitHub Issueの依存順序で進め、受け入れ条件と実行結果を残す。

## Herdr availability

Herdr is installed and the user authorizes choosing it autonomously when persistent terminals, long-running process monitoring, or agent coordination materially help the current task. Read the `herdr` skill at `~/.codex/skills/herdr/SKILL.md` for session ownership and Codex/Orca startup. Use Orca CLI for Orca-managed state. This tool preference does not expand task scope or override delegation restrictions.


## Confirmed architecture

- Backend: Hono + Node.js。REST APIはserver/、Domain Logicはmodules/。
- Frontend: React SPA。Viteで開発・buildし、本番はHonoが同じoriginから配信する。
- Routerはユーザー指定のTanStack Router。
- Next.js / SSR / Workersへの依存を導入しない。
- PC + Cloudflare Tunnelと通常サーバーで同じNodeアプリを起動する。Tunnelは入口であり実行基盤ではない。
- PostgreSQLとMarkdown保存先を永続化する。サーバーに配置したMarkdownのPC同期は別機能。
