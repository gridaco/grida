//! One isolated inference tied to the successful conversation request that produced a reply.

use super::*;
use crate::gg::GatewayBillingRead;
use agent_kit_core::inference::{InferenceStatus, PreparedRequest};
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::turn::{
    EphemeralJournal, OperationInput, OperationOutcome, TurnBinding, TurnState,
};
use agent_kit_runtime::{ExecutionLimits, ExecutionServices, OperationKey};
use agent_kit_store_sqlite::catalog::ObservedReply;
use grida_agent_master::{prediction, usage::InferenceUsage};
use std::time::Instant;

/// Optional work has at most one active request per host. Closing this host
/// or preparing a provider switch cancels it without delaying ordinary work.
pub(super) struct Availability {
    slot: Semaphore,
    closed: agent_kit_core::CancellationToken,
}

impl Default for Availability {
    fn default() -> Self {
        Self {
            slot: Semaphore::new(1),
            closed: agent_kit_core::CancellationToken::new(),
        }
    }
}

impl Availability {
    pub(super) fn close(&self) {
        self.closed.cancel();
    }
}

#[derive(Default)]
pub(crate) struct Prediction {
    pub text: Option<String>,
    pub model_id: Option<ModelId>,
    pub usage: InferenceUsage,
    pub gateway_billing: Option<crate::gg::GatewayBillingRead>,
}

fn completed_request(
    state: &TurnState,
    visible_reply: &str,
) -> Option<(PreparedRequest, Vec<Message>)> {
    let final_reply = (catalog::CONVERSATIONS.final_reply)(state)?;
    if final_reply.as_str() != visible_reply {
        // Revising a past message can remove a reply from the selected view
        // even when its turn is still the most recently created one.
        return None;
    }
    // A turn may also contain independent approval or verification inferences.
    // Only the inference whose output was published as the final reply qualifies.
    let mut matches = state.operations().values().filter_map(|record| {
        let OperationInput::Inference(request) = &record.record.input else {
            return None;
        };
        let OperationOutcome::Inference(outcome) = record.outcome()? else {
            return None;
        };
        (outcome.status == InferenceStatus::Completed
            && outcome.failure.is_none()
            && outcome
                .messages
                .iter()
                .any(|message| message.id == final_reply))
        .then_some((request, &outcome.messages))
    });
    let (request, reply) = matches.next()?;
    matches
        .next()
        .is_none()
        .then(|| (request.clone(), reply.clone()))
}

impl Host {
    pub(crate) async fn predict_prompt<F: Future<Output = GatewayBillingRead> + Send>(
        &self,
        session: &SessionId,
        turn: &TurnId,
        deadline: Instant,
        attached: impl Fn() -> bool,
        refresh: impl FnOnce(Option<uuid::Uuid>, String) -> F + Send,
    ) -> Result<Prediction> {
        let Ok(_slot) = self.predictions.slot.try_acquire() else {
            return Ok(Prediction::default());
        };
        tokio::select! {
            biased;
            _ = self.predictions.closed.cancelled() => Ok(Prediction::default()),
            result = self.predict_once(session, turn, deadline, attached, refresh) => result,
        }
    }

    async fn predict_once<F: Future<Output = GatewayBillingRead> + Send>(
        &self,
        session: &SessionId,
        turn: &TurnId,
        deadline: Instant,
        attached: impl Fn() -> bool,
        refresh: impl FnOnce(Option<uuid::Uuid>, String) -> F + Send,
    ) -> Result<Prediction> {
        let view = self.store.inspect(session.clone()).await?;
        let config = session_configuration(&view)?;
        if view.current.is_some()
            || !view.queued.is_empty()
            || view.admission_paused
            || config.side.is_some()
            || config.subagent.is_some()
            || config.worker.is_some()
            || view.latest.as_ref().is_none_or(|latest| {
                latest.binding.turn != *turn
                    || latest
                        .outcome
                        .as_ref()
                        .is_none_or(|outcome| outcome.status != OutcomeStatus::Succeeded)
            })
            || goals::require_resolved_goal(&view.driver_state).is_err()
        {
            return Ok(Prediction::default());
        }
        let catalog = self.store.catalog_record(session.clone()).await?;
        let Some(visible_reply) = catalog
            .read_state
            .reply_id
            .filter(|_| !is_archived(&catalog.entry))
        else {
            return Ok(Prediction::default());
        };
        let observed = ObservedReply {
            session: session.clone(),
            session_revision: view.revision,
            bucket: catalog.entry.bucket,
            reply_id: visible_reply.clone(),
        };
        let inputs = self
            .store
            .turn_submissions(session.clone(), turn.clone())
            .await?;
        let Some(input) = inputs.first() else {
            return Ok(Prediction::default());
        };
        let stored: StoredPrompt = decode_input(input)?;
        if stored.spending.is_some()
            || stored.goal.is_some()
            || stored.subagent.is_some()
            || stored.worker.is_some()
        {
            return Ok(Prediction::default());
        }
        // Chat selection has its own revision independent of the session's
        // queue. Changing the model or account invalidates this observation.
        let selection_revision = stored.selection.as_ref().map_or(0, |s| s.revision);
        let selection_current = || {
            !self.has_routes()
                || self
                    .selection_at_revision(&view, selection_revision)
                    .is_ok()
        };
        if !selection_current() {
            return Ok(Prediction::default());
        }
        let Some((source, reply)) = self
            .store
            .inspect_turn_with(session.clone(), turn.clone(), move |state| {
                Ok(completed_request(state, &visible_reply))
            })
            .await?
        else {
            return Ok(Prediction::default());
        };
        let foreground = self.for_turn(session, turn).await?;
        let original = foreground.execution()?;
        if !CapturedRoute::admits(input, original, config.execution)
            || original.config.model != source.request().model
        {
            return Ok(Prediction::default());
        }
        let routed = foreground.for_prediction().await?;
        let execution = routed.execution()?;
        let captured = source.binding();
        let live = &execution.authority.inference.authority;
        if captured.authority.principal != live.principal || captured.authority.scope != live.scope
        {
            return Ok(Prediction::default());
        }
        let provider = execution
            .subscription_provider_for_request(&source)
            .unwrap_or_else(|| execution.provider.clone());
        let model = &execution.config.model;
        let capabilities = provider.capabilities(model)?;
        let prepared = provider.prepare(prediction::request(
            &source,
            &reply,
            model,
            &capabilities,
            execution.config.max_output_tokens,
        )?)?;
        // The supervisor can renew the live grant but must retain the source's
        // provider, credential lineage, and scope. Validate the candidate's
        // actual prepared binding before reserving the single attempt.
        if prepared.binding().provider != captured.provider || &prepared.binding().authority != live
        {
            return Ok(Prediction::default());
        }
        // A separate runtime gives optional work its own single operation, tight
        // stream bound (including subscription output), and no executable tools.
        let authority = Arc::new(titles::ToolFree::new(execution));
        let runtime = Runtime::new(ExecutionServices {
            providers: BTreeMap::from([(prepared.binding().provider.clone(), provider)]),
            tools: Inventory::new().snapshot(&[])?,
            authority: authority.clone(),
            gate: authority,
            limits: ExecutionLimits {
                max_operations: 1,
                max_concurrent_inferences: 1,
                max_concurrent_tools: 1,
                max_output_bytes: 4096,
                operation_timeout: prediction::TIMEOUT,
                observer_capacity: 8,
            },
        })?;
        let id = Fingerprint::of(&("composer-prediction", session, turn))?.to_hex();
        let ephemeral = EphemeralJournal::create(TurnBinding {
            session: SessionId::new(format!("prediction/{id}"))?,
            turn: TurnId::new(id.clone())?,
            epoch: 1,
        })?;
        let opened = runtime.open(ephemeral.lease).await?;
        {
            // A foreground selection change takes priority over optional work.
            // Keep its revision stable while reserving the observed reply.
            let Ok(_admission) = self.configuration_admission.try_lock() else {
                return Ok(Prediction::default());
            };
            if !attached()
                || !selection_current()
                || !self
                    .store
                    .reserve_reply_observation(observed.clone(), ChangeId::new(id)?)
                    .await?
                || !attached()
            {
                return Ok(Prediction::default());
            }
        }
        let outcome = opened
            .turn
            .operations()
            .infer_until(
                OperationKey::new("next-prompt")?,
                prepared,
                execution.authority.inference.clone(),
                deadline,
            )
            .await?;
        let usage = InferenceUsage::from_turn(&opened.turn.view().state)?;
        let gateway_billing = match &execution.authorization.credential {
            Credential::Gg(connection) => Some(crate::gg::outcome_billing(
                connection.scope_fingerprint(),
                &outcome,
            )),
            Credential::SupervisedGg(connection) => {
                let mut billing = crate::gg::outcome_billing(connection.scope, &outcome);
                if !matches!(billing, GatewayBillingRead::Settled { .. })
                    && routed.supports_gateway_billing_status()
                    && connection.validate().is_ok()
                    && attached()
                    && let Some(id) = crate::gg::attempt_request_id(&outcome)
                {
                    let refreshed = refresh(routed.supervised_route_id(), id.to_owned()).await;
                    if !matches!(refreshed, GatewayBillingRead::Unavailable) {
                        billing = refreshed;
                    }
                }
                Some(billing)
            }
            _ => None,
        };
        let text =
            if self.store.reply_is_current(observed).await? && attached() && selection_current() {
                prediction::text(&outcome)
            } else {
                None
            };
        Ok(Prediction {
            text,
            model_id: (outcome.receipt.is_some()
                || !outcome.usage.is_empty()
                || matches!(
                    outcome.status,
                    InferenceStatus::Completed
                        | InferenceStatus::Refused
                        | InferenceStatus::Limited
                ))
            .then(|| model.clone()),
            usage,
            gateway_billing,
        })
    }
}
