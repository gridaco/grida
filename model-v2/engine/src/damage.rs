//! ENG-2.2 · damage as data. [`diff_frame`] compares the actual resolved and
//! drawlist products with exact equality, so geometry, paint-only values,
//! opacity scopes, text/path artifacts, and painter ordering all flow into one
//! covering result. [`diff`] remains the geometry-only compatibility primitive.
//! Damage is asserted and shown, not yet consumed for partial repaint (OS-2a).

use anchor_lab::math::RectF;
use anchor_lab::model::NodeId;
use anchor_lab::resolve::Resolved;
use std::collections::{BTreeMap, BTreeSet};

use crate::drawlist::{DrawList, Item, ItemKind};
use crate::frame::FrameProduct;

/// What changed between two frame products: the touched nodes and the
/// world-space rect that bounds their before+after ink (covers
/// appear/disappear).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Damage {
    pub changed: Vec<NodeId>,
    pub union_world: Option<RectF>,
}

impl Damage {
    pub fn is_empty(&self) -> bool {
        self.changed.is_empty()
    }
}

/// Diff two resolved tiers: the nodes whose resolved geometry changed and the
/// world rect that bounds their before+after ink. Comparison is exact f32
/// equality per column (justified by ENG-0.3 determinism — "unchanged" is
/// identity, not an epsilon guess; -0.0 vs 0.0 is not a meaningful visual
/// change, so `==` is the right relation here). O(n) in slot count; day 1 it
/// is asserted and shown (HUD), not yet consumed for partial repaint (OS-2a).
pub fn diff(prev: &Resolved, next: &Resolved) -> Damage {
    let n = prev.slot_count().max(next.slot_count());
    let mut changed = BTreeSet::new();
    for id in 0..n as NodeId {
        if slot_changed(prev, next, id) {
            changed.insert(id);
        }
    }
    finish_damage(prev, next, changed)
}

/// Diff complete frame products. Resolved columns cover geometry, text, and
/// paths; per-node drawlist groups cover paints, opacity scopes, clips,
/// strokes, and painter order. The product-owned paint environment additionally
/// covers resource readiness and replacing bytes behind one logical id.
pub fn diff_frame(prev: &FrameProduct, next: &FrameProduct) -> Damage {
    let mut changed = frame_changed_nodes(
        prev.resolved(),
        prev.drawlist(),
        next.resolved(),
        next.drawlist(),
    );
    if prev.environment() != next.environment() {
        changed.extend(prev.drawlist().items.iter().map(|item| item.node));
        changed.extend(next.drawlist().items.iter().map(|item| item.node));
    }
    finish_damage(prev.resolved(), next.resolved(), changed)
}

fn frame_changed_nodes(
    prev_resolved: &Resolved,
    prev_list: &DrawList,
    next_resolved: &Resolved,
    next_list: &DrawList,
) -> BTreeSet<NodeId> {
    let n = prev_resolved.slot_count().max(next_resolved.slot_count());
    let mut changed = BTreeSet::new();
    for id in 0..n as NodeId {
        if slot_changed(prev_resolved, next_resolved, id) {
            changed.insert(id);
        }
    }

    let prev_groups = group_items(prev_list);
    let next_groups = group_items(next_list);
    let mut appearance_changed = BTreeSet::new();
    for id in prev_groups.keys().chain(next_groups.keys()) {
        if prev_groups.get(id) != next_groups.get(id) {
            appearance_changed.insert(*id);
        }
    }
    changed.extend(appearance_changed.iter().copied());

    // Remove nodes whose own item group already changed, then compare the
    // remaining `(node, ordinal-within-node)` permutation. Inserting an
    // opacity scope for a parent therefore marks the parent without falsely
    // marking every shifted descendant, while a genuine painter-order change
    // still marks every item whose relative position moved.
    let prev_positions = item_positions(prev_list, &appearance_changed);
    let next_positions = item_positions(next_list, &appearance_changed);
    for token in prev_positions.keys().chain(next_positions.keys()) {
        if prev_positions.get(token) != next_positions.get(token) {
            changed.insert(token.0);
        }
    }

    // The exact font registry is list-owned rather than repeated on each text
    // item. A registry change therefore damages the text nodes that consume
    // it even when their backend-independent item data is identical.
    if !prev_list.same_text_fonts(next_list) {
        for item in prev_list.items.iter().chain(&next_list.items) {
            if matches!(
                &item.kind,
                ItemKind::TextFill { .. } | ItemKind::TextStroke { .. }
            ) {
                changed.insert(item.node);
            }
        }
    }

    changed
}

fn group_items(list: &DrawList) -> BTreeMap<NodeId, Vec<&Item>> {
    let mut groups = BTreeMap::<NodeId, Vec<&Item>>::new();
    for item in &list.items {
        groups.entry(item.node).or_default().push(item);
    }
    groups
}

fn item_positions(
    list: &DrawList,
    excluded: &BTreeSet<NodeId>,
) -> BTreeMap<(NodeId, usize), usize> {
    let mut ordinals = BTreeMap::<NodeId, usize>::new();
    let mut positions = BTreeMap::new();
    let mut position = 0;
    for item in &list.items {
        if excluded.contains(&item.node) {
            continue;
        }
        let ordinal = ordinals.entry(item.node).or_default();
        positions.insert((item.node, *ordinal), position);
        *ordinal += 1;
        position += 1;
    }
    positions
}

fn finish_damage(prev: &Resolved, next: &Resolved, changed: BTreeSet<NodeId>) -> Damage {
    let mut union_world = None;
    for &id in &changed {
        // Cover the node's ink in BOTH states (appear/disappear/move).
        if let Some(r) = prev.aabb_opt(id) {
            union_world = Some(union_rect(union_world, r));
        }
        if let Some(r) = next.aabb_opt(id) {
            union_world = Some(union_rect(union_world, r));
        }
    }
    Damage {
        changed: changed.into_iter().collect(),
        union_world,
    }
}

fn slot_changed(prev: &Resolved, next: &Resolved, id: NodeId) -> bool {
    prev.box_opt(id) != next.box_opt(id)
        || prev.local_opt(id) != next.local_opt(id)
        || prev.world_opt(id) != next.world_opt(id)
        || prev.aabb_opt(id) != next.aabb_opt(id)
        // Text pixels can change without moving the node or changing its ink
        // envelope: a different exact font, glyph id, cluster topology, or
        // positioned run is still material damage. Compare the complete
        // backend-independent artifact rather than guessing from geometry.
        || prev.text_layout_opt(id) != next.text_layout_opt(id)
        // A path can change commands or fill rule without changing its box or
        // even its tight bounds. Its shared box-mapped artifact is therefore
        // part of resolved visual identity, just like shaped text.
        || path_changed(prev, next, id)
}

fn path_changed(prev: &Resolved, next: &Resolved, id: NodeId) -> bool {
    match (prev.resolved_path_opt(id), next.resolved_path_opt(id)) {
        (None, None) => false,
        (Some(before), Some(after)) => !before.same_visual_geometry(after),
        _ => true,
    }
}

fn union_rect(acc: Option<RectF>, r: RectF) -> RectF {
    match acc {
        None => r,
        Some(a) => {
            let x0 = a.x.min(r.x);
            let y0 = a.y.min(r.y);
            let x1 = (a.x + a.w).max(r.x + r.w);
            let y1 = (a.y + a.h).max(r.y + r.h);
            RectF {
                x: x0,
                y: y0,
                w: x1 - x0,
                h: y1 - y0,
            }
        }
    }
}
