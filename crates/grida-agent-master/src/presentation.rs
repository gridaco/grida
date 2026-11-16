//! Auxiliary workspace presentation in the product harness.

use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::tools::{RecoveryKind, ToolDefinition};
use agent_kit_core::turn::{OperationInput, OperationState, TurnState};
use agent_kit_core::{OperationId, Result, ToolId, TurnId};
use agent_kit_runtime::{InvokeOutcome, OperationKey, StepToolOutcome, Turn};
use serde_json::json;

pub const OPEN: &str = "surface_open";
pub const PRINCIPAL: &str = "live-editor";
pub const MAX_PATH_BYTES: usize = 4096;
pub const INSTRUCTIONS: &str = "When producing or editing a primary artifact, request surface_open at the first meaningful renderable checkpoint so the user can follow the work. Keep working after the request. Open the existing primary artifact before substantial edits when it is not already visible. Reopen it only when the user asks or the primary artifact changes. Treat presentation as optional and verify the artifact independently.";

pub fn definition() -> Result<ToolDefinition> {
    Ok(ToolDefinition {
        id: ToolId::new(OPEN)?,
        version: 2,
        description: "Ask the attached workspace editor to open an existing artifact. Acknowledgment confirms a request was sent, and display is best effort.".into(),
        input: InputFormat::Json(json!({
            "type": "object",
            "properties": {"path": {"type": "string", "minLength": 2, "maxLength": MAX_PATH_BYTES}},
            "required": ["path"],
            "additionalProperties": false
        })),
        max_input_bytes: 32 * 1024,
        max_output_bytes: 32 * 1024,
        recovery: RecoveryKind::Unavailable,
    })
}

/// Only the trusted editor's exact presentation request is auxiliary. Other
/// unconfirmed operations retain the normal turn and deletion fences.
pub fn unconfirmed(operation: &OperationState, turn: &TurnId) -> bool {
    if !operation.is_uncertain() {
        return false;
    }
    let OperationInput::Tool(invocation) = &operation.record.input else {
        return false;
    };
    let grants = &operation.record.grants;
    grants.authority.principal.as_str() == PRINCIPAL
        && grants.authority.scope.as_str() == turn.as_str()
        && matches!(grants.grants.as_slice(), [grant] if grant.as_str() == OPEN)
        && definition().is_ok_and(|definition| invocation.definition() == &definition)
}

pub(super) fn blocks_continuation(
    turn: &Turn,
    step_key: &str,
    state: &TurnState,
    tools: &[StepToolOutcome],
) -> Result<bool> {
    let mut uncertain = tools.iter().filter(|tool| {
        matches!(&tool.outcome, InvokeOutcome::Complete(outcome) if outcome.status == OutcomeStatus::Uncertain)
    }).peekable();
    if uncertain.peek().is_none() {
        return Ok(false);
    }
    let origin = turn
        .operation(&OperationKey::new(step_key)?)?
        .map(|operation| operation.record.id);
    Ok(uncertain.any(|tool| !unconfirmed_call(origin.as_ref(), &tool.call.id, state)))
}

fn unconfirmed_call(
    origin: Option<&OperationId>,
    call: &agent_kit_core::ToolCallId,
    state: &TurnState,
) -> bool {
    let Some(origin) = origin else { return false };
    state.operations().values().any(|operation| {
        operation.record.origin.as_ref() == Some(origin)
            && operation.record.source_call.as_ref() == Some(call)
            && unconfirmed(operation, &state.binding().turn)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::authority::{AuthorityBinding, GrantSelection};
    use agent_kit_core::messages::ToolArguments;
    use agent_kit_core::tools::{Inventory, Invocation, InvocationContext, Tool, ToolOutcome};
    use agent_kit_core::turn::{AttemptRecord, OperationOutcome, OperationRecord};
    use agent_kit_core::{AttemptId, BindingId, BoxFuture, GrantId, PrincipalId, ScopeId};
    use std::sync::Arc;

    struct Handler(ToolDefinition);

    impl Tool for Handler {
        fn definition(&self) -> &ToolDefinition {
            &self.0
        }

        fn validate(&self, _: &ToolArguments) -> Result<()> {
            Ok(())
        }

        fn invoke(&self, _: Invocation, _: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
            Box::pin(async { ToolOutcome::uncertain() })
        }
    }

    fn invocation(definition: ToolDefinition, id: &OperationId) -> OperationInput {
        let tool = definition.id.clone();
        let mut inventory = Inventory::new();
        inventory.insert(Arc::new(Handler(definition))).unwrap();
        let prepared = inventory
            .snapshot(std::slice::from_ref(&tool))
            .unwrap()
            .prepare(
                id.clone(),
                &tool,
                ToolArguments::Json(json!({"path":"/poster.canvas"})),
            )
            .unwrap();
        OperationInput::Tool(prepared.invocation().clone())
    }

    #[test]
    fn only_the_editor_grant_and_exact_definition_make_uncertainty_auxiliary() {
        let id = OperationId::new("request").unwrap();
        let turn = TurnId::new("turn").unwrap();
        let mut operation = OperationState {
            record: OperationRecord {
                id: id.clone(),
                input: invocation(definition().unwrap(), &id),
                origin: None,
                source_call: None,
                grants: GrantSelection {
                    authority: AuthorityBinding {
                        principal: PrincipalId::new(PRINCIPAL).unwrap(),
                        binding: BindingId::new("captured-editor").unwrap(),
                        scope: ScopeId::new(turn.as_str()).unwrap(),
                    },
                    grants: vec![GrantId::new(OPEN).unwrap()],
                },
            },
            attempts: vec![AttemptRecord {
                id: AttemptId::new("attempt").unwrap(),
                outcome: Some(OperationOutcome::Tool(ToolOutcome::uncertain())),
                prior_outcomes: vec![],
            }],
            rejection: None,
        };
        assert!(unconfirmed(&operation, &turn));
        assert!(!unconfirmed(
            &operation,
            &TurnId::new("other-turn").unwrap()
        ));
        let original = operation.record.grants.authority.principal.clone();
        operation.record.grants.authority.principal = PrincipalId::new("local-mcp").unwrap();
        assert!(!unconfirmed(&operation, &turn));
        operation.record.grants.authority.principal = original;
        let mut other = definition().unwrap();
        other.version -= 1;
        operation.record.input = invocation(other, &id);
        assert!(!unconfirmed(&operation, &turn));
    }
}
