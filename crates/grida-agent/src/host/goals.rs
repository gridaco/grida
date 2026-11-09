//! GRIDA-SEC-004 — explicit goal work and turn-local metadata tools.

use super::*;
use agent_kit_core::driver_state::{DriverStateChange, DriverStateRevision};
use agent_kit_core::{GrantId, ToolId};
use grida_agent_master::goals::{
    Allowance, Basis, Goal, Objective, Reservation, Status, Usage, tools,
};
use std::num::NonZeroU32;

pub(super) const INSTRUCTIONS: &str = "This work was explicitly reserved for a persistent goal. Use goal_inspect for the captured objective, criteria, and allowance. Record one goal_report when the work has been assessed. A completion proposal needs verified evidence for every criterion. Existing permissions still apply.";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GoalRequest {
    pub objective: Objective,
    pub allowance: Allowance,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalInspection {
    pub session: SessionId,
    pub revision: SessionRevision,
    pub state_revision: DriverStateRevision,
    pub goal: Option<GoalView>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalView {
    pub basis: Basis,
    pub objective: Objective,
    pub status: Status,
    pub paused: bool,
    pub progress: Option<String>,
    pub allowance: Allowance,
    pub spent: Usage,
    pub remaining: Usage,
    pub reservation: Option<Reservation>,
}

impl Host {
    /// Accept an explicit user goal. Its first reservation is made at claim.
    pub async fn start_goal(
        &self,
        request: PromptRequest,
        goal: GoalRequest,
    ) -> Result<DurableSubmission> {
        self.owned_control(move |host| async move { host.accept_goal(request, goal).await })
            .await
    }

    async fn accept_goal(
        &self,
        request: PromptRequest,
        goal: GoalRequest,
    ) -> Result<DurableSubmission> {
        prompt_input(&request.id, &request.parts)?;
        Goal::start(request.id.clone(), goal.objective.clone(), goal.allowance)?;
        let _admission = self.configuration_admission.lock().await;
        if let Some(accepted) = self
            .store
            .input(request.session.clone(), request.id.clone())
            .await?
        {
            let stored = retained_goal_prompt(&accepted.input)?;
            if stored.goal.as_ref() != Some(&goal)
                || stored.parts != request.parts
                || stored.questions != request.questions
                || stored.configuration_permission != request.configuration_permission
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
        let mut input = self
            .capture_submission(
                &view,
                request.id,
                request.parts,
                request.questions,
                request.configuration_permission,
            )
            .await?;
        let mut stored: StoredPrompt = decode_input(&input)?;
        stored.goal = Some(goal);
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
        let goal = view
            .driver_state
            .value()
            .map(Goal::decode)
            .transpose()?
            .map(|goal| GoalView {
                basis: goal.basis().clone(),
                objective: goal.objective().clone(),
                status: goal.status(),
                paused: goal.paused(),
                progress: goal.progress().map(str::to_owned),
                allowance: goal.allowance(),
                spent: goal.spent(),
                remaining: goal.remaining(),
                reservation: goal.reservation().cloned(),
            });
        Ok(GoalInspection {
            session,
            revision: view.revision,
            state_revision: view.driver_state.revision(),
            goal,
        })
    }
}

pub(super) fn claim_update(
    view: &SessionView,
    input: &ChangeId,
    turn: &TurnId,
    request: &GoalRequest,
    steps: u32,
) -> Result<DriverStateChange> {
    // This submission was accepted at an idle empty queue. Later accepted user
    // work remains queued behind it, so only the current ownership is checked.
    require_idle(view)?;
    require_no_active_goal(view)?;
    let mut goal = Goal::start(input.clone(), request.objective.clone(), request.allowance)?;
    let steps = NonZeroU32::new(steps)
        .ok_or_else(|| problem(ErrorKind::InvalidInput, "invalid_master_limits"))?;
    goal.reserve(&goal.basis().clone(), turn.clone(), steps)?;
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
    if let Some(value) = view.driver_state.value() {
        let goal = Goal::decode(value)?;
        if goal.reservation().is_some()
            || !matches!(goal.status(), Status::Complete | Status::Cleared)
        {
            return Err(problem(ErrorKind::Conflict, "session_goal_exists"));
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
