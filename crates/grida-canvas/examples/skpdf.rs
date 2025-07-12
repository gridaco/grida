use skia_safe::{pdf, Color, Paint, PaintStyle, Point, Rect};
use std::fs::File;

fn main() {
    // Create a pdf file writer
    let mut file = File::create("goldens/skia_output.pdf").expect("failed to create pdf");

    // Create a new PDF document with default metadata
    let doc = pdf::new_document(&mut file, None);

    // Start a page. The size is in points (1pt = 1/72 inch)
    let mut page = doc.begin_page((400, 400), None);
    let canvas = page.canvas();

    // Draw a blue filled rectangle
    let mut paint = Paint::default();
    paint.set_color(Color::BLUE);
    canvas.draw_rect(Rect::from_xywh(50.0, 50.0, 300.0, 300.0), &paint);

    // Draw a red diagonal line on top
    paint.set_color(Color::RED);
    paint.set_style(PaintStyle::Stroke);
    paint.set_stroke_width(4.0);
    canvas.draw_line(Point::new(50.0, 50.0), Point::new(350.0, 350.0), &paint);

    // Finish the page and close the document
    let doc = page.end_page();
    doc.close();
}
