/**
 * AppState — Central state container (plain data, no logic).
 *
 * All application state lives here. Modules read/write via
 * direct property access. EventBus handles change notifications.
 */
export class AppState {
    constructor() {
        // --- Layers & Scenes ---
        this.layers = [];
        this.scenes = [];
        this.sceneIdx = -1;
        this.layerIdCounter = 0;

        // --- Rendering ---
        this.width = 1920;
        this.height = 1080;
        this.dprMode = localStorage.getItem('vj_dpr') || '1';
        this.preserveDrawingBuffer = localStorage.getItem('vj_preserve_buffer') === '1';

        // --- MIDI ---
        this.midi = {
            inputs: [],
            map: {},
            learn: { active: false, targetMapKey: null }
        };

        // --- BPM / Sync ---
        const savedBpm = Number(localStorage.getItem('vj_bpm'));
        this.bpm = Number.isFinite(savedBpm) ? Math.max(40, Math.min(300, savedBpm)) : 120;
        this.bpmRunning = localStorage.getItem('vj_bpm_running') !== '0';
        this.beatOriginTime = 0;
        this.beatPausedValue = 0;
        this.tapLastMs = 0;
        this.tapIntervals = [];

        // --- Crossfade ---
        this.crossfade = {
            active: false,
            mix: 0,           // 0 = fully scene A, 1 = fully scene B
            durationBeats: 0, // crossfade duration in beats (0 = instant cut)
            startBeat: 0,
            fromIdx: -1,
            toIdx: -1,
            layersB: []       // layers for the incoming scene during crossfade
        };

        // --- Auto Scene Switch (BPM-synced) ---
        this.autoScene = {
            enabled: false,
            intervalBeats: 16,  // switch every N beats
            mode: 'sequential', // 'sequential' | 'random'
            lastSwitchBeat: 0
        };

        // --- Audio ---
        this.audioData = { bass: 0, mid: 0, treble: 0 };

        // --- Webcam ---
        this.webcam = null;
        this.webcamStream = null;

        // --- Persistence ---
        this.projectStorageKey = 'vj_project_autosave_v0_5';
        this.storageErrorShown = false;

        // --- Debug ---
        this.debugEnabled = localStorage.getItem('vj_debug_mode') === '1';
    }
}
