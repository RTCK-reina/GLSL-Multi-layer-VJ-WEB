/**
 * ProjectMigrator — Converts V0.5 project JSON to V1.0 format.
 *
 * V0.5 format:
 *   { version: "0.5-alpha", scenes, midi: { map }, sync }
 *
 * V1.0 format adds:
 *   crossfade: { durationBeats }, audio: { bands, gains }
 */

const CURRENT_VERSION = '1.0';

export function migrateProject(data) {
    if (!data || typeof data !== 'object') return data;

    const version = data.version || '0.5-alpha';

    // Already V1.0+
    if (version === CURRENT_VERSION) return data;

    // V0.5-alpha → V1.0
    if (version === '0.5-alpha' || !data.version) {
        return migrateFrom05(data);
    }

    // Unknown version — pass through with warning
    console.warn(`Unknown project version: ${version}, attempting load as-is`);
    return data;
}

function migrateFrom05(data) {
    const migrated = { ...data, version: CURRENT_VERSION };

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

export { CURRENT_VERSION };
