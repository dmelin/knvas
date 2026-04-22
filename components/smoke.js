class Smoke extends KnvasComponent {
    constructor(container, options = {}) {
        super(container);
        const isMobile = window.innerWidth <= 768;
        const parsedTailSpeed = parseFloat(options.tailSpeed);

        this.options = {
            backgroundColor: options.backgroundColor || '#1a2332',
            middlegroundColor: options.middlegroundColor || '#00d4ff',
            foregroundColor: options.foregroundColor || '#d946ef',
            particleOpacity: parseFloat(options.particleOpacity) || 0.6,
            particleCount: isMobile && options.particleCountMobile
                ? parseInt(options.particleCountMobile)
                : (parseInt(options.particleCount) || 80),
            mouseRepel: options.mouseRepel === 'true' || options.mouseRepel === true,
            glowAtMouse: options.glowAtMouse === 'true' || options.glowAtMouse === true,
            tailSpeed: Number.isNaN(parsedTailSpeed) || parsedTailSpeed === 0
                ? 1
                : Math.min(1, Math.max(0.2, parsedTailSpeed)),
            repelStrength: parseFloat(options.repelStrength) || 0.5
        };

        this.particles = [];
        this.time = 0;

        // Inline simplex noise (no external deps)
        this._initNoise();
    }

    // --- Simplex noise (2D) inlined ---
    _initNoise() {
        const p = [];
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        this._perm = new Uint8Array(512);
        this._permMod12 = new Uint8Array(512);
        for (let i = 0; i < 512; i++) {
            this._perm[i] = p[i & 255];
            this._permMod12[i] = this._perm[i] % 12;
        }
        this._grad3 = [
            [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
            [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
            [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
        ];
        this._F2 = 0.5 * (Math.sqrt(3) - 1);
        this._G2 = (3 - Math.sqrt(3)) / 6;
    }

    _noise(xin, yin) {
        const { _perm, _permMod12, _grad3, _F2, _G2 } = this;
        let n0, n1, n2;
        const s = (xin + yin) * _F2;
        const i = Math.floor(xin + s);
        const j = Math.floor(yin + s);
        const t = (i + j) * _G2;
        const X0 = i - t, Y0 = j - t;
        const x0 = xin - X0, y0 = yin - Y0;
        const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
        const x1 = x0 - i1 + _G2, y1 = y0 - j1 + _G2;
        const x2 = x0 - 1 + 2 * _G2, y2 = y0 - 1 + 2 * _G2;
        const ii = i & 255, jj = j & 255;
        const gi0 = _permMod12[ii + _perm[jj]];
        const gi1 = _permMod12[ii + i1 + _perm[jj + j1]];
        const gi2 = _permMod12[ii + 1 + _perm[jj + 1]];
        let t0 = 0.5 - x0*x0 - y0*y0;
        n0 = t0 < 0 ? 0 : (t0 *= t0, t0 * t0 * (_grad3[gi0][0]*x0 + _grad3[gi0][1]*y0));
        let t1 = 0.5 - x1*x1 - y1*y1;
        n1 = t1 < 0 ? 0 : (t1 *= t1, t1 * t1 * (_grad3[gi1][0]*x1 + _grad3[gi1][1]*y1));
        let t2 = 0.5 - x2*x2 - y2*y2;
        n2 = t2 < 0 ? 0 : (t2 *= t2, t2 * t2 * (_grad3[gi2][0]*x2 + _grad3[gi2][1]*y2));
        return 70 * (n0 + n1 + n2); // [-1, 1]
    }

    // --- Particle lifecycle ---
    _spawnParticle(index) {
        const isForeground = Math.random() < 0.2;
        const baseColor = isForeground ? this.options.foregroundColor : this.options.middlegroundColor;
        const hueShift = (Math.random() * 60) - 30;

        return {
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            vx: 0,
            vy: 0,
            life: 0,
            maxLife: 120 + Math.floor(Math.random() * 180), // 2-5 seconds at 60fps
            size: 15 + Math.random() * 25,
            color: this.shiftHue(baseColor, hueShift),
            isForeground
        };
    }

    _initParticles() {
        this.particles = [];
        for (let i = 0; i < this.options.particleCount; i++) {
            const p = this._spawnParticle(i);
            // Stagger lifetimes so they don't all spawn at once
            p.life = Math.floor(Math.random() * p.maxLife);
            this.particles.push(p);
        }
    }

    _updateParticles() {
        const effectiveMouse = this.getEffectiveMouse(this.options.tailSpeed);
        const scale = 0.0015; // noise zoom — lower = larger smoke structures
        const speed = 0.8;

        this.time += 0.004;

        for (const p of this.particles) {
            p.life++;

            // Respawn dead particles
            if (p.life >= p.maxLife) {
                Object.assign(p, this._spawnParticle());
                p.life = 0;
                continue;
            }

            // Sample flow field at particle position + time offset
            const angle = this._noise(p.x * scale, p.y * scale + this.time) * Math.PI * 2;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;

            // Mouse repel
            if (this.options.mouseRepel && this.attractionActive && effectiveMouse.x !== null) {
                const dx = p.x - effectiveMouse.x;
                const dy = p.y - effectiveMouse.y;
                const distSq = dx * dx + dy * dy;
                const repelRadius = 200;
                const repelRadiusSq = repelRadius * repelRadius;

                if (distSq < repelRadiusSq && distSq > 0) {
                    const dist = Math.sqrt(distSq);
                    const force = (1 - dist / repelRadius) * this.options.repelStrength * 12;
                    p.vx += (dx / dist) * force;
                    p.vy += (dy / dist) * force;
                }
            }

            p.x += p.vx;
            p.y += p.vy;

            // Wrap around edges so particles recirculate
            if (p.x < -20) p.x = this.canvas.width + 20;
            else if (p.x > this.canvas.width + 20) p.x = -20;
            if (p.y < -20) p.y = this.canvas.height + 20;
            else if (p.y > this.canvas.height + 20) p.y = -20;
        }
    }

    _setupOffscreen() {
        this.offscreen = document.createElement('canvas');
        this.offscreen.width = this.canvas.width;
        this.offscreen.height = this.canvas.height;
        this.offCtx = this.offscreen.getContext('2d');
    }

    _colorToRgba(color, alpha) {
        let r, g, b;
        if (color.startsWith('#')) {
            let hex = color.replace('#', '');
            if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        } else {
            const match = color.match(/\d+/g);
            r = parseInt(match[0]); g = parseInt(match[1]); b = parseInt(match[2]);
        }
        return `rgba(${r},${g},${b},${alpha})`;
    }

    draw() {
        const { ctx, offCtx, offscreen, canvas, options } = this;
        const glowActive = options.glowAtMouse && this.attractionActive;

        // Fade the offscreen slowly — long persistence = volumetric density
        offCtx.globalAlpha = 0.03;
        offCtx.fillStyle = options.backgroundColor;
        offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
        offCtx.globalAlpha = 1;

        // Actively clear smoke at cursor position with a radial wipe
        if (options.mouseRepel && this.attractionActive) {
            const effectiveMouse = this.getEffectiveMouse(options.tailSpeed);
            if (effectiveMouse.x !== null && effectiveMouse.y !== null) {
                const clearRadius = 120;
                const clearGrad = offCtx.createRadialGradient(
                    effectiveMouse.x, effectiveMouse.y, 0,
                    effectiveMouse.x, effectiveMouse.y, clearRadius
                );
                clearGrad.addColorStop(0, this._colorToRgba(options.backgroundColor, 0.25));
                clearGrad.addColorStop(1, this._colorToRgba(options.backgroundColor, 0));
                offCtx.fillStyle = clearGrad;
                offCtx.beginPath();
                offCtx.arc(effectiveMouse.x, effectiveMouse.y, clearRadius, 0, Math.PI * 2);
                offCtx.fill();
            }
        }

        // Draw each particle as a soft radial gradient blob onto offscreen
        for (const p of this.particles) {
            const lifeRatio = p.life / p.maxLife;
            const fade = lifeRatio < 0.15
                ? lifeRatio / 0.15
                : lifeRatio > 0.75
                    ? 1 - (lifeRatio - 0.75) / 0.25
                    : 1;

            let color = p.color;
            if (glowActive) {
                const whiteness = this.getWhitenessFactor(p.x, p.y, true, options.tailSpeed);
                if (whiteness > 0) color = this.brightenColor(color, options.foregroundColor, whiteness);
            }

            const alpha = fade * options.particleOpacity * 0.15;
            const grad = offCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            grad.addColorStop(0, this._colorToRgba(color, alpha));
            grad.addColorStop(1, this._colorToRgba(color, 0));

            offCtx.fillStyle = grad;
            offCtx.beginPath();
            offCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            offCtx.fill();
        }

        // Clear main canvas with background
        ctx.fillStyle = options.backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Composite offscreen onto main canvas with blur applied to the
        // accumulated smoke layer as a whole, not per-particle
        const blurAmount = Math.max(12, canvas.height * 0.05);
        ctx.filter = `blur(${blurAmount}px)`;
        ctx.drawImage(offscreen, 0, 0);
        ctx.filter = 'none';
    }

    init() {
        this.saveAndClearBackground();
        this.createCanvas();
        this.setupCanvas();
        this._setupOffscreen();
        this._initParticles();
        if (this.options.mouseRepel || this.options.glowAtMouse || this.options.tailSpeed > 0) {
            this.setupMouseTracking();
        }
        this.animate();
        this.handleResize(() => {
            this._setupOffscreen();
            this._initParticles();
        });
    }

    animate() {
        this.animationFrame = requestAnimationFrame(() => this.animate());

        if (!this.shouldRenderFrame()) {
            return;
        }

        this.updateFPS();
        this.updateLazyMouse(this.options.tailSpeed);
        this._updateParticles();
        this.draw();
    }

    // Borrowed from original — kept identical
    shiftHue(color, hueShift) {
        let r, g, b;
        if (color.startsWith('#')) {
            let hex = color.replace('#', '');
            if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        } else if (color.startsWith('rgb')) {
            const match = color.match(/\d+/g);
            r = parseInt(match[0]); g = parseInt(match[1]); b = parseInt(match[2]);
        } else {
            return color;
        }
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        h = (h * 360 + hueShift) % 360;
        if (h < 0) h += 360;
        h /= 360;
        let r2, g2, b2;
        if (s === 0) {
            r2 = g2 = b2 = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1; if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const pp = 2 * l - q;
            r2 = hue2rgb(pp, q, h + 1/3);
            g2 = hue2rgb(pp, q, h);
            b2 = hue2rgb(pp, q, h - 1/3);
        }
        return `rgb(${Math.round(r2*255)}, ${Math.round(g2*255)}, ${Math.round(b2*255)})`;
    }
}

knvas.registerComponent('smoke', Smoke);