class KnvasManager {
    constructor() {
        this.components = {};
        this.instances = new WeakMap();
        this.init();
    }

    init() {
        this.observeDOM();
        this.initializeExistingElements();
    }

    registerComponent(type, ComponentClass) {
        this.components[type] = ComponentClass;
    }

    observeDOM() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.tagName === 'KNVAS') {
                        this.initializeElement(node);
                    }
                    if (node.querySelectorAll) {
                        node.querySelectorAll('knvas').forEach(el => this.initializeElement(el));
                    }
                });

                mutation.removedNodes.forEach((node) => {
                    if (node.tagName === 'KNVAS') {
                        this.destroyElement(node);
                    }
                    if (node.querySelectorAll) {
                        node.querySelectorAll('knvas').forEach(el => this.destroyElement(el));
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    initializeExistingElements() {
        document.querySelectorAll('knvas').forEach(el => this.initializeElement(el));
    }

    initializeElement(element) {
        const type = element.getAttribute('type');
        if (!type) return;

        const container = element.parentElement;

        // Clear any previous errors
        if (container) {
            container.querySelectorAll('.knvas-error').forEach(err => err.remove());
        }

        const ComponentClass = this.components[type];
        if (!ComponentClass) {
            this.renderError(container, `Knvas component type "${type}" not registered`);
            return;
        }

        const options = this.parseOptions(element);

        try {
            const instance = new ComponentClass(container, options);
            instance.init();
            this.instances.set(element, instance);
        } catch (error) {
            this.renderError(container, error.message);
        }
    }

    renderError(container, message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'knvas-error';
        errorDiv.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            right: 10px;
            color: #ef4444;
            font-family: 'Courier New', Courier, monospace;
            font-size: 10px;
            line-height: 1.4;
            white-space: pre-wrap;
            z-index: 1000;
            padding: 8px;
            background: rgba(0, 0, 0, 0.05);
            border: 1px solid #ef4444;
        `;
        errorDiv.textContent = `ERROR: ${message}`;
        container.appendChild(errorDiv);
    }

    parseOptions(element) {
        const options = {};
        element.querySelectorAll('option').forEach(option => {
            const name = option.getAttribute('name');
            const value = option.getAttribute('value');
            if (name) {
                options[name] = value;
            }
        });
        return options;
    }

    destroyElement(element) {
        const instance = this.instances.get(element);
        if (instance && instance.destroy) {
            instance.destroy();
            this.instances.delete(element);
        }

        // Clean up any error messages
        const container = element.parentElement;
        if (container) {
            container.querySelectorAll('.knvas-error').forEach(err => err.remove());
        }
    }
}

// Base class for Knvas components with shared functionality
class KnvasComponent {
    constructor(container) {
        this.container = container;
        this.canvas = null;
        this.ctx = null;
        this.animationFrame = null;
        this.originalBackground = null;
        this.resizeObserver = null;

        // Mouse tracking properties
        this.mouse = { x: null, y: null, inBounds: false };
        this.lazyMouse = { x: null, y: null };
        this.mouseHistory = [];
        this.attractionActive = false;
        this.attractionTimeout = null;
        this.mouseMoveHandler = null;
        this.mouseLeaveHandler = null;
        this.clickHandler = null;

        // FPS tracking
        this.fps = 0;
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
    }

    updateFPS() {
        this.frameCount++;
        const now = performance.now();
        const elapsed = now - this.lastFpsUpdate;

        // Update FPS every second
        if (elapsed >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / elapsed);
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
    }

    updateLazyMouse(tailSpeed) {
        if (tailSpeed === 0) {
            this.lazyMouse.x = this.mouse.x;
            this.lazyMouse.y = this.mouse.y;
            this.mouseHistory = [];
            return;
        }

        if (this.mouse.x === null || this.mouse.y === null) {
            this.lazyMouse.x = null;
            this.lazyMouse.y = null;
            this.mouseHistory = [];
            return;
        }

        // Initialize lazy mouse to actual mouse position if not set
        if (this.lazyMouse.x === null || this.lazyMouse.y === null) {
            this.lazyMouse.x = this.mouse.x;
            this.lazyMouse.y = this.mouse.y;
            return;
        }

        // If we have history, follow the oldest position in the queue
        if (this.mouseHistory.length > 0) {
            const target = this.mouseHistory[0];
            const dx = target.x - this.lazyMouse.x;
            const dy = target.y - this.lazyMouse.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Speed is proportional to tailSpeed (0.2-1.0)
            // At 1.0, moves at 15 pixels per frame to keep up with cursor
            const speed = 15 * tailSpeed;

            if (distance > speed) {
                // Move towards target
                this.lazyMouse.x += (dx / distance) * speed;
                this.lazyMouse.y += (dy / distance) * speed;
            } else {
                // Reached target, remove it from history
                this.lazyMouse.x = target.x;
                this.lazyMouse.y = target.y;
                this.mouseHistory.shift();
            }
        } else {
            // No history, lerp towards current position
            const lerpFactor = 0.05;
            this.lazyMouse.x += (this.mouse.x - this.lazyMouse.x) * lerpFactor;
            this.lazyMouse.y += (this.mouse.y - this.lazyMouse.y) * lerpFactor;
        }
    }

    getEffectiveMouse(tailSpeed) {
        return tailSpeed > 0 ? this.lazyMouse : this.mouse;
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
        this.canvas.style.borderRadius = 'inherit';
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
    }

    setupCanvas() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    setupMouseTracking() {
        this.mouseMoveHandler = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const newX = e.clientX - rect.left;
            const newY = e.clientY - rect.top;

            // Record position to history if it's far enough from the last recorded position
            if (this.mouseHistory.length === 0) {
                this.mouseHistory.push({ x: newX, y: newY });
            } else {
                const last = this.mouseHistory[this.mouseHistory.length - 1];
                const dx = newX - last.x;
                const dy = newY - last.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Only add to history if moved at least 5 pixels
                if (distance >= 5) {
                    this.mouseHistory.push({ x: newX, y: newY });

                    // Limit history length to prevent memory issues
                    if (this.mouseHistory.length > 200) {
                        this.mouseHistory.shift();
                    }
                }
            }

            this.mouse.x = newX;
            this.mouse.y = newY;
            this.mouse.inBounds = true;
            this.attractionActive = true;
        };

        this.mouseLeaveHandler = () => {
            this.mouse.inBounds = false;
            this.attractionActive = false;
            this.mouseHistory = [];
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

    getWhitenessFactor(x, y, glowEnabled, tailSpeed = 0) {
        if (!glowEnabled || !this.attractionActive) {
            return 0;
        }

        const effectiveMouse = this.getEffectiveMouse(tailSpeed);
        if (effectiveMouse.x === null || effectiveMouse.y === null) {
            return 0;
        }

        const dx = effectiveMouse.x - x;
        const dy = effectiveMouse.y - y;
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

    handleResize(onResize) {
        this.resizeObserver = new ResizeObserver(() => {
            this.setupCanvas();
            if (onResize) onResize.call(this);
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

const knvas = new KnvasManager();
