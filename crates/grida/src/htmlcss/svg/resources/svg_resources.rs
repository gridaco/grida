//! `id` → `NodeId` lookup table.
//!
//! Built once per render pass by walking the entire `DemoDom` and
//! recording every SVG element with an `id` attribute. Paint-server,
//! `<use>`, and clip/mask/filter resolution all bottom out here.
//!
//! Blink anchor: `core/layout/svg/svg_resources.{h,cc}` (`SVGResources`
//! holds analogous lookups).

use csscascade::dom::{DemoDom, DemoNodeData, NodeId};
use rustc_hash::FxHashMap;

use crate::htmlcss::svg::dom::element::get_attr;
use crate::htmlcss::svg::style::stylesheet::Stylesheet;

const SVG_NS: &str = "http://www.w3.org/2000/svg";

#[derive(Debug, Default, Clone)]
pub struct Resources {
    by_id: FxHashMap<String, NodeId>,
    pub stylesheet: Stylesheet,
}

impl Resources {
    pub fn build(dom: &DemoDom, css: &dyn crate::htmlcss::svg::CssLoader) -> Self {
        let mut by_id = FxHashMap::default();
        for id in dom.all_node_ids() {
            let node = dom.node(id);
            let DemoNodeData::Element(data) = &node.data else {
                continue;
            };
            if data.name.ns.as_ref() != SVG_NS {
                continue;
            }
            if let Some(s) = get_attr(node, "id") {
                by_id.insert(s.to_string(), id);
            }
        }
        let stylesheet = Stylesheet::collect(dom, css);
        Self { by_id, stylesheet }
    }

    pub fn lookup(&self, id: &str) -> Option<NodeId> {
        self.by_id.get(id).copied()
    }
}

/// Parse a `url(#id)` reference. Returns the bare id without the `#`.
pub fn parse_url_ref(s: &str) -> Option<&str> {
    let s = s.trim();
    let inner = s
        .strip_prefix("url(")
        .or_else(|| s.strip_prefix("URL("))?
        .strip_suffix(')')?
        .trim();
    let inner = inner.trim_matches(|c| c == '\'' || c == '"');
    inner.strip_prefix('#')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_url_ref() {
        assert_eq!(parse_url_ref("url(#grad1)"), Some("grad1"));
        assert_eq!(parse_url_ref("  url(#g)  "), Some("g"));
        assert_eq!(parse_url_ref("url(\"#g\")"), Some("g"));
        assert_eq!(parse_url_ref("none"), None);
    }
}
