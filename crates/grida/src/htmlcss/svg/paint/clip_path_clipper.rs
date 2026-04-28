//! `clip-path` application for the direct SVG painter.

use csscascade::dom::{DemoNode, DemoNodeData};
use skia_safe::{Canvas, ClipOp, Rect};

use super::super::geometry::basic_shape::{
    build_basic_shape_path, parse_basic_shape, ReferenceBox,
};
use super::scoped_svg_paint_state::PaintCtx;
use crate::htmlcss::svg::dom::element::ElementKind;
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
    let target_is_clip_path = match &ctx.dom.node(target).data {
        DemoNodeData::Element(d) => {
            ElementKind::from_local_name(d.name.local.as_ref()) == ElementKind::ClipPath
        }
        _ => false,
    };
    let bbox = element_object_bbox(ctx.dom, node);
    let Some(path) = clipper::resolve_to_path(ctx.dom, ctx.resources, target, bbox) else {
        return !target_is_clip_path;
    };
    canvas.clip_path(&path, ClipOp::Intersect, true);
    true
}
