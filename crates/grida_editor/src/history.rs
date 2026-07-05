//! History — entries as data, gesture framing, immutable committed
//! entries (`HISB-*`).
//!
//! Reference implementation of `crates/grida_editor/docs/history.md`. This module
//! is **pure**: it stores entries and never applies anything — the
//! editor applies batches. It is generic over the batch type `M` and
//! has no `grida` imports, so the `HISB-*` contracts are testable with
//! toy batch types.
//!
//! A committed entry is immutable: the stack never merges, rewrites,
//! or absorbs entries after the fact (`HISB-3`). Where a burst of
//! discrete edits should read as one step, the *interaction layer*
//! frames it — the gesture frame stays open across the burst — and
//! this module only ever sees the one committed endpoint pair. There
//! is consequently no clock in here: time belongs to framing, not to
//! the stack.

/// Where a change came from. `Remote` and `Agent` dispatches never
/// produce local history entries (`ED-3`, `HISB-5`) — that rule is
/// enforced by the editor; history just stores what it is given.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Origin {
    Local,
    Remote,
    Agent,
}

/// Authoring context captured around an entry (selection, active
/// scene). Concrete for M1; edit-mode context comes later.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Context {
    pub selection: Vec<String>,
    pub scene: Option<String>,
}

/// A history entry: a pair of batches plus context. Because mutations
/// are invertible, serializable data (`DOC-2`, `DOC-3`), an entry needs
/// no captured behavior.
#[derive(Debug, Clone)]
pub struct Entry<M> {
    /// Applies the change.
    pub redo: M,
    /// The inverse batch.
    pub undo: M,
    /// Authoring context `(before, after)`.
    pub context: (Context, Context),
    /// Where the change came from.
    pub origin: Origin,
    /// Human-readable step name (e.g. `"translate"`) for undo
    /// affordances. Display only — never keys any stack decision.
    pub label: Option<String>,
}

/// A linear undo/redo stack with transactions (gesture framing) and a
/// depth bound (`HISB-7`).
#[derive(Debug)]
pub struct History<M> {
    past: Vec<Entry<M>>,
    future: Vec<Entry<M>>,
    max_depth: usize,
    /// Transaction nesting depth; only the outermost commit records.
    txn_depth: usize,
    /// Context captured at the outermost `begin`.
    txn_before: Option<Context>,
}

impl<M> History<M> {
    pub fn new(max_depth: usize) -> Self {
        Self {
            past: Vec::new(),
            future: Vec::new(),
            max_depth,
            txn_depth: 0,
            txn_before: None,
        }
    }

    /// Number of undoable entries.
    pub fn len(&self) -> usize {
        self.past.len()
    }

    pub fn is_empty(&self) -> bool {
        self.past.is_empty()
    }

    /// Number of redoable entries.
    pub fn future_len(&self) -> usize {
        self.future.len()
    }

    /// The newest undoable entry.
    pub fn peek(&self) -> Option<&Entry<M>> {
        self.past.last()
    }

    /// Reset all stacks and transaction state (for document reload).
    pub fn clear(&mut self) {
        self.past.clear();
        self.future.clear();
        self.txn_depth = 0;
        self.txn_before = None;
    }

    /// Record an entry. A new record clears the redo stack (linearity).
    /// The entry is stored as committed — immutable from here on
    /// (`HISB-3`).
    pub fn record(&mut self, entry: Entry<M>) {
        self.future.clear();
        self.past.push(entry);
        if self.past.len() > self.max_depth {
            // HISB-7: evict oldest only.
            self.past.remove(0);
        }
    }

    /// Pop the newest entry from past to future and return it. The
    /// caller applies its `undo` batch and restores the before-context;
    /// history applies nothing.
    pub fn undo(&mut self) -> Option<&Entry<M>> {
        let entry = self.past.pop()?;
        self.future.push(entry);
        self.future.last()
    }

    /// Pop the newest entry from future back to past and return it.
    /// The caller applies its `redo` batch and restores the
    /// after-context.
    pub fn redo(&mut self) -> Option<&Entry<M>> {
        let entry = self.future.pop()?;
        self.past.push(entry);
        self.past.last()
    }

    /// Pop and **discard** the newest past entry, returning it for the
    /// caller to apply its `undo` batch. Unlike [`History::undo`], the
    /// entry does not move to the redo stack — it ceases to exist, and
    /// the redo stack clears with it (a rescinded timeline cannot be
    /// redone into). This is the degenerate-exit path of vector edit
    /// mode (`docs/wg/feat-vector-network/vector-edit.md` VEC-2: empty authoring
    /// leaves no trace beyond the authoring frame).
    pub fn rescind(&mut self) -> Option<Entry<M>> {
        self.future.clear();
        self.past.pop()
    }

    /// Drop the most recently undone entry (the future top) without
    /// applying it. The editor calls this when the entry's batch no
    /// longer applies — e.g. its target was removed by a remote change
    /// (`HISB-9`); the next undo targets the adjacent entry.
    pub fn discard_undone(&mut self) -> Option<Entry<M>> {
        self.future.pop()
    }

    /// Drop the most recently redone entry (the past top) without
    /// applying it (`HISB-9`, redo direction).
    pub fn discard_redone(&mut self) -> Option<Entry<M>> {
        self.past.pop()
    }

    /// Open a transaction (gesture framing). During a transaction
    /// nothing is recorded; the editor accumulates the endpoint batches
    /// and hands them to [`History::commit`]. Nested `begin`s fold into
    /// the parent — only the outermost commit records (`HISB-8` shape).
    pub fn begin(&mut self, context_before: Context) {
        if self.txn_depth == 0 {
            self.txn_before = Some(context_before);
        }
        self.txn_depth += 1;
    }

    /// Close a transaction level. On the outermost commit, records one
    /// entry from the endpoint batches (`HISB-2`); nested commits
    /// record nothing (their arguments are discarded — the outermost
    /// caller owns the endpoints).
    pub fn commit(
        &mut self,
        redo: M,
        undo: M,
        context_after: Context,
        origin: Origin,
        label: Option<String>,
    ) {
        if self.txn_depth == 0 {
            // Unbalanced commit: caller bug; ignore rather than corrupt.
            return;
        }
        self.txn_depth -= 1;
        if self.txn_depth > 0 {
            return;
        }
        let before = self.txn_before.take().unwrap_or_default();
        self.record(Entry {
            redo,
            undo,
            context: (before, context_after),
            origin,
            label,
        });
    }

    /// Close a transaction level without recording (`HISB-4`). The
    /// editor is responsible for restoring the pre-gesture state.
    pub fn abort(&mut self) {
        if self.txn_depth == 0 {
            return;
        }
        self.txn_depth -= 1;
        if self.txn_depth == 0 {
            self.txn_before = None;
        }
    }
}
