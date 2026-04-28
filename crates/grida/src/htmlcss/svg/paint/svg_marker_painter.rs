//! `SvgMarkerPainter` — `marker-start` / `marker-mid` / `marker-end`.
//!
//! Two-pass algorithm modelled on Blink's `SVGMarkerDataBuilder` /
//! `SVGShapePainter::PaintMarkers`:
//!
//! 1. Walk the shape's `Path` once, emitting one [`MarkerPosition`] per
//!    vertex with origin + bisecting tangent angle. Start markers are
//!    the very first vertex, end markers are the very last, all
//!    others are mid markers.
//! 2. For each position, resolve the matching `marker-*` URL, build
//!    the placement transform `Translate(origin) · Rotate(angle) ·
//!    Scale(unit) · Translate(-mapped_refXY)` (post-multiplication
//!    order, applied right-to-left to points), and paint the marker
//!    subtree under it.
//!
//! Blink anchors:
//! - `core/layout/svg/svg_marker_data.{h,cc}` — position iteration,
//!   bisecting-angle math, arc tangent preservation.
//! - `core/layout/svg/layout_svg_resource_marker.cc:109-137` —
//!   `MarkerTransformation` composition order.
//! - `core/paint/svg_shape_painter.cc:256-323` — paint loop and
//!   overflow clip handling.

use csscascade::dom::{DemoNode, DemoNodeData, NodeId};
use skia_safe::{path::Verb, Canvas, Matrix, Path, Point, Rect};

use super::super::dom::attrs::{
    parse_length_px, parse_preserve_aspect_ratio, parse_viewbox, AlignX, AlignY, Fit,
    PreserveAspectRatio,
};
use super::super::dom::element::{get_attr, ElementKind};
use super::super::resources::svg_resources::parse_url_ref;
use super::scoped_svg_paint_state::{PaintCtx, MAX_MARKER_DEPTH};
use super::svg_container_painter;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MarkerKind {
    Start,
    Mid,
    End,
}

#[derive(Debug, Clone, Copy)]
struct MarkerPosition {
    origin: Point,
    /// Bisecting angle in radians. Degenerate vertices (zero-length
    /// segments) emit `0.0` — same as Blink's `SlopeAngleRadians()`
    /// fallback when both tangents are zero.
    angle: f32,
    kind: MarkerKind,
}

/// Walk the path's verbs and emit one position per vertex. Skia's
/// `Path::iter()` already converts arcs (`A`) to cubics/conics during
/// path build, so we don't need Blink's arc-decomposition helper.
fn collect_positions(path: &Path) -> Vec<MarkerPosition> {
    // Per Blink (`svg_marker_data.cc:251-286`): track the previous
    // segment's outgoing slope, the start of the current subpath
    // (for `Z` bisecting), and the index of the start-marker for
    // the current subpath (so `Z` can backpatch its angle).
    let mut out: Vec<MarkerPosition> = Vec::new();
    let mut subpath_start: Option<Point> = None;
    let mut subpath_start_idx: Option<usize> = None;
    let mut prev_pt: Option<Point> = None;
    let mut prev_out_slope: Option<(f32, f32)> = None;
    let mut last_moveto_out_slope: Option<(f32, f32)> = None;

    let iter = skia_safe::path::Iter::new(path, false);
    for (verb, pts) in iter {
        match verb {
            Verb::Move => {
                let p = pts[0];
                // First emit a position for the moveto. Angle is
                // backpatched when we see the first segment of this
                // subpath (its incoming `out_slope` becomes our
                // angle) or when `Z` closes the subpath.
                let idx = out.len();
                out.push(MarkerPosition {
                    origin: p,
                    angle: 0.0,
                    kind: MarkerKind::Mid,
                });
                subpath_start = Some(p);
                subpath_start_idx = Some(idx);
                prev_pt = Some(p);
                // Reset the previous-segment slope; the next segment
                // is the start of a new subpath.
                prev_out_slope = None;
                last_moveto_out_slope = None;
            }
            Verb::Line => {
                let p = pts[1];
                let p0 = prev_pt.unwrap_or(pts[0]);
                let in_slope = (p.x - p0.x, p.y - p0.y);
                let out_slope = in_slope; // line: in == out
                backpatch_prev_angle(&mut out, prev_out_slope, in_slope);
                if last_moveto_out_slope.is_none() {
                    // The very first segment of this subpath sets the
                    // moveto's outgoing slope (used by `Z` later).
                    last_moveto_out_slope = Some(out_slope);
                    if let Some(sidx) = subpath_start_idx {
                        out[sidx].angle = slope_to_angle(out_slope);
                    }
                }
                out.push(MarkerPosition {
                    origin: p,
                    angle: 0.0,
                    kind: MarkerKind::Mid,
                });
                prev_out_slope = Some(out_slope);
                prev_pt = Some(p);
            }
            Verb::Quad => {
                let p0 = prev_pt.unwrap_or(pts[0]);
                let c = pts[1];
                let p2 = pts[2];
                let in_slope = sub(c, p0);
                let out_slope = sub(p2, c);
                let (in_slope, out_slope) = fixup_degenerate_quad(p0, c, p2, in_slope, out_slope);
                backpatch_prev_angle(&mut out, prev_out_slope, in_slope);
                if last_moveto_out_slope.is_none() {
                    last_moveto_out_slope = Some(in_slope);
                    if let Some(sidx) = subpath_start_idx {
                        out[sidx].angle = slope_to_angle(in_slope);
                    }
                }
                out.push(MarkerPosition {
                    origin: p2,
                    angle: 0.0,
                    kind: MarkerKind::Mid,
                });
                prev_out_slope = Some(out_slope);
                prev_pt = Some(p2);
            }
            Verb::Conic => {
                // Treat as quadratic for tangent purposes — the
                // weight only changes the curve shape, not the
                // endpoint tangent directions (`p1-p0` and `p2-p1`).
                let p0 = prev_pt.unwrap_or(pts[0]);
                let c = pts[1];
                let p2 = pts[2];
                let in_slope = sub(c, p0);
                let out_slope = sub(p2, c);
                let (in_slope, out_slope) = fixup_degenerate_quad(p0, c, p2, in_slope, out_slope);
                backpatch_prev_angle(&mut out, prev_out_slope, in_slope);
                if last_moveto_out_slope.is_none() {
                    last_moveto_out_slope = Some(in_slope);
                    if let Some(sidx) = subpath_start_idx {
                        out[sidx].angle = slope_to_angle(in_slope);
                    }
                }
                out.push(MarkerPosition {
                    origin: p2,
                    angle: 0.0,
                    kind: MarkerKind::Mid,
                });
                prev_out_slope = Some(out_slope);
                prev_pt = Some(p2);
            }
            Verb::Cubic => {
                let p0 = prev_pt.unwrap_or(pts[0]);
                let p1 = pts[1];
                let p2 = pts[2];
                let p3 = pts[3];
                // Blink (`svg_marker_data.cc:215-223`):
                //   start_tangent = p1 - p0 (or p2 - p0 if degenerate)
                //   end_tangent   = p3 - p2 (or p3 - p1 if degenerate)
                let mut in_slope = sub(p1, p0);
                if is_zero(in_slope) {
                    in_slope = sub(p2, p0);
                }
                let mut out_slope = sub(p3, p2);
                if is_zero(out_slope) {
                    out_slope = sub(p3, p1);
                }
                backpatch_prev_angle(&mut out, prev_out_slope, in_slope);
                if last_moveto_out_slope.is_none() {
                    last_moveto_out_slope = Some(in_slope);
                    if let Some(sidx) = subpath_start_idx {
                        out[sidx].angle = slope_to_angle(in_slope);
                    }
                }
                out.push(MarkerPosition {
                    origin: p3,
                    angle: 0.0,
                    kind: MarkerKind::Mid,
                });
                prev_out_slope = Some(out_slope);
                prev_pt = Some(p3);
            }
            Verb::Close => {
                // Z emits a position at the subpath start. Angle
                // bisects the closing-edge slope with the
                // subpath-start's outgoing slope (Blink
                // `svg_marker_data.cc:184-195`). We also backpatch
                // the moveto's marker angle so it bisects the close
                // and the first outgoing segment.
                let Some(start) = subpath_start else {
                    continue;
                };
                let p0 = prev_pt.unwrap_or(start);
                let in_slope = sub(start, p0);
                backpatch_prev_angle(&mut out, prev_out_slope, in_slope);
                let close_angle = match last_moveto_out_slope {
                    Some(out_slope) => bisecting_angle(in_slope, out_slope),
                    None => slope_to_angle(in_slope),
                };
                out.push(MarkerPosition {
                    origin: start,
                    angle: close_angle,
                    kind: MarkerKind::Mid,
                });
                // Backpatch the subpath's moveto marker.
                if let (Some(sidx), Some(out_slope)) = (subpath_start_idx, last_moveto_out_slope) {
                    out[sidx].angle = bisecting_angle(in_slope, out_slope);
                }
                prev_out_slope = Some(in_slope);
                prev_pt = Some(start);
            }
            Verb::Done => break,
        }
    }
    if let Some(first) = out.first_mut() {
        first.kind = MarkerKind::Start;
    }
    if let Some(last) = out.last_mut() {
        last.kind = MarkerKind::End;
    }
    out
}

/// Backpatch the previous position's angle once we know the next
/// segment's incoming slope. `bisecting` averages the prev outgoing
/// slope with the next incoming slope.
fn backpatch_prev_angle(
    out: &mut [MarkerPosition],
    prev_out_slope: Option<(f32, f32)>,
    next_in_slope: (f32, f32),
) {
    let Some(prev) = out.last_mut() else {
        return;
    };
    match prev_out_slope {
        Some(prev_out) => prev.angle = bisecting_angle(prev_out, next_in_slope),
        None => prev.angle = slope_to_angle(next_in_slope),
    }
}

fn sub(a: Point, b: Point) -> (f32, f32) {
    (a.x - b.x, a.y - b.y)
}

fn is_zero(s: (f32, f32)) -> bool {
    s.0 == 0.0 && s.1 == 0.0
}

fn fixup_degenerate_quad(
    p0: Point,
    _c: Point,
    p2: Point,
    in_slope: (f32, f32),
    out_slope: (f32, f32),
) -> ((f32, f32), (f32, f32)) {
    // If the control point coincides with an endpoint, both tangents
    // collapse — fall back to the chord direction `p2 - p0`.
    let chord = sub(p2, p0);
    let in_s = if is_zero(in_slope) { chord } else { in_slope };
    let out_s = if is_zero(out_slope) { chord } else { out_slope };
    (in_s, out_s)
}

fn slope_to_angle(s: (f32, f32)) -> f32 {
    if is_zero(s) {
        0.0
    } else {
        s.1.atan2(s.0)
    }
}

fn bisecting_angle(in_s: (f32, f32), out_s: (f32, f32)) -> f32 {
    // Blink `svg_marker_data.cc:151-164` — average the two slope
    // angles, with a ±π wrap correction so 350° + 10° → 0°
    // (not 180°).
    let a_in = slope_to_angle(in_s);
    let a_out = slope_to_angle(out_s);
    let mut delta = a_out - a_in;
    if delta > std::f32::consts::PI {
        delta -= 2.0 * std::f32::consts::PI;
    } else if delta < -std::f32::consts::PI {
        delta += 2.0 * std::f32::consts::PI;
    }
    a_in + delta * 0.5
}

// ─── Marker resolution and painting ───────────────────────────────────

/// Read inheritable `marker-start` / `marker-mid` / `marker-end` (or
/// the `marker` shorthand). SVG 2 §11.6.1 marks all four as
/// inherited; we walk ancestors looking for the first explicit value
/// that isn't `none`.
fn read_marker_url(ctx: &PaintCtx<'_>, node: &DemoNode, prop: &str) -> Option<String> {
    fn read(node: &DemoNode, name: &str) -> Option<String> {
        if let Some(v) = get_attr(node, name) {
            let v = v.trim();
            if !v.is_empty() {
                return Some(v.to_string());
            }
        }
        if let Some(style) = get_attr(node, "style") {
            for decl in style.split(';') {
                if let Some((k, v)) = decl.split_once(':') {
                    if k.trim().eq_ignore_ascii_case(name) {
                        let v = v.trim();
                        if !v.is_empty() {
                            return Some(v.to_string());
                        }
                    }
                }
            }
        }
        None
    }
    // Try the leaf node first, then walk up via `parent` like other
    // inherited-property helpers in this crate.
    if let Some(v) = read(node, prop).or_else(|| read(node, "marker")) {
        if v == "none" {
            return None;
        }
        return Some(v);
    }
    let mut current = node.parent;
    while let Some(id) = current {
        let n = ctx.dom.node(id);
        if let Some(v) = read(n, prop).or_else(|| read(n, "marker")) {
            if v == "none" {
                return None;
            }
            return Some(v);
        }
        current = n.parent;
    }
    None
}

pub fn paint(canvas: &Canvas, ctx: &PaintCtx<'_>, node: &DemoNode, path: &Path) {
    if ctx.marker_depth >= MAX_MARKER_DEPTH {
        return;
    }
    let start_url = read_marker_url(ctx, node, "marker-start");
    let mid_url = read_marker_url(ctx, node, "marker-mid");
    let end_url = read_marker_url(ctx, node, "marker-end");
    if start_url.is_none() && mid_url.is_none() && end_url.is_none() {
        return;
    }

    let positions = collect_positions(path);
    if positions.is_empty() {
        return;
    }

    let stroke_width = get_attr(node, "stroke-width")
        .and_then(parse_length_px)
        .unwrap_or(1.0);

    for pos in &positions {
        let url = match pos.kind {
            MarkerKind::Start => &start_url,
            MarkerKind::Mid => &mid_url,
            MarkerKind::End => &end_url,
        };
        let Some(url) = url else { continue };
        let Some(id) = parse_url_ref(url) else {
            continue;
        };
        let Some(target) = ctx.resources.lookup(id) else {
            continue;
        };
        let target_node = ctx.dom.node(target);
        let DemoNodeData::Element(d) = &target_node.data else {
            continue;
        };
        if ElementKind::from_local_name(d.name.local.as_ref()) != ElementKind::Marker {
            continue;
        }
        paint_one(canvas, ctx, target, target_node, pos, stroke_width);
    }
}

fn paint_one(
    canvas: &Canvas,
    ctx: &PaintCtx<'_>,
    marker_id: NodeId,
    marker_node: &DemoNode,
    pos: &MarkerPosition,
    stroke_width: f32,
) {
    let marker_width = get_attr(marker_node, "markerWidth")
        .and_then(parse_length_px)
        .unwrap_or(3.0);
    let marker_height = get_attr(marker_node, "markerHeight")
        .and_then(parse_length_px)
        .unwrap_or(3.0);
    let ref_x = get_attr(marker_node, "refX")
        .and_then(parse_length_px)
        .unwrap_or(0.0);
    let ref_y = get_attr(marker_node, "refY")
        .and_then(parse_length_px)
        .unwrap_or(0.0);

    // markerUnits: `strokeWidth` (default) scales by the stroke
    // width; `userSpaceOnUse` keeps the marker in user-space units.
    let units = get_attr(marker_node, "markerUnits")
        .map(str::trim)
        .unwrap_or("strokeWidth");
    let unit_scale = if units.eq_ignore_ascii_case("userSpaceOnUse") {
        1.0
    } else {
        stroke_width
    };

    // orient: `auto` | `auto-start-reverse` | `<angle>` | numeric.
    let orient_raw = get_attr(marker_node, "orient").map(str::trim);
    let angle_rad = match orient_raw {
        Some("auto") => pos.angle,
        Some("auto-start-reverse") => {
            if pos.kind == MarkerKind::Start {
                pos.angle + std::f32::consts::PI
            } else {
                pos.angle
            }
        }
        Some(s) => parse_orient_angle(s).unwrap_or(0.0),
        None => 0.0,
    };

    // viewBox / preserveAspectRatio set up the marker-content →
    // marker-viewport transform. Default viewport size = (markerWidth,
    // markerHeight); default viewBox = same as viewport (identity).
    let viewport = Rect::from_xywh(0.0, 0.0, marker_width, marker_height);
    let viewbox = get_attr(marker_node, "viewBox").and_then(parse_viewbox);
    let par = get_attr(marker_node, "preserveAspectRatio")
        .map(parse_preserve_aspect_ratio)
        .unwrap_or_default();
    let viewbox_transform = match viewbox {
        Some((vx, vy, vw, vh)) if vw > 0.0 && vh > 0.0 => {
            viewbox_to_viewport_matrix(viewport, (vx, vy, vw, vh), par)
        }
        _ => Matrix::new_identity(),
    };

    // Per Blink (`layout_svg_resource_marker.cc:131-135`): refX/refY
    // are interpreted in the marker's *content* space (post-viewBox).
    // Map them through the viewBox transform before subtracting.
    let mapped_ref = viewbox_transform.map_point(Point::new(ref_x, ref_y));

    // Compose: Translate(origin) · Rotate(angle) · Scale(unit) ·
    // Translate(-mapped_ref). Build right-to-left because Skia
    // pre-multiplies.
    let mut transform = Matrix::translate((pos.origin.x, pos.origin.y));
    transform.pre_concat(&Matrix::rotate_rad(angle_rad));
    transform.pre_concat(&Matrix::scale((unit_scale, unit_scale)));
    transform.pre_translate((-mapped_ref.x, -mapped_ref.y));

    let restore = canvas.save();
    canvas.concat(&transform);

    // overflow: default `hidden` (UA stylesheet). `overflow: visible`
    // suppresses the clip to the marker viewport.
    let overflow_visible = get_attr(marker_node, "overflow")
        .map(str::trim)
        .map(|v| v.eq_ignore_ascii_case("visible") || v.eq_ignore_ascii_case("auto"))
        .unwrap_or(false);
    if !overflow_visible {
        canvas.clip_rect(viewport, skia_safe::ClipOp::Intersect, true);
    }

    // Apply the viewBox transform inside the placement, then paint
    // the marker's children.
    if let Some((_, _, _, _)) = viewbox {
        canvas.concat(&viewbox_transform);
    }

    let deeper = ctx.with_deeper_marker();
    for &child_id in &marker_node.children {
        svg_container_painter::paint_node(canvas, &deeper, child_id);
    }

    canvas.restore_to_count(restore);
    let _ = marker_id;
}

fn parse_orient_angle(s: &str) -> Option<f32> {
    let s = s.trim();
    let (num, factor) = if let Some(p) = s.strip_suffix("deg") {
        (p, std::f32::consts::PI / 180.0)
    } else if let Some(p) = s.strip_suffix("rad") {
        (p, 1.0)
    } else if let Some(p) = s.strip_suffix("grad") {
        (p, std::f32::consts::PI / 200.0)
    } else if let Some(p) = s.strip_suffix("turn") {
        (p, std::f32::consts::TAU)
    } else {
        // Bare number → degrees per SVG 2 §11.6.2.
        (s, std::f32::consts::PI / 180.0)
    };
    num.trim().parse::<f32>().ok().map(|v| v * factor)
}

fn viewbox_to_viewport_matrix(
    viewport: Rect,
    viewbox: (f32, f32, f32, f32),
    par: PreserveAspectRatio,
) -> Matrix {
    let (vx, vy, vw, vh) = viewbox;
    let scale_x = viewport.width() / vw;
    let scale_y = viewport.height() / vh;
    let (sx, sy) = match par.fit {
        Fit::None => (scale_x, scale_y),
        Fit::Meet => {
            let s = scale_x.min(scale_y);
            (s, s)
        }
        Fit::Slice => {
            let s = scale_x.max(scale_y);
            (s, s)
        }
    };
    let dx = match par.align_x {
        AlignX::Min => 0.0,
        AlignX::Mid => (viewport.width() - vw * sx) / 2.0,
        AlignX::Max => viewport.width() - vw * sx,
    };
    let dy = match par.align_y {
        AlignY::Min => 0.0,
        AlignY::Mid => (viewport.height() - vh * sy) / 2.0,
        AlignY::Max => viewport.height() - vh * sy,
    };
    let mut m = Matrix::translate((viewport.left + dx, viewport.top + dy));
    m.pre_concat(&Matrix::scale((sx, sy)));
    m.pre_translate((-vx, -vy));
    m
}
