use skia_safe::{surfaces, Color, Paint, Path, PathOp, Rect};

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
        let mut rect = Path::new();
        rect.add_rect(Rect::from_xywh(10.0, 20.0, 40.0, 60.0), None);
        let mut circle = Path::new();
        circle.add_circle((50.0, 50.0), 30.0, None);
        if let Some(result) = Path::op(&rect, &circle, PathOp::Union) {
            canvas.save();
            canvas.translate((20.0, 0.0));
            canvas.draw_path(&result, &paint);
            canvas.restore();
        }
    }

    // intersection: two circles
    {
        let mut c1 = Path::new();
        c1.add_circle((150.0, 50.0), 30.0, None);
        let mut c2 = Path::new();
        c2.add_circle((180.0, 50.0), 30.0, None);
        if let Some(result) = Path::op(&c1, &c2, PathOp::Intersect) {
            canvas.draw_path(&result, &paint);
        }
    }

    // difference: circle - triangle path
    {
        let mut circle = Path::new();
        circle.add_circle((300.0, 50.0), 35.0, None);
        let mut tri = Path::new();
        tri.move_to((280.0, 80.0));
        tri.line_to((320.0, 80.0));
        tri.line_to((300.0, 20.0));
        tri.close();
        if let Some(result) = Path::op(&circle, &tri, PathOp::Difference) {
            canvas.draw_path(&result, &paint);
        }
    }

    // xor: two rectangles
    {
        let mut r1 = Path::new();
        r1.add_rect(Rect::from_xywh(360.0, 20.0, 50.0, 60.0), None);
        let mut r2 = Path::new();
        r2.add_rect(Rect::from_xywh(380.0, 40.0, 50.0, 60.0), None);
        if let Some(result) = Path::op(&r1, &r2, PathOp::XOR) {
            canvas.draw_path(&result, &paint);
        }
    }

    // nested: (rect ∪ circle) - triangle
    {
        let mut r = Path::new();
        r.add_rect(Rect::from_xywh(470.0, 20.0, 40.0, 60.0), None);
        let mut c = Path::new();
        c.add_circle((500.0, 50.0), 30.0, None);
        let union = Path::op(&r, &c, PathOp::Union).unwrap();
        let mut tri = Path::new();
        tri.move_to((480.0, 80.0));
        tri.line_to((520.0, 80.0));
        tri.line_to((500.0, 25.0));
        tri.close();
        if let Some(result) = Path::op(&union, &tri, PathOp::Difference) {
            canvas.draw_path(&result, &paint);
        }
    }

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("encode png");
    std::fs::create_dir_all("goldens").unwrap();
    std::fs::write("goldens/boolop.png", data.as_bytes()).unwrap();
}
