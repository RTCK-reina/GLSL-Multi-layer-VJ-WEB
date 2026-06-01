// audio.js — Web Audio FFT analysis

const AudioEngine = (function () {
  'use strict';

  let audioCtx = null;
  let analyser = null;
  let freqData = null;
  let rgbaData = null;
  let fftTexture = null;
  let glRef = null;
  let level = 0;
  let enabled = false;

  function init(gl) {
    glRef = gl;
    // 256x1 texture for FFT data (single channel replicated to RGBA)
    fftTexture = GLUtils.createTexture(gl, 256, 1, null);
  }

  async function enable() {
    if (enabled) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    freqData = new Uint8Array(analyser.frequencyBinCount); // 256
    // RGBA upload buffer for the 256x1 texture (4 bytes per texel).
    rgbaData = new Uint8Array(analyser.frequencyBinCount * 4);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const src = audioCtx.createMediaStreamSource(stream);
      src.connect(analyser);
      enabled = true;
    } catch (e) {
      console.error('Audio permission denied', e);
    }
  }

  function update() {
    if (!enabled || !analyser) return;
    analyser.getByteFrequencyData(freqData);
    // Compute overall level (average)
    let sum = 0;
    for (let i = 0; i < freqData.length; i++) sum += freqData[i];
    level = sum / freqData.length / 255;

    // Replicate each FFT value across RGBA so the upload buffer matches
    // the RGBA texture format (256 * 4 bytes).
    for (let i = 0; i < freqData.length; i++) {
      const v = freqData[i];
      const o = i * 4;
      rgbaData[o] = v;
      rgbaData[o + 1] = v;
      rgbaData[o + 2] = v;
      rgbaData[o + 3] = 255;
    }

    // Upload FFT to texture
    glRef.bindTexture(glRef.TEXTURE_2D, fftTexture);
    glRef.texSubImage2D(glRef.TEXTURE_2D, 0, 0, 0, 256, 1, glRef.RGBA, glRef.UNSIGNED_BYTE, rgbaData);
  }

  function getLevel() { return level; }
  function getTexture() { return fftTexture; }

  return {
    init: init,
    enable: enable,
    update: update,
    getLevel: getLevel,
    getTexture: getTexture,
  };
})();
