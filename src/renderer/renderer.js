/**
 * Renderer — Three.js render pipeline and compositing.
 *
 * Manages WebGLRenderer, ping-pong buffers, shader materials,
 * the animate loop, and thumbnail generation.
 *
 * Events emitted:
 *   render:frame  { time, audio, beatState }
 */
const THREE = window.THREE;

export class Renderer {
    /**
     * @param {import('../core/event-bus.js').EventBus} bus
     * @param {import('../core/app-state.js').AppState} state
     */
    constructor(bus, state) {
        this._bus = bus;
        this._state = state;

        // FPS
        this._fpsTime = 0;
        this._frames = 0;
        this._fpsElement = null;
        this._audioBars = [];

        // Thumbnails
        this._thumbIntervalMs = 100;
        this._thumbLastUpdate = 0;
        this._lastReadBuffer = null;

        // Popup output
        this._popupWindow = null;
        this._popupCanvas = null;
        this._popupCtx = null;

        // Per-layer timing (for debug panel)
        this._lastLayerTimings = [];
        this._renderWidth = 1;
        this._renderHeight = 1;

        this._initThree();
    }

    _getRenderScale() {
        const p = this._state.performance || {};
        const raw = Number(p.renderScale);
        return Number.isFinite(raw) ? Math.max(0.5, Math.min(1, raw)) : 1;
    }

    _computeRenderSize() {
        const scale = this._getRenderScale();
        return {
            width: Math.max(2, Math.round(this._state.width * scale)),
            height: Math.max(2, Math.round(this._state.height * scale)),
            scale
        };
    }

    getRenderSize() {
        return {
            width: this._renderWidth,
            height: this._renderHeight,
            scale: this._getRenderScale()
        };
    }

    _initThree() {
        const s = this._state;
        const canvas = document.getElementById('main-canvas');
        const renderSize = this._computeRenderSize();
        this._renderWidth = renderSize.width;
        this._renderHeight = renderSize.height;
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: false,
            preserveDrawingBuffer: s.preserveDrawingBuffer,
            alpha: false
        });
        this.renderer.setSize(s.width, s.height);
        const pr = s.dprMode === 'device' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
        this.renderer.setPixelRatio(pr);

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        this.scene.add(this.quad);
        this.clock = new THREE.Clock();

        // Detect GPU label
        this.rendererLabel = this._detectRendererLabel();

        // Ping-Pong Buffers
        const pars = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
        this.bufferA = new THREE.WebGLRenderTarget(this._renderWidth, this._renderHeight, pars);
        this.bufferB = new THREE.WebGLRenderTarget(this._renderWidth, this._renderHeight, pars);

        // Copy material
        this.copyMat = new THREE.ShaderMaterial({
            uniforms: { u_texture: { value: null } },
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
            fragmentShader: `uniform sampler2D u_texture; varying vec2 vUv; void main() { gl_FragColor = texture2D(u_texture, vUv); }`
        });

        // Thumbnail copy material (Y-flip)
        this.thumbCopyMat = new THREE.ShaderMaterial({
            uniforms: { u_texture: { value: null } },
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
            fragmentShader: `uniform sampler2D u_texture; varying vec2 vUv; void main() { vec2 uv = vec2(vUv.x, 1.0 - vUv.y); gl_FragColor = texture2D(u_texture, uv); }`
        });

        // Crossfade mix material
        this.crossfadeMat = new THREE.ShaderMaterial({
            uniforms: {
                u_sceneA: { value: null },
                u_sceneB: { value: null },
                u_mix: { value: 0 }
            },
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
            fragmentShader: `
                uniform sampler2D u_sceneA;
                uniform sampler2D u_sceneB;
                uniform float u_mix;
                varying vec2 vUv;
                void main() {
                    gl_FragColor = mix(texture2D(u_sceneA, vUv), texture2D(u_sceneB, vUv), u_mix);
                }
            `
        });

        // Crossfade render targets (scene B uses separate ping-pong pair)
        this.crossfadeBufferA = null;
        this.crossfadeBufferB = null;
        this.crossfadeResultRT = null;

        // Composite material
        this.compMat = new THREE.ShaderMaterial({
            uniforms: {
                u_base: { value: null }, u_layer: { value: null },
                u_blend: { value: 0 }, u_opacity: { value: 1 }, u_isBase: { value: 0 }
            },
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
            fragmentShader: `
                uniform sampler2D u_base; uniform sampler2D u_layer;
                uniform int u_blend; uniform float u_opacity; uniform int u_isBase;
                varying vec2 vUv;
                vec3 overlay(vec3 b, vec3 l) {
                    return vec3(
                        b.r < 0.5 ? 2.0*b.r*l.r : 1.0-2.0*(1.0-b.r)*(1.0-l.r),
                        b.g < 0.5 ? 2.0*b.g*l.g : 1.0-2.0*(1.0-b.g)*(1.0-l.g),
                        b.b < 0.5 ? 2.0*b.b*l.b : 1.0-2.0*(1.0-b.b)*(1.0-l.b)
                    );
                }
                vec3 blend(vec3 b, vec3 l, int m) {
                    if(m==1) return b+l;
                    if(m==2) return b*l;
                    if(m==3) return 1.0-(1.0-b)*(1.0-l);
                    if(m==4) return abs(b-l);
                    if(m==5) return overlay(b,l);
                    if(m==6) return (1.0-2.0*l)*b*b + 2.0*l*b;
                    if(m==7) return vec3(
                        l.r<0.5 ? 2.0*b.r*l.r : 1.0-2.0*(1.0-b.r)*(1.0-l.r),
                        l.g<0.5 ? 2.0*b.g*l.g : 1.0-2.0*(1.0-b.g)*(1.0-l.g),
                        l.b<0.5 ? 2.0*b.b*l.b : 1.0-2.0*(1.0-b.b)*(1.0-l.b)
                    );
                    if(m==8) return min(vec3(1.0), b / max(vec3(0.001), 1.0-l));
                    if(m==9) return 1.0 - min(vec3(1.0), (1.0-b) / max(vec3(0.001), l));
                    return l;
                }
                void main() {
                    vec4 b = texture2D(u_base, vUv); vec4 l = texture2D(u_layer, vUv);
                    if(u_isBase==1) { gl_FragColor = vec4(l.rgb, 1.0); return; }
                    gl_FragColor = vec4(mix(b.rgb, blend(b.rgb, l.rgb, u_blend), l.a * u_opacity), 1.0);
                }
            `
        });
    }

    _detectRendererLabel() {
        if (!this.renderer) return 'WebGL';
        const gl = this.renderer.getContext();
        const api = this.renderer.capabilities && this.renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1';
        if (!gl) return api;
        try {
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            if (ext) {
                const r = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
                const v = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
                if (r && v) return `${api} ${v} / ${r}`;
                if (r) return `${api} ${r}`;
            }
        } catch (e) {
            console.warn('Renderer info unavailable', e);
        }
        return api;
    }

    /** Cache DOM elements. Call after DOM ready. */
    initUI() {
        this._audioBars = Array.from(document.querySelectorAll('.audio-bar'));
        this._fpsElement = document.getElementById('fps-counter');
    }

    /**
     * Main render frame. Called by requestAnimationFrame.
     * @param {Object} deps - { audio, bpmSync, debugPanel }
     */
    animate(deps) {
        requestAnimationFrame(() => this.animate(deps));

        const frameStart = performance.now();
        const s = this._state;
        const now = frameStart;

        // FPS counter
        this._frames++;
        if (now >= this._fpsTime + 1000) {
            if (this._fpsElement) this._fpsElement.textContent = `FPS: ${this._frames}`;
            this._frames = 0;
            this._fpsTime = now;
        }

        const time = this.clock.getElapsedTime();
        const audio = deps.audio.update();
        const beatState = deps.bpmSync.getBeatState(time);

        // Audio bars (8 bands)
        if (this._audioBars.length === 8 && audio.bands) {
            for (let i = 0; i < 8; i++) {
                this._audioBars[i].style.height = `${5 + audio.bands[i] * 95}%`;
            }
        }
        deps.bpmSync.updateBeatIndicator(beatState);
        deps.bpmSync.updateAutoScene(beatState);

        const renderStart = performance.now();
        const cf = s.crossfade;

        // Render scene A (current layers)
        const readA = this._renderLayerStack(s.layers, this.bufferA, this.bufferB, time, audio, beatState);

        // Blackout short-circuit: present black frame (still keep layer render for thumbnails)
        if (s.blackout) {
            this.renderer.setRenderTarget(null);
            this.renderer.setClearColor(0x000000, 1);
            this.renderer.clear();
            this._lastReadBuffer = readA;
            if (this._popupCtx) this._popupCtx.drawImage(this.renderer.domElement, 0, 0);
            if (now - this._thumbLastUpdate >= this._thumbIntervalMs) {
                this._thumbLastUpdate = now;
                this._updateThumbnails();
            }
            const frameEnd2 = performance.now();
            this._finishFrameMetrics(deps, frameStart, renderStart, frameEnd2);
            return;
        }

        if (cf.active) {
            // Ensure crossfade buffers exist
            if (!this.crossfadeBufferA) {
                const pars = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
                this.crossfadeBufferA = new THREE.WebGLRenderTarget(this._renderWidth, this._renderHeight, pars);
                this.crossfadeBufferB = new THREE.WebGLRenderTarget(this._renderWidth, this._renderHeight, pars);
                this.crossfadeResultRT = new THREE.WebGLRenderTarget(this._renderWidth, this._renderHeight, pars);
            }

            // Update crossfade mix from beat position
            const elapsed = beatState.beat - cf.startBeat;
            cf.mix = Math.min(1, Math.max(0, elapsed / cf.durationBeats));

            let readB = this.crossfadeBufferA;
            if (cf.layersB.length > 0) {
                readB = this._renderLayerStack(cf.layersB, this.crossfadeBufferA, this.crossfadeBufferB, time, audio, beatState);
            } else {
                this.renderer.setRenderTarget(readB);
                this.renderer.clear();
            }

            // Mix A + B
            this.crossfadeMat.uniforms.u_sceneA.value = readA.texture;
            this.crossfadeMat.uniforms.u_sceneB.value = readB.texture;
            this.crossfadeMat.uniforms.u_mix.value = cf.mix;

            this.renderer.setRenderTarget(this.crossfadeResultRT);
            this.renderer.clear();
            this.quad.material = this.crossfadeMat;
            this.renderer.render(this.scene, this.camera);
            this._lastReadBuffer = this.crossfadeResultRT;

            this.renderer.setRenderTarget(null);
            this.copyMat.uniforms.u_texture.value = this.crossfadeResultRT.texture;
            this.quad.material = this.copyMat;
            this.renderer.render(this.scene, this.camera);

            // Crossfade complete?
            if (cf.mix >= 1) {
                this._bus.emit('crossfade:complete');
            }
        } else {
            // Normal output (no crossfade)
            this._lastReadBuffer = readA;
            this.renderer.setRenderTarget(null);
            this.copyMat.uniforms.u_texture.value = readA.texture;
            this.quad.material = this.copyMat;
            this.renderer.render(this.scene, this.camera);
        }

        // Popup output
        if (this._popupWindow && this._popupWindow.closed) {
            this._popupWindow = null;
            this._popupCanvas = null;
            this._popupCtx = null;
        }
        if (this._popupCtx) this._popupCtx.drawImage(this.renderer.domElement, 0, 0);

        // Thumbnails (throttled)
        if (now - this._thumbLastUpdate >= this._thumbIntervalMs) {
            this._thumbLastUpdate = now;
            this._updateThumbnails();
        }

        const frameEnd = performance.now();
        this._finishFrameMetrics(deps, frameStart, renderStart, frameEnd);
    }

    _finishFrameMetrics(deps, frameStart, renderStart, frameEnd) {
        const frameDelta = deps.debugPanel._lastFrameStartMs > 0 ? (frameStart - deps.debugPanel._lastFrameStartMs) : 16.67;
        deps.debugPanel._lastFrameStartMs = frameStart;
        if (this._lastLayerTimings) deps.debugPanel.setLayerTimings(this._lastLayerTimings);
        deps.debugPanel.updateMetrics(frameEnd, frameDelta, frameEnd - frameStart, frameEnd - renderStart);
        this._bus.emit('render:metrics', {
            nowMs: frameEnd,
            frameDeltaMs: frameDelta,
            cpuMs: frameEnd - frameStart,
            renderMs: frameEnd - renderStart,
            fps: frameDelta > 0 ? 1000 / frameDelta : 0,
            renderScale: this._getRenderScale(),
            renderWidth: this._renderWidth,
            renderHeight: this._renderHeight,
            thumbnailIntervalMs: this._thumbIntervalMs,
            layers: this._state.layers.length,
            crossfade: {
                active: !!this._state.crossfade.active,
                mix: this._state.crossfade.mix
            }
        });
    }

    /**
     * Render a stack of layers into ping-pong buffers.
     * Returns the buffer containing the final composite.
     */
    _renderLayerStack(layers, bufA, bufB, time, audio, beatState) {
        const s = this._state;
        let read = bufA;
        let write = bufB;
        this._lastLayerTimings = [];

        this.renderer.setRenderTarget(read);
        this.renderer.clear();

        // Determine which layers are composited this frame.
        // Solo takes precedence: only the soloed layer gets through; everyone else is hidden.
        // Mute hides individually. Layers still render to their own target so thumbnails stay live.
        // Solo only applies when the solo target is actually in this stack.
        const soloId = s.soloLayerId;
        const soloActive = soloId && layers.some(l => l.id === soloId);
        const isVisible = (l) => {
            if (l.muted) return false;
            if (soloActive && l.id !== soloId) return false;
            return true;
        };

        let baseIdx = layers.findIndex(l => isVisible(l) && !l.needsInput);
        if (baseIdx === -1) baseIdx = layers.findIndex(isVisible);

        layers.forEach((layer, i) => {
            const layerStart = performance.now();
            const hidden = !isVisible(layer);
            const freezeHidden = hidden && s.performance && s.performance.freezeHiddenLayers;
            if (freezeHidden) {
                this._lastLayerTimings.push({
                    name: (layer.name || `Layer ${i}`) + ' (held)',
                    ms: performance.now() - layerStart
                });
                return;
            }

            layer.uniforms.u_time.value = time;
            layer.uniforms.u_bass.value = audio.bass;
            layer.uniforms.u_mid.value = audio.mid;
            layer.uniforms.u_treble.value = audio.treble;
            layer.uniforms.u_bpm.value = s.bpm;
            layer.uniforms.u_beat.value = beatState.beat;
            layer.uniforms.u_phase.value = beatState.phase;

            if (layer.isWebCam && s.webcam) layer.uniforms.u_webcamTexture.value = s.webcam;
            if (layer.needsInput) layer.uniforms.u_inputTexture.value = read.texture;
            if (layer.isFeedback) layer.uniforms.u_prevLayer.value = layer.fbo.texture;

            this.renderer.setRenderTarget(layer.renderTarget);
            this.renderer.clear();
            this.quad.material = layer.material;
            this.renderer.render(this.scene, this.camera);

            if (layer.isFeedback) {
                this.renderer.setRenderTarget(layer.fbo);
                this.copyMat.uniforms.u_texture.value = layer.renderTarget.texture;
                this.quad.material = this.copyMat;
                this.renderer.render(this.scene, this.camera);
            }

            // Skip composition when hidden (mute / solo), but keep per-layer render above
            // so thumbnails and feedback state stay live.
            if (hidden) {
                this._lastLayerTimings.push({
                    name: (layer.name || `Layer ${i}`) + ' (muted)',
                    ms: performance.now() - layerStart
                });
                return;
            }

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

            this._lastLayerTimings.push({
                name: layer.name || `Layer ${i}`,
                ms: performance.now() - layerStart
            });
        });

        return read;
    }

    _updateThumbnails() {
        const s = this._state;
        if (s.layers.length === 0) return;

        const prevMaterial = this.quad.material;
        const glCanvas = this.renderer.domElement;

        // Save current viewport
        const vp = new THREE.Vector4();
        this.renderer.getViewport(vp);

        s.layers.forEach(layer => {
            if (!layer.thumbCanvas || !layer.thumbCtx) return;
            const tw = layer.thumbCanvas.width;
            const th = layer.thumbCanvas.height;

            // Render layer texture to screen at thumbnail size (Y-flipped)
            this.renderer.setRenderTarget(null);
            this.renderer.setViewport(0, 0, tw, th);
            this.thumbCopyMat.uniforms.u_texture.value = layer.renderTarget.texture;
            this.quad.material = this.thumbCopyMat;
            this.renderer.render(this.scene, this.camera);

            // GPU→Canvas blit (no readPixels)
            layer.thumbCtx.drawImage(glCanvas, 0, glCanvas.height - th, tw, th, 0, 0, tw, th);
        });

        // Restore viewport and material
        this.renderer.setViewport(vp);
        this.quad.material = prevMaterial;

        // Re-render final output so main canvas isn't corrupted
        this.renderer.setRenderTarget(null);
        this.renderer.setViewport(vp);
        this.copyMat.uniforms.u_texture.value = this._lastReadBuffer ? this._lastReadBuffer.texture : this.bufferA.texture;
        this.quad.material = this.copyMat;
        this.renderer.render(this.scene, this.camera);
    }

    /** Update resolution from UI. */
    setResolution(w, h) {
        const s = this._state;
        s.width = w;
        s.height = h;
        this.renderer.setSize(w, h);
        this._resizeRenderTargets();
        this.syncPopupSize();
    }

    setRenderScale(scale) {
        const p = this._state.performance || {};
        const next = Math.max(0.5, Math.min(1, Number(scale) || 1));
        const nextWidth = Math.max(2, Math.round(this._state.width * next));
        const nextHeight = Math.max(2, Math.round(this._state.height * next));
        if (Math.abs((p.renderScale || 1) - next) < 0.001
            && this._renderWidth === nextWidth
            && this._renderHeight === nextHeight) return;
        p.renderScale = next;
        this._resizeRenderTargets();
    }

    setThumbnailInterval(ms) {
        const next = Math.max(60, Math.min(1000, Math.round(Number(ms) || 180)));
        this._thumbIntervalMs = next;
        if (this._state.performance) {
            this._state.performance.thumbnailIntervalMs = next;
        }
    }

    _resizeRenderTargets() {
        const s = this._state;
        const renderSize = this._computeRenderSize();
        this._renderWidth = renderSize.width;
        this._renderHeight = renderSize.height;

        this.bufferA.setSize(this._renderWidth, this._renderHeight);
        this.bufferB.setSize(this._renderWidth, this._renderHeight);
        if (this.crossfadeBufferA) {
            this.crossfadeBufferA.setSize(this._renderWidth, this._renderHeight);
            this.crossfadeBufferB.setSize(this._renderWidth, this._renderHeight);
            this.crossfadeResultRT.setSize(this._renderWidth, this._renderHeight);
        }
        const resizeLayer = (l) => {
            l.renderTarget.setSize(this._renderWidth, this._renderHeight);
            if (l.fbo) l.fbo.setSize(this._renderWidth, this._renderHeight);
            l.uniforms.u_resolution.value.set(this._renderWidth, this._renderHeight);
        };
        s.layers.forEach(resizeLayer);
        s.crossfade.layersB.forEach(resizeLayer);
    }

    /** Open popup output window. */
    openOutputWindow() {
        const s = this._state;
        if (this._popupWindow && !this._popupWindow.closed) {
            this._popupWindow.close();
        }
        const win = window.open('', 'VJ Output', `width=${s.width},height=${s.height},menubar=no`);
        if (win) {
            win.document.body.style.background = '#000';
            win.document.body.style.margin = '0';
            const c = document.createElement('canvas');
            c.width = s.width;
            c.height = s.height;
            c.style.cssText = 'width:100%;height:100%;object-fit:contain;';
            win.document.body.appendChild(c);
            this._popupWindow = win;
            this._popupCanvas = c;
            this._popupCtx = c.getContext('2d');
        }
    }

    syncPopupSize() {
        if (!this._popupWindow || this._popupWindow.closed || !this._popupCanvas) return;
        this._popupCanvas.width = this._state.width;
        this._popupCanvas.height = this._state.height;
    }

    /** Create a new WebGLRenderTarget at current resolution. */
    createRenderTarget() {
        return new THREE.WebGLRenderTarget(this._renderWidth, this._renderHeight);
    }

    /** Create a ShaderMaterial with the standard vertex shader. */
    createLayerMaterial(uniforms, fragmentShader) {
        return new THREE.ShaderMaterial({
            uniforms,
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
            fragmentShader
        });
    }

    /** Compile a material to catch shader errors early. */
    compileMaterial(material) {
        const tempScene = new THREE.Scene();
        const tempMesh = new THREE.Mesh(this.quad.geometry, material);
        tempScene.add(tempMesh);

        const capturedErrors = [];
        const originalConsoleError = console.error;
        console.error = (...args) => {
            const text = args.map((arg) => {
                if (typeof arg === 'string') return arg;
                if (arg && typeof arg.message === 'string') return arg.message;
                return String(arg);
            }).join(' ');
            if (text.includes('THREE.WebGLProgram: Shader Error')) {
                capturedErrors.push(text);
                return;
            }
            originalConsoleError(...args);
        };

        try {
            const beforePrograms = this.renderer.info.programs.length;
            this.renderer.compile(tempScene, this.camera);
            const newPrograms = this.renderer.info.programs.slice(beforePrograms);
            const failedProgram = newPrograms.find((program) => (
                program && program.diagnostics && program.diagnostics.runnable === false
            ));
            if (capturedErrors.length > 0) {
                throw new Error(capturedErrors.join('\n'));
            }
            if (failedProgram && failedProgram.diagnostics) {
                const { programLog = '', fragmentShader = {}, vertexShader = {} } = failedProgram.diagnostics;
                const details = [programLog, fragmentShader.log, vertexShader.log]
                    .filter(Boolean)
                    .join('\n')
                    .trim();
                throw new Error(details || 'Shader compilation failed.');
            }
        } finally {
            console.error = originalConsoleError;
            tempScene.remove(tempMesh);
        }
    }

    /** Webcam init. */
    async initWebCam() {
        const s = this._state;
        if (s.webcam) return;
        try {
            const el = document.createElement('video');
            el.playsInline = true;
            el.muted = true;
            el.autoplay = true;
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            s.webcamStream = stream;
            el.srcObject = stream;
            el.play();
            s.webcam = new THREE.VideoTexture(el);
        } catch (e) {
            console.error('WebCam Error', e);
            this._bus.emit('debug:error', { message: e, source: 'webcam' });
        }
    }

    /** Clean up on shutdown. */
    shutdown() {
        const s = this._state;
        if (s.webcamStream) {
            s.webcamStream.getTracks().forEach(track => track.stop());
            s.webcamStream = null;
        }
        if (s.webcam) {
            s.webcam.dispose();
            s.webcam = null;
        }
    }
}
