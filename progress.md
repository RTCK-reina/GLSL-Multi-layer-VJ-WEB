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

---

## v1.1 — MIDI 拡張 / レイヤー MUTE-SOLO / UX 改善 (2026-04-22)

Original prompt (follow-up): "VJ ツールとしての改善を多く行ってほしい。レイヤーの切り替えを MIDI で行えるようにしたい。MIDI コンフィグの項目を追加すべき。"

### MIDI エンジン拡張 (`src/midi/`)
- `midi-manager.js` を Note On/Off・Program Change・MIDI Clock (24 PPQN) 受信に対応。Clock は直近 24 パルスの移動平均から BPM を推定し、差分 0.1 BPM 以上で `midi:clock-tick` を発火する。
- デバイス単位の enable/disable を実装 (`state.midi.devices`、`localStorage: vj_midi_devices`)。Config モーダルからトグルできる。
- MIDI Panic を追加 (Learn キャンセル / momentary 解除 / solo 解除 / blackout 解除)。
- `armLearnOnce()` で Config モーダル用の "次の1メッセージを取得" API を新設。
- 活動モニタ: `midi:activity` イベントを発火し、ヘッダドット点滅と Config モニタに反映。
- 新規: `midi-actions.js` (アクションカタログ) と `midi-bindings.js` (signature="type|ch|number" 形式のバインディング + dispatch)。
- アクション: `scene.recall`, `scene.next`, `scene.prev`, `layer.mute`, `layer.solo`, `layer.select`, `layer.opacity`, `layer.blend.next`, `uniform.set`, `crossfade.mix`, `bpm.tap`, `app.blackout`, `app.panic`。
- Note の挙動は `trigger` / `toggle` / `momentary` を選択可能。CC はエッジ閾値 (0.5) でボタン的挙動も扱う。
- 既存 `state.midi.map` (CC→uniform) は legacy として保持し、migration なしで継続動作。

### レイヤー MUTE/SOLO / アクティブ選択
- `layer.muted` を追加。renderer は per-layer 描画は続けたまま合成時のみスキップするため、サムネイルや feedback buffer は動き続ける。
- `state.soloLayerId` を追加。solo 中は他レイヤーを合成しない。
- `state.blackout` を追加し、renderer は blackout 時に黒フレームを直接出力。
- レイヤーカードに M / S ボタンと `.layer-muted` 視覚状態を追加。
- カードクリックで active 選択 (`layer:select`)。

### BPM Clock ソース
- `BpmSync` が `midi:clock-tick` / `midi:clock-start` / `midi:clock-stop` / `bpm:tap` を受信。Clock 有効時は手動 BPM 入力を disable。

### MIDI Config モーダル
- ヘッダに `⚙` ボタンを追加。Mappings / Devices / Clock / Global Actions の 4 タブ構成。
- Mappings: 表形式で一覧・フィルタ (Scene / Layer / Uniform / Global)・Learn → Add・手動編集モーダル。
- Devices: 接続状態とデバイス enable/disable + LIVE MONITOR (直近 40 行の受信ログ)。
- Clock: 受信 ON/OFF、Start/Stop 無視、推定 BPM と Transport 状態表示。
- Global: MIDI Panic、全バインディング削除、JSON export/import、ショートカット表。

### UX 改善
- ヘッダに `BLACKOUT` ボタン + キャンバス上に赤ラベル。
- ショートカット: `1..9` = シーン呼び出し、`0` / `B` = blackout、`Shift+B` = Panic、`T` = tap (既存)。
- Escape: Learn キャンセル → Binding Editor → MIDI Config → 既存 modal の優先順で閉じる。

### 永続化
- プロジェクトスキーマを `1.1` に更新。`midi.bindings`, `midi.clock`, `layers[].muted`, `app.blackout` を保存対象に追加。
- `project-migrator.js`: `0.5-alpha → 1.0 → 1.1` を連鎖適用。legacy `midi.map` は保持。
- `restoreFromStorage()` は旧 localStorage キー `vj_project_autosave_v0_5` をフォールバック読み込みして v1.1 キーへ自動保存。

### 検証
- `npm run build` 成功。
- Node 簡易テスト: signature 構築/解析/omni match、scene.recall on note、layer.mute toggle、momentary edge on/off、uniform.set on cc、PC → scene.recall fallback、actionSupports の境界をいずれも確認。
- migrator: 0.5-alpha と 1.0 のプロジェクトがどちらも 1.1 に展開され、legacy midi.map は温存されることを確認。
- メモ: ブラウザ UI / Web MIDI 実機テストはこの環境では未実施 (手動確認を次のステップで推奨)。

---

## v1.2 — Live Engine / Performance Guard / Live Coding UX (2026-07-06)

Original prompt: "これを再設計するならどうする？現在の仕様を元に更なるブラッシュアップ、革新的なテクノロジー、更なるUI,UX、拡張性、安定性、ライブパフォーマンス性、ライブコーディング適正、MIDI適正、VJ適正など全てをブラッシュアップ、更新、最適化、高性能化、高機能化を行なってください"

### 採用判断
- 採用: 既存 GLSL/WebGL パイプラインを維持し、内部 render-scale と Live Engine を追加する段階的再設計。
- 棄却: WebGPU 全面移行。理由は既存 GLSL 資産、Three.js FBO 合成、Monaco live editing、MIDI/scene 保存形式への影響が大きく、今回の目的に対して破壊リスクが高いため。

### Performance Guard (`src/performance/`, `src/renderer/`)
- 新規 `PerformanceGuard` を追加。`render:metrics` を監視して target FPS に対する frame budget 超過を検出する。
- 内部 render target サイズを出力解像度から分離。`renderScale` 0.5-1.0 で FBO サイズを縮小し、最終出力へアップスケールする。
- Quality / Balanced / Performance profile を追加。thumbnail 更新間隔も profile/adaptive level に応じて調整する。
- `Freeze Hidden` を追加。mute/solo で非表示のレイヤーを保持して、必要時だけ負荷を落とせる。
- `Renderer` は blackout 中も通常描画中も `render:metrics` を発火するため、監視が途切れない。

### UI / UX
- Sidebar 上部に `LIVE ENGINE` パネルを追加。scene/layer/FPS/frame/render-scale/crossfade/MIDI/thumbnail cadence を表示。
- `G` で Performance Guard ON/OFF、`Shift+G` で performance profile cycle。
- WebMidi.js を `@latest` から `3.1.16` にピン留め。
- esbuild を `0.28.1` に更新し、dev-server advisory を解消。
- タイトルと表示バージョンを v1.2 に更新。

### Live Coding
- GLSL Editor に `APPLY LIVE (CTRL+ENTER)` を追加。成功時にエディタを閉じず、ライブ中に連続調整できる。
- 既存 `APPLY (CTRL+S)` は従来どおり成功時に閉じる。
- Compile 成功/失敗を `editor-status` に表示し、toast と Monaco error decoration に同期する。

### MIDI / 保存
- MIDI action に `performance.guard.toggle` と `performance.profile.next` を追加。
- MIDI Config filter に Performance を追加。
- project schema を `1.2` に更新し、`performance` 設定を保存対象へ追加。
- `project-migrator.js` は `0.5-alpha -> 1.0 -> 1.1 -> 1.2` を連鎖適用する。

### 検証
- `npm run build` 成功。
- Node 簡易検証: project migrator (0.5-alpha/1.0/1.1 → 1.2)、Performance MIDI actions、Performance Guard adaptive downshift を確認。
- `npm audit --json` は 0 vulnerabilities。
- Playwright: desktop と 390px viewport で初期表示、Live Engine 表示、console error 0 を確認。警告は Tailwind CDN と Three.js global build の既知警告のみ。
- 未検証: 実 MIDI コントローラー、Web MIDI 権限付与後のブラウザ実機操作、長時間ライブ負荷テスト。
