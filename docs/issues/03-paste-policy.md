## 目的

Code Block外の通常Pasteを本文に挿入せず、出典付きQuoteまたはResource登録へ誘導する。
Source of Truth: `docs/poc-spec.md` §13–15, 45–46, 50。

## 実装範囲

- CodeMirror 6のpasteイベントを挿入前にintercept。Code Block内→Allow、URLのみ→Resource Dialog、その他→Quote Dialog。
- Code Block判定はMarkdown構文木で行い、fence境界、複数選択、選択範囲が本文を跨ぐ場合を検証。
- Quote Dialogはtext / 必須Source URL / 任意Source Title。キャンセル時は本文を変更しない。
- `quotes` table、`POST /api/documents/:id/quotes`。sourceUrl / sourceTitle / accessedAtをDBへ保存。
- ユーザーが確定した引用だけを `> ...` / `> Source: ...` 形式で挿入。複数行も引用外へ漏れない。
- Source URLをUI / API双方で検証。Dialogの入力欄自体では貼り付け可能。
- URL-onlyのResource Dialogを実装し、保存は次のResources Issueへ接続。接続前は未対応を明示し、登録成功や本文挿入を偽装しない。

## 受け入れ条件

- [ ] Cmd/Ctrl+VとコンテキストメニューPasteで通常文章が直接挿入されない。
- [ ] Code Block内のPasteは文字列を変更せず許可される。
- [ ] Source URLなしのQuote追加をUI / APIとも拒否する。
- [ ] 引用の本文・出典・日時が保存される。キャンセルで本文は不変。

## 検証

- [ ] lint / typecheck
- [ ] unit: 通常Paste拒否、Code Block許可、URL分岐、境界・複数選択
- [ ] integration: Quote必須URL検証、DBとMarkdownの整合性
- [ ] browser: 実際のpaste経路、Quote追加 / キャンセル、URL Dialog、code例外

AIによる引用文の生成・修正・自動補完は実装しない。

## 依存関係

前提: #2 の完了。実装順序を維持する。

## Architecture update (2026-09-17)

Hono + Node.js is confirmed. Use REST APIs under `server/`, React SPA under `client/`, and domain services under `modules/`. Vite builds the SPA; Hono serves the production SPA and API on one origin. Support both a local host behind Cloudflare Tunnel and a conventional server; Cloudflare Workers is not required. TanStack Router was confirmed by the user on 2026-09-17. See `docs/architecture.md` and the updated `docs/poc-spec.md`.
