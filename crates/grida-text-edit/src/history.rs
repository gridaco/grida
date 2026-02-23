use std::time::{Duration, Instant};

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
}

impl EditKind {
    pub fn is_mergeable(self) -> bool {
        matches!(self, Self::Typing | Self::Backspace | Self::Delete)
    }
}

// ---------------------------------------------------------------------------
// HistoryEntry
// ---------------------------------------------------------------------------

struct HistoryEntry {
    state: TextEditorState,
    kind: EditKind,
    timestamp: Instant,
}

// ---------------------------------------------------------------------------
// EditHistory
// ---------------------------------------------------------------------------

pub struct EditHistory {
    undo_stack: Vec<HistoryEntry>,
    redo_stack: Vec<HistoryEntry>,
    max_entries: usize,
    merge_timeout: Duration,
}

impl EditHistory {
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

    /// Record the state **before** an edit.
    ///
    /// If the top of the undo stack has the same mergeable kind and the
    /// elapsed time since that entry is within `merge_timeout`, the push is
    /// skipped (we keep the older snapshot so that undo jumps back to the
    /// state before the entire merged run).
    ///
    /// Any pending redo stack is cleared on push.
    pub fn push(&mut self, state_before: &TextEditorState, kind: EditKind) {
        if kind.is_mergeable() {
            if let Some(top) = self.undo_stack.last_mut() {
                if top.kind == kind && top.timestamp.elapsed() < self.merge_timeout {
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
    pub fn undo(&mut self, current: &TextEditorState) -> Option<TextEditorState> {
        let entry = self.undo_stack.pop()?;
        self.redo_stack.push(HistoryEntry {
            state: current.clone(),
            kind: entry.kind,
            timestamp: Instant::now(),
        });
        Some(entry.state)
    }

    /// Redo: saves `current` onto the undo stack and returns the next state.
    pub fn redo(&mut self, current: &TextEditorState) -> Option<TextEditorState> {
        let entry = self.redo_stack.pop()?;
        self.undo_stack.push(HistoryEntry {
            state: current.clone(),
            kind: entry.kind,
            timestamp: Instant::now(),
        });
        Some(entry.state)
    }
}

impl Default for EditHistory {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Test-only helpers
// ---------------------------------------------------------------------------

#[cfg(test)]
impl EditHistory {
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
