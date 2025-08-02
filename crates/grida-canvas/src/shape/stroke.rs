use crate::cg::types::*;
use skia_safe::{path_effect::PathEffect, stroke_rec::InitStyle, Path, PathOp, StrokeRec};

/// Computes the stroke geometry path for a given input `Path`, enabling rich stroke
/// rendering features such as image fills, gradients, and complex stroke alignment.
///
/// This function generates a *filled path* that visually represents the stroke outline,
/// based on stroke width, alignment, and optional dash pattern. The result can be used
/// with any fill-based rendering pipeline, e.g. image shaders, gradients, or masking.
///
/// # Parameters
///
/// - `source_path`: The original vector path to be stroked.
/// - `stroke_width`: The stroke width (measured in logical pixels).
/// - `stroke_align`: Controls how the stroke is aligned relative to the path.
///   - `StrokeAlign::Center`: Stroke is centered on the path (default Skia behavior).
///   - `StrokeAlign::Inside`: Stroke lies entirely inside the path boundary.
///   - `StrokeAlign::Outside`: Stroke lies entirely outside the path boundary.
/// - `stroke_dash_array`: Optional dash pattern (e.g., `[10.0, 4.0]` for 10 on, 4 off).
///
/// # Returns
///
/// A `Path` representing the stroke outline as a filled geometry. This path can be used
/// with image or gradient fills, or for clipping, hit-testing, or boolean operations.
///
/// # Behavior
///
/// - If `stroke_align` is not `Center`, the result uses boolean path operations to clip or subtract
///   the stroke geometry relative to the original path.
/// - If a dash array is provided, it is applied before stroking.
/// - If the path is empty or invalid, an empty `Path` is returned.
///
/// # Example
///
/// ```rust,ignore
/// let stroke_path = stroke_geometry(
///     &original_path,
///     4.0,
///     StrokeAlign::Inside,
///     Some(&vec![8.0, 4.0])
/// );
/// canvas.draw_path(&stroke_path, &image_paint);
/// ```
///
/// # See Also
///
/// - [`SkStrokeRec`](https://github.com/google/skia/blob/main/include/core/SkStrokeRec.h)
/// - [`SkPath::op`](https://github.com/google/skia/blob/main/include/core/SkPath.h)
/// - [`SkDashPathEffect`](https://github.com/google/skia/blob/main/include/effects/SkDashPathEffect.h)
pub fn stroke_geometry(
    source_path: &Path,
    stroke_width: f32,
    stroke_align: StrokeAlign,
    stroke_dash_array: Option<&Vec<f32>>,
) -> Path {
    use StrokeAlign::*;

    // Inside/outside alignments only make sense for closed paths. For open paths we
    // fall back to center alignment to avoid producing an empty stroke geometry.
    let effective_align = if !source_path.is_last_contour_closed() {
        Center
    } else {
        stroke_align
    };

    let adjusted_width = match effective_align {
        Center => stroke_width,
        Inside => stroke_width * 2.0,  // we'll clip it later
        Outside => stroke_width * 2.0, // we'll subtract later
    };

    // Create a stroke record with the adjusted width
    let mut stroke_rec = StrokeRec::new(InitStyle::Hairline);
    stroke_rec.set_stroke_style(adjusted_width, false);

    // Apply dash effect if provided
    let mut path_to_stroke = source_path.clone();
    if let Some(dashes) = stroke_dash_array {
        if let Some(pe) = PathEffect::dash(dashes, 0.0) {
            if let Some((dashed, _)) =
                pe.filter_path(source_path, &stroke_rec, source_path.bounds())
            {
                path_to_stroke = dashed;
            }
        }
    }

    // Apply the stroke to create the outline
    let mut stroked_path = Path::new();
    if stroke_rec.apply_to_path(&mut stroked_path, &path_to_stroke) {
        match effective_align {
            Center => stroked_path,
            Inside => {
                // Clip to original path: intersection
                if let Some(result) = Path::op(&stroked_path, source_path, PathOp::Intersect) {
                    result
                } else {
                    stroked_path
                }
            }
            Outside => {
                // Subtract original path from stroke outline
                if let Some(result) = Path::op(&stroked_path, source_path, PathOp::Difference) {
                    result
                } else {
                    stroked_path
                }
            }
        }
    } else {
        Path::new()
    }
}
