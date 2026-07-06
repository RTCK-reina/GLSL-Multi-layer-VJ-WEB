/**
 * ProjectMigrator — Converts legacy project JSON to the current format.
 *
 * V0.5 format:
 *   { version: "0.5-alpha", scenes, midi: { map }, sync }
 *
 * V1.0 format adds:
 *   crossfade: { durationBeats }, audio: { bands, gains }
 */

const CURRENT_VERSION = '1.2';

export function migrateProject(data) {
    if (!data || typeof data !== 'object') return data;

    const version = data.version || '0.5-alpha';

    if (version === CURRENT_VERSION) return data;

    // Chain migrations
    let out = data;
    if (version === '0.5-alpha' || !data.version) out = migrateFrom05(out);
    if (out.version === '1.0') out = migrateFrom10(out);
    if (out.version === '1.1') out = migrateFrom11(out);
    if (out.version === CURRENT_VERSION) return out;

    console.warn(`Unknown project version: ${out.version}, attempting load as-is`);
    return out;
}

function migrateFrom05(data) {
    const migrated = { ...data, version: '1.0' };

    // Ensure sync has all V1.0 fields
    if (migrated.sync && typeof migrated.sync === 'object') {
        migrated.sync = {
            bpm: migrated.sync.bpm ?? 120,
            running: migrated.sync.running ?? true,
            beat: migrated.sync.beat ?? 0,
            ...migrated.sync,
        };
    } else {
        migrated.sync = { bpm: 120, running: true, beat: 0 };
    }

    // Add crossfade defaults
    const legacyDuration = Number(migrated.crossfade && (
        migrated.crossfade.durationBeats ?? migrated.crossfade.duration
    ));
    migrated.crossfade = {
        durationBeats: Number.isFinite(legacyDuration) && legacyDuration >= 0 ? legacyDuration : 0
    };

    // Add 8-band audio config (V0.5 used 3-band hardcoded)
    if (!migrated.audio) {
        migrated.audio = {
            bands: 8,
            gains: [1, 1, 1, 1, 1, 1, 1, 1],
        };
    }

    return migrated;
}

/**
 * V1.0 -> V1.1
 *
 * V1.1 adds:
 *   - midi.bindings: [] (action-level bindings)
 *   - midi.clock:    { enabled, ignoreTransport }
 *   - layers[].muted: boolean (default false)
 *   - app: { blackout: false }
 *
 * V1.0 projects kept their legacy midi.map (CC → "layerId::uniform").
 * We leave that in place: MidiManager still applies it alongside bindings,
 * so existing uniform CC assignments work without migration noise.
 */
function migrateFrom10(data) {
    const midi = (data.midi && typeof data.midi === 'object') ? { ...data.midi } : {};
    if (!Array.isArray(midi.bindings)) midi.bindings = [];
    if (!midi.clock || typeof midi.clock !== 'object') {
        midi.clock = { enabled: false, ignoreTransport: false };
    }
    return { ...data, version: '1.1', midi };
}

/**
 * V1.1 -> V1.2
 *
 * V1.2 adds:
 *   - performance: Performance Guard project prefs
 */
function migrateFrom11(data) {
    const performance = (data.performance && typeof data.performance === 'object')
        ? { ...data.performance }
        : {};
    return {
        ...data,
        version: CURRENT_VERSION,
        performance: {
            guardEnabled: performance.guardEnabled !== false,
            targetFps: [30, 45, 60].includes(Number(performance.targetFps)) ? Number(performance.targetFps) : 60,
            profile: ['quality', 'balanced', 'performance'].includes(performance.profile) ? performance.profile : 'balanced',
            freezeHiddenLayers: !!performance.freezeHiddenLayers
        }
    };
}

export { CURRENT_VERSION };
