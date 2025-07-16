use super::geometry::PainterShape;
use crate::cg::types::FeShadow;
use skia_safe::{self as sk, color_filters, image_filters, BlendMode, ColorMatrix, Paint};

/// Draw a drop shadow behind the given shape on the provided canvas.
pub fn draw_drop_shadow(canvas: &sk::Canvas, shape: &PainterShape, shadow: &FeShadow) {
    let sk::Color4f { r, g, b, a } = {
        let crate::cg::types::Color(r, g, b, a) = shadow.color;
        sk::Color4f::new(
            r as f32 / 255.0,
            g as f32 / 255.0,
            b as f32 / 255.0,
            a as f32 / 255.0,
        )
    };
    let color = sk::Color::from_argb(
        (a * 255.0) as u8,
        (r * 255.0) as u8,
        (g * 255.0) as u8,
        (b * 255.0) as u8,
    );
    let path = shape.to_path();
    let spread = shadow.spread;

    if spread != 0.0 {
        let mut paint = Paint::default();
        paint.set_color(color);
        paint.set_anti_alias(true);

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
        paint.set_image_filter(filter);

        canvas.draw_path(&path, &paint);
    } else {
        // fast path using Skia's drop_shadow filter when no spread is applied
        let image_filter = image_filters::drop_shadow(
            (shadow.dx, shadow.dy),
            (shadow.blur, shadow.blur),
            color,
            None,
            None,
            None,
        );

        let mut shadow_paint = Paint::default();
        shadow_paint.set_color(color);
        shadow_paint.set_image_filter(image_filter);
        shadow_paint.set_anti_alias(true);

        canvas.draw_path(&path, &shadow_paint);
    }
}

/// Draw an inner shadow clipped to the given shape.
pub fn draw_inner_shadow(canvas: &sk::Canvas, shape: &PainterShape, shadow: &FeShadow) {
    let crate::cg::types::Color(r, g, b, a) = shadow.color;
    let spread = shadow.spread;

    let path = shape.to_path();

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

    let mut shadow_paint = Paint::default();
    shadow_paint.set_image_filter(inner_shadow);
    shadow_paint.set_anti_alias(true);

    canvas.save();
    canvas.clip_path(&path, None, true);
    canvas.draw_path(&path, &shadow_paint);
    canvas.restore();
}
