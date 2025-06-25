# GLSL-Multi-layer-VJ-WEB

GLSLシェーダーを複数レイヤーで合成し、ブラウザ上でVJパフォーマンスを行うためのアプリケーションです。

## 特徴

- Three.js による WebGL レンダリング
- Monaco Editor を用いたシェーダーのライブ編集
- SortableJS によるレイヤーのドラッグ＆ドロップ並び替え
- ポップアップウィンドウへの出力と録画(WebM)機能

## 使い方

1. リポジトリをクローンまたはダウンロードします。
2. ローカルWebサーバーを起動します。（例: `npx http-server` または `python3 -m http.server`）
3. ブラウザで `GLSL Multi layer VJ.HTML` を開きます。

## ファイル構成

- `GLSL Multi layer VJ.HTML` – アプリケーション本体
- `main.js` – ロジックとシェーダー管理
- `LICENSE` – ライセンス情報

## ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。
