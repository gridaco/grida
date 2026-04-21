//! Phase 3: `LayoutBox` tree → Skia Picture.
//!
//! Paint order follows Chromium's phases (simplified):
//! 1. **Background** — box-shadow (outer), background-color, border, box-shadow (inset)
//! 2. **Children** — recurse into child boxes and inline content
//! 3. **Widget chrome** — form control appearance (checkmarks, carets, etc.)
//! 4. **Outline** — CSS outline, painted on top of all content
//!
//! Opacity, clipping, and visibility are handled via canvas save/restore.

use crate::cg::prelude::*;
use crate::runtime::font_repository::FontRepository;

use skia_safe::textlayout::{self, FontCollection, ParagraphBuilder, ParagraphStyle};
use skia_safe::{Canvas, ClipOp, Color, Paint, PaintStyle, PictureRecorder, Rect};

use super::layout::{build_skia_text_style, LayoutBox, LayoutNode};
use super::style::{
    BackgroundBox, BackgroundImage, BackgroundLayer, BackgroundRepeatKeyword, BackgroundSize,
    BorderSide, ConicGradient, FilterFunction, GradientStop, InlineBoxDecoration, InlineGroup,
    InlineRunItem, LinearGradient, Outline, RadialGradient, StyleImage, StyledElement, TextRun,
    WidgetAppearance,
};
use super::types;
use super::types::CssLength;
use super::ImageProvider;

/// Paint a `LayoutBox` tree into a Skia `Picture`.
pub(crate) fn paint_to_picture(
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

    // ── Save state for opacity / filter / clip ──
    let needs_layer = style.opacity < 1.0 || !style.filter.is_empty();
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
        let has_filter = !style.filter.is_empty();
        if has_filter {
            if let Some(filter) = build_filter_chain(&style.filter) {
                layer_paint.set_image_filter(filter);
            }
        }
        // Skia clips a layer's output to its `bounds` hint, including any
        // filter outset. Blur / drop-shadow extend the visible region past
        // the source box, so when a filter is active we omit `bounds` and
        // let Skia size the layer from the filter's own fast-bounds.
        let bounds = Rect::from_xywh(0.0, 0.0, w, h);
        let layer_rec = if has_filter {
            skia_safe::canvas::SaveLayerRec::default().paint(&layer_paint)
        } else {
            skia_safe::canvas::SaveLayerRec::default()
                .paint(&layer_paint)
                .bounds(&bounds)
        };
        canvas.save_layer(&layer_rec);
    }

    // CSS `clip-path` — applied inside the opacity/filter layer but
    // outside the overflow clip, so it affects backgrounds/borders and
    // is itself clipped by overflow when present.
    let has_clip_path = !matches!(style.clip_path, super::style::ClipPath::None);
    if has_clip_path {
        canvas.save();
        apply_clip_path(canvas, &style.clip_path, w, h);
    }

    // Overflow clip gets its own save/restore so that outline (which paints
    // outside the box) is not clipped. Outline still participates in the
    // opacity layer above.
    if needs_clip {
        // `overflow-clip-margin` expands the clip rect outward per axis,
        // but only on axes that use `overflow: clip`. `hidden`/`scroll`/
        // `auto` ignore the margin per spec, so e.g.
        // `overflow-x: clip; overflow-y: hidden` only expands horizontally.
        let base_margin = style.overflow_clip_margin.max(0.0);
        let margin_x = if style.overflow_x == types::Overflow::Clip {
            base_margin
        } else {
            0.0
        };
        let margin_y = if style.overflow_y == types::Overflow::Clip {
            base_margin
        } else {
            0.0
        };
        canvas.save();
        canvas.clip_rect(
            Rect::from_xywh(-margin_x, -margin_y, w + margin_x * 2.0, h + margin_y * 2.0),
            ClipOp::Intersect,
            true,
        );
    }

    // ── Phase 1: Background (Chromium: kBlockBackground) ──
    // Order: widget bg → outer box-shadow → background-color → border → inset box-shadow
    // Widget background painted first so CSS background/border can override.
    paint_widget_background(canvas, style, w, h);
    paint_box_shadow_outer(canvas, style, w, h);
    paint_background(canvas, style, w, h, images);
    paint_borders(canvas, style, w, h, images);
    paint_box_shadow_inset(canvas, style, w, h);

    // ── Phase 1.5: Replaced content (<img>) ──
    // Paint into the content box (inset by border + padding).
    if let Some(ref replaced) = style.replaced {
        let bt = style.border.top.width;
        let br = style.border.right.width;
        let bb = style.border.bottom.width;
        let bl = style.border.left.width;
        let pt = style.padding.top;
        let pr = style.padding.right;
        let pb = style.padding.bottom;
        let pl = style.padding.left;
        let cx = bl + pl;
        let cy = bt + pt;
        let cw = (w - bl - br - pl - pr).max(0.0);
        let ch = (h - bt - bb - pt - pb).max(0.0);
        paint_replaced(
            canvas,
            replaced,
            cx,
            cy,
            cw,
            ch,
            &style.border_radius,
            style.font.image_rendering,
            images,
        );
    }

    // ── Phase 2: Children — z-index aware (simplified stacking) ──
    //
    // Per CSS 2.1 §9.9.1, positioned children with an explicit `z-index`
    // paint in three passes around the default flow: negative → flow →
    // non-negative. We don't model full stacking contexts (opacity,
    // transform, etc.) yet — only the sibling-z-index ordering case.
    //
    // A child participates in z-ordered painting when it's a Box with
    // `position != static` AND `z_index.is_some()`. All other nodes
    // (text runs, inline groups, static boxes) paint in source order in
    // the middle pass.
    fn z_key(child: &LayoutNode) -> Option<i32> {
        match child {
            LayoutNode::Box(b) => {
                if b.style.position == types::Position::Static {
                    None
                } else {
                    b.style.z_index
                }
            }
            _ => None,
        }
    }
    fn paint_child(
        canvas: &Canvas,
        child: &LayoutNode,
        fonts: &FontCollection,
        images: &dyn ImageProvider,
    ) {
        match child {
            LayoutNode::Box(child_box) => paint_box(canvas, child_box, fonts, images),
            LayoutNode::Text { run, x, y, width } => paint_text(canvas, run, *x, *y, *width, fonts),
            LayoutNode::InlineGroup { group, x, y, width } => {
                paint_inline_group(canvas, group, *x, *y, *width, fonts)
            }
        }
    }

    let any_explicit_z = layout.children.iter().any(|c| z_key(c).is_some());
    if !any_explicit_z {
        for child in &layout.children {
            paint_child(canvas, child, fonts, images);
        }
    } else {
        // Stable-partition into three buckets preserving source order.
        let mut back: Vec<(i32, usize)> = Vec::new();
        let mut middle: Vec<usize> = Vec::new();
        let mut front: Vec<(i32, usize)> = Vec::new();
        for (i, child) in layout.children.iter().enumerate() {
            match z_key(child) {
                Some(z) if z < 0 => back.push((z, i)),
                Some(z) => front.push((z, i)),
                None => middle.push(i),
            }
        }
        // Stable sort by z; source order preserved for equal z.
        back.sort_by_key(|(z, _)| *z);
        front.sort_by_key(|(z, _)| *z);
        for (_, i) in &back {
            paint_child(canvas, &layout.children[*i], fonts, images);
        }
        for i in &middle {
            paint_child(canvas, &layout.children[*i], fonts, images);
        }
        for (_, i) in &front {
            paint_child(canvas, &layout.children[*i], fonts, images);
        }
    }

    // ── Phase 3: Widget chrome (form control appearance) ──
    paint_widget_chrome(canvas, style, w, h);

    if needs_clip {
        canvas.restore(); // pop overflow clip
    }
    if has_clip_path {
        canvas.restore(); // pop clip-path
    }

    // ── Phase 4: Outline (Chromium: PaintPhase::kSelfOutlineOnly) ──
    // Painted outside the overflow clip but inside the opacity layer.
    paint_outline(canvas, style, w, h);

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

// ─── StyleImage resolution (Chromium: StyleImage::GetImage) ─────────

/// Resolve a `StyleImage` to a concrete Skia `Image`.
///
/// This is the single entry point for converting any CSS image value
/// (url or gradient) to a paintable image. Mirrors Chromium's polymorphic
/// `StyleImage::GetImage()` — the caller never branches on image type.
///
/// - **Url**: looked up from `ImageProvider`. Returns `None` if unavailable.
/// - **Gradient**: rasterized to a Skia surface at `(w, h)` and snapshotted.
///   This matches Chromium's `GradientGeneratedImage::Create(shader, size)`.
fn resolve_style_image(
    style_image: &StyleImage,
    w: f32,
    h: f32,
    images: &dyn ImageProvider,
) -> Option<skia_safe::Image> {
    match style_image {
        StyleImage::Url(url) => images.get(url).cloned(),
        StyleImage::LinearGradient(grad) => {
            rasterize_gradient(w, h, |w, h| build_linear_gradient_shader(grad, w, h))
        }
        StyleImage::RadialGradient(grad) => {
            rasterize_gradient(w, h, |w, h| build_radial_gradient_shader(grad, w, h))
        }
        StyleImage::ConicGradient(grad) => {
            rasterize_gradient(w, h, |w, h| build_conic_gradient_shader(grad, w, h))
        }
    }
}

/// Rasterize a gradient shader to a Skia `Image` at the given size.
fn rasterize_gradient(
    w: f32,
    h: f32,
    build_shader: impl FnOnce(f32, f32) -> Option<skia_safe::Shader>,
) -> Option<skia_safe::Image> {
    let shader = build_shader(w, h)?;
    let iw = (w.ceil() as i32).max(1);
    let ih = (h.ceil() as i32).max(1);
    let info = skia_safe::ImageInfo::new_n32_premul((iw, ih), None);
    let mut surface = skia_safe::surfaces::raster(&info, None, None)?;
    let canvas = surface.canvas();
    let mut paint = Paint::default();
    paint.set_shader(shader);
    canvas.draw_rect(Rect::from_wh(w, h), &paint);
    surface.image_snapshot().into()
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
        match layer {
            BackgroundLayer::Solid(c) => {
                if c.a == 0 {
                    continue;
                }
                let mut paint = Paint::default();
                paint.set_style(PaintStyle::Fill);
                paint.set_anti_alias(true);
                paint.set_color(Color::from_argb(c.a, c.r, c.g, c.b));
                if r.is_zero() {
                    canvas.draw_rect(rect, &paint);
                } else {
                    let mut rrect = skia_safe::RRect::new();
                    rrect.set_rect_radii(rect, &r.to_skia_radii());
                    canvas.draw_rrect(rrect, &paint);
                }
            }
            BackgroundLayer::Image(img) => {
                paint_background_image_layer(canvas, style, w, h, img, images);
            }
        }
    }
}

/// Rect of a CSS box reference (`border-box`, `padding-box`, `content-box`)
/// within an element's local coordinates (border-box origin).
fn box_reference_rect(style: &StyledElement, w: f32, h: f32, which: BackgroundBox) -> Rect {
    let b = &style.border;
    let p = &style.padding;
    match which {
        BackgroundBox::BorderBox => Rect::from_xywh(0.0, 0.0, w, h),
        BackgroundBox::PaddingBox => Rect::from_xywh(
            b.left.width,
            b.top.width,
            (w - b.left.width - b.right.width).max(0.0),
            (h - b.top.width - b.bottom.width).max(0.0),
        ),
        BackgroundBox::ContentBox => Rect::from_xywh(
            b.left.width + p.left,
            b.top.width + p.top,
            (w - b.left.width - b.right.width - p.left - p.right).max(0.0),
            (h - b.top.width - b.bottom.width - p.top - p.bottom).max(0.0),
        ),
    }
}

/// Resolve a `CssLength` as an axis-independent length value with a container
/// basis for percentages. Used for `background-size` axis values where `%`
/// is relative to the positioning area and `auto` carries intrinsic semantics.
fn resolve_bg_length(v: CssLength, basis: f32) -> Option<f32> {
    match v {
        CssLength::Auto => None,
        CssLength::Px(px) => Some(px),
        CssLength::Percent(p) => Some(basis * p),
    }
}

/// Resolve `background-size` to concrete `(tile_w, tile_h)` given the
/// positioning area size and the image's intrinsic size (if any).
fn resolve_bg_size(
    size: BackgroundSize,
    area_w: f32,
    area_h: f32,
    intrinsic: Option<(f32, f32)>,
) -> (f32, f32) {
    match size {
        BackgroundSize::Cover => {
            let (iw, ih) = intrinsic.unwrap_or((area_w.max(1.0), area_h.max(1.0)));
            let s = (area_w / iw).max(area_h / ih);
            (iw * s, ih * s)
        }
        BackgroundSize::Contain => {
            let (iw, ih) = intrinsic.unwrap_or((area_w.max(1.0), area_h.max(1.0)));
            let s = (area_w / iw).min(area_h / ih);
            (iw * s, ih * s)
        }
        BackgroundSize::Auto => intrinsic.unwrap_or((area_w, area_h)),
        BackgroundSize::Explicit { width, height } => {
            let w_resolved = resolve_bg_length(width, area_w);
            let h_resolved = resolve_bg_length(height, area_h);
            match (w_resolved, h_resolved) {
                (Some(w), Some(h)) => (w, h),
                (Some(w), None) => match intrinsic {
                    Some((iw, ih)) if iw > 0.0 => (w, ih * (w / iw)),
                    _ => (w, area_h),
                },
                (None, Some(h)) => match intrinsic {
                    Some((iw, ih)) if ih > 0.0 => (iw * (h / ih), h),
                    _ => (area_w, h),
                },
                (None, None) => intrinsic.unwrap_or((area_w, area_h)),
            }
        }
    }
}

/// Resolve a `background-position` axis value.
/// - `Px(p)` → `p` (raw offset from origin)
/// - `Percent(p)` → `(area - tile) * p` (CSS rule: 0% = flush-left, 100% = flush-right)
/// - `Auto` → 0
fn resolve_bg_position_axis(v: CssLength, area: f32, tile: f32) -> f32 {
    match v {
        CssLength::Px(p) => p,
        CssLength::Percent(p) => (area - tile) * p,
        CssLength::Auto => 0.0,
    }
}

fn repeat_keyword_to_tile_mode(k: BackgroundRepeatKeyword) -> skia_safe::TileMode {
    match k {
        BackgroundRepeatKeyword::NoRepeat => skia_safe::TileMode::Decal,
        // Space / Round fall back to plain repeat (P1 follow-up).
        _ => skia_safe::TileMode::Repeat,
    }
}

fn paint_background_image_layer(
    canvas: &Canvas,
    style: &StyledElement,
    w: f32,
    h: f32,
    img: &BackgroundImage,
    images: &dyn ImageProvider,
) {
    let origin_rect = box_reference_rect(style, w, h, img.origin);
    let clip_rect = box_reference_rect(style, w, h, img.clip);
    if origin_rect.width() <= 0.0 || origin_rect.height() <= 0.0 {
        return;
    }
    if clip_rect.width() <= 0.0 || clip_rect.height() <= 0.0 {
        return;
    }

    // Intrinsic size: URL images carry pixel dimensions; gradients don't.
    let intrinsic = match &img.source {
        StyleImage::Url(url) => images
            .get(url)
            .map(|im| (im.width() as f32, im.height() as f32)),
        _ => None,
    };

    let (tile_w, tile_h) = resolve_bg_size(
        img.size,
        origin_rect.width(),
        origin_rect.height(),
        intrinsic,
    );
    if tile_w <= 0.0 || tile_h <= 0.0 {
        return;
    }

    // Resolve the source image. For gradients, rasterize at tile size so the
    // resulting image maps 1:1 onto a single tile via the shader's local matrix.
    let src_image = match &img.source {
        StyleImage::Url(url) => images.get(url).cloned(),
        _ => resolve_style_image(&img.source, tile_w, tile_h, images),
    };
    let Some(src_image) = src_image else {
        return;
    };

    let px =
        resolve_bg_position_axis(img.position.x, origin_rect.width(), tile_w) + origin_rect.left;
    let py =
        resolve_bg_position_axis(img.position.y, origin_rect.height(), tile_h) + origin_rect.top;

    let sx = tile_w / src_image.width() as f32;
    let sy = tile_h / src_image.height() as f32;
    let mut local = skia_safe::Matrix::scale((sx, sy));
    local.post_translate((px, py));

    let tmx = repeat_keyword_to_tile_mode(img.repeat.x);
    let tmy = repeat_keyword_to_tile_mode(img.repeat.y);

    let shader = src_image.to_shader(
        Some((tmx, tmy)),
        sampling_for(style.font.image_rendering),
        Some(&local),
    );
    let Some(shader) = shader else {
        return;
    };

    let mut paint = Paint::default();
    paint.set_style(PaintStyle::Fill);
    paint.set_anti_alias(true);
    paint.set_shader(shader);

    canvas.save();
    // Clip to the referenced box with radii shrunk to match the box's
    // inner edge. border-box uses the declared `border-radius` as-is;
    // padding-box and content-box shrink each corner radius by the
    // distance from the border-box corner to the inset-box corner
    // (CSS Backgrounds §5: "the edges of the background layer are
    // rounded to match the inner edge").
    if !style.border_radius.is_zero() {
        let border_rect = Rect::from_xywh(0.0, 0.0, w, h);
        let radii = inset_radii(&style.border_radius, border_rect, clip_rect);
        let mut rrect = skia_safe::RRect::new();
        rrect.set_rect_radii(clip_rect, &radii);
        canvas.clip_rrect(rrect, ClipOp::Intersect, true);
    } else {
        canvas.clip_rect(clip_rect, ClipOp::Intersect, true);
    }
    canvas.draw_rect(clip_rect, &paint);
    canvas.restore();
}

/// Shrink a `border-radius` inward to match an inset clip rect.
/// Each corner radius is reduced by the distance from the outer rect's
/// corner to the inner rect's corner, clamped to zero.
fn inset_radii(r: &super::style::CornerRadii, outer: Rect, inner: Rect) -> [skia_safe::Point; 4] {
    let left_inset = (inner.left - outer.left).max(0.0);
    let right_inset = (outer.right - inner.right).max(0.0);
    let top_inset = (inner.top - outer.top).max(0.0);
    let bottom_inset = (outer.bottom - inner.bottom).max(0.0);
    // Per CSS Backgrounds §5: the inner curve shrinks each axis of a
    // corner radius by the inset on that axis — horizontal insets shrink
    // the x component, vertical insets shrink the y component. Using the
    // max of both would over-shrink one axis under asymmetric
    // border/padding and produce too-square inset clips.
    let shrink = |base: f32, inset: f32| (base - inset).max(0.0);
    [
        skia_safe::Point::new(shrink(r.tl_x, left_inset), shrink(r.tl_y, top_inset)),
        skia_safe::Point::new(shrink(r.tr_x, right_inset), shrink(r.tr_y, top_inset)),
        skia_safe::Point::new(shrink(r.br_x, right_inset), shrink(r.br_y, bottom_inset)),
        skia_safe::Point::new(shrink(r.bl_x, left_inset), shrink(r.bl_y, bottom_inset)),
    ]
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
    image_rendering: types::ImageRendering,
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

        // Override the box-fit's default (center) translation with
        // `object-position`. Fitted size is derived from the scale
        // components of the box-fit transform.
        let sx = t.matrix[0][0];
        let sy = t.matrix[1][1];
        let fitted_w = img_w * sx.abs();
        let fitted_h = img_h * sy.abs();
        let tx = resolve_bg_position_axis(content.object_position.x, w, fitted_w);
        let ty = resolve_bg_position_axis(content.object_position.y, h, fitted_h);

        let paint = Paint::default();
        canvas.save();
        canvas.concat(&skia_safe::Matrix::new_all(
            sx,
            t.matrix[0][1],
            tx,
            t.matrix[1][0],
            sy,
            ty,
            0.0,
            0.0,
            1.0,
        ));
        canvas.draw_image_with_sampling_options(
            image,
            (0.0, 0.0),
            sampling_for(image_rendering),
            Some(&paint),
        );
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

/// Map CSS `image-rendering` to Skia `SamplingOptions`.
/// - `Auto` → bilinear filtering (the documented default; Skia's
///   `SamplingOptions::default()` is actually `Nearest`, so we spell
///   `FilterMode::Linear` explicitly).
/// - `CrispEdges` / `Pixelated` → nearest-neighbor, preserving hard pixel
///   edges typical of pixel art / retro graphics.
fn sampling_for(rendering: types::ImageRendering) -> skia_safe::SamplingOptions {
    let mode = match rendering {
        types::ImageRendering::Auto => skia_safe::FilterMode::Linear,
        types::ImageRendering::CrispEdges | types::ImageRendering::Pixelated => {
            skia_safe::FilterMode::Nearest
        }
    };
    skia_safe::SamplingOptions::from(mode)
}

// ─── clip-path ───────────────────────────────────────────────────────

/// Apply a CSS `clip-path` against the element's border box `(w, h)`.
/// Caller is responsible for `canvas.save()` / `canvas.restore()`.
fn apply_clip_path(canvas: &Canvas, clip: &super::style::ClipPath, w: f32, h: f32) {
    use super::style::ClipPath;

    let resolve = |len: super::types::CssLength, basis: f32| -> f32 {
        match len {
            super::types::CssLength::Px(px) => px,
            super::types::CssLength::Percent(p) => basis * p,
            super::types::CssLength::Auto => 0.0,
        }
    };

    match clip {
        ClipPath::None => {}
        ClipPath::Inset {
            top,
            right,
            bottom,
            left,
            radius,
        } => {
            let t = resolve(*top, h);
            let r = resolve(*right, w);
            let b = resolve(*bottom, h);
            let l = resolve(*left, w);
            let rect = Rect::from_ltrb(l, t, w - r, h - b);
            if radius.is_zero() {
                canvas.clip_rect(rect, ClipOp::Intersect, true);
            } else {
                // Percent radii resolve against the inset clip rect —
                // x-axis against its width, y-axis against its height.
                let rw = rect.width().max(0.0);
                let rh = rect.height().max(0.0);
                let radii = [
                    skia_safe::Point::new(resolve(radius.tl_x, rw), resolve(radius.tl_y, rh)),
                    skia_safe::Point::new(resolve(radius.tr_x, rw), resolve(radius.tr_y, rh)),
                    skia_safe::Point::new(resolve(radius.br_x, rw), resolve(radius.br_y, rh)),
                    skia_safe::Point::new(resolve(radius.bl_x, rw), resolve(radius.bl_y, rh)),
                ];
                let mut rrect = skia_safe::RRect::new();
                rrect.set_rect_radii(rect, &radii);
                canvas.clip_rrect(rrect, ClipOp::Intersect, true);
            }
        }
        ClipPath::Circle { cx, cy, radius } => {
            let cx_px = resolve(*cx, w);
            let cy_px = resolve(*cy, h);
            let r = resolve_circle_radius(*radius, (cx_px, cy_px), (w, h));
            let mut builder = skia_safe::PathBuilder::new();
            builder.add_circle((cx_px, cy_px), r, None);
            canvas.clip_path(&builder.detach(), ClipOp::Intersect, true);
        }
        ClipPath::Ellipse { cx, cy, rx, ry } => {
            let cx_px = resolve(*cx, w);
            let cy_px = resolve(*cy, h);
            let rx_px = resolve_shape_radius(*rx, (cx_px, cy_px), (w, h), true);
            let ry_px = resolve_shape_radius(*ry, (cx_px, cy_px), (w, h), false);
            let rect = Rect::from_xywh(cx_px - rx_px, cy_px - ry_px, rx_px * 2.0, ry_px * 2.0);
            let mut builder = skia_safe::PathBuilder::new();
            builder.add_oval(rect, None, None);
            canvas.clip_path(&builder.detach(), ClipOp::Intersect, true);
        }
        ClipPath::Polygon { points, even_odd } => {
            if points.len() < 3 {
                return;
            }
            let fill_type = if *even_odd {
                skia_safe::PathFillType::EvenOdd
            } else {
                skia_safe::PathFillType::Winding
            };
            let mut builder = skia_safe::PathBuilder::new_with_fill_type(fill_type);
            let first = (resolve(points[0].0, w), resolve(points[0].1, h));
            builder.move_to(first);
            for (x, y) in &points[1..] {
                builder.line_to((resolve(*x, w), resolve(*y, h)));
            }
            builder.close();
            canvas.clip_path(&builder.detach(), ClipOp::Intersect, true);
        }
    }
}

/// Resolve a `ShapeRadius` into a pixel length. `is_x` controls whether
/// `closest-side`/`farthest-side` use the horizontal or vertical axis
/// (ellipse uses one radius per axis).
/// Resolve a `circle()` radius per CSS Shapes §3.1: `closest-side` is
/// the minimum of the four distances from the center to the reference
/// box edges; `farthest-side` is the maximum. Percentage radii use the
/// "normalized diagonal" basis `sqrt((w² + h²) / 2)` so `circle(50%)`
/// on a square box matches `min(w, h) * 50% * √2 / √2 = w * 50%`.
fn resolve_circle_radius(
    r: super::style::ShapeRadius,
    center: (f32, f32),
    size: (f32, f32),
) -> f32 {
    use super::style::ShapeRadius;
    let (w, h) = size;
    let (cx, cy) = center;
    let dists = [cx, w - cx, cy, h - cy];
    match r {
        ShapeRadius::Length(len) => match len {
            super::types::CssLength::Px(px) => px,
            super::types::CssLength::Percent(p) => ((w * w + h * h) / 2.0).sqrt() * p,
            super::types::CssLength::Auto => 0.0,
        },
        ShapeRadius::ClosestSide => dists.iter().copied().fold(f32::INFINITY, f32::min).max(0.0),
        ShapeRadius::FarthestSide => dists.iter().copied().fold(0.0f32, f32::max),
    }
}

fn resolve_shape_radius(
    r: super::style::ShapeRadius,
    center: (f32, f32),
    size: (f32, f32),
    is_x: bool,
) -> f32 {
    use super::style::ShapeRadius;
    match r {
        ShapeRadius::Length(len) => match len {
            super::types::CssLength::Px(px) => px,
            super::types::CssLength::Percent(p) => {
                // For circle() the spec resolves against sqrt((w²+h²)/2);
                // for ellipse() rx uses w, ry uses h. We approximate
                // circle's case by passing `is_x=true` with `size.0`.
                let basis = if is_x { size.0 } else { size.1 };
                basis * p
            }
            super::types::CssLength::Auto => 0.0,
        },
        ShapeRadius::ClosestSide => {
            let (w, h) = size;
            let (cx, cy) = center;
            if is_x {
                cx.min(w - cx).max(0.0)
            } else {
                cy.min(h - cy).max(0.0)
            }
        }
        ShapeRadius::FarthestSide => {
            let (w, h) = size;
            let (cx, cy) = center;
            if is_x {
                cx.max(w - cx).max(0.0)
            } else {
                cy.max(h - cy).max(0.0)
            }
        }
    }
}

// ─── Filter chain ────────────────────────────────────────────────────

/// Compose a CSS `filter:` chain into a single Skia `ImageFilter` applied
/// to the element's layer paint. Returns `None` for an empty chain (the
/// caller skips `set_image_filter` entirely).
///
/// Each color filter is wrapped as an `image_filter::color_filter` and
/// composed in list order (first filter = innermost in the Skia chain,
/// applied first to the source pixels).
fn build_filter_chain(filters: &[FilterFunction]) -> Option<skia_safe::ImageFilter> {
    use skia_safe::{color_filters, image_filters};
    let mut chain: Option<skia_safe::ImageFilter> = None;
    for f in filters {
        let next: Option<skia_safe::ImageFilter> = match *f {
            FilterFunction::Blur(px) => {
                // CSS Filter Effects §11.4.4: the `blur()` length argument
                // IS the Gaussian standard deviation, and Skia's
                // `image_filters::blur` also takes a sigma, so the CSS
                // value maps 1:1 without halving.
                let sigma = px.max(0.0);
                if sigma <= 0.0 {
                    None
                } else {
                    image_filters::blur((sigma, sigma), None, chain.clone(), None)
                }
            }
            FilterFunction::Brightness(b) => {
                let cf = color_filters::matrix_row_major(
                    &[
                        b, 0.0, 0.0, 0.0, 0.0, //
                        0.0, b, 0.0, 0.0, 0.0, //
                        0.0, 0.0, b, 0.0, 0.0, //
                        0.0, 0.0, 0.0, 1.0, 0.0,
                    ],
                    None,
                );
                image_filters::color_filter(cf, chain.clone(), None)
            }
            FilterFunction::Contrast(c) => {
                let t = (1.0 - c) * 0.5;
                let cf = color_filters::matrix_row_major(
                    &[
                        c, 0.0, 0.0, 0.0, t, //
                        0.0, c, 0.0, 0.0, t, //
                        0.0, 0.0, c, 0.0, t, //
                        0.0, 0.0, 0.0, 1.0, 0.0,
                    ],
                    None,
                );
                image_filters::color_filter(cf, chain.clone(), None)
            }
            FilterFunction::Grayscale(amount) => {
                // Lerp between identity and luma-weighted grayscale.
                // Luma weights (Rec. 709): R=0.2126 G=0.7152 B=0.0722.
                let a = amount.clamp(0.0, 1.0);
                let lr = 0.2126;
                let lg = 0.7152;
                let lb = 0.0722;
                let cf = color_filters::matrix_row_major(
                    &[
                        1.0 - a + a * lr,
                        a * lg,
                        a * lb,
                        0.0,
                        0.0, //
                        a * lr,
                        1.0 - a + a * lg,
                        a * lb,
                        0.0,
                        0.0, //
                        a * lr,
                        a * lg,
                        1.0 - a + a * lb,
                        0.0,
                        0.0, //
                        0.0,
                        0.0,
                        0.0,
                        1.0,
                        0.0,
                    ],
                    None,
                );
                image_filters::color_filter(cf, chain.clone(), None)
            }
            FilterFunction::HueRotate(rad) => {
                // Standard hue-rotation matrix around the gray axis.
                let c = rad.cos();
                let s = rad.sin();
                let cf = color_filters::matrix_row_major(
                    &[
                        0.213 + c * 0.787 - s * 0.213,
                        0.715 - c * 0.715 - s * 0.715,
                        0.072 - c * 0.072 + s * 0.928,
                        0.0,
                        0.0, //
                        0.213 - c * 0.213 + s * 0.143,
                        0.715 + c * 0.285 + s * 0.140,
                        0.072 - c * 0.072 - s * 0.283,
                        0.0,
                        0.0, //
                        0.213 - c * 0.213 - s * 0.787,
                        0.715 - c * 0.715 + s * 0.715,
                        0.072 + c * 0.928 + s * 0.072,
                        0.0,
                        0.0, //
                        0.0,
                        0.0,
                        0.0,
                        1.0,
                        0.0,
                    ],
                    None,
                );
                image_filters::color_filter(cf, chain.clone(), None)
            }
            FilterFunction::Invert(amount) => {
                // new = v + (1 - 2v) * a = v * (1 - 2a) + a
                let a = amount.clamp(0.0, 1.0);
                let k = 1.0 - 2.0 * a;
                let cf = color_filters::matrix_row_major(
                    &[
                        k, 0.0, 0.0, 0.0, a, //
                        0.0, k, 0.0, 0.0, a, //
                        0.0, 0.0, k, 0.0, a, //
                        0.0, 0.0, 0.0, 1.0, 0.0,
                    ],
                    None,
                );
                image_filters::color_filter(cf, chain.clone(), None)
            }
            FilterFunction::Opacity(o) => {
                let a = o.clamp(0.0, 1.0);
                let cf = color_filters::matrix_row_major(
                    &[
                        1.0, 0.0, 0.0, 0.0, 0.0, //
                        0.0, 1.0, 0.0, 0.0, 0.0, //
                        0.0, 0.0, 1.0, 0.0, 0.0, //
                        0.0, 0.0, 0.0, a, 0.0,
                    ],
                    None,
                );
                image_filters::color_filter(cf, chain.clone(), None)
            }
            FilterFunction::Saturate(s) => {
                let mut cm = skia_safe::ColorMatrix::default();
                cm.set_saturation(s);
                let cf = color_filters::matrix(&cm, None);
                image_filters::color_filter(cf, chain.clone(), None)
            }
            FilterFunction::Sepia(amount) => {
                // Lerp between identity and the classic sepia tone matrix
                // (https://drafts.fxtf.org/filter-effects-1/#sepiaEquivalent).
                let a = amount.clamp(0.0, 1.0);
                let lerp = |ident: f32, sepia: f32| ident + a * (sepia - ident);
                let cf = color_filters::matrix_row_major(
                    &[
                        lerp(1.0, 0.393),
                        lerp(0.0, 0.769),
                        lerp(0.0, 0.189),
                        0.0,
                        0.0,
                        lerp(0.0, 0.349),
                        lerp(1.0, 0.686),
                        lerp(0.0, 0.168),
                        0.0,
                        0.0,
                        lerp(0.0, 0.272),
                        lerp(0.0, 0.534),
                        lerp(1.0, 0.131),
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        0.0,
                        1.0,
                        0.0,
                    ],
                    None,
                );
                image_filters::color_filter(cf, chain.clone(), None)
            }
            FilterFunction::DropShadow {
                offset_x,
                offset_y,
                blur,
                color,
            } => {
                // CSS `drop-shadow()`'s blur length is a Gaussian sigma,
                // matching Skia's `drop_shadow` parameter; no halving.
                let sigma = blur.max(0.0);
                let color4f = skia_safe::Color4f::new(
                    color.r as f32 / 255.0,
                    color.g as f32 / 255.0,
                    color.b as f32 / 255.0,
                    color.a as f32 / 255.0,
                );
                image_filters::drop_shadow(
                    (offset_x, offset_y),
                    (sigma, sigma),
                    color4f,
                    None,
                    chain.clone(),
                    None,
                )
            }
        };
        // `blur(0)` returns None as a no-op identity, and Skia's factory
        // functions can fail unexpectedly. In both cases preserve the
        // chain we accumulated so far rather than silently discarding
        // prior filters.
        if let Some(n) = next {
            chain = Some(n);
        }
    }
    chain
}

// ─── Gradient shaders ────────────────────────────────────────────────

use skia_safe::gradient_shader::{Gradient, GradientColors, Interpolation};
use skia_safe::{Point, TileMode};

use super::style::{GradientPosition, RadialShape, RadialSize};

fn build_gradient_data(stops: &[GradientStop]) -> (Vec<skia_safe::Color4f>, Vec<f32>) {
    build_gradient_data_with_line_length(stops, f32::INFINITY)
}

/// Convert stops to Skia color and position vectors, normalizing any px
/// positions against the gradient-line length `L`. If all stops are
/// fraction-based `L` may be any value (it's only consulted for px stops).
///
/// After normalization this also clamps each position to be >= its
/// predecessor, matching CSS's "stops must be non-decreasing" rule. Skia
/// asserts strictly increasing positions in debug builds; we clamp to
/// equal to preserve author intent (shared stops create hard color
/// transitions).
fn build_gradient_data_with_line_length(
    stops: &[GradientStop],
    line_length: f32,
) -> (Vec<skia_safe::Color4f>, Vec<f32>) {
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

    let inv_l = if line_length > 1e-6 {
        1.0 / line_length
    } else {
        0.0
    };
    let mut positions: Vec<f32> = stops
        .iter()
        .map(|s| {
            if s.offset_is_px {
                s.offset * inv_l
            } else {
                s.offset
            }
        })
        .collect();

    // CSS: each stop position is clamped to at least the previous stop.
    for i in 1..positions.len() {
        if positions[i] < positions[i - 1] {
            positions[i] = positions[i - 1];
        }
    }

    (colors, positions)
}

/// Resolve a `CssLength` against an axis length (width or height) to pixels.
/// `Auto` is not expected for gradient position/size — falls back to `fallback`.
fn resolve_length(len: CssLength, axis: f32, fallback: f32) -> f32 {
    match len {
        CssLength::Px(px) => px,
        CssLength::Percent(pct) => pct * axis,
        CssLength::Auto => fallback,
    }
}

fn resolve_center(pos: &GradientPosition, w: f32, h: f32) -> (f32, f32) {
    (
        resolve_length(pos.x, w, w / 2.0),
        resolve_length(pos.y, h, h / 2.0),
    )
}

/// If `repeating`, rescale stop positions so one cycle spans 0..1 and return
/// `(scaled_positions, cycle)`. For non-repeating, `cycle = 1.0` and positions
/// pass through unchanged. Callers multiply `cycle` into their gradient extent
/// (line length / radius / sweep angle) to shrink a non-repeating gradient
/// down to a single repeating unit.
///
/// The cycle is the last stop offset, floored at `1e-6` to avoid division by
/// zero on degenerate input (e.g. all stops at position 0).
fn repeat_scale(positions: Vec<f32>, repeating: bool) -> (Vec<f32>, f32) {
    if !repeating {
        return (positions, 1.0);
    }
    let cycle = positions.iter().copied().fold(0f32, f32::max).max(1e-6);
    let scaled = positions.iter().map(|p| p / cycle).collect();
    (scaled, cycle)
}

fn make_gradient<'a>(
    colors: &'a [skia_safe::Color4f],
    positions: &'a [f32],
    tile: TileMode,
    interpolation: super::style::GradientInterpolation,
) -> Gradient<'a> {
    Gradient::new(
        GradientColors::new(colors, Some(positions), tile, None),
        to_skia_interpolation(interpolation),
    )
}

fn to_skia_interpolation(v: super::style::GradientInterpolation) -> Interpolation {
    use super::style::{GradientColorSpace as CS, GradientHueMethod as HM};
    use skia_safe::gradient_shader::interpolation::{ColorSpace, HueMethod, InPremul};
    let color_space = match v.color_space {
        CS::Oklab => ColorSpace::OKLab,
        CS::Srgb => ColorSpace::SRGB,
        CS::SrgbLinear => ColorSpace::SRGBLinear,
        CS::Hsl => ColorSpace::HSL,
        CS::Hwb => ColorSpace::HWB,
        CS::Lab => ColorSpace::Lab,
        CS::Lch => ColorSpace::LCH,
        CS::Oklch => ColorSpace::OKLCH,
        CS::DisplayP3 => ColorSpace::DisplayP3,
        CS::Rec2020 => ColorSpace::Rec2020,
        CS::A98Rgb => ColorSpace::A98RGB,
        CS::ProphotoRgb => ColorSpace::ProphotoRGB,
        // XYZ spaces have no Skia equivalent; fall back to destination (sRGB-like).
        CS::XyzD50 | CS::XyzD65 => ColorSpace::Destination,
    };
    let hue_method = match v.hue_method {
        HM::Shorter => HueMethod::Shorter,
        HM::Longer => HueMethod::Longer,
        HM::Increasing => HueMethod::Increasing,
        HM::Decreasing => HueMethod::Decreasing,
    };
    Interpolation {
        in_premul: InPremul::No,
        color_space,
        hue_method,
    }
}

fn tile_mode(repeating: bool) -> TileMode {
    if repeating {
        TileMode::Repeat
    } else {
        TileMode::Clamp
    }
}

/// Resolve radial ending-shape radii to paint-space (rx, ry) in pixels.
///
/// CSS `<radial-extent>` keywords are defined per the spec:
///   * side distances are signed offsets from the center to each box edge.
///   * corner distance is sqrt(hside² + vside²).
///   * For ellipse-corner, the ellipse keeps the aspect ratio of the side
///     pair and passes through the target corner, which means `k = √2`
///     scaling of the side distances.
fn radial_radii(
    shape: RadialShape,
    size: RadialSize,
    cx: f32,
    cy: f32,
    w: f32,
    h: f32,
) -> (f32, f32) {
    if let RadialSize::Explicit { x, y } = size {
        return (
            resolve_length(x, w, w / 2.0).max(1e-6),
            resolve_length(y, h, h / 2.0).max(1e-6),
        );
    }

    let cs_x = cx.min(w - cx).abs();
    let fs_x = cx.max(w - cx).abs();
    let cs_y = cy.min(h - cy).abs();
    let fs_y = cy.max(h - cy).abs();

    let (rx, ry) = match (shape, size) {
        (RadialShape::Circle, RadialSize::ClosestSide) => {
            let r = cs_x.min(cs_y);
            (r, r)
        }
        (RadialShape::Circle, RadialSize::FarthestSide) => {
            let r = fs_x.max(fs_y);
            (r, r)
        }
        (RadialShape::Circle, RadialSize::ClosestCorner) => {
            let r = (cs_x * cs_x + cs_y * cs_y).sqrt();
            (r, r)
        }
        (RadialShape::Circle, RadialSize::FarthestCorner) => {
            let r = (fs_x * fs_x + fs_y * fs_y).sqrt();
            (r, r)
        }
        (RadialShape::Ellipse, RadialSize::ClosestSide) => (cs_x, cs_y),
        (RadialShape::Ellipse, RadialSize::FarthestSide) => (fs_x, fs_y),
        (RadialShape::Ellipse, RadialSize::ClosestCorner) => {
            let k = std::f32::consts::SQRT_2;
            (cs_x * k, cs_y * k)
        }
        (RadialShape::Ellipse, RadialSize::FarthestCorner) => {
            let k = std::f32::consts::SQRT_2;
            (fs_x * k, fs_y * k)
        }
        // Explicit handled above.
        _ => unreachable!(),
    };
    (rx.max(1e-6), ry.max(1e-6))
}

fn build_linear_gradient_shader(
    grad: &LinearGradient,
    w: f32,
    h: f32,
) -> Option<skia_safe::Shader> {
    // CSS: 0deg = to top, 90deg = to right. Convert to start/end points.
    let rad = grad.angle_deg.to_radians();
    let sin = rad.sin();
    let cos = rad.cos();
    let cx = w / 2.0;
    let cy = h / 2.0;
    // Half-length covers the projected extent of the box along the gradient line.
    let half_len = (w * sin.abs() + h * cos.abs()) / 2.0;
    let line_length = 2.0 * half_len;

    let (colors, raw_positions) = build_gradient_data_with_line_length(&grad.stops, line_length);
    if colors.len() < 2 {
        return None;
    }

    let p1 = Point::new(cx - sin * half_len, cy + cos * half_len);
    let p2_full = Point::new(cx + sin * half_len, cy - cos * half_len);

    let (positions, cycle) = repeat_scale(raw_positions, grad.repeating);
    let p2 = Point::new(
        p1.x + cycle * (p2_full.x - p1.x),
        p1.y + cycle * (p2_full.y - p1.y),
    );

    let gradient = make_gradient(
        &colors,
        &positions,
        tile_mode(grad.repeating),
        grad.interpolation,
    );
    skia_safe::shaders::linear_gradient((p1, p2), &gradient, None)
}

fn build_radial_gradient_shader(
    grad: &RadialGradient,
    w: f32,
    h: f32,
) -> Option<skia_safe::Shader> {
    let (cx, cy) = resolve_center(&grad.center, w, h);
    let (rx_full, ry_full) = radial_radii(grad.shape, grad.size, cx, cy, w, h);

    // Use the larger axis as the gradient line length for px stop
    // resolution. For circles rx = ry; for ellipses this is a reasonable
    // convention — CSS defines the ending shape's "gradient line" as
    // radius-like distance from the center.
    let line_length = rx_full.max(ry_full);

    let (colors, raw_positions) = build_gradient_data_with_line_length(&grad.stops, line_length);
    if colors.len() < 2 {
        return None;
    }

    let (positions, cycle) = repeat_scale(raw_positions, grad.repeating);
    let (rx, ry) = (rx_full * cycle, ry_full * cycle);

    // Unit-radius radial at origin; local matrix maps shader → paint space:
    // (shader point p) → (cx + rx·p.x, cy + ry·p.y). Works for circles and
    // ellipses uniformly.
    let mut matrix = skia_safe::Matrix::scale((rx, ry));
    matrix.post_translate((cx, cy));

    let gradient = make_gradient(
        &colors,
        &positions,
        tile_mode(grad.repeating),
        grad.interpolation,
    );
    skia_safe::shaders::radial_gradient((Point::new(0.0, 0.0), 1.0), &gradient, Some(&matrix))
}

fn build_conic_gradient_shader(grad: &ConicGradient, w: f32, h: f32) -> Option<skia_safe::Shader> {
    let (mut colors, raw_positions) = build_gradient_data(&grad.stops);
    if colors.len() < 2 {
        return None;
    }

    let (cx, cy) = resolve_center(&grad.center, w, h);

    let (mut positions, cycle) = repeat_scale(raw_positions, grad.repeating);
    let sweep_deg = 360.0 * cycle;

    // CSS conic: stop 0 sits at `from` angle, measured from 12 o'clock (top),
    // clockwise. Skia sweep_gradient: stop 0 sits at +x (3 o'clock).
    // The mapping from CSS angle φ to Skia's atan2 angle θ is θ = φ − 90°,
    // so start = from − 90° places stop 0 at the right CSS angle.
    let start = grad.from_angle_deg - 90.0;
    let end = start + sweep_deg;

    // We must use `TileMode::Repeat` for the geometry: `atan2` returns
    // angles in (−π, π], so points in the top-left CSS quadrant map to
    // positions < 0 relative to the start angle. Under `Clamp` those
    // collapse to the first stop.
    //
    // But for non-repeating conics with stops that don't span the full
    // [0, 1] range (e.g. `conic-gradient(red 25%, blue 75%)`), raw
    // Repeat would wrap before the first and after the last stop,
    // producing unwanted tiling. Clamp-like semantics are restored by
    // duplicating the endpoints to pad the range to [0, 1].
    if !grad.repeating {
        if let Some(&first_pos) = positions.first() {
            if first_pos > 0.0 {
                let first_color = colors[0];
                positions.insert(0, 0.0);
                colors.insert(0, first_color);
            }
        }
        if let Some(&last_pos) = positions.last() {
            if last_pos < 1.0 {
                let last_color = *colors.last().unwrap();
                positions.push(1.0);
                colors.push(last_color);
            }
        }
    }

    let gradient = make_gradient(&colors, &positions, TileMode::Repeat, grad.interpolation);
    skia_safe::shaders::sweep_gradient(Point::new(cx, cy), (start, end), &gradient, None)
}

// ─── Border image painting (Chromium: NinePieceImagePainter) ────────

/// Paint a CSS `border-image` using the 9-slice algorithm.
///
/// Returns `true` if the image was painted (caller should skip normal borders),
/// `false` if the image is unavailable (caller falls through to normal borders).
///
/// The 9-slice algorithm divides the source image into 9 regions:
/// ```text
/// ┌──────┬──────────┬──────┐
/// │  TL  │    T     │  TR  │  corners: always scaled to fit
/// ├──────┼──────────┼───���──┤
/// │  L   │  center  │  R   │  edges: per border-image-repeat
/// ├──────┼──────────┼──────┤
/// │  BL  │    B     │  BR  │  center: only if `fill` is set
/// └──────┴────���─────┴──────┘
/// ```
fn paint_border_image(
    canvas: &Canvas,
    bi: &super::style::BorderImage,
    style: &StyledElement,
    w: f32,
    h: f32,
    images: &dyn ImageProvider,
) -> bool {
    // Border-image area: border-box expanded by outset
    let area_x = -bi.outset.left;
    let area_y = -bi.outset.top;
    let area_w = w + bi.outset.left + bi.outset.right;
    let area_h = h + bi.outset.top + bi.outset.bottom;

    // Resolve the source image — uniform path for url() and gradient()
    let image = match resolve_style_image(&bi.source, area_w, area_h, images) {
        Some(img) => img,
        None => return false,
    };

    let img_w = image.width() as f32;
    let img_h = image.height() as f32;
    if img_w <= 0.0 || img_h <= 0.0 {
        return false;
    }

    // Rendering widths: border-image-width or fall back to border-width
    let rw = bi.width.unwrap_or(crate::cg::prelude::EdgeInsets {
        top: style.border.top.width,
        right: style.border.right.width,
        bottom: style.border.bottom.width,
        left: style.border.left.width,
    });

    // Slice offsets in source image coordinates (clamp to image dimensions)
    let st = bi.slice.top.min(img_h);
    let sr = bi.slice.right.min(img_w);
    let sb = bi.slice.bottom.min(img_h);
    let sl = bi.slice.left.min(img_w);

    let paint = Paint::default();

    canvas.save();
    canvas.translate((area_x, area_y));

    // ── Draw 4 corners (always scaled to fit) ──
    // Top-left
    if sl > 0.0 && st > 0.0 && rw.left > 0.0 && rw.top > 0.0 {
        let src = Rect::from_xywh(0.0, 0.0, sl, st);
        let dst = Rect::from_xywh(0.0, 0.0, rw.left, rw.top);
        canvas.draw_image_rect(
            &image,
            Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
            dst,
            &paint,
        );
    }
    // Top-right
    if sr > 0.0 && st > 0.0 && rw.right > 0.0 && rw.top > 0.0 {
        let src = Rect::from_xywh(img_w - sr, 0.0, sr, st);
        let dst = Rect::from_xywh(area_w - rw.right, 0.0, rw.right, rw.top);
        canvas.draw_image_rect(
            &image,
            Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
            dst,
            &paint,
        );
    }
    // Bottom-left
    if sl > 0.0 && sb > 0.0 && rw.left > 0.0 && rw.bottom > 0.0 {
        let src = Rect::from_xywh(0.0, img_h - sb, sl, sb);
        let dst = Rect::from_xywh(0.0, area_h - rw.bottom, rw.left, rw.bottom);
        canvas.draw_image_rect(
            &image,
            Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
            dst,
            &paint,
        );
    }
    // Bottom-right
    if sr > 0.0 && sb > 0.0 && rw.right > 0.0 && rw.bottom > 0.0 {
        let src = Rect::from_xywh(img_w - sr, img_h - sb, sr, sb);
        let dst = Rect::from_xywh(area_w - rw.right, area_h - rw.bottom, rw.right, rw.bottom);
        canvas.draw_image_rect(
            &image,
            Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
            dst,
            &paint,
        );
    }

    // Edge source regions
    let edge_src_w = (img_w - sl - sr).max(0.0);
    let edge_src_h = (img_h - st - sb).max(0.0);
    // Edge destination regions
    let edge_dst_w = (area_w - rw.left - rw.right).max(0.0);
    let edge_dst_h = (area_h - rw.top - rw.bottom).max(0.0);

    // ── Draw 4 edges ──
    // Top edge
    if edge_src_w > 0.0 && st > 0.0 && edge_dst_w > 0.0 && rw.top > 0.0 {
        let src = Rect::from_xywh(sl, 0.0, edge_src_w, st);
        let dst = Rect::from_xywh(rw.left, 0.0, edge_dst_w, rw.top);
        paint_edge_region(canvas, &image, src, dst, bi.repeat_x, true, &paint);
    }
    // Bottom edge
    if edge_src_w > 0.0 && sb > 0.0 && edge_dst_w > 0.0 && rw.bottom > 0.0 {
        let src = Rect::from_xywh(sl, img_h - sb, edge_src_w, sb);
        let dst = Rect::from_xywh(rw.left, area_h - rw.bottom, edge_dst_w, rw.bottom);
        paint_edge_region(canvas, &image, src, dst, bi.repeat_x, true, &paint);
    }
    // Left edge
    if edge_src_h > 0.0 && sl > 0.0 && edge_dst_h > 0.0 && rw.left > 0.0 {
        let src = Rect::from_xywh(0.0, st, sl, edge_src_h);
        let dst = Rect::from_xywh(0.0, rw.top, rw.left, edge_dst_h);
        paint_edge_region(canvas, &image, src, dst, bi.repeat_y, false, &paint);
    }
    // Right edge
    if edge_src_h > 0.0 && sr > 0.0 && edge_dst_h > 0.0 && rw.right > 0.0 {
        let src = Rect::from_xywh(img_w - sr, st, sr, edge_src_h);
        let dst = Rect::from_xywh(area_w - rw.right, rw.top, rw.right, edge_dst_h);
        paint_edge_region(canvas, &image, src, dst, bi.repeat_y, false, &paint);
    }

    // ── Draw center (only if fill is set) ──
    if bi.fill && edge_src_w > 0.0 && edge_src_h > 0.0 && edge_dst_w > 0.0 && edge_dst_h > 0.0 {
        let src = Rect::from_xywh(sl, st, edge_src_w, edge_src_h);
        let dst = Rect::from_xywh(rw.left, rw.top, edge_dst_w, edge_dst_h);
        canvas.draw_image_rect(
            &image,
            Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
            dst,
            &paint,
        );
    }

    canvas.restore();
    true
}

/// Paint a single edge region of a border-image with the specified repeat mode.
///
/// `is_horizontal` — true for top/bottom edges (tile along x-axis),
/// false for left/right edges (tile along y-axis).
fn paint_edge_region(
    canvas: &Canvas,
    image: &skia_safe::Image,
    src: Rect,
    dst: Rect,
    repeat: types::BorderImageRepeat,
    is_horizontal: bool,
    paint: &Paint,
) {
    match repeat {
        types::BorderImageRepeat::Stretch => {
            canvas.draw_image_rect(
                image,
                Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
                dst,
                paint,
            );
        }
        types::BorderImageRepeat::Repeat
        | types::BorderImageRepeat::Round
        | types::BorderImageRepeat::Space => {
            // Tile the source slice along the tiling axis.
            // For Round: adjust tile size so tiles fit exactly.
            // For Space: add uniform gaps between tiles.
            let (tile_natural, dst_extent) = if is_horizontal {
                (src.width() * (dst.height() / src.height()), dst.width())
            } else {
                (src.height() * (dst.width() / src.width()), dst.height())
            };

            if tile_natural <= 0.0 || dst_extent <= 0.0 {
                return;
            }

            let (tile_size, gap) = match repeat {
                types::BorderImageRepeat::Round => {
                    let n = (dst_extent / tile_natural).round().max(1.0);
                    (dst_extent / n, 0.0)
                }
                types::BorderImageRepeat::Space => {
                    let n = (dst_extent / tile_natural).floor();
                    if n <= 1.0 {
                        (tile_natural, 0.0)
                    } else {
                        let total_gap = dst_extent - n * tile_natural;
                        (tile_natural, total_gap / (n - 1.0))
                    }
                }
                _ => (tile_natural, 0.0), // Repeat: natural size, no gap
            };

            canvas.save();
            canvas.clip_rect(dst, ClipOp::Intersect, false);

            let mut offset = 0.0;
            while offset < dst_extent {
                let tile_dst = if is_horizontal {
                    Rect::from_xywh(dst.left + offset, dst.top, tile_size, dst.height())
                } else {
                    Rect::from_xywh(dst.left, dst.top + offset, dst.width(), tile_size)
                };
                canvas.draw_image_rect(
                    image,
                    Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
                    tile_dst,
                    paint,
                );
                offset += tile_size + gap;
            }

            canvas.restore();
        }
    }
}

// ─── Border painting (Chromium: BoxBorderPainter::PaintBorder) ──────��

fn paint_borders(
    canvas: &Canvas,
    style: &StyledElement,
    w: f32,
    h: f32,
    images: &dyn ImageProvider,
) {
    // Per CSS spec, border-image replaces normal borders when set.
    if let Some(ref bi) = style.border_image {
        if paint_border_image(canvas, bi, style, w, h, images) {
            return;
        }
        // Image not available — fall through to normal border painting
    }

    let b = &style.border;

    // Fast path: uniform sides with a non-zero border-radius. Stroke a
    // single RRect so the border traces the rounded corners instead of
    // falling back to per-side straight lines.
    let uniform = b.top.width == b.bottom.width
        && b.top.width == b.left.width
        && b.top.width == b.right.width
        && b.top.style == b.bottom.style
        && b.top.style == b.left.style
        && b.top.style == b.right.style
        && b.top.color == b.bottom.color
        && b.top.color == b.left.color
        && b.top.color == b.right.color;
    if uniform
        && b.top.width > 0.0
        && b.top.style != types::BorderStyle::None
        && !style.border_radius.is_zero()
    {
        paint_uniform_rounded_border(canvas, &b.top, &style.border_radius, w, h);
        return;
    }

    for pos in [SidePos::Top, SidePos::Bottom, SidePos::Left, SidePos::Right] {
        let side = match pos {
            SidePos::Top => &b.top,
            SidePos::Bottom => &b.bottom,
            SidePos::Left => &b.left,
            SidePos::Right => &b.right,
        };
        if side.width <= 0.0 || side.style == types::BorderStyle::None {
            continue;
        }
        paint_border_side(canvas, pos, side, w, h);
    }
}

/// Stroke the border as a single RRect so `border-radius` is honored.
/// Only called for borders where all four sides share width/style/color.
/// Handles `double` as two concentric RRects (1/3 width each with gap).
fn paint_uniform_rounded_border(
    canvas: &Canvas,
    side: &BorderSide,
    radius: &super::style::CornerRadii,
    w: f32,
    h: f32,
) {
    let stroke_center = |inset: f32| -> skia_safe::RRect {
        let rect = Rect::from_xywh(
            inset,
            inset,
            (w - 2.0 * inset).max(0.0),
            (h - 2.0 * inset).max(0.0),
        );
        let mut rrect = skia_safe::RRect::new();
        let shrunk = shrink_radii(radius, inset);
        rrect.set_rect_radii(rect, &shrunk);
        rrect
    };
    if side.style == types::BorderStyle::Double {
        let sub_w = side.width / 3.0;
        let paint = stroke_paint(side.color, sub_w, types::BorderStyle::Solid);
        // Outer ring: stroke center near the outside edge.
        let outer_inset = sub_w / 2.0;
        canvas.draw_rrect(stroke_center(outer_inset), &paint);
        // Inner ring: stroke center near the inside edge.
        let inner_inset = side.width - sub_w / 2.0;
        canvas.draw_rrect(stroke_center(inner_inset), &paint);
        return;
    }
    let paint = stroke_paint(side.color, side.width, side.style);
    canvas.draw_rrect(stroke_center(side.width / 2.0), &paint);
}

fn shrink_radii(r: &super::style::CornerRadii, inset: f32) -> [skia_safe::Point; 4] {
    let s = |v: f32| (v - inset).max(0.0);
    [
        skia_safe::Point::new(s(r.tl_x), s(r.tl_y)),
        skia_safe::Point::new(s(r.tr_x), s(r.tr_y)),
        skia_safe::Point::new(s(r.br_x), s(r.br_y)),
        skia_safe::Point::new(s(r.bl_x), s(r.bl_y)),
    ]
}

#[derive(Copy, Clone)]
enum SidePos {
    Top,
    Bottom,
    Left,
    Right,
}

/// Paint a single border side. Handles all CSS `border-style` variants:
/// - `solid` / `dashed` / `dotted`: direct stroke using the side's color.
/// - `double`: two parallel strokes at 1/3 width each, separated by a 1/3 gap.
/// - `groove` / `inset`: top/left darkened, bottom/right lightened.
/// - `ridge` / `outset`: top/left lightened, bottom/right darkened.
fn paint_border_side(canvas: &Canvas, pos: SidePos, side: &BorderSide, w: f32, h: f32) {
    use types::BorderStyle;

    let (p1, p2) = side_endpoints(pos, side.width, w, h);

    if side.style == BorderStyle::Double {
        // Two strokes of width/3 separated by width/3 gap. Offset each
        // perpendicularly by ±(width/3).
        let sub_w = side.width / 3.0;
        let (n_dx, n_dy) = side_inward_normal(pos);
        // Outer stroke (toward the element's outer edge).
        let paint = stroke_paint(side.color, sub_w, BorderStyle::Solid);
        let out_off = -sub_w;
        let outer_p1 = (p1.0 + n_dx * out_off, p1.1 + n_dy * out_off);
        let outer_p2 = (p2.0 + n_dx * out_off, p2.1 + n_dy * out_off);
        canvas.draw_line(outer_p1, outer_p2, &paint);
        // Inner stroke.
        let in_off = sub_w;
        let inner_p1 = (p1.0 + n_dx * in_off, p1.1 + n_dy * in_off);
        let inner_p2 = (p2.0 + n_dx * in_off, p2.1 + n_dy * in_off);
        canvas.draw_line(inner_p1, inner_p2, &paint);
        return;
    }

    let effective_color = shaded_color(side.color, side.style, pos);
    let paint = stroke_paint(effective_color, side.width, side.style);
    canvas.draw_line(p1, p2, &paint);
}

fn side_endpoints(pos: SidePos, width: f32, w: f32, h: f32) -> ((f32, f32), (f32, f32)) {
    let half = width / 2.0;
    match pos {
        SidePos::Top => ((0.0, half), (w, half)),
        SidePos::Bottom => ((0.0, h - half), (w, h - half)),
        SidePos::Left => ((half, 0.0), (half, h)),
        SidePos::Right => ((w - half, 0.0), (w - half, h)),
    }
}

/// Unit vector pointing inward from the side's centerline.
fn side_inward_normal(pos: SidePos) -> (f32, f32) {
    match pos {
        SidePos::Top => (0.0, 1.0),
        SidePos::Bottom => (0.0, -1.0),
        SidePos::Left => (1.0, 0.0),
        SidePos::Right => (-1.0, 0.0),
    }
}

/// Per-side color treatment for 3D-effect border styles.
/// CSS 2.1 leaves the exact shading to the implementation; we use
/// 50%-toward-black for "darker" and 50%-toward-white for "lighter",
/// matching common browser behavior.
fn shaded_color(c: CGColor, style: types::BorderStyle, pos: SidePos) -> CGColor {
    use types::BorderStyle::*;
    let side_is_tl = matches!(pos, SidePos::Top | SidePos::Left);
    let darken = |c: CGColor| CGColor {
        r: c.r / 2,
        g: c.g / 2,
        b: c.b / 2,
        a: c.a,
    };
    let lighten = |c: CGColor| CGColor {
        r: ((c.r as u16 + 255) / 2) as u8,
        g: ((c.g as u16 + 255) / 2) as u8,
        b: ((c.b as u16 + 255) / 2) as u8,
        a: c.a,
    };
    match style {
        Inset | Groove => {
            if side_is_tl {
                darken(c)
            } else {
                lighten(c)
            }
        }
        Outset | Ridge => {
            if side_is_tl {
                lighten(c)
            } else {
                darken(c)
            }
        }
        _ => c,
    }
}

/// Shared stroke paint builder for border sides and outline.
/// Applies dash/dot path effects for dashed/dotted styles.
fn stroke_paint(color: CGColor, width: f32, style: types::BorderStyle) -> Paint {
    let mut paint = Paint::default();
    paint.set_color(Color::from_argb(color.a, color.r, color.g, color.b));
    paint.set_stroke_width(width);
    paint.set_style(PaintStyle::Stroke);
    paint.set_anti_alias(true);

    match style {
        types::BorderStyle::Dashed => {
            let dash_len = width * 3.0;
            if let Some(effect) = skia_safe::PathEffect::dash(&[dash_len, dash_len], 0.0) {
                paint.set_path_effect(effect);
            }
        }
        types::BorderStyle::Dotted => {
            if let Some(effect) = skia_safe::PathEffect::dash(&[width, width], 0.0) {
                paint.set_path_effect(effect);
            }
            paint.set_stroke_cap(skia_safe::paint::Cap::Round);
        }
        _ => {}
    }

    paint
}

// ─── Outline (Chromium: OutlinePainter::PaintOutlineRects) ─────────────────

/// Paint CSS `outline` as a stroked rect/rrect around the element.
///
/// Chromium paints outline during `PaintPhase::kSelfOutlineOnly`, on top
/// of all content. Since Chrome 94, outline follows `border-radius` with
/// corner radii expanded by `outline-offset + outline-width/2`.
///
/// We mirror this: compute an expanded rect offset from the border edge
/// by `outline-offset + outline-width/2` (stroke center), then draw a
/// stroked RRect using the element's border-radius (expanded proportionally).
fn paint_outline(canvas: &Canvas, style: &StyledElement, w: f32, h: f32) {
    let outline = &style.outline;
    if !outline.has_outline() {
        return;
    }

    let r = &style.border_radius;

    if outline.style == types::BorderStyle::Double {
        // Two concentric 1/3-width strokes separated by a 1/3-width gap.
        // Outer stroke center sits at `offset + 5w/6`; inner at `offset + w/6`.
        let sub_w = outline.width / 3.0;
        let outer_expand = outline.offset + outline.width - sub_w / 2.0;
        let inner_expand = outline.offset + sub_w / 2.0;
        let paint = stroke_paint(outline.color, sub_w, types::BorderStyle::Solid);
        draw_outline_ring(canvas, w, h, outer_expand, r, &paint);
        draw_outline_ring(canvas, w, h, inner_expand, r, &paint);
        return;
    }

    let paint = outline_paint(outline);

    // The stroke is centered on the outline path. The path sits at
    // `outline-offset` from the border edge, so the stroke center is
    // at `offset + width/2` from the border edge.
    let half_w = outline.width / 2.0;
    let expand = outline.offset + half_w;

    draw_outline_ring(canvas, w, h, expand, r, &paint);
}

fn draw_outline_ring(
    canvas: &Canvas,
    w: f32,
    h: f32,
    expand: f32,
    r: &super::style::CornerRadii,
    paint: &Paint,
) {
    let rect = Rect::from_xywh(-expand, -expand, w + expand * 2.0, h + expand * 2.0);
    if r.is_zero() {
        canvas.draw_rect(rect, paint);
    } else {
        let radii = expand_radii(r, expand);
        let mut rrect = skia_safe::RRect::new();
        rrect.set_rect_radii(rect, &radii);
        canvas.draw_rrect(rrect, paint);
    }
}

fn outline_paint(outline: &Outline) -> Paint {
    stroke_paint(outline.color, outline.width, outline.style)
}

/// Expand border-radius values outward by `expand` pixels.
/// Chromium: `ComputeCornerRadii` — radii grow when offset is positive,
/// shrink when negative (clamped to 0).
fn expand_radii(r: &super::style::CornerRadii, expand: f32) -> [skia_safe::Point; 4] {
    let e = |v: f32| (v + expand).max(0.0);
    [
        skia_safe::Point::new(e(r.tl_x), e(r.tl_y)),
        skia_safe::Point::new(e(r.tr_x), e(r.tr_y)),
        skia_safe::Point::new(e(r.br_x), e(r.br_y)),
        skia_safe::Point::new(e(r.bl_x), e(r.bl_y)),
    ]
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
            // CSS `box-shadow` blur length is a Gaussian sigma per CSS
            // Backgrounds §7.2; Skia's mask-filter takes sigma directly.
            paint.set_mask_filter(skia_safe::MaskFilter::blur(
                skia_safe::BlurStyle::Normal,
                shadow.blur,
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
            // CSS `box-shadow` blur length is a Gaussian sigma per CSS
            // Backgrounds §7.2; Skia's mask-filter takes sigma directly.
            paint.set_mask_filter(skia_safe::MaskFilter::blur(
                skia_safe::BlurStyle::Normal,
                shadow.blur,
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

    let indent_px = super::layout::resolve_text_indent(run.font.text_indent, width);
    if indent_px > 0.0 {
        builder.add_placeholder(&textlayout::PlaceholderStyle::new(
            indent_px,
            0.01,
            textlayout::PlaceholderAlignment::Baseline,
            textlayout::TextBaseline::Alphabetic,
            0.0,
        ));
    }

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

    // text-indent: leading placeholder that shifts only the first visual
    // line. Must run before any decoration-range tracking so the offsets
    // stay in sync with the rendered paragraph.
    let indent_px = super::layout::resolve_text_indent(group.text_indent, width);

    struct DecoRange {
        range_start: usize,
        range_end: usize,
        deco: InlineBoxDecoration,
    }
    let mut deco_stack: Vec<(usize, InlineBoxDecoration)> = Vec::new();
    let mut deco_ranges: Vec<DecoRange> = Vec::new();
    let mut offset: usize = 0;

    if indent_px > 0.0 {
        builder.add_placeholder(&PlaceholderStyle::new(
            indent_px,
            0.01,
            PlaceholderAlignment::Baseline,
            TextBaseline::Alphabetic,
            0.0,
        ));
        offset += PLACEHOLDER_OFFSET;
    }

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
