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

use crate::layout::{CaretRect, LineMetrics, SelectionRect, TextLayoutEngine};

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

        let content_end = Self::content_end(lm, text);
        let line_content = &text[lm.start_index..content_end];
        let graphemes: Vec<(usize, &str)> = line_content.grapheme_indices(true).collect();
        let column = ((x / self.char_width).round() as usize).min(graphemes.len());
        if column >= graphemes.len() {
            content_end.min(text.len())
        } else {
            (lm.start_index + graphemes[column].0).min(text.len())
        }
    }

    fn caret_rect_at(&mut self, text: &str, offset: usize) -> CaretRect {
        let metrics = self.compute_metrics(text);
        if metrics.is_empty() {
            return CaretRect { x: 0.0, y: 0.0, height: self.line_height };
        }

        // Forward-scan: first line where offset < end_index.
        let idx = metrics
            .iter()
            .position(|lm| offset < lm.end_index)
            .unwrap_or(metrics.len() - 1);
        let lm = &metrics[idx];

        let x = if offset <= lm.start_index {
            0.0
        } else {
            let before_cursor = &text[lm.start_index..offset];
            let grapheme_count = before_cursor.graphemes(true).count();
            grapheme_count as f32 * self.char_width
        };

        CaretRect {
            x,
            y: lm.baseline - lm.ascent,
            height: lm.ascent + lm.descent,
        }
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

    fn selection_rects_for_range(
        &mut self, text: &str, start: usize, end: usize
    ) -> Vec<SelectionRect> {
        if start >= end {
            return Vec::new();
        }
        let metrics = self.compute_metrics(text);
        let mut rects = Vec::new();

        for lm in &metrics {
            // Does this line overlap [start, end)?
            let line_lo = lm.start_index;
            let line_hi = lm.end_index;
            let overlap_lo = start.max(line_lo);
            let overlap_hi = end.min(line_hi);
            if overlap_lo >= overlap_hi {
                continue;
            }

            let line_y = lm.baseline - lm.ascent;
            let line_h = lm.ascent + lm.descent;

            if lm.is_empty_line() {
                // Empty line: produce a small visible rect at x=0.
                rects.push(SelectionRect {
                    x: 0.0,
                    y: line_y,
                    width: self.char_width * 0.5,
                    height: line_h,
                });
                continue;
            }

            let content_end = Self::content_end(lm, text);
            let line_content = &text[lm.start_index..content_end];

            let x_lo = if overlap_lo <= lm.start_index {
                0.0
            } else {
                let before = &text[lm.start_index..overlap_lo];
                before.chars().count() as f32 * self.char_width
            };

            let x_hi = if overlap_hi >= content_end {
                line_content.chars().count() as f32 * self.char_width
            } else {
                let before = &text[lm.start_index..overlap_hi];
                before.chars().count() as f32 * self.char_width
            };

            rects.push(SelectionRect {
                x: x_lo,
                y: line_y,
                width: (x_hi - x_lo).max(self.char_width * 0.5),
                height: line_h,
            });
        }

        rects
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
