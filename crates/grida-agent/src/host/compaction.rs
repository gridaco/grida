//! Owned context compaction over the ordinary runtime inference boundary.
//! GRIDA-SEC-006 preserves the captured provider principal and scope on recovery.

use super::*;
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::inference::{
    FailureKind, InferenceFailure, InferenceOutcome, InferenceStatus, MeasurementKind,
    PreparedRequest,
};
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::turn::{OperationInput, OperationOutcome, TurnState};
use agent_kit_runtime::{
    CompletionDraft, FinishOutcome, OpenedTurn, OperationKey, SuspendOutcome, SuspensionDraft,
};
use agent_kit_store_sqlite::context::{ContextInstall, UnpromptedClaim};
use agent_kit_store_sqlite::history::{HistoryBasis, HistorySeed, RetainedHistory};
use grida_agent_master::compaction::{
    CompactionAccount, CompactionFailure, Coverage, SummaryRequest, summary_request,
};
use grida_agent_master::read_account;
use grida_agent_master::usage::InferenceUsage;

const PLAN_SCHEMA: &str = "grida.agent.native.compaction.plan";
const MAX_PRE_DISPATCH_IDENTITIES: usize = 4;
pub(crate) const AUTOMATIC_TURN_PREFIX: &str = "automatic-compact/";
const AUTOMATIC_SOURCE_BYTES: usize = 96 * 1024;

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    covered_through: Option<TurnId>,
}

pub(super) struct AutomaticCompaction {
    head: ChangeId,
    expected_revision: SessionRevision,
    plan: CompactionPlan,
}

enum CompactionTrigger {
    Manual,
    Automatic {
        verified_pressure: bool,
        has_unprojected_suffix: bool,
    },
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
        let prefix = self
            .store
            .context_prefix_with(session.clone(), grida_agent_master::history::project)
            .await?;
        let expected_revision = prefix.history.session_revision;
        let defaults = self.with_configuration(Configuration::snapshot).await?;
        let mut plan = compaction_plan_for(
            execution,
            &execution.config,
            defaults.defaults.context.max_input_tokens,
            prefix.history,
            CompactionTrigger::Manual,
        )?
        .ok_or_else(|| problem(ErrorKind::InvalidInput, "compaction_nothing_to_do"))?;
        // A partial projection can replace only the complete prefix it covered.
        // The summary policy may choose an earlier boundary within that prefix.
        plan.covered_through = plan.covered_through.or(prefix.unprojected_suffix_after);
        let claim = self
            .store
            .claim_unprompted(UnpromptedClaim {
                session: session.clone(),
                turn: turn.clone(),
                request,
                expected_revision,
                expected_context: plan.source.clone(),
                checkpoint: encode(PLAN_SCHEMA, 1, &plan)?,
            })
            .await?;
        self.open_compaction(session, turn, claim, plan).await
    }

    pub(super) async fn select_queued_compaction(
        &self,
        session: &SessionId,
        reserved: &TurnId,
        direct: Option<&ChangeId>,
        recovery: Option<SessionRevision>,
    ) -> Option<(TurnId, AutomaticCompaction)> {
        let view = self.store.inspect(session.clone()).await.ok()?;
        if view.current.is_some()
            || view.admission_paused
            || recovery.is_some_and(|revision| revision != view.revision)
            || direct
                .is_some_and(|input| view.queued.first().map(|head| &head.input.id) != Some(input))
        {
            return None;
        }
        let (turn, plan) = self.prepare_automatic_compaction(&view).await.ok()??;
        let mut work = self.work.lock().await;
        if work.closed {
            return None;
        }
        let active = work.active.get_mut(session)?;
        if active.admitted || &active.turn != reserved {
            return None;
        }
        // The ordinary queue slot is already owned, but has no journal yet.
        active.turn = turn.clone();
        Some((turn, plan))
    }

    async fn prepare_automatic_compaction(
        &self,
        view: &SessionView,
    ) -> Result<Option<(TurnId, AutomaticCompaction)>> {
        let Some(head) = view.queued.first().map(|entry| &entry.input) else {
            return Ok(None);
        };
        if self.side_context.is_some()
            || session_configuration(view)?.subagent.is_some()
            || head.payload.schema().as_str() != INPUT_SCHEMA
            || !matches!(head.payload.version(), 2 | 3)
            || view.latest.as_ref().is_some_and(|latest| {
                latest
                    .binding
                    .turn
                    .as_str()
                    .starts_with(AUTOMATIC_TURN_PREFIX)
            })
        {
            return Ok(None);
        }
        let stored: StoredPrompt = decode_input(head)?;
        if stored.goal.is_some()
            || !ordinary_text(
                stored.configuration_permission,
                stored.effort.is_some(),
                &stored.parts,
            )
        {
            return Ok(None);
        }
        let fingerprint = Fingerprint::of(&(&view.session, &head.id, 1_u8))?;
        let turn = TurnId::new(format!(
            "{AUTOMATIC_TURN_PREFIX}{:x}",
            uuid::Uuid::from_bytes(
                fingerprint.bytes()[..16]
                    .try_into()
                    .expect("fingerprint prefix")
            )
        ))?;
        match self
            .store
            .inspect_turn(view.session.clone(), turn.clone())
            .await
        {
            Ok(_) => return Ok(None),
            Err(error) if error.code == "turn_missing" => {}
            Err(error) => return Err(error),
        }
        let execution = self.execution()?;
        self.check_execution(view)?;
        let input = self.prepare_input(
            execution,
            &view.session,
            head,
            None,
            InputAuthority::RequireCaptured,
        )?;
        let prefix = self
            .store
            .context_prefix_with(view.session.clone(), grida_agent_master::history::project)
            .await?;
        let has_unprojected_suffix = prefix.unprojected_suffix_after.is_some();
        let context = prefix.history;
        if context.session_revision != view.revision {
            return Ok(None);
        }
        let verified_pressure = has_unprojected_suffix
            || self
                .verified_compaction_pressure(
                    view,
                    execution,
                    &input,
                    context.records.last().map(|entry| &entry.turn),
                )
                .await
                .unwrap_or(false);
        let Some(plan) = compaction_plan_for(
            execution,
            &input.config,
            input.limit,
            context,
            CompactionTrigger::Automatic {
                verified_pressure,
                has_unprojected_suffix,
            },
        )?
        else {
            return Ok(None);
        };
        Ok(Some((
            turn,
            AutomaticCompaction {
                head: head.id.clone(),
                expected_revision: view.revision,
                plan,
            },
        )))
    }

    async fn verified_compaction_pressure(
        &self,
        view: &SessionView,
        execution: &Execution,
        input: &PreparedInput,
        retained_tail: Option<&TurnId>,
    ) -> Result<bool> {
        let Credential::Http(transport) = &execution.authorization.credential else {
            return Ok(false);
        };
        let model = input.config.model.clone();
        let threshold = transport
            .verified_context_window(&model)
            .zip(input.config.max_output_tokens)
            .and_then(|(window, output)| window.get().checked_sub(output))
            .and_then(NonZeroU64::new)
            .map(|usable| input.limit.map_or(usable, |limit| usable.min(limit)));
        let Some(latest) = view.latest.as_ref().filter(|turn| {
            retained_tail == Some(&turn.binding.turn)
                && turn
                    .outcome
                    .as_ref()
                    .is_some_and(|outcome| match outcome.status {
                        OutcomeStatus::Succeeded => threshold.is_some(),
                        OutcomeStatus::Failed => true,
                        _ => false,
                    })
        }) else {
            return Ok(false);
        };
        let binding = transport.binding().clone();
        self.store
            .inspect_turn_with(
                view.session.clone(),
                latest.binding.turn.clone(),
                move |state| {
                    Ok(previous_context_pressure(
                        state, &binding, &model, threshold,
                    ))
                },
            )
            .await
    }

    pub(super) async fn admit_automatic_compaction(
        &self,
        session: &SessionId,
        turn: &TurnId,
        automatic: AutomaticCompaction,
    ) -> Result<Option<Admitted>> {
        let _admission = self.configuration_admission.lock().await;
        let AutomaticCompaction {
            head,
            expected_revision,
            plan,
        } = automatic;
        let claim = self
            .store
            .claim_unprompted_before_input(
                UnpromptedClaim {
                    session: session.clone(),
                    turn: turn.clone(),
                    request: ChangeId::new(turn.as_str())?,
                    expected_revision,
                    expected_context: plan.source.clone(),
                    checkpoint: encode(PLAN_SCHEMA, 1, &plan)?,
                },
                head,
            )
            .await?;
        self.open_compaction(session, turn, claim, plan).await
    }

    pub(super) async fn install_pending_automatic_compaction(
        &self,
        view: &SessionView,
    ) -> Result<()> {
        let Some(latest) = &view.latest else {
            return Ok(());
        };
        let turn = &latest.binding.turn;
        if !turn.as_str().starts_with(AUTOMATIC_TURN_PREFIX) {
            return Ok(());
        }
        let Some(outcome) = latest
            .outcome
            .as_ref()
            .filter(|outcome| outcome.status == OutcomeStatus::Succeeded)
        else {
            return Ok(());
        };
        let Some(plan) = self
            .compaction_plan(view.session.clone(), turn.clone())
            .await?
        else {
            return Err(problem(ErrorKind::InvalidState, "compaction_plan_missing"));
        };
        self.report_compaction(&view.session, turn, &plan, outcome)
            .await?;
        Ok(())
    }

    pub(super) async fn admit_retained_compaction(
        &self,
        session: &SessionId,
        turn: &TurnId,
        claim: WorkerClaim,
        plan: CompactionPlan,
    ) -> Result<Option<Admitted>> {
        let view = self.store.inspect(session.clone()).await?;
        self.check_execution(&view)?;
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
                            dispatch: None,
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
                let view = self.store.inspect(session.clone()).await?;
                self.check_execution(&view)?;
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
                        covered_through: plan.covered_through.clone(),
                    })
                    .await
                {
                    Ok(()) => CompactionStatus::Installed,
                    Err(error)
                        if matches!(
                            error.code.as_str(),
                            "context_install_basis_changed"
                                | "history_basis_changed"
                                | "context_coverage_boundary_changed"
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

pub(super) fn ordinary_text(
    configuration: crate::ConfigurationPermission,
    ultra: bool,
    parts: &[PromptPart],
) -> bool {
    configuration != crate::ConfigurationPermission::Change
        && !ultra
        && parts
            .iter()
            .all(|part| matches!(part, PromptPart::Text { .. }))
}

fn compaction_plan_for(
    execution: &Execution,
    configuration: &MasterConfig,
    limit: Option<NonZeroU64>,
    mut context: RetainedHistory,
    trigger: CompactionTrigger,
) -> Result<Option<CompactionPlan>> {
    let source = context.basis.clone();
    let records = std::mem::take(&mut context.records);
    let (seed, omissions, compacted) = super::history::context_material(context)?;
    if compacted && records.is_empty() {
        return Ok(None);
    }
    let mut turns: Vec<(TurnId, Vec<Message>)> = Vec::new();
    for entry in records {
        let HistoryRecord::Message(message) = entry.record;
        match turns.last_mut() {
            Some((turn, messages)) if *turn == entry.turn => messages.push(message),
            _ => turns.push((entry.turn, vec![message])),
        }
    }
    let prefix_end = if let CompactionTrigger::Automatic {
        has_unprojected_suffix,
        ..
    } = &trigger
    {
        // Keep the most recent complete turn. A bounded projection already
        // leaves that turn outside the summary source.
        if !has_unprojected_suffix {
            turns.pop();
        }
        let Some((last, _)) = turns.last() else {
            return Ok(None);
        };
        Some(last.clone())
    } else {
        None
    };
    let Some(SummaryRequest {
        inference,
        coverage,
        covered_through,
    }) = summary_request(
        configuration.model.clone(),
        configuration.max_output_tokens,
        seed,
        turns,
        omissions,
    )?
    else {
        return Ok(None);
    };
    if let CompactionTrigger::Automatic {
        verified_pressure, ..
    } = trigger
        && ((!verified_pressure && coverage.input_bytes < AUTOMATIC_SOURCE_BYTES)
            || coverage.omissions.media != 0
            || coverage.omissions.tool_results_with_media != 0)
    {
        return Ok(None);
    }
    let mut request = execution.provider.prepare(inference)?;
    if let Some(limit) = limit {
        request = request.with_input_limit(limit)?;
    }
    Ok(Some(CompactionPlan {
        source,
        request,
        coverage,
        covered_through: covered_through.or(prefix_end),
    }))
}

fn previous_context_pressure(
    state: &TurnState,
    binding: &ProviderBinding,
    model: &ModelId,
    threshold: Option<NonZeroU64>,
) -> bool {
    let Some(terminal) = state.outcome() else {
        return false;
    };
    let threshold = threshold.filter(|_| terminal.status == OutcomeStatus::Succeeded);
    let rejection = terminal
        .account
        .as_ref()
        .filter(|_| terminal.status == OutcomeStatus::Failed)
        .and_then(|account| read_account(account).ok())
        .and_then(|account| account.inference_failure)
        .filter(|failure| {
            failure.kind == FailureKind::ContextLimit && failure.code == "context_limit"
        });
    if threshold.is_none() && rejection.is_none() {
        return false;
    }
    // Helper requests can quote conversation text, but only an ordinary
    // request carries this turn's exact user message in its prepared input.
    let Some(user) = state.history().records().iter().rev().find_map(|record| {
        let HistoryRecord::Message(message) = record;
        (message.role == Role::User).then_some(message)
    }) else {
        return false;
    };
    state.operations().values().any(|operation| {
        let OperationInput::Inference(request) = &operation.record.input else {
            return false;
        };
        let previous = request.binding();
        if previous.provider != binding.provider
            || previous.authority.principal != binding.authority.principal
            || previous.authority.scope != binding.authority.scope
            || &request.request().model != model
            || !request.request().messages.contains(user)
        {
            return false;
        }
        let Some(attempt) = operation.attempts.last() else {
            return false;
        };
        let Some(OperationOutcome::Inference(outcome)) = &attempt.outcome else {
            return false;
        };
        if let Some(rejection) = &rejection {
            return outcome.status == InferenceStatus::Limited
                && outcome.failure.as_ref() == Some(rejection);
        }
        outcome.status == InferenceStatus::Completed
            && threshold.is_some_and(|threshold| {
                outcome
                    .usage
                    .iter()
                    .filter(|usage| {
                        usage.attempt == attempt.id
                            && usage.source == binding.provider.as_str()
                            && usage.category == "input_tokens"
                            && usage.unit == "tokens"
                    })
                    .max_by_key(|usage| usage.revision)
                    .is_some_and(|usage| {
                        usage.final_value
                            && usage.certainty == MeasurementKind::Exact
                            && usage.quantity >= threshold.get()
                    })
            })
    })
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
