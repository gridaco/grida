//! Tag-kind dispatch and attribute helpers over `DemoNode`.
//!
//! No typed-element hierarchy yet — that lands incrementally as features
//! arrive. For now we expose:
//! - [`ElementKind`]: discriminates SVG tags relevant to layout/paint.
//! - [`get_attr`]: case-sensitive attribute lookup by local name (SVG is
//!   namespace-aware but local-name addressed for the attrs we care about).
//!
//! Blink anchor: `core/svg/svg_*_element.{h,cc}`. Blink's typed hierarchy
//! emerges from one DOM `Element` class plus per-tag factories; we'll
//! reach that shape over time.

use csscascade::dom::{DemoNode, DemoNodeData};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ElementKind {
    Svg,
    G,
    Defs,
    Symbol,
    Use,
    Switch,
    Title,
    Desc,
    Metadata,
    Rect,
    Circle,
    Ellipse,
    Line,
    Polyline,
    Polygon,
    Path,
    Image,
    ForeignObject,
    Text,
    TSpan,
    TextPath,
    LinearGradient,
    RadialGradient,
    Pattern,
    Stop,
    ClipPath,
    Mask,
    Filter,
    Marker,
    /// `<a>` is a render-transparent grouping element in SVG (it just adds
    /// hyperlink semantics on top of a `<g>`-equivalent). We treat it like
    /// `<g>` for paint purposes.
    Anchor,
    Style,
    Unknown,
}

impl ElementKind {
    pub fn from_local_name(name: &str) -> Self {
        match name {
            "svg" => Self::Svg,
            "g" => Self::G,
            "defs" => Self::Defs,
            "symbol" => Self::Symbol,
            "use" => Self::Use,
            "switch" => Self::Switch,
            "title" => Self::Title,
            "desc" => Self::Desc,
            "metadata" => Self::Metadata,
            "rect" => Self::Rect,
            "circle" => Self::Circle,
            "ellipse" => Self::Ellipse,
            "line" => Self::Line,
            "polyline" => Self::Polyline,
            "polygon" => Self::Polygon,
            "path" => Self::Path,
            "image" => Self::Image,
            "foreignObject" => Self::ForeignObject,
            "text" => Self::Text,
            "tspan" => Self::TSpan,
            "textPath" => Self::TextPath,
            "linearGradient" => Self::LinearGradient,
            "radialGradient" => Self::RadialGradient,
            "pattern" => Self::Pattern,
            "stop" => Self::Stop,
            "clipPath" => Self::ClipPath,
            "mask" => Self::Mask,
            "filter" => Self::Filter,
            "marker" => Self::Marker,
            "a" => Self::Anchor,
            "style" => Self::Style,
            _ => Self::Unknown,
        }
    }

    /// True for elements that are skipped during the paint walk because
    /// they only contribute resources or descriptive metadata.
    pub fn is_hidden_container(self) -> bool {
        matches!(
            self,
            Self::Defs
                | Self::Symbol
                | Self::Title
                | Self::Desc
                | Self::Metadata
                | Self::Style
                | Self::ClipPath
                | Self::Mask
                | Self::Filter
                | Self::Marker
                | Self::LinearGradient
                | Self::RadialGradient
                | Self::Pattern
        )
    }
}

/// Returns `true` when `display="none"` or `visibility="hidden"` (or the
/// equivalent in the inline `style` attribute) should suppress paint of
/// this element and its subtree.
pub fn is_painted(node: &csscascade::dom::DemoNode) -> bool {
    if has_display_none(node) {
        return false;
    }
    is_visible_self(node)
}

/// `display: none` on this element only (no inheritance walk; SVG 2 §11.1
/// — children of a `display:none` ancestor are themselves not painted,
/// but each level only needs to check its own value because the early
/// return at the ancestor stops descent).
pub fn has_display_none(node: &csscascade::dom::DemoNode) -> bool {
    if matches_attr(node, "display", "none") {
        return true;
    }
    if let Some(style) = get_attr(node, "style") {
        if style_contains_pair(style, "display", "none") {
            return true;
        }
    }
    false
}

/// `visibility: hidden`/`collapse` on this element only — no
/// inheritance walk. Use [`is_visible_inherited`] when you need the
/// effective value with parent-cascade applied.
pub fn is_visible_self(node: &csscascade::dom::DemoNode) -> bool {
    if matches_attr(node, "visibility", "hidden") || matches_attr(node, "visibility", "collapse") {
        return false;
    }
    if let Some(style) = get_attr(node, "style") {
        if style_contains_pair(style, "visibility", "hidden")
            || style_contains_pair(style, "visibility", "collapse")
        {
            return false;
        }
    }
    true
}

/// Effective `visibility` for a leaf element — walks the ancestor
/// chain, taking the first explicit `visibility` value. SVG 2 §11.4:
/// `visibility` is inherited; a descendant can override an ancestor's
/// `hidden` by setting `visibility: visible` on itself.
pub fn is_visible_inherited(
    dom: &csscascade::dom::DemoDom,
    start: csscascade::dom::NodeId,
) -> bool {
    let mut current = Some(start);
    while let Some(id) = current {
        let n = dom.node(id);
        if let Some(v) = read_visibility(n) {
            return v;
        }
        current = n.parent;
    }
    true // CSS default `visible`
}

fn read_visibility(node: &csscascade::dom::DemoNode) -> Option<bool> {
    if matches_attr(node, "visibility", "visible") {
        return Some(true);
    }
    if matches_attr(node, "visibility", "hidden") || matches_attr(node, "visibility", "collapse") {
        return Some(false);
    }
    if let Some(style) = get_attr(node, "style") {
        for decl in style.split(';') {
            if let Some((k, v)) = decl.split_once(':') {
                if k.trim().eq_ignore_ascii_case("visibility") {
                    let v = v.trim();
                    if v.eq_ignore_ascii_case("visible") {
                        return Some(true);
                    }
                    if v.eq_ignore_ascii_case("hidden") || v.eq_ignore_ascii_case("collapse") {
                        return Some(false);
                    }
                }
            }
        }
    }
    None
}

fn matches_attr(node: &csscascade::dom::DemoNode, name: &str, value: &str) -> bool {
    get_attr(node, name).map(str::trim) == Some(value)
}

/// Crude `key: value` lookup inside a `style="..."` blob. Good enough for
/// `display:none` / `visibility:hidden` checks — proper CSS resolution
/// will go through Stylo once the SVG cascade hook is wired.
fn style_contains_pair(style: &str, key: &str, value: &str) -> bool {
    for decl in style.split(';') {
        let Some((k, v)) = decl.split_once(':') else {
            continue;
        };
        if k.trim().eq_ignore_ascii_case(key) && v.trim().eq_ignore_ascii_case(value) {
            return true;
        }
    }
    false
}

/// Local-name attribute lookup. Returns `None` for non-elements or
/// missing attributes. SVG-namespaced and unprefixed attrs both match.
pub fn get_attr<'a>(node: &'a DemoNode, name: &str) -> Option<&'a str> {
    let DemoNodeData::Element(data) = &node.data else {
        return None;
    };
    for attr in &data.attrs {
        if attr.name.local.as_ref() == name {
            return Some(attr.value.as_ref());
        }
    }
    None
}

/// Read a presentation property cascading author `<style>` rules, the
/// inline `style="…"` attribute, and the same-name presentation
/// attribute. Cascade order (highest priority first):
///   1. !important author rules
///   2. inline `style="…"` declaration
///   3. non-important author rules (by specificity, then source order)
///   4. presentation attribute (specificity 0 per CSS Cascading L5)
///
/// `dom` and `sheet` may be `None` for callers without a cascade
/// context — they fall back to the previous attribute-or-style behavior.
pub fn cascade_property(
    dom: Option<&csscascade::dom::DemoDom>,
    sheet: Option<&crate::htmlcss::svg::style::stylesheet::Stylesheet>,
    node: &DemoNode,
    name: &str,
) -> Option<String> {
    let matched = match (dom, sheet) {
        (Some(d), Some(s)) => s.match_property(d, node, name),
        _ => None,
    };
    if let Some((value, _spec, true, _order)) = &matched {
        return Some(value.clone());
    }
    if let Some(v) = get_inline_style(node, name) {
        return Some(v);
    }
    if let Some((v, _, _, _)) = matched {
        return Some(v);
    }
    get_attr(node, name).map(|s| s.to_string())
}

/// Read a property only from inline `style="prop:value"`.
fn get_inline_style(node: &DemoNode, name: &str) -> Option<String> {
    let style = get_attr(node, "style")?;
    let stripped = strip_css_comments(style);
    for decl in stripped.split(';') {
        let Some((k, v)) = decl.split_once(':') else {
            continue;
        };
        if k.trim().eq_ignore_ascii_case(name) {
            return Some(v.trim().to_string());
        }
    }
    None
}

/// Read a presentation property either from a same-name attribute or
/// from a `style="prop:value"` declaration on the element. The style
/// declaration takes precedence per CSS specificity (style attribute >
/// presentation attribute), matching Blink's resolution order.
pub fn get_attr_or_style(node: &DemoNode, name: &str) -> Option<String> {
    if let Some(style) = get_attr(node, "style") {
        let stripped = strip_css_comments(style);
        for decl in stripped.split(';') {
            let Some((k, v)) = decl.split_once(':') else {
                continue;
            };
            if k.trim().eq_ignore_ascii_case(name) {
                return Some(v.trim().to_string());
            }
        }
    }
    get_attr(node, name).map(|s| s.to_string())
}

/// Strip `/* ... */` C-style comments from a CSS declaration block.
/// Nested comments are not part of CSS — first `*/` closes the run.
fn strip_css_comments(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(start) = rest.find("/*") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        match after.find("*/") {
            Some(end) => rest = &after[end + 2..],
            None => return out,
        }
    }
    out.push_str(rest);
    out
}

/// Element kind of `node`, or `None` if `node` is not an SVG element.
pub fn element_kind(node: &DemoNode) -> Option<ElementKind> {
    let DemoNodeData::Element(data) = &node.data else {
        return None;
    };
    Some(ElementKind::from_local_name(data.name.local.as_ref()))
}
