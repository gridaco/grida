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
            .map(|path| *path.bounds())
            .unwrap_or_default(),
        ElementKind::G | ElementKind::Svg | ElementKind::Switch | ElementKind::Anchor => {
            let mut acc: Option<Rect> = None;
            for child_id in node.children.iter().copied() {
                let child = dom.node(child_id);
                if !matches!(&child.data, DemoNodeData::Element(_)) {
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

fn apply_node_transform(node: &DemoNode, r: Rect) -> Rect {
    let Some(t) = get_attr(node, "transform").and_then(parse_transform) else {
        return r;
    };
    t.map_rect(r).0
}
