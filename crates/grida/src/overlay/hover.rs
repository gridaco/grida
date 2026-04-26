use crate::node::schema::NodeId;

/// Where the hover originated.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HoverSource {
    /// From a canvas hit test (pointer move over geometry).
    HitTest,
}

/// Tracks which node the pointer is currently hovering over.
#[derive(Debug, Clone, Default)]
pub struct HoverState {
    hovered: Option<NodeId>,
    source: Option<HoverSource>,
}

impl HoverState {
    pub fn hovered(&self) -> Option<&NodeId> {
        self.hovered.as_ref()
    }

    pub fn source(&self) -> Option<HoverSource> {
        self.source
    }

    /// Update hover target. Returns `true` if the hover changed.
    pub fn set(&mut self, id: Option<NodeId>, source: HoverSource) -> bool {
        let changed = self.hovered != id;
        self.hovered = id;
        self.source = if id.is_some() { Some(source) } else { None };
        changed
    }

    pub fn clear(&mut self) -> bool {
        let changed = self.hovered.is_some();
        self.hovered = None;
        self.source = None;
        changed
    }
}
