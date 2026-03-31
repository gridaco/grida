use crate::hittest::HitTester;
use crate::node::schema::NodeId;
use crate::query::{self, Hierarchy};
use crate::surface::cursor::CursorIcon;
use crate::surface::event::{Modifiers, PointerButton, SurfaceEvent};
use crate::surface::gesture::SurfaceGesture;
use crate::surface::hover::{HoverSource, HoverState};
use crate::surface::response::SurfaceResponse;
use crate::surface::selection::SelectionState;
use crate::surface::ui::hit_region::{HitRegions, OverlayAction};
use crate::text_edit::session::ClickTracker;
use math2::vector2::Vector2;

/// Pending pointer-down state, stored between pointer-down and the next
/// pointer-move or pointer-up.
///
/// - **Already-selected node**: selection change is *deferred*. If the
///   user drags, the deferred change is cancelled (preserving the multi-
///   selection for translate). If the user clicks (releases without
///   dragging), the deferred change is applied.
/// - **Newly-selected node**: selection was already applied immediately.
///   The anchor is stored so a subsequent drag can start a Translate
///   gesture. No deferred selection change exists.
#[derive(Debug, Clone, Copy)]
struct PendingPointerDown {
    /// Canvas-space point of the pointer-down (used as drag anchor).
    anchor_canvas: Vector2,
    /// If `Some`, the selection change has been *deferred* and will be
    /// applied on pointer-up (click) or cancelled on drag.
    deferred: Option<DeferredSelectionOp>,
}

/// A selection operation that was deferred.
#[derive(Debug, Clone, Copy)]
struct DeferredSelectionOp {
    /// The node that was clicked.
    node_id: NodeId,
    /// Whether shift was held (toggle vs reset-to-one).
    shift: bool,
}

/// Canvas surface interaction state.
///
/// Manages hover, selection, gesture, and cursor state for canvas
/// interactions. The host calls [`dispatch`](Self::dispatch) with
/// platform-agnostic [`SurfaceEvent`]s and a [`HitTester`] reference;
/// the surface never touches the camera or renderer directly.
///
/// By default the surface operates in **readonly** mode — hover and
/// click-to-select work, but manipulation affordances (translate gesture,
/// deferred selection, move cursor, selection-rect awareness) are
/// disabled. Set [`readonly`](Self::readonly) to `false` to enable the
/// full native editing surface.
#[derive(Debug, Clone)]
pub struct SurfaceState {
    pub hover: HoverState,
    pub selection: SelectionState,
    pub gesture: SurfaceGesture,
    pub cursor: CursorIcon,
    /// Current modifier key state, updated by `ModifiersChanged` events.
    modifiers: Modifiers,
    /// Multi-click tracker for double-click detection.
    pub click_tracker: ClickTracker,

    /// When `true` (the default), the surface only supports hover and
    /// click-to-select.  Translate gestures, deferred selection, the
    /// move cursor, and selection-rect hit testing are all disabled.
    ///
    /// Set to `false` by the native host (`grida-dev`) to enable the
    /// full editing surface.  The web side keeps the default so these
    /// features don't interfere with the JS-driven editor.
    pub readonly: bool,

    /// Set between pointer-down and the next pointer-move/pointer-up.
    /// Drives deferred selection and translate gesture initiation.
    /// Only used when `readonly == false`.
    pending_pointer_down: Option<PendingPointerDown>,
}

impl Default for SurfaceState {
    fn default() -> Self {
        Self {
            hover: HoverState::default(),
            selection: SelectionState::default(),
            gesture: SurfaceGesture::default(),
            cursor: CursorIcon::Default,
            modifiers: Modifiers::default(),
            click_tracker: ClickTracker::new(),
            readonly: true,
            pending_pointer_down: None,
        }
    }
}

impl SurfaceState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Select all given nodes.
    pub fn select_all(&mut self, ids: Vec<crate::node::schema::NodeId>) -> SurfaceResponse {
        let mut response = SurfaceResponse::none();
        if !ids.is_empty() || !self.selection.is_empty() {
            self.selection.set(ids);
            response.selection_changed = true;
            response.needs_redraw = true;
        }
        response
    }

    /// Invalidate hover state without running a hit test.
    ///
    /// Call this during camera transforms (pan, zoom, pinch) so the surface
    /// doesn't waste cycles on hit testing while the view is moving.
    /// The hover will be re-evaluated on the next `PointerMove`.
    pub fn invalidate_hover(&mut self) -> SurfaceResponse {
        let mut response = SurfaceResponse::none();
        if self.hover.clear() {
            response.hover_changed = true;
            response.needs_redraw = true;
        }
        response
    }

    /// Prune nested nodes from the current selection using the hierarchy.
    ///
    /// Removes any selected node whose ancestor is also selected, so
    /// operations apply only to the topmost selected nodes.
    pub fn prune_selection(&mut self, hierarchy: &impl Hierarchy) {
        let pruned = query::prune_nested(hierarchy, self.selection.as_slice());
        self.selection.set(pruned);
    }

    /// Process an input event and return what changed.
    ///
    /// The caller is responsible for:
    /// - Transforming screen coordinates to canvas coordinates via the camera
    /// - Constructing a [`HitTester`] from the current scene cache
    /// - Providing a [`Hierarchy`] for selection pruning (typically the scene graph)
    /// - Providing [`HitRegions`] from the most recent draw pass for overlay UI hit testing
    /// - Queueing a redraw if `response.needs_redraw` is true
    ///
    /// Keyboard/text/IME events pass through unchanged (handled at the
    /// application layer, not the surface layer).
    pub fn dispatch(
        &mut self,
        event: SurfaceEvent,
        hit_tester: &HitTester,
        hierarchy: &impl Hierarchy,
        ui_hit_regions: &HitRegions,
    ) -> SurfaceResponse {
        match event {
            SurfaceEvent::PointerMove {
                canvas_point,
                screen_point,
            } => self.handle_pointer_move(canvas_point, screen_point, hit_tester, ui_hit_regions),

            SurfaceEvent::PointerDown {
                canvas_point,
                screen_point,
                button,
                modifiers,
            } => {
                self.modifiers = modifiers;
                // Check overlay UI hit regions first (they are visually on top)
                if button == PointerButton::Primary {
                    if let Some(action) =
                        ui_hit_regions.hit_test([screen_point[0], screen_point[1]])
                    {
                        return self.handle_overlay_action(action, screen_point, hierarchy);
                    }
                }
                self.handle_pointer_down(canvas_point, button, hit_tester, hierarchy)
            }

            SurfaceEvent::PointerUp {
                canvas_point,
                screen_point: _,
                button,
                modifiers,
            } => {
                self.modifiers = modifiers;
                self.handle_pointer_up(canvas_point, button, hierarchy)
            }

            SurfaceEvent::ModifiersChanged(mods) => {
                self.modifiers = mods;
                SurfaceResponse::none()
            }

            // Keyboard/text/IME events are not handled by the surface layer.
            // They are handled by the application's handle_surface_event().
            SurfaceEvent::KeyDown { .. }
            | SurfaceEvent::TextInput { .. }
            | SurfaceEvent::Ime(_) => SurfaceResponse::none(),
        }
    }

    /// Handle an overlay UI action (e.g. clicking a frame title bar or handle).
    fn handle_overlay_action(
        &mut self,
        action: &OverlayAction,
        screen_point: Vector2,
        hierarchy: &impl Hierarchy,
    ) -> SurfaceResponse {
        let mut response = SurfaceResponse::none();
        match action {
            OverlayAction::SelectNode(id) => {
                if self.modifiers.shift {
                    self.selection.toggle(*id);
                    self.prune_selection(hierarchy);
                } else {
                    self.selection.select_one(*id);
                }
                response.selection_changed = true;
                response.needs_redraw = true;
            }
            OverlayAction::ResizeHandle(dir) if !self.readonly => {
                self.gesture = SurfaceGesture::Resize {
                    direction: *dir,
                    prev_screen: screen_point,
                };
                response.needs_redraw = true;
            }
            OverlayAction::RotateHandle(corner) if !self.readonly => {
                self.gesture = SurfaceGesture::Rotate {
                    corner: *corner,
                    prev_screen: screen_point,
                };
                response.needs_redraw = true;
            }
            // Readonly mode: handles are not shown, but if hit regions
            // somehow still exist, ignore them.
            OverlayAction::ResizeHandle(_) | OverlayAction::RotateHandle(_) => {}
        }
        response
    }

    fn handle_pointer_move(
        &mut self,
        canvas_point: Vector2,
        screen_point: Vector2,
        hit_tester: &HitTester,
        ui_hit_regions: &HitRegions,
    ) -> SurfaceResponse {
        let mut response = SurfaceResponse::none();

        // ── Check for pending pointer-down → translate promotion ─────────
        // Only in editing mode (!readonly). If the gesture is still Idle
        // and we have a pending pointer-down, the user is dragging from a
        // node. Cancel any deferred selection and start a Translate gesture.
        if !self.readonly {
            if let Some(pending) = self.pending_pointer_down.take() {
                if matches!(self.gesture, SurfaceGesture::Idle) {
                    // Start translate. Set prev_canvas to the anchor so the
                    // application layer can compute the first delta as
                    // (current_point - anchor). Then immediately fall
                    // through to the Translate match arm which updates
                    // prev_canvas to canvas_point.
                    self.gesture = SurfaceGesture::Translate {
                        prev_canvas: pending.anchor_canvas,
                    };
                    let new_cursor = CursorIcon::Move;
                    if new_cursor != self.cursor {
                        self.cursor = new_cursor;
                        response.cursor_changed = true;
                    }
                    // Don't return — fall through to the Translate arm so
                    // prev_canvas gets updated to canvas_point on the same
                    // event that promoted the gesture.
                }
            }
        }

        match self.gesture {
            SurfaceGesture::Idle => {
                // Check overlay UI regions — hover the associated node
                if let Some(action) = ui_hit_regions.hit_test([screen_point[0], screen_point[1]]) {
                    let new_cursor = match action {
                        OverlayAction::SelectNode(_) => CursorIcon::Pointer,
                        OverlayAction::ResizeHandle(dir) => CursorIcon::Resize(*dir),
                        OverlayAction::RotateHandle(corner) => CursorIcon::Rotate(*corner),
                    };
                    if new_cursor != self.cursor {
                        self.cursor = new_cursor;
                        response.cursor_changed = true;
                    }
                    // Set hover to the node referenced by the overlay action
                    let node_id = match action {
                        OverlayAction::SelectNode(id) => Some(*id),
                        // Handle regions don't change the hovered node.
                        OverlayAction::ResizeHandle(_) | OverlayAction::RotateHandle(_) => None,
                    };
                    // Only update hover for SelectNode actions; handle hover
                    // shouldn't clear the existing hover target.
                    if matches!(action, OverlayAction::SelectNode(_)) {
                        let hover_changed = self.hover.set(node_id, HoverSource::HitTest);
                        if hover_changed {
                            response.hover_changed = true;
                            response.needs_redraw = true;
                        }
                    }
                    return response;
                }

                // Update hover via hit test
                let hit = hit_tester.hit_first(canvas_point);
                let hover_changed = self.hover.set(hit, HoverSource::HitTest);
                if hover_changed {
                    response.hover_changed = true;
                    response.needs_redraw = true;
                }

                // In editing mode, show Move cursor when hovering inside
                // the selection bounding rect. In readonly mode, always
                // use the Default cursor.
                let new_cursor = if !self.readonly {
                    let over_selected = hit.is_some_and(|id| self.selection.contains(&id));
                    let inside_bounds = !self.selection.is_empty()
                        && hit_tester
                            .point_in_selection_bounds(canvas_point, self.selection.as_slice());
                    if over_selected || inside_bounds {
                        CursorIcon::Move
                    } else {
                        CursorIcon::Default
                    }
                } else {
                    CursorIcon::Default
                };
                if new_cursor != self.cursor {
                    self.cursor = new_cursor;
                    response.cursor_changed = true;
                }
            }
            SurfaceGesture::Translate { .. } => {
                // Update prev_canvas to current position. The application
                // layer computes the delta by comparing the gesture before
                // and after dispatch.
                self.gesture = SurfaceGesture::Translate {
                    prev_canvas: canvas_point,
                };
                response.needs_redraw = true;
            }
            SurfaceGesture::MarqueeSelect {
                anchor_canvas,
                current_canvas: _,
            } => {
                self.gesture = SurfaceGesture::MarqueeSelect {
                    anchor_canvas,
                    current_canvas: canvas_point,
                };

                // Compute tentative selection from marquee rectangle.
                // Use intersects_topmost to get only the shallowest
                // matching ancestors — avoids the separate O(K*D) prune.
                let rect = marquee_rect(anchor_canvas, canvas_point);
                let hits = hit_tester.intersects_topmost(&rect);
                self.selection.set(hits);

                response.selection_changed = true;
                response.needs_redraw = true;
            }
            SurfaceGesture::Resize { direction, .. } => {
                self.gesture = SurfaceGesture::Resize {
                    direction,
                    prev_screen: screen_point,
                };
                response.needs_redraw = true;
            }
            SurfaceGesture::Rotate { corner, .. } => {
                self.gesture = SurfaceGesture::Rotate {
                    corner,
                    prev_screen: screen_point,
                };
                response.needs_redraw = true;
            }
            SurfaceGesture::Pan { .. } => {
                // Pan is handled by the application/camera, not the surface
            }
        }

        response
    }

    fn handle_pointer_down(
        &mut self,
        canvas_point: Vector2,
        button: PointerButton,
        hit_tester: &HitTester,
        hierarchy: &impl Hierarchy,
    ) -> SurfaceResponse {
        let mut response = SurfaceResponse::none();

        if button != PointerButton::Primary {
            return response;
        }

        // Track multi-click sequence for double-click detection.
        let click_count = self
            .click_tracker
            .register(canvas_point[0], canvas_point[1]);

        let hit = hit_tester.hit_first(canvas_point);

        if self.readonly {
            // ── Readonly path: immediate selection, no translate ──────
            self.pending_pointer_down = None;
            match hit {
                Some(id) => {
                    if self.modifiers.shift {
                        self.selection.toggle(id);
                        self.prune_selection(hierarchy);
                    } else {
                        self.selection.select_one(id);
                    }
                    response.selection_changed = true;
                    response.needs_redraw = true;
                    if click_count >= 2 {
                        response.double_clicked_node = Some(id);
                    }
                }
                None => {
                    if self.modifiers.shift {
                        // keep selection
                    } else if !self.selection.is_empty() {
                        self.selection.clear();
                        response.selection_changed = true;
                        response.needs_redraw = true;
                    }
                    self.gesture = SurfaceGesture::MarqueeSelect {
                        anchor_canvas: canvas_point,
                        current_canvas: canvas_point,
                    };
                }
            }
        } else {
            // ── Editing path: deferred selection + translate ──────────
            match hit {
                Some(id) => {
                    let already_selected = self.selection.contains(&id);

                    if already_selected {
                        // Node is already selected — **defer** the selection
                        // change so that dragging preserves the full
                        // selection for translate.
                        self.pending_pointer_down = Some(PendingPointerDown {
                            anchor_canvas: canvas_point,
                            deferred: Some(DeferredSelectionOp {
                                node_id: id,
                                shift: self.modifiers.shift,
                            }),
                        });
                    } else {
                        // Unselected node — immediate selection change.
                        if self.modifiers.shift {
                            self.selection.toggle(id);
                            self.prune_selection(hierarchy);
                        } else {
                            self.selection.select_one(id);
                        }
                        response.selection_changed = true;
                        response.needs_redraw = true;

                        // Store the anchor for a potential translate drag.
                        self.pending_pointer_down = Some(PendingPointerDown {
                            anchor_canvas: canvas_point,
                            deferred: None,
                        });
                    }

                    if click_count >= 2 {
                        response.double_clicked_node = Some(id);
                        // Clear translate anchor — double-click enters text
                        // edit, PointerUp may be swallowed by the text edit
                        // handler. Without this, the stale anchor causes a
                        // ghost translate on the next PointerMove.
                        self.pending_pointer_down = None;
                    }
                }
                None => {
                    // No node hit. Check if inside the selection bounding
                    // rect — if so, set up for translate (the user can
                    // drag any part of the selection box).
                    if !self.selection.is_empty()
                        && hit_tester
                            .point_in_selection_bounds(canvas_point, self.selection.as_slice())
                    {
                        self.pending_pointer_down = Some(PendingPointerDown {
                            anchor_canvas: canvas_point,
                            deferred: None,
                        });
                    } else {
                        // Truly empty space.
                        self.pending_pointer_down = None;

                        if self.modifiers.shift {
                            // keep selection
                        } else if !self.selection.is_empty() {
                            self.selection.clear();
                            response.selection_changed = true;
                            response.needs_redraw = true;
                        }

                        self.gesture = SurfaceGesture::MarqueeSelect {
                            anchor_canvas: canvas_point,
                            current_canvas: canvas_point,
                        };
                    }
                }
            }
        }

        response
    }

    fn handle_pointer_up(
        &mut self,
        _canvas_point: Vector2,
        button: PointerButton,
        hierarchy: &impl Hierarchy,
    ) -> SurfaceResponse {
        let mut response = SurfaceResponse::none();

        if button != PointerButton::Primary {
            return response;
        }

        // ── Apply deferred selection on click (no drag occurred) ─────────
        // Only relevant in editing mode; readonly never sets pending.
        if let Some(pending) = self.pending_pointer_down.take() {
            if let Some(deferred) = pending.deferred {
                if deferred.shift {
                    self.selection.toggle(deferred.node_id);
                    self.prune_selection(hierarchy);
                } else {
                    self.selection.select_one(deferred.node_id);
                }
                response.selection_changed = true;
                response.needs_redraw = true;
            }
        }

        // ── End active gestures ──────────────────────────────────────────
        match self.gesture {
            SurfaceGesture::MarqueeSelect { .. }
            | SurfaceGesture::Translate { .. }
            | SurfaceGesture::Resize { .. }
            | SurfaceGesture::Rotate { .. } => {
                self.gesture = SurfaceGesture::Idle;
                response.needs_redraw = true;
            }
            _ => {}
        }

        // Reset cursor back to default after gesture ends.
        if self.cursor == CursorIcon::Move && matches!(self.gesture, SurfaceGesture::Idle) {
            self.cursor = CursorIcon::Default;
            response.cursor_changed = true;
        }

        response
    }
}

/// Compute a normalized rectangle from two corner points.
fn marquee_rect(a: Vector2, b: Vector2) -> math2::rect::Rectangle {
    let x = a[0].min(b[0]);
    let y = a[1].min(b[1]);
    let w = (a[0] - b[0]).abs();
    let h = (a[1] - b[1]).abs();
    math2::rect::Rectangle {
        x,
        y,
        width: w,
        height: h,
    }
}

// Unit tests for SurfaceState live in `tests/surface_interaction.rs`
// as integration tests with real scenes and hit testers.
