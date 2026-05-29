# `primitives/` — doctrine

> **At a glance.** Agnostic value types, agnostic descriptors, and one
> agnostic interface (`Painter`). No class knowledge. No DOM. No
> lifecycle. Consumers construct these literally — they are the alphabet
> the HUD speaks in.

## Role

`primitives/` is the **value-type layer**. Everything here describes
either **what to paint** (drawing descriptors), **what can be hit**
(`HitShape`), **what one HUD entity looks like** (`HUDObject`), or
**how a backend paints** (`Painter`). Nothing here mutates persistent
state across calls (with the bounded-cache exception below), nothing
holds class-specific knowledge, nothing reaches into the renderer.

It sits between `core/` (the engine substrate that consumes these
values) and `classes/<name>/chrome.ts` (the opinionated drawers that
emit these values for a specific named class).

```
classes/<name>/chrome.ts  ← opinionated; emits primitives
primitives/               ← agnostic; the vocabulary  ←─ you are here
core/                     ← engine; consumes primitives via HitRegistry
                            and (eventually) the deferred orchestrator
```

## What is accepted

A file belongs in `primitives/` iff it satisfies **all** of:

1. **No knowledge of any specific HUD class.** No `ruler`,
   `corner-radius`, `selection`, `vector-path`, etc. in its names,
   types, or behavior. Adding such a name is the test that the file
   belongs in `classes/<name>/` instead.
2. **No persistent state across calls.** Either a pure type (e.g.
   `HUDDraw`), a pure function (e.g. `filterHUDDrawByGroup`), or one
   of the two bounded-cache exceptions documented below.
3. **No DOM, no framework, no global side-effects.** Imports allowed
   from: `@grida/cmath` (and its submodule paths) and sibling
   `primitives/*` files only. Enforced by
   [`__tests__/api/import-graph.test.ts`](../__tests__/api/import-graph.test.ts).
4. **No registry, no extension API.** Hosts compose by constructing
   values; primitives never expose `register*` methods.

## What is NOT accepted

- **Opinionated chrome drawers** (`drawRuler`, `drawCornerRadius`,
  `drawParametricHandles`, `drawPixelGrid`). They know what a ruler /
  corner-radius is — they belong in `classes/<name>/chrome.ts`. They
  **still co-locate under `primitives/` today** (`ruler.ts`,
  `corner-radius.ts`, `parametric-handle.ts`, `pixel-grid.ts`), flagged for
  relocation in a follow-up. The bedrock layering test scopes itself to the
  new bedrock files (see Verification) precisely so these legacy drawers do
  not pass as bedrock during the interim.
- **State machines** (gesture FSM, click classifier). These belong in
  `core/`.
- **Class-aware setters on `Painter`** (`setRuler`, `setCornerRadiusHandles`,
  `setPixelGrid`, …). Removed from the bedrock `Painter` interface;
  legacy `surface/painter.ts` still carries them for `Surface`'s
  benefit but is not part of the bedrock surface.
- **A general `customHitTest` escape hatch** that lets host code drive or
  _widen_ hit-testing. Non-AABB shapes are first-class `HitShape` variants
  (`screen_circle_at_doc`, `screen_polygon`) instead. The single sanctioned
  exception is `HUDObjectInteractive.refine` — a narrow predicate that may
  only _reject_ a point the shape already matched (it cannot widen a hit). It
  exists for curve-near refinement (a bezier's bbox matched — but is the
  point actually near the curve?) and is documented as such in `overlay.ts`.
- **HTMLElement references.** No `HTMLCanvasElement`, no
  `HTMLDivElement`, no DOM in any file under `primitives/`.

## Highlights — what's actually here

| Group                    | Files                                                                                                 | What they are                                                                                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Published barrel**     | `bedrock.ts`                                                                                          | The curated `@grida/hud/primitives` entry point. Re-exports ONLY layer-clean value types (overlay, painter, cursor, drawing-descriptor types) — never the legacy drawers. Distinct from `index.ts` (the internal barrel that still carries them). |
| **The canonical object** | `overlay.ts`                                                                                          | `HUDObject<I>` discriminated union (paint-only or interactive), `HitShape` (5 variants), `RenderShape`. Bedrock invariant: `(render ∨ hit)` enforced by the union.                                                                                |
| **Backend contract**     | `painter.ts`                                                                                          | `Painter` interface — 4 methods: `beginFrame`, `setTransform`, `draw`, `endFrame`. No class knowledge.                                                                                                                                            |
| **Drawing descriptors**  | `types.ts`                                                                                            | `HUDDraw`, `HUDPaint`, `HUDRect`, `HUDLine`, `HUDRule`, `HUDPoint`, `HUDPolyline`, `HUDScreenRect`. Type-only.                                                                                                                                    |
| **Paint resolver**       | `paint.ts`                                                                                            | Pure resolver from `HUDPaint` to CSS string / `CanvasPattern`. _Has a bounded module cache_ of stripe-tile patterns (see below).                                                                                                                  |
| **Cursor types**         | `cursor.ts`                                                                                           | `CursorIcon`, `cursorToCss`, `cursorEquals`, `angleBucket`. Pure.                                                                                                                                                                                 |
| **Geometry helpers**     | `transform-box.ts`                                                                                    | Pure 2×3 affine reducer. Future candidate for promotion to `@grida/cmath`.                                                                                                                                                                        |
| **Per-frame converters** | `lasso.ts`, `marquee.ts`, `snap-guide.ts`, `measurement-guide.ts`                                     | Pure functions mapping host data into `HUDDraw`.                                                                                                                                                                                                  |
| **Group filter**         | `draw.ts`                                                                                             | One pure function: `filterHUDDrawByGroup`.                                                                                                                                                                                                        |
| **Legacy / deferred**    | `canvas.ts`, `projection.ts`, `ruler.ts`, `corner-radius.ts`, `parametric-handle.ts`, `pixel-grid.ts` | Carry imports from `event/` or class-specific knowledge. Out of scope for the bedrock layering test; targeted for relocation to `classes/<name>/`.                                                                                                |

## Patterns

### Constructing a `HUDObject` (paint-only)

```ts
import type { HUDObject } from "@grida/hud/primitives";

const watermark: HUDObject = {
  priority: 100,
  render: {
    kind: "doc_rect",
    x: 0,
    y: 0,
    width: 200,
    height: 50,
    fill: true,
    fillOpacity: 0.1,
  },
  // hit, intent, cursor — forbidden on paint-only; TS rejects them.
};
```

### Constructing a `HUDObject` (interactive)

```ts
type MyIntent = { kind: "my:select"; id: string };

const knob: HUDObject<MyIntent> = {
  group: "my-class",
  priority: 10,
  hit: { kind: "screen_circle_at_doc", anchor_doc: [50, 50], radius: 8 },
  render: {
    kind: "screen_rect",
    anchor_doc: [50, 50],
    width: 8,
    height: 8,
    shape: "circle",
    fill: true,
  },
  intent: { kind: "my:select", id: "knob-1" },
  cursor: "pointer",
};
```

### Bounded module caches — `paint.ts`

`paint.ts` carries a module-level cache because its pure-from-outside
contract still requires expensive work inside (raster stripe-pattern
generation). The discipline:

- The cache is **content-addressed** — same input always returns the
  same output. From the caller's perspective the function is pure.
- The cache is **bounded** (key space is the canonical paint config
  bucket × DPR bucket × zoom bucket; finite by construction).
- The cache is **invisible** — no exported API to inspect, clear, or
  resize it.
- Adding a new module-level cache requires the same discipline OR a
  PR justifying why this primitive can't be pure.

### When to add a new primitive

Walk the deciding table (see [`.claude/skills/sdk-design/SKILL.md`](../../../.claude/skills/sdk-design/SKILL.md)):

| Question                                                    | If yes →                                                                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Does the new shape carry knowledge of a specific HUD class? | Not a primitive — goes in `classes/<name>/chrome.ts`.                                                                                   |
| Does it hold state between calls?                           | Not a primitive (unless bounded-cache exception applies) — goes in `core/`.                                                             |
| Does it touch DOM, framework, or backend?                   | Not a primitive — goes in `painters/<backend>.ts` (when that directory exists).                                                         |
| Does it have ≥2 internal consumers shaped against it?       | Yes — promote to a typed primitive with a JSDoc invariant.                                                                              |
| Otherwise                                                   | One internal consumer + speculative second → keep it inside the consumer's file until a second materializes (sdk-design promotion bar). |

## Verification

- `pnpm turbo test --filter=@grida/hud` runs the bedrock invariant tests:
  - `__tests__/api/bedrock-invariants.test.ts` pins `HUDObject` variants, `HitShape` coverage, `Painter` interface shape, `HitRegistry` priority behavior.
  - `__tests__/api/import-graph.test.ts` walks the full transitive closure of the two published bedrock entry points (`core/index.ts` → `@grida/hud/core`, `primitives/bedrock.ts` → `@grida/hud/primitives`), following `import` and `export … from` re-exports, and asserts every reachable file imports only `@grida/cmath` and sibling bedrock files — no `classes/`, `surface/`, or `event/`. Because it follows re-exports, a barrel that re-exports a legacy cross-layer drawer is caught (which is why `primitives/bedrock.ts` is curated separately from `primitives/index.ts`).

## Anti-goals

The defensive perimeter for this layer specifically (the package-level anti-goals are in the top-level `README.md`):

- **Not a render engine.** `primitives/` describes paint; concrete drawing happens in `painters/<backend>.ts` (deferred). `HUDCanvas` (legacy) is the only painter that ships today and is flagged for relocation.
- **Not a host of plugins.** No registration API. Consumers compose by constructing values, not by registering them with a primitive.
- **Not a backwards-compat shim.** When `painters/canvas2d.ts` ships, `primitives/canvas.ts` is deleted, not maintained.
