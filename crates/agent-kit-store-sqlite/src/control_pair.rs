//! Conditional controls for a turn and an operation's claimed destination.

use super::{
    OPERATION_CLAIM, OperationClaimRecord, SqliteStore, commit_error, database_error, decode,
    deletion, error, execute, load_turn, lookup_request, operation_claim_key, record_control,
    save_request,
};
use agent_kit_core::{ChangeId, ErrorKind, Fingerprint, OperationId, Result, SessionId, TurnId};
use agent_kit_sessions::{ControlReceipt, ControlRequest, SessionControl};
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

const OPERATION_PAIR: &str = "operation-pair-control";

#[derive(Clone, Debug, Serialize)]
pub struct OperationPairControl {
    pub source: ControlRequest,
    pub related: OperationRelatedControl,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OperationRelatedControl {
    /// The selected session identity must be absent and unretired. This
    /// attests only to that identity's absence. The caller supplies the same
    /// deterministic identity when claiming related work.
    Absent { session: SessionId },
    /// Apply a control to the exact turn named by the source operation's claim.
    Apply {
        operation: OperationId,
        request: ControlRequest,
    },
    /// Observe the exact related turn's settlement without changing it.
    Settled {
        operation: OperationId,
        session: SessionId,
        turn: TurnId,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct OperationPairReceipt {
    pub source: ControlReceipt,
    pub destination: Option<ControlReceipt>,
}

#[derive(Serialize, Deserialize)]
struct OperationPairRecord {
    source_fingerprint: Fingerprint,
    receipt: OperationPairReceipt,
}

impl SqliteStore {
    /// Read an already committed pair by its exact original source control.
    /// An ordinary control on the source alone has no pair receipt.
    pub async fn operation_pair_receipt(
        &self,
        source: ControlRequest,
    ) -> Result<Option<OperationPairReceipt>> {
        let fingerprint = Fingerprint::of(&source)?;
        execute(Arc::clone(&self.inner), move |_, connection| {
            let Some(record) = retained_request::<OperationPairRecord>(
                connection,
                &source.session,
                OPERATION_PAIR,
                &source.id,
            )?
            else {
                return Ok(None);
            };
            if record.source_fingerprint != fingerprint {
                return Err(error(ErrorKind::Conflict, "request_identity_reused"));
            }
            Ok(Some(record.receipt))
        })
        .await
    }

    /// Apply an exact turn control together with a proven destination state
    /// or control. Only turn directives, pause-and-cancel, and driver state
    /// changes carrying a turn directive are accepted.
    ///
    /// Repeat the whole request to recover the same receipts. A control already
    /// applied on its own cannot be joined retroactively. This issues no lease.
    pub async fn control_operation_pair(
        &self,
        request: OperationPairControl,
    ) -> Result<OperationPairReceipt> {
        let source_turn = control_turn(&request.source.action)?.clone();
        let destination = match &request.related {
            OperationRelatedControl::Absent { session }
            | OperationRelatedControl::Settled { session, .. } => session,
            OperationRelatedControl::Apply { request, .. } => {
                control_turn(&request.action)?;
                &request.session
            }
        };
        if request.source.session == *destination {
            return Err(error(
                ErrorKind::InvalidInput,
                "operation_pair_same_session",
            ));
        }
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let fingerprint = Fingerprint::of(&request)?;
            let source = &request.source;
            if let Some(record) = lookup_request::<OperationPairRecord>(
                &transaction,
                &source.session,
                OPERATION_PAIR,
                &source.id,
                fingerprint,
            )? {
                return Ok(record.receipt);
            }
            let destination = match &request.related {
                OperationRelatedControl::Absent { session } => {
                    require_absent(&transaction, session)?;
                    None
                }
                OperationRelatedControl::Apply { operation, request } => {
                    require_related(
                        &transaction,
                        &source.session,
                        &source_turn,
                        operation,
                        &request.session,
                        control_turn(&request.action)?,
                    )?;
                    Some(record_fresh_control(&transaction, request)?)
                }
                OperationRelatedControl::Settled {
                    operation,
                    session,
                    turn,
                } => {
                    require_related(
                        &transaction,
                        &source.session,
                        &source_turn,
                        operation,
                        session,
                        turn,
                    )?;
                    if load_turn(&transaction, session, turn)?.outcome().is_none() {
                        return Err(error(
                            ErrorKind::Conflict,
                            "operation_pair_destination_unsettled",
                        ));
                    }
                    None
                }
            };
            let receipt = OperationPairReceipt {
                source: record_fresh_control(&transaction, source)?,
                destination,
            };
            let record = OperationPairRecord {
                source_fingerprint: Fingerprint::of(source)?,
                receipt,
            };
            save_request(
                &transaction,
                &source.session,
                OPERATION_PAIR,
                &source.id,
                fingerprint,
                &record,
            )?;
            transaction.commit().map_err(commit_error)?;
            inner.changed.notify_waiters();
            Ok(record.receipt)
        })
        .await
    }
}

fn control_turn(action: &SessionControl) -> Result<&TurnId> {
    match action {
        SessionControl::Turn { turn, .. } | SessionControl::PauseAndCancel { turn, .. } => Ok(turn),
        SessionControl::DriverState {
            turn: Some(control),
            ..
        } => Ok(&control.turn),
        _ => Err(error(
            ErrorKind::InvalidInput,
            "operation_pair_requires_turn_control",
        )),
    }
}

fn require_absent(transaction: &Transaction<'_>, session: &SessionId) -> Result<()> {
    deletion::require_unretired(transaction, session)?;
    let exists: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sessions WHERE id=?1)",
            [session.as_str()],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if exists {
        return Err(error(
            ErrorKind::Conflict,
            "operation_pair_destination_exists",
        ));
    }
    Ok(())
}

fn require_related(
    transaction: &Transaction<'_>,
    source_session: &SessionId,
    source_turn: &TurnId,
    operation: &OperationId,
    session: &SessionId,
    turn: &TurnId,
) -> Result<()> {
    let key = operation_claim_key(source_turn, operation)?;
    let receipt: OperationClaimRecord =
        retained_request(transaction, source_session, OPERATION_CLAIM, &key)?
            .ok_or_else(|| error(ErrorKind::Conflict, "operation_pair_claim_missing"))?;
    if receipt.session != *session || receipt.turn != *turn {
        return Err(error(
            ErrorKind::Conflict,
            "operation_pair_destination_mismatch",
        ));
    }
    Ok(())
}

fn retained_request<T: DeserializeOwned>(
    connection: &Connection,
    session: &SessionId,
    kind: &str,
    id: &ChangeId,
) -> Result<Option<T>> {
    let bytes: Option<Vec<u8>> = connection
        .query_row(
            "SELECT receipt FROM requests WHERE session=?1 AND kind=?2 AND id=?3",
            params![session.as_str(), kind, id.as_str()],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)?;
    bytes.as_deref().map(decode).transpose()
}

fn record_fresh_control(
    transaction: &Transaction<'_>,
    request: &ControlRequest,
) -> Result<ControlReceipt> {
    let fingerprint = Fingerprint::of(request)?;
    if lookup_request::<ControlReceipt>(
        transaction,
        &request.session,
        "control",
        &request.id,
        fingerprint,
    )?
    .is_some()
    {
        return Err(error(
            ErrorKind::Conflict,
            "operation_pair_control_already_recorded",
        ));
    }
    record_control(transaction, request, fingerprint)
}
