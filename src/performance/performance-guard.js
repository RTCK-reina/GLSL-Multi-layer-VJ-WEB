const PROFILE_ORDER = ['quality', 'balanced', 'performance'];

const PROFILE_CONFIG = {
    quality: {
        label: 'Quality',
        baseScale: 1,
        thumbnailMs: 100
    },
    balanced: {
        label: 'Balanced',
        baseScale: 1,
        thumbnailMs: 180
    },
    performance: {
        label: 'Performance',
        baseScale: 0.75,
        thumbnailMs: 360
    }
};

export class PerformanceGuard {
    /**
     * @param {import('../core/event-bus.js').EventBus} bus
     * @param {import('../core/app-state.js').AppState} state
     * @param {Object} deps - { renderer }
     */
    constructor(bus, state, deps) {
        this._bus = bus;
        this._state = state;
        this._renderer = deps.renderer;
        this._els = {};
        this._lastMetrics = null;
        this._lastUiUpdate = 0;
        this._badFrames = 0;
        this._goodFrames = 0;
        this._lastMidiLabel = 'none';

        bus.on('render:metrics', (metrics) => this._onMetrics(metrics));
        bus.on('midi:activity', ({ signature }) => {
            this._lastMidiLabel = signature || 'activity';
        });
        bus.on('scene:switched', () => this._renderStatus(true));
        bus.on('project:loaded', () => {
            this._normalizeState();
            this.applySettings('project load');
            this._syncControls();
            this._renderStatus(true);
        });
        bus.on('performance:guard-toggle', () => this.setGuardEnabled(!this._state.performance.guardEnabled));
        bus.on('performance:profile-step', ({ delta = 1 } = {}) => this.stepProfile(delta));
    }

    initUI() {
        this._els = {
            guardToggle: document.getElementById('performance-guard-toggle'),
            profile: document.getElementById('performance-profile'),
            targetFps: document.getElementById('performance-target-fps'),
            freezeHidden: document.getElementById('performance-freeze-hidden'),
            status: document.getElementById('performance-status'),
            scene: document.getElementById('live-scene'),
            layers: document.getElementById('live-layers'),
            fps: document.getElementById('live-fps'),
            frame: document.getElementById('live-frame-ms'),
            scale: document.getElementById('live-render-scale'),
            crossfade: document.getElementById('live-crossfade'),
            midi: document.getElementById('live-midi-last'),
            thumbnails: document.getElementById('live-thumbnail-rate')
        };

        if (this._els.guardToggle) {
            this._els.guardToggle.onchange = (e) => this.setGuardEnabled(!!e.target.checked);
        }
        if (this._els.profile) {
            this._els.profile.onchange = (e) => this.setProfile(e.target.value);
        }
        if (this._els.targetFps) {
            this._els.targetFps.onchange = (e) => this.setTargetFps(Number(e.target.value));
        }
        if (this._els.freezeHidden) {
            this._els.freezeHidden.onchange = (e) => this.setFreezeHidden(!!e.target.checked);
        }

        this._normalizeState();
        this.applySettings('init');
        this._syncControls();
        this._renderStatus(true);
    }

    _normalizeState() {
        const p = this._state.performance;
        if (!PROFILE_CONFIG[p.profile]) p.profile = 'balanced';
        if (![30, 45, 60].includes(Number(p.targetFps))) p.targetFps = 60;
        p.adaptiveLevel = Math.max(0, Math.min(2, Number(p.adaptiveLevel) || 0));
        p.renderScale = Math.max(0.5, Math.min(1, Number(p.renderScale) || 1));
        p.freezeHiddenLayers = !!p.freezeHiddenLayers;
        p.guardEnabled = p.guardEnabled !== false;
    }

    _persistPrefs() {
        const p = this._state.performance;
        localStorage.setItem('vj_perf_guard', p.guardEnabled ? '1' : '0');
        localStorage.setItem('vj_perf_target_fps', String(p.targetFps));
        localStorage.setItem('vj_perf_profile', p.profile);
        localStorage.setItem('vj_perf_freeze_hidden', p.freezeHiddenLayers ? '1' : '0');
    }

    _syncControls() {
        const p = this._state.performance;
        if (this._els.guardToggle) this._els.guardToggle.checked = !!p.guardEnabled;
        if (this._els.profile) this._els.profile.value = p.profile;
        if (this._els.targetFps) this._els.targetFps.value = String(p.targetFps);
        if (this._els.freezeHidden) this._els.freezeHidden.checked = !!p.freezeHiddenLayers;
    }

    setGuardEnabled(enabled) {
        const p = this._state.performance;
        p.guardEnabled = !!enabled;
        p.adaptiveLevel = 0;
        this.applySettings(enabled ? 'guard on' : 'guard off');
        this._persistPrefs();
        this._bus.emit('project:autosave');
        this._bus.emit('toast', { msg: p.guardEnabled ? 'Performance Guard ON' : 'Performance Guard OFF', type: 'info' });
        this._renderStatus(true);
    }

    setProfile(profile) {
        const p = this._state.performance;
        p.profile = PROFILE_CONFIG[profile] ? profile : 'balanced';
        p.adaptiveLevel = 0;
        this.applySettings(`profile ${p.profile}`);
        this._persistPrefs();
        this._bus.emit('project:autosave');
        this._renderStatus(true);
    }

    stepProfile(delta = 1) {
        const p = this._state.performance;
        const idx = PROFILE_ORDER.indexOf(p.profile);
        const cur = idx >= 0 ? idx : 1;
        const next = (((cur + delta) % PROFILE_ORDER.length) + PROFILE_ORDER.length) % PROFILE_ORDER.length;
        this.setProfile(PROFILE_ORDER[next]);
        this._syncControls();
    }

    setTargetFps(fps) {
        const p = this._state.performance;
        p.targetFps = [30, 45, 60].includes(Number(fps)) ? Number(fps) : 60;
        p.adaptiveLevel = 0;
        this.applySettings(`target ${p.targetFps}`);
        this._persistPrefs();
        this._bus.emit('project:autosave');
    }

    setFreezeHidden(enabled) {
        this._state.performance.freezeHiddenLayers = !!enabled;
        this._persistPrefs();
        this._bus.emit('project:autosave');
        this._renderStatus(true);
    }

    applySettings(reason = 'update') {
        const p = this._state.performance;
        const profile = PROFILE_CONFIG[p.profile] || PROFILE_CONFIG.balanced;
        const adaptiveScale = p.guardEnabled
            ? Math.max(0.5, profile.baseScale * (1 - p.adaptiveLevel * 0.25))
            : profile.baseScale;
        const thumbnailMs = Math.round(profile.thumbnailMs * (1 + p.adaptiveLevel * 0.75));

        p.renderScale = adaptiveScale;
        p.thumbnailIntervalMs = thumbnailMs;
        p.status = p.guardEnabled ? (p.adaptiveLevel > 0 ? 'guarding' : 'nominal') : 'manual';
        p.lastReason = reason;

        this._renderer.setRenderScale(adaptiveScale);
        this._renderer.setThumbnailInterval(thumbnailMs);
    }

    _onMetrics(metrics) {
        this._lastMetrics = metrics;
        const p = this._state.performance;
        const frameMs = Number(metrics.frameDeltaMs);
        if (Number.isFinite(frameMs) && frameMs > 0) {
            p.avgFrameMs = p.avgFrameMs > 0
                ? p.avgFrameMs + (frameMs - p.avgFrameMs) * 0.08
                : frameMs;
        }

        if (p.guardEnabled) {
            const budget = 1000 / p.targetFps;
            if (p.avgFrameMs > budget * 1.2) {
                this._badFrames++;
                this._goodFrames = 0;
            } else if (p.avgFrameMs < budget * 0.72) {
                this._goodFrames++;
                this._badFrames = 0;
            } else {
                this._badFrames = 0;
                this._goodFrames = 0;
            }

            if (this._badFrames >= 24 && p.adaptiveLevel < 2) {
                p.adaptiveLevel++;
                this._badFrames = 0;
                this.applySettings('frame budget guard');
                this._bus.emit('toast', { msg: `Performance Guard reduced render scale to ${(p.renderScale * 100).toFixed(0)}%`, type: 'info' });
            } else if (this._goodFrames >= 240 && p.adaptiveLevel > 0) {
                p.adaptiveLevel--;
                this._goodFrames = 0;
                this.applySettings('headroom restored');
            }
        }

        if (!this._lastUiUpdate || metrics.nowMs - this._lastUiUpdate > 250) {
            this._lastUiUpdate = metrics.nowMs;
            this._renderStatus(false);
        }
    }

    _renderStatus(force) {
        if (!force && !this._els.status) return;
        const p = this._state.performance;
        const s = this._state;
        const scene = s.sceneIdx >= 0 ? s.scenes[s.sceneIdx] : null;
        const metrics = this._lastMetrics || {};
        const fps = p.avgFrameMs > 0 ? 1000 / p.avgFrameMs : metrics.fps;

        if (this._els.status) {
            this._els.status.textContent = p.status.toUpperCase();
            this._els.status.dataset.state = p.status;
        }
        if (this._els.scene) {
            this._els.scene.textContent = scene ? `${s.sceneIdx + 1}. ${scene.name}` : 'none';
        }
        if (this._els.layers) {
            const muted = s.layers.filter(l => l.muted).length;
            const solo = s.soloLayerId ? ' solo' : '';
            this._els.layers.textContent = `${s.layers.length} layer${s.layers.length === 1 ? '' : 's'}${muted ? ` / ${muted} muted` : ''}${solo}`;
        }
        if (this._els.fps) this._els.fps.textContent = Number.isFinite(fps) ? fps.toFixed(1) : '--';
        if (this._els.frame) this._els.frame.textContent = `${(p.avgFrameMs || 0).toFixed(1)} ms`;
        if (this._els.scale) this._els.scale.textContent = `${(p.renderScale * 100).toFixed(0)}%`;
        if (this._els.crossfade) {
            const cf = s.crossfade;
            this._els.crossfade.textContent = cf.active ? `${(cf.mix * 100).toFixed(0)}%` : 'idle';
        }
        if (this._els.midi) this._els.midi.textContent = this._lastMidiLabel;
        if (this._els.thumbnails) this._els.thumbnails.textContent = `${p.thumbnailIntervalMs} ms`;
    }
}
