use cg::path::*;
use skia_safe::{surfaces, Color, Paint};

fn main() {
    let shape = EllipticalRingShape {
        size: skia_safe::Size::new(400.0, 400.0),
        inner_radius: 0.5,
    };

    let mut surface =
        surfaces::raster_n32_premul((shape.size.width as i32, shape.size.height as i32))
            .expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let path = build_ring_path(shape);

    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLUE);
    canvas.draw_path(&path, &paint);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/ring.png", data.as_bytes()).unwrap();
}
