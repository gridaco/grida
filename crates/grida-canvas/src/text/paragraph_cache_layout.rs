//! `ParagraphCacheLayout` — an adapter that implements
//! [`crate::text_edit::ManagedTextLayout`] using the same paragraph-building
//! code path as the scene's [`ParagraphCache`].
//!
//! ## Why this exists
//!
//! The text editing session needs geometry queries (caret position, selection
//! rects, hit testing, word boundaries) that match the **exact** paragraph
//! the Painter renders. Previously, `SkiaLayoutEngine` (from `text_edit`)
//! built its *own* paragraphs with its *own* font configuration — a completely
//! separate code path from `ParagraphCache`. This caused:
//!
//! - **Font fallback mismatch**: CJK text renders correctly (Painter has
//!   fallbacks) but caret positions are wrong (SkiaLayoutEngine measures tofu).
//! - **Layout width divergence**: Painter uses `width: None` for auto-width
//!   nodes (intrinsic sizing); SkiaLayoutEngine used a fixed width.
//! - **Style divergence**: Painter uses `textstyle()` +
//!   `TextStyleRecBuildContext`; SkiaLayoutEngine used `TextConfig` +
//!   `attr_style_to_skia()`.
//!
//! `ParagraphCacheLayout` eliminates all three by building paragraphs with
//! the **same** `textstyle()` function, `FontRepository::font_collection()`,
//! `TextStyleRecBuildContext` (with `user_fallback_fonts`), and intrinsic
//! width logic that `ParagraphCache::measure()` uses.
//!
//! ## Architecture
//!
//! The adapter holds:
//! - Node properties: `TextStyleRec`, `TextAlign`, `node_width`.
//! - A clone of the `FontCollection` from `FontRepository`.
//! - The user fallback font families from `FontRepository`.
//! - The current Skia `Paragraph` (built with the same code as the Painter).
//!
//! When `ensure_layout()` is called, if text or generation changed, the
//! adapter rebuilds the paragraph using `textstyle()` — identical to
//! `ParagraphCache::measure()`. All geometry queries then hit this paragraph.
//!
//! ## Note on `TextTransform`
//!
//! During editing, `text_transform` is **not** applied. The editing engine
//! works with raw text and raw byte offsets. `ParagraphCache::measure()`
//! applies `transform_text()`, but the editing adapter does not, because
//! transforms can change byte lengths (e.g. ß → SS) which would break
//! cursor offset mapping. When the user commits the edit, the scene re-renders
//! the node with `text_transform` applied as normal.

use skia_safe;
use skia_safe::textlayout;

use crate::text_edit::{
    layout::{CaretRect, LineMetrics, ManagedTextLayout, SelectionRect, TextLayoutEngine},
    prev_grapheme_boundary, snap_grapheme_boundary, utf16_to_utf8_offset, utf8_to_utf16_offset,
};

use crate::cg::prelude::*;
use crate::runtime::font_repository::FontRepository;
use crate::text::text_style::textstyle;

// ---------------------------------------------------------------------------
// ParagraphCacheLayout
// ---------------------------------------------------------------------------

/// Adapter that implements [`ManagedTextLayout`] by building paragraphs with
/// the same code path as `ParagraphCache::measure()` — same fonts, same
/// fallback chain, same `TextStyleRecBuildContext`.
///
/// Created once per text editing session (one per `text_edit_enter` call).
pub struct ParagraphCacheLayout {
    // -- Node properties (immutable for the session's lifetime) --
    text_style: TextStyleRec,
    text_align: TextAlign,
    /// `None` = auto-width (intrinsic sizing).
    node_width: Option<f32>,

    // -- Font resources (cloned from FontRepository at session start) --
    font_collection: textlayout::FontCollection,
    /// User fallback font families (e.g. CJK coverage fonts).
    user_fallback_families: Vec<String>,

    // -- Cached paragraph state --
    /// The Skia paragraph built with the same code as the Painter.
    /// Owned exclusively by this adapter — no sharing needed.
    paragraph: Option<textlayout::Paragraph>,
    /// Text content at the time of the last build.
    cached_text: String,
    /// `AttributedText::generation()` seen by the last `ensure_layout`.
    cached_generation: u64,
    /// The layout width currently applied.
    layout_width: f32,
    /// Viewport height (for PageUp/PageDown).
    layout_height: f32,

    // -- Cached line metrics --
    cached_line_metrics: Option<Vec<LineMetrics>>,
}

impl ParagraphCacheLayout {
    /// Create a new adapter for the given text node.
    ///
    /// The `FontRepository` is used to clone the font collection and extract
    /// fallback families. The adapter does NOT hold a reference to the
    /// repository — it takes a snapshot at construction time.
    ///
    /// # Arguments
    ///
    /// * `text_style` — The node's `TextStyleRec` (from the scene graph).
    /// * `text_align` — The node's text alignment.
    /// * `node_width` — The node's explicit width (`None` = auto-width).
    /// * `layout_height` — Container/viewport height.
    /// * `fonts` — The scene's font repository (borrowed for cloning).
    pub fn new(
        text_style: TextStyleRec,
        text_align: TextAlign,
        node_width: Option<f32>,
        layout_height: f32,
        fonts: &FontRepository,
    ) -> Self {
        let layout_width = node_width.unwrap_or(10000.0).max(1.0);
        Self {
            text_style,
            text_align,
            node_width,
            font_collection: fonts.font_collection().clone(),
            user_fallback_families: fonts.user_fallback_families(),
            paragraph: None,
            cached_text: String::new(),
            cached_generation: 0,
            layout_width,
            layout_height: layout_height.max(1.0),
            cached_line_metrics: None,
        }
    }

    /// Build a Skia paragraph using the **same** code path as
    /// `ParagraphCache::measure()`, with **uniform** styling from the
    /// node's `TextStyleRec`.
    ///
    /// Used as the fallback when no `AttributedText` is available (e.g.
    /// for the plain-text `ensure_paragraph` path used by `TextLayoutEngine`
    /// methods).
    fn build_paragraph_uniform(&self, text: &str) -> textlayout::Paragraph {
        let mut paragraph_style = textlayout::ParagraphStyle::new();
        paragraph_style.set_text_direction(textlayout::TextDirection::LTR);
        paragraph_style.set_text_align(self.text_align.into());
        paragraph_style.set_apply_rounding_hack(false);

        let ctx = TextStyleRecBuildContext {
            color: CGColor::TRANSPARENT,
            user_fallback_fonts: self.user_fallback_families.clone(),
        };
        let mut builder =
            textlayout::ParagraphBuilder::new(&paragraph_style, &self.font_collection);
        let ts = textstyle(&self.text_style, &Some(ctx));
        builder.push_style(&ts);
        builder.add_text(text);
        let para = builder.build();
        builder.pop();
        para
    }

    /// Build a Skia paragraph with **per-run** styling from `AttributedText`.
    ///
    /// Each run's `TextStyle` is converted to a canvas `TextStyleRec` via
    /// the bidirectional conversion in `attributed_text_conv`, then passed
    /// through the same `textstyle()` function the Painter uses. This
    /// ensures bold, italic, font size, color, and other per-run properties
    /// are visually rendered during editing.
    ///
    /// Falls back to uniform styling if no runs overlap the text range.
    fn build_paragraph_attributed(
        &self,
        content: &crate::text_edit::attributed_text::AttributedText,
    ) -> textlayout::Paragraph {
        let text = content.text();
        let runs = content.runs();

        let mut paragraph_style = textlayout::ParagraphStyle::new();
        paragraph_style.set_text_direction(textlayout::TextDirection::LTR);
        paragraph_style.set_text_align(self.text_align.into());
        paragraph_style.set_apply_rounding_hack(false);

        let mut builder =
            textlayout::ParagraphBuilder::new(&paragraph_style, &self.font_collection);

        if runs.is_empty() || text.is_empty() {
            // No runs — fall back to uniform node style.
            let ctx = Some(TextStyleRecBuildContext {
                color: CGColor::TRANSPARENT,
                user_fallback_fonts: self.user_fallback_families.clone(),
            });
            let ts = textstyle(&self.text_style, &ctx);
            builder.push_style(&ts);
            builder.add_text(text);
        } else {
            for run in runs {
                let run_start = run.start as usize;
                let run_end = run.end as usize;
                if run_start >= run_end || run_end > text.len() {
                    continue;
                }
                // Convert attributed TextStyle → canvas TextStyleRec → Skia TextStyle.
                let run_rec: TextStyleRec = (&run.style).into();
                let ctx = Some(TextStyleRecBuildContext {
                    color: CGColor::TRANSPARENT,
                    user_fallback_fonts: self.user_fallback_families.clone(),
                });
                let mut ts = textstyle(&run_rec, &ctx);
                // Apply the run's fill color (textstyle() doesn't handle fill).
                // For layout/measurement, extract the first solid color.
                // Full paint stacks are rendered by the cg painter separately.
                if let Some(color) = run.style.fills.iter().find_map(|p| p.solid_color()) {
                    ts.set_color(skia_safe::Color::from_argb(
                        color.a, color.r, color.g, color.b,
                    ));
                }
                builder.push_style(&ts);
                builder.add_text(&text[run_start..run_end]);
            }
        }

        let para = builder.build();
        para
    }

    /// Build and layout the paragraph with **per-run** attributed styling,
    /// handling intrinsic width for auto-width nodes (same logic as
    /// `ParagraphCache::compute_measurements`).
    fn rebuild_attributed(
        &mut self,
        content: &crate::text_edit::attributed_text::AttributedText,
    ) {
        let text = content.text();
        let mut para = self.build_paragraph_attributed(content);

        let layout_width = if let Some(width) = self.node_width {
            width
        } else {
            para.layout(f32::INFINITY);
            let intrinsic = para.max_intrinsic_width();
            if intrinsic < 1.0 { 1.0 } else { intrinsic }
        };

        para.layout(layout_width);
        self.layout_width = layout_width.max(1.0);
        self.paragraph = Some(para);
        self.cached_text = text.to_owned();
        self.cached_line_metrics = None;
    }

    /// Build and layout the paragraph with **uniform** node styling,
    /// handling intrinsic width for auto-width nodes.
    ///
    /// Used by the plain-text `ensure_paragraph` path (for `TextLayoutEngine`
    /// methods that receive `&str` instead of `AttributedText`).
    fn rebuild_uniform(&mut self, text: &str) {
        let mut para = self.build_paragraph_uniform(text);

        let layout_width = if let Some(width) = self.node_width {
            width
        } else {
            para.layout(f32::INFINITY);
            let intrinsic = para.max_intrinsic_width();
            if intrinsic < 1.0 { 1.0 } else { intrinsic }
        };

        para.layout(layout_width);
        self.layout_width = layout_width.max(1.0);
        self.paragraph = Some(para);
        self.cached_text = text.to_owned();
        self.cached_line_metrics = None;
    }

    /// Ensure the paragraph is built for the given text (uniform style).
    fn ensure_paragraph(&mut self, text: &str) {
        if self.paragraph.is_some() && self.cached_text == text {
            return;
        }
        self.rebuild_uniform(text);
    }

    /// Convert Skia's UTF-16 line metrics to UTF-8.
    fn compute_line_metrics(&self, text: &str) -> Vec<LineMetrics> {
        let para = match &self.paragraph {
            Some(p) => p,
            None => return vec![],
        };
        let skia_metrics = para.get_line_metrics();

        if skia_metrics.is_empty() {
            return vec![LineMetrics {
                start_index: 0,
                end_index: 0,
                baseline: self.text_style.font_size,
                ascent: self.text_style.font_size,
                descent: self.text_style.font_size * 0.2,
                left: 0.0,
            }];
        }

        let mut result = Vec::with_capacity(skia_metrics.len());
        let mut run_u16: usize = 0;
        let mut run_byte: usize = 0;
        let mut char_iter = text.char_indices().peekable();

        for lm in &skia_metrics {
            let start_u8 = incremental_u16_to_u8(
                lm.start_index,
                text,
                &mut run_u16,
                &mut run_byte,
                &mut char_iter,
            );
            let end_u8 = incremental_u16_to_u8(
                lm.end_including_newline,
                text,
                &mut run_u16,
                &mut run_byte,
                &mut char_iter,
            )
            .min(text.len());

            result.push(LineMetrics {
                start_index: start_u8,
                end_index: end_u8,
                baseline: lm.baseline as f32,
                ascent: lm.ascent as f32,
                descent: lm.descent as f32,
                left: lm.left as f32,
            });
        }

        // Trailing newline phantom line.
        if text.ends_with('\n') && !text.is_empty() {
            let needs_phantom = result
                .last()
                .map(|last| last.start_index < text.len())
                .unwrap_or(true);
            if needs_phantom {
                let (ascent, descent) = result
                    .last()
                    .map(|last| (last.ascent, last.descent))
                    .unwrap_or((self.text_style.font_size, self.text_style.font_size * 0.2));
                let baseline = result
                    .last()
                    .map(|last| last.baseline + last.descent + ascent)
                    .unwrap_or(ascent);
                result.push(LineMetrics {
                    start_index: text.len(),
                    end_index: text.len(),
                    baseline,
                    ascent,
                    descent,
                    left: empty_line_left(&self.text_align, self.layout_width),
                });
            }
        }

        result
    }

    /// Height of the laid-out paragraph content (in layout-local pixels).
    ///
    /// This is the *content* height (from `Paragraph::height()`), NOT the
    /// container height. Use this for vertical alignment offset calculations.
    pub fn paragraph_height(&self) -> f32 {
        self.paragraph
            .as_ref()
            .map(|p| p.height())
            .unwrap_or(self.text_style.font_size)
    }

    /// Get or compute cached line metrics.
    fn line_metrics_cached(&mut self, text: &str) -> Vec<LineMetrics> {
        self.ensure_paragraph(text);
        if let Some(ref cached) = self.cached_line_metrics {
            return cached.clone();
        }
        let metrics = self.compute_line_metrics(text);
        self.cached_line_metrics = Some(metrics.clone());
        metrics
    }
}

// ---------------------------------------------------------------------------
// TextLayoutEngine
// ---------------------------------------------------------------------------

impl TextLayoutEngine for ParagraphCacheLayout {
    fn line_metrics(&mut self, text: &str) -> Vec<LineMetrics> {
        self.line_metrics_cached(text)
    }

    fn position_at_point(&mut self, text: &str, x: f32, y: f32) -> usize {
        // Check empty lines first.
        let metrics = self.line_metrics_cached(text);
        for lm in &metrics {
            let top = lm.baseline - lm.ascent;
            let bot = lm.baseline + lm.descent;
            if y >= top - 0.5 && y <= bot + 0.5 && lm.is_empty_line(text) {
                return lm.start_index;
            }
        }

        let para = match &self.paragraph {
            Some(p) => p,
            None => return 0,
        };
        let pwa =
            para.get_glyph_position_at_coordinate(skia_safe::Point::new(x, y));
        let raw_u16 = pwa.position.max(0) as usize;
        let raw_u8 = utf16_to_utf8_offset(text, raw_u16).min(text.len());
        snap_grapheme_boundary(text, raw_u8)
    }

    fn caret_rect_at(&mut self, text: &str, offset: usize) -> CaretRect {
        let metrics = self.line_metrics_cached(text);
        if metrics.is_empty() {
            return CaretRect {
                x: 0.0,
                y: 0.0,
                height: self.text_style.font_size,
            };
        }

        let idx = metrics
            .iter()
            .position(|lm| offset < lm.end_index)
            .unwrap_or(metrics.len() - 1);
        let lm = &metrics[idx];

        let y = lm.baseline - lm.ascent;
        let height = lm.ascent + lm.descent;

        let x = if offset <= lm.start_index {
            lm.left
        } else {
            let para = match &self.paragraph {
                Some(p) => p,
                None => return CaretRect { x: lm.left, y, height },
            };

            let u16_end = utf8_to_utf16_offset(text, offset);
            let cluster_start = if offset > 0 {
                prev_grapheme_boundary(text, offset)
            } else {
                0
            };
            let u16_start = utf8_to_utf16_offset(text, cluster_start);
            let rects = para.get_rects_for_range(
                u16_start..u16_end,
                textlayout::RectHeightStyle::Max,
                textlayout::RectWidthStyle::Tight,
            );
            rects
                .iter()
                .map(|tb| tb.rect.right())
                .fold(0.0_f32, f32::max)
        };

        CaretRect { x, y, height }
    }

    fn word_boundary_at(&mut self, text: &str, offset: usize) -> (usize, usize) {
        self.ensure_paragraph(text);
        let para = match &self.paragraph {
            Some(p) => p,
            None => return (0, 0),
        };
        let u16_pos = utf8_to_utf16_offset(text, offset) as u32;
        let range = para.get_word_boundary(u16_pos);
        let start = utf16_to_utf8_offset(text, range.start);
        let end = utf16_to_utf8_offset(text, range.end);
        (start, end)
    }

    fn selection_rects_for_range(
        &mut self,
        text: &str,
        start: usize,
        end: usize,
    ) -> Vec<SelectionRect> {
        if start >= end {
            return Vec::new();
        }
        let metrics = self.line_metrics_cached(text);
        if metrics.is_empty() {
            return Vec::new();
        }

        self.ensure_paragraph(text);
        let para = match &self.paragraph {
            Some(p) => p,
            None => return Vec::new(),
        };

        let u16_lo = utf8_to_utf16_offset(text, start);
        let u16_hi = utf8_to_utf16_offset(text, end);
        let raw = para.get_rects_for_range(
            u16_lo..u16_hi,
            textlayout::RectHeightStyle::Max,
            textlayout::RectWidthStyle::Tight,
        );

        let mut rects: Vec<SelectionRect> = raw
            .iter()
            .map(|tb| SelectionRect {
                x: tb.rect.left(),
                y: tb.rect.top(),
                width: (tb.rect.right() - tb.rect.left()).max(0.0),
                height: (tb.rect.bottom() - tb.rect.top()).max(0.0),
            })
            .collect();

        // Empty-line invariant.
        let first_line = crate::text_edit::line_index_for_offset_utf8(&metrics, start);
        let last_line = crate::text_edit::line_index_for_offset_utf8(
            &metrics,
            end.saturating_sub(1).max(start),
        );

        for lm in metrics.iter().take(last_line + 1).skip(first_line) {
            if !lm.is_empty_line(text) {
                continue;
            }
            let mid_y = lm.baseline - lm.ascent * 0.5;
            let already = rects
                .iter()
                .any(|r| r.y <= mid_y && mid_y <= r.y + r.height);
            if !already {
                rects.push(SelectionRect {
                    x: lm.left,
                    y: lm.baseline - lm.ascent,
                    width: self.text_style.font_size * 0.5,
                    height: lm.ascent + lm.descent,
                });
            }
        }

        rects
    }

    fn viewport_height(&self) -> f32 {
        self.layout_height
    }
}

// ---------------------------------------------------------------------------
// ManagedTextLayout
// ---------------------------------------------------------------------------

impl ManagedTextLayout for ParagraphCacheLayout {
    fn ensure_layout(&mut self, content: &crate::text_edit::attributed_text::AttributedText) {
        let gen = content.generation();
        let text = content.text();
        if self.paragraph.is_some()
            && self.cached_text == text
            && self.cached_generation == gen
        {
            return;
        }
        self.cached_generation = gen;
        self.rebuild_attributed(content);
    }

    fn invalidate(&mut self) {
        self.paragraph = None;
        self.cached_text.clear();
        self.cached_generation = 0;
        self.cached_line_metrics = None;
    }

    fn layout_width(&self) -> f32 {
        self.layout_width
    }

    fn layout_height(&self) -> f32 {
        self.layout_height
    }

    fn set_layout_width(&mut self, width: f32) {
        let new_w = width.max(1.0);
        if (new_w - self.layout_width).abs() > 0.5 {
            self.layout_width = new_w;
            self.invalidate();
        }
    }

    fn set_layout_height(&mut self, height: f32) {
        let new_h = height.max(1.0);
        if (new_h - self.layout_height).abs() > 0.5 {
            self.layout_height = new_h;
        }
    }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/// Advance a running UTF-16/UTF-8 cursor to the target UTF-16 offset.
fn incremental_u16_to_u8(
    target_u16: usize,
    text: &str,
    run_u16: &mut usize,
    run_byte: &mut usize,
    iter: &mut std::iter::Peekable<std::str::CharIndices>,
) -> usize {
    while *run_u16 < target_u16 {
        if let Some(&(byte_idx, ch)) = iter.peek() {
            *run_u16 += ch.len_utf16();
            *run_byte = byte_idx + ch.len_utf8();
            iter.next();
        } else {
            break;
        }
    }
    (*run_byte).min(text.len())
}

/// X offset for an empty line given alignment and layout width.
fn empty_line_left(align: &TextAlign, layout_width: f32) -> f32 {
    match align {
        TextAlign::Left => 0.0,
        TextAlign::Center => layout_width / 2.0,
        TextAlign::Right => layout_width,
        _ => 0.0,
    }
}
