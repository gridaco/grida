//! Parse SVG bytes via the existing htmlcss DOM/cascade pipeline.
//!
//! There is **no separate SVG parser**: inline `<svg>` already lives inside
//! a `DemoDom` produced by `csscascade` (html5ever), and standalone `.svg`
//! is fed through the same parser. html5ever's foreign-content rules
//! ensure top-level `<svg>` elements are tagged with the SVG namespace.
//!
//! Blink anchor: SVG documents and inline `<svg>` are both built by the
//! unified HTML/XML parser in `core/dom/`. Blink's `LayoutSVGRoot` then
//! takes over for layout/paint — same architecture as ours.

use csscascade::dom::{DemoDom, DemoNode, DemoNodeData, NodeId};

use super::super::SvgError;

/// SVG XML namespace URI. We check by string rather than `markup5ever::ns!(svg)`
/// to avoid pulling `markup5ever` into the `grida` crate's direct deps —
/// `csscascade` already owns that boundary.
const SVG_NS: &str = "http://www.w3.org/2000/svg";

fn is_svg_element(node: &DemoNode, local: &str) -> bool {
    let DemoNodeData::Element(data) = &node.data else {
        return false;
    };
    data.name.ns.as_ref() == SVG_NS && data.name.local.as_ref() == local
}

fn is_svg_namespace(node: &DemoNode) -> bool {
    matches!(&node.data, DemoNodeData::Element(d) if d.name.ns.as_ref() == SVG_NS)
}

/// Parse SVG bytes and return the DemoDom plus the `NodeId` of the root
/// `<svg>` element. Errors if the input has no `<svg>` element at all.
pub fn parse_dom(svg: &[u8]) -> Result<(DemoDom, NodeId), SvgError> {
    let dom = DemoDom::parse_from_bytes(svg).map_err(|e| SvgError::Xml(e.to_string()))?;
    let root_id = find_svg_root(&dom)
        .ok_or_else(|| SvgError::Structure("no <svg> element in input".to_string()))?;
    Ok((dom, root_id))
}

/// Walk the DemoDom (BFS over `Document` children) and return the first
/// element whose qualified name is `(svg ns, svg)`. html5ever places
/// `<svg>` under the auto-injected `<body>` even for bare-SVG input, which
/// is why we don't insist on `<svg>` being a direct document child.
pub fn find_svg_root(dom: &DemoDom) -> Option<NodeId> {
    let mut stack: Vec<NodeId> = dom.document_children().to_vec();
    while let Some(id) = stack.pop() {
        let node = dom.node(id);
        if is_svg_element(node, "svg") {
            return Some(id);
        }
        // Push children in reverse so the leftmost is visited first.
        for child in node.children.iter().rev() {
            stack.push(*child);
        }
    }
    None
}

/// Iterator over an element's *element* children (skipping text, comments,
/// and non-SVG-namespace nodes).
pub fn svg_element_children<'a>(
    dom: &'a DemoDom,
    parent: NodeId,
) -> impl Iterator<Item = (NodeId, &'a DemoNode)> + 'a {
    dom.node(parent)
        .children
        .iter()
        .copied()
        .filter_map(move |id| {
            let node = dom.node(id);
            if is_svg_namespace(node) {
                Some((id, node))
            } else {
                None
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_bare_svg_into_demodom() {
        let svg = br#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
            <rect x="10" y="10" width="80" height="80" fill="red"/>
        </svg>"#;
        let (dom, root) = parse_dom(svg).expect("parse");
        let node = dom.node(root);
        let DemoNodeData::Element(data) = &node.data else {
            panic!("not element");
        };
        assert_eq!(data.name.local.as_ref(), "svg");
        assert_eq!(data.name.ns.as_ref(), SVG_NS);

        let kids: Vec<_> = svg_element_children(&dom, root).collect();
        assert_eq!(kids.len(), 1);
        let (_, rect_node) = &kids[0];
        let DemoNodeData::Element(rect_data) = &rect_node.data else {
            unreachable!()
        };
        assert_eq!(rect_data.name.local.as_ref(), "rect");
    }

    #[test]
    fn rejects_input_without_svg() {
        let html = b"<html><body><p>nope</p></body></html>";
        assert!(matches!(parse_dom(html), Err(SvgError::Structure(_))));
    }
}
