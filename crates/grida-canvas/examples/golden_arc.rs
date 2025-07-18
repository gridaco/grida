use cg::cg::types::*;
use cg::node::schema::{ArcNode, LayerEffects, Size};
use math2::transform::AffineTransform;
use skia_safe::{surfaces, Color as SkColor, Paint as SkPaint, PaintStyle, Path, Rect};

fn build_arc_path(node: &ArcNode) -> Path {
    let mut path = Path::new();
    let w = node.size.width;
    let h = node.size.height;
    let cx = w / 2.0;
    let cy = h / 2.0;
    let rx = w / 2.0;
    let ry = h / 2.0;
    let inner_rx = rx * node.radius_a;
    let inner_ry = ry * node.radius_a;

    let start_angle = node.angle_a;
    let end_angle = node.angle_b;
    let sweep = end_angle - start_angle;

    let start_point = (cx + rx * start_angle.cos(), cy + ry * start_angle.sin());
    path.move_to(start_point);
    let outer_rect = Rect::from_xywh(cx - rx, cy - ry, rx * 2.0, ry * 2.0);
    path.arc_to(
        outer_rect,
        start_angle.to_degrees(),
        sweep.to_degrees(),
        false,
    );

    if node.radius_a > 0.0 {
        let end_inner = (
            cx + inner_rx * end_angle.cos(),
            cy + inner_ry * end_angle.sin(),
        );
        path.line_to(end_inner);
        let inner_rect =
            Rect::from_xywh(cx - inner_rx, cy - inner_ry, inner_rx * 2.0, inner_ry * 2.0);
        path.arc_to(
            inner_rect,
            end_angle.to_degrees(),
            (start_angle - end_angle).to_degrees(),
            false,
        );
    } else {
        path.line_to((cx, cy));
    }

    path.close();
    path
}

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
        radius_a: 0.5,
        angle_a: 50.0,
        angle_b: 40.0,
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
