use cg::cg::types::FeProgressiveBlur;
use skia_safe::{
    self as sk, image_filters, surfaces, BlendMode, Color, Paint, Point, Rect, Shader, TileMode,
};

fn apply_progressive_blur(canvas: &sk::Canvas, base: &sk::Image, pb: &FeProgressiveBlur) {
    let steps = 8;
    for i in 0..steps {
        let mut radius = pb.radius * 2.0_f32.powi(i as i32);
        if radius > pb.radius2 {
            radius = pb.radius2;
        }
        let start = i as f32 * 0.125;
        let fade_in_end = (start + 0.125).min(1.0);
        let constant_end = (start + 0.25).min(1.0);
        let fade_out_end = (start + 0.375).min(1.0);

        let colors = [
            Color::from_argb(0, 0, 0, 0),
            Color::from_argb(255, 0, 0, 0),
            Color::from_argb(255, 0, 0, 0),
            Color::from_argb(0, 0, 0, 0),
        ];
        let positions = [start, fade_in_end, constant_end, fade_out_end];

        let shader = Shader::linear_gradient(
            (Point::new(pb.x1, pb.y1), Point::new(pb.x2, pb.y2)),
            &colors[..],
            Some(&positions[..]),
            TileMode::Clamp,
            None,
            None,
        )
        .unwrap();

        let mut blur_paint = Paint::default();
        blur_paint
            .set_image_filter(image_filters::blur((radius, radius), None, None, None).unwrap());

        canvas.save_layer(&Default::default());
        canvas.draw_image(base, (0, 0), Some(&blur_paint));

        let mut mask_paint = Paint::default();
        mask_paint.set_shader(shader);
        mask_paint.set_blend_mode(BlendMode::DstIn);
        canvas.draw_paint(&mask_paint);
        canvas.restore();

        if radius >= pb.radius2 {
            break;
        }
    }
}

fn main() {
    let (width, height) = (400, 400);
    let mut surface = surfaces::raster_n32_premul((width, height)).expect("surface");
    {
        let canvas = surface.canvas();
        canvas.clear(Color::WHITE);

        // draw background gradient
        let bg_shader = Shader::linear_gradient(
            (Point::new(0.0, 0.0), Point::new(0.0, height as f32)),
            &[Color::RED, Color::BLUE][..],
            Some(&[0.0, 1.0][..]),
            TileMode::Clamp,
            None,
            None,
        )
        .unwrap();
        let mut bg_paint = Paint::default();
        bg_paint.set_shader(bg_shader);
        canvas.draw_rect(Rect::from_wh(width as f32, height as f32), &bg_paint);

        // some foreground rectangle
        let mut fg_paint = Paint::default();
        fg_paint.set_color(Color::from_argb(200, 255, 255, 255));
        canvas.draw_rect(Rect::from_xywh(50.0, 50.0, 300.0, 300.0), &fg_paint);
    }

    let base_image = surface.image_snapshot();
    {
        let canvas = surface.canvas();
        apply_progressive_blur(
            canvas,
            &base_image,
            &FeProgressiveBlur {
                x1: 0.0,
                y1: 0.0,
                x2: 0.0,
                y2: height as f32,
                radius: 0.5,
                radius2: 64.0,
            },
        );
    }

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::write("goldens/progressive_blur_multipass.png", data.as_bytes()).unwrap();
}
