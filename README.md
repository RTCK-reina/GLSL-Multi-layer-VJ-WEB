# GLSL-Multi-layer-VJ-WEB

GLSLシェーダーを複数レイヤーで合成し、ブラウザ上でVJパフォーマンスを行うためのライブツールです。

## 特徴

- Three.js による WebGL レンダリング
- Monaco Editor を用いたシェーダーのライブ編集
- SortableJS によるレイヤーのドラッグ＆ドロップ並び替え
- ポップアップウィンドウへの出力と録画(WebM)機能
- WebMidi.js による外部MIDIコントローラー連携 / Beat Sync
- Performance Guard による内部 render-scale 自動調整、thumbnail cadence 調整、hidden layer freeze
- Live Engine パネルによる scene/layer/FPS/render-scale/MIDI/crossfade の即時確認
- Live Apply (`Ctrl+Enter`) によるエディタを閉じない GLSL コンパイル反映
- esbuild による `src/` モジュールのバンドル

## ローカルで起動する

前提: Node.js 18 以上。

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
  - `src/core/` – AppState / EventBus / Undo
  - `src/renderer/` – WebGL render pipeline / compositing
  - `src/layer/` – レイヤー生成、UI、uniform、MIDI legacy map
  - `src/scene/` – シーン CRUD / crossfade
  - `src/midi/` – MIDI device, action bindings, config UI
  - `src/performance/` – Performance Guard / Live Engine state
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
- WebMidi.js `3.1.16`

Tailwind CDN はバージョン固定されていないため、本番運用時はビルド済みCSSへ移行するか、固定配信へ置き換えてください。

## Live Operation

- `G` – Performance Guard の ON/OFF
- `Shift+G` – Quality / Balanced / Performance profile の切り替え
- `Ctrl+Enter` – GLSL Editor の Live Apply（エディタを閉じずに反映）
- `Ctrl+S` – GLSL Editor の Apply、またはプロジェクト export
- `1..9` – シーン呼び出し
- `0` / `B` – blackout
- `Shift+B` – MIDI Panic
- `T` – tap tempo

Performance Guard は保存スキーマ v1.2 の `performance` に設定を保存します。旧 v0.5 / v1.0 / v1.1 プロジェクトは `project-migrator.js` で v1.2 に補完されます。

## ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。
