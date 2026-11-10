//! GRIDA-SEC-004 — explicit goal work and turn-local metadata tools.

use super::*;
use agent_kit_core::driver_state::{DriverStateChange, DriverStateRevision};
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::{GrantId, ToolId};
use agent_kit_store_sqlite::driver::{DriverControlPlan, DriverControlRequest};
use grida_agent_master::goals::{
    Allowance, Basis, ChildWork, ChildWorkObserver, CompletionReview, Continuation, Goal,
    Objective, Reservation, Status, Usage, inference_attempts, tools,
};
use std::num::NonZeroU32;

pub(super) const INSTRUCTIONS: &str = "This work was explicitly reserved for a persistent goal. Use goal_inspect for the captured objective, criteria, and allowance. Record one goal_report when the work has been assessed. A completion proposal needs verified evidence for every criterion. Existing permissions still apply.";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GoalRequest {
    pub objective: Objective,
    pub allowance: Allowance,
    #[serde(default)]
    pub automatic: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub user_review: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub(super) enum GoalInput {
    Start(GoalRequest),
    Continue(Continuation),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum GoalAction {
    Pause,
    Resume,
    Revise { objective: Objective },
    ConfirmCompletion { turn: TurnId },
    ReconcileReview { turn: TurnId },
    Clear,
}

#[derive(Clone)]
pub struct GoalControl {
    pub id: ChangeId,
    pub session: SessionId,
    pub expected_revision: SessionRevision,
    pub expected_state: DriverStateRevision,
    pub basis: Basis,
    pub action: GoalAction,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalInspection {
    pub session: SessionId,
    pub revision: SessionRevision,
    pub state_revision: DriverStateRevision,
    pub goal: Option<GoalView>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalView {
    pub basis: Basis,
    pub objective: Objective,
    pub status: Status,
    pub paused: bool,
    pub automatic: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort: Option<EffortPreset>,
    pub progress: Option<String>,
    pub allowance: Allowance,
    pub spent: Usage,
    pub remaining: Usage,
    pub reservation: Option<Reservation>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub review: Option<CompletionReview>,
}

impl Host {
    /// Accept an explicit user goal. Its first reservation is made at claim.
    pub async fn start_goal(
        &self,
        request: PromptRequest,
        goal: GoalRequest,
    ) -> Result<DurableSubmission> {
        self.start_goal_with_wakeup(request, goal, false).await
    }

    pub(crate) async fn start_goal_with_wakeup(
        &self,
        request: PromptRequest,
        goal: GoalRequest,
        allow_wakeups: bool,
    ) -> Result<DurableSubmission> {
        self.owned_control(move |host| async move {
            host.accept_goal(request, goal, allow_wakeups).await
        })
        .await
    }

    async fn accept_goal(
        &self,
        request: PromptRequest,
        goal: GoalRequest,
        allow_wakeups: bool,
    ) -> Result<DurableSubmission> {
        let effort = request.effort.unwrap_or(EffortPreset::Standard);
        if allow_wakeups && effort == EffortPreset::Ultra {
            return Err(problem(
                ErrorKind::Unsupported,
                "goal_wakeup_requires_standard",
            ));
        }
        validate_prompt_parts(&request.parts)?;
        Goal::start_with_review(
            request.id.clone(),
            goal.objective.clone(),
            goal.allowance,
            goal.user_review,
        )?;
        let _admission = self.configuration_admission.lock().await;
        if let Some(accepted) = self
            .store
            .input(request.session.clone(), request.id.clone())
            .await?
        {
            let stored = retained_goal_prompt(&accepted.input)?;
            if stored.goal.as_ref() != Some(&GoalInput::Start(goal))
                || !images::same_prompt(&stored.parts, &request.parts)
                || stored.allow_wakeups != allow_wakeups
                || request
                    .operating_regime
                    .is_some_and(|regime| regime != stored.operating_regime)
                || stored
                    .effort
                    .as_ref()
                    .map_or(EffortPreset::Standard, EffortPolicy::preset)
                    != effort
                || (stored.configuration_permission == crate::ConfigurationPermission::Change)
                    != (request.configuration_permission == crate::ConfigurationPermission::Change)
            {
                return Err(problem(ErrorKind::Conflict, "input_identity_reused"));
            }
            if accepted.disposition == InputDisposition::Queued {
                self.kick_queue(request.session.clone()).await;
            }
            return Ok(DurableSubmission {
                session: request.session,
                input: request.id,
                position: accepted.position,
                disposition: accepted.disposition,
            });
        }
        if self.work.lock().await.closed {
            return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
        }
        let view = self.store.inspect(request.session.clone()).await?;
        self.check_execution(&view)?;
        require_goal_start(&view)?;
        self.check_ready_capacity(&request.session).await?;
        let mut request = request;
        request.effort = Some(effort);
        let mut policy = self.submission_policy(&request, allow_wakeups)?;
        policy.allow_host_tools = false;
        policy.desktop_image_generation = None;
        policy.allow_image_placement = false;
        if policy.effort.as_ref().is_some_and(|effort| {
            goal.allowance.inference_steps.get() <= effort.reserved_child_generation_steps()
        }) {
            return Err(problem(
                ErrorKind::LimitExceeded,
                "goal_child_allowance_unavailable",
            ));
        }
        let mut input = self
            .capture_input(&view, request.id, request.parts, policy)
            .await?;
        let mut stored: StoredPrompt = decode_input(&input)?;
        stored.goal = Some(GoalInput::Start(goal));
        input.payload = encode(INPUT_SCHEMA, 2, &stored)?;
        let accepted = self
            .store
            .submit_at_revision(request.session, input, view.revision)
            .await?;
        self.kick_queue(accepted.session.clone()).await;
        Ok(DurableSubmission {
            session: accepted.session,
            input: accepted.input,
            position: accepted.position,
            disposition: InputDisposition::Queued,
        })
    }

    /// Read the committed goal without claiming a turn or scheduling work.
    pub async fn inspect_goal(&self, session: SessionId) -> Result<GoalInspection> {
        let view = self.store.inspect(session.clone()).await?;
        let goal = if let Some(value) = view.driver_state.value() {
            let goal = Goal::decode(value)?;
            let (captured, automatic) = self.goal_origin(&session, goal.basis()).await?;
            Some(GoalView {
                basis: goal.basis().clone(),
                objective: goal.objective().clone(),
                status: goal.status(),
                paused: goal.paused(),
                automatic,
                effort: captured.effort.as_ref().map(EffortPolicy::preset),
                progress: goal.progress().map(str::to_owned),
                allowance: goal.allowance(),
                spent: goal.spent(),
                remaining: goal.remaining(),
                reservation: goal.reservation().cloned(),
                review: goal.completion_review().cloned(),
            })
        } else {
            None
        };
        Ok(GoalInspection {
            session,
            revision: view.revision,
            state_revision: view.driver_state.revision(),
            goal,
        })
    }

    /// Reconsider an explicitly authorized goal after an owner restart.
    /// Observation does not call this method. Interrupted work still requires
    /// recovery or a stop instead of silently dispatching again.
    pub async fn recover_goal_work(&self, session: SessionId) -> Result<()> {
        self.owned_control(move |host| async move {
            let view = host.store.inspect(session.clone()).await?;
            host.check_execution(&view)?;
            if view.driver_state.value().is_none() {
                return Err(problem(ErrorKind::Unavailable, "goal_missing"));
            }
            host.reconcile_goal_child(&view).await?;
            host.check_ready_capacity(&session).await?;
            host.kick_queue(session).await;
            Ok(())
        })
        .await
    }

    async fn reconcile_goal_child(&self, view: &SessionView) -> Result<()> {
        let Some(value) = view.driver_state.value() else {
            return Ok(());
        };
        let mut goal = Goal::decode(value)?;
        let Some((turn, parent_steps, child_steps)) = self.goal_review_usage(view, &goal).await?
        else {
            return Ok(());
        };
        goal.reconcile_child_work(&turn, parent_steps, child_steps)?;
        let value = goal.encode()?;
        let request = Fingerprint::of(&("goal-child-account", &view.session, &turn))?;
        self.store
            .control_driver_state(
                DriverControlRequest {
                    id: ChangeId::new(
                        request
                            .bytes()
                            .iter()
                            .map(|byte| format!("{byte:02x}"))
                            .collect::<String>(),
                    )?,
                    session: view.session.clone(),
                    expected_revision: view.revision,
                    expected_state: view.driver_state.revision(),
                    intent: encode("grida.agent.goal.child-account", 1, &turn)?,
                },
                move |_, current| {
                    if current.is_some() {
                        return Err(problem(ErrorKind::Conflict, "goal_work_reserved"));
                    }
                    Ok(DriverControlPlan {
                        value: Some(value),
                        directive: None,
                    })
                },
            )
            .await?;
        Ok(())
    }

    async fn goal_review_usage(
        &self,
        view: &SessionView,
        goal: &Goal,
    ) -> Result<Option<(TurnId, u32, u32)>> {
        let Some(work) = goal
            .reservation()
            .filter(|work| work.uncertain_steps.is_some() && work.child_inference_steps.is_some())
        else {
            return Ok(None);
        };
        if view.current.is_some() {
            return Ok(None);
        }
        let turn = work.turn.clone();
        let Some(parent) = self
            .store
            .inspect_turn_with(view.session.clone(), turn.clone(), |state| {
                Ok((state
                    .outcome()
                    .is_some_and(|outcome| outcome.status != OutcomeStatus::Uncertain)
                    && state.operations().values().all(|operation| {
                        operation.outcome().is_some() && !operation.is_uncertain()
                    }))
                .then(|| state.clone()))
            })
            .await?
        else {
            return Ok(None);
        };
        let ChildWork::Settled { observed_steps } = sponsorship::GoalChildWork(self.store.clone())
            .observe(&parent)
            .await
        else {
            return Ok(None);
        };
        Ok(Some((turn, inference_attempts(&parent)?, observed_steps)))
    }

    async fn goal_review_for_control(
        &self,
        control: &GoalControl,
        turn: &TurnId,
    ) -> Result<(u32, u32)> {
        let view = self.store.inspect(control.session.clone()).await?;
        let changed = || problem(ErrorKind::Conflict, "goal_review_reservation_changed");
        if view.revision != control.expected_revision
            || view.driver_state.revision() != control.expected_state
        {
            return Err(changed());
        }
        let goal = Goal::decode(view.driver_state.value().ok_or_else(changed)?)?;
        if goal.basis() != &control.basis
            || !goal.reservation().is_some_and(|work| {
                &work.turn == turn
                    && work.child_inference_steps.is_some()
                    && work.uncertain_steps.is_some()
            })
        {
            return Err(changed());
        }
        self.goal_review_usage(&view, &goal)
            .await?
            .map(|(_, parent, child)| (parent, child))
            .ok_or_else(|| problem(ErrorKind::Unavailable, "goal_review_still_held"))
    }

    pub(super) async fn goal_continuation(&self, view: &SessionView) -> Result<Option<Submission>> {
        let Some(value) = view.driver_state.value() else {
            return Ok(None);
        };
        if session_configuration(view)?.subagent.is_some() {
            return Ok(None);
        }
        let goal = Goal::decode(value)?;
        let Some(continuation) = goal.continuation() else {
            return Ok(None);
        };
        let (mut captured, automatic) =
            self.goal_origin(&view.session, &continuation.basis).await?;
        if !automatic {
            return Ok(None);
        }
        if captured.effort.as_ref().is_some_and(|effort| {
            goal.remaining().inference_steps <= effort.reserved_child_generation_steps()
        }) {
            captured.effort = None;
        }
        let id = continuation.input_id(&view.session)?;
        captured.parts.clear();
        captured.allow_wakeups = false;
        captured.allow_library_selection = false;
        captured.desktop_image_generation = None;
        captured.allow_image_reference = false;
        captured.allow_attachment_reference = false;
        captured.allow_image_placement = false;
        captured.configuration_permission = crate::ConfigurationPermission::Disabled;
        if let Some(permission) = &captured.permission_capture {
            let profile = self
                .permissions
                .as_ref()
                .ok_or_else(|| problem(ErrorKind::Unavailable, "permission_profile_unavailable"))?;
            profile.validate_capture(permission)?;
            captured.permission_capture = Some(profile.capture(ScopeId::new(id.as_str())?));
        }
        captured.goal = Some(GoalInput::Continue(continuation));
        Ok(Some(Submission {
            id,
            payload: encode(INPUT_SCHEMA, 2, &captured)?,
        }))
    }

    async fn goal_origin(
        &self,
        session: &SessionId,
        basis: &Basis,
    ) -> Result<(StoredPrompt, bool)> {
        let original = self
            .store
            .input(session.clone(), basis.goal.clone())
            .await?
            .ok_or_else(|| problem(ErrorKind::InvalidState, "goal_origin_unavailable"))?;
        let captured = retained_goal_prompt(&original.input)?;
        let Some(GoalInput::Start(request)) = captured.goal.as_ref() else {
            return Err(problem(ErrorKind::InvalidState, "goal_origin_unavailable"));
        };
        let automatic = request.automatic;
        Ok((captured, automatic))
    }

    /// Apply a goal control through the same owned admission/control boundary.
    pub async fn control_goal(&self, control: GoalControl) -> Result<ControlReceipt> {
        self.owned_control(move |host| async move { host.control_goal_owned(control).await })
            .await
    }

    async fn control_goal_owned(&self, control: GoalControl) -> Result<ControlReceipt> {
        // Keep lookup errors as part of the decision so the store can replay
        // an exact accepted control even after its held reservation is gone.
        let review_usage = match &control.action {
            GoalAction::ReconcileReview { turn } => {
                Some(self.goal_review_for_control(&control, turn).await)
            }
            _ => None,
        };
        let session = control.session;
        let basis = control.basis;
        let action = control.action;
        let intent = encode("grida.agent.goal.control", 1, &(&basis, &action))?;
        let decision = action.clone();
        let request = control.id.clone();
        let receipt = self
            .store
            .control_driver_state(
                DriverControlRequest {
                    id: control.id,
                    session: session.clone(),
                    expected_revision: control.expected_revision,
                    expected_state: control.expected_state,
                    intent,
                },
                move |snapshot, current| {
                    let mut goal = Goal::decode(
                        snapshot
                            .value()
                            .ok_or_else(|| problem(ErrorKind::Unavailable, "goal_missing"))?,
                    )?;
                    if let Some(current) = current
                        && goal
                            .reservation()
                            .is_none_or(|work| work.turn != current.binding.turn)
                    {
                        return Err(problem(
                            ErrorKind::Conflict,
                            "goal_control_requires_owned_turn",
                        ));
                    }
                    if current.is_some()
                        && goal
                            .reservation()
                            .is_some_and(|work| work.child_inference_steps.is_some())
                    {
                        return Err(problem(
                            ErrorKind::Conflict,
                            "goal_use_task_controls_for_funded_review",
                        ));
                    }
                    let directive = match decision {
                        GoalAction::Pause => {
                            goal.set_paused(&basis, true)?;
                            current.map(|_| ControlDirective::Pause)
                        }
                        GoalAction::Resume => {
                            if let Some(current) = current {
                                if current.disposition != TurnDisposition::Suspended
                                    || !current.controls.paused
                                    || current.controls.cancelled
                                {
                                    return Err(problem(
                                        ErrorKind::Conflict,
                                        "goal_turn_not_suspended",
                                    ));
                                }
                                goal.resume_reserved(&basis, &current.binding.turn)?;
                                Some(ControlDirective::Resume)
                            } else {
                                goal.resume_idle(&basis)?;
                                None
                            }
                        }
                        GoalAction::Revise { objective } => {
                            goal.revise(&basis, objective)?;
                            if current.is_some() && goal.basis() == &basis {
                                return Err(problem(
                                    ErrorKind::InvalidInput,
                                    "goal_objective_unchanged",
                                ));
                            }
                            current.map(|_| ControlDirective::Cancel)
                        }
                        GoalAction::ConfirmCompletion { turn } => {
                            if current.is_some() {
                                return Err(problem(ErrorKind::Conflict, "goal_work_reserved"));
                            }
                            goal.confirm_completion(&basis, &turn, request)?;
                            None
                        }
                        GoalAction::ReconcileReview { turn } => {
                            let (parent, child) =
                                review_usage.expect("review reconciliation decision")?;
                            goal.reconcile_child_work(&turn, parent, child)?;
                            None
                        }
                        GoalAction::Clear => {
                            goal.clear(&basis)?;
                            current.map(|_| ControlDirective::Cancel)
                        }
                    };
                    Ok(DriverControlPlan {
                        value: Some(goal.encode()?),
                        directive,
                    })
                },
            )
            .await?;
        match action {
            GoalAction::Clear | GoalAction::Revise { .. } => {
                if let Some(turn) = &receipt.turn {
                    let turn = turn.record().binding.turn.clone();
                    self.release_timer(&session, &turn).await;
                    self.kick_stopped(session, turn).await;
                }
            }
            GoalAction::Resume => {
                self.changed.notify_waiters();
                self.kick_queue(session).await;
            }
            GoalAction::Pause
            | GoalAction::ConfirmCompletion { .. }
            | GoalAction::ReconcileReview { .. } => {}
        }
        Ok(receipt)
    }

    pub(super) async fn kick_resumed_goal(&self, view: &SessionView) {
        if view.admission_paused {
            return;
        }
        let Some(current) = view.current.as_ref().filter(|current| {
            current.disposition == TurnDisposition::Suspended && current.controls.admits_work()
        }) else {
            return;
        };
        if require_resumable(view, &current.binding.turn).is_err() {
            return;
        }
        let session = view.session.clone();
        let turn = current.binding.turn.clone();
        if !self
            .store
            .inspect_turn_with(session.clone(), turn.clone(), |state| {
                Ok(state.waits().values().all(|wait| {
                    !wait.is_pending()
                        && (!grida_agent_master::wakeups::is_wakeup(wait)
                            || wakeups::was_delivered(wait))
                }))
            })
            .await
            .unwrap_or(false)
        {
            return;
        }
        let Ok(id) = change_id() else {
            return;
        };
        let claim = ClaimRequest {
            id,
            session: session.clone(),
            expected_revision: view.revision,
            selection: TurnSelection::Resume {
                turn: turn.clone(),
                epoch: current.binding.epoch,
                position: current.position,
            },
        };
        let mut work = self.work.lock().await;
        if work.closed {
            return;
        }
        if work.active.contains_key(&session) || work.active.len() >= MAX_ACTIVE_RUNS {
            work.defer(ReadyWork::Queue(session));
            return;
        }
        let _ = self.register(&mut work, session, turn, Launch::Resume(claim));
    }
}

pub(super) fn require_resumable(view: &SessionView, turn: &TurnId) -> Result<()> {
    let goal = Goal::decode(
        view.driver_state
            .value()
            .ok_or_else(|| problem(ErrorKind::InvalidState, "goal_state_missing"))?,
    )?;
    if goal.paused()
        || goal.status() != Status::Active
        || goal
            .reservation()
            .is_none_or(|work| &work.turn != turn || &work.basis != goal.basis())
    {
        return Err(problem(ErrorKind::Conflict, "goal_control_required"));
    }
    Ok(())
}

pub(super) fn claim_update(
    view: &SessionView,
    input: &ChangeId,
    turn: &TurnId,
    request: &GoalInput,
    steps: u32,
    effort: Option<&EffortPolicy>,
) -> Result<DriverStateChange> {
    require_idle(view)?;
    let mut goal = match request {
        GoalInput::Start(request) => {
            // Later accepted inputs remain behind the explicit goal start.
            require_no_active_goal(view)?;
            Goal::start_with_review(
                input.clone(),
                request.objective.clone(),
                request.allowance,
                request.user_review,
            )?
        }
        GoalInput::Continue(continuation) => {
            let value = view
                .driver_state
                .value()
                .ok_or_else(|| problem(ErrorKind::Conflict, "goal_continuation_changed"))?;
            let goal = Goal::decode(value)?;
            if goal.continuation().as_ref() != Some(continuation)
                || &continuation.input_id(&view.session)? != input
            {
                return Err(problem(ErrorKind::Conflict, "goal_continuation_changed"));
            }
            goal
        }
    };
    let child = effort.and_then(|policy| NonZeroU32::new(policy.reserved_child_generation_steps()));
    let steps = effort
        .map_or(Some(steps), |policy| {
            policy
                .parent_generation_steps()
                .checked_add(policy.reserved_child_generation_steps())
        })
        .and_then(NonZeroU32::new)
        .ok_or_else(|| problem(ErrorKind::InvalidInput, "invalid_master_limits"))?;
    goal.reserve_with_child(&goal.basis().clone(), turn.clone(), steps, child)?;
    Ok(DriverStateChange {
        expected: view.driver_state.revision(),
        value: Some(goal.encode()?),
    })
}

fn require_goal_start(view: &SessionView) -> Result<()> {
    require_idle(view)?;
    if !view.queued.is_empty() {
        return Err(problem(ErrorKind::Conflict, "session_queue_waiting"));
    }
    require_no_active_goal(view)
}

fn require_no_active_goal(view: &SessionView) -> Result<()> {
    require_resolved_goal(&view.driver_state)
}

pub(super) fn require_resolved_goal(
    state: &agent_kit_core::driver_state::DriverStateSnapshot,
) -> Result<()> {
    if let Some(value) = state.value() {
        let goal = Goal::decode(value)?;
        if goal.reservation().is_some()
            || !matches!(goal.status(), Status::Complete | Status::Cleared)
        {
            return Err(problem(ErrorKind::Conflict, "session_goal_exists"));
        }
    }
    Ok(())
}

pub(super) fn require_goal_resolved_for_revision(view: &SessionView) -> Result<()> {
    if let Some(value) = view.driver_state.value() {
        let goal = Goal::decode(value)?;
        if matches!(goal.status(), Status::Active | Status::Blocked(_)) {
            return Err(problem(
                ErrorKind::Conflict,
                "history_revision_requires_goal_resolution",
            ));
        }
    }
    Ok(())
}

fn retained_goal_prompt(input: &Submission) -> Result<StoredPrompt> {
    if input.payload.schema().as_str() != INPUT_SCHEMA || input.payload.version() != 2 {
        return Err(problem(ErrorKind::Conflict, "input_identity_reused"));
    }
    decode_input(input)
}

/// Product-local grants for the two captured, non-effecting goal tools.
pub(super) struct GoalAuthority {
    selection: GrantSelection,
    tools: [Arc<dyn agent_kit_core::tools::Tool>; 2],
    base: Arc<dyn AuthorityValidator>,
    gate: Arc<dyn ToolGate>,
}

impl GoalAuthority {
    pub(super) async fn bind(
        claim: &agent_kit_sessions::ClaimedTurn,
        base: Arc<dyn AuthorityValidator>,
        gate: Arc<dyn ToolGate>,
    ) -> Result<Arc<Self>> {
        let state = claim.lease.journal().load().await?;
        let value = state
            .driver_state()
            .value()
            .ok_or_else(|| problem(ErrorKind::InvalidState, "goal_state_missing"))?;
        let goal = Goal::decode(value)?;
        let binding = state.binding();
        let id = Fingerprint::of(&(&binding.session, &binding.turn, goal.basis()))?;
        let scope = id
            .bytes()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        Ok(Arc::new(Self {
            selection: GrantSelection {
                authority: AuthorityBinding {
                    principal: PrincipalId::new("grida.goal")?,
                    binding: BindingId::new("goal-local-v1")?,
                    scope: ScopeId::new(scope)?,
                },
                grants: vec![GrantId::new("goal-work")?],
            },
            tools: tools::for_work(&goal, &binding.turn)?,
            base,
            gate,
        }))
    }

    pub(super) fn insert(
        &self,
        inventory: &mut Inventory,
        grants: &mut BTreeMap<ToolId, GrantSelection>,
    ) -> Result<()> {
        for tool in &self.tools {
            inventory.insert(tool.clone())?;
            grants.insert(tool.definition().id.clone(), self.selection.clone());
        }
        Ok(())
    }
}

impl AuthorityValidator for GoalAuthority {
    fn validate(&self, request: AuthorityRequest) -> BoxFuture<'_, Result<()>> {
        if request.selection == self.selection {
            Box::pin(async { Ok(()) })
        } else {
            self.base.validate(request)
        }
    }
}

impl ToolGate for GoalAuthority {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        if admission.grants != self.selection {
            return self.gate.decide(admission, context);
        }
        if self
            .tools
            .iter()
            .any(|tool| tool.definition() == admission.invocation.definition())
        {
            Box::pin(async { Ok(ToolDecision::Permit) })
        } else {
            Box::pin(async { Err(problem(ErrorKind::InvalidInput, "goal_tool_scope_mismatch")) })
        }
    }
}
