# 新しいSOURCEレビューに原文の一部一致箇所を保存する

Issue #140。基点main `8ec882fbe709ec9072dfe5beb9cb090f28c501af`。長文末尾でPARTIAL_MATCHとなっても無関係な先頭1000文字だけが保存される問題を再現し、ユーザーが承認した軽量案を実装した。

## 保存する根拠

新しいSOURCEレビューだけで、既存判定が選んだ部分一致の文を取得原文からliteral検索する。その原文の一致箇所を含む1000 UTF-16単位以内の抜粋を保存する。可能なら前200単位の文脈を含め、書記素境界で切り出す。抜粋は原文の連続した部分文字列であり、AIによる文章生成・補完・正規化した原文への置き換えではない。最初の正規化一致位置を示すとは限らない。

原文で同じ表記が見つからない場合、一致箇所が上限を超える場合、安全な境界で保存できない場合は、理由と先頭抜粋を既存の説明欄・根拠欄に保存する。先頭の一つの書記素が上限を超えるなど、安全な抜粋がない場合は空の根拠と理由を保存する。不完全なUTF-16原文も理由付きで抜粋なしにする。正規化のみで一致する場合も判定はPARTIAL_MATCHのまま。

同じ取得資料の正規化はrun内で一度だけ実施し、同じ一致文の抜粋を再利用する。別run・別資料へキャッシュを持ち越さない。全面NFKC位置対応と巨大なoffset配列は導入していない。

判定は共通関数を用い、全文一致優先・部分文の20 UTF-16単位閾値・未取得と不一致の区別を維持する。2MBの取得上限と取得の安全対策、FULL/FACT_CHECK、過去のレビュー、引用原文、本文、Revision、本文移動操作を変更しない。既存のexplanationとexcerptへの保存だけで、API/Provider契約・DB migration・UIコンポーネント変更は不要。

## 実画面

基点mainの観察画像と変更後のMock実画面。比較する引用の文言・背景資料・Review ID・日時は別の実行で異なる。どちらも長い原文の末尾だけに部分一致があるケース。画像加工はしていない。

| ケース | 変更前 | 変更後 |
| --- | --- | --- |
| 長文末尾・1440px | [先頭のみ](source-literal-evidence/before-tail-only-1440.png) | [一致文を含む](source-literal-evidence/literal-1440.png) |
| 長文末尾・390px | [先頭のみ](source-literal-evidence/before-tail-only-390.png) | [一致文を含む](source-literal-evidence/literal-390.png) |
| 正規化のみの一致 | — | [理由1440px](source-literal-evidence/fallback-reason-1440.png) / [理由390px](source-literal-evidence/fallback-reason-390.png) |
| 同一資料への48実登録 | — | [各引用の指摘](source-literal-evidence/many-48.png) |

取得資料の先頭抜粋を開いた状態: [1440px](source-literal-evidence/normalized-only-1440.png)、[390px](source-literal-evidence/normalized-only-390.png)。長い先頭抜粋では説明欄はスクロール上方にある。

## 検証

新規unit 18件。旧1000境界と長文末尾、raw substring、書記素境界、全文一致優先、20単位閾値、全角・空白・結合文字の正規化のみの一致、上限超過と巨大書記素、FULLの従来の抜粋を確認。約1.8MBの同一資料へ同文384引用と異なる384文を照合し、取得1回、資料の正規化1回、引用IDと根拠の対応を確認する。タイミングを固定値で合否判定しない。

新規integration 1件。専用PostgreSQLと一時Markdown保存先でSOURCE受付・実行・根拠保存・GETを検証。後から取得原文を正規化のみの一致へ変えて再レビューしても、旧runの取得根拠と現在のDocumentDetail全体が不変。

新規browser 5件。通常のautosaveタイマーを維持し、390/1440pxでliteral抜粋と理由を表示する。2つの同文登録は別IDのまま、SOURCEの本文offsetはnull、本文移動なし、UI本文PUT 0回、DocumentDetail不変。取得原文が変わった新runはNOT_FOUNDとなり、旧runのGETと表示は元の根拠を保持する。48件は実際のAPI引用登録で作成し、約1.8MBを安全な取得関数のMock transport経由で取得し、48指摘と取得1回を確認する。

browserは、APIサーバーに通常のノート・引用登録を任せ、所有するDB fixtureに固定済み引用のQUEUED runを作り、実際のservice.execute、pipeline、保存、API GET、React表示を通す。最初は別プロセスからservice.startを呼び、APIサーバーの保存中intentを回復してしまうテスト上の競合が再撮影時に1回発生した。開始fixtureを変更してその第二の保存回復処理を除去した。製品の単一プロセス保存モデルは変更していない。このbrowserテストは受付やボタンによるレビュー開始の検証を主張しない。受付は上のintegrationと既存API/browserテストで検証する。

全チェックは `npm run check`（lint、typecheck、unit、integration、build、browser）。最終件数とexact head CIはPRに記録する。元の45変更・HEAD・statusはハッシュで確認し不変。ユーザーDB・実AI・本番配置・認証・権限は変更していない。native IME/OS支援技術は未検証。

## 実パイプラインの性能

Node 24.13.0、接続Mac、単独実行。約1,999,999 bytes以内のMock取得文字列、warmup 1回後に3回実行した中央値。FULLのSOURCE段階（claim抽出は空Mock）を従来の資料正規化方法の比較対象とし、両者で判定・取得1回・各引用IDを検証した。ネットワーク・DB・UIの時間を含まない。全チェックと同時に実行した初回の数値は負荷が競合したため、この表には使用していない。

| 資料 / 引用 | 従来方式 ms | 新SOURCE ms |
| --- | ---: | ---: |
| ASCII / 同文1件 | 7.66 | 11.57 |
| ASCII / 同文10件 | 69.42 | 7.08 |
| ASCII / 同文384件 | 2788.45 | 41.99 |
| NFKC変換を含む前方 / 同文1件 | 8.41 | 9.61 |
| NFKC変換を含む前方 / 同文10件 | 88.66 | 10.45 |
| NFKC変換を含む前方 / 同文384件 | 3331.23 | 42.29 |
| ASCII / 別文384件 | 3271.90 | 406.51 |
| NFKC変換を含む前方 / 別文384件 | 3592.56 | 94.17 |

[数値・全サンプル](source-literal-evidence/performance.json)。再実行は `npx tsx docs/verification/source-literal-evidence/benchmark.mts`（結果JSONを更新する）。1件では書記素境界を扱う準備の分だけ増えるケースがある。384件は検証用の形であり、引用数の上限・最大実行時間を意味しない。現行契約には有限の引用件数上限がなく、任意の件数・原文・環境に対する時間の保証はしない。引用上限やtimeout方針の変更は含めない。

## 旧headのCI失敗と時計fixtureの修正

`949b939a6987eedfb3832cfcafdbb6bbc231e172` は [PR CI](https://github.com/taiseimiyaji/kakudo/actions/runs/37889574975) 成功、[push CI](https://github.com/taiseimiyaji/kakudo/actions/runs/37889571158) は既存 `note-entry-read.spec.ts` の「note leaving cancels the old read and deadline while current human inputs remain」で初回・retryとも失敗（279 pass / 1 fail）。新しいSOURCEテストは成功していた。失敗を消すための単純な再実行やassert緩和は行っていない。

両traceのalertは旧GETの読取エラーではなく、新しいノートの自動保存結果を確認できないという表示だった。新しいノートへのPUTが約89msの実時間で中断されていた。テストはそのノート名を変更した直後に仮想時刻を45秒進めており、正常な実ネットワークの応答を待つ前に自動保存の期限まで進めていた。

新しいノートのPUT応答を250msだけ遅らせる制御実験で、変更前main `8ec882f` と同じテスト条件に保存alertを再現した。SOURCE処理はこのケースで実行しない。旧GETのrouteは、対象外のリクエストを `route.fallback()` にして、別途登録した新しいノートのPUT routeへ渡す。

```ts
await page.route(`**/api/documents/${document.id}?*`, async route => {
  if (route.request().method() !== 'PUT') return route.continue();
  const response = await route.fetch();
  await new Promise(resolve => setTimeout(resolve, 250));
  await route.fulfill({ response }).catch(() => {});
});
```

修正は1秒のtick後、実際の保存名とUIの「保存済み」を待ち、その後に旧GETの期限を45秒進める。保存回数も新ノートでは1、ノードの作成フォームでは0と確認する。旧GETの取消・取得回数1・alertなし・人間の入力保持というassertを維持した。同じ250ms応答遅延で修正後は成功し、通常のautosaveを含む読取・自動保存browser 23件が成功した。手動保存fixtureでintervalを遅らせる初案はClock APIに上書きされ無効だったため採用していない。製品のタイマー・保存期限・本文・SOURCE実装の変更はない。新headの全チェックと両CIを改めて確認する。
