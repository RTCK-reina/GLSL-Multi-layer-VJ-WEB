/**
 * GLSL Multi-layer VJ System — Orchestrator (V1.0)
 *
 * Replaces the monolithic VJApp class with modular dependency injection.
 * Each module receives (bus, state) or (bus, state, deps) and communicates
 * through EventBus events.
 *
 * Boot sequence:
 *   1. Register shaders globally
 *   2. Create EventBus + AppState
 *   3. Instantiate modules in dependency order
 *   4. Init UI bindings
 *   5. Restore saved project or create default scene
 *   6. Start render loop
 */
import shaderRegistry from './shaders/index.js';
import { EventBus } from './core/event-bus.js';
import { AppState } from './core/app-state.js';
import { AudioAnalyzer } from './audio/audio-analyzer.js';
import { Renderer } from './renderer/renderer.js';
import { BpmSync } from './sync/bpm-sync.js';
import { MidiManager } from './midi/midi-manager.js';
import { MidiBindings } from './midi/midi-bindings.js';
import { MidiConfigUI } from './midi/midi-config-ui.js';
import { LayerManager } from './layer/layer-manager.js';
import { SceneManager } from './scene/scene-manager.js';
import { EditorController } from './editor/editor-controller.js';
import { ProjectIO } from './persistence/project-io.js';
import { UndoManager } from './core/undo-manager.js';
import { Toast } from './ui/toast.js';
import { DebugPanel } from './ui/debug-panel.js';
import { UIController } from './ui/ui-controller.js';

// Expose shader registry as global (shader code reads window.SHADERS)
window.SHADERS = shaderRegistry;

window.addEventListener('load', () => {
    if (!Object.keys(window.SHADERS).length) {
        console.error('Shader catalog is empty.');
    }
    boot();
});

function boot() {
    // ── 1. Core ──────────────────────────────────────────────
    const bus = new EventBus();
    const state = new AppState();

    // ── 2. Standalone modules (no cross-module deps) ─────────
    const audio = new AudioAnalyzer();
    const renderer = new Renderer(bus, state);
    const bpmSync = new BpmSync(bus, state, renderer.clock);
    const toast = new Toast(bus);
    const debugPanel = new DebugPanel(bus, state);

    // ── 3. Modules with cross-module deps ────────────────────
    const midiManager = new MidiManager(bus, state);
    const midiBindings = new MidiBindings(bus, state);
    midiManager.setBindings(midiBindings);

    const layerManager = new LayerManager(bus, state, {
        renderer,
        midiManager
    });

    const sceneManager = new SceneManager(bus, state, {
        layerManager,
        bpmSync
    });

    // Inject sceneManager into bpmSync (avoids circular dep)
    bpmSync.setSceneManager(sceneManager);

    const editorController = new EditorController(bus, state, {
        renderer,
        layerManager
    });

    const undoManager = new UndoManager();

    const projectIO = new ProjectIO(bus, state, {
        bpmSync,
        midiManager,
        sceneManager,
        undoManager
    });

    const midiConfigUI = new MidiConfigUI(bus, state, {
        midiManager,
        bindings: midiBindings
    });

    const uiController = new UIController(bus, state, {
        renderer,
        layerManager,
        sceneManager,
        editorController,
        bpmSync,
        projectIO,
        midiManager,
        midiConfigUI,
        audio
    });

    // ── 4. Init UI (binds DOM elements) ──────────────────────
    renderer.initUI();
    bpmSync.initUI();
    debugPanel.initUI(renderer.rendererLabel);
    debugPanel.installGlobalErrorHooks();
    sceneManager.initUI();
    projectIO.initImportUI();
    midiConfigUI.initUI();
    uiController.initUI();

    // ── 5. Init MIDI (audio is user-triggered via MIC/SYS buttons) ──
    midiManager._loadDevicePrefs();
    midiManager.init();
    midiManager.initLearnUI();

    // ── 5b. App-level live-state listeners ───────────────────
    bus.on('app:blackout', ({ active }) => {
        state.blackout = !!active;
        const label = document.getElementById('blackout-label');
        const btn = document.getElementById('blackout-btn');
        if (label) label.classList.toggle('hidden', !state.blackout);
        if (btn) {
            btn.classList.toggle('bg-red-900', !!state.blackout);
            btn.classList.toggle('text-red-200', !!state.blackout);
            btn.classList.toggle('border-red-600', !!state.blackout);
            btn.classList.toggle('text-slate-500', !state.blackout);
            btn.classList.toggle('border-slate-700', !state.blackout);
        }
    });
    bus.on('app:panic', () => midiManager.panic());
    bus.on('crossfade:mix', ({ mix }) => {
        // Direct crossfade mix override from a MIDI fader — only meaningful while a crossfade is active.
        if (state.crossfade.active) state.crossfade.mix = Math.max(0, Math.min(1, mix));
    });

    // ── 6. Restore project or create default scene ───────────
    if (!projectIO.restoreFromStorage()) {
        sceneManager.loadDefaultScene();
    }

    // ── 7. Start render loop ─────────────────────────────────
    renderer.animate({ audio, bpmSync, debugPanel });

    // ── 8. Shutdown handler ──────────────────────────────────
    window.addEventListener('beforeunload', () => {
        sceneManager.saveCurrentScene();
        bpmSync.persistSyncPrefs();
        projectIO.persistToStorage();
        renderer.shutdown();
    });

    // Expose for console debugging
    window.vjApp = {
        bus, state, audio, renderer, bpmSync, midiManager,
        layerManager, sceneManager, editorController, projectIO,
        debugPanel, uiController
    };

    window.render_game_to_text = () => {
        const activeScene = state.sceneIdx >= 0 ? state.scenes[state.sceneIdx] : null;
        const domLayerOrder = Array.from(document.querySelectorAll('#layer-stack .layer-card'))
            .map((el, index) => ({ index, id: el.dataset.id || null }));
        const liveLayerOrder = state.layers.map((layer, index) => ({
            index,
            id: layer.id,
            key: layer.key,
            blend: layer.blend,
            opacity: Number(layer.opacity.toFixed(2))
        }));
        const crossfade = state.crossfade;

        return JSON.stringify({
            note: 'Indices are zero-based. Layer stack order is top-to-bottom in the UI.',
            currentScene: activeScene ? {
                index: state.sceneIdx,
                name: activeScene.name,
                storedLayerIds: Array.isArray(activeScene.layers) ? activeScene.layers.map((layer) => layer.id) : []
            } : null,
            sceneList: state.scenes.map((scene, index) => ({
                index,
                name: scene.name,
                layerCount: Array.isArray(scene.layers) ? scene.layers.length : 0
            })),
            liveLayerOrder,
            domLayerOrder,
            crossfade: {
                active: crossfade.active,
                fromIdx: crossfade.fromIdx,
                toIdx: crossfade.toIdx,
                mix: Number(crossfade.mix.toFixed(3)),
                targetLayerIds: crossfade.layersB.map((layer) => layer.id)
            }
        });
    };
}
