# Tasteprint r1 — Draft

この ZIP は保存済みの同一 revision から生成しました。

## 導入

1. ZIPを展開したディレクトリで、Node.js 22.13以上を使い `npm install`、`npm run typecheck` を実行します。これは型検査で、開発サーバーの起動ではありません。
2. CSS importに対応したReactアプリ（Vite等）の独立ページを用意します。ZIPのpackage.jsonにあるdependenciesを利用先にも追加・インストールし、uiとexamplesを同じ階層へコピーします。
3. 利用先のHTMLに `<div id="root"></div>` を用意し、エントリーのTSXで同梱画面を表示します。

```tsx
import { createRoot } from "react-dom/client";
import ListPage from "./examples/ListPage";

createRoot(document.getElementById("root")!).render(<ListPage />);
```

SettingsPage / FormPageも同じ形で表示できます。ui/design.tsの確定designとui/styles.cssは同梱画面から読み込まれます。
4. 利用先アプリの開発・ビルドコマンドで起動します。ZIP自体には起動用サーバーやdevスクリプトはありません。

テンプレートCSSはworkspaceのスタイルも含むため、専用iframeまたは独立ページで利用してください。画面内の作成・保存はメモリ内の操作例です。実データの保存や業務処理との接続は利用先で実装・確認してください。

PNG: ユーザーが画像なし出力を明示的に選択。

## 未確認事項

- Components / Patterns の個別仕様・全状態は未確認（Preview テンプレートの動作例）
- 実アプリでの設計・アクセシビリティレビューが必要

依存バージョンは package.json、出力内容の SHA-256 は manifest.json を参照してください。確認環境: Node.js 22 以上、TypeScript、React、Chromium（リポジトリの自動検証）。
