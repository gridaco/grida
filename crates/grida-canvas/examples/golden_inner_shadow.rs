use skia_safe::{color_filters, image_filters, ColorMatrix};
use skia_safe::{surfaces, BlendMode, Color, Paint, Rect};

fn main() {
    // Output size
    let size = (200, 200);
    let mut surface = surfaces::raster_n32_premul(size).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    // Draw base rectangle
    let rect = Rect::from_xywh(40.0, 40.0, 120.0, 120.0);
    let mut base_paint = Paint::default();
    base_paint.set_color(Color::from_argb(255, 255, 255, 255));
    base_paint.set_anti_alias(true);
    canvas.draw_rect(rect, &base_paint);

    // Inner shadow parameters
    let dx = 6.0;
    let dy = 6.0;
    let blur = 10.0;
    let shadow_color = Color::from_argb(128, 0, 0, 0);

    // Construct color matrix to select and colorize inverse alpha
    #[rustfmt::skip]
    let mut cm = ColorMatrix::new(
        0.0, 0.0, 0.0, 0.0, shadow_color.r() as f32 / 255.0,
        0.0, 0.0, 0.0, 0.0, shadow_color.g() as f32 / 255.0,
        0.0, 0.0, 0.0, 0.0, shadow_color.b() as f32 / 255.0,
        0.0, 0.0, 0.0, shadow_color.a() as f32 / 255.0, 0.0,
    );

    #[rustfmt::skip]
    let invert = ColorMatrix::new(
        1.0, 0.0, 0.0, 0.0, 0.0, //
        0.0, 1.0, 0.0, 0.0, 0.0, //
        0.0, 0.0, 1.0, 0.0, 0.0, //
        0.0, 0.0, 0.0, -1.0, 1.0,
    );
    cm.pre_concat(&invert);

    // Build image filter chain
    let cf = image_filters::color_filter(color_filters::matrix(&cm, None), None, None).unwrap();
    let blurred = image_filters::blur((blur, blur), None, cf, None).unwrap();
    let offset = image_filters::offset((dx, dy), blurred, None).unwrap();
    let masked = image_filters::blend(BlendMode::DstIn, offset, None, None).unwrap();
    let inner_shadow = image_filters::merge([Some(masked)].into_iter(), None).unwrap();

    // Paint with the image filter clipped to the original rect
    let mut shadow_paint = Paint::default();
    shadow_paint.set_image_filter(inner_shadow);
    canvas.save();
    canvas.clip_rect(rect, None, true);
    canvas.draw_rect(rect, &shadow_paint);
    canvas.restore();

    // Save result
    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write("goldens/inner_shadow.png", data.as_bytes()).unwrap();
}
