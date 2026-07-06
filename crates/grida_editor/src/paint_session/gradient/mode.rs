//! The gradient session's stateful machine — the wired consumer on top
//! of the pure core ([`super::frame`]/[`super::ops`]/[`super::hit`]/
//! [`super::chrome`]). Mirrors the vector edit mode: enter snapshots,
//! reconcile revalidates, exit is residue-free; a drag frames one
//! history entry (`begin_gesture` → silent preview patches →
//! `commit_gesture`).
//!
//! Everything the surface edits — the user transform and the stops —
//! is written back as a whole-paint-list patch (`PropPatch.fills` /
//! `.strokes`, replace-and-invert), the same shape the properties panel
//! writes, so a session and a panel are two views of one state
//! (`PSES-1`).

use std::collections::BTreeSet;

use grida::cg::prelude::{GradientStop, Paint, Paints};
use math2::transform::AffineTransform;
use math2::vector2::{self, Vector2};

use crate::document::{Id, Mutation, PropPatch};
use crate::editor::{Editor, Recording};
use crate::history::Origin;
use crate::hud::{CLICK_DISTANCE_PX, CLICK_WINDOW_MS, HudDraw};

use super::chrome::{self, GradientChrome};
use super::frame::{self, Frame, FramePoint, GradientType};
use super::hit::{self, Control};
use super::ops;

/// Which paint list a session edits (`PSES-4` subject address).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PaintTarget {
    Fill,
    Stroke,
}

/// A gradient paint's editable value — its user transform and stops.
#[derive(Debug, Clone)]
struct GradientValue {
    transform: AffineTransform,
    stops: Vec<GradientStop>,
}

/// The interaction phase of the session.
enum Phase {
    Idle,
    /// A frame handle is being dragged; `base` is the value at press.
    DragHandle {
        which: FramePoint,
        base: GradientValue,
    },
    /// A stop is being dragged; `base` is the value at press.
    DragStop {
        index: usize,
        base: GradientValue,
    },
}

impl Phase {
    fn is_dragging(&self) -> bool {
        !matches!(self, Phase::Idle)
    }
}

/// The result of a pointer event — whether the session asks to end.
#[derive(Debug, Clone, Copy, Default)]
pub struct GradOutcome {
    pub exit_requested: bool,
}

/// The gradient paint session (`docs/wg/canvas/paint-session/gradient.md`).
pub struct GradientSession {
    node: Id,
    target: PaintTarget,
    index: usize,
    ty: GradientType,
    /// The value at entry — for the untouched-exit check.
    snapshot: GradientValue,
    entry_depth: usize,
    /// The paint-list length at entry. The session is pinned by index,
    /// not a stable paint id, so a length change means a paint was
    /// inserted/removed and `index` may now address a different paint —
    /// the session ends rather than editing the neighbor (`PSES-4`).
    entry_paint_len: usize,
    /// Selected stop indices; the panel color control edits these.
    selected: BTreeSet<usize>,
    hover: Option<Control>,
    phase: Phase,
    /// The last empty-canvas press (clock, screen point) — the
    /// double-click-to-exit detector, the enter idiom's inverse (mirrors
    /// the vector mode's `VEC-13`; here it exits like Escape).
    last_empty_down: Option<(u64, [f32; 2])>,
}

impl GradientSession {
    // -- lifecycle -------------------------------------------------------------

    /// Enter on the gradient paint at `(node, target, index)`. `None`
    /// when the address does not resolve to a gradient (`PSES-4`).
    /// Entry mutates nothing — it snapshots.
    pub fn enter(editor: &Editor, node: Id, target: PaintTarget, index: usize) -> Option<Self> {
        let paints = read_paints(editor, &node, target)?;
        let (ty, transform, stops) = gradient_of(paints.as_slice().get(index)?)?;
        Some(Self {
            node,
            target,
            index,
            ty,
            snapshot: GradientValue {
                transform,
                stops: stops.to_vec(),
            },
            entry_depth: editor.history_len(),
            entry_paint_len: paints.as_slice().len(),
            selected: BTreeSet::new(),
            hover: None,
            phase: Phase::Idle,
            last_empty_down: None,
        })
    }

    /// `MODE-6`/`PSES-4`: whether the session may continue. False when
    /// undo crossed the entry, the subject is gone, or the paint was
    /// retyped away from a gradient (the retype/removal that ends the
    /// session, `MODE-5`). On true, the live gradient **kind** is adopted
    /// (the panel may have switched it under the session — the chrome and
    /// the pointer math must track it) and stale stop selection is
    /// trimmed.
    pub fn reconcile(&mut self, editor: &Editor) -> bool {
        if editor.history_len() < self.entry_depth {
            return false;
        }
        let Some(paints) = read_paints(editor, &self.node, self.target) else {
            return false;
        };
        // A paint was inserted/removed: the index no longer reliably
        // addresses the pinned paint (a neighbor may have shifted into
        // it), so the session ends (`PSES-4`).
        if paints.as_slice().len() != self.entry_paint_len {
            return false;
        }
        let Some((ty, _, stops)) = paints.as_slice().get(self.index).and_then(gradient_of) else {
            return false;
        };
        self.ty = ty;
        self.selected.retain(|i| *i < stops.len());
        // Note: `hover` is transient interaction state (re-derived each
        // cursor-move, cleared when the pointer leaves the track). It is
        // deliberately NOT cleared here — reconcile runs every frame, so
        // clearing it would wipe the live hover before the chrome draws
        // (and with it the insertion preview).
        true
    }

    /// Exit: residue-free. A paint session has no cleanup doctrine — its
    /// edits committed as they happened — so exit only aborts any
    /// in-flight gesture. An untouched subject leaves no trace by
    /// construction (nothing was dispatched).
    pub fn exit(self, editor: &mut Editor) {
        if self.phase.is_dragging() {
            editor.abort_gesture();
        }
    }

    /// Whether an untouched session (`PSES`): the paint still equals the
    /// entry snapshot. Advisory — used by tests.
    pub fn is_untouched(&self, editor: &Editor) -> bool {
        self.read_value(editor)
            .map(|v| v.transform == self.snapshot.transform && v.stops == self.snapshot.stops)
            .unwrap_or(false)
    }

    // -- accessors -------------------------------------------------------------

    pub fn node(&self) -> &Id {
        &self.node
    }
    pub fn target(&self) -> PaintTarget {
        self.target
    }
    pub fn index(&self) -> usize {
        self.index
    }
    /// Whether this session edits the paint at `(node, target, index)`
    /// — the panel's Edit-toggle uses it to reflect the open state.
    pub fn edits(&self, node: &Id, target: PaintTarget, index: usize) -> bool {
        self.node == *node && self.target == target && self.index == index
    }
    /// The selected stop indices (the panel color control's subject).
    pub fn selected(&self) -> &BTreeSet<usize> {
        &self.selected
    }

    // -- pointer ---------------------------------------------------------------

    /// Pointer down: act on the pressed control. A handle or a stop
    /// opens a drag gesture; the track inserts a stop; empty space
    /// deselects — and a **double-click on empty canvas requests exit**,
    /// the enter idiom's inverse (like Escape; `now_ms` is the injected
    /// clock, `screen` measures the double-click distance).
    pub fn pointer_down(
        &mut self,
        editor: &mut Editor,
        canvas: [f32; 2],
        screen: [f32; 2],
        zoom: f32,
        now_ms: u64,
    ) -> GradOutcome {
        self.hover = self.resolve_hover(editor, canvas, zoom);
        // Any press on a control resets the empty double-click sequence.
        if self.hover.is_some() {
            self.last_empty_down = None;
        }
        match self.hover {
            Some(Control::Frame(which)) => {
                if let Some(base) = self.read_value(editor) {
                    editor.begin_gesture();
                    self.phase = Phase::DragHandle { which, base };
                }
            }
            Some(Control::Stop(index)) => {
                self.selected = [index].into_iter().collect();
                if let Some(base) = self.read_value(editor) {
                    editor.begin_gesture();
                    self.phase = Phase::DragStop { index, base };
                }
            }
            Some(Control::Track(offset)) => {
                self.insert_stop(editor, offset);
            }
            None => {
                self.selected.clear();
                if let Some((t, p)) = self.last_empty_down
                    && now_ms.saturating_sub(t) <= CLICK_WINDOW_MS
                    && vector2::distance(screen, p) <= CLICK_DISTANCE_PX
                {
                    self.last_empty_down = None;
                    return GradOutcome {
                        exit_requested: true,
                    };
                }
                self.last_empty_down = Some((now_ms, screen));
            }
        }
        GradOutcome::default()
    }

    /// Pointer move: preview a drag (silent patch), or re-resolve hover.
    /// Unlike [`pointer_down`](Self::pointer_down) this takes no `screen`
    /// / `now_ms`: the double-click-to-exit detector only fires on an
    /// empty press, never mid-move, so a move needs only the canvas point.
    pub fn pointer_move(
        &mut self,
        editor: &mut Editor,
        canvas: [f32; 2],
        zoom: f32,
    ) -> GradOutcome {
        enum Do {
            Hover,
            Handle(FramePoint, GradientValue),
            Stop(usize, GradientValue),
        }
        let action = match &self.phase {
            Phase::Idle => Do::Hover,
            Phase::DragHandle { which, base } => Do::Handle(*which, base.clone()),
            Phase::DragStop { index, base } => Do::Stop(*index, base.clone()),
        };
        match action {
            Do::Hover => self.hover = self.resolve_hover(editor, canvas, zoom),
            Do::Handle(which, base) => self.drag_handle(editor, which, &base, canvas),
            Do::Stop(index, base) => self.drag_stop(editor, index, &base, canvas),
        }
        GradOutcome::default()
    }

    /// Pointer up: land a drag as one history entry, then re-resolve
    /// hover at the release point.
    pub fn pointer_up(&mut self, editor: &mut Editor, canvas: [f32; 2], zoom: f32) -> GradOutcome {
        let label = match &self.phase {
            Phase::DragHandle { .. } => Some("gradient.transform"),
            Phase::DragStop { .. } => Some("gradient.stop.move"),
            Phase::Idle => None,
        };
        if let Some(label) = label {
            editor.commit_gesture(Some(label.to_string()));
            self.phase = Phase::Idle;
            self.hover = self.resolve_hover(editor, canvas, zoom);
        }
        GradOutcome::default()
    }

    /// Delete the selected stop (`GRAD-6`: refused below two). One
    /// entry. Returns whether a stop was removed.
    pub fn delete_selected(&mut self, editor: &mut Editor) -> bool {
        let Some(&i) = self.selected.iter().next() else {
            return false;
        };
        let Some(value) = self.read_value(editor) else {
            return false;
        };
        let mut stops = value.stops;
        if !ops::remove_stop(&mut stops, i) {
            return false;
        }
        self.write(
            editor,
            value.transform,
            stops,
            Recording::Record {
                label: Some("gradient.stop.delete".to_string()),
            },
        );
        self.selected.clear();
        true
    }

    // -- chrome ----------------------------------------------------------------

    /// Build one frame of the session's chrome from the live paint value
    /// (which carries any in-flight drag preview) and the session's own
    /// selection/hover. `zoom` sizes the screen-fixed chip offset.
    pub fn chrome(&self, editor: &Editor, zoom: f32) -> Option<HudDraw> {
        let unit_to_canvas = self.unit_to_canvas(editor)?;
        let value = self.read_value(editor)?;
        let frame = frame::frame_from_transform(self.ty, &value.transform);
        Some(chrome::build(GradientChrome {
            ty: self.ty,
            frame: &frame,
            stops: &value.stops,
            selected: &self.selected,
            hover: self.hover,
            unit_to_canvas,
            zoom,
        }))
    }

    // -- gesture bodies --------------------------------------------------------

    /// Drag a control-point handle. The math runs in **node-local pixel
    /// space** (unit × node size), so the perpendicular relationships are
    /// aspect-correct on a non-square node — the production model.
    ///
    /// - **Linear**: the two endpoints move freely and independently
    ///   (the dragged point follows the cursor; the other stays).
    /// - **Elliptical** (radial/sweep/diamond) — the `{origin=center,
    ///   primary=major-endpoint, secondary=minor-endpoint}` frame:
    ///   dragging the center moves it and holds the major endpoint, the
    ///   major endpoint moves freely (rotate + scale) and holds the
    ///   center, and either re-derives the minor perpendicular (length
    ///   scaled by the major-length change); the minor endpoint slides
    ///   along the perpendicular through the center (one direction).
    fn drag_handle(
        &mut self,
        editor: &mut Editor,
        which: FramePoint,
        base: &GradientValue,
        canvas: [f32; 2],
    ) {
        let Some((w, h)) = editor.node_size(&self.node) else {
            return;
        };
        if w.abs() < f32::EPSILON || h.abs() < f32::EPSILON {
            return;
        }
        let Some(inv) = editor.node_world_transform(&self.node).inverse() else {
            return;
        };
        let cursor = vector2::transform(canvas, &inv); // node-local pixels
        let base_fr = frame::frame_from_transform(self.ty, &base.transform);
        let to_local = |u: Vector2| [u[0] * w, u[1] * h];
        let to_unit = |l: Vector2| [l[0] / w, l[1] / h];
        let o = to_local(base_fr.origin);
        let p = to_local(base_fr.primary);

        let (no, np, ns): (Vector2, Vector2, Option<Vector2>) = if !self.ty.has_secondary() {
            // Linear: independent free endpoints.
            match which {
                FramePoint::Origin => (cursor, p, None),
                _ => (o, cursor, None),
            }
        } else {
            let s = base_fr.secondary.map(to_local).unwrap_or(p);
            match which {
                // Center free; major endpoint held; minor re-derived.
                FramePoint::Origin => (cursor, p, Some(frame::rederive_minor(cursor, p, o, p, s))),
                // Major endpoint free (rotate + scale); center held.
                FramePoint::Primary => (o, cursor, Some(frame::rederive_minor(o, cursor, o, p, s))),
                // Minor endpoint: one direction (⟂ through the center).
                FramePoint::Secondary => (o, p, Some(frame::constrain_secondary(o, p, cursor))),
            }
        };
        let fr = Frame {
            origin: to_unit(no),
            primary: to_unit(np),
            secondary: ns.map(to_unit),
        };
        let transform = frame::transform_from_frame(self.ty, &fr);
        self.write(editor, transform, base.stops.clone(), Recording::Silent);
    }

    fn drag_stop(
        &mut self,
        editor: &mut Editor,
        index: usize,
        base: &GradientValue,
        canvas: [f32; 2],
    ) {
        let Some(unit) = self.canvas_to_unit(editor, canvas) else {
            return;
        };
        let fr = frame::frame_from_transform(self.ty, &base.transform);
        let offset = ops::point_to_offset(self.ty, &fr, unit);
        // The grabbed stop's identity is `base.stops[index]` — `index` is
        // its position in the **frozen** base and is fixed for the whole
        // drag, so the same stop moves even after it crosses a neighbor.
        // The list stays sorted (`move_stop` re-inserts in order); only
        // the *selection* follows the stop to its live sorted position.
        // Re-anchoring `index` to that position would grab a different
        // stop after a cross — the bug this avoids. `phase` is unchanged
        // (index + base are constant), so it is not reassigned.
        let mut stops = base.stops.clone();
        let live_index = ops::move_stop(&mut stops, index, offset);
        self.selected = [live_index].into_iter().collect();
        self.write(editor, base.transform, stops, Recording::Silent);
    }

    fn insert_stop(&mut self, editor: &mut Editor, offset: f32) {
        let Some(value) = self.read_value(editor) else {
            return;
        };
        let mut stops = value.stops;
        let color = ops::color_at(&stops, offset);
        let new_index = ops::insert_stop(&mut stops, offset, color);
        self.write(
            editor,
            value.transform,
            stops,
            Recording::Record {
                label: Some("gradient.stop.insert".to_string()),
            },
        );
        self.selected = [new_index].into_iter().collect();
    }

    // -- geometry + io ---------------------------------------------------------

    /// Unit gradient space → canvas: `node_world × scale(w, h)`.
    fn unit_to_canvas(&self, editor: &Editor) -> Option<AffineTransform> {
        let (w, h) = editor.node_size(&self.node)?;
        if w.abs() < f32::EPSILON || h.abs() < f32::EPSILON {
            return None;
        }
        let world = editor.node_world_transform(&self.node);
        Some(world.compose(&AffineTransform::from_acebdf(w, 0.0, 0.0, 0.0, h, 0.0)))
    }

    fn canvas_to_unit(&self, editor: &Editor, canvas: [f32; 2]) -> Option<Vector2> {
        let inv = self.unit_to_canvas(editor)?.inverse()?;
        Some(vector2::transform(canvas, &inv))
    }

    fn resolve_hover(&self, editor: &Editor, canvas: [f32; 2], zoom: f32) -> Option<Control> {
        let unit_to_canvas = self.unit_to_canvas(editor)?;
        let inv = unit_to_canvas.inverse()?;
        let value = self.read_value(editor)?;
        let fr = frame::frame_from_transform(self.ty, &value.transform);
        let proj = |p: Vector2| vector2::transform(p, &unit_to_canvas);
        let origin = proj(fr.origin);
        let canvas_frame = Frame {
            origin,
            primary: proj(fr.primary),
            secondary: fr.secondary.map(proj),
        };
        // The stops are hit at their floated **chip** anchors — the same
        // point the chrome draws them at — so a chip is clicked where it
        // shows, never under a handle.
        let canvas_stops: Vec<[f32; 2]> = value
            .stops
            .iter()
            .map(|s| {
                let on_track = proj(ops::offset_to_point(self.ty, &fr, s.offset));
                let tangent = vector2::transform_direction(
                    ops::tangent_at(self.ty, &fr, s.offset),
                    &unit_to_canvas,
                );
                chrome::chip_center(self.ty, on_track, tangent, origin, zoom)
            })
            .collect();
        // The track insertion candidate: the cursor projected onto the ramp.
        let unit_cursor = vector2::transform(canvas, &inv);
        let offset = ops::point_to_offset(self.ty, &fr, unit_cursor);
        let track = (offset, proj(ops::offset_to_point(self.ty, &fr, offset)));
        hit::hover(&canvas_frame, &canvas_stops, Some(track), canvas, zoom)
    }

    fn read_value(&self, editor: &Editor) -> Option<GradientValue> {
        let paints = read_paints(editor, &self.node, self.target)?;
        let (_, transform, stops) = gradient_of(paints.as_slice().get(self.index)?)?;
        Some(GradientValue {
            transform,
            stops: stops.to_vec(),
        })
    }

    /// Write the gradient's transform + stops back through the paint
    /// list (replace-and-invert; `PSES-1`).
    fn write(
        &self,
        editor: &mut Editor,
        transform: AffineTransform,
        stops: Vec<GradientStop>,
        recording: Recording,
    ) {
        let Some(mut paints) = read_paints(editor, &self.node, self.target) else {
            return;
        };
        let Some(paint) = paints.as_mut_slice().get_mut(self.index) else {
            return;
        };
        if !set_gradient(paint, transform, stops) {
            return;
        }
        let set = match self.target {
            PaintTarget::Fill => PropPatch {
                fills: Some(paints),
                ..Default::default()
            },
            PaintTarget::Stroke => PropPatch {
                strokes: Some(paints),
                ..Default::default()
            },
        };
        let _ = editor.dispatch(
            vec![Mutation::Patch {
                id: self.node.clone(),
                set: Box::new(set),
            }],
            Origin::Local,
            recording,
        );
    }
}

/// Read the target paint list from the node.
fn read_paints(editor: &Editor, node: &Id, target: PaintTarget) -> Option<Paints> {
    match target {
        PaintTarget::Fill => editor.node_fills(node),
        PaintTarget::Stroke => editor.node_strokes(node),
    }
}

/// The gradient type, transform, and stops of a paint, if it is a
/// gradient.
fn gradient_of(paint: &Paint) -> Option<(GradientType, AffineTransform, &[GradientStop])> {
    match paint {
        Paint::LinearGradient(g) => Some((GradientType::Linear, g.transform, &g.stops)),
        Paint::RadialGradient(g) => Some((GradientType::Radial, g.transform, &g.stops)),
        Paint::SweepGradient(g) => Some((GradientType::Sweep, g.transform, &g.stops)),
        Paint::DiamondGradient(g) => Some((GradientType::Diamond, g.transform, &g.stops)),
        _ => None,
    }
}

/// Whether a paint is a gradient — the panel's Edit-button gate.
pub fn is_gradient(paint: &Paint) -> bool {
    matches!(
        paint,
        Paint::LinearGradient(_)
            | Paint::RadialGradient(_)
            | Paint::SweepGradient(_)
            | Paint::DiamondGradient(_)
    )
}

/// A gradient paint's stops, read-only, if it is a gradient.
pub fn stops_of(paint: &Paint) -> Option<&[GradientStop]> {
    gradient_of(paint).map(|(_, _, stops)| stops)
}

/// A gradient paint's stops, mutably, if it is a gradient.
fn gradient_stops_mut(paint: &mut Paint) -> Option<&mut Vec<GradientStop>> {
    match paint {
        Paint::LinearGradient(g) => Some(&mut g.stops),
        Paint::RadialGradient(g) => Some(&mut g.stops),
        Paint::SweepGradient(g) => Some(&mut g.stops),
        Paint::DiamondGradient(g) => Some(&mut g.stops),
        _ => None,
    }
}

/// Apply `edit` to the gradient paint's stops at `(node, target,
/// index)`, recording one history entry. The panel's write path — a
/// session and the panel edit one state through the same replace-and-
/// invert patch (`PSES-1`). No-op if the address is not a gradient.
pub fn edit_stops(
    editor: &mut Editor,
    node: &Id,
    target: PaintTarget,
    index: usize,
    label: &str,
    edit: impl FnOnce(&mut Vec<GradientStop>),
) {
    let Some(mut paints) = read_paints(editor, node, target) else {
        return;
    };
    let Some(paint) = paints.as_mut_slice().get_mut(index) else {
        return;
    };
    let Some(stops) = gradient_stops_mut(paint) else {
        return;
    };
    edit(stops);
    let set = match target {
        PaintTarget::Fill => PropPatch {
            fills: Some(paints),
            ..Default::default()
        },
        PaintTarget::Stroke => PropPatch {
            strokes: Some(paints),
            ..Default::default()
        },
    };
    let _ = editor.dispatch(
        vec![Mutation::Patch {
            id: node.clone(),
            set: Box::new(set),
        }],
        Origin::Local,
        Recording::Record {
            label: Some(label.to_string()),
        },
    );
}

/// Set a gradient paint's transform + stops in place. Returns false for
/// a non-gradient paint.
fn set_gradient(paint: &mut Paint, transform: AffineTransform, stops: Vec<GradientStop>) -> bool {
    match paint {
        Paint::LinearGradient(g) => {
            g.transform = transform;
            g.stops = stops;
        }
        Paint::RadialGradient(g) => {
            g.transform = transform;
            g.stops = stops;
        }
        Paint::SweepGradient(g) => {
            g.transform = transform;
            g.stops = stops;
        }
        Paint::DiamondGradient(g) => {
            g.transform = transform;
            g.stops = stops;
        }
        _ => return false,
    }
    true
}
