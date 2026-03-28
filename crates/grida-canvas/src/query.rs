//! Hierarchy-aware query utilities for node selections.
//!
//! This module provides functions that operate on sets of node IDs within a
//! tree hierarchy. The core operation is **pruning**: given a selection of
//! nodes, remove any node whose ancestor is also in the selection. This
//! prevents double-application of operations (e.g. transforms) to both a
//! parent and its children.
//!
//! All functions are pure, stateless, and work against the [`Hierarchy`] trait,
//! making them agnostic to the concrete tree implementation.

use crate::node::schema::NodeId;

/// Minimal trait for walking a node hierarchy upward.
///
/// Implementors only need to provide parent lookup — no children or sibling
/// access is required for the query operations in this module.
pub trait Hierarchy {
    /// Return the parent of `id`, or `None` if `id` is a root.
    fn parent(&self, id: &NodeId) -> Option<NodeId>;
}

/// Options for [`query_selection`].
#[derive(Debug, Clone, Copy)]
pub struct QueryOptions {
    /// When `true`, prune nodes whose ancestor is already in the selection
    /// (keep only the topmost nodes). When `false`, return the selection as-is
    /// (only deduplication is applied).
    pub prune_nested: bool,
}

impl Default for QueryOptions {
    fn default() -> Self {
        Self { prune_nested: true }
    }
}

/// Filter a selection of node IDs according to [`QueryOptions`].
///
/// With `prune_nested = true` (the default), any node whose ancestor is also
/// in `selection` is removed. The returned vec preserves the input order of
/// the surviving nodes and contains no duplicates.
///
/// With `prune_nested = false`, the selection is returned as-is (deduplicated).
pub fn query_selection(
    hierarchy: &impl Hierarchy,
    selection: &[NodeId],
    options: QueryOptions,
) -> Vec<NodeId> {
    if !options.prune_nested {
        return dedup_preserve_order(selection);
    }
    prune_nested(hierarchy, selection)
}

/// Remove nodes from `selection` that are descendants of other nodes in the
/// same selection. Preserves input order, no duplicates.
///
/// # Algorithm
///
/// For each node in the selection, walk up the ancestor chain. If any ancestor
/// is found in the selection set, this node is nested and should be pruned.
/// Otherwise it is kept.
///
/// Complexity: O(n · d) where n = selection length, d = max tree depth.
pub fn prune_nested(hierarchy: &impl Hierarchy, selection: &[NodeId]) -> Vec<NodeId> {
    if selection.len() <= 1 {
        return selection.to_vec();
    }

    // Build a fast lookup set for O(1) membership tests.
    let set: std::collections::HashSet<NodeId> = selection.iter().copied().collect();
    let mut result = Vec::with_capacity(selection.len());
    let mut seen = std::collections::HashSet::with_capacity(selection.len());

    for &id in selection {
        // Skip duplicates
        if !seen.insert(id) {
            continue;
        }
        if !has_ancestor_in_set(hierarchy, id, &set) {
            result.push(id);
        }
    }

    result
}

/// Check whether `id` is a descendant of any node in `ancestors`.
///
/// Returns `true` if there exists a node `a` in `ancestors` such that `a` is
/// a proper ancestor of `id` (i.e. `a != id` and `a` is reachable by walking
/// up from `id`).
pub fn is_descendant_of_any(
    hierarchy: &impl Hierarchy,
    id: NodeId,
    ancestors: &std::collections::HashSet<NodeId>,
) -> bool {
    has_ancestor_in_set(hierarchy, id, ancestors)
}

/// Check whether `ancestor` is a proper ancestor of `node`.
///
/// Walks from `node` upward; returns `true` if `ancestor` is encountered
/// before reaching the root.
pub fn is_ancestor(hierarchy: &impl Hierarchy, ancestor: NodeId, node: NodeId) -> bool {
    let mut current = node;
    while let Some(parent) = hierarchy.parent(&current) {
        if parent == ancestor {
            return true;
        }
        current = parent;
    }
    false
}

/// Get the depth of a node (0 for roots).
pub fn depth(hierarchy: &impl Hierarchy, id: NodeId) -> usize {
    let mut d = 0;
    let mut current = id;
    while let Some(parent) = hierarchy.parent(&current) {
        d += 1;
        current = parent;
    }
    d
}

/// Collect all ancestors of `id` from root to immediate parent.
pub fn ancestors(hierarchy: &impl Hierarchy, id: NodeId) -> Vec<NodeId> {
    let mut path = Vec::new();
    let mut current = id;
    while let Some(parent) = hierarchy.parent(&current) {
        path.push(parent);
        current = parent;
    }
    path.reverse();
    path
}

// -------------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------------

/// Walk up from `id` (exclusive) and return `true` if any ancestor is in `set`.
fn has_ancestor_in_set(
    hierarchy: &impl Hierarchy,
    id: NodeId,
    set: &std::collections::HashSet<NodeId>,
) -> bool {
    let mut current = id;
    while let Some(parent) = hierarchy.parent(&current) {
        if set.contains(&parent) {
            return true;
        }
        current = parent;
    }
    false
}

/// Deduplicate while preserving first-occurrence order.
fn dedup_preserve_order(ids: &[NodeId]) -> Vec<NodeId> {
    let mut seen = std::collections::HashSet::with_capacity(ids.len());
    ids.iter().copied().filter(|id| seen.insert(*id)).collect()
}

// -------------------------------------------------------------------------
// Hierarchy impl for SceneGraph
// -------------------------------------------------------------------------

impl Hierarchy for crate::node::scene_graph::SceneGraph {
    fn parent(&self, id: &NodeId) -> Option<NodeId> {
        self.get_parent(id)
    }
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    /// A trivial tree for testing, backed by a parent map.
    struct TestTree {
        parents: HashMap<NodeId, NodeId>,
    }

    impl TestTree {
        fn new(edges: &[(NodeId, NodeId)]) -> Self {
            let mut parents = HashMap::new();
            for &(child, parent) in edges {
                parents.insert(child, parent);
            }
            Self { parents }
        }
    }

    impl Hierarchy for TestTree {
        fn parent(&self, id: &NodeId) -> Option<NodeId> {
            self.parents.get(id).copied()
        }
    }

    //
    //  Test tree:
    //
    //        1
    //       / \
    //      2   3
    //     / \   \
    //    4   5   6
    //   /
    //  7
    //
    //  8 (separate root)
    //   \
    //    9
    //
    fn tree() -> TestTree {
        TestTree::new(&[(2, 1), (3, 1), (4, 2), (5, 2), (6, 3), (7, 4), (9, 8)])
    }

    // ---- prune_nested ----

    #[test]
    fn prune_empty() {
        let t = tree();
        assert_eq!(prune_nested(&t, &[]), Vec::<NodeId>::new());
    }

    #[test]
    fn prune_single() {
        let t = tree();
        assert_eq!(prune_nested(&t, &[3]), vec![3]);
    }

    #[test]
    fn prune_disjoint_roots() {
        let t = tree();
        assert_eq!(prune_nested(&t, &[1, 8]), vec![1, 8]);
    }

    #[test]
    fn prune_parent_and_child() {
        let t = tree();
        // Selecting node 2 and its child 4 → keep only 2
        assert_eq!(prune_nested(&t, &[2, 4]), vec![2]);
    }

    #[test]
    fn prune_parent_and_deep_descendant() {
        let t = tree();
        // Selecting node 1 and its deep descendant 7 → keep only 1
        assert_eq!(prune_nested(&t, &[1, 7]), vec![1]);
    }

    #[test]
    fn prune_ancestor_after_descendant_in_input_order() {
        let t = tree();
        // Descendant listed first, ancestor listed second
        // 7 is descendant of 2 → 7 should be pruned even though it appears first
        assert_eq!(prune_nested(&t, &[7, 2]), vec![2]);
    }

    #[test]
    fn prune_complex_selection() {
        let t = tree();
        // Select: 1 (root), 4 (under 1), 5 (under 1), 7 (under 1), 8 (separate root), 9 (under 8)
        // Expected: 1 and 8 (everything else is nested)
        assert_eq!(prune_nested(&t, &[1, 4, 5, 7, 8, 9]), vec![1, 8]);
    }

    #[test]
    fn prune_siblings_kept() {
        let t = tree();
        // Siblings 4 and 5 (both children of 2, parent not selected) → both kept
        assert_eq!(prune_nested(&t, &[4, 5]), vec![4, 5]);
    }

    #[test]
    fn prune_mixed_branches() {
        let t = tree();
        // 2 and 6: different branches, no nesting → both kept
        assert_eq!(prune_nested(&t, &[2, 6]), vec![2, 6]);
    }

    #[test]
    fn prune_duplicates_removed() {
        let t = tree();
        assert_eq!(prune_nested(&t, &[3, 3, 6]), vec![3]);
    }

    #[test]
    fn prune_all_nodes_under_root() {
        let t = tree();
        // Select entire tree rooted at 1
        assert_eq!(prune_nested(&t, &[1, 2, 3, 4, 5, 6, 7]), vec![1]);
    }

    // ---- is_ancestor ----

    #[test]
    fn ancestor_direct_parent() {
        let t = tree();
        assert!(is_ancestor(&t, 2, 4));
    }

    #[test]
    fn ancestor_grandparent() {
        let t = tree();
        assert!(is_ancestor(&t, 1, 7));
    }

    #[test]
    fn ancestor_not_related() {
        let t = tree();
        assert!(!is_ancestor(&t, 3, 4));
    }

    #[test]
    fn ancestor_self_is_not_ancestor() {
        let t = tree();
        assert!(!is_ancestor(&t, 4, 4));
    }

    #[test]
    fn ancestor_child_is_not_ancestor_of_parent() {
        let t = tree();
        assert!(!is_ancestor(&t, 7, 1));
    }

    // ---- depth ----

    #[test]
    fn depth_root() {
        let t = tree();
        assert_eq!(depth(&t, 1), 0);
    }

    #[test]
    fn depth_leaf() {
        let t = tree();
        assert_eq!(depth(&t, 7), 3); // 7 → 4 → 2 → 1
    }

    // ---- ancestors ----

    #[test]
    fn ancestors_root() {
        let t = tree();
        assert_eq!(ancestors(&t, 1), Vec::<NodeId>::new());
    }

    #[test]
    fn ancestors_deep() {
        let t = tree();
        assert_eq!(ancestors(&t, 7), vec![1, 2, 4]);
    }

    // ---- query_selection with prune_nested = false ----

    #[test]
    fn query_no_prune_deduplicates() {
        let t = tree();
        let opts = QueryOptions {
            prune_nested: false,
        };
        assert_eq!(query_selection(&t, &[3, 3, 6, 6], opts), vec![3, 6]);
    }

    #[test]
    fn query_no_prune_keeps_nested() {
        let t = tree();
        let opts = QueryOptions {
            prune_nested: false,
        };
        assert_eq!(query_selection(&t, &[1, 7], opts), vec![1, 7]);
    }

    // ---- query_selection with prune_nested = true (default) ----

    #[test]
    fn query_default_prunes() {
        let t = tree();
        assert_eq!(
            query_selection(&t, &[1, 4, 8], QueryOptions::default()),
            vec![1, 8]
        );
    }
}
