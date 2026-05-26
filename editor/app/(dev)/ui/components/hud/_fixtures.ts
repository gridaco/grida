import type { SelectionShape, VectorOverlay } from "@grida/hud";

// ───────────────────────────────────────────────────────────────────────────
// Toy scene model — the smallest thing that lets a hud demo prove itself.
//
// The hud package never reads node data. It asks the host two questions:
//   pick(point_doc) → id | null
//   shapeOf(id)     → SelectionShape | null
//
// So a fixture only needs: a set of ids, each with a doc-space shape and a
// visual paint hint the SVG underlay knows how to render.
// ───────────────────────────────────────────────────────────────────────────

export type FixtureKind =
  | "rect"
  | "rect-rounded"
  | "rect-rotated"
  | "line"
  | "polygon"
  | "vector"
  | "group-member"
  | "image";

export interface FixtureNode {
  id: string;
  kind: FixtureKind;
  /** Visible fill / stroke for the SVG underlay. */
  fill?: string;
  stroke?: string;
  label?: string;
  /** Members the id belongs to (siblings under a group, for member outlines). */
  group?: string;
  /** Rect-style geometry (rect, rect-rounded, image). */
  rect?: { x: number; y: number; width: number; height: number };
  /**
   * Border radius (rect-rounded). Number = uniform; object = per-corner.
   * Per-corner is rendered as an SVG `<path>` (SVG's `rx/ry` on `<rect>` is
   * uniform-only). Used by §15 to paint a live preview of the four
   * independent corner radii as the user drags the hud's corner-radius
   * handles.
   */
  radius?: number | { tl: number; tr: number; br: number; bl: number };
  /** Line endpoints (line). */
  p1?: [number, number];
  p2?: [number, number];
  /** Polygon vertices in doc-space (polygon). Closed implicitly. The
   *  bounding rect is derived from min/max of the vertices and used
   *  for selection chrome / pick. */
  polygon?: Array<[number, number]>;
  /** Rotation angle in radians (rect-rotated). */
  angle?: number;
  /** Vector overlay (vector). Doc-space. */
  vector?: VectorOverlay;
}

export interface Fixture {
  nodes: FixtureNode[];
  /** Suggested default selection when the showcase mounts. */
  initialSelection?: string[];
}

// ───────────────────────────────────────────────────────────────────────────
// Selection-intent scene — overlap-dense gym for §2's classifier.
// ───────────────────────────────────────────────────────────────────────────

// Demo fixtures are designed as **probe sheets**, not aesthetic canvases:
//   - neutral monochrome (white fill, slate-400 stroke)
//   - uniform sizes within a row
//   - round-pixel grid coordinates
//   - shapes evenly spaced; no implied focal point
// The hud chrome is the only colored thing on the canvas; the fixture
// exists to give chrome something to anchor against, not to look like a
// design. See .agents/skills/fixtures/SKILL.md.
const FILL = "#FFFFFF";
const STROKE = "#94A3B8"; // slate-400

export function selectionIntentFixture(): Fixture {
  // Five specimens with deliberate overlap and hierarchy. The §2
  // classifier is invisible on a neutral probe sheet — its work only
  // shows up when pick ties, chrome covers non-selected nodes, and
  // hierarchy gives narrow/swap somewhere to go. This fixture is built
  // so every Content* and Body* row in §2's spec table is reachable by
  // clicking around without changing the scene:
  //
  //   - Three large overlapping cards (back → mid → front) staggered
  //     diagonally. Any two-card selection's chrome AABB covers the
  //     third card — the canonical BodySwapOrDrag setup. The gap
  //     between cards inside the chrome AABB gives BodyDragOnly /
  //     empty-marquee space.
  //   - `nested`, a small rect entirely inside `card-back`, gives
  //     ContentReplace a pick-ambiguity target (clicking the small
  //     rect's pixels routes to `nested`, not `card-back`).
  //   - `bar`, a rotated tall rect crossing all three cards, makes
  //     single-selection chrome AABB cover every other shape, so
  //     Body* scenarios are reachable from a single-node selection
  //     too (no multi-select required).
  //
  // hitPick iterates last → first, so array order below = z-order
  // bottom → top. Click on the triple-overlap region returns `bar`.
  return {
    nodes: [
      {
        id: "card-back",
        kind: "rect",
        rect: { x: 80, y: 90, width: 200, height: 200 },
        fill: FILL,
        stroke: STROKE,
      },
      {
        id: "card-mid",
        kind: "rect",
        rect: { x: 200, y: 150, width: 200, height: 200 },
        fill: FILL,
        stroke: STROKE,
      },
      {
        id: "card-front",
        kind: "rect-rounded",
        rect: { x: 320, y: 90, width: 200, height: 200 },
        radius: 12,
        fill: FILL,
        stroke: STROKE,
      },
      {
        id: "nested",
        kind: "rect",
        rect: { x: 110, y: 120, width: 60, height: 60 },
        fill: FILL,
        stroke: STROKE,
      },
      {
        id: "bar",
        kind: "rect-rotated",
        rect: { x: 270, y: 60, width: 50, height: 340 },
        angle: Math.PI / 14, // ~12°
        fill: FILL,
        stroke: STROKE,
      },
    ],
    initialSelection: ["card-back"],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Vector scene — one open path and one closed path with cubic segments.
// ───────────────────────────────────────────────────────────────────────────

// Two specimens stacked vertically:
//   - top band: open polyline (straight edges) — 4 vertices on a square
//     grid, no tangents. Demonstrates vertex knobs without the noise of
//     tangent diamonds.
//   - bottom band: closed circle approximation — 4 vertices on the
//     cardinal points of a 100-px-radius circle, with cubic tangents of
//     the canonical length k = 4/3 × (√2 − 1) × r ≈ 55. Symmetric so the
//     tangent diamonds land in predictable, comparable positions.
export function vectorFixture(): Fixture {
  // Open path — 4 vertices in a horizontal row at y=100, x stepping by 120
  // (so [80, 200, 320, 440]). Even spacing makes the segment-strip hit
  // regions easy to compare.
  const openVertices: Array<[number, number]> = [
    [80, 100],
    [200, 100],
    [320, 100],
    [440, 100],
  ];
  const openSegments = [
    { a: 0, b: 1 },
    { a: 1, b: 2 },
    { a: 2, b: 3 },
  ].map((s) => ({
    ...s,
    a_control: openVertices[s.a],
    b_control: openVertices[s.b],
  }));

  // Closed path — circle approximation centered at (300, 300), radius 100.
  // Cardinal vertices + canonical Bézier tangent length for a circle.
  const cx = 300;
  const cy = 300;
  const r = 100;
  const k = (4 / 3) * (Math.SQRT2 - 1) * r; // ≈ 55.23
  const closedVertices: Array<[number, number]> = [
    [cx, cy - r], // 0: top
    [cx + r, cy], // 1: right
    [cx, cy + r], // 2: bottom
    [cx - r, cy], // 3: left
  ];
  const closedSegments = [
    {
      a: 0,
      b: 1,
      a_control: [cx + k, cy - r] as [number, number],
      b_control: [cx + r, cy - k] as [number, number],
    },
    {
      a: 1,
      b: 2,
      a_control: [cx + r, cy + k] as [number, number],
      b_control: [cx + k, cy + r] as [number, number],
    },
    {
      a: 2,
      b: 3,
      a_control: [cx - k, cy + r] as [number, number],
      b_control: [cx - r, cy + k] as [number, number],
    },
    {
      a: 3,
      b: 0,
      a_control: [cx - r, cy - k] as [number, number],
      b_control: [cx - k, cy - r] as [number, number],
    },
  ];

  return {
    nodes: [
      {
        id: "path-open",
        kind: "vector",
        stroke: STROKE,
        vector: {
          vertices: openVertices,
          segments: openSegments,
          origin: [0, 0],
        },
      },
      {
        id: "path-closed",
        kind: "vector",
        stroke: STROKE,
        vector: {
          vertices: closedVertices,
          segments: closedSegments,
          // Every vertex in a closed path has two adjacent segments, so all
          // get tangent diamonds when in content-edit.
          neighbours: [0, 1, 2, 3],
          origin: [0, 0],
        },
      },
    ],
    initialSelection: ["path-closed"],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Labs scene — a single big rounded rect to demo migration overlays cleanly.
// ───────────────────────────────────────────────────────────────────────────

// Two rects sharing top + bottom edges — natural snap targets.
//   left:  x=100, y=180, w=120, h=100  →  right edge at x=220
//   right: x=340, y=180, w=120, h=100  →  left edge at x=340
// Both share y=180 (top), y=280 (bottom). Static snap rules paint along
// the shared axes — same visual the live snap pipeline produces during
// a translate that lands on one of those alignments.
export function snapDemoFixture(): Fixture {
  return {
    nodes: [
      {
        id: "snap-a",
        kind: "rect",
        rect: { x: 100, y: 180, width: 120, height: 100 },
        fill: FILL,
        stroke: STROKE,
      },
      {
        id: "snap-b",
        kind: "rect",
        rect: { x: 340, y: 180, width: 120, height: 100 },
        fill: FILL,
        stroke: STROKE,
      },
    ],
    initialSelection: ["snap-a"],
  };
}

// Two rects placed diagonally — A small and top-left, B large and
// bottom-right, no axis overlap.
//
// Two deliberate choices, both for measurement variety:
//
// 1. Diagonal placement (no axis overlap) → both right and bottom distances
//    are non-zero, so the default render shows two labelled guides AND two
//    dashed auxiliary lines. A flush gap (sharing an edge along one axis)
//    would silence half of those.
//
// 2. A is small enough to fit inside B → dragging A into B trips the
//    "inner" branch of cmath.measure (containment: base = inner, four
//    container-spacings around it). Without the size asymmetry the reader
//    can't reach that scenario — every drag would stay in the same
//    non-intersecting case. The three measurement branches (non-intersect,
//    intersect, contain) all become reachable from this single default.
//
//   a: x=80,  y=110, w=120, h=80    →  right=200, bottom=190
//   b: x=320, y=270, w=260, h=220   →  left=320, top=270
// Default distances: right = 120, bottom = 80. Top = 0, left = 0.
export function measurementDemoFixture(): Fixture {
  return {
    nodes: [
      {
        id: "meas-a",
        kind: "rect",
        rect: { x: 80, y: 110, width: 120, height: 80 },
        fill: FILL,
        stroke: STROKE,
      },
      {
        id: "meas-b",
        kind: "rect",
        rect: { x: 320, y: 270, width: 260, height: 220 },
        fill: FILL,
        stroke: STROKE,
      },
    ],
    initialSelection: ["meas-a"],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Corner radius scene — one rect with four independent corner radii.
//
// The fixture is parametric: the §15 demo owns the current radii (the
// host applies the hud's `corner_radius*` intents to this state) and
// re-derives the fixture every render so the SVG underlay paints what
// the user is currently dragging. Same neutral palette as `labsFixture`
// so the only color on the canvas is the hud's chrome.
// ───────────────────────────────────────────────────────────────────────────

export function cornerRadiusFixture(radii: {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}): Fixture {
  return {
    nodes: [
      {
        id: "rounded",
        kind: "rect-rounded",
        rect: { x: 200, y: 170, width: 200, height: 120 },
        radius: radii,
        fill: FILL,
        stroke: STROKE,
      },
    ],
    initialSelection: ["rounded"],
  };
}

/**
 * Rotated rounded-rect fixture for §15's third demo. Same 200×120
 * oblong as `cornerRadiusFixture`, rotated about its center by
 * `angle` radians. The render is a `<g rotate>` wrapping a per-
 * corner path; the matching local → doc transform the host hands
 * to hud is exposed by {@link cornerRadiusRotatedTransform}.
 */
export function cornerRadiusRotatedFixture(
  radii: { tl: number; tr: number; br: number; bl: number },
  angle: number
): Fixture {
  return {
    nodes: [
      {
        id: "rounded-rot",
        kind: "rect-rotated",
        rect: { x: 200, y: 170, width: 200, height: 120 },
        angle,
        radius: radii,
        fill: FILL,
        stroke: STROKE,
      },
    ],
    initialSelection: ["rounded-rot"],
  };
}

/**
 * Build the local → doc affine transform matching
 * {@link cornerRadiusRotatedFixture}. Rotation about the rect's
 * center, expressed as a 2×3 matrix the host passes through
 * `setCornerRadius`'s `geometry.transform`.
 *
 * The math mirrors `fixtureToShape`'s `rect-rotated` branch — same
 * pivot, same orientation — so the SVG underlay's `<g rotate>` and
 * hud's handle positions stay aligned.
 */
export function cornerRadiusRotatedTransform(
  angle: number
): readonly [
  readonly [number, number, number],
  readonly [number, number, number],
] {
  return rotateAroundCenterTransform(
    { x: 200, y: 170, width: 200, height: 120 },
    angle
  );
}

/**
 * The two rect positions used by §15's combined "axis-aligned +
 * rotated" demo. Left rect lives at the left side of the canvas;
 * right rect lives at the right and rotates about its own center.
 * Same 200×120 dimensions so the X-shape, snap-back, and
 * coincidence behaviors are directly comparable between the two.
 */
export const CORNER_RADIUS_COMBO_LEFT_RECT = {
  x: 40,
  y: 170,
  width: 200,
  height: 120,
} as const;
export const CORNER_RADIUS_COMBO_RIGHT_RECT = {
  x: 360,
  y: 170,
  width: 200,
  height: 120,
} as const;

/**
 * Combined fixture for §15's first demo — one axis-aligned rounded
 * rect on the left, one rotated rect on the right, both editable at
 * once. Hud reads them as two independent `CornerRadiusInput`s
 * (passed as an array to `setCornerRadius`); the SVG underlay
 * paints them side-by-side.
 */
export function cornerRadiusComboFixture(
  radiiL: { tl: number; tr: number; br: number; bl: number },
  radiiR: { tl: number; tr: number; br: number; bl: number },
  angle: number
): Fixture {
  return {
    nodes: [
      {
        id: "combo-L",
        kind: "rect-rounded",
        rect: { ...CORNER_RADIUS_COMBO_LEFT_RECT },
        radius: radiiL,
        fill: FILL,
        stroke: STROKE,
      },
      {
        id: "combo-R",
        kind: "rect-rotated",
        rect: { ...CORNER_RADIUS_COMBO_RIGHT_RECT },
        angle,
        radius: radiiR,
        fill: FILL,
        stroke: STROKE,
      },
    ],
    initialSelection: ["combo-L", "combo-R"],
  };
}

/**
 * Local → doc transform for the right (rotated) rect in the combo
 * fixture. Pivot is the right rect's center; same `<g rotate>`
 * orientation the SVG underlay uses for `rect-rotated`.
 */
export function cornerRadiusComboRightTransform(
  angle: number
): readonly [
  readonly [number, number, number],
  readonly [number, number, number],
] {
  return rotateAroundCenterTransform(CORNER_RADIUS_COMBO_RIGHT_RECT, angle);
}

// Inline helper — keep the rotation matrix in one place. 2×3 affine
// for "rotate by `angle` about the rect's geometric center."
function rotateAroundCenterTransform(
  rect: { x: number; y: number; width: number; height: number },
  angle: number
): readonly [
  readonly [number, number, number],
  readonly [number, number, number],
] {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const tx = cx - c * cx + s * cy;
  const ty = cy - s * cx - c * cy;
  return [
    [c, -s, tx],
    [s, c, ty],
  ];
}

// ───────────────────────────────────────────────────────────────────────────
// Star scene — a 5-pointed star centered in the demo canvas.
//
// Used by §15's second demo to exercise `line` corner-radius geometry:
// the host hands hud the two endpoints of ONE tooth (an outer tip → its
// adjacent inner valley) and the chrome paints a single handle along
// that axis. Hud sees the line; the SVG underlay draws the star.
//
// The polygon is computed once at fixture-construction time so the
// shape is stable across renders.
// ───────────────────────────────────────────────────────────────────────────

const STAR_CX = 300;
const STAR_CY = 230;
const STAR_OUTER = 80;
const STAR_INNER = 36;

export function starFixture(): Fixture {
  const points: Array<[number, number]> = [];
  // 10 vertices: alternating outer / inner, starting from the top
  // (angle -π/2) and stepping by 36° (= π/5).
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? STAR_OUTER : STAR_INNER;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push([STAR_CX + r * Math.cos(a), STAR_CY + r * Math.sin(a)]);
  }
  return {
    nodes: [
      {
        id: "star",
        kind: "polygon",
        polygon: points,
        fill: FILL,
        stroke: STROKE,
      },
    ],
    initialSelection: ["star"],
  };
}

/**
 * One tooth of the star fixture, in doc-space — the `a → b` axis the
 * §15 demo passes to hud as the `line` corner-radius geometry. `a` is
 * the outer tip (radius=0 sits at the tip), `b` is the adjacent inner
 * valley (radius=max pushes the handle to the valley).
 *
 * Tooth index 0 is the topmost tip; the valley adjacent CCW from it
 * is at vertex 1 in the star polygon.
 */
export function starTooth(): { a: [number, number]; b: [number, number] } {
  const tipA = -Math.PI / 2;
  const valleyA = -Math.PI / 2 + Math.PI / 5;
  return {
    a: [
      STAR_CX + STAR_OUTER * Math.cos(tipA),
      STAR_CY + STAR_OUTER * Math.sin(tipA),
    ],
    b: [
      STAR_CX + STAR_INNER * Math.cos(valleyA),
      STAR_CY + STAR_INNER * Math.sin(valleyA),
    ],
  };
}

// One centered specimen for the migration sections. Same neutral palette
// and round-pixel dimensions so the chrome overlay being prototyped is the
// only thing the eye reads.
export function labsFixture(): Fixture {
  return {
    nodes: [
      {
        id: "card",
        kind: "rect-rounded",
        rect: { x: 200, y: 170, width: 200, height: 120 },
        radius: 16,
        fill: FILL,
        stroke: STROKE,
      },
    ],
    initialSelection: ["card"],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Single-rect playground — parametric size for the 9-slice layout demo.
// ───────────────────────────────────────────────────────────────────────────

// One rect centered in the canvas. Width/height come from the demo; the
// rect is always at the geometric center so the chrome stays in the same
// place no matter how the slider moves.
export function singleRectFixture(width: number, height: number): Fixture {
  return {
    nodes: [
      {
        id: "rect",
        kind: "rect",
        rect: {
          x: Math.round((600 - width) / 2),
          y: Math.round((460 - height) / 2),
          width,
          height,
        },
        fill: FILL,
        stroke: STROKE,
      },
    ],
    initialSelection: ["rect"],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Pixel-grid scene — empty by design.
//
// The pixel-grid section pre-zooms to 6×. We want the default view to show
// *only* the grid (no shape stealing attention from it). One small 40×40
// rect lives well outside the initial viewport so the canvas isn't truly
// empty — zoom out and it slides into view, proving the camera is real.
// ───────────────────────────────────────────────────────────────────────────

export function pixelGridFixture(): Fixture {
  return {
    nodes: [
      {
        id: "marker",
        kind: "rect",
        rect: { x: 40, y: 40, width: 40, height: 40 },
        fill: FILL,
        stroke: STROKE,
      },
    ],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Empty scene — no content, just the canvas. For sections where the focus
// is the chrome itself (ruler + guides, pixel grid alone, etc.) and any
// fixture shape would be visual noise.
// ───────────────────────────────────────────────────────────────────────────

export function emptyFixture(): Fixture {
  return { nodes: [] };
}

// ───────────────────────────────────────────────────────────────────────────
// Transformed scene — one purely-rotated rect for the OBB / rotated-knob demo.
// ───────────────────────────────────────────────────────────────────────────

// One centered rect at a fixed local size; the slider rotates it.
// 160×160 (square) keeps the OBB vs. AABB comparison fair across angles.
export function rotatedRectFixture(angleRad: number): Fixture {
  return {
    nodes: [
      {
        id: "rotated",
        kind: "rect-rotated",
        rect: { x: 220, y: 150, width: 160, height: 160 },
        angle: angleRad,
        fill: FILL,
        stroke: STROKE,
      },
    ],
    initialSelection: ["rotated"],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Group scene — one container with three colored children.
// Use with `selectionGroups` on HUDStage to demo SelectionGroup[].
// ───────────────────────────────────────────────────────────────────────────

// Three identical 100×100 children on a uniform 60-px grid step, centered
// vertically. Uniform size makes "group envelope vs. flat ids" easy to
// read — the union rect is just the row's bounding box.
export function groupFixture(): Fixture {
  return {
    nodes: [
      {
        id: "child-a",
        kind: "rect",
        group: "g",
        rect: { x: 100, y: 180, width: 100, height: 100 },
        fill: FILL,
        stroke: STROKE,
      },
      {
        id: "child-b",
        kind: "rect",
        group: "g",
        rect: { x: 260, y: 180, width: 100, height: 100 },
        fill: FILL,
        stroke: STROKE,
      },
      {
        id: "child-c",
        kind: "rect",
        group: "g",
        rect: { x: 420, y: 180, width: 100, height: 100 },
        fill: FILL,
        stroke: STROKE,
      },
    ],
    initialSelection: ["child-a"],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Union-bounds helper — composes a SelectionGroup with the bounding rect of
// every id passed in. Mirrors svg-editor's multi-select wiring at
// `packages/grida-svg-editor/src/dom.ts:1631-1666`.
// ───────────────────────────────────────────────────────────────────────────

export function unionShape(
  fixture: Fixture,
  ids: string[]
): { x: number; y: number; width: number; height: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const id of ids) {
    const n = fixture.nodes.find((x) => x.id === id);
    if (!n?.rect) continue;
    x0 = Math.min(x0, n.rect.x);
    y0 = Math.min(y0, n.rect.y);
    x1 = Math.max(x1, n.rect.x + n.rect.width);
    y1 = Math.max(y1, n.rect.y + n.rect.height);
  }
  if (!isFinite(x0)) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// ───────────────────────────────────────────────────────────────────────────
// Shape resolution — translate a FixtureNode into hud's SelectionShape.
// Used by the host adapter's `shapeOf` provider.
// ───────────────────────────────────────────────────────────────────────────

export function fixtureToShape(node: FixtureNode): SelectionShape | null {
  if (node.kind === "line" && node.p1 && node.p2) {
    return { kind: "line", p1: node.p1, p2: node.p2 };
  }
  // Polygon — hud reads the AABB for selection chrome / pick. The
  // §15 star demo uses the polygon for the visual underlay and a
  // separately-supplied `line` geometry input for the corner-radius
  // chrome (one tooth of the star).
  if (node.kind === "polygon" && node.polygon && node.polygon.length >= 3) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of node.polygon) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    return {
      kind: "rect",
      rect: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
    };
  }
  if (node.kind === "rect-rotated" && node.rect && node.angle !== undefined) {
    const { x, y, width, height } = node.rect;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const c = Math.cos(node.angle);
    const s = Math.sin(node.angle);
    // 2×3 affine: rotate around the rect's center, then translate so the
    // local AABB at (0,0,w,h) maps back to its original center.
    const tx = cx - (c * width) / 2 + (s * height) / 2;
    const ty = cy - (s * width) / 2 - (c * height) / 2;
    return {
      kind: "transformed",
      local: { x: 0, y: 0, width, height },
      matrix: [
        [c, -s, tx],
        [s, c, ty],
      ],
    };
  }
  if (node.rect) {
    return { kind: "rect", rect: { ...node.rect } };
  }
  return null;
}
