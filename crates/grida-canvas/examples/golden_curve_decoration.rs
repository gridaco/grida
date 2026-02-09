//! # Curve Decoration – Golden Exploration
//!
//! Demonstrates the placement model defined in `docs/wg/feat-2d/curve-decoration.md`.
//!
//! ## Features demonstrated:
//!
//! | Row(s)  | Spec concept                | What you see                                      |
//! |---------|-----------------------------|---------------------------------------------------|
//! | 1       | **Endpoint (start/end)**    | Arrow-filled at both endpoints                    |
//! | 2       | **auto-start-reverse**      | Start marker faces outward, end faces outward     |
//! | 3       | **Join markers**            | Circle at every interior vertex of a polyline     |
//! | 4       | **Repeated (`every`)**      | Arrow-filled every N px along a curve             |
//! | 5       | **Arbitrary `at` placement**| Diamond at u=0.25, u=0.5, u=0.75                  |
//! | 6       | **Orientation: `none`**     | Fixed world-up squares (no tangent alignment)     |
//! | 7       | **Normal offset**           | Circles displaced perpendicular to the path       |
//! | 8       | **Tangent offset (cutback)**| Arrow pulled back so tip sits exactly at endpoint |
//!
//! Columns: Straight, Polyline (with joins), Curve
//!
//! Intentionally **not** modularized — raw Skia exploration code.

use skia_safe::{
    surfaces, Canvas, Color, EncodedImageFormat, Paint, PaintCap, PaintStyle, Path, PathBuilder,
    PathMeasure, Point,
};
use std::f32::consts::PI;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const W: i32 = 1200;
const H: i32 = 1200;
const LEFT_MARGIN: f32 = 200.0;
const TOP_MARGIN: f32 = 60.0;
const ROW_H: f32 = 130.0;
const COL_W: f32 = 310.0;
const STROKE_W: f32 = 2.5;
const M: f32 = 12.0; // marker base size

fn main() {
    let mut surface = surfaces::raster_n32_premul((W, H)).expect("surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);

    let font = skia_safe::Font::new(
        cg::fonts::embedded::typeface(cg::fonts::embedded::geistmono::BYTES),
        12.0,
    );
    let lp = text_paint();

    // Column headers
    for (col, label) in ["Straight", "Polyline", "Curve"].iter().enumerate() {
        let x = LEFT_MARGIN + col as f32 * COL_W + 50.0;
        canvas.draw_str(label, Point::new(x, TOP_MARGIN - 20.0), &font, &lp);
    }

    let rows: Vec<(&str, fn(&Canvas, &Path, usize))> = vec![
        ("Endpoint start/end", draw_row_endpoints),
        ("auto-start-reverse", draw_row_auto_start_reverse),
        ("Join markers", draw_row_join_markers),
        ("Repeated (every)", draw_row_repeated),
        ("At u=.25,.5,.75", draw_row_at_placement),
        ("Orient: none", draw_row_orient_none),
        ("Normal offset", draw_row_normal_offset),
        ("Tangent offset", draw_row_tangent_offset),
    ];

    for (row, (label, draw_fn)) in rows.iter().enumerate() {
        let y = TOP_MARGIN + row as f32 * ROW_H + 50.0;
        canvas.draw_str(label, Point::new(6.0, y + 4.0), &font, &lp);

        for col in 0..3 {
            let x = LEFT_MARGIN + col as f32 * COL_W;
            canvas.save();
            canvas.translate((x, y));

            let path = match col {
                0 => make_straight(),
                1 => make_polyline(),
                _ => make_curve(),
            };

            // Draw the base path
            let mut paint = stroke_paint(Color::from_rgb(60, 60, 60));
            paint.set_stroke_cap(PaintCap::Butt);
            canvas.draw_path(&path, &paint);

            draw_fn(canvas, &path, col);

            canvas.restore();
        }
    }

    // Save
    let image = surface.image_snapshot();
    let data = image
        .encode(None, EncodedImageFormat::PNG, None)
        .expect("encode");
    std::fs::write(
        concat!(env!("CARGO_MANIFEST_DIR"), "/goldens/curve_decoration.png"),
        data.as_bytes(),
    )
    .unwrap();
    println!("Saved goldens/curve_decoration.png");
}

// ===========================================================================
// Path builders
// ===========================================================================

fn make_straight() -> Path {
    let mut b = PathBuilder::new();
    b.move_to((0.0, 0.0));
    b.line_to((250.0, 0.0));
    b.detach()
}

fn make_polyline() -> Path {
    let mut b = PathBuilder::new();
    b.move_to((0.0, 20.0));
    b.line_to((80.0, -25.0));
    b.line_to((170.0, 25.0));
    b.line_to((250.0, -10.0));
    b.detach()
}

fn make_curve() -> Path {
    let mut b = PathBuilder::new();
    b.move_to((0.0, 0.0));
    b.cubic_to((80.0, -60.0), (170.0, 60.0), (250.0, 0.0));
    b.detach()
}

// ===========================================================================
// Row drawing functions
// ===========================================================================

// --- Row 1: Endpoint (start + end) with arrow-filled -----------------------
fn draw_row_endpoints(canvas: &Canvas, path: &Path, _col: usize) {
    let mut m = PathMeasure::new(path, false, None);
    let len = m.length();
    if let Some((p, t)) = m.pos_tan(0.0) {
        draw_arrow_filled(canvas, p, tangent_angle(&t) + PI, Color::from_rgb(220, 60, 60));
    }
    if let Some((p, t)) = m.pos_tan(len) {
        draw_arrow_filled(canvas, p, tangent_angle(&t), Color::from_rgb(220, 60, 60));
    }
}

// --- Row 2: auto-start-reverse (both point outward) ------------------------
fn draw_row_auto_start_reverse(canvas: &Canvas, path: &Path, _col: usize) {
    let mut m = PathMeasure::new(path, false, None);
    let len = m.length();
    // start: use -t (reversed tangent), so arrow points away from the path
    if let Some((p, t)) = m.pos_tan(0.0) {
        draw_arrow_filled(canvas, p, tangent_angle(&t) + PI, Color::from_rgb(60, 60, 220));
    }
    // end: use t (normal tangent), arrow points away from the path
    if let Some((p, t)) = m.pos_tan(len) {
        draw_arrow_filled(canvas, p, tangent_angle(&t), Color::from_rgb(60, 60, 220));
    }
}

// --- Row 3: Join markers (circle at each interior vertex) ------------------
fn draw_row_join_markers(canvas: &Canvas, path: &Path, col: usize) {
    // For the polyline column, place circle markers at interior vertices.
    // For straight / curve, there are no joins — show "no joins" gracefully.
    if col == 1 {
        // Polyline vertices: (0,20), (80,-25), (170,25), (250,-10)
        // Interior joins are indices 1 and 2.
        let joins = [(80.0_f32, -25.0_f32), (170.0, 25.0)];
        for (x, y) in joins {
            let pt = Point::new(x, y);
            draw_circle(canvas, pt, Color::from_rgb(40, 170, 80), true);
        }
    }
    // For straight and curve: also show start/end circles to demonstrate
    // that "joins" only exist on piecewise paths.
    let mut m = PathMeasure::new(path, false, None);
    let len = m.length();
    if let Some((p, _)) = m.pos_tan(0.0) {
        draw_circle(canvas, p, Color::from_rgb(180, 180, 180), false);
    }
    if let Some((p, _)) = m.pos_tan(len) {
        draw_circle(canvas, p, Color::from_rgb(180, 180, 180), false);
    }
}

// --- Row 4: Repeated markers (`every` — equal arc-length intervals) --------
fn draw_row_repeated(canvas: &Canvas, path: &Path, _col: usize) {
    let mut m = PathMeasure::new(path, false, None);
    let len = m.length();
    let interval = 40.0_f32; // place a marker every 40px of arc-length
    let count = (len / interval).floor() as usize;
    for i in 0..=count {
        let d = (i as f32) * interval;
        if let Some((p, t)) = m.pos_tan(d.min(len)) {
            draw_arrow_filled(canvas, p, tangent_angle(&t), Color::from_rgb(220, 60, 60));
        }
    }
}

// --- Row 5: Arbitrary `at` placement (u=0.25, 0.5, 0.75) ------------------
fn draw_row_at_placement(canvas: &Canvas, path: &Path, _col: usize) {
    let mut m = PathMeasure::new(path, false, None);
    let len = m.length();
    let fractions = [0.25_f32, 0.5, 0.75];
    let colors = [
        Color::from_rgb(140, 80, 200),
        Color::from_rgb(200, 60, 140),
        Color::from_rgb(80, 140, 200),
    ];
    for (u, color) in fractions.iter().zip(colors.iter()) {
        let d = u * len;
        if let Some((p, t)) = m.pos_tan(d) {
            draw_diamond(canvas, p, tangent_angle(&t), *color);
        }
    }
}

// --- Row 6: Orientation `none` (fixed world rotation, no tangent align) ----
fn draw_row_orient_none(canvas: &Canvas, path: &Path, _col: usize) {
    let mut m = PathMeasure::new(path, false, None);
    let len = m.length();
    let fractions = [0.0_f32, 0.33, 0.66, 1.0];
    for u in fractions {
        let d = u * len;
        if let Some((p, _t)) = m.pos_tan(d.min(len)) {
            // Orientation: none — angle is fixed at 0 (world-space upward square)
            draw_square(canvas, p, 0.0, Color::from_rgb(220, 140, 20));
        }
    }
}

// --- Row 7: Normal offset (circles displaced perpendicular to path) --------
fn draw_row_normal_offset(canvas: &Canvas, path: &Path, _col: usize) {
    let mut m = PathMeasure::new(path, false, None);
    let len = m.length();
    let n_offset = 16.0_f32; // normal displacement in px
    let fractions = [0.0_f32, 0.25, 0.5, 0.75, 1.0];
    for u in fractions {
        let d = u * len;
        if let Some((p, t)) = m.pos_tan(d.min(len)) {
            // Left normal: n = (-ty, tx)
            let nx = -t.y;
            let ny = t.x;
            let offset_p = Point::new(p.x + nx * n_offset, p.y + ny * n_offset);
            draw_circle(canvas, offset_p, Color::from_rgb(40, 170, 80), true);
            // Also draw a faint line from path to offset marker
            let mut lp = stroke_paint(Color::from_rgb(180, 220, 180));
            lp.set_stroke_width(1.0);
            canvas.draw_line(p, offset_p, &lp);
        }
    }
}

// --- Row 8: Tangent offset (arrow pulled back from endpoint) ---------------
fn draw_row_tangent_offset(canvas: &Canvas, path: &Path, _col: usize) {
    let mut m = PathMeasure::new(path, false, None);
    let len = m.length();
    let pullback = M * 0.8; // tangent offset in px (arrow pulled back)

    // Start: place arrow at ℓ = pullback instead of ℓ = 0
    if let Some((p, t)) = m.pos_tan(pullback.min(len)) {
        draw_arrow_filled(canvas, p, tangent_angle(&t) + PI, Color::from_rgb(180, 60, 180));
    }
    // End: place arrow at ℓ = L - pullback instead of ℓ = L
    if let Some((p, t)) = m.pos_tan((len - pullback).max(0.0)) {
        draw_arrow_filled(canvas, p, tangent_angle(&t), Color::from_rgb(180, 60, 180));
    }
    // Draw faint dots at actual endpoints for comparison
    if let Some((p, _)) = m.pos_tan(0.0) {
        draw_circle(canvas, p, Color::from_rgb(200, 200, 200), false);
    }
    if let Some((p, _)) = m.pos_tan(len) {
        draw_circle(canvas, p, Color::from_rgb(200, 200, 200), false);
    }
}

// ===========================================================================
// Marker primitives
// ===========================================================================

fn tangent_angle(t: &Point) -> f32 {
    t.y.atan2(t.x)
}

fn draw_arrow_filled(canvas: &Canvas, pos: Point, angle: f32, color: Color) {
    let s = M;
    canvas.save();
    canvas.translate(pos);
    canvas.rotate(angle * 180.0 / PI, None);
    let mut b = PathBuilder::new();
    b.move_to((0.0, 0.0));
    b.line_to((-s, -s * 0.45));
    b.line_to((-s, s * 0.45));
    b.close();
    canvas.draw_path(&b.detach(), &fill_paint(color));
    canvas.restore();
}

fn draw_diamond(canvas: &Canvas, pos: Point, angle: f32, color: Color) {
    let s = M * 0.55;
    canvas.save();
    canvas.translate(pos);
    canvas.rotate(angle * 180.0 / PI, None);
    let mut b = PathBuilder::new();
    b.move_to((0.0, 0.0));
    b.line_to((-s, -s));
    b.line_to((-s * 2.0, 0.0));
    b.line_to((-s, s));
    b.close();
    canvas.draw_path(&b.detach(), &fill_paint(color));
    canvas.restore();
}

fn draw_circle(canvas: &Canvas, pos: Point, color: Color, filled: bool) {
    let r = M * 0.4;
    if filled {
        canvas.draw_circle(pos, r, &fill_paint(color));
    } else {
        let mut p = stroke_paint(color);
        p.set_stroke_width(STROKE_W);
        canvas.draw_circle(pos, r, &p);
    }
}

fn draw_square(canvas: &Canvas, pos: Point, angle: f32, color: Color) {
    let s = M * 0.4;
    canvas.save();
    canvas.translate(pos);
    canvas.rotate(angle * 180.0 / PI, None);
    let rect = skia_safe::Rect::from_xywh(-s, -s, s * 2.0, s * 2.0);
    canvas.draw_rect(rect, &fill_paint(color));
    canvas.restore();
}

// ===========================================================================
// Paint helpers
// ===========================================================================

fn stroke_paint(color: Color) -> Paint {
    let mut p = Paint::default();
    p.set_anti_alias(true);
    p.set_style(PaintStyle::Stroke);
    p.set_stroke_width(STROKE_W);
    p.set_color(color);
    p
}

fn fill_paint(color: Color) -> Paint {
    let mut p = Paint::default();
    p.set_anti_alias(true);
    p.set_style(PaintStyle::Fill);
    p.set_color(color);
    p
}

fn text_paint() -> Paint {
    let mut p = Paint::default();
    p.set_anti_alias(true);
    p.set_color(Color::from_rgb(40, 40, 40));
    p
}
