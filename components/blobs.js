class Blobs extends KnvasComponent {
    constructor(container, options = {}) {
        super(container);
        const isMobile = window.innerWidth <= 768;
        const parsedTailSpeed = parseFloat(options.tailSpeed);

        this.options = {
            backgroundColor: options.backgroundColor || '#1a2332',
            foregroundColor: options.foregroundColor || '#00d4ff',
            blobCount: isMobile && options.blobCountMobile
                ? parseInt(options.blobCountMobile)
                : (parseInt(options.blobCount) || 12),
            maxRadius: parseFloat(options.maxRadius) || 80,
            influenceRadius: parseFloat(options.influenceRadius) || 300,
            tailSpeed: Number.isNaN(parsedTailSpeed) || parsedTailSpeed === 0
                ? 1
                : Math.min(1, Math.max(0.2, parsedTailSpeed))
        };
        this.dots = [];
        this.gl = null;
        this.program = null;
        this.MAX_BLOBS = 128;
    }

    init() {
        this.saveAndClearBackground();

        // Create canvas manually — we need a webgl context, not 2d
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = `
            width: 100%; height: 100%;
            display: block;
            position: absolute;
            top: 0; left: 0;
            z-index: -1;
            border-radius: inherit;
        `;
        this.container.appendChild(this.canvas);

        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        if (!this.gl) {
            console.error('Blobs: WebGL not supported');
            return;
        }

        this._initGL();
        this.initDots();

        if (this.options.tailSpeed > 0) {
            this.setupMouseTracking();
        }

        this.animate();
        this.handleResize(() => {
            const r = this.container.getBoundingClientRect();
            this.canvas.width = r.width;
            this.canvas.height = r.height;
            this.gl.viewport(0, 0, r.width, r.height);
            this.initDots();
        });
    }

    _compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    _initGL() {
        const gl = this.gl;
        const MAX = this.MAX_BLOBS;

        // Vertex shader — full screen quad, nothing interesting here
        const vsSource = `
            attribute vec2 aPosition;
            void main() {
                gl_Position = vec4(aPosition, 0.0, 1.0);
            }
        `;

        // Fragment shader — metaball field equation per pixel
        const fsSource = `
            precision mediump float;
            uniform vec2 uResolution;
            uniform vec4 uForeground;  // rgba
            uniform vec4 uBackground;  // rgba
            uniform vec2 uBlobPos[${MAX}];
            uniform float uBlobRadius[${MAX}];
            uniform int uBlobCount;

            void main() {
                // Flip Y — WebGL origin is bottom-left, canvas is top-left
                vec2 coord = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);

                float field = 0.0;
                for (int i = 0; i < ${MAX}; i++) {
                    if (i >= uBlobCount) break;
                    vec2 diff = uBlobPos[i] - coord;
                    float distSq = dot(diff, diff);
                    if (distSq > 0.0) {
                        field += (uBlobRadius[i] * uBlobRadius[i]) / distSq;
                    }
                }

                // Smooth step around threshold=1.0 for slightly soft edges
                float alpha = smoothstep(0.85, 1.05, field);
                gl_FragColor = mix(uBackground, uForeground, alpha);
            }
        `;

        const vs = this._compileShader(gl.VERTEX_SHADER, vsSource);
        const fs = this._compileShader(gl.FRAGMENT_SHADER, fsSource);

        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(this.program));
            return;
        }

        gl.useProgram(this.program);

        // Full screen quad — two triangles covering clip space
        const verts = new Float32Array([
            -1, -1,  1, -1,  -1,  1,
            -1,  1,  1, -1,   1,  1
        ]);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

        const aPos = gl.getAttribLocation(this.program, 'aPosition');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        // Cache uniform locations
        this.u = {
            resolution: gl.getUniformLocation(this.program, 'uResolution'),
            foreground:  gl.getUniformLocation(this.program, 'uForeground'),
            background:  gl.getUniformLocation(this.program, 'uBackground'),
            blobPos:     gl.getUniformLocation(this.program, 'uBlobPos'),
            blobRadius:  gl.getUniformLocation(this.program, 'uBlobRadius'),
            blobCount:   gl.getUniformLocation(this.program, 'uBlobCount'),
        };
    }

    _parseColor(hex) {
        let c = hex.replace('#', '');
        if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
        return [
            parseInt(c.substring(0,2),16) / 255,
            parseInt(c.substring(2,4),16) / 255,
            parseInt(c.substring(4,6),16) / 255,
            1.0
        ];
    }

    initDots() {
        this.dots = [];
        for (let i = 0; i < this.options.blobCount; i++) {
            this.dots.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.6,
                vy: (Math.random() - 0.5) * 0.6,
                radius: 0,
                targetRadius: 0,
                momentumTime: 0
            });
        }
    }

    updateDots() {
        const effectiveMouse = this.getEffectiveMouse(this.options.tailSpeed);
        const deltaTime = 1000 / 60;

        this.dots.forEach(dot => {
            dot.x += dot.vx;
            dot.y += dot.vy;

            if (dot.x <= 0 || dot.x >= this.canvas.width) {
                dot.vx *= -1;
                dot.x = Math.max(0, Math.min(this.canvas.width, dot.x));
            }
            if (dot.y <= 0 || dot.y >= this.canvas.height) {
                dot.vy *= -1;
                dot.y = Math.max(0, Math.min(this.canvas.height, dot.y));
            }

            if (this.attractionActive && effectiveMouse.x !== null && effectiveMouse.y !== null) {
                const dx = dot.x - effectiveMouse.x;
                const dy = dot.y - effectiveMouse.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < this.options.influenceRadius) {
                    const influence = 1 - (distance / this.options.influenceRadius);
                    dot.targetRadius = this.options.maxRadius * 0.3 + influence * this.options.maxRadius * 0.7;
                    dot.momentumTime = 800;
                } else {
                    dot.momentumTime = Math.max(0, dot.momentumTime - deltaTime);
                    if (dot.momentumTime <= 0) dot.targetRadius = 0;
                }
            } else {
                dot.momentumTime = Math.max(0, dot.momentumTime - deltaTime);
                if (dot.momentumTime <= 0) dot.targetRadius = 0;
            }

            dot.radius += (dot.targetRadius - dot.radius) * 0.05;
        });
    }

    draw() {
        const { gl, canvas, options, dots, u, MAX_BLOBS } = this;

        gl.viewport(0, 0, canvas.width, canvas.height);

        // Pack blob positions and radii into flat arrays for uniforms
        const count = Math.min(dots.length, MAX_BLOBS);
        const positions = new Float32Array(MAX_BLOBS * 2);
        const radii = new Float32Array(MAX_BLOBS);

        for (let i = 0; i < count; i++) {
            positions[i * 2]     = dots[i].x;
            positions[i * 2 + 1] = dots[i].y;
            radii[i]             = dots[i].radius;
        }

        gl.uniform2f(u.resolution, canvas.width, canvas.height);
        gl.uniform4fv(u.foreground, this._parseColor(options.foregroundColor));
        gl.uniform4fv(u.background, this._parseColor(options.backgroundColor));
        gl.uniform2fv(u.blobPos, positions);
        gl.uniform1fv(u.blobRadius, radii);
        gl.uniform1i(u.blobCount, count);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    destroy() {
        if (this.gl && this.program) {
            this.gl.deleteProgram(this.program);
        }
        super.destroy();
    }

    animate() {
        this.updateFPS();
        this.updateLazyMouse(this.options.tailSpeed);
        this.updateDots();
        this.draw();
        this.animationFrame = requestAnimationFrame(() => this.animate());
    }
}

knvas.registerComponent('blobs', Blobs);