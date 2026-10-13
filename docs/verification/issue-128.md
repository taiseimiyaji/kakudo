# Issue #128：既存URL再利用時の資料確認

## 判断と範囲

[#128](https://github.com/taiseimiyaji/kakudo/issues/128) の実測と、既存の資料登録契約を照合した。通常のPOSTは同じworkspace・URLのResourceを再利用し、入力した別の名称・種類では保存値を変えず、対象のノートまたは学習項目に関連付けて201を返す。一方、[#64](https://github.com/taiseimiyaji/kakudo/issues/64) の通信結果不明からのGET確認は名称・種類の完全一致を要求していた。今回の判断と理由は#128のコメントにも記録した。

「登録結果を確認」は元の対象GETのみを使い、documentではそのノート、nodeではその学習項目の関連、workspaceでは資料の登録済み状態を確認する。有効なResourceが同じworkspace・正規化URLで一意にある場合、現在の状態を確認済みとする。GETから失われた特定POSTの成功を断定しない。workspace一覧や他の対象はfallbackにしない。候補数は不正・別workspaceの候補も捨てる前に数え、返すIDは既存一覧と同じURIエンコード安全性を要求する。URLのpath・query・fragmentを独自に削らない。

保存済みの資料名・種類が入力と異なる場合は、双方の値を明示し、入力値が反映されなかったことを伝える。貼り付けDialogの確認説明は閉じた後もノート側に残す。GET失敗、対象一覧に該当なし、重複、別workspace、不正Resourceでは結果不明と入力を保つ。自動POST再送はしない。

API、POST、service、DB、Resource metadata、本文・名前、引用、Review、認証には変更を加えていない。フォームのsingle-flight・20秒期限、キャンセル、旧応答破棄、対象切替と離脱時のdraft保護を維持する。

## 検証

- 単体：metadataが異なる既存URLの確認、保存値と入力値の表示、別workspace・不正値・重複・URI非安全IDの拒否、path/query/fragmentの保持。
- 結合：既存URLをworkspaceとノートに再利用しても、Nodeとノートの関連は分離され、Resource名・種類は最初の値のまま。
- ブラウザー：ノートの実POST201確定後に応答だけを切り、対象GETのみで回復。Dialog後も説明・人間の未保存本文と名前が残り、画面からのPOSTは1件。Nodeでは別の項目だけに関連があるGETを陰性として扱い、対象の関連が後から成立した場合は現在状態だけを確認。workspaceの既存URLと異なるmetadataも同じルールで確認。
- 既存のlate GET、Dialog取消、Node切替、登録中の入力、20秒期限の回帰を含む全ブラウザーを実行。

lint・typecheck・build、単体297件、専用PostgreSQL統合66件、Chromiumブラウザー315件が成功。ブラウザーの最初の限定実行では旧文言を期待する既存1件が失敗し、新しいscope別表示へ期待値を更新した。製品の処理失敗はなかった。

Mockと所有する隔離DB・一時Markdownを使用。実AI、実資料取得、既存ユーザーデータ、本番、別ブラウザー、実OS IMEは検証していない。
