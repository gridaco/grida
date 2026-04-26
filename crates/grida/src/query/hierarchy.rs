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

/// Return the structural identity path from the scene root to `id`, inclusive.
///
/// The returned vector contains the ordered node ID chain:
/// `[root, ..., grandparent, parent, id]`.
///
/// - For a root node, the result is `[id]`.
/// - The path reflects the structural parent–child containment hierarchy only,
///   not visual layout, transform order, or render traversal order.
/// - The result is stable under sibling reordering.
///
/// Returns `None` if the hierarchy has no record of `id` (i.e. `id` has no
/// parent *and* is not reachable from any root). Callers that need to
/// distinguish "root node" from "unknown node" should check membership
/// separately before calling this function.
pub fn node_id_path(hierarchy: &impl Hierarchy, id: NodeId) -> Vec<NodeId> {
    let mut path = ancestors(hierarchy, id);
    path.push(id);
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
// Selection navigation (Selector)
// -------------------------------------------------------------------------

use crate::node::scene_graph::SceneGraph;

/// CSS-like selector for navigating the node hierarchy relative to the
/// current selection.
///
/// Mirrors the web editor's `Selector` vocabulary (`">"`, `".."`, `"~"`,
/// `"~+"`, `"~-"`, `"*"`) but represented as a Rust enum for type safety
/// and zero-cost dispatch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Selector {
    /// `"*"` — every node in the scene (roots + all descendants).
    All,
    /// `">"` — direct children of every selected node.
    Children,
    /// `".."` — parent of every selected node (deduplicated).
    Parent,
    /// `"~"` — siblings of the current selection.
    ///
    /// - Empty selection → falls back to [`All`](Selector::All).
    /// - Single node → all children of that node's parent (including self).
    /// - Multiple nodes → siblings only if they share a parent; empty otherwise.
    Siblings,
    /// `"~+"` — next sibling of `selection[0]`, wrapping to first.
    NextSibling,
    /// `"~-"` — previous sibling of `selection[0]`, wrapping to last.
    PreviousSibling,
}

/// Resolve a [`Selector`] against the scene graph and current selection.
///
/// Returns the resulting node IDs. The output is always deduplicated and
/// preserves child-order where applicable.
pub fn query_select(graph: &SceneGraph, selection: &[NodeId], selector: Selector) -> Vec<NodeId> {
    match selector {
        Selector::All => all_nodes(graph),
        Selector::Children => select_children(graph, selection),
        Selector::Parent => select_parent(graph, selection),
        Selector::Siblings => select_siblings(graph, selection),
        Selector::NextSibling => select_adjacent_sibling(graph, selection, Direction::Next),
        Selector::PreviousSibling => select_adjacent_sibling(graph, selection, Direction::Previous),
    }
}

#[derive(Clone, Copy)]
enum Direction {
    Next,
    Previous,
}

/// Collect every node in the scene (roots, then depth-first children).
fn all_nodes(graph: &SceneGraph) -> Vec<NodeId> {
    let mut result = Vec::new();
    for &root in graph.roots() {
        collect_subtree(graph, root, &mut result);
    }
    result
}

fn collect_subtree(graph: &SceneGraph, id: NodeId, out: &mut Vec<NodeId>) {
    out.push(id);
    if let Some(children) = graph.get_children(&id) {
        for &child in children {
            collect_subtree(graph, child, out);
        }
    }
}

/// `">"` — direct children of every selected node.
fn select_children(graph: &SceneGraph, selection: &[NodeId]) -> Vec<NodeId> {
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for id in selection {
        if let Some(children) = graph.get_children(id) {
            for &child in children {
                if seen.insert(child) {
                    result.push(child);
                }
            }
        }
    }
    result
}

/// `".."` — parent of every selected node (deduplicated).
fn select_parent(graph: &SceneGraph, selection: &[NodeId]) -> Vec<NodeId> {
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for id in selection {
        if let Some(parent) = graph.get_parent(id) {
            if seen.insert(parent) {
                result.push(parent);
            }
        }
    }
    result
}

/// `"~"` — siblings of the selection.
fn select_siblings(graph: &SceneGraph, selection: &[NodeId]) -> Vec<NodeId> {
    if selection.is_empty() {
        return all_nodes(graph);
    }
    // Get the sibling list for the first selected node.
    let siblings = siblings_of(graph, &selection[0]);
    if selection.len() == 1 {
        return siblings;
    }
    // Multiple selection: only return siblings if all selected nodes share
    // the same parent. Otherwise return empty (ambiguous context).
    let first_parent = graph.get_parent(&selection[0]);
    let all_same_parent = selection[1..]
        .iter()
        .all(|id| graph.get_parent(id) == first_parent);
    if all_same_parent {
        siblings
    } else {
        Vec::new()
    }
}

/// `"~+"` / `"~-"` — adjacent sibling of `selection[0]` with wrap-around.
fn select_adjacent_sibling(
    graph: &SceneGraph,
    selection: &[NodeId],
    direction: Direction,
) -> Vec<NodeId> {
    let id = match selection.first() {
        Some(id) => id,
        None => return Vec::new(),
    };
    let siblings = siblings_of(graph, id);
    if siblings.is_empty() {
        return Vec::new();
    }
    let pos = match siblings.iter().position(|s| s == id) {
        Some(p) => p,
        None => return Vec::new(),
    };
    let next_pos = match direction {
        Direction::Next => {
            if pos + 1 < siblings.len() {
                pos + 1
            } else {
                0
            }
        }
        Direction::Previous => {
            if pos > 0 {
                pos - 1
            } else {
                siblings.len() - 1
            }
        }
    };
    vec![siblings[next_pos]]
}

/// Return all children of `id`'s parent (the sibling list including `id`).
/// For root nodes, returns all roots.
fn siblings_of(graph: &SceneGraph, id: &NodeId) -> Vec<NodeId> {
    match graph.get_parent(id) {
        Some(parent) => graph.get_children(&parent).cloned().unwrap_or_default(),
        None => graph.roots().to_vec(),
    }
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

    // ---- node_id_path ----

    #[test]
    fn node_id_path_root() {
        let t = tree();
        assert_eq!(node_id_path(&t, 1), vec![1]);
    }

    #[test]
    fn node_id_path_deep() {
        let t = tree();
        // 7 → 4 → 2 → 1, so path is [1, 2, 4, 7]
        assert_eq!(node_id_path(&t, 7), vec![1, 2, 4, 7]);
    }

    #[test]
    fn node_id_path_child() {
        let t = tree();
        assert_eq!(node_id_path(&t, 2), vec![1, 2]);
    }

    #[test]
    fn node_id_path_separate_root() {
        let t = tree();
        assert_eq!(node_id_path(&t, 8), vec![8]);
    }

    #[test]
    fn node_id_path_under_separate_root() {
        let t = tree();
        assert_eq!(node_id_path(&t, 9), vec![8, 9]);
    }

    #[test]
    fn node_id_path_unknown_node() {
        let t = tree();
        // Node 999 has no parent entry → treated as a root-like node
        assert_eq!(node_id_path(&t, 999), vec![999]);
    }

    #[test]
    fn node_id_path_stable_under_sibling_order() {
        // Sibling order doesn't affect ancestry path
        let t = tree();
        // Nodes 4 and 5 are siblings under 2; both paths are independent
        assert_eq!(node_id_path(&t, 4), vec![1, 2, 4]);
        assert_eq!(node_id_path(&t, 5), vec![1, 2, 5]);
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

    // ====================================================================
    // Selector / query_select tests (require SceneGraph)
    // ====================================================================

    mod selector_tests {
        use super::*;
        use crate::node::factory::NodeFactory;
        use crate::node::scene_graph::{Parent, SceneGraph};
        use crate::node::schema::Node;

        /// Build a test scene graph:
        ///
        ///   root_group                 (id varies)
        ///     ├── child_a  (rect)
        ///     ├── child_b  (rect)
        ///     └── nested_group
        ///           └── grandchild (rect)
        ///   lone_rect  (root, no children)
        struct Scene {
            g: SceneGraph,
            root_group: NodeId,
            child_a: NodeId,
            child_b: NodeId,
            nested_group: NodeId,
            grandchild: NodeId,
            lone_rect: NodeId,
        }

        fn build_scene() -> Scene {
            let f = NodeFactory::new();
            let mut g = SceneGraph::new();

            let root_group = g.append_child(Node::Group(f.create_group_node()), Parent::Root);
            let child_a = g.append_child(
                Node::Rectangle(f.create_rectangle_node()),
                Parent::NodeId(root_group),
            );
            let child_b = g.append_child(
                Node::Rectangle(f.create_rectangle_node()),
                Parent::NodeId(root_group),
            );
            let nested_group = g.append_child(
                Node::Group(f.create_group_node()),
                Parent::NodeId(root_group),
            );
            let grandchild = g.append_child(
                Node::Rectangle(f.create_rectangle_node()),
                Parent::NodeId(nested_group),
            );
            let lone_rect =
                g.append_child(Node::Rectangle(f.create_rectangle_node()), Parent::Root);

            Scene {
                g,
                root_group,
                child_a,
                child_b,
                nested_group,
                grandchild,
                lone_rect,
            }
        }

        fn qs(g: &SceneGraph, sel: &[NodeId], selector: Selector) -> Vec<NodeId> {
            query_select(g, sel, selector)
        }

        // ---- Children ----

        #[test]
        fn children_of_group() {
            let s = build_scene();
            assert_eq!(
                qs(&s.g, &[s.root_group], Selector::Children),
                vec![s.child_a, s.child_b, s.nested_group]
            );
        }

        #[test]
        fn children_of_leaf_is_empty() {
            let s = build_scene();
            assert_eq!(
                qs(&s.g, &[s.child_a], Selector::Children),
                Vec::<NodeId>::new()
            );
        }

        #[test]
        fn children_of_nested_group() {
            let s = build_scene();
            assert_eq!(
                qs(&s.g, &[s.nested_group], Selector::Children),
                vec![s.grandchild]
            );
        }

        #[test]
        fn children_of_multiple() {
            let s = build_scene();
            assert_eq!(
                qs(&s.g, &[s.root_group, s.nested_group], Selector::Children),
                vec![s.child_a, s.child_b, s.nested_group, s.grandchild]
            );
        }

        #[test]
        fn children_empty_selection() {
            let s = build_scene();
            assert_eq!(qs(&s.g, &[], Selector::Children), Vec::<NodeId>::new());
        }

        // ---- Parent ----

        #[test]
        fn parent_single() {
            let s = build_scene();
            assert_eq!(qs(&s.g, &[s.child_a], Selector::Parent), vec![s.root_group]);
        }

        #[test]
        fn parent_root_has_none() {
            let s = build_scene();
            assert_eq!(
                qs(&s.g, &[s.root_group], Selector::Parent),
                Vec::<NodeId>::new()
            );
        }

        #[test]
        fn parent_siblings_deduped() {
            let s = build_scene();
            // child_a and child_b share root_group → single entry
            assert_eq!(
                qs(&s.g, &[s.child_a, s.child_b], Selector::Parent),
                vec![s.root_group]
            );
        }

        #[test]
        fn parent_different_branches() {
            let s = build_scene();
            assert_eq!(
                qs(&s.g, &[s.child_a, s.grandchild], Selector::Parent),
                vec![s.root_group, s.nested_group]
            );
        }

        // ---- Parent ↔ Children round-trip ----

        #[test]
        fn parent_then_children_round_trip() {
            let s = build_scene();
            let parents = qs(&s.g, &[s.child_a], Selector::Parent);
            assert_eq!(parents, vec![s.root_group]);
            let children = qs(&s.g, &parents, Selector::Children);
            assert_eq!(children, vec![s.child_a, s.child_b, s.nested_group]);
        }

        // ---- NextSibling ----

        #[test]
        fn next_sibling_middle() {
            let s = build_scene();
            assert_eq!(
                qs(&s.g, &[s.child_a], Selector::NextSibling),
                vec![s.child_b]
            );
        }

        #[test]
        fn next_sibling_wraps() {
            let s = build_scene();
            // nested_group is last child → wraps to child_a
            assert_eq!(
                qs(&s.g, &[s.nested_group], Selector::NextSibling),
                vec![s.child_a]
            );
        }

        #[test]
        fn next_sibling_empty_selection() {
            let s = build_scene();
            assert_eq!(qs(&s.g, &[], Selector::NextSibling), Vec::<NodeId>::new());
        }

        #[test]
        fn next_sibling_only_child() {
            let s = build_scene();
            // grandchild is the only child of nested_group → wraps to itself
            assert_eq!(
                qs(&s.g, &[s.grandchild], Selector::NextSibling),
                vec![s.grandchild]
            );
        }

        #[test]
        fn next_sibling_root_level() {
            let s = build_scene();
            // root_group → lone_rect (next root)
            assert_eq!(
                qs(&s.g, &[s.root_group], Selector::NextSibling),
                vec![s.lone_rect]
            );
        }

        // ---- PreviousSibling ----

        #[test]
        fn prev_sibling_middle() {
            let s = build_scene();
            assert_eq!(
                qs(&s.g, &[s.child_b], Selector::PreviousSibling),
                vec![s.child_a]
            );
        }

        #[test]
        fn prev_sibling_wraps() {
            let s = build_scene();
            // child_a is first child → wraps to nested_group (last)
            assert_eq!(
                qs(&s.g, &[s.child_a], Selector::PreviousSibling),
                vec![s.nested_group]
            );
        }

        #[test]
        fn prev_sibling_root_level_wraps() {
            let s = build_scene();
            // root_group is first root → wraps to lone_rect (last root)
            assert_eq!(
                qs(&s.g, &[s.root_group], Selector::PreviousSibling),
                vec![s.lone_rect]
            );
        }

        // ---- Siblings ----

        #[test]
        fn siblings_single_selection() {
            let s = build_scene();
            // child_a's siblings = all children of root_group
            assert_eq!(
                qs(&s.g, &[s.child_a], Selector::Siblings),
                vec![s.child_a, s.child_b, s.nested_group]
            );
        }

        #[test]
        fn siblings_multiple_same_parent() {
            let s = build_scene();
            assert_eq!(
                qs(&s.g, &[s.child_a, s.child_b], Selector::Siblings),
                vec![s.child_a, s.child_b, s.nested_group]
            );
        }

        #[test]
        fn siblings_multiple_different_parents_is_empty() {
            let s = build_scene();
            // child_a (under root_group) and grandchild (under nested_group) → empty
            assert_eq!(
                qs(&s.g, &[s.child_a, s.grandchild], Selector::Siblings),
                Vec::<NodeId>::new()
            );
        }

        #[test]
        fn siblings_empty_falls_back_to_all() {
            let s = build_scene();
            let result = qs(&s.g, &[], Selector::Siblings);
            // Should contain all nodes (depth-first)
            assert_eq!(result.len(), 6);
            assert!(result.contains(&s.root_group));
            assert!(result.contains(&s.child_a));
            assert!(result.contains(&s.grandchild));
            assert!(result.contains(&s.lone_rect));
        }

        #[test]
        fn siblings_root_node() {
            let s = build_scene();
            // root_group's siblings = all roots
            assert_eq!(
                qs(&s.g, &[s.root_group], Selector::Siblings),
                vec![s.root_group, s.lone_rect]
            );
        }

        // ---- All ----

        #[test]
        fn all_returns_every_node() {
            let s = build_scene();
            let result = qs(&s.g, &[], Selector::All);
            assert_eq!(result.len(), 6);
            // Depth-first order: root_group, child_a, child_b, nested_group, grandchild, lone_rect
            assert_eq!(
                result,
                vec![
                    s.root_group,
                    s.child_a,
                    s.child_b,
                    s.nested_group,
                    s.grandchild,
                    s.lone_rect
                ]
            );
        }

        #[test]
        fn all_ignores_selection() {
            let s = build_scene();
            // All always returns everything regardless of selection
            assert_eq!(
                qs(&s.g, &[s.child_a], Selector::All),
                qs(&s.g, &[], Selector::All)
            );
        }

        // ---- Full navigation cycle ----

        #[test]
        fn full_navigation_enter_tab_tab_shift_enter() {
            let s = build_scene();
            // Start: select root_group
            let sel = vec![s.root_group];
            // Enter → children
            let sel = qs(&s.g, &sel, Selector::Children);
            assert_eq!(sel, vec![s.child_a, s.child_b, s.nested_group]);
            // Tab from child_a → child_b
            let sel = qs(&s.g, &[sel[0]], Selector::NextSibling);
            assert_eq!(sel, vec![s.child_b]);
            // Tab → nested_group
            let sel = qs(&s.g, &sel, Selector::NextSibling);
            assert_eq!(sel, vec![s.nested_group]);
            // Shift+Enter → back to root_group
            let sel = qs(&s.g, &sel, Selector::Parent);
            assert_eq!(sel, vec![s.root_group]);
        }
    }
}
