window.registerShader('WebCam-Input', {
    name: 'WebCam Source',
    needsInput: false, isWebCam: true, uniforms: {},
    fragmentShader: `uniform vec2 u_resolution; uniform sampler2D u_webcamTexture; void main() { vec2 uv = gl_FragCoord.xy / u_resolution.xy; gl_FragColor = texture2D(u_webcamTexture, uv); }`
});
