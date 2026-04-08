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
    InlineRunItem, LinearGradient, RadialGradient, StyleImage, StyledElement, TextRun,
    WidgetAppearance,
};
use super::types;
use super::ImageProvider;

/// Paint a `LayoutBox` tree into a Skia `Picture`.
pub fn paint_to_picture(
    root: &LayoutBox,
    width: f32,
    height: f32,
    fonts: &FontRepository,
    images: &dyn ImageProvider,
) -> skia_safe::Picture {
    let font_collection = fonts.font_collection();
    let mut recorder = PictureRecorder::new();
    let bounds = Rect::from_wh(width, height.max(1.0));
    let canvas = recorder.begin_recording(bounds, false);

    paint_box(canvas, root, font_collection, images);

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

fn paint_box(
    canvas: &Canvas,
    layout: &LayoutBox,
    fonts: &FontCollection,
    images: &dyn ImageProvider,
) {
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

    // ── CSS transform (applied after positioning, around transform-origin) ──
    // Resolve percentage/length operands now that box size (w, h) is known,
    // then bake T(origin) * M * T(-origin) into a single matrix concat.
    if !style.transform.is_empty() {
        if let Some(m) = resolve_transform(&style.transform, w, h) {
            let ox = style.transform_origin.x.resolve(w);
            let oy = style.transform_origin.y.resolve(h);
            let matrix = skia_safe::Matrix::new_all(
                m[0],
                m[2],
                m[4] + ox - m[0] * ox - m[2] * oy,
                m[1],
                m[3],
                m[5] + oy - m[1] * ox - m[3] * oy,
                0.0,
                0.0,
                1.0,
            );
            canvas.concat(&matrix);
        }
    }

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
    // Order: widget bg → outer box-shadow → background-color → border → inset box-shadow
    // Widget background painted first so CSS background/border can override.
    paint_widget_background(canvas, style, w, h);
    paint_box_shadow_outer(canvas, style, w, h);
    paint_background(canvas, style, w, h, images);
    paint_borders(canvas, style, w, h);
    paint_box_shadow_inset(canvas, style, w, h);

    // ── Phase 1.5: Replaced content (<img>) ──
    // Replaced elements paint their image content instead of children.
    if let Some(ref replaced) = style.replaced {
        paint_replaced(
            canvas,
            replaced,
            0.0,
            0.0,
            w,
            h,
            &style.border_radius,
            images,
        );
    }

    // ── Phase 2: Children (Chromium: kForeground for inlines, recurse for blocks) ──
    for child in &layout.children {
        match child {
            LayoutNode::Box(child_box) => {
                paint_box(canvas, child_box, fonts, images);
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

    // ── Phase 3: Widget chrome (form control appearance) ──
    paint_widget_chrome(canvas, style, w, h);

    // ── Restore ──
    if needs_layer {
        canvas.restore(); // layer
    }
    canvas.restore(); // translate
}

// ─── Transform resolution ───────────────────────────────────────────

/// Resolve a list of `TransformOp` into a flattened 2D affine matrix,
/// resolving percentage operands against the element's box size.
/// Returns `None` if the result is identity (no visual effect).
fn resolve_transform(ops: &[types::TransformOp], w: f32, h: f32) -> Option<[f32; 6]> {
    // Matrix layout: [a, b, c, d, tx, ty]
    // | a c tx |
    // | b d ty |
    // | 0 0  1 |
    let mut m: [f32; 6] = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];

    for op in ops {
        let op_m = match op {
            types::TransformOp::Matrix(mat) => *mat,
            types::TransformOp::Translate(tx, ty) => {
                [1.0, 0.0, 0.0, 1.0, tx.resolve(w), ty.resolve(h)]
            }
            types::TransformOp::Scale(sx, sy) => [*sx, 0.0, 0.0, *sy, 0.0, 0.0],
            types::TransformOp::Rotate(rad) => {
                let (sin, cos) = rad.sin_cos();
                [cos, sin, -sin, cos, 0.0, 0.0]
            }
            types::TransformOp::Skew(ax, ay) => [1.0, ay.tan(), ax.tan(), 1.0, 0.0, 0.0],
        };
        m = mat_mul(m, op_m);
    }

    let is_identity = (m[0] - 1.0).abs() < 1e-6
        && m[1].abs() < 1e-6
        && m[2].abs() < 1e-6
        && (m[3] - 1.0).abs() < 1e-6
        && m[4].abs() < 1e-6
        && m[5].abs() < 1e-6;
    if is_identity {
        None
    } else {
        Some(m)
    }
}

/// Multiply two 2D affine matrices: result = a * b.
fn mat_mul(a: [f32; 6], b: [f32; 6]) -> [f32; 6] {
    [
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5],
    ]
}

// ─── Background painting (Chromium: BoxPainterBase::PaintFillLayers) ──

fn paint_background(
    canvas: &Canvas,
    style: &StyledElement,
    w: f32,
    h: f32,
    images: &dyn ImageProvider,
) {
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
            BackgroundLayer::Image(style_image) => {
                match style_image {
                    StyleImage::LinearGradient(grad) => {
                        if let Some(shader) = build_linear_gradient_shader(grad, w, h) {
                            paint.set_shader(shader);
                        } else {
                            continue;
                        }
                    }
                    StyleImage::RadialGradient(grad) => {
                        if let Some(shader) = build_radial_gradient_shader(grad, w, h) {
                            paint.set_shader(shader);
                        } else {
                            continue;
                        }
                    }
                    StyleImage::ConicGradient(grad) => {
                        if let Some(shader) = build_conic_gradient_shader(grad, w, h) {
                            paint.set_shader(shader);
                        } else {
                            continue;
                        }
                    }
                    StyleImage::Url(url) => {
                        if let Some(image) = images.get(url) {
                            // Default: stretch image to fill the background area.
                            // TODO: background-size, background-position, background-repeat
                            let src_rect =
                                Rect::from_wh(image.width() as f32, image.height() as f32);
                            canvas.save();
                            if !r.is_zero() {
                                let mut rrect = skia_safe::RRect::new();
                                rrect.set_rect_radii(rect, &r.to_skia_radii());
                                canvas.clip_rrect(rrect, ClipOp::Intersect, true);
                            }
                            canvas.draw_image_rect(
                                image,
                                Some((&src_rect, skia_safe::canvas::SrcRectConstraint::Fast)),
                                rect,
                                &paint,
                            );
                            canvas.restore();
                        }
                        // Missing image: skip layer (non-blocking)
                        continue;
                    }
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

// ─── Replaced element painting (Chromium: ReplacedPainter) ──────────

/// Paint a replaced element (`<img>`).
///
/// If the image is available via `ImageProvider`, it is drawn with
/// `object-fit` semantics. If unavailable, a placeholder is painted.
fn paint_replaced(
    canvas: &Canvas,
    content: &super::style::ReplacedContent,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    border_radius: &super::style::CornerRadii,
    images: &dyn ImageProvider,
) {
    canvas.save();
    canvas.translate((x, y));

    let dest_rect = Rect::from_xywh(0.0, 0.0, w, h);

    // Clip to the element's content box. Replaced elements never paint
    // outside their box (object-fit: none/cover can produce oversized dst
    // rects that must be clipped). Border-radius further refines this.
    if !border_radius.is_zero() {
        let mut rrect = skia_safe::RRect::new();
        rrect.set_rect_radii(dest_rect, &border_radius.to_skia_radii());
        canvas.clip_rrect(rrect, ClipOp::Intersect, true);
    } else {
        canvas.clip_rect(dest_rect, ClipOp::Intersect, true);
    }

    if let Some(image) = images.get(&content.src) {
        let img_w = image.width() as f32;
        let img_h = image.height() as f32;

        let box_fit = content.object_fit.to_box_fit(img_w, img_h, w, h);
        let t = box_fit.calculate_transform((img_w, img_h), (w, h));

        let paint = Paint::default();
        canvas.save();
        canvas.concat(&skia_safe::Matrix::new_all(
            t.matrix[0][0],
            t.matrix[0][1],
            t.matrix[0][2],
            t.matrix[1][0],
            t.matrix[1][1],
            t.matrix[1][2],
            0.0,
            0.0,
            1.0,
        ));
        canvas.draw_image(image, (0.0, 0.0), Some(&paint));
        canvas.restore();
    } else {
        // Placeholder: light gray rect
        let mut paint = Paint::default();
        paint.set_color(Color::from_argb(255, 238, 238, 238));
        paint.set_style(PaintStyle::Fill);
        canvas.draw_rect(dest_rect, &paint);

        // Light border
        let mut border_paint = Paint::default();
        border_paint.set_color(Color::from_argb(255, 204, 204, 204));
        border_paint.set_style(PaintStyle::Stroke);
        border_paint.set_stroke_width(1.0);
        canvas.draw_rect(dest_rect, &border_paint);

        // NOTE: alt text rendering intentionally omitted — placeholder rect
        // is preferred for visual consistency. Alt text could be added here
        // via: if let Some(ref alt) = content.alt { paint_alt_text(...) }
    }

    canvas.restore();
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

/// Paint inset box-shadows (Chromium: BoxPainterBase::PaintInsetBoxShadow).
///
/// Inset shadows render *inside* the element by clipping to the box bounds,
/// then drawing a hollow rect (the box outline expanded outward) with a blur
/// mask so that only the soft inner edge is visible.
fn paint_box_shadow_inset(canvas: &Canvas, style: &StyledElement, w: f32, h: f32) {
    for shadow in &style.box_shadow {
        if !shadow.inset {
            continue;
        }

        let box_rect = Rect::from_xywh(0.0, 0.0, w, h);

        // Clip to the box so shadow cannot bleed outside
        canvas.save();
        let r = &style.border_radius;
        if r.is_zero() {
            canvas.clip_rect(box_rect, ClipOp::Intersect, true);
        } else {
            let mut clip_rrect = skia_safe::RRect::new();
            clip_rrect.set_rect_radii(box_rect, &r.to_skia_radii());
            canvas.clip_rrect(clip_rrect, ClipOp::Intersect, true);
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

        // Draw a large rect with a hole cut out, shifted by offset + spread.
        // The blur on the outer edge of the hole creates the inset shadow.
        let spread = shadow.spread;
        let inner_rect = Rect::from_xywh(
            shadow.offset_x + spread,
            shadow.offset_y + spread,
            w - spread * 2.0,
            h - spread * 2.0,
        );

        // Outer rect large enough that its edges are outside the clip region
        let expansion = shadow.blur * 2.0 + shadow.spread.abs() + 100.0;
        let outer_rect = Rect::from_xywh(
            -expansion + shadow.offset_x,
            -expansion + shadow.offset_y,
            w + expansion * 2.0,
            h + expansion * 2.0,
        );

        // Build a path: outer rect minus inner rect (creates a frame).
        // EvenOdd fill makes the inner rect a hole.
        let mut builder =
            skia_safe::PathBuilder::new_with_fill_type(skia_safe::PathFillType::EvenOdd);
        builder.add_rect(outer_rect, None, None);
        if r.is_zero() {
            builder.add_rect(inner_rect, None, None);
        } else {
            // Shrink corner radii by spread for the inner cutout
            let shrink = spread.max(0.0);
            let inner_radii = [
                skia_safe::Point::new((r.tl_x - shrink).max(0.0), (r.tl_y - shrink).max(0.0)),
                skia_safe::Point::new((r.tr_x - shrink).max(0.0), (r.tr_y - shrink).max(0.0)),
                skia_safe::Point::new((r.br_x - shrink).max(0.0), (r.br_y - shrink).max(0.0)),
                skia_safe::Point::new((r.bl_x - shrink).max(0.0), (r.bl_y - shrink).max(0.0)),
            ];
            let mut inner_rrect = skia_safe::RRect::new();
            inner_rrect.set_rect_radii(inner_rect, &inner_radii);
            builder.add_rrect(inner_rrect, None, None);
        }
        let path = builder.detach();

        canvas.draw_path(&path, &paint);
        canvas.restore();
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

// ─── Widget chrome painting ─────────────────────────────────────────

/// Paint widget background/border — called BEFORE children so text
/// renders on top.
fn paint_widget_background(canvas: &Canvas, style: &StyledElement, w: f32, h: f32) {
    const BORDER_COLOR: Color = Color::from_argb(255, 118, 118, 118);
    const DISABLED_BORDER: Color = Color::from_argb(255, 192, 192, 192);

    let has_bg = !style.background.is_empty();
    let has_border = style.border.top.width > 0.0
        || style.border.right.width > 0.0
        || style.border.bottom.width > 0.0
        || style.border.left.width > 0.0;

    match &style.widget {
        WidgetAppearance::PushButton { disabled } => {
            if !has_bg {
                let mut fill = Paint::default();
                fill.set_style(PaintStyle::Fill);
                fill.set_color(Color::from_argb(255, 239, 239, 239));
                fill.set_anti_alias(true);
                canvas.draw_round_rect(Rect::from_xywh(0.0, 0.0, w, h), 4.0, 4.0, &fill);
            }
            if !has_border {
                let mut stroke = Paint::default();
                stroke.set_style(PaintStyle::Stroke);
                stroke.set_stroke_width(1.0);
                stroke.set_color(if *disabled {
                    DISABLED_BORDER
                } else {
                    Color::from_argb(255, 195, 195, 195)
                });
                stroke.set_anti_alias(true);
                canvas.draw_round_rect(
                    Rect::from_xywh(0.5, 0.5, w - 1.0, h - 1.0),
                    4.0,
                    4.0,
                    &stroke,
                );
            }
        }
        WidgetAppearance::TextField { .. } | WidgetAppearance::TextArea { .. } => {
            if !has_border {
                let disabled = matches!(
                    &style.widget,
                    WidgetAppearance::TextField { disabled: true, .. }
                        | WidgetAppearance::TextArea { disabled: true, .. }
                );
                let mut paint = Paint::default();
                paint.set_style(PaintStyle::Stroke);
                paint.set_stroke_width(1.0);
                paint.set_color(if disabled {
                    DISABLED_BORDER
                } else {
                    BORDER_COLOR
                });
                paint.set_anti_alias(true);
                canvas.draw_round_rect(
                    Rect::from_xywh(0.5, 0.5, w - 1.0, h - 1.0),
                    2.0,
                    2.0,
                    &paint,
                );
            }
        }
        WidgetAppearance::Menulist { disabled, .. } => {
            if !has_border {
                let mut paint = Paint::default();
                paint.set_style(PaintStyle::Stroke);
                paint.set_stroke_width(1.0);
                paint.set_color(if *disabled {
                    DISABLED_BORDER
                } else {
                    BORDER_COLOR
                });
                paint.set_anti_alias(true);
                canvas.draw_round_rect(
                    Rect::from_xywh(0.5, 0.5, w - 1.0, h - 1.0),
                    2.0,
                    2.0,
                    &paint,
                );
            }
        }
        _ => {} // checkbox, radio, slider, color — no background phase needed
    }
}

/// Paint widget overlays — called AFTER children for elements that need
/// chrome drawn on top (checkmarks, carets, sliders, color swatches).
fn paint_widget_chrome(canvas: &Canvas, style: &StyledElement, w: f32, h: f32) {
    const ACCENT: Color = Color::from_argb(255, 26, 115, 232);
    const BORDER_COLOR: Color = Color::from_argb(255, 118, 118, 118);
    const DISABLED_BORDER: Color = Color::from_argb(255, 192, 192, 192);
    const TRACK_COLOR: Color = Color::from_argb(255, 192, 192, 192);
    const CHEVRON_COLOR: Color = Color::from_argb(255, 102, 102, 102);

    match &style.widget {
        WidgetAppearance::Checkbox { checked, disabled } => {
            paint_checkbox(
                canvas,
                w,
                h,
                *checked,
                *disabled,
                ACCENT,
                BORDER_COLOR,
                DISABLED_BORDER,
            );
        }
        WidgetAppearance::Radio { checked, disabled } => {
            paint_radio(
                canvas,
                w,
                h,
                *checked,
                *disabled,
                ACCENT,
                BORDER_COLOR,
                DISABLED_BORDER,
            );
        }
        WidgetAppearance::Menulist { disabled, .. } => {
            paint_select_caret(canvas, w, h, *disabled, CHEVRON_COLOR, DISABLED_BORDER);
        }
        WidgetAppearance::SliderHorizontal {
            min,
            max,
            value,
            disabled,
        } => {
            paint_slider(
                canvas,
                w,
                h,
                *min,
                *max,
                *value,
                *disabled,
                ACCENT,
                TRACK_COLOR,
                DISABLED_BORDER,
            );
        }
        WidgetAppearance::ColorWell { value, disabled } => {
            paint_color_well(
                canvas,
                w,
                h,
                value,
                *disabled,
                BORDER_COLOR,
                DISABLED_BORDER,
            );
        }
        _ => {} // PushButton, TextField, TextArea — handled in paint_widget_background
    }
}

fn paint_checkbox(
    canvas: &Canvas,
    w: f32,
    h: f32,
    checked: bool,
    disabled: bool,
    accent: Color,
    border_color: Color,
    disabled_border: Color,
) {
    let size = w.min(h);
    let x = (w - size) / 2.0;
    let y = (h - size) / 2.0;
    let rect = Rect::from_xywh(x + 0.5, y + 0.5, size - 1.0, size - 1.0);

    if checked {
        let mut fill = Paint::default();
        fill.set_style(PaintStyle::Fill);
        fill.set_color(if disabled { disabled_border } else { accent });
        fill.set_anti_alias(true);
        canvas.draw_round_rect(rect, 2.0, 2.0, &fill);

        // Checkmark path (✓)
        let mut path = skia_safe::PathBuilder::new();
        let cx = x + size / 2.0;
        let cy = y + size / 2.0;
        let s = size * 0.3;
        path.move_to((cx - s * 0.8, cy));
        path.line_to((cx - s * 0.15, cy + s * 0.65));
        path.line_to((cx + s * 0.85, cy - s * 0.55));

        let mut stroke = Paint::default();
        stroke.set_style(PaintStyle::Stroke);
        stroke.set_color(Color::WHITE);
        stroke.set_stroke_width(1.5);
        stroke.set_anti_alias(true);
        stroke.set_stroke_cap(skia_safe::PaintCap::Round);
        stroke.set_stroke_join(skia_safe::PaintJoin::Round);
        canvas.draw_path(&path.detach(), &stroke);
    } else {
        let mut stroke = Paint::default();
        stroke.set_style(PaintStyle::Stroke);
        stroke.set_stroke_width(1.0);
        stroke.set_color(if disabled {
            disabled_border
        } else {
            border_color
        });
        stroke.set_anti_alias(true);
        canvas.draw_round_rect(rect, 2.0, 2.0, &stroke);
    }
}

fn paint_radio(
    canvas: &Canvas,
    w: f32,
    h: f32,
    checked: bool,
    disabled: bool,
    accent: Color,
    border_color: Color,
    disabled_border: Color,
) {
    let size = w.min(h);
    let cx = w / 2.0;
    let cy = h / 2.0;
    let radius = size / 2.0 - 0.5;

    if checked {
        let mut outer = Paint::default();
        outer.set_style(PaintStyle::Fill);
        outer.set_color(if disabled { disabled_border } else { accent });
        outer.set_anti_alias(true);
        canvas.draw_circle((cx, cy), radius, &outer);

        let mut inner = Paint::default();
        inner.set_style(PaintStyle::Fill);
        inner.set_color(Color::WHITE);
        inner.set_anti_alias(true);
        canvas.draw_circle((cx, cy), radius * 0.4, &inner);
    } else {
        let mut stroke = Paint::default();
        stroke.set_style(PaintStyle::Stroke);
        stroke.set_stroke_width(1.0);
        stroke.set_color(if disabled {
            disabled_border
        } else {
            border_color
        });
        stroke.set_anti_alias(true);
        canvas.draw_circle((cx, cy), radius, &stroke);
    }
}

fn paint_select_caret(
    canvas: &Canvas,
    w: f32,
    h: f32,
    disabled: bool,
    chevron_color: Color,
    disabled_color: Color,
) {
    let arrow_w = 8.0;
    let arrow_h = 5.0;
    let right_pad = 8.0;
    let ax = w - right_pad - arrow_w;
    let ay = (h - arrow_h) / 2.0;

    let mut path = skia_safe::PathBuilder::new();
    path.move_to((ax, ay));
    path.line_to((ax + arrow_w / 2.0, ay + arrow_h));
    path.line_to((ax + arrow_w, ay));

    let mut paint = Paint::default();
    paint.set_style(PaintStyle::Stroke);
    paint.set_stroke_width(1.5);
    paint.set_color(if disabled {
        disabled_color
    } else {
        chevron_color
    });
    paint.set_anti_alias(true);
    paint.set_stroke_cap(skia_safe::PaintCap::Round);
    paint.set_stroke_join(skia_safe::PaintJoin::Round);
    canvas.draw_path(&path.detach(), &paint);
}

fn paint_slider(
    canvas: &Canvas,
    w: f32,
    h: f32,
    min: f32,
    max: f32,
    value: f32,
    disabled: bool,
    accent: Color,
    track_color: Color,
    disabled_color: Color,
) {
    let track_h = 4.0;
    let thumb_r = 6.0;
    let track_pad = thumb_r;
    let track_y = (h - track_h) / 2.0;

    // Track background
    let mut track_paint = Paint::default();
    track_paint.set_style(PaintStyle::Fill);
    track_paint.set_color(track_color);
    track_paint.set_anti_alias(true);
    let track_rect = Rect::from_xywh(track_pad, track_y, w - track_pad * 2.0, track_h);
    canvas.draw_round_rect(track_rect, track_h / 2.0, track_h / 2.0, &track_paint);

    // Thumb position
    let range = if (max - min).abs() < f32::EPSILON {
        1.0
    } else {
        max - min
    };
    let ratio = ((value - min) / range).clamp(0.0, 1.0);
    let thumb_x = track_pad + ratio * (w - track_pad * 2.0);
    let thumb_y = h / 2.0;

    // Filled portion
    let mut filled = Paint::default();
    filled.set_style(PaintStyle::Fill);
    filled.set_color(if disabled { disabled_color } else { accent });
    filled.set_anti_alias(true);
    let filled_rect = Rect::from_xywh(track_pad, track_y, thumb_x - track_pad, track_h);
    canvas.draw_round_rect(filled_rect, track_h / 2.0, track_h / 2.0, &filled);

    // Thumb circle
    let mut thumb = Paint::default();
    thumb.set_style(PaintStyle::Fill);
    thumb.set_color(if disabled { disabled_color } else { accent });
    thumb.set_anti_alias(true);
    canvas.draw_circle((thumb_x, thumb_y), thumb_r, &thumb);
}

fn paint_color_well(
    canvas: &Canvas,
    w: f32,
    h: f32,
    value: &CGColor,
    disabled: bool,
    border_color: Color,
    disabled_border: Color,
) {
    let pad = 3.0;
    let swatch = Rect::from_xywh(pad, pad, w - pad * 2.0, h - pad * 2.0);

    let mut fill = Paint::default();
    fill.set_style(PaintStyle::Fill);
    fill.set_color(Color::from_argb(value.a, value.r, value.g, value.b));
    fill.set_anti_alias(true);
    if disabled {
        fill.set_alpha(128);
    }
    canvas.draw_round_rect(swatch, 2.0, 2.0, &fill);

    let mut stroke = Paint::default();
    stroke.set_style(PaintStyle::Stroke);
    stroke.set_stroke_width(1.0);
    stroke.set_color(if disabled {
        disabled_border
    } else {
        border_color
    });
    stroke.set_anti_alias(true);
    canvas.draw_round_rect(swatch, 2.0, 2.0, &stroke);
}
