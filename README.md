# GLSL-Multi-layer-VJ-WEB

GLSLシェーダーを複数レイヤーで合成し、ブラウザ上でVJパフォーマンスを行うためのアプリケーションです。

## 特徴

- Three.js による WebGL レンダリング
- Monaco Editor を用いたシェーダーのライブ編集
- SortableJS によるレイヤーのドラッグ＆ドロップ並び替え
- ポップアップウィンドウへの出力と録画(WebM)機能
- WebMidi.js による外部MIDIコントローラー連携 / Beat Sync
- esbuild による `src/` モジュールのバンドル

## ローカルで起動する

```bash
npm install
npm run build        # dist/app.bundle.js を生成
npm run serve        # http://localhost:3000/ で index.html を配信
```

開発中にバンドルを自動再生成するには `npm run dev`（watch モード）を併用してください。

## ファイル構成

- `index.html` – アプリケーションのエントリーポイント
- `styles.css` – 共通スタイル
- `src/` – アプリケーション本体（モジュラー構成）
  - `src/main.js` – 起動シーケンス
  - `src/app/` – VJApp 本体およびモジュール
  - `src/shaders/` – 組み込みシェーダーレジストリ
- `esbuild.config.mjs` – ビルド設定（`src/main.js` → `dist/app.bundle.js`）
- `.github/workflows/deploy.yml` – GitHub Pages への自動デプロイ
- `LICENSE` – ライセンス情報

## デプロイ

`main` ブランチへ push すると GitHub Actions（`.github/workflows/deploy.yml`）が
`npm ci && npm run build` を実行し、リポジトリ全体を GitHub Pages に公開します。
初回のみ、リポジトリの `Settings → Pages → Build and deployment → Source` を
`GitHub Actions` に設定してください。

公開 URL: `https://<owner>.github.io/<repo>/`

## 外部依存

以下は CDN から読み込んでいます（`index.html` 参照）。

- Tailwind CSS (`cdn.tailwindcss.com`, タグなし)
- Three.js `0.150.0`
- Monaco Editor `0.45.0`
- SortableJS `1.15.0`
- WebMidi.js (`@latest`)

Tailwind と WebMidi はバージョン固定されていないため、本番運用時はピン留めを検討してください。

## ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。
