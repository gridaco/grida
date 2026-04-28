//! `SvgRootPainter` — entry painter.
//!
//! Resolves `width` / `height` / `viewBox` / `preserveAspectRatio` into
//! the outer CTM (viewport-rect → user-units), then dispatches the child
//! container walk.
//!
//! Checkpoint 1: viewport CTM is `viewport_rect ↔ viewBox` linear scale
//! (no preserveAspectRatio yet — implicit `xMidYMid meet`).
//!
//! Blink anchor: `core/paint/svg_root_painter.{h,cc}` plus the viewport
//! resolution inside `core/layout/svg/layout_svg_root.cc`.

use csscascade::dom::{DemoDom, NodeId};
use skia_safe::{Canvas, Matrix, Paint as SkPaint, Rect};

use super::super::dom::attrs::{
    parse_length_px, parse_preserve_aspect_ratio, parse_viewbox, AlignX, AlignY, Fit,
};
use super::super::dom::element::{get_attr, is_painted};
use super::super::dom::parser::find_svg_root;
use super::super::resources::filter as svg_filter;
use super::super::resources::svg_resources::{parse_url_ref, Resources};
use super::super::SvgError;
use super::clip_path_clipper::apply_clip_path;
use super::scoped_svg_paint_state::PaintCtx;
use super::svg_container_painter::paint_children;
use crate::htmlcss::svg::layout::bbox::element_object_bbox;
use crate::htmlcss::svg::RenderContext;

/// Paint the SVG document rooted at the `<svg>` element of `dom` into
/// `canvas`, mapping the SVG content to `viewport_rect`. Images
/// referenced via `<image>` and `feImage` are resolved through
/// `images`; pass `&crate::htmlcss::NoImages` when none are available.
pub fn paint_root(
    canvas: &Canvas,
    dom: &DemoDom,
    viewport_rect: Rect,
    context: RenderContext<'_>,
) -> Result<(), SvgError> {
    let svg_id = find_svg_root(dom)
        .ok_or_else(|| SvgError::Structure("no <svg> element to paint".to_string()))?;
    paint_root_node(canvas, dom, svg_id, viewport_rect, context)
}

/// Same as [`paint_root`] but with the root node already located.
pub fn paint_root_node(
    canvas: &Canvas,
    dom: &DemoDom,
    svg_id: NodeId,
    viewport_rect: Rect,
    context: RenderContext<'_>,
) -> Result<(), SvgError> {
    let svg_node = dom.node(svg_id);

    if !is_painted(svg_node) {
        return Ok(());
    }

    // Per SVG 2 §8.2: a root `<svg>` whose intrinsic `width` or
    // `height` attribute resolves to ≤ 0 renders nothing. The viewport
    // we got from the host can be non-zero (the reftest harness sizes
    // surfaces by reference PNG dims), so the only signal we have for
    // this test is the SVG element's own attributes.
    let intrinsic_w = get_attr(svg_node, "width").and_then(parse_length_px);
    let intrinsic_h = get_attr(svg_node, "height").and_then(parse_length_px);
    if matches!(intrinsic_w, Some(w) if w <= 0.0) || matches!(intrinsic_h, Some(h) if h <= 0.0) {
        return Ok(());
    }

    let resources = Resources::build(dom, context.css);
    let ctx = PaintCtx::new(
        dom,
        &resources,
        context.images,
        context.fonts,
        (viewport_rect.width(), viewport_rect.height()),
    );

    // Compute viewport → user-unit CTM.
    let ctm = compute_viewport_ctm(svg_node, viewport_rect);

    let restore = canvas.save();
    canvas.concat(&ctm);

    // `clip-path` on the root `<svg>` (Cluster A in
    // docs/wg/research/chromium/svg/clip-path.md). Blink installs the
    // clip in CSS-pixel border-box space *before* the viewBox transform
    // via `PaintLayerPainter::PaintLayer`. We install it AFTER the
    // viewBox transform — easier to match `userSpaceOnUse` clipPath
    // children that live in user-unit space, and equivalent for
    // `objectBoundingBox` units. If the clip resolves to "clip
    // everything" (`apply_clip_path` returning false), skip the child
    // walk entirely.
    let painted = match get_attr(svg_node, "clip-path") {
        Some(raw) if !raw.trim().eq_ignore_ascii_case("none") => {
            apply_clip_path(canvas, &ctx, svg_node, raw)
        }
        _ => true,
    };

    // `opacity=` on the root `<svg>`. Mirrors the per-element opacity
    // layer that `container_painter::paint_node` opens — without this,
    // `<svg opacity="0.5">` on the root would render at full alpha
    // because we'd never enter the container painter for the root
    // element itself (`paint_root_node` dispatches `paint_children`).
    let opacity = super::effects::group_opacity(svg_node);
    let opacity_layer_opened = if painted && opacity < 1.0 {
        let mut p = skia_safe::Paint::default();
        p.set_alpha_f(opacity.max(0.0));
        canvas.save_layer(&skia_safe::canvas::SaveLayerRec::default().paint(&p));
        true
    } else {
        false
    };

    // `filter=` on the root `<svg>`. Mirrors the container painter's
    // filter setup at `container_painter.rs::paint_node` — opens a
    // `save_layer` whose paint carries the resolved `ImageFilter`,
    // bounded by the filter's region in user space. Same pattern as
    // the clip-path-on-root fix above.
    let filter_layer_opened = if painted {
        open_root_filter_layer(canvas, &ctx, svg_node)
    } else {
        false
    };
    if painted {
        paint_children(canvas, &ctx, svg_id);
    }
    if filter_layer_opened {
        canvas.restore();
    }
    if opacity_layer_opened {
        canvas.restore();
    }
    canvas.restore_to_count(restore);

    Ok(())
}

/// Returns `true` if a save_layer was opened for the root `<svg>`'s
/// `filter=` attribute (caller must `canvas.restore()` after painting
/// the children). Matches the resolution path used by the container
/// painter so funcIRI / CSS shorthand both work.
fn open_root_filter_layer(
    canvas: &Canvas,
    ctx: &PaintCtx<'_>,
    svg_node: &csscascade::dom::DemoNode,
) -> bool {
    let raw = match get_attr(svg_node, "filter")
        .map(str::trim)
        .filter(|v| !v.is_empty() && *v != "none")
    {
        Some(v) => v,
        None => return false,
    };
    let bbox = element_object_bbox(ctx.dom, svg_node);
    let inv = if let Some(id) = parse_url_ref(raw) {
        ctx.resources
            .lookup(id)
            .and_then(|t| svg_filter::resolve(ctx.dom, ctx.resources, t, bbox, ctx.images, ctx))
    } else {
        let cc =
            super::super::resources::svg_filter_builder::resolve_current_color(ctx.dom, svg_node);
        let fs = super::effects::resolve_font_size_px(ctx.dom, svg_node);
        svg_filter::build_from_css_filter_list(raw, bbox, cc, fs)
    };
    let Some(inv) = inv else {
        return false;
    };
    let mut p = SkPaint::default();
    p.set_image_filter(Some(inv.image_filter.clone()));
    let rec = skia_safe::canvas::SaveLayerRec::default()
        .bounds(&inv.region_user_space)
        .paint(&p);
    canvas.save_layer(&rec);
    true
}

/// `viewport_rect` is in canvas pixels; the returned matrix maps user
/// units (the coordinate space `<rect x="..." y="...">` lives in) into
/// those pixels. Honours `viewBox` and `preserveAspectRatio` per
/// SVG 1.1 §7.8.
fn compute_viewport_ctm(svg_node: &csscascade::dom::DemoNode, viewport_rect: Rect) -> Matrix {
    let view_box = get_attr(svg_node, "viewBox").and_then(parse_viewbox);

    let (vb_x, vb_y, vb_w, vb_h) = match view_box {
        Some(vb) => vb,
        None => {
            // No viewBox — user units are CSS pixels at 1:1; only the
            // translation to the viewport origin matters.
            let _ = parse_length_px; // imports still used by other arms
            return Matrix::translate((viewport_rect.left, viewport_rect.top));
        }
    };

    let par = get_attr(svg_node, "preserveAspectRatio")
        .map(parse_preserve_aspect_ratio)
        .unwrap_or_default();

    let scale_x = viewport_rect.width() / vb_w;
    let scale_y = viewport_rect.height() / vb_h;

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

    // Alignment offsets in viewport space.
    let dx = match par.align_x {
        AlignX::Min => 0.0,
        AlignX::Mid => (viewport_rect.width() - vb_w * sx) / 2.0,
        AlignX::Max => viewport_rect.width() - vb_w * sx,
    };
    let dy = match par.align_y {
        AlignY::Min => 0.0,
        AlignY::Mid => (viewport_rect.height() - vb_h * sy) / 2.0,
        AlignY::Max => viewport_rect.height() - vb_h * sy,
    };

    let mut m = Matrix::translate((viewport_rect.left + dx, viewport_rect.top + dy));
    m.pre_concat(&Matrix::scale((sx, sy)));
    m.pre_concat(&Matrix::translate((-vb_x, -vb_y)));
    m
}
