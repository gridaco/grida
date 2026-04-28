//! `clip-path` application for the direct SVG painter.

use csscascade::dom::DemoNode;
use skia_safe::{Canvas, ClipOp, Rect};

use super::super::geometry::basic_shape::{
    build_basic_shape_path, parse_basic_shape, ReferenceBox,
};
use super::scoped_svg_paint_state::PaintCtx;
use crate::htmlcss::svg::layout::bbox::element_object_bbox;
use crate::htmlcss::svg::layout::viewport::nearest_svg_viewport;
use crate::htmlcss::svg::resources::clipper;
use crate::htmlcss::svg::resources::svg_resources::parse_url_ref;

pub(super) fn apply_clip_path(
    canvas: &Canvas,
    ctx: &PaintCtx<'_>,
    node: &DemoNode,
    raw: &str,
) -> bool {
    let Some(id) = parse_url_ref(raw) else {
        if let Some((shape, refbox)) = parse_basic_shape(raw) {
            let box_rect = match refbox {
                ReferenceBox::ViewBox => {
                    let (vw, vh) = nearest_svg_viewport(ctx, node);
                    Rect::from_xywh(0.0, 0.0, vw, vh)
                }
                _ => element_object_bbox(ctx.dom, node),
            };
            let path = build_basic_shape_path(&shape, box_rect);
            canvas.clip_path(&path, ClipOp::Intersect, true);
        }
        return true;
    };

    let Some(target) = ctx.resources.lookup(id) else {
        return true;
    };
    // Resolution failure for a `<clipPath>` reference renders unclipped
    // per htmlcss-svg design study §S-clip-path "Differ" — empty /
    // unsupported / cyclic clip paths fall through rather than hide
    // content. (Blink's spec-strict behavior is to clip-everything;
    // resvg renders unclipped, and the design doc commits to resvg's
    // formulation.)
    let bbox = element_object_bbox(ctx.dom, node);
    let Some(path) = clipper::resolve_to_path(ctx.dom, ctx.resources, target, bbox) else {
        return true;
    };
    canvas.clip_path(&path, ClipOp::Intersect, true);
    true
}
