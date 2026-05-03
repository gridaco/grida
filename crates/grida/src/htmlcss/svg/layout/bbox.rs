//! Object-bounding-box helpers for the current direct renderer.
//!
//! In the eventual render-tree pipeline this belongs to layout. Keeping
//! it here now removes geometry ownership from painters and gives
//! clip/mask/filter code one shared bbox implementation.

use csscascade::dom::{DemoDom, DemoNode, DemoNodeData};
use skia_safe::Rect;

use crate::htmlcss::svg::dom::attrs::{parse_length_px, parse_points, parse_transform};
use crate::htmlcss::svg::dom::element::{get_attr, ElementKind};

pub(crate) fn element_object_bbox(dom: &DemoDom, node: &DemoNode) -> Rect {
    let DemoNodeData::Element(data) = &node.data else {
        return Rect::default();
    };
    let kind = ElementKind::from_local_name(data.name.local.as_ref());
    let num = |name: &str| get_attr(node, name).and_then(parse_length_px);

    match kind {
        ElementKind::Rect => Rect::from_xywh(
            num("x").unwrap_or(0.0),
            num("y").unwrap_or(0.0),
            num("width").unwrap_or(0.0),
            num("height").unwrap_or(0.0),
        ),
        ElementKind::Circle => {
            let cx = num("cx").unwrap_or(0.0);
            let cy = num("cy").unwrap_or(0.0);
            let r = num("r").unwrap_or(0.0);
            Rect::from_xywh(cx - r, cy - r, r * 2.0, r * 2.0)
        }
        ElementKind::Ellipse => {
            let cx = num("cx").unwrap_or(0.0);
            let cy = num("cy").unwrap_or(0.0);
            let rx = num("rx").unwrap_or(0.0);
            let ry = num("ry").unwrap_or(0.0);
            Rect::from_xywh(cx - rx, cy - ry, rx * 2.0, ry * 2.0)
        }
        ElementKind::Line => {
            let x1 = num("x1").unwrap_or(0.0);
            let y1 = num("y1").unwrap_or(0.0);
            let x2 = num("x2").unwrap_or(0.0);
            let y2 = num("y2").unwrap_or(0.0);
            Rect::new(x1.min(x2), y1.min(y2), x1.max(x2), y1.max(y2))
        }
        ElementKind::Polyline | ElementKind::Polygon => {
            let pts = get_attr(node, "points")
                .map(parse_points)
                .unwrap_or_default();
            if pts.is_empty() {
                return Rect::default();
            }
            let (mut minx, mut miny) = pts[0];
            let mut maxx = minx;
            let mut maxy = miny;
            for (x, y) in pts.into_iter().skip(1) {
                minx = minx.min(x);
                miny = miny.min(y);
                maxx = maxx.max(x);
                maxy = maxy.max(y);
            }
            Rect::new(minx, miny, maxx, maxy)
        }
        ElementKind::Path => get_attr(node, "d")
            .map(crate::htmlcss::svg::dom::path_d::parse_path)
            .map(|path| {
                // SVG 2 §6.13: a path's object bounding box is the
                // tight bbox of the rendered geometry — control
                // points DO NOT contribute. Skia `path.bounds()`
                // returns the loose (control-point) bbox; use
                // `compute_tight_bounds()` for the spec value.
                // `filters_filter_path-bbox.svg` documents this with
                // a Q curve whose control point sits above the
                // actual rendered apex.
                path.compute_tight_bounds()
            })
            .unwrap_or_default(),
        ElementKind::Text => {
            // Coarse approximation of `<text>`'s object bounding box —
            // glyph-precise bbox needs the painter's shaping pass, but
            // clip-path / mask / filter resolution against
            // `objectBoundingBox` only needs a non-degenerate rect of
            // the right rough size. Width ≈ char-count × 0.5em (typical
            // English-text average advance), height ≈ 1em vertical
            // extent centered on the alphabetic baseline. Without this
            // text bbox stayed at zero and any `clipPathUnits=
            // objectBoundingBox` reference (or oBB gradient/pattern)
            // collapsed to nothing.
            let x = num("x").unwrap_or(0.0);
            let y = num("y").unwrap_or(0.0);
            let font_size = get_attr(node, "font-size")
                .and_then(parse_length_px)
                .unwrap_or(16.0);
            let chars = collect_text_chars(dom, node);
            if chars == 0 {
                return Rect::default();
            }
            let width = chars as f32 * 0.5 * font_size;
            let ascent = 0.8 * font_size;
            let descent = 0.2 * font_size;
            Rect::new(x, y - ascent, x + width, y + descent)
        }
        ElementKind::G | ElementKind::Svg | ElementKind::Switch | ElementKind::Anchor => {
            let mut acc: Option<Rect> = None;
            for child_id in node.children.iter().copied() {
                let child = dom.node(child_id);
                if !matches!(&child.data, DemoNodeData::Element(_)) {
                    continue;
                }
                // SVG 2 §11.4: a `display:none` element does not
                // contribute to its parent's bbox. The
                // `painting_display_bBox-impact.svg` fixture asserts
                // this — a display:none rect inside a clip-path'd
                // group must not enlarge the clip's reference bbox.
                if super::super::paint::visibility::has_display_none(child) {
                    continue;
                }
                let r = element_object_bbox(dom, child);
                if r.is_empty() {
                    continue;
                }
                let r = apply_node_transform(child, r);
                acc = Some(match acc {
                    None => r,
                    Some(mut a) => {
                        a.join(r);
                        a
                    }
                });
            }
            acc.unwrap_or_default()
        }
        _ => Rect::default(),
    }
}

/// Total visible character count under a `<text>` / `<tspan>` /
/// `<textPath>` subtree. Used to size the coarse text bbox. Mirrors
/// the painter's whitespace handling at the structural level — every
/// non-whitespace char counts; runs of whitespace collapse to one.
fn collect_text_chars(dom: &DemoDom, node: &DemoNode) -> usize {
    let mut count = 0usize;
    let mut last_was_space = true;
    walk_text_chars(dom, node, &mut count, &mut last_was_space);
    count
}

fn walk_text_chars(dom: &DemoDom, node: &DemoNode, count: &mut usize, last_space: &mut bool) {
    for &cid in &node.children {
        let child = dom.node(cid);
        match &child.data {
            DemoNodeData::Text(s) => {
                for ch in s.chars() {
                    let is_space = ch.is_whitespace();
                    if is_space {
                        if !*last_space {
                            *count += 1;
                        }
                        *last_space = true;
                    } else {
                        *count += 1;
                        *last_space = false;
                    }
                }
            }
            DemoNodeData::Element(_) => {
                walk_text_chars(dom, child, count, last_space);
            }
            _ => {}
        }
    }
}

fn apply_node_transform(node: &DemoNode, r: Rect) -> Rect {
    let Some(t) = get_attr(node, "transform").and_then(parse_transform) else {
        return r;
    };
    t.map_rect(r).0
}
