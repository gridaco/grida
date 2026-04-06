use crate::cg::prelude::*;
use crate::painter::paint as paint_util;
use crate::runtime::font_repository::FontRepository;
use crate::runtime::image_repository::ImageRepository;
use crate::text::text_style::textstyle;
use crate::text::text_transform;
use skia_safe::textlayout;

/// Result of building an attributed paragraph, containing both the fill
/// paragraph and an optional stroke paragraph.
pub struct AttributedParagraphSet {
    /// The fill paragraph — always present.
    pub fill: textlayout::Paragraph,
    /// Optional stroke paragraph, built only when at least one run has strokes.
    pub stroke: Option<textlayout::Paragraph>,
}

impl AttributedParagraphSet {
    /// Paint both fill and stroke paragraphs onto the canvas.
    ///
    /// Stroke is painted first (behind fill), matching the common convention
    /// where stroke outlines sit behind the filled glyphs.
    pub fn paint(&self, canvas: &skia_safe::Canvas, point: skia_safe::Point) {
        if let Some(ref stroke) = self.stroke {
            stroke.paint(canvas, point);
        }
        self.fill.paint(canvas, point);
    }

    /// Total height of the paragraph (from the fill paragraph).
    pub fn height(&self) -> f32 {
        self.fill.height()
    }
}

/// Resolve a fill paint stack into a Skia paint, using the image repository
/// when available (falls back to `sk_paint_stack_without_images` otherwise).
fn resolve_fill_paint(
    fills: &[Paint],
    size: (f32, f32),
    images: Option<&ImageRepository>,
) -> Option<skia_safe::Paint> {
    if let Some(images) = images {
        paint_util::sk_paint_stack(fills, size, images, true)
    } else {
        paint_util::sk_paint_stack_without_images(fills, size, true)
    }
}

/// Build an [`AttributedParagraphSet`] from an [`AttributedString`].
///
/// Each run in the attributed string is pushed as a separate styled segment,
/// allowing inline style variations (mixed weights, sizes, colors, decorations,
/// fill paints, and stroke paints) within a single paragraph.
///
/// # Fill Resolution
///
/// Per-run fills are resolved via the paint stack utilities, supporting solid
/// colors, gradients, image paints, and multi-fill stacking. When `images` is
/// `Some`, image paints are resolved from the repository; when `None`, image
/// paints are silently skipped.
///
/// # Stroke Rendering
///
/// If any run carries strokes, a second paragraph is built with stroke-mode
/// foreground paints. The caller (or [`AttributedParagraphSet::paint`]) renders
/// the stroke paragraph behind the fill paragraph.
/// Convenience wrapper for tests and examples that don't have a [`FontRepository`].
///
/// No font fallback injection — uses only the families already in the
/// `font_collection`. For production rendering, use
/// [`build_attributed_paragraph_with_images`] with a `FontRepository`.
pub fn build_attributed_paragraph(
    attr: &AttributedString,
    align: TextAlign,
    max_lines: Option<usize>,
    ellipsis: Option<&str>,
    font_collection: &textlayout::FontCollection,
    width: f32,
) -> AttributedParagraphSet {
    build_attributed_paragraph_inner(
        attr,
        align,
        max_lines,
        ellipsis,
        font_collection,
        width,
        &[],
        None,
        None,
    )
}

/// Production entry point with node-level default fills, image resolution,
/// and automatic font fallback from [`FontRepository`].
pub fn build_attributed_paragraph_with_images(
    attr: &AttributedString,
    align: TextAlign,
    max_lines: Option<usize>,
    ellipsis: Option<&str>,
    fonts: &FontRepository,
    width: f32,
    default_fills: &[Paint],
    images: Option<&ImageRepository>,
) -> AttributedParagraphSet {
    build_attributed_paragraph_inner(
        attr,
        align,
        max_lines,
        ellipsis,
        fonts.font_collection(),
        width,
        default_fills,
        images,
        Some(fonts),
    )
}

/// Like [`build_attributed_paragraph`] but with node-level default fills and
/// an [`ImageRepository`] for resolving image paints on text runs.
///
/// When a run has `fills: None`, `default_fills` is used instead. This
/// implements the fill inheritance model where node-level fills serve as the
/// base paint for runs that don't override.
///
/// Shared implementation for both public entry points.
fn build_attributed_paragraph_inner(
    attr: &AttributedString,
    align: TextAlign,
    max_lines: Option<usize>,
    ellipsis: Option<&str>,
    font_collection: &textlayout::FontCollection,
    width: f32,
    default_fills: &[Paint],
    images: Option<&ImageRepository>,
    fonts: Option<&FontRepository>,
) -> AttributedParagraphSet {
    let make_paragraph_style = || super::make_paragraph_style(align, max_lines, ellipsis);

    // Track whether any run has strokes so we know if we need a second pass.
    let has_any_strokes = attr
        .runs
        .iter()
        .any(|r| r.strokes.as_ref().map_or(false, |s| !s.is_empty()));

    // ----- Fill paragraph -----
    let fill_para = {
        let ps = make_paragraph_style();
        let mut builder = textlayout::ParagraphBuilder::new(&ps, font_collection);

        for run in &attr.runs {
            let text_slice = attr.run_text(run);
            if text_slice.is_empty() {
                continue;
            }

            // Extract first solid color for the build context (decoration fallback).
            let first_solid_color = run
                .fills
                .as_ref()
                .and_then(|fills| fills.iter().find_map(|p| p.solid_color()));

            let ctx = Some(TextStyleRecBuildContext {
                color: first_solid_color.unwrap_or(CGColor::TRANSPARENT),
            });

            let mut ts = textstyle(&run.style, &ctx, fonts);

            // Apply per-run fill paints, falling back to node-level default fills.
            let effective_fills = run.fills.as_deref().unwrap_or(default_fills);
            let active_fills: Vec<&Paint> =
                effective_fills.iter().filter(|p| p.visible()).collect();
            if !active_fills.is_empty() {
                let borrowed: Vec<Paint> = active_fills.iter().map(|p| (*p).clone()).collect();
                if let Some(skia_paint) = resolve_fill_paint(&borrowed, (width, width), images) {
                    ts.set_foreground_paint(&skia_paint);
                }
            }

            builder.push_style(&ts);

            let transformed = text_transform::transform_text(text_slice, run.style.text_transform);
            builder.add_text(&transformed);
        }

        let mut para = builder.build();
        para.layout(width);
        para
    };

    // ----- Stroke paragraph (optional) -----
    let stroke_para = if has_any_strokes {
        let ps = make_paragraph_style();
        let mut builder = textlayout::ParagraphBuilder::new(&ps, font_collection);

        for run in &attr.runs {
            let text_slice = attr.run_text(run);
            if text_slice.is_empty() {
                continue;
            }

            let ctx = Some(TextStyleRecBuildContext {
                color: CGColor::TRANSPARENT,
            });
            let mut ts = textstyle(&run.style, &ctx, fonts);

            if let Some(ref strokes) = run.strokes {
                let active_paints: Vec<Paint> =
                    strokes.iter().filter(|p| p.visible()).cloned().collect();
                if !active_paints.is_empty() {
                    let stroke_w = run.stroke_width.unwrap_or(1.0);
                    if let Some(mut skia_paint) =
                        resolve_fill_paint(&active_paints, (width, width), images)
                    {
                        skia_paint.set_style(skia_safe::PaintStyle::Stroke);
                        skia_paint.set_stroke_width(stroke_w);
                        ts.set_foreground_paint(&skia_paint);
                    }
                } else {
                    // No active strokes — make this run invisible in the stroke pass.
                    ts.set_color(skia_safe::Color::TRANSPARENT);
                }
            } else {
                // No strokes on this run — make invisible in the stroke pass.
                ts.set_color(skia_safe::Color::TRANSPARENT);
            }

            builder.push_style(&ts);

            let transformed = text_transform::transform_text(text_slice, run.style.text_transform);
            builder.add_text(&transformed);
        }

        let mut para = builder.build();
        para.layout(width);
        Some(para)
    } else {
        None
    };

    AttributedParagraphSet {
        fill: fill_para,
        stroke: stroke_para,
    }
}
