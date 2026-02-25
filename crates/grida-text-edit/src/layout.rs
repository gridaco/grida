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
// Utility: find the line index for a UTF-8 offset
// ---------------------------------------------------------------------------

/// Find which line contains `utf8_offset`.
///
/// Forward-scan: first line where `offset < end_index`.
/// Falls back to the last line when offset is past all end indices.
/// This is the same rule used by `caret_rect_at`.
pub fn line_index_for_offset(metrics: &[LineMetrics], utf8_offset: usize) -> usize {
    metrics
        .iter()
        .position(|lm| utf8_offset < lm.end_index)
        .unwrap_or(metrics.len().saturating_sub(1))
}
