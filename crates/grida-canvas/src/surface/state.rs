use crate::hittest::HitTester;
use crate::query::{self, Hierarchy};
use crate::surface::cursor::CursorIcon;
use crate::surface::event::{Modifiers, PointerButton, SurfaceEvent};
use crate::surface::gesture::SurfaceGesture;
use crate::surface::hover::{HoverSource, HoverState};
use crate::surface::response::SurfaceResponse;
use crate::surface::selection::SelectionState;
use crate::surface::ui::hit_region::{HitRegions, OverlayAction};
use crate::text_edit::session::ClickTracker;

/// Canvas surface interaction state.
///
/// Manages hover, selection, gesture, and cursor state for readonly
/// canvas interactions. The host calls [`dispatch`](Self::dispatch) with
/// platform-agnostic [`SurfaceEvent`]s and a [`HitTester`] reference;
/// the surface never touches the camera or renderer directly.
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
                        return self.handle_overlay_action(action, hierarchy);
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
                self.handle_pointer_up(canvas_point, button)
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

    /// Handle an overlay UI action (e.g. clicking a frame title bar).
    fn handle_overlay_action(
        &mut self,
        action: &OverlayAction,
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
        }
        response
    }

    fn handle_pointer_move(
        &mut self,
        canvas_point: math2::vector2::Vector2,
        screen_point: math2::vector2::Vector2,
        hit_tester: &HitTester,
        ui_hit_regions: &HitRegions,
    ) -> SurfaceResponse {
        let mut response = SurfaceResponse::none();

        match self.gesture {
            SurfaceGesture::Idle => {
                // Check overlay UI regions — hover the associated node
                if let Some(action) = ui_hit_regions.hit_test([screen_point[0], screen_point[1]]) {
                    let new_cursor = CursorIcon::Pointer;
                    if new_cursor != self.cursor {
                        self.cursor = new_cursor;
                        response.cursor_changed = true;
                    }
                    // Set hover to the node referenced by the overlay action
                    let node_id = match action {
                        OverlayAction::SelectNode(id) => Some(*id),
                    };
                    let hover_changed = self.hover.set(node_id, HoverSource::HitTest);
                    if hover_changed {
                        response.hover_changed = true;
                        response.needs_redraw = true;
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

                // Update cursor based on hover
                let new_cursor = CursorIcon::Default;
                if new_cursor != self.cursor {
                    self.cursor = new_cursor;
                    response.cursor_changed = true;
                }
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
            SurfaceGesture::Pan { .. } => {
                // Pan is handled by the application/camera, not the surface
            }
        }

        response
    }

    fn handle_pointer_down(
        &mut self,
        canvas_point: math2::vector2::Vector2,
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

        match hit {
            Some(id) => {
                // Clicked on a node
                if self.modifiers.shift {
                    self.selection.toggle(id);
                    self.prune_selection(hierarchy);
                } else {
                    self.selection.select_one(id);
                }
                response.selection_changed = true;
                response.needs_redraw = true;

                // Report double-click for text editing activation.
                if click_count >= 2 {
                    response.double_clicked_node = Some(id);
                }
            }
            None => {
                if self.modifiers.shift {
                    // Shift+click on empty space: keep selection, start marquee
                    // (marquee will union with existing selection — future enhancement)
                } else {
                    // Click on empty space: clear selection, begin marquee
                    if !self.selection.is_empty() {
                        self.selection.clear();
                        response.selection_changed = true;
                        response.needs_redraw = true;
                    }
                }

                // Begin marquee gesture
                self.gesture = SurfaceGesture::MarqueeSelect {
                    anchor_canvas: canvas_point,
                    current_canvas: canvas_point,
                };
            }
        }

        response
    }

    fn handle_pointer_up(
        &mut self,
        _canvas_point: math2::vector2::Vector2,
        button: PointerButton,
    ) -> SurfaceResponse {
        let mut response = SurfaceResponse::none();

        if button != PointerButton::Primary {
            return response;
        }

        if matches!(self.gesture, SurfaceGesture::MarqueeSelect { .. }) {
            self.gesture = SurfaceGesture::Idle;
            response.needs_redraw = true;
        }

        response
    }
}

/// Compute a normalized rectangle from two corner points.
fn marquee_rect(a: math2::vector2::Vector2, b: math2::vector2::Vector2) -> math2::rect::Rectangle {
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
