use crate::cg::prelude::*;
use skia_safe::{
    path_effect::PathEffect, stroke_rec::InitStyle, Path, PathOp, RRect, Rect, StrokeRec, Vector,
};

/// Builds an RRect from a Skia Rect and RectangularCornerRadius.
fn build_rrect(rect: Rect, radii: &RectangularCornerRadius) -> RRect {
    RRect::new_rect_radii(
        rect,
        &[
            Vector::new(radii.tl.rx, radii.tl.ry),
            Vector::new(radii.tr.rx, radii.tr.ry),
            Vector::new(radii.br.rx, radii.br.ry),
            Vector::new(radii.bl.rx, radii.bl.ry),
        ],
    )
}

/// Expands a rectangle by half of each stroke width.
fn expand_rect_by_half_widths(rect: Rect, w: &RectangularStrokeWidth) -> Rect {
    Rect::from_ltrb(
        rect.left - w.stroke_left_width / 2.0,
        rect.top - w.stroke_top_width / 2.0,
        rect.right + w.stroke_right_width / 2.0,
        rect.bottom + w.stroke_bottom_width / 2.0,
    )
}

/// Expands a rectangle by the full stroke width on each side.
fn expand_rect_by_full_widths(rect: Rect, w: &RectangularStrokeWidth) -> Rect {
    Rect::from_ltrb(
        rect.left - w.stroke_left_width,
        rect.top - w.stroke_top_width,
        rect.right + w.stroke_right_width,
        rect.bottom + w.stroke_bottom_width,
    )
}

/// Shrinks a rectangle by half of each stroke width.
fn shrink_rect_by_half_widths(rect: Rect, w: &RectangularStrokeWidth) -> Rect {
    Rect::from_ltrb(
        rect.left + w.stroke_left_width / 2.0,
        rect.top + w.stroke_top_width / 2.0,
        rect.right - w.stroke_right_width / 2.0,
        rect.bottom - w.stroke_bottom_width / 2.0,
    )
}

/// Computes inner rect by insetting the full stroke width on each side.
fn compute_inner_rect_from_outer(outer: Rect, w: &RectangularStrokeWidth) -> Rect {
    Rect::from_ltrb(
        outer.left + w.stroke_left_width,
        outer.top + w.stroke_top_width,
        outer.right - w.stroke_right_width,
        outer.bottom - w.stroke_bottom_width,
    )
}

/// Expands corner radii by half of each adjacent stroke width.
fn expand_radii_by_half_widths(
    radii: &RectangularCornerRadius,
    w: &RectangularStrokeWidth,
) -> RectangularCornerRadius {
    RectangularCornerRadius {
        tl: Radius {
            rx: radii.tl.rx + w.stroke_left_width / 2.0,
            ry: radii.tl.ry + w.stroke_top_width / 2.0,
        },
        tr: Radius {
            rx: radii.tr.rx + w.stroke_right_width / 2.0,
            ry: radii.tr.ry + w.stroke_top_width / 2.0,
        },
        br: Radius {
            rx: radii.br.rx + w.stroke_right_width / 2.0,
            ry: radii.br.ry + w.stroke_bottom_width / 2.0,
        },
        bl: Radius {
            rx: radii.bl.rx + w.stroke_left_width / 2.0,
            ry: radii.bl.ry + w.stroke_bottom_width / 2.0,
        },
    }
}

/// Expands corner radii by the full stroke width on each adjacent side.
fn expand_radii_by_full_widths(
    radii: &RectangularCornerRadius,
    w: &RectangularStrokeWidth,
) -> RectangularCornerRadius {
    RectangularCornerRadius {
        tl: Radius {
            rx: radii.tl.rx + w.stroke_left_width,
            ry: radii.tl.ry + w.stroke_top_width,
        },
        tr: Radius {
            rx: radii.tr.rx + w.stroke_right_width,
            ry: radii.tr.ry + w.stroke_top_width,
        },
        br: Radius {
            rx: radii.br.rx + w.stroke_right_width,
            ry: radii.br.ry + w.stroke_bottom_width,
        },
        bl: Radius {
            rx: radii.bl.rx + w.stroke_left_width,
            ry: radii.bl.ry + w.stroke_bottom_width,
        },
    }
}

/// Shrinks corner radii by half of each adjacent stroke width.
fn shrink_radii_by_half_widths(
    radii: &RectangularCornerRadius,
    w: &RectangularStrokeWidth,
) -> RectangularCornerRadius {
    RectangularCornerRadius {
        tl: Radius {
            rx: (radii.tl.rx - w.stroke_left_width / 2.0).max(0.0),
            ry: (radii.tl.ry - w.stroke_top_width / 2.0).max(0.0),
        },
        tr: Radius {
            rx: (radii.tr.rx - w.stroke_right_width / 2.0).max(0.0),
            ry: (radii.tr.ry - w.stroke_top_width / 2.0).max(0.0),
        },
        br: Radius {
            rx: (radii.br.rx - w.stroke_right_width / 2.0).max(0.0),
            ry: (radii.br.ry - w.stroke_bottom_width / 2.0).max(0.0),
        },
        bl: Radius {
            rx: (radii.bl.rx - w.stroke_left_width / 2.0).max(0.0),
            ry: (radii.bl.ry - w.stroke_bottom_width / 2.0).max(0.0),
        },
    }
}

/// Computes inner corner radii by reducing by the full adjacent stroke widths.
fn compute_inner_radii(
    radii: &RectangularCornerRadius,
    w: &RectangularStrokeWidth,
) -> RectangularCornerRadius {
    RectangularCornerRadius {
        tl: Radius {
            rx: (radii.tl.rx - w.stroke_left_width).max(0.0),
            ry: (radii.tl.ry - w.stroke_top_width).max(0.0),
        },
        tr: Radius {
            rx: (radii.tr.rx - w.stroke_right_width).max(0.0),
            ry: (radii.tr.ry - w.stroke_top_width).max(0.0),
        },
        br: Radius {
            rx: (radii.br.rx - w.stroke_right_width).max(0.0),
            ry: (radii.br.ry - w.stroke_bottom_width).max(0.0),
        },
        bl: Radius {
            rx: (radii.bl.rx - w.stroke_left_width).max(0.0),
            ry: (radii.bl.ry - w.stroke_bottom_width).max(0.0),
        },
    }
}

/// Computes outer and inner RRects for stroke rendering based on alignment.
fn compute_stroke_rrects(
    base_rect: Rect,
    widths: &RectangularStrokeWidth,
    radii: &RectangularCornerRadius,
    align: StrokeAlign,
) -> (RRect, RRect) {
    match align {
        StrokeAlign::Inside => {
            let outer = build_rrect(base_rect, radii);
            let inner_rect = compute_inner_rect_from_outer(base_rect, widths);
            let inner_radii = compute_inner_radii(radii, widths);
            let inner = build_rrect(inner_rect, &inner_radii);
            (outer, inner)
        }
        StrokeAlign::Center => {
            let outer_rect = expand_rect_by_half_widths(base_rect, widths);
            let outer_radii = expand_radii_by_half_widths(radii, widths);
            let outer = build_rrect(outer_rect, &outer_radii);

            let inner_rect = shrink_rect_by_half_widths(base_rect, widths);
            let inner_radii = shrink_radii_by_half_widths(radii, widths);
            let inner = build_rrect(inner_rect, &inner_radii);
            (outer, inner)
        }
        StrokeAlign::Outside => {
            let outer_rect = expand_rect_by_full_widths(base_rect, widths);
            let outer_radii = expand_radii_by_full_widths(radii, widths);
            let outer = build_rrect(outer_rect, &outer_radii);
            let inner = build_rrect(base_rect, radii);
            (outer, inner)
        }
    }
}

/// Computes the centerline RRect for stroking with dash patterns.
fn compute_centerline_rrect(
    base_rect: Rect,
    widths: &RectangularStrokeWidth,
    radii: &RectangularCornerRadius,
    align: StrokeAlign,
) -> RRect {
    match align {
        StrokeAlign::Inside => {
            let rect = shrink_rect_by_half_widths(base_rect, widths);
            let radii = shrink_radii_by_half_widths(radii, widths);
            build_rrect(rect, &radii)
        }
        StrokeAlign::Center => build_rrect(base_rect, radii),
        StrokeAlign::Outside => {
            let rect = expand_rect_by_half_widths(base_rect, widths);
            let radii = expand_radii_by_half_widths(radii, widths);
            build_rrect(rect, &radii)
        }
    }
}

/// Creates stroke geometry for rectangular shapes with per-side stroke widths.
///
/// Universal implementation supporting:
/// - Per-side stroke widths
/// - Per-corner radii (elliptical)
/// - All three stroke alignments (Center/Inside/Outside)
/// - Solid and dashed stroke patterns
///
/// # Algorithm
///
/// Based on CSS border rendering (see docs/wg/feat-painting/stroke-rect.md):
/// 1. Compute outer/inner RRects based on stroke alignment
/// 2. For solid strokes: fill the DRRect ring directly
/// 3. For dashed strokes: stroke centerline RRect with max width, clipped to DRRect ring
///
/// # Parameters
///
/// - `node_bounds`: The node's rectangle bounds (local-space, at origin)
/// - `rect_stroke`: The per-side stroke widths
/// - `corner_radius`: Per-corner radii
/// - `stroke_align`: Stroke alignment (Center, Inside, or Outside)
/// - `stroke_miter_limit`: Miter limit for Miter joins (only affects dashed strokes)
/// - `stroke_dash_array`: Optional dash pattern
///
/// # Returns
///
/// A filled path representing the stroke, or an empty path if no stroke.
pub fn stroke_geometry_rectangular(
    node_bounds: Rect,
    rect_stroke: &RectangularStrokeWidth,
    corner_radius: &RectangularCornerRadius,
    stroke_align: StrokeAlign,
    stroke_miter_limit: StrokeMiterLimit,
    stroke_dash_array: Option<&StrokeDashArray>,
) -> Path {
    // Check if all widths are zero (no stroke)
    if rect_stroke.is_none() {
        return Path::new();
    }

    // Compute outer and inner RRects
    let (rr_outer, rr_inner) =
        compute_stroke_rrects(node_bounds, rect_stroke, corner_radius, stroke_align);

    // Check for dash pattern
    let has_dash = stroke_dash_array.map(|d| !d.is_empty()).unwrap_or(false);

    if !has_dash {
        // Solid stroke: fill DRRect ring directly
        let mut outer_path = Path::new();
        outer_path.add_rrect(rr_outer, None);

        let mut inner_path = Path::new();
        inner_path.add_rrect(rr_inner, None);

        if let Some(ring) = skia_safe::op(&outer_path, &inner_path, PathOp::Difference) {
            ring
        } else {
            Path::new()
        }
    } else {
        // Dashed stroke: stroke centerline with max width, clipped to ring
        stroke_geometry_rectangular_dashed_rrect(
            node_bounds,
            rect_stroke,
            corner_radius,
            stroke_align,
            stroke_miter_limit,
            rr_outer,
            rr_inner,
            stroke_dash_array.unwrap(),
        )
    }
}

/// Creates dashed stroke geometry for rectangular shapes using DRRect clipping.
///
/// This implementation:
/// 1. Strokes the centerline RRect with the maximum stroke width
/// 2. Clips to the DRRect ring (outer - inner) to achieve per-side widths
/// 3. Properly follows corner radii with dash patterns
///
/// # Note
///
/// This approach ensures dashes smoothly follow rounded corners, unlike per-edge stroking.
fn stroke_geometry_rectangular_dashed_rrect(
    node_bounds: Rect,
    rect_stroke: &RectangularStrokeWidth,
    corner_radius: &RectangularCornerRadius,
    stroke_align: StrokeAlign,
    stroke_miter_limit: StrokeMiterLimit,
    rr_outer: RRect,
    rr_inner: RRect,
    stroke_dash_array: &StrokeDashArray,
) -> Path {
    // Normalize dash intervals
    let intervals = stroke_dash_array.normalized();

    // Compute centerline RRect
    let centerline_rrect =
        compute_centerline_rrect(node_bounds, rect_stroke, corner_radius, stroke_align);

    // Create path from centerline
    let mut centerline_path = Path::new();
    centerline_path.add_rrect(centerline_rrect, None);

    // Stroke with max width
    let max_width = rect_stroke.max();
    let mut stroke_rec = StrokeRec::new(InitStyle::Hairline);
    stroke_rec.set_stroke_style(max_width, false);
    stroke_rec.set_stroke_params(
        StrokeCap::default().into(),
        StrokeJoin::default().into(),
        stroke_miter_limit.value(),
    );

    // Apply dash effect
    let mut path_to_stroke = centerline_path.clone();
    if let Some(pe) = PathEffect::dash(&intervals, 0.0) {
        // Use a hairline StrokeRec for filtering to avoid double-width application
        let filter_rec = StrokeRec::new(InitStyle::Hairline);

        if let Some((dashed, _)) =
            pe.filter_path(&centerline_path, &filter_rec, centerline_path.bounds())
        {
            path_to_stroke = dashed.snapshot();
        }
    }

    // Apply stroke
    let mut stroked_path_builder = skia_safe::PathBuilder::new();
    if !stroke_rec.apply_to_path(&mut stroked_path_builder, &path_to_stroke) {
        return Path::new();
    }
    let stroked_path = stroked_path_builder.snapshot();

    // Clip to DRRect ring (outer - inner)
    let mut outer_path = Path::new();
    outer_path.add_rrect(rr_outer, None);

    let mut inner_path = Path::new();
    inner_path.add_rrect(rr_inner, None);

    if let Some(ring) = skia_safe::op(&outer_path, &inner_path, PathOp::Difference) {
        // Intersect stroke with ring
        if let Some(result) = skia_safe::op(&stroked_path, &ring, PathOp::Intersect) {
            result
        } else {
            Path::new()
        }
    } else {
        Path::new()
    }
}
