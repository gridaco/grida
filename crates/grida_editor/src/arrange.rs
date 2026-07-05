//! Arrange — the sheet's z-order rows (keybindings.md "Arrange"):
//! bring to front / send to back and the one-step raise/lower,
//! resolved purely onto the document's `Move` mutation (its index is
//! post-removal document order, `DOC-5`).
//!
//! Scope: the selection must share one parent — a mixed-parent
//! selection has no single sibling order to move within, so the
//! command declines. The moved block keeps its own document order.

use crate::document::{Id, WorkingCopy};

/// The four z-order verbs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ZOrder {
    Front,
    Back,
    Forward,
    Backward,
}

/// Resolve a z-order verb to a `Move` payload: the moved ids in
/// document order, their shared parent, and the post-removal insertion
/// index. `None` = the command declines (empty or mixed-parent
/// selection, or already at the boundary).
pub fn reorder(
    doc: &WorkingCopy,
    selection: &[Id],
    op: ZOrder,
) -> Option<(Vec<Id>, Option<Id>, usize)> {
    let first = selection.first()?;
    let parent = doc.node_parent(first)?;
    for id in &selection[1..] {
        if doc.node_parent(id)? != parent {
            return None;
        }
    }
    let ring = doc.children(parent.as_ref());
    // The moved block in document order; everything else keeps its
    // relative order in the post-removal list.
    let moved: Vec<Id> = ring
        .iter()
        .filter(|id| selection.contains(id))
        .cloned()
        .collect();
    if moved.is_empty() {
        return None;
    }
    let remaining: Vec<&Id> = ring.iter().filter(|id| !selection.contains(id)).collect();
    let last = moved.last()?.clone();
    let first_pos = ring.iter().position(|id| id == &moved[0])?;
    let last_pos = ring.iter().position(|id| *id == last)?;
    let index = match op {
        ZOrder::Front => {
            if last_pos == ring.len() - 1 && moved.len() == ring.len() - first_pos {
                return None; // already a frontmost block
            }
            remaining.len()
        }
        ZOrder::Back => {
            if first_pos == 0 && moved.len() == last_pos + 1 {
                return None; // already a backmost block
            }
            0
        }
        ZOrder::Forward => {
            // Step past the first non-moved sibling above the block.
            let above = ring[last_pos + 1..]
                .iter()
                .find(|id| !selection.contains(id))?;
            remaining.iter().position(|id| *id == above)? + 1
        }
        ZOrder::Backward => {
            // Step under the last non-moved sibling below the block.
            let below = ring[..first_pos]
                .iter()
                .rev()
                .find(|id| !selection.contains(id))?;
            remaining.iter().position(|id| *id == below)?
        }
    };
    Some((moved, parent, index))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::Mutation;
    use crate::editor::{Editor, Recording};
    use crate::history::Origin;
    use grida::node::factory::NodeFactory;
    use grida::node::scene_graph::{Parent, SceneGraph};
    use grida::node::schema::{Node, Scene};
    use std::collections::HashMap;

    /// `[A, B, C]` at the root, plus container `G` holding `[X]` —
    /// document order `[A, B, C, G]`.
    fn doc() -> WorkingCopy {
        let nf = NodeFactory::new();
        let mut graph = SceneGraph::new();
        let mut id_map = HashMap::new();
        for id in ["A", "B", "C"] {
            let iid = graph.append_child(Node::Rectangle(nf.create_rectangle_node()), Parent::Root);
            id_map.insert(iid, id.to_string());
        }
        let g = graph.append_child(Node::Container(nf.create_container_node()), Parent::Root);
        id_map.insert(g, "G".to_string());
        let x = graph.append_child(
            Node::Rectangle(nf.create_rectangle_node()),
            Parent::NodeId(g),
        );
        id_map.insert(x, "X".to_string());
        WorkingCopy::from_scene(
            Scene {
                name: "arrange-tests".to_string(),
                background_color: None,
                graph,
            },
            id_map,
        )
    }

    fn s(ids: &[&str]) -> Vec<Id> {
        ids.iter().map(|i| i.to_string()).collect()
    }

    /// Apply a resolved reorder and return the new root order.
    fn apply(doc: WorkingCopy, sel: &[Id], op: ZOrder) -> Vec<Id> {
        let (ids, parent, index) = reorder(&doc, sel, op).expect("resolves");
        let mut editor = Editor::new(doc);
        editor
            .dispatch(
                vec![Mutation::Move { ids, parent, index }],
                Origin::Local,
                Recording::Record { label: None },
            )
            .unwrap();
        editor.document().children(None)
    }

    #[test]
    fn front_back_forward_backward() {
        assert_eq!(
            apply(doc(), &s(&["A"]), ZOrder::Front),
            s(&["B", "C", "G", "A"])
        );
        assert_eq!(
            apply(doc(), &s(&["C"]), ZOrder::Back),
            s(&["C", "A", "B", "G"])
        );
        assert_eq!(
            apply(doc(), &s(&["A"]), ZOrder::Forward),
            s(&["B", "A", "C", "G"])
        );
        assert_eq!(
            apply(doc(), &s(&["C"]), ZOrder::Backward),
            s(&["A", "C", "B", "G"])
        );
    }

    #[test]
    fn a_block_moves_together_keeping_its_order() {
        assert_eq!(
            apply(doc(), &s(&["A", "B"]), ZOrder::Forward),
            s(&["C", "A", "B", "G"])
        );
        // Selection order does not matter — document order rules.
        assert_eq!(
            apply(doc(), &s(&["B", "A"]), ZOrder::Front),
            s(&["C", "G", "A", "B"])
        );
    }

    #[test]
    fn boundaries_and_mixed_parents_decline() {
        let d = doc();
        // Already frontmost / backmost.
        assert!(reorder(&d, &s(&["G"]), ZOrder::Front).is_none());
        assert!(reorder(&d, &s(&["G"]), ZOrder::Forward).is_none());
        assert!(reorder(&d, &s(&["A"]), ZOrder::Back).is_none());
        assert!(reorder(&d, &s(&["A"]), ZOrder::Backward).is_none());
        // The whole ring has nowhere to go.
        assert!(reorder(&d, &s(&["A", "B", "C", "G"]), ZOrder::Front).is_none());
        // Mixed parents: no single sibling order — declines.
        assert!(reorder(&d, &s(&["A", "X"]), ZOrder::Front).is_none());
        // Empty selection declines.
        assert!(reorder(&d, &[], ZOrder::Front).is_none());
    }
}
