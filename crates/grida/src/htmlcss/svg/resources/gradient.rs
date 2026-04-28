//! `<linearGradient>` / `<radialGradient>` → `skia_safe::Shader`.
//!
//! Honours: stops (`<stop>` children with `offset` and `stop-color` /
//! `stop-opacity`), `gradientUnits` (`userSpaceOnUse` /
//! `objectBoundingBox`), `gradientTransform`, `spreadMethod` (`pad` /
//! `reflect` / `repeat`), and the `xlink:href` / `href` chain that lets
//! one gradient inherit stops or geometry from another.
//!
//! Blink anchor: `core/layout/svg/layout_svg_resource_linear_gradient.cc`
//! and `*radial_gradient.cc`.

use csscascade::dom::{DemoDom, DemoNodeData, NodeId};
use skia_safe::{gradient_shader, Color, Color4f, Matrix, Point, Rect, Shader, TileMode};

use crate::htmlcss::svg::dom::attrs::{
    parse_color, parse_length_px, parse_paint, parse_transform, Paint,
};
use crate::htmlcss::svg::dom::element::{get_attr, ElementKind};
use crate::htmlcss::svg::dom::href::{href_attr, same_document_fragment};

use super::svg_resources::Resources;

#[derive(Debug, Clone, Copy)]
pub enum GradientUnits {
    UserSpaceOnUse,
    ObjectBoundingBox,
}

#[derive(Debug, Clone)]
struct Stop {
    offset: f32,
    color: Color,
    opacity: f32,
}

struct GradientCommon {
    units: GradientUnits,
    transform: Matrix,
    tile: TileMode,
    stops: Vec<Stop>,
}

pub fn resolve_to_shader(
    dom: &DemoDom,
    resources: &Resources,
    grad_id: NodeId,
    object_bbox: Rect,
    viewport: (f32, f32),
) -> Option<Shader> {
    let node = dom.node(grad_id);
    let DemoNodeData::Element(data) = &node.data else {
        return None;
    };
    let kind = ElementKind::from_local_name(data.name.local.as_ref());
    let chain = build_inheritance_chain(dom, resources, grad_id);
    let common = resolve_common(dom, &chain)?;

    let (offsets, colors): (Vec<f32>, Vec<Color4f>) = common
        .stops
        .iter()
        .map(|s| {
            let c = s.color;
            let alpha = (c.a() as f32 / 255.0) * s.opacity;
            let c4 = Color4f::new(
                c.r() as f32 / 255.0,
                c.g() as f32 / 255.0,
                c.b() as f32 / 255.0,
                alpha,
            );
            (s.offset, c4)
        })
        .unzip();

    if colors.is_empty() {
        return None;
    }

    // Compose the local matrix: bbox-square → object-bounding-box if the
    // gradient is in objectBoundingBox units.
    let bbox_matrix = match common.units {
        GradientUnits::UserSpaceOnUse => Matrix::new_identity(),
        GradientUnits::ObjectBoundingBox => {
            let mut m = Matrix::translate((object_bbox.left, object_bbox.top));
            m.pre_concat(&Matrix::scale((object_bbox.width(), object_bbox.height())));
            m
        }
    };
    let local = Matrix::concat(&bbox_matrix, &common.transform);

    // NOTE: do NOT pass an explicit `Some(ColorSpace::new_srgb())` here.
    // skia-safe 0.93.x has a use-after-free in
    // `gradient_shader::{linear,radial,two_point_conical}` when the
    // interpolation color space is non-null: the second call with that
    // configuration corrupts heap state and triggers SIGSEGV / SIGTRAP
    // on macOS (visible only with the default malloc; `MallocNanoZone=0`
    // suppresses the symptom). Tracked upstream at
    // <https://github.com/rust-skia/rust-skia/issues/1281>. sRGB is the
    // default interpretation in Skia when no explicit space is given,
    // so passing `None` yields identical visual output.
    match kind {
        ElementKind::LinearGradient => {
            let (x1, y1, x2, y2) = resolve_linear_endpoints(dom, &chain, &common, viewport);
            gradient_shader::linear(
                (Point::new(x1, y1), Point::new(x2, y2)),
                gradient_shader::GradientShaderColors::ColorsInSpace(
                    &colors,
                    None::<skia_safe::ColorSpace>,
                ),
                Some(&offsets[..]),
                common.tile,
                None,
                Some(&local),
            )
        }
        ElementKind::RadialGradient => {
            let (cx, cy, r, fx, fy, fr) = resolve_radial_geometry(dom, &chain, &common, viewport);
            if r <= 0.0 {
                // SVG 1.1 §13.2.3 / SVG 2 §13.5: if `r == 0` the gradient
                // does not draw a gradient — the area is painted as a
                // single colour using the colour and opacity of the stop
                // at offset 1 (the last stop).
                let last = colors.last()?;
                return Some(skia_safe::shaders::color_in_space(
                    last,
                    skia_safe::ColorSpace::new_srgb(),
                ));
            }
            let center = Point::new(cx, cy);
            let focal = Point::new(fx, fy);
            if (focal - center).length() < 1e-6 && fr == 0.0 {
                gradient_shader::radial(
                    center,
                    r,
                    gradient_shader::GradientShaderColors::ColorsInSpace(
                        &colors,
                        None::<skia_safe::ColorSpace>,
                    ),
                    Some(&offsets[..]),
                    common.tile,
                    None,
                    Some(&local),
                )
            } else {
                gradient_shader::two_point_conical(
                    focal,
                    fr,
                    center,
                    r,
                    gradient_shader::GradientShaderColors::ColorsInSpace(
                        &colors,
                        None::<skia_safe::ColorSpace>,
                    ),
                    Some(&offsets[..]),
                    common.tile,
                    None,
                    Some(&local),
                )
            }
        }
        _ => None,
    }
}

/// Build the `xlink:href` chain for a gradient.
///
/// Per SVG 2 §13.2.4, the `href` of a gradient is only valid when the
/// target is itself a `<linearGradient>` or `<radialGradient>`. Any
/// non-gradient target makes the reference invalid (rendered "as if not
/// specified"), so we stop walking — that prevents stops or attributes
/// from being picked up off, e.g., a `<rect>` that happens to contain
/// `<stop>` children (resvg-test-suite
/// `paint-servers/{linear,radial}Gradient/stops-via-xlink-href-from-rect`).
fn build_inheritance_chain(dom: &DemoDom, resources: &Resources, start: NodeId) -> Vec<NodeId> {
    let mut out = vec![start];
    let mut seen = rustc_hash::FxHashSet::default();
    seen.insert(start);
    let mut cur = start;
    while let Some(href) = href_attr(dom.node(cur)) {
        let Some(target_id) = same_document_fragment(href).and_then(|s| resources.lookup(s)) else {
            break;
        };
        if !seen.insert(target_id) {
            break;
        }
        if !is_gradient_element(dom, target_id) {
            break;
        }
        out.push(target_id);
        cur = target_id;
    }
    out
}

fn is_gradient_element(dom: &DemoDom, id: NodeId) -> bool {
    matches!(
        node_kind(dom, id),
        Some(ElementKind::LinearGradient | ElementKind::RadialGradient)
    )
}

fn node_kind(dom: &DemoDom, id: NodeId) -> Option<ElementKind> {
    let DemoNodeData::Element(d) = &dom.node(id).data else {
        return None;
    };
    Some(ElementKind::from_local_name(d.name.local.as_ref()))
}

fn first_attr<'a>(dom: &'a DemoDom, chain: &[NodeId], name: &str) -> Option<&'a str> {
    for id in chain {
        if let Some(v) = get_attr(dom.node(*id), name) {
            return Some(v);
        }
    }
    None
}

/// Like [`first_attr`], but only consider chain entries whose element
/// kind matches `kind`. SVG 2 §13.2.4: type-specific attributes (`x1`,
/// `y1`, `x2`, `y2` for `<linearGradient>`; `cx`, `cy`, `r`, `fx`, `fy`,
/// `fr` for `<radialGradient>`) inherit only from the same gradient
/// type. Common attributes (`gradientUnits`, `gradientTransform`,
/// `spreadMethod`, stops) still use plain [`first_attr`].
fn first_attr_in_kind<'a>(
    dom: &'a DemoDom,
    chain: &[NodeId],
    name: &str,
    kind: ElementKind,
) -> Option<&'a str> {
    for id in chain {
        if node_kind(dom, *id) != Some(kind) {
            continue;
        }
        if let Some(v) = get_attr(dom.node(*id), name) {
            return Some(v);
        }
    }
    None
}

fn resolve_common(dom: &DemoDom, chain: &[NodeId]) -> Option<GradientCommon> {
    let units = match first_attr(dom, chain, "gradientUnits") {
        Some("userSpaceOnUse") => GradientUnits::UserSpaceOnUse,
        _ => GradientUnits::ObjectBoundingBox,
    };
    let tile = match first_attr(dom, chain, "spreadMethod") {
        Some("reflect") => TileMode::Mirror,
        Some("repeat") => TileMode::Repeat,
        _ => TileMode::Clamp,
    };
    let transform = first_attr(dom, chain, "gradientTransform")
        .and_then(parse_transform)
        .unwrap_or_else(Matrix::new_identity);

    let mut stops_node: Option<NodeId> = None;
    for id in chain {
        let any_stop = dom
            .node(*id)
            .children
            .iter()
            .any(|c| matches!(&dom.node(*c).data, DemoNodeData::Element(e) if e.name.local.as_ref() == "stop"));
        if any_stop {
            stops_node = Some(*id);
            break;
        }
    }
    let stops_node = stops_node?;

    let mut stops = Vec::new();
    for child in &dom.node(stops_node).children {
        let cn = dom.node(*child);
        let DemoNodeData::Element(d) = &cn.data else {
            continue;
        };
        if d.name.local.as_ref() != "stop" {
            continue;
        }
        let offset = get_attr(cn, "offset")
            .and_then(parse_stop_offset)
            .unwrap_or(0.0);
        let style = get_attr(cn, "style").unwrap_or("");
        let inline = parse_inline_style(style);
        let color_str = get_attr(cn, "stop-color").or_else(|| {
            inline
                .iter()
                .find(|(k, _)| *k == "stop-color")
                .map(|(_, v)| *v)
        });
        // `stop-color="inherit"` walks the ancestor chain for the
        // first explicit `stop-color` (parent gradient may set one).
        let resolved_color_str: Option<String> = if color_str.map(str::trim) == Some("inherit") {
            inherit_stop_color(dom, *child)
        } else {
            color_str.map(str::to_string)
        };
        let color = match resolved_color_str.as_deref() {
            Some(s) => match parse_paint(s) {
                Some(Paint::Color(c)) => c,
                Some(Paint::CurrentColor) => resolve_current_color(dom, *child),
                _ => Color::BLACK,
            },
            None => parse_color("black").unwrap_or(Color::BLACK),
        };
        let opacity = get_attr(cn, "stop-opacity")
            .or_else(|| {
                inline
                    .iter()
                    .find(|(k, _)| *k == "stop-opacity")
                    .map(|(_, v)| *v)
            })
            .and_then(parse_opacity_value)
            .unwrap_or(1.0)
            .clamp(0.0, 1.0);
        stops.push(Stop {
            offset: offset.clamp(0.0, 1.0),
            color,
            opacity,
        });
    }
    if stops.is_empty() {
        return None;
    }

    // Per SVG 1.1 §13.2.4 and SVG 2 §13.2.4: each stop's offset must be
    // greater than or equal to the previous stop's. If not, the user
    // agent must "use the previous offset value." Without this pass an
    // out-of-order list like `0.8, 0.2, 1` would feed Skia a malformed
    // distribution and produce the wrong gradient. Sorting would change
    // the color order; spec says clamp upward instead.
    let mut max_so_far = 0.0_f32;
    for stop in stops.iter_mut() {
        if stop.offset < max_so_far {
            stop.offset = max_so_far;
        } else {
            max_so_far = stop.offset;
        }
    }

    Some(GradientCommon {
        units,
        transform,
        tile,
        stops,
    })
}

fn parse_stop_offset(s: &str) -> Option<f32> {
    let s = s.trim();
    if let Some(p) = s.strip_suffix('%') {
        p.trim().parse::<f32>().ok().map(|v| v / 100.0)
    } else {
        s.parse::<f32>().ok()
    }
}

/// Parse `stop-opacity` (or any opacity-like value): SVG 2 / CSS Color
/// allows either a number in `[0, 1]` or a percentage. The
/// `paint-servers/stop-opacity/50percent` fixture relies on the
/// percentage form being honoured.
fn parse_opacity_value(s: &str) -> Option<f32> {
    let s = s.trim();
    if let Some(p) = s.strip_suffix('%') {
        p.trim().parse::<f32>().ok().map(|v| v / 100.0)
    } else {
        s.parse::<f32>().ok()
    }
}

fn parse_inline_style(s: &str) -> Vec<(&str, &str)> {
    s.split(';')
        .filter_map(|d| {
            let (k, v) = d.split_once(':')?;
            Some((k.trim(), v.trim()))
        })
        .collect()
}

/// Resolve `stop-color: inherit` for a `<stop>`.
///
/// `stop-color` is **non-inheritable** (CSS Filter Effects 1 §10.x and the
/// SVG 2 stop properties table). The `inherit` keyword therefore only walks
/// up through ancestors that *also* say `inherit`. As soon as an ancestor
/// has no `stop-color` declaration, the chain breaks and the value resolves
/// to the property's initial value (black) — *not* whatever a more distant
/// ancestor happens to declare. This is what the resvg-test-suite
/// `stop-color-with-inherit-{2,3,4,5}` fixtures verify.
fn inherit_stop_color(dom: &DemoDom, start: NodeId) -> Option<String> {
    let mut current = dom.node(start).parent;
    while let Some(id) = current {
        let n = dom.node(id);
        let value = read_stop_color_decl(n);
        match value.as_deref() {
            // Chain broken — initial value (black) wins.
            None => return None,
            Some("inherit") => current = n.parent,
            Some(_) => return value,
        }
    }
    None
}

fn read_stop_color_decl(n: &csscascade::dom::DemoNode) -> Option<String> {
    if let Some(v) = get_attr(n, "stop-color") {
        let v = v.trim();
        if !v.is_empty() {
            return Some(v.to_string());
        }
    }
    if let Some(style) = get_attr(n, "style") {
        for decl in style.split(';') {
            if let Some((k, v)) = decl.split_once(':') {
                if k.trim().eq_ignore_ascii_case("stop-color") {
                    let v = v.trim();
                    if !v.is_empty() {
                        return Some(v.to_string());
                    }
                }
            }
        }
    }
    None
}

/// Resolve `currentColor` for a `<stop>` by walking up the ancestor
/// chain (gradient → its DOM parent → …) looking for a `color`
/// attribute or `style="color:..."`. SVG 2 / CSS `currentcolor`
/// resolves to the value of the `color` property on the element.
/// Defaults to black if no `color` is set anywhere.
fn resolve_current_color(dom: &DemoDom, start: NodeId) -> Color {
    fn read(node: &csscascade::dom::DemoNode) -> Option<Color> {
        if let Some(raw) = get_attr(node, "color") {
            if let Some(c) = parse_color(raw.trim()) {
                return Some(c);
            }
        }
        if let Some(style) = get_attr(node, "style") {
            for decl in style.split(';') {
                if let Some((k, v)) = decl.split_once(':') {
                    if k.trim().eq_ignore_ascii_case("color") {
                        if let Some(c) = parse_color(v.trim()) {
                            return Some(c);
                        }
                    }
                }
            }
        }
        None
    }
    let mut current = Some(start);
    while let Some(id) = current {
        let n = dom.node(id);
        if let Some(c) = read(n) {
            return c;
        }
        current = n.parent;
    }
    Color::BLACK
}

fn resolve_linear_endpoints(
    dom: &DemoDom,
    chain: &[NodeId],
    common: &GradientCommon,
    viewport: (f32, f32),
) -> (f32, f32, f32, f32) {
    // SVG 2: x2 defaults to "100%" regardless of gradientUnits.
    // For objectBoundingBox that's 1.0 (bbox-relative); for
    // userSpaceOnUse it's the viewport width.
    let x2_default = match common.units {
        GradientUnits::ObjectBoundingBox => 1.0,
        GradientUnits::UserSpaceOnUse => viewport.0,
    };
    let resolve = |name: &str, axis: Axis, default: f32| {
        first_attr_in_kind(dom, chain, name, ElementKind::LinearGradient)
            .and_then(|s| parse_grad_coord(s, common.units, viewport, axis))
            .unwrap_or(default)
    };
    let x1 = resolve("x1", Axis::X, 0.0);
    let y1 = resolve("y1", Axis::Y, 0.0);
    let x2 = resolve("x2", Axis::X, x2_default);
    let y2 = resolve("y2", Axis::Y, 0.0);
    (x1, y1, x2, y2)
}

fn resolve_radial_geometry(
    dom: &DemoDom,
    chain: &[NodeId],
    common: &GradientCommon,
    viewport: (f32, f32),
) -> (f32, f32, f32, f32, f32, f32) {
    // SVG 2: cx, cy, r default to "50%". For objectBoundingBox
    // that's 0.5 (bbox-relative); for userSpaceOnUse it's
    // viewport-relative on the matching axis.
    let (vw, vh) = viewport;
    let dia = ((vw * vw + vh * vh) * 0.5).sqrt();
    let (cx_default, cy_default, r_default) = match common.units {
        GradientUnits::ObjectBoundingBox => (0.5, 0.5, 0.5),
        GradientUnits::UserSpaceOnUse => (vw * 0.5, vh * 0.5, dia * 0.5),
    };
    let resolve = |name: &str, axis: Axis, default: f32| {
        first_attr_in_kind(dom, chain, name, ElementKind::RadialGradient)
            .and_then(|s| parse_grad_coord(s, common.units, viewport, axis))
            .unwrap_or(default)
    };
    let cx = resolve("cx", Axis::X, cx_default);
    let cy = resolve("cy", Axis::Y, cy_default);
    let r = resolve("r", Axis::D, r_default);
    let fx = resolve("fx", Axis::X, cx);
    let fy = resolve("fy", Axis::Y, cy);
    let fr = resolve("fr", Axis::D, 0.0);
    (cx, cy, r, fx, fy, fr)
}

#[derive(Debug, Clone, Copy)]
enum Axis {
    X,
    Y,
    D,
}

fn parse_grad_coord(
    s: &str,
    units: GradientUnits,
    viewport: (f32, f32),
    axis: Axis,
) -> Option<f32> {
    let s = s.trim();
    if let Some(p) = s.strip_suffix('%') {
        let n: f32 = p.trim().parse().ok()?;
        match units {
            GradientUnits::ObjectBoundingBox => Some(n / 100.0),
            GradientUnits::UserSpaceOnUse => {
                let (vw, vh) = viewport;
                let extent = match axis {
                    Axis::X => vw,
                    Axis::Y => vh,
                    Axis::D => ((vw * vw + vh * vh) * 0.5).sqrt(),
                };
                Some(n / 100.0 * extent)
            }
        }
    } else {
        parse_length_px(s)
    }
}
