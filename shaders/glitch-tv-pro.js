window.registerShader('Glitch-TV-Pro', {
    name: 'Glitch TV [Filter]',
    needsInput: true,
    uniforms: { u_amount: { value: 0.5, min: 0, max: 1.0 }, u_speed: { value: 0.5, min: 0, max: 2.0 } },
    fragmentShader: `
uniform float u_time; uniform float u_amount; uniform float u_speed; uniform sampler2D u_inputTexture; varying vec2 vUv;
uniform float u_bass;
float random(vec2 co){ return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453); }
void main() {
    vec2 uv = vUv;
    float time = u_time * u_speed;
    float glitchAmount = u_amount * (1.0 + u_bass * 2.0);
    float glitch = random(vec2(time, 0.0)) * glitchAmount;
    if (random(vec2(floor(uv.y * 20.0), time)) > 0.95) { uv.x += glitch; }
    float roll = random(vec2(time * 0.2, 1.0)) - 0.5;
    if (u_bass > 0.5) uv.y = fract(uv.y + roll * 0.1);
    vec3 color = texture2D(u_inputTexture, uv).rgb;
    float lineNoise = (random(vec2(uv.y, time)) - 0.5) * 0.1 * u_amount;
    color += lineNoise;
    if (u_bass > 0.4) {
        color.r = texture2D(u_inputTexture, uv + vec2(0.01 * u_bass, 0.0)).r;
        color.b = texture2D(u_inputTexture, uv - vec2(0.01 * u_bass, 0.0)).b;
    }
    gl_FragColor = vec4(color, 1.0);
}`
});
