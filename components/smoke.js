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
            particleCount: isMobile && options.particleCountMobile ? parseInt(options.particleCountMobile) : (parseInt(options.particleCount) || 12),
            mouseRepel: options.mouseRepel === 'true' || options.mouseRepel === true,
            glowAtMouse: options.glowAtMouse === 'true' || options.glowAtMouse === true,
            tailSpeed: Number.isNaN(parsedTailSpeed) || parsedTailSpeed === 0
                ? 1
                : Math.min(1, Math.max(0.2, parsedTailSpeed)),
            repelStrength: parseFloat(options.repelStrength) || 0.5
        };
        this.smokeStripes = [];
        this.time = 0;
    }

    init() {
        this.saveAndClearBackground();
        this.createCanvas();
        this.setupCanvas();
        this.initSmokeStripes();
        if (this.options.mouseRepel || this.options.glowAtMouse || this.options.tailSpeed > 0) {
            this.setupMouseTracking();
        }
        this.animate();
        this.handleResize(() => this.initSmokeStripes());
    }

    initSmokeStripes() {
        this.smokeStripes = [];
        const stripeCount = this.options.particleCount;

        for (let i = 0; i < stripeCount; i++) {
            this.smokeStripes.push(this.createSmokeStripe());
        }

        // Mark 20% of stripes (rounded down) to use foreground color with hue variations
        const foregroundCount = Math.floor(stripeCount * 0.2);
        const indices = Array.from({ length: stripeCount }, (_, i) => i);

        // Shuffle and pick first N indices
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        for (let i = 0; i < foregroundCount; i++) {
            const hueShift = i === 0 ? 0 : (Math.random() * 60 - 30); // First: no shift, others: ±30
            this.smokeStripes[indices[i]].useForegroundColor = true;
            this.smokeStripes[indices[i]].foregroundHueShift = hueShift;
        }
    }

    createSmokeStripe() {
        const dotsCount = 6;
        const dots = [];
        const margin = this.canvas.height * 0.1;
        const availableWidth = this.canvas.width;
        const availableHeight = this.canvas.height - (margin * 2);
        const spacing = availableWidth / dotsCount;

        for (let i = 0; i < dotsCount; i++) {
            dots.push({
                baseX: i * spacing, // Base X position (never changes)
                baseY: margin + Math.random() * availableHeight,
                x: i * spacing,
                y: margin + Math.random() * availableHeight,
                vx: (Math.random() - 0.5) * 3, // Horizontal velocity
                vy: (Math.random() - 0.5) * 3, // Vertical velocity
                offsetX: 0,
                offsetY: 0,
                directionChangeChance: 0.002 // 0.2% chance per frame to change direction
            });
        }

        return {
            dots: dots,
            thickness: 10 + Math.random() * 15,
            hueOffset: Math.random() * 60 - 30, // -30 to +30 hue shift
            opacity: 0.4 + Math.random() * 0.4
        };
    }

    updateSmokeStripes() {
        const effectiveMouse = this.getEffectiveMouse(this.options.tailSpeed);
        this.time += 0.01;

        this.smokeStripes.forEach(stripe => {
            stripe.dots.forEach((dot, dotIndex) => {
                // Random chance to change direction
                if (Math.random() < dot.directionChangeChance) {
                    dot.vx *= -1;
                }
                if (Math.random() < dot.directionChangeChance) {
                    dot.vy *= -1;
                }

                // Apply mouse repulsion (both horizontal and vertical)
                if (this.options.mouseRepel && this.attractionActive && effectiveMouse.x !== null && effectiveMouse.y !== null) {
                    const dx = dot.x - effectiveMouse.x;
                    const dy = dot.y - effectiveMouse.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const repelRadius = 150;

                    if (distance < repelRadius && distance > 0) {
                        const force = (1 - (distance / repelRadius)) * this.options.repelStrength;
                        const repelX = (dx / distance) * force * 8;
                        const repelY = (dy / distance) * force * 8;

                        dot.offsetX += repelX;
                        dot.offsetY += repelY;

                        // Dampen the offsets over time
                        dot.offsetX *= 0.95;
                        dot.offsetY *= 0.95;
                    } else {
                        // Return to base position when not repelling
                        dot.offsetX *= 0.98;
                        dot.offsetY *= 0.98;
                    }
                } else {
                    // Return to base position
                    dot.offsetX *= 0.98;
                    dot.offsetY *= 0.98;
                }

                // Move in both directions
                dot.x += dot.vx + dot.offsetX;
                dot.y += dot.vy + dot.offsetY;

                // Bounce off boundaries
                const margin = this.canvas.height * 0.1;
                const minY = margin;
                const maxY = this.canvas.height - margin;
                const maxRepelDistance = 100;

                // Horizontal boundaries
                if (dot.x <= dot.baseX - maxRepelDistance) {
                    dot.x = dot.baseX - maxRepelDistance;
                    dot.vx = Math.abs(dot.vx);
                } else if (dot.x >= dot.baseX + maxRepelDistance) {
                    dot.x = dot.baseX + maxRepelDistance;
                    dot.vx = -Math.abs(dot.vx);
                }

                // Vertical boundaries
                if (dot.y <= minY) {
                    dot.y = minY;
                    dot.vy = Math.abs(dot.vy);
                } else if (dot.y >= maxY) {
                    dot.y = maxY;
                    dot.vy = -Math.abs(dot.vy);
                }
            });
        });
    }

    draw() {
        // Clear with background color
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Apply blur filter (10% of container height)
        const blurAmount = this.canvas.height * 0.1;
        this.ctx.filter = `blur(${blurAmount}px)`;

        const glowActive = this.options.glowAtMouse && this.attractionActive;

        // Draw smoke stripes
        this.smokeStripes.forEach(stripe => {
            if (stripe.dots.length < 2) return;

            // Use foreground color with hue shift for 20% of stripes, middleground with hue shift for others
            const baseColor = stripe.useForegroundColor
                ? this.shiftHue(this.options.foregroundColor, stripe.foregroundHueShift || 0)
                : this.shiftHue(this.options.middlegroundColor, stripe.hueOffset);

            // Calculate color for each dot based on cursor proximity
            const dotColors = stripe.dots.map(dot => {
                if (glowActive) {
                    const whiteness = this.getWhitenessFactor(dot.x, dot.y, this.options.glowAtMouse, this.options.tailSpeed);
                    return this.brightenColor(baseColor, this.options.foregroundColor, whiteness);
                }
                return baseColor;
            });

            this.ctx.lineWidth = stripe.thickness;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.globalAlpha = stripe.opacity * this.options.particleOpacity;

            // Draw each segment with gradient
            for (let i = 0; i < stripe.dots.length; i++) {
                const current = stripe.dots[i];
                const next = stripe.dots[(i + 1) % stripe.dots.length];
                const currentColor = dotColors[i];
                const nextColor = dotColors[(i + 1) % dotColors.length];

                // Create gradient from current dot to next dot
                const gradient = this.ctx.createLinearGradient(current.x, current.y, next.x, next.y);
                gradient.addColorStop(0, currentColor);
                gradient.addColorStop(1, nextColor);

                this.ctx.strokeStyle = gradient;

                this.ctx.beginPath();
                this.ctx.moveTo(current.x, current.y);

                // Calculate control points for smooth bezier
                const controlX1 = current.x + (next.x - current.x) * 0.4;
                const controlY1 = current.y + (next.y - current.y) * 0.4;
                const controlX2 = next.x - (next.x - current.x) * 0.4;
                const controlY2 = next.y - (next.y - current.y) * 0.4;

                this.ctx.bezierCurveTo(controlX1, controlY1, controlX2, controlY2, next.x, next.y);
                this.ctx.stroke();
            }
        });

        this.ctx.globalAlpha = 1;
        this.ctx.filter = 'none';
    }

    shiftHue(color, hueShift) {
        // Parse color to RGB
        let r, g, b;

        if (color.startsWith('#')) {
            let hex = color.replace('#', '');
            if (hex.length === 3) {
                hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            }
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        } else if (color.startsWith('rgb')) {
            const match = color.match(/\d+/g);
            r = parseInt(match[0]);
            g = parseInt(match[1]);
            b = parseInt(match[2]);
        } else {
            return color;
        }

        // Convert to HSL
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
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

        // Shift hue
        h = (h * 360 + hueShift) % 360;
        if (h < 0) h += 360;
        h /= 360;

        // Convert back to RGB
        let r2, g2, b2;

        if (s === 0) {
            r2 = g2 = b2 = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;

            r2 = hue2rgb(p, q, h + 1/3);
            g2 = hue2rgb(p, q, h);
            b2 = hue2rgb(p, q, h - 1/3);
        }

        return `rgb(${Math.round(r2 * 255)}, ${Math.round(g2 * 255)}, ${Math.round(b2 * 255)})`;
    }

    animate() {
        this.updateFPS();
        this.updateLazyMouse(this.options.tailSpeed);
        this.updateSmokeStripes();
        this.draw();
        this.animationFrame = requestAnimationFrame(() => this.animate());
    }

}

knvas.registerComponent('smoke', Smoke);
