use cg::{cg::types::*, painter::gradient::*};
use math2::transform::AffineTransform;
use skia_safe::{surfaces, Color, Rect};

fn main() {
    let (width, height) = (400, 400);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let gradient = RadialGradientPaint {
        stops: vec![
            GradientStop {
                offset: 0.0,
                color: CGColor(255, 0, 0, 255),
            },
            GradientStop {
                offset: 0.33,
                color: CGColor(0, 255, 0, 255),
            },
            GradientStop {
                offset: 0.66,
                color: CGColor(0, 0, 255, 255),
            },
            GradientStop {
                offset: 1.0,
                color: CGColor(255, 0, 0, 255),
            },
        ],
        opacity: 1.0,
        transform: AffineTransform::identity(),
        blend_mode: BlendMode::Normal,
    };

    let paint = radial_gradient_paint(&gradient, 1.0, (width as f32, height as f32));

    canvas.draw_rect(
        Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
        &paint,
    );

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/gradient_radial.png"),
        data.as_bytes(),
    )
    .unwrap();
}
