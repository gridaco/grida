use crate::node::schema::NodeId;

/// An ordered set of selected node IDs (no duplicates, insertion order preserved).
#[derive(Debug, Clone, Default)]
pub struct SelectionState {
    selected: Vec<NodeId>,
}

impl SelectionState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Replace the entire selection.
    pub fn set(&mut self, ids: Vec<NodeId>) {
        self.selected = ids;
        self.dedup();
    }

    /// Select a single node, clearing previous selection.
    pub fn select_one(&mut self, id: NodeId) {
        self.selected.clear();
        self.selected.push(id);
    }

    /// Add a node to the selection if not already present.
    pub fn add(&mut self, id: NodeId) {
        if !self.contains(&id) {
            self.selected.push(id);
        }
    }

    /// Remove a node from the selection.
    pub fn remove(&mut self, id: &NodeId) {
        self.selected.retain(|n| n != id);
    }

    /// Toggle a node in/out of the selection.
    pub fn toggle(&mut self, id: NodeId) {
        if self.contains(&id) {
            self.remove(&id);
        } else {
            self.selected.push(id);
        }
    }

    pub fn clear(&mut self) {
        self.selected.clear();
    }

    pub fn contains(&self, id: &NodeId) -> bool {
        self.selected.contains(id)
    }

    pub fn is_empty(&self) -> bool {
        self.selected.is_empty()
    }

    pub fn len(&self) -> usize {
        self.selected.len()
    }

    pub fn iter(&self) -> impl Iterator<Item = &NodeId> {
        self.selected.iter()
    }

    pub fn as_slice(&self) -> &[NodeId] {
        &self.selected
    }

    fn dedup(&mut self) {
        let mut seen = Vec::with_capacity(self.selected.len());
        self.selected.retain(|id| {
            if seen.contains(id) {
                false
            } else {
                seen.push(id.clone());
                true
            }
        });
    }
}
