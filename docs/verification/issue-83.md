# Issue #83 — 保存済みの関連IDが不変の基準確認

actual main2578a45とdraft PR82 sourceab9e606の両方で、Chromium/Mock/所有隔離DB・既存manual-note-fixture（autosave intervalのみ抑制）により、保存関連Aが不変でも本文競合後の「確認した内容を基準に再試行」が未保存の関連Bをuncheckedへ初期化することを各1件測定した。最新内容GETまではBを保持し、確認後も人間の本文/名前は保持されるが、Bだけが失われる。サーバー本文/名前/関連は外部の保存結果のまま。task/association-recovery-report.json、association-recovery-evidence/baseline/とpr82/、対応baseline log。

DocumentNodesは保存済みID集合をrefで記録し、新しいnodes DTOが同じ集合なら選択初期化をskipする。ID順や目標metadata/object identityを関連の意味の変化として扱わない。保存済みID集合が実際に変わる場合は既存のadoptionを維持する。新しい外部関連編集のmerge方針、API/schema、auto relation save/retry、本文の自動上書きは追加しない。

新規3browser+既存concurrency/relink2のfocused5が5.0sで成功。新規は単一/複数の保存IDでpending choiceと手書き本文/名前を基準確認後に保持、複数ケースではnodes DTO順をreverseし目標metadataも更新、明示本文retryが関連を保存せず・明示関連saveで確定することを確認。commit済み関連PATCHの応答喪失は、明示GET/基準確認で変更済みID集合をadoptし、関連PATCHを自動再送しない。task/association-identity-focused.log。lint/typecheck/buildも成功。

PR82がmain4dab39dへマージ済みのためbaseを更新した。source退避のstash pop競合は#81のdirty/callback/guardを保持しつつ#83のsaved-ID-set effectを採用して手動解消、退避元stashとpatchを保持。#81のguard/feedbackを含む既存full check（予定unit132/integration58/browser94）、独立exact-head review、push/PR CI、merged-main Mock UIを行う。最終main4dab39dベースのnpm run checkはlint/typecheck/unit132/integration58/build/browser94全成功（23.5s）。task/association-identity-check-final.log。commit/push/PR/mergeはこの検証後に行う。

Native zoom/IME/包括的a11y、外部の関連ID集合が実際に変わる競合の新規解決方針、実外部資料/AI/本番deploy/実ユーザーデータの検証を行ったとは主張しない。
