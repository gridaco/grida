//! `LayoutSvgElement` — the bridge type paint and resources see for
//! "an SVG element".
//!
//! Today this is a thin wrapper over `(DemoDom, NodeId)`. Tomorrow it
//! will carry precomputed bboxes/paths/styles so a persistent layout
//! tree can land without churning every painter call site. Until that
//! happens the wrapper is intentionally minimal.
//!
//! Why a bridge type? Right now `paint/` and `resources/` import
//! `csscascade::dom::*` directly (49 sites). When a real layout tree
//! arrives, paint should consume `LayoutSvg*` nodes, not raw DOM
//! nodes. Introducing the bridge now means that migration is an impl
//! swap, not a 49-call-site refactor.
//!
//! Blink anchor: `core/layout/svg/layout_svg_model_object.{h,cc}` is
//! the parent of every visible-tree `LayoutSVG*`. `LayoutObject` is
//! the wider cross-cutting base; we don't need that breadth here.

use csscascade::dom::{DemoDom, DemoNode, NodeId};

/// View of an element used by paint/resources.
///
/// Currently a tuple-shaped wrapper. The compiler optimizes this to
/// the equivalent of two pointers; there is no runtime overhead.
#[derive(Clone, Copy)]
pub struct LayoutSvgElement<'a> {
    pub dom: &'a DemoDom,
    pub id: NodeId,
}

impl<'a> LayoutSvgElement<'a> {
    pub fn new(dom: &'a DemoDom, id: NodeId) -> Self {
        Self { dom, id }
    }

    pub fn node(&self) -> &'a DemoNode {
        self.dom.node(self.id)
    }
}
