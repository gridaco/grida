//! CSS cascade entry point — single funnel through which paint and
//! resources read computed property values.
//!
//! Today this is a thin wrapper over the in-tree `stylesheet.rs`
//! matcher + the inline `style="..."` parser + the same-name
//! presentation attribute. It is the **single owner** of the
//! "what does this property resolve to?" question.
//!
//! Why route everything through one module: when Stylo replaces
//! `stylesheet.rs`, the bridge happens here. Paint and resources
//! never see Stylo or the in-tree matcher directly — they call
//! [`cascade_property`] / [`get_attr_or_style`] and the
//! implementation flips inside this module.
//!
//! Blink anchor: `core/css/resolver/style_resolver.cc` is the wide
//! analogue. The presentation-attribute aliasing is in
//! `core/svg/svg_animated_*.cc` (`CssValue()` accessors), folded into
//! the cascade by `SVGElement::CollectStyleForPresentationAttribute`.

use csscascade::dom::{DemoDom, DemoNode};

use super::super::dom::element::get_attr;
use super::stylesheet::Stylesheet;

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
    dom: Option<&DemoDom>,
    sheet: Option<&Stylesheet>,
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
