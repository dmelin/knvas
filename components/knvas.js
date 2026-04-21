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

const knvas = new KnvasManager();
