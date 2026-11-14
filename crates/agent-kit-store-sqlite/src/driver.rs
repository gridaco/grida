//! Conditional state controls with durable caller intent and a pure decision.

use super::*;
use agent_kit_core::driver_state::DriverStateRevision;
use agent_kit_sessions::TurnControl;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DriverControlRequest {
    pub id: ChangeId,
    pub session: SessionId,
    pub expected_revision: SessionRevision,
    pub expected_state: DriverStateRevision,
    pub intent: Envelope,
}

pub struct DriverControlPlan {
    pub value: Option<Envelope>,
    pub directive: Option<ControlDirective>,
}

impl SqliteStore {
    /// Derive an opaque state change and commit it with an exact turn directive.
    /// The decision must be a pure in-memory transform. An exact retry returns
    /// the original control receipt before consulting state or calling the
    /// decision. This applies a control without issuing a lease.
    pub async fn control_turn_with_driver_state(
        &self,
        request: ControlRequest,
        derive: impl FnOnce(&DriverStateSnapshot) -> Result<Option<Envelope>> + Send + 'static,
    ) -> Result<ControlReceipt> {
        let SessionControl::Turn {
            turn,
            expected,
            directive,
        } = &request.action
        else {
            return Err(error(
                ErrorKind::InvalidInput,
                "driver_state_requires_turn_control",
            ));
        };
        let turn = TurnControl {
            turn: turn.clone(),
            expected: *expected,
            directive: *directive,
        };
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let fingerprint = Fingerprint::of(&request)?;
            if let Some(receipt) = lookup_request(
                &transaction,
                &request.session,
                "control",
                &request.id,
                fingerprint,
            )? {
                return Ok(receipt);
            }
            let session = load_session(&transaction, &request.session)?;
            require_revision(&session, request.expected_revision)?;
            if session.active_turn.as_ref() != Some(&turn.turn) {
                return Err(error(ErrorKind::Conflict, "active_turn_mismatch"));
            }
            let active = load_turn(inner, &transaction, &request.session, &turn.turn)?;
            if active.controls().revision != turn.expected {
                return Err(error(ErrorKind::Conflict, "stale_journal_change"));
            }
            if active.driver_state() != &session.driver_state {
                return Err(error(ErrorKind::Conflict, "driver_state_snapshot_mismatch"));
            }
            let action = SessionControl::DriverState {
                change: DriverStateChange {
                    expected: session.driver_state.revision(),
                    value: derive(&session.driver_state)?,
                },
                turn: Some(turn),
            };
            let control = ControlRequest { action, ..request };
            let receipt = apply_control(inner, &transaction, &control, session, Some(active))?;
            save_request(
                &transaction,
                &control.session,
                "control",
                &control.id,
                fingerprint,
                &receipt,
            )?;
            commit(inner, transaction)?;
            inner.changed.notify_waiters();
            Ok(receipt)
        })
        .await
    }

    /// Replay a committed intent before consulting current state. A new intent
    /// runs one bounded in-memory decision and commits the result with any
    /// exact active-turn control. The decision must not perform I/O.
    pub async fn control_driver_state(
        &self,
        request: DriverControlRequest,
        decide: impl FnOnce(&DriverStateSnapshot, Option<&TurnView>) -> Result<DriverControlPlan>
        + Send
        + 'static,
    ) -> Result<ControlReceipt> {
        if request.intent.bytes().len() > DriverStateSnapshot::MAX_BYTES {
            return Err(error(
                ErrorKind::LimitExceeded,
                "driver_control_intent_limit",
            ));
        }
        execute(Arc::clone(&self.inner), move |inner, connection| {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            let fingerprint = Fingerprint::of(&request)?;
            if let Some(receipt) = lookup_request(
                &transaction,
                &request.session,
                "driver_control",
                &request.id,
                fingerprint,
            )? {
                return Ok(receipt);
            }
            let session = load_session(&transaction, &request.session)?;
            require_revision(&session, request.expected_revision)?;
            if session.driver_state.revision() != request.expected_state {
                return Err(error(ErrorKind::Conflict, "driver_state_revision_changed"));
            }
            let active = session
                .active_turn
                .as_ref()
                .map(|turn| load_turn(inner, &transaction, &request.session, turn))
                .transpose()?;
            let current = active
                .as_ref()
                .map(|state| turn_view(inner, state))
                .transpose()?;
            let plan = decide(&session.driver_state, current.as_ref())?;
            let turn = match (current, plan.directive) {
                (Some(view), Some(directive)) => Some(TurnControl {
                    turn: view.binding.turn,
                    expected: view.controls.revision,
                    directive,
                }),
                (None, None) => None,
                _ => return Err(error(ErrorKind::Conflict, "driver_control_turn_mismatch")),
            };
            let control = ControlRequest {
                id: request.id,
                session: request.session,
                expected_revision: request.expected_revision,
                action: SessionControl::DriverState {
                    change: DriverStateChange {
                        expected: request.expected_state,
                        value: plan.value,
                    },
                    turn,
                },
            };
            let receipt = apply_control(inner, &transaction, &control, session, active)?;
            save_request(
                &transaction,
                &control.session,
                "driver_control",
                &control.id,
                fingerprint,
                &receipt,
            )?;
            commit(inner, transaction)?;
            inner.changed.notify_waiters();
            Ok(receipt)
        })
        .await
    }
}
