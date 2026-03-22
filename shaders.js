window.SHADERS = window.SHADERS || {};

window.registerShader = function registerShader(key, definition) {
    if (!key || !definition || typeof definition !== 'object') return;
    window.SHADERS[key] = definition;
};
