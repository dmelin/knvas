class Ping extends KnvasComponent {
    constructor(container, options = {}) {
        super(container);
        const parsedTailSpeed = parseFloat(options.tailSpeed);

        this.options = {
            backgroundColor: options.backgroundColor || '#1a2332',
            middlegroundColor: options.middlegroundColor || '#00d4ff',
            foregroundColor: options.foregroundColor || '#d946ef',
            pingFrequency: parseFloat(options.pingFrequency) || 0.5, // Seconds between pings
            growSpeed: parseFloat(options.growSpeed) || 1,
            tailSpeed: Number.isNaN(parsedTailSpeed) || parsedTailSpeed === 0
                ? 1
                : Math.min(1, Math.max(0.2, parsedTailSpeed))
        };
        this.pings = [];
        this.timeSinceLastPing = 0;
    }

    init() {
        this.saveAndClearBackground();
        this.createCanvas();
        this.setupCanvas();
        if (this.options.tailSpeed > 0) {
            this.setupMouseTracking();
        }
        this.animate();
        this.handleResize(() => {});
    }

    updatePings(deltaTime) {
        const effectiveMouse = this.getEffectiveMouse(this.options.tailSpeed);

        // Update existing pings
        this.pings = this.pings.filter(ping => {
            ping.radius += ping.growSpeed * this.options.growSpeed;
            ping.life += deltaTime;

            // Fade out based on life
            const lifeRatio = ping.life / ping.maxLife;
            ping.opacity = Math.max(0, 1 - lifeRatio);

            // Remove if fully faded
            return ping.opacity > 0.01 && ping.radius < ping.maxRadius;
        });

        // Create new ping at random intervals
        this.timeSinceLastPing += deltaTime;
        const pingInterval = this.options.pingFrequency * 1000; // Convert to ms

        if (this.timeSinceLastPing >= pingInterval && this.attractionActive && effectiveMouse.x !== null && effectiveMouse.y !== null) {
            this.timeSinceLastPing = 0;

            // Random max radius (at least 30% of window size)
            const minSize = Math.min(this.canvas.width, this.canvas.height) * 0.3;
            const maxSize = Math.min(this.canvas.width, this.canvas.height) * 0.8;
            const maxRadius = minSize + Math.random() * (maxSize - minSize);

            // Random color choice
            const useGlow = Math.random() < 0.3; // 30% chance to use foreground color

            this.pings.push({
                x: effectiveMouse.x,
                y: effectiveMouse.y,
                radius: 0,
                maxRadius: maxRadius,
                growSpeed: 2 + Math.random() * 3, // 2-5 pixels per frame
                life: 0,
                maxLife: (maxRadius / (2.5 * this.options.growSpeed)) * (1000 / 60), // Time to reach max radius
                opacity: 1,
                color: useGlow ? this.options.foregroundColor : this.options.middlegroundColor
            });
        }
    }

    draw() {
        // Fill canvas with background color
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw pings
        this.ctx.lineWidth = 1;

        this.pings.forEach(ping => {
            this.ctx.strokeStyle = ping.color;
            this.ctx.globalAlpha = ping.opacity;

            this.ctx.beginPath();
            this.ctx.arc(ping.x, ping.y, ping.radius, 0, Math.PI * 2);
            this.ctx.stroke();
        });

        this.ctx.globalAlpha = 1;
    }

    animate() {
        this.updateFPS();
        this.updateLazyMouse(this.options.tailSpeed);

        const deltaTime = 1000 / 60; // Assume 60fps
        this.updatePings(deltaTime);

        this.draw();
        this.animationFrame = requestAnimationFrame(() => this.animate());
    }

}

knvas.registerComponent('ping', Ping);
