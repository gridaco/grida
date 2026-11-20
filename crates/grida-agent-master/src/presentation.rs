//! Auxiliary workspace presentation in the product harness.

use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ToolArguments};
use agent_kit_core::tools::{Invocation, RecoveryKind, ToolDefinition};
use agent_kit_core::turn::{OperationInput, OperationState, TurnState};
use agent_kit_core::{OperationId, Result, ToolId, TurnId};
use agent_kit_runtime::{InvokeOutcome, OperationKey, StepToolOutcome, Turn};
use serde_json::{Value, json};

pub const OPEN: &str = "surface_open";
pub const WORKBENCH_SHOW: &str = "workbench_show";
pub const DESKTOP_CONTEXT: &str = "You are working in Grida Desktop.";
pub const PRINCIPAL: &str = "live-editor";
pub const TARGETED_VERSION: u32 = 3;
pub const MAX_PATH_BYTES: usize = 4096;
pub const INSTRUCTIONS: &str = "When producing or editing a primary artifact, request surface_open at the first meaningful renderable checkpoint so the user can follow the work. Keep working after the request. Open the existing primary artifact before substantial edits when it is not already visible. Reopen it only when the user asks or the primary artifact changes. Treat presentation as optional and verify the artifact independently.";
pub const WORKBENCH_INSTRUCTIONS: &str = "When producing or editing a primary artifact, request workbench_show with its workspace file target at the first meaningful renderable checkpoint so the user can follow the work. The workbench chooses the viewer. Keep working after the request. Show the existing primary artifact before substantial edits when it is not already visible. Show it again only when the user asks or the primary artifact changes. Treat presentation as optional and verify the artifact independently.";

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

/// File-only workbench presentation when browser surfaces are unavailable.
pub fn workbench_show_definition() -> Result<ToolDefinition> {
    let mut tool = definition()?;
    tool.id = ToolId::new(WORKBENCH_SHOW)?;
    tool.description = "Ask the attached workbench to show an existing workspace file or recognized bundle. The workbench chooses the viewer. Acknowledgment confirms a request was sent, and display is best effort.".into();
    tool.input = InputFormat::Json(json!({
        "type": "object",
        "properties": {
            "target": {
                "type": "object",
                "properties": {
                    "kind": {"const": "file"},
                    "path": {"type": "string", "minLength": 2, "maxLength": MAX_PATH_BYTES}
                },
                "required": ["kind", "path"],
                "additionalProperties": false
            },
            "presentation": {"const": "reveal"}
        },
        "required": ["target"],
        "additionalProperties": false
    }));
    Ok(tool)
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
        && matches!(grants.grants.as_slice(), [grant] if grant.as_str() == invocation.definition().id.as_str())
        && is_file_reveal(invocation)
}

fn is_file_reveal(invocation: &Invocation) -> bool {
    let tool = invocation.definition();
    let typed_reveal = || match invocation.arguments() {
        ToolArguments::Json(arguments) => file_reveal_path(arguments).is_some(),
        _ => false,
    };
    match (tool.id.as_str(), tool.version) {
        (OPEN, 2) => definition().is_ok_and(|definition| *tool == definition),
        (WORKBENCH_SHOW, 2) => {
            workbench_show_definition().is_ok_and(|definition| *tool == definition)
                && typed_reveal()
        }
        (OPEN | WORKBENCH_SHOW, TARGETED_VERSION) => typed_reveal(),
        _ => false,
    }
}

/// Extract a typed workspace file reveal without admitting other effects.
pub fn file_reveal_path(arguments: &Value) -> Option<&str> {
    let arguments = arguments.as_object()?;
    let target = arguments.get("target")?.as_object()?;
    if arguments.len() == 1 + usize::from(arguments.contains_key("presentation"))
        && arguments
            .get("presentation")
            .is_none_or(|mode| mode.as_str() == Some("reveal"))
        && target.len() == 2
        && target.get("kind").and_then(serde_json::Value::as_str) == Some("file")
    {
        return target.get("path")?.as_str();
    }
    None
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

    fn invocation(
        definition: ToolDefinition,
        id: &OperationId,
        arguments: serde_json::Value,
    ) -> OperationInput {
        let tool = definition.id.clone();
        let mut inventory = Inventory::new();
        inventory.insert(Arc::new(Handler(definition))).unwrap();
        let prepared = inventory
            .snapshot(std::slice::from_ref(&tool))
            .unwrap()
            .prepare(id.clone(), &tool, ToolArguments::Json(arguments))
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
                input: invocation(definition().unwrap(), &id, json!({"path":"/poster.canvas"})),
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
        operation.record.input = invocation(other, &id, json!({"path":"/poster.canvas"}));
        assert!(!unconfirmed(&operation, &turn));

        let cases = [
            (
                json!({"target":{"kind":"file","path":"/poster.canvas"}}),
                true,
            ),
            (
                json!({"target":{"kind":"file","path":"/poster.canvas"},"presentation":"reveal"}),
                true,
            ),
            (
                json!({"target":{"kind":"file","path":"/poster.canvas"},"presentation":"focus"}),
                false,
            ),
            (
                json!({"target":{"kind":"url","url":"https://example.com"}}),
                false,
            ),
            (json!({"target":{"kind":"tab","tabId":"tab"}}), false),
            (
                json!({"target":{"kind":"file","path":"/poster.canvas","url":"https://example.com"}}),
                false,
            ),
        ];
        let mut retained_targeted = definition().unwrap();
        retained_targeted.version = TARGETED_VERSION;
        let new_file_only = workbench_show_definition().unwrap();
        let mut new_targeted = new_file_only.clone();
        new_targeted.version = TARGETED_VERSION;
        for definition in [retained_targeted, new_file_only, new_targeted] {
            let grant = GrantId::new(definition.id.as_str()).unwrap();
            for (arguments, auxiliary) in &cases {
                operation.record.input = invocation(definition.clone(), &id, arguments.clone());
                operation.record.grants.grants = vec![grant.clone()];
                assert_eq!(unconfirmed(&operation, &turn), *auxiliary);
            }
        }

        let mut wrong_definition = workbench_show_definition().unwrap();
        wrong_definition.description = "Unexpected workbench presentation".into();
        operation.record.input = invocation(wrong_definition, &id, cases[0].0.clone());
        assert!(!unconfirmed(&operation, &turn));

        operation.record.input = invocation(
            workbench_show_definition().unwrap(),
            &id,
            cases[0].0.clone(),
        );
        operation.record.grants.grants = vec![GrantId::new(OPEN).unwrap()];
        assert!(!unconfirmed(&operation, &turn));
    }
}
