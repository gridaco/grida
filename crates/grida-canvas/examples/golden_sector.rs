use cg::shape::*;
use skia_safe::{surfaces, Color, Paint};

fn main() {
    let shape = EllipticalSectorShape {
        width: 400.0,
        height: 400.0,
        start_angle: 45.0,
        angle: 120.0,
    };

    let mut surface =
        surfaces::raster_n32_premul((shape.width as i32, shape.height as i32)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let path = build_sector_path(&shape);

    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLUE);
    canvas.draw_path(&path, &paint);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/sector.png", data.as_bytes()).unwrap();
}
