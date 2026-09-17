# Issue #6 検証記録

2026-09-17。lint / typecheck / build成功。unit 56件、integration 24件、Chromium回帰10件成功。

- ASTによるCode / Quote / Front Matter除外、CRLF・日本語原文offset照合。
- Claim抽出→分類、4分類と5 verdict、禁止field / unknown field拒否。
- 捏造Claim・未知のEvidence ID・根拠なしSUPPORTED・未知Objectives・除外領域のLogic targetを拒否。
- Mockは外部API不要。Codex / OpenAI adapterはstubでschema・tool無効・read-only・store=falseを検証。
- 実Codex SDKで仕様のOAuth主張を1件抽出し、提示したRFC 6749の短い根拠を使ってCONTRADICTED + rfc6749を返すことを確認。本文書込みやツール実行なし。
- OpenAI APIは認証情報を設定していないため実通信は未実行。adapter契約テストは成功。

既定設定はCodex SDK。通常テストでは外部LLMを呼ばない。実Review APIは#7、Review UIは#8で接続する。
Codex SDKは一時cwdとread-only sandboxを用い、shell / MCP / plugins / hooks / web searchを無効化する。出力にツール使用が含まれた場合も拒否する。
