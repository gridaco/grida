/// Layout-agnostic line metrics.
///
/// All offsets are **UTF-8 byte offsets** into the text string.
/// `end_index` is exclusive and includes the trailing `\n` when one exists.
#[derive(Clone, Debug, PartialEq)]
pub struct LineMetrics {
    /// UTF-8 byte offset of the first character in this visual line.
    pub start_index: usize,
    /// UTF-8 byte offset one past the last character (includes the `\n` terminator, if any).
    pub end_index: usize,
    /// Y coordinate of the text baseline, in layout-local space.
    pub baseline: f32,
    /// Distance above baseline to the top of the line.
    pub ascent: f32,
    /// Distance below baseline to the bottom of the line.
    pub descent: f32,
    /// X offset of the line's left edge in layout-local space.
    ///
    /// For left-aligned text this is `0.0`. For center-aligned text it is
    /// `(layout_width - content_width) / 2`, etc. Comes from Skia's
    /// `LineMetrics::left` field; `SimpleLayoutEngine` always sets `0.0`.
    pub left: f32,
}

impl LineMetrics {
    /// Returns `true` when the line contains no glyph content (only a newline terminator,
    /// or a zero-length phantom line after a trailing newline).
    pub fn is_empty_line(&self, text: &str) -> bool {
        if self.start_index >= self.end_index {
            return true;
        }
        text.get(self.start_index..self.end_index) == Some("\n")
    }

    /// Top of this line's band (layout-local y).
    pub fn top(&self) -> f32 {
        self.baseline - self.ascent
    }

    /// Bottom of this line's band (layout-local y).
    pub fn bottom(&self) -> f32 {
        self.baseline + self.descent
    }
}

/// Default caret width in screen pixels.
///
/// Renderers (Skia overlay, WASM FFI, etc.) should use this constant as
/// the default caret width unless the caller overrides it.
pub const DEFAULT_CARET_WIDTH: f32 = 2.0;

/// Caret geometry returned by [`TextLayoutEngine::caret_rect_at`].
///
/// All coordinates are in **layout-local space** (origin at top-left of the
/// text layout box).
#[derive(Clone, Debug, PartialEq)]
pub struct CaretRect {
    /// X coordinate of the caret (left edge).
    pub x: f32,
    /// Y coordinate of the top of the caret.
    pub y: f32,
    /// Height of the caret (covers one line).
    pub height: f32,
}

/// A single rectangle in the selection highlight geometry.
///
/// All coordinates are in **layout-local space**.
/// A selection may span multiple rects when it crosses line breaks.
#[derive(Clone, Debug, PartialEq)]
pub struct SelectionRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// Abstract geometry provider.
///
/// Implementations include:
/// - `SimpleLayoutEngine` – monospace, no wrapping; used for deterministic tests.
/// - `SkiaLayoutEngine` – real shaping via Skia Paragraph (in `wd_text_editor`).
///
/// All offsets exchanged through this trait are **UTF-8 byte offsets**.
pub trait TextLayoutEngine {
    /// Compute visual line metrics for the given text.
    fn line_metrics(&mut self, text: &str) -> Vec<LineMetrics>;

    /// Map a layout-local point `(x, y)` to the nearest valid cursor position
    /// (UTF-8 byte offset, on a grapheme boundary).
    ///
    /// Implementations MUST handle empty lines correctly: a point that falls
    /// within an empty line's y-band should return the start of that line.
    fn position_at_point(&mut self, text: &str, x: f32, y: f32) -> usize;

    /// Return the full caret rectangle for the cursor at `offset`.
    ///
    /// The line that owns the cursor is determined by the forward-scan rule:
    /// the first line where `offset < end_index`, falling back to the last
    /// line when `offset >= all end indices` (e.g. cursor at text end).
    fn caret_rect_at(&mut self, text: &str, offset: usize) -> CaretRect;

    /// Return selection highlight rectangles for the range `[start, end)`.
    ///
    /// A selection spanning multiple lines produces multiple rects (one per
    /// visual line or line fragment). Empty-line invariant: every selected
    /// line produces at least one visible rect even if it has no glyphs.
    fn selection_rects_for_range(
        &mut self, text: &str, start: usize, end: usize
    ) -> Vec<SelectionRect>;

    /// Return the x coordinate (layout-local) of the caret at `offset`.
    ///
    /// Default implementation delegates to `caret_rect_at`.
    fn caret_x_at(&mut self, text: &str, offset: usize) -> f32 {
        self.caret_rect_at(text, offset).x
    }

    /// Return `(word_start, word_end)` for the word that contains `offset`.
    /// Both bounds are UTF-8 byte offsets.
    fn word_boundary_at(&mut self, text: &str, offset: usize) -> (usize, usize);

    /// Height of the visible viewport, used for PageUp / PageDown.
    fn viewport_height(&self) -> f32;
}

// ---------------------------------------------------------------------------
// ManagedTextLayout — layout lifecycle trait
// ---------------------------------------------------------------------------

/// Extended layout engine trait that adds lifecycle management.
///
/// `TextLayoutEngine` provides read-only geometry queries (caret position,
/// selection rects, etc.). `ManagedTextLayout` extends it with layout
/// invalidation, rebuild, and sizing — everything `TextEditSession` needs
/// to orchestrate the full editing loop.
///
/// Implementors:
/// - `SimpleLayoutEngine` — trivial no-ops (test-only, monospace).
/// - `SkiaLayoutEngine` — Skia Paragraph per-block layout (behind `skia` feature).
/// - Canvas-side adapters — delegate to the scene's paragraph cache.
pub trait ManagedTextLayout: TextLayoutEngine {
    /// Ensure layout is up-to-date for the given attributed text.
    ///
    /// Implementations may cache and skip rebuild if content hasn't changed
    /// (e.g. by checking `AttributedText::generation()`).
    fn ensure_layout(&mut self, content: &super::attributed_text::AttributedText);

    /// Invalidate all cached layout. The next `ensure_layout` call will
    /// rebuild from scratch.
    fn invalidate(&mut self);

    /// The current layout width (the wrap boundary).
    fn layout_width(&self) -> f32;

    /// The current layout height (viewport/container height).
    fn layout_height(&self) -> f32;

    /// Update layout width. Implementations should invalidate if changed.
    fn set_layout_width(&mut self, width: f32);

    /// Update layout height.
    fn set_layout_height(&mut self, height: f32);
}

// ---------------------------------------------------------------------------
// Utility: find the line index for a UTF-8 offset
// ---------------------------------------------------------------------------

/// Find which line contains `utf8_offset`.
///
/// Uses binary search on `end_index` (which is monotonically non-decreasing).
/// Semantics: returns the first line where `offset < end_index`.
/// Falls back to the last line when offset is past all end indices.
/// This is the same rule used by `caret_rect_at`.
pub fn line_index_for_offset(metrics: &[LineMetrics], utf8_offset: usize) -> usize {
    if metrics.is_empty() {
        return 0;
    }
    // partition_point returns the first index where the predicate is false,
    // i.e. the first line where end_index > utf8_offset.
    let idx = metrics.partition_point(|lm| lm.end_index <= utf8_offset);
    idx.min(metrics.len() - 1)
}
