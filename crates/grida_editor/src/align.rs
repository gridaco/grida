//! Align & distribute — [align.md](../../../docs/wg/canvas/align.md)'s
//! one rule plus arithmetic, resolved purely onto `Patch` position
//! mutations (the same shape [`crate::arrange`] uses for z-order).
//!
//! The rule is *what frame you align to*, and it flips on selection
//! cardinality (`ALIGN-1`): the selection's world-space union bounds
//! for two or more, the single node's parent container for one (a
//! top-level single node declines, `ALIGN-2`). Alignment measures
//! world-space axis-aligned bounds, so a rotated member aligns by its
//! world AABB (`ALIGN-3`); deltas are computed in world space and
//! projected into each member's own parent frame, so mixed-parent and
//! transformed-ancestor selections align exactly (`ALIGN-4`).
//!
//! A member whose position is owned by its parent's auto-layout flow
//! is excluded — the container's alignment property owns it, not a
//! geometric move (`ALIGN-6`, [`WorkingCopy::is_layout_owned`]).
//!
//! World bounds are sourced by the caller (the shell's engine geometry
//! cache; tests compose them from the document graph) and passed in as
//! a closure, so the resolver stays a pure function of the document
//! plus that oracle — unit-testable without a renderer.

use crate::document::{Id, Mutation, PropPatch, WorkingCopy};
use math2::rect::Rectangle;

/// The six align verbs (keybindings.md "Align & distribute"): edges and
/// per-axis centers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Align {
    Left,
    Right,
    Top,
    Bottom,
    HCenter,
    VCenter,
}

/// The two distribute axes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Distribute {
    Horizontal,
    Vertical,
}

/// Resolve an align verb to a batch of position `Patch`es — one per
/// moved member, each expressed in that member's own parent
/// coordinates (`ALIGN-4`). The whole batch is applied as a single
/// history entry by the caller (`ALIGN-7`). `None` = the command
/// declines (all-in-flow / nothing movable, a top-level single node,
/// or an already-aligned selection with no net move).
///
/// `bounds` answers a member's world-space AABB; members and the
/// single-node case's parent are queried through it.
pub fn align(
    doc: &WorkingCopy,
    selection: &[Id],
    bounds: impl Fn(&Id) -> Option<Rectangle>,
    op: Align,
) -> Option<Vec<Mutation>> {
    // The movable members: free (not layout-owned, `ALIGN-6`), with a
    // settable position and a known world AABB.
    let free = movable(doc, selection, &bounds);
    if free.is_empty() {
        return None;
    }

    // The reference frame flips on *selection* cardinality (`ALIGN-1`).
    // In-flow members still shape the many-node union — they simply do
    // not move.
    let frame = if selection.len() >= 2 {
        let rects: Vec<Rectangle> = selection.iter().filter_map(&bounds).collect();
        if rects.is_empty() {
            return None;
        }
        math2::rect::union(&rects)
    } else {
        // Single selection: the parent container's frame. A top-level
        // single node has no frame and declines (`ALIGN-2`).
        let only = selection.first()?;
        let parent = doc.node_parent(only).flatten()?;
        bounds(&parent)?
    };

    let muts: Vec<Mutation> = free
        .iter()
        .filter_map(|(id, b)| translate_mut(doc, id, align_delta(op, frame, *b)))
        .collect();
    (!muts.is_empty()).then_some(muts)
}

/// Resolve a distribute verb to a batch of position `Patch`es. Requires
/// three or more free members (`ALIGN-5`); the outermost two hold, and
/// interior members move so every adjacent edge-to-edge gap equals
/// `(span − Σ sizes) / (N − 1)`. `None` = fewer than three movable
/// members or an already-even distribution.
pub fn distribute(
    doc: &WorkingCopy,
    selection: &[Id],
    bounds: impl Fn(&Id) -> Option<Rectangle>,
    op: Distribute,
) -> Option<Vec<Mutation>> {
    let mut free = movable(doc, selection, &bounds);
    if free.len() < 3 {
        return None;
    }

    let horizontal = matches!(op, Distribute::Horizontal);
    let lo = |r: &Rectangle| if horizontal { r.x } else { r.y };
    let size = |r: &Rectangle| if horizontal { r.width } else { r.height };

    // Order by min edge along the axis; the outermost two anchor the
    // span.
    free.sort_by(|a, b| lo(&a.1).total_cmp(&lo(&b.1)));
    let n = free.len();
    let first = free[0].1;
    let last = free[n - 1].1;
    let span = (lo(&last) + size(&last)) - lo(&first);
    let sum_sizes: f32 = free.iter().map(|(_, r)| size(r)).sum();
    let gap = (span - sum_sizes) / (n as f32 - 1.0);

    let mut muts = Vec::new();
    let mut cursor = lo(&first) + size(&first) + gap;
    for (id, b) in &free[1..n - 1] {
        let delta = cursor - lo(b);
        let world_delta = if horizontal {
            (delta, 0.0)
        } else {
            (0.0, delta)
        };
        if let Some(m) = translate_mut(doc, id, world_delta) {
            muts.push(m);
        }
        cursor += size(b) + gap;
    }
    (!muts.is_empty()).then_some(muts)
}

/// The movable members of a selection: not layout-owned (`ALIGN-6`),
/// with a settable position and a known world AABB.
fn movable(
    doc: &WorkingCopy,
    selection: &[Id],
    bounds: &impl Fn(&Id) -> Option<Rectangle>,
) -> Vec<(Id, Rectangle)> {
    selection
        .iter()
        .filter(|id| !doc.is_layout_owned(id) && doc.node_position(id).is_some())
        .filter_map(|id| Some((id.clone(), bounds(id)?)))
        .collect()
}

/// The world-space translation that lands member bounds `b` on `frame`
/// for one verb. One axis only; the other stays zero.
fn align_delta(op: Align, frame: Rectangle, b: Rectangle) -> (f32, f32) {
    match op {
        Align::Left => (frame.x - b.x, 0.0),
        Align::Right => ((frame.x + frame.width) - (b.x + b.width), 0.0),
        Align::HCenter => (frame.center()[0] - b.center()[0], 0.0),
        Align::Top => (0.0, frame.y - b.y),
        Align::Bottom => (0.0, (frame.y + frame.height) - (b.y + b.height)),
        Align::VCenter => (0.0, frame.center()[1] - b.center()[1]),
    }
}

/// Build a position `Patch` that shifts a member's world AABB by
/// `world_delta`, projecting the delta into the member's own parent
/// frame (`ALIGN-4`) and folding it into the node's current position.
/// `None` for a negligible move (already aligned) or a positionless
/// node.
fn translate_mut(doc: &WorkingCopy, id: &Id, world_delta: (f32, f32)) -> Option<Mutation> {
    const EPS: f32 = 1e-4;
    if world_delta.0.abs() < EPS && world_delta.1.abs() < EPS {
        return None;
    }
    let (px, py) = doc.node_position(id)?;
    let (dx, dy) = parent_local_delta(doc, id, world_delta);
    Some(Mutation::Patch {
        id: id.clone(),
        set: Box::new(PropPatch {
            position: Some((px + dx, py + dy)),
            ..Default::default()
        }),
    })
}

/// Project a world-space translation into a member's parent-local
/// frame — the linear part of the parent's world-transform inverse
/// (translation excluded, since a delta is a direction). Root-level
/// members pass the delta through unchanged.
fn parent_local_delta(doc: &WorkingCopy, id: &Id, world: (f32, f32)) -> (f32, f32) {
    use math2::transform::AffineTransform;
    let parent_world = match doc.node_parent(id).flatten() {
        Some(pid) => doc.node_world_transform(&pid),
        None => AffineTransform::identity(),
    };
    let inv = parent_world
        .inverse()
        .unwrap_or_else(AffineTransform::identity);
    let m = inv.matrix;
    (
        m[0][0] * world.0 + m[0][1] * world.1,
        m[1][0] * world.0 + m[1][1] * world.1,
    )
}
