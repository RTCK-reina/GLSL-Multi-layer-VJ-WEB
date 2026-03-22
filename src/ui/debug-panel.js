/**
 * DebugPanel — Performance monitor, sparkline graph, layer timing, and error log.
 *
 * Displays FPS, CPU%, GPU%, RAM, renderer info, frame time sparkline,
 * per-layer render timing, and a live error log with deduplication.
 *
 * Events consumed:
 *   debug:error    { message, source }
 *   toast          (indirectly — emits toast for mode toggle)
 */
export class DebugPanel {
    /**
     * @param {import('../core/event-bus.js').EventBus} bus
     * @param {import('../core/app-state.js').AppState} state
     */
    constructor(bus, state) {
        this._bus = bus;
        this._state = state;

        // DOM references
        this._panel = null;
        this._toggleBtn = null;
        this._elements = null;

        // Metrics (smoothed)
        this._updateMs = 300;
        this._lastUpdateMs = 0;
        this._lastFrameStartMs = 0;
        this._avgFrameMs = 16.67;
        this._avgCpuMs = 0;
        this._avgRenderMs = 0;

        // Sparkline
        this._sparkCanvas = null;
        this._sparkCtx = null;
        this._sparkData = [];         // ring buffer of frame times (ms)
        this._sparkMaxSamples = 140;  // half-pixel per sample on 280px canvas
        this._sparkRedrawMs = 100;    // throttle sparkline redraws
        this._sparkLastDraw = 0;

        // Layer timing
        this._layerTimingEl = null;
        this._frameMsEl = null;
        this._layerTimings = [];      // set externally each frame

        // Error log
        this._errorLog = [];
        this._errorLimit = 8;

        // Renderer label (cached)
        this._rendererLabel = '';

        // Listen for debug errors from other modules
        bus.on('debug:error', ({ message, source }) => this.recordError(message, source));
    }

    /**
     * Call once after DOM ready. Accepts renderer label string.
     * @param {string} rendererLabel
     */
    initUI(rendererLabel) {
        this._rendererLabel = rendererLabel || 'WebGL';
        this._panel = document.getElementById('debug-panel');
        this._toggleBtn = document.getElementById('debug-toggle-btn');
        this._elements = {
            fps: document.getElementById('debug-fps'),
            cpu: document.getElementById('debug-cpu'),
            gpu: document.getElementById('debug-gpu'),
            ram: document.getElementById('debug-ram'),
            ramUsed: document.getElementById('debug-ram-used'),
            renderer: document.getElementById('debug-renderer'),
            encoder: document.getElementById('debug-encoder'),
            codec: document.getElementById('debug-codec'),
            input: document.getElementById('debug-input'),
            errors: document.getElementById('debug-errors')
        };

        // Sparkline canvas
        this._sparkCanvas = document.getElementById('debug-sparkline');
        if (this._sparkCanvas) {
            this._sparkCtx = this._sparkCanvas.getContext('2d');
        }

        // Layer timing container
        this._layerTimingEl = document.getElementById('debug-layer-timing');
        this._frameMsEl = document.getElementById('debug-frame-ms');

        if (this._toggleBtn) {
            this._toggleBtn.onclick = () => this.setMode(!this._state.debugEnabled, { showToast: true });
        }

        const clearBtn = document.getElementById('debug-errors-clear-btn');
        if (clearBtn) clearBtn.onclick = () => this.clearErrors();

        this.setMode(this._state.debugEnabled, { showToast: false });
        this.refreshStaticInfo();
        this._renderErrors();
    }

    // --- Error handling ---

    normalizeErrorMessage(raw) {
        if (raw === null || raw === undefined) return '';
        const text = typeof raw === 'string' ? raw : (raw.stack || raw.message || String(raw));
        const compact = String(text).replace(/\s+/g, ' ').trim();
        if (!compact) return '';
        return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
    }

    recordError(rawMessage, source = 'runtime') {
        const message = this.normalizeErrorMessage(rawMessage);
        if (!message) return;

        const nowMs = performance.now();
        const last = this._errorLog[this._errorLog.length - 1];
        if (last && last.message === message && (nowMs - last.nowMs) < 1200) return;

        this._errorLog.push({ message, source, nowMs, timestamp: Date.now() });
        if (this._errorLog.length > this._errorLimit) {
            this._errorLog.splice(0, this._errorLog.length - this._errorLimit);
        }
        this._renderErrors();
    }

    clearErrors() {
        this._errorLog = [];
        this._renderErrors();
    }

    _renderErrors() {
        if (!this._elements || !this._elements.errors) return;
        const container = this._elements.errors;
        container.innerHTML = '';

        if (!this._errorLog.length) {
            const empty = document.createElement('div');
            empty.className = 'text-slate-500';
            empty.textContent = 'No errors';
            container.appendChild(empty);
            return;
        }

        [...this._errorLog].reverse().forEach(entry => {
            const row = document.createElement('div');
            row.className = 'border border-red-900/40 bg-red-950/20 rounded px-2 py-1 text-red-100';

            const meta = document.createElement('div');
            meta.className = 'text-[8px] text-red-300/80 mb-0.5';
            const time = new Date(entry.timestamp).toLocaleTimeString();
            meta.textContent = `${time} | ${entry.source}`;

            const body = document.createElement('div');
            body.className = 'break-words';
            body.textContent = entry.message;

            row.append(meta, body);
            container.appendChild(row);
        });
    }

    // --- Mode toggle ---

    setMode(enabled, options = {}) {
        this._state.debugEnabled = !!enabled;
        localStorage.setItem('vj_debug_mode', this._state.debugEnabled ? '1' : '0');

        if (this._panel) {
            this._panel.classList.toggle('hidden', !this._state.debugEnabled);
        }
        if (this._toggleBtn) {
            this._toggleBtn.classList.toggle('text-cyan-300', this._state.debugEnabled);
            this._toggleBtn.classList.toggle('border-cyan-700', this._state.debugEnabled);
            this._toggleBtn.classList.toggle('bg-cyan-950/40', this._state.debugEnabled);
        }
        if (this._state.debugEnabled) {
            this._lastUpdateMs = 0;
            this.refreshStaticInfo();
        }
        if (options.showToast) {
            this._bus.emit('toast', {
                msg: this._state.debugEnabled ? 'Debug monitor enabled' : 'Debug monitor disabled',
                type: 'info'
            });
        }
    }

    // --- Static info ---

    /**
     * Update static info fields (renderer, input).
     * @param {MediaStream|null} webcamStream
     */
    refreshStaticInfo(webcamStream) {
        if (!this._elements || !this._elements.renderer) return;

        let inputText = 'none';
        if (webcamStream) {
            const track = webcamStream.getVideoTracks && webcamStream.getVideoTracks()[0];
            if (track) {
                const s = track.getSettings ? track.getSettings() : {};
                const w = s.width || '?';
                const h = s.height || '?';
                const fps = Number.isFinite(Number(s.frameRate)) ? Number(s.frameRate).toFixed(1) : '?';
                inputText = `webcam ${w}x${h}@${fps}fps`;
            } else {
                inputText = 'webcam active';
            }
        }

        this._elements.renderer.textContent = this._rendererLabel;
        this._elements.encoder.textContent = 'none (inactive)';
        this._elements.codec.textContent = 'n/a (no recording pipeline)';
        this._elements.input.textContent = inputText;
    }

    // --- Per-frame metrics ---

    /**
     * Accept per-layer timing data from the renderer.
     * @param {Array<{name: string, ms: number}>} timings
     */
    setLayerTimings(timings) {
        this._layerTimings = timings;
    }

    /**
     * Called every frame from the render loop.
     * @param {number} nowMs
     * @param {number} frameDeltaMs
     * @param {number} cpuMs
     * @param {number} renderMs
     */
    updateMetrics(nowMs, frameDeltaMs, cpuMs, renderMs) {
        const smooth = (prev, next) => {
            if (!Number.isFinite(next)) return prev;
            if (!Number.isFinite(prev) || prev <= 0) return next;
            return prev + (next - prev) * 0.2;
        };

        const safeFrame = Number.isFinite(frameDeltaMs) && frameDeltaMs > 0 ? frameDeltaMs : 16.67;
        this._avgFrameMs = smooth(this._avgFrameMs, safeFrame);
        this._avgCpuMs = smooth(this._avgCpuMs, Math.max(0, cpuMs));
        this._avgRenderMs = smooth(this._avgRenderMs, Math.max(0, renderMs));

        // Sparkline: always record, even when panel hidden (keeps history)
        this._sparkData.push(cpuMs);
        if (this._sparkData.length > this._sparkMaxSamples) {
            this._sparkData.shift();
        }

        if (!this._state.debugEnabled || !this._elements || !this._elements.fps) return;
        if (nowMs - this._lastUpdateMs < this._updateMs) return;
        this._lastUpdateMs = nowMs;

        const fps = this._avgFrameMs > 0 ? (1000 / this._avgFrameMs) : 0;
        const cpuPct = Math.max(0, Math.min(100, (this._avgCpuMs / this._avgFrameMs) * 100));
        const gpuPct = Math.max(0, Math.min(100, (this._avgRenderMs / this._avgFrameMs) * 100));

        let ramPctText = 'N/A';
        let ramUsedText = 'N/A';
        if (performance && performance.memory && performance.memory.jsHeapSizeLimit > 0) {
            const used = performance.memory.usedJSHeapSize;
            const limit = performance.memory.jsHeapSizeLimit;
            const ramPct = Math.max(0, Math.min(100, (used / limit) * 100));
            ramPctText = `${ramPct.toFixed(1)}%`;
            const fmt = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
            ramUsedText = `${fmt(used)} / ${fmt(limit)}`;
        }

        this._elements.fps.textContent = fps.toFixed(1);
        this._elements.cpu.textContent = `${cpuPct.toFixed(1)}%`;
        this._elements.gpu.textContent = `${gpuPct.toFixed(1)}%`;
        this._elements.ram.textContent = ramPctText;
        this._elements.ramUsed.textContent = ramUsedText;

        // Frame time display
        if (this._frameMsEl) {
            this._frameMsEl.textContent = `${this._avgCpuMs.toFixed(1)} ms`;
        }

        // Sparkline (throttled redraw)
        if (nowMs - this._sparkLastDraw >= this._sparkRedrawMs) {
            this._sparkLastDraw = nowMs;
            this._drawSparkline();
        }

        // Layer timing
        this._renderLayerTimings();
    }

    // --- Sparkline rendering ---

    _drawSparkline() {
        const ctx = this._sparkCtx;
        if (!ctx || !this._sparkCanvas) return;

        const w = this._sparkCanvas.width;
        const h = this._sparkCanvas.height;
        const data = this._sparkData;
        const len = data.length;
        if (len < 2) return;

        ctx.clearRect(0, 0, w, h);

        // Target line at 16.67ms (60fps)
        const maxMs = 33.33;  // scale: 0 → 33.33ms
        const targetY = h - (16.67 / maxMs) * h;

        // Draw 16.67ms reference line
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, targetY);
        ctx.lineTo(w, targetY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw sparkline
        const step = w / (this._sparkMaxSamples - 1);
        const startX = w - (len - 1) * step;

        ctx.beginPath();
        for (let i = 0; i < len; i++) {
            const x = startX + i * step;
            const val = Math.min(data[i], maxMs);
            const y = h - (val / maxMs) * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        // Color based on latest value
        const latest = data[len - 1];
        if (latest > 20) {
            ctx.strokeStyle = '#f87171'; // red — over budget
        } else if (latest > 14) {
            ctx.strokeStyle = '#fbbf24'; // yellow — borderline
        } else {
            ctx.strokeStyle = '#34d399'; // green — healthy
        }
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Fill under curve
        ctx.lineTo(startX + (len - 1) * step, h);
        ctx.lineTo(startX, h);
        ctx.closePath();
        ctx.fillStyle = latest > 20 ? 'rgba(248,113,113,0.1)' : latest > 14 ? 'rgba(251,191,36,0.08)' : 'rgba(52,211,153,0.08)';
        ctx.fill();
    }

    // --- Layer timing rendering ---

    _renderLayerTimings() {
        if (!this._layerTimingEl) return;
        const timings = this._layerTimings;

        if (!timings || timings.length === 0) {
            this._layerTimingEl.textContent = 'No layers';
            return;
        }

        // Rebuild DOM only if layer count changed
        const children = this._layerTimingEl.children;
        if (children.length !== timings.length) {
            this._layerTimingEl.innerHTML = '';
            for (let i = 0; i < timings.length; i++) {
                const row = document.createElement('div');
                row.className = 'flex justify-between text-slate-400';
                const nameEl = document.createElement('span');
                nameEl.className = 'truncate mr-2';
                const msEl = document.createElement('span');
                msEl.className = 'text-white shrink-0';
                row.append(nameEl, msEl);
                this._layerTimingEl.appendChild(row);
            }
        }

        for (let i = 0; i < timings.length; i++) {
            const row = this._layerTimingEl.children[i];
            if (!row) continue;
            row.children[0].textContent = timings[i].name;
            row.children[1].textContent = `${timings[i].ms.toFixed(2)} ms`;
        }
    }

    /** Install global window.error and unhandledrejection hooks. */
    installGlobalErrorHooks() {
        window.addEventListener('error', (e) => {
            if (e && e.error) {
                this.recordError(e.error, 'window.error');
                return;
            }
            const file = e && e.filename ? e.filename.split('/').pop() : '';
            const loc = (e && e.lineno) ? `:${e.lineno}${e.colno ? `:${e.colno}` : ''}` : '';
            const msg = `${(e && e.message) || 'Script error'}${file ? ` @ ${file}${loc}` : ''}`;
            this.recordError(msg, 'window.error');
        }, true);

        window.addEventListener('unhandledrejection', (e) => {
            const reason = e && e.reason;
            this.recordError(reason || 'Unhandled promise rejection', 'promise');
        });
    }
}
