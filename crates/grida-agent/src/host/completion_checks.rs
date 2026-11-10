//! GRIDA-SEC-004 — Reviewed native completion check with private turn authority.

use super::*;
use crate::command::{CommandTool, project_process};
use crate::permissions::{CompletionHook, TurnPermissions};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ToolArguments};
use agent_kit_core::tools::{
    InventorySnapshot, Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition,
    ToolOutcome,
};
use agent_kit_core::turn::TurnBinding;
use agent_kit_core::{GrantId, ToolId};
use agent_kit_sandbox::ProcessEvidence;
use grida_agent_master::hooks::{
    CheckInvocation, CheckMode, CompletionCheck, CompletionChecks, HandlerReply,
};
use serde_json::json;

const CHECK: &str = "require-completion-text";
const TOOL: &str = "require_completion_text";
const COMMAND_CHECK: &str = "before-completion-command";
const COMMAND_TOOL: &str = "before_completion_command";
const COMMAND_MAX_OUTPUT: usize = 4 * 1024;

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
    ) -> Option<&CompletionHook> {
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
        command: Option<&Arc<CommandTool>>,
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
                    permissions: permissions.cloned().ok_or_else(unavailable)?,
                    command: command.cloned().ok_or_else(unavailable)?,
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
    Command {
        permissions: Arc<TurnPermissions>,
        command: Arc<CommandTool>,
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
        let fingerprint = Fingerprint::of(&(&binding.session, &binding.turn, &check))?;
        let id = uuid::Uuid::from_bytes(
            fingerprint.bytes()[..16]
                .try_into()
                .expect("fingerprint prefix"),
        );
        Ok(Arc::new(Self {
            binding: binding.clone(),
            grant: GrantSelection {
                authority: AuthorityBinding {
                    principal: PrincipalId::new("grida-local")?,
                    binding: BindingId::new(format!("completion-check/{id}"))?,
                    scope: ScopeId::new("completion-check")?,
                },
                grants: vec![GrantId::new(check.id.as_str())?],
            },
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
            if let Handler::Command {
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
                    match permissions.review_completion_command(self.grant.clone(), stdin, maximum)
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
    let reply = (!evidence.output_truncated)
        .then(|| serde_json::from_slice::<HandlerReply>(&evidence.stdout).ok())
        .flatten();
    let (mut outcome, verified) = project_process(evidence, maximum, false);
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
    hook: &CompletionHook,
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
