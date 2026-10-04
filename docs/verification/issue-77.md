# Issue #77 — 資料の宣言文字コードと出典照合

main145ab653のcreateResourceFetcherにHTTP header charset=Shift_JIS/EUC-JPと、それぞれのbyteで符号化した日本語HTMLを渡すと、資料名・本文がUTF8で文字化けしたまま取得成功として返った。完全一致する引用「認証と認可の違いを、自分の言葉で説明する。」をmatchQuoteへ渡すとVERIFIEDではなくNOT_FOUNDだった。task/charset-baseline-results.jsonに原文・取得本文・判定を保持。実通信・実AIを使わずIncomingMessageのMock transportで確認した。

Node標準MIMETypeでContent-Typeとcharsetパラメーターを解析し、宣言charset（未宣言なら従来のUTF8）をNode24のTextDecoderへ渡す。fatal decodeを必須にし、unsupported label・空charset・不正byte列をResourceUnavailableにする。HTML本文のsanitizeと引用比較はそのまま。ストリームはbyte単位の上限を先に検証してからまとめてdecodeし、redirect/DNS全回答/接続IP固定/timeout/圧縮拒否を変更しない。依存追加、charset推測、HTML meta sniffingは含まない。未宣言legacy byteがUTF8として不正なら、壊れた正常資料にせずUNAVAILABLEにする。

[Node24 TextDecoderの公式資料](https://github.com/nodejs/node/blob/v24.13.0/doc/api/util.md#class-utiltextdecoder)と実際のNode24.13.0でShift_JIS/EUC-JP対応とfatal decodeを確認。NodeのICU構成により扱えないcharsetは取得不能となる。誤ったheader宣言や宣言と異なる符号化を自動修復する機能ではなく、正しい宣言がある資料を対象とする。

Mock transport回帰はShift_JIS/EUC-JPの資料名と日本語本文/VERIFIED、quoted/case-insensitive headerとsanitize、UTF8/no charset/Markdownと分割byte、unsupported/空charset、不正UTF8/Shift_JIS/EUC-JP、charset欠落時の不正UTF8、decode前のbyte上限を確認する。実ユーザーDB/MarkdownとAI provider・認証/公開設定を変更していない。

最終main5536c13ベースのnpm run checkはlint/typecheck/unit132/integration58（追加14）/build/browser87全成功（22.0s）。task/resource-charset-check-final.log。byte chunk fixtureはメモリ内IncomingMessageで、実ネットワークの分割配送や実資料サイトの取得を測定したものではない。
