//! Owned context compaction over the ordinary runtime inference boundary.
//! GRIDA-SEC-006 preserves the captured provider principal and scope on recovery.

use super::*;
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::inference::{
    FailureKind, InferenceFailure, InferenceOutcome, InferenceStatus, PreparedRequest,
};
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::turn::{OperationInput, OperationOutcome, TurnState};
use agent_kit_runtime::{
    CompletionDraft, FinishOutcome, OpenedTurn, OperationKey, SuspendOutcome, SuspensionDraft,
};
use agent_kit_store_sqlite::context::{ContextInstall, UnpromptedClaim};
use agent_kit_store_sqlite::history::{HistoryBasis, HistorySeed, RetainedHistory};
use grida_agent_master::compaction::{
    CompactionAccount, CompactionActivityStatus, CompactionFailure, Coverage, SummaryRequest,
    context_tokens, same_context_scope, summary_request,
};
use grida_agent_master::read_account;
use grida_agent_master::usage::InferenceUsage;

const PLAN_SCHEMA: &str = "grida.agent.native.compaction.plan";
const MAX_PRE_DISPATCH_IDENTITIES: usize = 4;
const AUTOMATIC_TURN_PREFIX: &str = "automatic-compact/";
const AUTOMATIC_SOURCE_BYTES: usize = 96 * 1024;

/// Automatic compaction has a host-owned turn identity that survives recovery.
pub(crate) fn is_automatic_turn(turn: &TurnId) -> bool {
    turn.as_str().starts_with(AUTOMATIC_TURN_PREFIX)
}

pub(crate) fn is_compaction_turn(turn: &TurnId) -> bool {
    turn.as_str().starts_with("compact/") || is_automatic_turn(turn)
}

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) route: Option<super::execution_routes::Selection>,
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
        token_pressure: Option<bool>,
        has_unprojected_suffix: bool,
    },
    /// A side chat's inherited history, summarized before its first turn so
    /// the summary stays background ahead of the side-chat boundary. A side
    /// chat's own turns are never summarized.
    Inherited,
}

impl Host {
    pub(crate) async fn running_standalone_compaction(
        &self,
        session: &SessionId,
    ) -> Option<TurnId> {
        if !self
            .work
            .lock()
            .await
            .active
            .get(session)
            .is_some_and(|active| active.admitted)
        {
            return None;
        }
        let current = self.store.inspect(session.clone()).await.ok()?.current?;
        (is_compaction_turn(&current.binding.turn)
            && current.disposition == agent_kit_sessions::TurnDisposition::Running
            && current.controls.admits_work())
        .then_some(current.binding.turn)
    }

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
            host.refuse_in_side_chat(&session, side_chats::Refusal::Compaction)
                .await?;
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
                Err(error) if error.code == "turn_missing" && !recover => {
                    Launch::Compact(request, None)
                }
                Err(error) => return Err(error),
            };
            let (host, launch) = match launch {
                Launch::Compact(request, _) => {
                    let (host, revision) = host.for_derived_session(&session).await?;
                    (host, Launch::Compact(request, revision))
                }
                existing => (host, existing),
            };
            let ticket = {
                let mut work = host.settled_work(&session).await?;
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
        revision: Option<u64>,
    ) -> Result<Option<Admitted>> {
        let _admission = self.configuration_admission.lock().await;
        let execution = self.execution()?;
        let view = self.store.inspect(session.clone()).await?;
        if let Some(revision) = revision {
            self.selection_at_revision(&view, revision)?;
        }
        self.check_new_submission(&view).await?;
        require_idle(&view)?;
        if !view.queued.is_empty() {
            return Err(problem(ErrorKind::Conflict, "session_queue_waiting"));
        }
        let prefix = self
            .store
            .context_prefix_with(session.clone(), grida_agent_master::history::project)
            .await?;
        let expected_revision = prefix.history.session_revision;
        let mut plan = compaction_plan_for(
            self.selected_route.clone(),
            execution,
            &execution.config,
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
        let configuration = session_configuration(view)?;
        let side = configuration.side.is_some();
        if self.inference_only
            || configuration.subagent.is_some()
            || !is_stored_input(&head.payload)
            || view
                .latest
                .as_ref()
                .is_some_and(|latest| is_automatic_turn(&latest.binding.turn))
        {
            return Ok(None);
        }
        let stored: StoredPrompt = decode_input(head)?;
        if stored.goal.is_some() || !ordinary_text(stored.effort.is_some(), &stored.parts) {
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
        self.check_execution(view).await?;
        let input = self.prepare_input(
            execution,
            &view.session,
            &super::session_configuration(view)?.cwd,
            head,
            None,
            side,
            InputAuthority::RequireCaptured,
        )?;
        let prefix = self
            .store
            .context_prefix_with(
                view.session.clone(),
                grida_agent_master::history::model_context,
            )
            .await?;
        let has_unprojected_suffix = prefix.unprojected_suffix_after.is_some();
        let context = prefix.history;
        if context.session_revision != view.revision {
            return Ok(None);
        }
        if side {
            // Only the inherited history can be summarized, and only while
            // the side chat has no turn of its own to fold into the summary.
            if has_unprojected_suffix || !context.records.is_empty() || view.latest.is_some() {
                return Ok(None);
            }
            let Some(plan) = compaction_plan_for(
                self.selected_route.clone(),
                execution,
                &input.config,
                context,
                CompactionTrigger::Inherited,
            )?
            else {
                return Ok(None);
            };
            return Ok(Some((
                turn,
                AutomaticCompaction {
                    head: head.id.clone(),
                    expected_revision: view.revision,
                    plan,
                },
            )));
        }
        let token_pressure = if has_unprojected_suffix {
            Some(true)
        } else {
            self.compaction_pressure(view, execution, &input, &context)
                .await?
        };
        if token_pressure == Some(false) {
            return Ok(None);
        }
        let Some(plan) = compaction_plan_for(
            self.selected_route.clone(),
            execution,
            &input.config,
            context,
            CompactionTrigger::Automatic {
                token_pressure,
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

    async fn compaction_pressure(
        &self,
        view: &SessionView,
        execution: &Execution,
        input: &PreparedInput,
        context: &RetainedHistory,
    ) -> Result<Option<bool>> {
        let (mut messages, _, _) = super::history::context_material(context.clone())?;
        let history_len = messages.len();
        messages.extend(input.guidance.iter().cloned());
        messages.extend(input.messages.iter().cloned());
        let limit = input.context_limits.auto_compact;
        let estimated = || limit.map(|limit| context_tokens(&messages, None) >= limit.get());
        let Some(latest) = view.latest.as_ref().filter(|latest| {
            context
                .records
                .last()
                .is_some_and(|record| record.turn == latest.binding.turn)
        }) else {
            return Ok(estimated());
        };
        let turn = &latest.binding.turn;
        let tail_len = context
            .records
            .iter()
            .rev()
            .take_while(|record| &record.turn == turn)
            .count();
        let authority = execution.authority.inference.authority.clone();
        let provider = execution.provider_id.clone();
        let model = input.config.model.clone();
        self.store
            .inspect_turn_with(view.session.clone(), turn.clone(), move |state| {
                let compatible = |request: &PreparedRequest| {
                    same_context_scope(request, &model, &provider, &authority)
                };
                if previous_context_rejection(state, compatible) {
                    return Ok(Some(true));
                }
                let prior = state
                    .latest_published_inference(&messages[history_len - tail_len..history_len])
                    .filter(|(request, _)| compatible(request))
                    .map(|(request, outcome)| (request.request(), outcome));
                Ok(limit.map(|limit| context_tokens(&messages, prior) >= limit.get()))
            })
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
        if !is_automatic_turn(turn) {
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
        let cancelling = matches!(&claim, WorkerClaim::Recover(_))
            && view
                .current
                .as_ref()
                .is_some_and(|current| current.binding.turn == *turn && current.controls.cancelled);
        if !cancelling {
            self.check_execution(&view).await?;
        }
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
        let execution = self.execution()?;
        let runtime = execution
            .subscription_provider_for_request(&plan.request)
            .map(|provider| {
                execution
                    .runtime
                    .with_provider(ProviderId::new("chatgpt")?, provider)
            })
            .transpose()?;
        let (opened, _) = self
            .open_owned_turn_with_runtime(
                session,
                turn,
                claim.lease,
                runtime.as_ref().unwrap_or(&execution.runtime),
            )
            .await?;
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
        let mut started_at = None;
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
                        if started_at.is_none() {
                            started_at = grida_agent_master::compaction::now_ms();
                            let mut item = live::CompactionItem::standalone(
                                &binding.turn,
                                CompactionActivityStatus::Running,
                            );
                            item.started_at_ms = started_at;
                            live::publish_compaction(&self.live_updates, &binding, item);
                        }
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
                    let report = self
                        .report_compaction(&binding.session, &binding.turn, &plan, &outcome)
                        .await?;
                    let mut item = live::CompactionItem::standalone(
                        &binding.turn,
                        if report.status == CompactionStatus::Installed {
                            CompactionActivityStatus::Succeeded
                        } else {
                            CompactionActivityStatus::Failed
                        },
                    );
                    item.started_at_ms = started_at;
                    item.finished_at_ms = grida_agent_master::compaction::now_ms()
                        .map(|time| time.max(started_at.unwrap_or(0)));
                    if item.status == CompactionActivityStatus::Succeeded {
                        item.summary = outcome
                            .account
                            .as_ref()
                            .and_then(|account| CompactionAccount::from_envelope(account).ok())
                            .and_then(|account| account.summary().map(str::to_owned));
                    }
                    live::publish_compaction(&self.live_updates, &binding, item);
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

    pub(super) fn compaction_matches_execution(&self, plan: &CompactionPlan) -> bool {
        self.execution().is_ok_and(|execution| {
            plan.request.request().model == execution.config.model
                && plan.request.binding().authority.principal
                    == execution.authority.inference.authority.principal
                && plan.request.binding().authority.scope
                    == execution.authority.inference.authority.scope
        })
    }

    fn current_compaction_request(&self, plan: &CompactionPlan) -> Result<Option<PreparedRequest>> {
        let execution = self.execution()?;
        let old = plan.request.binding();
        let authority = &execution.authority.inference.authority;
        if old.authority.principal != authority.principal || old.authority.scope != authority.scope
        {
            return Ok(None);
        }
        let provider = execution
            .subscription_provider_for_request(&plan.request)
            .unwrap_or_else(|| execution.provider.clone());
        let mut prepared = provider.prepare(plan.request.request().clone())?;
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
                self.check_execution(&view).await?;
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

pub(super) fn ordinary_text(ultra: bool, parts: &[PromptPart]) -> bool {
    !ultra
        && parts
            .iter()
            .all(|part| matches!(part, PromptPart::Text { .. }))
}

fn compaction_plan_for(
    route: Option<super::execution_routes::Selection>,
    execution: &Execution,
    configuration: &MasterConfig,
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
    if matches!(trigger, CompactionTrigger::Inherited) && !turns.is_empty() {
        return Ok(None);
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
    let automatic_pressure = match trigger {
        CompactionTrigger::Manual => None,
        CompactionTrigger::Automatic { token_pressure, .. } => Some(token_pressure),
        CompactionTrigger::Inherited => Some(None),
    };
    if let Some(token_pressure) = automatic_pressure
        && (!token_pressure.unwrap_or(coverage.input_bytes >= AUTOMATIC_SOURCE_BYTES)
            || coverage.omissions.media != 0
            || coverage.omissions.tool_results_with_media != 0)
    {
        return Ok(None);
    }
    let request = execution.provider.prepare(inference)?;
    Ok(Some(CompactionPlan {
        route,
        source,
        request,
        coverage,
        covered_through: covered_through.or(prefix_end),
    }))
}

fn previous_context_rejection(
    state: &TurnState,
    compatible: impl Fn(&PreparedRequest) -> bool,
) -> bool {
    let Some(rejection) = state
        .outcome()
        .filter(|outcome| outcome.status == OutcomeStatus::Failed)
        .and_then(|outcome| outcome.account.as_ref())
        .and_then(|account| read_account(account).ok())
        .and_then(|account| account.inference_failure)
        .filter(|failure| {
            failure.kind == FailureKind::ContextLimit && failure.code == "context_limit"
        })
    else {
        return false;
    };
    let Some(user) = state.history().records().iter().rev().find_map(|record| {
        let HistoryRecord::Message(message) = record;
        (message.role == Role::User).then_some(message)
    }) else {
        return false;
    };
    state.operations().values().any(|operation| {
        matches!(
            (&operation.record.input, operation.outcome()),
            (OperationInput::Inference(request), Some(OperationOutcome::Inference(outcome)))
                if compatible(request)
                    && request.request().messages.contains(user)
                    && outcome.status == InferenceStatus::Limited
                    && outcome.failure.as_ref() == Some(&rejection)
        )
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
