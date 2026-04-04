//! Phase 3: `LayoutBox` tree → Skia Picture.
//!
//! Paint order follows Chromium's phases (simplified):
//! 1. **Background** — box-shadow (outer), background-color, border, box-shadow (inset)
//! 2. **Children** — recurse into child boxes and inline content
//! 3. **Outline** — (not yet implemented)
//!
//! Opacity, clipping, and visibility are handled via canvas save/restore.

use crate::cg::prelude::*;
use crate::runtime::font_repository::FontRepository;

use skia_safe::textlayout::{self, FontCollection, ParagraphBuilder, ParagraphStyle};
use skia_safe::{Canvas, ClipOp, Color, Paint, PaintStyle, PictureRecorder, Rect};

use super::layout::{build_skia_text_style, LayoutBox, LayoutNode};
use super::style::{
    BackgroundLayer, BorderSide, ConicGradient, GradientStop, InlineBoxDecoration, InlineGroup,
    InlineRunItem, LinearGradient, RadialGradient, StyledElement, TextRun,
};
use super::types;

/// Paint a `LayoutBox` tree into a Skia `Picture`.
pub fn paint_to_picture(
    root: &LayoutBox,
    width: f32,
    height: f32,
    fonts: &FontRepository,
) -> skia_safe::Picture {
    let font_collection = fonts.font_collection();
    let mut recorder = PictureRecorder::new();
    let bounds = Rect::from_wh(width, height.max(1.0));
    let canvas = recorder.begin_recording(bounds, false);

    paint_box(canvas, root, font_collection);

    // Marker rect so Skia preserves the cull rect
    {
        let mut p = Paint::default();
        p.set_color(Color::TRANSPARENT);
        canvas.draw_rect(Rect::from_wh(width, height.max(1.0)), &p);
    }

    let cull = Rect::from_xywh(0.0, 0.0, width, height);
    recorder
        .finish_recording_as_picture(Some(&cull))
        .expect("Failed to finish recording HTML picture")
}

// ─── Recursive box painter (Chromium: BoxFragmentPainter) ────────────

fn paint_box(canvas: &Canvas, layout: &LayoutBox, fonts: &FontCollection) {
    let style = layout.style;

    // Visibility check (Chromium: early return in PaintObject)
    if style.visibility == types::Visibility::Hidden
        || style.visibility == types::Visibility::Collapse
    {
        return;
    }

    let x = layout.x;
    let y = layout.y;
    let w = layout.width;
    let h = layout.height;

    // ── Save state for opacity / clip ──
    let needs_layer = style.opacity < 1.0;
    let needs_clip = style.overflow_x != types::Overflow::Visible
        || style.overflow_y != types::Overflow::Visible;

    canvas.save();
    canvas.translate((x, y));

    if needs_layer {
        let mut layer_paint = Paint::default();
        layer_paint.set_alpha((style.opacity * 255.0) as u8);
        let bounds = Rect::from_xywh(0.0, 0.0, w, h);
        let layer_rec = skia_safe::canvas::SaveLayerRec::default()
            .paint(&layer_paint)
            .bounds(&bounds);
        canvas.save_layer(&layer_rec);
    }

    if needs_clip {
        canvas.clip_rect(Rect::from_xywh(0.0, 0.0, w, h), ClipOp::Intersect, true);
    }

    // ── Phase 1: Background (Chromium: kBlockBackground) ──
    // Order: outer box-shadow → background-color → border → inset box-shadow
    paint_box_shadow_outer(canvas, style, w, h);
    paint_background(canvas, style, w, h);
    paint_borders(canvas, style, w, h);
    paint_box_shadow_inset(canvas, style, w, h);

    // ── Phase 2: Children (Chromium: kForeground for inlines, recurse for blocks) ──
    for child in &layout.children {
        match child {
            LayoutNode::Box(child_box) => {
                paint_box(canvas, child_box, fonts);
            }
            LayoutNode::Text {
                run,
                x: tx,
                y: ty,
                width: tw,
            } => {
                paint_text(canvas, run, *tx, *ty, *tw, fonts);
            }
            LayoutNode::InlineGroup {
                group,
                x: gx,
                y: gy,
                width: gw,
            } => {
                paint_inline_group(canvas, group, *gx, *gy, *gw, fonts);
            }
        }
    }

    // ── Restore ──
    if needs_layer {
        canvas.restore(); // layer
    }
    canvas.restore(); // translate
}

// ─── Background painting (Chromium: BoxPainterBase::PaintFillLayers) ──

fn paint_background(canvas: &Canvas, style: &StyledElement, w: f32, h: f32) {
    if style.background.is_empty() {
        return;
    }

    let rect = Rect::from_xywh(0.0, 0.0, w, h);
    let r = &style.border_radius;

    for layer in &style.background {
        let mut paint = Paint::default();
        paint.set_style(PaintStyle::Fill);
        paint.set_anti_alias(true);

        match layer {
            BackgroundLayer::Solid(c) => {
                if c.a == 0 {
                    continue;
                }
                paint.set_color(Color::from_argb(c.a, c.r, c.g, c.b));
            }
            BackgroundLayer::LinearGradient(grad) => {
                if let Some(shader) = build_linear_gradient_shader(grad, w, h) {
                    paint.set_shader(shader);
                } else {
                    continue;
                }
            }
            BackgroundLayer::RadialGradient(grad) => {
                if let Some(shader) = build_radial_gradient_shader(grad, w, h) {
                    paint.set_shader(shader);
                } else {
                    continue;
                }
            }
            BackgroundLayer::ConicGradient(grad) => {
                if let Some(shader) = build_conic_gradient_shader(grad, w, h) {
                    paint.set_shader(shader);
                } else {
                    continue;
                }
            }
        }

        if r.is_zero() {
            canvas.draw_rect(rect, &paint);
        } else {
            let mut rrect = skia_safe::RRect::new();
            rrect.set_rect_radii(rect, &r.to_skia_radii());
            canvas.draw_rrect(rrect, &paint);
        }
    }
}

// ─── Gradient shaders ────────────────────────────────────────────────

use skia_safe::gradient_shader::{Gradient, GradientColors, Interpolation};
use skia_safe::scalar;

fn build_gradient_data(stops: &[GradientStop]) -> (Vec<skia_safe::Color4f>, Vec<f32>) {
    let colors: Vec<skia_safe::Color4f> = stops
        .iter()
        .map(|s| {
            skia_safe::Color4f::new(
                s.color.r as f32 / 255.0,
                s.color.g as f32 / 255.0,
                s.color.b as f32 / 255.0,
                s.color.a as f32 / 255.0,
            )
        })
        .collect();
    let positions: Vec<f32> = stops.iter().map(|s| s.offset).collect();
    (colors, positions)
}

fn make_gradient<'a>(colors: &'a [skia_safe::Color4f], positions: &'a [f32]) -> Gradient<'a> {
    Gradient::new(
        GradientColors::new(colors, Some(positions), skia_safe::TileMode::Clamp, None),
        Interpolation::default(),
    )
}

fn build_linear_gradient_shader(
    grad: &LinearGradient,
    w: f32,
    h: f32,
) -> Option<skia_safe::Shader> {
    let (colors, positions) = build_gradient_data(&grad.stops);
    if colors.len() < 2 {
        return None;
    }

    // CSS: 0deg = to top, 90deg = to right. Convert to start/end points.
    let rad = grad.angle_deg.to_radians();
    let sin = rad.sin();
    let cos = rad.cos();
    let cx = w / 2.0;
    let cy = h / 2.0;
    // Half-length covers the box diagonal
    let half_len = (w * sin.abs() + h * cos.abs()) / 2.0;
    let p1 = skia_safe::Point::new(cx - sin * half_len, cy + cos * half_len);
    let p2 = skia_safe::Point::new(cx + sin * half_len, cy - cos * half_len);

    let gradient = make_gradient(&colors, &positions);
    skia_safe::shaders::linear_gradient((p1, p2), &gradient, None)
}

fn build_radial_gradient_shader(
    grad: &RadialGradient,
    w: f32,
    h: f32,
) -> Option<skia_safe::Shader> {
    let (colors, positions) = build_gradient_data(&grad.stops);
    if colors.len() < 2 {
        return None;
    }

    let matrix = skia_safe::Matrix::scale((w, h));
    let gradient = make_gradient(&colors, &positions);
    skia_safe::shaders::radial_gradient(
        (skia_safe::Point::new(0.5, 0.5), 0.5 as scalar),
        &gradient,
        Some(&matrix),
    )
}

fn build_conic_gradient_shader(grad: &ConicGradient, w: f32, h: f32) -> Option<skia_safe::Shader> {
    let (colors, positions) = build_gradient_data(&grad.stops);
    if colors.len() < 2 {
        return None;
    }

    let matrix = skia_safe::Matrix::scale((w, h));
    let gradient = make_gradient(&colors, &positions);
    skia_safe::shaders::sweep_gradient(
        skia_safe::Point::new(0.5, 0.5),
        (0.0 as scalar, 360.0 as scalar),
        &gradient,
        Some(&matrix),
    )
}

// ─── Border painting (Chromium: BoxBorderPainter::PaintBorder) ───────

fn paint_borders(canvas: &Canvas, style: &StyledElement, w: f32, h: f32) {
    let b = &style.border;

    if b.top.width > 0.0 && b.top.style != types::BorderStyle::None {
        let paint = border_paint(&b.top);
        let by = b.top.width / 2.0;
        canvas.draw_line((0.0, by), (w, by), &paint);
    }

    if b.bottom.width > 0.0 && b.bottom.style != types::BorderStyle::None {
        let paint = border_paint(&b.bottom);
        let by = h - b.bottom.width / 2.0;
        canvas.draw_line((0.0, by), (w, by), &paint);
    }

    if b.left.width > 0.0 && b.left.style != types::BorderStyle::None {
        let paint = border_paint(&b.left);
        let bx = b.left.width / 2.0;
        canvas.draw_line((bx, 0.0), (bx, h), &paint);
    }

    if b.right.width > 0.0 && b.right.style != types::BorderStyle::None {
        let paint = border_paint(&b.right);
        let bx = w - b.right.width / 2.0;
        canvas.draw_line((bx, 0.0), (bx, h), &paint);
    }
}

fn border_paint(side: &BorderSide) -> Paint {
    let mut paint = Paint::default();
    paint.set_color(Color::from_argb(
        side.color.a,
        side.color.r,
        side.color.g,
        side.color.b,
    ));
    paint.set_stroke_width(side.width);
    paint.set_style(PaintStyle::Stroke);
    paint.set_anti_alias(true);

    match side.style {
        types::BorderStyle::Dashed => {
            let dash_len = side.width * 3.0;
            if let Some(effect) = skia_safe::PathEffect::dash(&[dash_len, dash_len], 0.0) {
                paint.set_path_effect(effect);
            }
        }
        types::BorderStyle::Dotted => {
            if let Some(effect) = skia_safe::PathEffect::dash(&[side.width, side.width], 0.0) {
                paint.set_path_effect(effect);
            }
            paint.set_stroke_cap(skia_safe::paint::Cap::Round);
        }
        _ => {}
    }

    paint
}

// ─── Box shadow (Chromium: BoxPainterBase::PaintNormalBoxShadow / PaintInsetBoxShadow) ──

fn paint_box_shadow_outer(canvas: &Canvas, style: &StyledElement, w: f32, h: f32) {
    for shadow in &style.box_shadow {
        if shadow.inset {
            continue;
        }
        let mut paint = Paint::default();
        paint.set_color(Color::from_argb(
            shadow.color.a,
            shadow.color.r,
            shadow.color.g,
            shadow.color.b,
        ));
        paint.set_anti_alias(true);
        paint.set_style(PaintStyle::Fill);
        if shadow.blur > 0.0 {
            paint.set_mask_filter(skia_safe::MaskFilter::blur(
                skia_safe::BlurStyle::Normal,
                shadow.blur / 2.0,
                false,
            ));
        }

        let shadow_rect = Rect::from_xywh(
            shadow.offset_x - shadow.spread,
            shadow.offset_y - shadow.spread,
            w + shadow.spread * 2.0,
            h + shadow.spread * 2.0,
        );

        let r = &style.border_radius;
        if r.is_zero() {
            canvas.draw_rect(shadow_rect, &paint);
        } else {
            let mut rrect = skia_safe::RRect::new();
            rrect.set_rect_radii(shadow_rect, &r.to_skia_radii());
            canvas.draw_rrect(rrect, &paint);
        }
    }
}

fn paint_box_shadow_inset(_canvas: &Canvas, style: &StyledElement, _w: f32, _h: f32) {
    for shadow in &style.box_shadow {
        if !shadow.inset {
            continue;
        }
        // TODO: inset box shadows require clipping to the box bounds
        // and drawing the shadow inside. This is more complex than outer
        // shadows and requires a save/clip/draw/restore pattern.
        let _ = shadow;
    }
}

// ─── Text painting (Chromium: TextPainter) ───────────────────────────

fn paint_text(canvas: &Canvas, run: &TextRun, x: f32, y: f32, width: f32, fonts: &FontCollection) {
    let mut ps = ParagraphStyle::new();
    let align = match run.font.text_align {
        TextAlign::Left => textlayout::TextAlign::Left,
        TextAlign::Right => textlayout::TextAlign::Right,
        TextAlign::Center => textlayout::TextAlign::Center,
        TextAlign::Justify => textlayout::TextAlign::Justify,
    };
    ps.set_text_align(align);

    let mut builder = ParagraphBuilder::new(&ps, fonts);
    let ts = build_skia_text_style(&run.font, &run.color);
    builder.push_style(&ts);
    builder.add_text(&run.text);

    let mut para = builder.build();
    para.layout(width);
    para.paint(canvas, (x, y));
}

/// Paint an inline group as a single multi-run Skia Paragraph.
///
/// Three-step approach mirroring Chromium's inline painting pipeline:
/// 1. Build the Paragraph with placeholders at OpenBox/CloseBox boundaries
///    (Chromium: `LineBreaker::HandleOpenTag`/`HandleCloseTag` add inline_size)
/// 2. For items with decorations, use `get_rects_for_range()` to find their
///    physical rects, then paint box decorations (Chromium: `InlineBoxPainter`)
/// 3. Paint the paragraph text on top (Chromium: `TextPainter`)
fn paint_inline_group(
    canvas: &Canvas,
    group: &InlineGroup,
    x: f32,
    y: f32,
    width: f32,
    fonts: &FontCollection,
) {
    use skia_safe::textlayout::{
        PlaceholderAlignment, PlaceholderStyle, RectHeightStyle, RectWidthStyle, TextBaseline,
    };

    let mut ps = ParagraphStyle::new();
    let align = match group.text_align {
        TextAlign::Left => textlayout::TextAlign::Left,
        TextAlign::Right => textlayout::TextAlign::Right,
        TextAlign::Center => textlayout::TextAlign::Center,
        TextAlign::Justify => textlayout::TextAlign::Justify,
    };
    ps.set_text_align(align);

    let mut builder = ParagraphBuilder::new(&ps, fonts);

    // Track paragraph offset for get_rects_for_range().
    // Each Skia placeholder occupies exactly 1 position in the offset space
    // (verified empirically — see test_placeholder_byte_offset).
    // Text occupies its byte length.
    const PLACEHOLDER_OFFSET: usize = 1;

    struct DecoRange {
        range_start: usize,
        range_end: usize,
        deco: InlineBoxDecoration,
    }
    let mut deco_stack: Vec<(usize, InlineBoxDecoration)> = Vec::new();
    let mut deco_ranges: Vec<DecoRange> = Vec::new();
    let mut offset: usize = 0;

    for item in &group.items {
        match item {
            InlineRunItem::Text(run) => {
                let ts = build_skia_text_style(&run.font, &run.color);
                builder.push_style(&ts);
                builder.add_text(&run.text);
                builder.pop();
                offset += run.text.len();
            }
            InlineRunItem::OpenBox {
                inline_size,
                decoration,
            } => {
                if *inline_size > 0.0 {
                    builder.add_placeholder(&PlaceholderStyle::new(
                        *inline_size,
                        0.01,
                        PlaceholderAlignment::Baseline,
                        TextBaseline::Alphabetic,
                        0.0,
                    ));
                    offset += PLACEHOLDER_OFFSET;
                }
                // Record start AFTER the open placeholder
                deco_stack.push((offset, decoration.clone()));
            }
            InlineRunItem::CloseBox { inline_size } => {
                // Record end BEFORE the close placeholder
                if let Some((start, deco)) = deco_stack.pop() {
                    deco_ranges.push(DecoRange {
                        range_start: start,
                        range_end: offset,
                        deco,
                    });
                }
                if *inline_size > 0.0 {
                    builder.add_placeholder(&PlaceholderStyle::new(
                        *inline_size,
                        0.01,
                        PlaceholderAlignment::Baseline,
                        TextBaseline::Alphabetic,
                        0.0,
                    ));
                    offset += PLACEHOLDER_OFFSET;
                }
            }
        }
    }

    let mut para = builder.build();
    para.layout(width);

    // Pass 1: Paint inline box decorations (Chromium: InlineBoxPainter)
    for deco_range in &deco_ranges {
        if deco_range.range_start >= deco_range.range_end {
            continue;
        }
        let rects = para.get_rects_for_range(
            deco_range.range_start..deco_range.range_end,
            RectHeightStyle::Tight,
            RectWidthStyle::Tight,
        );
        let deco = &deco_range.deco;
        let border_w = deco.border.map_or(0.0, |b| b.width);

        for text_box in &rects {
            let r = text_box.rect;
            // The text rect from get_rects_for_range covers just the text.
            // The decoration rect extends outward to include padding + border
            // (the placeholders already pushed the text inward in the paragraph).
            let deco_rect = Rect::from_xywh(
                x + r.left - deco.padding_inline - border_w,
                y + r.top - deco.padding_block,
                r.width() + (deco.padding_inline + border_w) * 2.0,
                r.height() + deco.padding_block * 2.0,
            );

            // Background fill
            if let Some(bg) = deco.background {
                let mut paint = Paint::default();
                paint.set_color(Color::from_argb(bg.a, bg.r, bg.g, bg.b));
                paint.set_style(PaintStyle::Fill);
                paint.set_anti_alias(true);
                if deco.border_radius > 0.0 {
                    canvas.draw_round_rect(
                        deco_rect,
                        deco.border_radius,
                        deco.border_radius,
                        &paint,
                    );
                } else {
                    canvas.draw_rect(deco_rect, &paint);
                }
            }

            // Border stroke
            if let Some(border) = &deco.border {
                if border.width > 0.0 {
                    let mut paint = Paint::default();
                    paint.set_color(Color::from_argb(
                        border.color.a,
                        border.color.r,
                        border.color.g,
                        border.color.b,
                    ));
                    paint.set_stroke_width(border.width);
                    paint.set_style(PaintStyle::Stroke);
                    paint.set_anti_alias(true);
                    if deco.border_radius > 0.0 {
                        canvas.draw_round_rect(
                            deco_rect,
                            deco.border_radius,
                            deco.border_radius,
                            &paint,
                        );
                    } else {
                        canvas.draw_rect(deco_rect, &paint);
                    }
                }
            }
        }
    }

    // Pass 2: Paint the paragraph text on top (Chromium: TextPainter)
    para.paint(canvas, (x, y));
}
