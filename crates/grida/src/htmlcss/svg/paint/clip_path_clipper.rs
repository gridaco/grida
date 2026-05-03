//! `clip-path` application for the direct SVG painter.

use csscascade::dom::DemoNode;
use skia_safe::{Canvas, ClipOp, Rect};

use super::super::geometry::basic_shape::{
    build_basic_shape_path, parse_basic_shape, ReferenceBox,
};
use super::scoped_svg_paint_state::PaintCtx;
use crate::htmlcss::svg::dom::attrs::parse_length_px;
use crate::htmlcss::svg::dom::element::get_attr;
use crate::htmlcss::svg::layout::bbox::element_object_bbox;
use crate::htmlcss::svg::layout::viewport::nearest_svg_viewport;
use crate::htmlcss::svg::resources::clipper;
use crate::htmlcss::svg::resources::svg_resources::parse_url_ref;

/// Half of the element's effective stroke-width (the amount the
/// stroke extends beyond the fill bbox on each side). Returns 0
/// when the element has no stroke or the stroke is `none`.
fn stroke_half_extent(node: &DemoNode) -> f32 {
    let stroke = get_attr(node, "stroke")
        .or_else(|| {
            get_attr(node, "style").and_then(|s| {
                for decl in s.split(';') {
                    if let Some((k, v)) = decl.split_once(':') {
                        if k.trim().eq_ignore_ascii_case("stroke") {
                            return Some(v.trim());
                        }
                    }
                }
                None
            })
        })
        .map(str::trim);
    if matches!(stroke, None | Some("none") | Some("")) {
        return 0.0;
    }
    let width = get_attr(node, "stroke-width")
        .and_then(parse_length_px)
        .unwrap_or(1.0);
    width * 0.5
}

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
                ReferenceBox::StrokeBox => {
                    // Per CSS Masking 1 §1.2 / SVG 2: `stroke-box`
                    // is the element's stroke bounding box — the fill
                    // box expanded by half the stroke-width on every
                    // side. Without this, a `circle() stroke-box`
                    // sized circle clips at the fill bbox and chops
                    // off the stroke.
                    let mut b = element_object_bbox(ctx.dom, node);
                    let half = stroke_half_extent(node);
                    if half > 0.0 {
                        b = Rect::from_ltrb(
                            b.left - half,
                            b.top - half,
                            b.right + half,
                            b.bottom + half,
                        );
                    }
                    b
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
    let Some(path) = clipper::resolve_to_path(ctx, target, bbox) else {
        return true;
    };
    canvas.clip_path(&path, ClipOp::Intersect, true);
    true
}
