/**
 * LayerManager — Creates, removes, and configures shader layers.
 *
 * Each layer has a ShaderMaterial, RenderTarget, uniform definitions,
 * and optional feedback buffer (FBO).
 *
 * Events emitted:
 *   project:autosave  (queued after changes)
 *   toast              { msg, type }
 */
const THREE = window.THREE;

export class LayerManager {
    /**
     * @param {import('../core/event-bus.js').EventBus} bus
     * @param {import('../core/app-state.js').AppState} state
     * @param {Object} deps - { renderer, midiManager }
     */
    constructor(bus, state, deps) {
        this._bus = bus;
        this._state = state;
        this._renderer = deps.renderer;
        this._midiManager = deps.midiManager;

    }

    generateLayerId() {
        const n = this._state.layerIdCounter++;
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

    /**
     * Add a layer from a shader key and optional saved config.
     * @param {string} key
     * @param {Object|null} config
     * @returns {Object|null} layer
     */
    addLayer(key, config = null, options = {}) {
        const def = window.SHADERS[key];
        if (!def) {
            this._bus.emit('toast', { msg: `Unknown shader key: ${key}`, type: 'error' });
            return null;
        }
        if (def.isWebCam) this._renderer.initWebCam();

        const s = this._state;
        const uniformDefs = this.sanitizeUniformsDef(
            config && config.uniformsDef ? config.uniformsDef : def.uniforms,
            def.uniforms
        );

        const id = (config && typeof config.id === 'string' && config.id) ? config.id : this.generateLayerId();
        const blendRaw = config ? Number(config.blend) : 0;
        const opacityRaw = config ? Number(config.opacity) : 1.0;

        const layer = {
            id, key, name: def.name,
            blend: Number.isFinite(blendRaw) ? Math.max(0, Math.min(9, Math.round(blendRaw))) : 0,
            opacity: Number.isFinite(opacityRaw) ? Math.max(0, Math.min(1, opacityRaw)) : 1.0,
            needsInput: def.needsInput, isFeedback: def.isFeedback, isWebCam: def.isWebCam,
            fragmentShader: (config && typeof config.fragmentShader === 'string') ? config.fragmentShader : def.fragmentShader,
            uniformsDef: uniformDefs,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(s.width, s.height) },
                u_bass: { value: 0 }, u_mid: { value: 0 }, u_treble: { value: 0 },
                u_bpm: { value: s.bpm }, u_beat: { value: 0 }, u_phase: { value: 0 },
                u_inputTexture: { value: null }, u_webcamTexture: { value: null }, u_prevLayer: { value: null }
            },
            renderTarget: this._renderer.createRenderTarget(),
            fbo: def.isFeedback ? this._renderer.createRenderTarget() : null
        };

        // Init uniform values
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

        layer.material = this._renderer.createLayerMaterial(layer.uniforms, layer.fragmentShader);
        s.layers.push(layer);
        this.renderLayerUI(layer);
        if (!options.skipSave) this.queueSceneSave();
        return layer;
    }

    /**
     * Build a layer object without adding to state.layers or rendering UI.
     * Used for crossfade scene B layers.
     */
    buildLayerNoUI(key, config = null) {
        const def = window.SHADERS[key];
        if (!def) return null;
        if (def.isWebCam) this._renderer.initWebCam();

        const s = this._state;
        const uniformDefs = this.sanitizeUniformsDef(
            config && config.uniformsDef ? config.uniformsDef : def.uniforms,
            def.uniforms
        );

        const id = (config && typeof config.id === 'string' && config.id) ? config.id : this.generateLayerId();
        const blendRaw = config ? Number(config.blend) : 0;
        const opacityRaw = config ? Number(config.opacity) : 1.0;

        const layer = {
            id, key, name: def.name,
            blend: Number.isFinite(blendRaw) ? Math.max(0, Math.min(9, Math.round(blendRaw))) : 0,
            opacity: Number.isFinite(opacityRaw) ? Math.max(0, Math.min(1, opacityRaw)) : 1.0,
            needsInput: def.needsInput, isFeedback: def.isFeedback, isWebCam: def.isWebCam,
            fragmentShader: (config && typeof config.fragmentShader === 'string') ? config.fragmentShader : def.fragmentShader,
            uniformsDef: uniformDefs,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(s.width, s.height) },
                u_bass: { value: 0 }, u_mid: { value: 0 }, u_treble: { value: 0 },
                u_bpm: { value: s.bpm }, u_beat: { value: 0 }, u_phase: { value: 0 },
                u_inputTexture: { value: null }, u_webcamTexture: { value: null }, u_prevLayer: { value: null }
            },
            renderTarget: this._renderer.createRenderTarget(),
            fbo: def.isFeedback ? this._renderer.createRenderTarget() : null,
            thumbCanvas: null,
            thumbCtx: null
        };

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

        layer.material = this._renderer.createLayerMaterial(layer.uniforms, layer.fragmentShader);
        return layer;
    }

    removeLayer(layer, el = null) {
        const s = this._state;
        s.layers = s.layers.filter(l => l !== layer);
        if (el) el.remove();
        this._midiManager.cleanupMidiForLayer(layer);
        layer.material.dispose();
        layer.renderTarget.dispose();
        if (layer.fbo) layer.fbo.dispose();
        this.queueSceneSave();
    }

    queueSceneSave() {
        this._bus.emit('project:autosave');
    }

    renderLayerUI(layer, options = {}) {
        const tpl = document.getElementById('layer-ui-template');
        const el = tpl.content.cloneNode(true).firstElementChild;
        el.dataset.id = layer.id;
        el.querySelector('.layer-name').textContent = layer.name;
        el.querySelector('.layer-type').textContent = layer.needsInput ? 'FX' : 'GEN';
        el.querySelector('.layer-type').className = `text-[9px] px-1.5 py-0.5 rounded font-mono font-bold tracking-wider ${layer.needsInput ? 'bg-indigo-900 text-indigo-300' : 'bg-emerald-900 text-emerald-300'}`;

        // Opacity
        const op = el.querySelector('.layer-opacity');
        const opV = el.querySelector('.layer-opacity-val');
        op.value = layer.opacity;
        opV.textContent = layer.opacity.toFixed(2);
        op.oninput = (e) => {
            layer.opacity = parseFloat(e.target.value);
            opV.textContent = layer.opacity.toFixed(2);
            this.queueSceneSave();
        };

        // Blend
        const blend = el.querySelector('.layer-blend');
        const blends = { 'NORMAL': 0, 'ADD': 1, 'MULTIPLY': 2, 'SCREEN': 3, 'DIFFERENCE': 4, 'OVERLAY': 5, 'SOFT_LIGHT': 6, 'HARD_LIGHT': 7, 'COLOR_DODGE': 8, 'COLOR_BURN': 9 };
        Object.keys(blends).forEach(k => { if (blends[k] === layer.blend) blend.value = k; });
        blend.onchange = (e) => {
            layer.blend = blends[e.target.value];
            this.queueSceneSave();
        };

        // Remove
        el.querySelector('.layer-del-btn').onclick = () => this.removeLayer(layer, el);

        // Code edit
        el.querySelector('.layer-edit-btn').onclick = () => {
            this._bus.emit('editor:open', { layer });
        };

        // Uniforms
        const cont = el.querySelector('.layer-uniforms');
        Object.keys(layer.uniformsDef).forEach(uKey => {
            const u = layer.uniformsDef[uKey];
            const wrap = document.createElement('div');
            wrap.className = 'flex flex-col gap-1';

            const head = document.createElement('div');
            head.className = 'flex justify-between items-center';

            const label = document.createElement('span');
            label.className = 'text-[9px] font-mono text-slate-500';
            label.textContent = uKey.replace('u_', '');

            const valDisplay = document.createElement('span');
            valDisplay.className = 'text-[9px] text-slate-400';
            valDisplay.textContent = layer.uniforms[uKey].value.toFixed(2);

            // MIDI CC input
            const cc = document.createElement('input');
            cc.type = 'number';
            cc.placeholder = 'CC';
            cc.min = 0; cc.max = 127; cc.step = 1;
            cc.className = 'w-6 bg-slate-950 border border-slate-800 text-[8px] text-center text-slate-500 focus:text-purple-400 rounded focus:outline-none';
            const mapKey = `${layer.id}::${uKey}`;
            cc.dataset.mapKey = mapKey;
            const curMap = this._state.midi.map[mapKey];
            if (curMap !== undefined) cc.value = curMap;
            cc.onchange = (e) => {
                const raw = String(e.target.value).trim();
                if (raw === '') {
                    delete this._state.midi.map[mapKey];
                    this.queueSceneSave();
                    return;
                }
                let v = parseInt(raw, 10);
                if (isNaN(v)) {
                    delete this._state.midi.map[mapKey];
                    e.target.value = '';
                    this.queueSceneSave();
                    return;
                }
                v = Math.max(0, Math.min(127, v));
                if (String(v) !== raw) e.target.value = v;

                const existingKey = this._midiManager.findMapKeyByCC(v);
                if (existingKey && existingKey !== mapKey) {
                    const bindLabel = this._midiManager.getMidiBindingLabel(existingKey);
                    const ok = confirm(`CC ${v} is already assigned to ${bindLabel}. Replace it?`);
                    if (!ok) {
                        const prev = this._state.midi.map[mapKey];
                        e.target.value = prev !== undefined ? prev : '';
                        return;
                    }
                    delete this._state.midi.map[existingKey];
                    const other = document.querySelector(`input[data-map-key="${existingKey}"]`);
                    if (other) other.value = '';
                }

                this._state.midi.map[mapKey] = v;
                this.queueSceneSave();
            };

            head.append(label, cc, valDisplay);

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'control-slider w-full';
            slider.min = u.min; slider.max = u.max; slider.step = 0.01;
            slider.value = layer.uniforms[uKey].value;
            slider.id = `slider-${mapKey}`;
            slider.oninput = (e) => {
                const v = parseFloat(e.target.value);
                layer.uniforms[uKey].value = v;
                valDisplay.textContent = v.toFixed(2);
                this.queueSceneSave();
            };

            // MIDI Learn: clicking the slider row sets it as learn target
            wrap.addEventListener('click', (e) => {
                if (this._state.midi.learn.active) {
                    e.preventDefault();
                    this._midiManager.setLearnTarget(mapKey);
                }
            });

            wrap.append(head, slider);
            cont.appendChild(wrap);
        });

        const stack = document.getElementById('layer-stack');
        if (options.replaceEl && options.replaceEl.parentElement === stack) {
            options.replaceEl.replaceWith(el);
        } else if (options.beforeEl && options.beforeEl.parentElement === stack) {
            stack.insertBefore(el, options.beforeEl);
        } else {
            stack.appendChild(el);
        }

        // Thumbnail canvas
        const thumbCanvas = el.querySelector('.layer-thumbnail');
        layer.thumbCanvas = thumbCanvas;
        layer.thumbCtx = thumbCanvas.getContext('2d');
    }
}
