# Issue #142 — キーボードで同じ執筆位置へ戻る

資料URL欄にfocusした後、Shift+Tabで長文へ戻ると、本文の先頭が表示されたまま選択箇所が画面外に残っていた。CodeMirrorのanchor/head、本文、Undoは保持されていた。ユーザーが承認した限定案に従い、本文外controlからのTab / Shift+Tab復帰だけ、入力位置のheadを可視化する。

同じキーイベント内のTab意図とfocus元を照合し、CodeMirrorの計測でheadの位置を確認する。固定ヘッダーとvisual viewportの間にheadが収まるように、必要な縦移動だけを一度行う。選択のanchor/headやEditor Stateは変更しない。長い選択の範囲全体やanchorへの移動は行わない。

新しいキー、pointer、wheel、touch、resize、focus移動、scroll、文書/選択変更で予約を無効にする。計測のread/write両段階で文書・選択・focus・scrollを照合する。既存のプログラムfocusは明示的に予約を取り消す。閲覧→編集の記録位置、編集中の編集再押下の現在位置、指摘への移動、Undoの入力位置を維持し、Editor破棄時に所有listenerを解除する。

## 実測

比較前はmain `ecfc4d205831927f0b5171cf89c6478ae6dadf42`。同じ10,561文字の固定本文、通常のブラウザー時計、所有隔離PostgreSQL、一時Markdown、Review/Search Mock、Chromium。資料登録→論理レビュー→Shift+Tabで本文復帰→native Undo/Redo→追加入力・通常自動保存の一つの旅程で測った。

| 幅 / 高さ | 復帰したhead上端：前 → 後 | ページscrollY：前 → 後 | 固定ヘッダー下端 |
| --- | --- | --- | --- |
| 390 / 1000px | 2433.3 → 977.3px | 0 → 1456px | 109px |
| 1440 / 1000px | 2576.1 → 976.1px | 0 → 1600px | 65px |

[390pxの復帰画面](assets/keyboard-writing-return/review-return-390.png)、[1440pxの復帰画面](assets/keyboard-writing-return/review-return-1440.png)、[実測JSON](assets/keyboard-writing-return/measurements.json)。表示位置は中央へ揃えず、画面端から約4pxの余白を取る最小移動とした。

同じEditor、短い逆方向選択、順方向/逆方向の長い選択、collapsed caret、前方Tabを確認した。復帰だけでは本文PUTが増えない。人間入力の選択範囲から期待全文を計算し、GET200の全文、Editor全文、保存済み表示、PUT成功を照合する。Undoは元本文の全文、Redoは変更本文の全文、続く入力は期待全文と一致する。要求数は1秒の保存境界によって変わり得るため固定しない。

DOM選択を残して見出しだけから戻る比較では、すでに見えるheadへ追加のscrollを行わないことを確認した。マウスはクリックした本文位置を選び、既存の編集ボタンと閲覧/編集復帰は、それぞれ現在位置と記録位置を保持した。

取消検証は時計全体を止めず、この機能の名前付き計測要求だけを一度保留する。無操作の対照はscrollY0からheadを可視化する。保留中のCmd/Ctrl+Home、scrollTo、実wheel、別controlへのfocus、閲覧へのpointer操作、既存編集ボタンのプログラムfocusは、それぞれの位置を決めた後に要求を解放しても上書きされない。CodeMirror自身のfocus処理や通常のcaretスクロール、自動保存は通常時計のまま動く。

## 検証と限界

修正前の回帰2件は、390/1440px両方でheadが画面外にあることを検出して失敗した。最初のfocused検証は16成功・新規2失敗で、1秒の保存境界を跨ぐ要求数を固定したfixtureとclock停止時刻の競合を訂正した。続く全チェックでは295単体・66統合・283ブラウザーが成功し、新規の取消fixture1件が失敗した。traceでは新しいCmd/Ctrl+Home自身の遅延scrollを誤って失敗扱いしていた。可視化要求だけを保留し、新しい操作自身の位置が落ち着いてから解放する方式へ変更した。製品の取消条件や受け入れ条件を緩めたものではない。

最終 `npm run check` はlint・typecheck・build、単体295件、専用DB統合66件、Chromium285件がすべて成功（ブラウザー1.2分）。検証した製品・テストのcommitは `a98c6e06f1fd514c756fc95fe8fad2396f487931`。通常時計の新規5件と既存の閲覧/編集、指摘移動、履歴、引用Undo、自動保存を含む。StrictMode専用の追加実測は今回行っていない。

OSのフルキーボードアクセス、日本語IME、Safari、支援技術、実AI、実資料取得、人間の集中のしやすさは未評価。元45ファイルと実ユーザーDBを変更せず、認証・本番配置・Issue128の仕様も変更していない。現在の本文Editorは文書に合わせて伸び、縦scrollはページが所有する構成を対象とする。
