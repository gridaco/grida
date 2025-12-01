use cg::cg::prelude::*;
use cg::painter::gradient::*;
use skia_safe::{surfaces, Color, Rect};

fn main() {
    let (width, height) = (400, 400);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let gradient = LinearGradientPaint::from_colors(vec![
        CGColor(255, 0, 0, 255),
        CGColor(0, 255, 0, 255),
        CGColor(0, 0, 255, 255),
    ]);

    let paint = linear_gradient_paint(&gradient, (width as f32, height as f32));

    canvas.draw_rect(
        Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
        &paint,
    );

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/gradient_linear.png"),
        data.as_bytes(),
    )
    .unwrap();
}
