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

/// Convert an [`AttributedText`] `TextStyle` to a Skia `TextStyle`.
///
/// Extracted as a free function so it can be reused by both the monolithic
/// and per-block attributed layout paths.
fn attr_style_to_skia(
    style: &crate::attributed_text::TextStyle,
    fallback_families: &[&str],
) -> TextStyle {
    use crate::attributed_text as at_mod;

    let mut ts = TextStyle::new();
    ts.set_font_size(style.font_size);

    let mut families: Vec<&str> = vec![style.font_family.as_str()];
    for f in fallback_families {
        if *f != style.font_family.as_str() {
            families.push(f);
        }
    }
    ts.set_font_families(&families);

    let slant = if style.font_style_italic {
        skia_safe::font_style::Slant::Italic
    } else {
        skia_safe::font_style::Slant::Upright
    };
    let weight = skia_safe::font_style::Weight::from(style.font_weight as i32);
    let width = skia_safe::font_style::Width::from(style.font_width as i32);
    ts.set_font_style(skia_safe::FontStyle::new(weight, width, slant));

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
        let font_args =
            skia_safe::FontArguments::new().set_variation_design_position(variation_position);
        ts.set_font_arguments(&font_args);
    }

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

    match style.letter_spacing {
        at_mod::TextDimension::Fixed(v) => {
            ts.set_letter_spacing(v);
        }
        _ => {}
    }

    ts.add_font_feature("kern", if style.font_kerning { 1 } else { 0 });

    for feat in &style.font_features {
        ts.add_font_feature(feat.tag.clone(), if feat.value { 1 } else { 0 });
    }

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

    ts
}

// ---------------------------------------------------------------------------
// Incremental UTF-16 → UTF-8 offset conversion
// ---------------------------------------------------------------------------

/// Advance a running `(utf16_count, byte_offset)` cursor through `text` to
/// the given UTF-16 target, returning the corresponding UTF-8 byte offset.
///
/// The caller must ensure that calls are made with **monotonically
/// non-decreasing** `target_u16` values so the iterator only moves forward.
/// This makes each call amortized O(1) instead of O(n).
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

    /// X offset for an empty line (zero content width) at the given layout width.
    pub fn empty_line_left(&self, layout_width: f32) -> f32 {
        match self {
            Self::Left | Self::Justify => 0.0,
            Self::Center => layout_width / 2.0,
            Self::Right => layout_width,
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
    /// **Preedit-only.** Temporary single-paragraph used by the host for
    /// inline IME composition rendering. Not used by any layout or editing
    /// path — all text layout goes through the per-block architecture.
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
    /// Tracks the [`AttributedText::generation`] seen by the last
    /// `ensure_layout_attributed` call. When the generation advances
    /// (e.g. a style-only change), the cache is invalidated even though
    /// the text bytes are unchanged.
    cached_attributed_generation: u64,
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
            cached_attributed_generation: 0,
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
    /// Ensure per-block layout is up-to-date for the given plain text.
    ///
    /// For attributed (rich text) layout, use [`ensure_layout_attributed`]
    /// instead — it must be called **before** any method that internally
    /// calls `ensure_layout` (e.g. `caret_rect_at`, `line_metrics`) to
    /// prevent the plain-text builder from overwriting styled blocks.
    pub fn ensure_layout(&mut self, text: &str) {
        if !self.blocks.is_empty() && self.cached_text == text {
            return;
        }
        self.rebuild_blocks(text);
    }

    // -------------------------------------------------------------------
    // Shared block-building helpers
    // -------------------------------------------------------------------

    /// Finalize a built paragraph into a `ParaBlock`.
    ///
    /// Converts Skia line metrics, synthesizes empty-line metrics if needed,
    /// adjusts `end_index` to include trailing `\n`, and computes block height.
    /// This is the single source of truth for the per-block post-processing
    /// that was previously duplicated across `rebuild_blocks`,
    /// `rebuild_blocks_attributed`, and `notify_edit`.
    fn finalize_block(
        &self,
        para: Paragraph,
        text: &str,
        start: usize,
        end: usize,
        has_newline: bool,
        y_offset: f32,
    ) -> ParaBlock {
        let content_end = if has_newline { end - 1 } else { end };
        let content_slice = &text[start..content_end];
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
                left: self.config.text_align.empty_line_left(self.layout_width),
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

        ParaBlock {
            byte_start: start,
            byte_end: end,
            paragraph: para,
            y_offset,
            height,
            line_metrics: stored_lines,
        }
    }

    /// Append a phantom empty block for trailing `\n`, so the cursor can
    /// sit on the blank line after the last newline.
    ///
    /// Returns the new y_offset after the phantom block (if appended).
    fn append_phantom_trailing_block(&mut self, text: &str, y_offset: f32) -> f32 {
        if !text.ends_with('\n') || text.is_empty() {
            return y_offset;
        }
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
                left: self.config.text_align.empty_line_left(self.layout_width),
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
            return y_offset + phantom_height;
        }
        y_offset
    }

    /// Remove a phantom trailing block if one exists at the end of the
    /// cached text. Returns `true` if one was removed.
    fn remove_phantom_trailing_block(&mut self) -> bool {
        if let Some(last) = self.blocks.last() {
            if last.byte_start == last.byte_end
                && last.byte_start == self.cached_text.len()
                && self.cached_text.ends_with('\n')
            {
                self.blocks.pop();
                return true;
            }
        }
        false
    }

    // -------------------------------------------------------------------
    // Full rebuilds
    // -------------------------------------------------------------------

    /// Full rebuild: split `text` on `\n` and lay out each block (uniform style).
    fn rebuild_blocks(&mut self, text: &str) {
        self.blocks.clear();
        self.cached_line_metrics = None;
        self.paragraph = None;

        let mut y_offset: f32 = 0.0;
        let mut start = 0usize;

        loop {
            let has_newline;
            let end = if let Some(pos) = text[start..].find('\n') {
                has_newline = true;
                start + pos + 1
            } else {
                has_newline = false;
                text.len()
            };

            let content_end = if has_newline { end - 1 } else { end };
            let para = self.build_paragraph_for_slice(&text[start..content_end]);
            let block = self.finalize_block(para, text, start, end, has_newline, y_offset);
            y_offset += block.height;
            self.blocks.push(block);

            start = end;
            if start >= text.len() {
                break;
            }
        }

        self.append_phantom_trailing_block(text, y_offset);
        self.cached_text = text.to_owned();
    }

    // -------------------------------------------------------------------
    // Incremental layout: rebuild only the affected block(s)
    // -------------------------------------------------------------------

    /// Notify the layout engine that a text edit occurred, enabling
    /// incremental re-layout of only the affected paragraph block(s).
    ///
    /// Call this **after** mutating the text buffer but **before** the next
    /// `ensure_layout` / `line_metrics` / `caret_rect_at` call.
    ///
    /// * `text`        — the **new** (post-edit) text string.
    /// * `edit_offset` — byte offset in the **old** text where the edit starts.
    /// * `old_len`     — number of bytes removed from the old text (0 for pure insert).
    /// * `new_len`     — number of bytes inserted into the new text (0 for pure delete).
    ///
    /// The method falls back to a full rebuild when:
    /// - There is no existing block layout (first call or after `invalidate`).
    /// - The edit spans across block boundaries in ways that change the
    ///   paragraph structure (inserting/removing `\n`).
    ///
    /// **Plain-text only.** This method rebuilds affected blocks using
    /// `build_paragraph_for_slice` which applies uniform styling from
    /// `TextConfig`. For attributed (rich text) layout, call `invalidate()`
    /// instead and let `ensure_layout_attributed` do a full rebuild.
    pub fn notify_edit(
        &mut self,
        text: &str,
        edit_offset: usize,
        old_len: usize,
        new_len: usize,
    ) {
        if self.blocks.is_empty() {
            self.rebuild_blocks(text);
            return;
        }

        let delta = new_len as isize - old_len as isize;
        let old_edit_end = edit_offset + old_len;

        // Check whether the edit changed the paragraph structure (\n inserted
        // or removed). If so, fall back to a targeted rebuild of the affected
        // region rather than a full rebuild of the entire document.
        let inserted_text = &text[edit_offset..edit_offset + new_len];
        let newlines_inserted = inserted_text.as_bytes().iter().filter(|&&b| b == b'\n').count();

        // For the removed region, we need to count newlines that were in the
        // old text. We can infer this from the block boundaries.
        let newlines_removed = if old_len > 0 {
            // Count how many block boundaries (each ends with \n except
            // possibly the last) fall strictly inside the removed range.
            self.blocks.iter().filter(|b| {
                // A block boundary at byte_end (which includes the \n) is
                // "removed" if byte_end falls within (edit_offset, old_edit_end].
                b.byte_end > edit_offset && b.byte_end <= old_edit_end
                    && b.byte_end < self.cached_text.len() // not the last block
            }).count()
        } else {
            0
        };

        let structure_changed = newlines_inserted > 0 || newlines_removed > 0;

        if structure_changed {
            // Paragraph structure changed — do a partial rebuild.
            // Find the range of blocks that are affected by the edit.
            let first_affected = self.blocks
                .iter()
                .position(|b| b.byte_end > edit_offset)
                .unwrap_or(self.blocks.len().saturating_sub(1));

            // The last affected block is the one that contains old_edit_end
            // (in the old coordinate system).
            let mut last_affected = self.blocks
                .iter()
                .position(|b| b.byte_end >= old_edit_end)
                .unwrap_or(self.blocks.len().saturating_sub(1));

            // When newlines were removed, the block starting at old_edit_end
            // must also be included: deleting '\n' merges two paragraphs, so
            // the following block needs to be re-parsed together with the
            // preceding one.
            if newlines_removed > 0 {
                if let Some(next_idx) = self.blocks.iter().position(|b| b.byte_start == old_edit_end) {
                    last_affected = last_affected.max(next_idx);
                }
            }

            // Remove old phantom trailing block if present.
            self.remove_phantom_trailing_block();

            // Determine the byte range in the NEW text that we need to
            // re-parse into blocks.
            let rebuild_start = self.blocks.get(first_affected)
                .map(|b| b.byte_start)
                .unwrap_or(0);
            let old_rebuild_end = self.blocks.get(last_affected)
                .map(|b| b.byte_end)
                .unwrap_or(self.cached_text.len());
            let rebuild_end = (old_rebuild_end as isize + delta).max(0) as usize;
            let rebuild_end = rebuild_end.min(text.len());

            let y_start = self.blocks.get(first_affected)
                .map(|b| b.y_offset)
                .unwrap_or(0.0);

            // Build new blocks for the affected region using finalize_block.
            let mut new_blocks = Vec::new();
            let mut y_offset = y_start;
            let mut start = rebuild_start;

            let region = &text[rebuild_start..rebuild_end];
            let mut cursor = 0usize;

            loop {
                if cursor >= region.len() && start >= rebuild_end {
                    break;
                }
                let remaining = &region[cursor..];
                let has_newline;
                let chunk_len = if let Some(pos) = remaining.find('\n') {
                    has_newline = true;
                    pos + 1
                } else {
                    has_newline = false;
                    remaining.len()
                };

                let end = start + chunk_len;
                let content_end = if has_newline { end - 1 } else { end };
                let content_slice = &text[start..content_end];
                let para = self.build_paragraph_for_slice(content_slice);
                let block = self.finalize_block(para, text, start, end, has_newline, y_offset);
                y_offset += block.height;
                new_blocks.push(block);

                cursor += chunk_len;
                start = end;

                if start >= rebuild_end {
                    break;
                }
            }

            // Splice the new blocks into the existing blocks array.
            let remove_count = (last_affected + 1).min(self.blocks.len()) - first_affected;
            let tail_start = first_affected + remove_count;
            let old_y_after = if tail_start < self.blocks.len() {
                self.blocks[tail_start].y_offset
            } else {
                y_offset
            };

            // Shift tail blocks: only byte offsets and y_offset change.
            let y_delta = y_offset - old_y_after;
            for block in &mut self.blocks[tail_start..] {
                block.byte_start = (block.byte_start as isize + delta) as usize;
                block.byte_end = (block.byte_end as isize + delta) as usize;
                block.y_offset += y_delta;
                for lm in &mut block.line_metrics {
                    lm.start_index = (lm.start_index as isize + delta) as usize;
                    lm.end_index = (lm.end_index as isize + delta) as usize;
                }
            }

            // Replace affected blocks with new blocks.
            self.blocks.splice(first_affected..first_affected + remove_count, new_blocks);

            // Re-add phantom trailing block if needed.
            if text.ends_with('\n') && !text.is_empty() {
                // Remove old phantom if present (may have been shifted).
                if let Some(last) = self.blocks.last() {
                    if last.byte_start == last.byte_end && last.byte_start == text.len() {
                        self.blocks.pop();
                    }
                }
                let final_y = self.blocks.last()
                    .map(|b| b.y_offset + b.height)
                    .unwrap_or(0.0);
                self.append_phantom_trailing_block(text, final_y);
            } else {
                // Remove phantom if text no longer ends with \n.
                if let Some(last) = self.blocks.last() {
                    if last.byte_start == last.byte_end && last.byte_start == text.len() && !text.is_empty() {
                        self.blocks.pop();
                    }
                }
            }
        } else {
            // No paragraph structure change — only one block is affected.
            let block_idx = self.blocks
                .iter()
                .position(|b| edit_offset < b.byte_end || (b.byte_start == b.byte_end && edit_offset == b.byte_start))
                .unwrap_or(self.blocks.len().saturating_sub(1));

            // Remove old phantom trailing block before modifying.
            let had_phantom = self.remove_phantom_trailing_block();
            let _ = had_phantom;

            // Rebuild the affected block using finalize_block.
            if block_idx < self.blocks.len() {
                let old_height = self.blocks[block_idx].height;
                let new_start = self.blocks[block_idx].byte_start;
                let new_end = (self.blocks[block_idx].byte_end as isize + delta) as usize;
                let y_off = self.blocks[block_idx].y_offset;

                let has_newline = new_end > 0 && new_end <= text.len()
                    && text.as_bytes().get(new_end - 1) == Some(&b'\n');
                let content_end = if has_newline { new_end - 1 } else { new_end };
                let content_slice = &text[new_start..content_end];
                let para = self.build_paragraph_for_slice(content_slice);
                let block = self.finalize_block(para, text, new_start, new_end, has_newline, y_off);
                let new_height = block.height;
                self.blocks[block_idx] = block;

                // Shift all subsequent blocks: byte offsets and y_offset.
                let y_delta = new_height - old_height;
                for block in &mut self.blocks[block_idx + 1..] {
                    block.byte_start = (block.byte_start as isize + delta) as usize;
                    block.byte_end = (block.byte_end as isize + delta) as usize;
                    block.y_offset += y_delta;
                    for lm in &mut block.line_metrics {
                        lm.start_index = (lm.start_index as isize + delta) as usize;
                        lm.end_index = (lm.end_index as isize + delta) as usize;
                    }
                }
            }

            // Re-add phantom trailing block if needed.
            let final_y = self.blocks.last()
                .map(|b| b.y_offset + b.height)
                .unwrap_or(0.0);
            self.append_phantom_trailing_block(text, final_y);
        }

        self.cached_text = text.to_owned();
        self.cached_line_metrics = None;
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

        // Incremental UTF-16 → UTF-8 tracking within this block slice.
        let mut run_u16: usize = 0;
        let mut run_byte: usize = 0;
        let mut char_iter = slice.char_indices().peekable();

        for lm in &skia {
            let local_start = incremental_u16_to_u8(
                lm.start_index, slice, &mut run_u16, &mut run_byte, &mut char_iter,
            );
            let local_end = incremental_u16_to_u8(
                lm.end_including_newline, slice, &mut run_u16, &mut run_byte, &mut char_iter,
            ).min(slice.len());

            let local_start = local_start.max(prev_end);
            let local_end = local_end.max(local_start);

            result.push(LineMetrics {
                start_index: base_offset + local_start,
                end_index: base_offset + local_end,
                baseline: lm.baseline as f32, // block-local
                ascent: lm.ascent as f32,
                descent: lm.descent as f32,
                left: lm.left as f32,
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
                    left: lm.left,
                });
            }
        }
        result
    }

    /// Find the block index that contains `byte_offset` in the full text.
    ///
    /// Uses binary search on `byte_end` (monotonically non-decreasing).
    fn block_index_for_offset(&self, byte_offset: usize) -> usize {
        if self.blocks.is_empty() {
            return 0;
        }
        let idx = self.blocks.partition_point(|b| b.byte_end <= byte_offset);
        // Handle phantom zero-length blocks (byte_start == byte_end) at the
        // exact offset.
        let idx = idx.min(self.blocks.len() - 1);
        // If we landed past the matching block, check if a zero-length block
        // at this offset exists at the found position.
        if self.blocks[idx].byte_start == self.blocks[idx].byte_end
            && self.blocks[idx].byte_start == byte_offset
        {
            return idx;
        }
        idx
    }

    // -------------------------------------------------------------------
    // Attributed text layout (per-block, rich text)
    // -------------------------------------------------------------------

    /// Ensure layout is up-to-date for the given [`AttributedText`].
    ///
    /// Uses the same per-block architecture as plain text, but pushes
    /// per-run styles within each block. This avoids feeding the entire
    /// document into a single Skia `Paragraph`.
    pub fn ensure_layout_attributed(
        &mut self,
        at: &crate::attributed_text::AttributedText,
    ) {
        let gen = at.generation();
        if !self.blocks.is_empty()
            && self.cached_text == at.text()
            && self.cached_attributed_generation == gen
        {
            return;
        }
        self.cached_attributed_generation = gen;
        self.rebuild_blocks_attributed(at);
    }

    /// Build a Skia `Paragraph` for a block slice with per-run styling
    /// from the given runs. Runs are clipped to the block range.
    fn build_paragraph_for_attributed_slice(
        &self,
        text: &str,
        block_start: usize,
        block_content_end: usize,
        runs: &[crate::attributed_text::StyledRun],
    ) -> Paragraph {
        let mut para_style = ParagraphStyle::new();
        para_style.set_apply_rounding_hack(false);
        para_style.set_text_align(self.config.text_align.to_skia());

        // Use a strut style based on the first run's font in this block
        // (or the config defaults). This prevents font-fallback characters
        // (e.g. CJK glyphs rendered by a system font) from changing the
        // line height, which causes a visual "jump" during IME preedit.
        {
            let (strut_size, strut_family) = if let Some(run) = runs.first() {
                (run.style.font_size, run.style.font_family.as_str())
            } else {
                (self.config.font_size, self.config.font_families.first().map(|s| s.as_str()).unwrap_or("sans-serif"))
            };
            let mut strut = skia_safe::textlayout::StrutStyle::new();
            strut.set_strut_enabled(true);
            strut.set_force_strut_height(true);
            strut.set_font_size(strut_size);
            strut.set_font_families(&[strut_family]);
            para_style.set_strut_style(strut);
        }

        let mut builder = ParagraphBuilder::new(&para_style, &self.font_collection);
        let fallback_families: Vec<&str> =
            self.config.font_families.iter().map(|s| s.as_str()).collect();

        // If no runs overlap, use config defaults.
        if runs.is_empty() || block_start >= block_content_end {
            let mut ts = TextStyle::new();
            ts.set_font_size(self.config.font_size);
            let families: Vec<&str> = self.config.font_families.iter().map(|s| s.as_str()).collect();
            ts.set_font_families(&families);
            builder.push_style(&ts);
            builder.add_text(&text[block_start..block_content_end]);
        } else {
            for run in runs {
                // Clip run to block range.
                let run_start = (run.start as usize).max(block_start);
                let run_end = (run.end as usize).min(block_content_end);
                if run_start >= run_end {
                    continue;
                }

                let ts = attr_style_to_skia(&run.style, &fallback_families);
                builder.push_style(&ts);
                builder.add_text(&text[run_start..run_end]);
            }
        }

        let mut para = builder.build();
        para.layout(self.layout_width);
        para
    }

    /// Full rebuild of per-block layout from an [`AttributedText`].
    fn rebuild_blocks_attributed(
        &mut self,
        at: &crate::attributed_text::AttributedText,
    ) {
        self.blocks.clear();
        self.cached_line_metrics = None;
        self.paragraph = None;

        let text = at.text();
        let mut y_offset: f32 = 0.0;
        let mut start = 0usize;

        loop {
            let has_newline;
            let end = if let Some(pos) = text[start..].find('\n') {
                has_newline = true;
                start + pos + 1
            } else {
                has_newline = false;
                text.len()
            };

            let content_end = if has_newline { end - 1 } else { end };
            let runs = at.runs_in_range(start as u32, content_end as u32);
            let para = self.build_paragraph_for_attributed_slice(text, start, content_end, runs);
            let block = self.finalize_block(para, text, start, end, has_newline, y_offset);
            y_offset += block.height;
            self.blocks.push(block);

            start = end;
            if start >= text.len() {
                break;
            }
        }

        self.append_phantom_trailing_block(text, y_offset);
        self.cached_text = text.to_owned();
    }

    /// Invalidate all cached layout so the next call rebuilds.
    ///
    /// After calling this, the next `ensure_layout` or
    /// `ensure_layout_attributed` will do a full per-block rebuild.
    pub fn invalidate(&mut self) {
        self.paragraph = None;
        self.blocks.clear();
        self.cached_text.clear();
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

    // -------------------------------------------------------------------
    // Preedit (IME composition) support
    // -------------------------------------------------------------------

    /// Rebuild per-block layout with the preedit text spliced in at `cursor`.
    ///
    /// This uses the same per-block approach as
    /// [`ensure_layout_attributed`](Self::ensure_layout_attributed) so the
    /// resulting layout metrics are identical — avoiding the visual "jump"
    /// that occurs when switching between a single-paragraph preedit layout
    /// and a per-block normal layout.
    ///
    /// Returns `(display_text, preedit_byte_range)` so the caller can
    /// position the cursor and draw selection rects using the display text.
    pub fn rebuild_blocks_with_preedit(
        &mut self,
        content: &crate::attributed_text::AttributedText,
        cursor: usize,
        preedit: &str,
    ) -> (String, std::ops::Range<usize>) {
        use crate::attributed_text::TextDecorationLine;

        let mut display_content = content.clone();
        let mut preedit_style = content.caret_style_at(cursor as u32).clone();
        preedit_style.text_decoration_line = TextDecorationLine::Underline;
        display_content.insert_with_style(cursor, preedit, preedit_style);

        let preedit_range = cursor..(cursor + preedit.len());

        // Full per-block rebuild using the spliced content.
        self.rebuild_blocks_attributed(&display_content);

        let display_text = display_content.text().to_owned();
        (display_text, preedit_range)
    }

    /// Build a display string and a laid-out `Paragraph` with the preedit
    /// text spliced in at `cursor` and styled with an underline.
    ///
    /// Returns `(display_text, paragraph, preedit_byte_range)` where
    /// `preedit_byte_range` is the UTF-8 byte range of the preedit segment
    /// within `display_text`.
    ///
    /// The caller uses the returned paragraph for rendering and the byte
    /// range for caret positioning (caret goes at `preedit_byte_range.end`).
    pub fn build_preedit_paragraph(
        &self,
        content: &crate::attributed_text::AttributedText,
        cursor: usize,
        preedit: &str,
    ) -> (String, Paragraph, std::ops::Range<usize>) {
        let text = content.text();
        let pre = &text[..cursor];
        let post = &text[cursor..];
        let display_text = format!("{}{}{}", pre, preedit, post);

        let preedit_start = cursor;
        let preedit_end = cursor + preedit.len();

        let mut para_style = ParagraphStyle::new();
        para_style.set_apply_rounding_hack(false);
        para_style.set_text_align(self.config.text_align.to_skia());

        if let Some(lh) = self.config.line_height {
            let mut strut = skia_safe::textlayout::StrutStyle::new();
            strut.set_strut_enabled(true);
            strut.set_force_strut_height(true);
            strut.set_height(lh);
            para_style.set_strut_style(strut);
        }

        let fallback_families: Vec<&str> =
            self.config.font_families.iter().map(|s| s.as_str()).collect();

        let mut builder = ParagraphBuilder::new(&para_style, &self.font_collection);

        // Build runs from the AttributedText, but splice the preedit at
        // the cursor. We walk three regions: [0..cursor), [cursor..cursor)
        // with preedit inserted, [cursor..end).
        //
        // For each region of the original text we push the attributed runs.
        // The preedit itself gets the caret style with an underline added.
        let runs = content.runs();
        let preedit_style = content.caret_style_at(cursor as u32);

        // --- Region 1: text before cursor ---
        for run in runs {
            let run_start = run.start as usize;
            let run_end = run.end as usize;
            // Clip to [0..cursor)
            let s = run_start.max(0).min(cursor);
            let e = run_end.min(cursor);
            if s >= e {
                continue;
            }
            let ts = attr_style_to_skia(&run.style, &fallback_families);
            builder.push_style(&ts);
            builder.add_text(&text[s..e]);
        }

        // --- Region 2: preedit text (underlined) ---
        {
            let mut ts = attr_style_to_skia(preedit_style, &fallback_families);
            ts.set_decoration_type(TextDecoration::UNDERLINE);
            builder.push_style(&ts);
            builder.add_text(preedit);
        }

        // --- Region 3: text after cursor ---
        for run in runs {
            let run_start = run.start as usize;
            let run_end = run.end as usize;
            // Clip to [cursor..text.len())
            let s = run_start.max(cursor);
            let e = run_end.min(text.len());
            if s >= e {
                continue;
            }
            let ts = attr_style_to_skia(&run.style, &fallback_families);
            builder.push_style(&ts);
            builder.add_text(&text[s..e]);
        }

        // Handle empty document: if no runs produced any text, push a
        // default-styled empty span so the paragraph has valid metrics.
        if runs.is_empty() && pre.is_empty() && post.is_empty() {
            let ts = attr_style_to_skia(preedit_style, &fallback_families);
            builder.push_style(&ts);
        }

        let mut para = builder.build();
        para.layout(self.layout_width);

        (display_text, para, preedit_start..preedit_end)
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

    /// Paint the laid-out paragraph at the given origin offset.
    pub fn paint_paragraph_at(
        &self,
        canvas: &skia_safe::Canvas,
        _text: &str,
        origin: Point,
    ) {
        for block in &self.blocks {
            block
                .paragraph
                .paint(canvas, Point::new(origin.x, origin.y + block.y_offset));
        }
    }
}

impl TextLayoutEngine for SkiaLayoutEngine {
    fn line_metrics(&mut self, text: &str) -> Vec<LineMetrics> {
        self.ensure_layout(text);

        if let Some(ref cached) = self.cached_line_metrics {
            return cached.clone();
        }

        let result = self.flatten_line_metrics();
        self.cached_line_metrics = Some(result.clone());
        result
    }

    fn position_at_point(&mut self, text: &str, x: f32, y: f32) -> usize {
        self.ensure_layout(text);

        // Per-block path: binary search by y position.
        if self.blocks.is_empty() {
            return 0;
        }
        let block_idx = self.blocks
            .partition_point(|b| b.y_offset + b.height + 0.5 <= y)
            .min(self.blocks.len() - 1);

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
            lm.left
        } else {
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
                    x: lm.left,
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

impl crate::layout::ManagedTextLayout for SkiaLayoutEngine {
    fn ensure_layout(&mut self, content: &crate::attributed_text::AttributedText) {
        self.ensure_layout_attributed(content);
    }

    fn invalidate(&mut self) {
        // Delegate to the existing invalidate method.
        self.paragraph = None;
        self.blocks.clear();
        self.cached_text.clear();
        self.cached_line_metrics = None;
    }

    fn layout_width(&self) -> f32 {
        self.layout_width
    }

    fn layout_height(&self) -> f32 {
        self.layout_height
    }

    fn set_layout_width(&mut self, w: f32) {
        SkiaLayoutEngine::set_layout_width(self, w);
    }

    fn set_layout_height(&mut self, h: f32) {
        SkiaLayoutEngine::set_layout_height(self, h);
    }
}
