//! ENG-5.1 · time as data. A `Transaction` (step 9) groups the typed ops
//! of one gesture with all-or-nothing history semantics; it records each
//! `(Op, OpResult)` — including typed errors, which are deterministic
//! document no-ops and a stronger determinism proof. The journal is a
//! recorder, not the undo mechanism: undo stays document snapshots
//! (ENG-5.5) until an op's inverse is property-tested. It lands on
//! `anchor_lab::ops::Op` (step 4).

use anchor_lab::ops::{Op, OpResult};

/// The session op-log: every issued op in order with its result (errors
/// included — deterministic document no-ops, and a stronger determinism
/// proof). This is the replay source of truth (`replay` reads [`Journal::ops`]).
/// It RECORDS; it does not undo — undo stays document snapshots (ENG-5.5),
/// which give all-or-nothing history without an invertible op set. Per-gesture
/// grouping (a labeled transaction) is a display layer to add later; replay
/// needs only the flat issue order.
#[derive(Debug, Clone, Default)]
pub struct Journal {
    entries: Vec<(Op, OpResult)>,
}

impl Journal {
    pub fn new() -> Self {
        Journal::default()
    }

    /// Record one applied op and its result, in issue order.
    pub fn record(&mut self, op: Op, result: OpResult) {
        self.entries.push((op, result));
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// The ops in issue order — the replay log.
    pub fn ops(&self) -> impl Iterator<Item = &Op> + '_ {
        self.entries.iter().map(|(op, _)| op)
    }

    /// The full record, ops and results.
    pub fn entries(&self) -> &[(Op, OpResult)] {
        &self.entries
    }

    /// Whether any op recorded at or after `mark` actually wrote (`Ok(n>0)`)
    /// — the "did anything change" test a gesture uses to keep or drop its
    /// undo snapshot.
    pub fn wrote_since(&self, mark: usize) -> bool {
        self.entries[mark..]
            .iter()
            .any(|(_, r)| matches!(r, Ok(n) if *n > 0))
    }
}
