/**
 * MidiManager — WebMidi integration for CC mapping + MIDI Learn.
 *
 * Handles device connect/disconnect, CC message routing,
 * MIDI map normalization, conflict detection, and learn mode.
 *
 * Events emitted:
 *   midi:cc          { cc, norm }
 *   toast            { msg, type }
 *   project:autosave (queued after CC changes slider / mapping)
 *   debug:error      { message, source }
 *
 * Events consumed:
 *   (none — driven by WebMidi callbacks + DOM events)
 */
export class MidiManager {
    /**
     * @param {import('../core/event-bus.js').EventBus} bus
     * @param {import('../core/app-state.js').AppState} state
     */
    constructor(bus, state) {
        this._bus = bus;
        this._state = state;
        this._learnHighlightEl = null;
    }

    /** Initialize WebMidi and bind inputs. */
    init() {
        if (!window.WebMidi) {
            this._updateStatus(false);
            return;
        }
        WebMidi.enable().then(() => {
            this._bindInputs();
            WebMidi.addListener('connected', (e) => {
                if (e.port && e.port.type === 'input') this._bindInputs();
            });
            WebMidi.addListener('disconnected', (e) => {
                if (e.port && e.port.type === 'input') this._bindInputs();
            });
        }).catch((err) => {
            console.log('MIDI Access Refused or Not Available:', err);
            this._bus.emit('debug:error', { message: err, source: 'midi' });
            const dot = document.getElementById('midi-status-dot');
            const text = document.getElementById('midi-status-text');
            if (dot) {
                dot.classList.remove('bg-green-500');
                dot.classList.add('bg-slate-700');
            }
            if (text) text.textContent = 'MIDI DISABLED';
        });
    }

    _bindInputs() {
        WebMidi.inputs.forEach(i => i.removeListener('controlchange'));
        WebMidi.inputs.forEach(i => i.addListener('controlchange', (e) => this._handleCC(e)));
        this._updateStatus(WebMidi.inputs.length > 0);
    }

    _updateStatus(active) {
        const dot = document.getElementById('midi-status-dot');
        const text = document.getElementById('midi-status-text');
        if (active) {
            if (dot) { dot.classList.remove('bg-slate-700'); dot.classList.add('bg-green-500'); }
            if (text) text.textContent = 'MIDI ACTIVE';
        } else {
            if (dot) { dot.classList.remove('bg-green-500'); dot.classList.add('bg-slate-700'); }
            if (text) text.textContent = 'NO MIDI';
        }
    }

    _handleCC(e) {
        const cc = e.controller.number;
        const norm = this.normalizeMidiValue(e.value);

        // Emit raw CC
        this._bus.emit('midi:cc', { cc, norm });

        // MIDI Learn: if active and we have a target, capture this CC
        const learn = this._state.midi.learn;
        if (learn.active && learn.targetMapKey) {
            this._completeMidiLearn(cc);
            return;
        }

        // Route to mapped uniforms
        let changed = false;
        const s = this._state;
        Object.keys(s.midi.map).forEach(key => {
            if (parseInt(s.midi.map[key], 10) === cc) {
                const parsed = this.parseMidiMapKey(key);
                if (!parsed) return;
                const layer = s.layers.find(l => l.id === parsed.layerId);
                if (layer && layer.uniformsDef[parsed.uKey] && layer.uniforms[parsed.uKey]) {
                    const def = layer.uniformsDef[parsed.uKey];
                    const v = def.min + norm * (def.max - def.min);
                    layer.uniforms[parsed.uKey].value = v;
                    // Update slider UI
                    const slider = document.getElementById(`slider-${key}`);
                    if (slider) {
                        slider.value = v;
                        slider.previousElementSibling.lastElementChild.textContent = v.toFixed(2);
                    }
                    changed = true;
                }
            }
        });

        if (changed) this._bus.emit('project:autosave');
    }

    // --- MIDI Learn ---

    initLearnUI() {
        const btn = document.getElementById('midi-learn-btn');
        if (!btn) return;
        btn.onclick = () => this.toggleLearn();
    }

    toggleLearn() {
        const learn = this._state.midi.learn;
        if (learn.active) {
            this.cancelLearn();
        } else {
            learn.active = true;
            learn.targetMapKey = null;
            this._updateLearnButton(true);
            this._bus.emit('toast', { msg: 'MIDI Learn: click a parameter slider, then move a MIDI knob', type: 'info' });
        }
    }

    cancelLearn() {
        const learn = this._state.midi.learn;
        learn.active = false;
        learn.targetMapKey = null;
        this._clearLearnHighlight();
        this._updateLearnButton(false);
    }

    /**
     * Called from LayerManager when a slider area is clicked during learn mode.
     * @param {string} mapKey - e.g. "L_abc::u_speed"
     */
    setLearnTarget(mapKey) {
        const learn = this._state.midi.learn;
        if (!learn.active) return;
        learn.targetMapKey = mapKey;
        this._clearLearnHighlight();

        // Highlight the target slider
        const slider = document.getElementById(`slider-${mapKey}`);
        if (slider) {
            slider.classList.add('midi-learn-target');
            this._learnHighlightEl = slider;
        }

        const label = this.getMidiBindingLabel(mapKey);
        this._bus.emit('toast', { msg: `Waiting for MIDI CC → ${label}`, type: 'info' });
    }

    _completeMidiLearn(cc) {
        const learn = this._state.midi.learn;
        const mapKey = learn.targetMapKey;

        // Check for conflict
        const existingKey = this.findMapKeyByCC(cc);
        if (existingKey && existingKey !== mapKey) {
            const existingLabel = this.getMidiBindingLabel(existingKey);
            delete this._state.midi.map[existingKey];
            // Clear the old CC input
            const oldInput = document.querySelector(`input[data-map-key="${existingKey}"]`);
            if (oldInput) oldInput.value = '';
            this._bus.emit('toast', { msg: `CC ${cc} reassigned from ${existingLabel}`, type: 'info' });
        }

        // Apply mapping
        this._state.midi.map[mapKey] = cc;

        // Update the CC input in the UI
        const ccInput = document.querySelector(`input[data-map-key="${mapKey}"]`);
        if (ccInput) ccInput.value = cc;

        const label = this.getMidiBindingLabel(mapKey);
        this._bus.emit('toast', { msg: `CC ${cc} → ${label}`, type: 'success' });
        this._bus.emit('project:autosave');

        // Exit learn mode
        this.cancelLearn();
    }

    _updateLearnButton(active) {
        const btn = document.getElementById('midi-learn-btn');
        if (!btn) return;
        if (active) {
            btn.classList.remove('bg-slate-900', 'text-slate-500', 'border-slate-700');
            btn.classList.add('bg-purple-900', 'text-purple-300', 'border-purple-500', 'animate-pulse');
        } else {
            btn.classList.remove('bg-purple-900', 'text-purple-300', 'border-purple-500', 'animate-pulse');
            btn.classList.add('bg-slate-900', 'text-slate-500', 'border-slate-700');
        }
    }

    _clearLearnHighlight() {
        if (this._learnHighlightEl) {
            this._learnHighlightEl.classList.remove('midi-learn-target');
            this._learnHighlightEl = null;
        }
    }

    // --- Utility methods ---

    normalizeMidiValue(raw) {
        if (typeof raw !== 'number' || isNaN(raw)) return 0;
        if (raw <= 1) return Math.max(0, Math.min(raw, 1));
        if (raw <= 127) return raw / 127;
        return Math.min(raw / 16383, 1);
    }

    parseMidiMapKey(key) {
        if (key.includes('::')) {
            const idx = key.indexOf('::');
            return { layerId: key.slice(0, idx), uKey: key.slice(idx + 2) };
        }
        const legacyIdx = key.indexOf('_u_');
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
        Object.keys(this._state.midi.map).forEach(k => {
            if (parseInt(this._state.midi.map[k], 10) === n) found = k;
        });
        return found;
    }

    getMidiBindingLabel(mapKey) {
        const parsed = this.parseMidiMapKey(mapKey);
        if (!parsed) return mapKey;
        const layer = this._state.layers.find(l => l.id === parsed.layerId);
        const layerName = layer ? layer.name : parsed.layerId;
        return `${layerName} / ${parsed.uKey.replace('u_', '')}`;
    }

    cleanupMidiForLayer(layer) {
        Object.keys(this._state.midi.map).forEach(k => {
            if (k.startsWith(`${layer.id}::`) || k.startsWith(`${layer.id}_`)) {
                delete this._state.midi.map[k];
            }
        });
    }
}
