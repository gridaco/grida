use skia_safe::{svg, Color, Paint, PaintStyle, Point, Rect};
use std::fs::File;
use std::io::Write;

fn main() {
    // Create an SVG canvas of size 400x400
    let canvas_bounds = Rect::from_wh(400.0, 400.0);
    let canvas = svg::Canvas::new(canvas_bounds, None);

    // Draw a blue filled rectangle
    let mut paint = Paint::default();
    paint.set_color(Color::BLUE);
    canvas.draw_rect(Rect::from_xywh(50.0, 50.0, 300.0, 300.0), &paint);

    // Draw a red diagonal line on top
    paint.set_color(Color::RED);
    paint.set_style(PaintStyle::Stroke);
    paint.set_stroke_width(4.0);
    canvas.draw_line(Point::new(50.0, 50.0), Point::new(350.0, 350.0), &paint);

    // Finish drawing and write the SVG data to a file
    let data = canvas.end();
    let mut file = File::create("goldens/sksvg.svg").expect("failed to create svg");
    file.write_all(data.as_bytes())
        .expect("failed to write svg");
}
