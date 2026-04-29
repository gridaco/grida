//! SVG viewport and viewBox helpers.

use csscascade::dom::{DemoNode, DemoNodeData, NodeId};
use skia_safe::{Canvas, Matrix, Rect};

use crate::htmlcss::svg::dom::attrs::{
    parse_length_px, parse_preserve_aspect_ratio, parse_viewbox, AlignX, AlignY, Fit,
    PreserveAspectRatio,
};
use crate::htmlcss::svg::dom::element::{get_attr, ElementKind};
use crate::htmlcss::svg::paint::scoped_svg_paint_state::PaintCtx;
use crate::htmlcss::svg::paint::svg_container_painter::paint_children;

pub(crate) fn paint_nested_svg(canvas: &Canvas, ctx: &PaintCtx<'_>, id: NodeId, node: &DemoNode) {
    // SVG 2 §7.7: x, y, width, height on a nested `<svg>` accept
    // `<length-percentage>`. Percentages resolve against the parent
    // viewport (the enclosing `<svg>` element's viewBox or
    // width/height). `parse_length_px` returns None for `%`, so
    // resolve those explicitly here.
    let (_, _, parent_w, parent_h) = viewport_box_for(ctx, node);
    let x = get_attr(node, "x")
        .and_then(|s| length_or_percent(s, parent_w))
        .unwrap_or(0.0);
    let y = get_attr(node, "y")
        .and_then(|s| length_or_percent(s, parent_h))
        .unwrap_or(0.0);
    let w = get_attr(node, "width").and_then(|s| length_or_percent(s, parent_w));
    let h = get_attr(node, "height").and_then(|s| length_or_percent(s, parent_h));

    // SVG 2 §5.1.2: a nested `<svg>` with `viewBox` but no `width`/
    // `height` defaults each missing dimension to `100%` of the
    // containing block (the parent viewport). Without this default a
    // `<svg viewBox="0 0 200 100">` placed inside another `<svg>` had
    // viewport_w/h = 0, fell through to `paint_children` raw, and the
    // `viewBox` transform was silently dropped — so children rendered
    // in the parent's coordinate space at full scale.
    let has_view_box = get_attr(node, "viewBox").is_some();
    let viewport_w = w.unwrap_or(if has_view_box { parent_w } else { 0.0 });
    let viewport_h = h.unwrap_or(if has_view_box { parent_h } else { 0.0 });
    if viewport_w <= 0.0 || viewport_h <= 0.0 {
        paint_children(canvas, ctx, id);
        return;
    }

    let viewport_rect = Rect::from_xywh(x, y, viewport_w, viewport_h);
    canvas.save();
    // SVG 2 §7.7: a nested `<svg>` clips to its viewport unless the
    // `overflow` property says otherwise. The default is `hidden`,
    // but `visible` / `auto` (Chrome treats `auto` like `visible`
    // here) skip the clip so children can extend past the box.
    let overflow = get_attr(node, "overflow")
        .map(str::trim)
        .unwrap_or("hidden");
    let clip_to_viewport = !matches!(overflow, "visible" | "auto");
    if clip_to_viewport {
        canvas.clip_rect(viewport_rect, skia_safe::ClipOp::Intersect, true);
    }

    if let Some(view_box) = get_attr(node, "viewBox").and_then(parse_viewbox) {
        let par = get_attr(node, "preserveAspectRatio")
            .map(parse_preserve_aspect_ratio)
            .unwrap_or_default();
        let m = compute_viewbox_matrix((x, y, viewport_w, viewport_h), view_box, Some(par));
        canvas.concat(&m);
    } else {
        canvas.translate((x, y));
    }
    paint_children(canvas, ctx, id);
    canvas.restore();
}

pub(crate) fn nearest_svg_viewport(ctx: &PaintCtx<'_>, node: &DemoNode) -> (f32, f32) {
    let mut chain: Vec<&DemoNode> = vec![node];
    let mut current = node.parent;
    while let Some(id) = current {
        let n = ctx.dom.node(id);
        chain.push(n);
        current = n.parent;
    }
    for n in chain {
        if let DemoNodeData::Element(d) = &n.data {
            if d.name.local.as_ref().eq_ignore_ascii_case("svg") {
                if let Some((_, _, vw, vh)) = get_attr(n, "viewBox").and_then(parse_viewbox) {
                    if vw > 0.0 && vh > 0.0 {
                        return (vw, vh);
                    }
                }
                let w = get_attr(n, "width").and_then(parse_length_px);
                let h = get_attr(n, "height").and_then(parse_length_px);
                if let (Some(w), Some(h)) = (w, h) {
                    if w > 0.0 && h > 0.0 {
                        return (w, h);
                    }
                }
                break;
            }
        }
    }
    ctx.initial_viewport
}

pub(crate) fn ancestor_svg_viewport(ctx: &PaintCtx<'_>, start_id: NodeId) -> (f32, f32) {
    let mut current = ctx.dom.node(start_id).parent;
    while let Some(id) = current {
        let n = ctx.dom.node(id);
        if let DemoNodeData::Element(d) = &n.data {
            if d.name.local.as_ref().eq_ignore_ascii_case("svg") {
                if let Some((_, _, vw, vh)) = get_attr(n, "viewBox").and_then(parse_viewbox) {
                    if vw > 0.0 && vh > 0.0 {
                        return (vw, vh);
                    }
                }
                let w = get_attr(n, "width").and_then(parse_length_px);
                let h = get_attr(n, "height").and_then(parse_length_px);
                if let (Some(w), Some(h)) = (w, h) {
                    if w > 0.0 && h > 0.0 {
                        return (w, h);
                    }
                }
                break;
            }
        }
        current = n.parent;
    }
    ctx.initial_viewport
}

pub(crate) fn viewport_box_for(ctx: &PaintCtx<'_>, node: &DemoNode) -> (f32, f32, f32, f32) {
    let mut current = node.parent;
    while let Some(id) = current {
        let n = ctx.dom.node(id);
        if let DemoNodeData::Element(d) = &n.data {
            if ElementKind::from_local_name(d.name.local.as_ref()) == ElementKind::Svg {
                if let Some(vb) = get_attr(n, "viewBox").and_then(parse_viewbox) {
                    return vb;
                }
                // SVG 2 §7.7: a nested `<svg>` accepts percentage
                // width/height that resolve against its own enclosing
                // viewport. Recurse so a `<rect width="100%">` inside
                // a nested `<svg width="50%">` ultimately measures
                // against the outer viewBox / canvas.
                let (_, _, parent_w, parent_h) = viewport_box_for(ctx, n);
                let w = get_attr(n, "width")
                    .and_then(|s| length_or_percent(s, parent_w))
                    .unwrap_or(0.0);
                let h = get_attr(n, "height")
                    .and_then(|s| length_or_percent(s, parent_h))
                    .unwrap_or(0.0);
                return (0.0, 0.0, w, h);
            }
        }
        current = n.parent;
    }
    (0.0, 0.0, 0.0, 0.0)
}

/// Parse an SVG `<length-percentage>` token, resolving `%` against the
/// supplied axis extent. Bare numbers and absolute units pass through
/// `parse_length_px`. Used by callers that need a single hop of
/// percentage resolution against a known viewport axis.
fn length_or_percent(s: &str, axis: f32) -> Option<f32> {
    let s = s.trim();
    if let Some(p) = s.strip_suffix('%') {
        let n: f32 = p.trim().parse().ok()?;
        return Some(n / 100.0 * axis);
    }
    parse_length_px(s)
}

pub(crate) fn compute_viewbox_matrix(
    viewport: (f32, f32, f32, f32),
    view_box: (f32, f32, f32, f32),
    par: Option<PreserveAspectRatio>,
) -> Matrix {
    let (vp_x, vp_y, vp_w, vp_h) = viewport;
    let (vb_x, vb_y, vb_w, vb_h) = view_box;
    let par = par.unwrap_or_default();
    let scale_x = vp_w / vb_w;
    let scale_y = vp_h / vb_h;
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
        AlignX::Mid => (vp_w - vb_w * sx) / 2.0,
        AlignX::Max => vp_w - vb_w * sx,
    };
    let dy = match par.align_y {
        AlignY::Min => 0.0,
        AlignY::Mid => (vp_h - vb_h * sy) / 2.0,
        AlignY::Max => vp_h - vb_h * sy,
    };
    let mut m = Matrix::translate((vp_x + dx, vp_y + dy));
    m.pre_concat(&Matrix::scale((sx, sy)));
    m.pre_concat(&Matrix::translate((-vb_x, -vb_y)));
    m
}
