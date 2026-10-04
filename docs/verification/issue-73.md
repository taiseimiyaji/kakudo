# Issue #73 — 資料登録の入力と移動確認

main `145ab653` の実ブラウザで、資料登録POSTの500応答後に「入力内容は保持されています」を確認してからノートへ移動・資料へ戻ると、dialogが一度も出ずURL・資料名・種類が失われた。node Aで資料URL/名前を入力しBを選択してAに戻る操作でも、dialog 0回で入力が失われた。原本のDBとMarkdownを使わず、所有する隔離PostgreSQLとMock providerで測定した。

資料登録フォームは入力をcontrolled stateとして保持し、入力変更・登録/GET確認中・結果不明を所有画面へ通知する。Workspace/Document/Roadmapの既存TanStack Router blockerにこの状態を統合し、ノート本文や目標も編集中の場合の確認を1回にする。node選択にも同じ資料状態を含める。新node作成応答後の自動選択は、その間に入力した資料があれば行わない。明示的に移動確認を受け入れた場合は入力の破棄を許可し、別scopeのフォームへ引き継がない。

入力を元に戻す、登録成功、GETによる登録済み確認で保護を解除する。ノートのautosave/手動saveやマップ/nodeのsaveでは資料の入力をclearしない。POSTの自動再試行、client timeout、永続draft保存、認証・API・DB/schema・SSRF/取得変更は含まない。URL貼付dialogの明示キャンセルは従来どおりで、今回の移動保護はWorkspace/Document/Node資料パネルを対象とする。

実操作回帰6件: 失敗後のkeyboard link/履歴/reloadキャンセル→正常再試行、種類だけの変更・元に戻す・明示破棄、node/map選択キャンセル・同時目標/説明draft・refreshと遅延node作成、登録中のnode切替キャンセル/受入と旧scopeへの登録完了、ノートautosave/手動保存と資料draftの分離、POST応答喪失→移動キャンセル→GET確認（POST 1回）。フォーカスした6件は成功。既存のURL貼付・引用dialog・Review・選択・資料結果不明テストは全チェックで確認する。

制約: Chromiumでのkeyboard/通常viewport操作。OS/browserの強制終了・native zoom・包括的a11y・永続的な入力回復を検証済みとは主張しない。通信中に明示的な移動を受け入れると、その登録自体は元scopeで完了し得る。実AI・実ユーザーデータ・公開設定は触れていない。

2026-10-04 `npm run check` 全成功: lint / typecheck / unit **132** / 専用PostgreSQL integration **44** / build / Chromium **73**（22.6秒）。
