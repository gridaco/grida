//! `url(#id)` paint-server resolution.
//!
//! Given a paint string (`fill` / `stroke`), look up the referenced
//! resource and produce a [`skia_safe::Shader`]. Falls back to the paint
//! string's solid-color portion (e.g. `url(#grad) red`) when resolution
//! fails — Blink does the same.
//!
//! Blink anchor: `core/svg/svg_resources_cache.{h,cc}` and the per-server
//! `SVGResource*::CreatePaintServer`.

use csscascade::dom::{DemoDom, NodeId};
use skia_safe::{Rect, Shader};

use super::gradient;
use super::svg_resources::{parse_url_ref, Resources};
use crate::htmlcss::svg::dom::element::ElementKind;

/// Resolution result for a `fill` / `stroke` value containing
/// `url(#id)`.
pub enum Resolved {
    Shader(Shader),
    /// Deferred pattern resolution. The caller must complete it via
    /// `resources::pattern::build_shader` once it has the painter
    /// context (DOM walks aren't possible without paint context).
    /// Carries the `<pattern>` node and the referencing element's
    /// bounding box for `patternUnits="objectBoundingBox"` resolution.
    Pattern {
        node: NodeId,
        bbox: Rect,
    },
    NotFound,
}

pub fn resolve(
    dom: &DemoDom,
    resources: &Resources,
    paint_value: &str,
    object_bbox: Rect,
    viewport: (f32, f32),
) -> Option<Resolved> {
    let id = parse_url_ref(paint_id_only(paint_value))?;
    let target = resources.lookup(id)?;
    Some(resolve_node(dom, resources, target, object_bbox, viewport))
}

pub fn resolve_node(
    dom: &DemoDom,
    resources: &Resources,
    target: NodeId,
    object_bbox: Rect,
    viewport: (f32, f32),
) -> Resolved {
    let node = dom.node(target);
    let csscascade::dom::DemoNodeData::Element(data) = &node.data else {
        return Resolved::NotFound;
    };
    let kind = ElementKind::from_local_name(data.name.local.as_ref());
    match kind {
        ElementKind::LinearGradient | ElementKind::RadialGradient => {
            match gradient::resolve_to_shader(dom, resources, target, object_bbox, viewport) {
                Some(s) => Resolved::Shader(s),
                None => Resolved::NotFound,
            }
        }
        ElementKind::Pattern => Resolved::Pattern {
            node: target,
            bbox: object_bbox,
        },
        _ => Resolved::NotFound,
    }
}

/// Strip the trailing fallback color from a paint expression, e.g.
/// `url(#g) red` → `url(#g)`. Used so [`parse_url_ref`] sees just the
/// ref part.
fn paint_id_only(s: &str) -> &str {
    let s = s.trim_start();
    if let Some(end) = s.find(')') {
        &s[..=end]
    } else {
        s
    }
}

/// Extract the optional fallback color from a paint expression like
/// `url(#g) red`. Returns the trimmed remainder, if any.
pub fn paint_fallback(s: &str) -> Option<&str> {
    let s = s.trim_start();
    let end = s.find(')')?;
    let rest = s[end + 1..].trim();
    if rest.is_empty() {
        None
    } else {
        Some(rest)
    }
}
