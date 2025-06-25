# GLSL-Multi-layer-VJ-WEB

GLSLシェーダーを複数レイヤーで合成し、ブラウザ上でVJパフォーマンスを行うためのアプリケーションです。

This is a web application for combining multiple GLSL shader layers and performing VJ live in the browser.

## 特徴 / Features

- Three.js による WebGL レンダリング / WebGL rendering via Three.js
- Monaco Editor を用いたシェーダーのライブ編集 / Live shader editing with Monaco Editor
- SortableJS によるレイヤーのドラッグ＆ドロップ並び替え / Drag-and-drop layer ordering with SortableJS
- ポップアップウィンドウへの出力と録画(WebM)機能 / Output to popup window and recording to WebM

## 使い方 / Usage

1. リポジトリをクローンまたはダウンロードします。 / Clone or download this repository.
2. ローカルWebサーバーを起動します。（例: `npx http-server` または `python3 -m http.server`） / Start a local web server (e.g., `npx http-server` or `python3 -m http.server`).
3. ブラウザで `GLSL Multi layer VJ.HTML` を開きます。 / Open `GLSL Multi layer VJ.HTML` in your browser.

## ファイル構成 / File Structure

- `GLSL Multi layer VJ.HTML` – アプリケーション本体 / Main application
- `main.js` – ロジックとシェーダー管理 / Logic and shader handling
- `LICENSE` – ライセンス情報 / License information

## ライセンス / License

このプロジェクトは MIT ライセンスの下で公開されています。
This project is released under the MIT License.
