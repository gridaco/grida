//! SVG `href` / `xlink:href` helpers.
//!
//! Same-document fragment references are used by `<use>`, paint
//! servers, filters, markers, masks, clip paths, and text paths. Keep
//! the spelling and fragment parsing in one DOM module instead of
//! scattering `href` / `xlink:href` fallbacks across painters.

use csscascade::dom::DemoNode;

use super::element::get_attr;

pub(crate) fn href_attr(node: &DemoNode) -> Option<&str> {
    get_attr(node, "href").or_else(|| get_attr(node, "xlink:href"))
}

pub(crate) fn same_document_fragment(value: &str) -> Option<&str> {
    value.trim().strip_prefix('#').filter(|id| !id.is_empty())
}
