//! Visibility predicates — `display: none` / `visibility: hidden` /
//! `visibility: collapse` checks used by paint to skip elements.
//!
//! These are paint-time concerns: an element with `display: none`
//! contributes no paint operations, and `visibility: hidden` paints
//! "transparently" (no glyphs/strokes/fills emitted). Splitting them
//! out of `dom/element.rs` separates *DOM navigation* (which lives in
//! dom/) from *paint dispatch* (which lives here).
//!
//! Blink anchor: paint dispatch in `core/paint/svg_*_painter.cc`
//! consults `LayoutObject::StyleRef().Visibility()` and
//! `Display() == EDisplay::kNone`; the equivalent CSS values are
//! folded into `ComputedStyle`. We don't have a real ComputedStyle
//! yet, so we read attributes + inline `style="..."` directly.
//!
//! TODO: when Stylo lands, these checks route through the resolved
//! `display` / `visibility` properties on the cascade output.

use csscascade::dom::{DemoDom, DemoNode, NodeId};

use super::super::dom::element::get_attr;

/// SVG paint inhibition. Returns `true` if this element should paint
/// (no `display: none`, no own `visibility: hidden|collapse`).
///
/// Paint inhibition checks: whether `display: none` (in attribute or
/// equivalent in the inline `style` attribute) should suppress paint of
/// this element and its subtree.
pub fn is_painted(node: &DemoNode) -> bool {
    if has_display_none(node) {
        return false;
    }
    is_visible_self(node)
}

/// `display: none` on this element only (no inheritance walk; SVG 2 §11.1
/// — children of a `display:none` ancestor are themselves not painted,
/// but each level only needs to check its own value because the early
/// return at the ancestor stops descent).
pub fn has_display_none(node: &DemoNode) -> bool {
    // CSS specificity: inline `style="..."` beats the presentation
    // attribute. Look up `style` first; if it sets `display`, that
    // value wins and we ignore the attribute. Only fall through to
    // the attribute when `style` doesn't mention `display`.
    if let Some(style) = get_attr(node, "style") {
        if let Some(v) = read_style_pair(style, "display") {
            return v.eq_ignore_ascii_case("none");
        }
    }
    matches_attr(node, "display", "none")
}

/// `visibility: hidden`/`collapse` on this element only — no
/// inheritance walk. Use [`is_visible_inherited`] when you need the
/// effective value with parent-cascade applied.
pub fn is_visible_self(node: &DemoNode) -> bool {
    // Inline `style="..."` overrides the presentation attribute. Look
    // up `style` first; only consult the attribute when `style`
    // doesn't mention `visibility`.
    if let Some(style) = get_attr(node, "style") {
        if let Some(v) = read_style_pair(style, "visibility") {
            return !(v.eq_ignore_ascii_case("hidden") || v.eq_ignore_ascii_case("collapse"));
        }
    }
    !(matches_attr(node, "visibility", "hidden") || matches_attr(node, "visibility", "collapse"))
}

/// Effective `visibility` for a leaf element — walks the ancestor
/// chain, taking the first explicit `visibility` value. SVG 2 §11.4:
/// `visibility` is inherited; a descendant can override an ancestor's
/// `hidden` by setting `visibility: visible` on itself.
pub fn is_visible_inherited(dom: &DemoDom, start: NodeId) -> bool {
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

fn read_visibility(node: &DemoNode) -> Option<bool> {
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

fn matches_attr(node: &DemoNode, name: &str, value: &str) -> bool {
    get_attr(node, name).map(str::trim) == Some(value)
}

/// Crude `key: value` lookup inside a `style="..."` blob. Returns the
/// declared value (without `!important`) or `None` if the key is
/// absent. Good enough for `display` / `visibility` checks — proper CSS
/// resolution will go through Stylo once the SVG cascade hook is wired.
fn read_style_pair(style: &str, key: &str) -> Option<String> {
    for decl in style.split(';') {
        let Some((k, v)) = decl.split_once(':') else {
            continue;
        };
        if k.trim().eq_ignore_ascii_case(key) {
            // Strip an `!important` priority marker before returning;
            // gating helpers compare against keyword values like `none`
            // or `hidden`, not against priority annotations.
            let v = v
                .trim()
                .trim_end_matches(|c: char| c.is_ascii_whitespace())
                .trim_end_matches("!important")
                .trim();
            return Some(v.to_string());
        }
    }
    None
}
