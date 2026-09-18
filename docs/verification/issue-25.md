# Issue #25: 常駐と単一プロセス

2026-09-18。Node 24の絶対パス、WorkingDirectory、運用.envを固定するLaunchAgent/systemd user unit生成を追加。DB所有lockを取得してからReview回復を開始し、二重起動を拒否。所有session切断時は停止する。Compose dbにはunless-stoppedを設定。

- lint / typecheck / build: 成功。
- unit 75件、TEST_DATABASE_URLのintegration 35件、E2E専用DBのChromium 14件成功。
- integrationで所有lock競合、解放後の取得、DB session強制切断の検知を確認。
- Macで生成plistをplutil検証し、一時LaunchAgentをgui domainへbootstrap。専用DB（末尾_test）・一時保存先・ポート43175で起動した。
- 検証ノートとRUNNING Reviewを用意し、別ポートの2つ目のNodeが拒否されても元ReviewがRUNNINGのままであることを確認。
- 所有NodeへSIGKILLし、launchdによる別PIDへの自動再起動、本文保持、FAILED/INTERRUPTEDへの回復、Mock Review再実行成功を確認。
- 一時LaunchAgentをbootoutし、専用DBと一時設定・保存先を削除。既存開発サーバーは置換していない。

未実施: 運用先への恒久インストール、Mac本体再起動後の確認、Linux実機。運用先が未確定のため本Issueはこれらの配置確認を残してopenとする。自動process再起動の成功をホスト再起動検証とは扱わない。
