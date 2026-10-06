# Tasteprint Export のkakudo試用（採用保留）

生成ZIPを実際のkakudoへ取り込んだ結果、依存解決・型検査・ビルドと代表部品の操作は成立した。iframeでは既存執筆UIのCSS、フォーカス、Undo、自動保存を保持できた。直接importしたCSSは既存画面の色・幅を変更し、SPA画面遷移後も残る。現在のZIPをそのまま既存執筆画面に採用することは見送る。独立ページ／iframeは比較用として使える。

このブランチは試用だけで、mainへマージしない。執筆UIの置換、認証・権限・保存機構の変更は含めない。

## 入力と比較条件

- kakudo基準main: `9e8490573093a931f0c7f3c9cf0bff3e2f48f2a0`。
- tasteprint基準main: `319e18b84995957f0ea8f0d8ab848d2f5ab1b26f`、テンプレート `preview-9`。
- 専用一時SQLiteの新規プロジェクトr1から、製品の `ProjectService.exportBundle(..., "omit")` で生成した実際のZIP。個人の保存済みTasteを使わない初期デザインであり、kakudo向けにAIで仕立てたデザインではない。実AI呼出し0。
- [元ZIP](tasteprint-export/tasteprint-export.zip) のSHA256: `e3fcc90ebe948265d5098d7661eeee34a2954a57fb84ddbe94218427b70c3e48`。
- ZIPの23ファイルを `client/tasteprint-export/` へ展開。ファイルは修正せず、[出所・各ファイルのハッシュ](../../client/export-trial/origin.json)で確認する。vendored sourceはkakudoのtsc対象。ホスト側のESLintルール適用だけをこの固定ディレクトリに限定して除外した。
- ホストはReact/React DOM 19.3.0、TypeScript 5.9.3、Vite 8.3.0、Zod 4.6.5のまま。不足した `lucide-react@1.43.0`、DM Sans/Manrope各 `5.3.0` の3依存だけを追加し、lockfileを記録。
- 直接比較: `ui/index.ts`経由のZIP CSSあり・代表部品だけRuntimeThemeあり。既存執筆UIはその外側。
- iframe比較: 同じZIP CSSとRuntimeThemeを別documentへ適用。iframeの幅はホスト1440px時約396px、390px時約340px。別途ListPageを独立ページとして実幅1440/390pxでも確認。

## 結果

| 確認 | iframe／独立ページ | 直接読み込み |
| --- | --- | --- |
| 日本語入力・ラベル・Select | 成立 | 成立 |
| Tabsの矢印/Home・選択・disabled | 成立 | 成立 |
| DialogのTab循環・disabled除外・Escape/Cancel/Confirm・フォーカス復帰 | 成立 | 成立 |
| 代表部品内の操作で親フォームのsubmitが増えない | 成立 | 成立 |
| 明示Save comparisonだけがsubmitを1増やす | 成立 | 成立 |
| CodeMirrorインスタンス、入力中フォーカス、Undo、自動保存 | 保持 | 保持 |
| ホストのCSS測定値 | 比較前と同じ | 色・タイトル幅に衝突 |
| 比較終了／SPAでMapへ移動した後 | ホストに漏れなし | CSSが残る |

1440pxのノート画面で、直接読み込みは `--paper: #f6f5f0 → #f5f6ef`、`--ink: #233a32 → #30352d`、タイトルtextarea幅 `672 → 630px`。測定した本文・タイトルのfont-family/font shorthandは同じだった。390pxでも色の衝突を再現。全体CSSの `:root`、`input/textarea`、`.workspace` 等が原因で、routeのlazy importだけではスコープを隔離できない。再読込した元ノートでは比較前のCSSへ戻る。

エディタを開いたまま比較UIを追加し、同じDOMインスタンス・フォーカスを確認。仮入力をUndo、`A`を保存、直接読み込み後に`B`を保存、Undo後に`A`を再保存して、専用DBのGET結果と照合した。既存エディタ／NoteSession／Markdown保存コードは変更していない。

## 比較画像

| 幅 | 比較前 | iframe | 直接読み込み |
| --- | --- | --- | --- |
| 1440 | [画像](tasteprint-export/editor-before-1440.png) | [画像](tasteprint-export/editor-iframe-1440.png) | [画像](tasteprint-export/editor-direct-1440.png) |
| 390 | [画像](tasteprint-export/editor-before-390.png) | [画像](tasteprint-export/editor-iframe-390.png) | [画像](tasteprint-export/editor-direct-390.png) |

[独立ListPage 1440](tasteprint-export/list-isolated-1440.png) ／ [390](tasteprint-export/list-isolated-390.png)。ノートの比較パネルは小画面で本文に重なる実験用オーバーレイで、採用UIではない。iframe内の代表フォームもnative配置の動作検証であり、kakudoの完成UI案ではない。

## 検証と実行

ローカル検証: lint、typecheck、本番build成功。既存unit **272/272**、integration **64/64**、既存ブラウザ **262/262**、試用ブラウザ **6/6**。ブラウザはChromium、1440/390px。専用PostgreSQL 17コンテナの55682番、専用DB `kakudo_tasteprint_test`／`kakudo_tasteprint_e2e_test`、API/UI43282番、runnerが生成・削除する一時Markdownだけを使った。review/searchはMock。integrationのバックアップ復元には既存 `/opt/homebrew/opt/libpq/bin` を `PG_BIN_DIR` に指定。通常設定の43172/43173/43174は使っていない。

```sh
npm ci
npm run typecheck
npm run lint
npm run build
# 独立した *_e2e_test DBをE2E_DATABASE_URLへ明示し、他DBとの同名指定を避ける。
npm run test:browser -- --config=playwright.export-trial.config.ts
# 同じ独立DBを順番に利用。こちらは既存262件、43282番を使う。
npm run test:browser -- --config=playwright.export-regression.config.ts
```

開き方: `/workspaces/default/export-trial`。既存ノートでの比較はノートURLへ `?tasteprintTrial=1` を付ける。通常のノートURLでは比較パネル／ZIP CSSを読み込まない。独立表示は `/export-trial-render.html?screen=list`。

## 保護・未確認・採用判断

元 `/Users/taiseimiyaji/private/kakudo` のHEAD `e88923f…`、未コミット45ファイルのハッシュ・status件数は開始時と一致。元cloneのGitメタデータも更新せず、workspace内の別bare cloneから独立worktreeを作った。PR134のworktree・DB55450・予約ポート43172/43173/43174に書込・停止・削除を行っていない。

ZIP READMEにもある独立ページ／iframeの境界を実アプリで確かめた結果なので、直接importのCSS衝突は今回tasteprintの不具合修正へ混ぜていない。既存執筆UIへ採用するなら、CSSをコンポーネント単位へ限定する設計・比較画面の配置・日本語／kakudoドメインへの適用範囲を先に決める必要がある。全状態・全部品、他ブラウザ、PR134との組合せ、実データ・実AI・本番環境は未検証。今回の試用は安全な操作境界の確認であり、本番採用の承認ではない。
