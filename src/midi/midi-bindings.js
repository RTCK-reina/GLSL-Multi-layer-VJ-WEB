/**
 * MidiBindings — data layer + dispatcher for MIDI action bindings.
 *
 * Bindings are stored in state.midi.bindings (plain array).
 * Each binding:
 *   {
 *     id:        'B_abc123',
 *     signature: 'cc|1|74' | 'note|1|36' | 'pc|1|5',
 *     action: {
 *       type: 'scene.recall' | 'layer.mute' | ...,
 *       target: { sceneIdx?, layerId?, layerIdx?, uKey? },
 *       behavior: 'trigger'|'toggle'|'momentary' | null (cc),
 *       invert:   boolean
 *     },
 *     label?: string
 *   }
 *
 * Events emitted (via EventBus):
 *   scene:recall    { index }
 *   scene:step      { delta }            (+1 / -1)
 *   layer:mute      { layerId, value, source }
 *   layer:solo      { layerId, source }
 *   layer:select    { layerId, source }
 *   layer:opacity   { layerId, value, source }
 *   layer:blend-step{ layerId, delta }
 *   uniform:set     { layerId, uKey, norm, source }
 *   crossfade:mix   { mix }              (manual override)
 *   bpm:tap         {}
 *   app:blackout    { active }
 *   app:panic       {}
 *   performance:guard-toggle {}
 *   performance:profile-step { delta }
 *   project:autosave (when state changes via dispatch)
 */

export const SIGNATURE_CHANNEL_OMNI = 0;

export function buildSignature(type, channel, number) {
    const ch = Number.isFinite(channel) && channel >= 1 && channel <= 16 ? channel : SIGNATURE_CHANNEL_OMNI;
    return `${type}|${ch}|${number}`;
}

export function parseSignature(sig) {
    if (typeof sig !== 'string') return null;
    const parts = sig.split('|');
    if (parts.length !== 3) return null;
    const [type, chStr, numStr] = parts;
    if (!['cc', 'note', 'pc'].includes(type)) return null;
    const channel = parseInt(chStr, 10);
    const number = parseInt(numStr, 10);
    if (!Number.isFinite(channel) || !Number.isFinite(number)) return null;
    return { type, channel, number };
}

export function formatSignature(sig) {
    const p = parseSignature(sig);
    if (!p) return sig;
    const ch = p.channel === SIGNATURE_CHANNEL_OMNI ? 'omni' : `Ch${p.channel}`;
    const label = p.type === 'cc' ? `CC${p.number}`
        : p.type === 'note' ? `Note ${noteName(p.number)}`
        : `PC${p.number}`;
    return `${label} (${ch})`;
}

function noteName(n) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(n / 12) - 1;
    return `${names[n % 12]}${octave}`;
}

/** Signature matches if channel is equal OR either side is omni. */
function matchesSignature(storedSig, incoming) {
    const parsed = parseSignature(storedSig);
    if (!parsed) return false;
    if (parsed.type !== incoming.type) return false;
    if (parsed.number !== incoming.number) return false;
    if (parsed.channel === SIGNATURE_CHANNEL_OMNI) return true;
    if (incoming.channel === SIGNATURE_CHANNEL_OMNI) return true;
    return parsed.channel === incoming.channel;
}

export class MidiBindings {
    /**
     * @param {import('../core/event-bus.js').EventBus} bus
     * @param {import('../core/app-state.js').AppState} state
     */
    constructor(bus, state) {
        this._bus = bus;
        this._state = state;
        this._bindingIdCounter = 0;
        // Track momentary note-held layer states for auto-release
        // { bindingId: prevValue }
        this._momentaryHeld = {};
    }

    generateBindingId() {
        const n = this._bindingIdCounter++;
        const rand = Math.random().toString(36).slice(2, 6);
        return `B_${Date.now().toString(36)}_${n.toString(36)}_${rand}`;
    }

    /** Add or replace a binding. Returns the binding. */
    upsert(binding) {
        if (!binding || !binding.signature || !binding.action) return null;
        if (!binding.id) binding.id = this.generateBindingId();
        const list = this._state.midi.bindings;
        const idx = list.findIndex(b => b.id === binding.id);
        if (idx >= 0) list[idx] = binding;
        else list.push(binding);
        return binding;
    }

    remove(id) {
        const s = this._state;
        s.midi.bindings = s.midi.bindings.filter(b => b.id !== id);
    }

    removeForLayer(layerId) {
        const s = this._state;
        s.midi.bindings = s.midi.bindings.filter(b => {
            const t = b.action && b.action.target;
            if (!t) return true;
            return t.layerId !== layerId;
        });
    }

    findBySignature(incoming) {
        return this._state.midi.bindings.filter(b => matchesSignature(b.signature, incoming));
    }

    /**
     * Resolve a layer reference in binding target.
     * Returns the live layer object or null.
     */
    resolveLayer(target) {
        if (!target) return null;
        const s = this._state;
        if (target.layerId) {
            const l = s.layers.find(x => x.id === target.layerId);
            if (l) return l;
        }
        if (Number.isFinite(target.layerIdx)) {
            const l = s.layers[target.layerIdx];
            if (l) return l;
        }
        return null;
    }

    /**
     * Dispatch an incoming MIDI message to all matching bindings.
     * @param {Object} incoming - { type, channel, number, raw, norm, on }
     *   norm: 0..1 (cc value or velocity)
     *   on:   boolean (note on / off)
     */
    dispatch(incoming) {
        const matches = this.findBySignature(incoming);
        if (matches.length === 0) return false;
        let anyChanged = false;
        matches.forEach(b => {
            if (this._runBinding(b, incoming)) anyChanged = true;
        });
        if (anyChanged) this._bus.emit('project:autosave');
        return matches.length > 0;
    }

    _runBinding(binding, incoming) {
        const action = binding.action;
        if (!action) return false;
        const t = action.type;
        const target = action.target || {};
        const behavior = action.behavior || 'trigger';

        // Resolve trigger / continuous semantics by incoming type:
        //   CC  → continuous (norm 0..1). For action.toggle use mid-threshold.
        //   Note→ on/off edge triggered
        //   PC  → always trigger on receive

        // Invert flips norm
        const norm = action.invert ? (1 - incoming.norm) : incoming.norm;

        // Edge: did we just go "on"?
        let edgeOn = false;
        let edgeOff = false;
        if (incoming.type === 'note') {
            edgeOn = !!incoming.on;
            edgeOff = !incoming.on;
        } else if (incoming.type === 'pc') {
            edgeOn = true;
        } else {
            // cc: treat >= 64 as on, < 64 as off for button-like actions
            const prevKey = `${binding.id}:last`;
            const prev = this._momentaryHeld[prevKey] || 0;
            if (norm >= 0.5 && prev < 0.5) edgeOn = true;
            if (norm < 0.5 && prev >= 0.5) edgeOff = true;
            this._momentaryHeld[prevKey] = norm;
        }

        switch (t) {
            case 'scene.recall': {
                if (!edgeOn) return false;
                const idx = Number.isFinite(target.sceneIdx) ? target.sceneIdx
                    : (incoming.type === 'pc' ? incoming.number : null);
                if (idx == null) return false;
                this._bus.emit('scene:recall', { index: idx });
                return true;
            }
            case 'scene.next':
                if (edgeOn) { this._bus.emit('scene:step', { delta: 1 }); return true; }
                return false;
            case 'scene.prev':
                if (edgeOn) { this._bus.emit('scene:step', { delta: -1 }); return true; }
                return false;
            case 'layer.mute': {
                const layer = this.resolveLayer(target);
                if (!layer) return false;
                if (behavior === 'momentary') {
                    if (edgeOn) {
                        this._momentaryHeld[binding.id] = layer.muted === true;
                        this._bus.emit('layer:mute', { layerId: layer.id, value: true, source: 'midi' });
                        return true;
                    } else if (edgeOff) {
                        const restore = this._momentaryHeld[binding.id];
                        this._bus.emit('layer:mute', { layerId: layer.id, value: !!restore, source: 'midi' });
                        delete this._momentaryHeld[binding.id];
                        return true;
                    }
                    return false;
                }
                // Toggle / Trigger: flip on edgeOn
                if (edgeOn) {
                    this._bus.emit('layer:mute', { layerId: layer.id, value: !layer.muted, source: 'midi' });
                    return true;
                }
                return false;
            }
            case 'layer.solo': {
                const layer = this.resolveLayer(target);
                if (!layer) return false;
                if (edgeOn) {
                    this._bus.emit('layer:solo', { layerId: layer.id, source: 'midi' });
                    return true;
                }
                return false;
            }
            case 'layer.select': {
                const layer = this.resolveLayer(target);
                if (!layer) return false;
                if (edgeOn) {
                    this._bus.emit('layer:select', { layerId: layer.id, source: 'midi' });
                    return true;
                }
                return false;
            }
            case 'layer.opacity': {
                const layer = this.resolveLayer(target);
                if (!layer) return false;
                this._bus.emit('layer:opacity', { layerId: layer.id, value: norm, source: 'midi' });
                return true;
            }
            case 'layer.blend.next': {
                const layer = this.resolveLayer(target);
                if (!layer) return false;
                if (edgeOn) {
                    this._bus.emit('layer:blend-step', { layerId: layer.id, delta: 1 });
                    return true;
                }
                return false;
            }
            case 'uniform.set': {
                const layer = this.resolveLayer(target);
                if (!layer || !target.uKey) return false;
                this._bus.emit('uniform:set', { layerId: layer.id, uKey: target.uKey, norm, source: 'midi' });
                return true;
            }
            case 'crossfade.mix': {
                this._bus.emit('crossfade:mix', { mix: norm });
                return true;
            }
            case 'bpm.tap':
                if (edgeOn) { this._bus.emit('bpm:tap', {}); return true; }
                return false;
            case 'app.blackout': {
                if (behavior === 'momentary') {
                    if (edgeOn) { this._bus.emit('app:blackout', { active: true, source: 'midi' }); return true; }
                    if (edgeOff) { this._bus.emit('app:blackout', { active: false, source: 'midi' }); return true; }
                    return false;
                }
                if (edgeOn) {
                    this._bus.emit('app:blackout', { active: !this._state.blackout, source: 'midi' });
                    return true;
                }
                return false;
            }
            case 'app.panic':
                if (edgeOn) { this._bus.emit('app:panic', {}); return true; }
                return false;
            case 'performance.guard.toggle':
                if (edgeOn) { this._bus.emit('performance:guard-toggle', {}); return true; }
                return false;
            case 'performance.profile.next':
                if (edgeOn) { this._bus.emit('performance:profile-step', { delta: 1 }); return true; }
                return false;
            default:
                return false;
        }
    }

    /** Release any held momentary bindings (used by Panic). */
    releaseAllMomentary() {
        this._momentaryHeld = {};
    }
}
