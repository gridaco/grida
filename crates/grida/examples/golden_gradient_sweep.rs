use grida::cg::prelude::*;
use grida::painter::gradient::*;
use math2::transform::AffineTransform;
use skia_safe::{Color, Rect};

mod dev_kit;

fn main() {
    let (width, height) = (400, 400);
    let mut surface = dev_kit::raster_surface(width, height, Color::WHITE);
    let canvas = surface.canvas();

    let gradient = SweepGradientPaint {
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: CGColor::from_rgba(255, 97, 97, 255),
            },
            GradientStop {
                offset: 0.5,
                color: CGColor::from_rgba(133, 0, 0, 255),
            },
            GradientStop {
                offset: 1.0,
                color: CGColor::from_rgba(255, 0, 0, 255),
            },
        ],
        opacity: 1.0,
        transform: AffineTransform::identity(),
        blend_mode: BlendMode::Normal,
        active: true,
    };

    let paint = sweep_gradient_paint(&gradient, (width as f32, height as f32));

    canvas.draw_rect(
        Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
        &paint,
    );

    dev_kit::save_golden(&mut surface, "gradient_sweep");
}
