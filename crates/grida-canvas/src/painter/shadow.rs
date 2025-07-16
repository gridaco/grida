use super::geometry::PainterShape;
use crate::cg::types::FeShadow;
use skia_safe::{
    self as sk, color_filters, image_filters, BlendMode, BlurStyle, ColorMatrix, MaskFilter, Paint,
    Path,
};

fn path_with_spread(path: &Path, spread: f32) -> Path {
    if spread == 0.0 {
        return path.clone();
    }
    let bounds = path.bounds();
    let width = bounds.width();
    let height = bounds.height();
    if width == 0.0 || height == 0.0 {
        return path.clone();
    }
    let cx = bounds.left() + width / 2.0;
    let cy = bounds.top() + height / 2.0;
    let scale_x = (width + 2.0 * spread) / width;
    let scale_y = (height + 2.0 * spread) / height;
    let tx = cx * (1.0 - scale_x);
    let ty = cy * (1.0 - scale_y);
    let matrix = sk::Matrix::from_affine(&[scale_x, 0.0, 0.0, scale_y, tx, ty]);
    let mut p = path.clone();
    p.transform(&matrix);
    p
}

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
    let mut path = shape.to_path();
    let spread = shadow.spread;

    if spread != 0.0 {
        path = path_with_spread(&path, spread);

        // manual shadow rendering for spread > 0
        let mut paint = Paint::default();
        paint.set_color(color);
        paint.set_anti_alias(true);
        if let Some(mask) = MaskFilter::blur(BlurStyle::Normal, shadow.blur, None) {
            paint.set_mask_filter(mask);
        }

        canvas.save();
        canvas.translate((shadow.dx, shadow.dy));
        canvas.draw_path(&path, &paint);
        canvas.restore();
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

    let mut path = shape.to_path();
    if spread != 0.0 {
        path = path_with_spread(&path, -spread);
    }

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

    let cf = image_filters::color_filter(color_filters::matrix(&cm, None), None, None).unwrap();
    let blurred = image_filters::blur((shadow.blur, shadow.blur), None, cf, None).unwrap();
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
