export const packages = [
  {
    name: "@grida/svg-editor",
    description:
      "Headless, clean SVG editor. Open a file, edit it, save it — the diff is exactly the change you made. Round-trips by default, adds no proprietary noise, backend-agnostic. Experimental.",
    demoPath: "/packages/@grida/svg-editor",
    npm: true,
    features: [
      "Round-trips by default (byte-equal open + save)",
      "Minimal-diff mutations, no proprietary noise",
      "Headless core, DOM surface + React layer",
      "Selection, transform, insert, inline text edit",
      "Typed paint, properties, and defs/gradients",
      "Core, not customizable — narrow public surface",
    ],
  },
  {
    name: "@grida/refig",
    description:
      "Headless Figma renderer — render Figma documents to PNG, JPEG, WebP, PDF, or SVG in Node.js (no browser) or in the browser. Deterministic exports, offline rendering from .fig, CLI and library API.",
    demoPath: "/packages/@grida/refig",
    npm: true,
    features: [
      "Node.js and browser entrypoints",
      "CLI and library API",
      "Offline rendering from .fig files",
      "REST API JSON input",
      "Deterministic, CI-friendly exports",
      "Rich text (attributed text) support",
    ],
  },
  {
    name: "@grida/ruler",
    description:
      "Zero-Dependency Canvas Ruler Component for Infinite Canvas. A lightweight, performant ruler component that supports zooming, panning, and custom markers.",
    demoPath: "/packages/@grida/ruler",
    npm: true,
    features: [
      "Zero dependencies",
      "High performance canvas-based rendering",
      "Support for zooming and panning",
      "Custom markers and ranges",
      "Customizable appearance",
      "Responsive design",
      "Both React and vanilla JS support",
    ],
  },
  {
    name: "@grida/transparency-grid",
    description:
      "Transparency Grid component for Infinite Canvas. A lightweight, performant transparency grid component that supports zooming, panning, and custom transformations.",
    demoPath: "/packages/@grida/transparency-grid",
    npm: true,
    features: [
      "Zero dependencies",
      "High performance canvas-based rendering",
      "Support for zooming and panning",
      "Customizable appearance",
      "Responsive design",
      "Both React and vanilla JS support",
      "WebGPU support (experimental)",
    ],
  },
  {
    name: "@grida/tree-view",
    description:
      "Headless, agnostic tree-view controller for editors and IDEs. Zero runtime dependencies, no DOM coupling in the core, no widget library on top. React is the only optional peer.",
    demoPath: "/packages/@grida/tree-view",
    npm: true,
    features: [
      "Zero runtime dependencies",
      "Headless state machine (no DOM imports in the core)",
      "Drag & drop with composable move constraints",
      "Six subscription channels (rows, expanded, focus, drag, selection, intent)",
      "Configurable keymap + type-ahead helpers",
      "Virtualization-ready stable row list",
      "Optional React peer (TreeProvider + useTreeSnapshot)",
    ],
  },
  {
    name: "@grida/hud",
    description:
      "Canvas-based heads-up display for the Grida editor viewport. Selection chrome, handles, hover, marquee, gesture state, hit-testing — rendered to a single canvas from a pure-logic state machine. No DOM overlay, no data-id traversal, no per-element React reconciliation in the hot path.",
    demoPath: "/packages/@grida/hud",
    npm: true,
    features: [
      "Canvas-rendered (one draw per frame)",
      "Pure-logic state machine, headless event core",
      "Render and hit-testing as separate outputs",
      "Rotation-aware selection chrome and cursors",
      "Vector edit chrome (vertices, tangents, segments)",
      "Host-fed extras via surface.draw(extra)",
      "Tree-shakable rotation-aware cursors subpath",
    ],
  },
  {
    name: "@grida/number-input",
    description:
      "Headless React hooks for editor-grade number inputs — the input behaviors of the Grida editor's properties panel. Typed parsing, step precision, commit safety, mixed-value state, unit suffixes with display scaling, scrub gestures, snapping sliders, and hex color input.",
    demoPath: "/packages/@grida/number-input",
    npm: true,
    features: [
      "Commit vs change separation (set/delta outcomes)",
      "Mixed-value state for multi-selection editing",
      "Unit suffix + display scale (0.5 ↔ 50%)",
      "Step-aware precision, float artifact cleanup",
      "Drag-to-scrub labels with pointer lock",
      "Mark-snapping slider values (Radix-compatible)",
      "Hex color input — fuzzy parse, alpha extraction, channel stepping",
    ],
  },
  {
    name: "@grida/pixel-grid",
    description:
      "A React component for rendering pixel-perfect grids in infinite canvas applications. This package provides a flexible and performant way to display grid patterns with zoom and pan capabilities.",
    demoPath: "/packages/@grida/pixel-grid",
    npm: true,
    features: [
      "Pixel-perfect grid rendering",
      "Zoom and pan support",
      "Customizable grid appearance",
      "High performance with React",
      "Responsive design support",
    ],
  },
];
