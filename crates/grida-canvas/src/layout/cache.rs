use crate::layout::ComputedLayout;
use crate::node::schema::NodeId;
use std::collections::HashMap;

/// Immutable layout computation result
///
/// Maps NodeId to computed position/size. Represents the output of a layout
/// computation phase. Cached between frames for performance and change detection.
#[derive(Debug, Clone, PartialEq)]
pub struct LayoutResult {
    layouts: HashMap<NodeId, ComputedLayout>,
}

impl LayoutResult {
    pub fn new() -> Self {
        Self {
            layouts: HashMap::new(),
        }
    }

    pub fn insert(&mut self, id: NodeId, layout: ComputedLayout) {
        self.layouts.insert(id, layout);
    }

    pub fn get(&self, id: &NodeId) -> Option<&ComputedLayout> {
        self.layouts.get(id)
    }

    pub fn len(&self) -> usize {
        self.layouts.len()
    }

    pub fn is_empty(&self) -> bool {
        self.layouts.is_empty()
    }

    pub fn clear(&mut self) {
        self.layouts.clear();
    }

    pub fn iter(&self) -> impl Iterator<Item = (&NodeId, &ComputedLayout)> {
        self.layouts.iter()
    }

    /// Pre-allocate storage for `capacity` layout entries.
    ///
    /// Call after `clear()` when the upcoming node count is known.
    pub fn reserve(&mut self, capacity: usize) {
        if self.layouts.capacity() < capacity {
            self.layouts.reserve(capacity);
        }
    }
}

impl Default for LayoutResult {
    fn default() -> Self {
        Self::new()
    }
}
