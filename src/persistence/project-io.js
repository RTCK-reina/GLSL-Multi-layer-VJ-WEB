import { migrateProject } from './project-migrator.js';

/**
 * ProjectIO — Export, import, auto-save, restore, and undo/redo.
 *
 * Composes project payload from multiple module states
 * and handles file I/O and localStorage persistence.
 * Integrates UndoManager for snapshot-based undo/redo.
 *
 * Events emitted:
 *   toast               { msg, type }
 *   project:loaded       { source }
 *   project:autosave     (to trigger save queue)
 *
 * Events consumed:
 *   project:autosave     (triggers debounced save)
 *   scene:save          (legacy alias for autosave)
 */
export class ProjectIO {
    /**
     * @param {import('../core/event-bus.js').EventBus} bus
     * @param {import('../core/app-state.js').AppState} state
     * @param {Object} deps - { bpmSync, midiManager, sceneManager, undoManager }
     */
    constructor(bus, state, deps) {
        this._bus = bus;
        this._state = state;
        this._bpmSync = deps.bpmSync;
        this._midiManager = deps.midiManager;
        this._sceneManager = deps.sceneManager;
        this._undoManager = deps.undoManager;

        this._saveTimer = null;
        this._storageKey = state.projectStorageKey;

        // Listen for autosave requests
        bus.on('project:autosave', () => this.queueAutoSave());
        bus.on('scene:save', () => this.queueAutoSave());
    }

    buildProjectPayload() {
        return {
            version: '1.0',
            savedAt: new Date().toISOString(),
            scenes: this._state.scenes,
            midi: { map: this._state.midi.map },
            sync: this._bpmSync.serializeSyncState(),
            crossfade: { durationBeats: this._state.crossfade.durationBeats }
        };
    }

    serializeProjectPayload() {
        return JSON.stringify(this.buildProjectPayload());
    }

    exportProject() {
        this._sceneManager.saveCurrentScene(false);
        const data = JSON.stringify(this.buildProjectPayload(), null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vj_project_${Date.now()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /**
     * Load project from parsed JSON.
     * @param {Object} data
     * @param {Object} options - { source, toastSuccess }
     * @returns {boolean}
     */
    loadProjectData(data, options = {}) {
        const source = options.source || 'file';
        const toastSuccess = !!options.toastSuccess;
        const normalizedData = Array.isArray(data) ? data : migrateProject(data);

        let incomingScenes = null;
        let incomingMap = {};
        let incomingSync = null;
        let incomingCrossfade = null;

        if (Array.isArray(normalizedData)) {
            incomingScenes = normalizedData;
        } else if (normalizedData && Array.isArray(normalizedData.scenes)) {
            incomingScenes = normalizedData.scenes;
            incomingMap = (normalizedData.midi && normalizedData.midi.map) ? normalizedData.midi.map : {};
            incomingSync = normalizedData.sync && typeof normalizedData.sync === 'object' ? normalizedData.sync : null;
            incomingCrossfade = normalizedData.crossfade && typeof normalizedData.crossfade === 'object' ? normalizedData.crossfade : null;
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
                if (!layerData.key || !window.SHADERS[layerData.key]) {
                    skippedLayers++;
                    return;
                }

                const shaderDef = window.SHADERS[layerData.key];
                const blendRaw = Number(layerData.blend);
                const opacityRaw = Number(layerData.opacity);
                layers.push({
                    id: (typeof layerData.id === 'string' && layerData.id) ? layerData.id : this._sceneManager.generateLayerId(),
                    key: layerData.key,
                    blend: Number.isFinite(blendRaw) ? Math.max(0, Math.min(9, Math.round(blendRaw))) : 0,
                    opacity: Number.isFinite(opacityRaw) ? Math.max(0, Math.min(1, opacityRaw)) : 1,
                    fragmentShader: typeof layerData.fragmentShader === 'string' ? layerData.fragmentShader : shaderDef.fragmentShader,
                    uniformsDef: this._sceneManager.sanitizeUniformsDef(layerData.uniformsDef, shaderDef.uniforms),
                    uniformValues: (layerData.uniformValues && typeof layerData.uniformValues === 'object' && !Array.isArray(layerData.uniformValues))
                        ? layerData.uniformValues
                        : {}
                });
            });

            scenes.push({ name: sceneName, layers });
        });

        if (scenes.length === 0) scenes.push({ name: 'Scene 1', layers: [] });

        this._sceneManager.cancelCrossfade({ silent: true });
        this._state.scenes = scenes;
        this._state.midi.map = this._midiManager.normalizeMidiMapKeys(incomingMap);

        if (incomingSync) this._bpmSync.applySyncState(incomingSync);
        else this._bpmSync.refreshBpmUI();

        if (incomingCrossfade) {
            const dur = parseFloat(
                incomingCrossfade.durationBeats ?? incomingCrossfade.duration
            );
            if (Number.isFinite(dur) && dur >= 0) {
                this._state.crossfade.durationBeats = dur;
                const cfSelect = document.getElementById('crossfade-duration');
                if (cfSelect) cfSelect.value = String(dur);
            }
        }

        this._state.sceneIdx = -1;
        this._sceneManager.renderSceneList();
        this._sceneManager.switchScene(0);
        if (!this._undoManager.restoring) {
            const json = this.serializeProjectPayload();
            localStorage.setItem(this._storageKey, json);
            this._undoManager.reset(json);
        }

        if (toastSuccess) this._bus.emit('toast', { msg: 'Project Loaded Successfully!', type: 'success' });
        if (skippedLayers > 0) {
            this._bus.emit('toast', { msg: `${skippedLayers} layer(s) skipped due to invalid shader data`, type: 'info' });
        }
        if (source === 'autosave') {
            this._bus.emit('toast', { msg: 'Auto-saved project restored', type: 'info' });
        }
        return true;
    }

    queueAutoSave() {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this.persistToStorage(), 200);
    }

    persistToStorage() {
        try {
            this._sceneManager.saveCurrentScene(false);
            const json = this.serializeProjectPayload();
            localStorage.setItem(this._storageKey, json);
            this._undoManager.commit(json);
            this._state.storageErrorShown = false;
            return true;
        } catch (err) {
            console.error('Failed to auto-save project', err);
            if (!this._state.storageErrorShown) {
                this._state.storageErrorShown = true;
                this._bus.emit('toast', { msg: 'Auto-save failed: local storage is full or blocked', type: 'error' });
            }
            return false;
        }
    }

    /**
     * Undo to previous committed state.
     * @returns {boolean} true if undo was applied
     */
    undo() {
        const snapshot = this._undoManager.undo();
        if (!snapshot) return false;
        try {
            this._undoManager.restoring = true;
            const data = JSON.parse(snapshot);
            this.loadProjectData(data, { source: 'undo', toastSuccess: false });
            localStorage.setItem(this._storageKey, snapshot);
            return true;
        } catch (e) {
            console.error('Undo failed:', e);
            return false;
        } finally {
            this._undoManager.restoring = false;
        }
    }

    /**
     * Redo to next committed state.
     * @returns {boolean} true if redo was applied
     */
    redo() {
        const snapshot = this._undoManager.redo();
        if (!snapshot) return false;
        try {
            this._undoManager.restoring = true;
            const data = JSON.parse(snapshot);
            this.loadProjectData(data, { source: 'redo', toastSuccess: false });
            localStorage.setItem(this._storageKey, snapshot);
            return true;
        } catch (e) {
            console.error('Redo failed:', e);
            return false;
        } finally {
            this._undoManager.restoring = false;
        }
    }

    get canUndo() { return this._undoManager.canUndo; }
    get canRedo() { return this._undoManager.canRedo; }

    restoreFromStorage() {
        const raw = localStorage.getItem(this._storageKey);
        if (!raw) return false;
        try {
            const data = JSON.parse(raw);
            return this.loadProjectData(data, { source: 'autosave', toastSuccess: false });
        } catch (err) {
            console.error('Failed to restore auto-saved project', err);
            localStorage.removeItem(this._storageKey);
            return false;
        }
    }

    /** Setup import button file handler. */
    initImportUI() {
        const fileInput = document.getElementById('file-input');
        document.getElementById('import-btn').onclick = () => fileInput.click();
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (!this.loadProjectData(data, { source: 'file', toastSuccess: true })) {
                        this._bus.emit('toast', { msg: 'Invalid Project File', type: 'error' });
                    }
                } catch (err) {
                    console.error(err);
                    this._bus.emit('toast', { msg: 'Failed to load file', type: 'error' });
                } finally {
                    fileInput.value = '';
                }
            };
            reader.readAsText(file);
        };
        document.getElementById('export-btn').onclick = () => this.exportProject();
    }
}
