//! ENG-2.2 · damage as data. `diff(prev, next) -> Damage` (step 11)
//! compares two resolved tiers column-by-column with exact f32 equality
//! — justified because the pipeline is order-deterministic (ENG-0.3), so
//! "unchanged" is bit-identity, not an epsilon guess. Damage flows
//! forward only (resolve diff -> drawlist diff -> screen rects); no stage
//! invents or widens it. Day 1 it is asserted and shown (HUD line), not
//! yet consumed for partial repaint (that is OS-2a).

use anchor_lab::math::RectF;
use anchor_lab::model::NodeId;
use anchor_lab::resolve::Resolved;

/// What changed between two resolves: the touched nodes and the world-space
/// rect that bounds their before+after ink (covers appear/disappear).
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
    let mut changed = Vec::new();
    let mut union_world: Option<RectF> = None;
    for id in 0..n as NodeId {
        if slot_changed(prev, next, id) {
            changed.push(id);
            // Cover the node's ink in BOTH states (appear/disappear/move).
            if let Some(r) = prev.aabb_opt(id) {
                union_world = Some(union_rect(union_world, r));
            }
            if let Some(r) = next.aabb_opt(id) {
                union_world = Some(union_rect(union_world, r));
            }
        }
    }
    Damage {
        changed,
        union_world,
    }
}

fn slot_changed(prev: &Resolved, next: &Resolved, id: NodeId) -> bool {
    prev.box_opt(id) != next.box_opt(id)
        || prev.local_opt(id) != next.local_opt(id)
        || prev.world_opt(id) != next.world_opt(id)
        || prev.aabb_opt(id) != next.aabb_opt(id)
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
