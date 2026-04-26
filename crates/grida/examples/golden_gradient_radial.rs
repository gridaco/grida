use grida::cg::prelude::*;
use grida::painter::gradient::*;
use skia_safe::{Color, Rect};

mod dev_kit;

fn main() {
    let (width, height) = (400, 400);
    let mut surface = dev_kit::raster_surface(width, height, Color::WHITE);
    let canvas = surface.canvas();

    let gradient = RadialGradientPaint::from_colors(vec![
        CGColor::RED,
        CGColor::GREEN,
        CGColor::BLUE,
        CGColor::RED,
    ]);

    let paint = radial_gradient_paint(&gradient, (width as f32, height as f32));

    canvas.draw_rect(
        Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
        &paint,
    );

    dev_kit::save_golden(&mut surface, "gradient_radial");
}
