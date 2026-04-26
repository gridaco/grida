use cg::cg::*;
use cg::shape::*;
use skia_safe::{Color, Paint};

mod dev_kit;

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

    let mut surface = dev_kit::raster_surface(400, 400, Color::WHITE);
    let canvas = surface.canvas();

    let path = build_simple_polygon_path(&shape);

    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLUE);
    canvas.draw_path(&path, &paint);

    dev_kit::save_golden(&mut surface, "polygon");
}
