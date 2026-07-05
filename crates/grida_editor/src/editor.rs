//! The editor instance — dispatch, observation, queries (`ED-*`).
//!
//! Reference implementation of `crates/grida_editor/docs/editor.md`. The editor
//! owns the [`WorkingCopy`], applies mutation batches through it (the
//! single mutation authority, `ARCH-2`), records history per the
//! origin/recording rules, and notifies observers after everything is
//! consistent (`ED-1`).
//!
//! ## M1 notes
//!
//! - **`ED-2` (selector granularity) is not yet implemented.** M1
//!   observers are coarse: every observer is notified on every applied
//!   batch, with the [`ChangeSummary`] to filter on. Selector
//!   subscriptions (notify only when the selection's value changed)
//!   come later; nothing here fakes them.
//! - Observers receive `(&Editor, &ChangeSummary)` rather than the
//!   summary alone, so they can query post-dispatch state during
//!   notification (which is exactly what `ED-1` requires a test to
//!   observe).
//! - Selection changes only via [`Editor::set_selection`] and is not
//!   recorded in history for M1.

use std::collections::HashMap;

use grida::node::schema::{NodeId, Scene};

use crate::document::{Applied, ChangeSummary, Id, Mutation, MutationError, WorkingCopy};
use crate::history::{Context, Entry, History, Origin};

/// Recording mode for a dispatch.
#[derive(Debug, Clone)]
pub enum Recording {
    /// Produce a history entry (local origin only, `ED-3`). `label` is
    /// the display-only step name (`HISB-3` — never a merge key).
    Record { label: Option<String> },
    /// Apply without recording (previews, remote application).
    Silent,
}

/// Default history depth bound (`HISB-7`).
pub const DEFAULT_MAX_DEPTH: usize = 256;

/// An open gesture: accumulated preview batches and their inverses.
struct Gesture {
    depth: usize,
    batches: Vec<Vec<Mutation>>,
    inverses: Vec<Vec<Mutation>>,
    selection_before: Vec<Id>,
}

type Observer = Box<dyn FnMut(&Editor, &ChangeSummary)>;

/// A tap on every successfully applied batch: `(batch, inverse,
/// origin)`. Unlike observers (which see summaries), the tap sees the
/// mutation data itself — it is the sync layer's feed (`sync.md` "what
/// travels"): every local content change, including silent previews,
/// undo/redo applications, and gesture-abort rollbacks, flows through
/// it exactly once. Remote applications flow through with
/// `Origin::Remote` so a sync client can ignore its own echoes.
pub type AppliedTap = Box<dyn FnMut(&[Mutation], &[Mutation], Origin)>;

/// The editor instance (`ED-*`).
pub struct Editor {
    doc: WorkingCopy,
    history: History<Vec<Mutation>>,
    selection: Vec<Id>,
    observers: Vec<Observer>,
    gesture: Option<Gesture>,
    /// Applied-batch tap (sync feed); `None` when no session is active.
    applied_tap: Option<AppliedTap>,
    /// Damage ledger (`ED-8`, `frame.md`): every applied batch's
    /// summary merges here until the presentation host drains it via
    /// [`Editor::take_damage`].
    damage: ChangeSummary,
}

impl Editor {
    /// Create an editor over a working copy, with default history
    /// configuration.
    pub fn new(doc: WorkingCopy) -> Self {
        Self {
            doc,
            history: History::new(DEFAULT_MAX_DEPTH),
            selection: Vec::new(),
            observers: Vec::new(),
            gesture: None,
            applied_tap: None,
            damage: ChangeSummary::default(),
        }
    }

    /// Create an editor with explicit history configuration.
    pub fn with_history_config(doc: WorkingCopy, max_depth: usize) -> Self {
        Self {
            history: History::new(max_depth),
            ..Self::new(doc)
        }
    }

    /// Replace the working copy: resets history, selection, and any
    /// open gesture (`ED-6` — no state leaks across loads). Observers
    /// persist (they belong to the instance, not the document).
    pub fn load(&mut self, scene: Scene, id_map: HashMap<NodeId, Id>) {
        self.doc = WorkingCopy::from_scene(scene, id_map);
        self.history.clear();
        self.selection.clear();
        self.gesture = None;
        // A load replaces everything the renderer mirrors (ED-8).
        self.damage.structural = true;
    }

    // -- dispatch (ED-1, ED-3) --------------------------------------------------

    /// The single entry for change. Applies the batch atomically via
    /// the working copy, records history per origin/recording, then
    /// notifies observers with the change summary — in that order, so
    /// an observer sees document, history, and context already
    /// consistent (`ED-1`).
    ///
    /// `Remote`/`Agent` origins never record (`ED-3`), regardless of
    /// `recording`. During an open gesture, local dispatches are
    /// treated as previews and accumulate into the gesture endpoint
    /// regardless of `recording`.
    pub fn dispatch(
        &mut self,
        batch: Vec<Mutation>,
        origin: Origin,
        recording: Recording,
    ) -> Result<(), MutationError> {
        self.dispatch_full(batch, origin, recording).map(|_| ())
    }

    /// [`Editor::dispatch`], returning the [`Applied`] result (inverse
    /// batch + change summary). The sync client uses this to capture
    /// fresh inverses when re-applying speculative batches on rebase.
    pub fn dispatch_full(
        &mut self,
        batch: Vec<Mutation>,
        origin: Origin,
        recording: Recording,
    ) -> Result<Applied, MutationError> {
        // Before-context for a one-shot record, captured pre-apply so
        // undo restores what was selected *before* the change (HISB-1;
        // prune_selection may rewrite the selection below).
        let will_record = origin == Origin::Local
            && self.gesture.is_none()
            && matches!(recording, Recording::Record { .. });
        let context_before = will_record.then(|| Context {
            selection: self.selection.clone(),
            scene: None,
        });

        let applied = self.doc.apply(&batch)?;
        self.damage.merge(&applied.summary);
        self.prune_selection();
        self.tap(&batch, &applied.inverse, origin);

        if origin == Origin::Local {
            if let Some(gesture) = &mut self.gesture {
                gesture.batches.push(batch);
                gesture.inverses.push(applied.inverse.clone());
            } else if let Recording::Record { label } = recording {
                let context_after = Context {
                    selection: self.selection.clone(),
                    scene: None,
                };
                self.history.record(Entry {
                    redo: batch,
                    undo: applied.inverse.clone(),
                    context: (context_before.unwrap_or_default(), context_after),
                    origin,
                    label,
                });
            }
        }

        self.notify(&applied.summary);
        Ok(applied)
    }

    // -- gesture framing (HISB-2, HISB-4) ---------------------------------------

    /// Open a gesture. Dispatches until `commit_gesture`/`abort_gesture`
    /// are previews; at most one history entry results. Nested begins
    /// fold into the outermost gesture.
    pub fn begin_gesture(&mut self) {
        match &mut self.gesture {
            Some(gesture) => gesture.depth += 1,
            None => {
                self.gesture = Some(Gesture {
                    depth: 1,
                    batches: Vec::new(),
                    inverses: Vec::new(),
                    selection_before: self.selection.clone(),
                });
            }
        }
        self.history.begin(Context {
            selection: self.selection.clone(),
            scene: None,
        });
    }

    /// Commit the gesture as one history entry (`HISB-2`).
    ///
    /// The entry's `redo` is the concatenation of all preview batches
    /// in order and `undo` the concatenation of their inverses in
    /// reverse order — both passed through the patch coalescer
    /// ([`crate::document::coalesce_batch`]), so a long drag records
    /// its endpoint patch rather than one patch per pointer move (the
    /// history spec's endpoint-minimality, exercised by the tool
    /// contracts).
    pub fn commit_gesture(&mut self, label: Option<String>) {
        let Some(mut gesture) = self.gesture.take() else {
            return;
        };
        if gesture.depth > 1 {
            gesture.depth -= 1;
            self.gesture = Some(gesture);
            self.history.commit(
                Vec::new(),
                Vec::new(),
                Context::default(),
                Origin::Local,
                None,
            );
            return;
        }

        let redo: Vec<Mutation> =
            crate::document::coalesce_batch(gesture.batches.into_iter().flatten().collect());
        if redo.is_empty() {
            // Nothing happened during the gesture: no entry (HISB-2
            // says *at most* one).
            self.history.abort();
            return;
        }
        let undo: Vec<Mutation> =
            crate::document::coalesce_batch(gesture.inverses.into_iter().rev().flatten().collect());
        self.history.commit(
            redo,
            undo,
            Context {
                selection: self.selection.clone(),
                scene: None,
            },
            Origin::Local,
            label,
        );
    }

    /// Abort the gesture: restore the pre-gesture state by applying the
    /// accumulated inverses in reverse, record nothing (`HISB-4`).
    pub fn abort_gesture(&mut self) {
        let Some(mut gesture) = self.gesture.take() else {
            return;
        };
        if gesture.depth > 1 {
            gesture.depth -= 1;
            self.gesture = Some(gesture);
            self.history.abort();
            return;
        }

        let mut summary = ChangeSummary::default();
        for inverse in gesture.inverses.iter().rev() {
            let applied = self
                .doc
                .apply(inverse)
                .expect("invariant: gesture inverses must apply (DOC-2)");
            self.tap(inverse, &applied.inverse, Origin::Local);
            summary.merge(&applied.summary);
        }
        self.damage.merge(&summary);
        self.selection = gesture.selection_before;
        self.prune_selection();
        self.history.abort();
        if !summary.nodes.is_empty() {
            self.notify(&summary);
        }
    }

    /// A checkpoint into the open gesture's preview stream: the number
    /// of preview batches dispatched so far (`None` when no gesture is
    /// open). Pair with [`Editor::gesture_rollback`] for live
    /// structural toggles inside one gesture — clone-on-translate's
    /// modifier OFF edge (`docs/wg/canvas/translate.md`, `TRL-5`).
    pub fn gesture_mark(&self) -> Option<usize> {
        self.gesture.as_ref().map(|g| g.batches.len())
    }

    /// Roll the open gesture back to a [`Editor::gesture_mark`]
    /// checkpoint: apply the inverses of every preview batch past the
    /// mark (newest first) and drop those batches from the frame — the
    /// rolled-back previews never reach the committed entry, so an
    /// abandoned mid-gesture structure (a clone cohort toggled off)
    /// leaves no trace in history (`TRL-5`). Selection is the caller's
    /// to restore. No-op without an open gesture or with a mark at or
    /// past the current length.
    pub fn gesture_rollback(&mut self, mark: usize) {
        let Some(gesture) = &mut self.gesture else {
            return;
        };
        if mark >= gesture.batches.len() {
            return;
        }
        let inverses: Vec<Vec<Mutation>> = gesture.inverses.drain(mark..).collect();
        gesture.batches.truncate(mark);
        let mut summary = ChangeSummary::default();
        for inverse in inverses.iter().rev() {
            let applied = self
                .doc
                .apply(inverse)
                .expect("invariant: gesture inverses must apply (DOC-2)");
            self.tap(inverse, &applied.inverse, Origin::Local);
            summary.merge(&applied.summary);
        }
        self.damage.merge(&summary);
        self.prune_selection();
        if !summary.is_empty() {
            self.notify(&summary);
        }
    }

    // -- undo / redo ------------------------------------------------------------

    /// Undo the newest entry: apply its `undo` batch silently (an undo
    /// is not itself recorded) and restore the before-context. Returns
    /// `false` when there is nothing to undo or a gesture is open.
    ///
    /// A recorded batch can stop applying — a remote change may have
    /// removed its target since it was recorded. Application is atomic
    /// (`DOC-4`), so on failure the document is unchanged; the stale
    /// entry is dropped from the stack and `false` is returned, and the
    /// next undo targets the adjacent entry (`HISB-9`).
    pub fn undo(&mut self) -> bool {
        if self.gesture.is_some() {
            return false;
        }
        let Some(entry) = self.history.undo() else {
            return false;
        };
        let batch = entry.undo.clone();
        let context = entry.context.0.clone();
        let applied = match self.doc.apply(&batch) {
            Ok(applied) => applied,
            Err(_) => {
                self.history.discard_undone();
                return false;
            }
        };
        self.damage.merge(&applied.summary);
        self.tap(&batch, &applied.inverse, Origin::Local);
        self.selection = context.selection;
        self.prune_selection();
        self.notify(&applied.summary);
        true
    }

    /// Redo the newest undone entry: apply its `redo` batch silently
    /// and restore the after-context. Stale entries drop as in
    /// [`Editor::undo`] (`HISB-9`).
    pub fn redo(&mut self) -> bool {
        if self.gesture.is_some() {
            return false;
        }
        let Some(entry) = self.history.redo() else {
            return false;
        };
        let batch = entry.redo.clone();
        let context = entry.context.1.clone();
        let applied = match self.doc.apply(&batch) {
            Ok(applied) => applied,
            Err(_) => {
                self.history.discard_redone();
                return false;
            }
        };
        self.damage.merge(&applied.summary);
        self.tap(&batch, &applied.inverse, Origin::Local);
        self.selection = context.selection;
        self.prune_selection();
        self.notify(&applied.summary);
        true
    }

    /// Roll back and **discard** the newest history entries until at
    /// most `depth` remain: each entry's `undo` batch applies silently
    /// and the entry is dropped — nothing lands on the redo stack
    /// (`vector-edit.md` VEC-2: degenerate vector authoring leaves no
    /// entry beyond the authoring frame). Returns whether anything was
    /// rescinded; a no-op while a gesture is open.
    pub fn rescind_to(&mut self, depth: usize) -> bool {
        if self.gesture.is_some() {
            return false;
        }
        let mut any = false;
        while self.history.len() > depth {
            let Some(entry) = self.history.rescind() else {
                break;
            };
            let applied = self
                .doc
                .apply(&entry.undo)
                .expect("invariant: recorded undo batch must apply (HISB-1)");
            self.damage.merge(&applied.summary);
            self.tap(&entry.undo, &applied.inverse, Origin::Local);
            self.selection = entry.context.0.selection;
            self.prune_selection();
            self.notify(&applied.summary);
            any = true;
        }
        any
    }

    // -- observation --------------------------------------------------------------

    /// Subscribe to change summaries. Returns an observer token.
    ///
    /// M1 is coarse: every observer sees every applied batch (`ED-2`
    /// selector granularity is not yet implemented — see module docs).
    pub fn observe(&mut self, observer: Observer) -> usize {
        self.observers.push(observer);
        self.observers.len() - 1
    }

    /// Install (or clear) the applied-batch tap. At most one tap; the
    /// sync layer owns it while a session is active.
    pub fn set_applied_tap(&mut self, tap: Option<AppliedTap>) {
        self.applied_tap = tap;
    }

    fn tap(&mut self, batch: &[Mutation], inverse: &[Mutation], origin: Origin) {
        if let Some(tap) = self.applied_tap.as_mut() {
            tap(batch, inverse, origin);
        }
    }

    // -- damage (ED-8, frame.md) -------------------------------------------------

    /// Drain the damage ledger: everything applied since the previous
    /// drain, merged into one summary. The presentation host calls
    /// this at its reflect point (`FRAME-2`); a drain with no
    /// intervening applies returns an empty summary (`FRAME-4`).
    pub fn take_damage(&mut self) -> ChangeSummary {
        std::mem::take(&mut self.damage)
    }

    fn notify(&mut self, summary: &ChangeSummary) {
        if self.observers.is_empty() {
            return;
        }
        // Take the observers out so each one can borrow `&self` for
        // queries during notification (ED-1).
        let mut observers = std::mem::take(&mut self.observers);
        for observer in observers.iter_mut() {
            observer(self, summary);
        }
        self.observers = observers;
    }

    // -- queries (ED-5: pure — never mutate, never notify) -------------------------

    /// The working copy (read-only).
    pub fn document(&self) -> &WorkingCopy {
        &self.doc
    }

    /// The current selection.
    pub fn selection(&self) -> &[Id] {
        &self.selection
    }

    /// Replace the selection (not recorded in history for M1). Ids not
    /// present in the document are dropped (`ED-7` — the selection
    /// integrity invariant holds on entry too, not just after
    /// mutations).
    pub fn set_selection(&mut self, selection: Vec<Id>) {
        self.selection = selection;
        self.prune_selection();
    }

    /// Selection integrity (`ED-7`): the selection only ever holds ids
    /// that exist in the document. Applied whenever the document or
    /// the selection changes, so a batch that removes selected nodes
    /// (local delete, remote sync, undo of an insert) can never leave
    /// stale ids behind to poison the next selection-driven batch.
    fn prune_selection(&mut self) {
        if !self.selection.is_empty() {
            let doc = &self.doc;
            self.selection.retain(|id| doc.contains(id));
        }
    }

    /// A node's opacity.
    pub fn node_opacity(&self, id: &Id) -> Option<f32> {
        self.doc.node_opacity(id)
    }

    /// A node's position (absolute translation components).
    pub fn node_position(&self, id: &Id) -> Option<(f32, f32)> {
        self.doc.node_position(id)
    }

    /// A node's world transform (local → canvas), composing the whole
    /// ancestor chain — the placement overlay chrome and pointer
    /// mapping project through (see
    /// [`WorkingCopy::node_world_transform`]).
    pub fn node_world_transform(&self, id: &Id) -> math2::transform::AffineTransform {
        self.doc.node_world_transform(id)
    }

    /// A node's concrete `(width, height)` (nodes with a plain `Size`).
    pub fn node_size(&self, id: &Id) -> Option<(f32, f32)> {
        self.doc.node_size(id)
    }

    /// A node's fill color when its fills are exactly one solid paint.
    pub fn node_fill_solid(&self, id: &Id) -> Option<grida::cg::prelude::CGColor> {
        self.doc.node_fill_solid(id)
    }

    /// A node's whole fill stack (bottom→top paint order), or `None`
    /// for kinds that carry no fills — the Fills-section capability
    /// gate and the `fills` patch domain.
    pub fn node_fills(&self, id: &Id) -> Option<grida::cg::prelude::Paints> {
        self.doc.node_fills(id)
    }

    /// A node's whole stroke paint stack (bottom→top paint order), or
    /// `None` for kinds that carry no strokes — the Strokes-section
    /// capability gate and the `strokes` patch domain.
    pub fn node_strokes(&self, id: &Id) -> Option<grida::cg::prelude::Paints> {
        self.doc.node_strokes(id)
    }

    /// A node's whole layer-effects bag (clone), or `None` for kinds that
    /// carry no effects — the Effects-section capability gate and the
    /// effect patch domains' read side.
    pub fn node_effects(&self, id: &Id) -> Option<grida::node::schema::LayerEffects> {
        self.doc.node_effects(id)
    }

    /// A node's uniform stroke weight (px).
    pub fn node_stroke_width(&self, id: &Id) -> Option<f32> {
        self.doc.node_stroke_width(id)
    }

    /// A node's stroke alignment (`None` without a stroke style).
    pub fn node_stroke_align(&self, id: &Id) -> Option<grida::cg::prelude::StrokeAlign> {
        self.doc.node_stroke_align(id)
    }

    /// A node's stroke cap.
    pub fn node_stroke_cap(&self, id: &Id) -> Option<grida::cg::prelude::StrokeCap> {
        self.doc.node_stroke_cap(id)
    }

    /// A node's stroke join.
    pub fn node_stroke_join(&self, id: &Id) -> Option<grida::cg::prelude::StrokeJoin> {
        self.doc.node_stroke_join(id)
    }

    /// A node's miter limit.
    pub fn node_stroke_miter(&self, id: &Id) -> Option<f32> {
        self.doc.node_stroke_miter(id)
    }

    /// A node's dash pattern (empty = solid).
    pub fn node_stroke_dash(&self, id: &Id) -> Option<Vec<f32>> {
        self.doc.node_stroke_dash(id)
    }

    /// A node's rotation in radians (transform-based kinds).
    pub fn node_rotation(&self, id: &Id) -> Option<f32> {
        self.doc.node_rotation(id)
    }

    /// A node's layer blend mode (`None` for kinds without one).
    pub fn node_blend_mode(&self, id: &Id) -> Option<grida::cg::prelude::LayerBlendMode> {
        self.doc.node_blend_mode(id)
    }

    /// A node's uniform corner radius (`None` for kinds without one).
    pub fn node_corner_radius(&self, id: &Id) -> Option<f32> {
        self.doc.node_corner_radius(id)
    }

    /// A node's polygon / star point count (`None` otherwise).
    pub fn node_point_count(&self, id: &Id) -> Option<usize> {
        self.doc.node_point_count(id)
    }

    /// A container's content-clipping flag (`None` for non-containers).
    pub fn node_clips_content(&self, id: &Id) -> Option<bool> {
        self.doc.node_clips_content(id)
    }

    /// A node's horizontal text alignment (`None` for non-text).
    pub fn node_text_align(&self, id: &Id) -> Option<grida::cg::prelude::TextAlign> {
        self.doc.node_text_align(id)
    }

    /// A node's text content (TextSpan only).
    pub fn node_text(&self, id: &Id) -> Option<String> {
        self.doc.node_text(id)
    }

    /// A node's vertical text alignment (`None` for non-text).
    pub fn node_text_align_vertical(
        &self,
        id: &Id,
    ) -> Option<grida::cg::prelude::TextAlignVertical> {
        self.doc.node_text_align_vertical(id)
    }

    /// A node's font size in px (`None` for non-text).
    pub fn node_font_size(&self, id: &Id) -> Option<f32> {
        self.doc.node_font_size(id)
    }

    /// A node's font weight 1–1000 (`None` for non-text).
    pub fn node_font_weight(&self, id: &Id) -> Option<u32> {
        self.doc.node_font_weight(id)
    }

    /// A node's italic flag (`None` for non-text).
    pub fn node_font_italic(&self, id: &Id) -> Option<bool> {
        self.doc.node_font_italic(id)
    }

    /// A node's line-height authoring multiplier (`None` for non-text).
    pub fn node_line_height(&self, id: &Id) -> Option<f32> {
        self.doc.node_line_height(id)
    }

    /// A node's letter-spacing magnitude (`None` for non-text).
    pub fn node_letter_spacing(&self, id: &Id) -> Option<f32> {
        self.doc.node_letter_spacing(id)
    }

    /// A Vector node's network as a polyline, when it is one.
    pub fn node_vector_polyline(&self, id: &Id) -> Option<Vec<(f32, f32)>> {
        self.doc.node_vector_polyline(id)
    }

    /// A Vector node's full network (`vector-edit.md`).
    pub fn node_vector_network(&self, id: &Id) -> Option<grida::vectornetwork::VectorNetwork> {
        self.doc.node_vector_network(id)
    }

    /// Children of `parent` in document order (`None` = root level).
    pub fn children(&self, parent: Option<&Id>) -> Vec<Id> {
        self.doc.children(parent)
    }

    /// The scene's ruler guides (`ruler.md`, `RUL-4`).
    pub fn guides(&self) -> &[crate::document::Guide] {
        self.doc.guides()
    }

    /// The scene's background color (`None` = no background; the
    /// transparency grid shows).
    pub fn background_color(&self) -> Option<grida::cg::prelude::CGColor> {
        self.doc.background_color()
    }

    /// Number of undoable history entries.
    pub fn history_len(&self) -> usize {
        self.history.len()
    }

    /// Whether Undo / Redo would do something — the menu enablement
    /// gate (`MENU-2`), mirroring [`Self::undo`]'s mid-gesture refusal.
    pub fn can_undo(&self) -> bool {
        self.gesture.is_none() && self.history.can_undo()
    }

    pub fn can_redo(&self) -> bool {
        self.gesture.is_none() && self.history.can_redo()
    }

    /// Read-only history access (for conformance tests).
    pub fn history(&self) -> &History<Vec<Mutation>> {
        &self.history
    }
}
