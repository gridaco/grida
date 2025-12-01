use super::geometry::PainterShape;
use crate::cg::prelude::*;
use skia_safe::{self as sk, color_filters, image_filters, BlendMode, ColorMatrix, Paint};

/// Create an image filter for drop shadow effects. (for any paint)
/// works for primitive shapes and also text
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

        let filter = image_filters::offset((shadow.dx, shadow.dy), filter, None).unwrap();
        filter
    } else {
        // fast path using Skia's drop_shadow filter when no spread is applied
        let image_filter = image_filters::drop_shadow_only(
            (shadow.dx, shadow.dy),
            (shadow.blur, shadow.blur),
            color,
            None,
            None,
            None,
        );

        image_filter.unwrap()
    }
}

/// Draw a drop shadow behind the given shape on the provided canvas.
pub fn draw_drop_shadow(canvas: &sk::Canvas, shape: &PainterShape, shadow: &FeShadow) {
    let color: sk::Color = shadow.color.into();
    let path = shape.to_path();

    let mut paint = Paint::default();
    let filter = drop_shadow_image_filter(shadow);
    paint.set_color(color);
    paint.set_image_filter(filter);
    paint.set_anti_alias(true);
    canvas.draw_path(&path, &paint);
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
    let inner_shadow = image_filters::merge([Some(masked)].into_iter(), None).unwrap();

    inner_shadow
}

/// Draw an inner shadow clipped to the given shape.
pub fn draw_inner_shadow(canvas: &sk::Canvas, shape: &PainterShape, shadow: &FeShadow) {
    let inner_shadow = inner_shadow_image_filter(shadow);

    let mut shadow_paint = Paint::default();
    shadow_paint.set_image_filter(inner_shadow);
    shadow_paint.set_anti_alias(true);

    canvas.save();
    let path = shape.to_path();
    canvas.clip_path(&path, None, true);
    canvas.draw_path(&path, &shadow_paint);
    canvas.restore();
}
