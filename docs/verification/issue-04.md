# Issue #4 検証記録

2026-09-17。lint / typecheck / build成功。unit 45件、integration 17件、Chromium 9件成功。

- Node資料登録、Documentへの既存資料関連付け、URL Paste登録、再読込、取得失敗表示をbrowserで確認。
- Workspace境界、URL重複抑制、FK、関連削除、Resource削除cascade、非破壊Seedを実DBで検証。
- loopback / private / link-local / multicast / reserved / IPv4-mapped IPv6 / NAT64 / localhost / 数値URL / credentialsを拒否。
- Mock DNS / transportで全アドレス検証、IP pinning、private redirect、redirect後のDNS rebinding、redirect上限、DNSとbody timeout、Content-Lengthとstreamサイズ上限、圧縮拒否を検証。
- HTMLのscript / SVG / 属性・外部画像を除去して本文抽出。

HTTP(S)標準ポートのHTML / plain text / Markdownのみ取得。PDFや圧縮応答はUNAVAILABLE。登録時には通信せず、取得可否は内容の正誤と分離する。
接続固定はNode HTTP(S)のcustom lookupと専用connectionで行い、元URLのHostとTLS検証を維持する。
参考: [Node HTTP](https://nodejs.org/api/http.html)、[Node DNS](https://nodejs.org/api/dns.html)。

実通信でもRFC 6749を取得し、RFC Editorのredirect先を再検証して168,310文字の本文を取得できた。
