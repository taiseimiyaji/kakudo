# 運用手順

単一NodeプロセスでPostgreSQLとMarkdownを所有する。通常サーバーでもPCでもNode 24を使用する。

## バックアップ

DBだけ、またはMarkdownだけを取得してもWorkspaceは復元できない。両者を同じ停止期間に取得する。

1. 入口からの更新を止め、Nodeを停止する。自動再起動のサービスも停止し、外部エディタによるMarkdown変更も止める。DBは起動したままにする。
2. PostgreSQL 17の `pg_dump` / `pg_restore` を用意する。PATH外なら `PG_BIN_DIR` にそのdirectoryを設定する。
3. `DATABASE_URL` と `CONTENT_STORAGE_ROOT` を確認し、保存先と別のdirectoryに新しい世代を作る。

```sh
npm run backup -- create /absolute/backup/kakudo-20260918 --offline
```

`--offline` は書込み停止を実施済みという指定で、サービスを停止する機能ではない。未回復の保存journalがある場合は失敗する。その場合はアプリを一度起動してDocumentへのアクセスで回復を完了し、再び停止する。

バックアップには `database.dump`、`content/`、最後に書かれる `manifest.json` が入る。manifestにはSHA-256と作成日時を記録する。既存世代は上書きしない。途中失敗は非0終了し、その未完了directoryを削除する。元のDB・Markdownは変更しない。保存先は700、ファイルは600で作る。

初期運用の方針は、利用した日の終了時と更新直前に取得し、日次7世代・週次4世代・月次3世代を残す。成功した組を暗号化した別媒体へ同日中にコピーし、manifestとファイルの一致を確認する。世代削除は新世代の復元確認後に行う。別媒体の保存先は運用者が決め、秘密設定・Provider認証の回復方法は別に保管する（バックアップに.envや認証情報は含めない）。毎月およびDB/schema変更後に復元試験を行う。

定期実行する場合も「サービス停止→取得→別媒体コピー→成功記録→起動」の順を守る。コマンドの非0終了とmanifest欠落を失敗として確認し、失敗時は既存世代を削除しない。稼働中のPostgreSQLデータdirectoryを単純コピーしない。

## 復元と更新失敗時の切戻し

1. 元のDB・Markdownを維持したまま、別名の空DBと、まだ存在しないMarkdown保存先を用意する。対象PostgreSQLへ接続するroleは事前に用意する。
2. 復元先を明示し、信頼できる自分のバックアップを復元する。

```sh
# 接続先は.env等で設定し、shell履歴にpasswordを残さない。
# RESTORE_DATABASE_URL=...（元と別名の空DB）
# RESTORE_CONTENT_ROOT=/absolute/data/kakudo-restored（未作成）
npm run backup -- restore /absolute/backup/kakudo-20260918 --offline
```

チェックサム不一致、元と同名のDB、空でないDB、既存の保存先、backup内への復元は拒否する。DBは `pg_restore --single-transaction` で復元し、エラー時の部分適用を避ける。失敗時は自動作成した復元先ファイルを削除する。復元元のバックアップは消費しない。

3. バックアップ時と互換なコードを配置し、別ポート・非公開の入口で、復元DB/保存先へ1プロセスだけ起動する。本文、current Revision、過去Review・Evidence、引用、Node/Documentと資料の関連を照合する。中断Reviewは起動時にFAILEDになるため再実行する。
4. 問題がなければ旧プロセスの停止を確認し、起動設定を復元DB/保存先へ切り替える。切戻し完了まで旧データを残す。

通常更新は、停止・バックアップ→新コードの依存導入/build→migration→起動→healthと保存/Review確認の順。migration後に旧コードだけへ戻すことは避け、失敗時は更新前のバックアップを別DB/保存先へ戻し、対応するコードと一緒に切り替える。

参考: [PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)、[pg_restoreのトランザクション復元](https://www.postgresql.org/docs/17/app-pgrestore.html)。
