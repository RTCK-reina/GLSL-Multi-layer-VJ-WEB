window.registerShader('Feedback-Loop', {
    name: 'Infinity Loop [Filter]', 
    uniforms: { u_zoom: { value: 0.98, min: 0.9, max: 1.01 }, u_rot: { value: 0.0, min: -0.1, max: 0.1 } }, 
    needsInput: true, isFeedback: true, 
    fragmentShader: `
uniform vec2 u_resolution;uniform sampler2D u_prevLayer; uniform sampler2D u_inputTexture; uniform float u_zoom; uniform float u_rot;
uniform float u_bass;
void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 p = uv - 0.5;
    
    // Rotation based on audio
    float a = u_rot + u_bass * 0.05;
    float c = cos(a); float s = sin(a);
    p = mat2(c, -s, s, c) * p;
    
    // Zoom
    float z = u_zoom - u_bass * 0.02;
    vec2 nextUV = p * z + 0.5;
    
    vec4 prev = texture2D(u_prevLayer, nextUV);
    vec4 curr = texture2D(u_inputTexture, uv);
    
    // Decay
    prev *= 0.95; 
    
    vec3 col = max(prev.rgb, curr.rgb); // Lighten blend for trails
    
    gl_FragColor = vec4(col, 1.0);
}`
});
