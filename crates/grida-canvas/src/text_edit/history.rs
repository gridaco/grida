use super::time::{Duration, Instant};

use super::TextEditorState;

const DEFAULT_MAX_ENTRIES: usize = 200;
const DEFAULT_MERGE_TIMEOUT: Duration = Duration::from_secs(2);

// ---------------------------------------------------------------------------
// EditKind – classifies text-mutating commands for merge decisions
// ---------------------------------------------------------------------------

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum EditKind {
    Typing,
    Backspace,
    Delete,
    Paste,
    ImeCommit,
    Newline,
    /// Cut (deleteByCut) — selection deleted via clipboard cut.
    /// Never merges with adjacent edits.
    Cut,
    /// A style-only change (bold, italic, font size, etc.).
    /// Never merges with text-editing kinds.
    Style,
}

impl EditKind {
    pub fn is_mergeable(self) -> bool {
        matches!(self, Self::Typing | Self::Backspace | Self::Delete)
    }
}

// ---------------------------------------------------------------------------
// HistoryEntry<S>
// ---------------------------------------------------------------------------

struct HistoryEntry<S> {
    state: S,
    kind: EditKind,
    timestamp: Instant,
}

// ---------------------------------------------------------------------------
// GenericEditHistory<S> – snapshot-based undo/redo, generic over state type
// ---------------------------------------------------------------------------

/// A snapshot-based undo/redo stack, generic over the state type `S`.
///
/// The history stores snapshots of the state **before** each edit.
/// Consecutive edits of the same mergeable kind within the merge timeout
/// are grouped into a single undo step.
///
/// `S` must implement `Clone` so snapshots can be captured. For plain-text
/// editing, `S = TextEditorState`. For rich-text editing, `S` should include
/// both the editor state and the attributed text content.
pub struct GenericEditHistory<S> {
    undo_stack: Vec<HistoryEntry<S>>,
    redo_stack: Vec<HistoryEntry<S>>,
    max_entries: usize,
    merge_timeout: Duration,
}

impl<S: Clone> GenericEditHistory<S> {
    pub fn new() -> Self {
        Self {
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            max_entries: DEFAULT_MAX_ENTRIES,
            merge_timeout: DEFAULT_MERGE_TIMEOUT,
        }
    }

    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    pub fn clear(&mut self) {
        self.undo_stack.clear();
        self.redo_stack.clear();
    }

    /// Returns `true` if a `push` with this `kind` would merge into the
    /// existing top-of-stack entry (i.e. the snapshot would be discarded).
    ///
    /// Use this to avoid expensive snapshot creation when the result would
    /// be thrown away anyway.
    pub fn would_merge(&self, kind: EditKind) -> bool {
        if kind.is_mergeable() {
            if let Some(top) = self.undo_stack.last() {
                let elapsed = top.timestamp.elapsed();
                // Guard: if elapsed is zero the clock may be frozen (wasm32
                // without Instant::advance).  Refuse to merge so undo
                // granularity is preserved even when the host never drives
                // the clock.
                return elapsed > Duration::ZERO
                    && elapsed < self.merge_timeout
                    && top.kind == kind;
            }
        }
        false
    }

    /// Record a merge into the top-of-stack entry without creating a snapshot.
    ///
    /// Call this when `would_merge(kind)` returned `true` to update the
    /// merge timestamp and clear the redo stack without allocating.
    pub fn push_merge(&mut self, kind: EditKind) {
        debug_assert!(
            self.would_merge(kind),
            "push_merge called when would_merge is false"
        );
        if let Some(top) = self.undo_stack.last_mut() {
            top.timestamp = Instant::now();
        }
        self.redo_stack.clear();
    }

    /// Record the state **before** an edit.
    ///
    /// If the top of the undo stack has the same mergeable kind and the
    /// elapsed time since that entry is within `merge_timeout`, the push is
    /// skipped (we keep the older snapshot so that undo jumps back to the
    /// state before the entire merged run).
    ///
    /// Any pending redo stack is cleared on push.
    pub fn push(&mut self, state_before: &S, kind: EditKind) {
        if kind.is_mergeable() {
            if let Some(top) = self.undo_stack.last_mut() {
                let elapsed = top.timestamp.elapsed();
                // Same zero-elapsed guard as `would_merge`: a frozen clock
                // must not cause unbounded merge.
                if top.kind == kind && elapsed > Duration::ZERO && elapsed < self.merge_timeout {
                    top.timestamp = Instant::now();
                    self.redo_stack.clear();
                    return;
                }
            }
        }

        self.undo_stack.push(HistoryEntry {
            state: state_before.clone(),
            kind,
            timestamp: Instant::now(),
        });

        if self.undo_stack.len() > self.max_entries {
            self.undo_stack.remove(0);
        }

        self.redo_stack.clear();
    }

    /// Undo: saves `current` onto the redo stack and returns the previous state.
    pub fn undo(&mut self, current: &S) -> Option<S> {
        let entry = self.undo_stack.pop()?;
        self.redo_stack.push(HistoryEntry {
            state: current.clone(),
            kind: entry.kind,
            timestamp: Instant::now(),
        });
        Some(entry.state)
    }

    /// Redo: saves `current` onto the undo stack and returns the next state.
    pub fn redo(&mut self, current: &S) -> Option<S> {
        let entry = self.redo_stack.pop()?;
        self.undo_stack.push(HistoryEntry {
            state: current.clone(),
            kind: entry.kind,
            timestamp: Instant::now(),
        });
        Some(entry.state)
    }
}

impl<S: Clone> Default for GenericEditHistory<S> {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// EditHistory – the plain-text specialization (backward compatible)
// ---------------------------------------------------------------------------

/// Plain-text edit history. Type alias preserving backward compatibility.
pub type EditHistory = GenericEditHistory<TextEditorState>;

// ---------------------------------------------------------------------------
// Test-only helpers
// ---------------------------------------------------------------------------

#[cfg(test)]
impl<S: Clone> GenericEditHistory<S> {
    /// Create a history with a custom merge timeout (useful for testing).
    pub fn with_merge_timeout(timeout: Duration) -> Self {
        Self {
            merge_timeout: timeout,
            ..Self::new()
        }
    }

    /// Force-expire the timestamp on the top undo entry so the next push
    /// of the same kind will NOT merge.
    pub fn expire_top(&mut self) {
        if let Some(top) = self.undo_stack.last_mut() {
            top.timestamp -= self.merge_timeout + Duration::from_millis(1);
        }
    }

    pub fn undo_len(&self) -> usize {
        self.undo_stack.len()
    }

    pub fn redo_len(&self) -> usize {
        self.redo_stack.len()
    }

    pub fn with_max_entries(max: usize) -> Self {
        Self {
            max_entries: max,
            ..Self::new()
        }
    }
}
