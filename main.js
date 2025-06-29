let SHADERS = {
  "Glitchy-TV": {
    name: "グリッチTV",
    uniforms: {
      u_amount: { type: "f", value: 0.05, min: 0.0, max: 0.5, name: "量" },
      u_speed: { type: "f", value: 0.5, min: 0.0, max: 2.0, name: "速度" },
    },
    needsInput: true,
    fragmentShader: `uniform float u_time; uniform float u_amount; uniform float u_speed; uniform sampler2D u_inputTexture; varying vec2 vUv; float random(vec2 co){ return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453); } void main() { vec2 uv = vUv; float time = u_time * u_speed; float glitch = random(vec2(time, 0.0)) * u_amount; if (random(vec2(floor(uv.y * 20.0), time)) > 0.95) { uv.x += glitch; } float roll = random(vec2(time * 0.2, 1.0)) - 0.5; uv.y = fract(uv.y + roll * 0.2); vec3 color = texture2D(u_inputTexture, uv).rgb; float lineNoise = (random(vec2(uv.y, time)) - 0.5) * 0.1; color += lineNoise; gl_FragColor = vec4(color, 1.0); }`,
  },
  "Particle-Field": {
    name: "パーティクルフィールド",
    uniforms: {
      u_speed: { type: "f", value: 1.0, min: 0.0, max: 5.0, name: "速度" },
      u_density: {
        type: "f",
        value: 50.0,
        min: 10.0,
        max: 200.0,
        name: "密度",
      },
      u_size: { type: "f", value: 0.02, min: 0.001, max: 0.1, name: "サイズ" },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_density; uniform float u_size; float random(vec2 p) { return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453); } vec3 hsv2rgb(vec3 c) { vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); } void main() { vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y; vec3 color = vec3(0.0); for(int i = 0; i < 100; i++) { if(float(i) >= u_density) break; vec2 seed = vec2(float(i) * 0.1, float(i) * 0.2); vec2 pos = vec2(random(seed), random(seed + 1.0)) * 2.0 - 1.0; pos.x += sin(u_time * u_speed + float(i)) * 0.3; pos.y += cos(u_time * u_speed * 0.7 + float(i)) * 0.2; float dist = length(uv - pos); float particle = 1.0 - smoothstep(0.0, u_size, dist); vec3 particleColor = hsv2rgb(vec3(random(seed + 2.0), 0.8, 1.0)); color += particle * particleColor * 0.5; } gl_FragColor = vec4(color, 1.0); }`,
  },
  "DNA-Helix": {
    name: "DNAヘリックス",
    uniforms: {
      u_speed: { type: "f", value: 0.5, min: 0.0, max: 3.0, name: "回転速度" },
      u_thickness: { type: "f", value: 0.1, min: 0.01, max: 0.3, name: "太さ" },
      u_coils: { type: "f", value: 8.0, min: 2.0, max: 20.0, name: "らせん数" },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_thickness; uniform float u_coils; void main() { vec2 uv = (2.0 * gl_FragCoord.xy - u_resolution.xy) / u_resolution.y; float len = length(uv); float angle = atan(uv.y, uv.x); float helix1 = sin(len * u_coils - u_time * u_speed + angle) * 0.5 + 0.5; float helix2 = sin(len * u_coils - u_time * u_speed - angle + 3.14159) * 0.5 + 0.5; float strand1 = 1.0 - smoothstep(u_thickness - 0.02, u_thickness, abs(helix1 - len)); float strand2 = 1.0 - smoothstep(u_thickness - 0.02, u_thickness, abs(helix2 - len)); vec3 color1 = vec3(0.2, 0.8, 1.0) * strand1; vec3 color2 = vec3(1.0, 0.2, 0.8) * strand2; gl_FragColor = vec4(color1 + color2, 1.0); }`,
  },
  "Fractal-Zoom": {
    name: "フラクタルズーム",
    uniforms: {
      u_speed: {
        type: "f",
        value: 0.3,
        min: 0.0,
        max: 2.0,
        name: "ズーム速度",
      },
      u_iterations: {
        type: "f",
        value: 50.0,
        min: 10.0,
        max: 100.0,
        step: 1.0,
        name: "反復回数",
      },
      u_power: { type: "f", value: 2.0, min: 1.5, max: 8.0, name: "パワー" },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_iterations; uniform float u_power; vec2 complexMul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); } vec3 palette(float t) { vec3 a = vec3(0.5, 0.5, 0.5); vec3 b = vec3(0.5, 0.5, 0.5); vec3 c = vec3(1.0, 1.0, 1.0); vec3 d = vec3(0.263,0.416,0.557); return a + b*cos(6.28318*(c*t+d)); } void main() { vec2 uv = (2.0 * gl_FragCoord.xy - u_resolution.xy) / u_resolution.y; float zoom = exp(-u_time * u_speed); uv *= zoom; vec2 c = uv; vec2 z = vec2(0.0); float n = 0.0; for(int i = 0; i < 200; i++) { if(float(i) >= u_iterations) break; if(length(z) > 2.0) break; z = complexMul(z, z) + c; n++; } float t = n / u_iterations; vec3 col = palette(t); gl_FragColor = vec4(col, 1.0); }`,
  },
  "Plasma-Storm": {
    name: "プラズマストーム",
    uniforms: {
      u_speed: { type: "f", value: 1.0, min: 0.0, max: 3.0, name: "速度" },
      u_scale: { type: "f", value: 3.0, min: 0.5, max: 10.0, name: "スケール" },
      u_intensity: { type: "f", value: 1.5, min: 0.1, max: 3.0, name: "強度" },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_scale; uniform float u_intensity; void main() { vec2 uv = gl_FragCoord.xy / u_resolution.xy; vec2 p = uv * u_scale; float time = u_time * u_speed; float plasma = sin(p.x + time) + sin(p.y + time * 0.7) + sin((p.x + p.y) * 0.8 + time * 1.2) + sin(length(p - vec2(sin(time * 0.3), cos(time * 0.5))) * 2.0 + time * 2.0); plasma *= u_intensity; vec3 color = vec3(sin(plasma), sin(plasma + 2.0), sin(plasma + 4.0)) * 0.5 + 0.5; gl_FragColor = vec4(color, 1.0); }`,
  },
  "Matrix-Rain": {
    name: "マトリックス",
    uniforms: {
      u_speed: { type: "f", value: 2.0, min: 0.1, max: 5.0, name: "速度" },
      u_columns: {
        type: "f",
        value: 40.0,
        min: 10.0,
        max: 100.0,
        step: 1.0,
        name: "列数",
      },
      u_brightness: { type: "f", value: 0.8, min: 0.1, max: 2.0, name: "明度" },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_columns; uniform float u_brightness; float random(vec2 p) { return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453); } void main() { vec2 uv = gl_FragCoord.xy / u_resolution.xy; vec2 grid = vec2(u_columns, u_columns * u_resolution.y / u_resolution.x); vec2 id = floor(uv * grid); vec2 gv = fract(uv * grid); float time = u_time * u_speed; float drop = random(id) * 20.0 - time; drop = fract(drop); float brightness = 1.0 - drop; brightness = pow(brightness, 3.0); vec3 color = vec3(0.0, brightness, 0.0) * u_brightness; float fade = 1.0 - uv.y; color *= fade; gl_FragColor = vec4(color, 1.0); }`,
  },
  "Neon-City": {
    name: "ネオンシティ",
    uniforms: {
      u_speed: { type: "f", value: 0.5, min: 0.0, max: 3.0, name: "速度" },
      u_buildings: {
        type: "f",
        value: 20.0,
        min: 5.0,
        max: 50.0,
        step: 1.0,
        name: "ビル数",
      },
      u_neonIntensity: {
        type: "f",
        value: 1.5,
        min: 0.5,
        max: 3.0,
        name: "ネオン強度",
      },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_buildings; uniform float u_neonIntensity; float random(vec2 p) { return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453); } vec3 neonColor(float t) { return vec3(sin(t), sin(t + 2.0), sin(t + 4.0)) * 0.5 + 0.5; } void main() { vec2 uv = gl_FragCoord.xy / u_resolution.xy; uv.x *= u_resolution.x / u_resolution.y; vec2 grid = vec2(u_buildings, u_buildings * 0.3); vec2 id = floor(uv * grid); vec2 gv = fract(uv * grid) - 0.5; float height = random(id) * 0.8 + 0.2; float building = step(gv.y + 0.5, height); vec3 color = vec3(0.0); if(building > 0.5) { float windows = step(0.8, fract(gv.x * 8.0 + sin(u_time * u_speed + id.x) * 0.5)) * step(0.8, fract(gv.y * 20.0)); vec3 neon = neonColor(u_time * u_speed * 2.0 + id.x + id.y); color = vec3(0.1, 0.1, 0.2) + windows * neon * u_neonIntensity; } vec3 skyline = vec3(0.05, 0.0, 0.1); color = mix(skyline, color, building); gl_FragColor = vec4(color, 1.0); }`,
  },
  "Galaxy-Spiral": {
    name: "ギャラクシー",
    uniforms: {
      u_speed: { type: "f", value: 0.3, min: 0.0, max: 2.0, name: "回転速度" },
      u_arms: {
        type: "f",
        value: 3.0,
        min: 1.0,
        max: 8.0,
        step: 1.0,
        name: "腕の数",
      },
      u_brightness: { type: "f", value: 1.2, min: 0.5, max: 3.0, name: "明度" },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_arms; uniform float u_brightness; float noise(vec2 p) { return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453); } void main() { vec2 uv = (2.0 * gl_FragCoord.xy - u_resolution.xy) / u_resolution.y; float len = length(uv); float angle = atan(uv.y, uv.x) + u_time * u_speed; float spiral = sin(angle * u_arms - len * 8.0 + u_time) * exp(-len * 0.8); float stars = 0.0; for(int i = 0; i < 50; i++) { vec2 starPos = vec2(noise(vec2(float(i), 0.0)), noise(vec2(float(i), 1.0))) * 4.0 - 2.0; float starDist = length(uv - starPos); stars += 1.0 / (1.0 + starDist * 100.0); } vec3 galaxyColor = vec3(0.8, 0.4, 1.0) * max(0.0, spiral) * u_brightness; vec3 starColor = vec3(1.0, 1.0, 0.8) * stars; vec3 nebula = vec3(0.2, 0.1, 0.4) * (1.0 - len); gl_FragColor = vec4(galaxyColor + starColor + nebula, 1.0); }`,
  },
  "Electric-Web": {
    name: "エレクトリックウェブ",
    uniforms: {
      u_speed: { type: "f", value: 1.0, min: 0.0, max: 3.0, name: "速度" },
      u_density: { type: "f", value: 8.0, min: 2.0, max: 20.0, name: "密度" },
      u_electricity: {
        type: "f",
        value: 2.0,
        min: 0.5,
        max: 5.0,
        name: "電気強度",
      },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_density; uniform float u_electricity; float random(vec2 p) { return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453); } float electricNoise(vec2 p, float time) { return sin(p.x * 10.0 + time) * sin(p.y * 10.0 + time * 0.7) * sin(length(p) * 5.0 + time * 2.0); } void main() { vec2 uv = gl_FragCoord.xy / u_resolution.xy; vec2 grid = vec2(u_density); vec2 id = floor(uv * grid); vec2 gv = fract(uv * grid) - 0.5; vec3 color = vec3(0.0); float time = u_time * u_speed; for(int x = -1; x <= 1; x++) { for(int y = -1; y <= 1; y++) { vec2 offset = vec2(float(x), float(y)); vec2 nodeId = id + offset; vec2 nodePos = offset + sin(time + nodeId.x + nodeId.y) * 0.3; float dist = length(gv - nodePos); float connection = 1.0 / (1.0 + dist * 20.0); float electric = electricNoise(nodeId, time) * u_electricity; vec3 nodeColor = vec3(0.0, 0.5 + electric * 0.5, 1.0) * connection; if(x == 0 && y == 0) { nodeColor *= 2.0; } color += nodeColor; } } color *= 0.3; gl_FragColor = vec4(color, 1.0); }`,
  },
  "Rainbow-Waves": {
    name: "レインボーウェーブ",
    uniforms: {
      u_speed: { type: "f", value: 1.0, min: 0.0, max: 3.0, name: "速度" },
      u_frequency: {
        type: "f",
        value: 5.0,
        min: 1.0,
        max: 20.0,
        name: "周波数",
      },
      u_amplitude: { type: "f", value: 0.5, min: 0.1, max: 2.0, name: "振幅" },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_frequency; uniform float u_amplitude; vec3 hsv2rgb(vec3 c) { vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); } void main() { vec2 uv = gl_FragCoord.xy / u_resolution.xy; float time = u_time * u_speed; float wave1 = sin(uv.x * u_frequency + time) * u_amplitude; float wave2 = sin(uv.y * u_frequency * 0.7 + time * 1.3) * u_amplitude; float wave3 = sin((uv.x + uv.y) * u_frequency * 0.5 + time * 0.8) * u_amplitude; float combined = (wave1 + wave2 + wave3) * 0.33 + 0.5; float hue = combined + time * 0.1; vec3 color = hsv2rgb(vec3(hue, 0.8, 1.0)); gl_FragColor = vec4(color, 1.0); }`,
  },
  "Cosmic-Dust": {
    name: "コズミックダスト",
    uniforms: {
      u_speed: { type: "f", value: 0.5, min: 0.0, max: 2.0, name: "速度" },
      u_particles: {
        type: "f",
        value: 100.0,
        min: 20.0,
        max: 300.0,
        step: 1.0,
        name: "粒子数",
      },
      u_glow: { type: "f", value: 1.5, min: 0.5, max: 3.0, name: "グロー" },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_particles; uniform float u_glow; float random(vec2 p) { return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453); } vec3 cosmicColor(float t) { return vec3(0.5 + 0.5 * sin(t), 0.3 + 0.3 * sin(t + 2.0), 0.8 + 0.2 * sin(t + 4.0)); } void main() { vec2 uv = (2.0 * gl_FragCoord.xy - u_resolution.xy) / u_resolution.y; vec3 color = vec3(0.0); float time = u_time * u_speed; for(int i = 0; i < 300; i++) { if(float(i) >= u_particles) break; vec2 seed = vec2(float(i) * 0.1, float(i) * 0.2); vec2 pos = (vec2(random(seed), random(seed + 1.0)) - 0.5) * 3.0; pos += vec2(sin(time + float(i)), cos(time * 0.7 + float(i))) * 0.2; float dist = length(uv - pos); float size = random(seed + 2.0) * 0.02 + 0.005; float particle = size / (dist + size); particle = pow(particle, u_glow); vec3 particleColor = cosmicColor(time + float(i) * 0.1); color += particle * particleColor * 0.5; } vec3 nebula = vec3(0.1, 0.05, 0.2) * (1.0 - length(uv) * 0.5); color += nebula; gl_FragColor = vec4(color, 1.0); }`,
  },
  "Digital-Rain": {
    name: "デジタルレイン",
    uniforms: {
      u_speed: { type: "f", value: 2.5, min: 0.5, max: 5.0, name: "速度" },
      u_density: {
        type: "f",
        value: 30.0,
        min: 10.0,
        max: 80.0,
        step: 1.0,
        name: "密度",
      },
      u_glitch: { type: "f", value: 0.1, min: 0.0, max: 0.5, name: "グリッチ" },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_density; uniform float u_glitch; float random(vec2 p) { return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453); } void main() { vec2 uv = gl_FragCoord.xy / u_resolution.xy; vec2 grid = vec2(u_density, u_density * 2.0); vec2 id = floor(uv * grid); vec2 gv = fract(uv * grid); float time = u_time * u_speed; float rain = random(id + floor(time)) * 2.0 - time; rain = fract(rain); float digit = step(0.5, random(id + floor(time * 10.0))); vec3 color = vec3(0.0); if(rain > 0.9) { color = vec3(0.0, 1.0, 0.5) * (1.0 - rain * 10.0 + 9.0); } else if(rain > 0.1) { color = vec3(0.0, 0.3, 0.1) * (1.0 - rain); } float glitchEffect = step(0.98, random(uv + time)) * u_glitch; color += vec3(glitchEffect, 0.0, glitchEffect); gl_FragColor = vec4(color, 1.0); }`,
  },
  "Hologram-Glitch": {
    name: "ホログラムグリッチ",
    uniforms: {
      u_speed: { type: "f", value: 1.5, min: 0.0, max: 3.0, name: "速度" },
      u_distortion: {
        type: "f",
        value: 0.02,
        min: 0.0,
        max: 0.1,
        name: "歪み",
      },
      u_lines: {
        type: "f",
        value: 50.0,
        min: 10.0,
        max: 200.0,
        name: "スキャンライン",
      },
    },
    needsInput: true,
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform sampler2D u_inputTexture; uniform float u_speed; uniform float u_distortion; uniform float u_lines; varying vec2 vUv; float random(vec2 co) { return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453); } void main() { vec2 uv = vUv; float time = u_time * u_speed; float glitch = random(vec2(time, 0.0)); if(glitch > 0.95) { uv.x += (random(vec2(time, uv.y)) - 0.5) * u_distortion; } float scanline = sin(uv.y * u_lines + time * 10.0) * 0.1 + 0.9; vec4 color = texture2D(u_inputTexture, uv); color.rgb *= scanline; color.rgb = mix(color.rgb, vec3(0.0, 1.0, 1.0), 0.1); float noise = random(uv + time) * 0.1; color.rgb += noise; gl_FragColor = color; }`,
  },
  Kaleidoscope: {
    name: "カレイドスコープ",
    uniforms: {
      u_sides: {
        type: "f",
        value: 6.0,
        min: 2.0,
        max: 20.0,
        step: 1.0,
        name: "分割数",
      },
      u_angle: { type: "f", value: 0.0, min: 0.0, max: 360.0, name: "回転" },
    },
    needsInput: true,
    fragmentShader: `uniform vec2 u_resolution;uniform sampler2D u_inputTexture; uniform float u_sides;uniform float u_angle;const float PI = 3.14159265359;void main() {vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);float angleRad = radians(u_angle);uv = mat2(cos(angleRad), -sin(angleRad), sin(angleRad), cos(angleRad)) * uv;float a = atan(uv.y, uv.x);float r = length(uv);float slice = PI / u_sides;a = mod(a, slice * 2.0) - slice;vec2 newUv = r * vec2(cos(a), sin(a));newUv = (newUv * min(u_resolution.x, u_resolution.y) + u_resolution.xy) / (2.0 * u_resolution.xy);gl_FragColor = texture2D(u_inputTexture, newUv);}`,
  },
  "Crystal-Cave": {
    name: "クリスタルケーブ",
    uniforms: {
      u_speed: { type: "f", value: 0.4, min: 0.0, max: 2.0, name: "速度" },
      u_reflections: {
        type: "f",
        value: 3.0,
        min: 1.0,
        max: 8.0,
        step: 1.0,
        name: "反射回数",
      },
      u_crystal_size: {
        type: "f",
        value: 0.1,
        min: 0.05,
        max: 0.3,
        name: "クリスタルサイズ",
      },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_reflections; uniform float u_crystal_size; float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); } float voronoi(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); float res = 8.0; for(int y = -1; y <= 1; y++) { for(int x = -1; x <= 1; x++) { vec2 neighbor = vec2(float(x), float(y)); vec2 point = 0.5 + 0.5 * sin(vec2(u_time * u_speed) + 6.2831 * vec2(hash(i + neighbor), hash(i + neighbor + vec2(1.0, 0.0)))); float dist = length(neighbor + point - f); res = min(res, dist); } } return res; } void main() { vec2 uv = gl_FragCoord.xy / u_resolution.xy; vec2 p = uv * 8.0; float crystal = voronoi(p); crystal = smoothstep(u_crystal_size, u_crystal_size + 0.05, crystal); vec3 color = vec3(0.1, 0.2, 0.4); for(float i = 1.0; i <= u_reflections; i++) { float layer = voronoi(p * i + vec2(u_time * u_speed * 0.5)); layer = 1.0 - smoothstep(0.0, 0.1, layer); vec3 crystalColor = vec3(0.5 + 0.5 * sin(i + u_time), 0.3 + 0.7 * cos(i + u_time * 0.7), 0.8); color += layer * crystalColor * (1.0 / i); } color *= (1.0 - crystal * 0.5); gl_FragColor = vec4(color, 1.0); }`,
  },
  "Aurora-Borealis": {
    name: "オーロラ",
    uniforms: {
      u_speed: { type: "f", value: 0.8, min: 0.0, max: 3.0, name: "速度" },
      u_waves: {
        type: "f",
        value: 3.0,
        min: 1.0,
        max: 8.0,
        name: "ウェーブ数",
      },
      u_intensity: { type: "f", value: 1.5, min: 0.5, max: 3.0, name: "強度" },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_waves; uniform float u_intensity; float noise(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); } float fbm(vec2 p) { float value = 0.0; float amplitude = 0.5; for(int i = 0; i < 4; i++) { value += amplitude * noise(p); p *= 2.0; amplitude *= 0.5; } return value; } void main() { vec2 uv = gl_FragCoord.xy / u_resolution.xy; vec2 p = uv * u_waves; float time = u_time * u_speed; float aurora = 0.0; for(int i = 0; i < 3; i++) { float wave = sin(p.x + time + float(i) * 2.0) * 0.1; aurora += exp(-abs(p.y - 0.5 - wave * fbm(p + time * 0.3)) * 8.0); } vec3 color1 = vec3(0.0, 1.0, 0.5); vec3 color2 = vec3(0.5, 0.0, 1.0); vec3 color3 = vec3(1.0, 0.2, 0.8); vec3 finalColor = mix(color1, color2, sin(time + p.x) * 0.5 + 0.5); finalColor = mix(finalColor, color3, cos(time * 0.7 + p.y) * 0.5 + 0.5); finalColor *= aurora * u_intensity; vec3 stars = vec3(noise(p * 50.0) > 0.98 ? 1.0 : 0.0); finalColor += stars * 0.5; gl_FragColor = vec4(finalColor, 1.0); }`,
  },
  "Fire-Storm": {
    name: "ファイアストーム",
    uniforms: {
      u_speed: { type: "f", value: 1.5, min: 0.0, max: 4.0, name: "速度" },
      u_intensity: {
        type: "f",
        value: 2.0,
        min: 0.5,
        max: 4.0,
        name: "炎の強度",
      },
      u_turbulence: { type: "f", value: 0.5, min: 0.0, max: 2.0, name: "乱流" },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_intensity; uniform float u_turbulence; float noise(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); } float fbm(vec2 p) { float value = 0.0; float amplitude = 0.5; float frequency = 1.0; for(int i = 0; i < 6; i++) { value += amplitude * noise(p * frequency); frequency *= 2.0; amplitude *= 0.5; } return value; } void main() { vec2 uv = gl_FragCoord.xy / u_resolution.xy; vec2 p = uv * 4.0; float time = u_time * u_speed; p.y -= time * 0.5; p.x += sin(time + p.y) * u_turbulence; float fire = fbm(p); fire = pow(fire, 2.0); fire *= smoothstep(0.0, 0.3, uv.y); fire *= smoothstep(1.0, 0.7, uv.y); vec3 fireColor = vec3(1.0, 0.5, 0.0); vec3 hotColor = vec3(1.0, 1.0, 0.3); vec3 darkColor = vec3(0.5, 0.0, 0.0); vec3 color = mix(darkColor, fireColor, fire); color = mix(color, hotColor, fire * fire); color *= u_intensity; gl_FragColor = vec4(color, 1.0); }`,
  },
  "Cyber-Grid": {
    name: "サイバーグリッド",
    uniforms: {
      u_speed: { type: "f", value: 1.0, min: 0.0, max: 3.0, name: "速度" },
      u_grid_size: {
        type: "f",
        value: 20.0,
        min: 5.0,
        max: 50.0,
        name: "グリッドサイズ",
      },
      u_pulse: {
        type: "f",
        value: 1.5,
        min: 0.5,
        max: 3.0,
        name: "パルス強度",
      },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_grid_size; uniform float u_pulse; void main() { vec2 uv = gl_FragCoord.xy / u_resolution.xy; vec2 grid = uv * u_grid_size; vec2 gridId = floor(grid); vec2 gridUv = fract(grid); float time = u_time * u_speed; float pulse = sin(time + gridId.x + gridId.y) * 0.5 + 0.5; pulse = pow(pulse, u_pulse); float gridLines = 0.0; if(gridUv.x < 0.05 || gridUv.x > 0.95 || gridUv.y < 0.05 || gridUv.y > 0.95) { gridLines = 1.0; } float centerDist = length(gridUv - 0.5); float node = 1.0 - smoothstep(0.1, 0.2, centerDist); vec3 color = vec3(0.0, 0.5, 1.0) * gridLines * 0.3; color += vec3(0.0, 1.0, 1.0) * node * pulse; color += vec3(1.0, 0.0, 1.0) * pulse * 0.1; gl_FragColor = vec4(color, 1.0); }`,
  },
  "Feedback-Zoom": {
    name: "フィードバックズーム",
    uniforms: {
      u_zoom: { type: "f", value: 0.98, min: 0.9, max: 1.0, name: "ズーム" },
      u_mix: { type: "f", value: 0.02, min: 0.01, max: 0.1, name: "ミックス" },
    },
    needsInput: true,
    isFeedback: true,
    fragmentShader: `uniform vec2 u_resolution;uniform sampler2D u_prevLayer; uniform sampler2D u_inputTexture; uniform float u_zoom;uniform float u_mix; void main() {vec2 uv = gl_FragCoord.xy / u_resolution; vec2 zoom_uv = (uv - 0.5) * u_zoom + 0.5; vec4 prev_frame = texture2D(u_prevLayer, zoom_uv); vec4 current_input = texture2D(u_inputTexture, uv); vec4 result = mix(prev_frame, current_input, u_mix); if(current_input.a == 0.0){ result = prev_frame; } gl_FragColor = vec4(result.rgb, 1.0);}`,
  },
  "Psy-Rings": {
    name: "サイケリング",
    uniforms: {
      u_frequency: {
        type: "f",
        value: 10.0,
        min: 1.0,
        max: 50.0,
        name: "周波数",
      },
      u_speed: { type: "f", value: 2.0, min: 0.0, max: 10.0, name: "速度" },
    },
    fragmentShader: `precision highp float; uniform vec2 u_resolution; uniform float u_time; uniform float u_frequency; uniform float u_speed; void main() { vec2 st = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y); float d = length(st); float wave = sin(d * u_frequency - u_time * u_speed); float ring = smoothstep(0.4, 0.45, wave) - smoothstep(0.5, 0.55, wave); gl_FragColor = vec4(vec3(ring), 1.0); }`,
  },
  "Hyper-Tunnel": {
    name: "Hyper Tunnel",
    uniforms: {
      u_speed: { type: "f", value: 0.5, min: 0.0, max: 4.0, name: "速度" },
      u_frequency: {
        type: "f",
        value: 4.0,
        min: 0.1,
        max: 20.0,
        name: "周波数",
      },
      u_color_speed: {
        type: "f",
        value: 0.3,
        min: 0.0,
        max: 2.0,
        name: "色彩速度",
      },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_frequency; uniform float u_color_speed; vec3 palette( float t ) { vec3 a = vec3(0.5, 0.5, 0.5); vec3 b = vec3(0.5, 0.5, 0.5); vec3 c = vec3(1.0, 1.0, 1.0); vec3 d = vec3(0.263,0.416,0.557); return a + b*cos( 6.28318*(c*t+d) ); } void main() { vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y; vec2 uv0 = uv; vec3 finalColor = vec3(0.0); for (float i = 0.0; i < 4.0; i++) { uv = fract(uv * 1.5) - 0.5; float d = length(uv) * exp(-length(uv0)); vec3 col = palette(length(uv0) + i*.4 + u_time*u_color_speed); d = sin(d*u_frequency + u_time*u_speed)/u_frequency; d = abs(d); d = pow(0.01 / d, 1.2); finalColor += col * d; } gl_FragColor = vec4(finalColor, 1.0); }`,
  },
  "Laser-Grid": {
    name: "レーザーグリッド",
    uniforms: {
      u_speed: { type: "f", value: 0.4, min: 0.0, max: 2.0, name: "速度" },
      u_density: { type: "f", value: 10.0, min: 1.0, max: 50.0, name: "密度" },
      u_brightness: {
        type: "f",
        value: 0.02,
        min: 0.001,
        max: 0.1,
        name: "輝度",
      },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_density; uniform float u_brightness; void main() { vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y; vec3 color = vec3(0.0); vec3 a = vec3(0.0, 0.5, 1.0); vec3 b = vec3(1.0, 0.5, 0.0); float t = -u_time * u_speed; uv.y += 0.5; if (uv.y < 0.0) discard; vec2 pos = vec2(uv.x / uv.y, 1.0 / uv.y); pos.y += t; vec2 gv = fract(pos * u_density) - 0.5; vec2 id = floor(pos * u_density); float n = fract(sin(id.x) * 20.0); float c = (1.0 - smoothstep(0.0, 0.1, abs(gv.x))) * step(0.9, n); c += (1.0 - smoothstep(0.0, 0.1, abs(gv.y))); color = mix(a, b, fract(pos.y / 2.0)) * c; gl_FragColor = vec4(color / uv.y * u_brightness, 1.0); }`,
  },
  "Warp-Drive": {
    name: "ワープドライブ",
    uniforms: {
      u_speed: { type: "f", value: 5.0, min: 0.0, max: 20.0, name: "速度" },
      u_density: {
        type: "f",
        value: 0.995,
        min: 0.9,
        max: 0.999,
        name: "密度",
      },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_density; float random(vec2 p){return fract(sin(dot(p.xy,vec2(12.9898,78.233)))*43758.5453);} void main() { vec2 uv = (2.0*gl_FragCoord.xy-u_resolution.xy)/u_resolution.y; vec3 col = vec3(0); for(int i=0; i<10; i++) { float z = u_time * u_speed + float(i); z = fract(z); vec2 p = uv / z; p += float(i) * 10.0; if(random(floor(p)) > u_density) { float d = length(fract(p) - 0.5); col += vec3(1.0) * (1.0-z) * (1.0 - smoothstep(0.0, 0.2, d)); } } gl_FragColor = vec4(col,1.0); }`,
  },
  "Liquid-Metal": {
    name: "リキッドメタル",
    uniforms: {
      u_speed: { type: "f", value: 0.2, min: 0.0, max: 2.0, name: "速度" },
      u_frequency: {
        type: "f",
        value: 2.0,
        min: 0.1,
        max: 10.0,
        name: "周波数",
      },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_frequency; vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; } vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; } vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); } vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; } float snoise(vec3 v) { const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0); vec3 i = floor(v + dot(v, C.yyy) ); vec3 x0 = v - i + dot(i, C.xxx); vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min( g.xyz, l.zxy ); vec3 i2 = max( g.xyz, l.zxy ); vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy; i = mod289(i); vec4 p = permute( permute( permute( i.z + vec4(0.0, i1.z, i2.z, 1.0 )) + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) + i.x + vec4(0.0, i1.x, i2.x, 1.0 )); float n; vec3 ns = D.wyz - D.xzx; vec4 j = p - 49.0 * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_ ); vec4 x = x_ *ns.x + ns.yyyy; vec4 y = y_ *ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y); vec4 b0 = vec4( x.xy, y.xy ); vec4 b1 = vec4( x.zw, y.zw ); vec4 s0 = floor(b0)*2.0 + 1.0; vec4 s1 = floor(b1)*2.0 + 1.0; vec4 sh = -step(h, vec4(0.0)); vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ; vec3 p0 = vec3(a0.xy,h.x); vec3 p1 = vec3(a0.zw,h.y); vec3 p2 = vec3(a1.xy,h.z); vec3 p3 = vec3(a1.zw,h.w); vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3))); p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w; vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0); m = m * m; return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) ); } void main() { vec2 uv = gl_FragCoord.xy/u_resolution.xy; float t = u_time * u_speed; float n = snoise(vec3(uv * u_frequency, t)); vec3 normal = normalize(vec3(dFdx(n), dFdy(n), 0.1)); vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0)); float diffuse = max(0.0, dot(normal, lightDir)); vec3 eyeDir = normalize(vec3(0.0, 0.0, 1.0)); vec3 halfDir = normalize(lightDir + eyeDir); float specular = pow(max(0.0, dot(normal, halfDir)), 128.0); vec3 iridescent = vec3(0.5+0.5*sin(n*5.0+0.0+t), 0.5+0.5*sin(n*5.0+2.0+t), 0.5+0.5*sin(n*5.0+4.0+t)); gl_FragColor = vec4(iridescent * (diffuse * 0.5 + 0.5) + specular * 0.8, 1.0); }`,
  },
  "Hex-Grid": {
    name: "ヘックスグリッド",
    uniforms: {
      u_speed: { type: "f", value: 0.3, min: 0.0, max: 2.0, name: "速度" },
      u_scale: { type: "f", value: 8.0, min: 1.0, max: 30.0, name: "スケール" },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_scale; const vec2 s = vec2(1.0, 1.732); vec3 h2rgb(float h){vec3 rgb = clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0); return rgb*rgb*(3.0-2.0*rgb);} void main() { vec2 p = (2.0*gl_FragCoord.xy-u_resolution.xy)/u_resolution.y; vec2 p2 = p; p2.y /= s.y; vec2 p3 = p2; p3.x -= 0.5 * p3.y; p2.x += 0.5 * p2.y; vec2 i = floor(vec2(p2.x, p3.y)); vec2 f = fract(vec2(p2.x, p3.y)); float d = 1.0; vec2 b; for(int j=0; j<2; j++){ for(int k=0; k<2; k++){ vec2 g = vec2(float(j),float(k)); float D = length(f-g); if(D<d){ d=D; b=g;} } } i += b; i = mod(i, u_scale); float c = sin(i.x*0.5+i.y*0.2+u_time*u_speed) * 0.5 + 0.5; float e = smoothstep(0.4, 0.45, d); gl_FragColor = vec4(h2rgb(c) * e,1.0);}`,
  },
  "Voronoi-Rift": {
    name: "ヴォロノイリフト",
    uniforms: {
      u_speed: { type: "f", value: 0.2, min: 0.0, max: 1.0, name: "速度" },
      u_scale: { type: "f", value: 5.0, min: 1.0, max: 20.0, name: "スケール" },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_scale; vec2 random2(vec2 p) { return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); } void main() { vec2 st = gl_FragCoord.xy/u_resolution.xy; st *= u_scale; vec2 i_st = floor(st); vec2 f_st = fract(st); float m_dist = 1.; for (int y= -1; y <= 1; y++) { for (int x= -1; x <= 1; x++) { vec2 neighbor = vec2(float(x),float(y)); vec2 point = random2(i_st + neighbor); point = 0.5 + 0.5*sin(vec2(u_time * u_speed) + 6.2831*point); float dist = length(neighbor + point - f_st); m_dist = min(m_dist, dist); } } float c = 1.0 - smoothstep(0.01, 0.02, m_dist); vec3 color = vec3(c*c, c*c*0.5, c); gl_FragColor = vec4(color, 1.0);}`,
  },
  "Cyber-Orb": {
    name: "サイバーオーブ",
    uniforms: {
      u_speed: { type: "f", value: 0.3, min: 0.0, max: 2.0, name: "速度" },
      u_distortion: { type: "f", value: 0.5, min: 0.0, max: 5.0, name: "歪み" },
    },
    fragmentShader: `uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_distortion; mat2 rot(float a) { float s=sin(a), c=cos(a); return mat2(c,-s,s,c); } float sdBox( vec3 p, vec3 b ) { vec3 q = abs(p) - b; return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0); } float sdTorus( vec3 p, vec2 t ) { vec2 q = vec2(length(p.xz)-t.x,p.y); return length(q)-t.y; } float opSmoothUnion( float d1, float d2, float k ) { float h = clamp( 0.5 + 0.5*(d2-d1)/k, 0.0, 1.0 ); return mix( d2, d1, h ) - k*h*(1.0-h); } float map(vec3 p) { float sphere = length(p) - (1.0 + 0.2 * sin(u_time * 2.0 * u_speed)); vec3 q = p; q.xy *= rot(u_time * 0.5 * u_speed); q.yz *= rot(u_time * 0.3 * u_speed); q.z = mod(q.z, 2.0) - 1.0; q.x = mod(q.x, 2.0) - 1.0; float boxes = sdBox(q, vec3(0.2)); vec3 r = p; r.yz *= rot(u_time * 0.1 * u_speed); float torus = sdTorus(r, vec2(1.5, 0.1)); float final_dist = opSmoothUnion(sphere, boxes, 0.5); final_dist = opSmoothUnion(final_dist, torus, 0.8); return final_dist; } vec3 getNormal(vec3 p) { vec2 e = vec2(0.001, 0); return normalize(vec3( map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx) )); } void main() { vec2 uv = (2.0 * gl_FragCoord.xy - u_resolution.xy) / u_resolution.y; vec3 ro = vec3(2.5 * sin(u_time * 0.2 * u_speed), 1.0, 2.5 * cos(u_time * 0.2 * u_speed)); vec3 target = vec3(0.0); vec3 fwd = normalize(target - ro); vec3 right = normalize(cross(vec3(0,1,0), fwd)); vec3 up = cross(fwd, right); vec3 rd = normalize(fwd + uv.x * right + uv.y * up); float t = 0.0; vec3 col = vec3(0.0); for (int i=0; i < 80; i++) { vec3 p = ro + rd * t; float d = map(p); if (d < 0.001) { vec3 n = getNormal(p); vec3 lightDir = normalize(vec3(0.5, 1.0, -0.5)); float diff = max(dot(n, lightDir), 0.1); float specular = pow(max(dot(reflect(rd, n), lightDir), 0.0), 32.0); vec3 p_col = 0.5 + 0.5 * cos(u_time * 0.5 + p.zxy * u_distortion + vec3(0,2,4)); col = p_col * diff + vec3(1.0) * specular * 0.5; break; } t += d; if (t > 20.0) break; } col = pow(col, vec3(0.4545)); gl_FragColor = vec4(col, 1.0); }`,
  },
};

class VJApp {
  constructor() {
    // Core properties
    this.renderWidth = 1920;
    this.renderHeight = 1080;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.renderWidth, this.renderHeight);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene.add(this.quad);
    this.clock = new THREE.Clock();
    this.activeLayers = [];
    this.sceneData = [];
    this.allScenesLayers = [];
    this.currentSceneIndex = -1;
    this.globalSpeed = 1.0;
    this.time = 0;
    this.customShaders = {};
    this.bpm = 120;
    this.isSequenceMode = false;
    this.sequence = [];
    this.sequenceIndex = 0;
    this.lastBeatTime = 0;
    this.popupWindow = null;
    this.popupCanvasCtx = null;
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    this.selectedLayerIndex = -1;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.renderTargets = [
      new THREE.WebGLRenderTarget(this.renderWidth, this.renderHeight),
      new THREE.WebGLRenderTarget(this.renderWidth, this.renderHeight),
    ];
    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: { u_texture: { value: null } },
      vertexShader: this.getVertexShader(),
      fragmentShader: `uniform sampler2D u_texture; varying vec2 vUv; void main() { gl_FragColor = texture2D(u_texture, vUv); }`,
    });
    this.compositorMat = new THREE.ShaderMaterial(this.getCompositorShader());

    // Editor Instances
    this.customShaderEditor = null;
    this.customUniformsEditor = null;
    this.liveCodeEditor = null;
    this.liveUniformsEditor = null;

    // NEW: Preview Canvas Context
    this.previewCtx = null;
    this.popupWarningEl = null;

    require.config({
      paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" },
    });
    require(["vs/editor/editor.main"], () => {
      this.initUI();
      this.loadProjectFromStorage();
      this.populateShaderList();
      this.animate();
    });
  }

  initMonacoEditor(containerId, language, initialValue = "") {
    const editorOptions = {
      value: initialValue,
      language: language,
      theme: "vs-dark",
      automaticLayout: true,
      fontSize: 13,
      fontFamily: "JetBrains Mono, monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: "on",
      renderWhitespace: "selection",
      lineNumbers: "on",
      glyphMargin: false,
      folding: true,
      bracketPairColorization: { enabled: true },
      scrollbar: { vertical: "auto", horizontal: "auto" },
    };
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Monaco container #${containerId} not found.`);
      return null;
    }
    return monaco.editor.create(container, editorOptions);
  }

  initUI() {
    this.createParticleBackground();

    document.getElementById("launch-btn").addEventListener(
      "click",
      () => {
        document
          .getElementById("launch-screen")
          .classList.add("opacity-0", "pointer-events-none");
        document.getElementById("main-ui").classList.remove("hidden");

        const previewCanvas = document.getElementById("main-preview-canvas");
        if (previewCanvas) {
          previewCanvas.width = this.renderWidth / 4;
          previewCanvas.height = this.renderHeight / 4;
          this.previewCtx = previewCanvas.getContext("2d");
        }
        this.checkPopupWindowStatus();
      },
      { once: true },
    );

    const addClickListener = (id, callback) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener("click", callback);
      }
    };

    Sortable.create(document.getElementById("layer-stack"), {
      animation: 150,
      ghostClass: "sortable-ghost",
      onEnd: (evt) => {
        const l = this.activeLayers.splice(evt.oldIndex, 1)[0];
        this.activeLayers.splice(evt.newIndex, 0, l);
        this.saveCurrentScene();
      },
    });
    Sortable.create(document.getElementById("sequence-list"), {
      animation: 150,
      ghostClass: "sortable-ghost",
      onEnd: (evt) => {
        const item = this.sequence.splice(evt.oldIndex, 1)[0];
        this.sequence.splice(evt.newIndex, 0, item);
      },
    });

    document
      .getElementById("import-file-input")
      ?.addEventListener("change", this.importProject.bind(this));
    addClickListener("export-project-btn", this.exportProject.bind(this));
    addClickListener("import-project-btn", () =>
      document.getElementById("import-file-input").click(),
    );

    document.getElementById("bpm-input")?.addEventListener("change", (e) => {
      this.bpm = parseFloat(e.target.value) || 120;
      this.saveProjectToStorage();
    });
    addClickListener("start-sequence-btn", this.toggleSequenceMode.bind(this));

    addClickListener("add-layer-btn", () => this.showModal("add-layer-modal"));
    addClickListener("close-modal-btn", () =>
      this.hideModal("add-layer-modal"),
    );
    addClickListener("add-layer-modal", (e) => {
      if (e.target.id === "add-layer-modal") this.hideModal("add-layer-modal");
    });

    addClickListener("open-custom-shader-modal-btn", () => {
      this.showModal("custom-shader-modal");
      if (!this.customShaderEditor)
        this.customShaderEditor = this.initMonacoEditor(
          "custom-shader-code-editor-container",
          "glsl",
          "void main() {\n  gl_FragColor = vec4(vUv, 0.5, 1.0);\n}",
        );
      if (!this.customUniformsEditor)
        this.customUniformsEditor = this.initMonacoEditor(
          "custom-shader-uniforms-editor-container",
          "json",
          '{\n  "u_speed": { "type": "f", "value": 0.5, "min": 0, "max": 2, "name": "速度" }\n}',
        );
    });
    addClickListener("close-custom-modal-btn", () =>
      this.hideModal("custom-shader-modal"),
    );
    addClickListener("custom-shader-modal", (e) => {
      if (e.target.id === "custom-shader-modal")
        this.hideModal("custom-shader-modal");
    });
    addClickListener(
      "save-custom-shader-btn",
      this.saveCustomShader.bind(this),
    );

    addClickListener("close-live-code-btn", () =>
      this.hideModal("live-code-modal"),
    );
    addClickListener("apply-live-code-btn", this.applyLiveCode.bind(this));

    addClickListener("save-rename-scene-btn", this.applySceneRename.bind(this));
    addClickListener("cancel-rename-scene-btn", () =>
      this.hideModal("rename-scene-modal"),
    );
    addClickListener("rename-scene-modal", (e) => {
      if (e.target.id === "rename-scene-modal")
        this.hideModal("rename-scene-modal");
    });

    addClickListener("reopen-window-btn", this.openPopupWindow.bind(this));
    addClickListener("record-btn", this.toggleRecording.bind(this));

    this.popupWarningEl = document.getElementById("popup-warning");
    setInterval(() => this.checkPopupWindowStatus(), 2000);
  }

  checkPopupWindowStatus() {
    if (!this.popupWarningEl) return;
    if (this.popupWindow && !this.popupWindow.closed) {
      this.popupWarningEl.style.display = "none";
    } else {
      this.popupWarningEl.style.display = "block";
    }
  }

  showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove("hidden");
    setTimeout(() => {
      modal.classList.remove("opacity-0");
      modal
        .querySelector(".modal-content")
        .classList.remove("scale-95", "opacity-0");
      setTimeout(() => {
        if (this.customShaderEditor && modalId === "custom-shader-modal")
          this.customShaderEditor.layout();
        if (this.customUniformsEditor && modalId === "custom-shader-modal")
          this.customUniformsEditor.layout();
        if (this.liveCodeEditor && modalId === "live-code-modal")
          this.liveCodeEditor.layout();
        if (this.liveUniformsEditor && modalId === "live-code-modal")
          this.liveUniformsEditor.layout();
      }, 310);
    }, 10);
  }
  hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add("opacity-0");
    modal
      .querySelector(".modal-content")
      .classList.add("scale-95", "opacity-0");
    setTimeout(() => {
      modal.classList.add("hidden");
      if (modalId === "custom-shader-modal") {
        if (this.customShaderEditor) {
          this.customShaderEditor.dispose();
          this.customShaderEditor = null;
        }
        if (this.customUniformsEditor) {
          this.customUniformsEditor.dispose();
          this.customUniformsEditor = null;
        }
      }
      if (modalId === "live-code-modal") {
        if (this.liveCodeEditor) {
          this.liveCodeEditor.dispose();
          this.liveCodeEditor = null;
        }
        if (this.liveUniformsEditor) {
          this.liveUniformsEditor.dispose();
          this.liveUniformsEditor = null;
        }
      }
    }, 300);
  }
  saveCustomShader() {
    const name = document.getElementById("custom-shader-name").value;
    if (!name) {
      alert("シェーダー名とコードは必須です。");
      return;
    }
    if (!this.customShaderEditor || !this.customUniformsEditor) {
      alert("エディタが初期化されていません。");
      return;
    }
    const code = this.customShaderEditor.getValue();
    const uniformsJSON = this.customUniformsEditor.getValue();
    let uniforms = {};
    try {
      if (uniformsJSON.trim()) uniforms = JSON.parse(uniformsJSON);
    } catch (e) {
      alert("UniformsのJSON形式が正しくありません。");
      return;
    }
    const key = `custom_${name.replace(/\s+/g, "_")}_${Date.now()}`;
    this.customShaders[key] = {
      name,
      uniforms,
      fragmentShader: code,
      needsInput: code.includes("u_inputTexture"),
      isFeedback: false,
    };
    this.saveProjectToStorage();
    this.populateShaderList();
    this.hideModal("custom-shader-modal");
  }
  openLiveCodeEditor(layerId) {
    const layer = this.activeLayers.find((l) => l.id === layerId);
    if (!layer) return;
    const modal = document.getElementById("live-code-modal");
    modal.dataset.editingLayerId = layerId;
    document.getElementById("live-code-layer-name").textContent = layer.name;
    this.showModal("live-code-modal");
    if (!this.liveCodeEditor) {
      this.liveCodeEditor = this.initMonacoEditor(
        "live-code-shader-editor-container",
        "glsl",
        layer.fragmentShader,
      );
    }
    if (!this.liveUniformsEditor) {
      this.liveUniformsEditor = this.initMonacoEditor(
        "live-code-uniforms-editor-container",
        "json",
        JSON.stringify(layer.uniformsDef, null, 2),
      );
    }
  }
  applyLiveCode() {
    const modal = document.getElementById("live-code-modal");
    const layerId = modal.dataset.editingLayerId;
    if (!layerId) return;
    if (!this.liveCodeEditor || !this.liveUniformsEditor) {
      alert("エディタが初期化されていません。");
      return;
    }
    const newUniformsJSON = this.liveUniformsEditor.getValue();
    const newFragmentShader = this.liveCodeEditor.getValue();
    try {
      this.updateLayerShader(layerId, newFragmentShader, newUniformsJSON);
      this.hideModal("live-code-modal");
    } catch (error) {
      console.error("Failed to apply live code:", error);
      alert(`シェーダーの適用に失敗しました:\n${error.message}`);
    }
  }
  createParticleBackground() {
    const particleBg = document.getElementById("particle-bg");
    if (!particleBg) return;
    for (let i = 0; i < 50; i++) {
      const particle = document.createElement("div");
      particle.className = "particle";
      particle.style.left = Math.random() * 100 + "%";
      particle.style.animationDelay = Math.random() * 20 + "s";
      particle.style.animationDuration = 15 + Math.random() * 10 + "s";
      const colors = [
        "rgba(99, 102, 241, 0.6)",
        "rgba(139, 92, 246, 0.6)",
        "rgba(6, 182, 212, 0.6)",
        "rgba(245, 101, 101, 0.6)",
        "rgba(34, 197, 94, 0.6)",
      ];
      particle.style.background =
        colors[Math.floor(Math.random() * colors.length)];
      const size = 2 + Math.random() * 4;
      particle.style.width = size + "px";
      particle.style.height = size + "px";
      particleBg.appendChild(particle);
    }
  }
  selectLayer(index) {
    if (index < 0 || index >= this.activeLayers.length) return;
    document
      .querySelectorAll(".layer-card")
      .forEach((card) => card.classList.remove("ring-2", "ring-blue-400"));
    this.selectedLayerIndex = index;
    const layerId = this.activeLayers[index].id;
    const layerCard = document.getElementById(layerId);
    if (layerCard) {
      layerCard.classList.add("ring-2", "ring-blue-400");
      layerCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
  hideAllModals() {
    const modals = document.querySelectorAll('[id$="-modal"]');
    modals.forEach((modal) => {
      if (!modal.classList.contains("hidden")) {
        this.hideModal(modal.id);
      }
    });
  }
  async toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }
  async startRecording() {
    if (!this.popupWindow || this.popupWindow.closed) {
      alert("録画するには出力ウィンドウを開いてください。");
      return;
    }
    try {
      const canvas = this.renderer.domElement;
      const stream = canvas.captureStream(30);
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm",
      });
      this.recordedChunks = [];
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `vj-recording-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };
      this.mediaRecorder.start();
      this.isRecording = true;
      const recordBtn = document.getElementById("record-btn");
      recordBtn.textContent = "録画停止";
      recordBtn.classList.remove("bg-red-600", "hover:bg-red-500");
      recordBtn.classList.add("bg-gray-600", "hover:bg-gray-500");
      document.getElementById("recording-indicator").style.display = "block";
    } catch (error) {
      console.error("録画開始エラー:", error);
      alert(
        "録画を開始できませんでした。ブラウザがサポートしていない可能性があります。",
      );
    }
  }
  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      const recordBtn = document.getElementById("record-btn");
      recordBtn.innerHTML = ` <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /> </svg> 録画開始 `;
      recordBtn.classList.remove("bg-gray-600", "hover:bg-gray-500");
      recordBtn.classList.add("bg-red-600", "hover:bg-red-500");
      document.getElementById("recording-indicator").style.display = "none";
    }
  }
  updateFPS() {
    this.frameCount++;
    const now = this.clock.elapsedTime;
    if (now - this.lastFpsUpdate >= 1.0) {
      this.fps = this.frameCount / (now - this.lastFpsUpdate);
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      const fpsCounter = document.getElementById("fps-counter");
      if (fpsCounter) {
        fpsCounter.textContent = `FPS: ${Math.round(this.fps)}`;
        if (this.fps >= 50) {
          fpsCounter.style.color = "#00ff00";
        } else if (this.fps >= 30) {
          fpsCounter.style.color = "#ffff00";
        } else {
          fpsCounter.style.color = "#ff0000";
        }
      }
    }
  }
  populateShaderList() {
    const generatorsList = document.getElementById("shader-list-generators");
    const filtersList = document.getElementById("shader-list-filters");
    if (!generatorsList || !filtersList) return;
    generatorsList.innerHTML = "";
    filtersList.innerHTML = "";
    const allShaders = { ...SHADERS, ...this.customShaders };
    for (const key in allShaders) {
      const shaderInfo = allShaders[key];
      const button = document.createElement("button");
      button.className =
        "bg-gray-700 hover:bg-indigo-600 p-3 rounded-lg text-left transition-colors duration-200";
      button.innerHTML = `<h4 class="font-semibold text-sm">${shaderInfo.name}</h4>`;
      button.onclick = () => {
        this.addLayerToCurrentScene(key);
        this.hideModal("add-layer-modal");
      };
      if (shaderInfo.needsInput) {
        filtersList.appendChild(button);
      } else {
        generatorsList.appendChild(button);
      }
    }
  }
  renameScene(index) {
    if (index < 0 || index >= this.sceneData.length) return;
    const modal = document.getElementById("rename-scene-modal");
    modal.dataset.editingSceneIndex = index;
    const input = document.getElementById("rename-scene-input");
    input.value = this.sceneData[index].name;
    this.showModal("rename-scene-modal");
    input.focus();
    input.select();
  }
  applySceneRename() {
    const modal = document.getElementById("rename-scene-modal");
    const index = parseInt(modal.dataset.editingSceneIndex, 10);
    if (isNaN(index) || index < 0 || index >= this.sceneData.length) {
      this.hideModal("rename-scene-modal");
      return;
    }
    const input = document.getElementById("rename-scene-input");
    const newName = input.value.trim();
    const currentName = this.sceneData[index].name;
    if (newName && newName !== "" && newName !== currentName) {
      this.sceneData[index].name = newName;
      this.updateSceneListUI();
      this.saveProjectToStorage();
    }
    this.hideModal("rename-scene-modal");
  }
  switchScene(index) {
    if (
      index < 0 ||
      index >= this.allScenesLayers.length ||
      this.currentSceneIndex === index
    )
      return;
    this.activeLayers.forEach((l) => {
      if (l.isFeedback && l.feedbackBuffer) {
        this.renderer.setRenderTarget(l.feedbackBuffer);
        this.renderer.clear();
      }
    });
    this.activeLayers = this.allScenesLayers[index];
    this.currentSceneIndex = index;
    this.rebuildLayerStackUI();
    this.updateSceneListUI();
  }
  removeScene(index) {
    const sceneName = this.sceneData[index].name;
    if (
      index < 0 ||
      index >= this.sceneData.length ||
      !window.confirm(
        `「${sceneName}」を削除しますか？この操作は取り消せません。`,
      )
    )
      return;
    this.allScenesLayers[index].forEach((l) => {
      if (l.material) l.material.dispose();
      if (l.renderTarget) l.renderTarget.dispose();
      if (l.feedbackBuffer) l.feedbackBuffer.dispose();
    });
    this.allScenesLayers.splice(index, 1);
    this.sceneData.splice(index, 1);
    if (this.currentSceneIndex === index) {
      this.currentSceneIndex = -1;
      this.activeLayers = [];
      this.rebuildLayerStackUI();
      if (this.sceneData.length > 0) {
        this.switchScene(Math.max(0, index - 1));
      }
    } else if (this.currentSceneIndex > index) {
      this.currentSceneIndex--;
    }
    this.updateSceneListUI();
    this.saveProjectToStorage();
  }
  updateSceneListUI() {
    const sceneListEl = document.getElementById("scene-list");
    sceneListEl.innerHTML = "";
    this.sceneData.forEach((scene, index) => {
      const card = document
        .getElementById("scene-card-template")
        .content.cloneNode(true).firstElementChild;
      card.querySelector(".scene-name").textContent = scene.name;
      if (index === this.currentSceneIndex) card.classList.add("active");
      card.addEventListener("click", (e) => {
        if (!e.target.closest("button")) this.switchScene(index);
      });
      card
        .querySelector(".add-to-sequence-btn")
        .addEventListener("click", (e) => {
          e.stopPropagation();
          this.addSceneToSequence(index);
        });
      card.querySelector(".rename-scene-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        this.renameScene(index);
      });
      card.querySelector(".remove-scene-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeScene(index);
      });
      sceneListEl.appendChild(card);
    });
  }
  serializeLayers(layersToSerialize = this.activeLayers) {
    return layersToSerialize.map((layer) => ({
      key: layer.key,
      name: layer.name,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      visible: layer.visible,
      fragmentShader: layer.fragmentShader,
      uniformsDef: layer.uniformsDef,
      uniformValues: Object.keys(layer.uniformsDef || {}).reduce((acc, key) => {
        if (layer.uniforms[key])
          acc[key] = { value: layer.uniforms[key].value };
        return acc;
      }, {}),
    }));
  }
  saveProjectToStorage() {
    try {
      const projectData = {
        version: 1,
        scenes: this.sceneData,
        customShaders: this.customShaders,
        sequencer: { bpm: this.bpm, sequence: this.sequence },
      };
      localStorage.setItem("glsl_vj_project", JSON.stringify(projectData));
    } catch (e) {
      console.error("Error saving project to localStorage:", e);
    }
  }
  createDefaultScenes() {
    this.sceneData = [];
    const generatorShaders = Object.keys(SHADERS).filter(
      (key) => !SHADERS[key].needsInput,
    );
    if (generatorShaders.length === 0) return;
    const sceneThemes = [
      { name: "ネオンシティ", shader: "Neon-City" },
      { name: "ギャラクシー", shader: "Galaxy-Spiral" },
      { name: "オーロラ", shader: "Aurora-Borealis" },
      { name: "ファイア", shader: "Fire-Storm" },
      { name: "サイバー", shader: "Cyber-Grid" },
      { name: "クリスタル", shader: "Crystal-Cave" },
      { name: "コズミック", shader: "Cosmic-Dust" },
      { name: "エレクトリック", shader: "Electric-Web" },
      { name: "レインボー", shader: "Rainbow-Waves" },
      { name: "デジタル", shader: "Digital-Rain" },
    ];
    sceneThemes.forEach((theme, i) => {
      const shaderKey = SHADERS[theme.shader]
        ? theme.shader
        : generatorShaders[i % generatorShaders.length];
      const layer = this.createLayerObject(shaderKey);
      if (layer) {
        this.sceneData.push({
          id: `scene-${theme.name}-${i}-${Date.now()}`,
          name: `${theme.name}シーン`,
          layers: this.serializeLayers([layer]),
        });
      }
    });
    if (generatorShaders.length > 2) {
      const mixedLayer1 = this.createLayerObject(generatorShaders[0]);
      const mixedLayer2 = this.createLayerObject(generatorShaders[1]);
      if (mixedLayer1 && mixedLayer2) {
        mixedLayer2.blendMode = "ADD";
        mixedLayer2.opacity = 0.7;
        this.sceneData.push({
          id: `scene-mixed-${Date.now()}`,
          name: "ミックスシーン",
          layers: this.serializeLayers([mixedLayer1, mixedLayer2]),
        });
      }
    }
  }
  loadProjectFromStorage() {
    const storedProject = localStorage.getItem("glsl_vj_project");
    if (storedProject) {
      try {
        const projectData = JSON.parse(storedProject);
        this.sceneData = projectData.scenes || [];
        this.customShaders = projectData.customShaders || {};
        const seq = projectData.sequencer || {};
        this.bpm = seq.bpm || 120;
        this.sequence = seq.sequence || [];
      } catch (e) {
        console.error("Failed to parse project from localStorage", e);
        this.createDefaultScenes();
        this.customShaders = {};
      }
    } else {
      this.createDefaultScenes();
    }
    document.getElementById("bpm-input").value = this.bpm;
    this.allScenesLayers = this.sceneData.map((scene) =>
      this.preloadScene(scene),
    );
    this.updateSequenceListUI();
    if (this.sceneData.length > 0) this.switchScene(0);
    else this.updateSceneListUI();
  }
  preloadScene(sceneData) {
    const preloadedLayers = [];
    if (sceneData.layers) {
      sceneData.layers.forEach((layerData) => {
        const layer = this.createLayerObject(layerData.key, layerData);
        if (layer) {
          this.initLayerGpuResources(layer);
          preloadedLayers.push(layer);
        }
      });
    }
    return preloadedLayers;
  }
  exportProject() {
    if (this.sceneData.length === 0) {
      alert("エクスポートするプロジェクトデータがありません。");
      return;
    }
    const projectData = {
      version: 1,
      scenes: this.sceneData,
      customShaders: this.customShaders,
      sequencer: { bpm: this.bpm, sequence: this.sequence },
    };
    const dataStr = JSON.stringify(projectData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vj-project-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  importProject(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedProject = JSON.parse(e.target.result);
        if (
          importedProject &&
          importedProject.version === 1 &&
          Array.isArray(importedProject.scenes)
        ) {
          this.sceneData = importedProject.scenes;
          this.customShaders = importedProject.customShaders || {};
          const seq = importedProject.sequencer || {};
          this.bpm = seq.bpm || 120;
          this.sequence = seq.sequence || [];
          this.populateShaderList();
          document.getElementById("bpm-input").value = this.bpm;
          this.allScenesLayers = this.sceneData.map((s) =>
            this.preloadScene(s),
          );
          this.updateSequenceListUI();
          if (this.sceneData.length > 0) this.switchScene(0);
          else {
            this.activeLayers = [];
            this.rebuildLayerStackUI();
            this.updateSceneListUI();
          }
          this.saveProjectToStorage();
          alert(`プロジェクトファイルをインポートしました。`);
        } else {
          alert("無効なプロジェクトファイルです。");
        }
      } catch (err) {
        alert("プロジェクトファイルの解析中にエラーが発生しました。");
        console.error(err);
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }
  findShaderDef(shaderKey) {
    return SHADERS[shaderKey] || this.customShaders[shaderKey];
  }
  updateLayerShader(layerId, newFragmentShader, newUniformsJSON) {
    const layer = this.activeLayers.find((l) => l.id === layerId);
    if (!layer) throw new Error("Layer not found");
    let newUniformsDef;
    try {
      newUniformsDef = JSON.parse(newUniformsJSON);
    } catch (e) {
      throw new Error("UniformsのJSON形式が正しくありません。");
    }
    const tempMaterial = new THREE.ShaderMaterial({
      vertexShader: this.getVertexShader(),
      fragmentShader: newFragmentShader,
      uniforms: layer.material.uniforms,
    });
    this.renderer.compile(this.scene, this.camera, tempMaterial);
    tempMaterial.dispose();
    layer.material.dispose();
    layer.fragmentShader = newFragmentShader;
    layer.uniformsDef = newUniformsDef;
    const newUniforms = {
      u_time: layer.uniforms.u_time,
      u_resolution: layer.uniforms.u_resolution,
    };
    layer.needsInput = newFragmentShader.includes("u_inputTexture");
    layer.isFeedback = newFragmentShader.includes("u_prevLayer");
    if (layer.needsInput)
      newUniforms.u_inputTexture = layer.uniforms.u_inputTexture || {
        value: null,
      };
    if (layer.isFeedback)
      newUniforms.u_prevLayer = layer.uniforms.u_prevLayer || { value: null };
    for (const key in newUniformsDef) {
      newUniforms[key] = { ...newUniformsDef[key] };
      if (layer.uniforms[key] !== undefined)
        newUniforms[key].value = layer.uniforms[key].value;
    }
    layer.uniforms = newUniforms;
    layer.material = new THREE.ShaderMaterial({
      uniforms: layer.uniforms,
      vertexShader: this.getVertexShader(),
      fragmentShader: newFragmentShader,
      transparent: true,
    });
    this.rebuildLayerCardUI(layer);
    this.saveCurrentScene();
  }
  createLayerObject(shaderKey, layerData = null) {
    const isFromPreset = layerData === null;
    const sourceDef = isFromPreset ? this.findShaderDef(shaderKey) : layerData;
    if (!sourceDef) {
      console.error(`Shader with key "${shaderKey}" not found.`);
      return null;
    }
    const layer = {
      id: `layer-${Date.now()}`,
      key: shaderKey,
      name: sourceDef.name,
      fragmentShader: sourceDef.fragmentShader,
      uniformsDef: JSON.parse(
        JSON.stringify(sourceDef.uniformsDef || sourceDef.uniforms),
      ),
      uniforms: {
        u_time: { value: 0 },
        u_resolution: {
          value: new THREE.Vector2(this.renderWidth, this.renderHeight),
        },
      },
      opacity: isFromPreset ? 1.0 : (layerData.opacity ?? 1.0),
      blendMode: isFromPreset ? "NORMAL" : (layerData.blendMode ?? "NORMAL"),
      visible: isFromPreset ? true : (layerData.visible ?? true),
    };
    const uniformValues = isFromPreset ? null : layerData.uniformValues;
    for (const key in layer.uniformsDef) {
      layer.uniforms[key] = { ...layer.uniforms[key] };
      if (uniformValues && uniformValues[key] !== undefined)
        layer.uniforms[key].value = uniformValues[key].value;
    }
    return layer;
  }
  initLayerGpuResources(layer) {
    layer.renderTarget = new THREE.WebGLRenderTarget(
      this.renderWidth,
      this.renderHeight,
    );
    layer.needsInput = layer.fragmentShader.includes("u_inputTexture");
    layer.isFeedback = layer.fragmentShader.includes("u_prevLayer");
    if (layer.needsInput) layer.uniforms.u_inputTexture = { value: null };
    if (layer.isFeedback) {
      layer.uniforms.u_prevLayer = { value: null };
      layer.feedbackBuffer = new THREE.WebGLRenderTarget(
        this.renderWidth,
        this.renderHeight,
      );
    }
    try {
      layer.material = new THREE.ShaderMaterial({
        uniforms: layer.uniforms,
        vertexShader: this.getVertexShader(),
        fragmentShader: layer.fragmentShader,
        transparent: true,
      });
      this.renderer.compile(this.scene, this.camera, layer.material);
    } catch (e) {
      console.error("Shader compilation failed:", e);
      alert(`シェーダー「${layer.name}」のコンパイルに失敗しました。`);
      return false;
    }
    return true;
  }
  addLayerToCurrentScene(shaderKey) {
    if (this.currentSceneIndex === -1) {
      alert("レイヤーを追加するシーンを選択してください。");
      return;
    }
    const layer = this.createLayerObject(shaderKey);
    if (!layer || !this.initLayerGpuResources(layer)) return;
    this.activeLayers.push(layer);
    this.rebuildLayerStackUI();
    this.saveCurrentScene();
  }
  removeLayer(layerId) {
    const index = this.activeLayers.findIndex((l) => l.id === layerId);
    if (index > -1) {
      const layer = this.activeLayers[index];
      if (layer.material) layer.material.dispose();
      if (layer.renderTarget) layer.renderTarget.dispose();
      if (layer.feedbackBuffer) layer.feedbackBuffer.dispose();
      this.activeLayers.splice(index, 1);
      this.rebuildLayerStackUI();
      this.saveCurrentScene();
    }
  }
  rebuildLayerStackUI() {
    const stackEl = document.getElementById("layer-stack");
    stackEl.innerHTML = "";
    this.activeLayers.forEach((layer) => this.createLayerCardUI(layer));
  }
  rebuildLayerCardUI(layer) {
    const oldCard = document.getElementById(layer.id);
    if (oldCard) {
      this.createLayerCardUI(layer, true);
    }
  }
  createLayerCardUI(layer, replace = false) {
    const template = document.getElementById("layer-card-template");
    if (!template) return;
    const card = template.content.cloneNode(true).firstElementChild;
    card.id = layer.id;
    const iconSpan = card.querySelector(".layer-type-icon");
    if (layer.needsInput) {
      iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-cyan-400" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3a1 1 0 000 2v11a1 1 0 100 2h14a1 1 0 100-2V5a1 1 0 000-2H3zm2.707 3.707a1 1 0 011.414 0L10 9.414l2.879-2.88a1 1 0 011.414 1.414L11.414 10l2.879 2.879a1 1 0 01-1.414 1.414L10 11.414l-2.879 2.879a1 1 0 01-1.414-1.414L8.586 10 5.707 7.121a1 1 0 010-1.414z" /></svg>`;
      iconSpan.title = "フィルター (上書き効果)";
    } else {
      iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-amber-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd" /></svg>`;
      iconSpan.title = "ジェネレーター (映像生成)";
    }
    card.querySelector(".layer-name").textContent = layer.name;
    card.querySelector(".remove-layer-btn").onclick = () =>
      this.removeLayer(layer.id);
    card.querySelector(".edit-layer-btn").onclick = () =>
      this.openLiveCodeEditor(layer.id);
    const visibilityBtn = card.querySelector(".toggle-visibility-btn");
    visibilityBtn.classList.toggle("text-white", layer.visible);
    visibilityBtn.classList.toggle("text-gray-400", !layer.visible);
    card.classList.toggle("opacity-60", !layer.visible);
    visibilityBtn.onclick = () => {
      layer.visible = !layer.visible;
      this.rebuildLayerCardUI(layer);
      this.saveCurrentScene();
    };
    const blendSelect = card.querySelector(".blend-mode-select");
    blendSelect.value = layer.blendMode;
    blendSelect.onchange = (e) => {
      layer.blendMode = e.target.value;
      this.saveCurrentScene();
    };
    const opacitySlider = card.querySelector(".opacity-slider");
    opacitySlider.value = layer.opacity;
    opacitySlider.className = "control-slider w-full";
    opacitySlider.oninput = (e) => {
      layer.opacity = parseFloat(e.target.value);
      this.saveCurrentScene();
    };
    const uniformControls = card.querySelector(".uniform-controls");
    uniformControls.innerHTML = "";
    if (layer.uniformsDef) {
      for (const key in layer.uniformsDef) {
        const uniformInfo = layer.uniformsDef[key];
        const controlDiv = document.createElement("div");
        const label = document.createElement("label");
        label.className =
          "text-xs font-medium text-gray-400 flex justify-between";
        const valueSpan = document.createElement("span");
        valueSpan.className = "text-gray-400";
        const input = document.createElement("input");
        Object.assign(input, {
          type: "range",
          min: uniformInfo.min,
          max: uniformInfo.max,
          step: uniformInfo.step || 0.01,
          value: layer.uniforms[key].value,
        });
        input.className = "control-slider w-full mt-1";
        label.innerText = uniformInfo.name;
        label.appendChild(valueSpan);
        const updateValue = () => {
          const val = parseFloat(input.value);
          layer.uniforms[key].value = val;
          valueSpan.textContent = val.toFixed(2);
        };
        input.oninput = updateValue;
        input.onchange = () => this.saveCurrentScene();
        updateValue();
        controlDiv.append(label, input);
        uniformControls.appendChild(controlDiv);
      }
    }
    if (replace) {
      document.getElementById(layer.id)?.replaceWith(card);
    } else {
      document.getElementById("layer-stack").appendChild(card);
    }
  }
  saveCurrentScene() {
    if (
      this.currentSceneIndex !== -1 &&
      this.currentSceneIndex < this.sceneData.length
    ) {
      this.sceneData[this.currentSceneIndex].layers = this.serializeLayers();
      this.saveProjectToStorage();
    }
  }
  addSceneToSequence(index) {
    if (index < 0 || index >= this.sceneData.length) return;
    const scene = this.sceneData[index];
    this.sequence.push({ id: scene.id, name: scene.name });
    this.updateSequenceListUI();
    this.saveProjectToStorage();
  }
  removeSceneFromSequence(seqIndex) {
    if (seqIndex < 0 || seqIndex >= this.sequence.length) return;
    this.sequence.splice(seqIndex, 1);
    this.updateSequenceListUI();
    this.saveProjectToStorage();
  }
  updateSequenceListUI() {
    const seqListEl = document.getElementById("sequence-list");
    seqListEl.innerHTML = "";
    this.sequence.forEach((seqItem, index) => {
      const card = document
        .getElementById("sequence-card-template")
        .content.cloneNode(true).firstElementChild;
      card.querySelector(".sequence-name").textContent = seqItem.name;
      card.querySelector(".remove-from-sequence-btn").onclick = () =>
        this.removeSceneFromSequence(index);
      seqListEl.appendChild(card);
    });
  }
  toggleSequenceMode() {
    this.isSequenceMode = !this.isSequenceMode;
    const btn = document.getElementById("start-sequence-btn");
    if (this.isSequenceMode) {
      if (this.sequence.length === 0) {
        alert("シーケンスにシーンがありません。");
        this.isSequenceMode = false;
        return;
      }
      btn.textContent = "停止";
      btn.classList.remove("bg-green-600", "hover:bg-green-500");
      btn.classList.add("bg-red-600", "hover:bg-red-500");
      this.sequenceIndex = -1;
      this.lastBeatTime = this.clock.getElapsedTime();
      this.handleSequenceSwitch();
    } else {
      btn.textContent = "開始";
      btn.classList.remove("bg-red-600", "hover:bg-red-500");
      btn.classList.add("bg-green-600", "hover:bg-green-500");
    }
  }
  handleSequenceSwitch() {
    if (!this.isSequenceMode || this.sequence.length === 0) return;
    this.sequenceIndex = (this.sequenceIndex + 1) % this.sequence.length;
    const nextSeqItem = this.sequence[this.sequenceIndex];
    const nextSceneIndex = this.sceneData.findIndex(
      (s) => s.id === nextSeqItem.id,
    );
    if (nextSceneIndex !== -1) {
      this.switchScene(nextSceneIndex);
    }
  }
  openPopupWindow() {
    if (this.popupWindow && !this.popupWindow.closed) {
      this.popupWindow.focus();
      return;
    }
    this.popupWindow = window.open(
      "",
      "VJ Output",
      `width=${this.renderWidth},height=${this.renderHeight},menubar=no,toolbar=no,location=no,status=no`,
    );
    if (!this.popupWindow) {
      alert(
        "ポップアップがブロックされました。ブラウザの設定を確認してください。",
      );
      return;
    }
    this.popupWindow.document.body.style.cssText =
      "margin:0; overflow:hidden; background-color:black;";
    const popupCanvas = this.popupWindow.document.createElement("canvas");
    popupCanvas.style.width = "100%";
    popupCanvas.style.height = "100%";
    popupCanvas.width = this.renderWidth;
    popupCanvas.height = this.renderHeight;
    this.popupWindow.document.body.appendChild(popupCanvas);
    this.popupCanvasCtx = popupCanvas.getContext("2d");
    this.popupWindow.onbeforeunload = () => {
      this.popupWindow = null;
      this.popupCanvasCtx = null;
    };
  }
  getVertexShader() {
    return `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`;
  }
  getCompositorShader() {
    return {
      uniforms: {
        u_baseTexture: { value: null },
        u_layerTexture: { value: null },
        u_opacity: { value: 1.0 },
        u_blendMode: { value: 0 },
      },
      vertexShader: this.getVertexShader(),
      fragmentShader: ` uniform sampler2D u_baseTexture; uniform sampler2D u_layerTexture; uniform float u_opacity; uniform int u_blendMode; varying vec2 vUv; vec3 blendAdd(vec3 b, vec3 l){ return b+l; } vec3 blendSub(vec3 b, vec3 l){ return b-l; } vec3 blendMul(vec3 b, vec3 l){ return b*l; } vec3 blendScr(vec3 b, vec3 l){ return 1.0-(1.0-b)*(1.0-l); } vec3 blendDiff(vec3 b, vec3 l){ return abs(b-l); } void main() { vec4 baseColor = texture2D(u_baseTexture, vUv); vec4 layerColor = texture2D(u_layerTexture, vUv); float layerAlpha = layerColor.a * u_opacity; vec3 blendedRgb; if(u_blendMode == 1) blendedRgb = blendAdd(baseColor.rgb, layerColor.rgb); else if (u_blendMode == 2) blendedRgb = blendSub(baseColor.rgb, layerColor.rgb); else if (u_blendMode == 3) blendedRgb = blendMul(baseColor.rgb, layerColor.rgb); else if (u_blendMode == 4) blendedRgb = blendScr(baseColor.rgb, layerColor.rgb); else if (u_blendMode == 5) blendedRgb = blendDiff(baseColor.rgb, layerColor.rgb); else blendedRgb = layerColor.rgb; vec3 finalRgb = mix(baseColor.rgb, blendedRgb, layerAlpha); float finalAlpha = baseColor.a + (1.0 - baseColor.a) * layerAlpha; gl_FragColor = vec4(finalRgb, finalAlpha); }`,
    };
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));
    const deltaTime = this.clock.getDelta();
    this.time += deltaTime;
    this.updateFPS();

    if (this.isSequenceMode) {
      const beatInterval = 60.0 / this.bpm;
      if (this.time - this.lastBeatTime >= beatInterval) {
        this.handleSequenceSwitch();
        this.lastBeatTime = this.time;
      }
    }

    let readBuffer = this.renderTargets[0];
    let writeBuffer = this.renderTargets[1];
    this.renderer.setRenderTarget(readBuffer);
    this.renderer.clear();
    const blendModes = {
      NORMAL: 0,
      ADD: 1,
      SUBTRACT: 2,
      MULTIPLY: 3,
      SCREEN: 4,
      DIFFERENCE: 5,
    };
    const visibleLayers = this.activeLayers.filter((l) => l.visible);
    let baseLayerIndex = visibleLayers.findIndex((l) => !l.needsInput);
    if (baseLayerIndex === -1 && visibleLayers.length > 0) {
      baseLayerIndex = 0;
    }

    for (let i = 0; i < visibleLayers.length; i++) {
      const layer = visibleLayers[i];
      let isBase = i === baseLayerIndex;
      this.quad.material = layer.material;
      layer.uniforms.u_time.value = this.time * this.globalSpeed;
      if (layer.needsInput)
        layer.uniforms.u_inputTexture.value = readBuffer.texture;
      if (layer.isFeedback)
        layer.uniforms.u_prevLayer.value = layer.feedbackBuffer.texture;
      this.renderer.setRenderTarget(layer.renderTarget);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      const currentLayerTexture = layer.renderTarget.texture;
      if (layer.isFeedback) {
        this.copyMaterial.uniforms.u_texture.value = currentLayerTexture;
        this.quad.material = this.copyMaterial;
        this.renderer.setRenderTarget(layer.feedbackBuffer);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
      }
      this.quad.material = this.compositorMat;
      this.compositorMat.uniforms.u_baseTexture.value = isBase
        ? null
        : readBuffer.texture;
      this.compositorMat.uniforms.u_layerTexture.value = currentLayerTexture;
      this.compositorMat.uniforms.u_opacity.value = isBase
        ? 1.0
        : layer.opacity;
      this.compositorMat.uniforms.u_blendMode.value = isBase
        ? 0
        : blendModes[layer.blendMode] || 0;
      this.renderer.setRenderTarget(writeBuffer);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      [readBuffer, writeBuffer] = [writeBuffer, readBuffer];
    }

    this.renderer.setRenderTarget(null);
    this.quad.material = this.copyMaterial;
    this.copyMaterial.uniforms.u_texture.value = readBuffer.texture;
    this.renderer.render(this.scene, this.camera);

    if (this.popupWindow && !this.popupWindow.closed && this.popupCanvasCtx) {
      this.popupCanvasCtx.drawImage(
        this.renderer.domElement,
        0,
        0,
        this.popupCanvasCtx.canvas.width,
        this.popupCanvasCtx.canvas.height,
      );
    }

    if (this.previewCtx) {
      this.previewCtx.drawImage(
        this.renderer.domElement,
        0,
        0,
        this.previewCtx.canvas.width,
        this.previewCtx.canvas.height,
      );
    }
  }
}

window.onload = () => {
  try {
    new VJApp();
  } catch (e) {
    console.error("Failed to initialize VJ App:", e);
    document.body.innerHTML = `<div class="w-screen h-screen flex items-center justify-center bg-red-900 text-white p-8"><p>アプリケーションの初期化に失敗しました。WebGLが有効になっているか、コンソールを確認してください。</p></div>`;
  }
};
