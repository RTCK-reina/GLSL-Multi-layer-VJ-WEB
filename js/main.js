// main.js — App entry point

(function () {
  'use strict';

  const canvas = document.getElementById('gl-canvas');
  const gl = canvas.getContext('webgl');
  if (!gl) {
    alert('WebGL not supported');
    return;
  }

  let layers = [];
  let nextId = 1;
  let paused = false;
  let startTime = performance.now();
  let quadBuffer = null;
  let compositor = null;
  let selectedLayerId = null;

  const MAX_LAYERS = 8;

  function resize() {
    canvas.width = window.innerWidth - 320; // sidebar width
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function addLayer(fragmentSource) {
    if (layers.length >= MAX_LAYERS) return null;
    const layer = new Layer(gl, nextId++, fragmentSource);
    layers.push(layer);
    refreshLayerUI();
    return layer;
  }

  function removeLayer(id) {
    const idx = layers.findIndex(function (l) { return l.id === id; });
    if (idx === -1) return;
    layers[idx].destroy();
    layers.splice(idx, 1);
    refreshLayerUI();
  }

  function refreshLayerUI() {
    const list = document.getElementById('layer-list');
    list.innerHTML = '';
    const select = document.getElementById('layer-select');
    select.innerHTML = '';

    layers.forEach(function (layer) {
      // Layer row
      const row = document.createElement('div');
      row.className = 'layer-row';

      const label = document.createElement('span');
      label.textContent = 'Layer ' + layer.id;
      row.appendChild(label);

      const visToggle = document.createElement('input');
      visToggle.type = 'checkbox';
      visToggle.checked = layer.visible;
      visToggle.addEventListener('change', function () {
        layer.visible = visToggle.checked;
      });
      row.appendChild(visToggle);

      const opacity = document.createElement('input');
      opacity.type = 'range';
      opacity.min = 0;
      opacity.max = 1;
      opacity.step = 0.01;
      opacity.value = layer.opacity;
      opacity.addEventListener('input', function () {
        layer.opacity = parseFloat(opacity.value);
      });
      row.appendChild(opacity);

      const blend = document.createElement('select');
      ['normal', 'add', 'multiply', 'screen', 'overlay'].forEach(function (m) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        if (m === layer.blendMode) opt.selected = true;
        blend.appendChild(opt);
      });
      blend.addEventListener('change', function () {
        layer.blendMode = blend.value;
      });
      row.appendChild(blend);

      const del = document.createElement('button');
      del.textContent = 'x';
      del.addEventListener('click', function () {
        removeLayer(layer.id);
      });
      row.appendChild(del);

      list.appendChild(row);

      // Editor dropdown option
      const opt = document.createElement('option');
      opt.value = layer.id;
      opt.textContent = 'Layer ' + layer.id;
      if (layer.id === selectedLayerId) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function getLayerById(id) {
    return layers.find(function (l) { return l.id === id; });
  }

  function render() {
    if (!paused) {
      const time = (performance.now() - startTime) / 1000;
      AudioEngine.update();
      const audioLevel = AudioEngine.getLevel();
      const audioTexture = AudioEngine.getTexture();

      // Update the audio meter UI.
      const audioBar = document.getElementById('audio-bar');
      if (audioBar) {
        audioBar.style.width = Math.min(100, audioLevel * 100) + '%';
      }

      for (let i = 0; i < layers.length; i++) {
        layers[i].render(gl, quadBuffer, time, audioLevel, audioTexture);
      }
      compositor.render(layers);
    }
    requestAnimationFrame(render);
  }

  function init() {
    resize();
    window.addEventListener('resize', resize);

    quadBuffer = GLUtils.createQuadBuffer(gl);
    compositor = new Compositor(gl);
    AudioEngine.init(gl);

    // Add an initial layer
    addLayer();
    selectedLayerId = layers[0].id;
    document.getElementById('shader-code').value = layers[0].fragmentSource;

    wireEvents();
    render();
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function togglePause() {
    paused = !paused;
    document.getElementById('pause-btn').textContent = paused ? 'Resume' : 'Pause';
  }

  function wireEvents() {
    document.getElementById('add-layer').addEventListener('click', function () {
      addLayer();
    });

    document.getElementById('pause-btn').addEventListener('click', togglePause);

    document.getElementById('compile-btn').addEventListener('click', function () {
      const code = document.getElementById('shader-code').value;
      const layer = getLayerById(selectedLayerId);
      const errorLog = document.getElementById('error-log');
      if (!layer) return;
      try {
        layer.compile(code);
        errorLog.textContent = '';
      } catch (e) {
        errorLog.textContent = e.message;
      }
    });

    document.getElementById('layer-select').addEventListener('change', function (e) {
      selectedLayerId = parseInt(e.target.value, 10);
      const layer = getLayerById(selectedLayerId);
      if (layer) {
        document.getElementById('shader-code').value = layer.fragmentSource;
      }
    });

    document.getElementById('audio-toggle').addEventListener('click', function () {
      AudioEngine.enable();
    });

    document.getElementById('save-preset').addEventListener('click', function () {
      Presets.save(layers);
    });

    document.getElementById('load-preset').addEventListener('click', function () {
      const data = Presets.load();
      if (!data) return;
      // Rebuild layers from preset
      layers.forEach(function (l) { l.destroy(); });
      layers = [];
      data.forEach(function (cfg) {
        const layer = new Layer(gl, cfg.id, cfg.fragmentSource);
        layer.visible = cfg.visible;
        layer.opacity = cfg.opacity;
        layer.blendMode = cfg.blendMode;
        layers.push(layer);
      });
      nextId = layers.length
        ? Math.max.apply(null, layers.map(function (l) { return l.id; })) + 1
        : 1;
      // Point the editor selection at a layer that still exists.
      selectedLayerId = layers.length ? layers[0].id : null;
      const shaderCode = document.getElementById('shader-code');
      shaderCode.value = layers.length ? layers[0].fragmentSource : '';
      refreshLayerUI();
    });

    window.addEventListener('keydown', function (e) {
      // Don't hijack typing in the shader editor or other form fields.
      if (isTypingTarget(e.target)) return;

      if (e.key === ' ') {
        e.preventDefault();
        togglePause();
      } else if (e.key >= '1' && e.key <= '8') {
        const idx = parseInt(e.key, 10) - 1;
        if (layers[idx]) {
          layers[idx].visible = !layers[idx].visible;
        }
      }
    });
  }

  init();
})();
