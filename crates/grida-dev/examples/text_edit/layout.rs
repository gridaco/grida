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
    /// Returns `true` when the line contains no glyph content (only a newline terminator).
    pub fn is_empty_line(&self) -> bool {
        self.end_index.saturating_sub(self.start_index) <= 1
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

    /// Return the x coordinate (layout-local) of the caret at `offset`.
    fn caret_x_at(&mut self, text: &str, offset: usize) -> f32;

    /// Return `(word_start, word_end)` for the word that contains `offset`.
    /// Both bounds are UTF-8 byte offsets.
    fn word_boundary_at(&mut self, text: &str, offset: usize) -> (usize, usize);

    /// Height of the visible viewport, used for PageUp / PageDown.
    fn viewport_height(&self) -> f32;
}

// ---------------------------------------------------------------------------
// Utility: find the line index for a UTF-8 offset
// ---------------------------------------------------------------------------

/// Find which line index contains `utf8_offset`.
///
/// Scans from the last line backwards: `start_index <= offset` correctly maps
/// a cursor at the start of line N to line N (not N-1).
pub fn line_index_for_offset(metrics: &[LineMetrics], utf8_offset: usize) -> usize {
    for (i, lm) in metrics.iter().enumerate().rev() {
        if lm.start_index <= utf8_offset {
            return i;
        }
    }
    0
}
