//! Selection rectangle post-processing with the empty-line selection invariant.
//!
//! See `docs/wg/feat-text-editing/index.md` §"Selection geometry policy" for
//! the specification. This module implements the `rect_mode` expansion and
//! trailing phantom line injection described there.
//!
//! The functions here operate on raw Skia `Rect` output and produce expanded
//! rects suitable for rendering. They are used by the example `wd_text_editor`
//! for its own draw pass, and can be reused by any host that wants to render
//! selection highlights with the same policy.

use skia_safe::{
    textlayout::{Paragraph, RectHeightStyle, RectWidthStyle},
    Rect,
};

// ---------------------------------------------------------------------------
// Policy enum
// ---------------------------------------------------------------------------

/// Controls how zero-width and empty-line selection rectangles are expanded.
///
/// See the manifesto §"Selection geometry policy" for full semantics.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum EmptyLineSelectionPolicy {
    /// Raw engine output, no expansion. Zero-width rects remain invisible.
    None,
    /// Expand zero-width rects by a small fixed amount (~0.5× font size).
    /// Non-empty lines keep glyph-tight bounds.
    GlyphRect,
    /// Expand every selected line's rect to the full layout width.
    LineBox,
}

impl Default for EmptyLineSelectionPolicy {
    fn default() -> Self {
        Self::GlyphRect
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Find the visual line index that contains a given Skia UTF-16 offset.
///
/// Scans in reverse so that an offset exactly at a line boundary is attributed
/// to the earlier line (which owns the newline).
pub fn skia_line_index_for_u16_offset(
    metrics: &[skia_safe::textlayout::LineMetrics],
    u16_offset: usize,
) -> usize {
    for (i, lm) in metrics.iter().enumerate().rev() {
        if lm.start_index <= u16_offset {
            return i;
        }
    }
    0
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/// Compute selection rectangles for the UTF-16 range `u16_lo..u16_hi` with
/// the empty-line selection invariant applied according to `policy`.
///
/// # Arguments
///
/// * `paragraph` — The laid-out Skia paragraph.
/// * `text` — The UTF-8 text string corresponding to the paragraph.
/// * `u16_lo` / `u16_hi` — Selection range in UTF-16 code units.
/// * `layout_width` — Available layout width (for `LineBox` expansion).
/// * `font_size` — Font size (for `GlyphRect` expansion width).
/// * `policy` — The expansion policy.
///
/// Returns a `Vec<Rect>` in layout-local coordinates.
pub fn selection_rects_with_policy(
    paragraph: &Paragraph,
    text: &str,
    u16_lo: usize,
    u16_hi: usize,
    layout_width: f32,
    font_size: f32,
    policy: EmptyLineSelectionPolicy,
) -> Vec<Rect> {
    let raw = paragraph.get_rects_for_range(
        u16_lo..u16_hi,
        RectHeightStyle::Max,
        RectWidthStyle::Tight,
    );

    if policy == EmptyLineSelectionPolicy::None {
        return raw.iter().map(|tb| tb.rect).collect();
    }

    let metrics = paragraph.get_line_metrics();

    struct LineBand {
        top: f32,
        bottom: f32,
        left: f32,
        right: f32,
        has_content: bool,
        start_u16: usize,
        end_u16: usize,
    }

    let mut bands: Vec<LineBand> = metrics
        .iter()
        .map(|lm| {
            let top = lm.baseline as f32 - lm.ascent as f32;
            let bot = lm.baseline as f32 + lm.descent as f32;
            LineBand {
                top,
                bottom: bot,
                left: f32::MAX,
                right: f32::MIN,
                has_content: false,
                start_u16: lm.start_index,
                end_u16: lm.end_index,
            }
        })
        .collect();

    for tb in &raw {
        let mid_y = (tb.rect.top + tb.rect.bottom) * 0.5;
        for band in &mut bands {
            if mid_y >= band.top - 0.5 && mid_y <= band.bottom + 0.5 {
                band.left = band.left.min(tb.rect.left);
                band.right = band.right.max(tb.rect.right);
                band.has_content = true;
                break;
            }
        }
    }

    let text_u16_len = text.encode_utf16().count();
    let sel_first_line = skia_line_index_for_u16_offset(&metrics, u16_lo);
    let sel_last_line =
        skia_line_index_for_u16_offset(&metrics, u16_hi.saturating_sub(1).max(u16_lo));

    let mut out: Vec<Rect> = Vec::with_capacity(bands.len());
    for (i, band) in bands.iter().enumerate() {
        if i < sel_first_line || i > sel_last_line {
            continue;
        }
        if !band.has_content {
            let w = match policy {
                EmptyLineSelectionPolicy::GlyphRect => font_size * 0.5,
                EmptyLineSelectionPolicy::LineBox => layout_width,
                EmptyLineSelectionPolicy::None => unreachable!(),
            };
            out.push(Rect::from_ltrb(0.0, band.top, w, band.bottom));
            continue;
        }

        let mut left = band.left;
        let mut right = band.right;
        let is_zero_width = (right - left).abs() < 0.5;

        match policy {
            EmptyLineSelectionPolicy::GlyphRect => {
                if is_zero_width {
                    right = left + font_size * 0.5;
                }
            }
            EmptyLineSelectionPolicy::LineBox => {
                if is_zero_width {
                    left = 0.0;
                    right = layout_width;
                } else {
                    let fully_covered = u16_lo <= band.start_u16 && u16_hi >= band.end_u16;
                    let is_first = i == sel_first_line;
                    let is_last = i == sel_last_line;
                    if fully_covered || (!is_first && !is_last) {
                        left = 0.0;
                        right = layout_width;
                    } else {
                        if is_first && u16_lo <= band.start_u16 {
                            left = 0.0;
                        }
                        if is_last && u16_hi >= band.end_u16 {
                            right = layout_width;
                        }
                        if is_first && !is_last {
                            right = layout_width;
                        }
                        if is_last && !is_first {
                            left = 0.0;
                        }
                    }
                }
            }
            EmptyLineSelectionPolicy::None => unreachable!(),
        }

        out.push(Rect::from_ltrb(left, band.top, right, band.bottom));
    }

    // Trailing phantom line
    if u16_hi >= text_u16_len && text.ends_with('\n') && metrics.len() >= 2 {
        let phantom = &metrics[metrics.len() - 1];
        let top = phantom.baseline as f32 - phantom.ascent as f32;
        let bot = phantom.baseline as f32 + phantom.descent as f32;
        let already_covered = out.iter().any(|r| {
            let mid = (r.top + r.bottom) * 0.5;
            mid >= top - 1.0 && mid <= bot + 1.0
        });
        if !already_covered {
            let w = match policy {
                EmptyLineSelectionPolicy::GlyphRect => font_size * 0.5,
                EmptyLineSelectionPolicy::LineBox => layout_width,
                EmptyLineSelectionPolicy::None => unreachable!(),
            };
            out.push(Rect::from_ltrb(0.0, top, w, bot));
        }
    }

    out
}
