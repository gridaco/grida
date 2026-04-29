//! `SvgContainerPainter` — group traversal.
//!
//! Walks element children in document order, dispatches per `ElementKind`,
//! applies any `transform=` attribute. Hidden containers (`<defs>` and
//! resource families) are skipped.
//!
//! Group `opacity` triggers a `save_layer` so children composite as a
//! unit (Blink's isolation rule, simplified to opacity-only for now).
//!
//! Blink anchor: `core/paint/svg_container_painter.{h,cc}`.

use csscascade::dom::{DemoNode, DemoNodeData, NodeId};
use skia_safe::{Canvas, Paint as SkPaint};

use super::super::dom::attrs::parse_transform;
use super::super::dom::element::{element_kind, get_attr, ElementKind};
use super::super::dom::parser::svg_element_children;
use super::super::layout::bbox::element_object_bbox;
use super::super::layout::transform::transform_origin_for;
use super::super::layout::viewport::paint_nested_svg;
use super::super::resources::masker;
use super::super::resources::svg_resources::parse_url_ref;
use super::super::style::cascade::cascade_property;
use super::clip_path_clipper::apply_clip_path;
use super::effects::{group_opacity, resolve_filter_chain};
use super::scoped_svg_paint_state::{PaintCtx, MAX_FILTER_DEPTH, MAX_MASK_DEPTH};
use super::svg_image_painter;
use super::svg_shape_painter;
use super::svg_text_painter;
use super::svg_use_painter::paint_use;
use super::visibility::{has_display_none, is_visible_inherited};

/// Paint each SVG-namespace child of `parent_id`.
pub fn paint_children(canvas: &Canvas, ctx: &PaintCtx<'_>, parent_id: NodeId) {
    let kids: Vec<NodeId> = svg_element_children(ctx.dom, parent_id)
        .map(|(id, _)| id)
        .collect();
    for id in kids {
        paint_node(canvas, ctx, id);
    }
}

/// `<switch>` per SVG 1.1 §5.10.1: pick the first SVG-namespace child
/// that has a recognized element type and whose feature/language tests
/// pass. The remaining children are silently skipped. We default to
/// "supports everything" for `requiredFeatures` / `requiredExtensions`
/// (Blink also returns true for both) and accept `systemLanguage` only
/// when it lists `en` or no value.
fn paint_switch_child(canvas: &Canvas, ctx: &PaintCtx<'_>, parent_id: NodeId) {
    let kids: Vec<NodeId> = svg_element_children(ctx.dom, parent_id)
        .map(|(id, _)| id)
        .collect();
    for id in kids {
        let n = ctx.dom.node(id);
        // Skip non-SVG-paintable children (Title/Desc/Metadata). Skip
        // unrecognized elements ("non-SVG-child" fixture: `<random>`
        // never matches; the next sibling rect should win).
        let DemoNodeData::Element(d) = &n.data else {
            continue;
        };
        let kind = ElementKind::from_local_name(d.name.local.as_ref());
        if matches!(kind, ElementKind::Unknown) {
            continue;
        }
        // SVG 1.1 §5.8.2 selection criteria:
        //   - `requiredFeatures` (deprecated; Blink returns true unconditionally,
        //     so an empty-or-missing list is true and a non-empty list is also
        //     accepted as true today)
        //   - `requiredExtensions`: a list of extension URIs; we don't claim any
        //     UA extensions, so a present, non-empty list fails the test
        //   - `systemLanguage`: defaults to true unless explicitly mismatched
        // `display:none` / `visibility:hidden` are *not* selection criteria —
        // the selected child is the first whose system tests pass, and normal
        // display/visibility rules then apply to its paint (so a selected
        // `display:none` child silently bypasses the entire `<switch>`).
        if !required_extensions_match(n) {
            continue;
        }
        if !system_language_match(n) {
            continue;
        }
        paint_node(canvas, ctx, id);
        return;
    }
}

pub(crate) fn required_extensions_match(node: &DemoNode) -> bool {
    match get_attr(node, "requiredExtensions").map(str::trim) {
        // Missing or empty list — selection passes per §5.8.2.
        None | Some("") => true,
        // We don't claim any extension URIs, so any non-empty list fails.
        Some(_) => false,
    }
}

pub(crate) fn system_language_match(node: &DemoNode) -> bool {
    match get_attr(node, "systemLanguage").map(str::trim) {
        None => true,
        Some(s) => s
            .split(',')
            .map(str::trim)
            .any(|tag| tag.eq_ignore_ascii_case("en") || tag.starts_with("en-")),
    }
}

/// Dispatch on element kind. Unknown / unsupported elements are silently
/// skipped (Blink-style: render what you can).
pub fn paint_node(canvas: &Canvas, ctx: &PaintCtx<'_>, id: NodeId) {
    let node = ctx.dom.node(id);
    let Some(kind) = element_kind(node) else {
        return;
    };
    if kind.is_hidden_container() {
        return;
    }
    // SVG 2 §5.10.1 conditional processing: `requiredExtensions` and
    // `systemLanguage` act as render-time filters on any element, not
    // just `<switch>` children. A failing test omits the element from
    // the rendering tree entirely. (Resource-only containers such as
    // `<defs>` / `<clipPath>` are already handled above by
    // `is_hidden_container`; their conditional-processing semantics
    // belong on the resource lookup path, not here.)
    if !required_extensions_match(node) || !system_language_match(node) {
        return;
    }
    // SVG 2 §11.1: `display: none` skips the entire subtree. But
    // `visibility: hidden` on a container is *not* a subtree skip —
    // descendants can override with `visibility: visible`. So early-
    // return only on `display:none`; the visibility check moves
    // inline (we still recurse into children, just don't draw the
    // element's own shape).
    if has_display_none(node) {
        return;
    }
    let self_visible = is_visible_inherited(ctx.dom, id);

    let restore = canvas.save();
    if let Some(t) = cascade_property(
        Some(ctx.dom),
        Some(&ctx.resources.stylesheet),
        node,
        "transform",
    )
    .as_deref()
    .and_then(parse_transform)
    {
        // `transform-origin` (SVG 2 §8.3) shifts the rotation/scale
        // center: the transform is applied as `T(origin) ∘ M ∘ T(-origin)`.
        // Default origin is `(0, 0)` (the existing behavior); `center`
        // resolves to the bbox center for legacy SVG-1 parity.
        let origin = transform_origin_for(ctx, node);
        if origin != (0.0, 0.0) {
            let mut wrapped = skia_safe::Matrix::translate(origin);
            wrapped.pre_concat(&t);
            wrapped.pre_concat(&skia_safe::Matrix::translate((-origin.0, -origin.1)));
            canvas.concat(&wrapped);
        } else {
            canvas.concat(&t);
        }
    }

    // `clip-path=` on this element. Path-strategy only — bail (return
    // without painting) if the clipper resolution refuses, leaving an
    // empty draw rather than silently rendering unclipped content (which
    // is what the legacy fallback already produces for these inputs).
    if let Some(clip_attr) = get_attr(node, "clip-path") {
        let v = clip_attr.trim();
        if v != "none" && !v.is_empty() && !apply_clip_path(canvas, ctx, node, v) {
            canvas.restore_to_count(restore);
            return;
        }
    }

    // Element-level `opacity`. SVG 2 §6.6 specifies opacity as the
    // outermost effect (after mask/filter); we open an offscreen layer
    // when opacity < 1 so the element (or container subtree) composites
    // as a unit and the alpha applies once.
    //
    // This applies to BOTH containers (`<g>`, `<svg>`, …) and leaf
    // shapes (`<rect opacity="50%">` etc.) — the `is_container` gate
    // we used to have was too narrow; per spec opacity is a presentation
    // property usable on any rendered element.
    let opacity = group_opacity(node);
    if opacity < 1.0 {
        let mut p = SkPaint::default();
        p.set_alpha_f(opacity.max(0.0));
        canvas.save_layer(&skia_safe::canvas::SaveLayerRec::default().paint(&p));
    }

    // `filter=` on this element. We open a layer whose paint carries the
    // composed `skia_safe::ImageFilter`, walk the children inside, and
    // restore — Blink's `EffectPaintPropertyNode` composition pattern
    // simplified to a save_layer (matches Skia svg::Dom's
    // `SkSVGRenderContext::applyFilter`, `SkSVGRenderContext.cpp:313-330`).
    // Per Filter Effects §15.4 an unresolvable filter funcIRI paints the
    // element with **no** filter — same permissive stance we already use
    // for clip/mask.
    // Detect a filter reference that resolves to `<filter>` but our
    // resolver can't build a chain for (e.g. unimplemented primitive,
    // or the funcIRI points at a missing element). resvg's
    // interpretation — the one our reference PNGs follow — is that an
    // invalid filter funcIRI HIDES the element rather than rendering
    // it unfiltered. Track this as a separate flag so we can early-
    // bail before opening any further save_layers.
    let mut filter_failed_invalid = false;
    let filter_layer_opened = if ctx.filter_depth >= MAX_FILTER_DEPTH {
        false
    } else {
        let raw_filter = get_attr(node, "filter")
            .map(str::trim)
            .filter(|v| !v.is_empty() && *v != "none");
        let bbox = raw_filter.map(|_| element_object_bbox(ctx.dom, node));
        let invs = raw_filter
            .zip(bbox)
            .map(|(v, bbox)| resolve_filter_chain(ctx, node, v, bbox, &mut filter_failed_invalid));
        let mut any = false;
        if let Some(invs) = invs {
            // Per CSS Filter Effects 1 §3.1, the `filter:` value is a
            // left-to-right list applied in order: the first filter's
            // input is `SourceGraphic`, its output feeds the second,
            // etc. We model that as nested `save_layer`s — push the
            // *outermost* (last) filter first, then progressively the
            // inner ones, so when each layer restores it composites its
            // filter onto the parent layer's content. The final outer
            // restore (driven by `restore_to_count` further below)
            // unwinds them all.
            for inv in invs.iter().rev() {
                let mut p = SkPaint::default();
                p.set_image_filter(Some(inv.image_filter.clone()));
                let rec = skia_safe::canvas::SaveLayerRec::default()
                    .bounds(&inv.region_user_space)
                    .paint(&p);
                canvas.save_layer(&rec);
                any = true;
            }
        }
        any
    };
    // Invalid filter funcIRI: per resvg's strict interpretation the
    // element doesn't render at all (unlike clip-path-on-non-clipPath
    // which paints unclipped). Bail before any further work.
    if filter_failed_invalid {
        canvas.restore_to_count(restore);
        return;
    }

    // `mask=` on this element. We open a content layer around the
    // element's own paint, then a second layer with `BlendMode::DstIn`
    // (and `ColorFilters::luma` for luminance masks) holding the mask
    // children. Restore order is mask-then-content so the mask
    // composites as alpha onto the content layer before the parent
    // sees it.
    let mask_invocation = if ctx.mask_depth >= MAX_MASK_DEPTH {
        None
    } else {
        get_attr(node, "mask")
            .map(str::trim)
            .filter(|v| !v.is_empty() && *v != "none")
            .and_then(parse_url_ref)
            .and_then(|id| ctx.resources.lookup(id))
            // CSS Masking 1: a `mask=` whose target is already on the
            // active-mask stack would create a cycle. Treat the
            // reference as `mask: none` so the element renders
            // unmasked — matches Chrome / resvg.
            .filter(|target| match ctx.mask_chain {
                Some(chain) => !chain.contains(*target),
                None => true,
            })
            .and_then(|target| {
                let bbox = element_object_bbox(ctx.dom, node);
                masker::resolve(ctx.dom, target, bbox)
            })
    };
    if mask_invocation.is_some() {
        canvas.save_layer(&skia_safe::canvas::SaveLayerRec::default());
    }
    // Recurse with deeper filter depth so a self-referential filter
    // chain (e.g. via `<use>` cycles) terminates rather than spinning
    // saveLayers forever.
    let inner_ctx = if filter_layer_opened {
        ctx.with_deeper_filter()
    } else {
        *ctx
    };
    let ctx = &inner_ctx;

    match kind {
        ElementKind::Svg => {
            // Nested `<svg>` establishes a new viewport per SVG 1.1 §7.3:
            // clip-and-scale children into the (x, y, width, height) box,
            // applying `viewBox` + `preserveAspectRatio`. Without this
            // we treat the inner svg as a `<g>` and the children spill
            // out of the intended box. We detect "nested" by checking
            // for a non-zero parent — the root svg's CTM is set up by
            // `root_painter`, so it doesn't go through here.
            if node.parent.is_some() {
                paint_nested_svg(canvas, ctx, id, node);
            } else {
                paint_children(canvas, ctx, id);
            }
        }
        ElementKind::G | ElementKind::Anchor => {
            paint_children(canvas, ctx, id);
        }
        ElementKind::Switch => {
            // SVG 1.1 §5.10.1: render only the first SVG child whose
            // `requiredFeatures` / `requiredExtensions` / `systemLanguage`
            // tests pass. Children with `display:none` or
            // `visibility:hidden` are skipped per `is_painted`.
            paint_switch_child(canvas, ctx, id);
        }
        ElementKind::Use => paint_use(canvas, ctx, id),
        // Leaf shapes only paint when their own `visibility` is
        // visible — `visibility: hidden` on a leaf suppresses just
        // that draw, not the surrounding subtree (handled by
        // `paint_node`'s recursion above for containers).
        ElementKind::Rect if self_visible => svg_shape_painter::paint_rect(canvas, ctx, node),
        ElementKind::Circle if self_visible => svg_shape_painter::paint_circle(canvas, ctx, node),
        ElementKind::Ellipse if self_visible => svg_shape_painter::paint_ellipse(canvas, ctx, node),
        ElementKind::Line if self_visible => svg_shape_painter::paint_line(canvas, ctx, node),
        ElementKind::Polyline if self_visible => {
            svg_shape_painter::paint_polyline(canvas, ctx, node)
        }
        ElementKind::Polygon if self_visible => svg_shape_painter::paint_polygon(canvas, ctx, node),
        ElementKind::Path if self_visible => svg_shape_painter::paint_path(canvas, ctx, node),
        ElementKind::Image if self_visible => svg_image_painter::paint(canvas, ctx, node),
        ElementKind::ForeignObject => {}
        ElementKind::Text if self_visible => svg_text_painter::paint(canvas, ctx, id, node),
        // `<tspan>` / `<textPath>` are rendered by the parent `<text>`
        // walk; standalone hits here are no-ops.
        ElementKind::TSpan | ElementKind::TextPath => {}
        ElementKind::Stop => {}
        _ => {}
    }

    if let Some(inv) = mask_invocation {
        apply_mask(canvas, ctx, &inv);
    }

    canvas.restore_to_count(restore);
}

/// Open the mask layer (DstIn blend, optional luma color filter), clip
/// to the mask region, apply `maskContentUnits`, paint mask children,
/// then restore. Caller is expected to have opened the *content* layer
/// just before painting the masked element.
///
/// If the mask element itself carries a `mask=` attribute (chained
/// masks), the children are painted into a nested content+mask layer
/// pair so the chain composites correctly. Mirrors Blink, where
/// `LayoutSVGResourceMasker::CreatePaintRecord` records the chained
/// mask as part of the mask's own paint subtree.
fn apply_mask(canvas: &Canvas, ctx: &PaintCtx<'_>, inv: &masker::MaskInvocation) {
    use masker::MaskType;
    let mut mask_paint = SkPaint::default();
    mask_paint.set_blend_mode(skia_safe::BlendMode::DstIn);
    if matches!(inv.mask_type, MaskType::Luminance) {
        mask_paint.set_color_filter(skia_safe::ColorFilter::luma());
    }

    let rec = skia_safe::canvas::SaveLayerRec::default()
        .bounds(&inv.region_user_space)
        .paint(&mask_paint);
    canvas.save_layer(&rec);

    canvas.clip_rect(inv.region_user_space, skia_safe::ClipOp::Intersect, true);
    if !inv.content_to_user_space.is_identity() {
        canvas.concat(&inv.content_to_user_space);
    }

    // Push this mask onto the active-mask chain so any descendant or
    // chained reference back to it is detected as a cycle and treated
    // as `mask: none` per CSS Masking 1.
    let mask_frame = super::scoped_svg_paint_state::MaskFrame {
        mask_id: inv.mask_id,
        parent: ctx.mask_chain,
    };
    let deeper = ctx.with_deeper_mask().with_mask_chain(&mask_frame);
    let mask_node = ctx.dom.node(inv.mask_id);
    let chained = if deeper.mask_depth >= MAX_MASK_DEPTH {
        None
    } else {
        get_attr(mask_node, "mask")
            .map(str::trim)
            .filter(|v| !v.is_empty() && *v != "none")
            .and_then(parse_url_ref)
            .and_then(|id| ctx.resources.lookup(id))
            // Reject the chained mask if applying it would close a
            // mask-reference cycle. Direct self-reference is `target
            // is in chain`; mutual / longer cycles need a transitive
            // walk through `mask=` attrs on each mask element.
            .filter(|target| !chained_mask_would_cycle(ctx, *target, &mask_frame))
            .and_then(|target| {
                let bbox = element_object_bbox(ctx.dom, mask_node);
                masker::resolve(ctx.dom, target, bbox)
            })
    };
    if let Some(chained_inv) = chained {
        // Open a content layer for the mask's own painting, paint
        // children into it, then composite chained_inv as alpha onto
        // that layer.
        canvas.save_layer(&skia_safe::canvas::SaveLayerRec::default());
        paint_children(canvas, &deeper, inv.mask_id);
        apply_mask(canvas, &deeper, &chained_inv);
        canvas.restore();
    } else {
        paint_children(canvas, &deeper, inv.mask_id);
    }

    canvas.restore();
}

/// Walk a candidate chained-mask target's `mask=` chain and return
/// true if any node along the way is already in `chain` (or appears
/// twice in the walk itself). Catches mutual `<mask a mask=#b>` /
/// `<mask b mask=#a>` cycles and longer rings that the immediate
/// `chain.contains(target)` check misses.
fn chained_mask_would_cycle(
    ctx: &PaintCtx<'_>,
    target: csscascade::dom::NodeId,
    chain: &super::scoped_svg_paint_state::MaskFrame<'_>,
) -> bool {
    let mut cur = target;
    let mut visited: Vec<csscascade::dom::NodeId> = Vec::new();
    for _ in 0..super::scoped_svg_paint_state::MAX_MASK_DEPTH as usize + 4 {
        if chain.contains(cur) || visited.contains(&cur) {
            return true;
        }
        visited.push(cur);
        let n = ctx.dom.node(cur);
        let Some(raw) = get_attr(n, "mask") else {
            return false;
        };
        let raw = raw.trim();
        if raw.is_empty() || raw.eq_ignore_ascii_case("none") {
            return false;
        }
        let Some(id) = parse_url_ref(raw) else {
            return false;
        };
        let Some(next) = ctx.resources.lookup(id) else {
            return false;
        };
        cur = next;
    }
    // Walk exceeded its bound — be conservative and treat as a cycle.
    true
}
