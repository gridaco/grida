# `/packages/@grida/svg-editor` — spec demo + design harness

This directory renders the package landing/spec page for
[`@grida/svg-editor`](https://github.com/gridaco/grida/tree/main/packages/grida-svg-editor)
at `/packages/@grida/svg-editor`.

It is **not** the full editor. It is the sibling of the `@grida/hud` and
`@grida/tree-view` package pages: a set of small, isolated cards, each one
exercising a **single feature or scenario** of the package's public API.

## Two kinds of demo, on purpose

| Surface                   | Route                                                          | What it is                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full-editor seam          | [`/svg`](/svg), [`/svg/examples/slides`](/svg/examples/slides) | The whole editor wired to a real host — file IO, multi-doc storage, toolbars, path tooling, AI. Proves the package composes into a product.              |
| **Spec demo (this page)** | `/packages/@grida/svg-editor`                                  | One feature per card. Proves each capability in isolation, the way `@grida/hud`'s showcase does. The reference for "what does this package actually do." |

Keep the `/svg` demos as-is. They answer "can you build an editor with this?"
This page answers "what is each piece, exactly?"

## Why this page also exists as a harness

The package's design doctrine is **"default is core, not customizable"**
(README P1–P6, and the anti-goals "Not a plugin host", "Not customizable in
HUD layout"). That doctrine is about _behavior_ and _extension_: you can't add
tools, replace the chrome, or swap the serializer.

But a spec demo needs a different axis the package does not yet have:
**the ability to expose, enable, or lock the editor to a chosen subset of its
built-in features.** Today it has none. Every card on this page mounts the
_entire_ editor and then merely _presets_ a tool. Nothing stops the rest of the
surface from activating:

- The "Insert rectangle" card presets the rect tool — but pressing `V`, `O`,
  `L`, or `T` switches tools, and `Cmd+Z`, arrow-nudge, group, delete, etc. are
  all live. The card can _describe_ an isolated feature; it cannot _enforce_
  one.
- There is no read-only / view-only mode, so a card that only wants to show
  selection chrome still accepts mutation.
- There is no way to mount "just text editing" or "just paint" for a focused
  teaching example, an embed, or a regression fixture.

This is the design feedback. **A spec demo is the first concrete consumer that
wants a capability profile, and the absence of one is visible in every card.**

### This is not a request to make the editor "customizable"

To be precise against the package's deciding table — the ask is **not**:

- a plugin registry (P3 / anti-goal "not a plugin host"),
- behavior overrides or custom gestures,
- a swappable serializer or HUD slots (anti-goals).

The ask is a new, orthogonal axis: **which of the editor's own, fixed built-in
capabilities are _enabled_ for this mount.** The behavior of each capability
stays 100% editor-owned and non-customizable. We only gate whether it is
reachable. That is closer to a host concern (P2) — "this embedding only wants
the editor to do X" — than to extension.

### Sketch (not a committed API)

Construction-time, additive, default = everything on (so existing consumers are
unaffected):

```ts
const editor = createSvgEditor({
  svg,
  // all provisional names — design lives in the WG track, not here
  capabilities: {
    tools: ["insert-text"], // allow-list; others are inert (keymap + toolbar)
    commands: { history: false, structure: false },
    readonly: false,
    lock_mode: "edit-content", // pin the mode; set_mode becomes a no-op
  },
});
```

Enforcement would have to land at three layers the package already owns, so the
gate can't be escaped from the keyboard or a stray command:

1. **Keymap** — disabled capabilities don't bind their shortcuts.
2. **Command registry** — disabled commands are no-ops (consistent with the
   existing "can't apply → no-op, not error" rule).
3. **Tool/mode** — `set_tool` / `set_mode` reject values outside the profile.

Whether the unit of gating is the _command_, the _tool_, the _Policy Class_, or
a coarser _feature_ is exactly the question this harness should help settle by
trying to author the cards it can't author today.

## How this should grow

The page opens on a **featured demo** (the whole editor, full toolbar) and then
isolates one _fixture_ per card. The fixtures are the spine: each one targets a
single interaction surface, so it can later be paired with a behavior
constraint. It grows along two tracks:

**Track 1 — more fixtures + cards, as the package ships features.** Shipped
fixtures (`_fixtures.ts`): every primitive shape, path (vector edit), line (the
2-point exception), text + tspan, groups + transform, symbol + use (shared
instances), and a CSS-cascade harness (fill _and_ geometry via a document
`<style>` block). The backlog, roughly in package-maturity order:

- Clean round-trip / minimal-diff (live `serialize()` next to the canvas — the
  package's headline guarantee; this is the highest-value card to add next).
- Paint read/write (`fill` / `stroke`) with provenance.
- Generic property read/write with the cascade `provenance` badge.
- Defs / gradients (`editor.defs.gradients`).
- Alignment, z-order reorder, grouping.
- Snap-to-geometry and snap-to-pixel-grid (toggleable via `EditorStyle`).
- History (undo/redo) and dirty tracking.

Each fixture is authored to _pair with a constraint_: the line fixture wants a
"line only" profile, the text fixture a "text only" embed, the CSS fixture a
decision on how the editor cooperates with the cascade. Writing them now means
fixture + behavior-constraint line up when the profile lands.

**Track 2 — the harness drives the capability-profile API.** As soon as the
profile sketch above (or whatever the WG settles on) exists, every card here
becomes an _acceptance test_ for it: a card that says "text editing only"
should actually be locked to text editing. Until then, each card carries an
honest caption noting what _isn't_ yet enforceable.

When the gating work is picked up, it belongs in the package + its WG track
(`docs/wg/feat-svg-editor/`) and the package `TODO.md`, not here. This README is
the **motivation and the consumer**, not the design home.

## Structure / how to add a card

```
[%40grida]/svg-editor/
  layout.tsx     SEO metadata + JSON-LD (mirrors hud / tree-view)
  page.tsx       hero + featured demo + composition of the fixture cards
  _featured.tsx  the fully-featured hero (toolbar + canvas + status), like hud's live section
  _examples.tsx  the isolated <SvgStage> scaffold + one component per fixture
  _fixtures.ts   the authored SVG fixtures — the spine of the page
  README.md      this file
```

To add a card: author a fixture SVG in `_fixtures.ts` (with a comment naming the
interaction it targets), add an exported component in `_examples.tsx` that mounts
`<SvgStage svg={...} tool={...} selectName={...} />` (each card is its own
isolated `SvgEditorProvider`), then drop a `<SpecCard>` for it in `page.tsx`.
Keep one interaction per fixture; if a fixture needs two to make sense, that's a
signal the feature boundary — or the future capability profile — is drawn at the
wrong place. Note that observation.
