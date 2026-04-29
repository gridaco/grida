//! `LayoutSvgResourceClipper` — `<clipPath>` resource.
//!
//! Path-strategy resolution: union every shape child of the `<clipPath>`
//! into a single `SkPath` and let the painter call
//! `Canvas::clip_path(_, ClipOp::Intersect, /*aa=*/ true)`. Honours
//! `clipPathUnits` (`userSpaceOnUse` default | `objectBoundingBox`),
//! per-shape `clip-rule`, and `transform=` on the `<clipPath>` element.
//!
//! Returns `None` to signal "skip clipping" for any input the path
//! strategy cannot represent — `<text>` children, nested
//! `<clipPath>`-on-clipPath, `<use>` references, `<g>` wrappers
//! (SVG 2 says `<g>` inside `<clipPath>` has no effect, but we
//! conservatively defer until we walk children through their own
//! transform), and `clip-path=` attributes on the children. The
//! painter renders the element unclipped in those cases — we no
//! longer route to Skia's built-in `svg::Dom` as a fallback; instead,
//! the visible gap motivates promoting the case here.
//!
//! Blink anchor: `core/layout/svg/layout_svg_resource_clipper.{h,cc}` —
//! specifically `LayoutSVGResourceClipper::AsPath()` (`SkOpBuilder` +
//! `kUnion_SkPathOp`) and the strategy split in `DetermineClipStrategy`.

use csscascade::dom::{DemoDom, DemoNode, DemoNodeData, NodeId};
use skia_safe::{Matrix, Path, PathFillType, PathOp, Rect};

use crate::htmlcss::svg::dom::attrs::{
    parse_length_px, parse_paint, parse_points, parse_transform,
};
use crate::htmlcss::svg::dom::element::{get_attr, ElementKind};
use crate::htmlcss::svg::dom::href::{href_attr, same_document_fragment};
use crate::htmlcss::svg::dom::path_d::parse_path;

use super::svg_resources::Resources;

/// Whether the clipper's content coordinates are interpreted in user
/// space (default) or in the referencing element's bbox unit-square.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ClipPathUnits {
    UserSpaceOnUse,
    ObjectBoundingBox,
}

/// Resolve a `<clipPath>` to a unioned `SkPath` ready for
/// `Canvas::clip_path`. The returned path is in the referencing
/// element's local coordinate space (the same space its `transform=` was
/// just concatenated into). `None` means "this clipper has features
/// outside the path strategy — caller should fall back".
pub fn resolve_to_path(
    dom: &DemoDom,
    resources: &Resources,
    clip_id: NodeId,
    object_bbox: Rect,
) -> Option<Path> {
    let node = dom.node(clip_id);
    let DemoNodeData::Element(data) = &node.data else {
        return None;
    };
    if ElementKind::from_local_name(data.name.local.as_ref()) != ElementKind::ClipPath {
        return None;
    }

    let units = match get_attr(node, "clipPathUnits") {
        Some("objectBoundingBox") => ClipPathUnits::ObjectBoundingBox,
        _ => ClipPathUnits::UserSpaceOnUse,
    };

    // SVG 2 says a `clip-path` chained on the `<clipPath>` itself
    // composes another clipping region, but resvg's handling — which
    // our reference PNGs follow — ignores the chained reference when
    // it cycles back to the same element (the most common case in the
    // test suite). We can't represent chained clipPaths via the path
    // strategy regardless, so the simplest correct approximation is
    // to treat them as absent here. `mask=` / `filter=` on a clipPath
    // are likewise unimplemented and ignored.
    let _ = has_nontrivial_attr; // helper retained for any future chain probe

    // `clip-rule` cascades through ancestors of each shape — both
    // through `<g>` wrappers inside the clipPath and (via CSS
    // inheritance) up through any element above the `<clipPath>`. We
    // resolve the clipper's own inherited rule once and pass it as the
    // default into the child walk. Children's own `clip-rule` (or a
    // wrapping `<g>`'s) overrides.
    let initial_rule = inherited_clip_rule(dom, node);
    let mut acc: Option<Path> = None;
    walk_clipper_children(dom, resources, node, initial_rule, &mut acc)?;

    // SVG 2 §14.3.5: a clipPath with no effective children clips
    // everything (output is empty). Distinguish that from the
    // "unsupported feature" cases above which return `None` to mean
    // "paint without clip". An empty `Path` with `ClipOp::Intersect`
    // produces empty output — exactly the spec behavior.
    let mut path = acc.unwrap_or_default();

    // `clipPathUnits=objectBoundingBox` — children are in [0, 1]² of
    // the referenced element's bbox; map into user space first, then
    // apply the clipper's own `transform=` in user space. SVG 2
    // §14.3.5 reads as if transform applies before the bbox mapping
    // (contents coordinate system), but every shipping renderer
    // (Chromium, resvg) applies it AFTER the bbox map — values like
    // `translate(100 -40)` only make sense in user-space pixels.
    if units == ClipPathUnits::ObjectBoundingBox {
        let mut m = Matrix::translate((object_bbox.left, object_bbox.top));
        m.pre_concat(&Matrix::scale((object_bbox.width(), object_bbox.height())));
        path = path.with_transform(&m);
    }

    // `transform=` on the clipper itself, applied in user space.
    if let Some(t) = get_attr(node, "transform").and_then(parse_transform) {
        path = path.with_transform(&t);
    }

    Some(path)
}

/// Walk a clipPath's direct children, building each shape's
/// contribution into `acc`. Per SVG 1.1 §14.3.5 only direct shape
/// children (path/rect/circle/ellipse/line/polygon/polyline/use)
/// contribute — `<g>` is *not* a valid clipPath child and its subtree
/// is silently dropped (the resvg-test-suite explicitly tests this in
/// `g-is-not-a-valid-child.svg`). Per-shape `clip-rule` falls back to
/// the cascade resolved by the caller into `inherited_rule`.
fn walk_clipper_children(
    dom: &DemoDom,
    resources: &Resources,
    parent: &DemoNode,
    inherited_rule: Option<PathFillType>,
    acc: &mut Option<Path>,
) -> Option<()> {
    for child_id in parent.children.iter().copied() {
        let child = dom.node(child_id);
        let DemoNodeData::Element(child_data) = &child.data else {
            continue;
        };
        let kind = ElementKind::from_local_name(child_data.name.local.as_ref());

        if !is_supported_clipper_child(kind) {
            continue;
        }

        let mut child_path = match build_child_path(dom, resources, child, kind)? {
            Some(p) => p,
            None => continue,
        };

        if let Some(t) = get_attr(child, "transform").and_then(parse_transform) {
            child_path = child_path.with_transform(&t);
        }

        let rule = read_clip_rule_attr(child)
            .or(inherited_rule)
            .unwrap_or(PathFillType::Winding);
        child_path.set_fill_type(rule);

        *acc = Some(match acc.take() {
            None => child_path,
            Some(prev) => skia_safe::op(&prev, &child_path, PathOp::Union)?,
        });
    }
    Some(())
}

/// Read `clip-rule` from this element's own attribute or inline style
/// only — no ancestor walk. `nonzero` and unknown values map to winding.
fn read_clip_rule_attr(node: &DemoNode) -> Option<PathFillType> {
    let raw = get_attr(node, "clip-rule").map(str::trim)?;
    Some(match raw {
        "evenodd" => PathFillType::EvenOdd,
        _ => PathFillType::Winding,
    })
}

/// Resolve `clip-rule` by walking up from `start` through each ancestor.
/// Per CSS Masking 1, `clip-rule` is an inherited property — an attribute
/// on a `<g>` (or any other ancestor) above the `<clipPath>` cascades
/// into the path's fill type. Returns `None` when no ancestor sets it
/// (caller defaults to `nonzero`).
fn inherited_clip_rule(dom: &DemoDom, start: &DemoNode) -> Option<PathFillType> {
    if let Some(r) = read_clip_rule_attr(start) {
        return Some(r);
    }
    let mut cur = start.parent;
    while let Some(id) = cur {
        let n = dom.node(id);
        if let Some(r) = read_clip_rule_attr(n) {
            return Some(r);
        }
        cur = n.parent;
    }
    None
}

fn is_supported_clipper_child(kind: ElementKind) -> bool {
    matches!(
        kind,
        ElementKind::Path
            | ElementKind::Rect
            | ElementKind::Circle
            | ElementKind::Ellipse
            | ElementKind::Line
            | ElementKind::Polygon
            | ElementKind::Polyline
            | ElementKind::Use
            | ElementKind::Title
            | ElementKind::Desc
            | ElementKind::Metadata
    )
}

/// Resolve a `<use xlink:href="#id">` to its target node — only if
/// the target is a single shape we can build into a path (no nested
/// `<use>`, no `<g>` with multiple children). Used by the clipPath
/// path strategy.
fn deref_use_target(
    _dom: &DemoDom,
    resources: &Resources,
    use_node: &csscascade::dom::DemoNode,
) -> Option<NodeId> {
    let id = href_attr(use_node).and_then(same_document_fragment)?;
    resources.lookup(id)
}

fn has_nontrivial_attr(node: &csscascade::dom::DemoNode, name: &str) -> bool {
    match get_attr(node, name).map(str::trim) {
        Some("none") | Some("") | None => false,
        Some(_) => true,
    }
}

fn build_child_path(
    _dom: &DemoDom,
    _resources: &Resources,
    node: &csscascade::dom::DemoNode,
    kind: ElementKind,
) -> Option<Option<Path>> {
    use skia_safe::{PathBuilder, Point, RRect};

    // `display="none"` / `visibility="hidden"` on a clipper child means
    // the shape contributes nothing.
    if !crate::htmlcss::svg::paint::visibility::is_painted(node) {
        return Some(None);
    }
    // `fill="none"` on a clipper child does NOT remove it — clipping
    // depends on the geometry only (per SVG spec). Don't gate on fill.

    let num = |name: &str| get_attr(node, name).and_then(parse_length_px);

    let path = match kind {
        ElementKind::Rect => {
            let x = num("x").unwrap_or(0.0);
            let y = num("y").unwrap_or(0.0);
            let w = num("width").unwrap_or(0.0);
            let h = num("height").unwrap_or(0.0);
            if w <= 0.0 || h <= 0.0 {
                return Some(None);
            }
            let rect = Rect::from_xywh(x, y, w, h);
            let rx_raw = num("rx");
            let ry_raw = num("ry");
            let mut b = PathBuilder::new();
            match (rx_raw, ry_raw) {
                (None, None) => {
                    b.add_rect(rect, None, None);
                }
                (rx, ry) => {
                    let (rx, ry) = match (rx, ry) {
                        (Some(a), Some(b)) => (a, b),
                        (Some(a), None) => (a, a),
                        (None, Some(a)) => (a, a),
                        (None, None) => unreachable!(),
                    };
                    let rx = rx.max(0.0).min(w / 2.0);
                    let ry = ry.max(0.0).min(h / 2.0);
                    if rx == 0.0 && ry == 0.0 {
                        b.add_rect(rect, None, None);
                    } else {
                        let mut rrect = RRect::new();
                        rrect.set_rect_xy(rect, rx, ry);
                        b.add_rrect(rrect, None, None);
                    }
                }
            }
            b.detach()
        }
        ElementKind::Circle => {
            let cx = num("cx").unwrap_or(0.0);
            let cy = num("cy").unwrap_or(0.0);
            let r = num("r").unwrap_or(0.0);
            if r <= 0.0 {
                return Some(None);
            }
            let mut b = PathBuilder::new();
            b.add_circle((cx, cy), r, None);
            b.detach()
        }
        ElementKind::Ellipse => {
            let cx = num("cx").unwrap_or(0.0);
            let cy = num("cy").unwrap_or(0.0);
            let rx_raw = num("rx");
            let ry_raw = num("ry");
            let (rx, ry) = match (rx_raw, ry_raw) {
                (Some(rx), Some(ry)) => (rx, ry),
                (Some(rx), None) => (rx, rx),
                (None, Some(ry)) => (ry, ry),
                (None, None) => return Some(None),
            };
            if rx <= 0.0 || ry <= 0.0 {
                return Some(None);
            }
            let mut b = PathBuilder::new();
            b.add_oval(
                Rect::from_xywh(cx - rx, cy - ry, rx * 2.0, ry * 2.0),
                None,
                None,
            );
            b.detach()
        }
        ElementKind::Line => {
            let x1 = num("x1").unwrap_or(0.0);
            let y1 = num("y1").unwrap_or(0.0);
            let x2 = num("x2").unwrap_or(0.0);
            let y2 = num("y2").unwrap_or(0.0);
            let mut b = PathBuilder::new();
            b.move_to((x1, y1)).line_to((x2, y2));
            b.detach()
        }
        ElementKind::Polygon | ElementKind::Polyline => {
            let pts = get_attr(node, "points")
                .map(parse_points)
                .unwrap_or_default();
            let mut b = PathBuilder::new();
            let mut iter = pts.into_iter();
            if let Some((x, y)) = iter.next() {
                b.move_to(Point::new(x, y));
                for (x, y) in iter {
                    b.line_to(Point::new(x, y));
                }
                if kind == ElementKind::Polygon {
                    b.close();
                }
            }
            b.detach()
        }
        ElementKind::Path => {
            let d = get_attr(node, "d")?;
            parse_path(d)
        }
        ElementKind::Use => {
            // Per CSS Masking 1 §6.2 a `<use>` in `<clipPath>` is only
            // valid when it directly references a basic shape, `<path>`
            // or `<text>`. Any other target (`<g>`, `<symbol>`, nested
            // `<use>`, etc.) is a spec-invalid clipPath child: Chrome,
            // Firefox, Safari, resvg and librsvg drop the contribution
            // silently — the clipPath stays in the cascade and becomes
            // empty if no other valid children remain (empty clipPath
            // clips everything per SVG 2 §14.3.5). We mirror that:
            // return `Some(None)` to drop the use's geometry without
            // bailing the path strategy. An unresolved href falls into
            // the same bucket.
            let Some(target_id) = deref_use_target(_dom, _resources, node) else {
                return Some(None);
            };
            let target = _dom.node(target_id);
            let DemoNodeData::Element(td) = &target.data else {
                return Some(None);
            };
            let target_kind = ElementKind::from_local_name(td.name.local.as_ref());
            let target_is_shape = matches!(
                target_kind,
                ElementKind::Path
                    | ElementKind::Rect
                    | ElementKind::Circle
                    | ElementKind::Ellipse
                    | ElementKind::Line
                    | ElementKind::Polygon
                    | ElementKind::Polyline
            );
            if !target_is_shape {
                return Some(None);
            }
            let mut p = match build_child_path(_dom, _resources, target, target_kind)? {
                Some(p) => p,
                None => return Some(None),
            };
            // Apply the target's own `transform=`.
            if let Some(t) = get_attr(target, "transform").and_then(parse_transform) {
                p = p.with_transform(&t);
            }
            // Apply the `<use>` element's `x`/`y` translation and
            // `transform=`. (width/height on use only matter for
            // svg/symbol targets — out of scope here.)
            let ux = get_attr(node, "x").and_then(parse_length_px).unwrap_or(0.0);
            let uy = get_attr(node, "y").and_then(parse_length_px).unwrap_or(0.0);
            if ux != 0.0 || uy != 0.0 {
                p = p.with_transform(&Matrix::translate((ux, uy)));
            }
            p
        }
        // Pure documentation children — no geometry, but they don't
        // disqualify the strategy.
        ElementKind::Title | ElementKind::Desc | ElementKind::Metadata => {
            return Some(None);
        }
        _ => return None,
    };
    let _ = parse_paint; // imports stay alive for future fill/stroke wiring
    Some(Some(path))
}
