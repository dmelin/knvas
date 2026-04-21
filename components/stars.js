class Stars extends KnvasComponent {
    constructor(container, options = {}) {
        super(container);
        const isMobile = window.innerWidth <= 768;
        const parsedTailSpeed = parseFloat(options.tailSpeed);

        this.options = {
            backgroundColor: options.backgroundColor || '#1a2332',
            middlegroundColor: options.middlegroundColor || '#00d4ff',
            foregroundColor: options.foregroundColor || '#d946ef',
            lineOpacity: parseFloat(options.lineOpacity) || 0.3,
            starCount: isMobile && options.starCountMobile ? parseInt(options.starCountMobile) : (options.starCount || null),
            mouseAttract: options.mouseAttract === 'true' || options.mouseAttract === true,
            glowAtMouse: options.glowAtMouse === 'true' || options.glowAtMouse === true,
            tailSpeed: Number.isNaN(parsedTailSpeed) || parsedTailSpeed === 0
                ? 1
                : Math.min(1, Math.max(0.2, parsedTailSpeed))
        };
        this.stars = [];
        this.connectionDistance = 100;
        this.connectionDistanceSq = 100 * 100; // avoid sqrt in hot loop
    }

    init() {
        this.saveAndClearBackground();
        this.createCanvas();
        this.setupCanvas();
        this.initStars();
        if (this.options.mouseAttract || this.options.glowAtMouse || this.options.tailSpeed > 0) {
            this.setupMouseTracking();
        }
        this.animate();
        this.handleResize(() => this.initStars());
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
        const effectiveMouse = this.getEffectiveMouse(this.options.tailSpeed);

        this.stars.forEach(star => {
            if (this.options.mouseAttract && this.attractionActive && effectiveMouse.x !== null && effectiveMouse.y !== null) {
                const dx = effectiveMouse.x - star.x;
                const dy = effectiveMouse.y - star.y;
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

    draw() {
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Precompute whiteness per star once per frame (O(n) instead of O(n²))
        const glowActive = this.options.glowAtMouse && this.attractionActive;
        const starWhiteness = glowActive
            ? this.stars.map(s => this.getWhitenessFactor(s.x, s.y, this.options.glowAtMouse, this.options.tailSpeed))
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
        this.updateFPS();
        this.updateLazyMouse(this.options.tailSpeed);
        this.updateStars();
        this.draw();
        this.animationFrame = requestAnimationFrame(() => this.animate());
    }

}

knvas.registerComponent('stars', Stars);
