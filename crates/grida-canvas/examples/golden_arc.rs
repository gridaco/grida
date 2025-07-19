use cg::cg::types::*;
use cg::node::schema::*;
use cg::path::*;
use math2::transform::AffineTransform;
use skia_safe::{surfaces, Color as SkColor, Paint as SkPaint, PaintStyle};

fn main() {
    let node = ArcNode {
        id: "1".into(),
        name: Some("arc".into()),
        active: true,
        transform: AffineTransform::identity(),
        size: Size {
            width: 200.0,
            height: 200.0,
        },
        inner_radius: 0.5,
        start_angle: 0.0,
        angle: 90.0,
        fills: vec![Paint::Solid(SolidPaint {
            color: Color(0, 128, 255, 255),
            opacity: 1.0,
        })],
        strokes: vec![Paint::Solid(SolidPaint {
            color: Color(0, 0, 0, 255),
            opacity: 1.0,
        })],
        stroke_width: 2.0,
        stroke_align: StrokeAlign::Center,
        stroke_dash_array: None,
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        effects: LayerEffects::new_empty(),
    };

    let mut surface =
        surfaces::raster_n32_premul((node.size.width as i32, node.size.height as i32))
            .expect("surface");
    let canvas = surface.canvas();
    canvas.clear(SkColor::WHITE);

    let path = build_arc_path(&node);

    if let Paint::Solid(fill) = &node.fills[0] {
        let mut paint = SkPaint::default();
        paint.set_anti_alias(true);
        paint.set_color(SkColor::from_argb(
            fill.color.3,
            fill.color.0,
            fill.color.1,
            fill.color.2,
        ));
        canvas.draw_path(&path, &paint);
    }

    if let Paint::Solid(stroke) = &node.strokes[0] {
        let mut paint = SkPaint::default();
        paint.set_style(PaintStyle::Stroke);
        paint.set_stroke_width(node.stroke_width);
        paint.set_anti_alias(true);
        paint.set_color(SkColor::from_argb(
            stroke.color.3,
            stroke.color.0,
            stroke.color.1,
            stroke.color.2,
        ));
        canvas.draw_path(&path, &paint);
    }

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .unwrap();
    std::fs::write("goldens/arc.png", data.as_bytes()).unwrap();
}
