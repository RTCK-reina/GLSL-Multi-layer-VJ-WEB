import crystalKifs from './crystal-kifs.js';
import alienBio from './alien-bio.js';
import cyberDystopia from './cyber-dystopia.js';
import quantumCore from './quantum-core.js';
import wormholeX from './wormhole-x.js';
import liquidGold from './liquid-gold.js';
import cyberscape from './cyberscape.js';
import glitchTvPro from './glitch-tv-pro.js';
import feedbackLoop from './feedback-loop.js';
import webcamInput from './webcam-input.js';

const shaderModules = [
    crystalKifs,
    alienBio,
    cyberDystopia,
    quantumCore,
    wormholeX,
    liquidGold,
    cyberscape,
    glitchTvPro,
    feedbackLoop,
    webcamInput,
];

// Build registry object keyed by each shader's key
const shaderRegistry = {};
for (const shader of shaderModules) {
    shaderRegistry[shader.key] = shader;
}

export { shaderModules };
export default shaderRegistry;
