//! GRIDA-SEC-004 / GRIDA-SEC-014 — reviewed lifecycle handlers with private turn authority.

use super::*;
use crate::command::{CommandTool, project_process};
use crate::permissions::{ReviewedLifecycleHook, TurnPermissions};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ToolArguments};
use agent_kit_core::tools::{
    InventorySnapshot, Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition,
    ToolOutcome,
};
use agent_kit_core::turn::TurnBinding;
use agent_kit_core::{GrantId, ToolId};
use agent_kit_sandbox::{ProcessEvidence, StopReason};
use grida_agent_master::lifecycle_hooks::{
    HookDecision, HookInvocation, HookMoment, HookOccurrence, HookReply, LifecycleHook,
    LifecycleHooks, MAX_EVENT_BYTES,
};
use serde_json::json;

const MAX_OUTPUT: usize = 8 * 1024;

pub(super) struct LifecycleAccess {
    hooks: LifecycleHooks,
    handlers: Vec<Arc<Handler>>,
}

struct Handler {
    binding: TurnBinding,
    selected: LifecycleHook,
    command_hook: ReviewedLifecycleHook,
    grant: GrantSelection,
    definition: ToolDefinition,
    permissions: Arc<TurnPermissions>,
    command: Arc<CommandTool>,
}

impl LifecycleAccess {
    pub(super) fn bind(
        binding: &TurnBinding,
        permissions: Option<&Arc<TurnPermissions>>,
        command: Option<&Arc<CommandTool>>,
    ) -> Result<Option<Arc<Self>>> {
        let Some(permissions) = permissions else {
            return Ok(None);
        };
        let selected = permissions
            .lifecycle_hooks()
            .iter()
            .filter(|hook| hook.enabled)
            .collect::<Vec<_>>();
        if selected.is_empty() {
            return Ok(None);
        }
        let command = command.cloned().ok_or_else(unavailable)?;
        let handlers = selected
            .into_iter()
            .map(|hook| {
                let id = ToolId::new(format!("lifecycle_hook/{}", hook.id))?;
                let selected = selection(hook)?;
                let authority = Fingerprint::of(&(&binding.session, &binding.turn, &selected))?;
                let grant = GrantSelection {
                    authority: AuthorityBinding {
                        principal: PrincipalId::new("grida-local")?,
                        binding: BindingId::new(format!("hook/{}", authority.to_hex()))?,
                        scope: ScopeId::new("lifecycle-hook")?,
                    },
                    grants: vec![GrantId::new(format!("hook/{}", hook.id))?],
                };
                Ok(Arc::new(Handler {
                    binding: binding.clone(),
                    selected,
                    command_hook: hook.clone(),
                    grant,
                    definition: ToolDefinition {
                        id,
                        version: 1,
                        description: "Run one selected lifecycle handler.".into(),
                        input: InputFormat::Json(json!({"type":"object"})),
                        max_input_bytes: MAX_EVENT_BYTES,
                        max_output_bytes: MAX_OUTPUT,
                        recovery: RecoveryKind::Unavailable,
                    },
                    permissions: permissions.clone(),
                    command: command.clone(),
                }))
            })
            .collect::<Result<Vec<_>>>()?;
        let hooks = LifecycleHooks::new(
            handlers
                .iter()
                .map(|handler| handler.selected.clone())
                .collect(),
        )?;
        Ok(Some(Arc::new(Self { hooks, handlers })))
    }
    pub(super) fn grants(&self) -> BTreeMap<BindingId, GrantSelection> {
        self.handlers
            .iter()
            .map(|handler| (handler.selected.id.clone(), handler.grant.clone()))
            .collect()
    }
    pub(super) fn inventory(&self) -> Result<InventorySnapshot> {
        let mut inventory = Inventory::new();
        let mut selected = Vec::new();
        for handler in &self.handlers {
            inventory.insert(handler.clone())?;
            selected.push(handler.definition.id.clone());
        }
        inventory.snapshot(&selected)
    }
    pub(super) fn handles(&self, grant: &GrantSelection) -> bool {
        self.handlers.iter().any(|handler| &handler.grant == grant)
    }
    pub(super) fn unverified(&self, view: &agent_kit_runtime::TurnView) -> bool {
        self.hooks.unverified(view, &self.grants())
    }
    pub(super) fn admit(
        &self,
        admission: &ToolAdmission,
        context: &AdmissionContext,
    ) -> Result<ToolDecision> {
        let handler = self
            .handlers
            .iter()
            .find(|handler| handler.grant == admission.grants)
            .ok_or_else(unavailable)?;
        if admission.invocation.definition() != &handler.definition
            || admission.operation != *admission.invocation.id()
            || context.operations.view().state.binding() != &handler.binding
            || !context.operations.view().state.controls().admits_work()
        {
            return Err(unavailable());
        }
        let event = handler.read(admission.invocation.arguments())?;
        event.occurrence.validate(&context.operations.view())?;
        Ok(ToolDecision::Permit)
    }
    pub(super) async fn before_tool(
        &self,
        admission: &ToolAdmission,
        context: &AdmissionContext,
    ) -> Result<ToolDecision> {
        let moment = HookMoment::BeforeTool {
            operation: admission.operation.clone(),
            invocation: admission.invocation.clone(),
        };
        if !self.hooks.matches(&moment) {
            return Ok(ToolDecision::Permit);
        }
        let occurrence = HookOccurrence::new(&context.operations.view(), moment);
        let decision = self
            .hooks
            .review(
                &context.operations,
                occurrence,
                &self.inventory()?,
                &self.grants(),
            )
            .await?
            .decision;
        match decision {
            HookDecision::Allow => Ok(ToolDecision::Permit),
            HookDecision::Reconsider => Err(problem(
                ErrorKind::InvalidState,
                "lifecycle_hook_interrupted",
            )),
            HookDecision::Uncertain => {
                Err(problem(ErrorKind::Uncertain, "lifecycle_hook_uncertain"))
            }
            _ => Err(problem(ErrorKind::Unavailable, "lifecycle_hook_denied")),
        }
    }
}

pub(super) fn selection(hook: &ReviewedLifecycleHook) -> Result<LifecycleHook> {
    Ok(LifecycleHook {
        id: hook.id.clone(),
        source: hook.source.clone(),
        revision: hook.command.revision,
        event: hook.event,
        tool: hook.tool.clone(),
        mode: hook.command.mode,
        handler: ToolId::new(format!("lifecycle_hook/{}", hook.id))?,
    })
}

impl Handler {
    fn read(&self, arguments: &ToolArguments) -> Result<HookInvocation> {
        let ToolArguments::Json(value) = arguments else {
            return Err(unavailable());
        };
        if serde_json::to_vec(value).map_or(true, |bytes| bytes.len() > MAX_EVENT_BYTES) {
            return Err(unavailable());
        }
        let event: HookInvocation =
            serde_json::from_value(value.clone()).map_err(|_| unavailable())?;
        let selection = LifecycleHooks::new(
            self.permissions
                .lifecycle_hooks()
                .iter()
                .filter(|hook| hook.enabled)
                .map(selection)
                .collect::<Result<Vec<_>>>()?,
        )?;
        if event.hook != self.selected
            || event.selection != selection
            || event.occurrence.session != self.binding.session
            || event.occurrence.turn != self.binding.turn
            || event.occurrence.moment.event() != self.selected.event
        {
            return Err(unavailable());
        }
        Ok(event)
    }
}

impl Tool for Handler {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }
    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        self.read(arguments).map(|_| ())
    }
    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            let reviewed = (|| {
                let event = self.read(invocation.arguments())?;
                let stdin = serde_json::to_vec(&event).map_err(|_| unavailable())?;
                self.permissions.review_hook_command(
                    &self.command_hook.command,
                    self.grant.clone(),
                    stdin,
                    context.max_output_bytes.min(MAX_OUTPUT),
                )
            })();
            match reviewed {
                Ok(reviewed) => {
                    self.command
                        .invoke_reviewed(&invocation, context, reviewed, project)
                        .await
                }
                Err(error) => ToolOutcome::failed(&error.code),
            }
        })
    }
}

fn project(evidence: ProcessEvidence, maximum: usize) -> (ToolOutcome, bool) {
    let reason = match evidence.stopped {
        Some(StopReason::Deadline) => Some("lifecycle_hook_timed_out"),
        Some(StopReason::OutputLimit) => Some("lifecycle_hook_output_limit"),
        _ => None,
    };
    let reply = (!evidence.output_truncated)
        .then(|| serde_json::from_slice::<HookReply>(&evidence.stdout).ok())
        .flatten();
    let (mut outcome, verified) = project_process(evidence, maximum, false);
    if let Some(reason) = reason {
        outcome
            .content
            .push(agent_kit_core::messages::ResultContent::Text(reason.into()));
    }
    outcome.structured = if outcome.status == OutcomeStatus::Succeeded {
        reply.and_then(|value| serde_json::to_value(value).ok())
    } else {
        None
    };
    (outcome, verified)
}

fn unavailable() -> Error {
    problem(ErrorKind::Unavailable, "lifecycle_hook_unavailable")
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookInfo {
    id: BindingId,
    source: String,
    event: grida_agent_master::lifecycle_hooks::HookEvent,
    tool: Option<ToolId>,
    enabled: bool,
    mode: grida_agent_master::hooks::CheckMode,
    executable: PathBuf,
    arguments: Vec<String>,
    timeout_ms: u64,
    revision: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookInspection {
    supported_events: Vec<grida_agent_master::lifecycle_hooks::HookEvent>,
    hooks: Vec<HookInfo>,
    results: Vec<serde_json::Value>,
}

impl Host {
    pub(super) fn capture_lifecycle_hooks(&self) -> Result<Option<LifecycleHooks>> {
        let definitions = self
            .permissions
            .as_ref()
            .map(|profile| profile.lifecycle_hooks())
            .unwrap_or_default();
        let selected = definitions
            .iter()
            .filter(|hook| hook.enabled)
            .map(selection)
            .collect::<Result<Vec<_>>>()?;
        if selected.is_empty() {
            return Ok(None);
        }
        Ok(Some(LifecycleHooks::new(selected)?))
    }

    /// Read launch-selected definitions and a selected session's retained results.
    /// This operation starts neither a worker nor a hook command.
    pub async fn inspect_hooks(&self, session: Option<SessionId>) -> Result<HookInspection> {
        let definitions = self
            .permissions
            .as_ref()
            .map(|profile| profile.lifecycle_hooks())
            .unwrap_or_default();
        let hooks = definitions
            .iter()
            .map(|hook| HookInfo {
                id: hook.id.clone(),
                source: hook.source.clone(),
                event: hook.event,
                tool: hook.tool.clone(),
                enabled: hook.enabled,
                mode: hook.command.mode,
                executable: hook.command.executable.path.clone(),
                arguments: hook.command.arguments.clone(),
                timeout_ms: hook
                    .command
                    .timeout
                    .as_millis()
                    .try_into()
                    .unwrap_or(u64::MAX),
                revision: hook.command.revision.to_hex(),
            })
            .collect();
        let results = match session {
            Some(session) => {
                let view = self.store.inspect(session.clone()).await?;
                let turn = view.current.or(view.latest).map(|turn| turn.binding.turn);
                match turn {
                    Some(turn) => {
                        let inputs = self
                            .store
                            .turn_submissions(session.clone(), turn.clone())
                            .await?;
                        let captured = inputs
                            .iter()
                            .find(|input| is_stored_input(&input.payload))
                            .map(decode_input::<StoredPrompt>)
                            .transpose()?
                            .and_then(|input| input.lifecycle_hooks);
                        let selected = LifecycleHooks::new(
                            captured
                                .map(|hooks| hooks.definitions().to_vec())
                                .unwrap_or_default(),
                        )?;
                        self.store.inspect_turn_with(session, turn, move |state| {
                            let results = state.outcome()
                                .and_then(|outcome|outcome.account.as_ref())
                                .and_then(|account|grida_agent_master::read_account(account).ok())
                                .map(|account|account.lifecycle_hooks)
                                .filter(|results|!results.is_empty())
                                .unwrap_or_else(||selected.results(&agent_kit_runtime::TurnView {state:state.clone(),active:Vec::new(),admission_closed:true}));
                            Ok(results.into_iter().take(64).map(|result|json!({"id":result.id,"revision":result.revision.to_hex(),"event":result.event,"operation":result.operation,"status":result.status,"reason":result.reason})).collect())
                        }).await?
                    }
                    None => Vec::new(),
                }
            }
            None => Vec::new(),
        };
        Ok(HookInspection {
            supported_events: grida_agent_master::lifecycle_hooks::HookEvent::ALL.to_vec(),
            hooks,
            results,
        })
    }
}
