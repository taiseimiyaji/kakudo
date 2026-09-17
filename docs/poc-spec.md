# Kakudo（カクドー）PoC アプリケーション設計

> 技術選定更新（2026-09-17）: ユーザーとの協議によりHono + Node.jsを確定。React SPA + Viteへ移行。詳細は [architecture.md](architecture.md)。当初の提示仕様は [poc-spec-original.md](poc-spec-original.md) に保存。プロダクト原則・機能要件は維持する。

## 1. プロダクト概要

**Kakudo** は、学習ロードマップ・Markdownノート・参考資料・引用・AIレビューを統合した学習用Knowledge Workspaceである。

コンセプトは、

> **書いて、辿って、確かめる。**

AIに教材や回答を書かせるのではなく、

1. 学習する
2. 資料を読む
3. 自分で考える
4. 自分の言葉で書く
5. AIに検証してもらう
6. 根拠を確認する
7. 自分で修正する

という学習体験を提供する。

---

# 2. Kakudoの基本思想

Kakudoでは役割を明確に分離する。

## Human

人間が行うこと：

* 学ぶ
* 調べる
* 考える
* Markdownを書く
* 説明する
* 引用する
* AIレビュー結果を判断する
* 自分で文章を修正する

## AI

AIが行うこと：

* ファクトチェック
* 出典確認
* 論理的飛躍の検出
* 説明不足の検出
* Learning ObjectiveとのCoverage確認
* 情報の陳腐化検出
* 根拠資料の提示
* 理解確認のための問いかけ

AIはAuthorではなく**Reviewer**である。

---

# 3. AIに禁止すること

Kakudoでは以下を実装しない。

* AIによる本文生成
* AIによるMarkdown生成
* AIによる文章自動補完
* AI Rewrite
* AIによる回答生成
* 「この文章に置き換えてください」という修正文
* Suggested Patch
* Apply Fix
* Complete with AI
* Generate Document

AIレビュー結果を本文へ自動適用する仕組みも作らない。

UIにも以下のボタンは存在させない。

```text
Generate
Rewrite
Fix with AI
Apply Fix
Complete
```

代わりに提供するのは、

```text
Review
Check Facts
Check Sources
Check Logic
Check Coverage
```

である。

---

# 4. プロダクト全体構造

Kakudoは以下の4領域から構成する。

```text
Kakudo Workspace
│
├── Knowledge Map
│
├── Documents
│
├── Sources / Quotes
│
└── Reviews
```

関係：

```text
Knowledge Map
      │
      ▼
 Learning Node
      │
      ├──── Document
      │
      ├──── Resource
      │
      └──── Learning Objectives
                    │
                    ▼
                 Review
                    │
            ┌───────┼────────┐
            ▼       ▼        ▼
           Fact    Logic   Coverage
            │
            ▼
         Evidence
```

---

# 5. Knowledge Map

roadmap.shのように、学習内容をNodeとEdgeで可視化する。

例：

```text
Backend Engineering

HTTP
 │
 ▼
Authentication
 │
 ├──── Session
 │
 ├──── Cookie
 │
 └──── OAuth
          │
          ├──── Authorization Code
          └──── PKCE
```

Mapは単なるMind Mapではなく、

> 「何を、どの順番で理解するか」

を表現する。

---

# 6. NodeとDocumentを分離する

重要な設計原則。

例えば、

```text
OAuth
```

というConceptと、

```text
OAuthについて自分が書いたノート
```

は別物として管理する。

構造：

```text
LearningNode: OAuth
│
├── Document: OAuth Overview
├── Document: OAuth Security
├── Resource: RFC 6749
├── Resource: RFC 7636
└── Learning Objectives
```

1つのNodeに複数Documentを持てる。

---

# 7. Learning Node

```ts
type LearningNode = {
  id: string
  roadmapId: string

  title: string
  description?: string

  positionX: number
  positionY: number

  status:
    | "NOT_STARTED"
    | "LEARNING"
    | "REVIEWING"
    | "LEARNED"

  learningObjectives: string[]
  guidingQuestions: string[]
}
```

---

# 8. Learning Objectives

AIが勝手に「何を理解すべきか」を決めない。

Learning Objectiveは人間が定義する。

例：

```text
OAuth

Learning Objectives

- OAuthとAuthenticationの違いを説明できる
- Authorization Code Flowを説明できる
- Access Tokenの役割を説明できる
- PKCEが必要な理由を説明できる
```

AIはこれらに対して、

```text
Covered
Partially Covered
Not Covered
```

を判定するだけ。

---

# 9. Roadmap Edge

PoCでは以下の3種類を実装する。

```ts
type RoadmapEdgeType =
  | "PREREQUISITE"
  | "PARENT"
  | "RELATED"
```

例：

```text
Authentication
      │
      │ PREREQUISITE
      ▼
    OAuth
```

---

# 10. Markdown First

KakudoではMarkdownをコンテンツの正本とする。

DB内のMarkdown文字列だけで完結させない。

論理構造：

```text
workspace-data/
└── default/
    ├── docs/
    │   ├── http/
    │   │   └── overview.md
    │   └── oauth/
    │       ├── overview.md
    │       └── security.md
    │
    └── research/
```

Markdownは通常の `.md` として扱えること。

将来的には、

```text
Kakudo
↕
Git
↕
VS Code
Claude Code
Codex
Obsidian
```

という連携も可能にする。

PoCではGit連携自体は実装しない。

---

# 11. Markdown形式

例：

```markdown
---
id: oauth-overview
title: OAuth Overview
tags:
  - oauth
  - security
---

# OAuth

OAuthについて自分の理解を書く。
```

PoCではFront Matterを最小限にする。

Nodeとの関連はDBで管理してよい。

---

# 12. Markdown Editor

PoCでは **CodeMirror 6** を利用する。

理由：

* Markdownそのものを編集できる
* Paste制御が容易
* Markdown fidelityを維持できる
* Code Blockを識別できる
* AI autocompleteが不要
* 教育用途と相性が良い

画面：

```text
┌───────────────────────────────────────────────┐
│ OAuth                               [Review]  │
├─────────────────────┬─────────────────────────┤
│ Markdown             │ Preview                 │
│                      │                         │
│ # OAuth              │ OAuth                   │
│                      │                         │
│ OAuthは...           │ OAuthは...              │
│                      │                         │
├─────────────────────┴─────────────────────────┤
│ Sources / Reviews                              │
└───────────────────────────────────────────────┘
```

---

# 13. Paste Policy

Kakudoを特徴づける重要機能。

通常文章を本文へ直接Pasteすることは禁止する。

Paste処理：

```text
Paste
 │
 ├─ Code Block内
 │      └─ Allow
 │
 ├─ URLのみ
 │      └─ Resource Dialog
 │
 └─ その他のText
        └─ Quote Dialog
```

---

# 14. Quote

文章を貼り付ける場合は、引用としてのみ追加できる。

Dialog：

```text
引用として追加

Text
────────────────────
OAuth 2.0 is an authorization framework...

Source URL *
────────────────────
https://datatracker.ietf.org/...

Source Title
────────────────────
RFC 6749

[Add Quote]
```

Source URLは必須。

Markdownには、

```markdown
> OAuth 2.0 is an authorization framework...
>
> Source: RFC 6749
```

として追加する。

---

# 15. Quote Model

```ts
type Quote = {
  id: string
  documentId: string

  text: string

  sourceUrl: string
  sourceTitle?: string

  accessedAt: Date
}
```

Quote MetadataはDBにも保持する。

これによりSource Verificationを可能にする。

---

# 16. Resource

参考資料を登録できる。

```ts
type Resource = {
  id: string
  workspaceId: string

  url: string
  title?: string

  type:
    | "WEB"
    | "OFFICIAL_DOC"
    | "RFC"
    | "PAPER"
    | "OTHER"

  createdAt: Date
}
```

Resourceは、

* Node
* Document

のどちらにも関連付け可能。

---

# 17. Document

```ts
type Document = {
  id: string
  workspaceId: string

  title: string
  path: string

  createdAt: Date
  updatedAt: Date
}
```

`path` はContentStorage上のMarkdownを参照する。

---

# 18. ContentStorage

Document Serviceから直接 `fs` を呼ばない。

```ts
interface ContentStorage {
  read(path: string): Promise<string>

  write(
    path: string,
    content: string
  ): Promise<void>

  delete(path: string): Promise<void>

  exists(path: string): Promise<boolean>
}
```

PoC：

```text
LocalFileSystemStorage
```

のみ実装。

将来的に、

```text
GitStorage
GitHubStorage
GitLabStorage
S3Storage
R2Storage
```

を追加可能とする。

---

# 19. Revision

AI Reviewは必ず特定Revisionに対して実行する。

```ts
type DocumentRevision = {
  id: string
  documentId: string

  contentHash: string
  contentSnapshot: string

  createdAt: Date
}
```

Document保存時：

```text
Markdown保存
↓
SHA-256
↓
Revision作成
```

同じHashなら新規Revisionを作らなくてもよい。

---

# 20. Review

ReviewはKakudoの中核機能。

構造：

```text
DocumentRevision
       │
       ▼
   ReviewRun
       │
       ▼
    Findings
       │
       ▼
    Evidence
```

AIはFindingだけを返す。

本文を書き換えない。

---

# 21. ReviewRun

```ts
type ReviewRun = {
  id: string

  documentId: string
  revisionId: string

  type:
    | "FACT_CHECK"
    | "LOGIC"
    | "COVERAGE"
    | "SOURCE"
    | "FULL"

  status:
    | "QUEUED"
    | "RUNNING"
    | "COMPLETED"
    | "FAILED"

  createdAt: Date
}
```

---

# 22. Review Finding

```ts
type ReviewFinding = {
  id: string
  reviewRunId: string

  category:
    | "FACT"
    | "SOURCE"
    | "LOGIC"
    | "COVERAGE"
    | "FRESHNESS"
    | "CLARITY"

  severity:
    | "INFO"
    | "WARNING"
    | "IMPORTANT"

  status:
    | "OPEN"
    | "RESOLVED"
    | "DISMISSED"

  targetText?: string

  startOffset?: number
  endOffset?: number

  explanation: string

  guidingQuestion?: string
}
```

意図的に以下のフィールドは作らない。

```text
correctedText
replacementText
suggestedMarkdown
patch
```

---

# 23. Evidence

```ts
type Evidence = {
  id: string
  findingId: string

  url: string
  title: string

  excerpt?: string

  sourceType:
    | "USER_RESOURCE"
    | "OFFICIAL"
    | "PRIMARY"
    | "SECONDARY"

  accessedAt: Date
}
```

Evidenceは可能な限り一次情報を優先する。

技術分野では、

```text
RFC
標準仕様
公式Documentation
公式Repository
公式Blog
```

などを優先。

---

# 24. Fact Check Pipeline

Markdown全体をLLMへ渡して、

```text
間違いを探してください
```

とはしない。

以下のPipelineとする。

```text
Markdown
   │
   ▼
Claim Extraction
   │
   ▼
Claim Classification
   │
   ▼
Evidence Retrieval
   │
   ▼
Claim Verification
   │
   ▼
Review Finding
```

---

# 25. Claim Extraction

内部モデル：

```ts
type Claim = {
  id: string

  text: string

  startOffset: number
  endOffset: number

  type:
    | "FACTUAL"
    | "TIME_SENSITIVE"
    | "OPINION"
    | "UNVERIFIABLE"
}
```

以下はClaimとして扱わない。

* Code Block
* Quote Block
* Front Matter

---

# 26. Fact Check Verdict

二択ではなく以下を使用する。

```text
SUPPORTED
CONTRADICTED
PARTIALLY_SUPPORTED
INSUFFICIENT_EVIDENCE
TIME_SENSITIVE
```

SUPPORTEDなClaimは通常Findingとして表示しなくてよい。

問題があるClaimを中心に表示する。

---

# 27. Evidence Retrieval順序

根拠探索は以下の順番。

```text
1. Document Resources

2. Node Resources

3. Workspace Resources

4. Web Search
```

最初からWeb検索へ行かない。

学習者が読んでいる資料をまず利用する。

---

# 28. Logic Review

例：

ユーザー：

```text
Cookieを使うのでSession認証は安全である。
```

Kakudo：

```text
Logic Review

この説明では、
Cookieを利用することと安全性との間に
論理的な飛躍があります。

次の観点との関係を考えてみてください。

- HttpOnly
- Secure
- SameSite
- CSRF
```

正解文は表示しない。

---

# 29. Coverage Review

NodeのLearning ObjectiveとMarkdownを比較する。

例：

```text
OAuth

✓ OAuthとAuthenticationの違い

✓ Access Token

△ Authorization Code Flow

説明はありますが、
Authorization ServerとClientの関係が
十分に説明されていません。

Question:

Authorization Codeは誰から誰へ渡されますか？

○ PKCE

このObjectiveについての説明を
確認できませんでした。
```

AIがPKCEそのものを説明してはいけない。

---

# 30. Source Verification

Quote：

```text
Quote
+
Source URL
```

に対してSourceを取得し、

```text
VERIFIED
PARTIAL_MATCH
NOT_FOUND
UNAVAILABLE
```

を判定。

ページ取得不能の場合は、

```text
UNAVAILABLE
```

であり、

```text
INCORRECT
```

とは判断しない。

---

# 31. Review UI

GitHub Reviewに近いUIとする。

```text
Review
────────────────────────

⚠ Fact

「OAuthは認証プロトコルである」

この記述は、登録された一次資料の
定義と一致しない可能性があります。

Evidence

RFC 6749 §1.1
[Open Source]

Think about:

OAuthでは誰が誰に対して
どのような権限を委譲していますか？

[Resolve]
[Dismiss]
```

以下のボタンは作らない。

```text
Accept Fix
Apply
Rewrite
```

---

# 32. Review Staleness

ReviewはRevision固定。

Review対象：

```text
Revision A
```

その後Documentを編集：

```text
Revision B
```

となった場合、

```text
Outdated Review

このレビュー後にDocumentが変更されています。

[Review Again]
```

と表示する。

---

# 33. Knowledge Map UI

PoC画面：

```text
┌───────────────┬─────────────────────────────┬──────────────────┐
│ Explorer      │ Knowledge Map               │ Node Details     │
│               │                             │                  │
│ Roadmaps      │ HTTP                        │ OAuth            │
│ Documents     │   │                         │                  │
│ Resources     │   ▼                         │ Objectives       │
│ Reviews       │ Authentication              │                  │
│               │   │                         │ Documents        │
│               │   ▼                         │                  │
│               │ OAuth ─────→ PKCE           │ Resources        │
│               │                             │                  │
│               │                             │ Review Status    │
└───────────────┴─────────────────────────────┴──────────────────┘
```

React Flowを使用する。

---

# 34. Node表示

例えば：

```text
OAuth

Learning

Docs 2
Sources 4
Review ⚠ 2
```

Review FindingがあることをMap上から確認できる。

---

# 35. PoC技術スタック

推奨：

```text
Language
TypeScript

Backend
Hono + Node.js

Frontend build
Vite

Frontend routing
未選定（TanStack Router / React Routerは別途協議）

UI
React

Knowledge Map
React Flow

Editor
CodeMirror 6

Markdown
remark
rehype

Database
PostgreSQL

ORM
Drizzle ORM

Storage
Local filesystem

AI
Provider abstraction

Container
Docker Compose
```

PoCではFrontend / Backendを同一リポジトリで管理する。

React SPAとHono REST APIを分離して実装し、本番では同じNode.jsプロセスから同一originで配信する。

ローカルPC + Cloudflare Tunnelと通常サーバーの両方で同じアプリを利用する。Cloudflare Workersは前提にしない。

---

# 36. Repository構成

```text
kakudo/

├── client/
│   ├── pages/
│   └── main.tsx
│
├── server/
│   ├── api.ts
│   ├── app.ts
│   └── index.ts
│
├── shared/
│
├── components/
│   ├── roadmap/
│   ├── editor/
│   ├── resources/
│   └── reviews/
│
├── modules/
│   ├── roadmap/
│   ├── document/
│   ├── resource/
│   ├── review/
│   └── storage/
│
├── db/
│   ├── schema.ts
│   └── migrations/
│
├── lib/
│
├── workspace-data/
│   └── default/
│       └── docs/
│
└── docker-compose.yml
```

ComponentへDomain Logicを直接書かない。

---

# 37. Database

主要Table：

```text
workspaces

roadmaps

learning_nodes

roadmap_edges

documents

document_nodes

document_revisions

resources

node_resources

document_resources

quotes

review_runs

review_findings

finding_evidence
```

---

# 38. API

PoCではRESTで十分。

```text
GET    /api/roadmaps
POST   /api/roadmaps

GET    /api/roadmaps/:id
PATCH  /api/roadmaps/:id

POST   /api/nodes
PATCH  /api/nodes/:id
DELETE /api/nodes/:id

POST   /api/edges
DELETE /api/edges/:id

GET    /api/documents
POST   /api/documents

GET    /api/documents/:id
PUT    /api/documents/:id

POST   /api/documents/:id/resources

POST   /api/documents/:id/quotes

POST   /api/documents/:id/reviews

GET    /api/reviews/:id
```

GraphQLは不要。

---

# 39. AI Provider

LLM Providerへ直接依存しない。

```ts
interface ReviewProvider {
  extractClaims(
    markdown: string
  ): Promise<Claim[]>

  verifyClaim(
    claim: Claim,
    evidence: EvidenceDocument[]
  ): Promise<ClaimVerification>

  reviewLogic(
    markdown: string
  ): Promise<ReviewFindingInput[]>

  reviewCoverage(
    markdown: string,
    objectives: LearningObjective[]
  ): Promise<CoverageResult[]>
}
```

ProviderはMock可能にする。

Test時に外部LLM APIを必要としない構成にする。

---

# 40. AI Policy

すべてのReview Providerに共通するルール：

```text
You are a reviewer, not an author.

The learner must write all educational content themselves.

Never:

- rewrite the learner's text
- provide replacement sentences
- produce corrected paragraphs
- complete the learner's explanation
- answer learning questions on their behalf

You may:

- identify factual problems
- explain why a claim may be unsupported
- identify missing reasoning
- provide evidence
- ask guiding questions
- identify missing learning objectives

Provide enough context to understand the issue,
but never provide ready-to-paste replacement text.
```

Promptだけに依存せず、Output Schemaからも文章生成用フィールドを排除する。

---

# 41. External Resource取得時のSecurity

URL取得を行うため、PoCでも最低限実装する。

禁止：

```text
localhost
127.0.0.0/8
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
169.254.0.0/16
file://
```

必要：

* DNS Rebinding対策
* Redirect後の再検証
* Request timeout
* Response size limit
* HTML sanitize

SSRF対策は省略しない。

---

# 42. PoCでは作らない機能

明確にScope外：

```text
Authentication

Organization

Team collaboration

Realtime editing

Comments

Mobile App

GitHub Sync

GitLab Sync

Git Commit

S3 / R2

Vector Database

Embedding

Semantic Search

Generic RAG

AI Content Generation

AI Roadmap Generation

AI Quiz Generation

AI Rewrite

Spaced Repetition

Gamification

Public Marketplace

Public Roadmaps
```

特にVector DatabaseはPoCでは不要。

---

# 43. 実装順序

## Phase 1

Project foundation。

* React SPA / Vite
* Hono / Node.js
* PostgreSQL
* Drizzle
* Docker Compose
* Workspace Seeder

---

## Phase 2

Knowledge Map。

* Roadmap CRUD
* Node CRUD
* Edge CRUD
* React Flow
* Node position保存

---

## Phase 3

Markdown Documents。

* Document CRUD
* ContentStorage
* CodeMirror
* Markdown Preview
* Revision

---

## Phase 4

Learning Editor。

* Paste Interception
* Quote Dialog
* URL Detection
* Code Paste Exception

---

## Phase 5

Resources。

* Node Resource
* Document Resource
* Resource metadata

---

## Phase 6

Fact Check。

* Claim Extraction
* Claim Classification
* Evidence Retrieval
* Claim Verification
* ReviewRun
* Finding

---

## Phase 7

Review UI。

* Finding一覧
* Markdown highlight
* Evidence
* Resolve
* Dismiss
* Stale Review

---

## Phase 8

Coverage / Logic Review。

* Learning Objectives
* Coverage Review
* Logic Review
* Guiding Questions

---

# 44. PoC用Seed

デモ用に以下を登録する。

```text
Backend Engineering
│
├── HTTP
│
├── Authentication
│    │
│    ├── Session
│    ├── Cookie
│    └── OAuth
│         │
│         ├── Authorization Code
│         └── PKCE
│
└── Database
```

OAuth Learning Objectives：

```text
- OAuthとAuthenticationの違いを説明できる
- Authorization Code Flowを説明できる
- Access Tokenの役割を説明できる
- PKCEの目的を説明できる
```

Resource例：

```text
RFC 6749
RFC 7636
OAuth関連の公式資料
```

---

# 45. PoC Acceptance Criteria

以下がすべて動けばPoC完成とする。

## Knowledge Map

Web UIから、

```text
Authentication
      ↓
    OAuth
      ↓
     PKCE
```

を作成・保存できる。

## Markdown

OAuth NodeへDocumentを作り、

自分でMarkdownを書いて保存できる。

実体の `.md` ファイルが生成される。

## Paste Restriction

通常文章をCmd/Ctrl + Vしても本文へ直接挿入されない。

## Quote

文章を貼り付ける場合、

Source URLを入力しなければ追加できない。

## Code

Code Block内ではPasteできる。

## Resource

URLをNode / Documentへ登録できる。

## Revision

Document保存時にRevisionが生成される。

## Fact Check

誤った事実主張を入力してReviewするとFindingが表示される。

## Evidence

Findingに根拠URLが表示される。

## Stale Review

Review後にDocumentを編集すると、

```text
Outdated Review
```

になる。

## AI

AIが作成した文章を本文へ適用する機能が存在しない。

---

# 46. 最低限のTest

必須：

```text
通常Pasteを拒否する

Code Block内Pasteを許可する

QuoteにはSource URLが必須

Document保存時にRevisionを作る

同一内容では不要なRevisionを増やさない

ReviewがRevisionに紐付く

Revision変更後ReviewがStaleになる

Code BlockをClaim Extractionから除外する

QuoteをClaim Extractionから除外する

Review OutputにreplacementTextが存在しない

private IPへResource fetchできない

AI ProviderをMock可能
```

---

# 47. Kakudoで検証したい仮説

PoCの目的は機能開発そのものではない。

次の仮説を検証する。

### 仮説1

AIに文章を書かせなくてもAIは学習体験を大きく改善できる。

### 仮説2

「自分で書く → AIレビュー → 自分で直す」というサイクルは、単純なAI回答より理解を深める。

### 仮説3

Knowledge MapとMarkdownを接続すると、

「何を学んでいるのか」

と

「何を理解したのか」

を一緒に管理できる。

### 仮説4

Pasteを意図的に制限することで、

コピーした情報の蓄積ではなく、

自分の理解の蓄積を促せる。

### 仮説5

AI Fact CheckとSource管理を組み合わせることで、

AIを使いながらも根拠へ戻る学習体験を作れる。

---

# 48. KakudoのUX原則

Kakudoは、

> 「最短時間で答えを得るツール」

を目指さない。

目指すのは、

> 「自分が本当に理解したか確認するツール」

である。

したがってUX判断で迷った場合、

```text
この機能はユーザーの思考を代替するか？
```

を基準にする。

YESなら原則実装しない。

```text
この機能はユーザー自身の思考を助けるか？
```

YESなら実装候補とする。

---

# 49. ブランドコンセプト

名称：

# Kakudo

読み：

**カクドー**

キーワード：

```text
書く
辿る
考える
確かめる
根拠
理解
道
```

ブランドメッセージ候補：

> **書いて、辿って、確かめる。**

英語表現候補：

> **Write. Trace. Verify.**

Kakudoという名前自体に、

```text
Kaku = 書く
Do = 道
```

という意味を持たせる。

「自分で書きながら理解への道を進む」というプロダクト思想を表現する。

---

# 50. 実装エージェントへの最終指示

この仕様をKakudo PoCのSource of Truthとして扱うこと。

実装順序：

```text
Knowledge Map
↓
Markdown
↓
Paste Policy
↓
Sources
↓
Revision
↓
Fact Check
↓
Review UI
↓
Coverage / Logic
```

各Phaseで必ず、

```text
lint
typecheck
unit test
integration test
browser verification
```

を行うこと。

最重要Invariant：

> **Markdownを書くのは人間である。**

> **AIは本文を書かない。**

> **AIは問題点と根拠を提示する。**

> **考えて修正するのは人間である。**

Kakudoの機能追加・UI変更・AI機能追加を行う際も、この原則を破ってはならない。
