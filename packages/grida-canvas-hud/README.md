# @grida/hud

The surface backend for the Grida editor viewport.

A self-contained, mathematically grounded HUD overlay: handles, selection chrome, hover, marquee, gesture state, hit-testing — all rendered to a single `<canvas>` from a pure-logic state machine. No DOM overlay, no `data-id` traversal, no per-element React reconciliation in the hot path.

## What is the HUD?

The HUD is the non-content visual chrome drawn on top of the viewport: selection rectangles, resize handles, hover outlines, marquees, snap guides, measurement lines, pixel grids. Everything the operator sees that isn't part of the document itself.

In industry terms: Blender calls this "Overlays", Unity calls it "Gizmos", game engines call it "HUD". We use HUD.

## Why a canvas-based surface

The DOM approach — positioned `<div>` handles, `data-grida-id` for hit-test, native dblclick — works until it doesn't. Concrete failures we hit before this package existed:

- **DOM identity is fragile.** Re-rendering the SVG tree on every state change destroys the live element mid-gesture; native dblclick (keyed by DOM identity) breaks and has to be re-implemented manually.
- **Hit-test relies on attributes.** `data-grida-id` has to be applied and stripped around export; any path-rewrite invalidates the id index.
- **State and events are hard to propagate.** Gesture, hover, modifier, selection state scatter across the surface and editor; each one re-renders the world.
- **It does not scale across backends.** SVG-tied DOM overlays can't be reused by the cg/Rust editor.

The fix is to make the HUD a **pure-logic state machine + a canvas renderer**. The state machine takes raw pointer events, owns gesture/hover/modifiers, and emits `Intent`s to the host. The renderer draws a single `HUDDraw` per frame. Both layers are testable in isolation; neither layer touches the DOM.

## Architecture

Three layers. One-directional dependency: **`primitives/` ← `event/` ← `surface/`**.

```text
┌─────────────────────────────────────────────────┐
│  Host (svg-editor, grida-canvas-react, …)       │
│  - Document, scene, selection                   │
│  - Provides:  pick, shapeOf, onIntent           │
│  - Pushes pointer events to surface             │
│  - Commits intents (history.preview, commands)  │
└───────────────────────┬─────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────┐
│  surface/  — the wired class                    │
│  - `Surface`: constructor wiring, lifecycle,    │
│    draw loop                                    │
│  - `chrome`: builds HUDDraw from state          │
└───────────┬───────────────────────┬─────────────┘
            │                       │
┌───────────▼──────────┐ ┌──────────▼─────────────┐
│  event/              │ │  primitives/           │
│  the math core       │ │  dumb render shapes    │
│  - Gesture state     │ │  - HUDCanvas           │
│  - Hit-regions       │ │  - HUDDraw primitives  │
│  - Click-tracker     │ │  - Snap/measure/lasso  │
│  No canvas. No host. │ │    builders            │
│  No DOM.             │ │  No state. No host.    │
└──────────────────────┘ └────────────────────────┘
```

The `event/` layer is the testable core. It dispatches plain objects, returns plain objects, has zero I/O. Every gesture transition, hit-region resolution, and click-tracker decision is a pure function over its inputs — runnable under vitest with no canvas, no DOM, no React.

## Layer responsibilities

| Layer                      | Owns                                                                           | Reads from                    | Writes to                                                        |
| -------------------------- | ------------------------------------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------- |
| **`primitives/HUDCanvas`** | Canvas2D context, DPR, transform, drawing of `HUDDraw` primitives              | —                             | Canvas                                                           |
| **`event/`**               | Gesture, hover, modifiers, cursor, click-tracker, hit-regions, intent builders | —                             | Returns next state + intents from `dispatch(state, event, deps)` |
| **`surface/Surface`**      | Current `SurfaceState`, the underlying `HUDCanvas`, host providers, draw loop  | Host providers, surface state | Calls `onIntent`; calls `HUDCanvas.draw`                         |
| **Host**                   | Document, scene, selection, history                                            | Surface state introspection   | Pushes pointer events; pushes selection mirror; commits intents  |

### What the surface deliberately does NOT own

- **Selection.** Host owns; surface holds a read-only mirror via `setSelection(ids)`. Surface emits `select` / `deselect` / `toggle` intents; host commits.
- **Document / scene.** Surface never reads node data directly. Only callbacks: `pick(point) → NodeId | null`, `shapeOf(id) → SelectionShape | null`.
- **History.** Host wraps commits with `history.preview` per its own logic. Intents carry `phase: "preview" | "commit"` so the host knows when to wrap.
- **`<style>` resolution, defs, paint, anything SVG-specific.** Out of scope.

### What the surface owns because nothing else needs it

Gesture state machine, hover indicator, modifier snapshot, cursor, click-tracker (dblclick). These have no representation outside the surface; making them surface-private is the single-source-of-truth rule.

## Two backends: render and hit-testing

The HUD has two backends, and they deliberately disagree.

Every frame the HUD produces two outputs: a list of render primitives drawn to the canvas, and a registry of hit regions consulted on pointer events. They share no geometry. They are paired per affordance — the rotation handle's hit region is not derived from a rendered shape, and the resize knob's visual is not derived from its hit AABB. One backend is for the eye; the other is for the cursor.

### Why they disagree

The two outputs optimise for different things:

- The renderer optimises for **legibility at any zoom** — small, crisp shapes that don't dominate the document.
- The hit-tester optimises for **Fitts'-law reach** — fat targets, virtual regions outside the visible shape, priority ladders that resolve overlap by intent rather than topology.

Collapsing them — drawing a 16 px knob just to match the 16 px hit AABB, or shrinking the hit AABB to 8 px just to match the visual — breaks one of the two. The split exists so neither has to compromise.

### `OverlayElement` — the pairing primitive

`OverlayElement` is the public type that holds the discipline together. Each element carries a mandatory `hit` and an _optional_ `render`. Hit is required because every overlay must be reachable; render is optional because some overlays are deliberately invisible.

The renderer never reads from `hit`. The hit-tester never reads from `render`. The asymmetry is the point.

### Four families of overlay

The mental model the package operates under. Every overlay the HUD draws — or the next one anyone adds — falls into one of four shapes:

| Family          | Visual            | Hit region                               | Example                              |
| --------------- | ----------------- | ---------------------------------------- | ------------------------------------ |
| **Paired**      | Drawn shape       | Same shape, padded for reach             | Corner resize knob, line endpoint    |
| **Virtual**     | None              | Region the user can click but never sees | Rotation handles, edge-resize strips |
| **Decorative**  | Drawn shape       | None                                     | Snap pips, measurement labels        |
| **Body-region** | Selection outline | Inner region that triggers translate     | Selected shape body                  |

Anything new the HUD learns to do should be a deliberate choice between these — not a side effect of how it happened to be drawn.

### Guidance for new affordances

1. **Decide hit geometry first, visual second.** The user reaches for the hit region; the visual is a hint about where it is.
2. **If an affordance is virtual, omit `render`.** Don't draw a stand-in just because the type allows it.
3. **If the visual is smaller than the minimum comfortable touch target, pad the hit region.** Don't pad the visual to compensate.

### Guidance for tests

Tests should assert against `hit` and `render` separately. A test that only checks the rendered shape silently passes when someone removes the hit padding; a test that only checks the hit region silently passes when someone drops the visual.

New affordances should add at least one assertion per side, and — where the two intentionally differ — one assertion that they differ in the expected direction (e.g. `hit` strictly contains the `render` bbox).

## Public API

```ts
import { Surface, HUDCanvas, type HUDDraw, type HUDStyle } from "@grida/hud";

const surface = new Surface(canvasElement, {
  // required wiring
  pick:    (point_doc) => editor.hitTest(point_doc),      // (point) => NodeId | null
  shapeOf: (id)        => editor.shapeOf(id),             // (id)    => SelectionShape | null
  onIntent:  (intent)    => editor.commitIntent(intent),  // surface → host

  // optional config
  style: { chromeColor: "#2563eb", handleSize: 8 },
  readonly: false,
});

// Lifecycle
surface.setSize(w, h);
surface.setTransform(t);    // camera (screen ↔ doc)
surface.setSelection(ids);  // read-only mirror from host
surface.setStyle(partial);
surface.setReadonly(v);
surface.setPixelGrid({ enabled, zoomThreshold, color?, steps? }); // or null to disable
surface.dispose();

// Input
const response = surface.dispatch(event);
// response: { needsRedraw, cursorChanged, hoverChanged }
// (intents are pushed via onIntent, not returned here)

// Frame
surface.draw(extra?);        // merges surface chrome + host extras, one canvas draw

// Read-only introspection
surface.gesture(): SurfaceGesture;
surface.hover():   NodeId | null;
surface.cursor():  CursorIcon;
```

### Event types

```ts
type SurfaceEvent =
  | { kind: "pointer_move"; x: number; y: number; mods: Modifiers }
  | {
      kind: "pointer_down";
      x: number;
      y: number;
      button: PointerButton;
      mods: Modifiers;
    }
  | {
      kind: "pointer_up";
      x: number;
      y: number;
      button: PointerButton;
      mods: Modifiers;
    }
  | { kind: "modifiers"; mods: Modifiers }
  | {
      kind: "wheel";
      x: number;
      y: number;
      dx: number;
      dy: number;
      mods: Modifiers;
    }
  | { kind: "key"; phase: "down" | "up"; code: string; mods: Modifiers };

type Modifiers = { shift: boolean; alt: boolean; meta: boolean; ctrl: boolean };
type PointerButton = "primary" | "secondary" | "middle";
```

All `SurfaceEvent` coordinates are **screen-space CSS pixels relative to the canvas**. The surface owns the camera and converts internally.

### Gesture state

```ts
type SurfaceGesture =
  | { kind: "idle" }
  | { kind: "pan"; dx: number; dy: number }
  | { kind: "marquee"; rect: Rect } // screen-space
  | { kind: "translate"; ids: NodeId[]; dx: number; dy: number }
  | {
      kind: "resize";
      ids: NodeId[];
      direction: ResizeDirection;
      initial_shape: SelectionShape;
      current_shape: SelectionShape;
    }
  | {
      kind: "rotate";
      ids: NodeId[];
      corner: RotationCorner;
      anchor_angle: number;
      current_angle: number;
    }
  | { kind: "endpoint"; id: NodeId; endpoint: "p1" | "p2" };
```

### Intents

The surface emits `Intent`s through `onIntent`. The host commits — wrapping in `history.preview`, dispatching commands, whatever. The surface itself doesn't mutate the document.

```ts
type Intent =
  | { kind: "select"; ids: NodeId[]; mode: "replace" | "add" | "toggle" }
  | { kind: "deselect_all" }
  | { kind: "translate"; ids: NodeId[]; dx: number; dy: number; phase: Phase }
  | {
      kind: "resize";
      ids: NodeId[];
      anchor: ResizeDirection;
      /** AABB of the new shape (for axis-aligned hosts). */
      rect: Rect;
      /** Full new shape — `transformed` carries the matrix so rotated
       *  hosts can resize in the local frame. Optional for backward-compat. */
      shape?: SelectionShape;
      phase: Phase;
    }
  | { kind: "rotate"; ids: NodeId[]; angle: number; phase: Phase }
  | {
      kind: "marquee_select";
      rect: Rect;
      additive: boolean;
      phase: Phase;
    }
  | {
      kind: "set_endpoint";
      id: NodeId;
      endpoint: "p1" | "p2";
      pos: [number, number];
      phase: Phase;
    }
  | { kind: "enter_content_edit"; id: NodeId }
  | { kind: "cancel_gesture" };

type Phase = "preview" | "commit";
```

**Why `phase` matters.** During a drag, the surface emits `phase: "preview"` on every frame; on pointer-up, one final `phase: "commit"`. The host wraps `preview` intents in `history.preview()` (apply + revert) and finalizes on `commit`. This removes guesswork from the host — gesture state is not part of the intent contract.

### React API

A single hook. No provider, no context.

```tsx
import { useHUDSurface } from "@grida/hud/react";

function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surface = useHUDSurface(canvasRef, {
    pick,
    shapeOf,
    onIntent,
    style,
  });
  // surface is the imperative instance — same as `new Surface(...)`
  // wire pointer events as the host wants
  return <canvas ref={canvasRef} />;
}
```

## Cursors

The HUD owns cursor state (`SurfaceState.setCursor` → `surface.cursor()`), but **does not own cursor pixels.** The host receives a `CursorIcon` and decides what CSS `cursor:` value to apply.

For hosts that want Grida's default Figma-style rotation/resize cursors — curved double-arrows for rotate, straight double-arrows for resize, both following the selection's screen-space rotation — wire the opt-in renderer from the dedicated subpath:

```ts
import { cursors } from "@grida/hud/cursors";

surface.setCursorRenderer(cursors.defaultRenderer());
```

**Tree-shake invariant.** Nothing in `surface/`, `event/`, or `primitives/` may import from `cursors/`. Hosts that don't import the subpath pay zero bundle cost. Enforced by `__tests__/cursors.test.ts`.

The subpath also exposes the SVG templates and the `data:` URL encoder for hosts that want to render cursor previews in sidebar UI without going through the Surface:

```ts
import { cursors } from "@grida/hud/cursors";
const svg = cursors.templates.rotate(45); // angle in degrees
const url = cursors.svgDataUrl(svg);
```

## Selection intent

The full classification table — every named scenario at pointer-down, what
commits when, and why DOM event order can't express it cleanly — is an
**implementation-agnostic working-group spec**, alongside its UX-narrative
sibling:

- Formal classifier: https://grida.co/docs/wg/feat-editor/ux-surface/selection-intent
- UX-narrative test cases: https://grida.co/docs/wg/feat-editor/ux-surface/selection

This package's implementation:

- [`event/decision.ts`](./event/decision.ts) — `Scenario` enum + `classifyScenario` +
  dispatch.
- [`__tests__/decision.test.ts`](./__tests__/decision.test.ts) — one test
  per named scenario.

Skim the spec before changing the classifier or its dispatch.

## Coordinate model

- All `SurfaceEvent` points are **screen-space** (CSS px relative to the canvas).
- `setTransform(t)` is the camera — one matrix, screen ↔ doc.
- Hit-test happens in two tiers on `pointer_down`:
  1. **UI layer (screen-space AABB)** — surface's own `HitRegions` registry, populated by chrome builder each frame. Resize handle? Rotation handle? Body region (translate)? Direct path; no host involvement.
  2. **Scene layer (doc-space point)** — if no UI hit, surface converts the point screen→doc and calls `pick(point_doc)`. Host implements this with whatever it has (`elementFromPoint`+`data-id` for SVG-DOM hosts, scene-cache R-tree for cg).
- The UI-tier hit registry is built independently of the render path — see [Two backends: render and hit-testing](#two-backends-render-and-hit-testing).
- `shapeOf(id)` returns a **doc-space** `SelectionShape`:
  - `{ kind: "rect", rect }` — axis-aligned (most nodes)
  - `{ kind: "line", p1, p2 }` — vector lines
  - `{ kind: "transformed", local, matrix }` — anything with a non-identity 2×3 affine (rotation, skew, non-uniform scale, mirror). `local` is the artwork's local-frame AABB; `matrix` maps local → doc. Identity matrix here is byte-equivalent to `{ kind: "rect", rect: local }`.

  See [Transformed selections](#transformed-selections) below for what the HUD does with the `transformed` variant.

Handles are always drawn at a fixed screen-space size regardless of zoom. The primitive layer supports this via `HUDScreenRect` (see below).

## Render path (one draw per frame)

1. **Surface builds its own `HUDDraw`** from `SurfaceState` + `shapeOf`:
   - hover outline (if `hover()` set)
   - selection outline (from selection mirror)
   - marquee rect (if active gesture is `marquee`)
   - resize / rotate handles (screen-space)
   - size meter pill (selection bounds W×H)
2. **Host extras merge in** if `draw(extra)` was called with a host-fed `HUDDraw` (snap guides, measurement, custom widgets).
3. **One call to `HUDCanvas.draw(merged)`** — clears the canvas and renders everything immediately.

Layer order within a frame (back-to-front):

0. Pixel grid (when enabled and `transform[0][0] > zoomThreshold`)
1. Hover outline
2. Selection outline
3. Marquee rect
4. Resize/rotate handles
5. Size meter pill
6. Host-fed extras (always on top)

## Transformed selections

When a host returns `{ kind: "transformed", local, matrix }` from `shapeOf`, the HUD renders the chrome — outline, knobs, edge strips, rotation halos, size badge, dashed resize preview — in the artwork's own frame. Knobs rotate with the parent. The size badge reads `local.width × local.height`, not the AABB of the rotated rect. The cursor's `baseAngle` follows the matrix so resize/rotate arrows stay aligned with the selection's tilt.

**Render** uses lazy transforms — every rotated primitive carries an optional angle field; the canvas wraps the draw call in a `translate/rotate/restore`:

| Primitive       | Field                                | Effect                                                 |
| --------------- | ------------------------------------ | ------------------------------------------------------ |
| `HUDScreenRect` | `angle?: number` (radians, CCW)      | Rotates the rect around its screen-space center.       |
| `HUDLine`       | `labelAngle?: number` (radians, CCW) | Rotates the label pill around its screen-space center. |

**Hit-test** uses the same lazy transform via a new `HitShape` variant:

```ts
type HitShape =
  | { kind: "screen_rect_at_doc"; anchor_doc; width; height }
  | { kind: "screen_aabb"; rect }
  | { kind: "screen_obb"; rect; inverse_transform }; // ← new
```

`screen_obb` carries the un-rotated zone rect (in shadow space, centered at the chrome's screen center) plus an `inverse_transform` that maps a screen-space pointer INTO shadow space. The hit-test loop applies the inverse to the pointer, then runs the usual AABB containment. **No AABB-of-rotated-corners inflation** — clicks outside the visible rotated chrome don't trigger phantom resize regions, regardless of aspect ratio or rotation. The 9-slice priority ladder operates in the same coordinate frame as the axis-aligned `rect` path, so promotion/demotion rules behave identically.

The `resize` gesture operates in the local frame: `applyResize` takes a `SelectionShape` and returns a `SelectionShape`, with deltas inverse-transformed into local space for `transformed` shapes. The emitted `Intent` carries both `rect` (AABB) and `shape` (full local + matrix) so legacy axis-aligned hosts keep working while transform-aware hosts can write the new dims back into the artwork without touching the matrix.

**v1 caveats.** Pure rotation is exact at every level (render, hit, gesture). Skew and non-uniform scale render correctly but use a uniform-scale fallback for handle sizing — anisotropic per-axis sizing is a follow-up.

## Primitives — what `HUDCanvas` can draw

| Primitive       | Coordinate space                                       | Used by                                       |
| --------------- | ------------------------------------------------------ | --------------------------------------------- |
| `HUDLine`       | doc-space (segment), optional label in screen-space    | snap lines, measurement, spacing              |
| `HUDRule`       | doc-space offset, full-viewport extent in screen-space | guide snapping, ruler                         |
| `HUDRect`       | doc-space                                              | selection outline, marquee in doc-space hosts |
| `HUDPolyline`   | doc-space                                              | lasso, complex selections                     |
| `HUDScreenRect` | screen-space size at doc-space anchor                  | resize/rotate handles                         |
| Crosshair point | screen-space                                           | snap hit indicators                           |
| Label pill      | screen-space at doc-space anchor                       | size meters, snap gap labels                  |

`HUDDraw` is a plain command struct grouping these. Builders (`snapGuideToHUDDraw`, `measurementToHUDDraw`, …) take host state and return a `HUDDraw` — the surface uses the same mechanism internally for its chrome.

Every primitive may also carry an optional semantic `group` string. The HUD package does not define the vocabulary; hosts name their own groups, assign them to surface chrome via `SurfaceOptions.groups`, and return hidden groups from `SurfaceOptions.visibility`. Groups are visibility policy, not paint order, so a host can suppress whole UI families during a gesture while leaving unrelated extras alone.

## Module layout

```
packages/grida-canvas-hud/
├── README.md
├── index.ts                   # Surface, HUDCanvas, public types
├── react.tsx                  # useHUDSurface hook
├── primitives/                # UI — dumb render shapes
│   ├── canvas.ts              # HUDCanvas
│   ├── types.ts               # HUDDraw, HUDLine, HUDRect, HUDPolyline, HUDRule, HUDScreenRect
│   ├── snap-guide.ts          # HUDDraw builder
│   ├── measurement-guide.ts   # HUDDraw builder
│   ├── marquee.ts             # legacy HUDDraw builder (surface emits its own marquee)
│   └── lasso.ts               # HUDDraw builder
├── event/                     # the math core
│   ├── event.ts               # SurfaceEvent, Modifiers, PointerButton
│   ├── gesture.ts             # SurfaceGesture + transitions
│   ├── hit-regions.ts         # screen-space AABB region registry
│   ├── handles.ts             # 8 resize + 4 rotate geometry & hit-test
│   ├── click-tracker.ts       # dblclick / multi-click detection
│   ├── cursor.ts              # CursorIcon, ResizeDirection, RotationCorner
│   ├── intent.ts              # Intent types + builders
│   ├── transform.ts           # screen ↔ doc helpers
│   └── state.ts               # SurfaceState — pure dispatch entry
├── surface/                   # the wired class
│   ├── surface.ts             # Surface class
│   ├── chrome.ts              # builds HUDDraw from SurfaceState + shapeOf
│   └── style.ts               # HUDStyle defaults + merge
└── cursors/                   # opt-in subpath: @grida/hud/cursors
    ├── index.ts               # cursors.defaultRenderer(), templates, encoder
    ├── renderer.ts            # CursorIcon → CSS cursor: with rotation-aware SVGs
    ├── templates.ts           # parameterized SVG cursor templates
    └── encode.ts              # SVG → data: URL
```

## Naming conventions

- File names are **kebab-case `.ts`** throughout.
- Inside files, **snake_case is acceptable** for non-filename identifiers.
- Public method names on `Surface` and `HUDCanvas` are **camelCase** (`setSize`, `setTransform`, `setSelection`) — matches the existing primitive renderer API.
- The top-level class is **`Surface`**, not `HUDSurface`. The package name already says "hud".

## UX Testing

`packages/grida-canvas-hud/__tests__/` runs under vitest. No DOM, no canvas
mock, no real pointer events — the `event/` layer is pure and the tests are
plain function calls.

### Why UX testing is a first-class concern here

The HUD is small in code volume but dense in UX _semantics_. A single
`if (click_count >= 2) return Scenario.EnterEdit` is one line, but it encodes
a rule a user expects to work everywhere ("double-click enters edit"). The
code can't explain the _why_: why dblclick on a vertex doesn't exit, why
single-click on a body region defers, why a shift-click on an already-
selected node doesn't immediately add — these are UX choices, not
implementation details.

That creates a maintenance hazard. The HUD is **configurable** — hosts pass
styles, intent handlers, scene callbacks; small refactors land all the
time. With no visible behaviour to inspect (we draw to canvas; we synthesize
events), a UX rule can be silently dropped without anyone noticing until a
user complains. There is no browser test guarding us; there is no human in
the loop on every PR.

The fix is **doctrine: every default UX behaviour is locked by a unit test
that describes the behaviour in plain English.** The test name is the
spec. The body proves the code obeys it. Together they form a
machine-checked contract that says: "this is what the HUD does by default,
and if you change it you must change the test on purpose."

These tests are pure, headless, and fast. They are _not_ end-to-end browser
tests. They run on the `event/` and `surface/` modules directly because the
HUD was deliberately built so that every UX decision is computable from
inputs alone — `classifyScenario(input) → Scenario`, `decidePointerDown(input) → Decision`,
`SurfaceState.dispatch(event, deps) → response + intents`. Anything the user
will observe in a browser is the deterministic image of one of those
functions; if the function returns the wrong thing in a unit test, the
browser would show the wrong thing.

### What counts as a UX spec test

A UX spec test is a plain unit test with three properties:

1. **The `it("…")` description names the UX rule in natural language.** Not
   "returns the right value" — "dblclick on empty space while in
   content-edit emits exit_content_edit." Read in isolation, the test name
   should describe what the user sees.
2. **The body checks behaviour, not implementation.** Assert on the
   emitted intents, the returned `Decision`, the resulting `HUDDraw`
   primitive set — not on private state shape.
3. **A comment above explains _why_ — the design intent.** This is the
   piece the code can't carry. "Exit takes precedence over enter when
   in-content-edit; the user clicking outside the edit clearly wants out,
   not to re-enter on a different node." Future readers (humans, agents,
   reviewers) need to know what we were defending against, not just the
   green checkmark.

A test that satisfies all three is the smallest unit of UX truth we have
about the HUD's defaults.

### When to add one

Add a UX spec test for every default behaviour that a host could
silently break by editing the code. In practice: every named branch in
`classifyScenario`, every kind in `PointerDownDecision`, every emitted
intent shape, every chrome primitive count tied to a state. If the
behaviour is configurable (e.g. style tokens), the test pins the _default_
— the rule under `DEFAULT_STYLE` or under no overrides. Configurability
doesn't excuse the absence of a default spec; it raises the bar for
having one.

When you change UX on purpose, you update the test at the same time. A
PR that touches a UX rule without touching the matching test is a smell;
a PR that flips a test's assertion without changing the test name is a
near-certain regression.

### How to structure a UX spec

Match the style already in use across `__tests__/`:

```ts
// UX spec: dblclick away while editing exits content-edit.
//
// While a vector sub-selection is mirrored on the surface, a dblclick
// that does NOT land on a vector control (vertex / tangent / segment-
// strip) classifies as ExitEdit. Without this the user has no way out
// of edit mode except keyboard or the host's own UI, which surveys say
// is the #1 confusion in vector editors.
it("classifies dblclick on empty space WHILE in content-edit as ExitEdit", () => {
  const i = input({ click_count: 2, in_content_edit: true });
  expect(classifyScenario(i)).toBe(Scenario.ExitEdit);
  expect(decidePointerDown(i)).toEqual({ kind: "exit_edit" });
});
```

Top comment explains design intent. Test name names the UX rule. Assertion
locks the behaviour. Three layers, all required.

### Default UX behaviours locked by tests

Non-exhaustive index — open the test files for the full surface.

| Behaviour                                                                                     | Pinned in                              |
| --------------------------------------------------------------------------------------------- | -------------------------------------- |
| Single-click on unselected node → immediate select                                            | `decision.test.ts`                     |
| Single-click on already-selected node → defer (drag is a live candidate)                      | `decision.test.ts`, `state.test.ts`    |
| Shift-click on selected node → defer (toggle-remove vs drag is ambiguous)                     | `decision.test.ts`                     |
| Click in body region with selection → always defer (drag claim)                               | `decision.test.ts`                     |
| Dblclick on content → emits `enter_content_edit`                                              | `decision.test.ts`, `state.test.ts`    |
| Dblclick on empty space / other node / body WHILE in content-edit → emits `exit_content_edit` | `decision.test.ts`, `state.test.ts`    |
| Dblclick on vertex / tangent / segment-strip WHILE in content-edit → handler runs (no exit)   | `decision.test.ts`                     |
| Marquee starts from empty-space pointer-down                                                  | `state.test.ts`                        |
| Drag past threshold cancels a deferred select (drag-vs-click discriminator)                   | `state.test.ts`                        |
| Tangent knob renders as a 45°-rotated square ("diamond"), smaller than vertex                 | `vector-chrome-extended.test.ts`       |
| Vertex knob renders as a circle, selected fills with chrome color                             | `vector-chrome-extended.test.ts`       |
| Selected tangent line is thicker than idle                                                    | `vector-chrome-extended.test.ts`       |
| Segment outline: idle gray → hover @ 50% accent → selected solid accent                       | `vector-chrome-segment-render.test.ts` |
| Segment strip emits N inner samples per cubic, t ∈ (0, 1)                                     | `vector-chrome-extended.test.ts`       |
| Priority ladder: tangent (4) < vertex (5) < segment (8)                                       | `vector-chrome-extended.test.ts`       |
| Rotation-aware cursor CSS via `cursors.defaultRenderer`                                       | `cursors.test.ts`                      |
| Click-tracker: single vs double within window + position threshold                            | `click-tracker.test.ts`                |

### Test file index

| File                                   | Domain pinned by tests                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `transform.test.ts`                    | screen ↔ doc across translate, scale, DPR                                                                    |
| `hit-regions.test.ts`                  | topmost wins, reverse iteration, clear/empty, AABB containment                                               |
| `handles.test.ts`                      | 8 resize + 4 rotate positions; screen-space hit-test; visibility threshold                                   |
| `click-tracker.test.ts`                | single vs double within window; position threshold; multi-button isolation                                   |
| `gesture.test.ts`                      | legal transitions (idle↔translate/resize/marquee/cancel; deferred selection)                                 |
| `state.test.ts`                        | dispatch sequences: click selects, drag-empty marquees, drag-handle resizes, drag-node translates, exit-edit |
| `intent.test.ts`                       | intent stream + `phase` correctness across a full drag (preview·N → commit)                                  |
| `decision.test.ts`                     | one test per named scenario in the selection-intent classifier, including ExitEdit gating                    |
| `chrome.test.ts`                       | given state + bounds, assert resulting `HUDDraw` shape — primitive counts and coords                         |
| `chrome-transformed.test.ts`           | `SelectionShape.transformed` end-to-end                                                                      |
| `chrome-priority.test.ts`              | overlay priority ladder over scenarios                                                                       |
| `cursors.test.ts`                      | `cursors.defaultRenderer` produces rotation-aware CSS values; tree-shake invariant                           |
| `vector-chrome.test.ts`                | vector chrome baseline: vertex emission, neighbouring filter, hit-region pad                                 |
| `vector-chrome-extended.test.ts`       | vector chrome UX: tangent diamond shape + size, selection highlight, priority ladder                         |
| `vector-chrome-segment-render.test.ts` | segment outline state machine: idle / hover / selected styling                                               |
| `vector-gesture.test.ts`               | vector-specific gesture state machine: tangent drag, segment-strip click→split, drag→bend                    |

Render output (visual canvas correctness — paint order, anti-aliasing, the
actual pixel result) is verified in the browser, not unit-tested. Every UX
_behaviour_ is.

## Extending the HUD

The HUD intentionally exposes no generic "register a painter" or "register a
layer" API (see Anti-goals — "Not a host of plugins"). Three paths cover real
needs, in this order of preference:

1. **Named built-in chrome.** Things every Grida editor wants — pixel grid,
   selection, snap guides, measurement — live inside this package as
   first-class features with their own toggles (e.g. `setPixelGrid`,
   `setStyle`, the chrome built from `SurfaceState`). New canonical chrome
   lands here; open a PR against `@grida/hud`.

2. **Host-fed `HUDDraw` extras.** Pass extra primitives into `surface.draw(extra)`
   per frame. Best for transient, gesture-coupled overlays the host already
   computes (measurement lines, custom snap visualizers). Drawn on top of named
   chrome — they're foreground, not background.

3. **DOM-level escape hatch.** The host owns the container element; the surface
   only inserts the SVG and the HUD canvas. Hosts that need a non-canvas overlay
   (HTML toolbar, popover, debug widget) can splice their own DOM into the
   container directly. Deliberate escape hatch — reach for it only when (1) and
   (2) don't fit, and prefer pushing canonical needs into (1) over keeping them
   here.

## Anti-goals

- **Not a renderer.** `primitives/HUDCanvas` is intentionally minimal Canvas2D. Skia / WebGL backends are not in scope.
- **Not a scene graph.** Surface never reads node data — only via `pick` / `shapeOf`.
- **Not a host of plugins.** No widget registry. Custom HUD elements go through host-fed `HUDDraw` extras.
- **Not undo-aware.** Intents carry `phase`; host owns undo.
- **Not a selection store.** Host owns selection; surface mirrors.
- **Not SVG-aware.** No `data-id`, no DOM IR, no `<style>` resolution.

## Adoption

v1 ships against [`@grida/svg-editor`](../grida-svg-editor/). The svg-editor's `dom.ts` is rewritten as a thin adapter: SVG content on the bottom layer, a `<canvas>` HUD on top, pointer events forwarded to `surface.dispatch`, intents flowing back via `editor.commitIntent`. Selection chrome, handles, and gesture state move out of `dom.ts` entirely.

Main-editor migration (`editor/grida-canvas-react/viewport/ui/*`) is tracked separately. The host contract is the same; the only difference is the `pick` implementation (scene-cache R-tree instead of `elementFromPoint`+`data-id`).
