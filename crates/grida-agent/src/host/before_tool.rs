//! GRIDA-SEC-004 — Required command admission check with a private turn grant.

use super::*;
use crate::command::CommandSupervisor;
use crate::permissions::{ReviewedHookCommand, TurnPermissions};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{
    InventorySnapshot, Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition,
    ToolOutcome,
};
use agent_kit_core::turn::{OperationInput, TurnBinding};
use agent_kit_core::{GrantId, ToolId};
use agent_kit_runtime::{InvokeOutcome, OperationKey, PlannedInvocation};
use agent_kit_sandbox::ProcessEvidence;
use grida_agent_master::hooks::{HandlerReply, has_unverified_admission_check};
use serde_json::json;
use std::sync::atomic::AtomicBool;

const EVENT: &str = "before_tool";
const HANDLER: &str = "before_tool_command";
const TIMEOUT: &str = "before_tool_hook_timed_out";
const OUTPUT_LIMIT: &str = "before_tool_hook_output_limit";
const MAX_EVENT_BYTES: usize = 32 * 1024;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Event {
    event: String,
    version: u32,
    session: SessionId,
    turn: TurnId,
    operation: OperationId,
    tool: ToolId,
    arguments: serde_json::Value,
    action: Fingerprint,
    revision: Fingerprint,
}

pub(super) struct BeforeToolCheck {
    binding: TurnBinding,
    grant: GrantSelection,
    definition: ToolDefinition,
    hook: ReviewedHookCommand,
    permissions: Arc<TurnPermissions>,
    command: Arc<CommandSupervisor>,
    fenced: AtomicBool,
}

impl BeforeToolCheck {
    pub(super) fn bind(
        binding: &TurnBinding,
        permissions: Option<&Arc<TurnPermissions>>,
        command: Option<&Arc<CommandSupervisor>>,
    ) -> Result<Option<Arc<Self>>> {
        let Some(permissions) = permissions else {
            return Ok(None);
        };
        let Some(hook) = permissions.before_tool_hook() else {
            return Ok(None);
        };
        let command = command.cloned().ok_or_else(unavailable)?;
        let authority = Fingerprint::of(&(&binding.session, &binding.turn, hook.revision))?;
        let authority = uuid::Uuid::from_bytes(
            authority.bytes()[..16]
                .try_into()
                .expect("fingerprint prefix"),
        );
        let grant = GrantSelection {
            authority: AuthorityBinding {
                principal: PrincipalId::new("grida-local")?,
                binding: BindingId::new(format!("before-tool/{authority}"))?,
                scope: ScopeId::new("before-tool")?,
            },
            grants: vec![GrantId::new(HANDLER)?],
        };
        Ok(Some(Arc::new(Self {
            binding: binding.clone(),
            grant,
            definition: ToolDefinition {
                id: ToolId::new(HANDLER)?,
                version: 1,
                description: "Check the exact proposed command before execution.".into(),
                input: InputFormat::Json(json!({"type":"object"})),
                max_input_bytes: MAX_EVENT_BYTES,
                max_output_bytes: completion_checks::COMMAND_MAX_OUTPUT,
                recovery: RecoveryKind::Unavailable,
            },
            hook: hook.clone(),
            permissions: permissions.clone(),
            command,
            fenced: AtomicBool::new(false),
        })))
    }

    pub(super) fn grant(&self) -> GrantSelection {
        self.grant.clone()
    }

    pub(super) fn is_fenced(&self) -> bool {
        self.fenced.load(Ordering::SeqCst)
    }

    pub(super) fn require_unfenced(&self, context: &AdmissionContext) -> Result<()> {
        if has_unverified_admission_check(&context.operations.view(), &self.grant) {
            self.fenced.store(true, Ordering::SeqCst);
        }
        if self.is_fenced() {
            return Err(uncertain());
        }
        Ok(())
    }

    pub(super) fn handles(&self, selection: &GrantSelection) -> bool {
        &self.grant == selection
    }

    /// The check reviews each `exec_command` before it starts. Input to an
    /// already reviewed process is not checked again.
    pub(super) fn matches(&self, invocation: &Invocation) -> bool {
        invocation.definition().id.as_str() == crate::processes::EXEC_COMMAND
    }

    fn inventory(self: &Arc<Self>) -> Result<InventorySnapshot> {
        let mut inventory = Inventory::new();
        inventory.insert(self.clone())?;
        inventory.snapshot(std::slice::from_ref(&self.definition.id))
    }

    fn event(&self, arguments: &ToolArguments) -> Result<Event> {
        let ToolArguments::Json(value) = arguments else {
            return Err(unavailable());
        };
        let event: Event = serde_json::from_value(value.clone()).map_err(|_| unavailable())?;
        if event.event != EVENT
            || event.version != 1
            || event.session != self.binding.session
            || event.turn != self.binding.turn
            || event.tool.as_str() != crate::processes::EXEC_COMMAND
            || event.revision != self.hook.revision
        {
            return Err(unavailable());
        }
        Ok(event)
    }

    pub(super) fn admit(
        &self,
        admission: &ToolAdmission,
        context: &AdmissionContext,
    ) -> Result<ToolDecision> {
        let event = self.event(admission.invocation.arguments())?;
        let view = context.operations.view();
        let target = view.operation(&event.operation).ok_or_else(unavailable)?;
        if admission.invocation.definition() != &self.definition
            || admission.invocation.id() != &admission.operation
            || view.state.binding() != &self.binding
            || !view.state.controls().admits_work()
            || target.outcome().is_some()
            || !target.attempts.is_empty()
            || !matches!(&target.record.input, OperationInput::Tool(invocation)
                if self.matches(invocation) && invocation.fingerprint() == event.action
                    && matches!(invocation.arguments(), ToolArguments::Json(value) if value == &event.arguments))
        {
            return Err(unavailable());
        }
        Ok(ToolDecision::Permit)
    }

    pub(super) async fn review(
        self: &Arc<Self>,
        admission: &ToolAdmission,
        context: &AdmissionContext,
    ) -> Result<ToolDecision> {
        let ToolArguments::Json(arguments) = admission.invocation.arguments() else {
            return Err(unavailable());
        };
        let event = Event {
            event: EVENT.into(),
            version: 1,
            session: self.binding.session.clone(),
            turn: self.binding.turn.clone(),
            operation: admission.operation.clone(),
            tool: admission.invocation.definition().id.clone(),
            arguments: arguments.clone(),
            action: admission.invocation.fingerprint(),
            revision: self.hook.revision,
        };
        if serde_json::to_vec(&event).map_or(true, |bytes| bytes.len() > MAX_EVENT_BYTES) {
            return Err(problem(
                ErrorKind::LimitExceeded,
                "before_tool_hook_event_limit",
            ));
        }
        let key = OperationKey::new(format!("hook/before-tool/{}", event.operation))?;
        let result = context
            .operations
            .invoke_with_inventory(
                key,
                PlannedInvocation {
                    tool: self.definition.id.clone(),
                    arguments: ToolArguments::Json(
                        serde_json::to_value(event).map_err(|_| unavailable())?,
                    ),
                    grants: self.grant.clone(),
                },
                self.inventory()?,
            )
            .await;
        let result = match result {
            Ok(InvokeOutcome::Complete(outcome)) => decision(outcome),
            Ok(InvokeOutcome::Paused) => {
                Err(problem(ErrorKind::InvalidState, "before_tool_hook_paused"))
            }
            Ok(InvokeOutcome::Deferred(_)) => Err(unavailable()),
            Err(error) => Err(error),
        };
        if result
            .as_ref()
            .is_err_and(|error| error.kind == ErrorKind::Uncertain)
        {
            self.fenced.store(true, Ordering::SeqCst);
        }
        result
    }
}

impl Tool for BeforeToolCheck {
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
            let result = (|| {
                let event = self.event(invocation.arguments())?;
                let stdin = serde_json::to_vec(&event).map_err(|_| unavailable())?;
                if stdin.len() > MAX_EVENT_BYTES {
                    return Err(problem(
                        ErrorKind::LimitExceeded,
                        "before_tool_hook_event_limit",
                    ));
                }
                let maximum = context
                    .max_output_bytes
                    .min(completion_checks::COMMAND_MAX_OUTPUT);
                self.permissions
                    .review_hook_command(&self.hook, self.grant.clone(), stdin, maximum)
            })();
            let outcome = match result {
                Ok(command) => {
                    self.command
                        .invoke_reviewed(&invocation, context, command, project)
                        .await
                }
                Err(error) => ToolOutcome::failed(&error.code),
            };
            if outcome.status == OutcomeStatus::Uncertain {
                self.fenced.store(true, Ordering::SeqCst);
            }
            outcome
        })
    }
}

fn project(evidence: ProcessEvidence, maximum: usize) -> (ToolOutcome, bool) {
    completion_checks::project_hook(evidence, maximum, TIMEOUT, OUTPUT_LIMIT)
}

fn decision(outcome: ToolOutcome) -> Result<ToolDecision> {
    let kind = if outcome.status == OutcomeStatus::Uncertain {
        ErrorKind::Uncertain
    } else {
        ErrorKind::Unavailable
    };
    let code = if outcome.status == OutcomeStatus::Succeeded && !outcome.truncated {
        match outcome
            .structured
            .and_then(|value| serde_json::from_value(value).ok())
        {
            Some(HandlerReply::Allow {}) => return Ok(ToolDecision::Permit),
            Some(HandlerReply::Deny { reason })
                if !reason.trim().is_empty() && reason.len() <= 1024 =>
            {
                "before_tool_hook_denied"
            }
            _ => "before_tool_hook_invalid_reply",
        }
    } else {
        outcome
            .content
            .iter()
            .find_map(|content| match content {
                ResultContent::Text(code) if code == TIMEOUT => Some(TIMEOUT),
                ResultContent::Text(code) if code == OUTPUT_LIMIT => Some(OUTPUT_LIMIT),
                _ => None,
            })
            .unwrap_or(if outcome.status == OutcomeStatus::Uncertain {
                "before_tool_hook_uncertain"
            } else {
                "before_tool_hook_failed"
            })
    };
    Err(problem(kind, code))
}

fn unavailable() -> Error {
    problem(ErrorKind::Unavailable, "before_tool_hook_unavailable")
}

pub(super) fn uncertain() -> Error {
    problem(ErrorKind::Uncertain, "before_tool_hook_uncertain")
}
