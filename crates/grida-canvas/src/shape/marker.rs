//! Marker geometry builders for stroke decorations.
//!
//! All built-in presets are **terminal** (end-to-end aligned): the marker's
//! forward edge or tip is anchored at the origin (the logical path endpoint).
//! The body extends backward along -X. Forward direction is +X.
//!
//! The low-level API (`MarkerAnchor`, `BuiltinMarker`, `marker_shape`,
//! `draw_marker_shape_at`) allows explicit control over anchor mode for
//! testing and future extensibility.
//!
//! See: `docs/wg/feat-2d/curve-decoration.md`

use crate::cg::StrokeDecoration;
use skia_safe::{Canvas, Paint, PaintStyle, Path, PathBuilder, PathMeasure, Point};
use std::f32::consts::PI;

/// Default scale factor for marker size relative to stroke width.
const MARKER_SCALE: f32 = 3.0;

// ===========================================================================
// Low-level API: MarkerAnchor + BuiltinMarker
// ===========================================================================

/// Anchor alignment mode for a marker shape.
///
/// Determines which point of the marker geometry is placed at the path
/// evaluation point.
///
/// For the built-in modes (`Terminal`, `Centroid`), the geometry is
/// pre-shifted and the cutback is derived automatically from the shape and
/// stroke width.
///
/// For `Offset(t)`, the anchor is placed at a parametric position along the
/// marker's forward axis, giving full control. This is especially useful for:
///
/// - **Non-filled / open shapes** where the automatic cutback solver
///   (which assumes a filled silhouette) cannot determine the correct trim.
/// - **Intentional overshoot or undershoot** — e.g. placing an arrowhead
///   slightly behind the endpoint for visual tuning.
/// - **Asymmetric custom glyphs** whose visual weight center does not
///   coincide with the geometric centroid.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MarkerAnchor {
    /// Forward edge or tip at the evaluation point.
    /// Body extends entirely in the $-\hat{f}$ direction.
    /// Parametric equivalent: `Offset(0.0)`.
    Terminal,

    /// Geometric centroid / center at the evaluation point.
    /// Body extends symmetrically in both $\pm\hat{f}$ directions.
    /// Parametric equivalent: `Offset(0.5)`.
    Centroid,

    /// Arbitrary parametric position along the marker's forward axis.
    ///
    /// `t = 0.0` → forward edge (same as `Terminal`).
    /// `t = 0.5` → center (same as `Centroid`).
    /// `t = 1.0` → back edge.
    ///
    /// Values outside `[0, 1]` are valid and produce overshoot (`t < 0`)
    /// or undershoot (`t > 1`) relative to the marker bounds.
    ///
    /// When using `Offset`, the cutback returned by `marker_shape` is
    /// linearly interpolated between 0 (at `t = 0`) and the full marker
    /// depth (at `t = 1`), clamped to non-negative. Override manually if
    /// the shape requires non-linear cutback.
    Offset(f32),
}

/// Built-in marker presets.
///
/// Each variant is a curated, opinionated marker with tuned proportions
/// for visual balance. The geometry is defined in terminal form (forward
/// tip/edge at origin); `MarkerAnchor` shifts it to the desired position.
///
/// For arbitrary user-defined geometry, use `draw_marker_shape_at` with a
/// raw `Path` instead.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BuiltinMarker {
    ArrowLines,
    TriangleFilled,
    CircleFilled,
    SquareFilled,
    DiamondFilled,
    VerticalBarFilled,
}

/// A fully resolved marker shape: geometry + cutback, ready to draw.
///
/// Combines a `BuiltinMarker` (or custom `Path`) with a `MarkerAnchor`
/// into a concrete, drawable result.
///
/// Construct via [`marker_shape`] (for built-in presets) or directly
/// for user-defined geometry.
#[derive(Debug, Clone)]
pub struct MarkerShape {
    /// The marker geometry in local marker space (+X = forward).
    pub path: Path,
    /// The cutback distance (px) by which the stroke should be trimmed
    /// at the endpoint where this marker is placed.
    pub cutback: f32,
}

/// Build a [`MarkerShape`] from a built-in preset and anchor mode.
///
/// For `Offset(t)`, the terminal-form geometry is translated by
/// `t * depth` along +X, and the cutback is linearly interpolated.
///
/// This is the low-level API; `marker_path` / `cutback_depth` use this
/// internally with `MarkerAnchor::Terminal`.
pub fn marker_shape(
    preset: BuiltinMarker,
    anchor: MarkerAnchor,
    size: f32,
    stroke_width: f32,
) -> MarkerShape {
    let half_sw = stroke_width * 0.5;

    // Resolve anchor to a parametric t ∈ [0, 1] (0 = terminal, 0.5 = centroid, 1 = back edge)
    let t = match anchor {
        MarkerAnchor::Terminal => 0.0_f32,
        MarkerAnchor::Centroid => 0.5,
        MarkerAnchor::Offset(t) => t,
    };

    match preset {
        BuiltinMarker::ArrowLines => {
            let depth = size;
            let path = shift_path(&build_arrow_lines(size), t * depth);
            MarkerShape { path, cutback: stroke_width * 0.5 }
        }
        BuiltinMarker::TriangleFilled => {
            let s = size * 0.8;
            let depth = s * 1.5;
            let half_h = s * 0.866;
            let path = shift_path(&build_triangle_terminal(size), t * depth);
            let terminal_cutback = solve_cutback_triangle(depth, half_h, half_sw);
            MarkerShape { path, cutback: lerp_cutback(terminal_cutback, depth, t) }
        }
        BuiltinMarker::CircleFilled => {
            let r = size * 0.6;
            let depth = r * 2.0;
            let path = shift_path(&build_circle_terminal(size), t * depth);
            let terminal_cutback = solve_cutback_circle(r, half_sw);
            MarkerShape { path, cutback: lerp_cutback(terminal_cutback, depth, t) }
        }
        BuiltinMarker::SquareFilled => {
            let depth = size * 1.2;
            let path = shift_path(&build_square_terminal(size), t * depth);
            MarkerShape { path, cutback: lerp_cutback(depth, depth, t) }
        }
        BuiltinMarker::DiamondFilled => {
            let s = size * 0.85;
            let depth = s * 2.0;
            let path = shift_path(&build_diamond_terminal(size), t * depth);
            let terminal_cutback = solve_cutback_triangle(s, s, half_sw);
            MarkerShape { path, cutback: lerp_cutback(terminal_cutback, depth, t) }
        }
        BuiltinMarker::VerticalBarFilled => {
            let depth = stroke_width;
            let path = shift_path(&build_vertical_bar(stroke_width), t * depth);
            MarkerShape { path, cutback: lerp_cutback(depth, depth, t) }
        }
    }
}

/// Shift a path along the +X axis by `dx`.
///
/// Used to translate terminal-form geometry (anchor at tip) to an arbitrary
/// parametric anchor position.
fn shift_path(path: &Path, dx: f32) -> Path {
    if dx.abs() < f32::EPSILON {
        return path.clone();
    }
    path.with_transform(&skia_safe::Matrix::translate((dx, 0.0)))
}

/// Linearly interpolate cutback from terminal (t=0) to back-edge (t=1).
///
/// At t=0 (terminal), cutback = terminal_cutback (solver-derived).
/// At t=1 (back edge), cutback = full depth.
/// Clamped to non-negative.
fn lerp_cutback(terminal_cutback: f32, depth: f32, t: f32) -> f32 {
    let c = terminal_cutback + t * (depth - terminal_cutback);
    c.max(0.0)
}

/// Draw an arbitrary marker shape at a given arc-length distance on a path.
///
/// This is the low-level drawing function that accepts an explicit `Path`
/// (from `marker_shape` or any user geometry).
pub fn draw_marker_shape_at(
    canvas: &Canvas,
    path_measure: &mut PathMeasure,
    distance: f32,
    marker: &Path,
    paint: &Paint,
    reverse: bool,
) {
    if let Some((pos, tangent)) = path_measure.pos_tan(distance) {
        let angle = tangent.y.atan2(tangent.x);
        let flip = if reverse { PI } else { 0.0 };
        canvas.save();
        canvas.translate(pos);
        canvas.rotate((angle + flip) * 180.0 / PI, None);
        canvas.draw_path(marker, paint);
        canvas.restore();
    }
}

// ===========================================================================
// High-level API (used by the renderer — delegates to low-level)
// ===========================================================================

/// Returns marker geometry in local marker space, if the decoration has visible geometry.
///
/// All presets are terminal-aligned:
/// - Origin `(0, 0)` = forward edge / tip (placed at the path endpoint).
/// - Body extends in the -X direction.
/// - `size` = `stroke_width * MARKER_SCALE`.
pub fn marker_path(decoration: StrokeDecoration, size: f32, stroke_width: f32) -> Option<Path> {
    match decoration {
        StrokeDecoration::None => None,
        StrokeDecoration::ArrowLines => Some(build_arrow_lines(size)),
        StrokeDecoration::VerticalBarFilled => Some(build_vertical_bar(stroke_width)),
        StrokeDecoration::TriangleFilled => Some(build_triangle_terminal(size)),
        StrokeDecoration::CircleFilled => Some(build_circle_terminal(size)),
        StrokeDecoration::SquareFilled => Some(build_square_terminal(size)),
        StrokeDecoration::DiamondFilled => Some(build_diamond_terminal(size)),
    }
}

/// Compute the marker size from stroke width.
pub fn marker_size(stroke_width: f32) -> f32 {
    stroke_width * MARKER_SCALE
}

/// Intrinsic cutback depth for a decoration preset.
///
/// Returns the distance (in absolute px) by which the stroke path should be
/// trimmed at the endpoint where this marker is placed.
///
/// For filled shapes, this is computed by [`solve_cutback`] — the distance
/// from the forward edge where the marker silhouette first clears the stroke
/// half-width. For open/unfilled shapes, cutback is zero.
///
/// Units: absolute pixels.
pub fn cutback_depth(decoration: StrokeDecoration, stroke_width: f32) -> f32 {
    let size = marker_size(stroke_width);
    let half_sw = stroke_width * 0.5;
    match decoration {
        StrokeDecoration::None => 0.0,
        // Arrow lines: open stroked chevron. Cutback by half stroke width
        // so the main stroke butt-joins cleanly with the chevron arms at the tip.
        StrokeDecoration::ArrowLines => stroke_width * 0.5,

        // Triangular shapes: solve via edge slope
        StrokeDecoration::TriangleFilled => {
            let s = size * 0.8;
            solve_cutback_triangle(s * 1.5, s * 0.866, half_sw)
        }

        // Circle: forward edge at origin, radius r
        StrokeDecoration::CircleFilled => {
            let r = size * 0.6;
            solve_cutback_circle(r, half_sw)
        }

        // Diamond: forward vertex at origin, side edges go to (-s, ±s)
        StrokeDecoration::DiamondFilled => {
            let s = size * 0.85;
            solve_cutback_triangle(s, s, half_sw)
        }

        // Rectangular shapes: full depth
        StrokeDecoration::SquareFilled => size * 1.2,
        StrokeDecoration::VerticalBarFilled => stroke_width,
    }
}

// ===========================================================================
// Cutback solver functions
// ===========================================================================

/// Solve cutback for a triangular/pointed shape.
///
/// Given a shape whose forward edge meets at a point (tip at origin) with
/// straight edges going from `(0, 0)` to `(-depth, ±half_height)`:
///
/// The stroke has half-width `half_sw`. The cutback is the x-distance from
/// the tip where the edge line crosses `y = half_sw`:
///
/// ```text
///   cutback = depth × (half_sw / half_height)
/// ```
///
/// This is clamped to `depth` (if the stroke is wider than the shape,
/// the entire shape is consumed).
fn solve_cutback_triangle(depth: f32, half_height: f32, half_sw: f32) -> f32 {
    if half_height <= 0.0 {
        return depth;
    }
    (depth * half_sw / half_height).min(depth)
}

/// Solve cutback for a circle with forward edge at origin.
///
/// Circle center is at `(-r, 0)`, forward edge at `(0, 0)`.
/// The stroke half-width `half_sw` meets the circle at:
///
/// ```text
///   x = -r + sqrt(r² - half_sw²)
///   cutback = -x = r - sqrt(r² - half_sw²)
/// ```
///
/// If `half_sw >= r`, the stroke is wider than the circle — return full diameter.
fn solve_cutback_circle(r: f32, half_sw: f32) -> f32 {
    if half_sw >= r {
        return r * 2.0;
    }
    r - (r * r - half_sw * half_sw).sqrt()
}

/// Trim an open path to the sub-path `[start_trim, length - end_trim]`.
///
/// Uses Skia `PathMeasure::get_segment` to extract the trimmed portion.
/// Returns the original path if trimming would collapse it to zero length.
pub fn trim_path(path: &Path, start_trim: f32, end_trim: f32) -> Path {
    let mut measure = PathMeasure::new(path, false, None);
    let length = measure.length();
    let start = start_trim.min(length);
    let stop = (length - end_trim).max(start);
    if stop <= start {
        return path.clone();
    }
    let mut builder = PathBuilder::new();
    if measure.get_segment(start, stop, &mut builder, true) {
        builder.detach()
    } else {
        path.clone()
    }
}

/// Derive the correct Skia paint for a decoration.
///
/// - **Filled** shapes use `PaintStyle::Fill`.
/// - **Open** shapes (e.g. `ArrowLines`) use `PaintStyle::Stroke` with the
///   same stroke width as the path, producing visible line strokes.
fn decoration_paint(
    base_paint: &Paint,
    decoration: StrokeDecoration,
    stroke_width: f32,
) -> Paint {
    let mut paint = base_paint.clone();
    if decoration.is_open() {
        paint.set_style(PaintStyle::Stroke);
        paint.set_stroke_width(stroke_width);
        paint.set_stroke_cap(skia_safe::PaintCap::Butt);
        paint.set_stroke_join(skia_safe::PaintJoin::Miter);
    } else {
        paint.set_style(PaintStyle::Fill);
    }
    paint
}

/// Draw a decoration marker at a given arc-length distance on a path.
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
    if let Some(marker) = marker_path(decoration, size, stroke_width) {
        if let Some((pos, tangent)) = path_measure.pos_tan(distance) {
            let angle = tangent.y.atan2(tangent.x);
            let flip = if reverse { PI } else { 0.0 };
            let dp = decoration_paint(paint, decoration, stroke_width);
            canvas.save();
            canvas.translate(pos);
            canvas.rotate((angle + flip) * 180.0 / PI, None);
            canvas.draw_path(&marker, &dp);
            canvas.restore();
        }
    }
}

/// Draw start and end decorations on a path in one call.
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

    if start.has_marker() {
        draw_decoration_at(
            canvas,
            &mut measure,
            0.0,
            start,
            stroke_width,
            stroke_paint,
            true,
        );
    }
    if end.has_marker() {
        draw_decoration_at(
            canvas,
            &mut measure,
            length,
            end,
            stroke_width,
            stroke_paint,
            false,
        );
    }
}

// ===========================================================================
// Private shape builders
//
// Naming: build_<shape>_terminal  → forward edge/tip at origin
//         build_<shape>_node      → center/centroid at origin
// ===========================================================================

// --- Arrow lines (right-triangle base shape, open, not closed) ---
//
// The two arms form a right angle (90°) at the tip.
// Each arm is at 45° from the forward axis: arms go to (-s, ±s).

fn build_arrow_lines(size: f32) -> Path {
    let s = size;
    let mut b = PathBuilder::new();
    b.move_to((-s, -s));
    b.line_to((0.0, 0.0));
    b.line_to((-s, s));
    // Not closed — open stroke shape
    b.detach()
}

// --- Triangle ---
// Scale tuned so the perpendicular extent is ~1.2 * size (vs arrow_lines' 2 * size).

fn build_triangle_terminal(size: f32) -> Path {
    let s = size * 0.8;
    let mut b = PathBuilder::new();
    b.move_to((0.0, 0.0));
    b.line_to((-s * 1.5, -s * 0.866));
    b.line_to((-s * 1.5, s * 0.866));
    b.close();
    b.detach()
}

// --- Circle ---
// Radius = size * 0.6 → diameter = 1.2 * size.

fn build_circle_terminal(size: f32) -> Path {
    let r = size * 0.6;
    let rect = skia_safe::Rect::from_xywh(-r * 2.0, -r, r * 2.0, r * 2.0);
    let mut b = PathBuilder::new();
    b.add_oval(rect, None, None);
    b.detach()
}

// --- Square ---
// Side = 1.2 * size.

fn build_square_terminal(size: f32) -> Path {
    let half = size * 0.6;
    let side = half * 2.0;
    let mut b = PathBuilder::new();
    b.move_to((0.0, -half));
    b.line_to((-side, -half));
    b.line_to((-side, half));
    b.line_to((0.0, half));
    b.close();
    b.detach()
}

// --- Diamond ---
// Half-diagonal = size * 0.85 → full height = 1.7 * size.

fn build_diamond_terminal(size: f32) -> Path {
    let s = size * 0.85;
    let mut b = PathBuilder::new();
    b.move_to((0.0, 0.0));
    b.line_to((-s, -s));
    b.line_to((-s * 2.0, 0.0));
    b.line_to((-s, s));
    b.close();
    b.detach()
}

// --- Vertical bar ---
// Height = 5x stroke_width (was 4x).

fn build_vertical_bar(stroke_width: f32) -> Path {
    let w = stroke_width;
    let h = stroke_width * 5.0;
    let half_h = h * 0.5;
    let mut b = PathBuilder::new();
    b.move_to((0.0, -half_h));
    b.line_to((-w, -half_h));
    b.line_to((-w, half_h));
    b.line_to((0.0, half_h));
    b.close();
    b.detach()
}
