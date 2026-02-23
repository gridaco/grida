use skia_safe::{
    self as skia_safe,
    textlayout::{
        FontCollection, Paragraph, ParagraphBuilder, ParagraphStyle,
        RectHeightStyle, RectWidthStyle, TextStyle, TypefaceFontProvider,
    },
    Color, FontMgr, Point,
};

use crate::{
    layout::{CaretRect, LineMetrics, SelectionRect, TextLayoutEngine},
    line_index_for_offset_utf8,
    prev_grapheme_boundary, snap_grapheme_boundary,
    utf16_to_utf8_offset, utf8_to_utf16_offset,
};

const DEFAULT_FONT_SIZE: f32 = 18.0;

/// Horizontal text alignment.
#[derive(Clone, Debug, PartialEq, Default)]
pub enum TextAlign {
    #[default]
    Left,
    Center,
    Right,
    Justify,
}

impl TextAlign {
    fn to_skia(&self) -> skia_safe::textlayout::TextAlign {
        match self {
            Self::Left    => skia_safe::textlayout::TextAlign::Left,
            Self::Center  => skia_safe::textlayout::TextAlign::Center,
            Self::Right   => skia_safe::textlayout::TextAlign::Right,
            Self::Justify => skia_safe::textlayout::TextAlign::Justify,
        }
    }
}

/// Configuration for the Skia text layout paragraph.
///
/// Host-agnostic: the host (WASM app, winit, etc.) supplies font, size, align,
/// and optional text color so the editor can match the "real" text appearance.
#[derive(Clone, Debug)]
pub struct TextConfig {
    /// Font family names in priority order. Use **explicit** names (e.g. `"Geist"`, `"Inter"`).
    /// On WASM there are no system fonts; generic names like `"monospace"` or `"sans-serif"` are
    /// not valid. The host must pass names that have been registered with the layout engine
    /// (e.g. via `add_font_bytes`) so the first available family in this list is used.
    pub font_families: Vec<String>,
    /// Font size in layout-local points.
    pub font_size: f32,
    /// Horizontal paragraph alignment.
    pub text_align: TextAlign,
    /// Line height multiplier (1.0 = normal). `None` uses Skia's default.
    pub line_height: Option<f32>,
    /// Additional letter spacing in points. `None` uses Skia's default.
    pub letter_spacing: Option<f32>,
    /// Text fill color. `None` means use black (default); host sets this to
    /// match the node's fill so overlay text matches the real text.
    pub text_color: Option<Color>,
    /// When true, use italic slant; otherwise upright. Must match the node so the overlay
    /// doesn't show the wrong variant (e.g. Inter italic when the node is upright).
    pub font_style_italic: bool,
    /// Font weight (1–1000). Typical: 400 = normal, 700 = bold. Host passes node's weight.
    pub font_weight: u32,
}

impl Default for TextConfig {
    fn default() -> Self {
        Self {
            font_families: vec![
                "Menlo".into(),
                "Courier New".into(),
                "monospace".into(),
            ],
            font_size: DEFAULT_FONT_SIZE,
            text_align: TextAlign::Left,
            line_height: None,
            letter_spacing: None,
            text_color: None,
            font_style_italic: false,
            font_weight: 400,
        }
    }
}

/// Skia-backed `TextLayoutEngine`.
///
/// Rebuilds the `Paragraph` lazily when text or layout_width changes.
/// No GPU or window required — pure CPU text layout.
pub struct SkiaLayoutEngine {
    pub font_collection: FontCollection,
    pub paragraph: Option<Paragraph>,
    pub layout_width: f32,
    pub layout_height: f32,
    /// Convenience accessor — mirrors `config.font_size`.
    pub font_size: f32,
    pub config: TextConfig,
    cached_text: String,
}

impl SkiaLayoutEngine {
    pub fn new(layout_width: f32, layout_height: f32) -> Self {
        Self::new_with_config(layout_width, layout_height, TextConfig::default())
    }

    pub fn new_with_config(layout_width: f32, layout_height: f32, config: TextConfig) -> Self {
        let mut fc = FontCollection::new();
        fc.set_default_font_manager(FontMgr::new(), None);
        let font_size = config.font_size;
        Self {
            font_collection: fc,
            paragraph: None,
            layout_width,
            layout_height,
            font_size,
            config,
            cached_text: String::new(),
        }
    }

    /// Convenience builder for changing font size without a full config.
    pub fn with_font_size(mut self, size: f32) -> Self {
        self.config.font_size = size;
        self.font_size = size;
        self.paragraph = None;
        self
    }

    pub fn ensure_layout(&mut self, text: &str) {
        if self.paragraph.is_none() || self.cached_text != text {
            self.rebuild(text);
        }
    }

    fn rebuild(&mut self, text: &str) {
        let mut para_style = ParagraphStyle::new();
        para_style.set_apply_rounding_hack(false);
        para_style.set_text_align(self.config.text_align.to_skia());

        let mut ts = TextStyle::new();
        ts.set_font_size(self.config.font_size);
        ts.set_color(self.config.text_color.unwrap_or(Color::BLACK));
        let families: Vec<&str> = self.config.font_families.iter().map(|s| s.as_str()).collect();
        ts.set_font_families(&families);
        let slant = if self.config.font_style_italic {
            skia_safe::font_style::Slant::Italic
        } else {
            skia_safe::font_style::Slant::Upright
        };
        let weight = skia_safe::font_style::Weight::from(self.config.font_weight as i32);
        let font_style = skia_safe::FontStyle::new(weight, skia_safe::font_style::Width::NORMAL, slant);
        ts.set_font_style(font_style);
        if let Some(ls) = self.config.letter_spacing {
            ts.set_letter_spacing(ls);
        }
        if let Some(lh) = self.config.line_height {
            let mut strut = skia_safe::textlayout::StrutStyle::new();
            strut.set_strut_enabled(true);
            strut.set_force_strut_height(true);
            strut.set_height(lh);
            para_style.set_strut_style(strut);
        }

        let mut builder = ParagraphBuilder::new(&para_style, &self.font_collection);
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

    /// Register a font from raw TTF/OTF bytes.
    ///
    /// In environments where system fonts are unavailable (e.g. WASM/browser)
    /// this is the only way to give Skia a font to shape with.
    pub fn add_font_bytes(&mut self, family: &str, bytes: &[u8]) {
        let loader = FontMgr::new();
        if let Some(tf) = loader.new_from_data(bytes, None) {
            let mut provider = TypefaceFontProvider::new();
            provider.register_typeface(tf, Some(family));
            self.font_collection.set_asset_font_manager(Some(provider.into()));
        }
        self.paragraph = None;
    }

    /// Invalidate the cached paragraph so the next layout call rebuilds.
    /// Call this after modifying `font_collection` externally.
    pub fn invalidate(&mut self) {
        self.paragraph = None;
    }

    fn para(&mut self, text: &str) -> &Paragraph {
        self.ensure_layout(text);
        self.paragraph.as_ref().unwrap()
    }

    /// Paint the laid-out paragraph at (0, 0). Used by the host to draw the
    /// current session text (and optional preedit) so typed content appears
    /// immediately without waiting for document commit.
    pub fn paint_paragraph(&mut self, canvas: &skia_safe::Canvas, text: &str) {
        let para = self.para(text);
        para.paint(canvas, Point::new(0.0, 0.0));
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

    fn selection_rects_for_range(
        &mut self, text: &str, start: usize, end: usize
    ) -> Vec<SelectionRect> {
        if start >= end {
            return Vec::new();
        }
        let metrics = self.line_metrics(text);
        if metrics.is_empty() {
            return Vec::new();
        }
        self.ensure_layout(text);
        let para = self.paragraph.as_ref().unwrap();

        let u16_lo = utf8_to_utf16_offset(text, start);
        let u16_hi = utf8_to_utf16_offset(text, end);

        let raw = para.get_rects_for_range(
            u16_lo..u16_hi,
            skia_safe::textlayout::RectHeightStyle::Max,
            skia_safe::textlayout::RectWidthStyle::Tight,
        );

        let mut rects: Vec<SelectionRect> = raw.iter().map(|tb| SelectionRect {
            x: tb.rect.left(),
            y: tb.rect.top(),
            width: (tb.rect.right() - tb.rect.left()).max(0.0),
            height: (tb.rect.bottom() - tb.rect.top()).max(0.0),
        }).collect();

        // Empty-line invariant: every selected line must have a visible rect.
        let first_line = line_index_for_offset_utf8(&metrics, start);
        let last_line = line_index_for_offset_utf8(&metrics, end.saturating_sub(1).max(start));

        for idx in first_line..=last_line {
            let lm = &metrics[idx];
            if !lm.is_empty_line() { continue; }
            let mid_y = lm.baseline - lm.ascent * 0.5;
            let already = rects.iter().any(|r| {
                r.y <= mid_y && mid_y <= r.y + r.height
            });
            if !already {
                rects.push(SelectionRect {
                    x: 0.0,
                    y: lm.baseline - lm.ascent,
                    width: self.font_size * 0.5,
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
