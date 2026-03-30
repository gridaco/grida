//! Central change-tracking for the renderer.
//!
//! Instead of each mutation site manually deciding which caches to
//! invalidate, callers declare *what changed* via [`ChangeFlags`] and the
//! renderer's [`apply_changes`](super::scene::Renderer::apply_changes)
//! method translates those flags into the correct invalidation for every
//! cache layer — once per frame, in one place.
//!
//! This eliminates two classes of bugs:
//! - **Over-invalidation**: e.g. resize nuking per-node caches that are
//!   viewport-independent.
//! - **Under-invalidation**: a new mutation site forgetting to invalidate a
//!   cache, producing stale artifacts.

use crate::node::schema::NodeId;

// ---------------------------------------------------------------------------
// ChangeFlags — bitflags for broad change categories
// ---------------------------------------------------------------------------

/// Bitflags describing what changed since the last frame.
///
/// Multiple flags can be combined with `|`. The central
/// [`apply_changes`](super::scene::Renderer::apply_changes) dispatcher
/// reads these flags to decide which caches need invalidation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ChangeFlags(u32);

#[allow(non_upper_case_globals)]
impl ChangeFlags {
    /// Nothing changed.
    pub const NONE: Self = Self(0);

    /// The viewport/window was resized.
    pub const VIEWPORT_SIZE: Self = Self(1 << 0);

    /// A new scene was loaded (full reset).
    pub const SCENE_LOAD: Self = Self(1 << 1);

    /// Node content changed (fills, strokes, effects — but not text).
    /// Pair with [`ChangeSet::push_node`] for surgical per-node invalidation.
    pub const NODE_CONTENT: Self = Self(1 << 2);

    /// Text content changed on a node.
    /// Pair with [`ChangeSet::push_node`] for surgical per-node invalidation.
    pub const NODE_TEXT: Self = Self(1 << 3);

    /// A font resource was loaded / font config changed.
    pub const FONT_LOADED: Self = Self(1 << 4);

    /// An image resource was loaded.
    pub const IMAGE_LOADED: Self = Self(1 << 5);

    /// Runtime configuration changed (compositing toggle, atlas toggle, etc.).
    pub const CONFIG: Self = Self(1 << 6);

    /// Layout inputs changed (node resize, auto-layout property edit, etc.).
    pub const LAYOUT_DIRTY: Self = Self(1 << 7);

    // -- helpers --

    pub const fn is_empty(self) -> bool {
        self.0 == 0
    }

    pub const fn contains(self, other: Self) -> bool {
        (self.0 & other.0) == other.0
    }

    pub const fn intersects(self, other: Self) -> bool {
        (self.0 & other.0) != 0
    }

    pub const fn union(self, other: Self) -> Self {
        Self(self.0 | other.0)
    }
}

impl std::ops::BitOr for ChangeFlags {
    type Output = Self;
    fn bitor(self, rhs: Self) -> Self {
        self.union(rhs)
    }
}

impl std::ops::BitOrAssign for ChangeFlags {
    fn bitor_assign(&mut self, rhs: Self) {
        *self = self.union(rhs);
    }
}

// ---------------------------------------------------------------------------
// ChangeSet — accumulated changes between frames
// ---------------------------------------------------------------------------

/// Accumulates changes between frames.
///
/// Callers push flags (and optionally specific node IDs) via
/// [`mark`] / [`push_node`]. At frame time the renderer calls
/// [`take`] to consume the set, then dispatches invalidation
/// based on the contents.
#[derive(Debug, Clone, Default)]
pub struct ChangeSet {
    flags: ChangeFlags,
    /// Specific nodes that changed (for surgical per-node invalidation).
    /// Empty when the change is scene-wide (e.g. font loaded).
    nodes: Vec<NodeId>,
}

impl ChangeSet {
    pub fn new() -> Self {
        Self::default()
    }

    /// Record a broad change category.
    pub fn mark(&mut self, flags: ChangeFlags) {
        self.flags |= flags;
    }

    /// Record a change targeting a specific node.
    ///
    /// The node ID is stored for surgical invalidation in caches that
    /// support per-node invalidation (picture cache, compositor, atlas).
    pub fn push_node(&mut self, id: NodeId, flags: ChangeFlags) {
        self.flags |= flags;
        self.nodes.push(id);
    }

    /// True when no changes have been recorded.
    pub fn is_empty(&self) -> bool {
        self.flags.is_empty()
    }

    /// Read the accumulated flags.
    pub fn flags(&self) -> ChangeFlags {
        self.flags
    }

    /// Read the per-node change list.
    pub fn nodes(&self) -> &[NodeId] {
        &self.nodes
    }

    /// Consume the change set, returning it and resetting to empty.
    pub fn take(&mut self) -> ChangeSet {
        std::mem::take(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_by_default() {
        let cs = ChangeSet::new();
        assert!(cs.is_empty());
        assert!(cs.flags().is_empty());
        assert!(cs.nodes().is_empty());
    }

    #[test]
    fn mark_combines_flags() {
        let mut cs = ChangeSet::new();
        cs.mark(ChangeFlags::VIEWPORT_SIZE);
        cs.mark(ChangeFlags::FONT_LOADED);
        assert!(cs.flags().contains(ChangeFlags::VIEWPORT_SIZE));
        assert!(cs.flags().contains(ChangeFlags::FONT_LOADED));
        assert!(!cs.flags().contains(ChangeFlags::SCENE_LOAD));
    }

    #[test]
    fn push_node_records_id_and_flags() {
        let mut cs = ChangeSet::new();
        cs.push_node(42, ChangeFlags::NODE_CONTENT);
        assert!(cs.flags().contains(ChangeFlags::NODE_CONTENT));
        assert_eq!(cs.nodes(), &[42]);
    }

    #[test]
    fn take_resets() {
        let mut cs = ChangeSet::new();
        cs.mark(ChangeFlags::IMAGE_LOADED);
        cs.push_node(7, ChangeFlags::NODE_TEXT);
        let taken = cs.take();
        assert!(cs.is_empty());
        assert!(cs.nodes().is_empty());
        assert!(!taken.is_empty());
        assert!(taken.flags().contains(ChangeFlags::IMAGE_LOADED));
        assert_eq!(taken.nodes(), &[7]);
    }
}
