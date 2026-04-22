/**
 * MidiManager — WebMidi integration for VJ operation.
 *
 * Capabilities:
 *   - CC, Note On/Off, Program Change receive
 *   - MIDI Clock / Start / Stop receive (for BPM sync)
 *   - Per-device enable/disable (id-based)
 *   - MIDI Learn (captures next message → opens binding editor)
 *   - Legacy CC→uniform map (state.midi.map) kept for back-compat
 *   - MIDI Panic (clears held momentary, soloe, blackout)
 *   - Activity emit (for UI pulse / monitor)
 *
 * Events emitted:
 *   midi:cc              { cc, norm, channel }          (legacy + live)
 *   midi:note            { number, on, velocity, channel }
 *   midi:pc              { number, channel }
 *   midi:activity        { signature, type, number, channel, norm }
 *   midi:devices-changed { devices }
 *   midi:clock-tick      { bpm }                        (on estimated clock BPM update)
 *   midi:clock-start     {}
 *   midi:clock-stop      {}
 *   midi:learned         { binding }                    (when Learn completes to a binding)
 *   toast                { msg, type }
 *   project:autosave
 *   debug:error          { message, source }
 */

import {
    buildSignature,
    parseSignature,
    formatSignature,
    SIGNATURE_CHANNEL_OMNI
} from './midi-bindings.js';

const CLOCK_PPQN = 24; // MIDI Clock pulses per quarter note

export class MidiManager {
    /**
     * @param {import('../core/event-bus.js').EventBus} bus
     * @param {import('../core/app-state.js').AppState} state
     * @param {Object} deps - { bindings: MidiBindings }
     */
    constructor(bus, state, deps = {}) {
        this._bus = bus;
        this._state = state;
        this._bindings = deps.bindings || null;

        this._learnHighlightEl = null;
        this._learnResolver = null;   // Promise resolver for learn-next-message
    }

    /** Wire MidiBindings (set from main.js after construction). */
    setBindings(bindings) { this._bindings = bindings; }

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
        const listeners = ['controlchange', 'noteon', 'noteoff', 'programchange', 'clock', 'start', 'stop', 'continue'];
        WebMidi.inputs.forEach(i => {
            // Seed device record
            const rec = this._state.midi.devices[i.id] || { name: i.name, enabled: true };
            rec.name = i.name;
            rec.connected = true;
            this._state.midi.devices[i.id] = rec;
            listeners.forEach(ev => i.removeListener(ev));
            if (rec.enabled) {
                i.addListener('controlchange', (e) => this._handleCC(e));
                i.addListener('noteon', (e) => this._handleNote(e, true));
                i.addListener('noteoff', (e) => this._handleNote(e, false));
                i.addListener('programchange', (e) => this._handlePC(e));
                i.addListener('clock', () => this._handleClock());
                i.addListener('start', () => this._handleTransport('start'));
                i.addListener('stop', () => this._handleTransport('stop'));
                i.addListener('continue', () => this._handleTransport('continue'));
            }
        });
        // Mark disconnected devices
        Object.keys(this._state.midi.devices).forEach(id => {
            const present = WebMidi.inputs.some(i => i.id === id);
            if (!present) this._state.midi.devices[id].connected = false;
        });
        this._persistDevicePrefs();
        this._updateStatus(WebMidi.inputs.some(i => (this._state.midi.devices[i.id] || {}).enabled !== false));
        this._bus.emit('midi:devices-changed', { devices: this._state.midi.devices });
    }

    setDeviceEnabled(id, enabled) {
        const rec = this._state.midi.devices[id];
        if (!rec) return;
        rec.enabled = !!enabled;
        this._persistDevicePrefs();
        this._bindInputs();
    }

    _persistDevicePrefs() {
        try {
            const compact = {};
            Object.keys(this._state.midi.devices).forEach(id => {
                const d = this._state.midi.devices[id];
                compact[id] = { enabled: d.enabled !== false };
            });
            localStorage.setItem('vj_midi_devices', JSON.stringify(compact));
        } catch (e) { /* ignore quota */ }
    }

    _loadDevicePrefs() {
        try {
            const raw = localStorage.getItem('vj_midi_devices');
            if (!raw) return;
            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                Object.keys(data).forEach(id => {
                    const rec = this._state.midi.devices[id] || { name: id, enabled: data[id].enabled !== false };
                    rec.enabled = data[id].enabled !== false;
                    this._state.midi.devices[id] = rec;
                });
            }
        } catch (e) { /* ignore */ }
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

    _pulseActivity(signature, payload) {
        this._state.midi.activity = { signature, at: performance.now() };
        this._bus.emit('midi:activity', { signature, ...payload });
    }

    // ---------- Incoming message handlers ----------

    _handleCC(e) {
        const cc = e.controller.number;
        const channel = e.message ? e.message.channel : e.channel;
        const norm = this.normalizeMidiValue(e.value);
        const signature = buildSignature('cc', channel, cc);

        this._pulseActivity(signature, { type: 'cc', number: cc, channel, norm });
        this._bus.emit('midi:cc', { cc, norm, channel, signature });

        // If Learn is active, capture + resolve
        if (this._state.midi.learn.active) {
            this._completeLearn({ type: 'cc', number: cc, channel, signature });
            return;
        }

        // New binding system
        let handled = false;
        if (this._bindings) {
            handled = this._bindings.dispatch({ type: 'cc', channel, number: cc, norm, on: norm >= 0.5 });
        }

        // Legacy uniform map: still honored so existing projects keep working
        this._applyLegacyCCMap(cc, norm);
    }

    _handleNote(e, on) {
        const number = e.note ? e.note.number : e.data && e.data[1];
        if (!Number.isFinite(number)) return;
        const channel = e.message ? e.message.channel : e.channel;
        const velocity = on ? this.normalizeMidiValue(e.note && e.note.attack !== undefined ? e.note.attack : (e.velocity || 1)) : 0;
        const signature = buildSignature('note', channel, number);

        this._pulseActivity(signature, { type: 'note', number, channel, norm: velocity });
        this._bus.emit('midi:note', { number, on, velocity, channel, signature });

        if (this._state.midi.learn.active && on) {
            this._completeLearn({ type: 'note', number, channel, signature });
            return;
        }

        if (this._bindings) {
            this._bindings.dispatch({ type: 'note', channel, number, norm: velocity, on });
        }
    }

    _handlePC(e) {
        const number = e.value !== undefined ? e.value : (e.number !== undefined ? e.number : (e.data && e.data[1]));
        if (!Number.isFinite(number)) return;
        const channel = e.message ? e.message.channel : e.channel;
        const signature = buildSignature('pc', channel, number);

        this._pulseActivity(signature, { type: 'pc', number, channel, norm: 1 });
        this._bus.emit('midi:pc', { number, channel, signature });

        if (this._state.midi.learn.active) {
            this._completeLearn({ type: 'pc', number, channel, signature });
            return;
        }

        if (this._bindings) {
            this._bindings.dispatch({ type: 'pc', channel, number, norm: 1, on: true });
        }
    }

    _handleClock() {
        const s = this._state;
        if (!s.midi.clock.enabled) return;
        const now = performance.now();
        const c = s.midi.clock;
        if (c.lastPulseMs > 0) {
            const dt = now - c.lastPulseMs;
            if (dt > 0 && dt < 200) { // ignore obvious outliers
                c.pulseIntervals.push(dt);
                if (c.pulseIntervals.length > CLOCK_PPQN * 2) c.pulseIntervals.shift();
            }
        }
        c.lastPulseMs = now;

        // Estimate BPM from the last quarter-note worth of pulses
        if (c.pulseIntervals.length >= CLOCK_PPQN) {
            const recent = c.pulseIntervals.slice(-CLOCK_PPQN);
            const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
            const bpm = 60000 / (avg * CLOCK_PPQN);
            if (Number.isFinite(bpm) && bpm >= 40 && bpm <= 300) {
                // Only emit if BPM shifted by >= 0.1
                if (Math.abs((c.estimatedBpm || 0) - bpm) >= 0.1) {
                    c.estimatedBpm = bpm;
                    this._bus.emit('midi:clock-tick', { bpm });
                }
            }
        }
    }

    _handleTransport(kind) {
        const s = this._state;
        if (!s.midi.clock.enabled || s.midi.clock.ignoreTransport) return;
        s.midi.clock.running = kind !== 'stop';
        s.midi.clock.pulseIntervals = [];
        s.midi.clock.lastPulseMs = 0;
        if (kind === 'start') this._bus.emit('midi:clock-start', {});
        else if (kind === 'stop') this._bus.emit('midi:clock-stop', {});
    }

    // ---------- Legacy CC map (state.midi.map) ----------

    _applyLegacyCCMap(cc, norm) {
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
                    const slider = document.getElementById(`slider-${key}`);
                    if (slider) {
                        slider.value = v;
                        const valDisplay = slider.previousElementSibling && slider.previousElementSibling.lastElementChild;
                        if (valDisplay) valDisplay.textContent = v.toFixed(2);
                    }
                    changed = true;
                }
            }
        });
        if (changed) this._bus.emit('project:autosave');
    }

    // ---------- MIDI Learn ----------

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
            learn.targetBindingId = null;
            this._updateLearnButton(true);
            this._bus.emit('toast', { msg: 'MIDI Learn: click a slider OR press a MIDI key to capture', type: 'info' });
        }
    }

    cancelLearn() {
        const learn = this._state.midi.learn;
        learn.active = false;
        learn.targetMapKey = null;
        learn.targetBindingId = null;
        this._clearLearnHighlight();
        this._updateLearnButton(false);
        if (this._learnResolver) {
            this._learnResolver(null);
            this._learnResolver = null;
        }
    }

    /**
     * Arm learn mode and return a Promise that resolves to the next MIDI signature.
     * Used by the Config modal to bind any target.
     * @param {Object} opts - { description?: string }
     */
    armLearnOnce(opts = {}) {
        this.cancelLearn();
        const learn = this._state.midi.learn;
        learn.active = true;
        learn.targetMapKey = null;
        learn.targetBindingId = '__awaiting__';
        this._updateLearnButton(true);
        this._bus.emit('toast', {
            msg: opts.description ? `MIDI Learn: ${opts.description}` : 'MIDI Learn: move a control or press a key',
            type: 'info'
        });
        return new Promise(resolve => {
            this._learnResolver = resolve;
        });
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

        const slider = document.getElementById(`slider-${mapKey}`);
        if (slider) {
            slider.classList.add('midi-learn-target');
            this._learnHighlightEl = slider;
        }

        const label = this.getMidiBindingLabel(mapKey);
        this._bus.emit('toast', { msg: `Waiting for MIDI → ${label}`, type: 'info' });
    }

    _completeLearn(captured) {
        const learn = this._state.midi.learn;

        // Generic learn path (from Config modal via armLearnOnce)
        if (this._learnResolver) {
            const resolve = this._learnResolver;
            this._learnResolver = null;
            this.cancelLearn();
            resolve(captured);
            return;
        }

        // Slider-learn path (legacy CC→uniform map path + auto-create binding if Note/PC)
        const mapKey = learn.targetMapKey;
        if (!mapKey) {
            this.cancelLearn();
            return;
        }

        // If capture is CC: use legacy map for continuous uniform control
        if (captured.type === 'cc') {
            const existingKey = this.findMapKeyByCC(captured.number);
            if (existingKey && existingKey !== mapKey) {
                const existingLabel = this.getMidiBindingLabel(existingKey);
                delete this._state.midi.map[existingKey];
                const oldInput = document.querySelector(`input[data-map-key="${existingKey}"]`);
                if (oldInput) oldInput.value = '';
                this._bus.emit('toast', { msg: `CC ${captured.number} reassigned from ${existingLabel}`, type: 'info' });
            }
            this._state.midi.map[mapKey] = captured.number;
            const ccInput = document.querySelector(`input[data-map-key="${mapKey}"]`);
            if (ccInput) ccInput.value = captured.number;

            const label = this.getMidiBindingLabel(mapKey);
            this._bus.emit('toast', { msg: `CC ${captured.number} → ${label}`, type: 'success' });
            this._bus.emit('project:autosave');
        } else {
            // Note / PC → auto-create a uniform.set binding (cannot trigger a uniform though)
            // For now, emit advisory toast and skip — users pick the action in Config modal for non-CC.
            const parsed = this.parseMidiMapKey(mapKey);
            if (parsed && this._bindings) {
                // We can't sensibly map Note/PC to continuous uniform; tell the user.
                this._bus.emit('toast', {
                    msg: `Note/PC cannot drive a continuous uniform. Use MIDI Config for action mappings.`,
                    type: 'info'
                });
            }
        }

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

    // ---------- Panic ----------

    /** Release all momentary, clear solo, turn off blackout, cancel Learn. */
    panic() {
        this.cancelLearn();
        if (this._bindings) this._bindings.releaseAllMomentary();
        this._state.soloLayerId = null;
        this._state.blackout = false;
        this._bus.emit('layer:solo', { layerId: null, source: 'panic' });
        this._bus.emit('app:blackout', { active: false, source: 'panic' });
        this._bus.emit('toast', { msg: 'MIDI Panic: state cleared', type: 'info' });
    }

    // ---------- Utility ----------

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
        if (this._bindings) this._bindings.removeForLayer(layer.id);
    }

    // ---------- Hooks for simulation (used by tests / console) ----------

    _emulateCC(ch, cc, val01) {
        this._handleCC({ controller: { number: cc }, message: { channel: ch }, value: val01 });
    }
    _emulateNote(ch, num, on, vel = 1) {
        this._handleNote({ note: { number: num, attack: vel }, message: { channel: ch } }, !!on);
    }
    _emulatePC(ch, num) {
        this._handlePC({ value: num, message: { channel: ch } });
    }
}

export { buildSignature, parseSignature, formatSignature, SIGNATURE_CHANNEL_OMNI };
