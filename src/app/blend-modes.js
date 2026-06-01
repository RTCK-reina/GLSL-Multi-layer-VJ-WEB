import * as THREE from 'three';

// GLSL blend functions used by the compositor. The compositor shader
// receives the accumulated backdrop (u_dst) and the current layer (u_src)
// and mixes them according to the selected mode.

export const BLEND_GLSL = `
vec3 blendNormal(vec3 b, vec3 s) { return s; }
vec3 blendAdd(vec3 b, vec3 s) { return min(b + s, 1.0); }
vec3 blendMultiply(vec3 b, vec3 s) { return b * s; }
vec3 blendScreen(vec3 b, vec3 s) { return 1.0 - (1.0 - b) * (1.0 - s); }
vec3 blendDifference(vec3 b, vec3 s) { return abs(b - s); }
vec3 blendOverlay(vec3 b, vec3 s) {
  return vec3(
    b.r < 0.5 ? (2.0 * b.r * s.r) : (1.0 - 2.0 * (1.0 - b.r) * (1.0 - s.r)),
    b.g < 0.5 ? (2.0 * b.g * s.g) : (1.0 - 2.0 * (1.0 - b.g) * (1.0 - s.g)),
    b.b < 0.5 ? (2.0 * b.b * s.b) : (1.0 - 2.0 * (1.0 - b.b) * (1.0 - s.b))
  );
}
vec3 blendSoftLight(vec3 b, vec3 s) {
  return mix(
    2.0 * b * s + b * b * (1.0 - 2.0 * s),
    sqrt(b) * (2.0 * s - 1.0) + 2.0 * b * (1.0 - s),
    step(0.5, s)
  );
}
vec3 blendHardLight(vec3 b, vec3 s) { return blendOverlay(s, b); }
// Color Dodge / Color Burn: guard the divisor so a source channel of
// 1.0 (dodge) or 0.0 (burn) does not produce Inf/NaN. The result is
// clamped to [0,1]; where the divisor would be zero the function
// saturates (dodge -> 1.0, burn -> 0.0).
vec3 blendColorDodge(vec3 b, vec3 s) {
  return clamp(b / max(1.0 - s, 1e-4), 0.0, 1.0);
}
vec3 blendColorBurn(vec3 b, vec3 s) {
  return clamp(1.0 - (1.0 - b) / max(s, 1e-4), 0.0, 1.0);
}

vec3 applyBlend(int mode, vec3 b, vec3 s) {
  if (mode == 0) return blendNormal(b, s);
  if (mode == 1) return blendAdd(b, s);
  if (mode == 2) return blendMultiply(b, s);
  if (mode == 3) return blendScreen(b, s);
  if (mode == 4) return blendDifference(b, s);
  if (mode == 5) return blendOverlay(b, s);
  if (mode == 6) return blendSoftLight(b, s);
  if (mode == 7) return blendHardLight(b, s);
  if (mode == 8) return blendColorDodge(b, s);
  if (mode == 9) return blendColorBurn(b, s);
  return s;
}
`;

export const BLEND_MODES = [
  'NORMAL', 'ADD', 'MULTIPLY', 'SCREEN', 'DIFFERENCE',
  'OVERLAY', 'SOFT_LIGHT', 'HARD_LIGHT', 'COLOR_DODGE', 'COLOR_BURN',
];

export function blendModeIndex(name) {
  const i = BLEND_MODES.indexOf(name);
  return i < 0 ? 0 : i;
}
