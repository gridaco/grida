//! `SimpleLayoutEngine` — layout-agnostic engine for deterministic tests.
//!
//! Assumptions:
//! - Each `\n` in the text produces exactly one visual line (no soft wrapping).
//! - All characters have equal width (`char_width`).
//! - Line height is fixed (`line_height = ascent + descent`).
//!
//! These assumptions make geometry trivially computable from the text alone,
//! without any font/shaping dependency.  The engine is intentionally simple
//! and wrong for real rendering — its only purpose is to produce deterministic,
//! inspectable results for unit tests.

use super::{
    layout::{LineMetrics, TextLayoutEngine},
    line_index_for_offset_utf8,
};

use unicode_segmentation::UnicodeSegmentation;

pub struct SimpleLayoutEngine {
    /// Height of the visible viewport (for PageUp / PageDown).
    pub viewport_height: f32,
    /// Fixed height of each line.
    pub line_height: f32,
    /// Fixed width of each character (monospace assumption).
    pub char_width: f32,
}

impl SimpleLayoutEngine {
    pub fn new(viewport_height: f32, line_height: f32, char_width: f32) -> Self {
        Self { viewport_height, line_height, char_width }
    }

    /// Compute line metrics from text by splitting at `\n`.
    /// Returns UTF-8 byte offsets. Does NOT emit a phantom line after a
    /// trailing `\n` (mirrors Skia behavior).
    fn compute_metrics(&self, text: &str) -> Vec<LineMetrics> {
        let mut metrics = Vec::new();
        let mut start = 0usize;
        let mut line_num = 0usize;

        while start <= text.len() {
            // Find next \n
            let next_nl = text[start..].find('\n').map(|i| start + i);

            let (end_excl, has_nl) = match next_nl {
                Some(nl_pos) => (nl_pos + 1, true), // end_index includes the \n
                None => (text.len(), false),
            };

            let baseline = (line_num as f32 + 1.0) * self.line_height - self.line_height * 0.2;
            let ascent = self.line_height * 0.8;
            let descent = self.line_height * 0.2;

            metrics.push(LineMetrics {
                start_index: start,
                end_index: end_excl,
                baseline,
                ascent,
                descent,
            });

            if !has_nl {
                break;
            }

            start = end_excl;
            line_num += 1;
        }

        metrics
    }

    /// The inclusive end of displayable content on a line (before any trailing `\n`).
    fn content_end(lm: &LineMetrics, text: &str) -> usize {
        if lm.end_index > 0
            && lm.end_index <= text.len()
            && text.as_bytes().get(lm.end_index - 1) == Some(&b'\n')
        {
            lm.end_index - 1
        } else {
            lm.end_index
        }
    }
}

impl TextLayoutEngine for SimpleLayoutEngine {
    fn line_metrics(&mut self, text: &str) -> Vec<LineMetrics> {
        self.compute_metrics(text)
    }

    fn position_at_point(&mut self, text: &str, x: f32, y: f32) -> usize {
        let metrics = self.compute_metrics(text);
        if metrics.is_empty() {
            return 0;
        }
        // Map y → line index
        let line_idx = ((y / self.line_height).floor() as usize).min(metrics.len() - 1);
        let lm = &metrics[line_idx];

        if lm.is_empty_line() {
            // Empty line: place cursor at start.
            return lm.start_index;
        }

        // Map x → column (character index within the line).
        // Do NOT apply prev_grapheme_boundary here: column-based offsets are
        // already on character boundaries and the function would shift them back
        // one position when pos happens to equal a grapheme-end.
        let content_end = Self::content_end(lm, text);
        let line_char_len = content_end - lm.start_index;
        let column = ((x / self.char_width).round() as usize).min(line_char_len);
        (lm.start_index + column).min(text.len())
    }

    fn caret_x_at(&mut self, text: &str, offset: usize) -> f32 {
        // Cursor right after \n → x = 0 on new line.
        if offset > 0 && text[..offset].ends_with('\n') {
            return 0.0;
        }
        let metrics = self.compute_metrics(text);
        if metrics.is_empty() {
            return 0.0;
        }
        let line_idx = line_index_for_offset_utf8(&metrics, offset);
        let lm = &metrics[line_idx];
        let column = offset - lm.start_index;
        column as f32 * self.char_width
    }

    fn word_boundary_at(&mut self, text: &str, offset: usize) -> (usize, usize) {
        let offset = offset.min(text.len());
        // Find the word segment that contains `offset`.
        let mut start = 0usize;
        for (byte_idx, segment) in text.split_word_bound_indices() {
            let end = byte_idx + segment.len();
            if byte_idx <= offset && offset < end {
                return (byte_idx, end);
            }
            start = byte_idx;
        }
        // Fallback: return (start_of_last_segment, text.len()).
        (start, text.len())
    }

    fn viewport_height(&self) -> f32 {
        self.viewport_height
    }
}

/// Helper: test-friendly constructor with typical values (18px font, 8px char).
impl SimpleLayoutEngine {
    pub fn default_test() -> Self {
        Self::new(600.0, 24.0, 10.0)
    }
}
