//! `LayoutSvgResourceMasker` — `<mask>` resource.
//!
//! Resolves a `<mask>` reference into the metadata the painter needs to
//! open content + mask layers in Blink's order: an outer content layer
//! (default paint), an inner mask layer with `BlendMode::DstIn` (and
//! `ColorFilters::luma()` for `mask-type=luminance`), clipped to the
//! mask region, then walking the mask children with `maskContentUnits`
//! applied.
//!
//! Honours: `maskUnits` (default `objectBoundingBox`), `maskContentUnits`
//! (default `userSpaceOnUse`), `mask-type` / `mask-mode` (`luminance`
//! default, `alpha` available, `invalid` falls back to `luminance`),
//! and `x` / `y` / `width` / `height` (defaults `-10%, -10%, 120%, 120%`
//! in `maskUnits` space per SVG 1.1 §14.4).
//!
//! Blink anchor: `core/paint/svg_mask_painter.cc::PaintSVGMaskLayer`,
//! `core/layout/svg/layout_svg_resource_masker.cc::ResourceBoundingBox`.

use csscascade::dom::{DemoDom, DemoNodeData, NodeId};
use skia_safe::{Matrix, Rect};

use crate::htmlcss::svg::dom::attrs::parse_length_px;
use crate::htmlcss::svg::dom::element::{get_attr, ElementKind};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MaskType {
    /// SVG 2 default. The mask's RGB is converted to luminance and the
    /// resulting alpha is applied to the masked content. We model this
    /// as a `ColorFilters::luma()` on the mask layer's restore-paint.
    Luminance,
    /// `mask-type=alpha` — the mask's alpha channel is applied directly.
    Alpha,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Units {
    UserSpaceOnUse,
    ObjectBoundingBox,
}

/// Everything the painter needs to render a mask given the masked
/// element's bounding box.
#[derive(Debug, Clone)]
pub struct MaskInvocation {
    /// The `<mask>` element's NodeId — its children are the mask paint
    /// content.
    pub mask_id: NodeId,
    /// Mask region rect in *user space* (i.e. the same coordinate space
    /// the masked element's transform was just concatenated into).
    pub region_user_space: Rect,
    pub mask_type: MaskType,
    /// Pre-built transform from user space → mask-content space. Equals
    /// identity for `maskContentUnits=userSpaceOnUse` (the default), or
    /// the bbox-square mapping for `objectBoundingBox`.
    pub content_to_user_space: Matrix,
}

/// Resolve `<mask>` reference geometry against the masked element's
/// bbox. Returns `None` if the target isn't a `<mask>` element.
pub fn resolve(dom: &DemoDom, mask_id: NodeId, object_bbox: Rect) -> Option<MaskInvocation> {
    let node = dom.node(mask_id);
    let DemoNodeData::Element(data) = &node.data else {
        return None;
    };
    if ElementKind::from_local_name(data.name.local.as_ref()) != ElementKind::Mask {
        return None;
    }

    let units = match get_attr(node, "maskUnits") {
        Some("userSpaceOnUse") => Units::UserSpaceOnUse,
        // Default per SVG 1.1 §14.4.
        _ => Units::ObjectBoundingBox,
    };
    let content_units = match get_attr(node, "maskContentUnits") {
        Some("objectBoundingBox") => Units::ObjectBoundingBox,
        // Default per SVG 1.1 §14.4.
        _ => Units::UserSpaceOnUse,
    };

    // Region defaults: `-10%, -10%, 120%, 120%`. In `objectBoundingBox`
    // those are factors of the bbox; in `userSpaceOnUse` they're CSS
    // percentages of the SVG viewport which we don't have here — fall
    // back to the bbox so we still draw something sensible.
    let raw_x = get_attr(node, "x").and_then(parse_length_or_pct);
    let raw_y = get_attr(node, "y").and_then(parse_length_or_pct);
    let raw_w = get_attr(node, "width").and_then(parse_length_or_pct);
    let raw_h = get_attr(node, "height").and_then(parse_length_or_pct);

    let region_user_space = match units {
        Units::ObjectBoundingBox => {
            let (x, y, w, h) = (
                raw_x.unwrap_or(LengthOrPct::Pct(-10.0)),
                raw_y.unwrap_or(LengthOrPct::Pct(-10.0)),
                raw_w.unwrap_or(LengthOrPct::Pct(120.0)),
                raw_h.unwrap_or(LengthOrPct::Pct(120.0)),
            );
            let to_unit = |v: LengthOrPct| match v {
                LengthOrPct::Px(n) => n,
                LengthOrPct::Pct(p) => p / 100.0,
            };
            let ux = to_unit(x);
            let uy = to_unit(y);
            let uw = to_unit(w);
            let uh = to_unit(h);
            Rect::from_xywh(
                object_bbox.left + ux * object_bbox.width(),
                object_bbox.top + uy * object_bbox.height(),
                uw * object_bbox.width(),
                uh * object_bbox.height(),
            )
        }
        Units::UserSpaceOnUse => {
            let to_px = |v: LengthOrPct, fallback: f32| match v {
                LengthOrPct::Px(n) => n,
                LengthOrPct::Pct(_) => fallback,
            };
            let x = raw_x
                .map(|v| to_px(v, object_bbox.left))
                .unwrap_or(object_bbox.left - 0.1 * object_bbox.width());
            let y = raw_y
                .map(|v| to_px(v, object_bbox.top))
                .unwrap_or(object_bbox.top - 0.1 * object_bbox.height());
            let w = raw_w
                .map(|v| to_px(v, object_bbox.width()))
                .unwrap_or(1.2 * object_bbox.width());
            let h = raw_h
                .map(|v| to_px(v, object_bbox.height()))
                .unwrap_or(1.2 * object_bbox.height());
            Rect::from_xywh(x, y, w, h)
        }
    };

    let content_to_user_space = match content_units {
        Units::UserSpaceOnUse => Matrix::new_identity(),
        Units::ObjectBoundingBox => {
            let mut m = Matrix::translate((object_bbox.left, object_bbox.top));
            m.pre_concat(&Matrix::scale((object_bbox.width(), object_bbox.height())));
            m
        }
    };

    let mask_type = parse_mask_type(node);

    Some(MaskInvocation {
        mask_id,
        region_user_space,
        mask_type,
        content_to_user_space,
    })
}

fn parse_mask_type(node: &csscascade::dom::DemoNode) -> MaskType {
    // `mask-type` attribute first, then `style="mask-type:..."`. Per
    // SVG 2 §14.4 the keyword `alpha` maps to alpha, anything else
    // (including `invalid`) falls through to luminance.
    let raw = get_attr(node, "mask-type").or_else(|| {
        get_attr(node, "style").and_then(|s| {
            for d in s.split(';') {
                if let Some((k, v)) = d.split_once(':') {
                    if k.trim().eq_ignore_ascii_case("mask-type") {
                        return Some(v.trim());
                    }
                }
            }
            None
        })
    });
    match raw.map(str::trim) {
        Some(s) if s.eq_ignore_ascii_case("alpha") => MaskType::Alpha,
        _ => MaskType::Luminance,
    }
}

#[derive(Debug, Clone, Copy)]
enum LengthOrPct {
    Px(f32),
    Pct(f32),
}

fn parse_length_or_pct(s: &str) -> Option<LengthOrPct> {
    let s = s.trim();
    if let Some(p) = s.strip_suffix('%') {
        p.trim().parse::<f32>().ok().map(LengthOrPct::Pct)
    } else {
        parse_length_px(s).map(LengthOrPct::Px)
    }
}
