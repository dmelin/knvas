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

    async initializeElement(element) {
        const type = element.getAttribute('type');
        if (!type) return;

        const container = element.parentElement;

        // Clear any previous errors
        if (container) {
            container.querySelectorAll('.knvas-error').forEach(err => err.remove());
        }

        let ComponentClass = this.components[type];

        // If component not registered, try to load it dynamically
        if (!ComponentClass) {
            try {
                await this.loadComponent(type);
                ComponentClass = this.components[type];
            } catch (error) {
                this.renderError(container, `Failed to load component "${type}": ${error.message}`);
                return;
            }
        }

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

    loadComponent(type) {
        // If already loading this component, return the existing promise
        if (this.loadingComponents && this.loadingComponents[type]) {
            return this.loadingComponents[type];
        }

        if (!this.loadingComponents) {
            this.loadingComponents = {};
        }

        // Determine the base URL (where knvas.js is located)
        const scripts = document.querySelectorAll('script[src*="knvas.js"]');
        let baseUrl = '';
        if (scripts.length > 0) {
            const scriptSrc = scripts[0].src;
            baseUrl = scriptSrc.substring(0, scriptSrc.lastIndexOf('/') + 1);
        }

        const componentUrl = `${baseUrl}${type}.js`;

        // Create a promise that resolves when the script loads
        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = componentUrl;
            script.onload = () => {
                delete this.loadingComponents[type];
                resolve();
            };
            script.onerror = () => {
                delete this.loadingComponents[type];
                reject(new Error(`Could not load ${componentUrl}`));
            };
            document.head.appendChild(script);
        });

        this.loadingComponents[type] = promise;
        return promise;
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
        this.temporaryCursorActive = false;
        this.pointerMoveHandler = null;
        this.pointerLeaveHandler = null;
        this.pointerDownHandler = null;
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

    clearCursorState() {
        this.mouse.x = null;
        this.mouse.y = null;
        this.mouse.inBounds = false;
        this.lazyMouse.x = null;
        this.lazyMouse.y = null;
        this.mouseHistory = [];
        this.attractionActive = false;
        this.temporaryCursorActive = false;
    }

    clearAttractionTimeout() {
        if (this.attractionTimeout) {
            clearTimeout(this.attractionTimeout);
            this.attractionTimeout = null;
        }
    }

    activateTemporaryCursor(x, y) {
        this.mouse.x = x;
        this.mouse.y = y;
        this.mouse.inBounds = false;
        this.attractionActive = true;
        this.temporaryCursorActive = true;
        this.mouseHistory = [];

        this.clearAttractionTimeout();
        this.attractionTimeout = setTimeout(() => {
            if (this.temporaryCursorActive) {
                this.clearCursorState();
            }
        }, 1000);
    }

    setupMouseTracking() {
        this.pointerMoveHandler = (e) => {
            if (e.pointerType && e.pointerType !== 'mouse') {
                return;
            }

            const rect = this.canvas.getBoundingClientRect();
            const newX = e.clientX - rect.left;
            const newY = e.clientY - rect.top;
            const inBounds = newX >= 0 && newX <= rect.width && newY >= 0 && newY <= rect.height;

            this.clearAttractionTimeout();
            this.temporaryCursorActive = false;

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
            this.mouse.inBounds = inBounds;
            this.attractionActive = true;
        };

        this.pointerLeaveHandler = () => {
            if (!this.temporaryCursorActive) {
                this.clearCursorState();
            }
        };

        this.pointerDownHandler = (e) => {
            if (e.pointerType === 'mouse') {
                return;
            }

            const rect = this.canvas.getBoundingClientRect();
            this.activateTemporaryCursor(
                e.clientX - rect.left,
                e.clientY - rect.top
            );
        };

        if (window.PointerEvent) {
            document.body.addEventListener('pointermove', this.pointerMoveHandler);
            this.canvas.addEventListener('pointerleave', this.pointerLeaveHandler);
            this.canvas.addEventListener('pointerdown', this.pointerDownHandler);
            return;
        }

        this.mouseMoveHandler = (e) => this.pointerMoveHandler(e);
        this.mouseLeaveHandler = () => this.pointerLeaveHandler();
        this.clickHandler = (e) => {
            if (!this.mouse.inBounds) {
                const rect = this.canvas.getBoundingClientRect();
                this.activateTemporaryCursor(
                    e.clientX - rect.left,
                    e.clientY - rect.top
                );
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
        let r1, g1, b1;
        if (baseColor.startsWith('rgb')) {
            const match = baseColor.match(/\d+/g);
            r1 = parseInt(match[0]);
            g1 = parseInt(match[1]);
            b1 = parseInt(match[2]);
        } else {
            let baseHex = baseColor.replace('#', '');
            if (baseHex.length === 3) {
                baseHex = baseHex[0] + baseHex[0] + baseHex[1] + baseHex[1] + baseHex[2] + baseHex[2];
            }
            r1 = parseInt(baseHex.substring(0, 2), 16);
            g1 = parseInt(baseHex.substring(2, 4), 16);
            b1 = parseInt(baseHex.substring(4, 6), 16);
        }

        // Parse target color
        let r2, g2, b2;
        if (targetColor.startsWith('rgb')) {
            const match = targetColor.match(/\d+/g);
            r2 = parseInt(match[0]);
            g2 = parseInt(match[1]);
            b2 = parseInt(match[2]);
        } else {
            let targetHex = targetColor.replace('#', '');
            if (targetHex.length === 3) {
                targetHex = targetHex[0] + targetHex[0] + targetHex[1] + targetHex[1] + targetHex[2] + targetHex[2];
            }
            r2 = parseInt(targetHex.substring(0, 2), 16);
            g2 = parseInt(targetHex.substring(2, 4), 16);
            b2 = parseInt(targetHex.substring(4, 6), 16);
        }

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
        this.clearAttractionTimeout();
        if (this.pointerMoveHandler) {
            document.body.removeEventListener('pointermove', this.pointerMoveHandler);
        }
        if (this.pointerLeaveHandler && this.canvas) {
            this.canvas.removeEventListener('pointerleave', this.pointerLeaveHandler);
        }
        if (this.pointerDownHandler && this.canvas) {
            this.canvas.removeEventListener('pointerdown', this.pointerDownHandler);
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
