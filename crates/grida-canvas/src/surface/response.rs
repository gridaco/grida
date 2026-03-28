use crate::node::schema::NodeId;

/// Describes what changed after processing a [`SurfaceEvent`].
///
/// The host uses this to decide whether to queue a redraw or update the
/// platform cursor.
#[derive(Debug, Clone, Default)]
pub struct SurfaceResponse {
    /// Whether the surface visuals changed and a redraw should be queued.
    pub needs_redraw: bool,
    /// Whether the cursor icon changed.
    pub cursor_changed: bool,
    /// Whether the selection set changed.
    pub selection_changed: bool,
    /// Whether the hover target changed.
    pub hover_changed: bool,
    /// Node that was double-clicked (for entering text edit mode).
    pub double_clicked_node: Option<NodeId>,
}

impl SurfaceResponse {
    /// No changes — the event was a no-op.
    pub fn none() -> Self {
        Self::default()
    }

    /// Only a redraw is needed (e.g. decoration geometry changed).
    pub fn redraw() -> Self {
        Self {
            needs_redraw: true,
            ..Self::default()
        }
    }

    /// Merge another response into this one (logical OR of all flags).
    pub fn merge(&mut self, other: &SurfaceResponse) {
        self.needs_redraw |= other.needs_redraw;
        self.cursor_changed |= other.cursor_changed;
        self.selection_changed |= other.selection_changed;
        self.hover_changed |= other.hover_changed;
        if other.double_clicked_node.is_some() {
            self.double_clicked_node = other.double_clicked_node;
        }
    }
}
