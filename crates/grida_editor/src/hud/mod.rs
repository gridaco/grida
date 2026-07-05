//! The HUD — the canvas chrome and its interaction machine
//! (`crates/grida_editor/docs/hud.md`), the native binding of the `@grida/hud`
//! doctrine.
//!
//! **The one law: the HUD emits intent, and intent only** (`HUD-1`).
//! This module owns interaction state — the gesture machine, the
//! pending pointer-down, hover, the click tracker, the cursor, the
//! hit registry — mirrors the selection and camera the host pushes,
//! asks the scene exactly two questions ([`HudScene`]), and returns
//! intents from [`Hud::dispatch`]. It never mutates the document,
//! never opens history, and never knows what an intent means: the
//! interpretation lives in one host module ([`crate::interpret`],
//! `HUD-7`).
//!
//! Pointer-down routing implements the golden selection-intent router
//! (`docs/wg/canvas/ux-surface/selection-intent.md`): tier 1
//! routes by overlay type over the HUD's own hit registry, tier 2
//! falls back to the scene pick, ambiguity defers behind the
//! 3 px drag threshold — the sole click-vs-drag discriminator
//! (`HUD-4`).
//!
//! Every frame the chrome builder produces two independent backends
//! (`HUD-5`): a draw list the host paints and a hit registry the next
//! pointer-down consults. Both are a pure function of machine state,
//! mirrors, and `shape_of` (`HUD-6`).

mod chrome;
mod click;
mod gesture;
mod hit;
mod vocab;

pub use chrome::{
    EDGE_HIT_PX, GUIDE_HIT_PX, HudDraw, HudPrim, KNOB_HIT_PX, KNOB_VISUAL_PX,
    MIN_HANDLE_SELECTION_PX, ROTATE_HIT_PX, ROTATE_OFFSET_PX, Role, label_number,
};
pub use click::{CLICK_DISTANCE_PX, CLICK_WINDOW_MS};
pub use gesture::{DRAG_THRESHOLD_PX, GUIDE_CREATE_THRESHOLD_PX, resize_rect};
pub use hit::{
    HudAction, PRIORITY_BODY, PRIORITY_CORNER, PRIORITY_EDGE, PRIORITY_GUIDE, PRIORITY_ROTATE,
    PRIORITY_STRIP,
};
pub use vocab::{
    HudCursor, HudEvent, HudResponse, HudScene, Id, Intent, Modifiers, Phase, PointerButton,
    ResizeDirection, RotationCorner, SelectMode, SelectionShape,
};

use math2::transform::AffineTransform;

use chrome::ChromeInput;
use click::ClickTracker;
use gesture::{DragPlan, HudGesture, Pending, ROTATE_SNAP, union_aabb};
use hit::{HitRegistry, HudAction as Action};

/// The HUD machine. See the module docs; construction is cheap and
/// the machine is fully drivable headlessly.
pub struct Hud {
    gesture: HudGesture,
    pending: Option<Pending>,
    hover: Option<Id>,
    cursor: HudCursor,
    modifiers: Modifiers,
    /// Selection mirror — host pushes, no dispatch writes it
    /// (`HUD-3`).
    selection: Vec<Id>,
    /// Guides mirror (`ruler.md` RUL-9): host pushes the document's
    /// guide set; the machine never writes it — a guide drag flows
    /// down as intents and comes back as mirror updates.
    guides: Vec<math2::snap::canvas::Guide>,
    /// Ruler visibility mirror (`RUL-8`): with the ruler off, strips
    /// and guides neither paint nor hit-test.
    ruler: bool,
    /// The canvas viewport's top-left in logical screen px — the
    /// corner of the ruler L (host-pushed; the strips sit at the
    /// *canvas viewport* edges, not the window's, so panels and
    /// strips never overlap). The strip regions and the
    /// delete-by-return zone follow it.
    ruler_origin: [f32; 2],
    /// The guide line the idle pointer is over (from the tier-1 hit
    /// test) — hover emphasis only, never routing state.
    hover_guide: Option<usize>,
    /// Camera: canvas → logical screen.
    view: AffineTransform,
    /// Cached inverse of `view`.
    view_inv: AffineTransform,
    regions: HitRegistry,
    clicks: ClickTracker,
    readonly: bool,
    last_screen: [f32; 2],
}

impl Default for Hud {
    fn default() -> Self {
        Self::new()
    }
}

impl Hud {
    pub fn new() -> Self {
        Self {
            gesture: HudGesture::Idle,
            pending: None,
            hover: None,
            cursor: HudCursor::Default,
            modifiers: Modifiers::default(),
            selection: Vec::new(),
            guides: Vec::new(),
            ruler: false,
            ruler_origin: [0.0, 0.0],
            hover_guide: None,
            view: AffineTransform::identity(),
            view_inv: AffineTransform::identity(),
            regions: HitRegistry::default(),
            clicks: ClickTracker::default(),
            readonly: false,
            last_screen: [0.0, 0.0],
        }
    }

    // ── Mirrors and modes (host pushes; the machine never writes) ──

    /// Push the editor's selection into the mirror (`HUD-3`).
    pub fn set_selection(&mut self, ids: &[Id]) {
        if self.selection != ids {
            self.selection = ids.to_vec();
        }
    }

    /// Push the document's guide set into the mirror (`RUL-9` — the
    /// same shape as the selection mirror: intents up, mirror down).
    pub fn set_guides(&mut self, guides: &[math2::snap::canvas::Guide]) {
        if self.guides != guides {
            self.guides = guides.to_vec();
        }
    }

    /// Push the ruler's visibility (`RUL-8`).
    pub fn set_ruler(&mut self, on: bool) {
        self.ruler = on;
    }

    /// Push the canvas viewport's top-left (logical px) — where the
    /// ruler L sits. The strip regions and the delete-by-return zone
    /// follow it; `[0, 0]` (the default) is a full-window canvas.
    pub fn set_ruler_origin(&mut self, origin: [f32; 2]) {
        self.ruler_origin = origin;
    }

    /// Push the camera transform (canvas → logical screen).
    pub fn set_view(&mut self, view: AffineTransform) {
        self.view_inv = view.inverse().unwrap_or_else(AffineTransform::identity);
        self.view = view;
    }

    pub fn set_readonly(&mut self, readonly: bool) {
        self.readonly = readonly;
    }

    // ── Read-only introspection ─────────────────────────────────────

    pub fn selection(&self) -> &[Id] {
        &self.selection
    }

    pub fn hover(&self) -> Option<&Id> {
        self.hover.as_ref()
    }

    /// The guide the idle pointer is over (hover emphasis).
    pub fn hover_guide(&self) -> Option<usize> {
        self.hover_guide
    }

    /// The guide an active guide gesture is editing (a create drag
    /// resolves to the mirror's last entry — the guide it authored).
    pub fn active_guide(&self) -> Option<usize> {
        match &self.gesture {
            HudGesture::Guide { index, .. } => {
                Some(index.unwrap_or(self.guides.len().saturating_sub(1)))
            }
            _ => None,
        }
    }

    pub fn cursor(&self) -> HudCursor {
        self.cursor
    }

    pub fn gesture_active(&self) -> bool {
        self.gesture.is_active()
    }

    /// The current view transform (for hosts projecting the draw
    /// list).
    pub fn view(&self) -> &AffineTransform {
        &self.view
    }

    /// Tier-1 hit test against the last built chrome (exposed for
    /// conformance tests).
    pub fn hit_test(&self, screen: [f32; 2]) -> Option<HudAction> {
        self.regions.hit_test(screen, &self.view)
    }

    // ── Chrome ──────────────────────────────────────────────────────

    /// Build one frame of chrome: returns the draw list and rebuilds
    /// the hit registry the next pointer-down consults (`HUD-5`,
    /// `HUD-6`).
    pub fn chrome(&mut self, scene: &dyn HudScene) -> HudDraw {
        let active_guide = self.active_guide();
        chrome::build(
            ChromeInput {
                selection: &self.selection,
                hover: self.hover.as_ref(),
                gesture: &self.gesture,
                view: &self.view,
                readonly: self.readonly,
                ruler: self.ruler,
                ruler_origin: self.ruler_origin,
                guides: &self.guides,
                hover_guide: self.hover_guide,
                active_guide,
            },
            scene,
            &mut self.regions,
        )
    }

    // ── Dispatch ────────────────────────────────────────────────────

    /// Dispatch one event. `now_ms` is the injected clock (multi-click
    /// classification stays deterministic under test).
    pub fn dispatch(&mut self, event: HudEvent, scene: &dyn HudScene, now_ms: u64) -> HudResponse {
        match event {
            HudEvent::PointerMove { screen } => self.on_pointer_move(screen, scene),
            HudEvent::PointerDown {
                screen,
                button,
                modifiers,
            } => {
                self.modifiers = modifiers;
                self.on_pointer_down(screen, button, scene, now_ms)
            }
            HudEvent::PointerUp {
                screen,
                button,
                modifiers,
            } => {
                self.modifiers = modifiers;
                self.on_pointer_up(screen, button)
            }
            HudEvent::ModifiersChanged { modifiers } => self.on_modifiers(modifiers),
            HudEvent::Cancel => self.on_cancel(),
        }
    }

    fn to_canvas(&self, screen: [f32; 2]) -> [f32; 2] {
        math2::vector2::transform(screen, &self.view_inv)
    }

    // ── Pointer down: the golden router ─────────────────────────────

    fn on_pointer_down(
        &mut self,
        screen: [f32; 2],
        button: PointerButton,
        scene: &dyn HudScene,
        now_ms: u64,
    ) -> HudResponse {
        let mut response = HudResponse::default();
        // Non-primary buttons are Noop: the host owns pan and context
        // menus.
        if !matches!(button, PointerButton::Primary) {
            return response;
        }
        self.last_screen = screen;
        let canvas = self.to_canvas(screen);
        let clicks = self.clicks.register(screen, now_ms);
        let tier1 = self.regions.hit_test(screen, &self.view);

        // Regions that claim the press outright: real handles and the
        // ruler chrome (a strip press must never dblclick-edit or
        // meta-marquee the content beneath it).
        let claimed = matches!(
            tier1,
            Some(Action::Resize(_))
                | Some(Action::Rotate(_))
                | Some(Action::GuideStrip(_))
                | Some(Action::GuideLine(_))
        );

        // Double-click on content (any tier except a claiming region)
        // commits enter-content-edit immediately on the second down.
        if clicks >= 2
            && !claimed
            && let Some(id) = scene.pick(canvas)
        {
            self.pending = None;
            response.intents.push(Intent::EnterContentEdit { id });
            return response;
        }

        // Meta: a drag region-selects from anywhere except a claiming
        // region — no on-down emit.
        if self.modifiers.meta && clicks < 2 && !claimed {
            self.pending = Some(Pending {
                anchor_screen: screen,
                anchor_canvas: canvas,
                deferred: None,
                drag: DragPlan::Marquee {
                    additive: self.modifiers.shift,
                },
            });
            return response;
        }

        // Tier 1 — overlay routing rules.
        match tier1 {
            Some(Action::Resize(direction)) => {
                // Commit on-down (singleton): the gesture starts; the
                // first intent flows on the first move.
                let shapes: Vec<SelectionShape> = self
                    .selection
                    .iter()
                    .filter_map(|id| scene.shape_of(id))
                    .collect();
                if let Some(initial) = union_aabb(&shapes) {
                    self.gesture = HudGesture::Resize {
                        ids: self.selection.clone(),
                        direction,
                        initial,
                        anchor: canvas,
                        last: canvas,
                        dragged: false,
                    };
                    response.needs_redraw = true;
                }
                return response;
            }
            Some(Action::Rotate(corner)) => {
                let shapes: Vec<SelectionShape> = self
                    .selection
                    .iter()
                    .filter_map(|id| scene.shape_of(id))
                    .collect();
                if let Some(union) = union_aabb(&shapes) {
                    let center = union.center();
                    let angle = (canvas[1] - center[1]).atan2(canvas[0] - center[0]);
                    self.gesture = HudGesture::Rotate {
                        ids: self.selection.clone(),
                        corner,
                        center,
                        anchor_angle: angle,
                        last_angle: angle,
                        dragged: false,
                    };
                    response.needs_redraw = true;
                }
                return response;
            }
            Some(Action::GuideStrip(axis)) => {
                // A strip press never selects and never edits on
                // click (RUL-5): it only arms the create drag.
                self.pending = Some(Pending {
                    anchor_screen: screen,
                    anchor_canvas: canvas,
                    deferred: None,
                    drag: if self.readonly {
                        DragPlan::None
                    } else {
                        DragPlan::GuideNew { axis }
                    },
                });
                return response;
            }
            Some(Action::GuideLine(index)) => {
                // A guide press arms the move drag; a click is a
                // no-op (guide focus is named deferred in ruler.md).
                let axis = self.guides.get(index).map(|g| g.axis);
                self.pending = Some(Pending {
                    anchor_screen: screen,
                    anchor_canvas: canvas,
                    deferred: None,
                    drag: match axis {
                        Some(axis) if !self.readonly => DragPlan::GuideMove { axis, index },
                        _ => DragPlan::None,
                    },
                });
                return response;
            }
            Some(Action::Body) => {
                // The body always defers: pointer-up resolves the
                // click, drag translates the existing selection.
                let pick = scene.pick(canvas);
                let deferred = pick.map(|id| {
                    let mode = if self.modifiers.shift {
                        SelectMode::Toggle
                    } else {
                        SelectMode::Replace
                    };
                    (vec![id], mode)
                });
                self.pending = Some(Pending {
                    anchor_screen: screen,
                    anchor_canvas: canvas,
                    deferred,
                    drag: if self.readonly {
                        DragPlan::None
                    } else {
                        DragPlan::Translate {
                            ids: self.selection.clone(),
                        }
                    },
                });
                return response;
            }
            None => {}
        }

        // Tier 2 — scene-pick fallback.
        match scene.pick(canvas) {
            Some(id) if !self.selection.contains(&id) => {
                // Would-select: singleton, commit on-down; a drag
                // translates the effective set.
                let mode = if self.modifiers.shift {
                    SelectMode::Toggle
                } else {
                    SelectMode::Replace
                };
                let effective = if self.modifiers.shift {
                    let mut ids = self.selection.clone();
                    ids.push(id.clone());
                    ids
                } else {
                    vec![id.clone()]
                };
                response.intents.push(Intent::Select {
                    ids: vec![id],
                    mode,
                });
                self.pending = Some(Pending {
                    anchor_screen: screen,
                    anchor_canvas: canvas,
                    deferred: None,
                    drag: if self.readonly {
                        DragPlan::None
                    } else {
                        DragPlan::Translate { ids: effective }
                    },
                });
            }
            Some(id) => {
                // Would-deselect: always ambiguous, always defer.
                let mode = if self.modifiers.shift {
                    SelectMode::Toggle
                } else {
                    SelectMode::Replace
                };
                self.pending = Some(Pending {
                    anchor_screen: screen,
                    anchor_canvas: canvas,
                    deferred: Some((vec![id], mode)),
                    drag: if self.readonly {
                        DragPlan::None
                    } else {
                        DragPlan::Translate {
                            ids: self.selection.clone(),
                        }
                    },
                });
            }
            None => {
                // Empty space: deselect commits on-down (unless
                // shift), then a drag marquees.
                if !self.modifiers.shift && !self.selection.is_empty() {
                    response.intents.push(Intent::DeselectAll);
                }
                self.pending = Some(Pending {
                    anchor_screen: screen,
                    anchor_canvas: canvas,
                    deferred: None,
                    drag: DragPlan::Marquee {
                        additive: self.modifiers.shift,
                    },
                });
            }
        }
        response
    }

    // ── Pointer move: hover, cursor, discriminator, previews ────────

    fn on_pointer_move(&mut self, screen: [f32; 2], scene: &dyn HudScene) -> HudResponse {
        let mut response = HudResponse::default();
        self.last_screen = screen;
        let canvas = self.to_canvas(screen);

        // Promote a pending press past the threshold — cancelling any
        // deferred select (the single cancellation path). Guide
        // creation uses its own, slightly fatter threshold (RUL-5).
        if let Some(pending) = &self.pending {
            let dx = screen[0] - pending.anchor_screen[0];
            let dy = screen[1] - pending.anchor_screen[1];
            let threshold = match &pending.drag {
                DragPlan::GuideNew { .. } => GUIDE_CREATE_THRESHOLD_PX,
                _ => DRAG_THRESHOLD_PX,
            };
            if (dx * dx + dy * dy).sqrt() >= threshold {
                let pending = self.pending.take().expect("pending checked above");
                match pending.drag {
                    DragPlan::Translate { ids } if !ids.is_empty() => {
                        self.gesture = HudGesture::Translate {
                            ids,
                            anchor: pending.anchor_canvas,
                            last: canvas,
                        };
                    }
                    DragPlan::Marquee { additive } => {
                        self.gesture = HudGesture::Marquee {
                            anchor: pending.anchor_canvas,
                            current: canvas,
                            additive,
                        };
                    }
                    DragPlan::GuideNew { axis } => {
                        self.gesture = HudGesture::Guide { axis, index: None };
                    }
                    DragPlan::GuideMove { axis, index } => {
                        self.gesture = HudGesture::Guide {
                            axis,
                            index: Some(index),
                        };
                    }
                    _ => {}
                }
                response.needs_redraw = true;
            }
        }

        // Gesture previews. The cursor reflects the gesture while one
        // runs; guide hover-emphasis is idle-only.
        if self.gesture.is_active() {
            if self.hover_guide.is_some() {
                self.hover_guide = None;
            }
            let cursor = match &self.gesture {
                HudGesture::Translate { .. } => HudCursor::Move,
                HudGesture::Resize { direction, .. } => HudCursor::Resize(*direction),
                HudGesture::Rotate { corner, .. } => HudCursor::Rotate(*corner),
                HudGesture::Guide { axis, .. } => HudCursor::Guide(*axis),
                _ => HudCursor::Default,
            };
            if cursor != self.cursor {
                self.cursor = cursor;
                response.cursor_changed = true;
            }
            if let Some(intent) = self.gesture_preview(canvas, Phase::Preview) {
                response.intents.push(intent);
            }
            response.needs_redraw = true;
            return response;
        }

        // Idle / pending: hover reflects pick on every move,
        // regardless of overlays (`HUD-8`).
        let hover = scene.pick(canvas);
        if hover != self.hover {
            self.hover = hover;
            response.hover_changed = true;
            response.needs_redraw = true;
        }

        // Cursor reflects what pointer-down would do; the guide-line
        // hit doubles as the hover-emphasis state.
        let tier1 = self.regions.hit_test(screen, &self.view);
        let hover_guide = match tier1 {
            Some(Action::GuideLine(index)) => Some(index),
            _ => None,
        };
        if hover_guide != self.hover_guide {
            self.hover_guide = hover_guide;
            response.needs_redraw = true;
        }
        let cursor = match tier1 {
            Some(Action::Resize(dir)) => HudCursor::Resize(dir),
            Some(Action::Rotate(corner)) => HudCursor::Rotate(corner),
            Some(Action::GuideStrip(axis)) => HudCursor::Guide(axis),
            Some(Action::GuideLine(index)) => self
                .guides
                .get(index)
                .map_or(HudCursor::Default, |g| HudCursor::Guide(g.axis)),
            Some(Action::Body) => HudCursor::Move,
            None => match &self.hover {
                Some(id) if self.selection.contains(id) => HudCursor::Move,
                Some(_) => HudCursor::Pointer,
                None => HudCursor::Default,
            },
        };
        if cursor != self.cursor {
            self.cursor = cursor;
            response.cursor_changed = true;
        }
        response
    }

    /// The active gesture's intent at the current pointer, applying
    /// live modifiers (axis lock, aspect lock, from-center, 15° snap —
    /// `SURF-4`).
    fn gesture_preview(&mut self, canvas: [f32; 2], phase: Phase) -> Option<Intent> {
        match &mut self.gesture {
            HudGesture::Idle => None,
            HudGesture::Marquee {
                anchor,
                current,
                additive,
            } => {
                *current = canvas;
                Some(Intent::Marquee {
                    rect: math2::rect::Rectangle::from_points(&[*anchor, *current]),
                    additive: *additive,
                    phase,
                })
            }
            HudGesture::Translate { ids, anchor, last } => {
                *last = canvas;
                let mut dx = canvas[0] - anchor[0];
                let mut dy = canvas[1] - anchor[1];
                let mut axis_lock = None;
                if self.modifiers.shift {
                    // Axis lock to the dominant axis; the lock is
                    // named in the intent so interpretation leaves
                    // the frozen axis alone (snap.md's pipeline).
                    if dx.abs() >= dy.abs() {
                        dy = 0.0;
                        axis_lock = Some(math2::vector2::Axis::X);
                    } else {
                        dx = 0.0;
                        axis_lock = Some(math2::vector2::Axis::Y);
                    }
                }
                Some(Intent::Translate {
                    ids: ids.clone(),
                    dx,
                    dy,
                    axis_lock,
                    // Raw pointer + the clone modifier's live state:
                    // the structural behaviors (translate.md) are
                    // interpretation's; a `ModifiersChanged` re-emit
                    // carries the flip without pointer movement
                    // (`TRL-1`, `SURF-4`).
                    pointer: canvas,
                    clone: self.modifiers.alt,
                    phase,
                })
            }
            HudGesture::Resize {
                ids,
                direction,
                initial,
                anchor,
                last,
                dragged,
            } => {
                *last = canvas;
                *dragged = true;
                let delta = [canvas[0] - anchor[0], canvas[1] - anchor[1]];
                let rect = gesture::resize_rect(
                    initial,
                    *direction,
                    delta,
                    self.modifiers.alt,
                    self.modifiers.shift,
                );
                Some(Intent::Resize {
                    ids: ids.clone(),
                    anchor: *direction,
                    shape: SelectionShape::Rect(rect),
                    phase,
                })
            }
            HudGesture::Guide { axis, index } => {
                // The offset is the pointer's canvas coordinate on
                // the guide's axis — raw; snap + quantize are
                // interpretation (RUL-6). on_strip: whether the
                // pointer sits on the authoring strip — the
                // counter-axis strip (RUL-10), tested in screen
                // space against the strip width.
                let (axis, index) = (*axis, *index);
                let offset = match axis {
                    math2::vector2::Axis::X => canvas[0],
                    math2::vector2::Axis::Y => canvas[1],
                };
                let on_strip = match axis {
                    math2::vector2::Axis::X => {
                        self.last_screen[0] <= self.ruler_origin[0] + crate::ruler::STRIP_PX
                    }
                    math2::vector2::Axis::Y => {
                        self.last_screen[1] <= self.ruler_origin[1] + crate::ruler::STRIP_PX
                    }
                };
                Some(Intent::Guide {
                    axis,
                    index,
                    offset,
                    on_strip,
                    phase,
                })
            }
            HudGesture::Rotate {
                ids,
                center,
                anchor_angle,
                last_angle,
                dragged,
                ..
            } => {
                let raw = (canvas[1] - center[1]).atan2(canvas[0] - center[0]) - *anchor_angle;
                let angle = if self.modifiers.shift {
                    (raw / ROTATE_SNAP).round() * ROTATE_SNAP
                } else {
                    raw
                };
                *last_angle = *anchor_angle + angle;
                *dragged = true;
                Some(Intent::Rotate {
                    ids: ids.clone(),
                    angle,
                    phase,
                })
            }
        }
    }

    // ── Pointer up: deferred clicks and gesture commits ─────────────

    fn on_pointer_up(&mut self, screen: [f32; 2], button: PointerButton) -> HudResponse {
        let mut response = HudResponse::default();
        if !matches!(button, PointerButton::Primary) {
            return response;
        }
        // The guide commit's on-strip test reads the release point.
        self.last_screen = screen;
        let canvas = self.to_canvas(screen);

        // Pending, never promoted: the click. Emit the deferred
        // select, if any.
        if let Some(pending) = self.pending.take()
            && let Some((ids, mode)) = pending.deferred
        {
            response.intents.push(Intent::Select { ids, mode });
        }

        // Active gesture: exactly one commit — except a click-no-drag
        // on an eagerly started handle gesture, which emits nothing.
        if self.gesture.is_active() {
            let emit = match &self.gesture {
                HudGesture::Resize { dragged, .. } | HudGesture::Rotate { dragged, .. } => *dragged,
                _ => true,
            };
            if emit && let Some(intent) = self.gesture_preview(canvas, Phase::Commit) {
                response.intents.push(intent);
            }
            self.gesture = HudGesture::Idle;
            response.needs_redraw = true;
        }
        response
    }

    // ── Modifiers, cancel ───────────────────────────────────────────

    fn on_modifiers(&mut self, modifiers: Modifiers) -> HudResponse {
        let mut response = HudResponse::default();
        if modifiers == self.modifiers {
            return response;
        }
        self.modifiers = modifiers;
        // Live reconfiguration: re-derive the active preview within
        // this event (`SURF-4`).
        if self.gesture.is_active() {
            let canvas = self.to_canvas(self.last_screen);
            if let Some(intent) = self.gesture_preview(canvas, Phase::Preview) {
                response.intents.push(intent);
            }
            response.needs_redraw = true;
        }
        response
    }

    fn on_cancel(&mut self) -> HudResponse {
        let mut response = HudResponse::default();
        self.pending = None;
        if self.gesture.is_active() {
            self.gesture = HudGesture::Idle;
            response.intents.push(Intent::Cancel);
            response.needs_redraw = true;
        }
        response
    }
}
