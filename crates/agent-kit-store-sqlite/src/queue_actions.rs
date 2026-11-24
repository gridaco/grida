//! Durable checkout and transfer of immutable accepted inputs.

use super::{
    ControlReceipt, ControlRequest, Inner, SessionControl, SessionRecord, SqliteStore,
    database_error, error, execute, insert_input, load_input, load_session, queued_order,
    retained_request, unsigned,
};
use agent_kit_core::{ChangeId, ErrorKind, Fingerprint, Result, SessionId, TurnId};
use agent_kit_sessions::{InputView, QueueAction, Submission};
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use std::sync::Arc;

impl SqliteStore {
    /// Observe inputs transferred to a turn without issuing an execution lease.
    /// These inputs did not select the turn or supply its captured settings.
    pub async fn transferred_input_ids(
        &self,
        session: SessionId,
        turn: TurnId,
    ) -> Result<Vec<ChangeId>> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            let mut statement = connection
                .prepare_cached(
                    "SELECT input FROM queue_transfers WHERE session=?1 AND turn=?2 ORDER BY input",
                )
                .map_err(database_error)?;
            let rows = statement
                .query_map(params![session.as_str(), turn.as_str()], |row| {
                    row.get::<_, String>(0)
                })
                .map_err(database_error)?;
            rows.map(|row| ChangeId::new(row.map_err(database_error)?))
                .collect()
        })
        .await
    }

    /// Observe a queue control's committed result after losing its reply.
    /// The caller authorizes access to the named session before reading.
    pub async fn queue_action_receipt(
        &self,
        session: SessionId,
        request: ChangeId,
    ) -> Result<Option<ControlReceipt>> {
        execute(Arc::clone(&self.inner), move |_, connection| {
            load_session(connection, &session)?;
            Ok(
                retained_request::<ControlReceipt>(connection, &session, "control", &request)?
                    .filter(|receipt| receipt.queue_action.is_some()),
            )
        })
        .await
    }
}

pub(super) fn control_fingerprint(request: &ControlRequest) -> Result<Fingerprint> {
    if matches!(request.action, SessionControl::ReinsertQueued { .. }) {
        // An open checkout is itself the control basis. Subsequent queue
        // revisions do not change the same restore or replacement intent.
        Fingerprint::of(&(&request.session, &request.id, &request.action))
    } else {
        Fingerprint::of(request)
    }
}

pub(super) fn checkout(
    transaction: &Transaction<'_>,
    session: &SessionId,
    input: &ChangeId,
    checkout: &ChangeId,
) -> Result<QueueAction> {
    if checkout_input_id(transaction, session)?.is_some() {
        return Err(error(ErrorKind::Conflict, "queue_checkout_open"));
    }
    queued_order(transaction, session, input)?;
    transaction
        .execute(
            "INSERT INTO queue_checkouts(session,input,checkout) VALUES(?1,?2,?3)",
            params![session.as_str(), input.as_str(), checkout.as_str()],
        )
        .map_err(database_error)?;
    Ok(QueueAction::CheckedOut {
        input: input.clone(),
    })
}

pub(super) fn open_checkout(
    connection: &Connection,
    session: &SessionId,
) -> Result<Option<InputView>> {
    let Some(input) = checkout_input_id(connection, session)? else {
        return Ok(None);
    };
    Ok(Some(load_input(connection, session, &input)?))
}

fn checkout_input_id(connection: &Connection, session: &SessionId) -> Result<Option<ChangeId>> {
    let input: Option<String> = connection
        .query_row(
            "SELECT input FROM queue_checkouts WHERE session=?1",
            [session.as_str()],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)?;
    input.map(ChangeId::new).transpose()
}

pub(super) fn reinsert(
    inner: &Inner,
    transaction: &Transaction<'_>,
    session_id: &SessionId,
    session: &mut SessionRecord,
    checkout: &ChangeId,
    replacement: Option<&Submission>,
) -> Result<QueueAction> {
    let original: Option<(String, i64)> = transaction
        .query_row(
            "SELECT c.input,s.queue_order FROM queue_checkouts AS c
             JOIN submissions AS s ON s.session=c.session AND s.id=c.input
             WHERE c.session=?1 AND c.checkout=?2",
            params![session_id.as_str(), checkout.as_str()],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(database_error)?;
    let (input, order) =
        original.ok_or_else(|| error(ErrorKind::Conflict, "queue_checkout_unavailable"))?;
    transaction
        .execute(
            "DELETE FROM queue_checkouts WHERE session=?1",
            [session_id.as_str()],
        )
        .map_err(database_error)?;
    let input = if let Some(replacement) = replacement {
        transaction
            .execute(
                "UPDATE submissions SET state='superseded',queue_order=NULL,replacement=?3 WHERE session=?1 AND id=?2",
                params![session_id.as_str(), input, replacement.id.as_str()],
            )
            .map_err(database_error)?;
        insert_input(
            inner,
            transaction,
            session_id,
            session,
            replacement,
            Some(unsigned(order)?),
        )?;
        replacement.id.clone()
    } else {
        ChangeId::new(input)?
    };
    Ok(QueueAction::Reinserted {
        checkout: checkout.clone(),
        input,
    })
}

pub(super) fn transfer(
    transaction: &Transaction<'_>,
    session: &SessionId,
    input: &ChangeId,
    turn: &TurnId,
) -> Result<QueueAction> {
    queued_order(transaction, session, input)?;
    transaction
        .execute(
            "UPDATE submissions SET state='withdrawn',queue_order=NULL WHERE session=?1 AND id=?2",
            params![session.as_str(), input.as_str()],
        )
        .map_err(database_error)?;
    transaction
        .execute(
            "INSERT INTO queue_transfers(session,input,turn) VALUES(?1,?2,?3)",
            params![session.as_str(), input.as_str(), turn.as_str()],
        )
        .map_err(database_error)?;
    Ok(QueueAction::Transferred {
        input: input.clone(),
        turn: turn.clone(),
    })
}
