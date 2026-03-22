export default {
    key: 'Liquid-Gold',
    name: 'Liquid Gold [FBM]',
    type: 'FLUID',
    uniforms: { u_flow: {value: 1.0, min:0.1, max:3.0}, u_metallic: {value: 0.8, min:0.0, max:1.0}, u_zoom: {value: 3.0, min:1.0, max:8.0} },
    fragmentShader: `
uniform float u_time; uniform vec2 u_resolution; uniform float u_flow; uniform float u_metallic; uniform float u_zoom;
uniform float u_mid; uniform float u_treble;

float random (in vec2 _st) { return fract(sin(dot(_st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
float noise (in vec2 _st) {
    vec2 i = floor(_st); vec2 f = fract(_st);
    float a = random(i); float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0)); float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
#define NUM_OCTAVES 5
float fbm ( in vec2 _st) {
    float v = 0.0; float a = 0.5; vec2 shift = vec2(100.0); mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
    for (int i = 0; i < NUM_OCTAVES; ++i) {
        v += a * noise(_st); _st = rot * _st * 2.0 + shift; a *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 st = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
    vec2 q = vec2(0.);
    q.x = fbm( st * u_zoom + 0.00 * u_time * u_flow);
    q.y = fbm( st * u_zoom + vec2(1.0));
    vec2 r = vec2(0.);
    r.x = fbm( st + 1.0*q + vec2(1.7,9.2)+ 0.15*u_time * u_flow );
    r.y = fbm( st + 1.0*q + vec2(8.3,2.8)+ 0.126*u_time * u_flow);
    float f = fbm(st + r + u_mid);
    vec3 color = mix(vec3(0.101961,0.619608,0.666667), vec3(0.666667,0.666667,0.498039), clamp((f*f)*4.0,0.0,1.0));
    color = mix(color, vec3(0,0,0.164706), clamp(length(q),0.0,1.0));
    color = mix(color, vec3(0.666667,1,1), clamp(length(r.x),0.0,1.0));
    float shine = pow(f, 4.0) * u_metallic * (1.0 + u_treble * 2.0);
    color += vec3(1.0, 0.8, 0.4) * shine;
    gl_FragColor = vec4(color, 1.0);
}`
};
