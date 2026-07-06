//! Renderer reconciliation — the frame concept's mechanism
//! (`crates/grida_editor/docs/frame.md`); the shell and the vertical-slice
//! conformance tests share it. Deliberately thin.
//!
//! The editor core ([`Editor`]) owns document truth (`ARCH-2`); a
//! renderer keeps its own mirrored copy of the scene for painting and
//! hit-testing — behind caches that repaint **only when a frame is
//! scheduled**. [`reflect`] is the one function that closes the gap:
//! the host drains the editor's damage ledger
//! ([`Editor::take_damage`]) and reflects it here, at one choke point
//! (`FRAME-2`), after every event that can reach the editor.
//!
//! - **Property damage** reflects narrowly: post-state node records
//!   are copied over, each marked with its summary [`ChangeKind`] (the
//!   renderer's invalidation module skips full cache rebuilds), and
//!   one frame is queued. Marking caches without queueing is the
//!   half-measure `FRAME-1` exists to forbid — the renderer's flush is
//!   gated on its frame queue, so the change would sit invisible until
//!   the next incidental repaint (hover, pan).
//! - **Structural damage** reflects wholesale via [`flush`]:
//!   `load_scene` from [`WorkingCopy::export_scene`] rebuilds every
//!   renderer cache and queues its own frame.
//!
//! The renderer scene must have been loaded from this working copy's
//! [`WorkingCopy::export_scene`] (directly or via [`flush`]) so that
//! internal node ids agree; [`EngineScene`] translates across that
//! boundary when answering the HUD's and the interpreter's scene
//! queries.

use grida::runtime::invalidation::ChangeKind;
use grida::runtime::scene::Renderer;
use grida::window::application::UnknownTargetApplication;
use math2::rect::Rectangle;
use math2::transform::AffineTransform;

use crate::document::{ChangeSummary, Id, WorkingCopy};
use crate::hud::{HudScene, SelectionShape};
use crate::interpret::InterpretScene;

/// Wholesale reload: push the working copy's scene into the renderer
/// (`load_scene` rebuilds all caches and queues a frame). Use on
/// initial load; [`reflect`] escalates to it on structural damage.
pub fn flush(doc: &WorkingCopy, renderer: &mut Renderer) {
    renderer.load_scene(doc.export_scene());
}

/// Reflect drained damage into the renderer (`FRAME-1..4`): the one
/// reconciliation between document truth and painted pixels.
///
/// Empty damage does nothing and schedules nothing (`FRAME-4`).
/// Structural damage reloads wholesale. Property damage copies the
/// post-state records, marks each node with its summary change kind,
/// and queues exactly one frame — a node the working copy no longer
/// knows (or a missing renderer scene) escalates to wholesale.
/// Returns whether anything was reflected, so the host can fan out
/// its own derived state (panels, title) from the same drain.
pub fn reflect(doc: &WorkingCopy, renderer: &mut Renderer, damage: &ChangeSummary) -> bool {
    if damage.is_empty() {
        return false;
    }
    if damage.structural {
        flush(doc, renderer);
        return true;
    }
    // Background damage: the renderer's clear color updates in place
    // and a content frame repaints — no scene rebuild.
    let mut queue = false;
    if damage.background {
        match renderer.scene.as_mut() {
            Some(scene) => {
                scene.background_color = doc.background_color();
                queue = true;
            }
            None => {
                flush(doc, renderer);
                return true;
            }
        }
    }
    if damage.nodes.is_empty() {
        // No node damage (guide-only, or background-only handled
        // above): guides are chrome truth — nothing further to
        // reflect. Queue the background repaint if one is pending and
        // return true so the host fans out its derived state (the
        // guide mirror, the strips, the title).
        if queue {
            renderer.queue_unstable();
        }
        return true;
    }
    for (id, kind) in &damage.nodes {
        if *kind == ChangeKind::None {
            continue;
        }
        let (Some(iid), Some(record)) = (doc.internal_id(id), doc.node_record(id)) else {
            flush(doc, renderer);
            return true;
        };
        let Some(scene) = renderer.scene.as_mut() else {
            flush(doc, renderer);
            return true;
        };
        let Ok(node) = scene.graph.get_node_mut(&iid) else {
            flush(doc, renderer);
            return true;
        };
        *node = record.clone();
        if let Some(name) = doc.node_name(id) {
            scene.graph.set_name(iid, name);
        }
        scene.graph.refresh_node_geo_data(&iid);
        renderer.mark_node_change_kind(iid, *kind);
    }
    // The frame the invalidations above ride out on. `load_scene`
    // queues its own; the narrow path must queue explicitly (the
    // engine's own interactive-edit paths use the unstable queue).
    renderer.queue_unstable();
    true
}

/// The engine-backed scene: answers the HUD's two queries
/// (`crates/grida_editor/docs/hud.md`) and the interpreter's
/// ([`crate::interpret`]) over a live renderer, translating internal
/// ↔ stable ids at this boundary. Constructed per event from borrowed
/// views — the host builds it, asks, and drops it before any mutable
/// editor borrow.
pub struct EngineScene<'a> {
    pub app: &'a UnknownTargetApplication,
    pub doc: &'a WorkingCopy,
}

impl HudScene for EngineScene<'_> {
    fn pick(&self, canvas_point: [f32; 2]) -> Option<Id> {
        let iid = self.app.hit_test_point(canvas_point)?;
        self.doc.stable_id(iid).cloned()
    }

    fn shape_of(&self, id: &Id) -> Option<SelectionShape> {
        let iid = self.doc.internal_id(id)?;
        let bounds = self.app.get_node_bounds(&iid)?;
        let rotation = self.doc.node_rotation(id).unwrap_or(0.0);
        if rotation.abs() < 1e-4 {
            return Some(SelectionShape::Rect(bounds));
        }
        // Reconstruct the OBB from the world AABB: a rotation about
        // the node's center leaves the AABB center on that center, so
        // matrix = translate(center) ∘ rotate(θ) ∘ translate(-w/2,-h/2).
        let (w, h) = self
            .doc
            .node_size(id)
            .unwrap_or((bounds.width, bounds.height));
        let center = bounds.center();
        let (s, c) = rotation.sin_cos();
        let tx = center[0] - (c * (w * 0.5) - s * (h * 0.5));
        let ty = center[1] - (s * (w * 0.5) + c * (h * 0.5));
        Some(SelectionShape::Transformed {
            local: Rectangle::from_xywh(0.0, 0.0, w, h),
            matrix: AffineTransform::from_acebdf(c, -s, tx, s, c, ty),
        })
    }
}

impl InterpretScene for EngineScene<'_> {
    fn nodes_in_rect(&self, rect: &Rectangle) -> Vec<Id> {
        self.app
            .hit_test_rect(rect)
            .into_iter()
            .filter_map(|iid| self.doc.stable_id(iid).cloned())
            .collect()
    }

    fn world_bounds(&self, id: &Id) -> Option<Rectangle> {
        let iid = self.doc.internal_id(id)?;
        self.app.get_node_bounds(&iid)
    }

    /// The guide-drag snap targets (ruler.md `RUL-6`): the scene's
    /// top-level content bounds — web precedent (the guide gesture
    /// snaps against the scene's root children).
    fn guide_anchors(&self) -> Vec<Rectangle> {
        self.doc
            .children(None)
            .iter()
            .filter_map(|id| self.world_bounds(id))
            .collect()
    }

    /// The drop-target candidate chain (translate.md): every node
    /// under the point, topmost first — the engine's
    /// `elementsFromPoint` analogue, stable-id-mapped (nodes without
    /// stable ids, e.g. the synthetic root wrapper, drop out).
    fn hit_chain(&self, canvas_point: [f32; 2]) -> Vec<Id> {
        let Some(scene) = self.app.renderer().scene.as_ref() else {
            return Vec::new();
        };
        let ht =
            grida::hittest::HitTester::with_graph(self.app.renderer().get_cache(), &scene.graph)
                .with_isolation_set(self.app.renderer().isolation_set());
        ht.hits(canvas_point)
            .into_iter()
            .filter_map(|iid| self.doc.stable_id(iid).cloned())
            .collect()
    }

    fn parent_of(&self, id: &Id) -> Option<Id> {
        self.doc.node_parent(id).flatten()
    }

    /// The child-frame world origin, from the geometry cache's world
    /// transform — `Some` only for a pure translation (translate.md:
    /// a rotated/scaled frame is not a v1 re-parenting target).
    fn frame_origin(&self, id: &Id) -> Option<[f32; 2]> {
        let iid = self.doc.internal_id(id)?;
        let t = self
            .app
            .renderer()
            .get_cache()
            .geometry
            .get_world_transform(&iid)?;
        let m = t.matrix;
        const EPS: f32 = 1e-4;
        let pure = (m[0][0] - 1.0).abs() < EPS
            && m[0][1].abs() < EPS
            && m[1][0].abs() < EPS
            && (m[1][1] - 1.0).abs() < EPS;
        pure.then(|| [m[0][2], m[1][2]])
    }

    /// The snap neighborhood (snap.md "The session"): each moving
    /// node's parent bounds and sibling bounds, minus the moving set.
    fn snap_anchors(&self, moving: &[Id]) -> Vec<Rectangle> {
        let mut seen: std::collections::HashSet<Id> = moving.iter().cloned().collect();
        let mut out = Vec::new();
        for id in moving {
            let Some(parent) = self.doc.node_parent(id) else {
                continue;
            };
            for sibling in self.doc.children(parent.as_ref()) {
                if seen.insert(sibling.clone())
                    && let Some(b) = self.world_bounds(&sibling)
                {
                    out.push(b);
                }
            }
            if let Some(p) = parent
                && seen.insert(p.clone())
                && let Some(b) = self.world_bounds(&p)
            {
                out.push(b);
            }
        }
        out
    }
}
