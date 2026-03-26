# text_edit

Text editing engine for `cg` (grida-canvas).

## Why a module, not a crate

This was originally `grida-text-edit`, a standalone crate with backend-agnostic abstractions. In practice the editor is tightly coupled to the canvas — it uses `CGColor`, `Paint`, `StyledTextRun`, and the Skia paragraph pipeline directly. Maintaining a separate crate forced lossy conversion layers (e.g. `FillStack::Opaque` with serde round-trips) just to carry style data that the editor doesn't render but must preserve.

By inlining as a `cg` module, the editor can reference canvas types directly. No conversion, no data loss, no abstraction tax.

## Architecture

```
                    Host (WASM canvas, winit, headless)
                                  |
                                  v
                        TextEditSession            <-- top-level facade
                       /       |        \
                      /        |         \
               State       History    AttributedText
          (text, cursor,  (undo/redo,   (run-based
           anchor)        merge group)   rich text)
                |
                v
          apply_command
           (core logic)
                |
                v
        TextLayoutEngine                           <-- trait (abstract geometry)
           /          \
   SimpleLayout     SkiaLayout
   (tests only)     (production, per-block Paragraph)
```

**Data flow:**

1. Host translates platform events into `KeyAction` or pointer calls.
2. `TextEditSession` dispatches to `apply_command_mut()`.
3. `apply_command_mut()` mutates `TextEditorState`, calling `TextLayoutEngine` for geometry.
4. Session syncs `AttributedText` with the returned `EditDelta`.
5. Host queries session for caret rect, selection rects, blink state, and renders.

## Modules

| Module            | Description                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `mod.rs`          | Core types (`TextEditorState`, `EditingCommand`, `EditDelta`), `apply_command`, UTF-8/UTF-16 helpers. |
| `layout`          | `TextLayoutEngine` trait, `LineMetrics`, `CaretRect`, `SelectionRect`.                                |
| `simple_layout`   | `SimpleLayoutEngine` — monospace, no-wrap engine for deterministic tests.                             |
| `skia_layout`     | `SkiaLayoutEngine` — production engine backed by Skia Paragraph. Per-block incremental re-layout.     |
| `history`         | `GenericEditHistory<S>` — snapshot-based undo/redo with time-based merge grouping.                    |
| `attributed_text` | `AttributedText` — run-based rich text model with structural invariants.                              |
| `session`         | `TextEditSession` — bundles state + layout + content + history + blink + scroll.                      |
| `selection_rects` | Selection rect post-processing with `EmptyLineSelectionPolicy`.                                       |
| `time`            | Platform-agnostic `Instant`/`Duration`. Wraps `std::time` on native; tick-based clock on wasm32.      |

## Feature Status

### Editing

- [x] Text insertion (IME commit + direct character input)
- [x] Backspace / Delete (grapheme, word, line granularity)
- [x] Enter (newline), Tab (4 spaces)

### Cursor & Selection

- [x] Arrow keys with grapheme, word, line, document granularity
- [x] Shift+arrow selection extension
- [x] Click, drag-to-select, Shift+click
- [x] Double-click (word), triple-click (line), quad-click (document)
- [x] Cmd/Ctrl+A (select all)

### Rich Text

- [x] Bold, italic, underline, strikethrough
- [x] Font size, font family, text color
- [x] Caret style override (toggle with no selection sets typing style)
- [x] Variable font axis interpolation (wght, opsz)

### Clipboard

- [x] Copy/Cut (HTML + plain text)
- [x] Paste (HTML with formatting or plain text fallback)

### History

- [x] Undo / redo (snapshot-based with merge grouping)
- [x] Time-based merge for consecutive typing (2s timeout)

### Not Yet Implemented

- [ ] Visual-order bidi cursor movement
- [ ] Lossless fill/stroke round-trip (FillStack integration)

## Demo

```sh
cargo run -p grida-dev --example wd_text_editor
```

## Testing

```sh
cargo test -p cg
```

Tests use `SimpleLayoutEngine` (monospace, no Skia dependency) for deterministic assertions.
