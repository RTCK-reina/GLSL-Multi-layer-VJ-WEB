window.registerShader('Crystal-KIFS', {
    name: 'Crystal KIFS [Fractal]',
    type: 'RAYMARCHING',
    uniforms: { u_fold: {value: 1.5, min:0.5, max:3.0}, u_scale: {value: 2.0, min:1.0, max:4.0}, u_color: {value: 0.5, min:0.0, max:1.0} },
    fragmentShader: `
uniform float u_time; uniform vec2 u_resolution; uniform float u_fold; uniform float u_scale; uniform float u_color;
uniform float u_bass; uniform float u_treble;

mat2 rot(float a) { float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }

float map(vec3 p) {
    float d = 1000.0;
    float s = 1.0;
    p.xy *= rot(u_time * 0.1);
    float beat = u_bass * 0.2;
    for(int i=0; i<4; i++) { // Reduced iterations from 5
        p = abs(p) - vec3(u_fold + beat, u_fold * 0.5, 0.5); 
        p.xy *= rot(1.0 + beat);
        p.yz *= rot(0.5);
        float sc = u_scale;
        p *= sc;
        s *= sc;
        d = min(d, length(p)/s);
    }
    return d;
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
    vec3 ro = vec3(0.0, 0.0, -4.0);
    vec3 rd = normalize(vec3(uv, 1.0));
    float t = 0.0;
    float acc = 0.0;
    for(int i=0; i<48; i++) { // Reduced max steps
        vec3 p = ro + rd * t;
        float d = map(p);
        acc += 0.02 / (0.01 + abs(d));
        if(d < 0.001 || t > 10.0) break;
        t += d;
    }
    vec3 col = vec3(acc * 0.05);
    col *= vec3(0.2 + u_color, 0.5, 0.8 - u_color * 0.5);
    col += u_treble * acc * 0.02 * vec3(1.0, 0.8, 0.5);
    gl_FragColor = vec4(col, 1.0);
}`
});
