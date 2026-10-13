# 閉じられる本文全文検索（Issue #150）

ユーザーが長文の執筆支援として全文検索を指定した。基準mainは `ea2fc10a622ad519f619c8abb1620d92988a70a1`。現行版にはCodeMirrorの検索keymap/panelがなく、新しい390/1440pxの受け入れテストは「本文を検索」がない箇所で失敗した。先行監査の `window.find` と実ブラウザーの検索バーは別扱いで、後者は未検証のままである。

公式 `@codemirror/search` 6.7.2を固定し、全文検索・一致範囲の選択・装飾・前後への移動を使う。panelだけを文字列検索のcontrolsに絞った。本文のsearch query入力はselectionを動かさず、移動操作で一致箇所を選択する。閉じると本文へfocusを戻す。ヘッダーの実高さに追従してpanelを表示し、長文の一致箇所は中央へ移動する。検索stateは現在のEditorViewにだけ保持される。

## 検証の範囲

- 通常時計、Chromium390/1440px、未描画の複数一致、前後・折返し、literal記号、一致なし・空query、buttonsとnative keyboardを確認する。
- 検索語入力だけのselection不変、閉じると一致selectionと本文focusを保持、同じEditorView、検索操作だけの書き込み0と保存済みdetail全体一致を確認する。
- CRLF/Unicodeの長文で一致選択→native Paste→引用を登録し、元Markdownの正しいoffsetだけが置換されること、全文・selectionのUndo/Redo、Mockの登録引用・人間の目標・Revision、再読込後のAPI detail一致を確認する。
- selectionからCmd/Ctrl+Fで開き、検索せず閉じた後もnative typing Undo/Redoを保持し、390pxで文字拡大時の幅を確認する。
- 保存前の人間の追記も検索できること、queryが本文へ入らず、既存の自動保存は人間の追記だけを保存することを、制御時計で確認する。
- 複数行selectionの自動queryでは1行inputが改行を消し、表示と検索stateが異なることを実UIで再現した。複数行selectionでは空queryで開き、元selectionを保持して、人間が入力した単行queryだけで移動する。
- 通常執筆・自動保存・引用Undo・keyboard return・名前mode履歴など既存回帰と必須チェックはPRに最終結果を記録する。

初期本文・関連・人間の目標は所有するAPI fixture、その後の入力・検索・引用・Undoは実UIを使う。Mock/専用DB/一時Markdownでのみ検証する。Safari/Firefox・実Mac IME・実支援技術・OSのブラウザー検索バーは未検証。

初回focused runでは狭い画面の追加controlが本文開始位置を押し下げた。save detailと同じ行に収まる配置へ直し、既存の本文開始位置の期待値を維持した。長文fixtureの「全体を確認」は既存の主張20件上限でFAILEDとなったため、この引用検証には「出典を確認」を使う。上限を変更せず、登録引用・人間の目標snapshot・全文Revisionを確認する。初回traceも保存している。

本文生成・置換UI・正規表現・文書横断検索・永続検索履歴は対象外。保存/CAS・本文/名前mode・引用/Paste Policy・人間が本文を書きAIがレビューする方針を維持する。原本45ファイル・実DB・実AI・実資料取得・認証・本番・#128・保留PR135を変更しない。
