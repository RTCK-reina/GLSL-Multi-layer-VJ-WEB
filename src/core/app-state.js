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

        // --- Performance Guard ---
        const savedTargetFps = Number(localStorage.getItem('vj_perf_target_fps'));
        const savedProfile = localStorage.getItem('vj_perf_profile');
        this.performance = {
            guardEnabled: localStorage.getItem('vj_perf_guard') !== '0',
            targetFps: [30, 45, 60].includes(savedTargetFps) ? savedTargetFps : 60,
            profile: ['quality', 'balanced', 'performance'].includes(savedProfile) ? savedProfile : 'balanced',
            renderScale: 1,
            adaptiveLevel: 0,
            thumbnailIntervalMs: 180,
            freezeHiddenLayers: localStorage.getItem('vj_perf_freeze_hidden') === '1',
            status: 'nominal',
            avgFrameMs: 16.67,
            lastReason: 'init'
        };

        // --- MIDI ---
        // map: legacy CC→uniform map, kept for backwards compatibility.
        //      Format: { "layerId::u_key": ccNumber }
        //      On v1.1+ projects the canonical source is `bindings`.
        // bindings: array of action-level bindings.
        //      Shape: { id, signature, action: { type, target, behavior, invert }, label }
        //      signature format: "cc|Ch|Num", "note|Ch|Num", "pc|Ch|Num" (Ch=1-16 or 0 for omni).
        // devices: per-device enabled flag (keyed by device id).
        // clock:   MIDI Clock sync state.
        // activity: last-received signature + timestamp (for UI pulse).
        this.midi = {
            inputs: [],
            map: {},
            bindings: [],
            devices: {},
            clock: {
                enabled: false,
                ignoreTransport: false,
                running: false,
                lastPulseMs: 0,
                pulseIntervals: [],
                estimatedBpm: 0
            },
            activity: { signature: null, at: 0 },
            learn: { active: false, targetMapKey: null, targetBindingId: null }
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

        // --- App-level live controls ---
        // blackout: when true, renderer outputs black (post-crossfade overlay).
        // soloLayerId: if set, only that layer is composited (others suppressed).
        //              null means solo inactive.
        this.blackout = false;
        this.soloLayerId = null;

        // --- Persistence ---
        // Storage key is versioned; v1.2 adds Performance Guard prefs.
        this.projectStorageKey = 'vj_project_autosave_v1_2';
        this.legacyStorageKeys = ['vj_project_autosave_v1_1', 'vj_project_autosave_v0_5'];
        this.storageErrorShown = false;

        // --- Debug ---
        this.debugEnabled = localStorage.getItem('vj_debug_mode') === '1';
    }
}
