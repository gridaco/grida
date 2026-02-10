//! # Stroke Decoration — Low-level SDK demonstration
//!
//! **Purpose**: Demonstrate what is possible with the low-level marker API,
//! beyond the built-in `StrokeDecoration` presets.
//!
//! Uses raw Skia + `shape::marker` low-level API directly (not the renderer
//! pipeline). Shows:
//!
//! 1. **Terminal vs Node anchor modes** — same shapes, different alignment
//! 2. **Arbitrary placement** — markers at any arc-length on any path type
//! 3. **Custom geometry** — user-defined marker paths
//! 4. **Cutback solver** — how cutback adapts to stroke width
//!
//! Red vertical guidelines mark logical endpoints throughout.

use cg::cg::StrokeDecoration;
use cg::shape::marker::{self, BuiltinMarker, MarkerAnchor};
use skia_safe::{
    surfaces, Canvas, Color, EncodedImageFormat, Paint, PaintCap, PaintStyle, Path, PathBuilder,
    PathMeasure, Point,
};
use std::f32::consts::PI;

const W: i32 = 1100;
const H: i32 = 1600;
const STROKE_W: f32 = 10.0;
const LINE_LEN: f32 = 300.0;
const LEFT: f32 = 80.0;
const COL2: f32 = 560.0;
const TOP: f32 = 70.0;
const ROW_H: f32 = 90.0;

fn main() {
    let mut surface = surfaces::raster_n32_premul((W, H)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let font = skia_safe::Font::new(
        cg::fonts::embedded::typeface(cg::fonts::embedded::geistmono::BYTES),
        12.0,
    );
    let small_font = skia_safe::Font::new(
        cg::fonts::embedded::typeface(cg::fonts::embedded::geistmono::BYTES),
        11.0,
    );
    let lp = label_paint();
    let sp = section_paint();
    let gp = guide_paint();
    let size = marker::marker_size(STROKE_W);
    let mut y = TOP;

    // ===================================================================
    // Section 1: Terminal vs Node anchor — side by side
    // ===================================================================
    draw_section(canvas, &small_font, &sp, LEFT, y, "── Terminal (edge-aligned) ──");
    draw_section(canvas, &small_font, &sp, COL2, y, "── Centroid (center-aligned) ──");
    y += 22.0;

    let shapes: Vec<(&str, BuiltinMarker)> = vec![
        ("arrow_lines", BuiltinMarker::ArrowLines),
        ("triangle_filled", BuiltinMarker::TriangleFilled),
        ("circle_filled", BuiltinMarker::CircleFilled),
        ("square_filled", BuiltinMarker::SquareFilled),
        ("diamond_filled", BuiltinMarker::DiamondFilled),
    ];

    for (label, shape) in &shapes {
        // Terminal column
        draw_guides(canvas, &gp, LEFT, y);
        draw_stroke(canvas, LEFT, y);
        let ms = marker::marker_shape(*shape, MarkerAnchor::Terminal, size, STROKE_W);
        draw_marker_at_end(canvas, LEFT, y, &ms.path);
        canvas.draw_str(label, Point::new(LEFT, y + 42.0), &font, &lp);

        // Centroid column
        draw_guides(canvas, &gp, COL2, y);
        draw_stroke(canvas, COL2, y);
        let ms = marker::marker_shape(*shape, MarkerAnchor::Centroid, size, STROKE_W);
        draw_marker_at_end(canvas, COL2, y, &ms.path);
        canvas.draw_str(label, Point::new(COL2, y + 42.0), &font, &lp);

        y += ROW_H;
    }

    // ===================================================================
    // Section 2: Arbitrary placement on curves
    // ===================================================================
    y += 20.0;
    draw_section(
        canvas,
        &small_font,
        &sp,
        LEFT,
        y,
        "── Arbitrary placement (u=0, 0.33, 0.66, 1.0 on a curve) ──",
    );
    y += 22.0;

    let curve = {
        let mut b = PathBuilder::new();
        b.move_to((LEFT, y));
        b.cubic_to(
            (LEFT + LINE_LEN * 0.33, y - 80.0),
            (LEFT + LINE_LEN * 0.66, y + 80.0),
            (LEFT + LINE_LEN, y),
        );
        b.detach()
    };

    // Draw the curve stroke
    let mut sp2 = stroke_paint();
    sp2.set_stroke_cap(PaintCap::Butt);
    canvas.draw_path(&curve, &sp2);

    // Place different shapes at u=0, 0.33, 0.66, 1.0
    let placements: Vec<(f32, BuiltinMarker, Color, bool)> = vec![
        (0.0, BuiltinMarker::TriangleFilled, Color::from_rgb(220, 60, 60), true),
        (0.33, BuiltinMarker::CircleFilled, Color::from_rgb(60, 180, 60), false),
        (0.66, BuiltinMarker::DiamondFilled, Color::from_rgb(140, 80, 200), false),
        (1.0, BuiltinMarker::TriangleFilled, Color::from_rgb(60, 60, 220), false),
    ];

    let mut measure = PathMeasure::new(&curve, false, None);
    let length = measure.length();

    for (u, shape, color, reverse) in &placements {
        let ms = marker::marker_shape(*shape, MarkerAnchor::Terminal, size, STROKE_W);
        let mut fp = Paint::default();
        fp.set_anti_alias(true);
        fp.set_style(PaintStyle::Fill);
        fp.set_color(*color);
        marker::draw_marker_shape_at(canvas, &mut measure, u * length, &ms.path, &fp, *reverse);
    }

    canvas.draw_str(
        "arrow u=0 | circle u=0.33 | diamond u=0.66 | triangle u=1.0",
        Point::new(LEFT, y + 52.0),
        &font,
        &lp,
    );
    y += ROW_H + 40.0;

    // ===================================================================
    // Section 3: Custom user-defined marker geometry
    // ===================================================================
    y += 20.0;
    draw_section(
        canvas,
        &small_font,
        &sp,
        LEFT,
        y,
        "── Custom marker geometry (user-defined paths) ──",
    );
    y += 22.0;

    // Custom: star shape
    let star = build_star(size * 0.6, 5);
    draw_guides(canvas, &gp, LEFT, y);
    draw_stroke(canvas, LEFT, y);
    draw_marker_at_end_with(canvas, LEFT, y, &star, Color::from_rgb(220, 140, 20));
    canvas.draw_str("custom: 5-point star", Point::new(LEFT, y + 42.0), &font, &lp);

    // Custom: cross / plus
    let cross = build_cross(size * 0.4);
    draw_guides(canvas, &gp, COL2, y);
    draw_stroke(canvas, COL2, y);
    draw_marker_at_end_with(canvas, COL2, y, &cross, Color::from_rgb(220, 60, 60));
    canvas.draw_str("custom: cross / plus", Point::new(COL2, y + 42.0), &font, &lp);
    y += ROW_H;

    // ===================================================================
    // Section 4: Cutback adapts to stroke width
    // ===================================================================
    y += 20.0;
    draw_section(
        canvas,
        &small_font,
        &sp,
        LEFT,
        y,
        "── Cutback solver: triangle_filled at sw=2, 6, 14 ──",
    );
    y += 22.0;

    for sw in [2.0_f32, 6.0, 14.0] {
        let sz = marker::marker_size(sw);
        let cutback = marker::cutback_depth(StrokeDecoration::TriangleFilled, sw);

        // Guides
        draw_guides(canvas, &gp, LEFT, y);

        // Full stroke (faint, for reference)
        {
            let mut p = Paint::default();
            p.set_anti_alias(true);
            p.set_style(PaintStyle::Stroke);
            p.set_stroke_width(sw);
            p.set_stroke_cap(PaintCap::Butt);
            p.set_color(Color::from_argb(60, 40, 40, 40));
            canvas.draw_path(&make_line(LEFT, y), &p);
        }

        // Trimmed stroke
        let path = make_line(LEFT, y);
        let trimmed = marker::trim_path(&path, 0.0, cutback);
        {
            let mut p = Paint::default();
            p.set_anti_alias(true);
            p.set_style(PaintStyle::Stroke);
            p.set_stroke_width(sw);
            p.set_stroke_cap(PaintCap::Butt);
            p.set_color(Color::from_rgb(40, 40, 40));
            canvas.draw_path(&trimmed, &p);
        }

        // Marker on untrimmed path
        let ms = marker::marker_shape(BuiltinMarker::TriangleFilled, MarkerAnchor::Terminal, sz, sw);
        let fp = fill_paint();
        let mut measure = PathMeasure::new(&path, false, None);
        let length = measure.length();
        marker::draw_marker_shape_at(canvas, &mut measure, length, &ms.path, &fp, false);

        canvas.draw_str(
            &format!("sw={sw}  cutback={cutback:.1}px"),
            Point::new(LEFT + LINE_LEN + 60.0, y + 5.0),
            &font,
            &lp,
        );
        y += ROW_H;
    }

    // ===================================================================
    // Section 5: Path types — straight, zigzag, curve
    // ===================================================================
    y += 20.0;
    draw_section(
        canvas,
        &small_font,
        &sp,
        LEFT,
        y,
        "── Path types: straight, zigzag, curve (triangle_filled) ──",
    );
    y += 22.0;

    let paths: Vec<(&str, Path)> = vec![
        ("straight", make_line(LEFT, y)),
        ("zigzag", {
            let mut b = PathBuilder::new();
            b.move_to((LEFT, y + ROW_H + 20.0));
            b.line_to((LEFT + 100.0, y + ROW_H - 20.0));
            b.line_to((LEFT + 200.0, y + ROW_H + 20.0));
            b.line_to((LEFT + LINE_LEN, y + ROW_H - 10.0));
            b.detach()
        }),
        ("curve", {
            let mut b = PathBuilder::new();
            b.move_to((LEFT, y + ROW_H * 2.0));
            b.cubic_to(
                (LEFT + 100.0, y + ROW_H * 2.0 - 60.0),
                (LEFT + 200.0, y + ROW_H * 2.0 + 60.0),
                (LEFT + LINE_LEN, y + ROW_H * 2.0),
            );
            b.detach()
        }),
    ];

    for (label, path) in &paths {
        let mut sp3 = stroke_paint();
        sp3.set_stroke_cap(PaintCap::Butt);
        canvas.draw_path(path, &sp3);

        // Decorations at both ends
        let fp = fill_paint();
        marker::draw_endpoint_decorations(
            canvas,
            path,
            StrokeDecoration::TriangleFilled,
            StrokeDecoration::TriangleFilled,
            STROKE_W,
            &fp,
        );

        canvas.draw_str(label, Point::new(LEFT + LINE_LEN + 30.0, y + 5.0), &font, &lp);
        y += ROW_H;
    }

    // Save
    let image = surface.image_snapshot();
    let data = image
        .encode(None, EncodedImageFormat::PNG, None)
        .expect("encode");
    let out = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/goldens/stroke_decoration.png"
    );
    std::fs::write(out, data.as_bytes()).unwrap();
    println!("Saved {}", out);
}

// ===========================================================================
// Helpers
// ===========================================================================

fn make_line(x: f32, y: f32) -> Path {
    let mut b = PathBuilder::new();
    b.move_to((x, y));
    b.line_to((x + LINE_LEN, y));
    b.detach()
}

fn draw_stroke(canvas: &Canvas, x: f32, y: f32) {
    let mut p = stroke_paint();
    p.set_stroke_cap(PaintCap::Butt);
    canvas.draw_path(&make_line(x, y), &p);
}

fn draw_marker_at_end(canvas: &Canvas, x: f32, y: f32, marker: &Path) {
    let path = make_line(x, y);
    let mut measure = PathMeasure::new(&path, false, None);
    let length = measure.length();
    let fp = fill_paint();
    marker::draw_marker_shape_at(canvas, &mut measure, length, marker, &fp, false);
}

fn draw_marker_at_end_with(canvas: &Canvas, x: f32, y: f32, marker: &Path, color: Color) {
    let path = make_line(x, y);
    let mut measure = PathMeasure::new(&path, false, None);
    let length = measure.length();
    let mut fp = Paint::default();
    fp.set_anti_alias(true);
    fp.set_style(PaintStyle::Fill);
    fp.set_color(color);
    marker::draw_marker_shape_at(canvas, &mut measure, length, marker, &fp, false);
}

fn draw_guides(canvas: &Canvas, paint: &Paint, x: f32, y: f32) {
    canvas.draw_line(Point::new(x, y - 32.0), Point::new(x, y + 32.0), paint);
    canvas.draw_line(
        Point::new(x + LINE_LEN, y - 32.0),
        Point::new(x + LINE_LEN, y + 32.0),
        paint,
    );
}

fn draw_section(canvas: &Canvas, font: &skia_safe::Font, paint: &Paint, x: f32, y: f32, text: &str) {
    canvas.draw_str(text, Point::new(x, y), font, paint);
}

fn stroke_paint() -> Paint {
    let mut p = Paint::default();
    p.set_anti_alias(true);
    p.set_style(PaintStyle::Stroke);
    p.set_stroke_width(STROKE_W);
    p.set_color(Color::from_rgb(40, 40, 40));
    p
}

fn fill_paint() -> Paint {
    let mut p = Paint::default();
    p.set_anti_alias(true);
    p.set_style(PaintStyle::Fill);
    p.set_color(Color::from_rgb(40, 40, 40));
    p
}

fn label_paint() -> Paint {
    let mut p = Paint::default();
    p.set_anti_alias(true);
    p.set_color(Color::from_rgb(80, 80, 80));
    p
}

fn section_paint() -> Paint {
    let mut p = Paint::default();
    p.set_anti_alias(true);
    p.set_color(Color::from_rgb(160, 160, 160));
    p
}

fn guide_paint() -> Paint {
    let mut p = Paint::default();
    p.set_anti_alias(true);
    p.set_style(PaintStyle::Stroke);
    p.set_stroke_width(1.0);
    p.set_color(Color::from_rgb(220, 40, 40));
    p
}

/// Build a custom 5-point star marker (centered at origin).
fn build_star(radius: f32, points: usize) -> Path {
    let inner_r = radius * 0.4;
    let mut b = PathBuilder::new();
    for i in 0..(points * 2) {
        let angle = (i as f32) * PI / (points as f32) - PI / 2.0;
        let r = if i % 2 == 0 { radius } else { inner_r };
        let x = r * angle.cos();
        let y = r * angle.sin();
        if i == 0 {
            b.move_to((x, y));
        } else {
            b.line_to((x, y));
        }
    }
    b.close();
    b.detach()
}

/// Build a custom cross / plus marker (centered at origin).
fn build_cross(arm: f32) -> Path {
    let t = arm * 0.3; // thickness
    let mut b = PathBuilder::new();
    // Horizontal bar
    b.move_to((-arm, -t));
    b.line_to((arm, -t));
    b.line_to((arm, t));
    b.line_to((-arm, t));
    b.close();
    // Vertical bar
    b.move_to((-t, -arm));
    b.line_to((t, -arm));
    b.line_to((t, arm));
    b.line_to((-t, arm));
    b.close();
    b.detach()
}
