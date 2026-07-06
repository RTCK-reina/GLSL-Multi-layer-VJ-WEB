/**
 * MIDI Action catalog.
 *
 * Each action type declares:
 *   - label: human-readable name
 *   - category: grouping for the Config UI
 *   - supports: which message types can trigger it (cc/note/pc)
 *   - continuous: true for CC-style value mapping (0..1 → target range)
 *   - target: shape hint for the target picker
 *     'none' | 'sceneIdx' | 'layerRef' | 'layerRef.uniform' | 'cue'
 *   - defaultBehavior (note only): 'trigger' | 'toggle' | 'momentary'
 */
export const MIDI_ACTIONS = {
    'scene.recall': {
        label: 'Recall Scene',
        category: 'Scene',
        supports: ['note', 'cc', 'pc'],
        continuous: false,
        target: 'sceneIdx',
        defaultBehavior: 'trigger'
    },
    'scene.next': {
        label: 'Next Scene',
        category: 'Scene',
        supports: ['note', 'cc'],
        continuous: false,
        target: 'none',
        defaultBehavior: 'trigger'
    },
    'scene.prev': {
        label: 'Prev Scene',
        category: 'Scene',
        supports: ['note', 'cc'],
        continuous: false,
        target: 'none',
        defaultBehavior: 'trigger'
    },
    'layer.mute': {
        label: 'Toggle Layer MUTE',
        category: 'Layer',
        supports: ['note', 'cc'],
        continuous: false,
        target: 'layerRef',
        defaultBehavior: 'toggle'
    },
    'layer.solo': {
        label: 'Toggle Layer SOLO',
        category: 'Layer',
        supports: ['note', 'cc'],
        continuous: false,
        target: 'layerRef',
        defaultBehavior: 'toggle'
    },
    'layer.select': {
        label: 'Select Active Layer',
        category: 'Layer',
        supports: ['note', 'cc'],
        continuous: false,
        target: 'layerRef',
        defaultBehavior: 'trigger'
    },
    'layer.opacity': {
        label: 'Layer Opacity',
        category: 'Layer',
        supports: ['cc'],
        continuous: true,
        target: 'layerRef',
        defaultBehavior: null
    },
    'layer.blend.next': {
        label: 'Next Blend Mode',
        category: 'Layer',
        supports: ['note', 'cc'],
        continuous: false,
        target: 'layerRef',
        defaultBehavior: 'trigger'
    },
    'uniform.set': {
        label: 'Uniform (continuous)',
        category: 'Uniform',
        supports: ['cc'],
        continuous: true,
        target: 'layerRef.uniform',
        defaultBehavior: null
    },
    'crossfade.mix': {
        label: 'Crossfade Mix (fader)',
        category: 'Global',
        supports: ['cc'],
        continuous: true,
        target: 'none',
        defaultBehavior: null
    },
    'bpm.tap': {
        label: 'Tap Tempo',
        category: 'Global',
        supports: ['note', 'cc'],
        continuous: false,
        target: 'none',
        defaultBehavior: 'trigger'
    },
    'app.blackout': {
        label: 'Blackout Toggle',
        category: 'Global',
        supports: ['note', 'cc'],
        continuous: false,
        target: 'none',
        defaultBehavior: 'toggle'
    },
    'app.panic': {
        label: 'MIDI Panic',
        category: 'Global',
        supports: ['note', 'cc'],
        continuous: false,
        target: 'none',
        defaultBehavior: 'trigger'
    },
    'performance.guard.toggle': {
        label: 'Performance Guard Toggle',
        category: 'Performance',
        supports: ['note', 'cc'],
        continuous: false,
        target: 'none',
        defaultBehavior: 'toggle'
    },
    'performance.profile.next': {
        label: 'Next Performance Profile',
        category: 'Performance',
        supports: ['note', 'cc'],
        continuous: false,
        target: 'none',
        defaultBehavior: 'trigger'
    }
};

export function getActionMeta(type) {
    return MIDI_ACTIONS[type] || null;
}

/** All supported message types for a given action. */
export function actionSupports(type, msgType) {
    const meta = MIDI_ACTIONS[type];
    if (!meta) return false;
    return meta.supports.includes(msgType);
}
