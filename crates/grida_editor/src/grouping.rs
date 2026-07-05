//! Grouping — [grouping.md](../../../docs/wg/canvas/grouping.md): wrap a
//! selection into a new adopting parent (group or container) once per
//! [selection partition](../../../docs/wg/canvas/ux-surface/selection-partition.md)
//! (`GRP-1` / `PART-3`), and ungroup as the inverse (`GRP-4`).
//!
//! Like [`crate::align`], a pure resolver over the working copy plus a
//! world-bounds oracle → a `Vec<Mutation>` the caller applies as one
//! history entry (`GRP-1..6` batches, `PART-4` per-partition). New
//! wrapper ids come from an injected minter, so the resolver never needs
//! to `&mut` the document.
//!
//! World position is preserved by placing the wrapper at its partition's
//! world union origin and re-anchoring each member by the same
//! translation (`GRP-2`). v1 assumes the shared parent and the wrapper
//! are pure translations — the `frame_origin` doctrine
//! [`crate::interpret`] already relies on; a rotated/scaled parent is a
//! named limitation, not a silent miscompute.

use crate::document::{Fragment, Id, Mutation, PropPatch, WorkingCopy, set_position};
use grida::node::factory::NodeFactory;
use grida::node::schema::Node;
use math2::rect::Rectangle;

/// The wrapper kind a `group` produces (keybindings Arrange rows):
/// `Mod+G` groups, `Mod+Alt+G` groups with a container.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WrapKind {
    Group,
    Container,
}

/// Resolve `group` / `group with container` to a mutation batch — one
/// wrapper per [selection partition](../../../docs/wg/canvas/ux-surface/selection-partition.md),
/// each adopting its partition's members with world position and sibling
/// order preserved (`GRP-1..3`). `None` when nothing wraps (empty or
/// unbounded selection).
///
/// `bounds` answers a node's world-space AABB (the same oracle
/// [`crate::align`] takes). `mint` yields fresh stable ids for the
/// wrappers.
pub fn group(
    doc: &WorkingCopy,
    selection: &[Id],
    bounds: impl Fn(&Id) -> Option<Rectangle>,
    kind: WrapKind,
    mut mint: impl FnMut() -> Id,
) -> Option<Vec<Mutation>> {
    let factory = NodeFactory::new();
    let mut muts = Vec::new();

    for (parent, members) in doc.partition_selection(selection) {
        if members.is_empty() {
            continue;
        }
        // The partition's world union — where the wrapper sits.
        let rects: Vec<Rectangle> = members.iter().filter_map(&bounds).collect();
        if rects.is_empty() {
            continue;
        }
        let union = math2::rect::union(&rects);

        // Wrapper local position = union origin projected into the parent
        // frame. v1: pure-translation parent — its world origin is the
        // translation of its world transform; root is the identity.
        let parent_origin = match &parent {
            Some(pid) => {
                let t = doc.node_world_transform(pid).matrix;
                (t[0][2], t[1][2])
            }
            None => (0.0, 0.0),
        };
        let wrapper_pos = (union.x - parent_origin.0, union.y - parent_origin.1);

        let mut node = match kind {
            WrapKind::Group => Node::Group(factory.create_group_node()),
            WrapKind::Container => Node::Container(factory.create_container_node()),
        };
        set_position(&mut node, wrapper_pos.0, wrapper_pos.1);
        let wrapper_id = mint();

        // Insert the wrapper at the partition's frontmost slot — the
        // lowest sibling index among its members (`GRP-3`).
        let siblings = doc.children(parent.as_ref());
        let index = members
            .iter()
            .filter_map(|m| siblings.iter().position(|s| s == m))
            .min()
            .unwrap_or(siblings.len());
        muts.push(Mutation::Insert {
            parent: parent.clone(),
            index,
            fragment: Box::new(Fragment {
                id: wrapper_id.clone(),
                name: None,
                node,
                children: Vec::new(),
            }),
        });

        // Adopt the members in sibling order, then re-anchor each so its
        // world position is unchanged: new local = old local − wrapper
        // local (both in the shared parent frame; the wrapper is a pure
        // translation) (`GRP-2`).
        muts.push(Mutation::Move {
            ids: members.clone(),
            parent: Some(wrapper_id.clone()),
            index: 0,
        });
        for m in &members {
            if let Some((px, py)) = doc.node_position(m) {
                muts.push(Mutation::Patch {
                    id: m.clone(),
                    set: PropPatch {
                        position: Some((px - wrapper_pos.0, py - wrapper_pos.1)),
                        ..Default::default()
                    },
                });
            }
        }
    }

    (!muts.is_empty()).then_some(muts)
}

/// Resolve `ungroup` to a mutation batch: dissolve one group (or
/// boolean) node, promoting its children to the group's parent at the
/// group's slot with world position preserved (`GRP-4`), then remove the
/// emptied wrapper. `None` if `id` is not a dissolvable wrapper.
///
/// The inverse of a single-partition [`group`]: the children's new local
/// position folds the wrapper's translation back in (`new = old +
/// wrapper local`).
pub fn ungroup(doc: &WorkingCopy, id: &Id) -> Option<Vec<Mutation>> {
    if !doc.node_is_group(id) {
        return None;
    }
    let parent = doc.node_parent(id)?;
    let children = doc.children(Some(id));
    // The wrapper's own local translation in the parent frame (v1:
    // pure-translation wrapper).
    let (gx, gy) = doc.node_position(id).unwrap_or((0.0, 0.0));
    // The wrapper's slot in its parent — the children fill it.
    let siblings = doc.children(parent.as_ref());
    let index = siblings
        .iter()
        .position(|s| s == id)
        .unwrap_or(siblings.len());

    let mut muts = Vec::new();
    // Promote children to the wrapper's parent at its slot, before the
    // wrapper is removed (a `Remove` takes the subtree with it).
    muts.push(Mutation::Move {
        ids: children.clone(),
        parent: parent.clone(),
        index,
    });
    for c in &children {
        if let Some((px, py)) = doc.node_position(c) {
            muts.push(Mutation::Patch {
                id: c.clone(),
                set: PropPatch {
                    position: Some((px + gx, py + gy)),
                    ..Default::default()
                },
            });
        }
    }
    muts.push(Mutation::Remove { id: id.clone() });
    Some(muts)
}
