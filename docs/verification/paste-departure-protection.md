# 送信前の引用・貼付け入力の離脱保護（Issue #144）

## 再現と原因

2026-10-10、main `01239af0065fc329e16e973c8f9e141a54ba57e5` の実UI、Chromium 390 CSS px、通常時計、隔離DB・一時Markdown・Mockで確認した。

保存済みの4,883文字のノートを一覧から開き、通常のキーボードPasteで引用Dialogを開く。出典URL・出典名を入力してブラウザーの「戻る」を押すと、確認なしに一覧へ移動し、再び開くと引用と出典入力が失われる。同じ操作でも本文に未保存変更があれば確認が出て、拒否後に引用と出典入力を保持する。送信前は本文PUT・引用POSTとも0件、保存済み本文・Hash・write ID・Revisionは不変だった。

既存の離脱条件に、開いているPaste Dialogが含まれていなかった。修正前に新しいQuote/URL貼付け回帰2件を実行し、どちらも期待するconfirmが0件で失敗した。

## 変更

`client/pages/document.tsx` の既存の保護条件へ `paste` を加え、SPA離脱とbeforeunloadで同じ条件を使う。既存の確認文に「未追加の引用」を含める。

離脱を拒否すると現在の入力を保持する。明示的に離脱を許可すると移動でき、Dialogキャンセル後はその保護を解除する。引用や資料を自動送信しない。保存機構、Editor、Undo、Resource再利用の条件、端末に永続化するdraftは変更しない。

## 検証

追加したブラウザ2件は通常時計とnative Clipboard/ブラウザー戻るを使用する。保存済み本文で確認を拒否した後のURL・タイトル・引用文・Editor identity、許可後の離脱、キャンセル後のフォーカスと余分な確認の解除を確認する。全過程で本文PUT/引用POST/資料登録POSTは0件、保存済みDocument全体が初期値と一致する。

引用ケースではnative reloadのbeforeunloadを拒否し、同じ入力・Editor identityを保持した。既存の引用待機・Undo/Redo・保存結果不明からの回復と合わせたfocused browser 11件が成功（14.6秒）。全体チェック結果はPRに記録する。

## 限界

Chromium 390 CSS pxでの結果。Safari、実OSのタブを閉じるUI、全ブラウザーの履歴動作は未検証。beforeunloadは再読み込みで実測したが、同じ条件であることだけで他の環境の成功を主張しない。長文の初期内容はAPI fixture、引用は実ClipboardとUI入力。永久draft・クラッシュ後の復元は保証しない。実AI・実資料取得・ユーザーデータ・本番配置・認証は変更していない。
