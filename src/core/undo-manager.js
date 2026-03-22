/**
 * UndoManager — Snapshot-based undo/redo for project state.
 *
 * Tracks committed states as JSON snapshots. Each time ProjectIO
 * persists (after debounce), it commits the new state here.
 * Undo/redo pops from the respective stack and returns the snapshot
 * for the caller to apply.
 *
 * Slider drags are naturally coalesced: the debounce means only
 * the final value is committed, so undo jumps back to pre-drag state.
 */
export class UndoManager {
    constructor() {
        this._undoStack = [];
        this._redoStack = [];
        this._lastCommitted = null;
        this._maxHistory = 50;
        this._restoring = false;
    }

    /**
     * Called after each successful persist. Pushes previous state
     * to undo stack and records the new committed state.
     * @param {string} snapshotJSON — JSON string of the project payload
     */
    commit(snapshotJSON) {
        if (this._restoring) return;
        if (snapshotJSON === this._lastCommitted) return;
        if (this._lastCommitted !== null) {
            this._undoStack.push(this._lastCommitted);
            if (this._undoStack.length > this._maxHistory) {
                this._undoStack.shift();
            }
            this._redoStack = [];
        }
        this._lastCommitted = snapshotJSON;
    }

    /**
     * @returns {string|null} JSON snapshot to restore, or null if nothing to undo
     */
    undo() {
        if (this._undoStack.length === 0) return null;
        if (this._lastCommitted !== null) {
            this._redoStack.push(this._lastCommitted);
        }
        this._lastCommitted = this._undoStack.pop();
        return this._lastCommitted;
    }

    /**
     * @returns {string|null} JSON snapshot to restore, or null if nothing to redo
     */
    redo() {
        if (this._redoStack.length === 0) return null;
        if (this._lastCommitted !== null) {
            this._undoStack.push(this._lastCommitted);
        }
        this._lastCommitted = this._redoStack.pop();
        return this._lastCommitted;
    }

    /**
     * Replace the current history baseline, typically after loading
     * a project from disk/autosave. This prevents undo from jumping
     * back into a different project.
     * @param {string|null} snapshotJSON
     */
    reset(snapshotJSON = null) {
        this._undoStack = [];
        this._redoStack = [];
        this._lastCommitted = snapshotJSON;
    }

    /** Prevent commits during restore operations */
    set restoring(val) { this._restoring = !!val; }
    get restoring() { return this._restoring; }

    get canUndo() { return this._undoStack.length > 0; }
    get canRedo() { return this._redoStack.length > 0; }
}
