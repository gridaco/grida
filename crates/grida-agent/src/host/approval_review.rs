//! GRIDA-SEC-004 — bound reviewer decisions for a captured approval request.

mod evidence;
mod investigation;
mod session;

use evidence::{
    MAX_USER_INSTRUCTIONS, PriorInstructions, observed_reference_urls, prior_instructions,
    prior_manual_decisions,
};

use super::*;
use crate::permissions::{
    ApprovalDecision, ApprovalEffect, ApprovalRequest, CommandRetryNetwork, is_approval,
    is_live_network_wait, read_approval, reviewed_approval_answer,
};
use agent_kit_core::inference::{InferenceRequest, PreparedRequest};
use agent_kit_core::turn::{OperationInput, TurnState};
use agent_kit_core::{MessageId, OperationId, WaitId};
use agent_kit_runtime::{TurnOperations, TurnView, tool_result_message_id};
use grida_agent_master::approval_review::{self, Decision, ReadProfile, ReadTarget};
use std::num::NonZeroU64;
use std::path::Path;

pub(super) enum ReviewPolicy {
    ConfiguredRead(ReadProfile),
    ApproveForMe { external_file_read: bool },
}

pub(super) struct AutomaticReview {
    host: Host,
    policy: ReviewPolicy,
    workspace: std::sync::Weak<crate::permissions::TurnPermissions>,
    prior_instructions: tokio::sync::OnceCell<Option<PriorInstructions>>,
    project_instructions: Option<String>,
    provider: Arc<dyn Provider>,
    execution_identity: (Fingerprint, Fingerprint),
    grants: GrantSelection,
    decisions: tokio::sync::Mutex<()>,
}

impl AutomaticReview {
    pub(super) fn new(
        host: &Host,
        policy: ReviewPolicy,
        execution: &Execution,
        provider: Arc<dyn Provider>,
        project_instructions: Option<String>,
        workspace: std::sync::Weak<crate::permissions::TurnPermissions>,
    ) -> Self {
        Self {
            host: host.clone(),
            policy,
            project_instructions,
            workspace,
            prior_instructions: tokio::sync::OnceCell::new(),
            provider,
            execution_identity: (execution.owner, execution.configuration),
            grants: execution.authority.inference.clone(),
            decisions: tokio::sync::Mutex::new(()),
        }
    }

    // Prelaunch assessments have a private task and cancellation token. The
    // foreground owner waits for its decision and accounts for the inference.
    // A live broker callback is already supervised for its entire lifetime.
    async fn review_prelaunch(
        self: &Arc<Self>,
        owner: &TurnOperations,
        wait: &WaitId,
    ) -> Result<bool> {
        if matches!(self.policy, ReviewPolicy::ConfiguredRead(_)) {
            return self.review_wait(owner, wait, None).await;
        }
        let reviewer = Arc::clone(self);
        let owner = owner.clone();
        let wait = wait.clone();
        let stop = agent_kit_core::CancellationToken::new();
        let _cancel_on_drop = stop.clone().drop_guard();
        tokio::spawn(async move {
            owner
                .run_attached(reviewer.review_wait(&owner, &wait, Some(&stop)))
                .await?
        })
        .await
        .map_err(|_| problem(ErrorKind::Unavailable, "private_review_interrupted"))?
    }

    async fn review_wait(
        &self,
        operations: &TurnOperations,
        id: &WaitId,
        stop: Option<&agent_kit_core::CancellationToken>,
    ) -> Result<bool> {
        let scoped = matches!(self.policy, ReviewPolicy::ApproveForMe { .. });
        let mut remaining = if scoped {
            approval_review::MAX_REVIEW_ATTEMPTS
        } else {
            1
        };
        let deadline = std::time::Instant::now()
            + if scoped {
                approval_review::SCOPED_TIMEOUT
            } else {
                approval_review::TIMEOUT
            };
        while remaining > 0 && std::time::Instant::now() < deadline {
            let basis = Arc::new(operations.view());
            if !basis.state.controls().admits_work()
                || stop.is_some_and(|token| token.is_cancelled())
            {
                return Ok(false);
            }
            let Some(candidate) = Candidate::for_wait(self, &basis.state, id).await? else {
                return Ok(false);
            };
            match self
                .review_candidate(
                    operations,
                    &basis,
                    candidate,
                    &mut remaining,
                    deadline,
                    stop,
                )
                .await?
            {
                CandidateResult::Resolved => return Ok(true),
                CandidateResult::Handoff => return Ok(false),
                CandidateResult::Stale if !scoped => return Ok(false),
                CandidateResult::Stale => {
                    // Retry only if authority actually changed. A voluntary handoff
                    // already verified the latest evidence before returning.
                    let current = operations.view();
                    if current.state.controls().revision == basis.state.controls().revision
                        && current.state.history().position() == basis.state.history().position()
                    {
                        break;
                    }
                }
            }
        }
        Err(problem(
            ErrorKind::Unavailable,
            "approval_authorization_changed",
        ))
    }

    async fn scoped_request(
        &self,
        state: &TurnState,
        basis: &approval_review::ReviewBasis<'_>,
        source: &InferenceRequest,
        action: approval_review::ScopedAction<'_>,
        approval: &ApprovalRequest,
        live_network: bool,
    ) -> Result<Option<InferenceRequest>> {
        // Only this prompt and its answers can name an outside file to disclose.
        // Instructions from earlier turns also apply to every reviewed action.
        let mut answers = Vec::new();
        let mut supplied = state.history().records().iter().rev().filter_map(|record| {
            let HistoryRecord::Message(message) = record;
            (message.role == Role::User && message.provenance.kind == ProvenanceKind::Supplied)
                .then_some(message)
        });
        let intent = loop {
            let Some(message) = supplied.next() else {
                return Ok(None);
            };
            if matches!(
                message.provenance.source.as_str(),
                "native-client" | super::message_context::SUPPLIED_SOURCE
            ) {
                if source.messages.contains(message) {
                    break message;
                }
                // Later steering constrains the decision, but did not author the action.
                continue;
            }
            let Some(replies) =
                grida_agent_master::questions::replies_in_context(state, message, &source.messages)
            else {
                continue;
            };
            answers.extend(
                replies
                    .into_iter()
                    .filter(|reply| !reply.skipped)
                    .map(|reply| reply.answer),
            );
            if answers.len() >= MAX_USER_INSTRUCTIONS {
                return Ok(None);
            }
        };
        let prior = self
            .prior_instructions
            .get_or_try_init(|| prior_instructions(&self.host, state.binding()))
            .await?;
        let Some(context) = prior.clone().and_then(|prior| prior.with_turn(state)) else {
            return Ok(None);
        };
        let urls = observed_reference_urls(source);
        // Only user decisions recorded by the host are evidence of consent.
        // A previous receipt names its exact action; it is never a reusable grant.
        let mut evidence = prior_manual_decisions(state)?;
        evidence.extend(super::bundled_skills::review_evidence(state));
        let informed_reconsideration = self
            .host
            .informed_reconsideration(
                approval,
                live_network,
                &action,
                &source.messages,
                state.history().records(),
            )
            .await?;
        action.request(
            basis,
            source,
            approval_review::ReviewContext {
                intent,
                answers: &answers,
                conversation: &context.authored,
                inherited_context: &context.inherited,
                observed_reference_urls: &urls,
                action_evidence: &evidence,
                informed_reconsideration,
                project_instructions: self.project_instructions.as_deref(),
            },
        )
    }

    async fn resolve(
        &self,
        operations: &TurnOperations,
        basis: &Arc<TurnView>,
        candidate: Candidate,
        attempt: ReviewAttempt,
        read_scope: Option<Fingerprint>,
        deadline: std::time::Instant,
    ) -> Result<CandidateResult> {
        let ReviewAttempt {
            operation,
            prepared,
            grants,
        } = attempt;
        let binding = basis.state.binding().clone();
        let control_basis = review_control_revision(&basis.state, &candidate.wait);
        let wait = candidate.wait.clone();
        loop {
            let latest = operations.view();
            if !candidate
                .same_evidence(self, &basis.state, &latest.state)
                .await?
            {
                return Ok(CandidateResult::Stale);
            }
            let verified_history = latest.state.history().position();
            let (session, resolution) = self
                .host
                .store
                .inspect_with_current(binding.session.clone(), {
                    let binding = binding.clone();
                    let operation = operation.clone();
                    let wait = wait.clone();
                    let approval = candidate.approval.clone();
                    let prepared = prepared.clone();
                    let grants = grants.clone();
                    let workspace = self.workspace.clone();
                    move |state| {
                        let Some(state) = state.filter(|state| state.binding() == &binding) else {
                            return Ok(Resolution::Pending);
                        };
                        let Some(retained) = state.waits().get(&wait) else {
                            return Ok(Resolution::Pending);
                        };
                        if read_approval(retained)? != approval {
                            return Ok(Resolution::Pending);
                        }
                        if retained.answer.is_some() {
                            return Ok(Resolution::Resolved);
                        }
                        if !retained.is_pending()
                            || !state.controls().admits_work()
                            || control_basis.is_none_or(|revision| {
                                review_control_revision(state, &wait) != Some(revision)
                            })
                        {
                            return Ok(Resolution::Pending);
                        }
                        if let Some(expected) = read_scope
                            && !workspace.upgrade().is_some_and(|permissions| {
                                permissions
                                    .review_context_identity()
                                    .is_ok_and(|scope| scope == expected)
                            })
                        {
                            return Ok(Resolution::Pending);
                        }
                        if state.history().position() != verified_history {
                            return Ok(Resolution::HistoryChanged);
                        }
                        let decision = state.operations().get(&operation).and_then(|record| {
                            approval_review::retained_decision(record, &prepared, &grants)
                        });
                        let scoped = approval_review::is_scoped_assessment(prepared.request());
                        let decision = match decision {
                            Some(Decision::Allow) => ApprovalDecision::ApproveOnce,
                            Some(Decision::Deny) => ApprovalDecision::Decline,
                            Some(Decision::Ask(_)) => {
                                if !scoped
                                    || state
                                        .operations()
                                        .get(&operation)
                                        .is_some_and(input_exceeded)
                                {
                                    return Ok(Resolution::Handoff);
                                }
                                ApprovalDecision::Decline
                            }
                            None if !scoped => return Ok(Resolution::Handoff),
                            None => return Ok(Resolution::Pending),
                        };
                        Ok(Resolution::Review(
                            state.controls().revision,
                            reviewed_approval_answer(retained, decision, Some(operation))?,
                        ))
                    }
                })
                .await?;
            let (control, answer) = match resolution {
                Resolution::HistoryChanged if std::time::Instant::now() < deadline => {
                    tokio::task::yield_now().await;
                    continue;
                }
                Resolution::Handoff => return Ok(CandidateResult::Handoff),
                Resolution::HistoryChanged | Resolution::Pending => {
                    return Ok(CandidateResult::Stale);
                }
                Resolution::Resolved => return Ok(CandidateResult::Resolved),
                Resolution::Review(control, answer) => (control, answer),
            };
            let request = Fingerprint::of(&(&binding, &wait, &operation, &answer))?;
            let id = uuid::Uuid::from_bytes(request.bytes()[..16].try_into().expect("fingerprint"));
            match self
                .host
                .resolve_interaction(
                    TurnControl {
                        session: binding.session.clone(),
                        turn: binding.turn.clone(),
                        request: ChangeId::new(format!("automatic-approval/{id}"))?,
                        expected_session: session.revision,
                        expected_control: control,
                    },
                    SessionControl::Resolve {
                        turn: binding.turn.clone(),
                        expected: control,
                        wait: wait.clone(),
                        answer,
                    },
                    false,
                    None,
                )
                .await
            {
                Ok(_) => return Ok(CandidateResult::Resolved),
                Err(error)
                    if matches!(
                        error.code.as_str(),
                        "stale_journal_change"
                            | "stale_session_revision"
                            | "stale_control_revision"
                    ) && std::time::Instant::now() < deadline =>
                {
                    continue;
                }
                Err(error)
                    if error.kind == ErrorKind::Conflict
                        && matches!(self.policy, ReviewPolicy::ConfiguredRead(_)) =>
                {
                    return Ok(CandidateResult::Stale);
                }
                Err(error) => return Err(error),
            }
        }
    }

    async fn review_candidate(
        &self,
        operations: &TurnOperations,
        basis: &Arc<TurnView>,
        candidate: Candidate,
        remaining: &mut u32,
        deadline: std::time::Instant,
        stop: Option<&agent_kit_core::CancellationToken>,
    ) -> Result<CandidateResult> {
        let scoped = matches!(self.policy, ReviewPolicy::ApproveForMe { .. });
        if scoped
            && approval_review::recorded_review(
                &basis.state,
                &candidate.approval.operation,
                candidate.approval.action,
                candidate.approval.scope,
            )?
            .is_some_and(|prior| {
                matches!(&prior.record.input, OperationInput::Inference(input)
            if !approval_review::is_scoped_assessment(input.request())
                || input.request().messages[0].provenance.fingerprint.is_none())
            })
        {
            // A pending review issued before private sessions keeps its human fallback.
            return Ok(CandidateResult::Handoff);
        }
        let mut investigation =
            investigation::Investigation::new(self.workspace.clone(), operations, stop, deadline);
        let mut request = candidate.request.clone();
        if scoped
            && matches!(
                &candidate.approval.effect,
                ApprovalEffect::Command { .. } | ApprovalEffect::EscalatedCommand { .. }
            )
            && self.provider.capabilities(&request.model)?.json_tools
        {
            investigation.offer(&mut request)?;
        }
        let mut session = if scoped {
            Some(session::ReviewSession::open(self, &basis.state, &mut request, &candidate).await?)
        } else {
            None
        };
        let mut attempt = 0;
        let control_basis = review_control_revision(&basis.state, &candidate.wait);
        let is_current = |view: &TurnView| {
            !view.admission_closed
                && view.state.controls().admits_work()
                && control_basis.is_some_and(|revision| {
                    review_control_revision(&view.state, &candidate.wait) == Some(revision)
                })
                && view.state.waits().get(&candidate.wait).is_some_and(|wait| {
                    wait.is_pending()
                        && read_approval(wait).is_ok_and(|data| data == candidate.approval)
                })
        };
        let attempt = loop {
            let current = operations.view();
            if !is_current(&current)
                || !candidate
                    .same_evidence(self, &basis.state, &current.state)
                    .await?
            {
                return Ok(CandidateResult::Stale);
            }
            if let Some(session) = &session {
                session.validate()?;
            }
            if investigation.has_evidence() && !investigation.admits_evidence() {
                return Err(problem(
                    ErrorKind::Unavailable,
                    "review_workspace_unavailable",
                ));
            }
            *remaining -= 1;
            if scoped {
                approval_review::set_scoped_attempt(&mut request, attempt)?;
            }
            let prepared = self.provider.prepare(request.clone())?;
            let prepared = match candidate.input_limit {
                Some(limit) => prepared.with_input_limit(limit)?,
                None => prepared,
            };
            let key = if scoped {
                investigation::operation_key(&prepared)?
            } else {
                approval_review::operation_key()
            };
            let operation = operations.operation_id(&key)?;
            let existing = current.operation(&operation);
            let (prepared, grants) = match existing.filter(|_| scoped) {
                Some(record) => recorded_input(record, &prepared, &self.grants)?,
                None => (prepared, self.grants.clone()),
            };
            let retained = existing.is_some();
            if !retained {
                let result = match stop {
                    Some(stop) => {
                        operations
                            .infer_while_needed(
                                key,
                                prepared.clone(),
                                self.grants.clone(),
                                deadline,
                                stop,
                            )
                            .await
                    }
                    None => {
                        operations
                            .infer_until(key, prepared.clone(), self.grants.clone(), deadline)
                            .await
                    }
                };
                if let Err(error) = result
                    && (error.kind == ErrorKind::Uncertain
                        || (scoped
                            && !operations
                                .view()
                                .state
                                .operations()
                                .contains_key(&operation)))
                {
                    return Err(error);
                }
            }
            if stop.is_some_and(|stop| stop.is_cancelled()) {
                return Ok(CandidateResult::Stale);
            }
            let current = operations.view();
            if !is_current(&current)
                || !candidate
                    .same_evidence(self, &basis.state, &current.state)
                    .await?
            {
                return Ok(CandidateResult::Stale);
            }
            if std::time::Instant::now() < deadline
                && let Some(record) = current.operation(&operation)
                && investigation
                    .follow(
                        &mut request,
                        record,
                        &prepared,
                        &grants,
                        retained.then_some((operations, &current)),
                    )
                    .await?
            {
                // A private inspection continues the same assessment.
                // Its tool count is bounded independently from technical retries.
                *remaining += 1;
                continue;
            }
            if *remaining > 0
                && current.operation(&operation).is_some_and(input_exceeded)
                && session
                    .as_mut()
                    .is_some_and(|s| s.reset_history(&mut request))
            {
                // Retry with just the current action and its real authorization evidence.
                attempt += 1;
                continue;
            }
            if scoped
                && *remaining > 0
                && std::time::Instant::now() < deadline
                && current
                    .operation(&operation)
                    .is_some_and(approval_review::retryable_scoped_review)
            {
                attempt += 1;
                continue;
            }
            break ReviewAttempt {
                operation,
                prepared,
                grants,
            };
        };
        // A provider protocol fault can release the owner before writing a
        // terminal outcome. Settle that evidence before the turn suspends.
        let operation = attempt.operation.clone();
        let view = operations.view();
        if let Some(review) = view.state.operations().get(&operation) {
            if review.is_running() && !view.active.contains(&operation) {
                operations.record_interruption(operation.clone()).await?;
            } else if review.outcome().is_none() && review.attempts.is_empty() {
                operations.cancel_prepared(operation.clone()).await?;
            }
        }
        // Commit decisions in order, including interruption after a run of denials.
        // Each private assessment and its evidence gathering can proceed independently.
        let _decision = self.decisions.lock().await;
        if let Some(session) = &session {
            session.validate()?;
        }
        let wait = candidate.wait.clone();
        let approval = candidate.approval.clone();
        let resolved = self
            .resolve(
                operations,
                basis,
                candidate,
                attempt,
                session.as_ref().map(|s| s.read_scope),
                deadline,
            )
            .await?;
        if scoped && matches!(resolved, CandidateResult::Resolved) {
            if let Some(session) = session
                && let Some(record) = operations.view().operation(&operation)
            {
                // The grant already has a durable receipt. A failed cache write
                // cannot change the answer delivered to its owner.
                let _ = session.commit(record, wait, approval).await;
            }
            let binding = basis.state.binding();
            let stop = self
                .host
                .store
                .inspect_turn_with(binding.session.clone(), binding.turn.clone(), |state| {
                    Ok(denial_limit_reached(&review_outcomes(state)?))
                })
                .await?;
            if stop {
                control(
                    &self.host,
                    binding.session.clone(),
                    binding.turn.clone(),
                    ControlDirective::Cancel,
                )
                .await?;
            }
        }
        Ok(resolved)
    }
}

impl approval_review::Reviewer for AutomaticReview {
    fn denied_actions(&self, state: &TurnState) -> Result<BTreeMap<MessageId, Vec<String>>> {
        let mut result = BTreeMap::<_, Vec<_>>::new();
        if !matches!(self.policy, ReviewPolicy::ApproveForMe { .. }) {
            return Ok(result);
        }
        for wait in state
            .waits()
            .values()
            .filter(|wait| wait.answer.is_some() && is_approval(wait))
        {
            let request = read_approval(wait)?;
            let Some(id) = crate::permissions::denied_review(wait, &request)? else {
                continue;
            };
            let Some(review) = state.operations().get(&id) else {
                continue;
            };
            let Some((origin, call)) = state.operations().get(&request.operation).and_then(|op| {
                op.record
                    .origin
                    .as_ref()
                    .zip(op.record.source_call.as_ref())
            }) else {
                continue;
            };
            let message = tool_result_message_id(origin, call)?;
            let feedback = if let Some(assessment) = approval_review::scoped_assessment(review) {
                let guidance = if assessment.risk_level == approval_review::RiskLevel::Critical {
                    "Continue with a permitted approach."
                } else {
                    "Use a permitted approach, or explain the concrete risk in your final response and ask whether the user approves this exact action. Retry only with new authorization and subject to the current policy."
                };
                Some((assessment.rationale, guidance))
            } else {
                approval_review::failure_reason(review).map(|reason| {
                    let message = match reason {
                        approval_review::AskReason::TimedOut => "Automatic review timed out.",
                        approval_review::AskReason::Interrupted => {
                            "Automatic review was interrupted."
                        }
                        _ => "Automatic review could not complete.",
                    };
                    (message.to_owned(), "Continue with a permitted approach.")
                })
            };
            if let Some((reason, guidance)) = feedback {
                let subject = match &request.effect {
                    ApprovalEffect::Command {
                        network: Some(destination),
                        ..
                    } => format!("connection to {}:{}", destination.host, destination.port),
                    _ => "action".to_owned(),
                };
                result.entry(message).or_default().push(format!(
                    "Automatic review blocked this {subject}. Review reason: {reason} {guidance}"
                ));
            }
        }
        Ok(result)
    }

    fn reserved_foreground_steps(&self) -> u32 {
        u32::from(matches!(self.policy, ReviewPolicy::ConfiguredRead(_)))
    }

    fn review<'a>(
        self: Arc<Self>,
        operations: &'a TurnOperations,
        basis: &'a TurnView,
        deferred: &'a [WaitId],
    ) -> BoxFuture<'a, Result<bool>> {
        Box::pin(async move {
            for wait in deferred {
                let current = operations.view();
                if !current.state.controls().admits_work()
                    || current.state.controls().revision != basis.state.controls().revision
                    || current.state.history().position() != basis.state.history().position()
                {
                    break;
                }
                if self.review_prelaunch(operations, wait).await? {
                    return Ok(true);
                }
            }
            Ok(false)
        })
    }
}

// A connection in the previous execution owner's broker cannot survive
// resumption. Historical decisions remain visible.
pub(super) async fn withdraw_orphaned_network_waits(operations: &TurnOperations) -> Result<()> {
    let view = operations.view();
    for wait in view
        .state
        .waits()
        .values()
        .filter(|wait| wait.is_pending() && is_approval(wait))
    {
        let request = read_approval(wait)?;
        if is_live_network_wait(wait, &request)
            && let Err(error) = operations.withdraw_input(wait.id.clone()).await
        {
            let current = operations.view();
            if current
                .state
                .waits()
                .get(&wait.id)
                .is_some_and(|wait| wait.is_pending())
            {
                return Err(error);
            }
        }
    }
    Ok(())
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
pub(super) async fn authorize_network(
    operations: TurnOperations,
    updates: broadcast::Sender<live::LiveUpdate>,
    reviewer: Option<Arc<AutomaticReview>>,
    request: ApprovalRequest,
    stop: agent_kit_core::CancellationToken,
) -> bool {
    use crate::permissions::live_network_wait;
    let reviewer = reviewer.filter(|r| matches!(r.policy, ReviewPolicy::ApproveForMe { .. }));
    // A live command consumes the answer. Its callback remains owned through
    // a human handoff and ends when the command exits or the turn is stopped.
    operations
        .run_attached(async {
            if let Some(reviewer) = reviewer {
                let Ok(wait) = live_network_wait(&request, false) else {
                    return false;
                };
                if stop.is_cancelled() || operations.request_input(wait.clone()).await.is_err() {
                    return false;
                }
                let resolved = reviewer
                    .review_wait(&operations, &wait.id, Some(&stop))
                    .await
                    .ok();
                if resolved == Some(true)
                    || !operations
                        .view()
                        .state
                        .waits()
                        .get(&wait.id)
                        .is_some_and(|w| w.is_pending())
                {
                    return consume_destination_answer(&operations, &request, wait, &stop).await;
                }
                if operations.withdraw_input(wait.id).await.is_err()
                    || resolved.is_none()
                    || stop.is_cancelled()
                {
                    return false;
                }
            }
            let Ok(wait) = live_network_wait(&request, true) else {
                return false;
            };
            if stop.is_cancelled() || operations.request_input(wait.clone()).await.is_err() {
                return false;
            }
            let _ = updates.send(live::LiveUpdate::Lifecycle(live::Lifecycle {
                session: request.session.clone(),
                turn: request.turn.clone(),
                fact: live::LifecycleFact::ApprovalRequired(wait.id.clone()),
            }));
            consume_destination_answer(&operations, &request, wait, &stop).await
        })
        .await
        .unwrap_or(false)
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
async fn consume_destination_answer(
    operations: &TurnOperations,
    request: &ApprovalRequest,
    wait: agent_kit_core::turn::WaitRecord,
    stop: &agent_kit_core::CancellationToken,
) -> bool {
    use crate::permissions::approved;
    use agent_kit_runtime::WaitOutcome;

    let id = wait.id.clone();
    let answer = tokio::select! {
        biased;
        _ = stop.cancelled() => None,
        answer = operations.wait(wait) => answer.ok(),
    };
    let view = operations.view();
    let retained = view.state.waits().get(&id);
    if matches!(answer, Some(WaitOutcome::Answered(_))) && !stop.is_cancelled() {
        return view.state.controls().admits_work()
            && retained.is_some_and(|wait| approved(wait, request).unwrap_or(false));
    }
    if retained.is_some_and(|wait| wait.is_pending()) {
        let _ = operations.withdraw_input(id).await;
    }
    false
}

fn input_exceeded(record: &agent_kit_core::turn::OperationState) -> bool {
    matches!(record.outcome(), Some(agent_kit_core::turn::OperationOutcome::Inference(outcome))
        if outcome.failure.as_ref().is_some_and(|failure| failure.kind == agent_kit_core::inference::FailureKind::ContextLimit))
}

/// A wait opens once and can resolve or withdraw once. Only independent
/// broker reviews may change in parallel without changing the authority behind
/// this action. Any human handoff, other wait, pause or resume remains visible.
fn review_control_revision(state: &TurnState, target: &WaitId) -> Option<u64> {
    let revision = state.controls().revision.0;
    if state.waits().get(target)?.request.schema().as_str() != crate::permissions::NETWORK_REVIEW {
        return Some(revision);
    }
    let sibling_transitions = state
        .waits()
        .values()
        .filter(|wait| {
            &wait.id != target
                && wait.request.schema().as_str() == crate::permissions::NETWORK_REVIEW
        })
        .map(|wait| 1 + u64::from(!wait.is_pending()))
        .sum::<u64>();
    revision.checked_sub(sibling_transitions)
}

fn review_outcomes(state: &TurnState) -> Result<Vec<bool>> {
    use agent_kit_core::turn::{JournalAction, JournalContent};
    // The breaker follows decision order, including decisions from before the
    // current execution epoch. Private reviews can finish out of opening order.
    let positions = state
        .receipts()
        .values()
        .map(|receipt| receipt.record())
        .filter(|receipt| receipt.change.as_str().starts_with("automatic-approval/"))
        .map(|receipt| (receipt.content_fingerprint, receipt.position))
        .collect::<BTreeMap<_, _>>();
    let mut outcomes = Vec::new();
    for wait in state
        .waits()
        .values()
        .filter(|w| is_approval(w) && w.answer.is_some())
    {
        let request = read_approval(wait)?;
        let Some((decision, Some(operation))) =
            crate::permissions::bound_approval_decision(wait, &request)?
        else {
            continue;
        };
        let Some(record) = state.operations().get(&operation) else {
            continue;
        };
        if approval_review::scoped_order(record).is_some()
            && let Some(answer) = &wait.answer
            && let Some(order) = positions.get(
                &JournalContent::new(vec![JournalAction::ResolveWait {
                    wait: wait.id.clone(),
                    answer: answer.clone(),
                }])?
                .fingerprint(),
            )
        {
            // A timed-out or failed review blocks the action. Only a policy
            // denial counts toward interruption for repeated rejected actions.
            let denied = decision == ApprovalDecision::Decline
                && approval_review::scoped_assessment(record).is_some();
            outcomes.push((*order, denied));
        }
    }
    outcomes.sort_by_key(|(order, _)| *order);
    Ok(outcomes.into_iter().map(|(_, denied)| denied).collect())
}

fn denial_limit_reached(outcomes: &[bool]) -> bool {
    let recent = outcomes
        .iter()
        .rev()
        .take(50)
        .filter(|denied| **denied)
        .count();
    outcomes.ends_with(&[true; 3]) || recent >= 10
}

enum CandidateResult {
    Resolved,
    Handoff,
    Stale,
}

enum Resolution {
    Handoff,
    Pending,
    HistoryChanged,
    Resolved,
    Review(agent_kit_core::turn::ControlRevision, Envelope),
}

/// A completed or interrupted private inference may outlive its transport.
/// Cached evidence belongs to the exact request and original dispatch grants.
fn recorded_input(
    record: &agent_kit_core::turn::OperationState,
    current: &PreparedRequest,
    grants: &GrantSelection,
) -> Result<(PreparedRequest, GrantSelection)> {
    let changed = || problem(ErrorKind::Conflict, "review_request_changed");
    let OperationInput::Inference(original) = &record.record.input else {
        return Err(changed());
    };
    let original_grants = &record.record.grants;
    if original.request() != current.request()
        || original.capabilities() != current.capabilities()
        || original.input_limit() != current.input_limit()
        || original.binding().provider != current.binding().provider
        || original_grants.authority != original.binding().authority
        || grants.authority != current.binding().authority
        || original_grants.authority.principal != grants.authority.principal
        || original_grants.authority.scope != grants.authority.scope
        || original_grants.grants != grants.grants
        || record.record.origin.is_some()
        || record.record.source_call.is_some()
    {
        return Err(changed());
    }
    Ok((original.clone(), original_grants.clone()))
}

struct ReviewAttempt {
    operation: OperationId,
    prepared: PreparedRequest,
    grants: GrantSelection,
}

struct Candidate {
    wait: WaitId,
    approval: ApprovalRequest,
    request: InferenceRequest,
    input_limit: Option<NonZeroU64>,
}

impl Candidate {
    /// A journal append can publish progress while the private reviewer is
    /// working. Rebuild what the reviewer would actually receive. Only a
    /// changed action, authority, or decision input requires another assessment.
    async fn same_evidence(
        &self,
        reviewer: &AutomaticReview,
        basis: &TurnState,
        latest: &TurnState,
    ) -> Result<bool> {
        if basis.binding() != latest.binding() {
            return Ok(false);
        }
        if basis.history().position() == latest.history().position() {
            return Ok(true);
        }
        if !approval_review::is_scoped_assessment(&self.request) {
            return Ok(false);
        }
        let Some(mut rebuilt) = Self::for_wait(reviewer, latest, &self.wait).await? else {
            return Ok(false);
        };
        // The quoted action's envelope ID contains the journal position for
        // audit and recovery. It is the only field allowed to differ.
        let [_, original] = self.request.messages.as_slice() else {
            return Ok(false);
        };
        let [_, refreshed] = rebuilt.request.messages.as_mut_slice() else {
            return Ok(false);
        };
        refreshed.id.clone_from(&original.id);
        Ok(self.approval == rebuilt.approval
            && self.input_limit == rebuilt.input_limit
            && self.request == rebuilt.request)
    }

    async fn for_wait(
        reviewer: &AutomaticReview,
        state: &TurnState,
        id: &WaitId,
    ) -> Result<Option<Self>> {
        let Some(wait) = state
            .waits()
            .get(id)
            .filter(|wait| is_approval(wait) && wait.is_pending())
        else {
            return Ok(None);
        };
        let approval = read_approval(wait)?;
        if approval.session != state.binding().session || approval.turn != state.binding().turn {
            return Ok(None);
        }
        let live_network = is_live_network_wait(wait, &approval);
        let Some(target) = state
            .operations()
            .get(&approval.operation)
            .filter(|target| {
                (if live_network {
                    !target.attempts.is_empty()
                } else {
                    target.outcome().is_none() && target.attempts.is_empty()
                }) && matches!(&target.record.input, OperationInput::Tool(invocation)
                    if invocation.fingerprint() == approval.action)
            })
        else {
            return Ok(None);
        };
        let Some(OperationInput::Inference(source)) = target
            .record
            .origin
            .as_ref()
            .and_then(|origin| state.operations().get(origin))
            .map(|origin| &origin.record.input)
        else {
            return Ok(None);
        };
        let basis = approval_review::ReviewBasis {
            operation: &approval.operation,
            action: approval.action,
            scope: approval.scope,
            control: state.controls().revision,
            history: state.history().position(),
        };
        let request = match (&reviewer.policy, &approval.effect) {
            (
                ReviewPolicy::ConfiguredRead(profile),
                ApprovalEffect::Read {
                    tool,
                    relative_path,
                    query: None,
                },
            ) if tool.as_str() == "read_file" => {
                let Some(path) = relative_path.to_str() else {
                    return Ok(None);
                };
                let target = ReadTarget {
                    operation: basis.operation,
                    action: basis.action,
                    scope: basis.scope,
                    control: basis.control,
                    history: basis.history,
                    directory: &approval.directory,
                    relative_path: path,
                };
                profile.request(&target, source.request())?
            }
            (
                ReviewPolicy::ApproveForMe {
                    external_file_read: true,
                    ..
                },
                ApprovalEffect::Read {
                    tool,
                    relative_path,
                    query: None,
                },
            ) if tool.as_str() == "read_file"
                && approval.directory.as_str() == crate::file_tools::EXTERNAL_FILE_DIRECTORY
                && approval.root == Path::new("/") =>
            {
                let absolute_path = approval.root.join(relative_path);
                let Some(absolute_path) = absolute_path.to_str() else {
                    return Ok(None);
                };
                reviewer
                    .scoped_request(
                        state,
                        &basis,
                        source.request(),
                        approval_review::ScopedAction::ExternalFileRead { absolute_path },
                        &approval,
                        live_network,
                    )
                    .await?
            }
            (
                ReviewPolicy::ApproveForMe { .. },
                ApprovalEffect::EscalatedCommand {
                    filesystem: Some(filesystem),
                    access: Some(access),
                    network: Some(network),
                    listen_port,
                    command,
                    justification,
                    cwd,
                    executable,
                    environment_names,
                },
            ) => {
                let network = match (network, listen_port) {
                    (CommandRetryNetwork::Denied, None) => {
                        approval_review::CommandNetworkScope::Denied
                    }
                    (CommandRetryNetwork::Managed, None) => {
                        approval_review::CommandNetworkScope::Managed
                    }
                    (CommandRetryNetwork::Listen, Some(port)) => {
                        approval_review::CommandNetworkScope::Listen {
                            listen_port: port.get(),
                        }
                    }
                    _ => return Ok(None),
                };
                let filesystem_access = match access {
                    crate::command::CommandAccess::Read => "read",
                    crate::command::CommandAccess::ReadWrite => "read_write",
                };
                let (Some(cwd), Some(executable), Some(workspace_root)) =
                    (cwd.to_str(), executable.to_str(), approval.root.to_str())
                else {
                    return Ok(None);
                };
                if !reviewable_environment(environment_names) {
                    return Ok(None);
                }
                reviewer
                    .scoped_request(
                        state,
                        &basis,
                        source.request(),
                        approval_review::ScopedAction::EscalatedCommand {
                            command: approval_review::CommandReview {
                                terminal: false,
                                finite: false,
                                filesystem,
                                filesystem_access,
                                command,
                                cwd,
                                executable,
                                workspace_root,
                                environment_names,
                            },
                            network,
                            justification,
                        },
                        &approval,
                        live_network,
                    )
                    .await?
            }
            (
                ReviewPolicy::ApproveForMe { .. },
                ApprovalEffect::Command {
                    access,
                    command,
                    terminal,
                    cwd,
                    executable,
                    network,
                    finite,
                    managed_network,
                    filesystem: Some(filesystem),
                    environment_names,
                },
            ) if live_network || network.is_none() || (*finite && !terminal) => {
                let (Some(cwd), Some(executable), Some(workspace_root)) =
                    (cwd.to_str(), executable.to_str(), approval.root.to_str())
                else {
                    return Ok(None);
                };
                if !reviewable_environment(environment_names) {
                    return Ok(None);
                }
                let filesystem_access = match access {
                    crate::command::CommandAccess::Read => "read",
                    crate::command::CommandAccess::ReadWrite => "read_write",
                };
                let command = approval_review::CommandReview {
                    terminal: *terminal,
                    finite: *finite,
                    command,
                    cwd,
                    executable,
                    workspace_root,
                    filesystem_access,
                    filesystem,
                    environment_names,
                };
                let action = match network {
                    Some(network) => approval_review::ScopedAction::NetworkCommand {
                        host: &network.host,
                        port: network.port,
                        command,
                    },
                    None => approval_review::ScopedAction::ConfinedCommand {
                        command,
                        network: if *managed_network {
                            approval_review::CommandNetworkScope::Managed
                        } else {
                            approval_review::CommandNetworkScope::Denied
                        },
                    },
                };
                reviewer
                    .scoped_request(
                        state,
                        &basis,
                        source.request(),
                        action,
                        &approval,
                        live_network,
                    )
                    .await?
            }
            _ => None,
        };
        if let Some(request) = request {
            return Ok(Some(Self {
                wait: id.clone(),
                approval,
                request,
                input_limit: source.input_limit(),
            }));
        }
        Ok(None)
    }
}

fn reviewable_environment(names: &[String]) -> bool {
    names.len() <= 128
        && names.iter().all(|name| {
            !name.is_empty()
                && name.len() <= 128
                && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[test]
    fn a_live_wait_stays_in_review_before_any_inference_is_recorded() {
        use agent_kit_core::turn::{JournalAction, JournalChange, TurnBinding};

        let binding = TurnBinding {
            session: SessionId::new("chat").unwrap(),
            turn: TurnId::new("turn").unwrap(),
            epoch: 1,
        };
        let mut state = TurnState::new(binding.clone()).unwrap();
        let request = ApprovalRequest {
            launch_scope: None,
            session: binding.session.clone(),
            turn: binding.turn.clone(),
            operation: OperationId::new("command").unwrap(),
            action: Fingerprint::of(&"command").unwrap(),
            scope: Fingerprint::of(&"destination").unwrap(),
            directory: BindingId::new("workspace").unwrap(),
            root: "/project".into(),
            effect: ApprovalEffect::Command {
                access: crate::command::CommandAccess::Read,
                command: "curl https://registry.example.test/".into(),
                terminal: false,
                finite: true,
                managed_network: true,
                filesystem: None,
                cwd: "/project".into(),
                executable: "/bin/sh".into(),
                environment_names: Vec::new(),
                network: Some(crate::processes::CommandNetworkDestination {
                    host: "registry.example.test".into(),
                    port: 443,
                }),
            },
        };
        let wait = crate::permissions::live_network_wait(&request, false).unwrap();
        let handoff = crate::permissions::live_network_wait(&request, true).unwrap();
        state
            .apply(
                JournalChange::new(
                    ChangeId::new("open").unwrap(),
                    binding.clone(),
                    state.position(),
                    state.controls().revision,
                    vec![JournalAction::OpenWait(wait.clone())],
                )
                .unwrap(),
            )
            .unwrap();

        let pending = super::super::permissions::pending_approvals(&state).unwrap();
        assert!(pending.approvals[0].reviewing);
        assert!(state.operations().is_empty());
        state
            .apply(
                JournalChange::new(
                    ChangeId::new("handoff").unwrap(),
                    binding,
                    state.position(),
                    state.controls().revision,
                    vec![
                        JournalAction::WithdrawWait(wait.id.clone()),
                        JournalAction::OpenWait(handoff.clone()),
                    ],
                )
                .unwrap(),
            )
            .unwrap();
        let manual = super::super::permissions::pending_approvals(&state).unwrap();
        assert_eq!(manual.approvals.len(), 1);
        assert!(!manual.approvals[0].reviewing);
        assert_eq!(manual.approvals[0].wait_id, handoff.id);
        assert_eq!(manual.approvals[0].request, request);
        assert_ne!(manual.approvals[0].wait_id, wait.id);
    }

    #[test]
    fn repeated_policy_denials_interrupt_while_successful_reviews_do_not() {
        assert!(!denial_limit_reached(&[false; 100]));
        assert!(!denial_limit_reached(&[true, true, false, true]));
        assert!(denial_limit_reached(&[false, true, true, true]));
        let alternating: Vec<_> = (0..50).map(|i| i % 5 == 0).collect();
        assert!(denial_limit_reached(&alternating));
        let mut expired = alternating;
        expired.extend([false; 5]);
        assert!(!denial_limit_reached(&expired));
    }
}
