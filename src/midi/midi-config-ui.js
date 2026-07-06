/**
 * MidiConfigUI — binds DOM for the MIDI Configuration modal.
 *
 * Tabs: Mappings, Devices, Clock/Sync, Global Actions.
 */
import { MIDI_ACTIONS, getActionMeta, actionSupports } from './midi-actions.js';
import { buildSignature, parseSignature, formatSignature, SIGNATURE_CHANNEL_OMNI } from './midi-bindings.js';

const MONITOR_MAX_LINES = 40;

export class MidiConfigUI {
    /**
     * @param {import('../core/event-bus.js').EventBus} bus
     * @param {import('../core/app-state.js').AppState} state
     * @param {Object} deps - { midiManager, bindings }
     */
    constructor(bus, state, deps) {
        this._bus = bus;
        this._state = state;
        this._midiManager = deps.midiManager;
        this._bindings = deps.bindings;

        this._monitorLines = [];
        this._activePulseTimer = null;
        this._editor = null; // current editor state { binding, isNew }
    }

    initUI() {
        const open = () => this.open();
        const cfgBtn = document.getElementById('midi-config-btn');
        if (cfgBtn) cfgBtn.onclick = open;

        document.getElementById('midi-modal-close').onclick = () => this.close();

        document.querySelectorAll('.midi-tab').forEach(tab => {
            tab.onclick = () => this._setTab(tab.dataset.tab);
        });

        // Mappings tab actions
        document.getElementById('midi-add-mapping-btn').onclick = () => this._openEditor(null, { manualSignature: true });
        document.getElementById('midi-learn-any-btn').onclick = () => this._addByLearn();
        document.getElementById('midi-mappings-filter').onchange = () => this._renderMappings();

        // Binding editor modal
        document.getElementById('mbe-cancel').onclick = () => this._closeEditor();
        document.getElementById('mbe-save').onclick = () => this._saveEditor();
        document.getElementById('mbe-learn-btn').onclick = () => this._editorLearn();
        document.getElementById('mbe-action').onchange = () => this._refreshEditorTarget();

        // Populate action <select>
        const actionSel = document.getElementById('mbe-action');
        actionSel.innerHTML = '';
        Object.keys(MIDI_ACTIONS).forEach(k => {
            const meta = MIDI_ACTIONS[k];
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = `[${meta.category}] ${meta.label}`;
            actionSel.appendChild(opt);
        });

        // Devices
        this._bus.on('midi:devices-changed', () => this._renderDevices());

        // Clock tab
        const clockEnable = document.getElementById('midi-clock-enable');
        const clockIgnore = document.getElementById('midi-clock-ignore-transport');
        clockEnable.onchange = (e) => {
            this._state.midi.clock.enabled = !!e.target.checked;
            this._bus.emit('project:autosave');
            this._renderClockStatus();
        };
        clockIgnore.onchange = (e) => {
            this._state.midi.clock.ignoreTransport = !!e.target.checked;
            this._bus.emit('project:autosave');
        };
        this._bus.on('midi:clock-tick', () => this._renderClockStatus());
        this._bus.on('midi:clock-start', () => this._renderClockStatus());
        this._bus.on('midi:clock-stop', () => this._renderClockStatus());

        // Global tab
        document.getElementById('midi-panic-btn').onclick = () => this._midiManager.panic();
        document.getElementById('midi-clear-bindings-btn').onclick = () => {
            if (!confirm('Clear ALL bindings? This cannot be undone.')) return;
            this._state.midi.bindings = [];
            this._bus.emit('project:autosave');
            this._renderMappings();
        };
        document.getElementById('midi-export-bindings-btn').onclick = () => this._exportBindings();
        document.getElementById('midi-import-bindings').onchange = (e) => this._importBindings(e);

        // Activity monitor
        this._bus.on('midi:activity', (data) => this._onActivity(data));
    }

    open() {
        const m = document.getElementById('midi-modal');
        m.classList.remove('hidden');
        setTimeout(() => m.classList.remove('opacity-0'), 10);
        this._setTab('mappings');
        this._renderMappings();
        this._renderDevices();
        this._renderClockStatus();
        document.getElementById('midi-clock-enable').checked = !!this._state.midi.clock.enabled;
        document.getElementById('midi-clock-ignore-transport').checked = !!this._state.midi.clock.ignoreTransport;
    }

    close() {
        const m = document.getElementById('midi-modal');
        m.classList.add('opacity-0');
        setTimeout(() => m.classList.add('hidden'), 200);
    }

    isOpen() {
        const m = document.getElementById('midi-modal');
        return m && !m.classList.contains('hidden');
    }

    _setTab(name) {
        document.querySelectorAll('.midi-tab').forEach(t => {
            t.dataset.active = (t.dataset.tab === name) ? 'true' : 'false';
        });
        ['mappings', 'devices', 'clock', 'actions'].forEach(t => {
            const el = document.getElementById(`midi-tab-${t}`);
            if (!el) return;
            el.classList.toggle('hidden', t !== name);
        });
    }

    // ---------- Mappings tab ----------

    _renderMappings() {
        const body = document.getElementById('midi-mappings-body');
        const empty = document.getElementById('midi-mappings-empty');
        const filter = document.getElementById('midi-mappings-filter').value;
        body.innerHTML = '';

        const bindings = this._state.midi.bindings.filter(b => {
            if (filter === 'all') return true;
            const meta = getActionMeta(b.action.type);
            if (!meta) return false;
            const cat = meta.category.toLowerCase();
            return cat === filter;
        });

        if (bindings.length === 0) {
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');

        bindings.forEach(b => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-slate-800 hover:bg-slate-800/40';

            const sig = document.createElement('td');
            sig.className = 'py-1.5 px-2 font-mono text-purple-300';
            sig.textContent = formatSignature(b.signature);

            const meta = getActionMeta(b.action.type);
            const action = document.createElement('td');
            action.className = 'py-1.5 px-2';
            action.textContent = meta ? meta.label : b.action.type;

            const target = document.createElement('td');
            target.className = 'py-1.5 px-2 text-slate-400';
            target.textContent = this._describeTarget(b);

            const beh = document.createElement('td');
            beh.className = 'py-1.5 px-2 text-slate-500';
            beh.textContent = b.action.behavior || '—';

            const label = document.createElement('td');
            label.className = 'py-1.5 px-2 text-slate-400';
            label.textContent = b.label || '';

            const actions = document.createElement('td');
            actions.className = 'py-1.5 px-2 text-right';
            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.className = 'text-[10px] text-slate-400 hover:text-white mr-2';
            editBtn.onclick = () => this._openEditor(b);
            const delBtn = document.createElement('button');
            delBtn.textContent = 'Del';
            delBtn.className = 'text-[10px] text-slate-500 hover:text-red-400';
            delBtn.onclick = () => {
                this._bindings.remove(b.id);
                this._bus.emit('project:autosave');
                this._renderMappings();
            };
            actions.append(editBtn, delBtn);

            tr.append(sig, action, target, beh, label, actions);
            body.appendChild(tr);
        });
    }

    _describeTarget(b) {
        const t = b.action.target || {};
        if (Number.isFinite(t.sceneIdx)) {
            const scene = this._state.scenes[t.sceneIdx];
            return `Scene ${t.sceneIdx + 1}${scene ? ` — ${scene.name}` : ''}`;
        }
        if (t.layerId) {
            const layer = this._state.layers.find(l => l.id === t.layerId);
            const name = layer ? layer.name : '(unknown)';
            return t.uKey ? `${name} / ${t.uKey.replace('u_', '')}` : name;
        }
        if (Number.isFinite(t.layerIdx)) {
            return `Layer #${t.layerIdx + 1}`;
        }
        return '—';
    }

    _openEditor(binding, opts = {}) {
        const isNew = !binding;
        const draft = binding
            ? JSON.parse(JSON.stringify(binding))
            : {
                id: null,
                signature: opts.signature || null,
                action: { type: 'scene.recall', target: { sceneIdx: 0 }, behavior: 'trigger', invert: false },
                label: ''
            };
        this._editor = { draft, isNew };

        document.getElementById('mbe-signature').textContent = draft.signature ? formatSignature(draft.signature) : '—';
        document.getElementById('mbe-action').value = draft.action.type;
        document.getElementById('mbe-behavior').value = draft.action.behavior || 'trigger';
        document.getElementById('mbe-label').value = draft.label || '';
        this._refreshEditorTarget();

        const m = document.getElementById('midi-binding-editor');
        m.classList.remove('hidden');
        setTimeout(() => m.classList.remove('opacity-0'), 10);
    }

    _closeEditor() {
        this._editor = null;
        const m = document.getElementById('midi-binding-editor');
        m.classList.add('opacity-0');
        setTimeout(() => m.classList.add('hidden'), 150);
    }

    _refreshEditorTarget() {
        if (!this._editor) return;
        const type = document.getElementById('mbe-action').value;
        const meta = getActionMeta(type);
        const wrap = document.getElementById('mbe-target-wrap');
        wrap.innerHTML = '';
        // Migrate target when switching action
        const draft = this._editor.draft;
        draft.action.type = type;
        if (!draft.action.target) draft.action.target = {};

        // Behavior defaults
        const behSel = document.getElementById('mbe-behavior');
        if (meta && meta.defaultBehavior && !draft.action.behavior) {
            behSel.value = meta.defaultBehavior;
            draft.action.behavior = meta.defaultBehavior;
        }
        behSel.disabled = !!(meta && meta.continuous);

        if (!meta || meta.target === 'none') {
            const span = document.createElement('span');
            span.className = 'text-slate-500 text-[10px]';
            span.textContent = 'No target needed';
            wrap.appendChild(span);
            return;
        }

        if (meta.target === 'sceneIdx') {
            const sel = document.createElement('select');
            sel.className = 'bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 w-full text-[11px]';
            this._state.scenes.forEach((sc, i) => {
                const opt = document.createElement('option');
                opt.value = String(i);
                opt.textContent = `${i + 1}. ${sc.name}`;
                sel.appendChild(opt);
            });
            if (Number.isFinite(draft.action.target.sceneIdx)) {
                sel.value = String(draft.action.target.sceneIdx);
            }
            sel.onchange = () => { draft.action.target = { sceneIdx: parseInt(sel.value, 10) }; };
            wrap.appendChild(sel);
            return;
        }

        if (meta.target === 'layerRef' || meta.target === 'layerRef.uniform') {
            const layerSel = document.createElement('select');
            layerSel.className = 'bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 w-full text-[11px]';
            this._state.layers.forEach((l, i) => {
                const opt = document.createElement('option');
                opt.value = l.id;
                opt.textContent = `${i + 1}. ${l.name}`;
                layerSel.appendChild(opt);
            });
            if (this._state.layers.length === 0) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = '(no layers in current scene)';
                layerSel.appendChild(opt);
                layerSel.disabled = true;
            }
            if (draft.action.target.layerId) layerSel.value = draft.action.target.layerId;
            layerSel.onchange = () => {
                draft.action.target = { layerId: layerSel.value };
                if (meta.target === 'layerRef.uniform') this._refreshEditorTarget();
            };
            wrap.appendChild(layerSel);

            if (meta.target === 'layerRef.uniform') {
                const uSel = document.createElement('select');
                uSel.className = 'bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 w-full text-[11px] mt-1';
                const layer = this._state.layers.find(l => l.id === (draft.action.target.layerId || layerSel.value));
                if (layer) {
                    Object.keys(layer.uniformsDef).forEach(k => {
                        const opt = document.createElement('option');
                        opt.value = k;
                        opt.textContent = k.replace('u_', '');
                        uSel.appendChild(opt);
                    });
                }
                if (draft.action.target.uKey) uSel.value = draft.action.target.uKey;
                uSel.onchange = () => {
                    draft.action.target.uKey = uSel.value;
                };
                // Ensure initial uKey is set
                if (!draft.action.target.uKey && uSel.options.length > 0) {
                    draft.action.target.uKey = uSel.value;
                }
                wrap.appendChild(uSel);
            }
            return;
        }
    }

    async _editorLearn() {
        const captured = await this._midiManager.armLearnOnce({ description: 'move/press the control for this binding' });
        if (!captured) return;
        if (!this._editor) return;
        this._editor.draft.signature = captured.signature;
        document.getElementById('mbe-signature').textContent = formatSignature(captured.signature);
        // Auto-adjust: if message type doesn't support current action, pick first matching action
        const type = captured.type;
        const curAction = this._editor.draft.action.type;
        if (!actionSupports(curAction, type)) {
            const fallback = Object.keys(MIDI_ACTIONS).find(k => actionSupports(k, type));
            if (fallback) {
                this._editor.draft.action.type = fallback;
                document.getElementById('mbe-action').value = fallback;
                this._refreshEditorTarget();
            }
        }
    }

    _saveEditor() {
        if (!this._editor) return;
        const draft = this._editor.draft;
        if (!draft.signature) {
            alert('Assign a MIDI signature first (Learn or + Add by Learn).');
            return;
        }
        const meta = getActionMeta(draft.action.type);
        if (!meta) return;

        const parsed = parseSignature(draft.signature);
        if (!parsed || !actionSupports(draft.action.type, parsed.type)) {
            alert(`Action "${meta.label}" does not support ${parsed ? parsed.type : 'this message type'}.`);
            return;
        }

        draft.action.behavior = document.getElementById('mbe-behavior').value || 'trigger';
        draft.label = document.getElementById('mbe-label').value || '';
        draft.action.invert = !!draft.action.invert;

        this._bindings.upsert(draft);
        this._bus.emit('project:autosave');
        this._renderMappings();
        this._closeEditor();
    }

    async _addByLearn() {
        const captured = await this._midiManager.armLearnOnce({ description: 'press the control to bind' });
        if (!captured) return;
        this._openEditor(null, { signature: captured.signature });
        // Pre-pick action by captured type
        const pref = Object.keys(MIDI_ACTIONS).find(k => actionSupports(k, captured.type));
        if (pref) {
            this._editor.draft.action.type = pref;
            this._editor.draft.signature = captured.signature;
            document.getElementById('mbe-signature').textContent = formatSignature(captured.signature);
            document.getElementById('mbe-action').value = pref;
            this._refreshEditorTarget();
        }
    }

    // ---------- Devices tab ----------

    _renderDevices() {
        const list = document.getElementById('midi-devices-list');
        if (!list) return;
        list.innerHTML = '';
        const devs = this._state.midi.devices || {};
        const ids = Object.keys(devs);
        if (ids.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'text-[10px] text-slate-500 py-6 text-center';
            empty.textContent = 'No MIDI devices detected. Connect a device and grant browser permission.';
            list.appendChild(empty);
            return;
        }
        ids.forEach(id => {
            const d = devs[id];
            const row = document.createElement('label');
            row.className = 'flex items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-[11px]';
            const info = document.createElement('div');
            info.className = 'flex items-center gap-3 min-w-0';
            const dot = document.createElement('span');
            dot.className = `w-1.5 h-1.5 rounded-full ${d.connected ? 'bg-green-400' : 'bg-slate-600'}`;
            const name = document.createElement('span');
            name.className = 'text-slate-200 truncate';
            name.textContent = d.name || id;
            const idEl = document.createElement('span');
            idEl.className = 'text-[9px] text-slate-500 font-mono truncate';
            idEl.textContent = id;
            info.append(dot, name, idEl);

            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.checked = d.enabled !== false;
            toggle.className = 'accent-cyan-500';
            toggle.onchange = () => this._midiManager.setDeviceEnabled(id, toggle.checked);

            row.append(info, toggle);
            list.appendChild(row);
        });
    }

    // ---------- Clock status ----------

    _renderClockStatus() {
        const c = this._state.midi.clock;
        const src = document.getElementById('midi-clock-source');
        const bpm = document.getElementById('midi-clock-bpm');
        const tr = document.getElementById('midi-clock-transport');
        if (src) src.textContent = c.enabled ? (c.running ? 'MIDI Clock (running)' : 'MIDI Clock (armed)') : 'Manual';
        if (bpm) bpm.textContent = c.estimatedBpm ? c.estimatedBpm.toFixed(2) : '--';
        if (tr) tr.textContent = c.running ? 'running' : 'stopped';
    }

    // ---------- Activity monitor ----------

    _onActivity({ signature, type, number, channel, norm }) {
        // Dot flash
        const dot = document.getElementById('midi-activity-dot');
        const text = document.getElementById('midi-activity-text');
        const headerDot = document.getElementById('midi-status-dot');
        if (dot) {
            dot.classList.add('bg-purple-400');
            dot.classList.remove('bg-slate-700');
        }
        if (headerDot) headerDot.classList.add('midi-pulse');
        if (text) text.textContent = formatSignature(signature);
        clearTimeout(this._activePulseTimer);
        this._activePulseTimer = setTimeout(() => {
            if (dot) { dot.classList.remove('bg-purple-400'); dot.classList.add('bg-slate-700'); }
            if (headerDot) headerDot.classList.remove('midi-pulse');
            if (text) text.textContent = 'idle';
        }, 180);

        // Monitor log
        const log = document.getElementById('midi-monitor-log');
        if (log && this.isOpen()) {
            const line = document.createElement('div');
            line.textContent = `${new Date().toISOString().slice(11, 19)} · ${formatSignature(signature)} · v=${norm.toFixed(3)}`;
            log.appendChild(line);
            this._monitorLines.push(line);
            if (this._monitorLines.length > MONITOR_MAX_LINES) {
                const removed = this._monitorLines.shift();
                if (removed && removed.remove) removed.remove();
            }
            log.scrollTop = log.scrollHeight;
        }
    }

    // ---------- Import / export ----------

    _exportBindings() {
        const payload = { version: '1.2', bindings: this._state.midi.bindings };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vj_midi_bindings_${Date.now()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    _importBindings(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                const incoming = Array.isArray(data) ? data : (Array.isArray(data.bindings) ? data.bindings : null);
                if (!incoming) throw new Error('invalid format');
                incoming.forEach(b => this._bindings.upsert(b));
                this._bus.emit('project:autosave');
                this._renderMappings();
                this._bus.emit('toast', { msg: `Imported ${incoming.length} binding(s)`, type: 'success' });
            } catch (err) {
                this._bus.emit('toast', { msg: `Import failed: ${err.message || err}`, type: 'error' });
            } finally {
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    }
}
