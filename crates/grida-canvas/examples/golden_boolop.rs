use skia_safe::{surfaces, Color, Paint, Path, PathBuilder, PathOp, Rect};

fn main() {
    let (w, h) = (600, 120);
    let mut surface = surfaces::raster_n32_premul((w, h)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_color(Color::from_argb(255, 50, 100, 200));

    // union: rect + circle
    {
        let rect = Path::rect(Rect::from_xywh(10.0, 20.0, 40.0, 60.0), None);
        let circle = Path::circle((50.0, 50.0), 30.0, None);
        if let Some(result) = Path::op(&rect, &circle, PathOp::Union) {
            canvas.save();
            canvas.translate((20.0, 0.0));
            canvas.draw_path(&result, &paint);
            canvas.restore();
        }
    }

    // intersection: two circles
    {
        let c1 = Path::circle((150.0, 50.0), 30.0, None);
        let c2 = Path::circle((180.0, 50.0), 30.0, None);
        if let Some(result) = Path::op(&c1, &c2, PathOp::Intersect) {
            canvas.draw_path(&result, &paint);
        }
    }

    // difference: circle - triangle path
    {
        let circle = Path::circle((300.0, 50.0), 35.0, None);
        let mut tri_builder = PathBuilder::new();
        tri_builder.move_to((280.0, 80.0));
        tri_builder.line_to((320.0, 80.0));
        tri_builder.line_to((300.0, 20.0));
        tri_builder.close();
        let tri = tri_builder.detach();
        if let Some(result) = Path::op(&circle, &tri, PathOp::Difference) {
            canvas.draw_path(&result, &paint);
        }
    }

    // xor: two rectangles
    {
        let r1 = Path::rect(Rect::from_xywh(360.0, 20.0, 50.0, 60.0), None);
        let r2 = Path::rect(Rect::from_xywh(380.0, 40.0, 50.0, 60.0), None);
        if let Some(result) = Path::op(&r1, &r2, PathOp::XOR) {
            canvas.draw_path(&result, &paint);
        }
    }

    // nested: (rect ∪ circle) - triangle
    {
        let r = Path::rect(Rect::from_xywh(470.0, 20.0, 40.0, 60.0), None);
        let c = Path::circle((500.0, 50.0), 30.0, None);
        let union = Path::op(&r, &c, PathOp::Union).unwrap();
        let mut tri_builder = PathBuilder::new();
        tri_builder.move_to((480.0, 80.0));
        tri_builder.line_to((520.0, 80.0));
        tri_builder.line_to((500.0, 25.0));
        tri_builder.close();
        let tri = tri_builder.detach();
        if let Some(result) = Path::op(&union, &tri, PathOp::Difference) {
            canvas.draw_path(&result, &paint);
        }
    }

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::create_dir_all("goldens").unwrap();
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/boolop.png"),
        data.as_bytes(),
    )
    .unwrap();
}
