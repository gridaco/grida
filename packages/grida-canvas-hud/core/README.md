# `core/` — doctrine

> **At a glance.** The engine substrate. State machines, registries,
> classifiers. Each module is independently testable, headlessly, with
> no class knowledge and no master orchestrator.

## Role

`core/` is the **engine layer** — the mechanism modules every HUD-based
editor needs but cannot reasonably implement itself: a multi-click
classifier, a hit registry, a generic name-keyed registry, screen↔world
helpers, the synthesized input vocabulary. State machines that hold
state across calls live here; pure functions over those state machines
also live here.

It sits below `primitives/` (which `core/` may import from) and below
`classes/<name>/` (which import from both). It does NOT sit below an
"orchestrator" — there is no master class today. The orchestrator that
would wire `HitRegistry`, `ClickTracker`, and the future
`GestureFsm` + `DecisionMechanism` into a single dispatch loop is
deferred until `classes/<name>/` produces its second consumer (the
sdk-design promote-on-dogfooding gate).

```
classes/<name>/              ← consumes core mechanisms
primitives/                  ← value-type alphabet
core/                        ← state machines + registries  ←─ you are here
@grida/cmath                 ← geometry math (separate package)
```

## What is accepted

A file belongs in `core/` iff it satisfies **all** of:

1. **No knowledge of any specific HUD class.** Grep the file for
   `selection`, `ruler`, `corner-radius`, `padding`, `vector-path`,
   `transform-box`, `parametric-handle`, `pixel-grid` — these names
   must not appear. Adding any is the signal the file is mis-layered.
2. **Generic over consumer intent.** Types that propagate intent
   (e.g. `HitRegistry<I>`, `HUDObject<I>`) treat `I` opaquely; the
   bedrock never narrows `I` to a closed union.
3. **Independently testable.** Each module has a unit test that
   constructs an instance, exercises it, and asserts behavior — with
   no import from `surface/`, `classes/`, or any DOM.
4. **One concern per file.** A `ClickTracker` is one class; a
   `HitRegistry` is one class. No god-object that combines multiple.
5. **Imports allowed.** `@grida/cmath` and sibling `primitives/*` only.
   No reach into `classes/`, `surface/`, or `event/`. Enforced by
   [`__tests__/api/import-graph.test.ts`](../__tests__/api/import-graph.test.ts).

## What is NOT accepted

- **An orchestrator class.** No `HUDCore`, `Engine`, or anything that
  owns a `Painter` + multiple mechanisms + a frame loop. That's a
  shell, and shells go above `core/`. The deferred orchestrator's
  destination directory is not yet chosen; it is NOT `core/`.
- **Extension API surfaces.** No `registerScenario`,
  `registerGestureKind`, `setObjects`, `registerClass`. These are
  speculative against zero consumers and forbidden by the sdk-design
  promote-on-dogfooding rule.
- **Class-specific scenario tables.** The legacy `event/decision.ts`
  bundles a generic singleton-vs-ambiguous discriminator with a
  1,329-LOC table of named scenarios (`BodyAddOrDrag`,
  `ContentReplace`, …). The discriminator mechanism alone is bedrock;
  the scenarios are opinions belonging to `classes/<name>/`. The
  carve-out is deferred (see below).
- **DOM, framework, backend coupling.** Nothing here touches
  `HTMLElement`, `requestAnimationFrame`, React, or `<canvas>`.

## Highlights — what's actually here

| File                                     | LOC | What it is                                                                                                                                                                       | Stateful?                                                |
| ---------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`event.ts`](./event.ts)                 | 76  | `HUDEvent` discriminated union (`pointer_down`/`pointer_up`/`pointer_move`/`wheel`/`key`/`modifiers`/`blur`), `Modifiers` snapshot, `PointerButton`.                             | No — pure types.                                         |
| [`click-tracker.ts`](./click-tracker.ts) | 83  | `class ClickTracker` — counts consecutive clicks within a 250 ms / 5 px window. Canvas-tuned (the OS-default 500 ms makes every single-click hesitate).                          | **Yes** — `last_time`, `last_x/y`, `count`.              |
| [`transform.ts`](./transform.ts)         | 47  | `Transform` alias for `cmath.Transform`, plus `screenToDoc`, `docToScreen`, `zoomOf`. Axis-aligned (scale + translate only) — no rotation at the camera level.                   | No — pure functions.                                     |
| [`registry.ts`](./registry.ts)           | 91  | `class NamedRegistry<K, T>` — name-keyed store with insertion order + `detach()` lifecycle on unregister/clear. `RegistrationError` for duplicate names.                         | **Yes** — `byName` Map + `order` array.                  |
| [`hit-registry.ts`](./hit-registry.ts)   | 224 | `class HitRegistry<I>` storing `HUDObject<I>`, plus pure `shapeContains(shape, point, transform)`. Lower priority wins; paint-only objects (no `hit`) are filtered from queries. | **Yes** — `items` array. `shapeContains` itself is pure. |
| [`index.ts`](./index.ts)                 | 42  | Re-exports the bedrock surface. Documents the deferred mechanisms (`gesture-fsm.ts`, `decision.ts`).                                                                             | n/a                                                      |

## Patterns

### Constructing a `HitRegistry` and querying

```ts
import { HitRegistry, IDENTITY } from "@grida/hud/core";

interface MyIntent {
  kind: "my:select";
  id: string;
}

const reg = new HitRegistry<MyIntent>();

reg.add({
  priority: 1,
  hit: { kind: "screen_aabb", rect: { x: 0, y: 0, width: 10, height: 10 } },
  intent: { kind: "my:select", id: "a" },
});

const hit = reg.queryPoint([5, 5], IDENTITY); // → returns the object
// hit.intent is typed `MyIntent | undefined`.
```

### Generic over intent type

`HitRegistry<I>` and `HUDObject<I>` propagate `I` unchanged. The
bedrock never inspects `intent` — that's the consumer's contract:

```ts
// Selection's intent type
type SelectionIntent =
  | { kind: "selection:translate"; ids: string[] }
  | { kind: "selection:resize"; ids: string[]; direction: ResizeDirection };

const selectionRegistry = new HitRegistry<SelectionIntent>();
// queryPoint returns HUDObject<SelectionIntent> | null
```

### One mechanism per file

`ClickTracker` and `HitRegistry` are siblings — neither knows about
the other. A consumer that wants both holds both:

```ts
class MyConsumer {
  private clicks = new ClickTracker();
  private hits = new HitRegistry<MyIntent>();
  // …
}
```

This is the "no god-object" rule. The deferred orchestrator can hold
both as fields, but it MUST NOT subsume their public APIs.

## Deferred bedrock work

These are recognized as bedrock but **not yet shipped**, with reason:

- **`core/gesture-fsm.ts`** — gesture state-machine mechanism (idle /
  pending / drag, drag-threshold discriminator). The legacy
  `event/gesture.ts` (518 LOC) bundles the mechanism with class-
  specific gesture kinds; the carve waits on the orchestrator design
  to know what hook shape sub-gestures need.
- **`core/decision.ts`** — decision-tree mechanism (singleton-vs-
  ambiguous classifier, deferred-commit pipeline). The legacy
  `event/decision.ts` (1,329 LOC) bundles the mechanism with the
  scenario table; the carve waits on three real scenarios being
  walked through the proposed interface (pedantic-review finding).

Until these land, every concrete HUD experience in the editor still
runs through the legacy `event/` + `surface/` stack. Bedrock is
plausibly correct but ungrounded — see the stability banner in the
top-level [`README.md`](../README.md).

## Verification

- `pnpm turbo test --filter=@grida/hud` runs:
  - `__tests__/api/bedrock-invariants.test.ts` — `HitRegistry` priority + paint-only filter + `shapeContains` variant coverage.
  - `__tests__/api/import-graph.test.ts` — walks the transitive closure of BOTH published bedrock entries (`core/index.ts` → `@grida/hud/core`, `primitives/bedrock.ts` → `@grida/hud/primitives`), following re-exports, and fails on any cross-layer or unresolved import.

## Anti-goals

- **Not a god-object.** No file in `core/` orchestrates the others.
- **Not a plugin host.** No `register*` extension API ships in `core/`.
- **Not class-aware.** Grep for HUD-class names returns zero hits.
- **Not a renderer.** The `Painter` interface lives in `primitives/`; `core/` consumes it via the deferred orchestrator, never directly today.
