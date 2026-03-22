export default {
    key: 'Cyber-Dystopia',
    name: 'Cyber Dystopia [City]',
    type: 'RAYMARCHING',
    uniforms: { u_density: {value: 3.0, min:1.0, max:5.0}, u_height: {value: 2.0, min:0.5, max:4.0}, u_fog: {value: 0.1, min:0.01, max:0.2} },
    fragmentShader: `
uniform float u_time; uniform vec2 u_resolution; uniform float u_density; uniform float u_height; uniform float u_fog;
uniform float u_bass; uniform float u_treble;

float sdBox(vec3 p, vec3 b) { vec3 d = abs(p) - b; return length(max(d,0.0)) + min(max(d.x,max(d.y,d.z)),0.0); }

float map(vec3 p) {
    vec3 q = p;
    q.x = mod(q.x, 2.0) - 1.0;
    q.z = mod(q.z + u_time * 5.0, 4.0) - 2.0;
    vec2 id = floor(vec2(p.x / 2.0, (p.z + u_time * 5.0) / 4.0));
    float h = sin(id.x * 12.3 + id.y * 4.5) * u_height;
    if (h > 0.0) h += u_bass * 2.0;
    return sdBox(q - vec3(0.0, h - 2.0, 0.0), vec3(0.5, h, 0.5));
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
    vec3 ro = vec3(0.0, 3.0, 0.0);
    vec3 rd = normalize(vec3(uv.x, uv.y - 0.3, 1.0));
    float t = 0.0;
    vec3 col = vec3(0.0);
    for(int i=0; i<60; i++) { // Reduced max steps
        vec3 p = ro + rd * t;
        float d = map(p);
        if(d < 0.01) {
            col = vec3(0.1);
            if (mod(p.y + u_time, 1.0) < 0.1) col += vec3(0.0, 1.0, 1.0) * 2.0;
            if (mod(p.y, 0.5) < 0.05) col += vec3(1.0, 0.0, 1.0) * u_treble;
            break;
        }
        t += d * 0.8;
        if(t > 50.0) break;
    }
    col = mix(col, vec3(0.05, 0.0, 0.1), 1.0 - exp(-u_fog * t));
    gl_FragColor = vec4(col, 1.0);
}`
};
