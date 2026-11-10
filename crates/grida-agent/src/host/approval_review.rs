//! GRIDA-SEC-004 — reviewed input for one exact read approval.

use super::*;
use crate::permissions::{
    ApprovalDecision, ApprovalEffect, ApprovalRequest, is_approval, read_approval,
    reviewed_approval_answer,
};
use agent_kit_core::inference::{InferenceRequest, PreparedRequest};
use agent_kit_core::turn::{OperationInput, TurnState};
use agent_kit_core::{OperationId, WaitId};
use agent_kit_runtime::{TurnOperations, TurnView};
use grida_agent_master::approval_review::{self, Decision, ReadProfile, ReadTarget};
use std::num::NonZeroU64;

pub(super) struct AutomaticReadReview {
    host: Host,
    profile: ReadProfile,
    provider: Arc<dyn Provider>,
    grants: GrantSelection,
}

impl AutomaticReadReview {
    pub(super) fn new(host: &Host, profile: &ReadProfile, execution: &Execution) -> Self {
        Self {
            host: host.clone(),
            profile: profile.clone(),
            provider: execution.provider.clone(),
            grants: execution.authority.inference.clone(),
        }
    }

    fn prepare(&self, candidate: &Candidate) -> Result<PreparedRequest> {
        let prepared = self.provider.prepare(candidate.request.clone())?;
        match candidate.input_limit {
            Some(limit) => prepared.with_input_limit(limit),
            None => Ok(prepared),
        }
    }

    async fn resolve(
        &self,
        basis: &TurnView,
        candidate: Candidate,
        operation: OperationId,
        prepared: PreparedRequest,
    ) -> Result<bool> {
        let binding = basis.state.binding().clone();
        let control = basis.state.controls().revision;
        let history = basis.state.history().position();
        let wait = candidate.wait.clone();
        let grants = self.grants.clone();
        let (session, resolution) = self
            .host
            .store
            .inspect_with_current(binding.session.clone(), {
                let binding = binding.clone();
                let operation = operation.clone();
                let wait = wait.clone();
                move |state| {
                    let Some(state) = state.filter(|state| state.binding() == &binding) else {
                        return Ok(Resolution::Pending);
                    };
                    let Some(retained) = state.waits().get(&wait) else {
                        return Ok(Resolution::Pending);
                    };
                    if read_approval(retained)? != candidate.approval {
                        return Ok(Resolution::Pending);
                    }
                    if retained.answer.is_some() {
                        return Ok(Resolution::Resolved);
                    }
                    if !retained.is_pending()
                        || !state.controls().admits_work()
                        || state.controls().revision != control
                        || state.history().position() != history
                    {
                        return Ok(Resolution::Pending);
                    }
                    let decision = state.operations().get(&operation).and_then(|record| {
                        approval_review::retained_decision(record, &prepared, &grants)
                    });
                    let decision = match decision {
                        Some(Decision::Allow) => ApprovalDecision::ApproveOnce,
                        Some(Decision::Deny) => ApprovalDecision::Decline,
                        Some(Decision::Ask(_)) | None => return Ok(Resolution::Pending),
                    };
                    Ok(Resolution::Review(reviewed_approval_answer(
                        retained,
                        decision,
                        Some(operation),
                    )?))
                }
            })
            .await?;
        let answer = match resolution {
            Resolution::Pending => return Ok(false),
            Resolution::Resolved => return Ok(true),
            Resolution::Review(answer) => answer,
        };
        let request = Fingerprint::of(&(&binding, &wait, &operation, &answer))?;
        let id = uuid::Uuid::from_bytes(request.bytes()[..16].try_into().expect("fingerprint"));
        match self
            .host
            .resolve_interaction(
                TurnControl {
                    session: binding.session,
                    turn: binding.turn.clone(),
                    request: ChangeId::new(format!("automatic-approval/{id}"))?,
                    expected_session: session.revision,
                    expected_control: control,
                },
                SessionControl::Resolve {
                    turn: binding.turn,
                    expected: control,
                    wait,
                    answer,
                },
                false,
                None,
            )
            .await
        {
            Ok(_) => Ok(true),
            Err(error)
                if error.kind == ErrorKind::Conflict || error.code == "host_shutting_down" =>
            {
                Ok(false)
            }
            Err(error) => Err(error),
        }
    }
}

impl approval_review::Reviewer for AutomaticReadReview {
    fn review<'a>(
        &'a self,
        operations: &'a TurnOperations,
        basis: &'a TurnView,
        deferred: &'a [WaitId],
    ) -> BoxFuture<'a, Result<bool>> {
        Box::pin(async move {
            let Some(candidate) = Candidate::find(&self.profile, &basis.state, deferred)? else {
                return Ok(false);
            };
            let Ok(prepared) = self.prepare(&candidate) else {
                return Ok(false);
            };
            let key = approval_review::operation_key();
            let operation = operations.operation_id(&key)?;
            if !basis.state.operations().contains_key(&operation)
                && let Err(error) = operations
                    .infer_until(
                        key,
                        prepared.clone(),
                        self.grants.clone(),
                        std::time::Instant::now() + approval_review::TIMEOUT,
                    )
                    .await
                && error.kind == ErrorKind::Uncertain
            {
                return Err(error);
            }
            // A provider protocol fault can release the owner before writing a
            // terminal outcome. Settle that evidence before the turn suspends.
            let view = operations.view();
            if let Some(review) = view.state.operations().get(&operation) {
                if review.is_running() && !view.active.contains(&operation) {
                    operations.record_interruption(operation.clone()).await?;
                } else if review.outcome().is_none() && review.attempts.is_empty() {
                    operations.cancel_prepared(operation.clone()).await?;
                }
            }
            self.resolve(basis, candidate, operation, prepared).await
        })
    }
}

enum Resolution {
    Pending,
    Resolved,
    Review(Envelope),
}

struct Candidate {
    wait: WaitId,
    approval: ApprovalRequest,
    request: InferenceRequest,
    input_limit: Option<NonZeroU64>,
}

impl Candidate {
    fn find(profile: &ReadProfile, state: &TurnState, deferred: &[WaitId]) -> Result<Option<Self>> {
        for id in deferred {
            let Some(wait) = state
                .waits()
                .get(id)
                .filter(|wait| is_approval(wait) && wait.is_pending())
            else {
                continue;
            };
            let approval = read_approval(wait)?;
            let ApprovalEffect::Read {
                tool,
                relative_path,
                query: None,
            } = &approval.effect
            else {
                continue;
            };
            let Some(path) = relative_path.to_str() else {
                continue;
            };
            if tool.as_str() != "read_file"
                || !profile.includes(&approval.directory, path)
                || approval.session != state.binding().session
                || approval.turn != state.binding().turn
            {
                continue;
            }
            let Some(target) = state.operations().get(&approval.operation).filter(|target| {
                target.outcome().is_none()
                    && target.attempts.is_empty()
                    && matches!(&target.record.input, OperationInput::Tool(invocation)
                        if invocation.definition().id == *tool && invocation.fingerprint() == approval.action)
            }) else {
                continue;
            };
            let Some(OperationInput::Inference(source)) = target
                .record
                .origin
                .as_ref()
                .and_then(|origin| state.operations().get(origin))
                .map(|origin| &origin.record.input)
            else {
                continue;
            };
            let target = ReadTarget {
                operation: &approval.operation,
                action: approval.action,
                scope: approval.scope,
                directory: &approval.directory,
                relative_path: path,
                control: state.controls().revision,
                history: state.history().position(),
            };
            if let Some(request) = profile.request(&target, source.request())? {
                return Ok(Some(Self {
                    wait: id.clone(),
                    approval,
                    request,
                    input_limit: source.input_limit(),
                }));
            }
        }
        Ok(None)
    }
}
