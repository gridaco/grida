//! GRIDA-SEC-004 — Reviewed native completion check with private turn authority.

use super::*;
use crate::command::{CommandSupervisor, project_process};
use crate::permissions::{ReviewedHookCommand, TurnPermissions};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{
    InventorySnapshot, Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition,
    ToolOutcome,
};
use agent_kit_core::turn::TurnBinding;
use agent_kit_core::{GrantId, ToolId};
use agent_kit_sandbox::{ProcessEvidence, StopReason};
use grida_agent_master::hooks::{
    CheckInvocation, CheckMode, CompletionCheck, CompletionChecks, HandlerReply,
};
use serde_json::json;

const CHECK: &str = "require-completion-text";
const TOOL: &str = "require_completion_text";
const COMMAND_CHECK: &str = "before-completion-command";
const COMMAND_TOOL: &str = "before_completion_command";
pub(super) const WORKER_CHECK: &str = "worker-process-cleanup";
const WORKER_TOOL: &str = "retire_worker_processes";
pub(super) const COMMAND_MAX_OUTPUT: usize = 4 * 1024;

pub(super) fn worker_checks(checks: Option<CompletionChecks>) -> Result<CompletionChecks> {
    checks
        .unwrap_or(CompletionChecks::new(Vec::new())?)
        .with_check(worker_selection()?)
}

fn worker_selection() -> Result<CompletionCheck> {
    let definition = worker_definition()?;
    Ok(CompletionCheck {
        id: BindingId::new(WORKER_CHECK)?,
        revision: Fingerprint::of(&definition)?,
        handler: definition.id,
        mode: CheckMode::Required,
    })
}

pub(super) fn worker_definition() -> Result<ToolDefinition> {
    Ok(ToolDefinition {
        id: ToolId::new(WORKER_TOOL)?,
        version: 1,
        description:
            "Stop and account for processes owned by this worker assignment before completing."
                .into(),
        input: InputFormat::Json(json!({"type":"object"})),
        max_input_bytes: 32 * 1024,
        max_output_bytes: 1024,
        // Missing evidence after owner loss is uncertainty, never proof that
        // a new, empty process map verified an older cleanup attempt.
        recovery: RecoveryKind::Unavailable,
    })
}

/// A new process map is not cleanup evidence. Successful collection requires
/// the exact private check's allowed, durably recorded tool outcome.
pub(super) fn worker_cleanup_verified(state: &agent_kit_core::turn::TurnState) -> Result<bool> {
    // A failed/cancelled assignment that never dispatched the sole native
    // process-launch capability has a durable proof of no owned processes.
    // Successful assignments still require their mandatory recorded check.
    let succeeded = state
        .outcome()
        .is_some_and(|outcome| outcome.status == OutcomeStatus::Succeeded);
    let dispatched=state.operations().values().any(|operation| !operation.attempts.is_empty()
        && matches!(&operation.record.input,agent_kit_core::turn::OperationInput::Tool(invocation) if invocation.definition().id.as_str()==crate::processes::EXEC_COMMAND));
    if !succeeded && !dispatched {
        return Ok(true);
    }
    let selected = worker_selection()?;
    let definition = worker_definition()?;
    let expected = completion_grant(state.binding(), &selected)?;
    let Some(account) = state
        .outcome()
        .and_then(|outcome| outcome.account.as_ref())
        .and_then(|account| grida_agent_master::read_account(account).ok())
    else {
        return Ok(false);
    };
    for evidence in account.completion_checks {
        if evidence.check != selected.id
            || evidence.revision != selected.revision
            || evidence.status != grida_agent_master::hooks::CheckStatus::Allowed
        {
            continue;
        }
        let Some(operation) = evidence
            .operation
            .and_then(|id| state.operations().get(&id))
        else {
            continue;
        };
        if operation.record.grants != expected {
            continue;
        }
        let agent_kit_core::turn::OperationInput::Tool(invocation) = &operation.record.input else {
            continue;
        };
        if invocation.definition() != &definition {
            continue;
        }
        let Ok(event) = CheckInvocation::read(invocation.arguments()) else {
            continue;
        };
        if event.check != selected
            || event.occurrence.session != state.binding().session
            || event.occurrence.turn != state.binding().turn
            || event.occurrence.history_position != state.history().position()
        {
            continue;
        }
        let Some(agent_kit_core::turn::OperationOutcome::Tool(outcome)) = operation.outcome()
        else {
            continue;
        };
        if outcome.status == OutcomeStatus::Succeeded
            && outcome.structured.as_ref().is_some_and(|value| {
                matches!(
                    serde_json::from_value::<HandlerReply>(value.clone()),
                    Ok(HandlerReply::Allow {})
                )
            })
        {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Each physical process attempt is either known to this native owner or has
/// its own durable cleanup receipt. A later launch cannot hide an older one.
pub(super) fn worker_attempts_accounted(
    state: &agent_kit_core::turn::TurnState,
    processes: &crate::processes::ProcessSessions,
) -> bool {
    state.operations().values().filter(|operation|matches!(&operation.record.input,agent_kit_core::turn::OperationInput::Tool(invocation) if invocation.definition().id.as_str()==crate::processes::EXEC_COMMAND))
        .all(|operation|operation.attempts.iter().all(|attempt|processes.knows_attempt(&state.binding().session,&attempt.id)
            || matches!(&attempt.outcome,Some(agent_kit_core::turn::OperationOutcome::Tool(outcome)) if outcome.structured.as_ref().is_some_and(|value|value["cleanup_verified"]==true))))
}

fn completion_grant(binding: &TurnBinding, check: &CompletionCheck) -> Result<GrantSelection> {
    let fingerprint = Fingerprint::of(&(&binding.session, &binding.turn, check))?;
    let id = uuid::Uuid::from_bytes(
        fingerprint.bytes()[..16]
            .try_into()
            .expect("fingerprint prefix"),
    );
    Ok(GrantSelection {
        authority: AuthorityBinding {
            principal: PrincipalId::new("grida-local")?,
            binding: BindingId::new(format!("completion-check/{id}"))?,
            scope: ScopeId::new("completion-check")?,
        },
        grants: vec![GrantId::new(check.id.as_str())?],
    })
}

impl Host {
    /// Require a nonempty answer on newly accepted conversational work.
    pub fn with_required_completion_text(mut self) -> Self {
        self.require_completion_text = true;
        self
    }

    pub(super) fn capture_completion_checks(
        &self,
        operating_regime: OperatingRegime,
    ) -> Result<Option<CompletionChecks>> {
        let mut checks = Vec::new();
        if self.require_completion_text {
            checks.push(selection(&definition()?)?);
        }
        if let Some(hook) = self.completion_hook(operating_regime) {
            checks.push(command_selection(hook, &command_definition()?)?);
        }
        (!checks.is_empty())
            .then(|| CompletionChecks::new(checks))
            .transpose()
    }

    pub(super) fn completion_hook(
        &self,
        operating_regime: OperatingRegime,
    ) -> Option<&ReviewedHookCommand> {
        self.permissions
            .as_ref()
            .filter(|_| operating_regime.is_act())
            .and_then(|profile| profile.completion_hook())
    }
}

pub(super) struct CompletionAccess(Vec<Arc<CompletionHandler>>);

impl CompletionAccess {
    pub(super) fn bind(
        host: &Host,
        binding: &TurnBinding,
        operating_regime: OperatingRegime,
        permissions: Option<&Arc<TurnPermissions>>,
        command: Option<&Arc<CommandSupervisor>>,
        worker: bool,
    ) -> Result<Arc<Self>> {
        let mut handlers = Vec::new();
        if host.require_completion_text {
            let definition = definition()?;
            handlers.push(CompletionHandler::bind(
                binding,
                selection(&definition)?,
                definition,
                Handler::Text,
            )?);
        }
        if let Some(hook) = host.completion_hook(operating_regime) {
            let definition = command_definition()?;
            let check = command_selection(hook, &definition)?;
            handlers.push(CompletionHandler::bind(
                binding,
                check,
                definition,
                Handler::Command {
                    hook: hook.clone(),
                    permissions: permissions.cloned().ok_or_else(unavailable)?,
                    command: command.cloned().ok_or_else(unavailable)?,
                },
            )?);
        }
        if worker {
            handlers.push(CompletionHandler::bind(
                binding,
                worker_selection()?,
                worker_definition()?,
                Handler::WorkerProcesses {
                    processes: host.processes.clone(),
                    store: host.store.clone(),
                },
            )?);
        }
        Ok(Arc::new(Self(handlers)))
    }

    pub(super) fn handles(&self, selection: &GrantSelection) -> bool {
        self.0.iter().any(|handler| &handler.grant == selection)
    }

    pub(super) fn inventory(&self) -> Result<InventorySnapshot> {
        let mut inventory = Inventory::new();
        let mut selected = Vec::new();
        for handler in &self.0 {
            inventory.insert(handler.clone())?;
            selected.push(handler.definition.id.clone());
        }
        inventory.snapshot(&selected)
    }

    pub(super) fn grants(&self) -> BTreeMap<BindingId, GrantSelection> {
        self.0
            .iter()
            .map(|handler| (handler.check.id.clone(), handler.grant.clone()))
            .collect()
    }
}

impl ToolGate for CompletionAccess {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
            self.0
                .iter()
                .find(|handler| handler.grant == admission.grants)
                .ok_or_else(unavailable)?
                .admit(admission, context)
        })
    }
}

enum Handler {
    Text,
    WorkerProcesses {
        processes: Arc<crate::processes::ProcessSessions>,
        store: Arc<SqliteStore>,
    },
    Command {
        hook: ReviewedHookCommand,
        permissions: Arc<TurnPermissions>,
        command: Arc<CommandSupervisor>,
    },
}

struct CompletionHandler {
    binding: TurnBinding,
    check: CompletionCheck,
    grant: GrantSelection,
    definition: ToolDefinition,
    handler: Handler,
}

impl CompletionHandler {
    fn bind(
        binding: &TurnBinding,
        check: CompletionCheck,
        definition: ToolDefinition,
        handler: Handler,
    ) -> Result<Arc<Self>> {
        let grant = completion_grant(binding, &check)?;
        Ok(Arc::new(Self {
            binding: binding.clone(),
            grant,
            check,
            definition,
            handler,
        }))
    }

    fn event(&self, arguments: &ToolArguments) -> Result<CheckInvocation> {
        let event = CheckInvocation::read(arguments)?;
        if event.check != self.check
            || event.occurrence.session != self.binding.session
            || event.occurrence.turn != self.binding.turn
        {
            return Err(unavailable());
        }
        Ok(event)
    }

    fn admit(&self, admission: ToolAdmission, context: AdmissionContext) -> Result<ToolDecision> {
        let event = self.event(admission.invocation.arguments())?;
        let view = context.operations.view();
        if admission.invocation.definition() != &self.definition
            || admission.invocation.id() != &admission.operation
            || view.state.binding() != &self.binding
            || !view.state.controls().admits_work()
            || view.state.history().position() != event.occurrence.history_position
        {
            return Err(unavailable());
        }
        Ok(ToolDecision::Permit)
    }
}

impl Tool for CompletionHandler {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        self.event(arguments).map(|_| ())
    }

    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            let event = match self.event(invocation.arguments()) {
                Ok(event) => event,
                Err(error) => return ToolOutcome::failed(&error.code),
            };
            if let Handler::WorkerProcesses { processes, store } = &self.handler {
                let owner = processes.clone();
                let accounted = store
                    .inspect_turn_with(
                        self.binding.session.clone(),
                        self.binding.turn.clone(),
                        move |state| Ok(worker_attempts_accounted(state, &owner)),
                    )
                    .await
                    .unwrap_or(false);
                let deadline = context
                    .deadline
                    .unwrap_or_else(|| std::time::Instant::now() + PROCESS_STOP_WAIT)
                    .min(std::time::Instant::now() + PROCESS_STOP_WAIT);
                return match processes.retire(&self.binding.session, deadline).await {
                    Ok(()) if accounted => {
                        // A changed proposal or steering can require more work.
                        // The next completion candidate runs this check again.
                        processes.continue_after_retirement(&self.binding.session);
                        ToolOutcome {
                            status: OutcomeStatus::Succeeded,
                            content: Vec::new(),
                            structured: Some(json!(HandlerReply::Allow {})),
                            receipt: None,
                            truncated: false,
                        }
                    }
                    Ok(()) => ToolOutcome::uncertain(),
                    Err(error) => ToolOutcome {
                        status: OutcomeStatus::Uncertain,
                        content: vec![ResultContent::Text(error.code)],
                        structured: None,
                        receipt: None,
                        truncated: false,
                    },
                };
            }
            if let Handler::Command {
                hook,
                permissions,
                command,
            } = &self.handler
            {
                let maximum = context.max_output_bytes.min(COMMAND_MAX_OUTPUT);
                let stdin = match serde_json::to_vec(&event.occurrence) {
                    Ok(stdin) if stdin.len() <= self.definition.max_input_bytes => stdin,
                    _ => return ToolOutcome::failed("completion_hook_event_limit"),
                };
                let reviewed =
                    match permissions.review_hook_command(hook, self.grant.clone(), stdin, maximum)
                    {
                        Ok(reviewed) => reviewed,
                        Err(error) => return ToolOutcome::failed(&error.code),
                    };
                return command
                    .invoke_reviewed(&invocation, context, reviewed, project_completion)
                    .await;
            }
            let reply = if event.occurrence.has_text {
                HandlerReply::Allow {}
            } else {
                HandlerReply::Deny {
                    reason: "The completed response has no answer text.".into(),
                }
            };
            ToolOutcome {
                status: OutcomeStatus::Succeeded,
                content: Vec::new(),
                structured: Some(json!(reply)),
                receipt: None,
                truncated: false,
            }
        })
    }
}

fn project_completion(evidence: ProcessEvidence, maximum: usize) -> (ToolOutcome, bool) {
    project_hook(
        evidence,
        maximum,
        "completion_hook_timed_out",
        "completion_hook_output_limit",
    )
}

pub(super) fn project_hook(
    evidence: ProcessEvidence,
    maximum: usize,
    timeout_code: &str,
    output_code: &str,
) -> (ToolOutcome, bool) {
    let limit = match evidence.stopped {
        Some(StopReason::Deadline) => Some(timeout_code),
        Some(StopReason::OutputLimit) => Some(output_code),
        _ => None,
    };
    let reply = (!evidence.output_truncated)
        .then(|| serde_json::from_slice::<HandlerReply>(&evidence.stdout).ok())
        .flatten();
    let (mut outcome, verified) = project_process(evidence, maximum, false);
    if matches!(
        outcome.status,
        OutcomeStatus::Failed | OutcomeStatus::Uncertain
    ) && let Some(limit) = limit
    {
        outcome.content.push(ResultContent::Text(limit.into()));
    }
    outcome.structured = if outcome.status == OutcomeStatus::Succeeded {
        reply.and_then(|reply| serde_json::to_value(reply).ok())
    } else {
        None
    };
    (outcome, verified)
}

fn definition() -> Result<ToolDefinition> {
    Ok(ToolDefinition {
        id: ToolId::new(TOOL)?,
        // A behavior change also changes the captured handler revision.
        version: 1,
        description: "Require nonempty answer text before completing the task.".into(),
        input: InputFormat::Json(json!({"type": "object"})),
        max_input_bytes: 32 * 1024,
        max_output_bytes: 1024,
        recovery: RecoveryKind::Unavailable,
    })
}

fn selection(definition: &ToolDefinition) -> Result<CompletionCheck> {
    Ok(CompletionCheck {
        id: BindingId::new(CHECK)?,
        revision: Fingerprint::of(definition)?,
        handler: definition.id.clone(),
        mode: CheckMode::Required,
    })
}

fn command_definition() -> Result<ToolDefinition> {
    Ok(ToolDefinition {
        id: ToolId::new(COMMAND_TOOL)?,
        version: 1,
        description: "Run the reviewed before-completion command.".into(),
        input: InputFormat::Json(json!({"type": "object"})),
        max_input_bytes: 32 * 1024,
        max_output_bytes: COMMAND_MAX_OUTPUT,
        recovery: RecoveryKind::Unavailable,
    })
}

fn command_selection(
    hook: &ReviewedHookCommand,
    definition: &ToolDefinition,
) -> Result<CompletionCheck> {
    Ok(CompletionCheck {
        id: BindingId::new(COMMAND_CHECK)?,
        revision: Fingerprint::of(&(hook.revision, definition))?,
        handler: definition.id.clone(),
        mode: hook.mode,
    })
}

fn unavailable() -> Error {
    problem(
        ErrorKind::Unavailable,
        "completion_check_authority_unavailable",
    )
}
