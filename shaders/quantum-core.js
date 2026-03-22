window.registerShader('Quantum-Core', {
    name: 'Quantum Core [Heavy]',
    type: 'RAYMARCHING',
    uniforms: { u_speed: {value: 0.5, min:0, max:2}, u_detail: {value: 1.5, min:0.5, max:3.0}, u_glow: {value: 2.0, min:1.0, max:5.0} },
    fragmentShader: `
uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_detail; uniform float u_glow;
uniform float u_bass; uniform float u_mid; uniform float u_treble;

float sdSphere(vec3 p, float s) { return length(p) - s; }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0); }
mat2 rot(float a) { float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }

float map(vec3 p) {
    p.xz *= rot(u_time * u_speed * 0.5);
    p.xy *= rot(u_time * u_speed * 0.3);
    float distortion = sin(p.x * 5.0 + u_time * 2.0) * sin(p.y * 5.0 + u_time) * sin(p.z * 5.0) * u_bass * 0.5;
    vec3 q = p;
    float d = sdBox(q, vec3(1.0));
    float s = 1.2;
    for(int i=0; i<3; i++) {
        q = abs(q) / s; q -= 0.5; float scale = pow(s, float(i));
        d = max(d, -sdBox(q, vec3(0.4))/scale);
    }
    return d + distortion * 0.2;
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
    vec3 ro = vec3(0.0, 0.0, 3.5 - u_bass); 
    vec3 rd = normalize(vec3(uv, -1.5)); 
    float t = 0.0;
    int steps = 0;
    for(int i=0; i<48; i++) { // Reduced max steps
        vec3 p = ro + rd * t;
        float d = map(p);
        if(d < 0.001 || t > 20.0) break;
        t += d;
        steps = i;
    }
    vec3 col = vec3(0.0);
    if(t < 20.0) {
        float glow = float(steps) / 48.0;
        vec3 baseCol = vec3(u_bass * 2.0, u_mid * 1.5, u_treble * 3.0);
        baseCol += vec3(0.1, 0.2, 0.5); 
        col = baseCol * glow * u_glow;
        col = mix(col, vec3(0.0), 1.0 - exp(-0.1 * t));
    }
    col = pow(col, vec3(0.4545)); 
    gl_FragColor = vec4(col, 1.0);
}`
});
