use cg::vectornetwork::*;
use skia_safe::{Color, Paint};

mod dev_kit;

fn main() {
    // Create a simple triangle using VectorNetwork
    let triangle = VectorNetwork {
        vertices: vec![(200.0, 100.0), (300.0, 200.0), (100.0, 200.0)],
        segments: vec![
            VectorNetworkSegment::ab(0, 1),
            VectorNetworkSegment::ab(1, 2),
            VectorNetworkSegment::ab(2, 0),
        ],
        regions: vec![],
    };

    let mut surface = dev_kit::raster_surface(400, 400, Color::WHITE);
    let canvas = surface.canvas();

    // Convert VectorNetwork to Skia Path using the Into trait
    let path: skia_safe::Path = triangle.into();

    let mut fill_paint = Paint::default();
    fill_paint.set_anti_alias(true);
    fill_paint.set_color(Color::BLUE);
    fill_paint.set_style(skia_safe::PaintStyle::Fill);
    canvas.draw_path(&path, &fill_paint);

    dev_kit::save_golden(&mut surface, "vector_triangle");
}
