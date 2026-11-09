//! GRIDA-SEC-004 — Reviewed native completion check with private turn authority.

use super::*;
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ToolArguments};
use agent_kit_core::tools::{
    InventorySnapshot, Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition,
    ToolOutcome,
};
use agent_kit_core::turn::TurnBinding;
use agent_kit_core::{GrantId, ToolId};
use grida_agent_master::hooks::{
    CheckInvocation, CheckMode, CompletionCheck, CompletionChecks, HandlerReply,
};
use serde_json::json;

const CHECK: &str = "require-completion-text";
const TOOL: &str = "require_completion_text";

impl Host {
    /// Require a nonempty answer on newly accepted conversational work.
    pub fn with_required_completion_text(mut self) -> Self {
        self.require_completion_text = true;
        self
    }

    pub(super) fn capture_completion_checks(&self) -> Result<Option<CompletionChecks>> {
        self.require_completion_text
            .then(|| CompletionChecks::new(vec![selection(&definition()?)?]))
            .transpose()
    }
}

pub(super) struct CompletionAccess {
    binding: TurnBinding,
    check: CompletionCheck,
    grant: GrantSelection,
    definition: ToolDefinition,
}

impl CompletionAccess {
    pub(super) fn bind(binding: &TurnBinding) -> Result<Arc<Self>> {
        let definition = definition()?;
        let check = selection(&definition)?;
        let fingerprint = Fingerprint::of(&(&binding.session, &binding.turn, &check))?;
        let id = uuid::Uuid::from_bytes(
            fingerprint.bytes()[..16]
                .try_into()
                .expect("fingerprint prefix"),
        );
        Ok(Arc::new(Self {
            binding: binding.clone(),
            check,
            grant: GrantSelection {
                authority: AuthorityBinding {
                    principal: PrincipalId::new("grida-local")?,
                    binding: BindingId::new(format!("completion-check/{id}"))?,
                    scope: ScopeId::new("completion-check")?,
                },
                grants: vec![GrantId::new(CHECK)?],
            },
            definition,
        }))
    }

    pub(super) fn handles(&self, selection: &GrantSelection) -> bool {
        &self.grant == selection
    }

    pub(super) fn inventory(self: &Arc<Self>) -> Result<InventorySnapshot> {
        let mut inventory = Inventory::new();
        inventory.insert(self.clone())?;
        inventory.snapshot(std::slice::from_ref(&self.definition.id))
    }

    pub(super) fn grants(&self) -> BTreeMap<BindingId, GrantSelection> {
        BTreeMap::from([(self.check.id.clone(), self.grant.clone())])
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
}

impl ToolGate for CompletionAccess {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
            let event = self.event(admission.invocation.arguments())?;
            let view = context.operations.view();
            if !self.handles(&admission.grants)
                || admission.invocation.definition() != &self.definition
                || admission.invocation.id() != &admission.operation
                || view.state.binding() != &self.binding
                || !view.state.controls().admits_work()
                || view.state.history().position() != event.occurrence.history_position
            {
                return Err(unavailable());
            }
            Ok(ToolDecision::Permit)
        })
    }
}

impl Tool for CompletionAccess {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        self.event(arguments).map(|_| ())
    }

    fn invoke(
        &self,
        invocation: Invocation,
        _context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            let event = match self.event(invocation.arguments()) {
                Ok(event) => event,
                Err(error) => return ToolOutcome::failed(&error.code),
            };
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

fn unavailable() -> Error {
    problem(
        ErrorKind::Unavailable,
        "completion_check_authority_unavailable",
    )
}
