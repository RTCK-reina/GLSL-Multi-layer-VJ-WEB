/**
 * AudioAnalyzer — FFT analysis with 8 frequency bands.
 *
 * Supports microphone and system audio (getDisplayMedia) inputs.
 * Provides backward-compatible bass/mid/treble getters.
 *
 * Band layout (256 bins from fftSize=512):
 *   0: Sub Bass    (20-60 Hz)     bins 0-3
 *   1: Bass        (60-250 Hz)    bins 3-12
 *   2: Low Mid     (250-500 Hz)   bins 12-24
 *   3: Mid         (500-2k Hz)    bins 24-48
 *   4: Upper Mid   (2k-4k Hz)     bins 48-96
 *   5: Presence    (4k-6k Hz)     bins 96-144
 *   6: Brilliance  (6k-12k Hz)    bins 144-192
 *   7: Air         (12k-20k Hz)   bins 192-256
 */
export class AudioAnalyzer {
    constructor() {
        this.active = false;
        this._audioCtx = null;
        this._analyser = null;
        this._data = new Uint8Array(0);
        this._source = null;
        this._stream = null;
        this._mode = 'none'; // 'none' | 'mic' | 'system'

        // 8-band ranges (bin start, bin end)
        this._bandRanges = [
            [0, 3], [3, 12], [12, 24], [24, 48],
            [48, 96], [96, 144], [144, 192], [192, 256]
        ];

        // Per-band gain (user-adjustable)
        this.gains = [1.5, 1.3, 1.2, 1.0, 1.0, 1.1, 1.3, 1.5];

        // Result object with 8 bands + legacy 3-band getters
        this.bands = new Float32Array(8);
        this.res = this._createResultProxy();
    }

    /**
     * Creates the result object with backward-compatible bass/mid/treble getters.
     */
    _createResultProxy() {
        const self = this;
        return {
            get bass() { return Math.min(1, (self.bands[0] + self.bands[1]) * 0.5); },
            get mid() { return Math.min(1, (self.bands[2] + self.bands[3] + self.bands[4]) / 3); },
            get treble() { return Math.min(1, (self.bands[5] + self.bands[6] + self.bands[7]) / 3); },
            get bands() { return self.bands; }
        };
    }

    /**
     * Initialize with microphone input.
     */
    async init() {
        return this._initSource('mic');
    }

    /**
     * Switch to system audio via getDisplayMedia.
     */
    async initSystemAudio() {
        return this._initSource('system');
    }

    async _initSource(mode) {
        // Cleanup previous source
        this._cleanup();

        try {
            if (!this._audioCtx) {
                this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this._audioCtx.state === 'suspended') {
                await this._audioCtx.resume();
            }

            let stream;
            if (mode === 'system') {
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: true, // required by spec, we ignore it
                    audio: true
                });
                // Stop the video track immediately — we only need audio
                stream.getVideoTracks().forEach(t => t.stop());
            } else {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }

            this._stream = stream;
            this._source = this._audioCtx.createMediaStreamSource(stream);
            this._analyser = this._audioCtx.createAnalyser();
            this._analyser.fftSize = 512;
            this._analyser.smoothingTimeConstant = 0.8;
            this._source.connect(this._analyser);
            this._data = new Uint8Array(this._analyser.frequencyBinCount);
            this.active = true;
            this._mode = mode;
            return true;
        } catch (e) {
            console.error('Audio init failed:', e);
            return false;
        }
    }

    _cleanup() {
        if (this._source) {
            this._source.disconnect();
            this._source = null;
        }
        if (this._stream) {
            this._stream.getTracks().forEach(t => t.stop());
            this._stream = null;
        }
        this.active = false;
        this._mode = 'none';
    }

    get mode() { return this._mode; }

    update() {
        if (!this.active) return this.res;
        this._analyser.getByteFrequencyData(this._data);

        for (let b = 0; b < 8; b++) {
            const [start, end] = this._bandRanges[b];
            let sum = 0;
            for (let i = start; i < end; i++) sum += this._data[i];
            const avg = sum / (end - start) / 255;
            this.bands[b] = Math.min(1, avg * this.gains[b]);
        }

        return this.res;
    }
}
