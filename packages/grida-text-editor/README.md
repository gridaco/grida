# `@grida/text-editor`

A backend-agnostic text editor engine. Bring your own backend.

This package owns the _logic_ of editing — text state, caret/selection
model, command dispatch, undo grouping, IME composition. It does NOT
own _geometry_ (where glyphs render) or _paint_ (how caret/selection
appear); both are provided by the host as `LayoutEngine` and `Surface`
implementations.

> Status: experimental. The shape of the API, the mental model, the
> command vocabulary, and the scope are unsettled. Do not depend on it
> from production code.

## Goals

- **Agnostic editor contract** — same shape whether the rendering backend
  is SVG `<text>`, an HTML `contenteditable`, a `<canvas>`, or a
  WASM-driven Skia surface.
- **BYOB pattern** — package defines the contracts (`LayoutEngine` for
  geometry, `Surface` for paint), host implements one of each per
  backend. SVG backend ships in V1; DOM and canvas backends are future
  work _outside_ the package's responsibility.
- **Rust-code style** — file names and command vocabulary mirror
  [`crates/grida/src/text_edit/`](../../crates/grida/src/text_edit/) so
  cross-referencing the two is friction-free.
- **Engine-grade testability** — pure layers (session, commands,
  history, boundaries) are unit-tested against a `MockLayoutEngine`
  with no DOM.

## Two entry points: `@grida/text-editor` and `/dom`

The package follows the `react` / `react-dom` split. The core entry is
platform-agnostic — no DOM globals, no `navigator`, no `setInterval`
polyfill. Everything that touches the browser lives in a separate
subpath, `@grida/text-editor/dom`, which the application imports.

| import                   | who imports it                                          | what's there                                                                                                                                     |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@grida/text-editor`     | tests, the package's own unit tests, non-browser hosts  | `TextEditor` orchestrator, `TextEditSession`, commands, history, boundaries, contracts (`LayoutEngine`, `Surface`, `Clipboard`, `InputProvider`) |
| `@grida/text-editor/dom` | application code (browser canvas or DOM-backed editors) | `createTextEditor` convenience, `DomInputRelay`, `DomClipboard`, caret-blink loop                                                                |

The core `TextEditor` constructor accepts an `input: InputFactory` and a
`clipboard: Clipboard`, with no defaults. Browser hosts use the
convenience:

```ts
import { createTextEditor } from "@grida/text-editor/dom";

const editor = createTextEditor({
  container, // HTMLElement that will host the hidden <textarea>
  isMac, // host computes this
  layout, // your LayoutEngine
  surface, // your Surface
  initialText: "…",
  callbacks: {
    /* … */
  },
});
```

Tests and non-browser hosts construct `TextEditor` directly with stubbed
input + clipboard, and drive `editor.tickBlink()` themselves (or skip
blinking entirely).

## Non-Goals

The hard contract: the package is responsible for _what_ changes about
the text and selection; the host is responsible for _where_ and _how_
that change is rendered.

### Geometry decisions live with the caller

The host's `LayoutEngine` decides:

- Where each character renders (rects in _its_ coordinate space).
- What "next position" means for `move_up` / `move_down`. For a
  paragraph editor that's one visual line up/down. For an SVG `<text>`
  it might mean "previous sibling `<tspan>`", or "snap to nearest
  positioned glyph by x", or — for per-glyph positioned text —
  _nothing useful at all_. The package will not guess.
- How wrapping works, if at all.

The package only consumes geometry as `Rect`s and index round-trips.
It never measures glyphs, never wraps, never decides line breaks.

### Rendering lives with the caller

The host's `Surface` decides:

- Caret visual (blinking bar? wedge? color?).
- Selection visual (rectangles? underline? translucent overlay?).
- Whether the rendered text and the source text are the same element
  (SVG: yes; canvas: no — host repaints from text state).
- Whether IME preedit gets visual decoration (underline? italic?).

The package only tells `Surface` _what_ to render (text, caret index,
selection range, composition range) and _when_ (every state mutation).
Visuals are entirely the host's call.

### Document semantics live with the caller

The package doesn't:

- Persist text. The host owns the source-of-truth document; the
  package's snapshot is a transient editing buffer.
- Wrap commits in document history. The host receives `on_commit(text)`
  and wraps it in its own undo stack (or not).
- Define what "commit" / "cancel" _mean_ at the document level. The
  package just signals the lifecycle.

### Rich text (V1)

V1 is plaintext only. Run-based attributed text (bold/italic/font-swap
_within_ one editable text) is out of scope for V1; tracked for V2 by
mirroring `crates/grida/src/text_edit/attributed_text/`.

### Block structure

Lists, headings, blockquotes — not text-editor responsibility. Block
structure is one layer up; this package edits a single text node.

### CRDT / multiplayer / vertical writing / RTL bidi / rope buffer

All out of scope. Tracked in WG manifesto roadmap, deferred to post-V2.

## Why arrow-key semantics are the caller's problem

A motivating example for why `LayoutEngine` is the right seam, not a
buried implementation detail.

In a paragraph editor, "press Up" means "go to the same column on the
previous visual line." That's a single, well-defined operation. **In
SVG, there is no such operation.** Consider:

- **Single-line `<text x="20" y="200">`**: there's no line above.
  `move_up` should be a no-op, _or_ the host might choose to mean
  "move to a different sibling text node entirely" — that's an editor
  feature, not text-edit primitive.
- **Multi-line via `<tspan>` siblings**, each with its own `x`/`dy`:
  visually a paragraph but structurally a list of positioned spans.
  "Up" might mean "previous `<tspan>`", or "y − line-height nearest
  glyph in the previous tspan", or "snap by approximate x" — only the
  host knows which.
- **Per-glyph positioning** (`<text x="10 20 30" y="40 60 50">`):
  glyphs are independently positioned. There's no line concept at all.
  "Up" maps to "the glyph with the smallest `y - currentY` above
  current" — but again, only the host knows whether that's the
  desired UX.
- **Canvas paragraph editor** (future): `move_up` is "previous visual
  line, same x" — straight paragraph behavior. The host's
  `LayoutEngine` returns the answer from its line-metrics cache.

In every case, the package asks the host:

```ts
layout.positionForNavigation(session.caret, "up");
```

and the host returns an index (or `null` for "no movement"). The
package updates `session.caret` to that index. The _math_ is the same
across backends; the _semantics_ of "up" are not, so the package
refuses to define them.

## Naming conventions (Rust-style)

The package mirrors `crates/grida/src/text_edit/` so cross-referencing
is friction-free. Identifiers follow the Rust crate's casing; file
names use kebab-case (TS norm) so the module tree is greppable across
both languages while the on-disk filenames remain idiomatic for the
TS ecosystem.

- **File names**: `kebab-case` (`text-editor.ts`, `edit-command.ts`,
  `layout-engine.ts`, `attributed-text.ts` (V2)). The module name
  inside source code (`./edit-command`) is the only place the hyphen
  appears — everything else mirrors Rust.
- **Module tree**: `session`, `history`, `attributed-text/` — same
  shape as the Rust crate, hyphen-cased on disk.
- **Command types**: lowercase string literals matching Rust variant
  names (`"insert"`, `"backspace"`, `"move_left"`, `"select_word_at"`).
- **Type aliases**: PascalCase (TS norm): `EditingCommand`, `EditKind`,
  `TextEditorState`.
- **Free functions**: `snake_case` (`apply_command`, `next_grapheme`,
  `word_at`).
- **Class methods**: `camelCase` (TS norm; this is the only divergence
  from Rust).
- **Constants**: `SCREAMING_SNAKE_CASE` (`MULTI_CLICK_TIMEOUT_MS`,
  `MERGE_TIMEOUT_MS`).

## Quick map of what the caller supplies vs what the package does

| contract         | who        | what it answers                                                               |
| ---------------- | ---------- | ----------------------------------------------------------------------------- |
| `LayoutEngine`   | **caller** | "Where is char `i`?" "Which char at `(x, y)`?" "Next position for `move_up`?" |
| `Surface`        | **caller** | "Paint the text, caret, selection, composition."                              |
| `onCommit(text)` | **caller** | The text was finalized; write it to your model + history.                     |
| `onCancel()`     | **caller** | The text was abandoned; ignore the transient state.                           |
| `session`        | package    | Pure state: `text`, `caret`, `anchor`, `composition`.                         |
| `edit-command`   | package    | Typed command vocabulary + `apply_command` dispatcher.                        |
| `history`        | package    | `EditKind` grouping, 2 s merge, snapshot stack.                               |
| `boundaries`     | package    | Grapheme / word / line boundaries via `Intl.Segmenter`.                       |
| `input-relay`    | `/dom`     | Hidden `<textarea>` for OS keyboard + IME. Lives in the `dom` subpath.        |
| `text-editor`    | package    | Orchestrator: wires the above to the caller's two contracts.                  |

## Status & roadmap

- **V1** (next): plaintext editing — full WG manifesto plain-text
  command set, IME, plain-text clipboard, undo grouping, multi-click
  escalation. SVG backend ships in V1 _outside_ the package, in
  [`@grida/svg-editor`](../grida-svg-editor).
- **V1.1**: accessibility floor (ARIA roles, screen-reader-friendly
  labels).
- **V2**: run-based attributed text, HTML clipboard, optional
  multi-line / wrapped layout. Unblocks DOM backend for main editor.
- **V3** (speculative): rope buffer, viewport culling, bidi.

## References

- WG manifesto: [`docs/wg/feat-text-editing/index.md`](../../docs/wg/feat-text-editing/index.md)
- Attributed text spec: [`docs/wg/feat-text-editing/attributed-text.md`](../../docs/wg/feat-text-editing/attributed-text.md)
- Performance roadmap: [`docs/wg/feat-text-editing/impl-performance.md`](../../docs/wg/feat-text-editing/impl-performance.md)
- Reference Rust impl: [`crates/grida/src/text_edit/`](../../crates/grida/src/text_edit/) (~11.7k LoC; the bulk is `attributed_text/` for V2)
- Reference Rust example: [`crates/grida_dev/examples/wd_text_editor.rs`](../../crates/grida_dev/examples/wd_text_editor.rs)
- Main editor's current integration: [`editor/grida-canvas-react/viewport/ui/surface-text-editor.tsx`](../../editor/grida-canvas-react/viewport/ui/surface-text-editor.tsx)
- Fixtures skill: [`.agents/skills/fixtures/SKILL.md`](../../.agents/skills/fixtures/SKILL.md)
- Existing SVG text fixtures: `fixtures/test-svg/L0/text-*.svg`

## License

MIT
