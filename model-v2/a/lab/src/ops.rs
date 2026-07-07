//! The op layer — editor gestures as document writes (model-v2/editor.md).
//!
//! Doctrine under test:
//! - typed errors, never silent (`OpError`); a rejected op leaves the
//!   document untouched (M-6);
//! - NaN/Inf rejected at the write boundary (N-2, R-E3);
//! - write-counts are a design signal: rotate(boxed)=1, move=2,
//!   group-rotate(center-feel)=3, corner-resize=4;
//! - reads come from the resolved tier; writes re-target intent (a.md §6).

use crate::math::Affine;
use crate::model::*;
use crate::resolve::Resolved;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OpError {
    /// Setting size on a spanned axis: Span owns the extent (§2.1).
    AxisOwnedBySpan,
    /// Setting x/y on an in-flow child under flex (§6 writes).
    OwnedByLayout,
    /// Setting size on a derived-box kind (group/bool/lens).
    BoxDerived,
    /// NaN/Inf/write-boundary rejection (N-2).
    InvalidNumber,
    /// A raw size write below zero. Extents are non-negative bedrock; the
    /// gesture that legitimately crosses zero is `resize_drag`, which
    /// RE-TARGETS (|extent| + flip toggle) instead of storing a sign.
    NegativeExtent,
    /// Op targets a kind it does not apply to.
    WrongKind,
}

pub type OpResult = Result<usize, OpError>; // Ok(number of field writes)

fn guard_finite(v: f32) -> Result<(), OpError> {
    if v.is_finite() {
        Ok(())
    } else {
        Err(OpError::InvalidNumber)
    }
}

fn in_flow_under_flex(doc: &Document, id: NodeId) -> bool {
    match doc.parent_of(id) {
        Some(pid) => {
            let parent = doc.get(pid);
            matches!(
                &parent.payload,
                Payload::Frame { layout, .. } if layout.mode == LayoutMode::Flex
            ) && doc.get(id).header.flow == Flow::InFlow
        }
        None => false,
    }
}

/// Set resolved x to `value` by re-targeting the stored intent (a.md §6):
/// the binding kind is preserved; its offset is rewritten so the resolved
/// x becomes `value`. Delta form — `Δ = value − resolved.x` — works
/// uniformly for boxed kinds and derived kinds (whose bindings place the
/// origin, not the box).
pub fn set_x(doc: &mut Document, resolved: &Resolved, id: NodeId, value: f32) -> OpResult {
    guard_finite(value)?;
    if in_flow_under_flex(doc, id) {
        return Err(OpError::OwnedByLayout);
    }
    let delta = value - resolved.box_of(id).x;
    let node = doc.get_mut(id);
    match &mut node.header.x {
        AxisBinding::Pin { anchor, offset } => {
            *offset += match anchor {
                AnchorEdge::Start | AnchorEdge::Center => delta,
                AnchorEdge::End => -delta,
            };
            Ok(1)
        }
        AxisBinding::Span { .. } => Err(OpError::AxisOwnedBySpan),
    }
}

pub fn set_y(doc: &mut Document, resolved: &Resolved, id: NodeId, value: f32) -> OpResult {
    guard_finite(value)?;
    if in_flow_under_flex(doc, id) {
        return Err(OpError::OwnedByLayout);
    }
    let delta = value - resolved.box_of(id).y;
    let node = doc.get_mut(id);
    match &mut node.header.y {
        AxisBinding::Pin { anchor, offset } => {
            *offset += match anchor {
                AnchorEdge::Start | AnchorEdge::Center => delta,
                AnchorEdge::End => -delta,
            };
            Ok(1)
        }
        AxisBinding::Span { .. } => Err(OpError::AxisOwnedBySpan),
    }
}

/// OP-MOVE: drag by (dx,dy) → exactly two offset writes.
pub fn move_by(
    doc: &mut Document,
    resolved: &Resolved,
    id: NodeId,
    dx: f32,
    dy: f32,
) -> OpResult {
    let (x, y, _, _) = resolved.xywh(id);
    let a = set_x(doc, resolved, id, x + dx)?;
    let b = set_y(doc, resolved, id, y + dy)?;
    Ok(a + b)
}

pub fn set_width(doc: &mut Document, id: NodeId, value: f32) -> OpResult {
    guard_finite(value)?;
    if value < 0.0 {
        return Err(OpError::NegativeExtent);
    }
    let node = doc.get(id);
    if node.payload.box_is_derived() {
        return Err(OpError::BoxDerived);
    }
    if matches!(node.header.x, AxisBinding::Span { .. }) {
        return Err(OpError::AxisOwnedBySpan);
    }
    doc.get_mut(id).header.width = SizeIntent::Fixed(value);
    Ok(1)
}

pub fn set_height(doc: &mut Document, id: NodeId, value: f32) -> OpResult {
    guard_finite(value)?;
    if value < 0.0 {
        return Err(OpError::NegativeExtent);
    }
    let node = doc.get(id);
    if node.payload.box_is_derived() {
        return Err(OpError::BoxDerived);
    }
    if matches!(node.header.y, AxisBinding::Span { .. }) {
        return Err(OpError::AxisOwnedBySpan);
    }
    doc.get_mut(id).header.height = SizeIntent::Fixed(value);
    Ok(1)
}

/// OP-ROT-1: rotating a boxed/measured node — one field, no compensation
/// (center pivot keeps the box center put). −0.0 canonicalizes to +0.0 at
/// the boundary (R-E3: the document never stores a negative zero).
pub fn set_rotation(doc: &mut Document, id: NodeId, deg: f32) -> OpResult {
    guard_finite(deg)?;
    if doc.get(id).payload.box_is_derived() {
        return Err(OpError::WrongKind); // use rotate_derived_center_feel
    }
    doc.get_mut(id).header.rotation = if deg == 0.0 { 0.0 } else { deg };
    Ok(1)
}

/// OP-ROT-3: center-feel rotation of a derived-box node (group/lens).
/// Pivot is the node's own origin (§5), so the gesture compensates x/y to
/// keep the visual center fixed — the Figma trick over three legible
/// scalars instead of a matrix. Exactly 3 writes.
///
/// Requires Start pins on both axes (the gesture's own precondition; other
/// anchors would re-target the same way `set_x` does).
pub fn rotate_derived_center_feel(
    doc: &mut Document,
    resolved: &Resolved,
    id: NodeId,
    new_deg: f32,
) -> OpResult {
    guard_finite(new_deg)?;
    if !doc.get(id).payload.box_is_derived() {
        return Err(OpError::WrongKind);
    }
    let b = resolved.box_of(id); // union box (origin + union offset)
    let local = resolved.local_of(id); // T(origin)·R(θ) → origin = (e, f)
    let origin = (local.e, local.f);
    let old = doc.get(id).header.rotation;
    // union center in origin space
    let d = (b.x - origin.0 + b.w / 2.0, b.y - origin.1 + b.h / 2.0);
    let c_old = Affine::rotate_deg(old).apply(d);
    let center = (origin.0 + c_old.0, origin.1 + c_old.1);
    let c_new = Affine::rotate_deg(new_deg).apply(d);
    let p2 = (center.0 - c_new.0, center.1 - c_new.1);

    let node = doc.get_mut(id);
    let start_pinned = matches!(
        node.header.x,
        AxisBinding::Pin {
            anchor: AnchorEdge::Start,
            ..
        }
    ) && matches!(
        node.header.y,
        AxisBinding::Pin {
            anchor: AnchorEdge::Start,
            ..
        }
    );
    if !start_pinned {
        return Err(OpError::WrongKind);
    }
    node.header.rotation = new_deg;
    node.header.x = AxisBinding::start(p2.0);
    node.header.y = AxisBinding::start(p2.1);
    Ok(3)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Axis {
    X,
    Y,
}

/// OP-SIZE-drag: gesture state for an edge-handle resize, captured once at
/// mousedown. Extents are non-negative bedrock (N-2), so dragging PAST the
/// fixed edge cannot store a sign — instead the op re-targets: extent
/// becomes |target − anchor| and the axis flip toggles relative to the
/// gesture baseline (Figma parity: fill/flip survive as intent; the typed
/// `set_width(−50)` stays a wall — `NegativeExtent`).
#[derive(Debug, Clone, Copy)]
pub struct ResizeDrag {
    pub axis: Axis,
    /// Parent-space coordinate of the FIXED edge, captured at gesture start.
    pub anchor: f32,
    /// Flip state on this axis at gesture start.
    pub base_flip: bool,
    /// True when the box initially extends to the positive side of anchor.
    pub base_side_positive: bool,
}

impl ResizeDrag {
    /// `fixed_edge` names the edge that stays put (Start = min edge fixed,
    /// the user drags the max handle; End = the reverse). Center handles
    /// are a different gesture (symmetric resize) — not this op.
    pub fn begin(
        doc: &Document,
        resolved: &Resolved,
        id: NodeId,
        axis: Axis,
        fixed_edge: AnchorEdge,
    ) -> Result<ResizeDrag, OpError> {
        if doc.get(id).payload.box_is_derived() {
            return Err(OpError::BoxDerived);
        }
        let b = resolved.box_of(id);
        let (min, extent, flip) = match axis {
            Axis::X => (b.x, b.w, doc.get(id).header.flip_x),
            Axis::Y => (b.y, b.h, doc.get(id).header.flip_y),
        };
        let (anchor, side_positive) = match fixed_edge {
            AnchorEdge::Start => (min, true),
            AnchorEdge::End => (min + extent, false),
            AnchorEdge::Center => return Err(OpError::WrongKind),
        };
        Ok(ResizeDrag {
            axis,
            anchor,
            base_flip: flip,
            base_side_positive: side_positive,
        })
    }
}

/// Apply one mousemove of an edge-handle drag. `resolved` must be FRESH
/// (resolve of the current document) — position re-targets in delta form.
///
/// Writes per call: extent (1) + position (1, free context only — under
/// flex, layout owns position and the write set shrinks to extent+flip)
/// + flip (1, only when the crossing state changed). Crossing back across
/// the anchor toggles the flip off again: a drag out and back is the
/// identity on the document.
pub fn resize_drag(
    doc: &mut Document,
    resolved: &Resolved,
    id: NodeId,
    drag: &ResizeDrag,
    target: f32,
) -> OpResult {
    guard_finite(target)?;
    if doc.get(id).payload.box_is_derived() {
        return Err(OpError::BoxDerived);
    }
    let crossed = if drag.base_side_positive {
        target < drag.anchor
    } else {
        target > drag.anchor
    };
    let new_extent = (target - drag.anchor).abs();
    let new_min = target.min(drag.anchor);
    let mut writes = 0usize;

    writes += match drag.axis {
        Axis::X => set_width(doc, id, new_extent)?,
        Axis::Y => set_height(doc, id, new_extent)?,
    };
    if !in_flow_under_flex(doc, id) {
        writes += match drag.axis {
            Axis::X => set_x(doc, resolved, id, new_min)?,
            Axis::Y => set_y(doc, resolved, id, new_min)?,
        };
    }
    let want_flip = drag.base_flip ^ crossed;
    let node = doc.get_mut(id);
    let slot = match drag.axis {
        Axis::X => &mut node.header.flip_x,
        Axis::Y => &mut node.header.flip_y,
    };
    if *slot != want_flip {
        *slot = want_flip;
        writes += 1;
    }
    Ok(writes)
}

/// OP-SIZE-corner: top-left corner drag on a free node — 4 writes
/// (x, y, w, h), the documented maximum for a resize gesture.
pub fn resize_top_left(
    doc: &mut Document,
    resolved: &Resolved,
    id: NodeId,
    new_x: f32,
    new_y: f32,
    new_w: f32,
    new_h: f32,
) -> OpResult {
    let a = set_x(doc, resolved, id, new_x)?;
    let b = set_y(doc, resolved, id, new_y)?;
    let c = set_width(doc, id, new_w)?;
    let d = set_height(doc, id, new_h)?;
    Ok(a + b + c + d)
}

/// OP-TREE-delete: remove a whole subtree. The scene root is not
/// deletable (the InitialContainer always exists). Returns the number of
/// nodes removed (a structural write count, one per dissolved node).
pub fn delete(doc: &mut Document, id: NodeId) -> OpResult {
    if id == doc.root || doc.get_opt(id).is_none() {
        return Err(OpError::WrongKind);
    }
    Ok(doc.remove_subtree(id))
}

/// OP-TREE-ungroup: one of the three sanctioned state→intent bake moments.
/// Children keep their world transforms (D-4); the group node dissolves.
pub fn ungroup(doc: &mut Document, resolved: &Resolved, group_id: NodeId) -> OpResult {
    if !matches!(doc.get(group_id).payload, Payload::Group) {
        return Err(OpError::WrongKind);
    }
    let parent_id = doc.parent_of(group_id).ok_or(OpError::WrongKind)?;
    let group_local = resolved.local_of(group_id);
    let group_theta = doc.get(group_id).header.rotation;
    let (gfx, gfy) = (doc.get(group_id).header.flip_x, doc.get(group_id).header.flip_y);
    // Mirror conjugation: F·R(θ) = R(σθ)·F with σ = −1 under a single-axis
    // mirror (det −1) and σ = +1 under none/both (F_xy = R(180), det +1).
    // So R(θg)·F_g·R(θc)·F_c = R(θg + σ·θc)·F_{g⊕c} — the bake stays three
    // legible scalars plus flip XORs; no matrix leaks into the document.
    let sigma = if gfx ^ gfy { -1.0 } else { 1.0 };
    let children = doc.get(group_id).children.clone();

    let mut writes = 0usize;
    for &cid in &children {
        let child_theta = doc.get(cid).header.rotation;
        let new_theta = group_theta + sigma * child_theta;
        if doc.get(cid).payload.box_is_derived() {
            // Derived child (nested group/lens): its pins place the ORIGIN
            // and its pivot is the origin, so the bake maps the origin
            // through the dissolving group (census fix: the boxed-center
            // formula was wrong for derived children).
            let o = resolved.local_of(cid);
            let o_parent = group_local.apply((o.e, o.f));
            let node = doc.get_mut(cid);
            node.header.rotation = new_theta;
            node.header.x = AxisBinding::start(o_parent.0);
            node.header.y = AxisBinding::start(o_parent.1);
        } else {
            // Boxed child: rigid motion — the box center maps through the
            // group local transform; center pivot keeps the rest exact.
            let cb = resolved.box_of(cid);
            let c_local = (cb.x + cb.w / 2.0, cb.y + cb.h / 2.0);
            let c_parent = group_local.apply(c_local);
            let node = doc.get_mut(cid);
            node.header.rotation = new_theta;
            node.header.x = AxisBinding::start(c_parent.0 - cb.w / 2.0);
            node.header.y = AxisBinding::start(c_parent.1 - cb.h / 2.0);
        }
        writes += 3;
        if gfx {
            let n = doc.get_mut(cid);
            n.header.flip_x = !n.header.flip_x;
            writes += 1;
        }
        if gfy {
            let n = doc.get_mut(cid);
            n.header.flip_y = !n.header.flip_y;
            writes += 1;
        }
    }
    // Tree surgery: splice children into the parent at the group's slot
    // (re-homing their parent links), then tombstone the group.
    let idx = doc
        .get(parent_id)
        .children
        .iter()
        .position(|c| *c == group_id)
        .unwrap();
    doc.splice_children(parent_id, idx, 1, children);
    doc.remove_slot(group_id);
    Ok(writes)
}

