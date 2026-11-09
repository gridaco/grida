//! Owned context compaction over the ordinary runtime inference boundary.
//! GRIDA-SEC-006 preserves the captured provider principal and scope on recovery.

use super::*;
use agent_kit_core::inference::{FailureKind, InferenceFailure, InferenceOutcome, PreparedRequest};
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::turn::{OperationOutcome, TurnState};
use agent_kit_runtime::{
    CompletionDraft, FinishOutcome, OpenedTurn, OperationKey, SuspendOutcome, SuspensionDraft,
};
use agent_kit_store_sqlite::context::{ContextInstall, UnpromptedClaim};
use agent_kit_store_sqlite::history::{HistoryBasis, HistorySeed};
use grida_agent_master::compaction::{
    CompactionAccount, CompactionFailure, Coverage, summary_request,
};
use grida_agent_master::usage::InferenceUsage;

const PLAN_SCHEMA: &str = "grida.agent.native.compaction.plan";
const MAX_PRE_DISPATCH_IDENTITIES: usize = 4;

#[derive(Clone)]
pub struct CompactRequest {
    pub session: SessionId,
    pub request: ChangeId,
    pub recover: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompactionStatus {
    Running,
    Suspended,
    Interrupted,
    Installed,
    Stale,
    Failed,
    Stopped,
    Uncertain,
    NoChange,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactionReport {
    pub turn_id: Option<TurnId>,
    pub status: CompactionStatus,
    pub covered_records: Option<usize>,
    pub failure: Option<CompactionFailure>,
    pub provider_failure: Option<agent_kit_core::inference::InferenceFailure>,
    pub inference_usage: Option<InferenceUsage>,
}

impl CompactionReport {
    fn state(turn_id: Option<TurnId>, status: CompactionStatus) -> Self {
        Self {
            turn_id,
            status,
            covered_records: None,
            failure: None,
            provider_failure: None,
            inference_usage: None,
        }
    }
}

#[derive(Serialize, Deserialize)]
pub(super) struct CompactionPlan {
    source: HistoryBasis,
    request: PreparedRequest,
    coverage: Coverage,
}

impl Host {
    pub async fn compact(&self, request: CompactRequest) -> Result<CompactionReport> {
        self.compact_observed(request, None).await
    }

    pub(crate) async fn compact_observed(
        &self,
        request: CompactRequest,
        accepted: Option<oneshot::Sender<TurnId>>,
    ) -> Result<CompactionReport> {
        self.owned_control(move |host| async move {
            let CompactRequest {
                session,
                request,
                recover,
            } = request;
            let fingerprint = Fingerprint::of(&(&session, &request))?;
            let turn = TurnId::new(format!(
                "compact/{:x}",
                uuid::Uuid::from_bytes(
                    fingerprint.bytes()[..16]
                        .try_into()
                        .expect("fingerprint prefix")
                )
            ))?;
            let launch = match host.store.inspect_turn(session.clone(), turn.clone()).await {
                Ok(view) => {
                    let plan = host
                        .compaction_plan(session.clone(), turn.clone())
                        .await?
                        .ok_or_else(|| {
                            problem(ErrorKind::Conflict, "compaction_identity_reused")
                        })?;
                    match view.disposition {
                        TurnDisposition::Settled => {
                            return host
                                .report_compaction(
                                    &session,
                                    &turn,
                                    &plan,
                                    &view.outcome.ok_or_else(|| {
                                        problem(
                                            ErrorKind::InvalidState,
                                            "compaction_outcome_missing",
                                        )
                                    })?,
                                )
                                .await;
                        }
                        TurnDisposition::Running => {
                            return Ok(CompactionReport::state(
                                Some(turn),
                                CompactionStatus::Running,
                            ));
                        }
                        TurnDisposition::Suspended => {
                            return Ok(CompactionReport::state(
                                Some(turn),
                                CompactionStatus::Suspended,
                            ));
                        }
                        TurnDisposition::Interrupted if !recover => {
                            return Ok(CompactionReport::state(
                                Some(turn),
                                CompactionStatus::Interrupted,
                            ));
                        }
                        TurnDisposition::Interrupted => {
                            Launch::RecoverCompaction(RecoveryRequest {
                                id: change_id()?,
                                session: session.clone(),
                                turn: turn.clone(),
                                expected_epoch: view.binding.epoch,
                            })
                        }
                    }
                }
                Err(error) if error.code == "turn_missing" && !recover => Launch::Compact(request),
                Err(error) => return Err(error),
            };
            let ticket = {
                let mut work = host.work.lock().await;
                host.register(&mut work, session.clone(), turn.clone(), launch)?
            };
            match ticket
                .admission
                .await
                .map_err(|_| problem(ErrorKind::Uncertain, "compaction_admission_interrupted"))?
            {
                Ok(_) => {}
                Err(error) if error.code == "compaction_nothing_to_do" => {
                    return Ok(CompactionReport::state(None, CompactionStatus::NoChange));
                }
                Err(error) => return Err(error),
            }
            if let Some(accepted) = accepted {
                let _ = accepted.send(turn.clone());
            }
            match ticket
                .completion
                .await
                .map_err(|_| problem(ErrorKind::Uncertain, "compaction_worker_interrupted"))??
            {
                RunResult::Settled(outcome) => {
                    let plan = host
                        .compaction_plan(session.clone(), turn.clone())
                        .await?
                        .ok_or_else(|| {
                            problem(ErrorKind::InvalidState, "compaction_plan_missing")
                        })?;
                    host.report_compaction(&session, &turn, &plan, &outcome)
                        .await
                }
                RunResult::Suspended => Ok(CompactionReport::state(
                    Some(turn),
                    CompactionStatus::Suspended,
                )),
                RunResult::InputRequired(_) => Err(problem(
                    ErrorKind::InvalidState,
                    "unexpected_compaction_input",
                )),
            }
        })
        .await
    }

    pub(super) async fn compaction_plan(
        &self,
        session: SessionId,
        turn: TurnId,
    ) -> Result<Option<CompactionPlan>> {
        self.store
            .inspect_turn_with(session, turn, |state| {
                let Some(checkpoint) = state
                    .checkpoint()
                    .filter(|value| value.schema().as_str() == PLAN_SCHEMA)
                else {
                    return Ok(None);
                };
                if checkpoint.version() != 1 {
                    return Err(problem(
                        ErrorKind::Unsupported,
                        "unsupported_compaction_plan",
                    ));
                }
                serde_json::from_slice(checkpoint.bytes())
                    .map(Some)
                    .map_err(|_| problem(ErrorKind::InvalidState, "invalid_compaction_plan"))
            })
            .await
    }

    pub(super) async fn admit_compaction(
        &self,
        session: &SessionId,
        turn: &TurnId,
        request: ChangeId,
    ) -> Result<Option<Admitted>> {
        let _admission = self.configuration_admission.lock().await;
        let execution = self.execution()?;
        let view = self.store.inspect(session.clone()).await?;
        self.check_execution(&view)?;
        require_idle(&view)?;
        if !view.queued.is_empty() {
            return Err(problem(ErrorKind::Conflict, "session_queue_waiting"));
        }
        let context = self
            .store
            .context_history_with(session.clone(), None, grida_agent_master::history::project)
            .await?;
        let expected_revision = context.session_revision;
        let source = context.basis.clone();
        let has_local_records = !context.records.is_empty();
        let (messages, omissions, compacted) = super::history::context_material(context)?;
        if compacted && !has_local_records {
            return Err(problem(ErrorKind::InvalidInput, "compaction_nothing_to_do"));
        }
        let Some((inference, coverage)) = summary_request(
            execution.config.model.clone(),
            execution.config.max_output_tokens,
            messages,
            omissions,
        )?
        else {
            return Err(problem(ErrorKind::InvalidInput, "compaction_nothing_to_do"));
        };
        let defaults = self.with_configuration(Configuration::snapshot).await?;
        let mut prepared = execution.provider.prepare(inference)?;
        if let Some(limit) = defaults.defaults.context.max_input_tokens {
            prepared = prepared.with_input_limit(limit)?;
        }
        let plan = CompactionPlan {
            source: source.clone(),
            request: prepared,
            coverage,
        };
        let claim = self
            .store
            .claim_unprompted(UnpromptedClaim {
                session: session.clone(),
                turn: turn.clone(),
                request,
                expected_revision,
                expected_context: source,
                checkpoint: encode(PLAN_SCHEMA, 1, &plan)?,
            })
            .await?;
        self.open_compaction(session, turn, claim, plan).await
    }

    pub(super) async fn admit_retained_compaction(
        &self,
        session: &SessionId,
        turn: &TurnId,
        claim: WorkerClaim,
        plan: CompactionPlan,
    ) -> Result<Option<Admitted>> {
        self.execution()?;
        let claim = match claim {
            WorkerClaim::Select(request) => self.store.claim(request).await?,
            WorkerClaim::Recover(request) => self.store.recover(request).await?,
        };
        self.open_compaction(session, turn, claim, plan).await
    }

    async fn open_compaction(
        &self,
        session: &SessionId,
        turn: &TurnId,
        claim: ClaimOutcome,
        plan: CompactionPlan,
    ) -> Result<Option<Admitted>> {
        let ClaimOutcome::Acquired(claim) = claim else {
            return Ok(None);
        };
        let (opened, _) = self.open_owned_turn(session, turn, claim.lease).await?;
        Ok(Some(Admitted {
            opened,
            work: TurnWork::Compaction(Box::new(plan)),
            acceptance: None,
        }))
    }

    pub(super) async fn drive_compaction(
        &self,
        opened: OpenedTurn,
        plan: CompactionPlan,
    ) -> Result<RunResult> {
        let mut turn = opened.turn;
        let operations = turn.operations();
        let binding = turn.view().state.binding().clone();
        let key = OperationKey::new(format!("compact/summary/{}", binding.epoch))?;
        let current_operation = operations.operation_id(&key)?;
        for (id, operation) in turn.view().state.operations() {
            if operation.is_running() {
                operations.record_interruption(id.clone()).await?;
            }
        }
        for _ in 0..8 {
            let view = turn.view();
            let state = &view.state;
            let controls = state.controls();
            if controls.paused && !controls.cancelled {
                match turn
                    .try_suspend(SuspensionDraft {
                        expected_control: controls.revision,
                        expected_history: state.history().position(),
                        checkpoint: None,
                    })
                    .await?
                {
                    SuspendOutcome::Suspended(receipt) => {
                        self.store.verify(CommitReceipt::Suspended(receipt)).await?;
                        return Ok(RunResult::Suspended);
                    }
                    SuspendOutcome::Continue(error) if error.code == "stale_completion_basis" => {
                        continue;
                    }
                    SuspendOutcome::Continue(error) => return Err(error),
                }
            }
            // A replacement operation is allowed only before any dispatch.
            // Cancel old prepared identities before settling or opening a new epoch.
            let mut retired = false;
            for (id, operation) in state.operations() {
                if operation.outcome().is_none() && (id != &current_operation || controls.cancelled)
                {
                    operations.cancel_prepared(id.clone()).await?;
                    retired = true;
                }
            }
            if retired {
                continue;
            }
            let attempted = attempted_summary(state)?;
            let existing = state
                .operations()
                .get(&current_operation)
                .and_then(|operation| operation.outcome());
            let usage = InferenceUsage::from_turn(state)?;
            let (status, account) = if controls.cancelled {
                let uncertain = attempted.is_some_and(|outcome| {
                    outcome.status == agent_kit_core::inference::InferenceStatus::Interrupted
                });
                let (status, failure) = if uncertain {
                    (OutcomeStatus::Uncertain, CompactionFailure::Uncertain)
                } else {
                    (OutcomeStatus::Cancelled, CompactionFailure::Stopped)
                };
                let mut account = CompactionAccount::failed(plan.coverage.clone(), failure, usage);
                account.provider_failure = attempted.and_then(|outcome| outcome.failure.clone());
                (status, account)
            } else if let Some(outcome) = attempted.or(existing.and_then(inference_outcome)) {
                CompactionAccount::from_inference(plan.coverage.clone(), outcome, usage)
            } else if state.operations().len() >= MAX_PRE_DISPATCH_IDENTITIES
                && !state.operations().contains_key(&current_operation)
            {
                (
                    OutcomeStatus::Failed,
                    CompactionAccount::failed(
                        plan.coverage.clone(),
                        CompactionFailure::RecoveryLimit,
                        usage,
                    ),
                )
            } else {
                let account = match self.current_compaction_request(&plan) {
                    Ok(Some(prepared)) => {
                        let grant = self.execution()?.authority.inference.clone();
                        match operations.infer(key.clone(), prepared, grant).await {
                            Ok(_) => continue,
                            Err(error) if error.code == "admission_closed" => continue,
                            Err(error) => return Err(error),
                        }
                    }
                    Ok(None) => CompactionAccount::failed(
                        plan.coverage.clone(),
                        CompactionFailure::AuthorityChanged,
                        usage,
                    ),
                    Err(error) => {
                        let mut account = CompactionAccount::failed(
                            plan.coverage.clone(),
                            CompactionFailure::Provider,
                            usage,
                        );
                        account.provider_failure = Some(InferenceFailure {
                            kind: FailureKind::Configuration,
                            code: error.code,
                            retry_after_ms: None,
                        });
                        account
                    }
                };
                (OutcomeStatus::Failed, account)
            };
            if state
                .operations()
                .get(&current_operation)
                .is_some_and(|op| op.outcome().is_none())
            {
                operations
                    .cancel_prepared(current_operation.clone())
                    .await?;
            }
            let outcome = TurnOutcome {
                status,
                account: Some(account.to_envelope()?),
                evidence: state.operations().keys().cloned().collect(),
            };
            match turn
                .try_finish(CompletionDraft {
                    expected_control: controls.revision,
                    expected_history: state.history().position(),
                    outcome: outcome.clone(),
                })
                .await?
            {
                FinishOutcome::Settled(receipt) => {
                    self.store.verify(CommitReceipt::Settled(*receipt)).await?;
                    self.report_compaction(&binding.session, &binding.turn, &plan, &outcome)
                        .await?;
                    return Ok(RunResult::Settled(outcome));
                }
                FinishOutcome::Continue(error) if error.code == "stale_completion_basis" => {
                    continue;
                }
                FinishOutcome::Continue(error) => return Err(error),
            }
        }
        Err(problem(ErrorKind::Conflict, "compaction_control_changed"))
    }

    fn current_compaction_request(&self, plan: &CompactionPlan) -> Result<Option<PreparedRequest>> {
        let execution = self.execution()?;
        let old = plan.request.binding();
        let authority = &execution.authority.inference.authority;
        if old.authority.principal != authority.principal || old.authority.scope != authority.scope
        {
            return Ok(None);
        }
        let mut prepared = execution.provider.prepare(plan.request.request().clone())?;
        if prepared.binding().provider != old.provider || &prepared.binding().authority != authority
        {
            return Ok(None);
        }
        if let Some(limit) = plan.request.input_limit() {
            prepared = prepared.with_input_limit(limit)?;
        }
        Ok(Some(prepared))
    }

    async fn report_compaction(
        &self,
        session: &SessionId,
        turn: &TurnId,
        plan: &CompactionPlan,
        outcome: &TurnOutcome,
    ) -> Result<CompactionReport> {
        let account = CompactionAccount::from_envelope(
            outcome
                .account
                .as_ref()
                .ok_or_else(|| problem(ErrorKind::InvalidState, "compaction_account_missing"))?,
        )?;
        let status = match outcome.status {
            OutcomeStatus::Succeeded => {
                let (records, provenance) = account.replacement(plan.source.fingerprint)?;
                match self
                    .store
                    .install_context(ContextInstall {
                        session: session.clone(),
                        turn: turn.clone(),
                        expected_context: plan.source.clone(),
                        expected_outcome: Fingerprint::of(outcome)?,
                        replacement: HistorySeed {
                            records,
                            provenance,
                        },
                    })
                    .await
                {
                    Ok(()) => CompactionStatus::Installed,
                    Err(error)
                        if matches!(
                            error.code.as_str(),
                            "context_install_basis_changed" | "history_basis_changed"
                        ) =>
                    {
                        CompactionStatus::Stale
                    }
                    Err(error) => return Err(error),
                }
            }
            OutcomeStatus::Failed => CompactionStatus::Failed,
            OutcomeStatus::Cancelled => CompactionStatus::Stopped,
            OutcomeStatus::Uncertain => CompactionStatus::Uncertain,
        };
        Ok(CompactionReport {
            turn_id: Some(turn.clone()),
            status,
            covered_records: Some(account.coverage.records),
            failure: account.failure,
            provider_failure: account.provider_failure,
            inference_usage: Some(account.inference_usage),
        })
    }
}

fn attempted_summary(state: &TurnState) -> Result<Option<&InferenceOutcome>> {
    let mut attempts = state
        .operations()
        .values()
        .filter(|operation| !operation.attempts.is_empty());
    let Some(operation) = attempts.next() else {
        return Ok(None);
    };
    if attempts.next().is_some() {
        return Err(problem(
            ErrorKind::InvalidState,
            "multiple_compaction_attempts",
        ));
    }
    operation
        .outcome()
        .and_then(inference_outcome)
        .map(Some)
        .ok_or_else(|| problem(ErrorKind::Uncertain, "compaction_attempt_unsettled"))
}

fn inference_outcome(outcome: &OperationOutcome) -> Option<&InferenceOutcome> {
    match outcome {
        OperationOutcome::Inference(outcome) => Some(outcome),
        OperationOutcome::Tool(_) => None,
    }
}
