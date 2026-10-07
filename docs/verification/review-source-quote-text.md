# 出典の指摘にレビュー時の引用文を添える

Issue #138。基点はmain `7da59ffca8b37e5bda8781bc4019e843c5678557`。同じ資料から複数引用したとき、出典の指摘に「レビュー時の引用文」を表示する。本文への移動・修正・新しい入力操作は追加しない。

## 対応と履歴

SOURCE pipelineは、固定済みのQuoteSnapshotから引用IDを指摘に渡す。指摘の保存時に生成したIDを同じ引用のSourceCheckへ記録し、両方を既存のtransactionで保存する。GETは `finding.id → sourceChecks.findingId → quoteSnapshot.id` の明示的な関係だけで原文を返す。

URL・文章・配列順からは対応を推測しない。重複した文章でも登録IDを別々に保持する。旧レビューなど対応情報がない場合や、対応が欠落・曖昧な場合は原文を表示しない。GETによる履歴の補完保存も行わない。既存JSONメタデータへの任意フィールド追加で、DB migrationは不要。

原文は人間が登録した引用であり、現在の本文・現在のQuote行・LLMの生成文ではない。SOURCEの `targetText` とoffsetは引き続きnull。Providerの出力契約・8,000文字のtargetText制限は変更しない。表示はReactのplain textで、引用内のHTML・URLを新しい要素として解釈しない。

## 画面比較

変更前は基点mainで観察済みの実画面。変更後は新規回帰テストの実画面。同じMock資料と引用を使用した。別実行のためReview ID・日時・フォーカス表示は異なり、変更後はja-JP / Asia/Tokyoで撮影した。画像加工は行っていない。

| ケース | 変更前 | 変更後 |
| --- | --- | --- |
| 同URL別引用・1440px | [画像](assets/review-source-quote-text/before-distinct-1440-review.png) | [画像](assets/review-source-quote-text/after-distinct-1440-review.png) |
| 同URL別引用・390px（本文とレビュー） | [画像](assets/review-source-quote-text/before-distinct-390-body-and-review.png) | [画像](assets/review-source-quote-text/after-distinct-390-body-and-review.png) |
| 同文重複・390px（本文とレビュー） | [画像](assets/review-source-quote-text/before-duplicate-390-body-and-review.png) | [画像](assets/review-source-quote-text/after-duplicate-390-body-and-review.png) |

同文重複では同じ原文が2つ表示される。この表示改善は内容を示すもので、2か所の位置を選び分ける機能ではない。

[現在の本文とは異なる過去snapshotの表示](assets/review-source-quote-text/after-past-snapshot-390.png) / [長い引用の390px折返し](assets/review-source-quote-text/after-long-quote-390.png)。

## 検証

新規unit 5件: FULL pipelineのSOURCE指摘と引用ID、同URL別引用と同文重複、順序変更、対応情報のない旧形式、欠落・曖昧な対応、別カテゴリへの混入防止。

新規integration 1件: 実PostgreSQLで引用IDと指摘IDを保存。受付後に現在のQuote行と本文を変更しても固定snapshotの原文を取得できる。旧形式の行は原文なしで読み、GET前後のrun行と現在の本文・Revision・保存メタデータが不変。

新規browser 6件: 同URL別引用および同文重複を1440px/390pxで確認。判定結果と原文の対応、本文PUT 0回、DocumentDetail全体不変、本文移動なし。Enterによるレビュー開始とTabによる既存ボタン順を確認。390pxで未保存の補足とUndo、同じEditor保持、本文変更後の過去レビュー選択、旧形式の履歴を検証。11,479文字の改行・空白なしの長い引用を省略せずplain text表示し、横スクロールと引用内HTMLの実行・画像取得がないことを確認。

詳細測定: [同URL別引用1440](assets/review-source-quote-text/distinct-1440.json)、[390](assets/review-source-quote-text/distinct-390.json)、[同文重複1440](assets/review-source-quote-text/duplicate-1440.json)、[390](assets/review-source-quote-text/duplicate-390.json)、[履歴と不変性](assets/review-source-quote-text/history-controls.json)、[長文](assets/review-source-quote-text/long-quote.json)。

初回の新規テストにはFULLのFACT指摘もSOURCE期待値に含めた誤りと、受付前に旧レビューの完了を読んだ待機不足があり、テスト側を修正した。Macのheadless Chromiumではnative select popupのEnd/Space/ArrowDown/Enterが期待した選択を変えなかったため、履歴は既存テストと同じselectOptionとfocus保持で検証した。Enter/Tab/入力/Undoはkeyboard操作だが、native selectのキー選択は未検証。製品側の変更でこの制約を回避していない。

全チェック結果はPRに記録する。既存Mockの固定RFCテキストと専用integration/E2E DBだけを使用し、実資料取得・実AI・認証・本番配置・ユーザーDBには触れていない。ネイティブIME、OSの支援技術、実利用者による評価は未検証。
