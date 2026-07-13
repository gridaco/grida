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
use crate::rounded_box;

/// Hairline kinds (a zero-height line, a zero-extent box mid-gesture) get
/// a symmetric hit slop in LOCAL px so they stay grabbable.
const HAIRLINE_SLOP: f32 = 3.0;

/// Hit-test one immutable resolved frame. This is the canonical narrowphase;
/// it has no authored document or effective-value input that can be paired
/// with the wrong frame.
pub fn pick(resolved: &Resolved, x: f32, y: f32) -> Option<NodeId> {
    hit_subtree(resolved, resolved.query_root()?, (x, y))
}

fn hit_subtree(r: &Resolved, id: NodeId, p: (f32, f32)) -> Option<NodeId> {
    r.world_opt(id)?; // hidden subtree
    let query = r.query_node_opt(id)?;
    // Children first, topmost-first (paint order = document order).
    // A container clip scopes descendants only: outside it, skip the child
    // traversal but still test the container's own fill/strokes below. The
    // inverse world transform makes this exact for rotated/flipped containers
    // and naturally enforces every clip encountered along the ancestor walk.
    let children_visible = query.content_clip.is_none_or(|clip| {
        r.world_of(id).invert().is_some_and(|inverse| {
            let (lx, ly) = inverse.apply(p);
            let b = r.box_of(id);
            rounded_box::contains(
                b.w,
                b.h,
                clip.corner_radius,
                clip.corner_smoothing,
                (lx, ly),
            )
        })
    });
    if children_visible {
        for &child in query.children.iter().rev() {
            if let Some(hit) = hit_subtree(r, child, p) {
                // Transparent-select promotes through every derived ancestor
                // while recursion unwinds, leaving the outermost one selected.
                return Some(if query.box_is_derived { id } else { hit });
            }
        }
    }
    // Own ink: derived kinds have none (their bounds come from children).
    if query.box_is_derived {
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
