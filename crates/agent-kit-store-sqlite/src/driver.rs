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
                .map(|turn| load_turn(&transaction, &request.session, turn))
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
            let receipt = apply_control(&transaction, &control, session, active)?;
            save_request(
                &transaction,
                &control.session,
                "driver_control",
                &control.id,
                fingerprint,
                &receipt,
            )?;
            transaction.commit().map_err(commit_error)?;
            inner.changed.notify_waiters();
            Ok(receipt)
        })
        .await
    }
}
