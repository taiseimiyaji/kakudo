# Issue #27: 障害ログと保存領域の確認

2026-09-18。APIにserver生成request IDを付け、request/error/healthをJSONログで関連付ける。Review障害・FAILED記録失敗・所有lock喪失も固定のreasonとIDで記録。例外本文・ノート・header・URL/queryは記録しない。

healthに保存先の実書込み/fsync・空き容量確認を追加。容量閾値の既定は100 MiB。失敗は503で、DB障害と保存先障害を区別する。Macログの停止中rotation（10 MiB以上、7世代保持）と日常の確認手順を追加。

- `PG_BIN_DIR=/opt/homebrew/opt/libpq/bin npm run check`: lint / typecheck / unit 80件 / 専用DB integration 39件 / build / Chromium 14件成功。
- エラーに秘密文字列を注入し、レスポンス・ログへ出ず、同じrequest IDで500を追えることを確認。
- 実一時directoryで書込み・プローブ削除・容量不足・保存先不存在・書込み権限不足を検証。DB障害応答とProvider/DB書込み障害の既存テストも通過。
- 一時ログでoffline指定なしの拒否、11 MiBログのrotation、7世代保持をCLIで確認。

外部監視サービスへの通知設定・長時間のログ蓄積は未実施。Macのrotationはサービス停止中に運用者が実行する。

CI初回はbuild前のserveStatic警告をunit testがJSONとして解析して失敗。ログのテスト対象をAPI単体へ変更し、静的buildの有無に依存しないよう修正した。
