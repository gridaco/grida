//! The vector mode machine — the edit-mode slot's vector member
//! (`vector-edit.md` `VEC-*`; the slot itself is [`crate::mode`]).
//!
//! [`VectorMode`] is this capture layer's **meaning-owner**: it
//! consumes normalized pointer/key events while the mode is active
//! (the shell routes them here above the tool machine and the HUD,
//! the same pattern as [`crate::tool::ToolMachine`]) and dispatches
//! document mutations through the editor inside gesture frames. It is
//! headless — every `VEC-*` contract is drivable with synthetic
//! events and no renderer. There is deliberately **no intent enum**
//! between resolution and application: the document-level HUD seam
//! earns that split by keeping the HUD document-free, but vector
//! editing's "scene" *is* the edited content — one machine, with the
//! pure math factored into [`super::ops`] and [`super::hit`].
//!
//! ## Coordinate spaces
//!
//! Pointer events arrive in **canvas** space plus the camera zoom;
//! the machine converts to the node's local space through the node's
//! transform (translation + rotation), and converts refit deltas back
//! (`VEC-3`'s world-position invariance is exactly this rotation
//! awareness).
//!
//! ## The pen's conclude rule
//!
//! Connecting the projecting pen to **any** existing vertex concludes
//! the flow (`origin := None`) unless keep-projecting is held —
//! production parity. `VEC-5` binds the subpath-start case (the one
//! that closes a loop); other landings conclude identically, so no
//! separate subpath-start bookkeeping exists.

use std::collections::BTreeSet;

use grida::vectornetwork::VectorNetwork;

use crate::document::{Id, Mutation, PropPatch};
use crate::editor::{Editor, Recording};
use crate::history::Origin;
use crate::tool::DRAG_THRESHOLD_PX;

use crate::hud::{CLICK_DISTANCE_PX, CLICK_WINDOW_MS};

use super::hit::{self, Control, PenTarget, TangentRef};
use super::ops;

/// Legal tools inside the mode (`edit-mode.md` MODE-8; lasso and the
/// width facet are deferred, named in [`crate::vector`]'s docs; bend
/// is a momentary hold, not an armed tool).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum VectorTool {
    #[default]
    Cursor,
    Pen,
}

/// Live modifier state relevant to the mode's gestures.
#[derive(Debug, Clone, Copy, Default)]
pub struct VecMods {
    /// Additive sub-selection / axis lock while translating.
    pub shift: bool,
    /// Keep-projecting (the held pen key): a vertex landing moves the
    /// origin instead of concluding (`VEC-5`).
    pub keep_projecting: bool,
    /// The bend hold (momentary, legal only in this mode): clicking a
    /// vertex toggles corner ⇄ smooth; dragging one pulls a symmetric
    /// tangent pair.
    pub bend: bool,
    /// Tangent mirroring for knob drags (`VEC-10`); a live gesture
    /// modifier. The shell maps its modifier keys onto this; the
    /// contracts drive it explicitly.
    pub mirroring: ops::Mirroring,
}

/// What one Escape press did (`VEC-4`, MODE-10 — one rung per press).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EscapeStep {
    /// An in-flight gesture aborted; the document rolled back.
    AbortedGesture,
    /// Projection and sub-selection cleared — the disconnect. Mode and
    /// tool survive.
    Disconnected,
    /// A non-cursor tool reverted to cursor.
    ToolReverted,
    /// Nothing left inside the mode: the caller runs [`VectorMode::exit`].
    ExitRequested,
}

/// What the mode's exit did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExitOutcome {
    /// The subject node.
    pub node: Id,
    /// The node was deleted (degenerate content, `VEC-2`) or was
    /// already gone.
    pub deleted: bool,
}

/// Event outcome, ToolMachine-shaped: lifecycle facts the damage
/// ledger cannot carry.
#[derive(Debug, Default)]
pub struct VecOutcome {
    /// A history entry was committed.
    pub committed: bool,
    /// A gesture was aborted (the working copy rolled back).
    pub reverted: bool,
    /// A double-click on empty canvas asked to leave the mode — the
    /// enter idiom's inverse (`VEC-13`). The caller runs
    /// [`VectorMode::exit`].
    pub exit_requested: bool,
}

/// The pen's whole state (`vector-edit.md` "The pen"): the origin
/// vertex `A` and the pending tangent `T`. Projecting ⇔ `origin` set.
#[derive(Debug, Clone, Copy, Default)]
struct PenState {
    origin: Option<usize>,
    tangent: (f32, f32),
}

/// Sub-selection: vertices, segments, tangents (`(segment, end)`
/// addressed — module docs).
#[derive(Debug, Clone, Default)]
pub struct SubSelection {
    pub vertices: BTreeSet<usize>,
    pub segments: BTreeSet<usize>,
    pub tangents: BTreeSet<(usize, super::SegEnd)>,
}

impl SubSelection {
    pub fn is_empty(&self) -> bool {
        self.vertices.is_empty() && self.segments.is_empty() && self.tangents.is_empty()
    }

    fn clear(&mut self) {
        self.vertices.clear();
        self.segments.clear();
        self.tangents.clear();
    }
}

/// The interaction phase.
#[derive(Debug, Clone)]
enum VecPhase {
    Idle,
    /// Cursor press, click-vs-drag pending.
    Pending {
        control: Option<Control>,
        local: (f32, f32),
        screen: [f32; 2],
        additive: bool,
        /// The bend hold was down at press (vertex: click toggles
        /// corner⇄smooth, drag pulls a symmetric pair).
        bend: bool,
        /// A segment press's grab parameter (the projection at press —
        /// the bend gesture's weight point).
        grab_t: Option<f32>,
    },
    /// Cursor drag translating the sub-selection (gesture open).
    TranslateSub {
        base: VectorNetwork,
        start_local: (f32, f32),
        shift: bool,
    },
    /// Cursor drag marquee (no document gesture). The sub-selection
    /// updates live as the sweep moves; `base_sel` is the selection
    /// frozen at sweep start — the additive union's base each frame,
    /// and what an abort restores.
    Marquee {
        origin_local: (f32, f32),
        additive: bool,
        last_local: (f32, f32),
        base_sel: SubSelection,
    },
    /// Pen press (gesture open): topology mutated on down; the drag
    /// shapes tangents — pre-tangent when no segment was completed,
    /// post-tangent (`VEC-7` mirror) when one was.
    PenPlacement {
        /// The vertex this placement landed on.
        placed: usize,
        /// The segment this placement completed (independent of the
        /// pen origin — close-with-drag still shapes it).
        seg: Option<usize>,
        /// Press point in screen space (drag threshold).
        screen: [f32; 2],
        /// Network after the down-mutation (drag previews rebuild from
        /// it).
        base: VectorNetwork,
        mutated: bool,
    },
    /// Tangent-knob drag (gesture open, `VEC-10`).
    TangentDrag {
        tref: TangentRef,
        base: VectorNetwork,
    },
    /// Segment-body bend drag (gesture open): the curve deforms
    /// through the grab point against the frozen baseline.
    BendSegment {
        segment: usize,
        grab_t: f32,
        frozen: ops::FrozenSegment,
        base: VectorNetwork,
    },
    /// Bend-hold vertex drag (gesture open): pulls a symmetric tangent
    /// pair out of the vertex.
    BendVertex {
        vertex: usize,
        base: VectorNetwork,
    },
}

/// The vector content-edit mode machine. See module docs.
pub struct VectorMode {
    node: Id,
    /// The network at entry (`VEC-1`).
    snapshot: VectorNetwork,
    /// Created by this mode's authoring flow: degenerate exit rescinds
    /// everything and records nothing (`VEC-2`, TOOL-6/7 doctrine).
    fresh: bool,
    /// History depth at entry: the rescind floor, and the MODE-6
    /// undo-crossing boundary.
    entry_depth: usize,
    tool: VectorTool,
    pen: PenState,
    sel: SubSelection,
    /// Exclusive hover (`VEC-12`).
    hover: Option<Control>,
    /// The snapped cursor, node-local (mode state per the spec): the
    /// pen's rubber-band endpoint.
    cursor: Option<(f32, f32)>,
    /// The hovered segment's projected point — exists only while its
    /// segment is hovered (`VEC-12`); the insertion affordance.
    projection: Option<(f32, f32)>,
    /// The previous empty-canvas press (injected-clock ms + screen
    /// point): the double-click-to-exit detector (`VEC-13`).
    last_empty_down: Option<(u64, [f32; 2])>,
    /// The last pointer event's zoom — pointer-up's hover
    /// re-derivation reads it (the release carries no zoom of its
    /// own).
    last_zoom: f32,
    phase: VecPhase,
}

impl VectorMode {
    // -- lifecycle -------------------------------------------------------------

    /// Enter the mode on an existing vector node (`None` when the id
    /// is not a Vector). Entry mutates nothing — it snapshots.
    pub fn enter(editor: &Editor, id: Id) -> Option<Self> {
        let snapshot = editor.node_vector_network(&id)?;
        Some(Self {
            node: id,
            snapshot,
            fresh: false,
            entry_depth: editor.history_len(),
            tool: VectorTool::Cursor,
            pen: PenState::default(),
            sel: SubSelection::default(),
            hover: None,
            cursor: None,
            projection: None,
            last_empty_down: None,
            last_zoom: 1.0,
            phase: VecPhase::Idle,
        })
    }

    /// Enter on a node this mode's authoring flow just created (the
    /// pen-from-scratch path). `entry_depth` is the history depth from
    /// *before* the creating entry, so a degenerate exit rescinds the
    /// creation itself. The pen arms projecting from `origin`.
    pub fn enter_created(
        editor: &Editor,
        id: Id,
        entry_depth: usize,
        origin: usize,
    ) -> Option<Self> {
        let snapshot = editor.node_vector_network(&id)?;
        Some(Self {
            node: id,
            snapshot,
            fresh: true,
            entry_depth,
            tool: VectorTool::Pen,
            pen: PenState {
                origin: Some(origin),
                tangent: (0.0, 0.0),
            },
            sel: SubSelection::default(),
            hover: None,
            cursor: None,
            projection: None,
            last_empty_down: None,
            last_zoom: 1.0,
            phase: VecPhase::Idle,
        })
    }

    /// Exit: run the lifecycle cleanup in order — abort any in-flight
    /// gesture, `VEC-1` unchanged-restore, exit normalization, `VEC-2`
    /// degenerate delete (history-rescinding; a pre-existing node
    /// additionally records one `Remove` whose undo restores it).
    pub fn exit(mut self, editor: &mut Editor) -> ExitOutcome {
        self.abort_inflight(editor);
        let node = self.node.clone();

        let Some(current) = editor.node_vector_network(&node) else {
            return ExitOutcome {
                node,
                deleted: true,
            };
        };

        // VEC-1: an untouched *pre-existing* subject is left exactly
        // alone — no normalization of content the session never
        // changed. A fresh node is the mode's own output: the cleanup
        // doctrine below applies to it even untouched (a lone
        // first-placement vertex must not survive as a node).
        if !self.fresh && ops::network_eq(&current, &self.snapshot) {
            return ExitOutcome {
                node,
                deleted: false,
            };
        }

        let optimized = ops::optimize(&current, 0.0);

        // VEC-2: degenerate content deletes the node, and no mode-era
        // entry survives. Fresh nodes vanish entirely (their insert
        // was mode-era); pre-existing nodes get exactly one Remove.
        if optimized.vertices.len() < 2 || optimized.segments.is_empty() {
            editor.rescind_to(self.entry_depth);
            if !self.fresh && editor.document().contains(&node) {
                let _ = editor.dispatch(
                    vec![Mutation::Remove { id: node.clone() }],
                    Origin::Local,
                    Recording::Record {
                        label: Some("vector.delete".to_string()),
                    },
                );
            }
            return ExitOutcome {
                node,
                deleted: true,
            };
        }

        // Exit normalization, committed only when it changes anything.
        if !ops::network_eq(&optimized, &current) {
            let patch = refit_patch(editor, &node, optimized);
            let _ = editor.dispatch(
                vec![Mutation::Patch {
                    id: node.clone(),
                    set: patch,
                }],
                Origin::Local,
                Recording::Record {
                    label: Some("vector.exit".to_string()),
                },
            );
        }

        ExitOutcome {
            node,
            deleted: false,
        }
    }

    /// MODE-6 subject pinning: whether the mode may continue. False
    /// when the subject is gone or undo crossed the mode's entry — the
    /// caller drops the mode without running exit cleanup (there is
    /// nothing to clean). On true, stale indices in the sub-selection,
    /// hover, and pen state are revalidated against the live network.
    pub fn reconcile(&mut self, editor: &Editor) -> bool {
        if editor.history_len() < self.entry_depth {
            return false;
        }
        let Some(net) = editor.node_vector_network(&self.node) else {
            return false;
        };
        let vlen = net.vertices.len();
        let slen = net.segments.len();
        self.sel.vertices.retain(|v| *v < vlen);
        self.sel.segments.retain(|s| *s < slen);
        self.sel.tangents.retain(|(s, _)| *s < slen);
        if self.pen.origin.is_some_and(|v| v >= vlen) {
            self.pen = PenState::default();
        }
        if match self.hover {
            Some(Control::Vertex(v)) => v >= vlen,
            Some(Control::Segment(s)) => s >= slen,
            Some(Control::Tangent(t)) => t.segment >= slen,
            None => false,
        } {
            self.hover = None;
        }
        // Invariant repair (`VEC-12`): the projection exists only
        // while a segment is hovered.
        if !matches!(self.hover, Some(Control::Segment(_))) {
            self.projection = None;
        }
        true
    }

    // -- queries ---------------------------------------------------------------

    /// The subject node.
    pub fn node(&self) -> &Id {
        &self.node
    }

    /// The armed tool.
    pub fn tool(&self) -> VectorTool {
        self.tool
    }

    /// The pen is projecting (`vector-edit.md`: origin set).
    pub fn projecting(&self) -> bool {
        self.pen.origin.is_some()
    }

    /// The pen's origin vertex and pending tangent, for the preview
    /// curve.
    pub fn pen_preview(&self) -> Option<(usize, (f32, f32))> {
        self.pen.origin.map(|v| (v, self.pen.tangent))
    }

    /// The sub-selection.
    pub fn selection(&self) -> &SubSelection {
        &self.sel
    }

    /// The hovered control (`VEC-12`: at most one).
    pub fn hovered(&self) -> Option<Control> {
        self.hover
    }

    /// The snapped cursor, node-local (the rubber band's endpoint).
    pub fn cursor(&self) -> Option<(f32, f32)> {
        self.cursor
    }

    /// The hovered segment's projected point (`VEC-12`: `Some` only
    /// while a segment is hovered) — the insertion affordance.
    pub fn projection(&self) -> Option<(f32, f32)> {
        self.projection
    }

    /// The live marquee's two corners, node-local — `Some` only while
    /// the sweep is in flight.
    pub fn marquee(&self) -> Option<((f32, f32), (f32, f32))> {
        match self.phase {
            VecPhase::Marquee {
                origin_local,
                last_local,
                ..
            } => Some((origin_local, last_local)),
            _ => None,
        }
    }

    /// Whether a press/drag sequence is in flight.
    pub fn pointer_busy(&self) -> bool {
        !matches!(self.phase, VecPhase::Idle)
    }

    // -- tools (MODE-8) ----------------------------------------------------------

    /// Arm a tool from the mode's legal set. Always succeeds for legal
    /// members; the caller refuses everything else at the routing
    /// layer.
    pub fn set_tool(&mut self, tool: VectorTool) {
        if matches!(self.phase, VecPhase::Idle) {
            self.tool = tool;
            if matches!(tool, VectorTool::Cursor) {
                // Disarming the pen also stops its projection.
                self.pen = PenState::default();
            }
        }
    }

    // -- escape ladder (VEC-4, MODE-10) -------------------------------------------

    /// One Escape press: exactly one rung.
    pub fn escape(&mut self, editor: &mut Editor) -> EscapeStep {
        if !matches!(self.phase, VecPhase::Idle) {
            self.abort_inflight(editor);
            return EscapeStep::AbortedGesture;
        }
        if self.pen.origin.is_some() || !self.sel.is_empty() {
            // The disconnect (VEC-4): projection and sub-selection
            // clear; tool and mode survive.
            self.pen = PenState::default();
            self.sel.clear();
            return EscapeStep::Disconnected;
        }
        if !matches!(self.tool, VectorTool::Cursor) {
            self.tool = VectorTool::Cursor;
            return EscapeStep::ToolReverted;
        }
        EscapeStep::ExitRequested
    }

    // -- keyboard edits ------------------------------------------------------------

    /// Delete the sub-selection (`VEC-9`): selected segments, then
    /// selected vertices with all their incident segments — bridging
    /// nothing. One history entry (`VEC-11`). Returns false when there
    /// is no sub-selection (the caller falls through to node delete).
    pub fn delete(&mut self, editor: &mut Editor) -> bool {
        if self.sel.vertices.is_empty() && self.sel.segments.is_empty() {
            return false;
        }
        let Some(mut net) = editor.node_vector_network(&self.node) else {
            return false;
        };
        let segments: Vec<usize> = self.sel.segments.iter().copied().collect();
        ops::remove_segments(&mut net, &segments);
        // Descending order: each removal shifts the indices above it.
        for &v in self.sel.vertices.iter().rev() {
            ops::delete_vertex(&mut net, v);
        }
        let patch = refit_patch(editor, &self.node, net);
        let _ = editor.dispatch(
            vec![Mutation::Patch {
                id: self.node.clone(),
                set: patch,
            }],
            Origin::Local,
            Recording::Record {
                label: Some("vector.delete".to_string()),
            },
        );
        self.sel.clear();
        // Vertex indices shifted under the pen; a stale origin would
        // project from the wrong vertex. The hovered geometry may be
        // gone outright — the hover pair drops with it.
        self.pen = PenState::default();
        self.clear_hover();
        true
    }

    /// Arrow-key nudge: translate the sub-selection by `(dx, dy)`
    /// local units, one entry per press (`nudge.md` sub-mode arm).
    /// Returns false with an empty sub-selection (caller falls
    /// through).
    pub fn nudge(&mut self, editor: &mut Editor, dx: f32, dy: f32) -> bool {
        if self.sel.vertices.is_empty() && self.sel.segments.is_empty() {
            return false;
        }
        let Some(mut net) = editor.node_vector_network(&self.node) else {
            return false;
        };
        let affected = self.affected_vertices(&net);
        ops::translate_vertices(&mut net, &affected, (dx, dy));
        let patch = refit_patch(editor, &self.node, net);
        let _ = editor.dispatch(
            vec![Mutation::Patch {
                id: self.node.clone(),
                set: patch,
            }],
            Origin::Local,
            Recording::Record {
                label: Some("vector.nudge".to_string()),
            },
        );
        // The nudged geometry moved out from under the resting
        // pointer — the stale hover pair drops (the next pointer move
        // re-resolves).
        self.clear_hover();
        true
    }

    // -- pointer events -------------------------------------------------------------

    /// Pointer move with no button down: hover resolution (`VEC-12`),
    /// or gesture continuation.
    pub fn pointer_move(
        &mut self,
        editor: &mut Editor,
        canvas: [f32; 2],
        screen: [f32; 2],
        zoom: f32,
        mods: VecMods,
    ) -> VecOutcome {
        let local = self.to_local(editor, canvas);
        self.last_zoom = zoom;
        self.cursor = Some(match self.tool {
            VectorTool::Pen => match editor
                .node_vector_network(&self.node)
                .map(|net| hit::pen_target(&net, local, zoom))
            {
                Some(PenTarget::Vertex(v)) => editor
                    .node_vector_network(&self.node)
                    .and_then(|net| net.vertices.get(v).copied())
                    .unwrap_or(local),
                Some(PenTarget::Segment { point, .. }) => point,
                _ => local,
            },
            VectorTool::Cursor => local,
        });
        match self.phase.clone() {
            VecPhase::Idle => {
                self.update_hover(editor, local, zoom);
                VecOutcome::default()
            }
            VecPhase::Pending {
                control,
                local: press_local,
                screen: press_screen,
                additive,
                bend,
                grab_t,
            } => {
                let dx = screen[0] - press_screen[0];
                let dy = screen[1] - press_screen[1];
                if dx.hypot(dy) < DRAG_THRESHOLD_PX {
                    return VecOutcome::default();
                }
                // The press promotes to a drag: the gesture captures
                // the pointer — hover (and the halfpoint projection
                // riding it) clears for the gesture's duration and
                // re-resolves at release (`VEC-12`).
                self.clear_hover();
                let Some(base) = editor.node_vector_network(&self.node) else {
                    self.phase = VecPhase::Idle;
                    return VecOutcome::default();
                };
                match control {
                    // Bend hold + vertex: pull a symmetric pair.
                    Some(Control::Vertex(v)) if bend => {
                        editor.begin_gesture();
                        self.phase = VecPhase::BendVertex { vertex: v, base };
                        self.bend_vertex_to(editor, local);
                    }
                    // Bend hold + segment: the body deforms through
                    // the grab point (`vector-edit.md` bend modifier —
                    // deformation lives under the hold, never on a
                    // plain drag).
                    Some(Control::Segment(s)) if bend => {
                        let Some(frozen) = ops::freeze_segment(&base, s) else {
                            self.phase = VecPhase::Idle;
                            return VecOutcome::default();
                        };
                        editor.begin_gesture();
                        self.phase = VecPhase::BendSegment {
                            segment: s,
                            grab_t: grab_t.unwrap_or(0.5),
                            frozen,
                            base,
                        };
                        self.bend_segment_to(editor, local);
                    }
                    // Vertex or segment drag translates the
                    // sub-selection — a segment's endpoints ride the
                    // same gesture (selecting the control first when
                    // unselected).
                    Some(control @ (Control::Vertex(_) | Control::Segment(_))) => {
                        if !self.is_selected(control) {
                            self.select_control(control, additive);
                        }
                        editor.begin_gesture();
                        self.phase = VecPhase::TranslateSub {
                            base,
                            start_local: press_local,
                            shift: mods.shift,
                        };
                        self.translate_to(editor, local, mods.shift);
                    }
                    // Tangent-knob drag (`VEC-10`).
                    Some(Control::Tangent(tref)) => {
                        editor.begin_gesture();
                        self.phase = VecPhase::TangentDrag { tref, base };
                        self.tangent_to(editor, local, mods.mirroring);
                    }
                    None => {
                        self.phase = VecPhase::Marquee {
                            origin_local: press_local,
                            additive,
                            last_local: local,
                            base_sel: self.sel.clone(),
                        };
                        self.apply_marquee(editor);
                    }
                }
                VecOutcome::default()
            }
            VecPhase::TranslateSub { .. } => {
                if let VecPhase::TranslateSub { shift, .. } = &mut self.phase {
                    *shift = mods.shift;
                }
                self.translate_to(editor, local, mods.shift);
                VecOutcome::default()
            }
            VecPhase::Marquee { .. } => {
                if let VecPhase::Marquee { last_local, .. } = &mut self.phase {
                    *last_local = local;
                }
                self.apply_marquee(editor);
                VecOutcome::default()
            }
            VecPhase::PenPlacement {
                placed,
                seg,
                screen: press_screen,
                base,
                ..
            } => {
                let dx = screen[0] - press_screen[0];
                let dy = screen[1] - press_screen[1];
                if dx.hypot(dy) < DRAG_THRESHOLD_PX {
                    return VecOutcome::default();
                }
                let Some(placed_pos) = base.vertices.get(placed).copied() else {
                    return VecOutcome::default();
                };
                let drag = (local.0 - placed_pos.0, local.1 - placed_pos.1);
                match seg {
                    // Post-tangent (`VEC-7`): the drag shapes the
                    // completed segment's end tangent live and mirrors
                    // into the pending tangent, so the next segment
                    // departs smoothly. Close-with-drag shapes the
                    // segment even though the pen concluded.
                    Some(s) => {
                        let mut net = base.clone();
                        if let Some(segment) = net.segments.get_mut(s) {
                            segment.tb = (-drag.0, -drag.1);
                        }
                        if self.pen.origin.is_some() {
                            self.pen.tangent = drag;
                        }
                        let _ = editor.dispatch(
                            vec![Mutation::Patch {
                                id: self.node.clone(),
                                set: PropPatch {
                                    vector_network: Some(net),
                                    ..Default::default()
                                },
                            }],
                            Origin::Local,
                            Recording::Silent,
                        );
                        if let VecPhase::PenPlacement { mutated, .. } = &mut self.phase {
                            *mutated = true;
                        }
                    }
                    // Pre-tangent: the drag accumulates the pending
                    // tangent before any segment exists — machine
                    // state only, the document is untouched.
                    None => {
                        if self.pen.origin.is_some() {
                            self.pen.tangent = drag;
                        }
                    }
                }
                VecOutcome::default()
            }
            VecPhase::TangentDrag { .. } => {
                self.tangent_to(editor, local, mods.mirroring);
                VecOutcome::default()
            }
            VecPhase::BendSegment { .. } => {
                self.bend_segment_to(editor, local);
                VecOutcome::default()
            }
            VecPhase::BendVertex { .. } => {
                self.bend_vertex_to(editor, local);
                VecOutcome::default()
            }
        }
    }

    /// Pointer down. `now_ms` is the injected clock (harness
    /// doctrine) — the double-click-to-exit detector reads it.
    pub fn pointer_down(
        &mut self,
        editor: &mut Editor,
        canvas: [f32; 2],
        screen: [f32; 2],
        zoom: f32,
        now_ms: u64,
        mods: VecMods,
    ) -> VecOutcome {
        let local = self.to_local(editor, canvas);
        self.last_zoom = zoom;
        match self.tool {
            VectorTool::Pen => {
                self.pen_down(editor, local, screen, zoom, mods);
                VecOutcome::default()
            }
            VectorTool::Cursor => {
                self.update_hover(editor, local, zoom);
                // Double-click on empty canvas exits the mode — the
                // enter idiom's inverse (VEC-13). Only empty presses
                // participate: geometry double-clicks stay editing.
                if self.hover.is_none() {
                    if let Some((t, p)) = self.last_empty_down
                        && now_ms.saturating_sub(t) <= CLICK_WINDOW_MS
                        && (screen[0] - p[0]).hypot(screen[1] - p[1]) <= CLICK_DISTANCE_PX
                    {
                        self.last_empty_down = None;
                        return VecOutcome {
                            exit_requested: true,
                            ..Default::default()
                        };
                    }
                    self.last_empty_down = Some((now_ms, screen));
                } else {
                    self.last_empty_down = None;
                }
                // A segment press remembers its projection: the bend
                // gesture's grab parameter.
                let grab_t = match self.hover {
                    Some(Control::Segment(_)) => editor
                        .node_vector_network(&self.node)
                        .and_then(|net| {
                            hit::nearest_segment(&net, local, hit::SEGMENT_SNAP_PX / zoom)
                        })
                        .map(|(_, t, _)| t),
                    _ => None,
                };
                self.phase = VecPhase::Pending {
                    control: self.hover,
                    local,
                    screen,
                    additive: mods.shift,
                    bend: mods.bend,
                    grab_t,
                };
                VecOutcome::default()
            }
        }
    }

    /// Pointer up: resolve the pending click, or land the gesture —
    /// then re-resolve hover against the landed geometry (`VEC-12`:
    /// the release hands the pointer back, and the halfpoint
    /// projection must track the geometry as it now is, not as it was
    /// at press).
    pub fn pointer_up(&mut self, editor: &mut Editor, canvas: [f32; 2]) -> VecOutcome {
        let outcome = match std::mem::replace(&mut self.phase, VecPhase::Idle) {
            VecPhase::Idle => VecOutcome::default(),
            VecPhase::Pending {
                control,
                additive,
                bend,
                ..
            } => {
                match control {
                    // Bend click on a vertex: toggle corner ⇄ smooth —
                    // one entry.
                    Some(Control::Vertex(v)) if bend => {
                        let committed = self.toggle_vertex_bend(editor, v);
                        return self.finish_pointer_up(
                            editor,
                            canvas,
                            VecOutcome {
                                committed,
                                ..Default::default()
                            },
                        );
                    }
                    Some(control) => self.select_control(control, additive),
                    None => {
                        if !additive {
                            self.sel.clear();
                        }
                    }
                }
                VecOutcome::default()
            }
            VecPhase::TranslateSub { .. } => {
                // Land: refit in the same frame, then commit — one
                // entry (VEC-11), tight bounds (VEC-3).
                self.dispatch_refit_silent(editor);
                editor.commit_gesture(Some("vector.translate".to_string()));
                VecOutcome {
                    committed: true,
                    ..Default::default()
                }
            }
            // The sweep applied live on every move — release just
            // lands the gesture.
            VecPhase::Marquee { .. } => VecOutcome::default(),
            VecPhase::PenPlacement { mutated, .. } => {
                if mutated {
                    self.dispatch_refit_silent(editor);
                }
                editor.commit_gesture(Some("vector.pen".to_string()));
                VecOutcome {
                    committed: mutated,
                    ..Default::default()
                }
            }
            VecPhase::TangentDrag { .. } => {
                self.dispatch_refit_silent(editor);
                editor.commit_gesture(Some("vector.tangent".to_string()));
                VecOutcome {
                    committed: true,
                    ..Default::default()
                }
            }
            VecPhase::BendSegment { .. } | VecPhase::BendVertex { .. } => {
                self.dispatch_refit_silent(editor);
                editor.commit_gesture(Some("vector.bend".to_string()));
                VecOutcome {
                    committed: true,
                    ..Default::default()
                }
            }
        };
        self.finish_pointer_up(editor, canvas, outcome)
    }

    /// The shared pointer-up tail: the release hands the pointer
    /// back, so hover — and the halfpoint projection riding it —
    /// re-derives at the release point against the geometry as the
    /// gesture landed it.
    fn finish_pointer_up(
        &mut self,
        editor: &mut Editor,
        canvas: [f32; 2],
        outcome: VecOutcome,
    ) -> VecOutcome {
        let local = self.to_local(editor, canvas);
        self.update_hover(editor, local, self.last_zoom);
        outcome
    }

    // -- internals --------------------------------------------------------------

    /// The pen press (`vector-edit.md` "The pen", `VEC-5/6/8`): resolve
    /// by snap priority and mutate topology on down, inside a gesture
    /// frame that `pointer_up` commits (`VEC-11`: one placement, one
    /// entry).
    fn pen_down(
        &mut self,
        editor: &mut Editor,
        local: (f32, f32),
        screen: [f32; 2],
        zoom: f32,
        mods: VecMods,
    ) {
        let Some(net0) = editor.node_vector_network(&self.node) else {
            return;
        };
        // The placement gesture captures the pointer (`VEC-12`, same
        // as the cursor tool's drag promotion).
        self.clear_hover();
        editor.begin_gesture();
        let mut net = net0.clone();

        // Resolve the landing. `(placed, seg)` feed the placement's
        // drag half: the landed vertex and the segment this placement
        // completed. `landed_existing` = landed on an existing (or
        // split-created) vertex; the free-append case is handled
        // inline.
        let mut placed;
        let mut seg: Option<usize> = None;
        let landed_existing = match hit::pen_target(&net, local, zoom) {
            PenTarget::Vertex(v) => {
                placed = v;
                Some(v)
            }
            PenTarget::Segment { segment, t, .. } => {
                let v = ops::split_segment(&mut net, segment, t);
                placed = v.unwrap_or(0);
                v
            }
            PenTarget::Free(p) => {
                let before = net.vertices.len();
                let v = ops::add_vertex(&mut net, p);
                placed = v;
                if net.vertices.len() > before {
                    // Append: new vertex; if projecting, the new
                    // segment consumes the pending tangent as its
                    // origin tangent.
                    if let Some(a) = self.pen.origin {
                        seg = Some(ops::add_segment(
                            &mut net,
                            a,
                            v,
                            self.pen.tangent,
                            (0.0, 0.0),
                        ));
                    }
                    self.pen.origin = Some(v);
                    self.pen.tangent = (0.0, 0.0);
                    None
                } else {
                    // Deduplicated onto an existing vertex: an
                    // existing-vertex landing after all.
                    Some(v)
                }
            }
        };

        // Existing-vertex landing: adopt, or connect-and-conclude
        // (module docs; VEC-5's keep-projecting variant moves the
        // origin instead of concluding).
        if let Some(v) = landed_existing {
            placed = v;
            match self.pen.origin {
                None => {
                    self.pen.origin = Some(v);
                    self.pen.tangent = ops::next_mirrored_tangent(&net, v);
                }
                Some(a) if a != v => {
                    seg = Some(ops::add_segment(
                        &mut net,
                        a,
                        v,
                        self.pen.tangent,
                        (0.0, 0.0),
                    ));
                    self.pen.tangent = (0.0, 0.0);
                    self.pen.origin = if mods.keep_projecting { Some(v) } else { None };
                }
                Some(_) => {}
            }
        }

        let mutated = !ops::network_eq(&net, &net0);
        if mutated {
            let _ = editor.dispatch(
                vec![Mutation::Patch {
                    id: self.node.clone(),
                    set: PropPatch {
                        vector_network: Some(net.clone()),
                        ..Default::default()
                    },
                }],
                Origin::Local,
                Recording::Silent,
            );
        }
        self.phase = VecPhase::PenPlacement {
            placed,
            seg,
            screen,
            base: net,
            mutated,
        };
    }

    /// Drop the hover pair. `VEC-12`: the projection is a hover facet
    /// — the two live and die together. A promoted drag captures the
    /// pointer, so nothing is hovered for the gesture's duration; a
    /// keyboard mutation that moves geometry out from under the
    /// pointer drops the pair rather than leave the insertion
    /// affordance pointing at stale geometry.
    fn clear_hover(&mut self) {
        self.hover = None;
        self.projection = None;
    }

    fn update_hover(&mut self, editor: &Editor, local: (f32, f32), zoom: f32) {
        let Some(net) = editor.node_vector_network(&self.node) else {
            self.hover = None;
            self.projection = None;
            return;
        };
        let knobs = self.visible_tangents(&net);
        self.hover = hit::hover(&net, &knobs, local, zoom);
        // The projected insertion point exists only while its segment
        // is hovered (VEC-12).
        self.projection = match self.hover {
            Some(Control::Segment(_)) => {
                hit::nearest_segment(&net, local, hit::SEGMENT_SNAP_PX / zoom).map(|(_, _, p)| p)
            }
            _ => None,
        };
    }

    /// The tangent knobs currently visible: the neighbourhood rule —
    /// tangents of selected vertices and their one-hop neighbours,
    /// zero tangents never (`vector-edit.md` Chrome and hover).
    pub fn visible_tangents(&self, net: &VectorNetwork) -> Vec<TangentRef> {
        let mut hood: BTreeSet<usize> = self.sel.vertices.clone();
        for &v in &self.sel.vertices {
            for i in ops::segments_at(net, v) {
                hood.insert(net.segments[i].a);
                hood.insert(net.segments[i].b);
            }
        }
        // Segment selection exposes its endpoints' knobs too.
        for &s in &self.sel.segments {
            if let Some(seg) = net.segments.get(s) {
                hood.insert(seg.a);
                hood.insert(seg.b);
            }
        }
        let mut out = Vec::new();
        for (i, seg) in net.segments.iter().enumerate() {
            if hood.contains(&seg.a) && seg.ta != (0.0, 0.0) {
                out.push(TangentRef {
                    segment: i,
                    end: super::SegEnd::A,
                });
            }
            if hood.contains(&seg.b) && seg.tb != (0.0, 0.0) {
                out.push(TangentRef {
                    segment: i,
                    end: super::SegEnd::B,
                });
            }
        }
        out
    }

    fn is_selected(&self, control: Control) -> bool {
        match control {
            Control::Vertex(v) => self.sel.vertices.contains(&v),
            Control::Segment(s) => self.sel.segments.contains(&s),
            Control::Tangent(t) => self.sel.tangents.contains(&(t.segment, t.end)),
        }
    }

    /// Click selection: replace, or toggle when additive (the same
    /// grow/shrink discipline as document selection).
    fn select_control(&mut self, control: Control, additive: bool) {
        if !additive {
            self.sel.clear();
            match control {
                Control::Vertex(v) => {
                    self.sel.vertices.insert(v);
                }
                Control::Segment(s) => {
                    self.sel.segments.insert(s);
                }
                Control::Tangent(t) => {
                    self.sel.tangents.insert((t.segment, t.end));
                }
            }
            return;
        }
        match control {
            Control::Vertex(v) => {
                if !self.sel.vertices.remove(&v) {
                    self.sel.vertices.insert(v);
                }
            }
            Control::Segment(s) => {
                if !self.sel.segments.remove(&s) {
                    self.sel.segments.insert(s);
                }
            }
            Control::Tangent(t) => {
                let key = (t.segment, t.end);
                if !self.sel.tangents.remove(&key) {
                    self.sel.tangents.insert(key);
                }
            }
        }
    }

    /// Vertices moved by a sub-selection translate: selected vertices
    /// plus selected segments' endpoints.
    fn affected_vertices(&self, net: &VectorNetwork) -> Vec<usize> {
        let mut set: BTreeSet<usize> = self.sel.vertices.clone();
        for &s in &self.sel.segments {
            if let Some(seg) = net.segments.get(s) {
                set.insert(seg.a);
                set.insert(seg.b);
            }
        }
        set.into_iter().collect()
    }

    /// Preview one translate step from the frozen base network.
    fn translate_to(&mut self, editor: &mut Editor, local: (f32, f32), shift: bool) {
        let VecPhase::TranslateSub {
            base, start_local, ..
        } = &self.phase
        else {
            return;
        };
        let mut delta = (local.0 - start_local.0, local.1 - start_local.1);
        if shift {
            // Axis lock by dominance.
            if delta.0.abs() > delta.1.abs() {
                delta.1 = 0.0;
            } else {
                delta.0 = 0.0;
            }
        }
        let mut net = base.clone();
        let affected = self.affected_vertices(&net);
        ops::translate_vertices(&mut net, &affected, delta);
        let _ = editor.dispatch(
            vec![Mutation::Patch {
                id: self.node.clone(),
                set: PropPatch {
                    vector_network: Some(net),
                    ..Default::default()
                },
            }],
            Origin::Local,
            Recording::Silent,
        );
    }

    /// Final silent refit patch inside an open gesture (`VEC-3`).
    fn dispatch_refit_silent(&self, editor: &mut Editor) {
        let Some(net) = editor.node_vector_network(&self.node) else {
            return;
        };
        let patch = refit_patch(editor, &self.node, net);
        let _ = editor.dispatch(
            vec![Mutation::Patch {
                id: self.node.clone(),
                set: patch,
            }],
            Origin::Local,
            Recording::Silent,
        );
    }

    /// Preview one tangent-knob step from the frozen base (`VEC-10`).
    /// The knob's position is `vertex + tangent`, so the dragged value
    /// is simply `cursor − vertex`.
    fn tangent_to(&mut self, editor: &mut Editor, local: (f32, f32), mirroring: ops::Mirroring) {
        let VecPhase::TangentDrag { tref, base } = &self.phase else {
            return;
        };
        let Some(vertex) = tref.vertex(base) else {
            return;
        };
        let Some(vpos) = base.vertices.get(vertex).copied() else {
            return;
        };
        let value = (local.0 - vpos.0, local.1 - vpos.1);
        let mut net = base.clone();
        ops::update_tangent(&mut net, tref.segment, tref.end, value, mirroring);
        self.dispatch_network_silent(editor, net);
    }

    /// Preview one segment-bend step against the frozen baseline.
    fn bend_segment_to(&mut self, editor: &mut Editor, local: (f32, f32)) {
        let VecPhase::BendSegment {
            segment,
            grab_t,
            frozen,
            base,
        } = &self.phase
        else {
            return;
        };
        let mut net = base.clone();
        ops::bend_segment(&mut net, *segment, *grab_t, local, frozen);
        self.dispatch_network_silent(editor, net);
    }

    /// Preview one bend-vertex step: a symmetric tangent pair pulled
    /// out of the vertex — departing ends (`a`) take the drag vector,
    /// arriving ends (`b`) its negation.
    fn bend_vertex_to(&mut self, editor: &mut Editor, local: (f32, f32)) {
        let VecPhase::BendVertex { vertex, base } = &self.phase else {
            return;
        };
        let vertex = *vertex;
        let Some(vpos) = base.vertices.get(vertex).copied() else {
            return;
        };
        let pull = (local.0 - vpos.0, local.1 - vpos.1);
        let mut net = base.clone();
        for i in ops::segments_at(&net, vertex) {
            let seg = &mut net.segments[i];
            if seg.a == vertex {
                seg.ta = pull;
            }
            if seg.b == vertex {
                seg.tb = (-pull.0, -pull.1);
            }
        }
        self.dispatch_network_silent(editor, net);
    }

    /// Bend click: toggle the vertex corner ⇄ smooth. Corner zeroes
    /// every tangent at the vertex; smooth (degree-2 vertices only)
    /// infers a symmetric pair from the neighbour chord. One entry.
    fn toggle_vertex_bend(&mut self, editor: &mut Editor, vertex: usize) -> bool {
        let Some(mut net) = editor.node_vector_network(&self.node) else {
            return false;
        };
        let incident = ops::segments_at(&net, vertex);
        let any_tangent = incident.iter().any(|&i| {
            let seg = &net.segments[i];
            (seg.a == vertex && seg.ta != (0.0, 0.0)) || (seg.b == vertex && seg.tb != (0.0, 0.0))
        });
        if any_tangent {
            // → corner.
            for i in incident {
                let seg = &mut net.segments[i];
                if seg.a == vertex {
                    seg.ta = (0.0, 0.0);
                }
                if seg.b == vertex {
                    seg.tb = (0.0, 0.0);
                }
            }
        } else {
            // → smooth: only meaningful between exactly two segments.
            let [first, second] = incident.as_slice() else {
                return false;
            };
            let other = |i: usize| -> Option<(f32, f32)> {
                let seg = &net.segments[i];
                let o = if seg.a == vertex { seg.b } else { seg.a };
                net.vertices.get(o).copied()
            };
            let (Some(p_in), Some(p_out), Some(vpos)) = (
                other(*first),
                other(*second),
                net.vertices.get(vertex).copied(),
            ) else {
                return false;
            };
            let chord = (p_out.0 - p_in.0, p_out.1 - p_in.1);
            let chord_len = chord.0.hypot(chord.1);
            if chord_len == 0.0 {
                return false;
            }
            let d_in = (vpos.0 - p_in.0).hypot(vpos.1 - p_in.1);
            let d_out = (p_out.0 - vpos.0).hypot(p_out.1 - vpos.1);
            let len = d_in.min(d_out) / 3.0;
            let dir = (chord.0 / chord_len * len, chord.1 / chord_len * len);
            // Each side's tangent points along the chord toward its
            // own neighbour — a collinear, opposite (smooth) pair
            // regardless of segment order.
            for (i, neighbour) in [(*first, p_in), (*second, p_out)] {
                let toward = (neighbour.0 - vpos.0, neighbour.1 - vpos.1);
                let sign = if toward.0 * chord.0 + toward.1 * chord.1 >= 0.0 {
                    1.0
                } else {
                    -1.0
                };
                let t = (dir.0 * sign, dir.1 * sign);
                let seg = &mut net.segments[i];
                if seg.a == vertex {
                    seg.ta = t;
                }
                if seg.b == vertex {
                    seg.tb = t;
                }
            }
        }
        let patch = refit_patch(editor, &self.node, net);
        let _ = editor.dispatch(
            vec![Mutation::Patch {
                id: self.node.clone(),
                set: patch,
            }],
            Origin::Local,
            Recording::Record {
                label: Some("vector.bend".to_string()),
            },
        );
        true
    }

    fn dispatch_network_silent(&self, editor: &mut Editor, net: VectorNetwork) {
        let _ = editor.dispatch(
            vec![Mutation::Patch {
                id: self.node.clone(),
                set: PropPatch {
                    vector_network: Some(net),
                    ..Default::default()
                },
            }],
            Origin::Local,
            Recording::Silent,
        );
    }

    fn abort_inflight(&mut self, editor: &mut Editor) {
        match std::mem::replace(&mut self.phase, VecPhase::Idle) {
            VecPhase::TranslateSub { .. }
            | VecPhase::PenPlacement { .. }
            | VecPhase::TangentDrag { .. }
            | VecPhase::BendSegment { .. }
            | VecPhase::BendVertex { .. } => {
                editor.abort_gesture();
            }
            // The sweep applied live — abort restores the selection it
            // started from.
            VecPhase::Marquee { base_sel, .. } => {
                self.sel = base_sel;
            }
            _ => {}
        }
    }

    /// Recompute the live sub-selection from the sweep rect: the swept
    /// controls union the frozen at-start base when additive, replace
    /// it otherwise. Runs on every marquee move, so shrinking the
    /// sweep un-selects again.
    fn apply_marquee(&mut self, editor: &Editor) {
        let VecPhase::Marquee {
            origin_local,
            additive,
            last_local,
            base_sel,
        } = &self.phase
        else {
            return;
        };
        let Some(net) = editor.node_vector_network(&self.node) else {
            return;
        };
        let rect = math2::Rectangle::from_points(&[
            [origin_local.0, origin_local.1],
            [last_local.0, last_local.1],
        ]);
        let (vertices, segments) = hit::marquee(&net, &rect);
        let mut sel = if *additive {
            base_sel.clone()
        } else {
            SubSelection::default()
        };
        sel.vertices.extend(vertices);
        sel.segments.extend(segments);
        self.sel = sel;
    }

    /// Canvas → node-local: the inverse of the node's *world* transform
    /// (the whole ancestor chain), the exact inverse of the projection
    /// the chrome renders through ([`crate::vector::chrome`]). Keying
    /// this off the node's own local transform instead would drift from
    /// the (world-projected) chrome the moment the node is nested, so a
    /// click would miss the vertex it visibly lands on.
    fn to_local(&self, editor: &Editor, canvas: [f32; 2]) -> (f32, f32) {
        let inv = editor
            .node_world_transform(&self.node)
            .inverse()
            .unwrap_or_else(math2::transform::AffineTransform::identity);
        let m = inv.matrix;
        (
            m[0][0] * canvas[0] + m[0][1] * canvas[1] + m[0][2],
            m[1][0] * canvas[0] + m[1][1] * canvas[1] + m[1][2],
        )
    }
}

/// The refit patch (`VEC-3`): re-anchor the network at its tight
/// bounds and compensate the node's position by the same delta —
/// rotated into the parent frame — so the geometry's world position
/// never shifts. One patch: network and position land atomically.
fn refit_patch(editor: &Editor, node: &Id, mut net: VectorNetwork) -> PropPatch {
    let delta = ops::refit(&mut net);
    let (px, py) = editor.node_position(node).unwrap_or((0.0, 0.0));
    let rot = editor.node_rotation(node).unwrap_or(0.0);
    let (dx, dy) = if rot == 0.0 {
        delta
    } else {
        let (sin, cos) = rot.sin_cos();
        (delta.0 * cos - delta.1 * sin, delta.0 * sin + delta.1 * cos)
    };
    PropPatch {
        vector_network: Some(net),
        position: Some((px + dx, py + dy)),
        ..Default::default()
    }
}
