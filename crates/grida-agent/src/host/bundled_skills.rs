//! GRIDA-SEC-004 — Return the instructions of a bundled skill listed for this turn.
//!
//! Bundled skills are compiled into the host. The tool returns that fixed text
//! by name; it takes no path and reads no file, so the agent's file authority
//! never extends into the application's own locations.

use super::{AdmissionContext, ToolAdmission, ToolDecision, ToolGate, problem};
use crate::skills::{READ_SKILL, SkillListing, bundled_instructions};
use agent_kit_core::authority::{AuthorityBinding, GrantSelection};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{
    Inventory, Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition, ToolOutcome,
};
use agent_kit_core::turn::TurnBinding;
use agent_kit_core::{
    BindingId, BoxFuture, ErrorKind, Fingerprint, GrantId, PrincipalId, Result, ScopeId, ToolId,
};
use serde::Deserialize;
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

pub(super) struct TurnSkills {
    turn: TurnBinding,
    names: BTreeSet<String>,
    grants: GrantSelection,
    definition: ToolDefinition,
}

impl TurnSkills {
    /// The reader for this turn's listed bundled skills, or none when the
    /// listing names no bundled skill.
    pub(super) fn bind(listing: &SkillListing, turn: &TurnBinding) -> Result<Option<Arc<Self>>> {
        let names: BTreeSet<String> = listing.bundled().map(str::to_owned).collect();
        if names.is_empty() {
            return Ok(None);
        }
        let digest = Fingerprint::of(&(&turn.session, &turn.turn, &names))?;
        let binding =
            uuid::Uuid::from_bytes(digest.bytes()[..16].try_into().expect("fingerprint prefix"));
        Ok(Some(Arc::new(Self {
            turn: turn.clone(),
            grants: GrantSelection {
                authority: AuthorityBinding {
                    principal: PrincipalId::new("grida-local")?,
                    binding: BindingId::new(format!("bundled-skills/{binding}"))?,
                    scope: ScopeId::new(format!("skills/{}", turn.session))?,
                },
                grants: vec![GrantId::new("bundled-skill-read")?],
            },
            definition: ToolDefinition {
                id: ToolId::new(READ_SKILL)?,
                version: 1,
                description: "Read the full instructions of a bundled skill listed under Skills. Read a skill before following it.".into(),
                input: InputFormat::Json(json!({
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "enum": names.iter().collect::<Vec<_>>()}
                    },
                    "required": ["name"],
                    "additionalProperties": false
                })),
                max_input_bytes: 256,
                max_output_bytes: 48 * 1024,
                recovery: RecoveryKind::Repeatable,
            },
            names,
        })))
    }

    pub(super) fn handles(&self, selection: &GrantSelection) -> bool {
        selection == &self.grants
    }

    pub(super) fn insert(
        self: &Arc<Self>,
        inventory: &mut Inventory,
        grants: &mut BTreeMap<ToolId, GrantSelection>,
    ) -> Result<()> {
        inventory.insert(self.clone())?;
        grants.insert(self.definition.id.clone(), self.grants.clone());
        Ok(())
    }

    fn read(&self, arguments: &ToolArguments) -> Result<String> {
        let name = request(arguments)?.name;
        if !self.names.contains(&name) {
            return Err(problem(ErrorKind::InvalidInput, "skill_not_listed"));
        }
        bundled_instructions(&name)?
            .ok_or_else(|| problem(ErrorKind::Unavailable, "skill_unavailable"))
    }
}

impl ToolGate for TurnSkills {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
            if !self.handles(&admission.grants)
                || context.operations.view().state.binding() != &self.turn
                || admission.invocation.definition() != &self.definition
                || admission.invocation.id() != &admission.operation
            {
                return Err(denied());
            }
            Ok(ToolDecision::Permit)
        })
    }
}

impl Tool for TurnSkills {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        request(arguments).map(|_| ())
    }

    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            if context.cancellation.is_cancelled() {
                return ToolOutcome {
                    status: OutcomeStatus::Cancelled,
                    content: Vec::new(),
                    structured: None,
                    receipt: None,
                    truncated: false,
                };
            }
            match self.read(invocation.arguments()) {
                Ok(text) => ToolOutcome {
                    status: OutcomeStatus::Succeeded,
                    content: vec![ResultContent::Text(text)],
                    structured: None,
                    receipt: None,
                    truncated: false,
                },
                Err(error) => ToolOutcome::failed(&error.code),
            }
        })
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Read {
    name: String,
}

fn request(arguments: &ToolArguments) -> Result<Read> {
    let invalid = || problem(ErrorKind::InvalidInput, "skill_read_arguments_invalid");
    let ToolArguments::Json(value) = arguments else {
        return Err(invalid());
    };
    serde_json::from_value(value.clone()).map_err(|_| invalid())
}

fn denied() -> agent_kit_core::Error {
    problem(ErrorKind::InvalidInput, "skill_read_scope_mismatch")
}
