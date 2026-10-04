# Issue #81 — ノートの未保存の関連選択

main5536c133、Chromium/Mock/所有隔離DBで、Aに関連するノートの関連編集でBをcheck→header保存済み→Home移動dialog0→再表示B unchecked/DB Aのみを測定した。対照の「学習項目と目標を再取得」は選択Bを保持する。最初のrefresh消失という仮説は測定で否定されたので、修正対象にしない。task/association-draft-report.json、association-draft-evidence/final/、association-draft-baseline-final.log（2件成功）。

関連選択と保存済みnode ID集合の差、関連保存busyをstable callbackでDocumentSessionへ伝え、既存の単一departure/before-unload guardへ集約する。関連formの近くに未保存表示を出す。選択を戻すか成功した関連保存で保護が解除される。本文の保存/自動保存、資料draft、目標の再取得はそれぞれの既存状態を維持する。本文の既存自動保存を維持し、関連の自動保存は追加しない。server API/schema/Context Version/Reviewの基準Revisionを変更しない。

ブラウザ回帰はリンク/history/reloadのcancel・選択revert・accepted departure、390pxの実1秒autosave/明示note save/再取得による関連choice保持、関連保存が資料draft保護を解除しないこと、known500失敗後の選択/guard保持と明示retry、全関連解除のpending保護/1PATCH/保存後の内容保持を確認する。既存の再関連付け/目標/本文draft/review stale/return linkケースも併せて実行する。

初回focused5件中4成功・1失敗は、cancelされたhistory navigationをPlaywright page.goBackが待ち続けるfixture timeout。既存resource navigation回帰と同じhistory.back呼出とdialog/選択結果pollへ変更し、製品sourceや受け入れ条件を変えて通したものではない。task/association-draft-focused.logを保持する。

実ユーザーDB/Markdown、実AI/実外部資料取得、アクセス/公開設定、本番deployには触れない。新しいContext失敗回復APIや自動retryは追加しない。Native zoom/IME、包括的a11y、複数端末の新しい競合仕様を検証済みと主張しない。

修正後focused新規4+既存1の5件は4.6sで成功。main2578a45をベースにnpm run checkのlint/typecheck/unit132/integration58/build/browser91がすべて成功（22.7s）。task/association-draft-focused-final.log、association-draft-check-final.log。
