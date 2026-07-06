/**
 * UIController — Top-level UI wiring that doesn't belong to specialized modules.
 *
 * Handles shader modal (accordion), resolution controls, DPR select,
 * preserve-buffer toggle, output-window button, and global keyboard shortcuts.
 *
 * Events emitted:
 *   toast   { msg, type }
 */
export class UIController {
    /**
     * @param {import('../core/event-bus.js').EventBus} bus
     * @param {import('../core/app-state.js').AppState} state
     * @param {Object} deps - { renderer, layerManager, sceneManager, editorController, bpmSync, projectIO, midiManager, audio }
     */
    constructor(bus, state, deps) {
        this._bus = bus;
        this._state = state;
        this._renderer = deps.renderer;
        this._layerManager = deps.layerManager;
        this._sceneManager = deps.sceneManager;
        this._editorController = deps.editorController;
        this._bpmSync = deps.bpmSync;
        this._projectIO = deps.projectIO;
        this._midiManager = deps.midiManager;
        this._midiConfigUI = deps.midiConfigUI;
        this._audio = deps.audio;
    }

    /** Call after DOM ready. Wires all top-level UI controls. */
    initUI() {
        const s = this._state;

        // --- Resolution (select dropdown) ---
        const resDisplay = document.getElementById('resolution-display');
        const resSelect = document.getElementById('resolution-select');
        resDisplay.textContent = `${s.width}x${s.height}`;
        if (resSelect) {
            // Sync initial selection
            for (const opt of resSelect.options) {
                const [w, h] = opt.value.split(',').map(Number);
                if (w === s.width && h === s.height) { opt.selected = true; break; }
            }
            resSelect.onchange = () => {
                const [w, h] = resSelect.value.split(',').map(Number);
                this._renderer.setResolution(w, h);
                resDisplay.textContent = `${w}x${h}`;
                this._sceneManager.saveCurrentScene();
            };
        }

        // --- Sidebar toggle ---
        this._initSidebarToggle();

        // --- Layer panel collapse ---
        this._initLayerPanelToggle();

        // --- DPR ---
        const dprSelect = document.getElementById('dpr-select');
        dprSelect.value = s.dprMode;
        dprSelect.onchange = (e) => {
            s.dprMode = e.target.value;
            localStorage.setItem('vj_dpr', s.dprMode);
            const pr = s.dprMode === 'device' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
            this._renderer.renderer.setPixelRatio(pr);
        };

        // --- Preserve Buffer ---
        const preserveToggle = document.getElementById('preserve-buffer-toggle');
        preserveToggle.checked = s.preserveDrawingBuffer;
        preserveToggle.onchange = (e) => {
            const v = e.target.checked ? '1' : '0';
            localStorage.setItem('vj_preserve_buffer', v);
            if (confirm('Reload to apply Preserve Buffer setting?')) {
                location.reload();
            }
        };

        // --- Output Window ---
        document.getElementById('output-window-btn').onclick = () => {
            this._renderer.openOutputWindow();
        };

        // --- Audio Source Buttons ---
        this._initAudioButtons();

        // --- Shader Modal (Accordion) ---
        const showModal = (id) => {
            const m = document.getElementById(id);
            m.classList.remove('hidden');
            setTimeout(() => m.classList.remove('opacity-0'), 10);
        };
        const hideModal = (id) => {
            const m = document.getElementById(id);
            m.classList.add('opacity-0');
            setTimeout(() => m.classList.add('hidden'), 300);
        };

        document.getElementById('add-layer-btn').onclick = () => showModal('shader-modal');
        document.querySelectorAll('.close-modal').forEach(b => {
            b.onclick = () => { hideModal('shader-modal'); hideModal('code-modal'); };
        });

        this._buildShaderAccordion(hideModal);

        // --- Blackout button ---
        const blackoutBtn = document.getElementById('blackout-btn');
        if (blackoutBtn) {
            blackoutBtn.onclick = () => this._bus.emit('app:blackout', { active: !this._state.blackout, source: 'ui' });
        }

        // --- Global Shortcuts ---
        this._initGlobalShortcuts(hideModal);
    }

    _initSidebarToggle() {
        const sidebar = document.getElementById('sidebar');
        const btn = document.getElementById('sidebar-toggle-btn');
        if (!sidebar || !btn) return;

        // Restore persisted state
        const stored = localStorage.getItem('vj_sidebar_collapsed');
        if (stored === '1') sidebar.classList.add('sidebar-collapsed');

        btn.onclick = () => this._toggleSidebar();
    }

    _toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        sidebar.classList.toggle('sidebar-collapsed');
        const collapsed = sidebar.classList.contains('sidebar-collapsed');
        localStorage.setItem('vj_sidebar_collapsed', collapsed ? '1' : '0');
    }

    _initLayerPanelToggle() {
        const panel = document.getElementById('layer-panel');
        const btn = document.getElementById('layer-panel-toggle');
        if (!panel || !btn) return;

        // Restore persisted state
        const stored = localStorage.getItem('vj_layers_collapsed');
        if (stored === '1') panel.classList.add('layer-panel-collapsed');

        btn.onclick = () => {
            panel.classList.toggle('layer-panel-collapsed');
            const collapsed = panel.classList.contains('layer-panel-collapsed');
            localStorage.setItem('vj_layers_collapsed', collapsed ? '1' : '0');
        };
    }

    _initAudioButtons() {
        const micBtn = document.getElementById('audio-enable-btn');
        const sysBtn = document.getElementById('audio-system-btn');
        const audio = this._audio;

        const updateBtnStyles = () => {
            const mode = audio.mode;
            // MIC button
            if (mode === 'mic') {
                micBtn.classList.remove('bg-slate-900', 'text-purple-400', 'border-purple-900/50');
                micBtn.classList.add('bg-purple-900', 'text-white', 'border-purple-500');
            } else {
                micBtn.classList.remove('bg-purple-900', 'text-white', 'border-purple-500');
                micBtn.classList.add('bg-slate-900', 'text-purple-400', 'border-purple-900/50');
            }
            // SYS button
            if (mode === 'system') {
                sysBtn.classList.remove('bg-slate-900', 'text-cyan-400', 'border-cyan-900/50');
                sysBtn.classList.add('bg-cyan-900', 'text-white', 'border-cyan-500');
            } else {
                sysBtn.classList.remove('bg-cyan-900', 'text-white', 'border-cyan-500');
                sysBtn.classList.add('bg-slate-900', 'text-cyan-400', 'border-cyan-900/50');
            }
        };

        micBtn.onclick = async () => {
            const ok = await audio.init();
            if (ok) {
                this._bus.emit('toast', { msg: 'Microphone audio active', type: 'info' });
            } else {
                this._bus.emit('toast', { msg: 'Mic access denied', type: 'error' });
            }
            updateBtnStyles();
        };

        sysBtn.onclick = async () => {
            const ok = await audio.initSystemAudio();
            if (ok) {
                this._bus.emit('toast', { msg: 'System audio active', type: 'info' });
            } else {
                this._bus.emit('toast', { msg: 'System audio cancelled', type: 'error' });
            }
            updateBtnStyles();
        };
    }

    _buildShaderAccordion(hideModal) {
        const listContainer = document.getElementById('shader-list-container');
        const groups = { 'High-End Generators': [], 'Standard Generators': [], 'Filters / FX': [] };

        Object.keys(window.SHADERS).forEach(k => {
            const sh = window.SHADERS[k];
            if (sh.needsInput) groups['Filters / FX'].push(k);
            else if (['RAYMARCHING', 'TUNNEL', 'FLUID'].includes(sh.type)) groups['High-End Generators'].push(k);
            else groups['Standard Generators'].push(k);
        });

        Object.keys(groups).forEach((title, i) => {
            const div = document.createElement('div');
            div.className = 'mb-2 border border-slate-800 rounded bg-slate-900 overflow-hidden';

            const header = document.createElement('div');
            header.className = `accordion-header p-3 cursor-pointer flex justify-between items-center hover:bg-slate-800 ${i === 0 ? 'open' : ''}`;

            const titleSpan = document.createElement('span');
            titleSpan.className = 'text-xs font-bold text-slate-300 uppercase';
            titleSpan.textContent = title;

            const arrow = document.createElement('span');
            arrow.className = 'arrow text-[10px] text-slate-500';
            arrow.textContent = '\u25B6';

            header.append(titleSpan, arrow);
            header.onclick = function () {
                this.classList.toggle('open');
                this.nextElementSibling.classList.toggle('open');
            };

            const content = document.createElement('div');
            content.className = `accordion-content ${i === 0 ? 'open' : ''}`;

            const inner = document.createElement('div');
            inner.className = 'p-1 space-y-1 bg-slate-950/50';

            groups[title].forEach(key => {
                const btn = document.createElement('button');
                btn.className = 'w-full text-left px-3 py-2 text-[10px] text-slate-400 hover:text-white hover:bg-purple-900/30 rounded transition-colors font-mono';
                btn.textContent = window.SHADERS[key].name;
                btn.onclick = () => {
                    this._layerManager.addLayer(key);
                    hideModal('shader-modal');
                };
                inner.appendChild(btn);
            });

            content.appendChild(inner);
            div.append(header, content);
            listContainer.appendChild(div);
        });
    }

    _initGlobalShortcuts(hideModal) {
        window.addEventListener('keydown', (e) => {
            const ctrlOrMeta = e.ctrlKey || e.metaKey;
            const key = String(e.key || '').toLowerCase();
            const targetTag = (e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '');
            const isTextInput = ['input', 'textarea', 'select'].includes(targetTag) || (e.target && e.target.isContentEditable);

            // Ctrl+Z / Ctrl+Shift+Z — Undo/Redo
            if (ctrlOrMeta && key === 'z' && !isTextInput
                && !this._sceneManager.isModalOpen('code-modal')) {
                e.preventDefault();
                if (e.shiftKey) {
                    if (this._projectIO.redo()) {
                        this._bus.emit('toast', { msg: 'Redo', type: 'info' });
                    }
                } else {
                    if (this._projectIO.undo()) {
                        this._bus.emit('toast', { msg: 'Undo', type: 'info' });
                    }
                }
                return;
            }

            // Ctrl+Y — Redo (alternative)
            if (ctrlOrMeta && key === 'y' && !isTextInput
                && !this._sceneManager.isModalOpen('code-modal')) {
                e.preventDefault();
                if (this._projectIO.redo()) {
                    this._bus.emit('toast', { msg: 'Redo', type: 'info' });
                }
                return;
            }

            // Ctrl+S
            if (ctrlOrMeta && key === 's') {
                e.preventDefault();
                if (this._sceneManager.isModalOpen('code-modal')) {
                    const activeEl = document.activeElement;
                    const inMonaco = !!(activeEl && activeEl.closest && activeEl.closest('.monaco-editor'));
                    if (inMonaco && this._editorController.editorCommandsBound) return;
                    if (typeof this._editorController.editorSaveAction === 'function') {
                        this._editorController.editorSaveAction();
                    }
                } else {
                    this._projectIO.exportProject();
                    this._bus.emit('toast', { msg: 'Project exported', type: 'info' });
                }
                return;
            }

            // Tab — toggle sidebar
            if (key === 'tab' && !ctrlOrMeta && !e.altKey && !isTextInput
                && !this._sceneManager.isModalOpen('code-modal')) {
                e.preventDefault();
                this._toggleSidebar();
                return;
            }

            // T — tap tempo
            if (!ctrlOrMeta && !e.altKey && key === 't' && !e.repeat
                && !this._sceneManager.isModalOpen('code-modal') && !isTextInput) {
                e.preventDefault();
                this._bpmSync.tapTempo();
                return;
            }

            // 1-9 — scene recall, 0 — blackout toggle
            if (!ctrlOrMeta && !e.altKey && !isTextInput
                && !this._sceneManager.isModalOpen('code-modal')
                && !this._sceneManager.isModalOpen('shader-modal')
                && !(this._midiConfigUI && this._midiConfigUI.isOpen())) {
                if (/^[1-9]$/.test(key)) {
                    e.preventDefault();
                    const idx = parseInt(key, 10) - 1;
                    if (idx < this._state.scenes.length) this._bus.emit('scene:recall', { index: idx });
                    return;
                }
                if (key === '0') {
                    e.preventDefault();
                    this._bus.emit('app:blackout', { active: !this._state.blackout, source: 'key' });
                    return;
                }
                if (key === 'b') {
                    e.preventDefault();
                    if (e.shiftKey) this._bus.emit('app:panic', {});
                    else this._bus.emit('app:blackout', { active: !this._state.blackout, source: 'key' });
                    return;
                }
                if (key === 'g') {
                    e.preventDefault();
                    if (e.shiftKey) this._bus.emit('performance:profile-step', { delta: 1 });
                    else this._bus.emit('performance:guard-toggle', {});
                    return;
                }
            }

            // Escape — cancel MIDI Learn first, then close modals
            if (e.key === 'Escape') {
                if (this._state.midi.learn.active) {
                    e.preventDefault();
                    this._midiManager.cancelLearn();
                    return;
                }
                const bindingEditor = document.getElementById('midi-binding-editor');
                if (bindingEditor && !bindingEditor.classList.contains('hidden')) {
                    e.preventDefault();
                    bindingEditor.classList.add('opacity-0');
                    setTimeout(() => bindingEditor.classList.add('hidden'), 150);
                    return;
                }
                if (this._midiConfigUI && this._midiConfigUI.isOpen()) {
                    e.preventDefault();
                    this._midiConfigUI.close();
                    return;
                }
                if (this._sceneManager.isModalOpen('code-modal') && this._editorController.editorClose) {
                    e.preventDefault();
                    this._editorController.editorClose();
                    return;
                }
                if (this._sceneManager.isModalOpen('code-modal')) {
                    e.preventDefault();
                    hideModal('code-modal');
                    return;
                }
                if (this._sceneManager.isModalOpen('shader-modal')) {
                    e.preventDefault();
                    hideModal('shader-modal');
                    return;
                }
                if (this._sceneManager.isModalOpen('rename-modal')) {
                    e.preventDefault();
                    const helpers = this._sceneManager.getModalHelpers();
                    if (helpers.hideModal) helpers.hideModal('rename-modal');
                }
            }
        });
    }
}
