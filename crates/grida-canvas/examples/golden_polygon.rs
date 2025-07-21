use cg::cg::*;
use cg::shape::*;
use skia_safe::{surfaces, Color, Paint};

fn main() {
    // Create a regular pentagon
    let center_x = 200.0;
    let center_y = 200.0;
    let radius = 80.0;
    let points = (0..5)
        .map(|i| {
            let angle = (i as f32 * 2.0 * std::f32::consts::PI / 5.0) - std::f32::consts::PI / 2.0;
            CGPoint::new(
                center_x + radius * angle.cos(),
                center_y + radius * angle.sin(),
            )
        })
        .collect();

    let shape = SimplePolygonShape {
        points,
        corner_radius: 32.0,
    };

    let mut surface = surfaces::raster_n32_premul((400, 400)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let path = build_simple_polygon_path(&shape);

    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLUE);
    canvas.draw_path(&path, &paint);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/polygon.png", data.as_bytes()).unwrap();
}
