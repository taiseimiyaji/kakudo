# Issue #5 検証記録

2026-09-17。lint / typecheck / build成功。unit 48件、integration 18件、Chromium 10件成功。

- Document作成・通常保存・引用追加でRevision / SHA-256 / Snapshotが実ファイルと一致。
- 同内容保存・renameではRevision不変、A→B→Aでは3件、過去Snapshotは不変。
- 同時保存の1件を409で拒否し、成功した本文だけをRevisionへ記録。
- 保存失敗時のfile補償・DB rollbackでもRevision整合性を検証。
- 現在Revisionの参照はdocumentIdとの複合FKで別DocumentのRevisionを拒否。
- Browserで保存→同内容再保存→変更→再読込とRevision表示・履歴APIを検証。
- Staleness比較はRevision IDと本文Hashの双方で判定。Review UIは#8で接続する。

導入前のDocumentは次の保存で初回Revisionを作成する。外部エディタ変更は保存前にはSnapshot化せず、後続Review実装で保存済み内容と照合する。
