//! ENG-3 · the spatial read tier — one query API family over the resolved
//! `world_aabb` column. `hit_point` / `nodes_in_rect` / `cull` (step 8)
//! are the ONE door every consumer (HUD, marquee, snapping, culling,
//! pick) goes through, so the index that later sits behind them
//! (broadphase BVH — OS-3a) slots in without changing a call site. Day 1
//! the bodies are linear walks; the model laws (paint-order topmost,
//! transparent-select promotion, lens post-ops, hairline slop) stay in
//! the lab narrowphase [`anchor_lab::pick`] — an index may over-
//! approximate candidates but never changes what gets selected.

use anchor_lab::math::RectF;
use anchor_lab::model::{Document, NodeId};
use anchor_lab::resolve::Resolved;

/// The spatial read tier — the one door for point-hit, marquee, and cull.
/// Fronts linear walks today; a broadphase index (OS-3a) slots in behind
/// these signatures without touching a caller. Model semantics (paint-order
/// topmost, transparent-select, lens post-ops, hairline slop) live in the lab
/// narrowphase [`anchor_lab::pick`], never here — an index may over-
/// approximate candidates but never changes what is selected.
pub struct Query<'a> {
    pub doc: &'a Document,
    pub resolved: &'a Resolved,
}

impl<'a> Query<'a> {
    pub fn new(doc: &'a Document, resolved: &'a Resolved) -> Self {
        Query { doc, resolved }
    }

    /// Topmost node under a world point — delegates the narrowphase, so what
    /// gets selected is defined in one place (`pick`), not re-derived here.
    pub fn hit_point(&self, x: f32, y: f32) -> Option<NodeId> {
        anchor_lab::pick::pick(self.doc, self.resolved, x, y)
    }

    /// Nodes whose world AABB overlaps `rect` — marquee candidates. Over-
    /// approximates (AABB, not oriented box; the caller refines). Today
    /// identical to [`Self::cull`]; they will diverge (marquee gains a
    /// contained-vs-touched mode, cull gains subtree granularity).
    pub fn nodes_in_rect(&self, rect: RectF) -> Vec<NodeId> {
        self.overlapping(rect)
    }

    /// Nodes whose world AABB overlaps the viewport — the visible candidate
    /// set for culling. See [`Self::nodes_in_rect`].
    pub fn cull(&self, viewport: RectF) -> Vec<NodeId> {
        self.overlapping(viewport)
    }

    fn overlapping(&self, rect: RectF) -> Vec<NodeId> {
        let mut out = Vec::new();
        for id in 0..self.resolved.slot_count() as NodeId {
            if let Some(aabb) = self.resolved.aabb_opt(id) {
                if aabb_overlap(&aabb, &rect) {
                    out.push(id);
                }
            }
        }
        out
    }
}

/// Inclusive AABB overlap (edge touches count — an over-approximation never
/// misses a candidate).
fn aabb_overlap(a: &RectF, b: &RectF) -> bool {
    a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}
