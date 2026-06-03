# @grida/svg-editor

Grida SVG Editor is a **clean** SVG editor. Experimental.

## What "clean" means

Open an SVG file, edit it, save it. The diff should be exactly the change you made — nothing more.

Most editors don't do this:

- **Adobe Illustrator** saves files wrapped in its own `<switch>` / `<foreignObject>` / `<i:pgfRef>` scaffolding, converts circles to four-cubic-Bézier paths, stamps elements with generated classes (`.st0`, `.st1`) and ids (`SVGID_1_`), and emits coordinates at eight decimals of precision.
- **Inkscape** injects its own namespace metadata (`sodipodi:namedview`, `inkscape:version`, `inkscape:groupmode`, ...) on every save, and reformats whitespace, attribute order, and `<defs>` ordering even when nothing was changed.
- **AI agents** that read and rewrite SVG produce wildly variable output and have no shared discipline for what to preserve.

These tools all _render_ the file correctly. They just leave the markup in a state where the next editor — or the next AI pass, or `git diff` — can't tell what actually changed.

A clean editor:

1. **Round-trips by default.** Open + save without edits → byte-equal output. Comments, whitespace, attribute order, and even legacy or unknown-namespace attributes survive verbatim.
2. **Mutates minimally.** Change one attribute on one element → one attribute's worth of diff. Nothing else moves.
3. **Adds no proprietary noise.** No editor-specific namespaces. No invented ids or classes. No reflow of unrelated nodes.
4. **Is honest about its scope.** SVG is full of constructs that can't be edited cleanly in a graphical UI (cascading CSS, SMIL animation, `<switch>` language branches, foreign-namespace content). The editor preserves them, surfaces them, and refuses to mutate them rather than silently mishandling them.

## Why this matters

The world is moving toward AI-native authoring formats — HTML, CSS, SVG — because they're what large language models read and write fluently. As that shift accelerates, the bottleneck isn't generation. It's _collaboration_: humans and AI editing the same files, in the same repos, taking turns.

Real collaboration requires editors that don't fight the file. Today, none of the obvious options do:

- Illustrator and Inkscape were built as authoring tools, not collaboration tools. They round-trip badly because nothing in their design rewards round-trip fidelity.
- AI agents produce text but have no stable, shared notion of "minimal change."
- Figma, Sketch, and Grida-native treat SVG as import/export. The native IR is private; SVG is a foreign format on both ends.

The result is that every round trip damages the file, every commit produces a noisy diff, and AI's next pass conflicts with the editor's last save. Trust erodes. Co-editing becomes unworkable.

This problem is hard for a real reason. SVG was designed to be hand-authored. It supports CSS cascades, scripted animation, foreign-namespace metadata, embedded fonts, and dozens of features that are coherent for a human writer but actively hostile to a canonical editor IR. Most editors solve this by ignoring or normalizing those features — at which point they're no longer editing SVG, they're editing their interpretation of it.

Grida SVG Editor takes the opposite stance: **the file is the source of truth, and the editor's job is to honor it.**

## Paradigm

The public surface is **narrow and stable**: one editor object, a finite command vocabulary, a designed observation API, and a small set of provider hooks. The internal architecture is **composite by necessity** — SVG has ~20 element types with genuinely distinct edit semantics, so per-element capability modules exist, but they are not exported.

The defaults are inverted from how most editor SDKs grow. Default is **core, not customizable**. A new capability is core unless three things are true: customizing it doesn't violate the round-trip invariant, it is genuinely a host concern, and there is no view of the editor's state that would let a consumer build it themselves.

The consumer is expected to bring their own UI for everything outside the canvas: toolbar, property panel, layer list, inspector, contextual menus, modals. The editor's job is to be a legible source of state and a legible sink for commands — not to render those surfaces.

### Element IR (internal)

Internally, the editor wraps the parsed SVG in a **typed element IR**: a per-node typed view with element-typed capabilities (`is_resizable`, `is_rotatable`, `accepts_paint`, …), typed geometry mutators, and an explicit `RefusalReason` enum for unsupported operations. Commands dispatch on capability, not on element tag. Round-trip invariants the bytes alone cannot enforce — for example, "an editor-authored `rotate(θ cx cy)` recomposes its pivot when the local box changes" — are IR invariants enforced inside the mutator methods.

The IR is a **typed view, not alternative storage**. The parsed AST remains the in-memory store; file bytes remain the source of truth; the parse-side source-position trivia store carries whitespace, attribute order, and unknown-namespace content. The IR is rebuilt from the AST on every load and discarded on `dispose`. P1 round-trip stands.

This is consistent with the "Not a private IR" anti-goal below — that anti-goal rejects alternative on-disk format and bytes-projected-from-IR storage, neither of which this is. Design: [`docs/wg/feat-svg-editor/element-ir.md`](https://grida.co/docs/wg/feat-svg-editor/element-ir). The phased migration sketch lands with the implementation slice.

### Defined terms

The editor's design docs use capitalised terms with precise meanings. The one most often referenced in everyday review:

- **[Policy Class](https://grida.co/docs/wg/feat-svg-editor/glossary/policy-class)** — the minimal partition of editable elements such that every editing intent admits the same set of legal solutions within a class. `<circle>` and `<ellipse>` are different Policy Classes because their resize solution spaces fork differently, even though both are conics. The unit at which a host's policy decision (refuse / native / promote / via-transform) maps onto. When a design discussion asks "should X and Y be treated the same?" — apply the Policy Class fork test, not authoring intuition.

Full glossary: [`docs/wg/feat-svg-editor/glossary/`](https://github.com/gridaco/grida/tree/main/docs/wg/feat-svg-editor/glossary/).

## Principles

These are decision rules, not aspirations. Each one points to a verdict when "is this core, customizable, or its own layer?" comes up in review.

### P1. The file format is sovereign.

Any decision that, if customized, would let a consumer corrupt round-trip fidelity, emit proprietary noise, or silently lose preserved metadata is core. Customization is not an option.

### P2. Customize only what the host genuinely owns.

A small, named set of concerns belongs to the embedding product: clipboard, file IO, font resolution, the rendering surface, the HUD chrome style, locale. These are provider hooks at construction (or attached afterwards, in the surface's case). Everything else is editor-decided.

### P3. Per-element semantics are internal architecture, not extension points.

`<rect>`, `<path>`, `<text>`, `<use>`, etc. require modular code organization because they share no edit semantics. They do not require a public registry. The SVG spec is the registry; we implement against it.

### P4. Subscribe to outcomes, not events.

The public observation surface is **designed**, not raw. It exposes purpose-built views — `selection`, `properties(names)`, `mode`, `tree`, `dirty`, `version` — each of which handles multi-selection, capability variance, and history bookkeeping internally. Consumers never receive raw pointer events, reducer actions, or gesture frames. If a needed view doesn't exist, that's an API gap to close, not an internals hatch to open.

### P5. A separate layer earns its separateness by reuse or isolated testability.

Code becomes its own package or layer when it has ≥2 callers, or can be meaningfully tested without mounting the editor. `@grida/history`, `@grida/cmath`, `@grida/text-editor`, `@grida/mixed-properties` pass. A hypothetical `@grida/svg-selection-model` (one caller, untestable without an editor) doesn't.

### P6. Public only after dogfooding.

Internal seams stay internal until ≥2 internal consumers have shaped the contract. The default direction of pressure is inward, not outward.

### The deciding table

When a new design decision lands, walk these in order. The first match wins.

| Question                                           | If yes →                                | Why                         |
| -------------------------------------------------- | --------------------------------------- | --------------------------- |
| Would customization violate P1 (file sovereignty)? | **Core**, non-customizable              | Editor owns the invariant   |
| Is this a host-owned concern per P2?               | **Customizable** via provider           | Host knows what we can't    |
| Is this per-element edit semantics?                | **Internal seam** (P3)                  | Code organization, not API  |
| Does it pass P5 (reuse or isolated tests)?         | **Separate layer**                      | Earned its separation       |
| Otherwise                                          | **Core**, internally modular if complex | Default-in, not default-out |

## Approach

These are the design principles guiding the implementation.

- Built as an SDK, not an app. Headless, backend-agnostic — no DOM or window assumptions in the core. Plug into any rendering surface.
- The IR carries source-position trivia, so the serializer can rewrite only the bytes that actually changed.
- Per-element-type capability modules (rect, circle, path, text, group, use, ...) contribute intent handlers, inspector controls, and direct-manipulation overlays into a shared editor shell — internally. The shared shell is what's public.
- Edit intents are dispatched per `(element type, gesture, mode)`, so each mutation chooses the cleanest in-place representation: rewrite native attributes when the gesture allows it, fall back to `transform=` otherwise.
- A separate, explicit **Tidy** command performs structural cleanup — deduplicate defs, strip dead resources, normalize generated class and id names, recognize geometric patterns. Never silent, never automatic.

The per-element-module and `(element type, gesture, mode)` bullets above describe today's code. The proposed model groups by edit-shape and dispatches on capability — see [Paradigm § Element IR (internal)](#element-ir-internal) and `docs/wg/feat-svg-editor/element-ir.md`. These bullets will be revised when that model lands.

## Examples

A few scenarios this is designed to handle well.

> _"I opened an SVG exported from Illustrator five years ago and nudged a circle 10px to the right."_
>
> Diff: one attribute. The Adobe wrapper, the `.st0` classes, the dead gradients, and the wrapping identity-matrix `<g>` layers are all untouched.

> _"My AI agent rewrote a logo file. I want to tweak two colors and commit."_
>
> The AI's structural changes round-trip cleanly through the editor. The two color tweaks are the only added lines in the diff. The next AI pass reads a file that still looks like its own work.

> _"I rotated a rect by 12 degrees."_
>
> The editor writes `transform="rotate(12 cx cy)"` on the rect itself. It does not wrap it in a `<g>`, does not collapse to a matrix, and does not touch the rect's `x` / `y` / `width` / `height`.

> _"This SVG has a `<style>` block with `.brand { fill: var(--brand) }`. I want to change the fill of one element to red."_
>
> The editor adds `style="fill: red"` inline on that element, which wins the cascade against the class rule. The stylesheet is untouched. Other `.brand` elements are untouched.

> _"This file has an Inkscape `<sodipodi:namedview>` block and `inkscape:label` attributes."_
>
> Preserved verbatim. Surfaced in a "preserved metadata" panel so the user knows they exist. Never edited; never silently dropped.

> _"This file has a SMIL `<animate>` on a circle's `cx`. I want to move the circle."_
>
> The editor freezes the animation at `t=0` for editing, applies the position change to the static `cx` attribute, and preserves the `<animate>` block verbatim. The inspector shows a clear "animated property" badge so the user understands what they're editing.

## Install

```sh
npm install @grida/svg-editor
```

## API

> **Status of this section.** Names and shapes are a v0 proposal — subject to P6 dogfooding before semver stability. The headings (`commands`, `state`, `properties`, `paint`, `defs`, `tree`, `modes`, `subscribe`, providers, style, surface) are committed; their member names are not. The **multi-selection ("mixed values")** section is explicitly deferred — its shape is sketched as a placeholder, not designed. Signatures shown as TypeScript-ish pseudo-code; some types are simplified for readability.

### Construction

```ts
import { createSvgEditor } from "@grida/svg-editor";

const editor = createSvgEditor({
  svg: "<svg ...>...</svg>",
  providers: {
    clipboard, // optional
    fonts, // optional — font availability + metrics resolver
    file_io, // optional — for "open" / "save as" commands
  },
  style: {
    chrome_color: "#2563eb",
    handle_size: 8,
    // ...style spec, snake_case (see "Style" below)
  },
});
```

`createSvgEditor` is the only **editor** constructor. The returned `SvgEditor` is the only editor instance consumers ever hold. A small set of Layer-A geometry primitives (see [Geometry primitives](#geometry-primitives) below) is also exported for callers that need canonical SVG geometry without mounting an editor — those are not editor instances and have no lifecycle.

The editor core is **headless**. It parses the SVG, owns the document IR, accepts commands, and emits state — but it does not import, reference, or call into `window`, `document`, `HTMLElement`, or any DOM type. To render or take input, the host attaches a `Surface` (next section).

### Geometry primitives

A small set of Layer-A primitives is exported for callers that want canonical SVG geometry without mounting an editor. These are not part of the editor lifecycle, do not subscribe, and do not produce diffs against an `SvgDocument` — they are pure value classes over the bytes you hand them.

#### `PathModel`

Models a single SVG path's vector network for callers that want path geometry without an editor. Construct from a `d` string, observe vertex/segment shape, compute a bbox, serialize back to `d`. No editor, no document, no DOM.

```ts
import { PathModel } from "@grida/svg-editor";

const m = PathModel.fromSvgPathD("M 10 10 L 100 10 L 100 100 Z");
m.vertexCount(); // 3
m.segmentCount(); // 3
m.snapshot(); // { vertices, segments } — POJO
m.bbox(); // { x, y, width, height }
m.toSvgPathD(); // canonical d
```

`@experimental` — the externally-stable contract for v0 is construction (`fromSvgPathD`) plus `snapshot()` / `bbox()` / `vertexCount()` / `segmentCount()` / `toSvgPathD()`. Mutation methods on the class exist for the editor's internal use and are not part of the documented public surface.

### Surface

A `Surface` is the host-provided rendering and input boundary. The shipped `domSurface` is the reference implementation used by the React layer; non-DOM hosts (React Native, worker-side renderer, headless test harness) would implement the same interface — though only one implementation exists today (P6: public only after dogfooding).

```ts
import { attach_dom_surface } from "@grida/svg-editor/dom";

const handle = attach_dom_surface(editor, { container });
// later:
handle.detach();
```

The v0 contract is pure lifecycle:

```ts
interface Surface {
  /** Teardown: detach listeners, drop retained refs. Called from
   *  `editor.detach()` and `editor.dispose()`. */
  dispose(): void;
}
```

What's deliberately **not** part of the contract yet:

- **Paint push.** There is no `paint(snapshot)` channel. The surface re-serializes the document by subscribing to the editor and writing to its own rendering target.
- **Normalized input events.** Input routing is surface-private — the DOM surface attaches pointer/keyboard listeners on its own container and reaches the editor through the in-package `_internal` channel.
- **Hit-testing.** Picking is surface-private: the DOM surface owns its own pointer → node-id resolver against its rendered scene. World-space geometry queries (`bounds_of`, `node_at_point` for non-pointer callers) route through `editor.geometry` instead. A cross-surface `hit_test` contract is deferred until a second surface needs one — its shape (screen vs. world units, z-order tie-breaks, hit-record vs. id) isn't pinned.

Each will become a public seam when a second surface implementation arrives and pins its shape. Until then, exporting `paint(snapshot: unknown)` / `on_input(event: unknown)` / `hit_test(x, y)` would be contracts a foreign implementer cannot honestly satisfy (P6 — public only after dogfooding).

Geometry (world-space bboxes, screen ↔ local projection) is exposed via `editor.geometry`, not the `Surface` itself — the DOM surface registers a `MemoizedGeometryProvider` with the editor on attach so headless callers can query bounds without going through the surface.

`@grida/svg-editor/dom` exports `attach_dom_surface(editor, { container, ... })` as the default DOM implementation, plus the surface-scoped types (`Camera`, `Gestures`, `SnapOptions`, `MemoizedGeometryProvider`, `DomComputedResolver`) that callers writing alternative surfaces or advanced integrations may need. It mounts the SVG into the container, wires pointer / keyboard listeners scoped to that container, and uses native `getBBox` / `getScreenCTM` for geometry. It is the only place in this package that imports DOM types.

The container is **exclusively owned** by the surface. Render toolbars, layer lists, inspectors, and any other interactive chrome as **siblings** of the container, not children. Children of the container interfere with pointer routing (capture redirects, hit-test ordering) and produce silent click breakage. The shipped `SvgEditorCanvas` React component enforces this by creating its own internal div; hosts using `domSurface` / `keynote.attach` directly are responsible for the same discipline. In development, the surface emits a `console.warn` at attach time when the container is non-empty.

**Attention gate.** The DOM surface installs document- and window-level keydown listeners (so a user with focus on a side-panel button can still hit editor shortcuts while the pointer is on the canvas). Those listeners are gated by an internal attention predicate: a key is claimed (and `preventDefault()`-ed) only when **focus is inside the container's subtree OR the pointer is over the container**. Body-focus alone — the natural state when the surface is embedded as a block in a longer document — is not attended, so the editor stays out of the way of page-level shortcuts (Space / arrows to scroll, Cmd+= to zoom, etc.). Passive observation listeners (modifier mirrors, blur resets) are not gated — they don't call `preventDefault()` and need to stay live across focus boundaries.

### Lifecycle

```ts
editor.attach(surface: Surface): SurfaceHandle; // returns { detach() }
editor.detach(): void; // detach current surface, keep editor state
editor.dispose(): void; // permanent teardown
```

`load()`, `serialize()`, `reset()`, commands, and subscriptions all work on the headless editor regardless of whether a surface is attached.

### External control

```ts
editor.load(svg: string): void; // replace the document (e.g. file-on-disk changed)
editor.serialize(): string; // emit clean SVG — guaranteed round-trip per P1
editor.reset(): void; // back to last load() input, clears history
```

### Observation — state

```ts
editor.state: {
  readonly selection: ReadonlyArray<NodeId>;
  readonly scope: NodeId | null;             // active isolation (group entered via dblclick)
  readonly mode: Mode;                       // "select" | "edit-content"
  readonly tool: Tool;                       // { type: "cursor" } | { type: "insert", tag } — orthogonal to mode
  readonly dirty: boolean;                   // unsaved changes since load() / serialize()
  readonly can_undo: boolean;
  readonly can_redo: boolean;
  readonly version: number;                  // bumps on any emission — drag, history, mutation
  readonly structure_version: number;        // bumps only when tree shape or display-label inputs change
  readonly geometry_version: number;         // bumps only when something that could shift world bounds changes
  readonly load_version: number;             // bumps once per `editor.load()` call (constructor doesn't count)
};

editor.subscribe(fn: (state: EditorState) => void): Unsubscribe;
editor.subscribe_with_selector<T>(
  selector: (state: EditorState) => T,
  fn: (value: T, prev: T) => void,
  equals?: (a: T, b: T) => boolean,
): Unsubscribe;
```

`version` fires on every emission and is the right key for "anything could have changed" reads. Use the narrower companions (`structure_version`, `geometry_version`, `load_version`) as cache keys when the data only depends on the corresponding slice — e.g. a hierarchy panel snapshots once per `structure_version` so a drag doesn't invalidate the tree view.

`state` is a frozen snapshot. Consumers never destructure into internals; if a view they need isn't here or in the purpose-built views below, that's an API gap.

### Observation — properties

This section is about **property semantics on a single node**, following the CSS / SVG spec. Multi-selection ("mixed values") is a separate concern; see the [Multi-selection](#multi-selection-mixed-values) section below. The two are kept apart on purpose: property semantics is defined by the spec; mixed semantics is an aggregation layer the editor adds because it supports multi-select.

The CSS Cascading and Inheritance spec defines a value pipeline of six stages: **declared → cascaded → specified → computed → used → actual** ([css-cascade-5 §4](https://www.w3.org/TR/css-cascade-5/#value-stages)). For an SVG property panel, two stages are useful:

- **`declared`** — the literal source string as authored, with CSS-wide keywords (`inherit`, `initial`, `unset`) already resolved per [css-cascade-5 §7.3](https://www.w3.org/TR/css-cascade-5/#defaulting-keywords), but with `var()` and `url(#…)` references preserved verbatim. This is what the file says; this is what round-trips.
- **`computed`** — the value after [`var()` substitution at computed-value time](https://www.w3.org/TR/css-variables-1/#substitute-a-var) and type-parsing per the property's definition. For paint with `url(#id)`, the reference itself is the computed value (paint servers are not dereferenced at computed time, per [SVG 2 §13.2](https://www.w3.org/TR/SVG2/painting.html#SpecifyingPaint)). If a `var()` cannot resolve, `computed` is a distinct error state ("invalid at computed-value time"), not silently absent.

Plus the editor's own metadata, marked as such:

- **`provenance`** — _editor metadata, not a CSS spec term_. Reports which document carrier won the cascade for this node (presentation attribute, inline style, stylesheet rule, inherited from parent, defaulted). The cascade itself collapses these into the "author" origin; we surface them because we parsed them.

Intermediate stages (`specified`) and downstream stages (`used`, `actual`) are not exposed. `specified` differs from `declared` only when CSS-wide keywords are present and is rarely useful to a panel UI. `used` and `actual` are surface-bound and out of scope for the headless editor.

```ts
type Provenance = {
  origin: "author" | "user_agent"; // cascade origin (css-cascade-5 §6.2)
  carrier: // editor metadata — where in the file the winning declaration lives
    | "presentation_attribute" // <rect fill="red">
    | "inline_style" // <rect style="fill: red">
    | "stylesheet" // matched a <style> block rule
    | "inherited" // no winning declaration; took parent's computed value
    | "defaulted"; // no winning declaration; took the property's initial value
};

type InvalidComputedValue = {
  error: "invalid_at_computed_value_time";
  reason: string; // e.g. "var(--brand) is not defined and has no fallback"
};

type PropertyValue<T = string> = {
  declared: string | null;
  computed: T | InvalidComputedValue | null;
  provenance: Provenance;
};
```

Read — per node:

```ts
editor.node_properties(
  id: NodeId,
  names: ReadonlyArray<string>,
): { readonly [name: string]: PropertyValue };
```

Property names mirror SVG attribute / CSS property names exactly. No invented schema. Names the editor knows return type-parsed `computed` values (e.g. `opacity` → `number`); unknown names return generic `string`.

Resolving `computed` requires a cascade engine. The editor implements only the subset needed for clean editor DX: [presentation attributes](https://www.w3.org/TR/SVG2/styling.html#PresentationAttributes), inline `style=""`, and rules from `<style>` blocks within the document. External stylesheets are out of scope; declarations from them would fall through to `defaulted` / `inherited` with the inspector surfacing that honestly.

Write — selection-scoped. Writing the same value to every selected node has no mixed-value ambiguity, so the write API is selection-scoped without engaging the multi-selection layer:

```ts
editor.commands.set_property(name: string, value: string | null): void;

editor.commands.preview_property(name: string): {
  update(value: string): void;
  commit(): void;
  discard(): void;
};
```

The editor decides whether to write a presentation attribute vs. inline style for each selected node based on whichever wins the cascade for that element (P1). The preview session is what a number-input scrub or color-picker drag uses: many `update()` calls during drag, one `commit()` on pointer-up.

### Observation — paint (`fill` / `stroke`)

`fill` and `stroke` are common enough — and shape-different enough from a plain string — that they get a dedicated typed API. A solid color, a paint-server reference, and `currentColor` are not interchangeable strings; pretending they are is what produces editors that round-trip badly.

This section, like Properties above, is **per-node and spec-aligned**. Multi-selection aggregation is in the [Multi-selection](#multi-selection-mixed-values) section.

The `Paint` type follows the [SVG 2 `<paint>` production](https://www.w3.org/TR/SVG2/painting.html#SpecifyingPaint) literally:

```
<paint> = none | <color> | <url> [none | <color>]? | context-fill | context-stroke
```

`<color>` includes `currentColor` per [CSS Color 4 §4](https://www.w3.org/TR/css-color-4/#typedef-color). `inherit` and `var()` are _not_ paint values — they are defaulting / substitution mechanisms that are resolved before the computed value exists (see the property stages above). They appear in `declared` strings but never in a parsed `Paint`.

```ts
type Paint =
  | { kind: "none" } // fill="none"
  | { kind: "color"; value: Color } // fill="#f00" | fill="red" | fill="currentColor"
  | { kind: "ref"; id: string; fallback?: PaintFallback } // fill="url(#g1) red"
  | { kind: "context_fill" } // fill="context-fill" — meaningful in <marker> / <use>
  | { kind: "context_stroke" };

type PaintFallback = { kind: "none" } | { kind: "color"; value: Color };

// Color preserves currentColor as a keyword at computed time (CSS Color 4 §4.4); the
// rgb resolution happens at *used* value, which requires the surface's painting context.
type Color =
  | { kind: "rgb"; value: string } // any resolvable CSS color, normalized to rgb-ish
  | { kind: "current_color" }; // unresolved keyword; surface dereferences at paint time

type PaintValue = {
  declared: string | null; // raw, e.g. "var(--brand, currentColor)" or "url(#g1) red"
  computed: Paint | InvalidComputedValue | null; // post-defaulting, post-var
  provenance: Provenance;
};
```

Read — per node:

```ts
editor.node_paint(id: NodeId, channel: "fill" | "stroke"): PaintValue;
```

Notes on the `<url>` reference, per spec:

- The fallback (`<url> <color>` or `<url> none`) kicks in only when the URL resolves to a missing or invalid paint server. A valid-but-empty gradient is still valid; the fallback does not apply ([SVG 2 §13.2.1](https://www.w3.org/TR/SVG2/painting.html#FillStrokePaintServer)).
- A reference to a non-existent id with no fallback paints nothing for that layer (silently skipped, not an error). The editor surfaces this via a warning in the `defs` registry's `subscribe()`.
- `context-fill` / `context-stroke` are only meaningful inside `<marker>` content or a `<use>` shadow tree ([SVG 2 §13.2.2](https://www.w3.org/TR/SVG2/painting.html#TermContextElement)). Outside those contexts, the editor treats them as no-paint and surfaces a warning.

Write — selection-scoped (same reasoning as for generic properties):

```ts
editor.commands.set_paint(channel: "fill" | "stroke", paint: Paint): void;

editor.commands.preview_paint(channel: "fill" | "stroke"): {
  update(paint: Paint): void;
  commit(): void;
  discard(): void;
};
```

Assigning a gradient as fill is a two-step operation by design — the gradient lives in `<defs>` (per SVG), the paint references it. The editor does not auto-inline. Sugar for the common "create new gradient and set as fill in one undo step" case is provided by the resource API below.

### Multi-selection (mixed values)

When more than one node is selected, **reading** a property no longer has a single answer — values may agree across the selection, or they may differ ("mixed"). This is its own concept, layered on top of the per-node property and paint APIs above. It is the typical reading mode for a property panel.

This layer is **not deeply designed yet**. The shape will likely look something like:

```ts
// Provisional — names, contract, and ergonomics subject to design before v0.
type MixedView<V> =
  | { status: "single"; value: V } // every selected node agrees
  | { status: "mixed"; per_node: ReadonlyMap<NodeId, V> } // values differ
  | { status: "unsupported" } // no selected node has this property
  | { status: "empty" }; // no selection

editor.selection_properties(names): { readonly [name: string]: MixedView<PropertyValue> };
editor.selection_paint(channel): MixedView<PaintValue>;
```

`@grida/mixed-properties` already exists in the monorepo and is the likely starting point, but whether it covers SVG paint and the spec-aligned `PropertyValue` shape cleanly is an open question. Writes do not engage this layer — `set_property` and `set_paint` apply the same value to every selected node and are well-defined as-is.

For v0, the per-node APIs (`node_properties`, `node_paint`) are the stable primitives. Consumers who need to render a property panel today can iterate over `state.selection` and aggregate themselves; the goal of the mixed layer is to give them an ergonomic alternative once its shape is settled.

### Observation — defs (resources)

SVG forces gradients, patterns, symbols, markers, clip-paths, masks, and filters to live as named entries in `<defs>` and be referenced by `url(#id)`. The editor exposes a typed registry per resource kind. Consumers reading `editor.paint("fill").computed` may encounter a `{ kind: "ref", id }`; they look up the actual gradient via `editor.defs.gradients.get(id)`.

```ts
editor.defs: {
  gradients: GradientsApi;
  patterns: PatternsApi;
  symbols: SymbolsApi;
  markers: MarkersApi;
  clip_paths: ClipPathsApi;
  masks: MasksApi;
  filters: FiltersApi;
};

interface GradientsApi {
  list(): ReadonlyArray<GradientEntry>;
  get(id: string): GradientEntry | null;
  upsert(definition: GradientDefinition, opts?: { id?: string }): string; // returns assigned id
  remove(id: string): void;
  subscribe(fn: (entries: ReadonlyArray<GradientEntry>) => void): Unsubscribe;
}

type GradientDefinition =
  | {
      kind: "linear";
      stops: GradientStop[];
      x1?: number; y1?: number; x2?: number; y2?: number;
      gradient_units?: "user_space_on_use" | "object_bounding_box";
      spread_method?: "pad" | "reflect" | "repeat";
    }
  | {
      kind: "radial";
      stops: GradientStop[];
      cx?: number; cy?: number; r?: number; fx?: number; fy?: number;
      gradient_units?: "user_space_on_use" | "object_bounding_box";
      spread_method?: "pad" | "reflect" | "repeat";
    };

type GradientStop = { offset: number; color: string; opacity?: number };

type GradientEntry = {
  id: string;
  definition: GradientDefinition;
  ref_count: number; // how many nodes currently reference this gradient
};
```

`upsert(definition)` creates a new `<linearGradient>` / `<radialGradient>` (and `<defs>` if absent) and returns its id. If `opts.id` matches an existing entry, the definition is replaced in place. `remove(id)` is rejected if `ref_count > 0` (the editor refuses to leave dangling `url(#id)` references — surface a confirmation in your UI and clear references first).

Assigning a freshly-authored gradient as fill, end-to-end:

```ts
const id = editor.defs.gradients.upsert({
  kind: "linear",
  stops: [
    { offset: 0, color: "#ff6b35" },
    { offset: 1, color: "#7fb8e0" },
  ],
});
editor.commands.set_paint("fill", { kind: "ref", id });
```

For the very common "set fill from picker that just produced a gradient" path, a sugar command exists:

```ts
editor.commands.set_paint_from_gradient(
  channel: "fill" | "stroke",
  definition: GradientDefinition,
  opts?: { reuse_existing?: boolean }, // dedupe by definition equality
): { gradient_id: string };
```

This is one undo step.

The same shape (`list / get / upsert / remove / subscribe`) repeats for `patterns`, `symbols`, `markers`, `clip_paths`, `masks`, `filters`. Each carries its own `*Definition` type that mirrors the SVG spec. None of them are renamed or renormalized — `<linearGradient>` stays `<linearGradient>`, `<marker>` stays `<marker>`.

Markers are referenced via `marker-start` / `marker-mid` / `marker-end` (and the shorthand `marker`), not via `fill`/`stroke`. They appear in the property API the same way any presentation attribute does — read `editor.node_properties(id, ["marker-end"])`, dereference any `{ kind: "ref", id }` via `editor.defs.markers.get(id)`.

### Observation — tree

```ts
editor.tree(): {
  readonly root: NodeId;
  readonly nodes: ReadonlyMap<
    NodeId,
    {
      id: NodeId;
      tag: string; // "rect" | "g" | "path" | ...
      name?: string; // from id= or inkscape:label, if present (preserved)
      parent: NodeId | null;
      children: ReadonlyArray<NodeId>;
    }
  >;
};
```

Returns a shallow snapshot. Cheap to call after a `version` bump.

### Modes and tools

"What does a click do" is governed by **two orthogonal axes**, both editor-internal — consumers observe them and flip them via commands, but cannot define new values for either.

- **`Mode`** — what the editor is _doing_. Two values: `select` (normal interaction — pick / marquee / drag) and `edit-content` (inline text edit, or vector content edit on a path).
- **`Tool`** — what pointer-down _means_ within the current mode. `cursor` (the default — select / marquee / drag), `insert` (a tag — pointer-down draws a new element of that tag, drag-to-size), `insert-text` (click-only — places a single-line `<text>` and enters content-edit immediately; `<text>` has no intrinsic size so it doesn't drag-to-size), and the content-edit-only `lasso` / `bend` (valid only while `mode === "edit-content"` on a path).

```ts
editor.modes: ReadonlyArray<Mode>; // discoverable, frozen after construction — ["select", "edit-content"]
editor.state.mode: Mode;
editor.state.tool: Tool;

editor.commands.set_mode(mode: Mode): void;
editor.set_tool(tool: Tool): void; // also dispatchable as the `tool.set` command (keymap V/R/O/L/T)
```

When a tool-driven gesture completes (a shape is drawn, a text element placed), the tool reverts to `cursor` automatically. Modifier keys can override this (e.g. hold to stay in the insert tool); that behavior is bundled, not customizable.

### Commands

The full closed set. Adding a command requires a PR to this package.

```ts
editor.commands.{
  // selection
  select(target: NodeId | ReadonlyArray<NodeId>, opts?: { additive?: boolean }): void;
  deselect(): void;
  enter_scope(group: NodeId): void;
  exit_scope(): void;

  // mode + tool
  set_mode(mode: Mode): void;
  // `set_tool` is also accessible as `editor.set_tool(...)`; the command form
  // is provided so keymap bindings (V/R/O/L) can dispatch via the registry.

  // generic property (any SVG/CSS attribute)
  set_property(name: string, value: string | null): void;
  preview_property(name: string): PreviewSession;

  // paint — typed sugar for fill / stroke
  set_paint(channel: "fill" | "stroke", paint: Paint): void;
  preview_paint(channel: "fill" | "stroke"): PaintPreviewSession;
  set_paint_from_gradient(
    channel: "fill" | "stroke",
    definition: GradientDefinition,
    opts?: { reuse_existing?: boolean },
  ): { gradient_id: string };

  // transforms (atomic — the bundled HUD drives drag-resize-rotate internally)
  translate(delta: { dx: number; dy: number }): void;
  nudge(direction: "left" | "right" | "up" | "down", step?: number): void;
  resize(target: { width?: number; height?: number; anchor?: ResizeAnchor }): void;
  resize_to(target: { width: number; height: number; anchor?: ResizeAnchor }): void;
  rotate(args: { angle: number; pivot?: { x: number; y: number } }): void;
  rotate_to(args: { angle: number; pivot?: { x: number; y: number } }): void;
  flatten_transform(): void;          // bake `transform=` into native attrs where possible

  // alignment (operates on selection of ≥2 nodes against their union bbox)
  align(direction: AlignDirection): void;

  // structure
  reorder(direction: "bring_forward" | "send_backward" | "bring_to_front" | "send_to_back"): void;
  group(): void;                      // wrap selection in a new <g>
  remove(): void;

  // insertion — `tag` is an open string (so paste / RPC can create any element,
  // e.g. "path"); only the closed `InsertableTag` set gets a pointer-driven
  // draw gesture and default paint.
  insert(tag: string, attrs?: Readonly<Record<string, string>>): NodeId;
  insert_preview(tag: string, initial?: Readonly<Record<string, string>>): InsertPreviewSession;

  // content
  set_text(value: string): void;
  enter_content_edit(target?: NodeId): boolean;

  // file
  load_svg(svg: string): void;
  serialize_svg(): string;

  // cleanup — never silent, never automatic
  tidy(opts?: TidyOptions): void;

  // history
  undo(): void;
  redo(): void;
}
```

All commands operate on `state.selection` unless they take an explicit target. Commands that can't apply (e.g. `set_text` with no text node selected) are no-ops, not errors.

(Naming convention for the API surface is `snake_case` to match the SVG / CSS property naming the editor already echoes — `set_property("stroke-width", …)` reads cleanly next to `set_paint("fill", …)`. JavaScript identifiers use `snake_case`; user-facing strings that mirror SVG attribute names stay `kebab-case` exactly as the spec writes them.)

### Providers

Three host-owned seams, all optional.

```ts
type ClipboardProvider = {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
};

type FontResolver = {
  resolve(family: string): Promise<{
    available: boolean;
    metrics?: { ascent: number; descent: number; unitsPerEm: number };
  }>;
};

type FileIOProvider = {
  openSvg(): Promise<string | null>; // "open" dialog
  saveSvg(svg: string, suggestedName?: string): Promise<void>;
};
```

### Style

`style` is the HUD chrome's appearance spec. It is **values, not slots** — consumers cannot replace the chrome, they restyle it. Field names are `snake_case`. The spec is small and additive.

```ts
type EditorStyle = {
  chrome_color: string; // selection border + handle stroke
  handle_size: number; // pixels
  handle_fill: string;
  handle_stroke: string;
  endpoint_dot_radius: number;
  selection_outline_width: number;
  // ...
};

editor.style: Readonly<EditorStyle>;
editor.set_style(partial: Partial<EditorStyle>): void;
```

### React API (thin wrapper)

The React layer is intentionally thin. We ship a provider, a canvas component, two core subscription primitives (`useEditorState` + `useCommands`), and a small set of bundled hooks for the patterns that turned out the same across every consumer. Hooks for **per-node** observation patterns (paint, properties, gradients list, document tree) are not exported — those are 5-line recipes consumers write against the editor's own API, tailored to their re-render needs.

#### Core (the primitives)

```tsx
import {
  SvgEditorProvider,
  SvgEditorCanvas,
  useSvgEditor,
  useEditorState,
  useCommands,
} from "@grida/svg-editor/react";
```

- `SvgEditorProvider` — owns the headless editor, puts it in context.
- `SvgEditorCanvas` — the only UI component we ship; internally calls `attach_dom_surface(editor, { container })` on mount and `handle.detach()` on unmount. Receives the `DomSurfaceHandle` via an `onAttach` callback so consumers can thread `handle.camera` / `handle.gestures` into surrounding chrome.
- `useSvgEditor()` — returns the editor instance from context.
- `useEditorState(selector, equals?)` — subscribes to a slice of `editor.state` and re-renders on change. The subscription primitive.
- `useCommands()` — sugar for `useSvgEditor().commands`.

#### Bundled hooks (state-slice convenience + lifecycle-aware sessions)

These are not internals to be replaced — they're documented sugar over `useEditorState` and the imperative APIs, with stable contracts. They exist because every consumer wrote the same recipe; per P6, they earned promotion.

```tsx
import {
  // state slices (one-line wrappers over useEditorState)
  useSelection, // → readonly NodeId[]
  useTool, // → Tool
  useMode, // → Mode
  useCanUndo, // → boolean
  useCanRedo, // → boolean

  // lifecycle-aware preview sessions — unmount = discard (never commit)
  usePaintPreview, // (channel) → PaintPreviewSession
  usePropertyPreview, // (name) → PreviewSession

  // bound imperative actions, stable identity across renders
  useEditorLoad, // → (svg: string) => void
  useEditorSerialize, // → () => string

  // RAII hover override (clears on unmount if this hook set the override)
  useHoverOverride, // → (id: NodeId | null) => void

  // camera bridge (subscribe to a slice of handle.camera without bumping state.version)
  useCameraSnapshot, // (handle, selector, fallback) → T
} from "@grida/svg-editor/react";
```

The preview hooks (`usePaintPreview` / `usePropertyPreview`) wrap `commands.preview_*` with a React-lifecycle-aware shell whose contract is: **unmount discards, the host commits**. The session returned is reference-stable across renders within one key — `picker open → commit → reopen` works without remounting.

Top-level wiring:

```tsx
<SvgEditorProvider
  svg={initial_svg}
  providers={{ clipboard, fonts, file_io }}
  style={{ chrome_color: "#2563eb" }}
>
  <Layout>
    <Toolbar />
    <SvgEditorCanvas className="flex-1" />
    <PropertyPanel />
    <LayerList />
  </Layout>
</SvgEditorProvider>
```

Everything else is consumer-built against the editor's API. The two patterns:

**Pattern A — state slice via the built-in hook.**

```tsx
function Toolbar() {
  // Insertion is the `Tool` axis, not `Mode` — `Mode` is only
  // "select" / "edit-content". Flip tools via `editor.set_tool(...)`.
  const tool = useEditorState((s) => s.tool);
  const editor = useSvgEditor();
  return (
    <>
      <ToolButton
        active={tool.type === "cursor"}
        onClick={() => editor.set_tool({ type: "cursor" })}
      >
        ↖
      </ToolButton>
      <ToolButton
        active={tool.type === "insert" && tool.tag === "rect"}
        onClick={() => editor.set_tool({ type: "insert", tag: "rect" })}
      >
        ▭
      </ToolButton>
      <ToolButton
        active={tool.type === "insert-text"}
        onClick={() => editor.set_tool({ type: "insert-text" })}
      >
        T
      </ToolButton>
    </>
  );
}
```

**Pattern B — anything else (per-node reads, resource lists, tree, paint) via a custom hook over `useSyncExternalStore`.** The recipe is the same shape every time:

```tsx
import { useSyncExternalStore } from "react";

// For per-node property reads, subscribe to the whole editor and re-snapshot.
// useSyncExternalStore handles reference-equality bailouts.
function useNodePaint(id: NodeId, channel: "fill" | "stroke") {
  const editor = useSvgEditor();
  return useSyncExternalStore(
    (cb) => editor.subscribe(cb),
    () => editor.node_paint(id, channel)
  );
}

// For defs registries, subscribe to the registry directly — more granular.
function useGradients() {
  const editor = useSvgEditor();
  return useSyncExternalStore(
    (cb) => editor.defs.gradients.subscribe(cb),
    () => editor.defs.gradients.list()
  );
}
```

The property panel composes those custom hooks with the built-in ones:

```tsx
function PropertyPanel() {
  const selection = useEditorState((s) => s.selection);
  const cmd = useCommands();

  // v0: single-selection path. Multi-selection arrives with the mixed-values layer.
  if (selection.length !== 1)
    return <MultiSelectionPlaceholder count={selection.length} />;
  const id = selection[0];

  const fill = useNodePaint(id, "fill");
  const stroke = useNodePaint(id, "stroke");
  const gradients = useGradients();

  return (
    <>
      {/* PaintInput is consumer-built. `provenance` tells the user whether this
          value came from an attribute, inline style, a stylesheet rule, or was
          inherited / defaulted. */}
      <PaintInput
        label="Fill"
        declared={fill.declared}
        computed={fill.computed}
        provenance={fill.provenance}
        available_gradients={gradients}
        onPreview={(p) => cmd.preview_paint("fill").update(p)}
        onCommit={(p) => cmd.set_paint("fill", p)}
        onCreateGradient={(def) => cmd.set_paint_from_gradient("fill", def)}
      />
      <PaintInput
        label="Stroke"
        declared={stroke.declared}
        computed={stroke.computed}
        provenance={stroke.provenance}
        available_gradients={gradients}
        onCommit={(p) => cmd.set_paint("stroke", p)}
      />
    </>
  );
}
```

The pattern is the same for `useDocumentTree`, `useNodeProperties`, `useMarkers`, `useSymbols`, etc. — consumers compose against the editor's existing `subscribe()` / `.list()` / `.get()` methods. The package does not ship those hooks because every consumer's re-render needs are slightly different (which IDs to watch, which equality function to use, how to memoize the snapshot), and a one-size-fits-all hook is the wrong layer.

What this means in practice:

- The editor's API (`editor.subscribe`, `editor.node_*`, `editor.defs.*.subscribe`, etc.) is the contract. The React wrapper is just plumbing.
- A consumer who decides to use TanStack Query, Jotai, or Zustand instead of `useSyncExternalStore` reaches the same primitives the same way.
- Adding a built-in hook later (e.g. `useNodePaint`) requires a P6 justification: ≥2 internal consumers and a stable contract.

## Anti-goals

What this editor will never be. Each one is a defensive perimeter for the principles above.

- **Not a vector authoring tool.** No pen tool, no boolean ops, no path-node sculpting beyond what an SVG-natural edit supports.
- **Not an animation editor.** SMIL is preserved verbatim, never authored or mutated.
- **Not a plugin host.** No public registry for tools, capabilities, gestures, HUD overlays, or serializers. (P1, P6.)
- **Not a Figma-style multiplayer canvas.** State is local. Sync is the consumer's problem.
- **Not customizable in HUD layout.** Style spec only — no overlay slots, no handle replacement, no custom chrome components.
- **Not a private IR.** SVG is the source of truth. The editor does not maintain an alternative on-disk format, and the bytes are not projected from any in-memory canonical store. (The internal typed element IR described under [Paradigm § Element IR (internal)](#element-ir-internal) is a typed view over the parsed AST, not a store the file is derived from — the AST and the file are the source of truth, and the IR is rebuilt from them on each load.)
- **Not a serializer playground.** Round-trip rules are fixed (P1). No "compact mode," no "Prettier mode," no consumer-supplied formatter.

If a consumer needs any of the above, the right answer is "this is the wrong tool." Saying yes to any one is the path that turned the Grida main editor into a 6,800-line god-class.

## Status

- `v0.x` — selection, transform, insert (rect / ellipse / line), inline text
  edit, and the click-to-place text tool. Experimental.

The shape of the API, the mental model, the file-format guarantees, and the scope are all unsettled. Nothing here is stable — public types still in flux include the `Tool` union (a planned axis split, see `TODO.md` F2). Do not depend on it from production code.

## Contributing

- [`TODO.md`](./TODO.md) — open questions and deferred work, grouped by area.

## License

MIT
