window.registerShader('Wormhole-X', {
    name: 'Wormhole X [High Speed]',
    type: 'TUNNEL',
    uniforms: { u_speed: {value: 1.5, min:0.1, max:4.0}, u_warp: {value: 2.0, min:0.5, max:5.0}, u_color_shift: {value: 0.0, min:0.0, max:1.0} },
    fragmentShader: `
uniform float u_time; uniform vec2 u_resolution; uniform float u_speed; uniform float u_warp; uniform float u_color_shift;
uniform float u_bass; uniform float u_treble;

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
    float r = length(uv);
    float a = atan(uv.y, uv.x);
    float movement = u_time * u_speed + u_bass * 2.0;
    float distortion = sin(a * 5.0 + movement) * u_treble * 0.2;
    vec2 p = vec2(1.0 / (r + distortion * 0.1) + movement, a / 3.14159);
    float grid = sin(p.x * 20.0) * sin(p.y * 10.0 * u_warp);
    float glow = 0.01 / abs(grid); 
    vec3 col = vec3(0.0);
    float paletteShift = p.x * 0.2 + u_color_shift + u_bass;
    col.r = sin(paletteShift) * 0.5 + 0.5;
    col.g = sin(paletteShift + 2.0) * 0.5 + 0.5;
    col.b = sin(paletteShift + 4.0) * 0.5 + 0.5;
    col *= glow * (1.5 + u_treble * 3.0);
    col *= smoothstep(0.0, 0.8, r);
    gl_FragColor = vec4(col, 1.0);
}`
});
