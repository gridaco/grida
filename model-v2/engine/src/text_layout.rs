//! The engine's first real text-layout oracle.
//!
//! Text shaping belongs to resolution, not rasterization. This module turns
//! authored text plus a width constraint and an explicit host font into the
//! backend-neutral [`anchor_lab::text_layout::TextLayout`] carried by the
//! resolved tier. The painter later replays its glyph ids and positions; it
//! never asks Skia to shape the string a second time.

use std::cell::RefCell;
use std::sync::Arc;

use anchor_lab::math::RectF;
use anchor_lab::model::{TextPayloadRef, TextStyleRec};
use anchor_lab::text_layout::{
    StubTextLayoutOracle, TextFontKey, TextGlyph, TextGlyphRun, TextLayout, TextLayoutOracle,
    TextLine, TextLineBreak,
};
use skia_safe::font_arguments::{variation_position::Coordinate, VariationPosition};
use skia_safe::font_style::{Slant, Weight, Width};
use skia_safe::textlayout::{
    FontCollection, ParagraphBuilder, ParagraphStyle, TextAlign, TextDirection, TextStyle,
    TypefaceFontProvider,
};
use skia_safe::{Font, FontArguments, FontStyle, FourByteTag, Rect};

use crate::oracle::TEXT_SKPARAGRAPH;
use crate::paint::PaintCtx;

const HOST_FAMILY: &str = "grida-host";

/// Immutable exact font instances used by one resolved drawlist.
///
/// Keys are deliberately local to this snapshot. The shaping oracle collects
/// fonts for one resolution and the drawlist retains an immutable snapshot, so
/// a key can neither be reinterpreted by another [`PaintCtx`] nor accumulate in
/// a long-lived host context while font size is scrubbed.
#[derive(Debug, Default)]
pub(crate) struct TextFontRegistry {
    fonts: Vec<TextFontEntry>,
}

#[derive(Debug, Clone)]
struct TextFontEntry {
    identity: String,
    font: Font,
}

impl TextFontRegistry {
    pub(crate) fn font(&self, key: TextFontKey) -> Font {
        self.fonts
            .get(key.get() as usize)
            .map(|entry| entry.font.clone())
            .unwrap_or_else(|| {
                panic!(
                    "text font key {} is absent from its drawlist registry",
                    key.get()
                )
            })
    }
}

impl PartialEq for TextFontRegistry {
    fn eq(&self, other: &Self) -> bool {
        self.fonts.len() == other.fonts.len()
            && self
                .fonts
                .iter()
                .zip(&other.fonts)
                .all(|(font, other)| font.identity == other.identity)
    }
}

#[derive(Debug, Clone, PartialEq)]
struct ShapeRunKey {
    start: u32,
    end: u32,
    style: TextStyleRec,
}

#[derive(Debug, Clone, PartialEq)]
struct LayoutKey {
    text: String,
    default_style: TextStyleRec,
    runs: Option<Vec<ShapeRunKey>>,
    max_width_bits: Option<u32>,
}

impl LayoutKey {
    fn new(text: TextPayloadRef<'_>, max_width: Option<f32>) -> Self {
        Self {
            text: text.text.to_owned(),
            default_style: text.default_style,
            runs: text.runs.map(|runs| {
                runs.iter()
                    .map(|run| ShapeRunKey {
                        start: run.start,
                        end: run.end,
                        style: run.style,
                    })
                    .collect()
            }),
            max_width_bits: max_width.map(f32::to_bits),
        }
    }
}

/// A per-resolution Skia Paragraph oracle.
///
/// The small linear cache is deliberate for the proving engine: resolution
/// may request the same `(text, styles, width)` several times while negotiating
/// flex slots. Each distinct input is shaped once and all stages share the
/// resulting `Arc`. A promoted engine can replace the storage without changing
/// the oracle or resolved-artifact contracts.
pub(crate) struct SkiaTextLayoutOracle<'a> {
    ctx: &'a PaintCtx,
    fonts: RefCell<Vec<TextFontEntry>>,
    cache: RefCell<Vec<(LayoutKey, Arc<TextLayout>)>>,
}

impl<'a> SkiaTextLayoutOracle<'a> {
    pub(crate) fn new(ctx: &'a PaintCtx) -> Self {
        Self {
            ctx,
            fonts: RefCell::new(Vec::new()),
            cache: RefCell::new(Vec::new()),
        }
    }

    pub(crate) fn font_registry(&self) -> Arc<TextFontRegistry> {
        Arc::new(TextFontRegistry {
            fonts: self.fonts.borrow().clone(),
        })
    }

    fn register_font(&self, identity: &str, font: Font) -> TextFontKey {
        let mut fonts = self.fonts.borrow_mut();
        if let Some(index) = fonts
            .iter()
            .position(|candidate| candidate.identity == identity)
        {
            return TextFontKey::new(
                u32::try_from(index).expect("text font registry exceeds u32 keys"),
            );
        }
        let index = u32::try_from(fonts.len()).expect("text font registry exceeds u32 keys");
        fonts.push(TextFontEntry {
            identity: identity.to_owned(),
            font,
        });
        TextFontKey::new(index)
    }

    fn build(&self, text: TextPayloadRef<'_>, max_width: Option<f32>) -> Arc<TextLayout> {
        let Some(typeface) = self.ctx.font() else {
            // Font-less probes deliberately retain the hand-computable model
            // metric. Its layout is still a single shared resolved artifact;
            // it simply has no glyph runs and therefore emits no text pixels.
            return StubTextLayoutOracle.layout(text, max_width);
        };
        let environment_face_id = typeface.unique_id();
        // Skia's typeface id identifies this in-process face instance only.
        // Label that limitation in the value: this proving backend does not
        // yet claim the durable font-content identity required for portable
        // replay by the universal contract.
        let environment = format!("process-local:skia-typeface-{}", typeface.unique_id());

        let mut provider = TypefaceFontProvider::new();
        provider.register_typeface(typeface.clone(), Some(HOST_FAMILY));
        let mut fonts = FontCollection::new();
        fonts.set_asset_font_manager(Some(provider.into()));
        fonts.disable_font_fallback();

        let default_style = sk_text_style(text.default_style, None);
        let mut paragraph_style = ParagraphStyle::new();
        paragraph_style.set_text_direction(TextDirection::LTR);
        paragraph_style.set_text_align(TextAlign::Left);
        paragraph_style.set_apply_rounding_hack(false);
        paragraph_style.set_fake_missing_font_styles(true);
        paragraph_style.set_text_style(&default_style);

        let mut builder = ParagraphBuilder::new(&paragraph_style, &fonts);
        let synthetic_empty = text.text.is_empty();
        if synthetic_empty {
            // SkParagraph gives a truly empty paragraph zero block extent.
            // Resolve one synthetic space solely to obtain the selected
            // default font's line metrics, then discard its advance, glyphs,
            // and source mapping below. The published artifact still has no
            // invented source character and no ink.
            builder.push_style(&default_style);
            builder.add_text(" ");
            builder.pop();
        } else {
            match text.runs {
                Some(runs) => {
                    for (run_index, run) in runs.iter().enumerate() {
                        // A paint boundary is a real glyph-run boundary. Give each
                        // authored run a distinct inert Paragraph color so Skia
                        // cannot merge equal typography across two paint stacks and
                        // form a ligature that cannot be painted losslessly.
                        let style = sk_text_style(run.style, Some(run_index));
                        builder.push_style(&style);
                        builder.add_text(&text.text[run.start as usize..run.end as usize]);
                        builder.pop();
                    }
                }
                None => {
                    builder.push_style(&default_style);
                    builder.add_text(text.text);
                    builder.pop();
                }
            }
        }

        let mut paragraph = builder.build();
        let layout_width = match max_width {
            Some(width) => width.max(0.0),
            None => {
                paragraph.layout(f32::INFINITY);
                paragraph.max_intrinsic_width().max(0.0)
            }
        };
        // Extraction is always from a finite, final layout. Infinite-width
        // formatting may discard visual lines for non-left effective alignment.
        paragraph.layout(layout_width);

        let height = paragraph.height();
        let unresolved_glyphs = if synthetic_empty {
            0
        } else {
            paragraph.unresolved_glyphs().unwrap_or(0)
        };
        let measured_width = if synthetic_empty {
            0.0
        } else if max_width.is_some() {
            paragraph.longest_line()
        } else {
            paragraph.max_intrinsic_width()
        };

        let line_metrics = paragraph.get_line_metrics();
        let mut lines = Vec::with_capacity(line_metrics.len().max(1));
        let mut consumed_cursor = 0usize;
        for (line_index, line) in line_metrics.iter().enumerate() {
            // SkParagraph line metrics use UTF-16 code-unit offsets while the
            // authored model and visitor cluster table use UTF-8 bytes. Convert
            // every boundary before slicing; never clamp into the middle of a
            // multibyte scalar. A trailing empty line may point at the newline
            // already consumed by the preceding line, so source coverage is
            // normalized monotonically with `consumed_cursor`.
            let start = utf16_to_utf8(text.text, line.start_index)
                .max(consumed_cursor)
                .min(text.text.len());
            let source_end = utf16_to_utf8(text.text, line.end_including_newline)
                .max(start)
                .min(text.text.len());
            let visible_end =
                utf16_to_utf8(text.text, line.end_excluding_whitespaces).clamp(start, source_end);
            let explicit_break = text.text[visible_end..source_end].chars().any(|character| {
                matches!(
                    character,
                    '\n' | '\r' | '\u{0085}' | '\u{2028}' | '\u{2029}'
                )
            });
            lines.push(TextLine {
                text: text.text[start..visible_end].to_owned(),
                byte_range: start as u32..visible_end as u32,
                source_range: start as u32..source_end as u32,
                end: if explicit_break {
                    TextLineBreak::Explicit
                } else if line_index + 1 == line_metrics.len() {
                    TextLineBreak::Terminal
                } else {
                    TextLineBreak::Soft
                },
                left: line.left as f32,
                width: if synthetic_empty {
                    0.0
                } else {
                    line.width as f32
                },
                top: (line.baseline - line.ascent) as f32,
                height: line.height as f32,
                baseline: line.baseline as f32,
                ascent: line.ascent as f32,
                descent: line.descent as f32,
            });
            consumed_cursor = source_end;
        }
        if lines.is_empty() {
            // Keep the empty attributed-string sentinel inspectable by caret
            // and selection consumers even when Skia emits no visitor line.
            lines.push(TextLine {
                text: String::new(),
                byte_range: 0..0,
                source_range: 0..0,
                end: TextLineBreak::Terminal,
                left: 0.0,
                width: 0.0,
                top: 0.0,
                height,
                baseline: paragraph.alphabetic_baseline(),
                ascent: paragraph.alphabetic_baseline(),
                descent: (height - paragraph.alphabetic_baseline()).max(0.0),
            });
        }

        let mut glyph_runs: Vec<TextGlyphRun> = Vec::new();
        let mut ink_bounds: Option<RectF> = None;
        if !synthetic_empty {
            paragraph.visit(|line_index, info| {
                let Some(info) = info else {
                    return;
                };
                let font = info.font().clone();
                let font_identity = process_font_identity(&font, environment_face_id);
                let font_key = self.register_font(&font_identity, font.clone());
                let glyph_ids = info.glyphs();
                let positions = info.positions();
                let starts = info.utf8_starts();
                let origin = info.origin();
                let mut bounds = vec![Rect::default(); glyph_ids.len()];
                font.get_bounds(glyph_ids, &mut bounds, None);

                for (index, glyph_id) in glyph_ids.iter().copied().enumerate() {
                    let cluster = starts.get(index).copied().unwrap_or(0);
                    let source_run = source_run_at(text, cluster);
                    let position = positions[index];
                    let x = position.x + origin.x;
                    let y = position.y + origin.y;
                    let bound = bounds[index];
                    let glyph_bounds = (!bound.is_empty()).then_some(RectF {
                        x: bound.left + x,
                        y: bound.top + y,
                        w: bound.width(),
                        h: bound.height(),
                    });
                    if let Some(bound) = glyph_bounds {
                        ink_bounds = Some(match ink_bounds {
                            Some(current) => current.union(&bound),
                            None => bound,
                        });
                    }

                    let starts_new_run = glyph_runs.last().is_none_or(|run| {
                        run.line_index != line_index
                            || run.source_run != source_run
                            || run.font_identity != font_identity
                            || run.font != font_key
                    });
                    if starts_new_run {
                        glyph_runs.push(TextGlyphRun {
                            line_index,
                            source_run,
                            font_identity: font_identity.clone(),
                            font: font_key,
                            glyphs: Vec::new(),
                        });
                    }
                    glyph_runs
                        .last_mut()
                        .expect("glyph run was just ensured")
                        .glyphs
                        .push(TextGlyph {
                            id: glyph_id,
                            cluster,
                            x,
                            y,
                            bounds: glyph_bounds,
                        });
                }
            });
        }

        let logical_bounds = lines
            .iter()
            .map(|line| RectF {
                x: line.left,
                y: line.top,
                w: line.width,
                h: line.height,
            })
            .reduce(|current, line| current.union(&line));

        Arc::new(TextLayout {
            oracle: TEXT_SKPARAGRAPH,
            environment,
            width_constraint: max_width,
            assigned_box: RectF {
                x: 0.0,
                y: 0.0,
                w: measured_width,
                h: height,
            },
            width: measured_width,
            height,
            lines,
            glyph_runs,
            logical_bounds,
            ink_bounds,
            unresolved_glyphs,
        })
    }
}

impl TextLayoutOracle for SkiaTextLayoutOracle<'_> {
    fn layout(&self, text: TextPayloadRef<'_>, max_width: Option<f32>) -> Arc<TextLayout> {
        let key = LayoutKey::new(text, max_width);
        if let Some(layout) = self
            .cache
            .borrow()
            .iter()
            .find_map(|(candidate, layout)| (candidate == &key).then(|| Arc::clone(layout)))
        {
            return layout;
        }
        let layout = self.build(text, max_width);
        self.cache.borrow_mut().push((key, Arc::clone(&layout)));
        layout
    }
}

fn source_run_at(text: TextPayloadRef<'_>, cluster: u32) -> Option<usize> {
    let runs = text.runs?;
    let byte = cluster.min(text.text.len() as u32);
    runs.iter()
        .position(|run| run.start <= byte && byte < run.end)
        .or_else(|| text.text.is_empty().then_some(0))
}

fn utf16_to_utf8(text: &str, target: usize) -> usize {
    if target == 0 {
        return 0;
    }
    let mut utf16 = 0usize;
    for (byte, character) in text.char_indices() {
        if utf16 == target {
            return byte;
        }
        let next = utf16 + character.len_utf16();
        if target < next {
            // Line metrics must land on scalar boundaries. Refuse to create an
            // invalid Rust slice if an upstream oracle ever violates that law.
            return byte;
        }
        utf16 = next;
    }
    text.len()
}

/// Process-local identity for the exact Skia font instance returned by the
/// paragraph visitor. The Typeface id is intentionally scoped to this process;
/// the remaining fields keep semantically distinct sizes, synthetic styles,
/// raster-facing font flags, and variable instances distinct in drawlist and
/// damage comparisons even when their registry slot happens to match.
fn process_font_identity(font: &Font, environment_face_id: u32) -> String {
    let typeface = font.typeface();
    let style = typeface.font_style();
    let mut variations = typeface.variation_design_position().unwrap_or_default();
    variations.sort_by_key(|coordinate| *coordinate.axis);
    let variations = variations
        .iter()
        .map(|coordinate| {
            format!(
                "{:08x}={:08x}",
                *coordinate.axis,
                coordinate.value.to_bits()
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let flags = (font.is_force_auto_hinting() as u8)
        | ((font.is_embedded_bitmaps() as u8) << 1)
        | ((font.is_subpixel() as u8) << 2)
        | ((font.is_linear_metrics() as u8) << 3)
        | ((font.is_embolden() as u8) << 4)
        | ((font.is_baseline_snap() as u8) << 5);

    format!(
        "skia-process:env-face={environment_face_id}:style={}/{}/{:?}:size={:08x}:scale={:08x}:skew={:08x}:flags={flags:02x}:edging={:?}:hinting={:?}:vars=[{variations}]",
        *style.weight(),
        *style.width(),
        style.slant(),
        font.size().to_bits(),
        font.scale_x().to_bits(),
        font.skew_x().to_bits(),
        font.edging(),
        font.hinting(),
    )
}

fn sk_text_style(style: TextStyleRec, source_run: Option<usize>) -> TextStyle {
    let mut text_style = TextStyle::new();
    text_style.set_font_families(&[HOST_FAMILY]);
    text_style.set_font_size(style.font_size);
    text_style.set_font_style(FontStyle::new(
        Weight::from(style.font_weight as i32),
        Width::NORMAL,
        if style.font_style_italic {
            Slant::Italic
        } else {
            Slant::Upright
        },
    ));

    // Paint is not read from the Paragraph, but a unique inert color keeps a
    // paint-only authored boundary from being merged into one shaped ligature.
    if let Some(index) = source_run {
        let encoded = (index as u32).wrapping_add(1);
        text_style.set_color(skia_safe::Color::from_argb(
            0xFF,
            (encoded >> 16) as u8,
            (encoded >> 8) as u8,
            encoded as u8,
        ));
    }

    let coordinates = [
        Coordinate {
            axis: FourByteTag::from_chars('w', 'g', 'h', 't'),
            value: style.font_weight as f32,
        },
        Coordinate {
            axis: FourByteTag::from_chars('o', 'p', 's', 'z'),
            value: style.font_size,
        },
    ];
    let arguments = FontArguments::new().set_variation_design_position(VariationPosition {
        coordinates: &coordinates,
    });
    text_style.set_font_arguments(&arguments);
    text_style
}

#[cfg(test)]
mod registry_tests {
    use super::TextFontRegistry;
    use anchor_lab::text_layout::TextFontKey;

    #[test]
    #[should_panic(expected = "text font key 0 is absent from its drawlist registry")]
    fn missing_font_key_fails_loudly() {
        TextFontRegistry::default().font(TextFontKey::new(0));
    }
}
