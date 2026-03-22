const THREE = window.THREE;
const SHADERS = window.SHADERS || {};

if (!THREE) {
    throw new Error('THREE library failed to load.');
}
if (!Object.keys(SHADERS).length) {
    throw new Error('Shader catalog failed to load.');
}
// --- CORE SYSTEM ---
        class VJApp {
            constructor() {
                this.width = 1920; this.height = 1080;
                this.preserveDrawingBuffer = localStorage.getItem('vj_preserve_buffer') === '1';
                this.dprMode = localStorage.getItem('vj_dpr') || '1';
                this.initThree();
                this.audio = new AudioAnalyzer();
                this.layers = [];
                this.scenes = [];
                this.sceneIdx = -1;
                this.webcam = null;
                this.midi = { inputs: [], map: {} };
                this.sceneSaveTimer = null;
                this.thumbIntervalMs = 100; // 10fps
                this.thumbLastUpdate = 0;
                this.thumbRT = null;
                this.thumbPixels = null;
                this.thumbImageData = null;
                
                this.audioBars = []; // Cache for audio bars
                this.fpsElement = null; // Cache for FPS display
                // FPS Counter Variables
                this.fpsTime = 0;
                this.frames = 0;
                this.layerIdCounter = 0;
                this.projectStorageKey = 'vj_project_autosave_v0_5';
                this.projectSaveTimer = null;
                this.storageErrorShown = false;
                this.editorSaveAction = null;
                this.editorCommandsBound = false;
                this.popupWindow = null;
                this.popupCanvas = null;
                this.webcamStream = null;
                const savedBpm = Number(localStorage.getItem('vj_bpm'));
                this.bpm = Number.isFinite(savedBpm) ? Math.max(40, Math.min(300, savedBpm)) : 120;
                this.bpmRunning = localStorage.getItem('vj_bpm_running') !== '0';
                this.beatOriginTime = 0;
                this.beatPausedValue = 0;
                this.tapLastMs = 0;
                this.tapIntervals = [];
                this.bpmInputEl = null;
                this.bpmDisplayEl = null;
                this.beatIndicatorEl = null;
                this.debugEnabled = localStorage.getItem('vj_debug_mode') === '1';
                this.debugPanel = null;
                this.debugToggleBtn = null;
                this.debugElements = null;
                this.debugUpdateMs = 300;
                this.debugLastUpdateMs = 0;
                this.debugLastFrameStartMs = 0;
                this.debugAvgFrameMs = 16.67;
                this.debugAvgCpuMs = 0;
                this.debugAvgRenderMs = 0;
                this.debugErrorLog = [];
                this.debugErrorLimit = 8;
                this.debugErrorHooked = false;

                this.installGlobalErrorHooks();
                this.initUI();
                this.initMidi();
                if (!this.restoreProjectFromStorage()) {
                    this.loadDefaultScene();
                }
                this.animate();
                window.addEventListener('beforeunload', () => this.shutdown());
            }

            initThree() {
                const canvas = document.getElementById('main-canvas');
                this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: this.preserveDrawingBuffer, alpha: false });
                this.renderer.setSize(this.width, this.height);
                const pr = this.dprMode === 'device' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
                this.renderer.setPixelRatio(pr);
                this.scene = new THREE.Scene();
                this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
                this.scene.add(this.quad);
                this.clock = new THREE.Clock();
                this.rendererLabel = this.detectRendererLabel();
                
                // Ping-Pong Buffers
                const pars = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
                this.bufferA = new THREE.WebGLRenderTarget(this.width, this.height, pars);
                this.bufferB = new THREE.WebGLRenderTarget(this.width, this.height, pars);
                
                // Common Materials
                this.copyMat = new THREE.ShaderMaterial({
                    uniforms: { u_texture: { value: null } },
                    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
                    fragmentShader: `uniform sampler2D u_texture; varying vec2 vUv; void main() { gl_FragColor = texture2D(u_texture, vUv); }`
                });

                // Thumbnail copy material (flip Y in shader)
                this.thumbCopyMat = new THREE.ShaderMaterial({
                    uniforms: { u_texture: { value: null } },
                    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
                    fragmentShader: `uniform sampler2D u_texture; varying vec2 vUv; void main() { vec2 uv = vec2(vUv.x, 1.0 - vUv.y); gl_FragColor = texture2D(u_texture, uv); }`
                });
                
                this.compMat = new THREE.ShaderMaterial({
                    uniforms: { u_base: {value:null}, u_layer: {value:null}, u_blend: {value:0}, u_opacity: {value:1}, u_isBase: {value:0} },
                    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
                    fragmentShader: `
                        uniform sampler2D u_base; uniform sampler2D u_layer; uniform int u_blend; uniform float u_opacity; uniform int u_isBase; varying vec2 vUv;
                        vec3 blend(vec3 b, vec3 l, int m) {
                            if(m==1) return b+l; if(m==2) return b*l; if(m==3) return 1.-(1.-b)*(1.-l); if(m==4) return abs(b-l); return l;
                        }
                        void main() {
                            vec4 b = texture2D(u_base, vUv); vec4 l = texture2D(u_layer, vUv);
                            if(u_isBase==1) { gl_FragColor = vec4(l.rgb, 1.0); return; }
                            gl_FragColor = vec4(mix(b.rgb, blend(b.rgb, l.rgb, u_blend), l.a * u_opacity), 1.0);
                        }
                    `
                });
            }

            async initWebCam() {
                if (this.webcam) return;
                try {
                    const el = document.createElement('video');
                    el.playsInline = true;
                    el.muted = true;
                    el.autoplay = true;
                    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                    this.webcamStream = stream;
                    el.srcObject = stream;
                    el.play();
                    this.webcam = new THREE.VideoTexture(el);
                    this.refreshDebugStaticInfo();
                } catch(e) {
                    console.error("WebCam Error", e);
                    this.recordDebugError(e, 'webcam');
                    this.refreshDebugStaticInfo();
                }
            }

            animate() {
                requestAnimationFrame(this.animate.bind(this));

                const frameStart = performance.now();
                const frameDelta = this.debugLastFrameStartMs > 0 ? (frameStart - this.debugLastFrameStartMs) : 16.67;
                this.debugLastFrameStartMs = frameStart;

                // --- FPS CALCULATION (Frame Counting Method) ---
                const now = frameStart;
                this.frames++;
                if (now >= this.fpsTime + 1000) {
                    if (this.fpsElement) this.fpsElement.textContent = `FPS: ${this.frames}`;
                    this.frames = 0;
                    this.fpsTime = now;
                }
                
                const time = this.clock.getElapsedTime();
                const audio = this.audio.update();
                const beatState = this.getBeatState(time);
                // Visualizer
                if(this.audioBars.length === 3) {
                    this.audioBars[0].style.height = `${5 + audio.bass * 95}%`;
                    this.audioBars[1].style.height = `${5 + audio.mid * 95}%`;
                    this.audioBars[2].style.height = `${5 + audio.treble * 95}%`;
                }
                if (this.beatIndicatorEl) {
                    const pulse = Math.max(0, 1 - beatState.phase * 4);
                    this.beatIndicatorEl.style.opacity = this.bpmRunning ? `${0.25 + pulse * 0.75}` : '0.18';
                    this.beatIndicatorEl.style.transform = `scale(${0.9 + pulse * 0.35})`;
                }

                const renderStart = performance.now();

                // Render Pipeline
                let read = this.bufferA;
                let write = this.bufferB;
                
                this.renderer.setRenderTarget(read);
                this.renderer.clear();
                
                // Determine base
                let baseIdx = this.layers.findIndex(l => !l.needsInput);
                if (baseIdx === -1 && this.layers.length > 0) baseIdx = 0;

                this.layers.forEach((layer, i) => {
                    // Update Uniforms
                    layer.uniforms.u_time.value = time;
                    layer.uniforms.u_bass.value = audio.bass;
                    layer.uniforms.u_mid.value = audio.mid;
                    layer.uniforms.u_treble.value = audio.treble;
                    layer.uniforms.u_bpm.value = this.bpm;
                    layer.uniforms.u_beat.value = beatState.beat;
                    layer.uniforms.u_phase.value = beatState.phase;
                    
                    if (layer.isWebCam && this.webcam) layer.uniforms.u_webcamTexture.value = this.webcam;
                    if (layer.needsInput) layer.uniforms.u_inputTexture.value = read.texture;
                    if (layer.isFeedback) layer.uniforms.u_prevLayer.value = layer.fbo.texture;

                    // Draw Layer
                    this.renderer.setRenderTarget(layer.renderTarget);
                    this.renderer.clear();
                    this.quad.material = layer.material;
                    this.renderer.render(this.scene, this.camera);

                    // Feedback Loop
                    if(layer.isFeedback) {
                        this.renderer.setRenderTarget(layer.fbo);
                        this.copyMat.uniforms.u_texture.value = layer.renderTarget.texture;
                        this.quad.material = this.copyMat;
                        this.renderer.render(this.scene, this.camera);
                    }

                    // Composite
                    const isBase = i === baseIdx;
                    this.compMat.uniforms.u_base.value = read.texture;
                    this.compMat.uniforms.u_layer.value = layer.renderTarget.texture;
                    this.compMat.uniforms.u_blend.value = isBase ? 0 : layer.blend;
                    this.compMat.uniforms.u_opacity.value = isBase ? 1.0 : layer.opacity;
                    this.compMat.uniforms.u_isBase.value = isBase ? 1 : 0;
                    
                    this.renderer.setRenderTarget(write);
                    this.renderer.clear();
                    this.quad.material = this.compMat;
                    this.renderer.render(this.scene, this.camera);
                    
                    [read, write] = [write, read];
                });

                // Final Output
                this.renderer.setRenderTarget(null);
                this.copyMat.uniforms.u_texture.value = read.texture;
                this.quad.material = this.copyMat;
                this.renderer.render(this.scene, this.camera);

                if (this.popupWindow && this.popupWindow.closed) {
                    this.popupWindow = null;
                    this.popupCanvas = null;
                    this.popupCtx = null;
                }
                if(this.popupCtx) this.popupCtx.drawImage(this.renderer.domElement, 0, 0);
                
                // Update layer thumbnails (time-based throttle)
                if (now - this.thumbLastUpdate >= this.thumbIntervalMs) {
                    this.thumbLastUpdate = now;
                    this.updateThumbnails();
                }

                const frameEnd = performance.now();
                const cpuMs = frameEnd - frameStart;
                const renderMs = frameEnd - renderStart;
                this.updateDebugMetrics(frameEnd, frameDelta, cpuMs, renderMs);
            }
            
            updateThumbnails() {
                const prevTarget = this.renderer.getRenderTarget();
                const prevMaterial = this.quad.material;

                this.layers.forEach(layer => {
                    if (!layer.thumbCanvas || !layer.thumbCtx) return;
                    
                    // Read from layer's render target
                    const rt = layer.renderTarget;
                    const w = layer.thumbCanvas.width;
                    const h = layer.thumbCanvas.height;
                    
                    // Use a shared small render target for thumbnail
                    if (!this.thumbRT || this.thumbRT.width !== w || this.thumbRT.height !== h) {
                        if (this.thumbRT) this.thumbRT.dispose();
                        this.thumbRT = new THREE.WebGLRenderTarget(w, h, {
                            minFilter: THREE.LinearFilter,
                            magFilter: THREE.LinearFilter
                        });
                    }

                    if (!this.thumbPixels || !this.thumbImageData || this.thumbImageData.width !== w || this.thumbImageData.height !== h) {
                        this.thumbPixels = new Uint8Array(w * h * 4);
                        this.thumbImageData = new ImageData(new Uint8ClampedArray(this.thumbPixels.buffer), w, h);
                    }
                    
                    // Copy layer to thumb RT
                    this.renderer.setRenderTarget(this.thumbRT);
                    this.thumbCopyMat.uniforms.u_texture.value = rt.texture;
                    this.quad.material = this.thumbCopyMat;
                    this.renderer.render(this.scene, this.camera);
                    
                    // Read pixels
                    this.renderer.readRenderTargetPixels(this.thumbRT, 0, 0, w, h, this.thumbPixels);
                    layer.thumbCtx.putImageData(this.thumbImageData, 0, 0);
                });
                
                // Restore render target
                this.renderer.setRenderTarget(prevTarget);
                this.quad.material = prevMaterial;
            }

            initDebugUI() {
                this.debugPanel = document.getElementById('debug-panel');
                this.debugToggleBtn = document.getElementById('debug-toggle-btn');
                this.debugElements = {
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

                if (this.debugToggleBtn) {
                    this.debugToggleBtn.onclick = () => this.setDebugMode(!this.debugEnabled, { showToast: true });
                }

                const clearBtn = document.getElementById('debug-errors-clear-btn');
                if (clearBtn) clearBtn.onclick = () => this.clearDebugErrors();

                this.setDebugMode(this.debugEnabled, { showToast: false });
                this.refreshDebugStaticInfo();
                this.renderDebugErrors();
            }

            normalizeDebugErrorMessage(raw) {
                if (raw === null || raw === undefined) return '';
                const text = typeof raw === 'string' ? raw : (raw.stack || raw.message || String(raw));
                const compact = String(text).replace(/\s+/g, ' ').trim();
                if (!compact) return '';
                return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
            }

            recordDebugError(rawMessage, source = 'runtime') {
                const message = this.normalizeDebugErrorMessage(rawMessage);
                if (!message) return;

                const nowMs = performance.now();
                const last = this.debugErrorLog[this.debugErrorLog.length - 1];
                if (last && last.message === message && (nowMs - last.nowMs) < 1200) return;

                this.debugErrorLog.push({
                    message,
                    source,
                    nowMs,
                    timestamp: Date.now()
                });
                if (this.debugErrorLog.length > this.debugErrorLimit) {
                    this.debugErrorLog.splice(0, this.debugErrorLog.length - this.debugErrorLimit);
                }
                this.renderDebugErrors();
            }

            clearDebugErrors() {
                this.debugErrorLog = [];
                this.renderDebugErrors();
            }

            renderDebugErrors() {
                if (!this.debugElements || !this.debugElements.errors) return;
                const container = this.debugElements.errors;
                container.innerHTML = '';

                if (!this.debugErrorLog.length) {
                    const empty = document.createElement('div');
                    empty.className = 'text-slate-500';
                    empty.textContent = 'No errors';
                    container.appendChild(empty);
                    return;
                }

                [...this.debugErrorLog].reverse().forEach(entry => {
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

            installGlobalErrorHooks() {
                if (this.debugErrorHooked) return;
                this.debugErrorHooked = true;

                window.addEventListener('error', (e) => {
                    if (e && e.error) {
                        this.recordDebugError(e.error, 'window.error');
                        return;
                    }
                    const file = e && e.filename ? e.filename.split('/').pop() : '';
                    const loc = (e && e.lineno) ? `:${e.lineno}${e.colno ? `:${e.colno}` : ''}` : '';
                    const msg = `${(e && e.message) || 'Script error'}${file ? ` @ ${file}${loc}` : ''}`;
                    this.recordDebugError(msg, 'window.error');
                }, true);

                window.addEventListener('unhandledrejection', (e) => {
                    const reason = e && e.reason;
                    this.recordDebugError(reason || 'Unhandled promise rejection', 'promise');
                });
            }
            detectRendererLabel() {
                if (!this.renderer) return 'WebGL';
                const gl = this.renderer.getContext();
                const api = this.renderer.capabilities && this.renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1';
                if (!gl) return api;
                try {
                    const ext = gl.getExtension('WEBGL_debug_renderer_info');
                    if (ext) {
                        const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
                        const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
                        if (renderer && vendor) return `${api} ${vendor} / ${renderer}`;
                        if (renderer) return `${api} ${renderer}`;
                    }
                } catch (e) {
                    console.warn('Renderer info unavailable', e);
                }
                return api;
            }

            setDebugMode(enabled, options = {}) {
                this.debugEnabled = !!enabled;
                localStorage.setItem('vj_debug_mode', this.debugEnabled ? '1' : '0');

                if (this.debugPanel) {
                    this.debugPanel.classList.toggle('hidden', !this.debugEnabled);
                }

                if (this.debugToggleBtn) {
                    this.debugToggleBtn.classList.toggle('text-cyan-300', this.debugEnabled);
                    this.debugToggleBtn.classList.toggle('border-cyan-700', this.debugEnabled);
                    this.debugToggleBtn.classList.toggle('bg-cyan-950/40', this.debugEnabled);
                }

                if (this.debugEnabled) {
                    this.debugLastUpdateMs = 0;
                    this.refreshDebugStaticInfo();
                }

                if (options.showToast) {
                    this.showToast(this.debugEnabled ? 'Debug monitor enabled' : 'Debug monitor disabled', 'info');
                }
            }

            refreshDebugStaticInfo() {
                if (!this.debugElements || !this.debugElements.renderer) return;

                const rendererText = this.rendererLabel || this.detectRendererLabel();
                this.rendererLabel = rendererText;

                let inputText = 'none';
                if (this.webcamStream) {
                    const track = this.webcamStream.getVideoTracks && this.webcamStream.getVideoTracks()[0];
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

                this.debugElements.renderer.textContent = rendererText;
                this.debugElements.encoder.textContent = 'none (inactive)';
                this.debugElements.codec.textContent = 'n/a (no recording pipeline)';
                this.debugElements.input.textContent = inputText;
            }

            formatMiB(bytes) {
                if (!Number.isFinite(bytes) || bytes < 0) return 'N/A';
                return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
            }

            updateDebugMetrics(nowMs, frameDeltaMs, cpuMs, renderMs) {
                const smooth = (prev, next) => {
                    if (!Number.isFinite(next)) return prev;
                    if (!Number.isFinite(prev) || prev <= 0) return next;
                    return prev + (next - prev) * 0.2;
                };

                const safeFrame = Number.isFinite(frameDeltaMs) && frameDeltaMs > 0 ? frameDeltaMs : 16.67;
                this.debugAvgFrameMs = smooth(this.debugAvgFrameMs, safeFrame);
                this.debugAvgCpuMs = smooth(this.debugAvgCpuMs, Math.max(0, cpuMs));
                this.debugAvgRenderMs = smooth(this.debugAvgRenderMs, Math.max(0, renderMs));

                if (!this.debugEnabled || !this.debugElements || !this.debugElements.fps) return;
                if (nowMs - this.debugLastUpdateMs < this.debugUpdateMs) return;
                this.debugLastUpdateMs = nowMs;

                const fps = this.debugAvgFrameMs > 0 ? (1000 / this.debugAvgFrameMs) : 0;
                const cpuPct = Math.max(0, Math.min(100, (this.debugAvgCpuMs / this.debugAvgFrameMs) * 100));
                const gpuPct = Math.max(0, Math.min(100, (this.debugAvgRenderMs / this.debugAvgFrameMs) * 100));

                let ramPctText = 'N/A';
                let ramUsedText = 'N/A';
                if (performance && performance.memory && performance.memory.jsHeapSizeLimit > 0) {
                    const used = performance.memory.usedJSHeapSize;
                    const limit = performance.memory.jsHeapSizeLimit;
                    const ramPct = Math.max(0, Math.min(100, (used / limit) * 100));
                    ramPctText = `${ramPct.toFixed(1)}%`;
                    ramUsedText = `${this.formatMiB(used)} / ${this.formatMiB(limit)}`;
                }

                this.debugElements.fps.textContent = fps.toFixed(1);
                this.debugElements.cpu.textContent = `${cpuPct.toFixed(1)}%`;
                this.debugElements.gpu.textContent = `${gpuPct.toFixed(1)}%`;
                this.debugElements.ram.textContent = ramPctText;
                this.debugElements.ramUsed.textContent = ramUsedText;
                this.refreshDebugStaticInfo();
            }

            // --- UI & Logic ---
            initUI() {
                // Cache audio bar elements for performance
                this.audioBars = Array.from(document.querySelectorAll('.audio-bar'));
                this.fpsElement = document.getElementById('fps-counter');
                this.initDebugUI();

                // Audio
                document.getElementById('audio-enable-btn').onclick = async () => {
                    if (await this.audio.init()) {
                        document.getElementById('audio-enable-btn').classList.add('text-green-400', 'border-green-500');
                        document.getElementById('audio-enable-btn').textContent = "AUDIO ACTIVE";
                    } else {
                        this.showToast("Audio access denied or unavailable", "error");
                    }
                };

                // Res
                document.getElementById('resolution-select').onchange = e => {
                    const [w, h] = e.target.value.split(',').map(Number);
                    this.width = w; this.height = h;
                    this.renderer.setSize(w, h);
                    this.bufferA.setSize(w, h); this.bufferB.setSize(w, h);
                    this.layers.forEach(l => {
                        l.renderTarget.setSize(w, h);
                        if(l.fbo) l.fbo.setSize(w, h);
                        l.uniforms.u_resolution.value.set(w, h);
                    });
                    document.getElementById('resolution-display').textContent = `${w}x${h}`;
                    this.syncPopupSize();
                    this.queueSceneSave();
                };
                
                // DPR
                const dprSelect = document.getElementById('dpr-select');
                dprSelect.value = this.dprMode;
                dprSelect.onchange = e => {
                    this.dprMode = e.target.value;
                    localStorage.setItem('vj_dpr', this.dprMode);
                    const pr = this.dprMode === 'device' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
                    this.renderer.setPixelRatio(pr);
                };

                // Preserve Buffer Toggle (requires reload)
                const preserveToggle = document.getElementById('preserve-buffer-toggle');
                preserveToggle.checked = this.preserveDrawingBuffer;
                preserveToggle.onchange = e => {
                    const v = e.target.checked ? '1' : '0';
                    localStorage.setItem('vj_preserve_buffer', v);
                    if (confirm("Reload to apply Preserve Buffer setting?")) {
                        location.reload();
                    }
                };

                // BPM Sync
                this.bpmInputEl = document.getElementById('bpm-input');
                this.bpmDisplayEl = document.getElementById('bpm-display');
                this.beatIndicatorEl = document.getElementById('beat-indicator');
                const tapTempoBtn = document.getElementById('tap-tempo-btn');
                const beatResetBtn = document.getElementById('beat-reset-btn');
                const beatRunToggle = document.getElementById('beat-run-toggle');
                if (this.bpmInputEl) {
                    this.bpmInputEl.onchange = (e) => this.setBpm(e.target.value, { showToast: true });
                    this.bpmInputEl.onkeydown = (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            this.bpmInputEl.blur();
                        }
                    };
                }
                if (tapTempoBtn) tapTempoBtn.onclick = () => this.tapTempo();
                if (beatResetBtn) beatResetBtn.onclick = () => {
                    this.resetBeatPhase();
                    this.showToast("Beat phase reset", "info");
                };
                if (beatRunToggle) {
                    beatRunToggle.checked = this.bpmRunning;
                    beatRunToggle.onchange = (e) => this.setBeatRunning(!!e.target.checked, { showToast: true });
                }
                this.refreshBpmUI();

                // Modals
                const showModal = id => {
                    const m = document.getElementById(id);
                    m.classList.remove('hidden');
                    setTimeout(() => m.classList.remove('opacity-0'), 10);
                };
                const hideModal = id => {
                    const m = document.getElementById(id);
                    m.classList.add('opacity-0');
                    setTimeout(() => m.classList.add('hidden'), 300);
                };
                this.showModal = showModal;
                this.hideModal = hideModal;
                
                // Helper to close rename modal
                this.closeRenameModal = () => hideModal('rename-modal');
                
                document.getElementById('add-layer-btn').onclick = () => showModal('shader-modal');
                document.querySelectorAll('.close-modal').forEach(b => b.onclick = () => { hideModal('shader-modal'); hideModal('code-modal'); });

                // Accordion Shader List
                const listContainer = document.getElementById('shader-list-container');
                const groups = { 'High-End Generators': [], 'Standard Generators': [], 'Filters / FX': [] };
                
                Object.keys(SHADERS).forEach(k => {
                    const s = SHADERS[k];
                    if (s.needsInput) groups['Filters / FX'].push(k);
                    else if (['RAYMARCHING', 'TUNNEL', 'FLUID'].includes(s.type)) groups['High-End Generators'].push(k);
                    else groups['Standard Generators'].push(k);
                });

                Object.keys(groups).forEach((title, i) => {
                    const div = document.createElement('div');
                    div.className = "mb-2 border border-slate-800 rounded bg-slate-900 overflow-hidden";
                    div.innerHTML = `
                        <div class="accordion-header p-3 cursor-pointer flex justify-between items-center hover:bg-slate-800 ${i===0?'open':''}">
                            <span class="text-xs font-bold text-slate-300 uppercase">${title}</span>
                            <span class="arrow text-[10px] text-slate-500">▶</span>
                        </div>
                        <div class="accordion-content ${i===0?'open':''}">
                            <div class="p-1 space-y-1 bg-slate-950/50 shader-group-${i}"></div>
                        </div>
                    `;
                    div.querySelector('.accordion-header').onclick = function() {
                        this.classList.toggle('open');
                        this.nextElementSibling.classList.toggle('open');
                    };
                    const content = div.querySelector(`.shader-group-${i}`);
                    groups[title].forEach(key => {
                        const btn = document.createElement('button');
                        btn.className = "w-full text-left px-3 py-2 text-[10px] text-slate-400 hover:text-white hover:bg-purple-900/30 rounded transition-colors font-mono";
                        btn.textContent = SHADERS[key].name;
                        btn.onclick = () => { this.addLayer(key); hideModal('shader-modal'); };
                        content.appendChild(btn);
                    });
                    listContainer.appendChild(div);
                });

                // Scene Logic
                document.getElementById('add-scene-btn').onclick = () => this.createScene();
                
                // Rename Modal Logic
                document.getElementById('rename-cancel-btn').onclick = () => this.closeRenameModal();
                
                // Allow renaming current scene by clicking the name
                document.getElementById('current-scene-name').onclick = () => {
                    if (this.sceneIdx >= 0) {
                        this.openRenameModal(this.sceneIdx);
                    }
                };

                // Sortable
                Sortable.create(document.getElementById('layer-stack'), { 
                    handle: '.layer-handle', animation: 150, 
                    onEnd: (evt) => {
                        const item = this.layers.splice(evt.oldIndex, 1)[0];
                        this.layers.splice(evt.newIndex, 0, item);
                        this.queueSceneSave();
                    }
                });

                // Output
                document.getElementById('output-window-btn').onclick = () => {
                    if (this.popupWindow && !this.popupWindow.closed) {
                        this.popupWindow.close();
                    }
                    const win = window.open('', 'VJ Output', `width=${this.width},height=${this.height},menubar=no`);
                    if(win) {
                        win.document.body.style.background = "#000"; win.document.body.style.margin = "0";
                        const c = document.createElement('canvas'); c.width = this.width; c.height = this.height;
                        c.style.cssText = "width:100%;height:100%;object-fit:contain;";
                        win.document.body.appendChild(c);
                        this.popupWindow = win;
                        this.popupCanvas = c;
                        this.popupCtx = c.getContext('2d');
                    }
                };

                // Export
                document.getElementById('export-btn').onclick = () => this.exportProject();

                // Import
                const fileInput = document.getElementById('file-input');
                document.getElementById('import-btn').onclick = () => fileInput.click();
                fileInput.onchange = (e) => {
                    const file = e.target.files[0];
                    if(!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        try {
                            const data = JSON.parse(ev.target.result);
                            if (!this.loadProjectData(data, { source: 'file', toastSuccess: true })) {
                                this.showToast("Invalid Project File", "error");
                            }
                        } catch(err) {
                            console.error(err);
                            this.showToast("Failed to load file", "error");
                        } finally {
                            fileInput.value = "";
                        }
                    };
                    reader.readAsText(file);
                };

                this.initGlobalShortcuts();
            }

            clampBpm(value) {
                const n = Number(value);
                if (!Number.isFinite(n)) return this.bpm || 120;
                return Math.max(40, Math.min(300, n));
            }

            persistSyncPrefs() {
                localStorage.setItem('vj_bpm', this.bpm.toFixed(3));
                localStorage.setItem('vj_bpm_running', this.bpmRunning ? '1' : '0');
            }

            getBeatState(timeSec = this.clock.getElapsedTime()) {
                const beatsPerSec = this.bpm / 60;
                const beat = this.bpmRunning
                    ? Math.max(0, (timeSec - this.beatOriginTime) * beatsPerSec)
                    : Math.max(0, this.beatPausedValue);
                const phase = beat - Math.floor(beat);
                return { beat, phase };
            }

            refreshBpmUI() {
                const runToggle = document.getElementById('beat-run-toggle');
                if (this.bpmInputEl && document.activeElement !== this.bpmInputEl) {
                    this.bpmInputEl.value = this.bpm.toFixed(1);
                }
                if (this.bpmDisplayEl) {
                    this.bpmDisplayEl.textContent = `${this.bpm.toFixed(1)} BPM${this.bpmRunning ? '' : ' (PAUSE)'}`;
                }
                if (runToggle) runToggle.checked = this.bpmRunning;
            }

            setBpm(value, options = {}) {
                const next = this.clampBpm(value);
                const now = this.clock.getElapsedTime();
                const currentBeat = this.getBeatState(now).beat;
                this.bpm = next;

                if (options.resetPhase) {
                    this.beatOriginTime = now;
                    this.beatPausedValue = 0;
                } else {
                    const beatsPerSec = this.bpm / 60;
                    if (this.bpmRunning) {
                        this.beatOriginTime = now - (currentBeat / beatsPerSec);
                    } else {
                        this.beatPausedValue = currentBeat;
                        this.beatOriginTime = now - (this.beatPausedValue / beatsPerSec);
                    }
                }

                if (!options.keepTapHistory) {
                    this.tapIntervals = [];
                    this.tapLastMs = 0;
                }
                this.persistSyncPrefs();
                this.refreshBpmUI();
                this.queueProjectAutoSave();
                if (options.showToast) this.showToast(`BPM ${this.bpm.toFixed(1)}`, "info");
            }

            setBeatRunning(running, options = {}) {
                const next = !!running;
                if (next === this.bpmRunning) {
                    this.refreshBpmUI();
                    return;
                }

                const now = this.clock.getElapsedTime();
                const beatsPerSec = this.bpm / 60;
                if (next) {
                    this.beatOriginTime = now - (this.beatPausedValue / beatsPerSec);
                    this.bpmRunning = true;
                } else {
                    this.beatPausedValue = this.getBeatState(now).beat;
                    this.bpmRunning = false;
                }

                this.persistSyncPrefs();
                this.refreshBpmUI();
                this.queueProjectAutoSave();
                if (options.showToast) this.showToast(next ? "Beat resumed" : "Beat paused", "info");
            }

            resetBeatPhase() {
                const now = this.clock.getElapsedTime();
                this.beatOriginTime = now;
                this.beatPausedValue = 0;
                this.persistSyncPrefs();
                this.refreshBpmUI();
                this.queueProjectAutoSave();
            }

            tapTempo() {
                const nowMs = performance.now();
                if (this.tapLastMs > 0 && nowMs - this.tapLastMs > 2200) this.tapIntervals = [];
                if (this.tapLastMs > 0) {
                    const interval = nowMs - this.tapLastMs;
                    if (interval >= 120 && interval <= 2000) {
                        this.tapIntervals.push(interval);
                        if (this.tapIntervals.length > 8) this.tapIntervals.shift();
                    }
                }
                this.tapLastMs = nowMs;

                if (this.tapIntervals.length >= 1) {
                    const sorted = [...this.tapIntervals].sort((a, b) => a - b);
                    const trimmed = sorted.length > 4 ? sorted.slice(1, -1) : sorted;
                    const avg = trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length;
                    const bpm = 60000 / avg;
                    this.setBpm(bpm, { resetPhase: true, keepTapHistory: true });
                } else {
                    this.resetBeatPhase();
                }

                this.refreshBpmUI();
            }

            serializeSyncState(timeSec = this.clock.getElapsedTime()) {
                const beatState = this.getBeatState(timeSec);
                return {
                    bpm: this.bpm,
                    running: this.bpmRunning,
                    beat: beatState.beat
                };
            }

            applySyncState(sync) {
                if (!sync || typeof sync !== 'object') return;
                this.bpm = this.clampBpm(sync.bpm);
                this.bpmRunning = sync.running !== false;
                const beatRaw = Number(sync.beat);
                const beat = Number.isFinite(beatRaw) && beatRaw >= 0 ? beatRaw : 0;
                this.beatPausedValue = beat;
                this.tapIntervals = [];
                this.tapLastMs = 0;
                const now = this.clock.getElapsedTime();
                const beatsPerSec = this.bpm / 60;
                this.beatOriginTime = now - (beat / beatsPerSec);
                this.persistSyncPrefs();
                this.refreshBpmUI();
            }

            initGlobalShortcuts() {
                if (this.globalHotkeysBound) return;
                this.globalHotkeysBound = true;
                window.addEventListener('keydown', (e) => {
                    const ctrlOrMeta = e.ctrlKey || e.metaKey;
                    const key = String(e.key || '').toLowerCase();
                    const targetTag = (e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '');
                    const isTextInput = ['input', 'textarea', 'select'].includes(targetTag) || (e.target && e.target.isContentEditable);

                    if (ctrlOrMeta && key === 's') {
                        e.preventDefault();
                        if (this.isModalOpen('code-modal')) {
                            const activeEl = document.activeElement;
                            const inMonaco = !!(activeEl && activeEl.closest && activeEl.closest('.monaco-editor'));
                            if (inMonaco && this.editorCommandsBound) return;
                            if (typeof this.editorSaveAction === 'function') this.editorSaveAction();
                        } else {
                            this.exportProject();
                            this.showToast('Project exported', 'info');
                        }
                        return;
                    }

                    if (!ctrlOrMeta && !e.altKey && key === 't' && !e.repeat && !this.isModalOpen('code-modal') && !isTextInput) {
                        e.preventDefault();
                        this.tapTempo();
                        return;
                    }

                    if (e.key === 'Escape') {
                        if (this.isModalOpen('code-modal') && this.editorClose) {
                            e.preventDefault();
                            this.editorClose();
                            return;
                        }
                        if (this.isModalOpen('code-modal') && this.hideModal) {
                            e.preventDefault();
                            this.hideModal('code-modal');
                            return;
                        }
                        if (this.isModalOpen('shader-modal') && this.hideModal) {
                            e.preventDefault();
                            this.hideModal('shader-modal');
                            return;
                        }
                        if (this.isModalOpen('rename-modal') && this.closeRenameModal) {
                            e.preventDefault();
                            this.closeRenameModal();
                        }
                    }
                });
            }

            isModalOpen(id) {
                const el = document.getElementById(id);
                return !!(el && !el.classList.contains('hidden'));
            }

            buildProjectPayload() {
                return {
                    version: "0.5-alpha",
                    savedAt: new Date().toISOString(),
                    scenes: this.scenes,
                    midi: { map: this.midi.map },
                    sync: this.serializeSyncState()
                };
            }

            exportProject() {
                this.saveCurrentScene();
                const data = JSON.stringify(this.buildProjectPayload(), null, 2);
                const blob = new Blob([data], {type: 'application/json'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `vj_project_${Date.now()}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }

            generateLayerId() {
                const n = this.layerIdCounter++;
                const rand = Math.random().toString(36).slice(2, 7);
                return `L_${Date.now().toString(36)}_${n.toString(36)}_${rand}`;
            }

            sanitizeUniformsDef(rawDefs, fallbackDefs = {}) {
                const parse = (defs) => {
                    if (!defs || typeof defs !== 'object' || Array.isArray(defs)) return {};
                    const out = {};
                    Object.keys(defs).forEach(k => {
                        const item = defs[k];
                        if (!item || typeof item !== 'object' || Array.isArray(item)) return;
                        const minNum = Number(item.min);
                        const maxNum = Number(item.max);
                        const valueNum = Number(item.value);
                        if (!Number.isFinite(minNum) || !Number.isFinite(maxNum) || !Number.isFinite(valueNum)) return;
                        const min = Math.min(minNum, maxNum);
                        const max = Math.max(minNum, maxNum);
                        const value = Math.min(max, Math.max(min, valueNum));
                        out[k] = { value, min, max };
                    });
                    return out;
                };

                const primary = parse(rawDefs);
                const fallback = parse(fallbackDefs);
                if (Object.keys(primary).length === 0) return fallback;
                return { ...fallback, ...primary };
            }

            loadProjectData(data, options = {}) {
                const source = options.source || 'file';
                const toastSuccess = !!options.toastSuccess;

                let incomingScenes = null;
                let incomingMap = {};
                let incomingSync = null;
                if (Array.isArray(data)) {
                    incomingScenes = data;
                } else if (data && Array.isArray(data.scenes)) {
                    incomingScenes = data.scenes;
                    incomingMap = (data.midi && data.midi.map) ? data.midi.map : {};
                    incomingSync = data.sync && typeof data.sync === 'object' ? data.sync : null;
                }
                if (!Array.isArray(incomingScenes)) return false;

                const scenes = [];
                let skippedLayers = 0;
                incomingScenes.forEach((sceneData, idx) => {
                    const sceneName = (sceneData && typeof sceneData.name === 'string' && sceneData.name.trim())
                        ? sceneData.name.trim()
                        : `Scene ${idx + 1}`;
                    const layerDataList = Array.isArray(sceneData && sceneData.layers) ? sceneData.layers : [];
                    const layers = [];

                    layerDataList.forEach(layerData => {
                        if (!layerData || typeof layerData !== 'object') {
                            skippedLayers++;
                            return;
                        }
                        if (!layerData.key || !SHADERS[layerData.key]) {
                            skippedLayers++;
                            return;
                        }

                        const shaderDef = SHADERS[layerData.key];
                        const blendRaw = Number(layerData.blend);
                        const opacityRaw = Number(layerData.opacity);
                        layers.push({
                            id: (typeof layerData.id === 'string' && layerData.id) ? layerData.id : this.generateLayerId(),
                            key: layerData.key,
                            blend: Number.isFinite(blendRaw) ? Math.max(0, Math.min(4, Math.round(blendRaw))) : 0,
                            opacity: Number.isFinite(opacityRaw) ? Math.max(0, Math.min(1, opacityRaw)) : 1,
                            fragmentShader: typeof layerData.fragmentShader === 'string' ? layerData.fragmentShader : shaderDef.fragmentShader,
                            uniformsDef: this.sanitizeUniformsDef(layerData.uniformsDef, shaderDef.uniforms),
                            uniformValues: (layerData.uniformValues && typeof layerData.uniformValues === 'object' && !Array.isArray(layerData.uniformValues))
                                ? layerData.uniformValues
                                : {}
                        });
                    });

                    scenes.push({ name: sceneName, layers });
                });

                if (scenes.length === 0) scenes.push({ name: 'Scene 1', layers: [] });

                this.scenes = scenes;
                this.midi.map = this.normalizeMidiMapKeys(incomingMap);
                if (incomingSync) this.applySyncState(incomingSync);
                else this.refreshBpmUI();
                this.sceneIdx = -1;
                this.renderSceneList();
                this.switchScene(0);
                this.queueProjectAutoSave();

                if (toastSuccess) this.showToast("Project Loaded Successfully!", "success");
                if (skippedLayers > 0) {
                    this.showToast(`${skippedLayers} layer(s) skipped due to invalid shader data`, "info");
                }
                if (source === 'autosave') {
                    this.showToast("Auto-saved project restored", "info");
                }
                return true;
            }

            queueProjectAutoSave() {
                if (this.projectSaveTimer) clearTimeout(this.projectSaveTimer);
                this.projectSaveTimer = setTimeout(() => this.persistProjectToStorage(), 250);
            }

            persistProjectToStorage() {
                try {
                    localStorage.setItem(this.projectStorageKey, JSON.stringify(this.buildProjectPayload()));
                    this.storageErrorShown = false;
                    return true;
                } catch (err) {
                    console.error('Failed to auto-save project', err);
                    if (!this.storageErrorShown) {
                        this.storageErrorShown = true;
                        this.showToast('Auto-save failed: local storage is full or blocked', 'error');
                    }
                    return false;
                }
            }

            restoreProjectFromStorage() {
                const raw = localStorage.getItem(this.projectStorageKey);
                if (!raw) return false;
                try {
                    const data = JSON.parse(raw);
                    return this.loadProjectData(data, { source: 'autosave', toastSuccess: false });
                } catch (err) {
                    console.error('Failed to restore auto-saved project', err);
                    localStorage.removeItem(this.projectStorageKey);
                    return false;
                }
            }

            syncPopupSize() {
                if (!this.popupWindow || this.popupWindow.closed || !this.popupCanvas) return;
                this.popupCanvas.width = this.width;
                this.popupCanvas.height = this.height;
            }

            shutdown() {
                if (this.sceneSaveTimer) clearTimeout(this.sceneSaveTimer);
                this.saveCurrentScene();
                if (this.projectSaveTimer) clearTimeout(this.projectSaveTimer);
                this.persistSyncPrefs();
                this.persistProjectToStorage();
                if (this.webcamStream) {
                    this.webcamStream.getTracks().forEach(track => track.stop());
                    this.webcamStream = null;
                }
                if (this.webcam) {
                    this.webcam.dispose();
                    this.webcam = null;
                }
            }

            // --- Notification System ---
            showToast(msg, type = 'info') {
                if (type === 'error') this.recordDebugError(msg, 'toast');
                const container = document.getElementById('toast-container');
                const el = document.createElement('div');
                const colors = {
                    error: 'bg-red-950/90 border-red-500 text-red-200',
                    success: 'bg-emerald-950/90 border-emerald-500 text-emerald-200',
                    info: 'bg-slate-900/90 border-slate-600 text-slate-200'
                };
                const cls = colors[type] || colors.info;
                
                el.className = `${cls} border px-4 py-3 rounded shadow-2xl backdrop-blur-md transform transition-all duration-300 translate-y-10 opacity-0 pointer-events-auto min-w-[300px] max-w-md flex items-start gap-3`;
                el.innerHTML = `
                    <div class="mt-0.5 font-bold text-lg">${type === 'error' ? '⚠' : (type === 'success' ? '✓' : 'ℹ')}</div>
                    <div class="flex-1 text-[10px] font-mono break-words whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">${msg}</div>
                    <button class="text-white/50 hover:text-white" onclick="this.parentElement.remove()">×</button>
                `;
                
                container.appendChild(el);
                // Trigger reflow
                el.offsetHeight;
                el.classList.remove('translate-y-10', 'opacity-0');
                
                setTimeout(() => {
                    if(el.parentElement) {
                        el.classList.add('opacity-0', 'translate-y-2');
                        setTimeout(() => el.remove(), 300);
                    }
                }, type === 'error' ? 8000 : 3000);
            }

            // --- Scene Management ---
            createScene() {
                const name = `Scene ${this.scenes.length + 1}`;
                this.scenes.push({ name, layers: [] });
                this.renderSceneList();
                this.switchScene(this.scenes.length - 1);
                this.queueProjectAutoSave();
            }
            
            openRenameModal(index) {
                const modal = document.getElementById('rename-modal');
                const input = document.getElementById('rename-input');
                const confirmBtn = document.getElementById('rename-confirm-btn');
                
                input.value = this.scenes[index].name;
                
                // Setup confirm action
                confirmBtn.onclick = () => {
                    const newName = input.value.trim();
                    if(newName) {
                        this.renameScene(index, newName);
                        this.closeRenameModal();
                    }
                };
                input.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        confirmBtn.click();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        this.closeRenameModal();
                    }
                };
                
                // Show modal
                modal.classList.remove('hidden');
                setTimeout(() => modal.classList.remove('opacity-0'), 10);
                input.focus();
            }
            
            renameScene(index, name) {
                if (this.scenes[index]) {
                    this.scenes[index].name = name;
                    this.renderSceneList();
                    if (this.sceneIdx === index) {
                        document.getElementById('current-scene-name').textContent = name;
                    }
                    this.queueProjectAutoSave();
                }
            }

            deleteScene(idx) {
                if(this.scenes.length <= 1) return;
                
                if(idx === this.sceneIdx) {
                    this.scenes.splice(idx, 1);
                    this.sceneIdx = -1; // Active scene removed, invalidate index
                    const newIdx = Math.max(0, idx - 1);
                    this.switchScene(newIdx);
                    this.queueProjectAutoSave();
                } else {
                    this.scenes.splice(idx, 1);
                    if(idx < this.sceneIdx) {
                        this.sceneIdx--;
                    }
                    this.renderSceneList();
                    this.queueProjectAutoSave();
                }
            }

            switchScene(idx) {
                if (idx < 0 || idx >= this.scenes.length) return;
                this.saveCurrentScene(); // Save before switch (if any)
                this.sceneIdx = idx;
                
                // Clear existing
                this.layers.forEach(l => {
                    l.material.dispose();
                    l.renderTarget.dispose();
                    if(l.fbo) l.fbo.dispose();
                });
                this.layers = [];
                document.getElementById('layer-stack').innerHTML = '';
                
                // Load new
                const scene = this.scenes[idx];
                document.getElementById('current-scene-name').textContent = scene.name;
                
                // Highlight active scene
                this.renderSceneList();

                // Restore Layers
                const layerList = Array.isArray(scene.layers) ? scene.layers : [];
                layerList.forEach(data => {
                    // Use addLayer but with saved config
                    this.addLayer(data.key, data);
                });
            }

            saveCurrentScene() {
                if(this.sceneIdx < 0 || !this.scenes[this.sceneIdx]) return;
                this.scenes[this.sceneIdx].layers = this.layers.map(l => ({
                    id: l.id,
                    key: l.key,
                    blend: l.blend,
                    opacity: l.opacity,
                    fragmentShader: l.fragmentShader,
                    uniformsDef: JSON.parse(JSON.stringify(l.uniformsDef)),
                    // Save current uniform values
                    uniformValues: Object.keys(l.uniformsDef).reduce((acc, k) => {
                        acc[k] = l.uniforms[k].value;
                        return acc;
                    }, {})
                }));
                this.queueProjectAutoSave();
            }

            renderSceneList() {
                const list = document.getElementById('scene-list');
                list.innerHTML = '';
                this.scenes.forEach((s, i) => {
                    const row = document.createElement('div');
                    row.className = `flex items-center gap-1 mb-1 group`;
                    
                    const btn = document.createElement('button');
                    btn.className = `flex-1 text-left px-3 py-2 text-[10px] rounded transition-colors font-mono truncate ${i === this.sceneIdx ? 'bg-purple-900/50 text-white border-l-2 border-purple-500' : 'text-slate-400 hover:bg-slate-800'}`;
                    btn.textContent = s.name;
                    btn.onclick = () => this.switchScene(i);
                    
                    // Rename Button
                    const editBtn = document.createElement('button');
                    editBtn.className = "text-slate-600 hover:text-blue-400 p-2 rounded hover:bg-slate-800 transition-colors opacity-0 group-hover:opacity-100";
                    editBtn.innerHTML = "✎"; 
                    editBtn.title = "Rename Scene";
                    editBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.openRenameModal(i);
                    };
                    
                    // Delete Button
                    const delBtn = document.createElement('button');
                    delBtn.className = "text-slate-600 hover:text-red-400 p-2 rounded hover:bg-slate-800 transition-colors opacity-0 group-hover:opacity-100";
                    delBtn.innerHTML = "×"; // Simple x icon
                    delBtn.title = "Delete Scene";
                    delBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.deleteScene(i);
                    };

                    // Disable delete if only one scene
                    if(this.scenes.length <= 1) {
                        delBtn.disabled = true;
                        delBtn.classList.add('hidden');
                    }

                    row.appendChild(btn);
                    row.appendChild(editBtn);
                    row.appendChild(delBtn);
                    list.appendChild(row);
                });
            }

            // --- Layer Logic ---
            addLayer(key, config = null) {
                const def = SHADERS[key];
                if (!def) {
                    this.showToast(`Unknown shader key: ${key}`, "error");
                    return null;
                }
                if (def.isWebCam) this.initWebCam();
                const uniformDefs = this.sanitizeUniformsDef(config && config.uniformsDef ? config.uniformsDef : def.uniforms, def.uniforms);
                
                const id = (config && typeof config.id === 'string' && config.id) ? config.id : this.generateLayerId();
                const blendRaw = config ? Number(config.blend) : 0;
                const opacityRaw = config ? Number(config.opacity) : 1.0;
                const layer = {
                    id, key, name: def.name,
                    blend: Number.isFinite(blendRaw) ? Math.max(0, Math.min(4, Math.round(blendRaw))) : 0,
                    opacity: Number.isFinite(opacityRaw) ? Math.max(0, Math.min(1, opacityRaw)) : 1.0,
                    needsInput: def.needsInput, isFeedback: def.isFeedback, isWebCam: def.isWebCam,
                    fragmentShader: (config && typeof config.fragmentShader === 'string') ? config.fragmentShader : def.fragmentShader,
                    uniformsDef: uniformDefs,
                    uniforms: {
                        u_time: { value: 0 }, u_resolution: { value: new THREE.Vector2(this.width, this.height) },
                        u_bass: { value: 0 }, u_mid: { value: 0 }, u_treble: { value: 0 },
                        u_bpm: { value: this.bpm }, u_beat: { value: 0 }, u_phase: { value: 0 },
                        u_inputTexture: { value: null }, u_webcamTexture: { value: null }, u_prevLayer: { value: null }
                    },
                    renderTarget: new THREE.WebGLRenderTarget(this.width, this.height),
                    fbo: def.isFeedback ? new THREE.WebGLRenderTarget(this.width, this.height) : null
                };

                // Init Uniform values
                Object.keys(uniformDefs).forEach(k => {
                    let val;
                    if (config && config.uniformValues && config.uniformValues[k] !== undefined) {
                        const configVal = Number(config.uniformValues[k]);
                        const min = uniformDefs[k].min;
                        const max = uniformDefs[k].max;
                        val = Number.isFinite(configVal) ? Math.min(max, Math.max(min, configVal)) : uniformDefs[k].value;
                    } else {
                        val = uniformDefs[k].value;
                    }
                    layer.uniforms[k] = { value: val };
                });

                layer.material = new THREE.ShaderMaterial({
                    uniforms: layer.uniforms,
                    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
                    fragmentShader: layer.fragmentShader
                });

                this.layers.push(layer);
                this.renderLayerUI(layer);
                this.queueSceneSave();
                return layer;
            }

            cleanupMidiForLayer(layer) {
                Object.keys(this.midi.map).forEach(k => {
                    if (k.startsWith(`${layer.id}::`) || k.startsWith(`${layer.id}_`)) delete this.midi.map[k];
                });
            }

            removeLayer(layer, el = null) {
                this.layers = this.layers.filter(l => l !== layer);
                if (el) el.remove();
                this.cleanupMidiForLayer(layer);
                layer.material.dispose();
                layer.renderTarget.dispose();
                if (layer.fbo) layer.fbo.dispose();
                this.queueSceneSave();
            }

            queueSceneSave() {
                if (this.sceneSaveTimer) clearTimeout(this.sceneSaveTimer);
                this.sceneSaveTimer = setTimeout(() => this.saveCurrentScene(), 120);
            }

            normalizeMidiValue(raw) {
                if (typeof raw !== "number" || isNaN(raw)) return 0;
                if (raw <= 1) return Math.max(0, Math.min(raw, 1));
                if (raw <= 127) return raw / 127;
                return Math.min(raw / 16383, 1);
            }

            parseMidiMapKey(key) {
                if (key.includes("::")) {
                    const idx = key.indexOf("::");
                    return { layerId: key.slice(0, idx), uKey: key.slice(idx + 2) };
                }
                const legacyIdx = key.indexOf("_u_");
                if (legacyIdx > -1) {
                    return { layerId: key.slice(0, legacyIdx), uKey: key.slice(legacyIdx + 1) };
                }
                return null;
            }

            normalizeMidiMapKeys(map) {
                const out = {};
                Object.keys(map || {}).forEach(k => {
                    const parsed = this.parseMidiMapKey(k);
                    const v = parseInt(map[k], 10);
                    if (!parsed || isNaN(v)) return;
                    const newKey = `${parsed.layerId}::${parsed.uKey}`;
                    out[newKey] = v;
                });
                return out;
            }

            findMapKeyByCC(cc) {
                const n = parseInt(cc, 10);
                let found = null;
                Object.keys(this.midi.map).forEach(k => {
                    if (parseInt(this.midi.map[k], 10) === n) found = k;
                });
                return found;
            }

            getMidiBindingLabel(mapKey) {
                const parsed = this.parseMidiMapKey(mapKey);
                if (!parsed) return mapKey;
                const layer = this.layers.find(l => l.id === parsed.layerId);
                const layerName = layer ? layer.name : parsed.layerId;
                return `${layerName} / ${parsed.uKey.replace("u_", "")}`;
            }

            updateMidiStatus(active) {
                const dot = document.getElementById('midi-status-dot');
                const text = document.getElementById('midi-status-text');
                if (active) {
                    dot.classList.remove('bg-slate-700');
                    dot.classList.add('bg-green-500');
                    text.textContent = "MIDI ACTIVE";
                } else {
                    dot.classList.remove('bg-green-500');
                    dot.classList.add('bg-slate-700');
                    text.textContent = "NO MIDI";
                }
            }

            bindMidiInputs() {
                // Avoid duplicate listeners
                WebMidi.inputs.forEach(i => i.removeListener("controlchange"));
                WebMidi.inputs.forEach(i => i.addListener("controlchange", e => this.handleMidiCC(e)));
                this.updateMidiStatus(WebMidi.inputs.length > 0);
            }

            handleMidiCC(e) {
                const cc = e.controller.number;
                const norm = this.normalizeMidiValue(e.value);
                let changed = false;
                
                Object.keys(this.midi.map).forEach(key => {
                    if (parseInt(this.midi.map[key], 10) === cc) {
                        const parsed = this.parseMidiMapKey(key);
                        if (!parsed) return;
                        const layer = this.layers.find(l => l.id === parsed.layerId);
                        if (layer && layer.uniformsDef[parsed.uKey] && layer.uniforms[parsed.uKey]) {
                            const def = layer.uniformsDef[parsed.uKey];
                            const v = def.min + norm * (def.max - def.min);
                            layer.uniforms[parsed.uKey].value = v;
                            // Update UI
                            const s = document.getElementById(`slider-${key}`);
                            if (s) {
                                s.value = v;
                                s.previousElementSibling.lastElementChild.textContent = v.toFixed(2);
                            }
                            changed = true;
                        }
                    }
                });
                
                if (changed) this.queueSceneSave();
            }

            renderLayerUI(layer) {
                const tpl = document.getElementById('layer-ui-template');
                const el = tpl.content.cloneNode(true).firstElementChild;
                el.dataset.id = layer.id;
                el.querySelector('.layer-name').textContent = layer.name;
                el.querySelector('.layer-type').textContent = layer.needsInput ? "FX" : "GEN";
                el.querySelector('.layer-type').className = `text-[9px] px-1.5 py-0.5 rounded font-mono font-bold tracking-wider ${layer.needsInput ? 'bg-indigo-900 text-indigo-300' : 'bg-emerald-900 text-emerald-300'}`;

                // Opacity & Blend
                const op = el.querySelector('.layer-opacity');
                const opV = el.querySelector('.layer-opacity-val');
                op.value = layer.opacity; opV.textContent = layer.opacity.toFixed(2);
                op.oninput = e => { 
                    layer.opacity = parseFloat(e.target.value); 
                    opV.textContent = layer.opacity.toFixed(2); 
                    this.queueSceneSave();
                };

                const blend = el.querySelector('.layer-blend');
                const blends = { 'NORMAL':0, 'ADD':1, 'MULTIPLY':2, 'SCREEN':3, 'DIFFERENCE':4 };
                Object.keys(blends).forEach(k => { if(blends[k]===layer.blend) blend.value = k; });
                blend.onchange = e => { 
                    layer.blend = blends[e.target.value];
                    this.queueSceneSave();
                };

                // Remove
                el.querySelector('.layer-del-btn').onclick = () => this.removeLayer(layer, el);
                
                // Code Edit
                el.querySelector('.layer-edit-btn').onclick = () => this.openEditor(layer);

                // Uniforms
                const cont = el.querySelector('.layer-uniforms');
                Object.keys(layer.uniformsDef).forEach(uKey => {
                    const u = layer.uniformsDef[uKey];
                    const wrap = document.createElement('div');
                    wrap.className = "flex flex-col gap-1";
                    
                    const head = document.createElement('div');
                    head.className = "flex justify-between items-center";
                    
                    const label = document.createElement('span');
                    label.className = "text-[9px] font-mono text-slate-500";
                    label.textContent = uKey.replace('u_', '');
                    
                    const valDisplay = document.createElement('span');
                    valDisplay.className = "text-[9px] text-slate-400";
                    valDisplay.textContent = layer.uniforms[uKey].value.toFixed(2);

                    // MIDI Map
                    const cc = document.createElement('input');
                    cc.type = 'number'; cc.placeholder = "CC";
                    cc.min = 0; cc.max = 127; cc.step = 1;
                    cc.className = "w-6 bg-slate-950 border border-slate-800 text-[8px] text-center text-slate-500 focus:text-purple-400 rounded focus:outline-none";
                    const mapKey = `${layer.id}::${uKey}`;
                    cc.dataset.mapKey = mapKey;
                    const curMap = this.midi.map[mapKey];
                    if(curMap !== undefined) cc.value = curMap;
                    cc.onchange = e => {
                        const raw = String(e.target.value).trim();
                        if(raw === "") {
                            delete this.midi.map[mapKey];
                            this.queueSceneSave();
                            return;
                        }
                        let v = parseInt(raw, 10);
                        if(isNaN(v)) {
                            delete this.midi.map[mapKey];
                            e.target.value = "";
                            this.queueSceneSave();
                            return;
                        }
                        v = Math.max(0, Math.min(127, v));
                        if(String(v) !== raw) e.target.value = v;

                        const existingKey = this.findMapKeyByCC(v);
                        if(existingKey && existingKey !== mapKey) {
                            const label = this.getMidiBindingLabel(existingKey);
                            const ok = confirm(`CC ${v} is already assigned to ${label}. Replace it?`);
                            if(!ok) {
                                const prev = this.midi.map[mapKey];
                                e.target.value = prev !== undefined ? prev : "";
                                return;
                            }
                            delete this.midi.map[existingKey];
                            const other = document.querySelector(`input[data-map-key="${existingKey}"]`);
                            if(other) other.value = "";
                        }

                        this.midi.map[mapKey] = v;
                        this.queueSceneSave();
                    };

                    head.append(label, cc, valDisplay);

                    const slider = document.createElement('input');
                    slider.type = "range"; slider.className = "control-slider w-full";
                    slider.min = u.min; slider.max = u.max; slider.step = 0.01;
                    slider.value = layer.uniforms[uKey].value;
                    slider.id = `slider-${mapKey}`; // for MIDI update
                    
                    slider.oninput = e => {
                        const v = parseFloat(e.target.value);
                        layer.uniforms[uKey].value = v;
                        valDisplay.textContent = v.toFixed(2);
                        this.queueSceneSave();
                    };

                    wrap.append(head, slider);
                    cont.appendChild(wrap);
                });

                document.getElementById('layer-stack').appendChild(el);
                
                // Setup thumbnail canvas
                const thumbCanvas = el.querySelector('.layer-thumbnail');
                layer.thumbCanvas = thumbCanvas;
                layer.thumbCtx = thumbCanvas.getContext('2d');
            }

            openEditor(layer) {
                const m = document.getElementById('code-modal');
                m.classList.remove('hidden'); setTimeout(() => m.classList.remove('opacity-0'), 10);
                document.getElementById('editor-layer-name').textContent = layer.name;
                
                if(!this.monaco) {
                    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }});
                    require(['vs/editor/editor.main'], () => {
                        this.monaco = monaco.editor.create(document.getElementById('monaco-shader'), {
                            value: layer.fragmentShader, language: 'glsl', theme: 'vs-dark', minimap: {enabled:false}, fontSize: 12
                        });
                        this.monacoU = monaco.editor.create(document.getElementById('monaco-uniforms'), {
                            value: JSON.stringify(layer.uniformsDef, null, 2), language: 'json', theme: 'vs-dark', minimap: {enabled:false}, fontSize: 11
                        });
                        this.bindEditorSave(layer);
                        this.monaco.focus();
                    });
                } else {
                    this.monaco.setValue(layer.fragmentShader);
                    this.monacoU.setValue(JSON.stringify(layer.uniformsDef, null, 2));
                    this.bindEditorSave(layer);
                    this.monaco.focus();
                }
                
                const close = () => {
                    m.classList.add('opacity-0');
                    setTimeout(() => m.classList.add('hidden'), 300);
                    this.editorSaveAction = null;
                };
                document.getElementById('editor-cancel-btn').onclick = close;
                this.editorClose = close;
            }

            parseShaderError(msg) {
                // Parse shader compilation errors to extract line numbers
                // Common patterns: "ERROR: 0:123:" or "Line 123" or ":123:"
                const patterns = [
                    /ERROR:\s*\d+:(\d+):/i,
                    /Line\s+(\d+)/i,
                    /:(\d+):\s*error/i,
                    /at line (\d+)/i,
                    /\((\d+),\s*\d+\)/
                ];
                
                let line = null;
                for (const pattern of patterns) {
                    const match = msg.match(pattern);
                    if (match) {
                        line = parseInt(match[1], 10);
                        break;
                    }
                }
                
                // Clean up the message
                let cleanMsg = msg
                    .replace(/THREE\.WebGLProgram: shader error:\s*/gi, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                
                if (line) {
                    cleanMsg = `Line ${line}: ${cleanMsg}`;
                }
                
                return { line, message: cleanMsg };
            }
            
            bindEditorSave(layer) {
                // Clear previous error decorations
                this.errorDecorations = [];
                
                const save = () => {
                    try {
                        const fs = this.monaco.getValue();
                        const rawUd = JSON.parse(this.monacoU.getValue());
                        if (!rawUd || typeof rawUd !== 'object' || Array.isArray(rawUd)) {
                            throw new Error("Uniforms JSON must be an object.");
                        }
                        const invalid = Object.keys(rawUd).filter(k => {
                            const u = rawUd[k];
                            return !u || typeof u !== 'object' || Array.isArray(u)
                                || !Number.isFinite(Number(u.value))
                                || !Number.isFinite(Number(u.min))
                                || !Number.isFinite(Number(u.max));
                        });
                        if (invalid.length > 0) {
                            throw new Error(`Invalid uniforms: ${invalid.join(', ')}`);
                        }
                        const ud = this.sanitizeUniformsDef(rawUd, layer.uniformsDef);
                        
                        // Rebuild uniforms from new definition, keep existing values when possible
                        const nextUniforms = {
                            u_time: { value: 0 },
                            u_resolution: { value: new THREE.Vector2(this.width, this.height) },
                            u_bass: { value: 0 },
                            u_mid: { value: 0 },
                            u_treble: { value: 0 },
                            u_bpm: { value: this.bpm },
                            u_beat: { value: 0 },
                            u_phase: { value: 0 },
                            u_inputTexture: { value: null },
                            u_webcamTexture: { value: null },
                            u_prevLayer: { value: null }
                        };
                        Object.keys(ud).forEach(k => {
                            const prev = layer.uniforms[k];
                            const min = ud[k].min;
                            const max = ud[k].max;
                            const rawVal = prev ? Number(prev.value) : Number(ud[k].value);
                            const val = Number.isFinite(rawVal) ? Math.min(max, Math.max(min, rawVal)) : ud[k].value;
                            nextUniforms[k] = { value: val };
                        });

                        const mat = new THREE.ShaderMaterial({ uniforms: nextUniforms, vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`, fragmentShader: fs });
                        this.renderer.compile(this.scene, this.camera, mat);
                        
                        layer.fragmentShader = fs; layer.uniformsDef = ud; layer.uniforms = nextUniforms;
                        layer.material.dispose(); layer.material = mat;
                        
                        // Re-render UI
                        const card = document.querySelector(`.layer-card[data-id="${layer.id}"]`);
                        if(card) card.remove();
                        this.renderLayerUI(layer);
                        this.queueSceneSave();
                        this.editorClose();
                        this.showToast("Shader compiled successfully!", "success");
                    } catch(e) { 
                        console.error(e);
                        const errorInfo = this.parseShaderError(e.message || "Unknown compilation error");
                        this.showToast(errorInfo.message, "error");
                        
                        // Highlight error line in Monaco editor
                        if (errorInfo.line && this.monaco) {
                            this.monaco.revealLineInCenter(errorInfo.line);
                            this.monaco.deltaDecorations(this.errorDecorations || [], []);
                            this.errorDecorations = this.monaco.deltaDecorations([], [{
                                range: new monaco.Range(errorInfo.line, 1, errorInfo.line, 1000),
                                options: {
                                    isWholeLine: true,
                                    className: 'errorLineDecoration',
                                    glyphMarginClassName: 'errorGlyph',
                                    linesDecorationsClassName: 'errorLineDecoration'
                                }
                            }]);
                        }
                    }
                };
                this.editorSaveAction = save;
                document.getElementById('editor-save-btn').onclick = save;
                if (!this.editorCommandsBound && this.monaco && this.monacoU) {
                    this.editorCommandsBound = true;
                    const saveKey = monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS;
                    const escKey = monaco.KeyCode.Escape;
                    const runSave = () => {
                        if (typeof this.editorSaveAction === 'function') this.editorSaveAction();
                    };
                    const runClose = () => {
                        if (typeof this.editorClose === 'function') this.editorClose();
                    };
                    this.monaco.addCommand(saveKey, runSave);
                    this.monacoU.addCommand(saveKey, runSave);
                    this.monaco.addCommand(escKey, runClose);
                    this.monacoU.addCommand(escKey, runClose);
                }
            }

            initMidi() {
                if(!window.WebMidi) {
                    this.updateMidiStatus(false);
                    return;
                }
                WebMidi.enable().then(() => {
                    this.bindMidiInputs();
                    WebMidi.addListener("connected", e => {
                        if(e.port && e.port.type === "input") this.bindMidiInputs();
                    });
                    WebMidi.addListener("disconnected", e => {
                        if(e.port && e.port.type === "input") this.bindMidiInputs();
                    });
                }).catch(err => {
                    console.log("MIDI Access Refused or Not Available:", err);
                    this.recordDebugError(err, 'midi');
                    const dot = document.getElementById('midi-status-dot');
                    const text = document.getElementById('midi-status-text');
                    dot.classList.remove('bg-green-500');
                    dot.classList.add('bg-slate-700');
                    text.textContent = "MIDI DISABLED";
                });
            }

            loadDefaultScene() {
                this.createScene(); // Scene 1
                // Add default layers
                this.addLayer('Crystal-KIFS');
            }
        }

        class AudioAnalyzer {
            constructor() { this.active = false; this.data = new Uint8Array(0); this.res = { bass:0, mid:0, treble:0 }; }
            async init() {
                try {
                    const ctx = new (window.AudioContext||window.webkitAudioContext)();
                    const src = ctx.createMediaStreamSource(await navigator.mediaDevices.getUserMedia({audio:true}));
                    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 512;
                    src.connect(this.analyser); this.data = new Uint8Array(this.analyser.frequencyBinCount);
                    this.active = true; return true;
                } catch(e) { console.error(e); return false; }
            }
            update() {
                if(!this.active) return this.res;
                this.analyser.getByteFrequencyData(this.data);
                const avg = (s, e) => { let sum=0; for(let i=s; i<e; i++) sum+=this.data[i]; return sum/(e-s)/255; };
                this.res.bass = avg(0, 10) * 1.5; // Gain
                this.res.mid = avg(10, 50) * 1.2;
                this.res.treble = avg(50, 150) * 1.8;
                return this.res;
            }
        }

        window.onload = () => new VJApp();















