# grida-text-edit

Platform-agnostic text editing engine.

Provides a complete, embeddable rich text editor that separates editing logic from rendering and windowing. Hosts (WASM canvas, winit desktop, headless tests) drive the session and handle rendering themselves.

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
4. Session syncs `AttributedText` with the returned `EditDelta` (O(1), no text diffing).
5. Host queries session for caret rect, selection rects, blink state, and renders.

## Modules

| Module                  | Description                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `lib.rs` (root)         | Core types (`TextEditorState`, `EditingCommand`, `EditDelta`), `apply_command`, UTF-8/UTF-16 helpers, grapheme/word boundary helpers.  |
| `layout`                | `TextLayoutEngine` trait, `LineMetrics`, `CaretRect`, `SelectionRect`.                                                                 |
| `simple_layout`         | `SimpleLayoutEngine` -- monospace, no-wrap engine for deterministic tests.                                                             |
| `skia_layout`           | `SkiaLayoutEngine` -- production engine backed by Skia Paragraph. Per-block architecture with incremental re-layout.                   |
| `history`               | `GenericEditHistory<S>` -- snapshot-based undo/redo with time-based merge grouping.                                                    |
| `attributed_text`       | `AttributedText` -- run-based rich text model with seven enforced structural invariants.                                               |
| `attributed_text::html` | HTML serialization/deserialization for clipboard copy/paste.                                                                           |
| `text_edit_session`     | `TextEditSession` -- bundles state + layout + content + history + blink + scroll. Also defines `KeyAction`, `KeyName`, `ClickTracker`. |
| `selection_rects`       | Selection rect post-processing with `EmptyLineSelectionPolicy`.                                                                        |
| `time`                  | Platform-agnostic `Instant`/`Duration`. Wraps `std::time` on native; tick-based clock on wasm32.                                       |

## Feature Status

### Editing

- [x] Text insertion (IME commit + direct character input)
- [x] Backspace / Delete (grapheme, word, line granularity)
- [x] Enter (newline), Tab (4 spaces)

### Cursor Movement

- [x] Left / Right (grapheme-cluster navigation)
- [x] Up / Down (line-aware, Skia line metrics)
- [x] Home / End (line start / end)
- [x] PageUp / PageDown (visible lines)
- [x] Cmd+Left/Right (line start/end, macOS)
- [x] Cmd+Up/Down (document start/end)
- [x] Option+Left/Right (word jump, macOS)
- [x] Ctrl+Left/Right (word jump, Windows/Linux)

### Selection

- [x] Shift+arrow / Shift+modifier (extend selection)
- [x] Click, drag-to-select, Shift+click
- [x] Double-click (word), triple-click (line), quad-click (document)
- [x] Cmd/Ctrl+A (select all)

### Clipboard

- [x] Copy/Cut (HTML + plain text via `selected_html()`)
- [x] Paste (HTML with formatting or plain text fallback)

### Rich Text

- [x] Bold (variable font `wght` axis)
- [x] Italic (real italic typeface)
- [x] Underline, Strikethrough
- [x] Font size (delta and absolute)
- [x] Font family, text color
- [x] Caret style override (toggle with no selection sets typing style)
- [x] Per-run layout via Skia ParagraphBuilder
- [x] Variable font axis interpolation (wght, opsz)

### History

- [x] Undo / redo (snapshot-based with merge grouping)
- [x] Consecutive typing / backspace / delete merged within 2s timeout
- [x] Paste, newline, IME commit, style changes are discrete steps
- [x] Snapshots capture both text and style runs

### Scroll

- [x] Vertical scroll, auto-scroll to keep cursor visible, clamping
- [x] Scroll anchoring on width reflow (first visible line stays pinned)

### Rendering (host responsibility, session provides data)

- [x] Multiline text with wrapping
- [x] Cursor blink (500ms, resets on input)
- [x] Selection highlight
- [x] Empty-line selection invariant (configurable policy)
- [x] IME composition (preedit inline with underline)

### Not Yet Implemented

- [ ] Visual-order bidi cursor movement

## wasm32 Support

`std::time::Instant` is unavailable on wasm32 targets. The `time` module provides a drop-in replacement:

- **Native:** zero-cost wrapper around `std::time::Instant`.
- **wasm32:** host-driven monotonic clock. Call `Instant::advance(dt)` each frame with the delta from `performance.now()`.

```rust
// In your requestAnimationFrame / event loop callback:
grida_text_edit::time::Instant::advance(frame_dt);
```

Without advancing, every edit becomes a separate undo step (no merge grouping) and the cursor never blinks. The engine remains fully functional otherwise.

## Usage

```rust
use grida_text_edit::{
    text_edit_session::{TextEditSession, KeyAction, KeyName, ClickTracker},
    attributed_text::{AttributedText, TextStyle},
};

// Create a session
let style = TextStyle::default();
let mut session = TextEditSession::new(800.0, 600.0, style);

// Feed keyboard events
let action = KeyAction::from_key(cmd, word, shift, &KeyName::ArrowRight);
if let Some(action) = action {
    session.handle_key_action(action);
}

// Feed pointer events
let count = click_tracker.register(x, y);
session.handle_click(x, y, count, shift);

// Query for rendering
let caret = session.caret_rect();        // CaretRect { x, y, height }
let visible = session.cursor_visible();   // blink state
let scroll = session.scroll_y();
```

Clipboard operations are host-handled:

```rust
// Copy
if let Some(html) = session.selected_html() {
    clipboard.set_html(&html, session.selected_text().unwrap_or(""));
}

// Paste
if let Ok(at) = session.parse_html_paste(&html_string) {
    session.paste_attributed(&at);
}
```

## Dependencies

| Crate                  | Purpose                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `unicode-segmentation` | UAX #29 grapheme cluster and word boundary detection.                     |
| `serde`                | Serialization for `AttributedText`, `TextStyle`, and related types.       |
| `serde_json`           | JSON serialization support.                                               |
| `skia-safe`            | Production text layout via Skia Paragraph (CPU shaping, no GPU required). |

## Testing

```sh
cargo test
```

Tests use `SimpleLayoutEngine` (monospace, no Skia dependency) for deterministic assertions. 231 tests cover editing commands, grapheme handling across scripts (Latin, Arabic, Hebrew, Korean, Devanagari, Thai, emoji), undo/redo, attributed text invariants, HTML round-tripping, and session integration.
