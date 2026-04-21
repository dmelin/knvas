class Grid extends KnvasComponent {
    constructor(container, options = {}) {
        super(container);
        const isMobile = window.innerWidth <= 768;
        const parsedTailSpeed = parseFloat(options.tailSpeed);

        this.options = {
            backgroundColor: options.backgroundColor || '#1a2332',
            middlegroundColor: options.middlegroundColor || '#00d4ff',
            foregroundColor: options.foregroundColor || '#d946ef',
            lineOpacity: parseFloat(options.lineOpacity) || 1,
            columnCount: isMobile && options.columnCountMobile ? parseInt(options.columnCountMobile) : (parseInt(options.columnCount) || 20),
            rowCount: isMobile && options.rowCountMobile ? parseInt(options.rowCountMobile) : (parseInt(options.rowCount) || 24),
            mouseAttract: options.mouseAttract === 'true' || options.mouseAttract === true,
            glowAtMouse: options.glowAtMouse === 'true' || options.glowAtMouse === true,
            tailSpeed: Number.isNaN(parsedTailSpeed) || parsedTailSpeed === 0
                ? 1
                : Math.min(1, Math.max(0.2, parsedTailSpeed)),
            gravityFactor: parseFloat(options.gravityFactor) || 0.3
        };
        this.dots = [];
    }

    init() {
        this.saveAndClearBackground();
        this.createCanvas();
        this.setupCanvas();
        this.initDots();
        if (this.options.mouseAttract || this.options.glowAtMouse || this.options.tailSpeed > 0) {
            this.setupMouseTracking();
        }
        this.animate();
        this.handleResize(() => this.initDots());
    }

    initDots() {
        this.dots = [];
        const cols = this.options.columnCount + 1; // Number of dot columns
        const rows = this.options.rowCount + 1; // Number of dot rows

        const cellWidth = this.canvas.width / this.options.columnCount;
        const cellHeight = this.canvas.height / this.options.rowCount;

        const maxOffsetX = cellWidth / 3;
        const maxOffsetY = cellHeight / 3;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const baseX = col * cellWidth;
                const baseY = row * cellHeight;

                // Determine if this is a corner, edge, or interior dot
                const isCorner = (row === 0 || row === rows - 1) && (col === 0 || col === cols - 1);
                const isTopBottomEdge = (row === 0 || row === rows - 1) && !isCorner;
                const isLeftRightEdge = (col === 0 || col === cols - 1) && !isCorner;
                const isInterior = !isCorner && !isTopBottomEdge && !isLeftRightEdge;

                let vx = 0, vy = 0;

                if (isCorner) {
                    // Corners don't move
                    vx = 0;
                    vy = 0;
                } else if (isTopBottomEdge) {
                    // Top/bottom edges only move horizontally
                    vx = (Math.random() - 0.5) * 0.5;
                    vy = 0;
                } else if (isLeftRightEdge) {
                    // Left/right edges only move vertically
                    vx = 0;
                    vy = (Math.random() - 0.5) * 0.5;
                } else {
                    // Interior dots move in both directions
                    vx = (Math.random() - 0.5) * 0.5;
                    vy = (Math.random() - 0.5) * 0.5;
                }

                this.dots.push({
                    row,
                    col,
                    baseX,
                    baseY,
                    x: baseX,
                    y: baseY,
                    vx,
                    vy,
                    maxOffsetX: isTopBottomEdge || isInterior ? maxOffsetX : 0,
                    maxOffsetY: isLeftRightEdge || isInterior ? maxOffsetY : 0,
                    isCorner,
                    isTopBottomEdge,
                    isLeftRightEdge,
                    isInterior
                });
            }
        }
    }

    updateDots() {
        const effectiveMouse = this.getEffectiveMouse(this.options.tailSpeed);

        this.dots.forEach(dot => {
            if (dot.isCorner) return; // Corners don't move

            if (this.options.mouseAttract && this.attractionActive && effectiveMouse.x !== null && effectiveMouse.y !== null) {
                // Calculate direction to mouse
                const dx = effectiveMouse.x - dot.baseX;
                const dy = effectiveMouse.y - dot.baseY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > 0) {
                    // Normalize direction
                    const dirX = dx / distance;
                    const dirY = dy / distance;

                    // Calculate how far the dot can move towards mouse
                    // Effect is stronger at longer distances (normalized by distance/100)
                    const distanceFactor = Math.min(distance / 100, 3);
                    const pullStrength = this.options.gravityFactor * distanceFactor;

                    // Calculate target offset (how much to pull towards mouse)
                    let targetOffsetX = dirX * pullStrength * dot.maxOffsetX;
                    let targetOffsetY = dirY * pullStrength * dot.maxOffsetY;

                    // Constrain based on dot type
                    if (dot.isTopBottomEdge) {
                        targetOffsetY = 0; // Top/bottom edges only move horizontally
                    } else if (dot.isLeftRightEdge) {
                        targetOffsetX = 0; // Left/right edges only move vertically
                    }

                    // Clamp to boundaries
                    targetOffsetX = Math.max(-dot.maxOffsetX, Math.min(dot.maxOffsetX, targetOffsetX));
                    targetOffsetY = Math.max(-dot.maxOffsetY, Math.min(dot.maxOffsetY, targetOffsetY));

                    // Set position directly (smooth movement towards target)
                    const currentOffsetX = dot.x - dot.baseX;
                    const currentOffsetY = dot.y - dot.baseY;

                    // Lerp towards target position
                    const smoothing = 0.1;
                    dot.x = dot.baseX + currentOffsetX + (targetOffsetX - currentOffsetX) * smoothing;
                    dot.y = dot.baseY + currentOffsetY + (targetOffsetY - currentOffsetY) * smoothing;
                }
            } else if (this.attractionActive && effectiveMouse.x !== null && effectiveMouse.y !== null) {
                // Mouse repulsion when not attracting
                const dx = dot.baseX - effectiveMouse.x;
                const dy = dot.baseY - effectiveMouse.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const repelRadius = 200;

                if (distance < repelRadius && distance > 0) {
                    const force = (1 - (distance / repelRadius)) * 0.5;

                    let repelX = (dx / distance) * force * dot.maxOffsetX;
                    let repelY = (dy / distance) * force * dot.maxOffsetY;

                    // Constrain based on dot type
                    if (dot.isTopBottomEdge) {
                        repelY = 0; // Top/bottom edges only move horizontally
                    } else if (dot.isLeftRightEdge) {
                        repelX = 0; // Left/right edges only move vertically
                    }

                    // Clamp to boundaries
                    repelX = Math.max(-dot.maxOffsetX, Math.min(dot.maxOffsetX, repelX));
                    repelY = Math.max(-dot.maxOffsetY, Math.min(dot.maxOffsetY, repelY));

                    // Smooth movement
                    const currentOffsetX = dot.x - dot.baseX;
                    const currentOffsetY = dot.y - dot.baseY;
                    const smoothing = 0.1;

                    dot.x = dot.baseX + currentOffsetX + (repelX - currentOffsetX) * smoothing;
                    dot.y = dot.baseY + currentOffsetY + (repelY - currentOffsetY) * smoothing;
                } else {
                    // Far from cursor - use random drift movement
                    dot.x += dot.vx;
                    dot.y += dot.vy;

                    // Calculate offset from base position
                    const offsetX = dot.x - dot.baseX;
                    const offsetY = dot.y - dot.baseY;

                    // Bounce off boundaries
                    if (Math.abs(offsetX) >= dot.maxOffsetX) {
                        dot.vx *= -1;
                        dot.x = dot.baseX + Math.sign(offsetX) * dot.maxOffsetX;
                    }

                    if (Math.abs(offsetY) >= dot.maxOffsetY) {
                        dot.vy *= -1;
                        dot.y = dot.baseY + Math.sign(offsetY) * dot.maxOffsetY;
                    }
                }
            } else {
                // No cursor - use random drift movement
                dot.x += dot.vx;
                dot.y += dot.vy;

                // Calculate offset from base position
                const offsetX = dot.x - dot.baseX;
                const offsetY = dot.y - dot.baseY;

                // Bounce off boundaries
                if (Math.abs(offsetX) >= dot.maxOffsetX) {
                    dot.vx *= -1;
                    dot.x = dot.baseX + Math.sign(offsetX) * dot.maxOffsetX;
                }

                if (Math.abs(offsetY) >= dot.maxOffsetY) {
                    dot.vy *= -1;
                    dot.y = dot.baseY + Math.sign(offsetY) * dot.maxOffsetY;
                }
            }
        });
    }

    draw() {
        // Fill canvas with background color
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const cols = this.options.columnCount + 1;
        const rows = this.options.rowCount + 1;

        // Precompute whiteness per dot once per frame
        const glowActive = this.options.glowAtMouse && this.attractionActive;
        const dotWhiteness = glowActive
            ? this.dots.map(d => this.getWhitenessFactor(d.x, d.y, this.options.glowAtMouse, this.options.tailSpeed))
            : null;

        // Draw filled cells (shapes) with 0.5 opacity
        for (let row = 0; row < this.options.rowCount; row++) {
            for (let col = 0; col < this.options.columnCount; col++) {
                // Get the 4 corner dots of this cell
                const topLeftIdx = row * cols + col;
                const topRightIdx = row * cols + (col + 1);
                const bottomRightIdx = (row + 1) * cols + (col + 1);
                const bottomLeftIdx = (row + 1) * cols + col;

                const topLeft = this.dots[topLeftIdx];
                const topRight = this.dots[topRightIdx];
                const bottomRight = this.dots[bottomRightIdx];
                const bottomLeft = this.dots[bottomLeftIdx];

                if (glowActive) {
                    // Average whiteness of all 4 corners
                    const whiteness = (dotWhiteness[topLeftIdx] + dotWhiteness[topRightIdx] +
                                      dotWhiteness[bottomRightIdx] + dotWhiteness[bottomLeftIdx]) / 4;
                    this.ctx.fillStyle = this.brightenColor(this.options.backgroundColor, this.options.foregroundColor, whiteness);
                } else {
                    this.ctx.fillStyle = this.options.backgroundColor;
                }

                this.ctx.globalAlpha = 0.2;

                // Draw filled shape
                this.ctx.beginPath();
                this.ctx.moveTo(topLeft.x, topLeft.y);
                this.ctx.lineTo(topRight.x, topRight.y);
                this.ctx.lineTo(bottomRight.x, bottomRight.y);
                this.ctx.lineTo(bottomLeft.x, bottomLeft.y);
                this.ctx.closePath();
                this.ctx.fill();
            }
        }

        // Draw horizontal lines
        this.ctx.lineWidth = 1;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols - 1; col++) {
                const dot1Idx = row * cols + col;
                const dot2Idx = row * cols + (col + 1);
                const dot1 = this.dots[dot1Idx];
                const dot2 = this.dots[dot2Idx];

                if (glowActive) {
                    const whiteness = (dotWhiteness[dot1Idx] + dotWhiteness[dot2Idx]) / 2;
                    this.ctx.strokeStyle = this.brightenColor(this.options.middlegroundColor, this.options.foregroundColor, whiteness);
                    this.ctx.globalAlpha = this.options.lineOpacity * (1 + whiteness);
                } else {
                    this.ctx.strokeStyle = this.options.middlegroundColor;
                    this.ctx.globalAlpha = this.options.lineOpacity;
                }

                this.ctx.beginPath();
                this.ctx.moveTo(dot1.x, dot1.y);
                this.ctx.lineTo(dot2.x, dot2.y);
                this.ctx.stroke();
            }
        }

        // Draw vertical lines
        for (let col = 0; col < cols; col++) {
            for (let row = 0; row < rows - 1; row++) {
                const dot1Idx = row * cols + col;
                const dot2Idx = (row + 1) * cols + col;
                const dot1 = this.dots[dot1Idx];
                const dot2 = this.dots[dot2Idx];

                if (glowActive) {
                    const whiteness = (dotWhiteness[dot1Idx] + dotWhiteness[dot2Idx]) / 2;
                    this.ctx.strokeStyle = this.brightenColor(this.options.middlegroundColor, this.options.foregroundColor, whiteness);
                    this.ctx.globalAlpha = this.options.lineOpacity * (1 + whiteness);
                } else {
                    this.ctx.strokeStyle = this.options.middlegroundColor;
                    this.ctx.globalAlpha = this.options.lineOpacity;
                }

                this.ctx.beginPath();
                this.ctx.moveTo(dot1.x, dot1.y);
                this.ctx.lineTo(dot2.x, dot2.y);
                this.ctx.stroke();
            }
        }

    }

    animate() {
        this.updateFPS();
        this.updateLazyMouse(this.options.tailSpeed);
        this.updateDots();
        this.draw();
        this.animationFrame = requestAnimationFrame(() => this.animate());
    }

}

knvas.registerComponent('grid', Grid);
