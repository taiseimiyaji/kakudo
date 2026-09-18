# 公開経路の設定と受け入れ確認（Issue #29）

現在はlocalhost限定で検証済み。公開ドメイン・Cloudflareアカウント・許可利用者・恒久配置先は未確定であり、本書の設定は未適用、HTTPS実経路は未検証。公開する場合は以下を完了してから運用開始する。

## 設定前に確定する値

| 項目 | 記録する値 |
| --- | --- |
| 配置先 | ホスト、OS、サービス実行ユーザー、checkout、DB、保存先 |
| 公開URL | HTTPS origin（例 `https://kakudo.example.com`） |
| 入口 | Cloudflare Tunnel + Access、または認証付きreverse proxy |
| 許可利用者 | 明示的に許可する本人のメールアドレスまたはIdPグループ |
| 運用担当 | Access設定・停止・バックアップを実行できる担当者 |

トークン、認証cookie、接続passwordはIssueやリポジトリに記録しない。アプリは単一Workspaceを許可利用者間で共有する。利用者ごとのデータ分離やアプリ内認証は提供しない。

## Cloudflare Tunnelを同じホストで動かす構成

1. #25のサービスを非公開で準備し、#24のバックアップ・復元と#28の実Providerを確認する。Nodeは `HOST=127.0.0.1`、`PORT=43171`。DBのCompose設定は127.0.0.1へのbindを維持する。ルーターやfirewallでNode/DBへのport forwardingを作らない。
2. 公開する**前に**Cloudflare Accessのself-hosted applicationを作成する。対象は公開hostname全体（path制限なし）とし、UI・静的asset・`/api/*`をすべて含める。Allowを本人のアドレス/グループに限定し、Everyoneの許可やBypassを置かない。より細かいpathの別applicationや別hostnameが保護を迂回しないことを確認する。
3. Named Tunnelの公開hostnameを `http://127.0.0.1:43171` へ転送し、**Protect with Access**を有効にして対応するAccess applicationのtokenを検証する。Tunnelは入口だけで、NodeアプリとDBは引き続きホストで動く。
4. Nodeの `ALLOWED_ORIGINS=https://kakudo.example.com` を実際の公開originに置き換える。パス・末尾slashは含めない。不要な開発originは除く。設定ファイルを600に保ち、Nodeサービスを再起動する。
5. cloudflaredを常駐化し、ホスト再起動後の復旧を確認する。Nodeと同様、実行ユーザー・設定位置・停止コマンドを記録する。Tunnelが動いてもDB/Nodeが停止すれば利用できない。

Access applicationを先に作成し、cloudflaredでtokenを検証する構成は[Cloudflare公式手順](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)に基づく。設定画面の詳細は同ページで確認する。

originのloopback直接アクセスはこのホスト上の信頼したプロセスには可能。ローカルOSユーザーを信頼境界に含める。別ホストからoriginに到達できる構成では、この前提だけで迂回を防げない。

## 通常サーバーの入口

同一ホストの認証付きreverse proxyでHTTPSを終端し、全pathを認証・許可利用者の判定後にloopbackのNodeへ転送する。UIだけを保護してAPIを無認証にしない。外部公開portはHTTPS等の必要な入口だけとし、NodeとDBのportは閉じる。proxyが別ホストの場合は、private network/firewallとorigin側認証で迂回を防ぐ構成を別途検証する。

`Origin` を書き換えてCSRF検査を回避しない。ブラウザからの公開originをNodeが検証する。CSRF拒否は利用者認証の代わりにはならない。

## 公開前の実経路テスト

実ノートを置く前に、人間の検証用ノートだけで試す。ブラウザは許可ユーザー、許可外ユーザー、ログアウト状態を別profile/シークレットウィンドウに分ける。認証情報を含むHARやtraceは保存しない。

| 経路・利用者 | 操作 | 必須の結果 |
| --- | --- | --- |
| 未認証 | HTTPSの `/` と `/api/documents` を取得 | Accessログインへの誘導または拒否。SPA/データを返さない |
| 未認証・許可外 | 正しいOriginとJSONで `/api/documents` へPOST | 入口で拒否。Documentが増えない。CSRFの403だけをAccess成功とみなさない |
| 許可外ログイン済み | UI、API閲覧、更新 | すべて拒否。許可ユーザー用cookieを流用しない |
| 許可ユーザー | ノート作成・保存・再読込 | HTTPSで成功し、同じ本文とRevisionを確認 |
| 許可ユーザー | 実ReviewとEvidenceを確認 | 完了し、本文不変。Review中の編集後はOutdated |
| 許可ユーザー | 不正Origin、Originなし、非JSON更新 | 403/415で拒否。保存データに変化なし |
| 別端末・外部回線 | originのIP、Node port、DB portへ接続 | 到達不可。IPv4/IPv6、LAN、別hostnameも確認 |
| セッション期限切れ | 閲覧・保存を再試行 | 再認証または拒否。未保存本文を維持してから再認証 |
| ホスト再起動 | HTTPSから保存・Review | DB・Node・入口が復旧し、既存データを維持 |

GETの補助確認は `curl --max-time 15 --max-redirs 0 -o /dev/null -w '%{http_code}\n' https://kakudo.example.com/api/documents` で行える。302だけでは合格とせず、遷移先がAccessであり、データが返っていないことをブラウザでも確認する。試験POSTで作られたデータがないことは許可ユーザーから照合する。

実施日・commit・構成・各行の成否・request/review ID・未検証範囲をIssue #29へ残す。Mockの結果やlocalhostの結果をHTTPS経路の成功として扱わない。

## 異常時の停止

許可外アクセスやデータ露出を検出したら、まずTunnel/公開routeまたはproxy入口を停止して外部到達を遮断する。Access applicationだけを削除すると無保護になる可能性があるため、公開routeを生かしたまま削除しない。必要ならNodeも停止し、ログとバックアップを保全する。設定修正後、上の拒否確認から再実施して入口を再開する。

公開しない場合は#29を「localhost限定につき適用外」と記録できる。恒久配置先の再起動・バックアップ確認は引き続き必要。
