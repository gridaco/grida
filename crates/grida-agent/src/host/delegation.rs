//! GRIDA-SEC-004 / GRIDA-SEC-006 / GRIDA-SEC-014 — bounded, operation-owned delegated work.

use super::*;
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{
    Content, Message, OutcomeStatus, Provenance, ProvenanceKind, Role, ToolArguments,
};
use agent_kit_core::tools::{
    Invocation, InvocationContext, InvocationRecovery, RecoveryKind, Tool, ToolDefinition,
    ToolOutcome,
};
use agent_kit_core::turn::{OperationInput, TurnBinding};
use agent_kit_core::{GrantId, ToolId};
use agent_kit_runtime::TurnOperations;
use agent_kit_store_sqlite::{OperationClaim, OperationClaimSource};
use grida_agent_master::delegation::{Policy, SEND, SPAWN, STOP, WAIT};
use grida_agent_master::subagents::{Assignment, Profile, Sponsorship};
use serde_json::{Value, json};
use std::time::{Duration, Instant};

const INPUT: &str = "worker-assignment";
const TURN: &str = "worker-turn";
const RESULT_BYTES: usize = 4096;
const MAX_MESSAGES: usize = 16;

/// A distinct retained profile; ordinary/manual children never gain its tools.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Worker {
    source: Source,
    name: String,
}

// Retained product data is deliberately separate from the store's execution API.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Source {
    binding: TurnBinding,
    control: agent_kit_core::turn::ControlRevision,
    operation: OperationId,
    attempt: agent_kit_core::AttemptId,
    action: Fingerprint,
}
impl From<OperationClaimSource> for Source {
    fn from(source: OperationClaimSource) -> Self {
        Self {
            binding: source.binding,
            control: source.control,
            operation: source.operation,
            attempt: source.attempt,
            action: source.action,
        }
    }
}
impl Source {
    fn claim(&self) -> OperationClaimSource {
        OperationClaimSource {
            binding: self.binding.clone(),
            control: self.control,
            operation: self.operation.clone(),
            attempt: self.attempt.clone(),
            action: self.action,
        }
    }
}

pub(super) fn validate_worker_shape(stored: &StoredPrompt) -> Result<()> {
    if stored.worker.is_none()
        || stored.subagent.is_none()
        || stored.delegation.is_some()
        || stored.effort.is_some()
        || stored.goal.is_some()
        || stored.questions
        || stored.allow_wakeups
        || stored.allow_library_selection
        || stored.allow_reviewer_primary_read
        || stored.host_tools_capture.is_some()
        || stored.desktop_image_generation.is_some()
        || stored.allow_image_reference
        || stored.allow_attachment_reference
        || stored.allow_workspace_reference
        || stored.allow_image_placement
        || stored.editor_endpoint.is_some()
        || stored.editor_presentation
        || stored.editor_svg_target.is_some()
        || !matches!(
            stored.max_steps,
            Some(1..=grida_agent_master::delegation::CHILD_STEPS)
        )
        || !matches!(stored.parts.as_slice(), [PromptPart::Text { .. }])
    {
        return Err(problem(ErrorKind::InvalidState, "invalid_worker_authority"));
    }
    Ok(())
}

fn definition(id: &str) -> Result<ToolDefinition> {
    let (description, properties, required) = match id {
        SPAWN => (
            "Start one bounded worker with a clear name and self-contained assignment. The worker receives the captured model, reasoning, project guidance, skills and already authorized native capabilities, but no nested delegation or live editor handles. Processes it starts end with this assignment; the parent owns longer-lived work. Use wait_agent to collect its result before completing.",
            json!({"name":{"type":"string","minLength":1,"maxLength":128},"instructions":{"type":"string","minLength":1}}),
            json!(["name", "instructions"]),
        ),
        SEND => (
            "Send information to an owned worker without starting idle work. This is information, not another assignment.",
            json!({"child":{"type":"string"},"text":{"type":"string","minLength":1}}),
            json!(["child", "text"]),
        ),
        WAIT => (
            "Wait briefly for the exact owned assignments and collect settled results. Pending work stays pending; waiting never starts or resumes a worker. Settled result text can be truncated; inspect the child's conversation or referenced resources when more detail is needed. Repeat while useful work is outstanding.",
            json!({"children":{"type":"array","items":{"type":"string"},"minItems":1,"maxItems":8}}),
            json!(["children"]),
        ),
        STOP => (
            "Stop the current owned worker assignment. Collects a terminal result only once cancellation has actually settled.",
            json!({"child":{"type":"string"}}),
            json!(["child"]),
        ),
        _ => return Err(unavailable()),
    };
    Ok(ToolDefinition {
        id: ToolId::new(id)?,
        version: 1,
        description: description.into(),
        input: InputFormat::Json(
            json!({"type":"object","properties":properties,"required":required,"additionalProperties":false}),
        ),
        max_input_bytes: grida_agent_master::subagents::MAX_ASSIGNMENT_BYTES + 1024,
        max_output_bytes: 256 * 1024,
        recovery: RecoveryKind::Reconcile,
    })
}

fn grant(binding: &TurnBinding, id: &str) -> Result<GrantSelection> {
    Ok(GrantSelection {
        authority: AuthorityBinding {
            principal: PrincipalId::new("grida-local")?,
            binding: BindingId::new(format!(
                "workers/{}",
                Fingerprint::of(&(&binding.session, &binding.turn))?.to_hex()
            ))?,
            scope: ScopeId::new("delegated-workers")?,
        },
        grants: vec![GrantId::new(id)?],
    })
}

pub(super) struct Access {
    host: Host,
    binding: TurnBinding,
    policy: Policy,
    grants: BTreeMap<ToolId, GrantSelection>,
}

impl Access {
    pub(super) fn bind(host: &Host, binding: &TurnBinding, policy: Policy) -> Result<Arc<Self>> {
        Ok(Arc::new(Self {
            host: host.clone(),
            binding: binding.clone(),
            policy,
            grants: [SPAWN, SEND, WAIT, STOP]
                .into_iter()
                .map(|id| Ok((ToolId::new(id)?, grant(binding, id)?)))
                .collect::<Result<_>>()?,
        }))
    }

    pub(super) fn accepts(&self, selected: &GrantSelection) -> bool {
        self.grants.values().any(|grant| grant == selected)
    }

    pub(super) fn decide(
        &self,
        admission: ToolAdmission,
        _: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
            let id = admission.invocation.definition().id.as_str();
            if self.grants.get(&admission.invocation.definition().id) != Some(&admission.grants)
                || admission.invocation.definition() != &definition(id)?
            {
                return Err(unavailable());
            }
            Ok(ToolDecision::Permit)
        })
    }

    pub(super) fn insert(
        self: &Arc<Self>,
        operations: TurnOperations,
        inventory: &mut Inventory,
        grants: &mut BTreeMap<ToolId, GrantSelection>,
    ) -> Result<()> {
        for id in [SPAWN, SEND, WAIT, STOP] {
            let definition = definition(id)?;
            grants.insert(definition.id.clone(), self.grants[&definition.id].clone());
            inventory.insert(Arc::new(WorkerTool {
                access: self.clone(),
                operations: operations.clone(),
                definition,
            }))?;
        }
        Ok(())
    }

    pub(super) async fn reconcile(
        &self,
        operations: &TurnOperations,
        tools: &agent_kit_core::tools::InventorySnapshot,
    ) -> Result<()> {
        let pending = operations
            .view()
            .state
            .operations()
            .iter()
            .filter(|(_, entry)| {
                self.accepts(&entry.record.grants) && (entry.is_running() || entry.is_uncertain())
            })
            .map(|(id, _)| id.clone())
            .collect::<Vec<_>>();
        for id in pending {
            operations.reconcile_tool(id, tools.clone()).await?;
        }
        Ok(())
    }
}

struct WorkerTool {
    access: Arc<Access>,
    operations: TurnOperations,
    definition: ToolDefinition,
}

impl WorkerTool {
    fn source(
        &self,
        invocation: &Invocation,
        context: &InvocationContext,
        recovery: bool,
    ) -> Result<OperationClaimSource> {
        let view = self.operations.view();
        if view.state.binding() != &self.access.binding
            || (!recovery && context.cancellation.is_cancelled())
        {
            return Err(unavailable());
        }
        Ok(OperationClaimSource {
            binding: self.access.binding.clone(),
            control: view.state.controls().revision,
            operation: invocation.id().clone(),
            attempt: context.attempt.clone(),
            action: invocation.fingerprint(),
        })
    }

    async fn act(
        &self,
        invocation: Invocation,
        context: InvocationContext,
        recovery: bool,
    ) -> Result<Value> {
        let arguments = object(invocation.arguments())?;
        match self.definition.id.as_str() {
            SPAWN => {
                let name = string(arguments, "name")?;
                let instructions = string(arguments, "instructions")?;
                let child = identity(&self.access.binding, invocation.id())?;
                if let Some(existing) = self
                    .access
                    .host
                    .worker_receipt(&self.access.binding, &child, Some((name, instructions)))
                    .await?
                {
                    return Ok(existing);
                }
                if recovery {
                    return Err(problem(ErrorKind::Unavailable, "worker_not_started"));
                }
                let source = self.source(&invocation, &context, false)?;
                self.access
                    .host
                    .start_worker(source, name, instructions, &self.access.policy)
                    .await
            }
            SEND => {
                let child = SessionId::new(string(arguments, "child")?)?;
                let source = self.source(&invocation, &context, recovery)?;
                self.access
                    .host
                    .send_worker_message(
                        source,
                        child,
                        string(arguments, "text")?.to_owned(),
                        recovery,
                    )
                    .await
            }
            WAIT => {
                let children = arguments["children"].as_array().ok_or_else(invalid)?;
                let ids = children
                    .iter()
                    .map(|id| SessionId::new(id.as_str().ok_or_else(invalid)?))
                    .collect::<Result<Vec<_>>>()?;
                let deadline = context.deadline.map_or_else(
                    || Instant::now() + Duration::from_secs(10),
                    |outer| outer.min(Instant::now() + Duration::from_secs(10)),
                );
                loop {
                    let result = self
                        .access
                        .host
                        .worker_results(&self.access.binding, &ids)
                        .await?;
                    if result["pending"].as_array().is_some_and(Vec::is_empty)
                        || Instant::now() + Duration::from_millis(100) >= deadline
                        || recovery
                    {
                        return Ok(result);
                    }
                    tokio::select! {
                        _ = context.cancellation.cancelled() => return Err(problem(ErrorKind::Unavailable,"worker_wait_cancelled")),
                        _ = tokio::time::sleep(Duration::from_millis(100)) => {}
                    }
                }
            }
            STOP => {
                let child = SessionId::new(string(arguments, "child")?)?;
                let (view, accepted, _) = self
                    .access
                    .host
                    .owned_worker(&self.access.binding, &child)
                    .await?;
                let assignment_turn = accepted
                    .turn
                    .as_ref()
                    .ok_or_else(unavailable)?
                    .binding
                    .turn
                    .clone();
                let input = accepted.input.input.id;
                if let Some(current) = view.current {
                    self.access
                        .host
                        .cancel(child.clone(), current.binding.turn)
                        .await?;
                }
                let processes = self.access.host.processes.clone();
                let accounted = self
                    .access
                    .host
                    .store
                    .inspect_turn_with(child.clone(), assignment_turn.clone(), move |state| {
                        Ok(
                            completion_checks::worker_attempts_accounted(state, &processes)
                                || completion_checks::worker_cleanup_verified(state)?,
                        )
                    })
                    .await?
                    || self
                        .access
                        .host
                        .worker_stop_verified(
                            &self.access.binding,
                            &child,
                            &input,
                            &assignment_turn,
                        )
                        .await?;
                self.access.host.retire_worker_resources(&child).await?;
                let mut result = self
                    .access
                    .host
                    .worker_results(&self.access.binding, std::slice::from_ref(&child))
                    .await?;
                // The stop operation records this correlated cleanup receipt.
                // Later observation can verify it after either owner restarts.
                result["cleanup"] = json!([{"child":child,"input":input,"turn":assignment_turn,"status":if accounted {"verified"} else {"uncertain"}}]);
                if let Some(collected) = result["collected"].as_array_mut() {
                    for entry in collected {
                        entry["resource_status"] =
                            json!(if accounted { "verified" } else { "uncertain" });
                        let (_, accepted, _) = self
                            .access
                            .host
                            .owned_worker(&self.access.binding, &child)
                            .await?;
                        entry["status"] = json!(
                            accepted
                                .turn
                                .and_then(|turn| turn.outcome)
                                .map(|outcome| outcome.status)
                        );
                    }
                }
                Ok(result)
            }
            _ => Err(unavailable()),
        }
    }
}

impl Tool for WorkerTool {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }
    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        let args = object(arguments)?;
        match self.definition.id.as_str() {
            SPAWN => {
                if args.len() != 2 {
                    return Err(invalid());
                }
                let name = string(args, "name")?;
                if name.len() > 128 || name.chars().any(char::is_control) {
                    return Err(invalid());
                }
                grida_agent_master::subagents::validate_assignment(string(args, "instructions")?)
            }
            SEND => {
                if args.len() != 2 || string(args, "text")?.len() > 4096 {
                    return Err(invalid());
                }
                SessionId::new(string(args, "child")?).map(|_| ())
            }
            WAIT => {
                let Some(ids) = args.get("children").and_then(Value::as_array) else {
                    return Err(invalid());
                };
                if args.len() != 1
                    || ids.is_empty()
                    || ids.len() > self.access.policy.max_children()
                {
                    return Err(invalid());
                }
                for id in ids {
                    SessionId::new(id.as_str().ok_or_else(invalid)?)?;
                }
                Ok(())
            }
            STOP => {
                if args.len() != 1 {
                    return Err(invalid());
                }
                SessionId::new(string(args, "child")?).map(|_| ())
            }
            _ => Err(invalid()),
        }
    }
    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move { outcome(self.act(invocation, context, false).await) })
    }
    fn recover(
        &self,
        recovery: InvocationRecovery,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move { outcome(self.act(recovery.invocation, context, true).await) })
    }
}

fn object(arguments: &ToolArguments) -> Result<&serde_json::Map<String, Value>> {
    match arguments {
        ToolArguments::Json(value) => value.as_object().ok_or_else(invalid),
        _ => Err(invalid()),
    }
}
fn string<'a>(object: &'a serde_json::Map<String, Value>, key: &str) -> Result<&'a str> {
    object
        .get(key)
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
        .ok_or_else(invalid)
}
fn invalid() -> Error {
    problem(ErrorKind::InvalidInput, "worker_arguments_invalid")
}
fn unavailable() -> Error {
    problem(ErrorKind::Unsupported, "worker_delegation_unavailable")
}
fn outcome(result: Result<Value>) -> ToolOutcome {
    match result {
        Ok(value) => {
            let truncated = value
                .get("collected")
                .and_then(Value::as_array)
                .is_some_and(|results| {
                    results
                        .iter()
                        .any(|result| result["text_truncated"] == true)
                });
            ToolOutcome {
                status: OutcomeStatus::Succeeded,
                content: Vec::new(),
                structured: Some(value),
                receipt: None,
                truncated,
            }
        }
        Err(error) if error.kind == ErrorKind::Uncertain => ToolOutcome::uncertain(),
        Err(error) => ToolOutcome::failed(&error.code),
    }
}
fn identity(binding: &TurnBinding, operation: &OperationId) -> Result<SessionId> {
    SessionId::new(format!(
        "subagent/{}",
        Fingerprint::of(&(
            "delegated-worker",
            &binding.session,
            &binding.turn,
            operation
        ))?
        .to_hex()
    ))
}

impl Host {
    /// General workers have one assignment, so information belongs in that
    /// assignment's history rather than the reusable-child input queue.
    async fn send_worker_message(
        &self,
        source: OperationClaimSource,
        child: SessionId,
        text: String,
        recovery: bool,
    ) -> Result<Value> {
        let _tree = self.delegation_controls.lock().await;
        let (_, accepted, _) = self.owned_worker(&source.binding, &child).await?;
        let turn = accepted.turn.ok_or_else(unavailable)?.binding.turn;
        let input = ChangeId::new(format!(
            "worker-message/{}",
            Fingerprint::of(&(&source.binding.turn, &source.operation))?.to_hex()
        ))?;
        let message = Message {
            id: MessageId::new(input.as_str())?,
            role: Role::User,
            phase: None,
            content: vec![Content::Text(text.clone())],
            provenance: Provenance {
                source: "worker-parent-message".into(),
                kind: ProvenanceKind::Supplied,
                fingerprint: Some(source.action),
            },
        };
        let expected_grants = grant(&source.binding, SEND)?;
        let expected_definition = definition(SEND)?;
        let expected_arguments = ToolArguments::Json(json!({"child":child,"text":text}));
        let operation = source.operation.clone();
        let action = source.action;
        self.store
            .inspect_turn_with(
                source.binding.session.clone(),
                source.binding.turn.clone(),
                move |state| {
                    let matches = state.operations().get(&operation).is_some_and(|entry| {
                        entry.record.grants == expected_grants
                            && matches!(&entry.record.input, OperationInput::Tool(invocation)
                                if invocation.fingerprint() == action
                                    && invocation.definition() == &expected_definition
                                    && invocation.arguments() == &expected_arguments)
                    });
                    if matches {
                        Ok(())
                    } else {
                        Err(problem(
                            ErrorKind::Conflict,
                            "worker_message_source_changed",
                        ))
                    }
                },
            )
            .await?;

        for _ in 0..4 {
            let expected = message.clone();
            let (recorded, history, count) = self
                .store
                .inspect_turn_with(child.clone(), turn.clone(), move |state| {
                    let mut recorded = None;
                    let mut count = 0;
                    for (index, HistoryRecord::Message(item)) in
                        state.history().records().iter().enumerate()
                    {
                        if item.provenance.source == "worker-parent-message" {
                            count += 1;
                        }
                        if item.id == expected.id {
                            if item != &expected {
                                return Err(problem(
                                    ErrorKind::Conflict,
                                    "worker_message_identity_reused",
                                ));
                            }
                            recorded = Some(HistoryPosition(index as u64 + 1));
                        }
                    }
                    Ok((recorded, state.history().position(), count))
                })
                .await?;
            // The immutable exact history record is the delivery receipt. It
            // remains observable after settlement, cancellation or owner loss.
            if let Some(position) = recorded {
                return Ok(
                    json!({"delivered":{"child":child,"input":input,"turn":turn,"history_position":position,"status":"appended"}}),
                );
            }
            if recovery {
                return Err(problem(
                    ErrorKind::Unavailable,
                    "worker_message_not_delivered",
                ));
            }
            if count >= MAX_MESSAGES {
                return Err(problem(ErrorKind::LimitExceeded, "worker_message_limit"));
            }
            let parent_source = source.clone();
            self.store
                .inspect_turn_with(
                    source.binding.session.clone(),
                    source.binding.turn.clone(),
                    move |state| {
                        if state.binding() != &parent_source.binding
                            || state.outcome().is_some()
                            || !state.controls().admits_work()
                            || state.controls().revision != parent_source.control
                            || !state
                                .operations()
                                .get(&parent_source.operation)
                                .is_some_and(|entry| {
                                    entry.is_running()
                                        && entry.attempts.last().is_some_and(|attempt| {
                                            attempt.id == parent_source.attempt
                                        })
                                })
                        {
                            return Err(problem(ErrorKind::Conflict, "worker_message_not_active"));
                        }
                        Ok(())
                    },
                )
                .await?;
            let view = self.store.inspect(child.clone()).await?;
            self.check_execution(&view).await?;
            let configuration = session_configuration(&view)?;
            configuration
                .subagent
                .as_ref()
                .ok_or_else(unavailable)?
                .require_authority(&self.execution()?.authority.inference.authority)?;
            let current = view
                .current
                .as_ref()
                .filter(|current| current.binding.turn == turn && current.controls.admits_work())
                .ok_or_else(|| problem(ErrorKind::Conflict, "worker_message_not_active"))?;
            match self
                .store
                .control(ControlRequest {
                    id: input.clone(),
                    session: child.clone(),
                    expected_revision: view.revision,
                    action: SessionControl::AppendHistory {
                        turn: turn.clone(),
                        expected: current.controls.revision,
                        expected_history: history,
                        records: vec![HistoryRecord::Message(message.clone())],
                    },
                })
                .await
            {
                Ok(_) => {
                    return Ok(
                        json!({"delivered":{"child":child,"input":input,"turn":turn,"history_position":HistoryPosition(history.0 + 1),"status":"appended"}}),
                    );
                }
                Err(error) if error.kind == ErrorKind::Conflict => continue,
                Err(error) => return Err(error),
            }
        }
        Err(problem(
            ErrorKind::Conflict,
            "worker_message_history_changed",
        ))
    }

    async fn retire_worker_resources(&self, session: &SessionId) -> Result<()> {
        if session_configuration(&self.store.inspect(session.clone()).await?)?
            .worker
            .is_none()
        {
            return Ok(());
        }
        let result = self
            .processes
            .retire(session, Instant::now() + PROCESS_STOP_WAIT)
            .await;
        if result.is_ok() && self.store.inspect(session.clone()).await?.current.is_none() {
            self.processes.release(session);
        }
        result
    }

    pub(super) async fn finish_worker_resources(
        &self,
        session: &SessionId,
        completion: &mut Option<oneshot::Sender<Result<RunResult>>>,
    ) -> Result<()> {
        let mut result = self.retire_worker_resources(session).await;
        if result
            .as_ref()
            .err()
            .is_some_and(|error| error.code == "process_cleanup_pending")
        {
            if let Some(completion) = completion.take() {
                let _ = completion.send(Err(problem(
                    ErrorKind::Uncertain,
                    "process_cleanup_pending",
                )));
            }
            // Keep the native work owner through the barrier, just as finite
            // reviewed commands do. Host shutdown owns the final bound.
            while result
                .as_ref()
                .err()
                .is_some_and(|error| error.code == "process_cleanup_pending")
            {
                result = self.retire_worker_resources(session).await;
            }
        }
        result
    }
    /// Retry irreversible owner retirement through the existing bounded stop
    /// scanner. This is cleanup, never a new provider/tool execution grant.
    pub(super) async fn retire_worker_if_owner_finished(
        &self,
        session: &SessionId,
        turn: &TurnId,
    ) -> Result<()> {
        let view = self.store.inspect(session.clone()).await?;
        let Some(worker) = session_configuration(&view)?.worker else {
            return Ok(());
        };
        let owner = self
            .store
            .inspect_turn(
                worker.source.binding.session.clone(),
                worker.source.binding.turn.clone(),
            )
            .await?;
        if !owner.controls.cancelled && owner.disposition != TurnDisposition::Settled {
            return Ok(());
        }
        let (_, accepted, _) = self.owned_worker(&worker.source.binding, session).await?;
        let Some(current) = accepted.turn.filter(|current| {
            &current.binding.turn == turn
                && current.disposition != TurnDisposition::Settled
                && !current.controls.cancelled
        }) else {
            return Ok(());
        };
        self.store
            .control(ControlRequest {
                id: change_id()?,
                session: session.clone(),
                expected_revision: view.revision,
                action: SessionControl::Turn {
                    turn: turn.clone(),
                    expected: current.controls.revision,
                    directive: agent_kit_core::turn::ControlDirective::Cancel,
                },
            })
            .await?;
        Ok(())
    }

    /// The durable parent control fences later operation claims before this
    /// bounded propagation observes and controls already committed children.
    pub(super) async fn control_workers(
        &self,
        parent: &SessionId,
        turn: &TurnId,
        directive: agent_kit_core::turn::ControlDirective,
    ) -> Result<()> {
        use agent_kit_core::turn::ControlDirective;
        use grida_agent_master::subagents::PauseCause;
        let parent_view = self
            .store
            .inspect_turn(parent.clone(), turn.clone())
            .await?;
        for child in self.worker_ids(&parent_view.binding).await? {
            let mut applied = false;
            for _ in 0..4 {
                let (view, accepted, _) = self.owned_worker(&parent_view.binding, &child).await?;
                let Some(current) = accepted
                    .turn
                    .filter(|turn| turn.disposition != TurnDisposition::Settled)
                else {
                    self.retire_worker_resources(&child).await?;
                    applied = true;
                    break;
                };
                let profile = session_configuration(&view)?
                    .subagent
                    .ok_or_else(unavailable)?;
                let request = ControlRequest {
                    id: change_id()?,
                    session: child.clone(),
                    expected_revision: view.revision,
                    action: SessionControl::Turn {
                        turn: current.binding.turn.clone(),
                        expected: current.controls.revision,
                        directive,
                    },
                };
                let result = if directive == ControlDirective::Pause {
                    self.store
                        .control_turn_with_driver_state(request, move |state| {
                            Ok(profile
                                .set_sponsored_pause(state, PauseCause::Ancestor, true)?
                                .0
                                .value)
                        })
                        .await
                } else {
                    self.store.control(request).await
                };
                match result {
                    Ok(_) => {
                        if directive == ControlDirective::Cancel {
                            self.kick_stopped(child.clone(), current.binding.turn).await;
                            self.retire_worker_resources(&child).await?;
                        }
                        applied = true;
                        break;
                    }
                    Err(error) if error.kind == ErrorKind::Conflict => continue,
                    Err(error) => return Err(error),
                }
            }
            if !applied {
                return Err(problem(ErrorKind::Conflict, "worker_tree_control_changed"));
            }
        }
        Ok(())
    }

    pub(super) async fn resume_workers(&self, parent: &SessionId, turn: &TurnId) -> Result<()> {
        use grida_agent_master::subagents::PauseCause;
        let parent_view = self
            .store
            .inspect_turn(parent.clone(), turn.clone())
            .await?;
        if !parent_view.controls.admits_work()
            || parent_view.disposition == TurnDisposition::Settled
        {
            return Ok(());
        }
        for child in self.worker_ids(&parent_view.binding).await? {
            let (view, accepted, _) = self.owned_worker(&parent_view.binding, &child).await?;
            let Some(current) = accepted.turn.filter(|turn| {
                turn.disposition != TurnDisposition::Settled && !turn.controls.cancelled
            }) else {
                continue;
            };
            let profile = session_configuration(&view)?
                .subagent
                .ok_or_else(unavailable)?;
            if !profile
                .sponsored_pause(&view.driver_state)?
                .held_by_ancestor()
            {
                continue;
            }
            let (change, pause) =
                profile.set_sponsored_pause(&view.driver_state, PauseCause::Ancestor, false)?;
            if pause.effective() {
                self.store
                    .control(ControlRequest {
                        id: change_id()?,
                        session: child,
                        expected_revision: view.revision,
                        action: SessionControl::DriverState {
                            change,
                            turn: Some(agent_kit_sessions::TurnControl {
                                turn: current.binding.turn.clone(),
                                expected: current.controls.revision,
                                directive: agent_kit_core::turn::ControlDirective::Pause,
                            }),
                        },
                    })
                    .await?;
                continue;
            }
            // Reserve bounded readiness before clearing the durable blocker.
            // A full queue must leave the child paused for an exact retry.
            let mut work = self.work.lock().await;
            work.check_sponsored_capacity(&child)?;
            let receipt = self
                .store
                .control(ControlRequest {
                    id: change_id()?,
                    session: child.clone(),
                    expected_revision: view.revision,
                    action: SessionControl::DriverState {
                        change,
                        turn: Some(agent_kit_sessions::TurnControl {
                            turn: current.binding.turn.clone(),
                            expected: current.controls.revision,
                            directive: agent_kit_core::turn::ControlDirective::Resume,
                        }),
                    },
                })
                .await?;
            let wake = sponsorship::SponsoredWake::from_receipt(&receipt)?;
            work.queue_sponsored(wake);
        }
        // Queue readiness only. The public Resume path drains it after its
        // parent admission/receipt is committed; a private claim helper must
        // not start unrelated ready work or retain a new execution owner.
        Ok(())
    }

    pub(super) async fn stop_workers_after_turn(
        &self,
        parent: &SessionId,
        turn: &TurnId,
    ) -> Result<()> {
        let _tree = self.delegation_controls.lock().await;
        let cleanup = self
            .control_workers(parent, turn, agent_kit_core::turn::ControlDirective::Cancel)
            .await;
        let owner = self
            .store
            .inspect_turn(parent.clone(), turn.clone())
            .await?;
        if owner.disposition == TurnDisposition::Settled || owner.controls.cancelled {
            for child in self.worker_ids(&owner.binding).await? {
                self.processes.forget_attempts(&child);
            }
        }
        cleanup
    }

    pub(super) async fn reconcile_worker_owner(&self, input: &Submission) -> Result<bool> {
        let stored: StoredPrompt = decode_input(input)?;
        let worker = stored.worker.as_ref().ok_or_else(unavailable)?;
        let _tree = self.delegation_controls.lock().await;
        let parent = &worker.source.binding.session;
        let turn = &worker.source.binding.turn;
        let owner = self
            .store
            .inspect_turn(parent.clone(), turn.clone())
            .await?;
        if owner.controls.cancelled || owner.disposition == TurnDisposition::Settled {
            self.control_workers(parent, turn, agent_kit_core::turn::ControlDirective::Cancel)
                .await?;
            return Ok(false);
        }
        if owner.controls.paused {
            self.control_workers(parent, turn, agent_kit_core::turn::ControlDirective::Pause)
                .await?;
            return Ok(false);
        }
        self.resume_workers(parent, turn).await?;
        Ok(true)
    }

    pub(super) fn capture_delegation(
        &self,
        regime: OperatingRegime,
        child: bool,
        goal: bool,
        side: bool,
    ) -> Result<Option<Policy>> {
        if !self.subagents_enabled
            || !regime.is_act()
            || child
            || goal
            || side
            || self.inference_only
            || !self
                .execution()?
                .provider
                .capabilities(&self.execution()?.config.model)?
                .json_tools
        {
            return Ok(None);
        }
        let binding = TurnBinding {
            session: SessionId::new("capture")?,
            turn: TurnId::new("capture")?,
            epoch: 1,
        };
        let offers = [SPAWN, SEND, WAIT, STOP]
            .into_iter()
            .map(|id| definition(id)?.offer())
            .collect::<Result<Vec<_>>>()?;
        let grants = [SPAWN, SEND, WAIT, STOP]
            .into_iter()
            .map(|id| Ok((ToolId::new(id)?, grant(&binding, id)?)))
            .collect::<Result<_>>()?;
        let policy = Policy::capture(&offers, &grants)?;
        policy.total_generation_steps(self.execution()?.config.max_steps)?;
        Ok(Some(policy))
    }

    async fn worker_parent(&self, parent: &SessionId, turn: &TurnId) -> Result<StoredPrompt> {
        let inputs = self
            .store
            .turn_submissions(parent.clone(), turn.clone())
            .await?;
        match inputs.as_slice() {
            [input] if is_stored_input(&input.payload) => decode_input(input),
            _ => Err(unavailable()),
        }
    }

    fn worker_prompt(
        &self,
        mut captured: StoredPrompt,
        source: OperationClaimSource,
        name: &str,
        instructions: &str,
    ) -> Result<StoredPrompt> {
        let policy = captured.delegation.as_ref().ok_or_else(unavailable)?;
        if captured.subagent.is_some()
            || captured.goal.is_some()
            || !captured.operating_regime.is_act()
        {
            return Err(unavailable());
        }
        captured.max_steps = Some(policy.child_generation_steps());
        captured.parts = vec![PromptPart::Text {
            text: instructions.to_owned(),
        }];
        captured.effort = None;
        captured.delegation = None;
        captured.worker = Some(Worker {
            source: source.clone().into(),
            name: name.to_owned(),
        });
        captured.subagent = Some(Assignment::new(source.binding.turn));
        captured.questions = false;
        captured.allow_wakeups = false;
        captured.allow_library_selection = false;
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
        captured.completion_checks = Some(completion_checks::worker_checks(
            captured.completion_checks.take(),
        )?);
        // The parent's immutable guidance/skill listing and permission profile
        // are retained; no new host discovery or permission capture is issued.
        validate_worker_shape(&captured)?;
        Ok(captured)
    }

    async fn worker_claim(
        &self,
        source: OperationClaimSource,
        name: &str,
        instructions: &str,
        policy: &Policy,
    ) -> Result<OperationClaim> {
        grida_agent_master::subagents::validate_assignment(instructions)?;
        self.verify_worker_source(&source, name, instructions)
            .await?;
        let parent = self.store.inspect(source.binding.session.clone()).await?;
        self.check_execution(&parent).await?;
        let parent_prompt = self
            .worker_parent(&source.binding.session, &source.binding.turn)
            .await?;
        if parent_prompt.delegation.as_ref() != Some(policy) {
            return Err(unavailable());
        }
        let children = self.worker_ids(&source.binding).await?;
        if children.len() >= policy.max_children() {
            return Err(problem(
                ErrorKind::LimitExceeded,
                "worker_allocation_exhausted",
            ));
        }
        let child = identity(&source.binding, &source.operation)?;
        let mut config = session_configuration(&parent)?;
        let captured = self.worker_prompt(parent_prompt, source.clone(), name, instructions)?;
        let sponsor = Sponsorship {
            parent_turn: source.binding.turn.clone(),
            operation: source.operation.clone(),
            admission: Some(Fingerprint::of(&source)?),
            attempt: Some(source.attempt.clone()),
        };
        let profile = Profile::sponsored(
            source.binding.session.clone(),
            name.to_owned(),
            sponsor,
            &self.execution()?.authority.inference.authority,
        )?;
        let driver_state = profile.reserve(&Default::default())?;
        config.subagent = Some(profile);
        config.worker = captured.worker.clone();
        Ok(OperationClaim {
            source,
            create: CreateSession {
                id: child.clone(),
                request: ChangeId::new("worker-create")?,
                configuration: encode(SESSION_SCHEMA, SESSION_VERSION, &config)?,
            },
            claim: ClaimRequest {
                id: ChangeId::new("worker-claim")?,
                session: child.clone(),
                expected_revision: SessionRevision(0),
                selection: TurnSelection::New {
                    turn: TurnId::new(TURN)?,
                    inputs: vec![ChangeId::new(INPUT)?],
                },
            },
            input: Submission {
                id: ChangeId::new(INPUT)?,
                payload: encode_stored_prompt(&captured)?,
            },
            driver_state,
        })
    }

    async fn start_worker(
        &self,
        source: OperationClaimSource,
        name: &str,
        instructions: &str,
        policy: &Policy,
    ) -> Result<Value> {
        let _admission = self.configuration_admission.lock().await;
        let parent = source.binding.clone();
        let request = self
            .worker_claim(source, name, instructions, policy)
            .await?;
        let child = request.claim.session.clone();
        let ticket = {
            let mut work = self.work.lock().await;
            self.register(
                &mut work,
                child.clone(),
                TurnId::new(TURN)?,
                Launch::Delegated(Box::new(request)),
            )?
        };
        // Keep the profile/roster gate until admission has committed; concurrent
        // spawn operations cannot all observe the same remaining allocation.
        ticket
            .admission
            .await
            .map_err(|_| problem(ErrorKind::Uncertain, "worker_admission_interrupted"))??;
        drop(_admission);
        self.worker_receipt(&parent, &child, Some((name, instructions)))
            .await?
            .ok_or_else(|| problem(ErrorKind::Uncertain, "worker_admission_missing"))
    }

    pub(super) async fn admit_delegated(
        &self,
        request: OperationClaim,
    ) -> Result<Option<Admitted>> {
        let execution = self.execution()?;
        let config = decode_session_configuration(&request.create.configuration)?;
        let profile = config.subagent.as_ref().ok_or_else(unavailable)?;
        profile.require_authority(&execution.authority.inference.authority)?;
        let session = request.claim.session.clone();
        let turn = TurnId::new(TURN)?;
        let prepared = self.prepare_input(
            execution,
            &session,
            &request.input,
            Some(profile),
            false,
            InputAuthority::RequireCaptured,
        )?;
        let history = history::PriorContext {
            messages: Vec::new(),
            disclosure: None,
        };
        let ClaimOutcome::Acquired(claim) = self.store.claim_from_operation(request).await? else {
            return Ok(None);
        };
        self.compose_admitted(
            execution, &session, &turn, config.cwd, claim, prepared, history, None, false, None,
        )
        .await
    }

    async fn owned_worker(
        &self,
        parent: &TurnBinding,
        child: &SessionId,
    ) -> Result<(
        SessionView,
        agent_kit_store_sqlite::InputObservation,
        StoredPrompt,
    )> {
        let (view, accepted) = self
            .store
            .inspect_with_input(child.clone(), ChangeId::new(INPUT)?)
            .await?;
        let accepted = accepted.ok_or_else(unavailable)?;
        let stored: StoredPrompt = decode_input(&accepted.input.input)?;
        let worker = stored.worker.as_ref().ok_or_else(unavailable)?;
        if worker.source.binding.session != parent.session
            || worker.source.binding.turn != parent.turn
            || identity(parent, &worker.source.operation)? != *child
        {
            return Err(unavailable());
        }
        let turn = accepted
            .turn
            .as_ref()
            .ok_or_else(unavailable)?
            .binding
            .turn
            .clone();
        self.require_worker_origin(child, &turn, &accepted.input.input)
            .await?;
        Ok((view, accepted, stored))
    }

    pub(super) async fn require_worker_origin(
        &self,
        session: &SessionId,
        turn: &TurnId,
        input: &Submission,
    ) -> Result<()> {
        let stored: StoredPrompt = decode_input(input)?;
        let worker = stored.worker.as_ref().ok_or_else(unavailable)?;
        if session_configuration(&self.store.inspect(session.clone()).await?)?
            .worker
            .as_ref()
            != Some(worker)
        {
            return Err(problem(ErrorKind::Conflict, "worker_profile_changed"));
        }
        let expected = self.worker_prompt(
            self.worker_parent(&worker.source.binding.session, &worker.source.binding.turn)
                .await?,
            worker.source.claim(),
            &worker.name,
            match stored.parts.as_slice() {
                [PromptPart::Text { text }] => text,
                _ => return Err(unavailable()),
            },
        )?;
        if encode_stored_prompt(&expected)? != input.payload {
            return Err(problem(ErrorKind::Conflict, "worker_capture_changed"));
        }
        let [PromptPart::Text { text }] = stored.parts.as_slice() else {
            return Err(unavailable());
        };
        self.verify_worker_source(&worker.source.claim(), &worker.name, text)
            .await?;
        let session = session.clone();
        let turn = turn.clone();
        let committed = self
            .store
            .inspect_operation_claim_with(
                worker.source.binding.session.clone(),
                worker.source.binding.turn.clone(),
                vec![worker.source.operation.clone()],
                move |state| Ok(state.binding().session == session && state.binding().turn == turn),
            )
            .await?;
        if committed != Some(true) {
            return Err(problem(ErrorKind::Unavailable, "worker_origin_unavailable"));
        }
        Ok(())
    }

    async fn verify_worker_source(
        &self,
        source: &OperationClaimSource,
        name: &str,
        instructions: &str,
    ) -> Result<()> {
        let operation = source.operation.clone();
        let attempt = source.attempt.clone();
        let action = source.action;
        let grants = grant(&source.binding, SPAWN)?;
        let definition = definition(SPAWN)?;
        let arguments = ToolArguments::Json(json!({"name":name,"instructions":instructions}));
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
                    if matches {
                        Ok(())
                    } else {
                        Err(problem(ErrorKind::Conflict, "worker_source_changed"))
                    }
                },
            )
            .await
    }

    async fn worker_receipt(
        &self,
        parent: &TurnBinding,
        child: &SessionId,
        expected: Option<(&str, &str)>,
    ) -> Result<Option<Value>> {
        let (view, accepted, stored) = match self.owned_worker(parent, child).await {
            Ok(value) => value,
            Err(error) if error.code == "session_missing" => return Ok(None),
            Err(error) => return Err(error),
        };
        let worker = stored.worker.as_ref().ok_or_else(unavailable)?;
        if let Some((name, instructions)) = expected
            && (worker.name != name
                || !matches!(stored.parts.as_slice(),[PromptPart::Text{text}] if text==instructions))
        {
            return Err(problem(ErrorKind::Conflict, "worker_assignment_changed"));
        }
        let turn = accepted.turn.ok_or_else(unavailable)?;
        Ok(Some(
            json!({"assignment":{"child":view.session,"input":accepted.input.input.id,"turn":turn.binding.turn},"name":worker.name,"max_generation_steps":stored.max_steps}),
        ))
    }

    pub(super) async fn worker_ids(&self, parent: &TurnBinding) -> Result<Vec<SessionId>> {
        let selected = grant(parent, SPAWN)?;
        let operations = self
            .store
            .inspect_turn_with(parent.session.clone(), parent.turn.clone(), move |state| {
                Ok(state
                    .operations()
                    .iter()
                    .filter(|(_, entry)| {
                        entry.record.grants == selected
                            && matches!(&entry.record.input, OperationInput::Tool(invocation)
                                if invocation.definition().id.as_str() == SPAWN)
                    })
                    .map(|(id, _)| id.clone())
                    .collect::<Vec<_>>())
            })
            .await?;
        let mut children = Vec::new();
        for operation in operations {
            let child = identity(parent, &operation)?;
            match self.owned_worker(parent, &child).await {
                Ok(_) => children.push(child),
                Err(error) if error.code == "session_missing" => {}
                Err(error) => return Err(error),
            }
        }
        Ok(children)
    }

    async fn worker_results(&self, parent: &TurnBinding, children: &[SessionId]) -> Result<Value> {
        let mut collected = Vec::new();
        let mut pending = Vec::new();
        for child in children {
            let (_, accepted, _) = self.owned_worker(parent, child).await?;
            let turn = accepted.turn.ok_or_else(unavailable)?;
            let assignment =
                json!({"child":child,"input":accepted.input.input.id,"turn":turn.binding.turn});
            let cleanup_active = self.work.lock().await.active.contains_key(child);
            if turn.disposition == TurnDisposition::Settled
                && cleanup_active
                && turn
                    .outcome
                    .as_ref()
                    .is_some_and(|outcome| outcome.status == OutcomeStatus::Succeeded)
            {
                let mut result = assignment;
                result["status"] = json!("cleanup_pending");
                pending.push(result);
            } else if turn.disposition == TurnDisposition::Settled {
                let (text, mut cleanup_verified) = self
                    .store
                    .inspect_turn_with(child.clone(), turn.binding.turn.clone(), |state| {
                        let text = state
                            .outcome()
                            .and_then(|outcome| outcome.account.as_ref())
                            .and_then(|account| grida_agent_master::read_account(account).ok())
                            .map(|account| account.text)
                            .unwrap_or_default();
                        Ok((text, completion_checks::worker_cleanup_verified(state)?))
                    })
                    .await?;
                if !cleanup_verified {
                    cleanup_verified = self
                        .worker_stop_verified(
                            parent,
                            child,
                            &accepted.input.input.id,
                            &turn.binding.turn,
                        )
                        .await?;
                }
                let text_truncated = text.len() > RESULT_BYTES;
                let mut text = text;
                if text_truncated {
                    let mut end = RESULT_BYTES;
                    while !text.is_char_boundary(end) {
                        end -= 1
                    }
                    text.truncate(end);
                }
                let mut result = assignment;
                result["disposition"] = json!("settled");
                let recorded = turn.outcome.as_ref().map(|outcome| outcome.status);
                let unverified =
                    cleanup_active || self.processes.cleanup_unverified(child) || !cleanup_verified;
                result["status"] = json!(recorded);
                result["resource_status"] =
                    json!(if unverified { "uncertain" } else { "verified" });
                result["text"] = json!(text);
                result["text_truncated"] = json!(text_truncated);
                collected.push(result);
            } else {
                let mut result = assignment;
                result["status"] = json!(match turn.disposition {
                    TurnDisposition::Interrupted => "interrupted",
                    TurnDisposition::Suspended => "suspended",
                    _ if turn.controls.paused => "paused",
                    _ => "running",
                });
                pending.push(result);
            }
        }
        Ok(json!({"collected":collected,"pending":pending}))
    }

    async fn worker_stop_verified(
        &self,
        parent: &TurnBinding,
        child: &SessionId,
        input: &ChangeId,
        turn: &TurnId,
    ) -> Result<bool> {
        let expected = grant(parent, STOP)?;
        let definition = definition(STOP)?;
        let child = child.clone();
        let input = input.clone();
        let turn = turn.clone();
        self.store.inspect_turn_with(parent.session.clone(),parent.turn.clone(),move|state|{
            Ok(state.operations().values().any(|operation|{
                if operation.record.grants!=expected {return false}
                let OperationInput::Tool(invocation)=&operation.record.input else {return false};
                if invocation.definition()!=&definition || !matches!(invocation.arguments(),ToolArguments::Json(arguments) if arguments["child"]==child.as_str()) {return false}
                let Some(agent_kit_core::turn::OperationOutcome::Tool(outcome))=operation.outcome() else {return false};
                outcome.status==OutcomeStatus::Succeeded && outcome.structured.as_ref().and_then(|value|value["cleanup"].as_array()).is_some_and(|proofs|proofs.iter().any(|proof|proof["child"]==child.as_str()&&proof["input"]==input.as_str()&&proof["turn"]==turn.as_str()&&proof["status"]=="verified"))
            }))
        }).await
    }
}

#[cfg(all(test, any(target_os = "macos", target_os = "linux")))]
mod tests;
