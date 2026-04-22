# Important Notes for AI Agents

## Architecture: Separation of Concerns

**CRITICAL**: `knvas.js` and `index.html` have clearly separated responsibilities. Do NOT mix them.

### knvas.js - Component Library
- **ONLY** handles the actual canvas component rendering and animation
- Parses options from `<knvas>` elements
- Initializes component instances (Stars, Grid, Smoke, etc.)
- Manages animation loops, FPS, mouse tracking, and canvas rendering
- **DOES NOT** manipulate the DOM structure (no creating/moving/removing wrappers)
- **DOES NOT** handle UI controls, settings panels, or preview functionality

### index.html - Preview UI
- **ONLY** handles the preview/demo interface for knvas.dev
- Creates and manages `.knvas-wrapper` divs
- Creates `<knvas>` elements with their `<option>` children
- Handles settings panels, theme selectors, code display
- Manages menu interactions and canvas switching
- Calls `knvas.initializeElement()` and `knvas.destroyElement()` when needed
- **DOES NOT** render animations or manage canvas rendering

## Key Principle

If you're working on animation rendering, mouse tracking, or component behavior → modify `knvas.js`

If you're working on the settings UI, menu, or preview controls → modify `index.html`

**Never make knvas.js create or manipulate wrapper elements. Never make index.html handle animation logic.**
