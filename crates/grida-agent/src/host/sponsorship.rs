//! GRIDA-SEC-004 — parent controls fence the exact funded child slot.

mod collection;
mod funding;
mod named;

pub(super) use funding::GoalChildWork;

use super::*;
use agent_kit_core::driver_state::DriverStateRevision;
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{
    InventorySnapshot, Invocation, InvocationContext, InvocationRecovery, RecoveryKind, Tool,
    ToolDefinition, ToolOutcome,
};
use agent_kit_core::turn::{OperationInput, TurnBinding, TurnState};
use agent_kit_core::{GrantId, ToolId};
use agent_kit_runtime::TurnOperations;
use agent_kit_store_sqlite::{
    ExistingOperationClaim, OperationClaim, OperationClaimSource, OperationPairControl,
    OperationPairReceipt, OperationRelatedControl, ResumeCompanion,
};
use grida_agent_master::effort::COLLECT_REVIEW;
use grida_agent_master::subagents::{
    self, Assignment, NamedSponsorship, PauseCause, Profile, Sponsorship, sponsored_identity,
};
use serde_json::json;
use std::num::NonZeroU32;

const DELEGATE: &str = "delegate_review";
const CHILD_INPUT: &str = "sponsored-assignment";
const CHILD_TURN: &str = "sponsored-turn";

pub(super) enum SponsoredClaim {
    Fresh(OperationClaim),
    Named {
        request: ExistingOperationClaim,
        configuration: Envelope,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct SponsoredWake {
    pub binding: TurnBinding,
    state: DriverStateRevision,
    request: ChangeId,
}

impl SponsoredWake {
    fn from_receipt(receipt: &ControlReceipt) -> Result<Self> {
        let record = receipt.turn.as_ref().ok_or_else(related_changed)?.record();
        let state = receipt.driver_state_revision.ok_or_else(related_changed)?;
        let digest = Fingerprint::of(&("sponsored-wake", &record.binding, &receipt.request))?;
        let id =
            uuid::Uuid::from_bytes(digest.bytes()[..16].try_into().expect("fingerprint prefix"));
        Ok(Self {
            binding: record.binding.clone(),
            state,
            request: ChangeId::new(format!("sponsored-wake/{id}"))?,
        })
    }

    pub(super) fn claim(&self, view: &SessionView) -> Result<Option<ClaimRequest>> {
        let Some(turn) = &view.current else {
            return Ok(None);
        };
        if turn.binding != self.binding
            || turn.disposition != TurnDisposition::Suspended
            || !turn.controls.admits_work()
            || view.driver_state.revision() != self.state
        {
            return Ok(None);
        }
        let profile = session_configuration(view)?
            .subagent
            .ok_or_else(related_changed)?;
        if !profile.funded_turn(&view.driver_state, &turn.binding.turn)?
            || profile.sponsored_pause(&view.driver_state)?.effective()
        {
            return Ok(None);
        }
        // A message may advance the session after the related control. The
        // exact binding and driver revision preserve the original readiness.
        Ok(Some(ClaimRequest {
            id: self.request.clone(),
            session: self.binding.session.clone(),
            expected_revision: view.revision,
            selection: TurnSelection::Resume {
                turn: self.binding.turn.clone(),
                epoch: self.binding.epoch,
                position: turn.position,
            },
        }))
    }
}

fn delegation_definition() -> Result<ToolDefinition> {
    Ok(ToolDefinition {
        id: ToolId::new(DELEGATE)?,
        version: 1,
        description: "Start one independent, text-only review within this task's allowance. Include its objective and the evidence it should return.".into(),
        input: InputFormat::Json(json!({
            "type": "object",
            "properties": {"instructions": {"type": "string", "minLength": 1}},
            "required": ["instructions"],
            "additionalProperties": false
        })),
        max_input_bytes: subagents::MAX_ASSIGNMENT_BYTES + 512,
        max_output_bytes: 4096,
        recovery: RecoveryKind::Reconcile,
    })
}

fn delegation_grant(binding: &TurnBinding) -> Result<GrantSelection> {
    let digest = Fingerprint::of(&(&binding.session, &binding.turn))?;
    let id = uuid::Uuid::from_bytes(digest.bytes()[..16].try_into().expect("fingerprint prefix"));
    delegation_selection(BindingId::new(format!("delegation/{id}"))?, DELEGATE)
}

pub(super) fn retained_review_operations(state: &TurnState) -> Result<Vec<OperationId>> {
    if state.outcome().is_none() {
        return Ok(vec![]);
    }
    const MAX_CANDIDATES: usize = 64;
    let grant = delegation_grant(state.binding())?;
    let definition = delegation_definition()?;
    let operations: Vec<_> = state
        .operations()
        .values()
        .filter(|operation| {
            !operation.attempts.is_empty()
                && operation.record.grants == grant
                && matches!(&operation.record.input, OperationInput::Tool(invocation)
                    if invocation.definition() == &definition)
        })
        .take(MAX_CANDIDATES + 1)
        .map(|operation| operation.record.id.clone())
        .collect();
    if operations.len() > MAX_CANDIDATES {
        return Err(problem(
            ErrorKind::LimitExceeded,
            "retained_review_operations_limit",
        ));
    }
    Ok(operations)
}

fn delegation_selection(binding: BindingId, grant: &str) -> Result<GrantSelection> {
    Ok(GrantSelection {
        authority: AuthorityBinding {
            principal: PrincipalId::new("grida-local")?,
            binding,
            scope: ScopeId::new("sponsored-subagent")?,
        },
        grants: vec![GrantId::new(grant)?],
    })
}

pub(super) struct DelegationAccess {
    host: Host,
    binding: TurnBinding,
    start: GrantSelection,
    collect: GrantSelection,
}

impl DelegationAccess {
    pub(super) fn bind(host: &Host, binding: &TurnBinding) -> Result<Arc<Self>> {
        let start = delegation_grant(binding)?;
        let collect = delegation_selection(start.authority.binding.clone(), COLLECT_REVIEW)?;
        Ok(Arc::new(Self {
            host: host.clone(),
            binding: binding.clone(),
            start,
            collect,
        }))
    }

    pub(super) fn accepts(&self, selection: &GrantSelection) -> bool {
        *selection == self.start || *selection == self.collect
    }

    pub(super) fn insert(
        self: &Arc<Self>,
        operations: TurnOperations,
        inventory: &mut Inventory,
        grants: &mut BTreeMap<ToolId, GrantSelection>,
    ) -> Result<()> {
        let start = delegation_definition()?;
        let collect =
            collection::CollectReview::new(self.host.store.clone(), self.binding.clone())?;
        grants.insert(start.id.clone(), self.start.clone());
        grants.insert(collect.definition().id.clone(), self.collect.clone());
        inventory.insert(Arc::new(DelegationTool {
            access: self.clone(),
            operations,
            definition: start,
        }))?;
        inventory.insert(Arc::new(collect))
    }

    pub(super) async fn reconcile(
        &self,
        operations: &TurnOperations,
        tools: &InventorySnapshot,
    ) -> Result<()> {
        let view = operations.view();
        for (id, operation) in view.state.operations() {
            if self.accepts(&operation.record.grants)
                && (operation.is_running() || operation.is_uncertain())
                && let Err(error) = operations.reconcile_tool(id.clone(), tools.clone()).await
                && operations.view().state.controls().admits_work()
            {
                return Err(error);
            }
        }
        Ok(())
    }
}

impl ToolGate for DelegationAccess {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
            let definition = if admission.grants == self.start {
                delegation_definition()?
            } else if admission.grants == self.collect {
                collection::definition()?
            } else {
                return Err(delegation_unavailable());
            };
            if context.operations.view().state.binding() != &self.binding
                || admission.invocation.definition() != &definition
            {
                return Err(delegation_unavailable());
            }
            Ok(ToolDecision::Permit)
        })
    }
}

struct DelegationTool {
    access: Arc<DelegationAccess>,
    operations: TurnOperations,
    definition: ToolDefinition,
}

impl DelegationTool {
    fn source(
        &self,
        invocation: &Invocation,
        context: &InvocationContext,
    ) -> Result<OperationClaimSource> {
        let view = self.operations.view();
        if view.state.binding() != &self.access.binding || context.cancellation.is_cancelled() {
            return Err(delegation_unavailable());
        }
        Ok(OperationClaimSource {
            binding: self.access.binding.clone(),
            control: view.state.controls().revision,
            operation: invocation.id().clone(),
            attempt: context.attempt.clone(),
            action: invocation.fingerprint(),
        })
    }
}

impl Tool for DelegationTool {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        subagents::validate_assignment(assignment_text(arguments)?)
    }

    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            let result = async {
                let source = self.source(&invocation, &context)?;
                let target = self.access.host.named_target(&source.binding).await?;
                let slot = child_slot(&source.binding, target.as_ref())?;
                self.access
                    .host
                    .start_sponsored_at(
                        source,
                        assignment_text(invocation.arguments())?.to_owned(),
                        target,
                    )
                    .await?;
                Ok::<_, Error>(slot)
            }
            .await;
            match result {
                Ok(slot) => started(slot),
                Err(error) if error.kind == ErrorKind::Uncertain => ToolOutcome::uncertain(),
                Err(error) => ToolOutcome::failed(&error.code),
            }
        })
    }

    fn recover(
        &self,
        recovery: InvocationRecovery,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            let result = async {
                let source = self.source(&recovery.invocation, &context)?;
                let instructions = assignment_text(recovery.invocation.arguments())?;
                let target = self.access.host.named_target(&source.binding).await?;
                let slot = child_slot(&source.binding, target.as_ref())?;
                self.access
                    .host
                    .verify_delegation(&source, instructions)
                    .await?;
                let work = self
                    .access
                    .host
                    .sponsored_work(&source, &slot, target.as_ref(), instructions, true)
                    .await?;
                Ok::<_, Error>(work.map(|_| slot))
            }
            .await;
            match result {
                Ok(Some(slot)) => started(slot),
                Ok(None) => ToolOutcome::failed("sponsored_subagent_not_started"),
                Err(_) => ToolOutcome::uncertain(),
            }
        })
    }
}

fn child_slot(parent: &TurnBinding, target: Option<&named::Target>) -> Result<SessionId> {
    match target {
        Some(target) => Ok(target.child.clone()),
        None => sponsored_identity(&parent.session, &parent.turn),
    }
}

fn assignment_text(arguments: &ToolArguments) -> Result<&str> {
    let ToolArguments::Json(value) = arguments else {
        return Err(delegation_unavailable());
    };
    value
        .as_object()
        .filter(|object| object.len() == 1)
        .and_then(|object| object.get("instructions"))
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| problem(ErrorKind::InvalidInput, "invalid_subagent_assignment"))
}

fn started(slot: SessionId) -> ToolOutcome {
    ToolOutcome {
        status: OutcomeStatus::Succeeded,
        content: vec![ResultContent::Text("The independent reviewer started. Continue useful work, then call collect_review for its findings.".into())],
        structured: Some(json!({"child": slot, "status": "started"})),
        receipt: None,
        truncated: false,
    }
}

fn delegation_unavailable() -> Error {
    problem(ErrorKind::Unsupported, "delegation_unavailable")
}

impl Host {
    /// Keep manual child work available without funded delegation.
    pub fn without_sponsorship(mut self) -> Self {
        self.sponsorship_enabled = false;
        self
    }

    /// Allow turn-local reviews while withholding reviews funded by a Goal.
    pub fn without_goal_sponsorship(mut self) -> Self {
        self.goal_sponsorship_enabled = false;
        self
    }

    /// Select the default product effort for new inputs on this trusted host.
    pub fn with_effort(mut self, preset: EffortPreset) -> Result<Self> {
        self.capture_effort(preset)?;
        self.effort = preset;
        Ok(self)
    }

    pub(crate) fn sponsorship_available(&self) -> bool {
        self.sponsorship_enabled
            && self.subagents_enabled
            && self.side_context.is_none()
            && self.execution.as_ref().is_some_and(|execution| {
                execution.config.max_output_tokens.is_some()
                    && execution
                        .provider
                        .capabilities(&execution.config.model)
                        .is_ok_and(|model| model.json_tools)
            })
    }

    pub(crate) fn goal_sponsorship_available(&self) -> bool {
        self.goal_sponsorship_enabled && self.sponsorship_available()
    }

    pub(super) fn capture_effort(&self, preset: EffortPreset) -> Result<Option<EffortPolicy>> {
        if preset == EffortPreset::Standard {
            return Ok(None);
        }
        if !self.sponsorship_available() {
            return Err(delegation_unavailable());
        }
        let limit = || problem(ErrorKind::LimitExceeded, "effort_allowance_unavailable");
        let standard = NonZeroU32::new(self.execution()?.config.max_steps).ok_or_else(limit)?;
        // Reserve two more parent decisions and a separate two-step child.
        let total = standard
            .checked_add(2 + subagents::INFERENCE_STEPS_PER_ASSIGNMENT)
            .ok_or_else(limit)?;
        let grant = delegation_selection(BindingId::new("delegation/capture")?, DELEGATE)?;
        Ok(Some(EffortPolicy::capture(
            preset,
            standard,
            total,
            Some((&delegation_definition()?.offer()?, &grant)),
        )?))
    }

    /// Start the one child funded by an already admitted local delegation
    /// operation. The caller supplies that operation's exact attempt and
    /// control basis. Repeating a retained start observes the original child.
    pub async fn start_sponsored_child(
        &self,
        source: OperationClaimSource,
        instructions: String,
    ) -> Result<SubagentWork> {
        let target = self.named_target(&source.binding).await?;
        self.start_sponsored_at(source, instructions, target).await
    }

    async fn named_target(&self, binding: &TurnBinding) -> Result<Option<named::Target>> {
        named::Target::load(&self.store, &binding.session, &binding.turn).await
    }

    async fn start_sponsored_at(
        &self,
        source: OperationClaimSource,
        instructions: String,
        target: Option<named::Target>,
    ) -> Result<SubagentWork> {
        if !self.sponsorship_available() {
            return Err(problem(ErrorKind::Unsupported, "subagents_unavailable"));
        }
        subagents::validate_assignment(&instructions)?;
        self.verify_delegation(&source, &instructions).await?;
        let slot = child_slot(&source.binding, target.as_ref())?;
        if let Some(work) = self
            .sponsored_work(&source, &slot, target.as_ref(), &instructions, false)
            .await?
        {
            return Ok(work);
        }
        let request = self
            .sponsored_claim(source.clone(), slot.clone(), target.as_ref(), &instructions)
            .await?;
        let turn = target
            .as_ref()
            .map(|target| Ok(target.turn.clone()))
            .unwrap_or_else(|| TurnId::new(CHILD_TURN))?;
        let ticket = {
            let mut work = self.work.lock().await;
            self.register(
                &mut work,
                slot.clone(),
                turn,
                Launch::Sponsored(Box::new(request)),
            )
        };
        let admitted = match ticket {
            Ok(ticket) => ticket
                .admission
                .await
                .map_err(|_| problem(ErrorKind::Uncertain, "admission_worker_interrupted"))?
                .map(|_| ()),
            Err(error) => Err(error),
        };
        if let Some(work) = self
            .sponsored_work(&source, &slot, target.as_ref(), &instructions, false)
            .await?
        {
            return Ok(work);
        }
        admitted?;
        Err(problem(
            ErrorKind::Uncertain,
            "sponsored_subagent_admission_missing",
        ))
    }

    async fn verify_delegation(
        &self,
        source: &OperationClaimSource,
        instructions: &str,
    ) -> Result<()> {
        let operation = source.operation.clone();
        let attempt = source.attempt.clone();
        let action = source.action;
        let grants = delegation_grant(&source.binding)?;
        let definition = delegation_definition()?;
        let arguments = ToolArguments::Json(json!({"instructions": instructions}));
        self.store
            .inspect_turn_with(
                source.binding.session.clone(),
                source.binding.turn.clone(),
                move |state| {
                    let matches = state.operations().get(&operation).is_some_and(|entry| {
                        entry.record.grants == grants
                            && entry.attempts.iter().any(|record| record.id == attempt)
                            && matches!(&entry.record.input, OperationInput::Tool(invocation)
                            if invocation.fingerprint() == action
                                && invocation.definition() == &definition
                                && invocation.arguments() == &arguments)
                    });
                    if !matches {
                        return Err(problem(
                            ErrorKind::Conflict,
                            "sponsored_subagent_operation_changed",
                        ));
                    }
                    Ok(())
                },
            )
            .await
    }

    async fn sponsored_work(
        &self,
        source: &OperationClaimSource,
        slot: &SessionId,
        target: Option<&named::Target>,
        instructions: &str,
        recovery: bool,
    ) -> Result<Option<SubagentWork>> {
        let (accepted, stored, sponsor) = if let Some(target) = target {
            let Some(record) = target
                .read(&self.store, &source.binding.session, &source.binding.turn)
                .await?
            else {
                return Ok(None);
            };
            (record.accepted, record.stored, record.sponsor)
        } else {
            let (view, accepted) = match self
                .store
                .inspect_with_input(slot.clone(), ChangeId::new(CHILD_INPUT)?)
                .await
            {
                Ok(value) => value,
                Err(error) if error.code == "session_missing" => return Ok(None),
                Err(error) => return Err(error),
            };
            let profile = session_configuration(&view)?
                .subagent
                .ok_or_else(sponsored_slot_used)?;
            let sponsor = profile
                .sponsorship()
                .filter(|sponsor| {
                    profile.parent() == &source.binding.session
                        && sponsor.parent_turn == source.binding.turn
                })
                .cloned()
                .ok_or_else(sponsored_slot_used)?;
            let accepted = accepted.ok_or_else(sponsored_slot_used)?;
            let stored = decode_input(&accepted.input.input)?;
            (accepted, stored, sponsor)
        };
        if recovery {
            if sponsor.admission.is_none() || sponsor.attempt.is_none() {
                return Err(sponsored_slot_used());
            }
            if sponsor.operation != source.operation
                || sponsor.attempt.as_ref() != Some(&source.attempt)
            {
                return Ok(None);
            }
        } else if sponsor.operation != source.operation
            || sponsor.admission != Some(Fingerprint::of(source)?)
        {
            return Err(sponsored_slot_used());
        }
        if !matches!(stored.parts.as_slice(), [PromptPart::Text {text}] if text == instructions) {
            return Err(sponsored_slot_used());
        }
        self.subagent_work(slot.clone(), accepted, stored)
            .await
            .map(Some)
    }

    async fn sponsored_parent_prompt(
        &self,
        parent: &SessionId,
        turn: &TurnId,
    ) -> Result<StoredPrompt> {
        let inputs = self
            .store
            .turn_submissions(parent.clone(), turn.clone())
            .await?;
        let [input] = inputs.as_slice() else {
            return Err(problem(
                ErrorKind::Unsupported,
                "sponsored_subagent_source_input",
            ));
        };
        if !is_stored_input(&input.payload) {
            return Err(problem(
                ErrorKind::Unsupported,
                "sponsored_subagent_source_input",
            ));
        }
        decode_input(input)
    }

    pub(super) async fn require_sponsored_origin(
        &self,
        parent: &SessionId,
        turn: &TurnId,
    ) -> Result<()> {
        if !self.goal_sponsorship_enabled
            && self
                .sponsored_parent_prompt(parent, turn)
                .await?
                .goal
                .is_some()
        {
            return Err(goals::funded_review_unavailable());
        }
        Ok(())
    }

    fn capture_sponsored_primary_read(
        &self,
        parent: &StoredPrompt,
        cwd: &Path,
        input: &ChangeId,
    ) -> Result<crate::permissions::PermissionCapture> {
        let unavailable = || problem(ErrorKind::Unavailable, "sponsored_primary_read_unavailable");
        if !parent.allow_reviewer_primary_read
            || parent.goal.is_some()
            || parent.subagent.is_some()
            || parent.effort.as_ref().map(EffortPolicy::preset) != Some(EffortPreset::Ultra)
        {
            return Err(unavailable());
        }
        self.permissions
            .as_ref()
            .ok_or_else(unavailable)?
            .capture_primary_review(
                parent.permission_capture.as_ref().ok_or_else(unavailable)?,
                cwd,
                ScopeId::new(input.as_str())?,
            )
    }

    pub(super) async fn require_sponsored_primary_read(
        &self,
        profile: &Profile,
        cwd: &Path,
        input: &ChangeId,
        capture: &crate::permissions::PermissionCapture,
    ) -> Result<()> {
        let unavailable = || problem(ErrorKind::Unavailable, "sponsored_primary_read_unavailable");
        let sponsor = profile.sponsorship().ok_or_else(unavailable)?;
        let parent_view = self.store.inspect(profile.parent().clone()).await?;
        self.check_execution(&parent_view)?;
        if session_configuration(&parent_view)?.cwd != cwd {
            return Err(unavailable());
        }
        let parent = self
            .sponsored_parent_prompt(profile.parent(), &sponsor.parent_turn)
            .await?;
        if self.capture_sponsored_primary_read(&parent, cwd, input)? != *capture {
            return Err(unavailable());
        }
        Ok(())
    }

    pub(super) async fn require_committed_primary_reviewer(
        &self,
        profile: &Profile,
        session: &SessionId,
        turn: &TurnId,
    ) -> Result<()> {
        let unavailable = || problem(ErrorKind::Unavailable, "sponsored_primary_read_unavailable");
        let sponsor = profile.sponsorship().ok_or_else(unavailable)?;
        let session = session.clone();
        let turn = turn.clone();
        let committed = self
            .store
            .inspect_operation_claim_with(
                profile.parent().clone(),
                sponsor.parent_turn.clone(),
                vec![sponsor.operation.clone()],
                move |state| Ok(state.binding().session == session && state.binding().turn == turn),
            )
            .await?;
        if committed != Some(true) {
            return Err(unavailable());
        }
        Ok(())
    }

    pub(super) fn prepare_sponsored_primary_read(
        &self,
        capture: &crate::permissions::PermissionCapture,
        session: &SessionId,
        turn: &TurnId,
    ) -> Result<Arc<crate::permissions::TurnPermissions>> {
        self.permissions
            .as_ref()
            .ok_or_else(|| problem(ErrorKind::Unavailable, "permission_profile_unavailable"))?
            .prepare_primary_review(capture, (session, turn), self.store.clone())
    }

    async fn sponsored_claim(
        &self,
        source: OperationClaimSource,
        child: SessionId,
        target: Option<&named::Target>,
        instructions: &str,
    ) -> Result<SponsoredClaim> {
        let execution = self.execution()?;
        let view = self.store.inspect(source.binding.session.clone()).await?;
        self.check_execution(&view)?;
        let mut config = session_configuration(&view)?;
        let mut captured = self
            .sponsored_parent_prompt(&source.binding.session, &source.binding.turn)
            .await?;
        if config.subagent.is_some()
            || captured.subagent.is_some()
            || captured
                .effort
                .as_ref()
                .is_none_or(|effort| effort.preset() != EffortPreset::Ultra)
            || captured.max_output_tokens.is_none()
        {
            return Err(problem(
                ErrorKind::Unsupported,
                "sponsored_subagent_source_input",
            ));
        }
        if captured.goal.is_some() {
            if !self.goal_sponsorship_available() {
                return Err(goals::funded_review_unavailable());
            }
            let state = view.driver_state.value().ok_or_else(sponsored_slot_used)?;
            let goal = grida_agent_master::goals::Goal::decode(state)?;
            if goal.paused()
                || goal.status() != grida_agent_master::goals::Status::Active
                || !goal.reservation().is_some_and(|work| {
                    work.turn == source.binding.turn
                        && &work.basis == goal.basis()
                        && work.named_child.as_ref() == target.map(|target| &target.child)
                        && work.child_inference_steps.is_some_and(|steps| {
                            steps.get() == subagents::INFERENCE_STEPS_PER_ASSIGNMENT
                        })
                })
            {
                return Err(problem(
                    ErrorKind::Conflict,
                    "goal_child_allowance_unavailable",
                ));
            }
        }
        let sponsor = Sponsorship {
            parent_turn: source.binding.turn.clone(),
            operation: source.operation.clone(),
            admission: Some(Fingerprint::of(&source)?),
            attempt: Some(source.attempt.clone()),
        };
        let input_id = match target {
            Some(target) => target.input.clone(),
            None => ChangeId::new(CHILD_INPUT)?,
        };
        let primary_read =
            (target.is_none() && captured.goal.is_none() && captured.allow_reviewer_primary_read)
                .then(|| self.capture_sponsored_primary_read(&captured, &config.cwd, &input_id))
                .transpose()?;
        captured.parts = vec![PromptPart::Text {
            text: instructions.to_owned(),
        }];
        captured.max_steps = Some(subagents::INFERENCE_STEPS_PER_ASSIGNMENT);
        captured.effort = None;
        captured.goal = None;
        captured.questions = false;
        captured.allow_library_selection = false;
        captured.allow_wakeups = false;
        captured.configuration_permission = crate::ConfigurationPermission::Disabled;
        captured.permission_capture = primary_read;
        if captured.permission_capture.is_none() {
            // Text-only reviewers have no native workspace execution grant.
            // They cannot inherit an executable handler's workspace access.
            captured.lifecycle_hooks = None;
        }
        captured.allow_reviewer_primary_read = false;
        captured.host_tools_capture = None;
        captured.desktop_image_generation = None;
        captured.allow_image_reference = false;
        captured.allow_attachment_reference = false;
        captured.allow_workspace_reference = false;
        captured.allow_image_placement = false;
        captured.editor_endpoint = None;
        captured.editor_presentation = false;
        captured.editor_svg_target = None;
        captured.guidance = None;
        let mut assignment = Assignment::new(source.binding.turn.clone());
        if let Some(target) = target {
            assignment.named_sponsorship = Some(NamedSponsorship {
                goal: target.goal.clone(),
                sponsor: sponsor.clone(),
            });
        }
        captured.subagent = Some(assignment);
        captured.completion_checks = None;
        let input = Submission {
            id: input_id,
            payload: encode_stored_prompt(&captured)?,
        };
        if let Some(target) = target {
            let view = self.store.inspect(child.clone()).await?;
            self.check_execution(&view)?;
            require_idle(&view)?;
            if !view.queued.is_empty() {
                return Err(problem(ErrorKind::Conflict, "session_queue_waiting"));
            }
            let profile = target.profile(&source.binding.session, &view)?;
            profile.require_authority(&execution.authority.inference.authority)?;
            let driver_state =
                profile.reserve_named_funding(&view.driver_state, target.turn.clone())?;
            return Ok(SponsoredClaim::Named {
                configuration: view.configuration,
                request: ExistingOperationClaim {
                    source,
                    claim: new_claim(
                        child,
                        target.turn.clone(),
                        view.revision,
                        vec![input.id.clone()],
                    )?,
                    input,
                    driver_state,
                },
            });
        }
        let profile = Profile::sponsored(
            source.binding.session.clone(),
            "Independent reviewer".into(),
            sponsor,
            &execution.authority.inference.authority,
        )?;
        let driver_state = profile.reserve(&Default::default())?;
        config.subagent = Some(profile);
        config.execution = execution.configuration;
        Ok(SponsoredClaim::Fresh(OperationClaim {
            source,
            create: CreateSession {
                id: child.clone(),
                request: ChangeId::new("sponsored-create")?,
                configuration: encode(SESSION_SCHEMA, SESSION_VERSION, &config)?,
            },
            claim: ClaimRequest {
                id: ChangeId::new("sponsored-claim")?,
                session: child,
                expected_revision: SessionRevision(0),
                selection: TurnSelection::New {
                    turn: TurnId::new(CHILD_TURN)?,
                    inputs: vec![input.id.clone()],
                },
            },
            input,
            driver_state,
        }))
    }

    pub(super) async fn admit_sponsored(
        &self,
        request: SponsoredClaim,
    ) -> Result<Option<Admitted>> {
        let execution = self.execution()?;
        let (configuration, selection, input, history) = match &request {
            SponsoredClaim::Fresh(request) => (
                &request.create.configuration,
                &request.claim,
                &request.input,
                Vec::new(),
            ),
            SponsoredClaim::Named {
                request,
                configuration,
            } => (
                configuration,
                &request.claim,
                &request.input,
                self.provider_history(request.claim.session.clone(), None)
                    .await?
                    .messages,
            ),
        };
        let TurnSelection::New { turn, .. } = &selection.selection else {
            return Err(sponsored_slot_used());
        };
        let session = selection.session.clone();
        let turn = turn.clone();
        let config = decode_session_configuration(configuration)?;
        let profile = config.subagent.ok_or_else(sponsored_slot_used)?;
        profile.require_authority(&execution.authority.inference.authority)?;
        if let Some(sponsor) = profile.sponsorship() {
            self.require_sponsored_origin(profile.parent(), &sponsor.parent_turn)
                .await?;
        }
        let prepared = self.prepare_input(
            execution,
            &session,
            input,
            Some(&profile),
            InputAuthority::RequireCaptured,
        )?;
        if let Some(capture) = &prepared.permission_capture {
            self.require_sponsored_primary_read(&profile, &config.cwd, &input.id, capture)
                .await?;
        }
        let mut inventory = Inventory::new();
        let mut authority = MasterAuthority {
            inference: execution.authority.inference.clone(),
            tools: BTreeMap::new(),
        };
        let permission_scope = prepared
            .permission_capture
            .as_ref()
            .map(|capture| self.prepare_sponsored_primary_read(capture, &session, &turn))
            .transpose()?;
        let provider = self.spending_provider(execution, prepared.spending.as_ref())?;
        let spending_runtime = prepared
            .spending
            .as_ref()
            .map(|_| {
                execution
                    .runtime
                    .with_provider(ProviderId::new("gg")?, provider.clone())
            })
            .transpose()?;
        let base_runtime = spending_runtime.as_ref().unwrap_or(&execution.runtime);
        // A sponsored child retains its captured checks under its own turn
        // authority; delegation does not bypass required lifecycle policy.
        let hook_command = permission_scope
            .as_ref()
            .map(|permissions| permissions.hook_command_tool())
            .transpose()?
            .flatten();
        let hooks = lifecycle_hooks::LifecycleAccess::bind(
            &agent_kit_core::turn::TurnBinding {
                session: session.clone(),
                turn: turn.clone(),
                epoch: 1,
            },
            permission_scope.as_ref(),
            hook_command.as_ref(),
        )?;
        let runtime = if let Some(permissions) = &permission_scope {
            permissions.insert_file_tools(
                &mut inventory,
                &mut authority.tools,
                None,
                prepared.operating_regime.is_act(),
            )?;
            let owner = permissions::ToolAuthority::bind(
                execution.authorization.clone(),
                Some(permissions.clone()),
                permissions::AttachmentTools {
                    image: None,
                    file: None,
                },
                None,
                permissions::HookTools {
                    completion: None,
                    before_tool: None,
                    lifecycle: hooks.clone(),
                },
                Vec::new(),
                None,
            )
            .ok_or_else(|| {
                problem(
                    ErrorKind::InvalidState,
                    "sponsored_primary_read_unavailable",
                )
            })?;
            Some(base_runtime.with_authorization(owner.clone(), owner))
        } else {
            None
        };
        let tools = inventory.snapshot(&authority.tools.keys().cloned().collect::<Vec<_>>())?;
        let mut master = Master::new(prepared.config, provider, tools, authority)?
            .with_history(history)
            .with_input_limit(prepared.limit);
        if let Some(selected) = prepared.lifecycle_hooks {
            let (inventory, grants) = match hooks {
                Some(hooks) => (hooks.inventory()?, hooks.grants()),
                None => (Inventory::new().snapshot(&[])?, BTreeMap::new()),
            };
            master = master.with_lifecycle_hooks(selected, inventory, grants);
        }
        let claimed = match request {
            SponsoredClaim::Fresh(request) => self.store.claim_from_operation(request).await?,
            SponsoredClaim::Named { request, .. } => {
                self.store.claim_existing_from_operation(request).await?
            }
        };
        let ClaimOutcome::Acquired(claim) = claimed else {
            return Ok(None);
        };
        if let Some(permissions) = permission_scope {
            permissions.bind_claim(claim.lease.binding().clone())?;
        }
        let (opened, _) = self
            .open_owned_turn_with_runtime(
                &session,
                &turn,
                claim.lease,
                runtime.as_ref().unwrap_or(base_runtime),
            )
            .await?;
        Ok(Some(Admitted {
            opened,
            work: TurnWork::Conversation {
                master: Box::new(master),
                input: prepared.messages,
                command: hook_command,
            },
            acceptance: None,
        }))
    }

    pub(super) async fn control_sponsorship(
        &self,
        request: ControlRequest,
    ) -> Result<OperationPairReceipt> {
        let (turn, stop) = match &request.action {
            SessionControl::Turn {
                turn,
                directive: ControlDirective::Pause,
                ..
            } => (turn, false),
            SessionControl::PauseAndCancel { turn, .. }
            | SessionControl::Turn {
                turn,
                directive: ControlDirective::Cancel,
                ..
            } => (turn, true),
            _ => return self.ordinary_control(request).await,
        };
        if session_configuration(&self.store.inspect(request.session.clone()).await?)?
            .subagent
            .is_some()
        {
            return self.ordinary_control(request).await;
        }
        let target = named::Target::load(&self.store, &request.session, turn).await?;
        let slot = match &target {
            Some(target) => target.child.clone(),
            None => sponsored_identity(&request.session, turn)?,
        };
        let mut conflict = problem(ErrorKind::Conflict, "sponsored_subagent_control_changed");
        for _ in 0..4 {
            let ordinary = self.store.control_receipt(request.clone()).await?;
            if let Some(receipt) = self.store.operation_pair_receipt(request.clone()).await? {
                return Ok(receipt);
            }
            if let Some(receipt) = ordinary {
                return Ok(OperationPairReceipt {
                    source: receipt,
                    destination: None,
                });
            }
            let related = self
                .sponsored_control(&request, turn, &slot, target.as_ref(), stop)
                .await?;
            if matches!(related, OperationRelatedControl::Absent { .. })
                && !self.sponsorship_available()
            {
                return self.ordinary_control(request).await;
            }
            match self
                .store
                .control_operation_pair(OperationPairControl {
                    source: request.clone(),
                    related,
                })
                .await
            {
                Ok(receipt) => return Ok(receipt),
                Err(error)
                    if matches!(
                        error.code.as_str(),
                        "operation_pair_destination_exists"
                            | "operation_pair_control_already_recorded"
                            | "request_identity_reused"
                            | "stale_session_revision"
                            | "stale_control_revision"
                            | "active_turn_mismatch"
                    ) =>
                {
                    conflict = error
                }
                Err(error) => return Err(error),
            }
        }
        Err(conflict)
    }

    pub(super) async fn pause_sponsorship(
        &self,
        request: ControlRequest,
    ) -> Result<ControlReceipt> {
        let session = self.store.inspect(request.session.clone()).await?;
        if let Some(profile) = session_configuration(&session)?.subagent
            && let SessionControl::Turn { turn, .. } = &request.action
            && profile.funded_turn(&session.driver_state, turn)?
        {
            return self
                .store
                .control_turn_with_driver_state(request, move |state| {
                    let (change, _) =
                        profile.set_sponsored_pause(state, PauseCause::Independent, true)?;
                    Ok(change.value)
                })
                .await;
        }
        Ok(self.control_sponsorship(request).await?.source)
    }

    pub(super) async fn claim_sponsored_resume(
        &self,
        request: ClaimRequest,
        view: &SessionView,
        profile: &Profile,
    ) -> Result<ClaimOutcome> {
        let (change, pause) =
            profile.set_sponsored_pause(&view.driver_state, PauseCause::Independent, false)?;
        if pause.effective() {
            return Err(problem(
                ErrorKind::Conflict,
                "sponsored_subagent_held_by_ancestor",
            ));
        }
        Ok(self
            .store
            .resume_with(request, ResumeCompanion::DriverState(change))
            .await?
            .claim)
    }

    pub(super) async fn claim_parent_resume(
        &self,
        request: ClaimRequest,
        turn: &TurnId,
    ) -> Result<ClaimOutcome> {
        let target = named::Target::load(&self.store, &request.session, turn).await?;
        let slot = match &target {
            Some(target) => target.child.clone(),
            None => sponsored_identity(&request.session, turn)?,
        };
        let Some((child, profile, sponsor, related_turn)) = self
            .related_assignment(&request.session, turn, &slot, target.as_ref())
            .await?
        else {
            return self.store.claim(request).await;
        };
        let Some(current) = child
            .current
            .as_ref()
            .filter(|turn| turn.binding == related_turn.binding && !turn.controls.cancelled)
        else {
            return self.store.claim(request).await;
        };
        if !profile
            .sponsored_pause(&child.driver_state)?
            .held_by_ancestor()
        {
            return self.store.claim(request).await;
        }
        let (change, pause) =
            profile.set_sponsored_pause(&child.driver_state, PauseCause::Ancestor, false)?;
        let ready = !pause.effective();
        if ready && !self.sponsorship_available() {
            return Err(problem(ErrorKind::Unsupported, "subagents_unavailable"));
        }
        let related = OperationRelatedControl::Apply {
            operation: sponsor.operation,
            request: ControlRequest {
                id: change_id()?,
                session: child.session,
                expected_revision: child.revision,
                action: SessionControl::DriverState {
                    change,
                    turn: Some(agent_kit_sessions::TurnControl {
                        turn: current.binding.turn.clone(),
                        expected: current.controls.revision,
                        directive: if ready {
                            ControlDirective::Resume
                        } else {
                            ControlDirective::Pause
                        },
                    }),
                },
            },
        };
        // Reserve worker capacity before making a child ready. The database
        // owns the commit and receipt even if this process is lost afterward.
        let mut work = self.work.lock().await;
        if ready {
            work.check_sponsored_capacity(&slot)?;
        }
        let outcome = self
            .store
            .resume_with(request, ResumeCompanion::Related(related))
            .await?;
        if ready && let Some(related) = &outcome.related {
            work.queue_sponsored(SponsoredWake::from_receipt(related)?);
        }
        Ok(outcome.claim)
    }

    pub(super) async fn resume_receipt(&self, request: ClaimRequest) -> Result<Option<TurnView>> {
        if !matches!(&request.selection, TurnSelection::ResumePaused { .. }) {
            return self.store.claim_receipt(request).await;
        }
        let Some(receipt) = self.store.resume_receipt(request).await? else {
            return Ok(None);
        };
        if self.sponsorship_available()
            && let Some(related) = &receipt.related
            && self
                .require_sponsored_origin(&receipt.turn.binding.session, &receipt.turn.binding.turn)
                .await
                .is_ok()
        {
            let wake = SponsoredWake::from_receipt(related)?;
            let child = match self.store.inspect(wake.binding.session.clone()).await {
                Ok(child) => child,
                Err(error) if error.code == "session_missing" => return Ok(Some(receipt.turn)),
                Err(error) => return Err(error),
            };
            if wake.claim(&child)?.is_some() {
                {
                    let mut work = self.work.lock().await;
                    work.check_sponsored_capacity(&wake.binding.session)?;
                    work.queue_sponsored(wake);
                }
                self.wake_ready().await;
            }
        }
        Ok(Some(receipt.turn))
    }

    async fn ordinary_control(&self, request: ControlRequest) -> Result<OperationPairReceipt> {
        Ok(OperationPairReceipt {
            source: self.store.control(request).await?,
            destination: None,
        })
    }

    async fn sponsored_control(
        &self,
        request: &ControlRequest,
        parent_turn: &TurnId,
        slot: &SessionId,
        target: Option<&named::Target>,
        stop: bool,
    ) -> Result<OperationRelatedControl> {
        let Some((child, profile, sponsor, turn)) = self
            .related_assignment(&request.session, parent_turn, slot, target)
            .await?
        else {
            return Ok(match target {
                Some(target) => OperationRelatedControl::Unclaimed {
                    session: target.child.clone(),
                    turn: target.turn.clone(),
                },
                None => OperationRelatedControl::Absent {
                    session: slot.clone(),
                },
            });
        };
        if turn.disposition == TurnDisposition::Settled {
            return Ok(OperationRelatedControl::Settled {
                operation: sponsor.operation.clone(),
                session: child.session,
                turn: turn.binding.turn.clone(),
            });
        }
        let action = if (stop || turn.controls.cancelled) && target.is_some() {
            SessionControl::Turn {
                turn: turn.binding.turn.clone(),
                expected: turn.controls.revision,
                directive: ControlDirective::Cancel,
            }
        } else if stop || turn.controls.cancelled {
            SessionControl::PauseAndCancel {
                turn: turn.binding.turn.clone(),
                expected: turn.controls.revision,
            }
        } else {
            let (change, _) =
                profile.set_sponsored_pause(&child.driver_state, PauseCause::Ancestor, true)?;
            SessionControl::DriverState {
                change,
                turn: Some(agent_kit_sessions::TurnControl {
                    turn: turn.binding.turn.clone(),
                    expected: turn.controls.revision,
                    directive: ControlDirective::Pause,
                }),
            }
        };
        Ok(OperationRelatedControl::Apply {
            operation: sponsor.operation.clone(),
            request: ControlRequest {
                id: change_id()?,
                session: child.session,
                expected_revision: child.revision,
                action,
            },
        })
    }

    async fn related_assignment(
        &self,
        parent: &SessionId,
        parent_turn: &TurnId,
        slot: &SessionId,
        target: Option<&named::Target>,
    ) -> Result<Option<(SessionView, Profile, Sponsorship, TurnView)>> {
        if let Some(target) = target {
            let Some(record) = target.read(&self.store, parent, parent_turn).await? else {
                return Ok(None);
            };
            let turn = record.accepted.turn.ok_or_else(related_changed)?;
            if turn.disposition != TurnDisposition::Settled
                && !record
                    .profile
                    .funded_turn(&record.view.driver_state, &turn.binding.turn)?
            {
                return Err(related_changed());
            }
            return Ok(Some((record.view, record.profile, record.sponsor, turn)));
        }
        let Some((child, profile)) = self.related_child(parent, parent_turn, slot).await? else {
            return Ok(None);
        };
        let sponsor = profile.sponsorship().cloned().ok_or_else(related_changed)?;
        let turn = child
            .current
            .as_ref()
            .or(child.latest.as_ref())
            .cloned()
            .ok_or_else(related_changed)?;
        Ok(Some((child, profile, sponsor, turn)))
    }

    async fn related_child(
        &self,
        parent: &SessionId,
        turn: &TurnId,
        slot: &SessionId,
    ) -> Result<Option<(SessionView, Profile)>> {
        let view = match self.store.inspect(slot.clone()).await {
            Ok(view) => view,
            Err(error) if error.code == "session_missing" => return Ok(None),
            Err(error) => return Err(error),
        };
        let profile = session_configuration(&view)?
            .subagent
            .filter(|profile| {
                profile.parent() == parent
                    && profile
                        .sponsorship()
                        .is_some_and(|sponsor| &sponsor.parent_turn == turn)
            })
            .ok_or_else(related_changed)?;
        Ok(Some((view, profile)))
    }

    pub(super) async fn kick_sponsored_stop(&self, receipt: &OperationPairReceipt) {
        if let Some(child) = &receipt.destination
            && let Some(turn) = &child.turn
        {
            let turn = turn.record().binding.turn.clone();
            self.release_timer(&child.session, &turn).await;
            self.kick_stopped(child.session.clone(), turn).await;
        }
    }
}

impl Work {
    fn check_sponsored_capacity(&self, child: &SessionId) -> Result<()> {
        if self.closed {
            return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
        }
        if self.ready.len() >= MAX_READY_SESSIONS
            && !self.ready.iter().any(
                |item| matches!(item, ReadyWork::Sponsored(wake) if &wake.binding.session == child),
            )
        {
            return Err(problem(ErrorKind::LimitExceeded, "host_ready_queue_limit"));
        }
        Ok(())
    }

    fn queue_sponsored(&mut self, wake: SponsoredWake) {
        if self.ready.iter().any(|item| {
            matches!(item, ReadyWork::Sponsored(pending)
                if pending.binding.session == wake.binding.session && pending.state.0 >= wake.state.0)
        }) {
            return;
        }
        self.ready.retain(|item| {
            !matches!(item, ReadyWork::Sponsored(pending) if pending.binding.session == wake.binding.session)
        });
        self.ready.push_back(ReadyWork::Sponsored(wake));
    }
}

fn sponsored_slot_used() -> Error {
    problem(ErrorKind::Conflict, "sponsored_subagent_slot_used")
}

fn related_changed() -> Error {
    problem(ErrorKind::Conflict, "sponsored_subagent_relation_changed")
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::inference::InputFormat;
    use agent_kit_core::messages::ToolArguments;
    use agent_kit_core::tools::{
        Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition, ToolOutcome,
    };
    use agent_kit_core::turn::{
        JournalAction, JournalChange, OperationInput, OperationOutcome, OperationRecord, TurnLease,
    };
    use agent_kit_core::{AttemptId, ToolId};
    use agent_kit_store_sqlite::{OperationClaim, OperationClaimSource};
    use grida_agent_master::subagents::{Profile, Sponsorship};
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
    use tokio::net::{TcpListener, TcpStream};

    struct WorkTool(ToolDefinition);

    impl Tool for WorkTool {
        fn definition(&self) -> &ToolDefinition {
            &self.0
        }

        fn validate(&self, _: &ToolArguments) -> Result<()> {
            Ok(())
        }

        fn invoke(&self, _: Invocation, _: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
            panic!("the fixture controls an already recorded attempt")
        }
    }

    fn input(text: &str) -> Submission {
        Submission {
            id: change_id().unwrap(),
            payload: encode("fixture.prompt", 1, &text).unwrap(),
        }
    }

    pub(super) async fn capture_delegation(
        host: &Host,
        cwd: &Path,
        regime: OperatingRegime,
        instructions: &str,
    ) -> (agent_kit_sessions::ClaimedTurn, OperationClaimSource) {
        capture_parent_delegation(host, cwd, regime, instructions, None).await
    }

    async fn capture_parent_delegation(
        host: &Host,
        cwd: &Path,
        regime: OperatingRegime,
        instructions: &str,
        goal: Option<GoalRequest>,
    ) -> (agent_kit_sessions::ClaimedTurn, OperationClaimSource) {
        let session = host.new_session(cwd.canonicalize().unwrap()).await.unwrap();
        let view = host.store.inspect(session.clone()).await.unwrap();
        let effort = host.capture_effort(EffortPreset::Ultra).unwrap();
        let mut submission = host
            .capture_input(
                &view,
                change_id().unwrap(),
                vec![PromptPart::Text {
                    text: "Private parent context".into(),
                }],
                SubmissionPolicy {
                    questions: true,
                    configuration_permission: crate::ConfigurationPermission::Inspect,
                    allow_wakeups: false,
                    allow_library_selection: false,
                    allow_host_tools: false,
                    desktop_image_generation: None,
                    allow_image_placement: false,
                    editor_endpoint: None,
                    editor_presentation: false,
                    editor_svg_target: None,
                    operating_regime: regime,
                    subagent: None,
                    effort: effort.clone(),
                    reasoning: Default::default(),
                    spending: None,
                },
            )
            .await
            .unwrap();
        let id = submission.id.clone();
        let goal = goal.map(goals::GoalInput::Start);
        if let Some(goal) = &goal {
            let mut stored: StoredPrompt = decode_input(&submission).unwrap();
            stored.goal = Some(goal.clone());
            submission.payload = encode_stored_prompt(&stored).unwrap();
        }
        host.store
            .submit(session.clone(), submission)
            .await
            .unwrap();
        let view = host.store.inspect(session.clone()).await.unwrap();
        let turn = TurnId::new("parent-turn").unwrap();
        let claim = new_claim(session, turn.clone(), view.revision, vec![id.clone()]).unwrap();
        let claim = if let Some(goal) = goal {
            let change = goals::claim_update(
                &view,
                &id,
                &turn,
                &goal,
                host.execution().unwrap().config.max_steps,
                effort.as_ref(),
            )
            .unwrap();
            host.store.claim_with_driver_state(claim, change).await
        } else {
            host.store.claim(claim).await
        };
        let ClaimOutcome::Acquired(owner) = claim.unwrap() else {
            panic!("expected parent lease")
        };
        let definition = delegation_definition().unwrap();
        let tool = definition.id.clone();
        let mut inventory = Inventory::new();
        inventory.insert(Arc::new(WorkTool(definition))).unwrap();
        let operation = OperationId::new("delegate").unwrap();
        let attempt = AttemptId::new("delegate-attempt").unwrap();
        let invocation = inventory
            .snapshot(std::slice::from_ref(&tool))
            .unwrap()
            .prepare(
                operation.clone(),
                &tool,
                ToolArguments::Json(json!({"instructions": instructions})),
            )
            .unwrap()
            .invocation()
            .clone();
        let action = invocation.fingerprint();
        let initial = owner.lease.journal().load().await.unwrap();
        owner
            .lease
            .journal()
            .commit(
                JournalChange::new(
                    change_id().unwrap(),
                    initial.binding().clone(),
                    initial.position(),
                    initial.controls().revision,
                    vec![
                        JournalAction::prepare(OperationRecord {
                            id: operation.clone(),
                            input: OperationInput::Tool(invocation),
                            origin: None,
                            source_call: None,
                            grants: delegation_grant(initial.binding()).unwrap(),
                        }),
                        JournalAction::StartAttempt {
                            operation: operation.clone(),
                            attempt: attempt.clone(),
                        },
                    ],
                )
                .unwrap(),
            )
            .await
            .unwrap();
        let source = OperationClaimSource {
            binding: initial.binding().clone(),
            control: initial.controls().revision,
            operation,
            attempt,
            action,
        };
        (owner, source)
    }

    async fn synthetic_reply(listener: &TcpListener) -> serde_json::Value {
        let (stream, _) = listener.accept().await.unwrap();
        answer_request(stream).await
    }

    async fn answer_request(stream: TcpStream) -> serde_json::Value {
        let mut stream = BufReader::new(stream);
        let mut size = None;
        loop {
            let mut line = String::new();
            assert_ne!(stream.read_line(&mut line).await.unwrap(), 0);
            if line == "\r\n" {
                break;
            }
            if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                size = Some(value.trim().parse::<usize>().unwrap());
            }
        }
        let mut body = vec![0; size.unwrap()];
        stream.read_exact(&mut body).await.unwrap();
        let reply = concat!(
            "data: {\"id\":\"fixture\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"Independent finding.\"},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"fixture\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
            "data: [DONE]\n\n",
        );
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{reply}",
            reply.len()
        );
        stream
            .get_mut()
            .write_all(response.as_bytes())
            .await
            .unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    async fn suspend(lease: TurnLease, mut actions: Vec<JournalAction>) {
        let state = lease.journal().load().await.unwrap();
        actions.push(JournalAction::Suspend);
        lease
            .journal()
            .commit(
                JournalChange::new(
                    change_id().unwrap(),
                    state.binding().clone(),
                    state.position(),
                    state.controls().revision,
                    actions,
                )
                .unwrap(),
            )
            .await
            .unwrap();
    }

    fn turn_control(view: &SessionView) -> TurnControl {
        let turn = view.current.as_ref().unwrap();
        TurnControl {
            request: change_id().unwrap(),
            session: view.session.clone(),
            turn: turn.binding.turn.clone(),
            expected_session: view.revision,
            expected_control: turn.controls.revision,
        }
    }

    async fn paused_parent_and_child(
        host: &Host,
        root: &Path,
        independent: bool,
        goal: Option<GoalRequest>,
    ) -> (SessionView, SessionId) {
        let instructions = "Check the retained result independently.";
        let (owner, source) =
            capture_parent_delegation(host, root, OperatingRegime::Act, instructions, goal).await;
        let parent = source.binding.session.clone();
        let child = sponsored_identity(&parent, &source.binding.turn).unwrap();
        let SponsoredClaim::Fresh(work) = host
            .sponsored_claim(source.clone(), child.clone(), None, instructions)
            .await
            .unwrap()
        else {
            panic!("expected fresh child claim")
        };
        let ClaimOutcome::Acquired(child_owner) =
            host.store.claim_from_operation(work).await.unwrap()
        else {
            panic!("expected child lease");
        };
        if independent {
            let view = host.store.inspect(child.clone()).await.unwrap();
            host.pause(turn_control(&view)).await.unwrap();
        }
        let view = host.store.inspect(parent.clone()).await.unwrap();
        host.pause(turn_control(&view)).await.unwrap();
        suspend(
            owner.lease,
            vec![JournalAction::CompleteAttempt {
                operation: source.operation,
                attempt: source.attempt,
                outcome: OperationOutcome::Tool(ToolOutcome::failed("fixture")),
            }],
        )
        .await;
        suspend(child_owner.lease, Vec::new()).await;
        (host.store.inspect(parent).await.unwrap(), child)
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[tokio::test]
    async fn ordinary_only_review_cannot_resume_a_retained_goal_child() {
        use grida_agent_master::goals::{Allowance, Objective};
        use std::num::NonZeroU32;

        let root = tempfile::tempdir().unwrap();
        let state = root.path().join("state");
        let home = root.path().canonicalize().unwrap().join("credentials");
        grida_auth::ProviderStore::new(home.clone())
            .unwrap()
            .set("openrouter", "fixture-key")
            .unwrap();
        let options = || ProviderOptions {
            endpoint: "https://openrouter.ai/api/v1".into(),
            model: ModelId::new("fixture").unwrap(),
            max_output_tokens: 1024,
            credential_env: None,
            protocol: ProviderProtocol::OpenAiCompatible,
            credential_home: Some(home.clone()),
            compatible_output_limit_field: None,
            llama_cpp_input_count: false,
            reasoning: Default::default(),
        };
        let host = Host::open(&state, Some(options()))
            .unwrap()
            .with_subagents();
        let (parent, child) = paused_parent_and_child(
            &host,
            root.path(),
            false,
            Some(GoalRequest {
                objective: Objective {
                    description: "Review the work".into(),
                    criteria: vec!["Review received".into()],
                },
                allowance: Allowance {
                    work_turns: NonZeroU32::new(1).unwrap(),
                    inference_steps: NonZeroU32::new(5).unwrap(),
                },
                automatic: false,
                user_review: false,
                named_child: None,
            }),
        )
        .await;
        let turn = parent.current.unwrap();
        let request = ClaimRequest {
            id: change_id().unwrap(),
            session: parent.session.clone(),
            expected_revision: parent.revision,
            selection: TurnSelection::ResumePaused {
                turn: turn.binding.turn.clone(),
                epoch: turn.binding.epoch,
                position: turn.position,
                control_revision: turn.controls.revision,
            },
        };
        // The headless owner commits both decisions, then exits before its
        // ready child can be admitted under the saved provider.
        let ClaimOutcome::Acquired(owner) = host
            .claim_parent_resume(request.clone(), &turn.binding.turn)
            .await
            .unwrap()
        else {
            panic!("expected retained parent resume")
        };
        drop(owner);
        assert!(matches!(
            host.work.lock().await.ready.front(),
            Some(ReadyWork::Sponsored(_))
        ));
        host.shutdown().await.unwrap();
        drop(host);

        let reopened = Host::open_supervised(
            &state,
            options(),
            crate::SupervisedProvider::default(),
            None,
        )
        .unwrap()
        .with_subagents()
        .without_goal_sponsorship();
        let before = reopened.store.inspect(child.clone()).await.unwrap();
        reopened.check_execution(&before).unwrap();
        let observed = reopened.resume_receipt(request).await.unwrap().unwrap();
        assert_eq!(observed.binding.turn, turn.binding.turn);
        {
            let work = reopened.work.lock().await;
            assert!(work.ready.is_empty() && work.active.is_empty());
        }
        let unchanged = reopened.store.inspect(child.clone()).await.unwrap();
        assert_eq!(unchanged.revision, before.revision);
        assert_eq!(unchanged.current, before.current);

        reopened.pause(turn_control(&unchanged)).await.unwrap();
        let paused = reopened.store.inspect(child.clone()).await.unwrap();
        let current = paused.current.as_ref().unwrap();
        let denied = reopened
            .resume(
                turn_control(&paused),
                current.binding.epoch,
                current.position,
            )
            .await
            .unwrap_err();
        assert_eq!(denied.code, "goal_funded_review_unavailable");
        assert_eq!(
            reopened.store.inspect(child.clone()).await.unwrap().current,
            paused.current
        );
        let control = turn_control(&paused);
        reopened
            .stop(
                control.session,
                control.turn,
                control.request,
                control.expected_session,
                control.expected_control,
            )
            .await
            .unwrap();
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                let view = reopened.store.inspect(child.clone()).await.unwrap();
                if let Some(outcome) = view.latest.and_then(|turn| turn.outcome) {
                    assert_eq!(outcome.status, OutcomeStatus::Cancelled);
                    break;
                }
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .unwrap();
        reopened.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn parent_resume_starts_the_child_before_either_response() {
        let root = tempfile::tempdir().unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let host = Host::open(
            &root.path().join("state"),
            Some(ProviderOptions {
                endpoint: format!("http://{}/v1", listener.local_addr().unwrap()),
                model: ModelId::new("fixture").unwrap(),
                max_output_tokens: 1024,
                credential_env: None,
                protocol: ProviderProtocol::OpenAiCompatible,
                credential_home: None,
                compatible_output_limit_field: None,
                llama_cpp_input_count: false,
                reasoning: Default::default(),
            }),
        )
        .unwrap()
        .with_subagents();
        let (parent, child) = paused_parent_and_child(&host, root.path(), false, None).await;
        let current = parent.current.as_ref().unwrap();
        host.resume(
            turn_control(&parent),
            current.binding.epoch,
            current.position,
        )
        .await
        .unwrap();
        let requests = tokio::time::timeout(Duration::from_secs(5), async {
            let (first, _) = listener.accept().await.unwrap();
            let (second, _) = listener.accept().await.unwrap();
            tokio::join!(answer_request(first), answer_request(second))
        })
        .await
        .unwrap();
        let messages = [
            requests.0["messages"].to_string(),
            requests.1["messages"].to_string(),
        ];
        assert_eq!(
            messages
                .iter()
                .filter(|messages| messages.contains("Private parent context"))
                .count(),
            1
        );
        assert_eq!(
            messages
                .iter()
                .filter(|messages| messages.contains("Check the retained result independently."))
                .count(),
            1
        );
        tokio::time::timeout(Duration::from_secs(5), async {
            for session in [parent.session, child] {
                loop {
                    let view = host.store.inspect(session.clone()).await.unwrap();
                    if view
                        .latest
                        .is_some_and(|turn| turn.disposition == TurnDisposition::Settled)
                    {
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
            }
        })
        .await
        .unwrap();
        host.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn parent_resume_replays_exact_child_readiness_after_restart() {
        let root = tempfile::tempdir().unwrap();
        let state = root.path().join("state");
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let options = || ProviderOptions {
            endpoint: format!("http://{}/v1", listener.local_addr().unwrap()),
            model: ModelId::new("fixture").unwrap(),
            max_output_tokens: 1024,
            credential_env: None,
            protocol: ProviderProtocol::OpenAiCompatible,
            credential_home: None,
            compatible_output_limit_field: None,
            llama_cpp_input_count: false,
            reasoning: Default::default(),
        };
        let host = Host::open(&state, Some(options()))
            .unwrap()
            .with_subagents();
        let (parent, child) = paused_parent_and_child(&host, root.path(), false, None).await;
        let control = turn_control(&parent);
        let current = parent.current.unwrap();
        let request = ClaimRequest {
            id: control.request.clone(),
            session: parent.session,
            expected_revision: parent.revision,
            selection: TurnSelection::ResumePaused {
                turn: current.binding.turn.clone(),
                epoch: current.binding.epoch,
                position: current.position,
                control_revision: current.controls.revision,
            },
        };
        {
            let mut work = host.work.lock().await;
            work.ready.extend((0..MAX_READY_SESSIONS).map(|index| {
                ReadyWork::Queue(SessionId::new(format!("full-{index}")).unwrap(), None)
            }));
        }
        let error = host
            .claim_parent_resume(request.clone(), &current.binding.turn)
            .await
            .err()
            .unwrap();
        assert_eq!(error.code, "host_ready_queue_limit");
        assert!(
            host.store
                .claim_receipt(request.clone())
                .await
                .unwrap()
                .is_none()
        );
        host.work.lock().await.ready.clear();
        let ClaimOutcome::Acquired(reclaimed) = host
            .claim_parent_resume(request.clone(), &current.binding.turn)
            .await
            .unwrap()
        else {
            panic!("expected parent lease");
        };
        assert!(matches!(
            host.work.lock().await.ready.front(),
            Some(ReadyWork::Sponsored(_))
        ));
        drop(reclaimed);
        drop(host);

        let unavailable = Host::open(&state, Some(options())).unwrap();
        assert!(unavailable.resume_receipt(request).await.unwrap().is_some());
        assert!(unavailable.work.lock().await.ready.is_empty());
        unavailable.shutdown().await.unwrap();
        drop(unavailable);

        let host = Host::open(&state, Some(options()))
            .unwrap()
            .with_subagents();
        let original_child = host
            .store
            .inspect(child.clone())
            .await
            .unwrap()
            .current
            .unwrap();
        assert_eq!(original_child.disposition, TurnDisposition::Suspended);
        assert!(original_child.controls.admits_work());
        host.store
            .submit(child.clone(), input("Retained supplemental note."))
            .await
            .unwrap();
        let replay = || {
            host.resume(
                TurnControl {
                    request: control.request.clone(),
                    session: control.session.clone(),
                    turn: control.turn.clone(),
                    expected_session: control.expected_session,
                    expected_control: control.expected_control,
                },
                current.binding.epoch,
                current.position,
            )
        };
        let (first, second) = tokio::join!(replay(), replay());
        assert_eq!(first.unwrap().disposition, TurnDisposition::Interrupted);
        assert_eq!(second.unwrap().disposition, TurnDisposition::Interrupted);
        let request = tokio::time::timeout(Duration::from_secs(5), synthetic_reply(&listener))
            .await
            .unwrap();
        assert!(
            request["messages"]
                .to_string()
                .contains("Check the retained result independently.")
        );
        let child = tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                let view = host.store.inspect(child.clone()).await.unwrap();
                if let Some(turn) = view
                    .latest
                    .filter(|turn| turn.disposition == TurnDisposition::Settled)
                {
                    break turn;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        assert_eq!(child.binding.epoch, original_child.binding.epoch + 1);
        assert!(
            tokio::time::timeout(Duration::from_millis(100), listener.accept())
                .await
                .is_err()
        );
        host.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn parent_resume_leaves_an_independent_pause_for_the_child_to_clear() {
        let root = tempfile::tempdir().unwrap();
        let host = Host::open(
            &root.path().join("state"),
            Some(ProviderOptions {
                endpoint: "http://127.0.0.1:1/v1".into(),
                model: ModelId::new("fixture").unwrap(),
                max_output_tokens: 1024,
                credential_env: None,
                protocol: ProviderProtocol::OpenAiCompatible,
                credential_home: None,
                compatible_output_limit_field: None,
                llama_cpp_input_count: false,
                reasoning: Default::default(),
            }),
        )
        .unwrap()
        .with_subagents();
        let (parent, child) = paused_parent_and_child(&host, root.path(), true, None).await;
        let current = parent.current.unwrap();
        let request = ClaimRequest {
            id: change_id().unwrap(),
            session: parent.session,
            expected_revision: parent.revision,
            selection: TurnSelection::ResumePaused {
                turn: current.binding.turn.clone(),
                epoch: current.binding.epoch,
                position: current.position,
                control_revision: current.controls.revision,
            },
        };
        let ClaimOutcome::Acquired(parent) = host
            .claim_parent_resume(request.clone(), &current.binding.turn)
            .await
            .unwrap()
        else {
            panic!("expected parent lease");
        };
        let child = host.store.inspect(child).await.unwrap();
        let current = child.current.as_ref().unwrap();
        let profile = session_configuration(&child).unwrap().subagent.unwrap();
        let pause = profile.sponsored_pause(&child.driver_state).unwrap();
        assert!(pause.effective());
        assert!(!pause.held_by_ancestor());
        assert!(current.controls.paused);
        assert!(host.resume_receipt(request).await.unwrap().is_some());
        assert!(host.work.lock().await.ready.is_empty());

        let request = ClaimRequest {
            id: change_id().unwrap(),
            session: child.session.clone(),
            expected_revision: child.revision,
            selection: TurnSelection::ResumePaused {
                turn: current.binding.turn.clone(),
                epoch: current.binding.epoch,
                position: current.position,
                control_revision: current.controls.revision,
            },
        };
        let ClaimOutcome::Acquired(reclaimed) = host
            .claim_sponsored_resume(request, &child, &profile)
            .await
            .unwrap()
        else {
            panic!("expected child lease");
        };
        assert_eq!(reclaimed.lease.binding().epoch, current.binding.epoch + 1);
        drop(reclaimed);
        drop(parent);
        host.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn admitted_sponsored_work_runs_once_with_the_captured_regime() {
        let root = tempfile::tempdir().unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let host = Host::open(
            &root.path().join("state"),
            Some(ProviderOptions {
                endpoint: format!("http://{address}/v1"),
                model: ModelId::new("fixture").unwrap(),
                max_output_tokens: 1024,
                credential_env: None,
                protocol: ProviderProtocol::OpenAiCompatible,
                credential_home: None,
                compatible_output_limit_field: Some(CompatibleOutputLimitField::MaxTokens),
                llama_cpp_input_count: false,
                reasoning: Default::default(),
            }),
        )
        .unwrap()
        .with_subagents();
        let instructions = "Inspect the result and explain the independent finding.";
        for regime in [OperatingRegime::Plan, OperatingRegime::Act] {
            let (_owner, source) =
                capture_delegation(&host, root.path(), regime, instructions).await;
            let slot = sponsored_identity(&source.binding.session, &source.binding.turn).unwrap();
            let accepted = host
                .start_sponsored_child(source.clone(), instructions.into())
                .await
                .unwrap();
            assert_eq!(accepted.parent_turn, source.binding.turn);
            assert_eq!(
                accepted.max_generation_steps,
                subagents::INFERENCE_STEPS_PER_ASSIGNMENT
            );
            let request = tokio::time::timeout(Duration::from_secs(5), synthetic_reply(&listener))
                .await
                .unwrap();
            let prompt = request["messages"].to_string();
            assert!(prompt.contains(instructions));
            assert!(!prompt.contains("Private parent context"));
            assert_eq!(prompt.contains("Plan is active."), !regime.is_act());
            assert!(request.get("tools").is_none());
            assert_eq!(request["max_tokens"], 1024);
            let finished = tokio::time::timeout(Duration::from_secs(5), async {
                loop {
                    let replay = host
                        .start_sponsored_child(source.clone(), instructions.into())
                        .await
                        .unwrap();
                    if let Some(turn) = replay.turn
                        && turn.disposition == TurnDisposition::Settled
                    {
                        break turn;
                    }
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
            })
            .await
            .unwrap();
            assert_eq!(finished.binding.session, slot);
            let outcome = finished.outcome.unwrap();
            assert_eq!(
                outcome.status,
                agent_kit_core::messages::OutcomeStatus::Succeeded
            );
            assert_eq!(
                grida_agent_master::read_account(outcome.account.as_ref().unwrap())
                    .unwrap()
                    .text,
                "Independent finding."
            );
            let mut stale = source;
            stale.control.0 += 1;
            assert_eq!(
                host.start_sponsored_child(stale, instructions.into())
                    .await
                    .err()
                    .unwrap()
                    .code,
                "sponsored_subagent_slot_used"
            );
        }
        assert!(
            tokio::time::timeout(Duration::from_millis(100), listener.accept())
                .await
                .is_err()
        );
        host.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn parent_pause_and_stop_update_the_exact_sponsored_child() {
        let root = tempfile::tempdir().unwrap();
        let mut host = Host::open(
            &root.path().join("state"),
            Some(ProviderOptions {
                endpoint: "http://127.0.0.1:1/v1".into(),
                model: ModelId::new("fixture").unwrap(),
                max_output_tokens: 1024,
                credential_env: None,
                protocol: ProviderProtocol::OpenAiCompatible,
                credential_home: None,
                compatible_output_limit_field: None,
                llama_cpp_input_count: false,
                reasoning: Default::default(),
            }),
        )
        .unwrap()
        .with_subagents();
        let store = &host.store;
        let parent = host
            .new_session(root.path().canonicalize().unwrap())
            .await
            .unwrap();
        let parent_turn = TurnId::new("parent-turn").unwrap();
        let parent_input = input("Review the result");
        store
            .submit(parent.clone(), parent_input.clone())
            .await
            .unwrap();
        let view = store.inspect(parent.clone()).await.unwrap();
        let ClaimOutcome::Acquired(owner) = store
            .claim(
                new_claim(
                    parent.clone(),
                    parent_turn.clone(),
                    view.revision,
                    vec![parent_input.id],
                )
                .unwrap(),
            )
            .await
            .unwrap()
        else {
            panic!("expected parent lease")
        };
        let operation = OperationId::new("start-review").unwrap();
        let attempt = AttemptId::new("attempt").unwrap();
        let tool = ToolId::new("review").unwrap();
        let mut inventory = Inventory::new();
        inventory
            .insert(Arc::new(WorkTool(ToolDefinition {
                id: tool.clone(),
                version: 1,
                description: "Review the result".into(),
                input: InputFormat::Text,
                max_input_bytes: 256,
                max_output_bytes: 256,
                recovery: RecoveryKind::Unavailable,
            })))
            .unwrap();
        let invocation = inventory
            .snapshot(std::slice::from_ref(&tool))
            .unwrap()
            .prepare(
                operation.clone(),
                &tool,
                ToolArguments::Text("Inspect the result".into()),
            )
            .unwrap()
            .invocation()
            .clone();
        let action = invocation.fingerprint();
        let grant = host.execution().unwrap().authority.inference.clone();
        let initial = owner.lease.journal().load().await.unwrap();
        owner
            .lease
            .journal()
            .commit(
                JournalChange::new(
                    change_id().unwrap(),
                    initial.binding().clone(),
                    initial.position(),
                    initial.controls().revision,
                    vec![
                        JournalAction::prepare(OperationRecord {
                            id: operation.clone(),
                            input: OperationInput::Tool(invocation),
                            origin: None,
                            source_call: None,
                            grants: grant.clone(),
                        }),
                        JournalAction::StartAttempt {
                            operation: operation.clone(),
                            attempt: attempt.clone(),
                        },
                    ],
                )
                .unwrap(),
            )
            .await
            .unwrap();
        let profile = Profile::sponsored(
            parent.clone(),
            "Reviewer".into(),
            Sponsorship {
                parent_turn: parent_turn.clone(),
                operation: operation.clone(),
                admission: None,
                attempt: None,
            },
            &grant.authority,
        )
        .unwrap();
        let child = sponsored_identity(&parent, &parent_turn).unwrap();
        let child_turn = TurnId::new("child-turn").unwrap();
        let child_input = input("Inspect the result");
        let mut config = session_configuration(&view).unwrap();
        config.subagent = Some(profile.clone());
        let ClaimOutcome::Acquired(child_owner) = store
            .claim_from_operation(OperationClaim {
                source: OperationClaimSource {
                    binding: owner.lease.binding().clone(),
                    control: initial.controls().revision,
                    operation,
                    attempt,
                    action,
                },
                create: CreateSession {
                    id: child.clone(),
                    request: change_id().unwrap(),
                    configuration: encode(SESSION_SCHEMA, SESSION_VERSION, &config).unwrap(),
                },
                claim: new_claim(
                    child.clone(),
                    child_turn.clone(),
                    SessionRevision(0),
                    vec![child_input.id.clone()],
                )
                .unwrap(),
                input: child_input,
                driver_state: profile.reserve(&Default::default()).unwrap(),
            })
            .await
            .unwrap()
        else {
            panic!("expected child lease")
        };

        control(
            &host,
            child.clone(),
            child_turn.clone(),
            ControlDirective::Pause,
        )
        .await
        .unwrap();
        let child_state = store.inspect(child.clone()).await.unwrap().driver_state;
        assert!(!profile.sponsored_pause(&child_state).unwrap().effective());

        let view = store.inspect(parent.clone()).await.unwrap();
        let pause_id = change_id().unwrap();
        let control = view.current.unwrap().controls.revision;
        let pause = || TurnControl {
            request: pause_id.clone(),
            session: parent.clone(),
            turn: parent_turn.clone(),
            expected_session: view.revision,
            expected_control: control,
        };
        let receipt = host.pause(pause()).await.unwrap();
        assert_eq!(host.pause(pause()).await.unwrap(), receipt);
        let child_view = store.inspect(child.clone()).await.unwrap();
        assert!(
            profile
                .sponsored_pause(&child_view.driver_state)
                .unwrap()
                .effective()
        );
        assert_eq!(
            profile
                .allocation(&child_view.driver_state)
                .unwrap()
                .reserved,
            1
        );
        let current = child_view.current.unwrap();
        assert!(current.controls.paused);
        let direct_resume = ClaimRequest {
            id: change_id().unwrap(),
            session: child.clone(),
            expected_revision: child_view.revision,
            selection: TurnSelection::ResumePaused {
                turn: child_turn.clone(),
                epoch: current.binding.epoch,
                position: current.position,
                control_revision: current.controls.revision,
            },
        };
        let child_view = store.inspect(child.clone()).await.unwrap();
        assert_eq!(
            host.claim_sponsored_resume(direct_resume, &child_view, &profile)
                .await
                .err()
                .unwrap()
                .code,
            "sponsored_subagent_held_by_ancestor"
        );
        let independent = || TurnControl {
            request: ChangeId::new("independent-pause").unwrap(),
            session: child.clone(),
            turn: child_turn.clone(),
            expected_session: child_view.revision,
            expected_control: current.controls.revision,
        };
        let independent_receipt = host.pause(independent()).await.unwrap();
        let child_state = store.inspect(child.clone()).await.unwrap().driver_state;
        let (_, without_ancestor) = profile
            .set_sponsored_pause(&child_state, PauseCause::Ancestor, false)
            .unwrap();
        assert!(without_ancestor.effective());

        host.subagents_enabled = false;
        let view = store.inspect(parent.clone()).await.unwrap();
        let stop = change_id().unwrap();
        let control = view.current.unwrap().controls.revision;
        let receipt = host
            .stop(
                parent.clone(),
                parent_turn.clone(),
                stop.clone(),
                view.revision,
                control,
            )
            .await
            .unwrap();
        assert_eq!(
            host.stop(parent, parent_turn, stop, view.revision, control)
                .await
                .unwrap(),
            receipt
        );
        assert_eq!(
            host.pause(independent()).await.unwrap(),
            independent_receipt
        );
        assert!(
            store
                .inspect_turn(child, child_turn)
                .await
                .unwrap()
                .controls
                .cancelled
        );
        drop(child_owner);
    }
}
