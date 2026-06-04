// Fixtures for the @grida/svg-editor spec demo.
//
// Each fixture targets a *specific interaction surface* of the editor, so a
// card can mount it in isolation. They are authored, not exported from a real
// document — small, legible, and pixel-aligned where it helps.
//
// The harness intent: each fixture is paired (in `_examples.tsx`) with the
// interaction it is meant to exercise. Today the editor cannot be *locked* to
// that interaction — every tool and command stays live. When a capability
// profile lands (see README), each fixture becomes the canvas for a constrained
// profile: "line only", "text only", "no structural edits", etc. The fixtures
// are written now so that fixture + behavior-constraint line up later.

// ─── Featured — the showcase artifact ────────────────────────────────────────
// A refined analytics card, not a cartoon. Same breadth on purpose — a gradient
// paint server (the area fill), cubic-bezier paths (the series + its fill),
// grouped + transformed elements (the icon, the delta badge), shapes (card,
// gridlines, data dots), and type — but composed like a real design deliverable.
// Mounted in the hero with the full toolbar so the page opens on something that
// looks shipped, while still touching everything the editor edits.
export const FEATURED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400">
  <defs>
    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6366f1" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#6366f1" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect id="bg" width="640" height="400" fill="#f8fafc"/>

  <g id="card">
    <rect x="56" y="48" width="528" height="304" rx="16" fill="#ffffff" stroke="#e5e7eb"/>

    <g id="icon" transform="translate(88 80)">
      <rect width="28" height="28" rx="8" fill="#6366f1"/>
      <rect x="7" y="14" width="4" height="7" rx="1.5" fill="#ffffff"/>
      <rect x="12" y="9" width="4" height="12" rx="1.5" fill="#ffffff"/>
      <rect x="17" y="6" width="4" height="15" rx="1.5" fill="#ffffff"/>
    </g>
    <text x="128" y="92" font-family="ui-sans-serif, system-ui, sans-serif" font-size="15" font-weight="600" fill="#0f172a">Monthly revenue</text>
    <text x="128" y="110" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#64748b">Last 30 days</text>

    <g id="delta" transform="translate(486 76)">
      <rect width="70" height="24" rx="12" fill="#ecfdf5"/>
      <path d="M11 16 L15 9 L19 16 Z" fill="#059669"/>
      <text x="40" y="16" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" font-weight="600" fill="#059669" text-anchor="middle">12.4%</text>
    </g>

    <text x="88" y="150" font-family="ui-sans-serif, system-ui, sans-serif" font-size="30" font-weight="700" fill="#0f172a" letter-spacing="-0.5">$48,250</text>

    <g id="grid" stroke="#f1f5f9" stroke-width="1">
      <line x1="88" y1="208" x2="552" y2="208"/>
      <line x1="88" y1="244" x2="552" y2="244"/>
      <line x1="88" y1="280" x2="552" y2="280"/>
    </g>
    <line x1="88" y1="312" x2="552" y2="312" stroke="#e2e8f0" stroke-width="1"/>

    <path id="area-fill" d="M88 312 L88 286 C134 286 133 262 180 262 C226 262 225 272 272 272 C318 272 318 234 364 234 C410 234 409 222 456 222 C502 222 506 200 552 198 L552 312 Z" fill="url(#area)"/>
    <path id="series" d="M88 286 C134 286 133 262 180 262 C226 262 225 272 272 272 C318 272 318 234 364 234 C410 234 409 222 456 222 C502 222 506 200 552 198" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>

    <g id="dots" fill="#ffffff" stroke="#6366f1" stroke-width="2">
      <circle cx="180" cy="262" r="3.5"/>
      <circle cx="272" cy="272" r="3.5"/>
      <circle cx="364" cy="234" r="3.5"/>
      <circle cx="456" cy="222" r="3.5"/>
    </g>
    <circle id="cursor-point" cx="552" cy="198" r="5" fill="#6366f1" stroke="#ffffff" stroke-width="2"/>

    <g id="xlabels" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">
      <text x="88" y="332">Jan</text>
      <text x="180" y="332">Feb</text>
      <text x="272" y="332">Mar</text>
      <text x="364" y="332">Apr</text>
      <text x="456" y="332">May</text>
      <text x="552" y="332">Jun</text>
    </g>
  </g>
</svg>`;

// ─── Shapes — every primitive ────────────────────────────────────────────────
// rect, rounded rect, circle, ellipse, line, polyline, polygon, path — one of
// each. Each is its own Policy Class with distinct resize semantics; this is the
// fixture for "what shapes does the editor understand".
export const SHAPES = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 320" width="560" height="320">
  <rect id="rect" x="40" y="50" width="80" height="80" fill="#ef4444"/>
  <rect id="rounded-rect" x="180" y="50" width="80" height="80" rx="16" fill="#f97316"/>
  <circle id="circle" cx="360" cy="90" r="42" fill="#eab308"/>
  <ellipse id="ellipse" cx="500" cy="90" rx="52" ry="36" fill="#22c55e"/>

  <line id="line" x1="40" y1="270" x2="120" y2="190" stroke="#06b6d4" stroke-width="7" stroke-linecap="round"/>
  <polyline id="polyline" points="160,270 190,190 220,250 250,200 280,270" fill="none" stroke="#3b82f6" stroke-width="7" stroke-linejoin="round"/>
  <polygon id="polygon" points="360,188 394,270 326,270" fill="#8b5cf6"/>
  <path id="path" d="M444 230 C 468 188, 488 272, 512 230 S 552 188, 552 230" fill="none" stroke="#ec4899" stroke-width="7" stroke-linecap="round"/>
</svg>`;

// ─── Path — vector content edit ──────────────────────────────────────────────
// A single expressive path (cubic + smooth-cubic segments). The card selects it
// so Enter / lasso (Q) drops into content-edit and the vertex/tangent chrome
// shows. The fixture for path-node interaction.
export const PATH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 240" width="480" height="240">
  <path id="wave" d="M40 170 C 104 50, 184 50, 240 130 S 392 210, 440 90" fill="none" stroke="#6366f1" stroke-width="6" stroke-linecap="round"/>
</svg>`;

// ─── Line — the 2-point exception ────────────────────────────────────────────
// <line> doesn't resize against a bbox; it has exactly two endpoints. Selecting
// it shows endpoint handles, not 8 corner/edge handles. The fixture for the
// unique line interaction mode.
export const LINE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 240" width="480" height="240">
  <line id="diagonal" x1="80" y1="180" x2="400" y2="70" stroke="#0ea5e9" stroke-width="8" stroke-linecap="round"/>
  <line id="baseline" x1="80" y1="210" x2="400" y2="210" stroke="#94a3b8" stroke-width="4" stroke-dasharray="2 8"/>
</svg>`;

// ─── Text & tspan — runs and lines ───────────────────────────────────────────
// One <text> with multiple <tspan> runs (different fills) and a second baseline
// via dy. Inline edit is single-flat-run today; tspan / multi-line is exactly
// the open behavior this fixture is a harness for.
export const TEXT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 220" width="520" height="220">
  <text id="headline" x="40" y="104" font-family="ui-sans-serif, system-ui, sans-serif" font-size="52" font-weight="700"><tspan fill="#111827">Hello </tspan><tspan fill="#e11d48">SVG</tspan><tspan x="40" dy="58" font-size="24" font-weight="400" fill="#6b7280">multi-run · multi-line via tspan</tspan></text>
</svg>`;

// ─── Groups & transform ──────────────────────────────────────────────────────
// A rotated <g> with children, nesting a second translated <g>. Selecting the
// group shows a rotation-aware bbox; Enter descends scope into the children.
// The fixture for group selection, scope, and transform handling.
export const GROUP_TRANSFORM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="480" height="300">
  <g id="card" transform="translate(96 64) rotate(-10)">
    <rect x="0" y="0" width="220" height="140" rx="14" fill="#1e293b"/>
    <circle cx="40" cy="40" r="18" fill="#f59e0b"/>
    <g id="stripes" transform="translate(20 92)">
      <rect x="0" y="0" width="180" height="10" rx="5" fill="#64748b"/>
      <rect x="0" y="22" width="120" height="10" rx="5" fill="#64748b"/>
    </g>
  </g>
</svg>`;

// ─── Nested <svg> — a viewport within a viewport ─────────────────────────────
// An inner <svg> with its own `x`/`y` origin and its own `viewBox` establishes
// an independent user-space coordinate system (SVG 2 §7.2). The editor parses,
// preserves, and renders it — but clean *geometry editing* across the nested
// viewport boundary is out of scope for v1: `getCTM` stops at the nearest
// viewport, so the selection chrome for a node inside the inner <svg> is the
// open question this fixture is a harness for. See
// `packages/grida-svg-editor/docs/geometry.md` and the nested-svg notes in
// `src/dom.ts`. Here the inner viewport maps its own 0…120 user space into the
// 240×170 region placed at (244, 70).
export const NESTED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 300" width="520" height="300">
  <rect id="frame" x="0" y="0" width="520" height="300" fill="#f8fafc"/>
  <text id="outer-label" x="24" y="34" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" font-weight="600" fill="#334155">outer viewport · user space 0…520</text>

  <circle id="outer-dot" cx="78" cy="150" r="28" fill="#6366f1"/>
  <rect id="outer-box" x="44" y="214" width="132" height="50" rx="8" fill="#22c55e"/>

  <svg id="inner" x="244" y="70" width="240" height="170" viewBox="0 0 120 85">
    <rect x="0" y="0" width="120" height="85" fill="#ffffff" stroke="#94a3b8"/>
    <text x="6" y="13" font-family="ui-sans-serif, system-ui, sans-serif" font-size="7.5" fill="#64748b">inner viewport · own 0…120</text>
    <circle id="inner-dot" cx="34" cy="48" r="22" fill="#f59e0b"/>
    <rect id="inner-box" x="64" y="24" width="44" height="48" rx="6" fill="#ec4899"/>
  </svg>
</svg>`;

// ─── Symbol & use — one source, many instances ───────────────────────────────
// A <symbol> defines the geometry once; each <use> instantiates it. The `color`
// attribute on each instance flows into `fill="currentColor"` inside the symbol,
// so the shared shape recolors per instance. Editing a <use> is its own Policy
// Class — you move / scale the instance, not the symbol — and `editor.defs.symbols`
// is the registry. The fixture for instance-vs-source interaction.
export const SYMBOL_USE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 240" width="520" height="240">
  <defs>
    <symbol id="pin" viewBox="0 0 24 24">
      <path d="M12 2 C 7.6 2 4 5.6 4 10 C 4 16 12 22 12 22 C 12 22 20 16 20 10 C 20 5.6 16.4 2 12 2 Z" fill="currentColor"/>
      <circle cx="12" cy="9.5" r="3" fill="#ffffff"/>
    </symbol>
  </defs>

  <use id="pin-a" href="#pin" x="40" y="70" width="64" height="64" color="#ef4444"/>
  <use id="pin-b" href="#pin" x="150" y="70" width="64" height="64" color="#3b82f6"/>
  <use id="pin-c" href="#pin" x="260" y="70" width="64" height="64" color="#22c55e"/>
  <use id="pin-d" href="#pin" x="372" y="48" width="96" height="96" color="#a855f7"/>
</svg>`;

// ─── CSS — cascade beyond color ──────────────────────────────────────────────
// A document <style> block that drives fill AND geometry (transform / translate)
// — not just paint. Selection chrome reads world geometry, so CSS transforms are
// the open question. The harness for deciding how the editor cooperates with the
// cascade. (Truly external/linked stylesheets stay out of scope; this is the
// in-document <style> subset the editor supports.)
export const CSS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 240" width="520" height="240">
  <style>
    .brand { fill: #6366f1; }
    .ghost { fill: none; stroke: #6366f1; stroke-width: 4; }
    .tilt  { transform: rotate(-8deg); transform-origin: 120px 160px; }
    #pill  { fill: #ec4899; transform: translateX(40px); }
  </style>
  <rect id="pill" x="40" y="40" width="160" height="60" rx="30"/>
  <rect class="brand tilt" x="60" y="120" width="120" height="80"/>
  <circle class="ghost" cx="380" cy="130" r="64"/>
  <text class="brand" x="280" y="220" font-family="ui-monospace, monospace" font-size="18">fill + transform via style</text>
</svg>`;
