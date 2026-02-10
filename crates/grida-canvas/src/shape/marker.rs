//! Marker geometry builders for stroke decorations.
//!
//! Provides reusable marker shapes (arrow, diamond, triangle, circle) that are
//! drawn at stroke endpoints or vector vertices. Each builder produces geometry
//! in local "marker space" where the tip/center is at the origin and the
//! forward direction is +X. The caller is responsible for translating and
//! rotating the marker to the correct position/orientation on the path.
//!
//! See: `docs/wg/feat-2d/curve-decoration.md`

use crate::cg::StrokeDecoration;
use skia_safe::{Canvas, Paint, PaintStyle, Path, PathBuilder, PathMeasure};
use std::f32::consts::PI;

/// Default scale factor for marker size relative to stroke width.
const MARKER_SCALE: f32 = 3.0;

/// Returns marker geometry in local marker space, if the decoration has visible geometry.
///
/// - Tip/center is at the origin.
/// - Forward direction is +X axis.
/// - `size` is the base dimension (typically `stroke_width * MARKER_SCALE`).
pub fn marker_path(decoration: StrokeDecoration, size: f32) -> Option<Path> {
    match decoration {
        StrokeDecoration::None => None,
        StrokeDecoration::ArrowOpen => Some(build_arrow_open(size)),
        StrokeDecoration::ArrowFilled => Some(build_arrow_filled(size)),
        StrokeDecoration::DiamondFilled => Some(build_diamond(size)),
        StrokeDecoration::TriangleFilled => Some(build_triangle(size)),
        StrokeDecoration::CircleFilled => Some(build_circle(size)),
    }
}

/// Compute the marker size from stroke width.
pub fn marker_size(stroke_width: f32) -> f32 {
    stroke_width * MARKER_SCALE
}

/// Draw a decoration marker at a given arc-length distance on a path.
///
/// Uses `PathMeasure` to get position + tangent at `distance`, then orients the
/// marker along the tangent.
///
/// - `reverse`: if `true`, flip the tangent 180 degrees (for start-of-path markers
///   that should point outward, matching "auto-start-reverse" semantics).
pub fn draw_decoration_at(
    canvas: &Canvas,
    path_measure: &mut PathMeasure,
    distance: f32,
    decoration: StrokeDecoration,
    stroke_width: f32,
    paint: &Paint,
    reverse: bool,
) {
    let size = marker_size(stroke_width);
    if let Some(marker) = marker_path(decoration, size) {
        if let Some((pos, tangent)) = path_measure.pos_tan(distance) {
            let angle = tangent.y.atan2(tangent.x);
            let flip = if reverse { PI } else { 0.0 };
            canvas.save();
            canvas.translate(pos);
            canvas.rotate((angle + flip) * 180.0 / PI, None);
            canvas.draw_path(&marker, paint);
            canvas.restore();
        }
    }
}

/// Draw start and end decorations on a path in one call.
///
/// When a decoration is `None`, the corresponding endpoint is skipped.
/// The `stroke_paint` should be a fill-style paint derived from the stroke color.
pub fn draw_endpoint_decorations(
    canvas: &Canvas,
    path: &Path,
    start: StrokeDecoration,
    end: StrokeDecoration,
    stroke_width: f32,
    stroke_paint: &Paint,
) {
    if !start.has_marker() && !end.has_marker() {
        return;
    }

    let mut measure = PathMeasure::new(path, false, None);
    let length = measure.length();

    // Derive a fill paint from the stroke paint
    let mut fill = stroke_paint.clone();
    fill.set_style(PaintStyle::Fill);

    if start.has_marker() {
        draw_decoration_at(canvas, &mut measure, 0.0, start, stroke_width, &fill, true);
    }
    if end.has_marker() {
        draw_decoration_at(
            canvas,
            &mut measure,
            length,
            end,
            stroke_width,
            &fill,
            false,
        );
    }
}

// ---------------------------------------------------------------------------
// Private shape builders
// ---------------------------------------------------------------------------

/// Filled triangular arrowhead pointing in the +X direction.
/// Tip at origin, base at -size along X.
fn build_arrow_filled(size: f32) -> Path {
    let s = size;
    let mut b = PathBuilder::new();
    b.move_to((0.0, 0.0));
    b.line_to((-s, -s * 0.45));
    b.line_to((-s, s * 0.45));
    b.close();
    b.detach()
}

/// Open arrow (chevron ">") pointing in the +X direction.
/// Tip at origin, arms extend to -size along X.
fn build_arrow_open(size: f32) -> Path {
    let s = size;
    let mut b = PathBuilder::new();
    b.move_to((-s, -s * 0.45));
    b.line_to((0.0, 0.0));
    b.line_to((-s, s * 0.45));
    // Not closed — open stroke shape
    b.detach()
}

/// Filled diamond shape centered at origin.
fn build_diamond(size: f32) -> Path {
    let s = size * 0.55;
    let mut b = PathBuilder::new();
    b.move_to((s, 0.0));
    b.line_to((0.0, -s));
    b.line_to((-s, 0.0));
    b.line_to((0.0, s));
    b.close();
    b.detach()
}

/// Filled equilateral triangle pointing in the +X direction.
/// Centered at origin.
fn build_triangle(size: f32) -> Path {
    let s = size * 0.5;
    let mut b = PathBuilder::new();
    b.move_to((s, 0.0));
    b.line_to((-s * 0.5, -s * 0.866));
    b.line_to((-s * 0.5, s * 0.866));
    b.close();
    b.detach()
}

/// Filled circle centered at origin.
fn build_circle(size: f32) -> Path {
    let r = size * 0.35;
    let rect = skia_safe::Rect::from_xywh(-r, -r, r * 2.0, r * 2.0);
    let mut b = PathBuilder::new();
    b.add_oval(rect, None, None);
    b.detach()
}
