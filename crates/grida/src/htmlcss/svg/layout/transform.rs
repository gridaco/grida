//! SVG transform helpers.

use csscascade::dom::DemoNode;

use crate::htmlcss::svg::dom::attrs::parse_length_px;
use crate::htmlcss::svg::dom::element::get_attr;
use crate::htmlcss::svg::layout::bbox::element_object_bbox;
use crate::htmlcss::svg::layout::viewport::viewport_box_for;
use crate::htmlcss::svg::paint::scoped_svg_paint_state::PaintCtx;

pub(crate) fn transform_origin_for(ctx: &PaintCtx<'_>, node: &DemoNode) -> (f32, f32) {
    let raw = read_attr_or_style(node, "transform-origin");
    let Some(raw) = raw else { return (0.0, 0.0) };

    let transform_box = read_attr_or_style(node, "transform-box");
    let use_fill_box = transform_box
        .as_deref()
        .map(str::trim)
        .map(|s| s.eq_ignore_ascii_case("fill-box"))
        .unwrap_or(false);

    let (rx, ry, rw, rh) = if use_fill_box {
        let b = element_object_bbox(ctx.dom, node);
        (b.left, b.top, b.width(), b.height())
    } else {
        viewport_box_for(ctx, node)
    };

    let tokens: Vec<&str> = raw.split_ascii_whitespace().collect();
    let parse_axis = |tok: &str, axis_size: f32, axis_origin: f32| -> Option<f32> {
        let t = tok.trim();
        match t.to_ascii_lowercase().as_str() {
            "left" => Some(axis_origin),
            "right" => Some(axis_origin + axis_size),
            "top" => Some(axis_origin),
            "bottom" => Some(axis_origin + axis_size),
            "center" => Some(axis_origin + axis_size / 2.0),
            _ => {
                if let Some(p) = t.strip_suffix('%') {
                    p.trim()
                        .parse::<f32>()
                        .ok()
                        .map(|v| axis_origin + (v / 100.0) * axis_size)
                } else {
                    parse_length_px(t).map(|v| axis_origin + v)
                }
            }
        }
    };

    match tokens.as_slice() {
        [single] => {
            let lower = single.to_ascii_lowercase();
            match lower.as_str() {
                "center" => (rx + rw / 2.0, ry + rh / 2.0),
                "top" => (rx + rw / 2.0, ry),
                "bottom" => (rx + rw / 2.0, ry + rh),
                "left" => (rx, ry + rh / 2.0),
                "right" => (rx + rw, ry + rh / 2.0),
                _ => {
                    let cx = parse_axis(single, rw, rx).unwrap_or(rx + rw / 2.0);
                    (cx, ry + rh / 2.0)
                }
            }
        }
        [a, b, ..] => {
            let cx = parse_axis(a, rw, rx).unwrap_or(rx + rw / 2.0);
            let cy = parse_axis(b, rh, ry).unwrap_or(ry + rh / 2.0);
            (cx, cy)
        }
        _ => (0.0, 0.0),
    }
}

fn read_attr_or_style(node: &DemoNode, name: &str) -> Option<String> {
    if let Some(v) = get_attr(node, name) {
        return Some(v.to_string());
    }
    if let Some(style) = get_attr(node, "style") {
        for decl in style.split(';') {
            if let Some((k, v)) = decl.split_once(':') {
                if k.trim().eq_ignore_ascii_case(name) {
                    return Some(v.trim().to_string());
                }
            }
        }
    }
    None
}
