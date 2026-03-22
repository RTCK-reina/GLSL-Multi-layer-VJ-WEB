/**
 * SceneManager — Scene CRUD, switching, and serialization.
 *
 * Events emitted:
 *   scene:switched   { index }
 *   project:autosave
 *   toast            { msg, type }
 *
 * Events consumed:
 *   crossfade:complete
 */
export class SceneManager {
    /**
     * @param {import('../core/event-bus.js').EventBus} bus
     * @param {import('../core/app-state.js').AppState} state
     * @param {Object} deps - { layerManager, bpmSync }
     */
    constructor(bus, state, deps) {
        this._bus = bus;
        this._state = state;
        this._layerManager = deps.layerManager;
        this._bpmSync = deps.bpmSync;

        // Modal helpers (set during initUI)
        this._showModal = null;
        this._hideModal = null;

        bus.on('crossfade:complete', () => this._finalizeCrossfade());
    }

    /** Proxy accessors for ProjectIO to call */
    generateLayerId() {
        return this._layerManager.generateLayerId();
    }

    sanitizeUniformsDef(rawDefs, fallbackDefs) {
        return this._layerManager.sanitizeUniformsDef(rawDefs, fallbackDefs);
    }

    /** Call after DOM ready. */
    initUI() {
        this._showModal = (id) => {
            const m = document.getElementById(id);
            m.classList.remove('hidden');
            setTimeout(() => m.classList.remove('opacity-0'), 10);
        };
        this._hideModal = (id) => {
            const m = document.getElementById(id);
            m.classList.add('opacity-0');
            setTimeout(() => m.classList.add('hidden'), 300);
        };

        // Crossfade duration
        const cfSelect = document.getElementById('crossfade-duration');
        if (cfSelect) {
            cfSelect.value = String(this._state.crossfade.durationBeats);
            cfSelect.onchange = (e) => {
                this._state.crossfade.durationBeats = parseFloat(e.target.value);
            };
        }

        // Scene buttons
        document.getElementById('add-scene-btn').onclick = () => this.createScene();

        // Rename modal
        document.getElementById('rename-cancel-btn').onclick = () => this._hideModal('rename-modal');
        document.getElementById('current-scene-name').onclick = () => {
            if (this._state.sceneIdx >= 0) this.openRenameModal(this._state.sceneIdx);
        };

        // Sortable
        if (window.Sortable) {
            Sortable.create(document.getElementById('layer-stack'), {
                handle: '.layer-handle', animation: 150,
                onEnd: (evt) => {
                    const item = this._state.layers.splice(evt.oldIndex, 1)[0];
                    this._state.layers.splice(evt.newIndex, 0, item);
                    this.saveCurrentScene();
                }
            });
        }
    }

    createScene() {
        const name = `Scene ${this._state.scenes.length + 1}`;
        this._state.scenes.push({ name, layers: [] });
        this.renderSceneList();
        this.switchScene(this._state.scenes.length - 1);
        this._bus.emit('project:autosave');
    }

    openRenameModal(index) {
        const modal = document.getElementById('rename-modal');
        const input = document.getElementById('rename-input');
        const confirmBtn = document.getElementById('rename-confirm-btn');

        input.value = this._state.scenes[index].name;
        confirmBtn.onclick = () => {
            const newName = input.value.trim();
            if (newName) {
                this.renameScene(index, newName);
                this._hideModal('rename-modal');
            }
        };
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmBtn.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this._hideModal('rename-modal');
            }
        };
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
        input.focus();
    }

    renameScene(index, name) {
        if (this._state.scenes[index]) {
            this._state.scenes[index].name = name;
            this.renderSceneList();
            if (this._state.sceneIdx === index) {
                document.getElementById('current-scene-name').textContent = name;
            }
            this._bus.emit('project:autosave');
        }
    }

    deleteScene(idx) {
        const s = this._state;
        if (s.scenes.length <= 1) return;
        const cf = s.crossfade;

        if (cf.active) {
            const deletingCurrentScene = idx === s.sceneIdx;
            const deletingCrossfadeTarget = idx === cf.toIdx;

            if (deletingCurrentScene || deletingCrossfadeTarget) {
                this.cancelCrossfade({ silent: true });
            } else {
                if (idx < cf.fromIdx) cf.fromIdx--;
                if (idx < cf.toIdx) cf.toIdx--;
            }
        }

        if (idx === s.sceneIdx) {
            s.scenes.splice(idx, 1);
            s.sceneIdx = -1;
            const newIdx = Math.max(0, idx - 1);
            this.switchScene(newIdx);
            this._bus.emit('project:autosave');
        } else {
            s.scenes.splice(idx, 1);
            if (idx < s.sceneIdx) s.sceneIdx--;
            this.renderSceneList();
            this._bus.emit('project:autosave');
        }
    }

    switchScene(idx) {
        const s = this._state;
        if (idx < 0 || idx >= s.scenes.length) return;

        // If already crossfading, finalize immediately
        if (s.crossfade.active) {
            this._finalizeCrossfade();
        }
        if (idx === s.sceneIdx) return;

        // Reset auto scene timer on any manual/auto switch
        s.autoScene.lastSwitchBeat = this._getBeat();

        this.saveCurrentScene(false);   // save but defer autosave
        const cf = s.crossfade;
        const canCrossfade = cf.durationBeats > 0 && s.sceneIdx >= 0 && s.layers.length > 0;

        // If duration > 0 and we have current layers, do crossfade
        if (canCrossfade) {
            cf.active = true;
            cf.mix = 0;
            cf.fromIdx = s.sceneIdx;
            cf.toIdx = idx;
            cf.startBeat = this._getBeat();

            // Build scene B layers (off-screen, no UI)
            const sceneData = s.scenes[idx];
            const layerList = Array.isArray(sceneData.layers) ? sceneData.layers : [];
            cf.layersB = layerList.map(data => {
                return this._layerManager.buildLayerNoUI(data.key, data);
            }).filter(Boolean);
        } else {
            // Instant switch (no crossfade)
            this._instantSwitch(idx);
        }
    }

    cancelCrossfade(options = {}) {
        const silent = !!options.silent;
        const s = this._state;
        const cf = s.crossfade;
        if (!cf.active && cf.layersB.length === 0) return false;

        this._resetCrossfadeState({ disposeLayersB: true });
        if (s.sceneIdx >= 0 && s.scenes[s.sceneIdx]) {
            document.getElementById('current-scene-name').textContent = s.scenes[s.sceneIdx].name;
        }
        this.renderSceneList();
        if (!silent) {
            this._bus.emit('toast', { msg: 'Crossfade cancelled', type: 'info' });
        }
        return true;
    }

    _instantSwitch(idx) {
        const s = this._state;
        const prevIdx = s.sceneIdx;
        s.sceneIdx = idx;

        // Clear existing layers
        this._disposeLayers(s.layers);
        s.layers = [];
        document.getElementById('layer-stack').innerHTML = '';

        // Load scene
        const scene = s.scenes[idx];
        document.getElementById('current-scene-name').textContent = scene.name;
        this._updateSceneListActive(prevIdx, idx);

        // Build all layers without per-layer autosave
        const layerList = Array.isArray(scene.layers) ? scene.layers : [];
        layerList.forEach(data => {
            this._layerManager.addLayer(data.key, data, { skipSave: true });
        });

        this._bus.emit('scene:switched', { index: idx });
        // Deferred autosave after switch completes
        queueMicrotask(() => this._bus.emit('project:autosave'));
    }

    _finalizeCrossfade() {
        const s = this._state;
        const cf = s.crossfade;
        if (!cf.active) return;
        const targetIdx = cf.toIdx;
        if (targetIdx < 0 || targetIdx >= s.scenes.length) {
            this.cancelCrossfade({ silent: true });
            return;
        }
        const prevIdx = s.sceneIdx;
        const nextLayers = cf.layersB;

        // Dispose old scene A layers
        this._disposeLayers(s.layers);

        // Promote scene B layers to main
        s.layers = nextLayers;
        this._resetCrossfadeState({ disposeLayersB: false });
        s.sceneIdx = targetIdx;

        // Rebuild layer UI for new layers
        document.getElementById('layer-stack').innerHTML = '';
        const scene = s.scenes[s.sceneIdx];
        document.getElementById('current-scene-name').textContent = scene ? scene.name : '';
        this._updateSceneListActive(prevIdx, targetIdx);
        s.layers.forEach(l => {
            this._layerManager.renderLayerUI(l);
        });
        this._bus.emit('scene:switched', { index: s.sceneIdx });
        queueMicrotask(() => this._bus.emit('project:autosave'));
    }

    _disposeLayers(layers) {
        layers.forEach(l => {
            l.material.dispose();
            l.renderTarget.dispose();
            if (l.fbo) l.fbo.dispose();
        });
    }

    _resetCrossfadeState(options = {}) {
        const disposeLayersB = options.disposeLayersB !== false;
        const cf = this._state.crossfade;
        if (disposeLayersB && Array.isArray(cf.layersB) && cf.layersB.length > 0) {
            this._disposeLayers(cf.layersB);
        }
        cf.active = false;
        cf.mix = 0;
        cf.startBeat = 0;
        cf.fromIdx = -1;
        cf.toIdx = -1;
        cf.layersB = [];
    }

    _getBeat() {
        return this._bpmSync.getBeatState().beat;
    }

    saveCurrentScene(emitAutosave = true) {
        const s = this._state;
        if (s.sceneIdx < 0 || !s.scenes[s.sceneIdx]) return;
        s.scenes[s.sceneIdx].layers = s.layers.map(l => ({
            id: l.id,
            key: l.key,
            blend: l.blend,
            opacity: l.opacity,
            fragmentShader: l.fragmentShader,
            uniformsDef: JSON.parse(JSON.stringify(l.uniformsDef)),
            uniformValues: Object.keys(l.uniformsDef).reduce((acc, k) => {
                acc[k] = l.uniforms[k].value;
                return acc;
            }, {})
        }));
        if (emitAutosave) this._bus.emit('project:autosave');
    }

    renderSceneList() {
        const s = this._state;
        const list = document.getElementById('scene-list');
        list.innerHTML = '';

        s.scenes.forEach((sc, i) => {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-1 mb-1 group';

            const btn = document.createElement('button');
            btn.className = `flex-1 text-left px-3 py-2 text-[10px] rounded transition-colors font-mono truncate ${i === s.sceneIdx ? 'bg-purple-900/50 text-white border-l-2 border-purple-500' : 'text-slate-400 hover:bg-slate-800'}`;
            btn.textContent = sc.name;
            btn.onclick = () => this.switchScene(i);

            const editBtn = document.createElement('button');
            editBtn.className = 'text-slate-600 hover:text-blue-400 p-2 rounded hover:bg-slate-800 transition-colors opacity-0 group-hover:opacity-100';
            editBtn.textContent = '\u270E';
            editBtn.title = 'Rename Scene';
            editBtn.onclick = (e) => { e.stopPropagation(); this.openRenameModal(i); };

            const delBtn = document.createElement('button');
            delBtn.className = 'text-slate-600 hover:text-red-400 p-2 rounded hover:bg-slate-800 transition-colors opacity-0 group-hover:opacity-100';
            delBtn.textContent = '\u00D7';
            delBtn.title = 'Delete Scene';
            delBtn.onclick = (e) => { e.stopPropagation(); this.deleteScene(i); };

            if (s.scenes.length <= 1) {
                delBtn.disabled = true;
                delBtn.classList.add('hidden');
            }

            row.append(btn, editBtn, delBtn);
            list.appendChild(row);
        });
    }

    loadDefaultScene() {
        this.createScene();
        this._layerManager.addLayer('Crystal-KIFS');
    }

    /**
     * Lightweight scene-list update: only toggle active CSS classes.
     * Falls back to full rebuild if DOM is out of sync.
     */
    _updateSceneListActive(prevIdx, nextIdx) {
        const list = document.getElementById('scene-list');
        const rows = list ? list.children : [];
        if (rows.length !== this._state.scenes.length) {
            this.renderSceneList();
            return;
        }
        for (let i = 0; i < rows.length; i++) {
            const btn = rows[i].querySelector('button');
            if (!btn) { this.renderSceneList(); return; }
            if (i === nextIdx) {
                btn.className = btn.className
                    .replace('text-slate-400 hover:bg-slate-800', '')
                    .replace('bg-purple-900/50 text-white border-l-2 border-purple-500', '');
                btn.className += ' bg-purple-900/50 text-white border-l-2 border-purple-500';
            } else if (i === prevIdx) {
                btn.className = btn.className
                    .replace('bg-purple-900/50 text-white border-l-2 border-purple-500', '')
                    .replace('text-slate-400 hover:bg-slate-800', '');
                btn.className += ' text-slate-400 hover:bg-slate-800';
            }
        }
    }

    /** Check if a modal is open. */
    isModalOpen(id) {
        const el = document.getElementById(id);
        return !!(el && !el.classList.contains('hidden'));
    }

    /** Get modal show/hide functions for external use. */
    getModalHelpers() {
        return { showModal: this._showModal, hideModal: this._hideModal };
    }
}
