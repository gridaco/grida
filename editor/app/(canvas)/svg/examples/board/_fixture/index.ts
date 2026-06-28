// SVG-only `.canvas` fixture for the infinite-canvas spike.
//
// Bundled as raw strings + an in-memory `ReadableFs` so the demo exercises the
// REAL `dotcanvas.read()` path in the browser (no Node fs — `ReadableFs` is an
// in-memory port). The manifest is authored as `editor: "board"` (the freeform
// surface) + `files: ["*.svg"]` (the content axis) — both now first-class in
// dotcanvas, so the reader resolves it cleanly (no `unknown_editor` warning).
//
// Do NOT point this at the shared `fixtures/test-canvas/slides.canvas` — that one
// is read by dotcanvas's own vitest suite; this spike keeps its own copy.

import type { dotcanvas } from "dotcanvas";

const FONT = "ui-sans-serif, system-ui, -apple-system, sans-serif";

// 001 — dark analytics card with a bar chart.
const SVG_001 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200">
  <rect width="320" height="200" rx="14" fill="#0f172a"/>
  <text x="20" y="36" font-family="${FONT}" font-size="13" fill="#94a3b8">Monthly revenue</text>
  <text x="20" y="70" font-family="${FONT}" font-size="30" font-weight="700" fill="#ffffff">$48,920</text>
  <text x="156" y="70" font-family="${FONT}" font-size="13" font-weight="600" fill="#22c55e">▲ 12.4%</text>
  <rect x="20"  y="150" width="28" height="30" rx="4" fill="#334155"/>
  <rect x="58"  y="130" width="28" height="50" rx="4" fill="#334155"/>
  <rect x="96"  y="110" width="28" height="70" rx="4" fill="#475569"/>
  <rect x="134" y="135" width="28" height="45" rx="4" fill="#334155"/>
  <rect x="172" y="95"  width="28" height="85" rx="4" fill="#3b82f6"/>
  <rect x="210" y="120" width="28" height="60" rx="4" fill="#475569"/>
  <rect x="248" y="100" width="28" height="80" rx="4" fill="#475569"/>
  <rect x="286" y="118" width="22" height="62" rx="4" fill="#334155"/>
</svg>`;

// 002 — light profile card with avatar, name, and a stat row.
const SVG_002 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200">
  <rect width="320" height="200" rx="14" fill="#ffffff" stroke="#e5e7eb"/>
  <circle cx="56" cy="62" r="30" fill="#6366f1"/>
  <text x="56" y="70" text-anchor="middle" font-family="${FONT}" font-size="24" font-weight="700" fill="#ffffff">JD</text>
  <text x="104" y="52" font-family="${FONT}" font-size="18" font-weight="700" fill="#111827">Jane Doe</text>
  <text x="104" y="74" font-family="${FONT}" font-size="13" fill="#6b7280">Product Designer</text>
  <line x1="20" y1="116" x2="300" y2="116" stroke="#f3f4f6" stroke-width="1"/>
  <text x="20"  y="150" font-family="${FONT}" font-size="20" font-weight="700" fill="#111827">128</text>
  <text x="20"  y="170" font-family="${FONT}" font-size="11" fill="#9ca3af">Projects</text>
  <text x="120" y="150" font-family="${FONT}" font-size="20" font-weight="700" fill="#111827">8.6k</text>
  <text x="120" y="170" font-family="${FONT}" font-size="11" fill="#9ca3af">Followers</text>
  <text x="220" y="150" font-family="${FONT}" font-size="20" font-weight="700" fill="#111827">312</text>
  <text x="220" y="170" font-family="${FONT}" font-size="11" fill="#9ca3af">Following</text>
</svg>`;

// 003 — tall mobile login screen mockup.
const SVG_003 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 280" width="280" height="280">
  <rect width="280" height="280" rx="16" fill="#f8fafc"/>
  <text x="32" y="54" font-family="${FONT}" font-size="22" font-weight="700" fill="#0f172a">Welcome back</text>
  <text x="32" y="78" font-family="${FONT}" font-size="13" fill="#64748b">Sign in to continue</text>
  <rect x="32" y="102" width="216" height="40" rx="10" fill="#ffffff" stroke="#e2e8f0"/>
  <text x="46" y="127" font-family="${FONT}" font-size="13" fill="#94a3b8">you@example.com</text>
  <rect x="32" y="150" width="216" height="40" rx="10" fill="#ffffff" stroke="#e2e8f0"/>
  <text x="46" y="175" font-family="${FONT}" font-size="14" fill="#94a3b8">••••••••</text>
  <rect x="32" y="206" width="216" height="44" rx="10" fill="#2563eb"/>
  <text x="140" y="234" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="600" fill="#ffffff">Sign in</text>
</svg>`;

// 004 — wide indigo pricing card with feature list and CTA.
const SVG_004 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 160" width="400" height="160">
  <rect width="400" height="160" rx="14" fill="#1e1b4b"/>
  <text x="28" y="44" font-family="${FONT}" font-size="12" font-weight="700" fill="#a5b4fc" letter-spacing="1.5">PRO PLAN</text>
  <text x="28" y="92" font-family="${FONT}" font-size="40" font-weight="800" fill="#ffffff">$29<tspan font-size="16" font-weight="500" fill="#c7d2fe"> /mo</tspan></text>
  <g font-family="${FONT}" font-size="12" fill="#e0e7ff">
    <circle cx="212" cy="40" r="3" fill="#818cf8"/><text x="224" y="44">Unlimited projects</text>
    <circle cx="212" cy="66" r="3" fill="#818cf8"/><text x="224" y="70">Priority support</text>
    <circle cx="212" cy="92" r="3" fill="#818cf8"/><text x="224" y="96">Custom domains</text>
  </g>
  <rect x="28" y="110" width="148" height="36" rx="9" fill="#6366f1"/>
  <text x="102" y="133" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="600" fill="#ffffff">Upgrade</text>
</svg>`;

const SVGS: Record<string, string> = {
  "001.svg": SVG_001,
  "002.svg": SVG_002,
  "003.svg": SVG_003,
  "004.svg": SVG_004,
};

const MANIFEST = {
  $schema: "https://grida.co/schema/dotcanvas/v1.json",
  version: "1",
  editor: "board", // the freeform-canvas editor (rung D); SVG content via `files`
  files: ["*.svg"],
  documents: [
    {
      src: "001.svg",
      id: "card-a",
      layout: { x: 0, y: 0, w: 320, h: 200, z: 0 },
    },
    {
      src: "002.svg",
      id: "card-b",
      layout: { x: 380, y: 0, w: 320, h: 200, z: 0 },
    },
    {
      src: "003.svg",
      id: "card-c",
      layout: { x: 0, y: 260, w: 280, h: 280, z: 0 },
    },
    {
      src: "004.svg",
      id: "card-d",
      layout: { x: 360, y: 320, w: 400, h: 160, z: 0 },
    },
  ],
};

const FILES: Record<string, string> = {
  ".canvas.json": JSON.stringify(MANIFEST, null, 2),
  ...SVGS,
};

/** An in-memory `ReadableFs` over the bundled fixture files. */
export function createFixtureFs(): dotcanvas.ReadableFs {
  return {
    list: async () => Object.keys(FILES),
    read: async (path: string) => FILES[path] ?? null,
  };
}
