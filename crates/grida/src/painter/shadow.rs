use super::geometry::PainterShape;
use crate::cg::prelude::*;
use skia_safe::{self as sk, color_filters, image_filters, BlendMode, ColorMatrix, Paint};

/// Build an image filter for a drop shadow.
///
/// Two paths depending on whether `spread` is non-zero:
///
/// - **spread ≠ 0** — `dilate`/`erode` → blur → offset.
///   This chain does NOT colorize; the caller must set `paint.color`
///   to the shadow color so the source pixels carry the tint.
///
/// - **spread = 0** — Skia's built-in `drop_shadow_only` (blur →
///   `SrcIn` colorize → offset). The filter colorizes internally,
///   so the caller must paint the source **opaque white** to avoid
///   double-applying the shadow alpha.
///
/// See [`draw_drop_shadow`] for how the paint color is set per path.
pub fn drop_shadow_image_filter(shadow: &FeShadow) -> sk::ImageFilter {
    let spread = shadow.spread;
    let color: sk::Color = shadow.color.into();

    if spread != 0.0 {
        let mut filter = if spread > 0.0 {
            image_filters::dilate((spread, spread), None, None)
        } else {
            image_filters::erode((-spread, -spread), None, None)
        }
        .unwrap();

        if shadow.blur > 0.0 {
            filter = image_filters::blur((shadow.blur, shadow.blur), None, filter, None).unwrap();
        }

        image_filters::offset((shadow.dx, shadow.dy), filter, None).unwrap()
    } else {
        image_filters::drop_shadow_only(
            (shadow.dx, shadow.dy),
            (shadow.blur, shadow.blur),
            color,
            None,
            None,
            None,
        )
        .unwrap()
    }
}

/// Draw a drop shadow behind the given shape.
///
/// The paint color differs between the two filter paths to ensure the
/// shadow alpha is applied exactly once (see [`drop_shadow_image_filter`]).
pub fn draw_drop_shadow(canvas: &sk::Canvas, shape: &PainterShape, shadow: &FeShadow) {
    let mut paint = Paint::default();
    let filter = drop_shadow_image_filter(shadow);

    // Spread path: filter does not colorize → paint carries the tint.
    // Fast path: `drop_shadow_only` colorizes via SrcIn → paint must be
    // opaque white so source alpha is 1.0 (avoids alpha² artifact).
    paint.set_color(if shadow.spread != 0.0 {
        shadow.color.into()
    } else {
        sk::Color::WHITE
    });
    paint.set_image_filter(filter);
    paint.set_anti_alias(true);
    shape.draw_on_canvas(canvas, &paint);
}

pub fn inner_shadow_image_filter(shadow: &FeShadow) -> sk::ImageFilter {
    let CGColor { r, g, b, a } = shadow.color;
    let spread = shadow.spread;

    // Construct color matrix selecting and colorizing the inverse alpha
    #[rustfmt::skip]
    let mut cm = ColorMatrix::new(
        0.0, 0.0, 0.0, 0.0, r as f32 / 255.0, //
        0.0, 0.0, 0.0, 0.0, g as f32 / 255.0, //
        0.0, 0.0, 0.0, 0.0, b as f32 / 255.0, //
        0.0, 0.0, 0.0, a as f32 / 255.0, 0.0, //
    );

    #[rustfmt::skip]
    let invert = ColorMatrix::new(
        1.0, 0.0, 0.0, 0.0, 0.0, //
        0.0, 1.0, 0.0, 0.0, 0.0, //
        0.0, 0.0, 1.0, 0.0, 0.0, //
        0.0, 0.0, 0.0, -1.0, 1.0,
    );

    cm.pre_concat(&invert);

    let mut filter =
        image_filters::color_filter(color_filters::matrix(&cm, None), None, None).unwrap();
    if spread > 0.0 {
        filter = image_filters::dilate((spread, spread), filter, None).unwrap();
    } else if spread < 0.0 {
        filter = image_filters::erode((-spread, -spread), filter, None).unwrap();
    }
    let blurred = image_filters::blur((shadow.blur, shadow.blur), None, filter, None).unwrap();
    let offset = image_filters::offset((shadow.dx, shadow.dy), blurred, None).unwrap();
    let masked = image_filters::blend(BlendMode::DstIn, offset, None, None).unwrap();

    image_filters::merge([Some(masked)], None).unwrap()
}

/// Draw an inner shadow clipped to the given shape.
pub fn draw_inner_shadow(canvas: &sk::Canvas, shape: &PainterShape, shadow: &FeShadow) {
    let inner_shadow = inner_shadow_image_filter(shadow);

    let mut shadow_paint = Paint::default();
    shadow_paint.set_image_filter(inner_shadow);
    shadow_paint.set_anti_alias(true);

    canvas.save();
    shape.clip_on_canvas(canvas);
    shape.draw_on_canvas(canvas, &shadow_paint);
    canvas.restore();
}
