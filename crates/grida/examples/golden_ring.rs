use grida::shape::*;
use skia_safe::{Color, Paint};

mod dev_kit;

fn main() {
    let shape = EllipticalRingShape {
        width: 400.0,
        height: 400.0,
        inner_radius_ratio: 0.5,
    };

    let mut surface =
        dev_kit::raster_surface(shape.width as i32, shape.height as i32, Color::WHITE);
    let canvas = surface.canvas();

    let path = build_ring_path(&shape);

    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::BLUE);
    canvas.draw_path(&path, &paint);

    dev_kit::save_golden(&mut surface, "ring");
}
