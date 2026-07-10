//! Hit-testing over the resolved tier — a MODEL concern, not host chrome:
//! oriented boxes (inverse world transform, not AABB), lens children hit
//! post-ops, and derived kinds are transparent-select (clicking group
//! content selects the OUTERMOST group — GROUP.md / Figma parity).
//!
//! `pick` returns the topmost hit in paint order (later siblings paint on
//! top). Hitting only the scene root means "background" — hosts treat it
//! as deselect.

use crate::model::*;
use crate::resolve::Resolved;

/// Hairline kinds (a zero-height line, a zero-extent box mid-gesture) get
/// a symmetric hit slop in LOCAL px so they stay grabbable.
const HAIRLINE_SLOP: f32 = 3.0;

pub fn pick(doc: &Document, resolved: &Resolved, x: f32, y: f32) -> Option<NodeId> {
    hit_subtree(doc, resolved, doc.root, (x, y)).map(|hit| promote(doc, hit))
}

fn hit_subtree(doc: &Document, r: &Resolved, id: NodeId, p: (f32, f32)) -> Option<NodeId> {
    r.world_opt(id)?; // hidden subtree
    let node = doc.get(id);
    // Children first, topmost-first (paint order = document order).
    // A container clip scopes descendants only: outside it, skip the child
    // traversal but still test the container's own fill/strokes below. The
    // inverse world transform makes this exact for rotated/flipped containers
    // and naturally enforces every clip encountered along the ancestor walk.
    let children_visible = if matches!(
        &node.payload,
        Payload::Frame {
            clips_content: true,
            ..
        }
    ) {
        r.world_of(id).invert().is_some_and(|inverse| {
            let (lx, ly) = inverse.apply(p);
            let b = r.box_of(id);
            lx >= 0.0 && lx <= b.w && ly >= 0.0 && ly <= b.h
        })
    } else {
        true
    };
    if children_visible {
        for &c in node.children.iter().rev() {
            if let Some(hit) = hit_subtree(doc, r, c, p) {
                return Some(hit);
            }
        }
    }
    // Own ink: derived kinds have none (their bounds come from children).
    if node.payload.box_is_derived() {
        return None;
    }
    let inv = r.world_of(id).invert()?;
    let (lx, ly) = inv.apply(p);
    let b = r.box_of(id);
    let sx = if b.w < 2.0 * HAIRLINE_SLOP {
        HAIRLINE_SLOP
    } else {
        0.0
    };
    let sy = if b.h < 2.0 * HAIRLINE_SLOP {
        HAIRLINE_SLOP
    } else {
        0.0
    };
    if lx >= -sx && lx <= b.w + sx && ly >= -sy && ly <= b.h + sy {
        Some(id)
    } else {
        None
    }
}

/// Transparent-select: the OUTERMOST derived ancestor claims the hit.
fn promote(doc: &Document, hit: NodeId) -> NodeId {
    let mut chosen = hit;
    let mut cur = hit;
    while let Some(parent) = doc.parent_of(cur) {
        if doc.get(parent).payload.box_is_derived() {
            chosen = parent;
        }
        cur = parent;
    }
    chosen
}
