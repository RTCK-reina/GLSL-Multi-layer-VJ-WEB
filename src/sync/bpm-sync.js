/**
 * BpmSync — BPM clock, tap-tempo, beat state.
 *
 * Owns all BPM/beat state and exposes helpers
 * for serialize/restore. Reads clock from Three.js Clock
 * passed in at construction.
 *
 * Events emitted:
 *   (none directly — state is read synchronously by renderer)
 *
 * Events consumed:
 *   toast  (indirectly via bus.emit)
 */
export class BpmSync {
    /**
     * @param {import('../core/event-bus.js').EventBus} bus
     * @param {import('../core/app-state.js').AppState} state
     * @param {THREE.Clock} clock
     */
    constructor(bus, state, clock) {
        this._bus = bus;
        this._state = state;
        this._clock = clock;

        // DOM element caches
        this._bpmInputEl = null;
        this._bpmDisplayEl = null;
        this._beatIndicatorEl = null;
        this._autoSceneToggleEl = null;
        this._autoSceneIntervalEl = null;
        this._autoSceneModeEl = null;

        // Scene manager injected after construction
        this._sceneManager = null;
    }

    /** Inject scene manager (avoids circular dependency). */
    setSceneManager(sceneManager) {
        this._sceneManager = sceneManager;
    }

    /** Call once after DOM is ready. */
    initUI() {
        this._bpmInputEl = document.getElementById('bpm-input');
        this._bpmDisplayEl = document.getElementById('bpm-display');
        this._beatIndicatorEl = document.getElementById('beat-indicator');

        const tapTempoBtn = document.getElementById('tap-tempo-btn');
        const beatResetBtn = document.getElementById('beat-reset-btn');
        const beatRunToggle = document.getElementById('beat-run-toggle');

        if (this._bpmInputEl) {
            this._bpmInputEl.onchange = (e) => this.setBpm(e.target.value, { showToast: true });
            this._bpmInputEl.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._bpmInputEl.blur();
                }
            };
        }
        if (tapTempoBtn) tapTempoBtn.onclick = () => this.tapTempo();
        if (beatResetBtn) beatResetBtn.onclick = () => {
            this.resetBeatPhase();
            this._bus.emit('toast', { msg: 'Beat phase reset', type: 'info' });
        };
        if (beatRunToggle) {
            beatRunToggle.checked = this._state.bpmRunning;
            beatRunToggle.onchange = (e) => this.setBeatRunning(!!e.target.checked, { showToast: true });
        }

        // Auto Scene Switch UI
        const autoSceneToggle = document.getElementById('auto-scene-toggle');
        const autoSceneInterval = document.getElementById('auto-scene-interval');
        const autoSceneMode = document.getElementById('auto-scene-mode');
        this._autoSceneToggleEl = autoSceneToggle;
        this._autoSceneIntervalEl = autoSceneInterval;
        this._autoSceneModeEl = autoSceneMode;
        const as = this._state.autoScene;

        if (autoSceneToggle) {
            autoSceneToggle.onchange = (e) => {
                as.enabled = !!e.target.checked;
                if (as.enabled) {
                    as.lastSwitchBeat = this.getBeatState().beat;
                }
                this._bus.emit('project:autosave');
                this._bus.emit('toast', { msg: as.enabled ? 'Auto Scene ON' : 'Auto Scene OFF', type: 'info' });
            };
        }
        if (autoSceneInterval) {
            autoSceneInterval.onchange = (e) => {
                as.intervalBeats = parseInt(e.target.value, 10) || 16;
                as.lastSwitchBeat = this.getBeatState().beat;
                this._bus.emit('project:autosave');
            };
        }
        if (autoSceneMode) {
            autoSceneMode.onchange = (e) => {
                as.mode = e.target.value;
                as.lastSwitchBeat = this.getBeatState().beat;
                this._bus.emit('project:autosave');
            };
        }

        this.refreshAutoSceneUI();
        this.refreshBpmUI();
    }

    clampBpm(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return this._state.bpm || 120;
        return Math.max(40, Math.min(300, n));
    }

    persistSyncPrefs() {
        localStorage.setItem('vj_bpm', this._state.bpm.toFixed(3));
        localStorage.setItem('vj_bpm_running', this._state.bpmRunning ? '1' : '0');
    }

    getBeatState(timeSec) {
        if (timeSec === undefined) timeSec = this._clock.getElapsedTime();
        const beatsPerSec = this._state.bpm / 60;
        const beat = this._state.bpmRunning
            ? Math.max(0, (timeSec - this._state.beatOriginTime) * beatsPerSec)
            : Math.max(0, this._state.beatPausedValue);
        const phase = beat - Math.floor(beat);
        return { beat, phase };
    }

    refreshBpmUI() {
        const s = this._state;
        const runToggle = document.getElementById('beat-run-toggle');
        if (this._bpmInputEl && document.activeElement !== this._bpmInputEl) {
            this._bpmInputEl.value = s.bpm.toFixed(1);
        }
        if (this._bpmDisplayEl) {
            this._bpmDisplayEl.textContent = `${s.bpm.toFixed(1)} BPM${s.bpmRunning ? '' : ' (PAUSE)'}`;
        }
        if (runToggle) runToggle.checked = s.bpmRunning;
    }

    refreshAutoSceneUI() {
        const as = this._state.autoScene;
        if (this._autoSceneToggleEl) this._autoSceneToggleEl.checked = as.enabled;
        if (this._autoSceneIntervalEl) this._autoSceneIntervalEl.value = String(as.intervalBeats);
        if (this._autoSceneModeEl) this._autoSceneModeEl.value = as.mode;
    }

    setBpm(value, options = {}) {
        const s = this._state;
        const next = this.clampBpm(value);
        const now = this._clock.getElapsedTime();
        const currentBeat = this.getBeatState(now).beat;
        s.bpm = next;

        if (options.resetPhase) {
            s.beatOriginTime = now;
            s.beatPausedValue = 0;
        } else {
            const beatsPerSec = s.bpm / 60;
            if (s.bpmRunning) {
                s.beatOriginTime = now - (currentBeat / beatsPerSec);
            } else {
                s.beatPausedValue = currentBeat;
                s.beatOriginTime = now - (s.beatPausedValue / beatsPerSec);
            }
        }

        if (!options.keepTapHistory) {
            s.tapIntervals = [];
            s.tapLastMs = 0;
        }
        this.persistSyncPrefs();
        this.refreshBpmUI();
        this._bus.emit('project:autosave');
        if (options.showToast) {
            this._bus.emit('toast', { msg: `BPM ${s.bpm.toFixed(1)}`, type: 'info' });
        }
    }

    setBeatRunning(running, options = {}) {
        const s = this._state;
        const next = !!running;
        if (next === s.bpmRunning) {
            this.refreshBpmUI();
            return;
        }

        const now = this._clock.getElapsedTime();
        const beatsPerSec = s.bpm / 60;
        if (next) {
            s.beatOriginTime = now - (s.beatPausedValue / beatsPerSec);
            s.bpmRunning = true;
        } else {
            s.beatPausedValue = this.getBeatState(now).beat;
            s.bpmRunning = false;
        }

        this.persistSyncPrefs();
        this.refreshBpmUI();
        this._bus.emit('project:autosave');
        if (options.showToast) {
            this._bus.emit('toast', { msg: next ? 'Beat resumed' : 'Beat paused', type: 'info' });
        }
    }

    resetBeatPhase() {
        const s = this._state;
        const now = this._clock.getElapsedTime();
        s.beatOriginTime = now;
        s.beatPausedValue = 0;
        this.persistSyncPrefs();
        this.refreshBpmUI();
        this._bus.emit('project:autosave');
    }

    tapTempo() {
        const s = this._state;
        const nowMs = performance.now();
        if (s.tapLastMs > 0 && nowMs - s.tapLastMs > 2200) s.tapIntervals = [];
        if (s.tapLastMs > 0) {
            const interval = nowMs - s.tapLastMs;
            if (interval >= 120 && interval <= 2000) {
                s.tapIntervals.push(interval);
                if (s.tapIntervals.length > 8) s.tapIntervals.shift();
            }
        }
        s.tapLastMs = nowMs;

        if (s.tapIntervals.length >= 1) {
            const sorted = [...s.tapIntervals].sort((a, b) => a - b);
            const trimmed = sorted.length > 4 ? sorted.slice(1, -1) : sorted;
            const avg = trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length;
            const bpm = 60000 / avg;
            this.setBpm(bpm, { resetPhase: true, keepTapHistory: true });
        } else {
            this.resetBeatPhase();
        }

        this.refreshBpmUI();
    }

    serializeSyncState(timeSec) {
        if (timeSec === undefined) timeSec = this._clock.getElapsedTime();
        const beatState = this.getBeatState(timeSec);
        return {
            bpm: this._state.bpm,
            running: this._state.bpmRunning,
            beat: beatState.beat,
            autoScene: {
                enabled: this._state.autoScene.enabled,
                intervalBeats: this._state.autoScene.intervalBeats,
                mode: this._state.autoScene.mode
            }
        };
    }

    applySyncState(sync) {
        if (!sync || typeof sync !== 'object') return;
        const s = this._state;
        s.bpm = this.clampBpm(sync.bpm);
        s.bpmRunning = sync.running !== false;
        const beatRaw = Number(sync.beat);
        const beat = Number.isFinite(beatRaw) && beatRaw >= 0 ? beatRaw : 0;
        s.beatPausedValue = beat;
        s.tapIntervals = [];
        s.tapLastMs = 0;
        const now = this._clock.getElapsedTime();
        const beatsPerSec = s.bpm / 60;
        s.beatOriginTime = now - (beat / beatsPerSec);

        const nextAutoScene = sync.autoScene && typeof sync.autoScene === 'object' ? sync.autoScene : null;
        s.autoScene.enabled = !!(nextAutoScene && nextAutoScene.enabled);
        s.autoScene.intervalBeats = Math.max(1, parseInt(nextAutoScene && nextAutoScene.intervalBeats, 10) || 16);
        s.autoScene.mode = nextAutoScene && nextAutoScene.mode === 'random' ? 'random' : 'sequential';
        s.autoScene.lastSwitchBeat = beat;

        this.persistSyncPrefs();
        this.refreshAutoSceneUI();
        this.refreshBpmUI();
    }

    /** Called every frame to check if auto scene switch should fire. */
    updateAutoScene(beatState) {
        const as = this._state.autoScene;
        if (!as.enabled || !this._sceneManager || !this._state.bpmRunning) return;
        if (this._state.scenes.length < 2) return;
        if (this._state.crossfade.active) return;

        const elapsed = beatState.beat - as.lastSwitchBeat;
        if (elapsed >= as.intervalBeats) {
            as.lastSwitchBeat = beatState.beat;
            const scenes = this._state.scenes;
            let nextIdx;
            if (as.mode === 'random') {
                const candidates = [];
                for (let i = 0; i < scenes.length; i++) {
                    if (i !== this._state.sceneIdx) candidates.push(i);
                }
                nextIdx = candidates[Math.floor(Math.random() * candidates.length)];
            } else {
                nextIdx = (this._state.sceneIdx + 1) % scenes.length;
            }
            if (nextIdx !== undefined && nextIdx !== this._state.sceneIdx) {
                this._sceneManager.switchScene(nextIdx);
            }
        }
    }

    /** Called every frame from the render loop to update beat indicator. */
    updateBeatIndicator(beatState) {
        if (!this._beatIndicatorEl) return;
        const pulse = Math.max(0, 1 - beatState.phase * 4);
        this._beatIndicatorEl.style.opacity = this._state.bpmRunning ? `${0.25 + pulse * 0.75}` : '0.18';
        this._beatIndicatorEl.style.transform = `scale(${0.9 + pulse * 0.35})`;
    }
}
