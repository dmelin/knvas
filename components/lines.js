class Lines extends KnvasComponent {
    constructor(container, options = {}) {
        super(container);
        const isMobile = window.innerWidth <= 768;
        const parsedTailSpeed = parseFloat(options.tailSpeed);

        this.options = {
            backgroundColor: options.backgroundColor || '#1a2332',
            middlegroundColor: options.middlegroundColor || '#00d4ff',
            foregroundColor: options.foregroundColor || '#d946ef',
            lineCount: isMobile && options.lineCountMobile ? parseInt(options.lineCountMobile) : (parseInt(options.lineCount) || 50),
            mouseRepel: options.mouseRepel === 'true' || options.mouseRepel === true,
            glowAtMouse: options.glowAtMouse === 'true' || options.glowAtMouse === true,
            tailSpeed: Number.isNaN(parsedTailSpeed) || parsedTailSpeed === 0
                ? 1
                : Math.min(1, Math.max(0.2, parsedTailSpeed)),
            repelStrength: parseFloat(options.repelStrength) || 0.5
        };
        this.lines = [];
    }

    init() {
        this.saveAndClearBackground();
        this.createCanvas();
        this.setupCanvas();
        this.initLines();
        if (this.options.mouseRepel || this.options.glowAtMouse || this.options.tailSpeed > 0) {
            this.setupMouseTracking();
        }
        this.animate();
        this.handleResize(() => this.initLines());
    }

    initLines() {
        this.lines = [];
        const count = this.options.lineCount;
        const spacing = this.canvas.width / (count - 1);

        for (let i = 0; i < count; i++) {
            this.lines.push({
                baseX: i * spacing,
                x: i * spacing,
                vx: (Math.random() - 0.5) * 0.3, // Slow random horizontal velocity
                offsetX: 0,
                maxOffset: 30,
                opacity: 0.2 + Math.random() * 0.6 // Random opacity between 0.2 and 0.8
            });
        }
    }

    updateLines() {
        const effectiveMouse = this.getEffectiveMouse(this.options.tailSpeed);

        this.lines.forEach(line => {
            // Apply mouse repulsion
            if (this.options.mouseRepel && this.attractionActive && effectiveMouse.x !== null && effectiveMouse.y !== null) {
                const dx = line.baseX - effectiveMouse.x;
                const distance = Math.abs(dx);
                const repelRadius = 150;

                if (distance < repelRadius) {
                    const force = (1 - (distance / repelRadius)) * this.options.repelStrength;
                    const repelX = (dx / Math.max(Math.abs(dx), 0.001)) * force * 8;

                    line.offsetX += repelX;
                    line.offsetX *= 0.95; // Dampen
                } else {
                    line.offsetX *= 0.98; // Return to base
                }
            } else {
                line.offsetX *= 0.98; // Return to base
            }

            // Random drift movement
            line.x += line.vx;

            // Add offset from repulsion
            line.x += line.offsetX - (line.offsetX * 0.98);

            // Calculate offset from base position
            const offsetX = line.x - line.baseX;

            // Bounce off boundaries
            if (Math.abs(offsetX) >= line.maxOffset) {
                line.vx *= -1;
                line.x = line.baseX + Math.sign(offsetX) * line.maxOffset;
            }
        });
    }

    draw() {
        // Fill canvas with background color
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const effectiveMouse = this.getEffectiveMouse(this.options.tailSpeed);
        const glowActive = this.options.glowAtMouse && this.attractionActive;

        this.ctx.lineWidth = 1;
        this.ctx.lineCap = 'butt';

        // Draw lines
        this.lines.forEach(line => {
            let color = this.options.middlegroundColor;

            if (glowActive && effectiveMouse.x !== null && effectiveMouse.y !== null) {
                const dx = line.x - effectiveMouse.x;
                const distance = Math.abs(dx);
                const glowRadius = 200;

                if (distance < glowRadius) {
                    // Interpolate from middleground to foreground based on proximity
                    const proximity = 1 - (distance / glowRadius);
                    color = this.brightenColor(this.options.middlegroundColor, this.options.foregroundColor, proximity);
                }
            }

            this.ctx.strokeStyle = color;
            this.ctx.globalAlpha = line.opacity;

            this.ctx.beginPath();
            this.ctx.moveTo(line.x, 0);
            this.ctx.lineTo(line.x, this.canvas.height);
            this.ctx.stroke();
        });

        this.ctx.globalAlpha = 1;
    }

    animate() {
        this.animationFrame = requestAnimationFrame(() => this.animate());

        if (!this.shouldRenderFrame()) {
            return;
        }

        this.updateFPS();
        this.updateLazyMouse(this.options.tailSpeed);
        this.updateLines();
        this.draw();
    }

}

knvas.registerComponent('lines', Lines);
