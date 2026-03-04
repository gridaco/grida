use skia_safe::{
    self as skia_safe,
    textlayout::{
        FontCollection, Paragraph, ParagraphBuilder, ParagraphStyle,
        RectHeightStyle, RectWidthStyle, TextDecoration, TextStyle, TypefaceFontProvider,
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

// ---------------------------------------------------------------------------
// Per-paragraph layout block
// ---------------------------------------------------------------------------

/// A laid-out hard paragraph (text between `\n` boundaries).
///
/// Each block owns its own Skia `Paragraph` object and caches UTF-8 line
/// metrics. On edit, only the affected block is rebuilt — all others retain
/// their cached layout.
struct ParaBlock {
    /// UTF-8 byte offset of this block's first character in the full text.
    byte_start: usize,
    /// UTF-8 byte offset one past the last character (inclusive of trailing `\n`).
    byte_end: usize,
    /// Laid-out Skia paragraph for this block's text slice.
    paragraph: Paragraph,
    /// Cumulative y-offset (top of this block in layout-local space).
    y_offset: f32,
    /// Total height of this block (sum of all visual lines).
    height: f32,
    /// Pre-converted UTF-8 line metrics for this block. Offsets are relative to
    /// the **full text** (not the block slice), so callers don't need to adjust.
    line_metrics: Vec<LineMetrics>,
}

/// Skia-backed `TextLayoutEngine`.
///
/// Internally splits text on hard line breaks (`\n`) and maintains one Skia
/// `Paragraph` per block. On edit, only the affected block is rebuilt.
/// No GPU or window required — pure CPU text layout.
pub struct SkiaLayoutEngine {
    pub font_collection: FontCollection,
    /// Legacy single-paragraph field kept for external access (e.g. `wd_text_editor`
    /// preedit mode which builds its own paragraph). **Not used** by the
    /// per-block layout path.
    pub paragraph: Option<Paragraph>,
    pub layout_width: f32,
    pub layout_height: f32,
    /// Convenience accessor — mirrors `config.font_size`.
    pub font_size: f32,
    pub config: TextConfig,
    cached_text: String,
    /// Persistent font provider accumulating all registered typefaces.
    font_provider: TypefaceFontProvider,

    // --- Per-block layout state ---
    /// Laid-out paragraph blocks (one per hard paragraph). Empty when
    /// the layout is invalid.
    blocks: Vec<ParaBlock>,
    /// Flattened line metrics across all blocks (cached, invalidated with blocks).
    cached_line_metrics: Option<Vec<LineMetrics>>,
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
            font_provider: TypefaceFontProvider::new(),
            blocks: Vec::new(),
            cached_line_metrics: None,
        }
    }

    /// Convenience builder for changing font size without a full config.
    pub fn with_font_size(mut self, size: f32) -> Self {
        self.config.font_size = size;
        self.font_size = size;
        self.invalidate();
        self
    }

    // -------------------------------------------------------------------
    // Layout: per-block architecture
    // -------------------------------------------------------------------

    /// Ensure layout is up-to-date for `text`.
    ///
    /// If an attributed (rich text) paragraph already exists for this text,
    /// it is preserved — the per-block path is only used when no attributed
    /// paragraph is available.
    pub fn ensure_layout(&mut self, text: &str) {
        // If per-block layout is already current, nothing to do.
        if !self.blocks.is_empty() && self.cached_text == text {
            return;
        }
        // If the attributed (single-paragraph) layout is current, skip
        // the per-block rebuild — callers will use the legacy paragraph.
        if self.paragraph.is_some() && self.cached_text == text {
            return;
        }
        self.rebuild_blocks(text);
    }

    /// Returns true when the layout is backed by a single attributed
    /// paragraph (rich text path) rather than per-block layout.
    fn is_attributed_layout(&self) -> bool {
        self.paragraph.is_some() && self.blocks.is_empty()
    }

    /// Full rebuild: split `text` on `\n` and lay out each block.
    fn rebuild_blocks(&mut self, text: &str) {
        self.blocks.clear();
        self.cached_line_metrics = None;
        self.paragraph = None;

        let mut y_offset: f32 = 0.0;
        let mut start = 0usize;

        // Split on hard line breaks. Each block's byte_end includes the `\n`,
        // but we pass only the content (without the trailing `\n`) to Skia
        // so it doesn't generate phantom empty lines for newlines. We handle
        // inter-block spacing ourselves.
        loop {
            let has_newline;
            let end = if let Some(pos) = text[start..].find('\n') {
                has_newline = true;
                start + pos + 1 // byte_end includes the `\n`
            } else {
                has_newline = false;
                text.len()
            };

            // The content slice fed to Skia excludes the trailing `\n`.
            let content_end = if has_newline { end - 1 } else { end };
            let content_slice = &text[start..content_end];
            let para = self.build_paragraph_for_slice(content_slice);

            // Line metrics use block-local baselines. Byte offsets are global.
            let mut stored_lines = self.convert_block_line_metrics(&para, content_slice, start);

            // Empty content (e.g. line between two `\n`s): Skia may return 0
            // lines for "". Synthesize one so the block has vertical extent.
            if stored_lines.is_empty() {
                let skia_metrics = para.get_line_metrics();
                let (ascent, descent, baseline) = if let Some(lm) = skia_metrics.first() {
                    (lm.ascent as f32, lm.descent as f32, lm.baseline as f32)
                } else {
                    (self.font_size, self.font_size * 0.2, self.font_size)
                };
                stored_lines.push(LineMetrics {
                    start_index: start,
                    end_index: start,
                    baseline,
                    ascent,
                    descent,
                });
            }

            // For the flattened line_metrics view, the line that owns the `\n`
            // must have its end_index include the `\n` byte.
            if has_newline {
                if let Some(last) = stored_lines.last_mut() {
                    last.end_index = end;
                }
            }

            let height: f32 = if let Some(last) = stored_lines.last() {
                last.baseline + last.descent
            } else {
                self.font_size * 1.2
            };

            self.blocks.push(ParaBlock {
                byte_start: start,
                byte_end: end,
                paragraph: para,
                y_offset,
                height,
                line_metrics: stored_lines,
            });

            y_offset += height;
            start = end;

            if start >= text.len() {
                break;
            }
        }

        // Handle trailing `\n`: add a phantom empty block so the cursor can
        // sit on the blank line after the last newline.
        if text.ends_with('\n') && !text.is_empty() {
            if let Some(last_block) = self.blocks.last() {
                let last_lm = last_block.line_metrics.last();
                let (ascent, descent) = last_lm
                    .map(|lm| (lm.ascent, lm.descent))
                    .unwrap_or((self.font_size, self.font_size * 0.2));
                let phantom = LineMetrics {
                    start_index: text.len(),
                    end_index: text.len(),
                    baseline: ascent,
                    ascent,
                    descent,
                };
                let phantom_height = ascent + descent;
                self.blocks.push(ParaBlock {
                    byte_start: text.len(),
                    byte_end: text.len(),
                    paragraph: self.build_paragraph_for_slice(""),
                    y_offset,
                    height: phantom_height,
                    line_metrics: vec![phantom],
                });
            }
        }

        self.cached_text = text.to_owned();
    }

    /// Build a Skia `Paragraph` for a text slice (uniform style from config).
    fn build_paragraph_for_slice(&self, slice: &str) -> Paragraph {
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

        // Variable font axis interpolation
        {
            use skia_safe::font_arguments::variation_position::Coordinate;
            let coords = [
                Coordinate {
                    axis: skia_safe::FourByteTag::from(('w', 'g', 'h', 't')),
                    value: self.config.font_weight as f32,
                },
                Coordinate {
                    axis: skia_safe::FourByteTag::from(('o', 'p', 's', 'z')),
                    value: self.config.font_size,
                },
            ];
            let variation_position = skia_safe::font_arguments::VariationPosition {
                coordinates: &coords,
            };
            let font_args = skia_safe::FontArguments::new()
                .set_variation_design_position(variation_position);
            ts.set_font_arguments(&font_args);
        }

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
        builder.add_text(slice);
        let mut para = builder.build();
        para.layout(self.layout_width);
        para
    }

    /// Convert Skia's UTF-16 line metrics to UTF-8 for a single block.
    ///
    /// `base_offset` is the byte offset of the block's start in the full text.
    /// Baselines are stored **block-local** (as returned by Skia); the caller
    /// adds the block's `y_offset` when producing global coordinates.
    fn convert_block_line_metrics(
        &self,
        para: &Paragraph,
        slice: &str,
        base_offset: usize,
    ) -> Vec<LineMetrics> {
        let skia = para.get_line_metrics();
        let mut result = Vec::with_capacity(skia.len());
        let mut prev_end: usize = 0;

        for lm in &skia {
            let local_start = utf16_to_utf8_offset(slice, lm.start_index);
            let local_end = utf16_to_utf8_offset(slice, lm.end_including_newline).min(slice.len());

            let local_start = local_start.max(prev_end);
            let local_end = local_end.max(local_start);

            result.push(LineMetrics {
                start_index: base_offset + local_start,
                end_index: base_offset + local_end,
                baseline: lm.baseline as f32, // block-local
                ascent: lm.ascent as f32,
                descent: lm.descent as f32,
            });
            prev_end = local_end;
        }

        result
    }

    /// Flatten all block line metrics into a single Vec, adjusting baselines.
    fn flatten_line_metrics(&self) -> Vec<LineMetrics> {
        let total_lines: usize = self.blocks.iter().map(|b| b.line_metrics.len()).sum();
        let mut result = Vec::with_capacity(total_lines);
        for block in &self.blocks {
            for lm in &block.line_metrics {
                result.push(LineMetrics {
                    start_index: lm.start_index,
                    end_index: lm.end_index,
                    baseline: block.y_offset + lm.baseline,
                    ascent: lm.ascent,
                    descent: lm.descent,
                });
            }
        }
        result
    }

    /// Convert line metrics from the legacy single paragraph (attributed path).
    fn convert_single_para_line_metrics(&self, text: &str) -> Vec<LineMetrics> {
        let para = self.paragraph.as_ref().unwrap();
        let skia = para.get_line_metrics();
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
            if last_end < text.len()
                || result
                    .last()
                    .map_or(true, |lm| lm.start_index < lm.end_index)
            {
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

    /// Find the block index that contains `byte_offset` in the full text.
    fn block_index_for_offset(&self, byte_offset: usize) -> usize {
        self.blocks
            .iter()
            .position(|b| byte_offset < b.byte_end || (b.byte_start == b.byte_end && byte_offset == b.byte_start))
            .unwrap_or(self.blocks.len().saturating_sub(1))
    }

    // -------------------------------------------------------------------
    // Legacy single-paragraph paths (for attributed text / preedit)
    // -------------------------------------------------------------------

    /// Build and cache a monolithic paragraph from an [`AttributedText`],
    /// pushing per-run styles to `ParagraphBuilder`. This is the rich-text
    /// layout path — each run gets its own font weight, slant, decoration,
    /// color, etc.
    ///
    /// NOTE: this populates the legacy `paragraph` field, NOT the per-block
    /// architecture. The `wd_text_editor` uses this for rich text rendering.
    pub fn ensure_layout_attributed(
        &mut self,
        at: &crate::attributed_text::AttributedText,
    ) {
        if self.paragraph.is_some() && self.cached_text == at.text() {
            return;
        }
        self.rebuild_attributed(at);
    }

    fn rebuild_attributed(
        &mut self,
        at: &crate::attributed_text::AttributedText,
    ) {
        use crate::attributed_text as at_mod;

        let mut para_style = ParagraphStyle::new();
        para_style.set_apply_rounding_hack(false);
        para_style.set_text_align(self.config.text_align.to_skia());

        let mut builder = ParagraphBuilder::new(&para_style, &self.font_collection);

        let text = at.text();
        let fallback_families: Vec<&str> = self.config.font_families.iter().map(|s| s.as_str()).collect();

        for run in at.runs() {
            let style = &run.style;
            let mut ts = TextStyle::new();

            // Font size
            ts.set_font_size(style.font_size);

            // Font families: use the run's font_family as primary,
            // fall back to the config's family list.
            let mut families: Vec<&str> = vec![style.font_family.as_str()];
            for f in &fallback_families {
                if *f != style.font_family.as_str() {
                    families.push(f);
                }
            }
            ts.set_font_families(&families);

            // Font style (for typeface matching in FontCollection)
            let slant = if style.font_style_italic {
                skia_safe::font_style::Slant::Italic
            } else {
                skia_safe::font_style::Slant::Upright
            };
            let weight = skia_safe::font_style::Weight::from(style.font_weight as i32);
            let width = skia_safe::font_style::Width::from(style.font_width as i32);
            ts.set_font_style(skia_safe::FontStyle::new(weight, width, slant));

            // Variable font axes (FontArguments)
            {
                use skia_safe::font_arguments::variation_position::Coordinate;

                let mut coords: Vec<Coordinate> = Vec::new();

                for v in &style.font_variations {
                    let bytes = v.axis.as_bytes();
                    let tag = skia_safe::FourByteTag::from((
                        *bytes.first().unwrap_or(&b' ') as char,
                        *bytes.get(1).unwrap_or(&b' ') as char,
                        *bytes.get(2).unwrap_or(&b' ') as char,
                        *bytes.get(3).unwrap_or(&b' ') as char,
                    ));
                    coords.push(Coordinate { axis: tag, value: v.value });
                }

                coords.push(Coordinate {
                    axis: skia_safe::FourByteTag::from(('w', 'g', 'h', 't')),
                    value: style.font_weight as f32,
                });

                if (style.font_width - 100.0).abs() > f32::EPSILON {
                    coords.push(Coordinate {
                        axis: skia_safe::FourByteTag::from(('w', 'd', 't', 'h')),
                        value: style.font_width,
                    });
                }

                match style.font_optical_sizing {
                    at_mod::FontOpticalSizing::Auto => {
                        coords.push(Coordinate {
                            axis: skia_safe::FourByteTag::from(('o', 'p', 's', 'z')),
                            value: style.font_size,
                        });
                    }
                    at_mod::FontOpticalSizing::Fixed(v) => {
                        coords.push(Coordinate {
                            axis: skia_safe::FourByteTag::from(('o', 'p', 's', 'z')),
                            value: v,
                        });
                    }
                    at_mod::FontOpticalSizing::None => {}
                }

                let variation_position = skia_safe::font_arguments::VariationPosition {
                    coordinates: &coords,
                };
                let font_args = skia_safe::FontArguments::new()
                    .set_variation_design_position(variation_position);
                ts.set_font_arguments(&font_args);
            }

            // Color / fill
            match &style.fill {
                at_mod::TextFill::Solid(rgba) => {
                    ts.set_color(Color::from_argb(
                        (rgba.a * 255.0) as u8,
                        (rgba.r * 255.0) as u8,
                        (rgba.g * 255.0) as u8,
                        (rgba.b * 255.0) as u8,
                    ));
                }
            }

            // Letter spacing
            match style.letter_spacing {
                at_mod::TextDimension::Fixed(v) => { ts.set_letter_spacing(v); }
                _ => {}
            }

            // Kerning
            ts.add_font_feature("kern", if style.font_kerning { 1 } else { 0 });

            // User font features
            for feat in &style.font_features {
                ts.add_font_feature(feat.tag.clone(), if feat.value { 1 } else { 0 });
            }

            // Decoration
            let mut deco = TextDecoration::NO_DECORATION;
            match style.text_decoration_line {
                at_mod::TextDecorationLine::Underline => {
                    deco = TextDecoration::UNDERLINE;
                }
                at_mod::TextDecorationLine::LineThrough => {
                    deco = TextDecoration::LINE_THROUGH;
                }
                at_mod::TextDecorationLine::Overline => {
                    deco = TextDecoration::OVERLINE;
                }
                at_mod::TextDecorationLine::None => {}
            }
            ts.set_decoration_type(deco);

            builder.push_style(&ts);

            let start = run.start as usize;
            let end = run.end as usize;
            if start < end && end <= text.len() {
                builder.add_text(&text[start..end]);
            }
        }

        let mut para = builder.build();
        para.layout(self.layout_width);
        self.paragraph = Some(para);
        self.cached_text = text.to_owned();
        // Clear per-block state — the attributed path uses the legacy paragraph.
        self.blocks.clear();
        self.cached_line_metrics = None;
    }

    /// Invalidate all cached layout so the next call rebuilds.
    /// Call this after modifying `font_collection` externally.
    pub fn invalidate(&mut self) {
        self.paragraph = None;
        self.blocks.clear();
        self.cached_line_metrics = None;
    }

    pub fn set_layout_width(&mut self, w: f32) {
        let new_w = w.max(1.0);
        if (new_w - self.layout_width).abs() > 0.5 {
            self.layout_width = new_w;
            self.invalidate();
        }
    }

    pub fn set_layout_height(&mut self, h: f32) {
        let new_h = h.max(1.0);
        if (new_h - self.layout_height).abs() > 0.5 {
            self.layout_height = new_h;
        }
    }

    /// Register a font from raw TTF/OTF bytes under `family`.
    ///
    /// Multiple calls accumulate — all registered typefaces remain available.
    pub fn add_font_bytes(&mut self, family: &str, bytes: &[u8]) {
        let loader = FontMgr::new();
        if let Some(tf) = loader.new_from_data(bytes, None) {
            self.font_provider.register_typeface(tf, Some(family));
            self.flush_font_provider();
        }
    }

    /// Register multiple font files under the same family at once.
    ///
    /// Each byte slice is a separate TTF/OTF file (e.g. regular, italic).
    /// Multiple calls accumulate — all registered typefaces remain available.
    pub fn add_font_family(&mut self, family: &str, font_data: &[&[u8]]) {
        let loader = FontMgr::new();
        for bytes in font_data {
            if let Some(tf) = loader.new_from_data(bytes, None) {
                self.font_provider.register_typeface(tf, Some(family));
            }
        }
        self.flush_font_provider();
    }

    /// Push the accumulated font provider into the font collection.
    fn flush_font_provider(&mut self) {
        let provider_clone = self.font_provider.clone();
        self.font_collection
            .set_asset_font_manager(Some(provider_clone.into()));
        self.invalidate();
    }

    /// Paint the laid-out paragraph at (0, 0). Used by the host to draw the
    /// current session text (and optional preedit) so typed content appears
    /// immediately without waiting for document commit.
    pub fn paint_paragraph(&mut self, canvas: &skia_safe::Canvas, text: &str) {
        self.ensure_layout(text);
        for block in &self.blocks {
            block.paragraph.paint(canvas, Point::new(0.0, block.y_offset));
        }
    }
}

impl TextLayoutEngine for SkiaLayoutEngine {
    fn line_metrics(&mut self, text: &str) -> Vec<LineMetrics> {
        self.ensure_layout(text);

        if let Some(ref cached) = self.cached_line_metrics {
            return cached.clone();
        }

        let result = if self.is_attributed_layout() {
            // Attributed (single-paragraph) path: convert from the legacy paragraph.
            self.convert_single_para_line_metrics(text)
        } else {
            self.flatten_line_metrics()
        };
        self.cached_line_metrics = Some(result.clone());
        result
    }

    fn position_at_point(&mut self, text: &str, x: f32, y: f32) -> usize {
        self.ensure_layout(text);

        if self.is_attributed_layout() {
            // Attributed (single-paragraph) path.
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
            return snap_grapheme_boundary(text, raw);
        }

        // Per-block path.
        let block_idx = self.blocks
            .iter()
            .position(|b| y < b.y_offset + b.height + 0.5)
            .unwrap_or(self.blocks.len().saturating_sub(1));

        if self.blocks.is_empty() {
            return 0;
        }

        let block = &self.blocks[block_idx];
        let local_y = y - block.y_offset;
        let slice = &text[block.byte_start..block.byte_end];

        // Check for empty/short lines first
        let metrics = block.paragraph.get_line_metrics();
        for lm in &metrics {
            let top = lm.baseline as f32 - lm.ascent as f32;
            let bot = lm.baseline as f32 + lm.descent as f32;
            if local_y >= top - 0.5 && local_y <= bot + 0.5 {
                if lm.end_index.saturating_sub(lm.start_index) <= 1 {
                    return block.byte_start
                        + utf16_to_utf8_offset(slice, lm.start_index).min(slice.len());
                }
                break;
            }
        }

        let pwa = block.paragraph.get_glyph_position_at_coordinate(Point::new(x, local_y));
        let local_raw = utf16_to_utf8_offset(slice, pwa.position.max(0) as usize).min(slice.len());
        let global_raw = block.byte_start + local_raw;
        snap_grapheme_boundary(text, global_raw)
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
        } else if self.is_attributed_layout() {
            // Attributed (single-paragraph) path.
            let u16_end = utf8_to_utf16_offset(text, offset);
            let cluster_start = prev_grapheme_boundary(text, offset);
            let u16_start = utf8_to_utf16_offset(text, cluster_start);
            let rects = self.paragraph.as_ref().unwrap().get_rects_for_range(
                u16_start..u16_end,
                RectHeightStyle::Max,
                RectWidthStyle::Tight,
            );
            rects.iter().map(|tb| tb.rect.right()).fold(0.0_f32, f32::max)
        } else {
            // Per-block path.
            let block_idx = self.block_index_for_offset(offset);
            let block = &self.blocks[block_idx];
            let local_offset = offset - block.byte_start;
            let slice = &text[block.byte_start..block.byte_end];

            let u16_end = utf8_to_utf16_offset(slice, local_offset);
            let local_cluster_start = if local_offset > 0 {
                prev_grapheme_boundary(slice, local_offset)
            } else {
                0
            };
            let u16_start = utf8_to_utf16_offset(slice, local_cluster_start);
            let rects = block.paragraph.get_rects_for_range(
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

        if self.is_attributed_layout() {
            let u16_pos = utf8_to_utf16_offset(text, offset) as u32;
            let para = self.paragraph.as_ref().unwrap();
            let range = para.get_word_boundary(u16_pos);
            let start = utf16_to_utf8_offset(text, range.start as usize);
            let end = utf16_to_utf8_offset(text, range.end as usize);
            return (start, end);
        }

        if self.blocks.is_empty() {
            return (0, 0);
        }

        let block_idx = self.block_index_for_offset(offset);
        let block = &self.blocks[block_idx];
        let slice = &text[block.byte_start..block.byte_end];
        let local_offset = offset - block.byte_start;

        let u16_pos = utf8_to_utf16_offset(slice, local_offset) as u32;
        let range = block.paragraph.get_word_boundary(u16_pos);
        let start = block.byte_start + utf16_to_utf8_offset(slice, range.start as usize);
        let end = block.byte_start + utf16_to_utf8_offset(slice, range.end as usize);
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

        if self.is_attributed_layout() {
            // Attributed (single-paragraph) path.
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

            let first_line = line_index_for_offset_utf8(&metrics, start);
            let last_line = line_index_for_offset_utf8(&metrics, end.saturating_sub(1).max(start));
            for idx in first_line..=last_line {
                let lm = &metrics[idx];
                if !lm.is_empty_line(text) { continue; }
                let mid_y = lm.baseline - lm.ascent * 0.5;
                let already = rects.iter().any(|r| r.y <= mid_y && mid_y <= r.y + r.height);
                if !already {
                    rects.push(SelectionRect {
                        x: 0.0,
                        y: lm.baseline - lm.ascent,
                        width: self.font_size * 0.5,
                        height: lm.ascent + lm.descent,
                    });
                }
            }
            return rects;
        }

        // Per-block path: find blocks that overlap the selection range.
        let mut rects: Vec<SelectionRect> = Vec::new();
        for block in &self.blocks {
            if block.byte_start >= end || block.byte_end <= start {
                continue;
            }
            // Clamp selection to this block's range
            let sel_start = start.max(block.byte_start);
            let sel_end = end.min(block.byte_end);
            if sel_start >= sel_end && !(block.byte_start == block.byte_end) {
                continue;
            }

            let slice = &text[block.byte_start..block.byte_end];
            let local_start = sel_start - block.byte_start;
            let local_end = sel_end - block.byte_start;

            let u16_lo = utf8_to_utf16_offset(slice, local_start);
            let u16_hi = utf8_to_utf16_offset(slice, local_end);

            let raw = block.paragraph.get_rects_for_range(
                u16_lo..u16_hi,
                skia_safe::textlayout::RectHeightStyle::Max,
                skia_safe::textlayout::RectWidthStyle::Tight,
            );

            for tb in &raw {
                rects.push(SelectionRect {
                    x: tb.rect.left(),
                    y: tb.rect.top() + block.y_offset,
                    width: (tb.rect.right() - tb.rect.left()).max(0.0),
                    height: (tb.rect.bottom() - tb.rect.top()).max(0.0),
                });
            }
        }

        // Empty-line invariant: every selected line must have a visible rect.
        let first_line = line_index_for_offset_utf8(&metrics, start);
        let last_line = line_index_for_offset_utf8(&metrics, end.saturating_sub(1).max(start));

        for idx in first_line..=last_line {
            let lm = &metrics[idx];
            if !lm.is_empty_line(text) { continue; }
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
