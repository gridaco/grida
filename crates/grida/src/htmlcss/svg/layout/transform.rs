//! SVG transform helpers.

use csscascade::dom::DemoNode;
use skia_safe::Matrix;

use crate::htmlcss::svg::dom::attrs::parse_length_px;
use crate::htmlcss::svg::layout::bbox::element_object_bbox;
use crate::htmlcss::svg::layout::viewport::viewport_box_for;
use crate::htmlcss::svg::paint::scoped_svg_paint_state::PaintCtx;
use crate::htmlcss::svg::style::cascade::get_attr_or_style;

/// Wrap `m` so it is applied around `origin` per CSS Transforms 1 §3.5:
/// `translate(o) * m * translate(-o)`. Returns `m` unchanged when
/// `origin == (0, 0)`.
pub(crate) fn wrap_with_origin(m: &Matrix, origin: (f32, f32)) -> Matrix {
    if origin == (0.0, 0.0) {
        return *m;
    }
    let mut wrapped = Matrix::translate(origin);
    wrapped.pre_concat(m);
    wrapped.pre_concat(&Matrix::translate((-origin.0, -origin.1)));
    wrapped
}

pub(crate) fn transform_origin_for(ctx: &PaintCtx<'_>, node: &DemoNode) -> (f32, f32) {
    let raw = get_attr_or_style(node, "transform-origin");
    let Some(raw) = raw else { return (0.0, 0.0) };

    let transform_box = get_attr_or_style(node, "transform-box");
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

    parse_transform_origin(&raw, (rx, ry, rw, rh))
}

/// Resolve the `transform-origin` / `transform-box` declarations on
/// `node` against an explicit reference box `(rx, ry, rw, rh)`. The
/// box is the coordinate system in which the resulting origin will be
/// applied — for `<pattern>` / `<linearGradient>` /
/// `<radialGradient>` with `gradientUnits=objectBoundingBox` (or the
/// pattern equivalent) that's the tile / unit-bbox space, not the
/// element's SVG viewport. Returns `(0, 0)` when no `transform-origin`
/// is set.
pub(crate) fn transform_origin_in_box(
    node: &DemoNode,
    ref_box: (f32, f32, f32, f32),
) -> (f32, f32) {
    let Some(raw) = get_attr_or_style(node, "transform-origin") else {
        return (0.0, 0.0);
    };
    parse_transform_origin(&raw, ref_box)
}

fn parse_transform_origin(raw: &str, ref_box: (f32, f32, f32, f32)) -> (f32, f32) {
    let (rx, ry, rw, rh) = ref_box;
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
