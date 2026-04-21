class Stars {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            backgroundColor: options.backgroundColor || '#2d1b3d',
            middlegroundColor: options.middlegroundColor || '#ff69b4',
            foregroundColor: options.foregroundColor || '#ffffff',
            lineOpacity: parseFloat(options.lineOpacity) || 0.3,
            starCount: options.starCount || null,
            mouseAttract: options.mouseAttract === 'true' || options.mouseAttract === true,
            glowAtMouse: options.glowAtMouse === 'true' || options.glowAtMouse === true
        };
        this.canvas = null;
        this.ctx = null;
        this.animationFrame = null;
        this.originalBackground = null;
        this.stars = [];
        this.connectionDistance = 100;
        this.connectionDistanceSq = 100 * 100; // avoid sqrt in hot loop
        this.mouse = { x: null, y: null, inBounds: false };
        this.attractionActive = false;
        this.attractionTimeout = null;
    }

    init() {
        this.saveAndClearBackground();
        this.createCanvas();
        this.setupCanvas();
        this.initStars();
        this.setupMouseTracking();
        this.animate();
        this.handleResize();
    }

    setupMouseTracking() {
        if (!this.options.mouseAttract && !this.options.glowAtMouse) return;

        this.mouseMoveHandler = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
            this.mouse.inBounds = true;
            this.attractionActive = true;
        };

        this.mouseLeaveHandler = () => {
            this.mouse.inBounds = false;
            this.attractionActive = false;
        };

        this.clickHandler = (e) => {
            if (!this.mouse.inBounds) {
                const rect = this.canvas.getBoundingClientRect();
                this.mouse.x = e.clientX - rect.left;
                this.mouse.y = e.clientY - rect.top;
                this.attractionActive = true;

                if (this.attractionTimeout) {
                    clearTimeout(this.attractionTimeout);
                }

                this.attractionTimeout = setTimeout(() => {
                    if (!this.mouse.inBounds) {
                        this.attractionActive = false;
                    }
                }, 3000);
            }
        };

        document.body.addEventListener('mousemove', this.mouseMoveHandler);
        this.canvas.addEventListener('mouseleave', this.mouseLeaveHandler);
        this.canvas.addEventListener('click', this.clickHandler);
    }

    saveAndClearBackground() {
        this.originalBackground = this.container.style.background;
        this.container.style.background = 'none';
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.display = 'block';
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.zIndex = '-1';
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
    }

    setupCanvas() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    initStars() {
        const area = this.canvas.width * this.canvas.height;
        const count = this.options.starCount || Math.min(Math.floor(area / 10000), 150);

        this.stars = [];
        for (let i = 0; i < count; i++) {
            this.stars.push(this.createStar());
        }
    }

    createStar() {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.2 + Math.random() * 0.8;

        return {
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: Math.random() * 500 + 100,
            maxLife: Math.random() * 500 + 100,
            radius: 1 + Math.random() * 1.5
        };
    }

    updateStars() {
        this.stars.forEach(star => {
            if (this.options.mouseAttract && this.attractionActive && this.mouse.x !== null && this.mouse.y !== null) {
                const dx = this.mouse.x - star.x;
                const dy = this.mouse.y - star.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > 0) {
                    const maxAttractionDistance = 300;
                    const force = Math.max(0, 1 - (distance / maxAttractionDistance));
                    const attractionStrength = 0.075;

                    const ax = (dx / distance) * force * attractionStrength;
                    const ay = (dy / distance) * force * attractionStrength;

                    star.vx += ax;
                    star.vy += ay;

                    const maxVel = 3;
                    const vel = Math.sqrt(star.vx * star.vx + star.vy * star.vy);
                    if (vel > maxVel) {
                        star.vx = (star.vx / vel) * maxVel;
                        star.vy = (star.vy / vel) * maxVel;
                    }
                }
            }

            star.x += star.vx;
            star.y += star.vy;

            if (star.x <= 0 || star.x >= this.canvas.width) {
                star.vx *= -1;
                star.x = Math.max(0, Math.min(this.canvas.width, star.x));
            }
            if (star.y <= 0 || star.y >= this.canvas.height) {
                star.vy *= -1;
                star.y = Math.max(0, Math.min(this.canvas.height, star.y));
            }

            star.life--;
            if (star.life <= 0) {
                const newStar = this.createStar();
                Object.assign(star, newStar);
            }
        });
    }

    getWhitenessFactor(x, y) {
        if (!this.options.glowAtMouse || !this.attractionActive || this.mouse.x === null || this.mouse.y === null) {
            return 0;
        }

        const dx = this.mouse.x - x;
        const dy = this.mouse.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const brightnessRange = 200;

        return Math.max(0, 0.95 * (1 - (distance / brightnessRange)));
    }

    brightenColor(baseColor, targetColor, amount) {
        if (amount === 0) {
            return baseColor;
        }

        // Parse base color
        let baseHex = baseColor.replace('#', '');
        if (baseHex.length === 3) {
            baseHex = baseHex[0] + baseHex[0] + baseHex[1] + baseHex[1] + baseHex[2] + baseHex[2];
        }
        let r1 = parseInt(baseHex.substring(0, 2), 16);
        let g1 = parseInt(baseHex.substring(2, 4), 16);
        let b1 = parseInt(baseHex.substring(4, 6), 16);

        // Parse target color
        let targetHex = targetColor.replace('#', '');
        if (targetHex.length === 3) {
            targetHex = targetHex[0] + targetHex[0] + targetHex[1] + targetHex[1] + targetHex[2] + targetHex[2];
        }
        let r2 = parseInt(targetHex.substring(0, 2), 16);
        let g2 = parseInt(targetHex.substring(2, 4), 16);
        let b2 = parseInt(targetHex.substring(4, 6), 16);

        // Interpolate
        const r = Math.floor(r1 + (r2 - r1) * amount);
        const g = Math.floor(g1 + (g2 - g1) * amount);
        const b = Math.floor(b1 + (b2 - b1) * amount);

        return `rgb(${r}, ${g}, ${b})`;
    }

    draw() {
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Precompute whiteness per star once per frame (O(n) instead of O(n²))
        const glowActive = this.options.glowAtMouse && this.attractionActive;
        const starWhiteness = glowActive
            ? this.stars.map(s => this.getWhitenessFactor(s.x, s.y))
            : null;

        // Draw connections
        this.ctx.lineWidth = 0.5;

        for (let i = 0; i < this.stars.length; i++) {
            for (let j = i + 1; j < this.stars.length; j++) {
                const dx = this.stars[i].x - this.stars[j].x;
                const dy = this.stars[i].y - this.stars[j].y;

                // Squared distance check — skip sqrt entirely for pairs that don't connect
                const distSq = dx * dx + dy * dy;
                if (distSq >= this.connectionDistanceSq) continue;

                // Only pay for sqrt when we actually need the value for opacity
                const distance = Math.sqrt(distSq);
                const opacity = 1 - (distance / this.connectionDistance);

                if (glowActive) {
                    // Average the precomputed whiteness of the two endpoint stars
                    const whiteness = (starWhiteness[i] + starWhiteness[j]) / 2;
                    this.ctx.strokeStyle = this.brightenColor(this.options.middlegroundColor, this.options.foregroundColor, whiteness);
                    this.ctx.globalAlpha = opacity * this.options.lineOpacity * (1 + whiteness);
                } else {
                    this.ctx.strokeStyle = this.options.middlegroundColor;
                    this.ctx.globalAlpha = opacity * this.options.lineOpacity;
                }

                this.ctx.beginPath();
                this.ctx.moveTo(this.stars[i].x, this.stars[i].y);
                this.ctx.lineTo(this.stars[j].x, this.stars[j].y);
                this.ctx.stroke();
            }
        }

        // Draw stars
        this.ctx.globalAlpha = 1;

        this.stars.forEach((star, i) => {
            if (glowActive) {
                this.ctx.fillStyle = this.brightenColor(this.options.middlegroundColor, this.options.foregroundColor, starWhiteness[i]);
            } else {
                this.ctx.fillStyle = this.options.middlegroundColor;
            }

            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    animate() {
        this.updateStars();
        this.draw();
        this.animationFrame = requestAnimationFrame(() => this.animate());
    }

    handleResize() {
        this.resizeObserver = new ResizeObserver(() => {
            this.setupCanvas();
            this.initStars();
        });
        this.resizeObserver.observe(this.container);
    }

    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        if (this.attractionTimeout) {
            clearTimeout(this.attractionTimeout);
        }
        if (this.mouseMoveHandler) {
            document.body.removeEventListener('mousemove', this.mouseMoveHandler);
        }
        if (this.mouseLeaveHandler && this.canvas) {
            this.canvas.removeEventListener('mouseleave', this.mouseLeaveHandler);
        }
        if (this.clickHandler && this.canvas) {
            this.canvas.removeEventListener('click', this.clickHandler);
        }
        if (this.canvas) {
            this.canvas.remove();
        }
        if (this.originalBackground !== null) {
            this.container.style.background = this.originalBackground;
        }
    }
}

knvas.registerComponent('stars', Stars);