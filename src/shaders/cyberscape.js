export default {
    key: 'Cyberscape',
    name: 'Cyberscape [Neon]',
    type: 'GRID',
    uniforms: { u_velocity: {value: 1.0, min:0.1, max:3.0}, u_density: {value: 20, min:5, max:50}, u_height: {value: 1.0, min:0.1, max:2.0} },
    fragmentShader: `
uniform float u_time; uniform vec2 u_resolution; uniform float u_velocity; uniform float u_density; uniform float u_height;
uniform float u_bass; uniform float u_treble;

float random(vec2 p) { return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453); }

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
    vec3 ro = vec3(0.0, 1.0, u_time * u_velocity);
    vec3 rd = normalize(vec3(uv.x, uv.y - 0.2, 1.0));
    float t = -ro.y / rd.y;
    vec3 col = vec3(0.0);
    col += vec3(0.05, 0.0, 0.1) * (1.0 - uv.y);
    if (t > 0.0) {
        vec3 pos = ro + rd * t;
        vec2 gridUV = fract(pos.xz * 0.5) - 0.5;
        vec2 id = floor(pos.xz * 0.5);
        float grid = smoothstep(0.45, 0.48, max(abs(gridUV.x), abs(gridUV.y)));
        vec3 gridCol = vec3(0.8, 0.0, 1.0);
        gridCol += vec3(0.0, 1.0, 1.0) * sin(pos.z * 0.1 + u_time);
        col = mix(col, gridCol, grid);
        float noise = random(id);
        if (noise > 0.8) {
            float dist = length(pos.xz - ro.xz);
            float h = noise * u_height + (u_bass * 2.0 * noise);
            col += vec3(0.1, 0.5, 1.0) * 2.0 * step(0.1, random(id + vec2(0.0, u_time)));
        }
        col *= exp(-0.05 * t);
    }
    float sun = length(uv - vec2(0.0, 0.2));
    if (sun < 0.3) {
        float stripes = sin(uv.y * 100.0 + u_time);
        if (stripes > 0.0 || uv.y > 0.2) {
             col += vec3(1.0, 0.2, 0.4) * 2.0;
        }
    }
    gl_FragColor = vec4(col, 1.0);
}`
};
