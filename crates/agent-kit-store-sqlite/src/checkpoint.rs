//! GRIDA-SEC-004 — private, owner-defined context attached to one retained conversation view.
//! A single trunk can publish. Parallel checkouts fork its last committed
//! snapshot. A checkpoint is model context and carries no permission to act.

use super::*;
use agent_kit_core::WaitId;

pub const MAX_CHECKPOINT_BYTES: usize = 128 * 1024;
const MAX_PENDING_BRANCHES: i64 = 128;

#[derive(Default)]
pub(super) struct Reservations {
    trunks: BTreeSet<Fingerprint>,
    actions: BTreeSet<(Fingerprint, TurnId, WaitId, Fingerprint)>,
}

// Wait resolution and release of its private seed share the action transaction.
pub(super) fn release_answered(
    tx: &Transaction<'_>,
    binding: &TurnBinding,
    actions: &[JournalAction],
) -> Result<()> {
    for action in actions {
        if let JournalAction::ResolveWait { wait, .. } | JournalAction::WithdrawWait(wait) = action
        {
            tx.execute(
                "DELETE FROM private_branches WHERE session=?1 AND turn=?2 AND wait=?3",
                params![
                    binding.session.as_str(),
                    binding.turn.as_str(),
                    wait.as_str()
                ],
            )
            .map_err(database_error)?;
        }
    }
    Ok(())
}

/// Holds one private branch under the store's exclusive writer lifetime.
/// Dropping a trunk checkout releases it without publishing partial work.
pub struct PrivateContext {
    store: SqliteStore,
    binding: TurnBinding,
    generation: Fingerprint,
    trunk: bool,
    wait: WaitId,
    basis: Fingerprint,
    revision: i64,
    snapshot: Option<Envelope>,
}

impl Drop for PrivateContext {
    fn drop(&mut self) {
        let mut reservations = self
            .store
            .inner
            .private_contexts
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        if self.trunk {
            reservations.trunks.remove(&self.generation);
        }
        reservations.actions.remove(&(
            self.generation,
            self.binding.turn.clone(),
            self.wait.clone(),
            self.basis,
        ));
    }
}

impl PrivateContext {
    /// The checkpoint lineage. A compatible fork starts with the same lineage.
    pub fn id(&self) -> Fingerprint {
        self.generation
    }

    pub fn is_trunk(&self) -> bool {
        self.trunk
    }

    pub fn snapshot(&self) -> Option<&Envelope> {
        self.snapshot.as_ref()
    }

    /// Publish only after verifying the issuing turn's durable action receipt.
    /// A superseded view, scope, lease or ephemeral fork cannot change the trunk.
    /// The verification and publication run without yielding under the writer lock.
    pub async fn publish(
        self,
        snapshot: Envelope,
        verify: impl FnOnce(&TurnState) -> Result<bool> + Send + 'static,
    ) -> Result<bool> {
        if !self.trunk {
            return Ok(false);
        }
        if snapshot.bytes().len() > MAX_CHECKPOINT_BYTES {
            return Err(error(
                ErrorKind::LimitExceeded,
                "private_checkpoint_too_large",
            ));
        }
        execute(self.store.inner.clone(), move |inner, db| {
            let tx = db
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let Some(state) = active_source(inner, &tx, &self.binding)? else {
                return Ok(false);
            };
            if !state
                .waits()
                .get(&self.wait)
                .is_some_and(|w| w.answer.is_some())
                || !verify(&state)?
            {
                return Ok(false);
            }
            let changed = tx
                .execute(
                    "UPDATE private_checkpoints SET snapshot=?3,revision=revision+1
                 WHERE session=?1 AND generation=?2 AND revision=?4 AND view=(
                   SELECT view FROM history_views WHERE session=?1 AND end_ordinal IS NULL)",
                    params![
                        self.binding.session.as_str(),
                        self.generation.bytes().as_slice(),
                        encode(&snapshot)?,
                        self.revision
                    ],
                )
                .map_err(database_error)?;
            tx.commit().map_err(commit_error)?;
            drop(self);
            Ok(changed == 1)
        })
        .await
    }
}

impl SqliteStore {
    /// Reserve the chat's reusable context or get a temporary fork. New scopes
    /// retire the previous generation, even when it still has an active caller.
    pub async fn private_context(
        &self,
        binding: TurnBinding,
        compatibility: Fingerprint,
        wait: WaitId,
        basis: Fingerprint,
    ) -> Result<PrivateContext> {
        let store = self.clone();
        execute(self.inner.clone(), move |_, db| {
            checkout(store, db, binding, compatibility, wait, basis)
        })
        .await
    }
}

fn checkout(
    store: SqliteStore,
    db: &mut Connection,
    binding: TurnBinding,
    compatibility: Fingerprint,
    wait: WaitId,
    basis: Fingerprint,
) -> Result<PrivateContext> {
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let Some(source) = active_source(&store.inner, &tx, &binding)? else {
        return Err(error(ErrorKind::Conflict, "private_context_source_changed"));
    };
    if !source
        .waits()
        .get(&wait)
        .is_some_and(|entry| entry.is_pending())
    {
        return Err(error(ErrorKind::Conflict, "private_context_source_changed"));
    }

    let session = binding.session.as_str();
    tx.execute(
        "DELETE FROM private_checkpoints WHERE session=?1 AND compatibility<>?2",
        params![session, compatibility.bytes().as_slice()],
    )
    .map_err(database_error)?;
    tx.execute(
        "INSERT OR IGNORE INTO private_checkpoints(session,view,compatibility,generation)
         SELECT session,view,?2,randomblob(32) FROM history_views
         WHERE session=?1 AND end_ordinal IS NULL",
        params![session, compatibility.bytes().as_slice()],
    )
    .map_err(database_error)?;
    let (id, current_revision): (Vec<u8>, i64) = tx
        .query_row(
            "SELECT generation,revision FROM private_checkpoints WHERE session=?1",
            [session],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(database_error)?;
    let generation = history::stored_identity(id)?;
    let key = (generation, binding.turn.clone(), wait.clone(), basis);
    let mut reserved = store
        .inner
        .private_contexts
        .lock()
        .unwrap_or_else(PoisonError::into_inner);
    if reserved.actions.contains(&key) {
        return Err(error(ErrorKind::Conflict, "private_context_already_owned"));
    }
    let trunk_available = !reserved.trunks.contains(&generation);
    // Pin the seed before dispatch. A recovered fork must not acquire
    // history another assessment committed after this one started.
    tx.execute(
        "INSERT OR IGNORE INTO private_branches(session,turn,wait,basis,revision,trunk,snapshot)
         SELECT session,?2,?3,?4,revision,?5,snapshot FROM private_checkpoints WHERE session=?1
         AND (SELECT count(*) FROM private_branches WHERE session=?1) < ?6",
        params![
            session,
            binding.turn.as_str(),
            wait.as_str(),
            basis.bytes().as_slice(),
            trunk_available,
            MAX_PENDING_BRANCHES
        ],
    )
    .map_err(database_error)?;
    let (revision, original_trunk, bytes): (i64, bool, Option<Vec<u8>>) = tx
        .query_row(
            "SELECT revision,trunk,snapshot FROM private_branches
         WHERE session=?1 AND turn=?2 AND wait=?3 AND basis=?4",
            params![
                session,
                binding.turn.as_str(),
                wait.as_str(),
                basis.bytes().as_slice()
            ],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| error(ErrorKind::LimitExceeded, "private_context_branch_limit"))?;
    let snapshot = bytes.as_deref().map(decode::<Envelope>).transpose()?;
    if snapshot
        .as_ref()
        .is_some_and(|v| v.bytes().len() > MAX_CHECKPOINT_BYTES)
    {
        return Err(error(ErrorKind::InvalidState, "stored_data_invalid"));
    }
    tx.commit().map_err(commit_error)?;
    let trunk = original_trunk && current_revision == revision && trunk_available;
    if trunk {
        reserved.trunks.insert(generation);
    }
    reserved.actions.insert(key);
    drop(reserved);
    Ok(PrivateContext {
        store,
        binding,
        generation,
        trunk,
        wait,
        basis,
        revision,
        snapshot,
    })
}

// Controls are rechecked even when the caller still holds its earlier checkout.
fn active_source(
    inner: &Inner,
    db: &Connection,
    binding: &TurnBinding,
) -> Result<Option<TurnState>> {
    let active: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sessions WHERE id=?1 AND active_turn=?2 AND NOT paused)",
            params![binding.session.as_str(), binding.turn.as_str()],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if !active || !has_owner(inner, binding)? {
        return Ok(None);
    }
    let state = load_turn(inner, db, &binding.session, &binding.turn)?;
    Ok((state.binding() == binding
        && state.controls().admits_work()
        && !state.is_suspended()
        && state.outcome().is_none())
    .then_some(state))
}
