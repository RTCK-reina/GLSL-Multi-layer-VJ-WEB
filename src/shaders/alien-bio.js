export default {
    key: 'Alien-Bio',
    name: 'Alien Bio [Organic]',
    type: 'RAYMARCHING',
    uniforms: { u_morph: {value: 1.0, min:0.0, max:2.0}, u_spread: {value: 2.0, min:1.0, max:4.0}, u_shine: {value: 1.0, min:0.5, max:2.0} },
    fragmentShader: `
uniform float u_time; uniform vec2 u_resolution; uniform float u_morph; uniform float u_spread; uniform float u_shine;
uniform float u_bass; uniform float u_mid;

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float map(vec3 p) {
    float pulse = u_bass * 0.5;
    float d = length(p) - 1.0 - pulse;
    for(int i=0; i<4; i++) {
        float fi = float(i);
        vec3 pos = vec3(sin(u_time * 0.5 + fi) * u_spread, cos(u_time * 0.3 + fi * 2.0) * u_spread * 0.5, sin(u_time * 0.7 + fi * 1.5) * u_spread);
        float d2 = length(p - pos) - 0.5 - (u_mid * 0.3);
        d = smin(d, d2, u_morph);
    }
    return d;
}

vec3 getNormal(vec3 p) {
    float d = map(p);
    vec2 e = vec2(0.01, 0.0);
    return normalize(vec3(d - map(p-e.xyy), d - map(p-e.yxy), d - map(p-e.yyx)));
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
    vec3 ro = vec3(0.0, 0.0, 6.0);
    vec3 rd = normalize(vec3(uv, -1.0));
    float t = 0.0;
    for(int i=0; i<48; i++) { // Reduced max steps
        float d = map(ro + rd * t);
        if(d < 0.01) {
            vec3 p = ro + rd * t;
            vec3 n = getNormal(p);
            vec3 l = normalize(vec3(1.0, 1.0, 1.0));
            float diff = max(dot(n, l), 0.0);
            float spec = pow(max(dot(reflect(-l, n), -rd), 0.0), 32.0);
            vec3 col = 0.5 + 0.5 * cos(u_time + p.xyx + vec3(0,2,4));
            col = col * diff + vec3(u_shine) * spec;
            gl_FragColor = vec4(col, 1.0);
            return;
        }
        t += d;
        if(t > 20.0) break;
    }
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}`
};
