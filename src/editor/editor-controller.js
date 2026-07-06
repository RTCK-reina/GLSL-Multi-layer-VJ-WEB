/**
 * EditorController — Monaco editor integration for GLSL editing.
 *
 * Handles opening/closing the code editor modal,
 * shader compilation, and uniform editing.
 *
 * Events consumed:
 *   editor:open   { layer }
 *
 * Events emitted:
 *   toast              { msg, type }
 *   project:autosave
 */
const THREE = window.THREE;

export class EditorController {
    /**
     * @param {import('../core/event-bus.js').EventBus} bus
     * @param {import('../core/app-state.js').AppState} state
     * @param {Object} deps - { renderer, layerManager }
     */
    constructor(bus, state, deps) {
        this._bus = bus;
        this._state = state;
        this._renderer = deps.renderer;
        this._layerManager = deps.layerManager;

        this._monaco = null;
        this._monacoU = null;
        this._editorSaveAction = null;
        this._editorLiveApplyAction = null;
        this._editorClose = null;
        this._editorCommandsBound = false;
        this._errorDecorations = [];
        this._glslCompletionRegistered = false;
        this._currentLayerId = null;

        bus.on('editor:open', ({ layer }) => this.openEditor(layer));
    }

    openEditor(layer) {
        const m = document.getElementById('code-modal');
        m.classList.remove('hidden');
        setTimeout(() => m.classList.remove('opacity-0'), 10);
        document.getElementById('editor-layer-name').textContent = layer.name;
        const status = document.getElementById('editor-status');
        if (status) {
            status.textContent = 'Ready';
            status.classList.remove('text-red-300', 'text-emerald-300');
            status.classList.add('text-slate-500');
        }

        const sameLayer = this._currentLayerId === layer.id;
        this._currentLayerId = layer.id;

        if (!this._monaco) {
            // Show loading indicator
            const shaderEl = document.getElementById('monaco-shader');
            shaderEl.textContent = 'Loading editor...';

            require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
            require(['vs/editor/editor.main'], () => {
                shaderEl.textContent = '';
                this._registerGlslCompletions();
                this._monaco = monaco.editor.create(shaderEl, {
                    value: layer.fragmentShader, language: 'glsl', theme: 'vs-dark',
                    minimap: { enabled: false }, fontSize: 12
                });
                this._monacoU = monaco.editor.create(document.getElementById('monaco-uniforms'), {
                    value: JSON.stringify(layer.uniformsDef, null, 2), language: 'json', theme: 'vs-dark',
                    minimap: { enabled: false }, fontSize: 11
                });
                this._bindEditorSave(layer);
                this._monaco.focus();
            });
        } else {
            // Only reset content if switching to a different layer (preserves undo stack)
            if (!sameLayer) {
                this._monaco.setValue(layer.fragmentShader);
                this._monacoU.setValue(JSON.stringify(layer.uniformsDef, null, 2));
            }
            this._bindEditorSave(layer);
            this._monaco.focus();
        }

        const close = () => {
            m.classList.add('opacity-0');
            setTimeout(() => m.classList.add('hidden'), 300);
            this._editorSaveAction = null;
            this._editorLiveApplyAction = null;
        };
        document.getElementById('editor-cancel-btn').onclick = close;
        this._editorClose = close;
    }

    _parseShaderError(msg) {
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
            if (match) { line = parseInt(match[1], 10); break; }
        }
        let cleanMsg = msg
            .replace(/THREE\.WebGLProgram: shader error:\s*/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (line) cleanMsg = `Line ${line}: ${cleanMsg}`;
        return { line, message: cleanMsg };
    }

    _bindEditorSave(layer) {
        this._errorDecorations = [];

        const save = (options = {}) => {
            const closeOnSuccess = options.closeOnSuccess !== false;
            let mat = null;
            try {
                const fs = this._monaco.getValue();
                const rawUd = JSON.parse(this._monacoU.getValue());
                if (!rawUd || typeof rawUd !== 'object' || Array.isArray(rawUd)) {
                    throw new Error('Uniforms JSON must be an object.');
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

                const ud = this._layerManager.sanitizeUniformsDef(rawUd, layer.uniformsDef);
                const s = this._state;
                const renderSize = this._renderer.getRenderSize ? this._renderer.getRenderSize() : { width: s.width, height: s.height };

                const nextUniforms = {
                    u_time: { value: 0 },
                    u_resolution: { value: new THREE.Vector2(renderSize.width, renderSize.height) },
                    u_bass: { value: 0 }, u_mid: { value: 0 }, u_treble: { value: 0 },
                    u_bpm: { value: s.bpm }, u_beat: { value: 0 }, u_phase: { value: 0 },
                    u_inputTexture: { value: null }, u_webcamTexture: { value: null }, u_prevLayer: { value: null }
                };
                Object.keys(ud).forEach(k => {
                    const prev = layer.uniforms[k];
                    const min = ud[k].min;
                    const max = ud[k].max;
                    const rawVal = prev ? Number(prev.value) : Number(ud[k].value);
                    const val = Number.isFinite(rawVal) ? Math.min(max, Math.max(min, rawVal)) : ud[k].value;
                    nextUniforms[k] = { value: val };
                });

                mat = this._renderer.createLayerMaterial(nextUniforms, fs);
                this._renderer.compileMaterial(mat);

                layer.fragmentShader = fs;
                layer.uniformsDef = ud;
                layer.uniforms = nextUniforms;
                layer.material.dispose();
                layer.material = mat;

                // Re-render layer UI card
                const card = document.querySelector(`.layer-card[data-id="${layer.id}"]`);
                this._layerManager.renderLayerUI(layer, { replaceEl: card });
                this._bus.emit('project:autosave');
                if (closeOnSuccess) this._editorClose();
                const status = document.getElementById('editor-status');
                if (status) {
                    status.textContent = closeOnSuccess ? 'Applied' : `Live applied ${new Date().toLocaleTimeString()}`;
                    status.classList.remove('text-red-300');
                    status.classList.add('text-emerald-300');
                }
                this._bus.emit('toast', { msg: closeOnSuccess ? 'Shader compiled successfully!' : 'Shader live-applied', type: 'success' });
            } catch (e) {
                if (mat) mat.dispose();
                console.error(e);
                const errorInfo = this._parseShaderError(e.message || 'Unknown compilation error');
                this._bus.emit('toast', { msg: errorInfo.message, type: 'error' });
                const status = document.getElementById('editor-status');
                if (status) {
                    status.textContent = errorInfo.message;
                    status.classList.remove('text-emerald-300');
                    status.classList.add('text-red-300');
                }

                if (errorInfo.line && this._monaco) {
                    this._monaco.revealLineInCenter(errorInfo.line);
                    this._monaco.deltaDecorations(this._errorDecorations || [], []);
                    this._errorDecorations = this._monaco.deltaDecorations([], [{
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

        this._editorSaveAction = save;
        this._editorLiveApplyAction = () => save({ closeOnSuccess: false });
        document.getElementById('editor-save-btn').onclick = () => save();
        const liveBtn = document.getElementById('editor-live-apply-btn');
        if (liveBtn) liveBtn.onclick = this._editorLiveApplyAction;

        if (!this._editorCommandsBound && this._monaco && this._monacoU) {
            this._editorCommandsBound = true;
            const saveKey = monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS;
            const liveKey = monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter;
            const escKey = monaco.KeyCode.Escape;
            const runSave = () => {
                if (typeof this._editorSaveAction === 'function') this._editorSaveAction();
            };
            const runLiveApply = () => {
                if (typeof this._editorLiveApplyAction === 'function') this._editorLiveApplyAction();
            };
            const runClose = () => {
                if (typeof this._editorClose === 'function') this._editorClose();
            };
            this._monaco.addCommand(saveKey, runSave);
            this._monacoU.addCommand(saveKey, runSave);
            this._monaco.addCommand(liveKey, runLiveApply);
            this._monacoU.addCommand(liveKey, runLiveApply);
            this._monaco.addCommand(escKey, runClose);
            this._monacoU.addCommand(escKey, runClose);
        }
    }

    /** Access the save action (for global shortcuts). */
    get editorSaveAction() { return this._editorSaveAction; }

    /** Access the close action (for global shortcuts). */
    get editorClose() { return this._editorClose; }

    /** Check if Monaco commands are bound. */
    get editorCommandsBound() { return this._editorCommandsBound; }

    _registerGlslCompletions() {
        if (this._glslCompletionRegistered) return;
        this._glslCompletionRegistered = true;

        // Register GLSL language if not present
        monaco.languages.register({ id: 'glsl' });

        const builtinUniforms = [
            { label: 'u_time', detail: 'float — elapsed time in seconds' },
            { label: 'u_resolution', detail: 'vec2 — canvas width/height' },
            { label: 'u_bass', detail: 'float — audio bass (0-1)' },
            { label: 'u_mid', detail: 'float — audio mid (0-1)' },
            { label: 'u_treble', detail: 'float — audio treble (0-1)' },
            { label: 'u_bpm', detail: 'float — beats per minute' },
            { label: 'u_beat', detail: 'float — beat counter' },
            { label: 'u_phase', detail: 'float — beat phase (0-1)' },
            { label: 'u_inputTexture', detail: 'sampler2D — previous layer output' },
            { label: 'u_prevLayer', detail: 'sampler2D — feedback buffer' },
            { label: 'u_webcamTexture', detail: 'sampler2D — webcam input' },
            { label: 'gl_FragCoord', detail: 'vec4 — fragment screen coordinates' },
            { label: 'gl_FragColor', detail: 'vec4 — output fragment color' },
        ];

        const glslFunctions = [
            { label: 'mix', insertText: 'mix(${1:x}, ${2:y}, ${3:a})', detail: 'genType — linear interpolation' },
            { label: 'smoothstep', insertText: 'smoothstep(${1:edge0}, ${2:edge1}, ${3:x})', detail: 'genType — Hermite interpolation' },
            { label: 'step', insertText: 'step(${1:edge}, ${2:x})', detail: 'genType — step function' },
            { label: 'clamp', insertText: 'clamp(${1:x}, ${2:min}, ${3:max})', detail: 'genType — clamp to range' },
            { label: 'fract', insertText: 'fract(${1:x})', detail: 'genType — fractional part' },
            { label: 'mod', insertText: 'mod(${1:x}, ${2:y})', detail: 'genType — modulo' },
            { label: 'abs', insertText: 'abs(${1:x})', detail: 'genType — absolute value' },
            { label: 'sign', insertText: 'sign(${1:x})', detail: 'genType — sign of value' },
            { label: 'floor', insertText: 'floor(${1:x})', detail: 'genType — floor' },
            { label: 'ceil', insertText: 'ceil(${1:x})', detail: 'genType — ceiling' },
            { label: 'pow', insertText: 'pow(${1:x}, ${2:y})', detail: 'genType — power' },
            { label: 'exp', insertText: 'exp(${1:x})', detail: 'genType — e^x' },
            { label: 'log', insertText: 'log(${1:x})', detail: 'genType — natural logarithm' },
            { label: 'sqrt', insertText: 'sqrt(${1:x})', detail: 'genType — square root' },
            { label: 'inversesqrt', insertText: 'inversesqrt(${1:x})', detail: 'genType — 1/sqrt(x)' },
            { label: 'sin', insertText: 'sin(${1:angle})', detail: 'genType — sine' },
            { label: 'cos', insertText: 'cos(${1:angle})', detail: 'genType — cosine' },
            { label: 'tan', insertText: 'tan(${1:angle})', detail: 'genType — tangent' },
            { label: 'atan', insertText: 'atan(${1:y}, ${2:x})', detail: 'genType — arctangent' },
            { label: 'length', insertText: 'length(${1:x})', detail: 'float — vector length' },
            { label: 'distance', insertText: 'distance(${1:p0}, ${2:p1})', detail: 'float — distance between points' },
            { label: 'dot', insertText: 'dot(${1:x}, ${2:y})', detail: 'float — dot product' },
            { label: 'cross', insertText: 'cross(${1:x}, ${2:y})', detail: 'vec3 — cross product' },
            { label: 'normalize', insertText: 'normalize(${1:x})', detail: 'genType — normalize vector' },
            { label: 'reflect', insertText: 'reflect(${1:I}, ${2:N})', detail: 'genType — reflection vector' },
            { label: 'refract', insertText: 'refract(${1:I}, ${2:N}, ${3:eta})', detail: 'genType — refraction vector' },
            { label: 'texture2D', insertText: 'texture2D(${1:sampler}, ${2:coord})', detail: 'vec4 — texture lookup' },
            { label: 'mat2', insertText: 'mat2(${1:cos(a)}, ${2:-sin(a)}, ${3:sin(a)}, ${4:cos(a)})', detail: '2x2 matrix constructor' },
            { label: 'vec2', insertText: 'vec2(${1:x}, ${2:y})', detail: '2D vector constructor' },
            { label: 'vec3', insertText: 'vec3(${1:x}, ${2:y}, ${3:z})', detail: '3D vector constructor' },
            { label: 'vec4', insertText: 'vec4(${1:x}, ${2:y}, ${3:z}, ${4:w})', detail: '4D vector constructor' },
        ];

        monaco.languages.registerCompletionItemProvider('glsl', {
            provideCompletionItems: (model, position) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                };

                const suggestions = [];

                builtinUniforms.forEach(u => {
                    suggestions.push({
                        label: u.label,
                        kind: monaco.languages.CompletionItemKind.Variable,
                        detail: u.detail,
                        insertText: u.label,
                        range
                    });
                });

                glslFunctions.forEach(f => {
                    suggestions.push({
                        label: f.label,
                        kind: monaco.languages.CompletionItemKind.Function,
                        detail: f.detail,
                        insertText: f.insertText,
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        range
                    });
                });

                return { suggestions };
            }
        });
    }
}
