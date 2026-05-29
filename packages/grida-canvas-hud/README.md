# @grida/hud

The surface backend for the Grida editor viewport.

A self-contained, mathematically grounded HUD overlay: handles, selection chrome, hover, marquee, gesture state, hit-testing — all rendered to a single `<canvas>` from a pure-logic state machine. No DOM overlay, no `data-id` traversal, no per-element React reconciliation in the hot path.

## What is the HUD?

The HUD is the non-content visual chrome drawn on top of the viewport: selection rectangles, resize handles, hover outlines, marquees, snap guides, measurement lines, pixel grids. Everything the operator sees that isn't part of the document itself.

In industry terms: Blender calls this "Overlays", Unity calls it "Gizmos", game engines call it "HUD". We use HUD.

## Bedrock layers (`core/` + `primitives/`)

> **Stability — `v0.x`, no compatibility guarantees.** The bedrock is an
> **additive foundational layer**. It ships its own value types and mechanism
> modules, fully unit-tested, but is **not yet load-bearing in production**:
> the package's `Surface` and its consumers still run on the legacy `event/`
> stack. The bedrock is reached only through the `@grida/hud/core` and
> `@grida/hud/primitives` subpaths — never the package root, which keeps the
> legacy names (`HitShape`, `RenderShape`, `CursorIcon`, …). The two coexist
> without collision until the legacy stack is grounded on the bedrock in a
> follow-up. Types here may change without a semver bump in this window.

Two layers below the named-class surface, designed once and intended to
outlive every higher-layer redesign. They import only `@grida/cmath` and each
other — no DOM, no framework, no class knowledge.

- **`core/`** (`@grida/hud/core`) — engine substrate. Independently-testable
  mechanism modules: the synthesized input vocabulary (`HUDEvent`), a
  multi-click classifier (`ClickTracker`), screen↔world helpers
  (`Transform`), a generic name-keyed `NamedRegistry<K, T>`, and the generic
  `HitRegistry<I>` + pure `shapeContains` (lower priority wins on overlap).
  No master class. See [`core/README.md`](./core/README.md).

- **`primitives/`** (`@grida/hud/primitives`) — agnostic value types: the
  canonical `HUDObject<I>` (a discriminated union enforcing the
  `(render ∨ hit)` invariant at the type level), the `HitShape` / `RenderShape`
  unions, the 4-method `Painter` seam, and cursor value types. The pre-existing
  drawing primitives ship alongside; the opinionated drawers (`ruler.ts`,
  `corner-radius.ts`, …) still co-locate here, flagged for relocation to
  `classes/<name>/` in a follow-up. See [`primitives/README.md`](./primitives/README.md).

Bedrock anti-goals (the defensive perimeter — a request that crosses one is
"the wrong tool"): **not a plugin host** (no `register*` extension API), **not
a renderer** (`Painter` is the seam to a host renderer; bedrock paints HUD
chrome, never document content), **not a hit-test acceleration structure**
(`HitRegistry` is O(n) per query; no spatial index ships in `core/`), **not a
state mirror** (no per-class state), **not a DOM library** (no `HTMLElement`
in `core/`).

## What this package is — two tiers

The package ships **two tiers** of API with different audiences. They are not a hierarchy — they are two products shipped from one package.

### Tier 1 — Named classes (the inhouse vocabulary)

A **named class** is a composed, opinionated interaction model that represents one coherent editable concept. Each class encapsulates:

- A model — the math it edits, the gesture grammar that mutates it, the intent contract it commits to
- HUD-owned hover, cursor, hit priority, modifier interpretation
- A bounded feature surface — _capability_ toggles only (does this instance have padding? does it support corner radius?), not visual variants (colors, thicknesses — those are style tokens)

Named classes are the vocabulary the Grida editor uses by default. The host writes a compact binding class around `@grida/hud` that calls one setter per active named class per logical "thing" being edited. HUD does not try to _be_ the binding class — that's the god-class trap.

The hard rule that prevents god classes: **a named class is defined by its model, not its chrome.** Padding (4 side numerics), corner-radius (4 corner radii), resize-box (rect mutation), size-meter (display-only) all share "a rect" as their target — they are four classes, not features of one. If two candidates share a model and only differ visually, they are one class with a style/feature axis.

### Tier 2 — Primitives (the open building blocks)

Two kinds of code live in `primitives/`, with different audiences:

- **Genuinely-Tier-2 atoms** — un-opinionated, externally-consumable building blocks. The draw vocabulary (`HUDRect`, `HUDPaint`, `HUDPolyline`, `HUDScreenRect`, `HUDMarker`, paint primitives), the hit-priority infrastructure, the cursor renderer protocol. External consumers building editors that don't fit any named class compose against these.

- **Class-bound math factored out of a class** — `reduceTransformBox`, corner-radius geometry, parametric-handle math. These live in `primitives/` for code organization (one file per math domain, pure-function tests without mounting the chrome), but their closure of valid actions IS the chrome's gesture grammar. An external consumer cannot use `reduceTransformBox` without re-implementing the transform-box chrome around it. They are not Tier 2 in the audience sense — they are class-bound implementation details that happen to live alongside Tier 2 atoms.

When auditing whether a new module belongs in `primitives/` vs. `classes/<name>/`, the question is _consumability_: would an external consumer building an unrelated editor use this directly? If yes, Tier 2. If no but the code is pure and reusable by tests, `primitives/` is still its home — but flag it in the module header as class-bound, and don't claim Tier 2 in docs.

### Composition contract

The central guarantee that makes the inhouse pattern work — multiple setters from a compact host binding class targeting the same logical thing via a shared `id` — and the part this package treats as _tested_ (not emergent):

1. Multiple setters may target the same logical thing via a shared `id`. The `id` is an opaque string the host chooses — it is the _composition-time matching key_, not a typed contract. Classes that target different concepts use different field names by convention (`node_id` for scene-node-bound classes; bare `id` for affine-bound classes like transform-box, which can edit non-node things like image fills), but two classes co-target the same logical thing iff the host hands them the same string.
2. `HUDSemanticGroup` + the host's visibility policy gate which classes are active.
3. The SDK owns the priority ladder. It is internal, deterministic, and stable across releases.
4. Any combination of active classes × visibility config × id-sharing pattern produces:
   - A deterministic hover state (highest-priority hit wins, ties broken by declaration order)
   - A deterministic cursor (resolved from hover)
   - Independent intents per class (each class commits to its own field; no shared intent payloads, no implicit coordination)
   - No phantom hits, no flickering hover, no stuck cursor
5. A **co-target test matrix** under [`__tests__/composition/`](./__tests__/composition/) enforces (4). The matrix exists today with the first cell (`padding × transform-box`, 5 assertions); each subsequent class migration adds one row + one column. The full matrix is planned out in [`__tests__/composition/README.md`](./__tests__/composition/README.md); today's coverage is one pair, growing per-migration.

#### Priority overrides — deferred

Per-instance priority bias is currently **unspecified**. `HUDSemanticGroup` + the host's visibility policy is the only host-facing knob for "what shows when." If a real consumer needs to override priority under a specific circumstance, file an issue with the concrete use case; the API choice (closed enum, numeric bias, group-driven) follows the consumer. Until then: no API. This is consistent with the promotion-bar's "two consumers shape the contract" rule.

### Named-class conventions

- **Schema-level feature flags.** Absence of the host's `setX(...)` input is the off-state. No `SurfaceOptions.features.X` booleans to drift.
- **HUD-owned hover and modifier reading.** Hosts push state; HUD owns the live affordance.
- **Host-owned commit.** Intents stream `phase: "preview"` and a final `phase: "commit"`.
- **Anti-goals header per class.** Each named class's surface module enumerates what it deliberately is NOT, in plain English.

### What justifies a new named class

The promotion bar — first match wins, top down. Apply this to every candidate that wants to land as a class (new model, or split-out of an existing module):

1. **Model audit.** Does the candidate share a model (math + gestures + intent payload shape) with an existing class? If yes, **fold** — it is a feature toggle, a style axis, or a binding-target on the existing class, not a new one.
2. **Closed gesture grammar.** Can every interaction be enumerated as a finite (target × gesture × modifier) → intent table, with no open-ended customization slot? If no, it is **host code over primitives**, not a named class.
3. **Two consumers (or one + adversarial demo).** Is the model exercised by ≥2 distinct internal consumers, or by 1 real consumer plus a demo whose binding target differs enough to falsify accidental coupling? If no, **wait** — the contract is not yet shaped; keep it private inside the consumer.
4. **Feature flags are capability flags.** Every flag must name a _capability_ (has padding? supports corner radius?), never a _visual variant_ (color, thickness, dash pattern — those are style tokens). Shape-of-model toggles count as capability (`single radius` vs `4 per-corner radii` is a model-shape difference, so it's a capability — but the class then commits to handling both shapes coherently in one gesture grammar; if it can't, see rule #1).
5. **Stable identity.** One noun. `VectorPath`, not `Path-with-vertices-and-segments-and-regions`. If naming requires a phrase, the model is not yet crisp.

A candidate failing any rule routes to: fold (1), host code (2), wait (3), style token (4), or naming work (5).

### Promotion contract

Every promoted class ships with:

- Public input type declared `@unstable` until rule #3 is satisfied for real.
- Anti-goals header in the class's `surface.ts`.
- Tests under [`__tests__/classes/<name>/`](./__tests__/) covering: feature-flag null-state, hit asymmetry (visible chrome strictly contained in hit region — Fitts'-reach), every gesture in the grammar, every intent variant, hover + cursor mapping, decision-module wiring, equality + snapshot of public types.
- One row in the [co-target test matrix](./__tests__/composition/) per (this-class, other-class) pair that may share an `id`.
- Demo section in `editor/app/(dev)/ui/components/hud/_showcase.tsx` — fixture, host adapter, intent log, every feature toggled, verified off-state.
- One row in the **Named classes** table below.

### Named classes

The table below lists every promoted named class. The package ships them; the host's binding class consumes them.

| Class           | Model                                                                                            | Source                                               | Demo                                               |
| --------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------- |
| `padding`       | 4 side numerics (top/right/bottom/left) committed by side-handle drag, optional alt-mirror       | [`classes/padding/`](./classes/padding/)             | `editor/app/(dev)/ui/components/hud/_showcase.tsx` |
| `transform-box` | 2×3 affine on a unit box, mutated by 4 corners (rotate) / 4 sides (scale) / body (translate)     | [`classes/transform-box/`](./classes/transform-box/) | `editor/app/(dev)/ui/components/hud/_showcase.tsx` |
| `vector-path`   | Path (vertices + segments + tangents + optional regions) under 10 intent variants over one model | [`classes/vector-path/`](./classes/vector-path/)     | `editor/app/(dev)/ui/components/hud/_showcase.tsx` |

**Co-target coverage gap.** The promotion contract above requires one matrix row per `(this-class, other-class)` pair. Today's matrix covers `padding × transform-box` only; `vector-path`'s rows are pending (`vector-path × padding` and `vector-path × transform-box` are both `N/A` per the matrix plan since vector-path cannot share an `id` with rect-bound classes, but the N/A cells should still be marked in the matrix — see `__tests__/composition/README.md`). Tracked as a follow-up; does not block further migrations.

#### Pending migrations

Modules below predate the doctrine and are **candidates** for promotion under the rules above. Each migration is one PR.

| Existing module                                                                                                                | Target                                                                             | Audit status                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `primitives/corner-radius.ts` (chrome path) + `setCornerRadius`                                                                | `classes/corner-radius/`                                                           | pending — chrome currently inline in `surface/surface.ts:778–927`; needs extraction before relocation |
| `primitives/parametric-handle.ts` (chrome path) + `setParametricHandles`                                                       | `classes/parametric-handle/`                                                       | pending — same situation as corner-radius (inline in surface.ts)                                      |
| Selection chrome inside `surface/chrome.ts` (resize handles, rotate handles, selection outline, hover overlay, marquee, lasso) | split per audit into `classes/{resize-box, selection-outline, marquee, lasso, …}/` | deferred — largest single migration; lands last after smaller migrations settle the contract          |

See [`classes/README.md`](./classes/README.md) for the folder convention each migration adopts and the per-module promotion-bar dry-run.

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
surface.setRuler({ enabled, axes?, color?, ranges?, marks?, ... }); // or null to disable
surface.setRulerTransform(t);
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
6. Host-fed extras
7. Ruler strips (when enabled — top + left L-shape, screen-space)

### Substrate vs frame — why pixel grid and ruler sit at opposite ends

The two named viewport chromes — pixel grid and ruler — share the
inlining mechanism (a pure `draw*(ctx, params)` routine over the HUD's
existing context), but they belong to **different paint-order
families**:

- **Substrate (back-most).** Pixel grid is content-space: it lives
  with the document, the user reads it _under_ everything else, and
  its only job is to give content something to align to. Selection
  chrome, marquee, and host extras are what the user is _interacting
  with_; the grid is decoration that informs the interaction. So it
  paints first.
- **Frame (top-most).** Ruler is viewport-space: it frames the editing
  area, the way a window title bar frames a document. The ticks
  reference world coordinates a selection might cross, but the strip
  itself is "outside" the editing surface. A selection outline,
  marquee, or handle that visually escapes into the strip reads as
  broken in the same way a document scrolling under a title bar
  reads as broken. So it paints last — after the pixel grid, after
  surface chrome, and after host extras.

  Every major editor (Figma, Sketch, XD, Illustrator, Affinity,
  OmniGraffle) paints the ruler on top of content chrome. The HUD
  follows that convention. The corner square (`strip × strip` at
  origin) is deliberately left blank — hosts that want to fill it
  draw it via the host-fed extras pass, which sits beneath the
  ruler and is therefore correctly clipped by the strip on top.

  Each strip also paints a **1-px inner-edge separator** early in
  its own pass — right after the background fill, before any range
  accent, mark, or step tick. The line where the strip meets the
  editing area is the universal affordance every editor ships:
  without it the strip visually bleeds into content. Painting it
  beneath the data means a full-strip mark (`strokeHeight: strip`)
  reads as one continuous stroke crossing the strip boundary into
  the canvas guide below — instead of being capped by the separator
  on top. The two roles answer different questions and earn
  different paint slots: the separator is cosmetic chrome ("where
  does the strip end?"), the ticks and marks are data ("what's the
  position?"); chrome below, data above. The separator obeys the
  `axes` filter — `axes: ["x"]` paints only the top-strip separator,
  `axes: ["y"]` only the left-strip separator. The two separators
  meet at right angles inside the corner square; nothing else is
  painted there.

  **Separator color is independent of tick color.** `RulerConfig`
  exposes a separate `borderColor?` token that defaults to `color`
  (the tick color) for backward compatibility, but the two are
  deliberately decoupled. Every production editor (Figma, Sketch,
  XD, Illustrator, Affinity, and our own main editor) paints the
  separator distinctly LIGHTER than the ticks — the ticks must
  read as numerals, the separator only marks the edge. A single
  shared color cannot satisfy both responsibilities. Hosts that
  want the main-editor look should pass a light neutral as
  `borderColor` (e.g. an OKLCH or hex value matching their design
  system's `border` token) while keeping `color` at the standard
  mid-gray for the ticks.

  **Marks (guide positions).** `RulerConfig.marks` accepts per-axis
  arrays of `RulerMark`. A minimal `{ pos }` mark renders as a regular
  step tick — short stroke, label color = the ruler's `color`. The
  extra fields cover the standard guide-position affordance every
  editor ships: a full-strip line with an accent stroke + label color:

  ```ts
  interface RulerMark {
    pos: number;
    /** Tick stroke + (default) label color. */
    color?: string;
    /** Label text. */
    text?: string;
    /** Override the stroke color independently of the label color. */
    strokeColor?: string;
    /** Stroke width in CSS pixels. Default 1. */
    strokeWidth?: number;
    /**
     * Stroke height in CSS pixels. Default `tickHeight`. Pass `strip`
     * (the strip width) for a full-strip mark — the standard
     * guide-position affordance.
     */
    strokeHeight?: number;
    /** Label color. Defaults to `color` if omitted. */
    textColor?: string;
    /** Label alignment. Default "center". */
    textAlign?: CanvasTextAlign;
    /** Label position offset from `pos`. Default 0. */
    textAlignOffset?: number;
  }
  ```

  To paint a guide position the way the rest of the editor renders
  guides — full-strip accent line with a same-colored label — pass
  `strokeHeight: strip` (matching `RulerConfig.strip`, default 20)
  along with an accent `color` / `strokeColor`. Defaults are chosen
  so omitting every field except `pos` keeps rendering identically
  to a step tick — additive, no regressions for existing callers.

  **Drag threshold.** Hosts implementing drag-from-strip to create
  guides should use `DEFAULT_RULER_DRAG_THRESHOLD` (4 px) as the
  minimum pointer-movement distance from pointer-down before
  committing a new guide — without it, a stray click on the strip
  spawns an unwanted guide. The constant is a published recommendation,
  not a runtime gate; hud does not own the gesture.

If a future chrome turns out to be neither a substrate nor a frame,
the right move is to add a new paint slot deliberately — not to
hard-code it next to one of the existing ones by analogy.

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

## Vector regions

A **region** is a closed loop of segments — a "face" of the vector network — that the user can click on to select. The interior fills with a diagonal-stripe pattern on hover; on commit, the same paint at higher opacity reads as the selected affordance. Drag from the interior translates the loop's segments and endpoint vertices.

Region picking is part of the core interaction model for path content-edit on closed sub-paths (without it, the user can't get from "hovering the artwork" to "editing this loop" without aiming at a thin segment outline). But the data — closed-loop enumeration — varies by backend: some hosts derive faces via planar-graph traversal (e.g. `vn.VectorNetworkEditor.getLoops()`); others can't.

**The feature flag is the schema.** Hosts that can enumerate loops populate `VectorOverlay.regions`; hosts that can't omit the field. Absence is the off-state. No separate boolean to keep in sync with the data, no runtime `if (regionsEnabled)` branches — the shape of what the host hands the HUD IS the flag.

```ts
type VectorOverlay = {
  vertices: ReadonlyArray<readonly [number, number]>;
  segments?: ReadonlyArray<{ a; b; a_control; b_control }>;
  neighbours?: ReadonlyArray<number>;
  /** Schema-level feature flag — omit if not supported. */
  regions?: ReadonlyArray<{ segments: ReadonlyArray<number> }>;
  origin?: readonly [number, number];
};
```

Each region names the segment indices forming one closed loop, in traversal order. The HUD reconstructs the cubic path at chrome build time from `vertices + segments[region.segments[i]]` — regions carry no own geometry, so "region equals closed loop of segments" stays a structural truth.

### Selection mirror

Hosts push the host-authoritative region selection through `setVectorSelection({ ..., regions: [N] })`. The field is optional for backward compat — `undefined` is treated as `[]`. The chrome reads it each frame to apply the `selected` paint.

### Hit-test

Region hit-test is **polygon-in-screen-space**: the chrome builder rasterises the cubic loop to N samples per segment and registers a screen-space AABB paired with a `customHitTest` closure that runs `cmath.polygon.pointInPolygon`. Same AABB-plus-refinement model the segment-strip uses — no new geometry primitive in `HitRegions`, no separate doc-space path-hit infrastructure.

### Priority

`REGION_PRIORITY = 9` — strictly above `SEGMENT_STRIP_PRIORITY (8)`, so any vertex / tangent / ghost / segment-strip control within the loop wins on overlap; strictly below the implicit "no overlay → empty-space miss" so an interior click selects the region instead of falling through to the marquee.

### Paint states

| State    | Render                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| idle     | No fill — render omitted entirely. The hit region is registered, but the body is visually transparent.                                       |
| hover    | `doc_polyline` with `fillPaint = style.vectorRegionHoverPaint` (default: `HUDPaintStripes` at 45° / 8px / 1.5px, accent color, 50% opacity). |
| selected | Same shape, `fillPaint = style.vectorRegionSelectedPaint` (default: same stripes at 70% opacity).                                            |

Hover wins over selected — matches the precedence on every other vector overlay (vertex / tangent / segment / ghost knobs).

### Intent

```ts
| { kind: "select_region"; node_id: NodeId; region: number; mode: SelectMode }
```

Eager at pointer-down (parity with `select_segment` on the "not yet in axis-set" branch). Shift toggles, no-shift replaces — the host's commit policy decides whether to also propagate the loop's segments into the sub-selection mirror.

Drag from the region body promotes to the existing `translate_vector_selection` intent (no new translate kind). The HUD seeds `additional_vertex_indices` with the loop's endpoint vertices so the gesture works even before the host echoes the region select back into the sub-selection mirror.

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
├── primitives/                # Tier 2 — un-opinionated draw + math atoms
│   ├── canvas.ts              # HUDCanvas
│   ├── types.ts               # HUDDraw, HUDLine, HUDRect, HUDPolyline, HUDRule, HUDScreenRect
│   ├── pixel-grid.ts          # inlined pure draw routine (sibling: @grida/pixel-grid)
│   ├── ruler.ts               # inlined pure draw routine (sibling: @grida/ruler)
│   ├── snap-guide.ts          # HUDDraw builder
│   ├── measurement-guide.ts   # HUDDraw builder
│   ├── marquee.ts             # legacy HUDDraw builder (surface emits its own marquee)
│   └── lasso.ts               # HUDDraw builder
├── event/                     # the math core (shared dispatch, cross-class)
│   ├── event.ts               # SurfaceEvent, Modifiers, PointerButton
│   ├── gesture.ts             # SurfaceGesture + transitions
│   ├── hit-regions.ts         # screen-space AABB region registry
│   ├── handles.ts             # 8 resize + 4 rotate geometry & hit-test
│   ├── click-tracker.ts       # dblclick / multi-click detection
│   ├── cursor.ts              # CursorIcon, ResizeDirection, RotationCorner
│   ├── intent.ts              # Intent types + builders (unions across all classes)
│   ├── transform.ts           # screen ↔ doc helpers
│   └── state.ts               # SurfaceState — pure dispatch entry
├── classes/                   # Tier 1 — promoted named classes (see classes/README.md)
│   ├── README.md              # folder convention + per-class file layout + promotion-bar dry-run
│   ├── padding/               # migrated from surface/padding-overlay.ts
│   ├── transform-box/         # migrated from surface/transform-box.ts
│   └── vector-path/           # migrated from surface/vector-chrome.ts
├── surface/                   # orchestration only
│   ├── surface.ts             # Surface class — still hosts inline chrome for corner-radius + parametric-handle (pending extraction)
│   ├── chrome.ts              # builds HUDDraw from SurfaceState + shapeOf (pre-migration host of selection chrome — split deferred)
│   └── style.ts               # HUDStyle defaults + merge
├── cursors/                   # opt-in subpath: @grida/hud/cursors
│   ├── index.ts               # cursors.defaultRenderer(), templates, encoder
│   ├── renderer.ts            # CursorIcon → CSS cursor: with rotation-aware SVGs
│   ├── templates.ts           # parameterized SVG cursor templates
│   └── encode.ts              # SVG → data: URL
└── __tests__/
    ├── composition/           # NEW — co-target matrix (see __tests__/composition/README.md)
    └── …                      # per-class tests relocate under __tests__/classes/<name>/ as migrations land
```

The shared dispatcher (`event/state.ts` and friends) stays unified across all classes — hover, hit-test, cursor resolution are _across_ classes. Per-class folders contribute their intent variant + priority constants, which `event/intent.ts` unions over.

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

| Behaviour                                                                                   | Pinned in                                      |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Single-click on unselected node → immediate select                                          | `decision.test.ts`                             |
| Single-click on already-selected node → defer (drag is a live candidate)                    | `decision.test.ts`, `state.test.ts`            |
| Shift-click on selected node → defer (toggle-remove vs drag is ambiguous)                   | `decision.test.ts`                             |
| Click in body region with selection → always defer (drag claim)                             | `decision.test.ts`                             |
| Dblclick on content → emits `enter_content_edit`                                            | `decision.test.ts`, `state.test.ts`            |
| Dblclick on empty space / other node WHILE in content-edit → emits `exit_content_edit`      | `decision.test.ts`, `state.test.ts`            |
| Dblclick on vertex / tangent / segment-strip WHILE in content-edit → handler runs (no exit) | `decision.test.ts`                             |
| Marquee starts from empty-space pointer-down                                                | `state.test.ts`                                |
| Drag past threshold cancels a deferred select (drag-vs-click discriminator)                 | `state.test.ts`                                |
| Tangent knob renders as a 45°-rotated square ("diamond"), smaller than vertex               | `classes/vector-path/surface-extended.test.ts` |
| Vertex knob renders as a circle, selected fills with chrome color                           | `classes/vector-path/surface-extended.test.ts` |
| Selected tangent line is thicker than idle                                                  | `classes/vector-path/surface-extended.test.ts` |
| Segment outline: idle gray → hover @ 50% accent → selected solid accent                     | `classes/vector-path/segment-render.test.ts`   |
| Segment strip emits N inner samples per cubic, t ∈ (0, 1)                                   | `classes/vector-path/surface-extended.test.ts` |
| Priority ladder: tangent (4) < vertex (5) < segment (8)                                     | `classes/vector-path/surface-extended.test.ts` |
| Rotation-aware cursor CSS via `cursors.defaultRenderer`                                     | `cursors.test.ts`                              |
| Click-tracker: single vs double within window + position threshold                          | `click-tracker.test.ts`                        |

### Test file index

| File                                           | Domain pinned by tests                                                                                                                                                                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transform.test.ts`                            | screen ↔ doc across translate, scale, DPR                                                                                                                                                                                                      |
| `hit-regions.test.ts`                          | topmost wins, reverse iteration, clear/empty, AABB containment                                                                                                                                                                                 |
| `handles.test.ts`                              | 8 resize + 4 rotate positions; screen-space hit-test; visibility threshold                                                                                                                                                                     |
| `click-tracker.test.ts`                        | single vs double within window; position threshold; multi-button isolation                                                                                                                                                                     |
| `gesture.test.ts`                              | legal transitions (idle↔translate/resize/marquee/cancel; deferred selection)                                                                                                                                                                   |
| `state.test.ts`                                | dispatch sequences: click selects, drag-empty marquees, drag-handle resizes, drag-node translates, exit-edit                                                                                                                                   |
| `intent.test.ts`                               | intent stream + `phase` correctness across a full drag (preview·N → commit)                                                                                                                                                                    |
| `decision.test.ts`                             | one test per named scenario in the selection-intent classifier, including ExitEdit gating                                                                                                                                                      |
| `chrome.test.ts`                               | given state + bounds, assert resulting `HUDDraw` shape — primitive counts and coords                                                                                                                                                           |
| `chrome-transformed.test.ts`                   | `SelectionShape.transformed` end-to-end                                                                                                                                                                                                        |
| `chrome-priority.test.ts`                      | overlay priority ladder over scenarios                                                                                                                                                                                                         |
| `cursors.test.ts`                              | `cursors.defaultRenderer` produces rotation-aware CSS values; tree-shake invariant                                                                                                                                                             |
| `classes/vector-path/surface.test.ts`          | vector chrome baseline: vertex emission, neighbouring filter, hit-region pad                                                                                                                                                                   |
| `classes/vector-path/surface-extended.test.ts` | vector chrome UX: tangent diamond shape + size, selection highlight, priority ladder                                                                                                                                                           |
| `classes/vector-path/segment-render.test.ts`   | segment outline state machine: idle / hover / selected styling                                                                                                                                                                                 |
| `classes/vector-path/region.test.ts`           | vector regions: closed-loop fill (idle / hover / selected), polygon hit-test, REGION_PRIORITY ladder                                                                                                                                           |
| `classes/vector-path/gesture.test.ts`          | vector-specific gesture state machine: tangent drag, segment-strip click→split, drag→bend                                                                                                                                                      |
| `classes/padding/surface.test.ts`              | padding overlay: per-side rect geometry, mirror handles, hover stripe / drag outline, priority ladder                                                                                                                                          |
| `classes/transform-box/surface.test.ts`        | transform-box chrome: quad corners, side strips, body translate, cursor rotation, container-rotation de-rotation                                                                                                                               |
| `ruler.test.ts`                                | inlined ruler draw routine: layout helpers (step / subtick / range-merge), drawRuler call sequence, HUDCanvas wiring (setRuler/setRulerTransform, substrate-vs-frame paint-order: ruler top-most over chrome and extras, pixel-grid back-most) |

Render output (visual canvas correctness — paint order, anti-aliasing, the
actual pixel result) is verified in the browser, not unit-tested. Every UX
_behaviour_ is.

## Extending the HUD

The HUD intentionally exposes no generic "register a painter" or "register a
layer" API (see Anti-goals — "Not a host of plugins"). Three paths cover real
needs, in this order of preference:

1. **Named built-in chrome.** Things every Grida editor wants — pixel grid,
   ruler, selection, snap guides, measurement — live inside this package
   as first-class features with their own toggles (e.g. `setPixelGrid`,
   `setRuler`, `setStyle`, the chrome built from `SurfaceState`). New
   canonical chrome lands here; open a PR against `@grida/hud`.

   Inlined chrome carries an explicit synchronisation contract: each
   inlined primitive (`primitives/pixel-grid.ts`, `primitives/ruler.ts`,
   …) documents its upstream sibling in a header comment. Bug fixes must
   land on both sides. The bar for inlining a new chrome is that it
   resolves into a single pure draw routine over an existing context —
   anything that wants to own its own canvas, its own DPR, or its own
   stateful renderer class belongs in a sibling package the host mounts,
   not here. See "Not a renderer" under Anti-goals.

2. **Host-fed `HUDDraw` extras.** Pass extra primitives into `surface.draw(extra)`
   per frame. Best for transient, gesture-coupled overlays the host already
   computes (measurement lines, custom snap visualizers). Drawn on top of the
   substrate-band and content-band chrome (pixel grid, selection, marquee,
   handles, size meter) but **beneath the frame-band chrome** (ruler). If a
   host extra is meant to occupy the ruler strip (a corner-square fill, a
   ruler-strip widget), draw it as an extra and let the ruler clip the
   bleed — don't try to paint above the ruler. The HUD reserves the right
   to add more frame-band chrome later; hosts should not build patterns
   that depend on extras being the absolute top layer.

3. **DOM-level escape hatch.** The host owns the container element; the surface
   only inserts the SVG and the HUD canvas. Hosts that need a non-canvas overlay
   (HTML toolbar, popover, debug widget) can splice their own DOM into the
   container directly. Deliberate escape hatch — reach for it only when (1) and
   (2) don't fit, and prefer pushing canonical needs into (1) over keeping them
   here.

## Anti-goals

- **Not a renderer.** `primitives/HUDCanvas` is intentionally minimal Canvas2D. Skia / WebGL backends are not in scope. Inlined chrome (pixel grid, ruler) must reduce to a single pure draw routine over the existing ctx — no nested canvases, no stateful renderer classes, no internal DPR ownership. Anything heavier belongs in a sibling package the host mounts. Incremental affordances inside an existing inlined routine (e.g. the ruler's inner-edge separator) are fine when they share that routine's transform and state; they are not the same as introducing a new renderer.
- **Not a scene graph.** Surface never reads node data — only via `pick` / `shapeOf`.
- **Not a host of plugins.** No widget registry. Custom HUD elements go through host-fed `HUDDraw` extras.
- **Not a kitchen of decorative-line helpers.** The `*GuideToHUDDraw` family (`snapGuideToHUDDraw`, `measurementToHUDDraw`) exists to translate _rich cmath domain structs_ — `SnapGuide`, `Measurement` — into multi-element draw lists where the layout rules are the work. They are not, and must not become, thin aliases for "produce one primitive of a named flavor." If an affordance is `{ one HUDLine | HUDRect | HUDPoint } + { color }` over geometry that already lives elsewhere, the host composes it directly. Worked example: the aspect-ratio guide (a single dashed `HUDLine` whose endpoints come from an 8-case `CardinalDirection` table) lives entirely outside this package — the geometry is `cmath.ui.diagonalForDirection`, the render is one host-side object literal. Refusing the alias keeps the public surface narrow and the promotion bar honest.
- **Not undo-aware.** Intents carry `phase`; host owns undo.
- **Not a selection store.** Host owns selection; surface mirrors.
- **Not SVG-aware.** No `data-id`, no DOM IR, no `<style>` resolution.
- **Paint kinds: closed taxonomy, not open registry.** `HUDPaint` is a discriminated union HUD ships (`solid`, `stripes` today). Adding a kind requires a HUD PR with ≥2 internal consumers shaped — same promotion contract as any new primitive. There is no runtime registration of paint kinds; a future `bitmap` (host-rasterized escape hatch) is the only deliberate widening on the table, and it lands only when a real second consumer asks. Built-in kinds are HUD-owned: HUD chooses rasterization quality and zoom behavior; hosts pass theming (`color`) and dimension knobs only. The chrome design language lives inside this package, not at runtime in the host.
- **Not a paint compositor.** One paint per fill, one paint per stroke. No layered fills, no blend modes between paints on the same primitive — if a host wants stacking, they emit two primitives.
- **No paint on labels.** `HUDLine`'s label pill + text intentionally stay on the legacy `color` path. Labels are theming surface, not paintable design-language surface; promoting them to accept `HUDPaint` would invite per-label patterned chrome that doesn't match anything the editor actually wants.

## Adoption

v1 ships against [`@grida/svg-editor`](../grida-svg-editor/). The svg-editor's `dom.ts` is rewritten as a thin adapter: SVG content on the bottom layer, a `<canvas>` HUD on top, pointer events forwarded to `surface.dispatch`, intents flowing back via `editor.commitIntent`. Selection chrome, handles, and gesture state move out of `dom.ts` entirely.

Main-editor migration (`editor/grida-canvas-react/viewport/ui/*`) is tracked separately. The host contract is the same; the only difference is the `pick` implementation (scene-cache R-tree instead of `elementFromPoint`+`data-id`).
