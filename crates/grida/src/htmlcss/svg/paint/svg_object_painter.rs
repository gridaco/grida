//! Shared SVG object-painter utilities.

use super::scoped_svg_paint_state::{PaintCtx, MAX_FILTER_DEPTH};

/// Record a subtree's paint walk into a Skia `Picture`.
pub fn record_subtree_to_picture(
    ctx: &PaintCtx<'_>,
    target_id: csscascade::dom::NodeId,
    bounds: skia_safe::Rect,
) -> Option<skia_safe::Picture> {
    if ctx.filter_depth >= MAX_FILTER_DEPTH {
        return None;
    }
    let mut recorder = skia_safe::PictureRecorder::new();
    let canvas = recorder.begin_recording(bounds, false);
    canvas.translate((bounds.left, bounds.top));
    let inner = ctx.with_deeper_filter();
    super::svg_container_painter::paint_node(canvas, &inner, target_id);
    recorder.finish_recording_as_picture(Some(&bounds))
}
