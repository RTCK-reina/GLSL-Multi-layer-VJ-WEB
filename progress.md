Original prompt: レイヤー、シーン切り替え構造壊れてるかも

- 調査開始。`SceneManager.switchScene()` とクロスフェード完了処理を重点確認。
- 初期所見: クロスフェード開始時に `sceneIdx` を先に切り替えているため、切替中の編集や autosave が遷移先シーンを上書きする可能性あり。
- 修正: crossfade 中は `sceneIdx` と scene UI を維持し、完了時にだけ遷移先へ確定するよう変更。
- 修正: 空シーンへの crossfade でも renderer が黒フレーム側へ混合して完了できるよう変更。
- 修正: `persistToStorage()` / `exportProject()` からの `saveCurrentScene()` は autosave を再発火しないよう変更。
- 修正: shader editor 保存時の layer card 再描画は `replaceEl` で置換し、DOM 順序が state.layers とズレないよう変更。
- 修正: `render_game_to_text()` を追加し、scene/layer/crossfade の整合性を外から読めるよう変更。
- 修正: `Renderer.setResolution()` は crossfade 側の `layersB` にも新しい解像度を反映するよう変更。
- 修正: `ProjectIO.loadProjectData()` は入力が妥当と確定するまで crossfade を壊さないよう変更。無効 import で現セッションを崩さない。
- 修正: `SceneManager._finalizeCrossfade()` は不正な `toIdx` を検出したら遷移を破棄し、現シーンを保持するよう変更。
- 検証: `npm run build` 成功。
- 検証: Node 簡易検証で「crossfade 中に target scene を上書きしない」「空 scene finalize」「autosave 自己再入なし」「無効 load で crossfade を cancel しない」「不正 target の finalize でも現シーン保持」を確認。
- メモ: Playwright クライアントは Node 側の ESM 実行回避までは通せたが、この Linux 環境で Chromium 実行に `libnspr4.so` など共有ライブラリが不足し、スクリーンショット検証までは未実行。
