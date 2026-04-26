use grida::shape::*;
use skia_safe::{Color, Paint, Path};

mod dev_kit;

fn main() {
    let pathdata = "M50 50 L350 50 L350 150 L250 150 L250 250 L150 250 L150 150 L50 150 Z";

    let mut surface = dev_kit::raster_surface(400, 400, Color::WHITE);
    let canvas = surface.canvas();

    // Create path from SVG path data
    let path = Path::from_svg(pathdata).unwrap();

    // Create paint for the path
    let mut paint = Paint::default();
    paint.set_color(Color::BLACK);
    paint.set_anti_alias(true);

    // Apply corner path effect
    let path = build_corner_radius_path(&path, 50.0);
    canvas.draw_path(&path, &paint);

    dev_kit::save_golden(&mut surface, "path_corner");
}
