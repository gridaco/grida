use skia_safe::{
    textlayout::{
        FontCollection, Paragraph, ParagraphBuilder, ParagraphStyle,
        RectHeightStyle, RectWidthStyle, TextStyle,
    },
    Color, FontMgr, Point,
};

use super::{
    layout::{CaretRect, LineMetrics, TextLayoutEngine},
    prev_grapheme_boundary, snap_grapheme_boundary,
    utf16_to_utf8_offset, utf8_to_utf16_offset,
};

const DEFAULT_FONT_SIZE: f32 = 18.0;

/// Skia-backed `TextLayoutEngine`.
///
/// Rebuilds the `Paragraph` lazily when text or layout_width changes.
/// No GPU or window required — pure CPU text layout.
pub struct SkiaLayoutEngine {
    pub font_collection: FontCollection,
    pub paragraph: Option<Paragraph>,
    pub layout_width: f32,
    pub layout_height: f32,
    pub font_size: f32,
    cached_text: String,
}

impl SkiaLayoutEngine {
    pub fn new(layout_width: f32, layout_height: f32) -> Self {
        let mut fc = FontCollection::new();
        fc.set_default_font_manager(FontMgr::new(), None);
        Self {
            font_collection: fc,
            paragraph: None,
            layout_width,
            layout_height,
            font_size: DEFAULT_FONT_SIZE,
            cached_text: String::new(),
        }
    }

    pub fn with_font_size(mut self, size: f32) -> Self {
        self.font_size = size;
        self
    }

    pub fn ensure_layout(&mut self, text: &str) {
        if self.paragraph.is_none() || self.cached_text != text {
            self.rebuild(text);
        }
    }

    fn rebuild(&mut self, text: &str) {
        let mut style = ParagraphStyle::new();
        style.set_apply_rounding_hack(false);
        let mut ts = TextStyle::new();
        ts.set_font_size(self.font_size);
        ts.set_color(Color::BLACK);
        ts.set_font_families(&["Menlo", "Courier New", "monospace"]);
        let mut builder = ParagraphBuilder::new(&style, &self.font_collection);
        builder.push_style(&ts);
        builder.add_text(text);
        let mut para = builder.build();
        para.layout(self.layout_width);
        self.paragraph = Some(para);
        self.cached_text = text.to_owned();
    }

    pub fn set_layout_width(&mut self, w: f32) {
        let new_w = w.max(1.0);
        if (new_w - self.layout_width).abs() > 0.5 {
            self.layout_width = new_w;
            self.paragraph = None;
        }
    }

    pub fn set_layout_height(&mut self, h: f32) {
        let new_h = h.max(1.0);
        if (new_h - self.layout_height).abs() > 0.5 {
            self.layout_height = new_h;
        }
    }

    fn para(&mut self, text: &str) -> &Paragraph {
        self.ensure_layout(text);
        self.paragraph.as_ref().unwrap()
    }
}

impl TextLayoutEngine for SkiaLayoutEngine {
    fn line_metrics(&mut self, text: &str) -> Vec<LineMetrics> {
        let skia = self.para(text).get_line_metrics();
        let mut result = Vec::with_capacity(skia.len());
        let mut prev_end: usize = 0;

        for lm in &skia {
            let start = utf16_to_utf8_offset(text, lm.start_index);
            let end = utf16_to_utf8_offset(text, lm.end_including_newline).min(text.len());

            // Skia's phantom/trailing lines can have overlapping or
            // degenerate ranges. Clamp start to never go before the
            // previous line's end, and skip lines that would be empty
            // and overlapping.
            let start = start.max(prev_end);
            let end = end.max(start);

            result.push(LineMetrics {
                start_index: start,
                end_index: end,
                baseline: lm.baseline as f32,
                ascent: lm.ascent as f32,
                descent: lm.descent as f32,
            });
            prev_end = end;
        }

        // If the text ends with \n, ensure there's a phantom line at text.len()
        // so the cursor can be placed on the new empty line.
        if !text.is_empty() && text.ends_with('\n') {
            let last_end = result.last().map_or(0, |lm| lm.end_index);
            if last_end < text.len() || result.last().map_or(true, |lm| lm.start_index < lm.end_index) {
                if last_end <= text.len() {
                    let last = result.last().unwrap();
                    let line_height = last.ascent + last.descent;
                    result.push(LineMetrics {
                        start_index: text.len(),
                        end_index: text.len(),
                        baseline: last.baseline + line_height,
                        ascent: last.ascent,
                        descent: last.descent,
                    });
                }
            }
        }

        result
    }

    fn position_at_point(&mut self, text: &str, x: f32, y: f32) -> usize {
        self.ensure_layout(text);
        let para = self.paragraph.as_ref().unwrap();
        let metrics = para.get_line_metrics();

        for lm in &metrics {
            let top = lm.baseline as f32 - lm.ascent as f32;
            let bot = lm.baseline as f32 + lm.descent as f32;
            if y >= top - 0.5 && y <= bot + 0.5 {
                if lm.end_index.saturating_sub(lm.start_index) <= 1 {
                    return utf16_to_utf8_offset(text, lm.start_index).min(text.len());
                }
                break;
            }
        }

        let pwa = para.get_glyph_position_at_coordinate(Point::new(x, y));
        let raw = utf16_to_utf8_offset(text, pwa.position.max(0) as usize).min(text.len());
        snap_grapheme_boundary(text, raw)
    }

    fn caret_rect_at(&mut self, text: &str, offset: usize) -> CaretRect {
        // Use our own line_metrics() (which includes \n in end_index and
        // fixes phantom-line ranges) so the line lookup is identical to
        // what apply_command uses.
        let metrics = self.line_metrics(text);

        if metrics.is_empty() {
            return CaretRect { x: 0.0, y: 0.0, height: self.font_size };
        }

        let idx = metrics
            .iter()
            .position(|lm| offset < lm.end_index)
            .unwrap_or(metrics.len() - 1);
        let lm = &metrics[idx];

        let y = lm.baseline - lm.ascent;
        let height = lm.ascent + lm.descent;

        let x = if offset <= lm.start_index {
            0.0
        } else {
            self.ensure_layout(text);
            let u16_end = utf8_to_utf16_offset(text, offset);
            let cluster_start = prev_grapheme_boundary(text, offset);
            let u16_start = utf8_to_utf16_offset(text, cluster_start);
            let rects = self.paragraph.as_ref().unwrap().get_rects_for_range(
                u16_start..u16_end,
                RectHeightStyle::Max,
                RectWidthStyle::Tight,
            );
            rects.iter().map(|tb| tb.rect.right()).fold(0.0_f32, f32::max)
        };

        CaretRect { x, y, height }
    }

    fn word_boundary_at(&mut self, text: &str, offset: usize) -> (usize, usize) {
        self.ensure_layout(text);
        let u16_pos = utf8_to_utf16_offset(text, offset) as u32;
        let para = self.paragraph.as_ref().unwrap();
        let range = para.get_word_boundary(u16_pos);
        let start = utf16_to_utf8_offset(text, range.start as usize);
        let end = utf16_to_utf8_offset(text, range.end as usize);
        (start, end)
    }

    fn viewport_height(&self) -> f32 {
        self.layout_height
    }
}
