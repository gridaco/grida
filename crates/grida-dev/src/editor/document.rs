//! Editor document — owns a `Scene`, applies mutations, flushes to renderer.
//!
//! The editor maintains its own copy of the scene. On each mutation it
//! modifies the scene in-place and then calls `load_scene()` on the
//! renderer to flush the changes. This matches the web editor's model
//! where the JS side owns the document and pushes full snapshots to
//! the WASM renderer.
//!
//! Performance is not a concern — this is dev-only. A full `load_scene`
//! rebuilds all caches from scratch.

use cg::node::schema::{Node, NodeId, Scene};
use cg::surface::gesture::SurfaceGesture;
use cg::window::application::UnknownTargetApplication;

use super::mutation::{
    self, compute_resize_geometry, node_supports_resize, resize_affected_axes, MutationCommand,
};

/// The dev editor document.
pub struct EditorDocument {
    /// The editor's own copy of the scene.
    scene: Scene,
}

impl EditorDocument {
    pub fn new(scene: Scene) -> Self {
        Self { scene }
    }

    /// Replace the document with a new scene.
    pub fn set_scene(&mut self, scene: Scene) {
        self.scene = scene;
    }

    /// Read the current scene.
    pub fn scene(&self) -> &Scene {
        &self.scene
    }

    /// Apply a mutation command to the document.
    /// Returns `true` if the scene was modified.
    pub fn apply(&mut self, cmd: &MutationCommand) -> bool {
        mutation::apply(&mut self.scene, cmd)
    }

    /// Flush the current scene to the renderer.
    /// This is a full reload — all caches are rebuilt.
    pub fn flush(&self, app: &mut UnknownTargetApplication) {
        app.renderer_mut().load_scene(self.scene.clone());
    }

    /// Process a gesture delta from the surface state.
    ///
    /// Reads the gesture state before and after a surface dispatch,
    /// computes the appropriate mutation, applies it to the document,
    /// and flushes to the renderer.
    ///
    /// Returns `true` if the scene was mutated and flushed.
    pub fn handle_gesture_delta(
        &mut self,
        app: &mut UnknownTargetApplication,
        gesture_before: &SurfaceGesture,
    ) -> bool {
        let gesture_after = app.surface().gesture;

        let mutated = match (gesture_before, &gesture_after) {
            // ── Translate ────────────────────────────────────────────
            (
                SurfaceGesture::Translate {
                    prev_canvas: old_pt,
                },
                SurfaceGesture::Translate {
                    prev_canvas: new_pt,
                },
            ) => {
                let dx = new_pt[0] - old_pt[0];
                let dy = new_pt[1] - old_pt[1];
                let ids = app.surface_selected_nodes().to_vec();
                self.apply(&MutationCommand::Translate { ids, dx, dy })
            }
            // ── Resize ───────────────────────────────────────────────
            (
                SurfaceGesture::Resize {
                    prev_screen: old_pt,
                    direction,
                },
                SurfaceGesture::Resize {
                    prev_screen: new_pt,
                    ..
                },
            ) => self.handle_incremental_resize(app, *direction, *old_pt, *new_pt),
            _ => false,
        };

        if mutated {
            self.flush(app);
        }
        mutated
    }

    fn handle_incremental_resize(
        &mut self,
        app: &UnknownTargetApplication,
        direction: cg::surface::ResizeDirection,
        old_screen: [f32; 2],
        new_screen: [f32; 2],
    ) -> bool {
        // Filter to resizable nodes.
        let resizable_ids: Vec<NodeId> = app
            .surface_selected_nodes()
            .iter()
            .copied()
            .filter(|id| {
                self.scene
                    .graph
                    .get_node(id)
                    .ok()
                    .is_some_and(node_supports_resize)
            })
            .collect();
        if resizable_ids.is_empty() {
            return false;
        }

        // Screen → canvas delta via inverse view matrix.
        let inv = match app.view_matrix().inverse() {
            Some(inv) => inv,
            None => return false,
        };
        let ds = [new_screen[0] - old_screen[0], new_screen[1] - old_screen[1]];
        let p0 = math2::vector2::transform([0.0, 0.0], &inv);
        let p1 = math2::vector2::transform(ds, &inv);
        let dx = p1[0] - p0[0];
        let dy = p1[1] - p0[1];
        if dx.abs() < 0.0001 && dy.abs() < 0.0001 {
            return false;
        }

        // Current selection bounds (read from renderer's cache via UTA).
        let union = match app.get_union_bounds(&resizable_ids) {
            Some(u) => u,
            None => return false,
        };
        if union.width < 0.001 || union.height < 0.001 {
            return false;
        }

        // Pure geometry.
        let (new_w, new_h, tx, ty) =
            compute_resize_geometry(direction, dx, dy, union.width, union.height);
        let new_w = new_w.max(1.0);
        let new_h = new_h.max(1.0);
        let scale_x = new_w / union.width;
        let scale_y = new_h / union.height;
        let (affects_w, affects_h) = resize_affected_axes(direction);

        // Collect per-node sizes before mutation.
        let node_sizes: Vec<_> = resizable_ids
            .iter()
            .filter_map(|id| app.get_node_bounds(id).map(|b| (*id, b.width, b.height)))
            .collect();

        let mut mutated = false;

        // Origin shift.
        if tx.abs() > 0.0001 || ty.abs() > 0.0001 {
            mutated |= self.apply(&MutationCommand::Translate {
                ids: resizable_ids.clone(),
                dx: tx,
                dy: ty,
            });
        }
        // Per-node resize.
        for (id, w, h) in &node_sizes {
            let new_width = if affects_w {
                Some((w * scale_x).max(1.0))
            } else {
                None
            };
            let new_height = if affects_h {
                Some((h * scale_y).max(1.0))
            } else {
                None
            };
            mutated |= self.apply(&MutationCommand::Resize {
                id: *id,
                width: new_width,
                height: new_height,
            });

            // Auto-height for content-driven nodes: when width changes,
            // re-measure content height so the node fits its content.
            if affects_w {
                if let Ok(node) = self.scene.graph.get_node(id) {
                    let actual_w = new_width.unwrap_or(*w);
                    let measured = match node {
                        Node::MarkdownEmbed(n) => {
                            let html = cg::htmlcss::markdown_to_styled_html(&n.markdown);
                            cg::htmlcss::measure_content_height(
                                &html,
                                actual_w,
                                &app.renderer().fonts,
                                &cg::htmlcss::NoImages,
                            )
                            .ok()
                        }
                        Node::HTMLEmbed(n) => cg::htmlcss::measure_content_height(
                            &n.html,
                            actual_w,
                            &app.renderer().fonts,
                            &cg::htmlcss::NoImages,
                        )
                        .ok(),
                        _ => None,
                    };
                    if let Some(h) = measured {
                        mutated |= self.apply(&MutationCommand::Resize {
                            id: *id,
                            width: None,
                            height: Some(h),
                        });
                    }
                }
            }
        }
        mutated
    }
}
