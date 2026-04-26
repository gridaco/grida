use cg::shape::*;
use cg::vectornetwork::*;
use skia_safe::{Color, Paint};

mod dev_kit;

fn main() {
    // Create a diamond shape using VectorNetwork
    let diamond = VectorNetwork {
        vertices: vec![
            (200.0, 100.0), // top
            (300.0, 200.0), // right
            (200.0, 300.0), // bottom
            (100.0, 200.0), // left
        ],
        segments: vec![
            VectorNetworkSegment {
                a: 0,
                b: 1,
                // demonstrate that the zero-tangents should behave as a corner
                ta: (0.0, 0.0),
                tb: (0.0, 0.0),
            },
            VectorNetworkSegment::ab(1, 2),
            VectorNetworkSegment::ab(2, 3),
            VectorNetworkSegment::ab(3, 0),
        ],
        regions: vec![],
    };

    let mut surface = dev_kit::raster_surface(400, 400, Color::WHITE);
    let canvas = surface.canvas();

    // Convert VectorNetwork to Skia Path using the Into trait
    let path: skia_safe::Path = diamond.into();
    let path = build_corner_radius_path(&path, 10.0);

    let mut fill_paint = Paint::default();
    fill_paint.set_anti_alias(true);
    fill_paint.set_color(Color::BLUE);
    fill_paint.set_style(skia_safe::PaintStyle::Fill);
    canvas.draw_path(&path, &fill_paint);

    dev_kit::save_golden(&mut surface, "vector_corner_radius");
}
