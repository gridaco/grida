//! Paint aggregation queries for sets of nodes.
//!
//! Collects and groups paints across a set of nodes (optionally including
//! their descendants), using hash-based grouping (O(n)) instead of pairwise
//! deep equality (O(n²)).
//!
//! The core function [`query_paint_groups`] is agnostic to concrete
//! scene graph implementations — it operates through the [`PaintSource`]
//! and [`ChildrenIter`] traits.

use crate::cg::types::Paint;
use crate::node::schema::NodeId;
use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, HashSet};
use std::hash::Hasher;

/// Where to look for paints on each node.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PaintTarget {
    Fill,
    Stroke,
}

/// Trait for retrieving active fill/stroke paints from a node by ID.
pub trait PaintSource {
    /// Return the active paints for `id` in the given `target` slot.
    /// Returns an empty slice if the node has no paints for this target.
    fn active_paints(&self, id: &NodeId, target: PaintTarget) -> Vec<Paint>;
}

/// Trait for iterating the direct children of a node.
pub trait ChildrenIter {
    /// Return the direct children of `id`, or an empty slice if it has none.
    fn children(&self, id: &NodeId) -> Option<&Vec<NodeId>>;
}

/// A group of nodes sharing the same paint.
#[derive(Debug, Clone)]
pub struct PaintGroup {
    /// The shared paint value.
    pub paint: Paint,
    /// Node IDs that have this paint (deduplicated).
    pub node_ids: Vec<NodeId>,
}

/// Collect and group active paints across a set of nodes.
///
/// # Arguments
///
/// - `ids` — Root node IDs to query.
/// - `target` — Which paint slot to read (`Fill` or `Stroke`).
/// - `recursive` — When `true`, each id is expanded into its full subtree
///   (DFS, iterative) before collecting paints. When `false`, only the
///   listed ids are queried.
/// - `limit` — Stop creating new groups once this many distinct paints have
///   been found (`None` = unlimited). Nodes are still added to existing
///   groups after the limit is reached.
///
/// # Algorithm
///
/// 1. (If recursive) expand each id into its full subtree via DFS.
/// 2. For each node, collect active paints for the given `target`.
/// 3. Group paints by hash (using `Paint::hash_for_cache`).
///    On hash collision, fall back to `PartialEq` to confirm identity.
/// 4. Stop creating new groups once `limit` is reached.
///
/// Complexity: O(N) where N = total nodes visited,
/// assuming low hash collision rate.
pub fn query_paint_groups(
    source: &impl PaintSource,
    tree: &impl ChildrenIter,
    ids: &[NodeId],
    target: PaintTarget,
    recursive: bool,
    limit: Option<usize>,
) -> Vec<PaintGroup> {
    let mut visited = HashSet::new();
    let mut hash_to_indices: HashMap<u64, Vec<usize>> = HashMap::new();
    let mut groups: Vec<PaintGroup> = Vec::new();

    let limit_reached = |groups: &Vec<PaintGroup>, limit: Option<usize>| -> bool {
        limit.map_or(false, |l| groups.len() >= l)
    };

    if recursive {
        // DFS: expand each id into its full subtree
        let mut stack: Vec<NodeId> = Vec::new();
        for &id in ids.iter().rev() {
            stack.push(id);
        }

        while let Some(id) = stack.pop() {
            if !visited.insert(id) {
                continue;
            }

            collect_paints(
                source,
                id,
                target,
                &mut groups,
                &mut hash_to_indices,
                limit,
                &limit_reached,
            );

            if let Some(children) = tree.children(&id) {
                for child_id in children.iter().rev() {
                    if !visited.contains(child_id) {
                        stack.push(*child_id);
                    }
                }
            }
        }
    } else {
        // Flat: only query the listed ids
        for &id in ids {
            if !visited.insert(id) {
                continue;
            }
            collect_paints(
                source,
                id,
                target,
                &mut groups,
                &mut hash_to_indices,
                limit,
                &limit_reached,
            );
        }
    }

    groups
}

/// Collect paints from a single node and merge into the groups table.
fn collect_paints(
    source: &impl PaintSource,
    id: NodeId,
    target: PaintTarget,
    groups: &mut Vec<PaintGroup>,
    hash_to_indices: &mut HashMap<u64, Vec<usize>>,
    limit: Option<usize>,
    limit_reached: &dyn Fn(&Vec<PaintGroup>, Option<usize>) -> bool,
) {
    let paints = source.active_paints(&id, target);
    for paint in paints {
        let hash = {
            let mut h = DefaultHasher::new();
            paint.hash_for_cache(&mut h);
            h.finish()
        };

        let mut found = false;
        if let Some(indices) = hash_to_indices.get(&hash) {
            for &idx in indices {
                if groups[idx].paint == paint {
                    if !groups[idx].node_ids.contains(&id) {
                        groups[idx].node_ids.push(id);
                    }
                    found = true;
                    break;
                }
            }
        }

        if !found {
            if limit_reached(groups, limit) {
                continue;
            }
            let idx = groups.len();
            groups.push(PaintGroup {
                paint,
                node_ids: vec![id],
            });
            hash_to_indices.entry(hash).or_default().push(idx);
        }
    }
}

/// Backwards-compatible alias — queries with `recursive = true`.
pub fn query_selection_paints(
    source: &impl PaintSource,
    tree: &impl ChildrenIter,
    selection: &[NodeId],
    target: PaintTarget,
    limit: Option<usize>,
) -> Vec<PaintGroup> {
    query_paint_groups(source, tree, selection, target, true, limit)
}

// ---------------------------------------------------------------------------
// Implementations for SceneGraph
// ---------------------------------------------------------------------------

impl ChildrenIter for crate::node::scene_graph::SceneGraph {
    fn children(&self, id: &NodeId) -> Option<&Vec<NodeId>> {
        self.get_children(id)
    }
}

impl PaintSource for crate::node::scene_graph::SceneGraph {
    fn active_paints(&self, id: &NodeId, target: PaintTarget) -> Vec<Paint> {
        let Ok(node) = self.get_node(id) else {
            return Vec::new();
        };

        match target {
            PaintTarget::Fill => match node.fills() {
                Some(paints) => paints.iter().filter(|p| p.active()).cloned().collect(),
                None => Vec::new(),
            },
            PaintTarget::Stroke => {
                // TODO: add Node::strokes() accessor and use it here
                Vec::new()
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cg::color::CGColor;
    use crate::cg::types::{BlendMode, SolidPaint};

    /// Minimal test scene for paint queries.
    struct TestScene {
        children: HashMap<NodeId, Vec<NodeId>>,
        paints: HashMap<NodeId, Vec<Paint>>,
    }

    impl ChildrenIter for TestScene {
        fn children(&self, id: &NodeId) -> Option<&Vec<NodeId>> {
            self.children.get(id)
        }
    }

    impl PaintSource for TestScene {
        fn active_paints(&self, id: &NodeId, _target: PaintTarget) -> Vec<Paint> {
            self.paints.get(id).cloned().unwrap_or_default()
        }
    }

    fn solid(r: u8, g: u8, b: u8) -> Paint {
        Paint::Solid(SolidPaint {
            active: true,
            color: CGColor::from_rgba(r, g, b, 255),
            blend_mode: BlendMode::Normal,
        })
    }

    #[test]
    fn groups_identical_paints() {
        let red = solid(255, 0, 0);
        let blue = solid(0, 0, 255);

        let scene = TestScene {
            children: HashMap::new(),
            paints: HashMap::from([
                (1, vec![red.clone()]),
                (2, vec![red.clone()]),
                (3, vec![blue.clone()]),
            ]),
        };

        let groups = query_paint_groups(&scene, &scene, &[1, 2, 3], PaintTarget::Fill, true, None);
        assert_eq!(groups.len(), 2);

        let red_group = groups.iter().find(|g| g.paint == red).unwrap();
        assert_eq!(red_group.node_ids.len(), 2);

        let blue_group = groups.iter().find(|g| g.paint == blue).unwrap();
        assert_eq!(blue_group.node_ids.len(), 1);
    }

    #[test]
    fn traverses_children_recursive() {
        let red = solid(255, 0, 0);

        let scene = TestScene {
            children: HashMap::from([(1, vec![2, 3])]),
            paints: HashMap::from([(2, vec![red.clone()]), (3, vec![red.clone()])]),
        };

        let groups = query_paint_groups(&scene, &scene, &[1], PaintTarget::Fill, true, None);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].node_ids.len(), 2);
    }

    #[test]
    fn non_recursive_skips_children() {
        let red = solid(255, 0, 0);

        let scene = TestScene {
            children: HashMap::from([(1, vec![2, 3])]),
            paints: HashMap::from([
                (1, vec![red.clone()]),
                (2, vec![red.clone()]),
                (3, vec![red.clone()]),
            ]),
        };

        // Non-recursive: only queries node 1, not its children
        let groups = query_paint_groups(&scene, &scene, &[1], PaintTarget::Fill, false, None);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].node_ids.len(), 1);
        assert_eq!(groups[0].node_ids[0], 1);
    }

    #[test]
    fn respects_limit() {
        let red = solid(255, 0, 0);
        let blue = solid(0, 0, 255);
        let green = solid(0, 255, 0);

        let scene = TestScene {
            children: HashMap::new(),
            paints: HashMap::from([(1, vec![red]), (2, vec![blue]), (3, vec![green])]),
        };

        let groups =
            query_paint_groups(&scene, &scene, &[1, 2, 3], PaintTarget::Fill, true, Some(2));
        assert_eq!(groups.len(), 2);
    }

    #[test]
    fn empty_ids() {
        let scene = TestScene {
            children: HashMap::new(),
            paints: HashMap::new(),
        };

        let groups = query_paint_groups(&scene, &scene, &[], PaintTarget::Fill, true, None);
        assert!(groups.is_empty());
    }
}
