//! Product effort and the generation allowance selected for one turn.

use crate::subagents::INFERENCE_STEPS_PER_ASSIGNMENT;
use agent_kit_core::authority::GrantSelection;
use agent_kit_core::inference::{InputFormat, ModelCapabilities, ToolOffer};
use agent_kit_core::tools::InventorySnapshot;
use agent_kit_core::{Error, ErrorKind, Fingerprint, PrincipalId, Result, ScopeId, ToolId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::num::NonZeroU32;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Preset {
    #[default]
    Standard,
    Ultra,
}

/// The host selects the ceiling and supplies any already funded child offer.
/// That offer must enforce a single child assignment across the turn, including
/// replay and repeated tool calls. The policy reserves the same share from
/// the total generation allowance and grants no additional tool authority.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Policy {
    parent_generation_steps: NonZeroU32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    delegation: Option<Delegation>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Delegation {
    tool: ToolId,
    definition: Fingerprint,
    principal: PrincipalId,
    scope: ScopeId,
    generation_steps: u32,
}

impl Policy {
    pub fn capture(
        preset: Preset,
        standard_steps: NonZeroU32,
        total_steps: NonZeroU32,
        delegation: Option<(&ToolOffer, &GrantSelection)>,
    ) -> Result<Self> {
        let (parent_generation_steps, delegation) = match preset {
            Preset::Standard => (standard_steps.min(total_steps), None),
            Preset::Ultra => {
                let (offer, grant) = delegation.ok_or_else(delegation_unavailable)?;
                let parent = total_steps
                    .get()
                    .checked_sub(INFERENCE_STEPS_PER_ASSIGNMENT)
                    .and_then(NonZeroU32::new)
                    .filter(|steps| *steps > standard_steps)
                    .ok_or_else(allowance_unavailable)?;
                (
                    parent,
                    Some(Delegation {
                        tool: offer.id.clone(),
                        definition: offer.fingerprint,
                        principal: grant.authority.principal.clone(),
                        scope: grant.authority.scope.clone(),
                        generation_steps: INFERENCE_STEPS_PER_ASSIGNMENT,
                    }),
                )
            }
        };
        Ok(Self {
            parent_generation_steps,
            delegation,
        })
    }

    pub fn preset(&self) -> Preset {
        if self.delegation.is_some() {
            Preset::Ultra
        } else {
            Preset::Standard
        }
    }

    pub fn parent_generation_steps(&self) -> u32 {
        self.parent_generation_steps.get()
    }

    pub fn reserved_child_generation_steps(&self) -> u32 {
        self.delegation
            .as_ref()
            .map_or(0, |child| child.generation_steps)
    }

    pub(super) fn verify_offer(
        &self,
        inventory: &InventorySnapshot,
        grants: &BTreeMap<ToolId, GrantSelection>,
        capabilities: &ModelCapabilities,
    ) -> Result<()> {
        let Some(child) = &self.delegation else {
            return Ok(());
        };
        let offer = inventory
            .offers()?
            .into_iter()
            .find(|offer| offer.id == child.tool && offer.fingerprint == child.definition)
            .ok_or_else(delegation_unavailable)?;
        let supported = match offer.input {
            InputFormat::Json(_) => capabilities.json_tools,
            InputFormat::Text => capabilities.text_tools,
        };
        let authorized = grants.get(&child.tool).is_some_and(|grant| {
            grant.authority.principal == child.principal && grant.authority.scope == child.scope
        });
        if !supported || !authorized {
            return Err(delegation_unavailable());
        }
        Ok(())
    }

    pub(super) fn apply(&self, config: &mut crate::MasterConfig) -> Result<()> {
        let steps = self.parent_generation_steps();
        if let Some(child) = &self.delegation {
            if steps <= config.max_steps
                || child.generation_steps != INFERENCE_STEPS_PER_ASSIGNMENT
                || steps.checked_add(child.generation_steps).is_none()
            {
                return Err(allowance_unavailable());
            }
            if !config.instructions.is_empty() {
                config.instructions.push_str("\n\n");
            }
            write!(
                config.instructions,
                "Ultra effort is active. Look early for independent investigation, alternatives, or verification that could improve the result. Use {} to delegate one bounded assignment when it would help. State its objective and expected evidence, continue useful work yourself, and integrate or qualify the findings before finishing. Keep the active operating mode and grants. In Plan, delegate investigation or review only. Finish directly when independent work would add little value.",
                child.tool
            )
            .expect("writing to a string cannot fail");
        } else if steps > config.max_steps {
            return Err(allowance_unavailable());
        }
        config.max_steps = steps;
        Ok(())
    }
}

fn delegation_unavailable() -> Error {
    Error::new(ErrorKind::Unavailable, "ultra_delegation_unavailable")
}

fn allowance_unavailable() -> Error {
    Error::new(ErrorKind::LimitExceeded, "effort_allowance_unavailable")
}
