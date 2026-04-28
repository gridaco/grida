//! `<use>` shadow-instance expansion for the direct renderer.
//!
//! Blink builds a shadow instance tree before layout. V1 does not have a
//! persistent render tree yet, so this module performs the same semantic
//! expansion during paint: resolve the target, apply `<use>` positioning,
//! propagate inheritable properties through `PaintCtx::use_inherit`, and
//! paint the referenced subtree under that context.

use csscascade::dom::{DemoNodeData, NodeId};
use skia_safe::{Canvas, Paint as SkPaint};

use crate::htmlcss::svg::dom::attrs::{
    parse_length_px, parse_preserve_aspect_ratio, parse_viewbox,
};
use crate::htmlcss::svg::dom::element::{get_attr, ElementKind};
use crate::htmlcss::svg::dom::href::{href_attr, same_document_fragment};
use crate::htmlcss::svg::layout::viewport::{ancestor_svg_viewport, compute_viewbox_matrix};
use crate::htmlcss::svg::paint::effects::group_opacity;
use crate::htmlcss::svg::paint::scoped_svg_paint_state::{PaintCtx, MAX_USE_DEPTH};
use crate::htmlcss::svg::paint::svg_container_painter::{paint_children, paint_node};

pub(crate) fn paint_use(canvas: &Canvas, ctx: &PaintCtx<'_>, use_id: NodeId) {
    if ctx.use_depth >= MAX_USE_DEPTH {
        return;
    }
    let node = ctx.dom.node(use_id);
    let Some(href) = href_attr(node) else {
        return;
    };
    let Some(target_id) = same_document_fragment(href).and_then(|s| ctx.resources.lookup(s)) else {
        return;
    };
    if target_id == use_id {
        return;
    }
    let mut anc = node.parent;
    while let Some(id) = anc {
        if id == target_id {
            return;
        }
        anc = ctx.dom.node(id).parent;
    }

    let restore = canvas.save();
    let x = get_attr(node, "x").and_then(parse_length_px).unwrap_or(0.0);
    let y = get_attr(node, "y").and_then(parse_length_px).unwrap_or(0.0);
    if x != 0.0 || y != 0.0 {
        canvas.translate((x, y));
    }

    let deeper = ctx.with_deeper_use().with_use_inherit(use_id);
    let target = ctx.dom.node(target_id);
    if let DemoNodeData::Element(d) = &target.data {
        let kind = ElementKind::from_local_name(d.name.local.as_ref());
        match kind {
            ElementKind::Symbol => paint_symbol_use(canvas, ctx, &deeper, use_id, target_id),
            _ => paint_node(canvas, &deeper, target_id),
        }
    }
    canvas.restore_to_count(restore);
}

fn paint_symbol_use(
    canvas: &Canvas,
    ctx: &PaintCtx<'_>,
    deeper: &PaintCtx<'_>,
    use_id: NodeId,
    target_id: NodeId,
) {
    let node = ctx.dom.node(use_id);
    let target = ctx.dom.node(target_id);
    let sym_restore = canvas.save();
    let opacity = group_opacity(target);
    if opacity < 1.0 {
        let mut p = SkPaint::default();
        p.set_alpha_f(opacity.max(0.0));
        canvas.save_layer(&skia_safe::canvas::SaveLayerRec::default().paint(&p));
    }

    let use_w = get_attr(node, "width").and_then(parse_length_px);
    let use_h = get_attr(node, "height").and_then(parse_length_px);
    let (vp_w_default, vp_h_default) = ancestor_svg_viewport(ctx, use_id);
    let viewport_w = use_w
        .or_else(|| get_attr(target, "width").and_then(parse_length_px))
        .unwrap_or(vp_w_default);
    let viewport_h = use_h
        .or_else(|| get_attr(target, "height").and_then(parse_length_px))
        .unwrap_or(vp_h_default);

    let overflow = get_attr(target, "overflow")
        .map(str::trim)
        .unwrap_or("hidden");
    let clip_to_viewport = !matches!(overflow, "visible" | "auto");
    if clip_to_viewport && viewport_w > 0.0 && viewport_h > 0.0 {
        canvas.clip_rect(
            skia_safe::Rect::from_xywh(0.0, 0.0, viewport_w, viewport_h),
            skia_safe::ClipOp::Intersect,
            true,
        );
    }

    if let Some((vb_x, vb_y, vb_w, vb_h)) = get_attr(target, "viewBox").and_then(parse_viewbox) {
        if viewport_w > 0.0 && viewport_h > 0.0 && vb_w > 0.0 && vb_h > 0.0 {
            let m = compute_viewbox_matrix(
                (0.0, 0.0, viewport_w, viewport_h),
                (vb_x, vb_y, vb_w, vb_h),
                get_attr(target, "preserveAspectRatio").map(parse_preserve_aspect_ratio),
            );
            canvas.concat(&m);
        }
    }

    paint_children(canvas, deeper, target_id);
    canvas.restore_to_count(sym_restore);
}
