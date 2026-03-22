/**
 * EventBus — Lightweight synchronous pub/sub.
 *
 * All emit() calls are synchronous (no queueMicrotask / Promise)
 * to avoid frame-latency in the 60fps render loop.
 *
 * Events:
 *   layer:added, layer:removed, layer:updated, layer:reordered
 *   scene:switched, scene:created, scene:deleted
 *   midi:cc, midi:connected, midi:disconnected
 *   audio:update
 *   beat:tick
 *   toast
 *   render:frame
 *   project:loaded, project:saved
 */
export class EventBus {
    constructor() {
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();
    }

    /**
     * Subscribe to an event.
     * @param {string} event
     * @param {Function} fn
     * @returns {Function} unsubscribe function
     */
    on(event, fn) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(fn);
        return () => this.off(event, fn);
    }

    /**
     * Subscribe to an event, auto-remove after first call.
     */
    once(event, fn) {
        const wrapper = (...args) => {
            this.off(event, wrapper);
            fn(...args);
        };
        return this.on(event, wrapper);
    }

    /**
     * Unsubscribe from an event.
     */
    off(event, fn) {
        const set = this._listeners.get(event);
        if (set) {
            set.delete(fn);
            if (set.size === 0) this._listeners.delete(event);
        }
    }

    /**
     * Synchronously invoke all listeners for an event.
     */
    emit(event, data) {
        const set = this._listeners.get(event);
        if (!set) return;
        for (const fn of set) {
            try {
                fn(data);
            } catch (err) {
                console.error(`[EventBus] Error in "${event}" handler:`, err);
            }
        }
    }

    /**
     * Remove all listeners (for teardown).
     */
    clear() {
        this._listeners.clear();
    }
}
