//! SVG paint effects resolved around an element draw.
//!
//! This module owns effect-property helpers (`opacity`, `filter`, and
//! font-size inputs used by CSS filter functions). The container painter
//! decides when to open/close layers; this module resolves the values.

use csscascade::dom::DemoNode;

use super::scoped_svg_paint_state::PaintCtx;
use crate::htmlcss::svg::dom::attrs::parse_length_px;
use crate::htmlcss::svg::dom::element::get_attr;
use crate::htmlcss::svg::resources::filter as svg_filter;
use crate::htmlcss::svg::resources::svg_resources::parse_url_ref;

/// Read the element's `opacity` attribute (or `style="opacity:..."`).
pub(crate) fn group_opacity(node: &DemoNode) -> f32 {
    if let Some(raw) = get_attr(node, "opacity") {
        if let Some(v) = parse_opacity_value(raw) {
            return v.clamp(0.0, 1.0);
        }
    }
    if let Some(style) = get_attr(node, "style") {
        for decl in style.split(';') {
            let Some((k, v)) = decl.split_once(':') else {
                continue;
            };
            if k.trim().eq_ignore_ascii_case("opacity") {
                if let Some(n) = parse_opacity_value(v) {
                    return n.clamp(0.0, 1.0);
                }
            }
        }
    }
    1.0
}

pub(crate) fn parse_opacity_value(s: &str) -> Option<f32> {
    let s = s.trim();
    if let Some(p) = s.strip_suffix('%') {
        p.trim().parse::<f32>().ok().map(|v| v / 100.0)
    } else {
        s.parse::<f32>().ok()
    }
}

/// Resolve a `filter:` value into one invocation per token.
pub(crate) fn resolve_filter_chain(
    ctx: &PaintCtx<'_>,
    node: &DemoNode,
    value: &str,
    bbox: skia_safe::Rect,
    failed_invalid: &mut bool,
) -> Vec<svg_filter::FilterInvocation> {
    let items = svg_filter::iter_filter_functions(value);
    let mut out: Vec<svg_filter::FilterInvocation> = Vec::new();
    if items.is_empty() {
        if let Some(id) = parse_url_ref(value.trim()) {
            if let Some(target) = ctx.resources.lookup(id) {
                if let Some(inv) =
                    svg_filter::resolve(ctx.dom, ctx.resources, target, bbox, ctx.images, ctx)
                {
                    out.push(inv);
                    return out;
                }
            }
        }
        *failed_invalid = true;
        return out;
    }

    let cc = super::super::resources::svg_filter_builder::resolve_current_color(ctx.dom, node);
    let fs = resolve_font_size_px(ctx.dom, node);
    // A solitary `url(#…)` whose target cannot be resolved is the
    // "invalid funcIRI" case: the resvg-aligned consensus behavior is
    // to *hide* the element entirely (see svg_container_painter early
    // return on `filter_failed_invalid`). When the same `url(#missing)`
    // appears alongside other entries, CSS Filter Effects 2 / SVG 2
    // §15.4 demand we treat it as the identity instead — the rest of
    // the list still applies. Branch on list length to keep both shapes
    // correct.
    let single_url_invalid = items.len() == 1 && items[0].0.eq_ignore_ascii_case("url");
    for (name, args) in &items {
        if name.eq_ignore_ascii_case("url") {
            let id = args
                .trim()
                .trim_matches(|c: char| c == '\'' || c == '"')
                .trim_start_matches('#');
            let target = ctx.resources.lookup(id);
            let resolved = target.and_then(|t| {
                svg_filter::resolve(ctx.dom, ctx.resources, t, bbox, ctx.images, ctx)
            });
            match resolved {
                Some(inv) => out.push(inv),
                None if single_url_invalid => {
                    *failed_invalid = true;
                    return Vec::new();
                }
                None => {}
            }
        } else {
            let segment = format!("{}({})", name, args);
            match svg_filter::build_from_css_filter_list(&segment, bbox, cc, fs) {
                Some(inv) => out.push(inv),
                None => return Vec::new(),
            }
        }
    }
    out
}

pub(crate) fn resolve_font_size_px(dom: &csscascade::dom::DemoDom, start: &DemoNode) -> f32 {
    fn read(n: &DemoNode) -> Option<f32> {
        if let Some(raw) = get_attr(n, "font-size") {
            if let Some(v) = parse_length_px(raw) {
                return Some(v);
            }
        }
        if let Some(style) = get_attr(n, "style") {
            for d in style.split(';') {
                if let Some((k, v)) = d.split_once(':') {
                    if k.trim().eq_ignore_ascii_case("font-size") {
                        if let Some(v) = parse_length_px(v.trim()) {
                            return Some(v);
                        }
                    }
                }
            }
        }
        None
    }

    if let Some(v) = read(start) {
        return v;
    }
    let mut cur = start.parent;
    while let Some(id) = cur {
        let n = dom.node(id);
        if let Some(v) = read(n) {
            return v;
        }
        cur = n.parent;
    }
    16.0
}
