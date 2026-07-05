//! Sync — multi-instance replication, pure logic (`SYNC-*`).
//!
//! Reference implementation of `docs/wg/feat-crdt/sync.md`: optimistic,
//! authority-ordered. This module is transport-free — it consumes and
//! produces [`Msg`] values (see [`crate::sync_net`] for the transports)
//! and drives an [`Editor`] for state; the full contract suite runs
//! over an in-process loopback (SYNC-8).
//!
//! ## Roles
//!
//! - [`SyncAuthority`] — the first instance (the listener). Its editor
//!   document **is** canonical: accepted remote submits apply to it
//!   immediately (with `Remote` origin, never recorded — ED-3), get a
//!   global order id, and broadcast to everyone including an echo-ack
//!   to the sender. Submits that fail against canonical are rejected
//!   silently (the sender independently drops them on rebase — see
//!   below). The authority's own local edits are canonical the moment
//!   they apply; [`SyncAuthority::order_local`] just assigns them an
//!   order id for broadcast.
//! - [`SyncClient`] — every other instance. Maintains the three-layer
//!   model over its editor: canonical (authority-confirmed),
//!   speculative (sent, unacknowledged), unsent. The rendered working
//!   copy is always `canonical + speculative + unsent`.
//!
//! ## Rebase (on receiving a remote commit)
//!
//! Roll back unsent then speculative (apply their inverses, `Remote`
//! origin, silent — never recorded, SYNC-5/HISB-5), apply the
//! authority batch, then re-apply speculative and unsent in order,
//! capturing fresh inverses. A re-application that no longer validates
//! is **dropped** and the session continues (SYNC-4).
//!
//! ## Drop consistency (documented invariant)
//!
//! A client drops a speculative batch exactly when the authority will
//! reject the corresponding submit: both validate the same batch
//! against the same canonical prefix (the client re-applies over
//! canonical + its earlier speculative batches; the authority applies
//! the same sender's submits in the same order over the same canonical
//! state). No explicit reject message is needed. Exactly-once
//! (SYNC-7) is by sequence id on both sides: per-sender at the
//! authority, global at the client, with out-of-order buffering.
//!
//! ## Known M1 limitation
//!
//! A local history entry whose batch was dropped on rebase stays in
//! the local stack; undoing past it after the target vanished is
//! undefined (the spec's conflict-prevention non-goal). The contract
//! tests do not exercise it.

use std::collections::{BTreeMap, HashMap, VecDeque};

use crate::document::Mutation;
use crate::editor::{Editor, Recording};
use crate::history::Origin;
use crate::wire::{self, Msg, WireError, WireMutation};

/// A sync failure. `Desync` means the instance can no longer prove it
/// matches canonical (protocol bug or invariant breach) — the session
/// should end; SYNC-4 drops are *not* errors.
#[derive(Debug)]
pub enum SyncError {
    /// State diverged from the protocol's invariants.
    Desync(String),
    /// A local batch could not be encoded for the wire.
    Encode(WireError),
}

impl std::fmt::Display for SyncError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SyncError::Desync(what) => write!(f, "sync desync: {what}"),
            SyncError::Encode(e) => write!(f, "sync encode: {e}"),
        }
    }
}

impl std::error::Error for SyncError {}

/// A local batch in flight: the batch, its current inverse (refreshed
/// on every rebase re-application), and its per-sender seq (0 while
/// unsent).
#[derive(Debug, Clone)]
struct LocalBatch {
    seq: u64,
    batch: Vec<Mutation>,
    inverse: Vec<Mutation>,
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/// The per-instance replication state machine (see module docs).
pub struct SyncClient {
    sender: String,
    /// Last per-sender sequence id assigned to an outgoing batch.
    last_seq: u64,
    /// Last applied global order id (canonical position).
    applied_global: u64,
    /// Sent but unacknowledged, in send order.
    speculative: VecDeque<LocalBatch>,
    /// Queued locally, not yet sent, in queue order.
    unsent: VecDeque<LocalBatch>,
    /// Commits that arrived ahead of order, keyed by global id.
    pending: BTreeMap<u64, (String, u64, Vec<WireMutation>)>,
}

impl SyncClient {
    /// A fresh client with a unique sender id.
    pub fn new(sender: impl Into<String>) -> Self {
        Self {
            sender: sender.into(),
            last_seq: 0,
            applied_global: 0,
            speculative: VecDeque::new(),
            unsent: VecDeque::new(),
            pending: BTreeMap::new(),
        }
    }

    /// This instance's sender id.
    pub fn sender(&self) -> &str {
        &self.sender
    }

    /// Number of sent-but-unacknowledged batches.
    pub fn speculative_len(&self) -> usize {
        self.speculative.len()
    }

    /// Number of queued-but-unsent batches.
    pub fn unsent_len(&self) -> usize {
        self.unsent.len()
    }

    /// Adopt the canonical state delivered by a Welcome (the caller
    /// loads the document into the editor; see
    /// [`SyncClient::on_welcome`] for the packaged version).
    pub fn set_canonical(&mut self, global: u64) {
        self.applied_global = global;
        self.pending.clear();
        self.speculative.clear();
        self.unsent.clear();
        self.last_seq = 0;
    }

    /// Handle a Welcome: load the canonical document into the editor,
    /// adopt the guide set it carries (the `.grida` bytes cannot —
    /// see `ruler.md`'s persistence note), and adopt its global
    /// position.
    pub fn on_welcome(
        &mut self,
        editor: &mut Editor,
        doc: &[u8],
        global: u64,
        guides: &[wire::WireGuide],
    ) -> Result<(), SyncError> {
        let (scene, id_map) = crate::io::decode_document(doc)
            .map_err(|e| SyncError::Desync(format!("welcome document: {e}")))?;
        editor.load(scene, id_map);
        if !guides.is_empty() {
            let batch: Vec<Mutation> = guides
                .iter()
                .enumerate()
                .map(|(index, g)| Mutation::GuideInsert {
                    index,
                    guide: (*g).into(),
                })
                .collect();
            editor
                .dispatch(batch, Origin::Remote, Recording::Silent)
                .map_err(|e| SyncError::Desync(format!("welcome guides: {e}")))?;
        }
        self.set_canonical(global);
        Ok(())
    }

    /// Queue an already-applied local batch (with its inverse) for
    /// submission. The batch is part of the rendered state already —
    /// optimistic echo (SYNC-2) is the editor's normal local apply.
    pub fn queue_local(&mut self, batch: Vec<Mutation>, inverse: Vec<Mutation>) {
        self.unsent.push_back(LocalBatch {
            seq: 0,
            batch,
            inverse,
        });
    }

    /// Move unsent batches to the speculative layer and return their
    /// Submit messages (per-sender monotonic seq ids).
    pub fn take_outgoing(&mut self) -> Result<Vec<Msg>, SyncError> {
        let mut out = Vec::with_capacity(self.unsent.len());
        while let Some(front) = self.unsent.front() {
            // Encode before consuming so an unsupported-kind batch
            // stays queued rather than getting lost (wire module docs:
            // kinds outside the subset cannot sync).
            let batch = wire::encode_batch(&front.batch).map_err(SyncError::Encode)?;
            let mut local = self
                .unsent
                .pop_front()
                .expect("invariant: front() was Some");
            self.last_seq += 1;
            local.seq = self.last_seq;
            out.push(Msg::Submit {
                sender: self.sender.clone(),
                seq: local.seq,
                batch,
            });
            self.speculative.push_back(local);
        }
        Ok(out)
    }

    /// Handle a Commit from the authority. Returns whether the
    /// document changed (the shell re-flushes the renderer on `true`).
    ///
    /// Exactly-once (SYNC-7): commits at or below the applied global
    /// position are ignored; commits ahead of the next position are
    /// buffered and applied in order.
    pub fn on_commit(
        &mut self,
        editor: &mut Editor,
        global: u64,
        sender: String,
        seq: u64,
        batch: Vec<WireMutation>,
    ) -> Result<bool, SyncError> {
        if global <= self.applied_global {
            return Ok(false); // duplicate delivery
        }
        self.pending.insert(global, (sender, seq, batch));

        let mut changed = false;
        while let Some(entry) = self.pending.remove(&(self.applied_global + 1)) {
            let (sender, seq, batch) = entry;
            changed |= self.apply_commit(editor, sender, seq, batch)?;
            self.applied_global += 1;
        }
        Ok(changed)
    }

    fn apply_commit(
        &mut self,
        editor: &mut Editor,
        sender: String,
        seq: u64,
        batch: Vec<WireMutation>,
    ) -> Result<bool, SyncError> {
        if sender == self.sender {
            // Echo-ack of our own speculative front: canonical now
            // contains it; no observable state change (SYNC-2).
            match self.speculative.pop_front() {
                Some(front) if front.seq == seq => Ok(false),
                Some(front) => Err(SyncError::Desync(format!(
                    "echo seq {seq} does not match speculative front {}",
                    front.seq
                ))),
                None => Err(SyncError::Desync(format!(
                    "echo seq {seq} with empty speculative layer"
                ))),
            }
        } else {
            // Rebase: roll back unsent + speculative (reverse of
            // application order), apply the authority batch, re-apply.
            for local in self
                .unsent
                .iter()
                .rev()
                .chain(self.speculative.iter().rev())
            {
                editor
                    .dispatch(local.inverse.clone(), Origin::Remote, Recording::Silent)
                    .map_err(|e| SyncError::Desync(format!("rollback failed: {e}")))?;
            }

            editor
                .dispatch(
                    wire::decode_batch(&batch),
                    Origin::Remote,
                    Recording::Silent,
                )
                .map_err(|e| {
                    SyncError::Desync(format!("authority batch failed against canonical: {e}"))
                })?;

            // Re-apply, dropping batches canonical now invalidates
            // (SYNC-4) and refreshing inverses of the survivors.
            self.speculative = Self::reapply(editor, std::mem::take(&mut self.speculative));
            self.unsent = Self::reapply(editor, std::mem::take(&mut self.unsent));
            Ok(true)
        }
    }

    fn reapply(editor: &mut Editor, layer: VecDeque<LocalBatch>) -> VecDeque<LocalBatch> {
        let mut kept = VecDeque::with_capacity(layer.len());
        for mut local in layer {
            match editor.dispatch_full(local.batch.clone(), Origin::Remote, Recording::Silent) {
                Ok(applied) => {
                    local.inverse = applied.inverse;
                    kept.push_back(local);
                }
                Err(_) => {
                    // Dropped (SYNC-4): the authority will reject the
                    // corresponding submit against the same canonical
                    // prefix — see module docs.
                }
            }
        }
        kept
    }
}

// ---------------------------------------------------------------------------
// Authority
// ---------------------------------------------------------------------------

/// The canonical-order assigner (see module docs). The authority
/// instance's editor document is canonical; this struct owns only the
/// ordering and exactly-once state.
pub struct SyncAuthority {
    sender: String,
    /// Last assigned global order id.
    global: u64,
    /// Per-sender last processed seq (exactly-once, SYNC-7).
    last_seq: HashMap<String, u64>,
    /// Per-sender submits that arrived ahead of order.
    pending: HashMap<String, BTreeMap<u64, Vec<WireMutation>>>,
}

impl SyncAuthority {
    /// A fresh authority with its own sender id (its local edits carry
    /// this id on the commit stream).
    pub fn new(sender: impl Into<String>) -> Self {
        Self {
            sender: sender.into(),
            global: 0,
            last_seq: HashMap::new(),
            pending: HashMap::new(),
        }
    }

    /// The authority's sender id.
    pub fn sender(&self) -> &str {
        &self.sender
    }

    /// The last assigned global order id (a Welcome for a new peer
    /// pairs the current document bytes with this).
    pub fn global(&self) -> u64 {
        self.global
    }

    /// Order an already-applied **local** batch of the authority
    /// instance itself: assigns seq + global order and returns the
    /// Commit to broadcast. (The authority's editor applied and
    /// recorded it through the normal local dispatch path.)
    pub fn order_local(&mut self, batch: &[Mutation]) -> Result<Msg, SyncError> {
        let batch = wire::encode_batch(batch).map_err(SyncError::Encode)?;
        let seq = self.last_seq.entry(self.sender.clone()).or_insert(0);
        *seq += 1;
        self.global += 1;
        Ok(Msg::Commit {
            global: self.global,
            sender: self.sender.clone(),
            seq: *seq,
            batch,
        })
    }

    /// Ingest a Submit from a peer: validate it against canonical (the
    /// authority's own editor) and return the Commits to broadcast —
    /// empty when the submit was a duplicate, buffered out-of-order,
    /// or rejected (the sender drops it independently; module docs).
    pub fn ingest(
        &mut self,
        editor: &mut Editor,
        sender: String,
        seq: u64,
        batch: Vec<WireMutation>,
    ) -> Vec<Msg> {
        let last = self.last_seq.entry(sender.clone()).or_insert(0);
        if seq <= *last {
            return Vec::new(); // duplicate delivery
        }
        self.pending
            .entry(sender.clone())
            .or_default()
            .insert(seq, batch);

        let mut out = Vec::new();
        loop {
            let last = self.last_seq.get(&sender).copied().unwrap_or(0);
            let Some(batch) = self
                .pending
                .get_mut(&sender)
                .and_then(|q| q.remove(&(last + 1)))
            else {
                break;
            };
            self.last_seq.insert(sender.clone(), last + 1);
            // Validation *is* application to canonical: never recorded
            // (Remote origin, ED-3), rejected batches leave canonical
            // untouched (DOC-4 atomicity).
            if editor
                .dispatch(
                    wire::decode_batch(&batch),
                    Origin::Remote,
                    Recording::Silent,
                )
                .is_ok()
            {
                self.global += 1;
                out.push(Msg::Commit {
                    global: self.global,
                    sender: sender.clone(),
                    seq: last + 1,
                    batch,
                });
            }
        }
        out
    }
}
