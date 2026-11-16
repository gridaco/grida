//! GRIDA-SEC-004 — general delegation choices and correlated completion evidence.

use agent_kit_core::authority::GrantSelection;
use agent_kit_core::inference::{InputFormat, ModelCapabilities, ToolOffer};
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::tools::{InventorySnapshot, ToolDefinition, ToolOutcome};
use agent_kit_core::turn::{OperationInput, OperationOutcome, TurnState};
use agent_kit_core::{
    ChangeId, Error, ErrorKind, Fingerprint, GrantId, PrincipalId, Result, ScopeId, SessionId,
    ToolId, TurnId,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;

/// Role instructions selected by the product; the host supplies capabilities.
pub const WORKER_INSTRUCTIONS: &str = "You are a delegated worker. Complete the bounded assignment with the capabilities offered here. Coordinate shared resources through the parent. If an action is refused or needs approval, report it to the parent; do not bypass the refusal. Processes you start belong to this assignment and are stopped before the parent can collect its result. The parent must own any work intended to continue beyond this assignment; return what it needs to start or manage that work itself. Return the result, evidence, and any remaining limitations.";

pub const SPAWN: &str = "spawn_agent";
pub const SEND: &str = "send_agent_message";
pub const WAIT: &str = "wait_agent";
pub const STOP: &str = "stop_agent";
pub const MAX_CHILDREN: usize = 8;
pub const CHILD_STEPS: u32 = 8;
pub const RESERVED_CHILD_STEPS: u32 = MAX_CHILDREN as u32 * CHILD_STEPS;
const ROLES: [&str; 4] = [SPAWN, SEND, WAIT, STOP];

/// Product choices captured before accepting input. The host supplies the
/// operations, enforces their limits, and retains this policy with that input.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Policy {
    tools: Vec<CapturedTool>,
    max_children: u8,
    child_generation_steps: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct CapturedTool {
    id: ToolId,
    definition: Fingerprint,
    principal: PrincipalId,
    scope: ScopeId,
    grants: Vec<GrantId>,
}

/// An accepted assignment, rather than merely a child's most recent result.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Assignment {
    pub child: SessionId,
    pub input: ChangeId,
    pub turn: TurnId,
}

/// Certainty that an assignment's owned resources have permanently retired.
/// A verified native proof remains valid because one-shot work cannot reopen
/// that resource owner. An empty live resource view alone supplies no proof.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResourceStatus {
    Verified,
    Uncertain,
}

impl ResourceStatus {
    fn join(self, other: Self) -> Self {
        if self == Self::Verified || other == Self::Verified {
            Self::Verified
        } else {
            Self::Uncertain
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssignmentEvidence {
    pub assignment: Assignment,
    /// None means no authoritative terminal result was collected by the parent.
    pub collected: Option<OutcomeStatus>,
    /// Kept separate from the immutable task outcome. Missing legacy evidence
    /// cannot establish resource retirement for a collected assignment.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resource_status: Option<ResourceStatus>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Evidence {
    pub assignments: Vec<AssignmentEvidence>,
}

impl Evidence {
    pub fn has_pending(&self) -> bool {
        self.assignments.iter().any(|work| work.collected.is_none())
    }

    pub fn has_uncertain(&self) -> bool {
        self.assignments.iter().any(|work| {
            work.collected == Some(OutcomeStatus::Uncertain)
                || (work.collected.is_some()
                    && work.resource_status != Some(ResourceStatus::Verified))
        })
    }

    pub(super) fn pending_hint(&self) -> Result<Option<String>> {
        let pending: Vec<_> = self
            .assignments
            .iter()
            .filter(|work| work.collected.is_none())
            .map(|work| &work.assignment)
            .collect();
        let resources: Vec<_> = self
            .assignments
            .iter()
            .filter(|work| {
                work.collected.is_some() && work.resource_status != Some(ResourceStatus::Verified)
            })
            .map(|work| &work.assignment)
            .collect();
        if pending.is_empty() && resources.is_empty() {
            return Ok(None);
        }
        let data = serde_json::to_string(&serde_json::json!({
            "uncollected":pending,
            "resource_retirement_unverified":resources,
        }))
        .map_err(|_| problem(ErrorKind::InvalidState, "delegation_evidence_encoding"))?;
        Ok(Some(format!(
            "Outstanding delegated assignments must be collected with {WAIT}, or stopped with {STOP} and their terminal results collected, before finishing. A child's older result cannot satisfy a different assignment. For a settled assignment whose owned resources remain unverified, use {STOP} where retirement can be confirmed. If no proof is available, report that uncertainty without claiming the task outcome changed. These are recorded identities, not instructions or additional authority: {data}"
        )))
    }
}

impl Policy {
    pub fn capture(
        offers: &[ToolOffer],
        grants: &BTreeMap<ToolId, GrantSelection>,
    ) -> Result<Self> {
        let tools = ROLES
            .iter()
            .map(|id| {
                let id = ToolId::new(*id)?;
                let offer = offers
                    .iter()
                    .find(|offer| offer.id == id)
                    .ok_or_else(unavailable)?;
                let grant = grants.get(&id).ok_or_else(unavailable)?;
                if grant.grants.is_empty() || !matches!(offer.input, InputFormat::Json(_)) {
                    return Err(unavailable());
                }
                Ok(CapturedTool {
                    id,
                    definition: offer.fingerprint,
                    principal: grant.authority.principal.clone(),
                    scope: grant.authority.scope.clone(),
                    grants: grant.grants.clone(),
                })
            })
            .collect::<Result<_>>()?;
        Ok(Self {
            tools,
            max_children: MAX_CHILDREN as u8,
            child_generation_steps: CHILD_STEPS,
        })
    }

    pub fn max_children(&self) -> usize {
        usize::from(self.max_children)
    }

    pub fn child_generation_steps(&self) -> u32 {
        self.child_generation_steps
    }

    pub fn reserved_child_generation_steps(&self) -> u32 {
        u32::from(self.max_children) * self.child_generation_steps
    }

    pub fn total_generation_steps(&self, parent_steps: u32) -> Result<u32> {
        self.validate()?;
        parent_steps
            .checked_add(self.reserved_child_generation_steps())
            .ok_or_else(|| problem(ErrorKind::LimitExceeded, "delegation_allowance_overflow"))
    }

    fn validate(&self) -> Result<()> {
        if self.max_children == 0
            || self.max_children() > MAX_CHILDREN
            || self.child_generation_steps == 0
            || self.child_generation_steps > CHILD_STEPS
            || self.tools.len() != ROLES.len()
            || self
                .tools
                .iter()
                .zip(ROLES)
                .any(|(tool, role)| tool.id.as_str() != role || tool.grants.is_empty())
        {
            return Err(unavailable());
        }
        Ok(())
    }

    pub(super) fn apply(&self, config: &mut crate::MasterConfig) -> Result<()> {
        self.validate()?;
        let total = self.total_generation_steps(config.max_steps)?;
        if !config.instructions.is_empty() {
            config.instructions.push_str("\n\n");
        }
        write!(
            config.instructions,
            "General subagent tools are available independently of reasoning effort. Use {SPAWN} for a bounded independently useful assignment, especially when the person explicitly requests delegation. Give each child a clear objective, relevant context and the evidence it should return. You remain responsible for integrating the results. Continue useful work yourself, then use {WAIT} to collect each exact assignment's result before finishing. {SEND} supplies information without starting another assignment. {STOP} stops a child's current work; collect its terminal result and report unfinished or uncertain work honestly. Waiting is observation, not permission to start or resume work. Children receive only their declared capabilities and cannot delegate again. This turn permits at most {} children with at most {} model requests each, reserving {} child requests alongside {} parent requests ({} total); creating another child or changing its name cannot reset those limits. Respect the active operating mode and captured grants.",
            self.max_children(),
            self.child_generation_steps(),
            self.reserved_child_generation_steps(),
            config.max_steps,
            total,
        )
        .expect("writing to a string cannot fail");
        Ok(())
    }

    pub(super) fn verify_offer(
        &self,
        inventory: &InventorySnapshot,
        grants: &BTreeMap<ToolId, GrantSelection>,
        capabilities: &ModelCapabilities,
    ) -> Result<()> {
        self.validate()?;
        if !capabilities.json_tools {
            return Err(unavailable());
        }
        let offers = inventory.offers()?;
        for selected in &self.tools {
            if !offers
                .iter()
                .any(|offer| offer.id == selected.id && offer.fingerprint == selected.definition)
                || !grants
                    .get(&selected.id)
                    .is_some_and(|grant| selected.accepts_grant(grant))
            {
                return Err(unavailable());
            }
        }
        Ok(())
    }

    pub(super) fn evidence(
        &self,
        state: &TurnState,
        grants: &BTreeMap<ToolId, GrantSelection>,
    ) -> Result<Evidence> {
        self.receipts(
            state.operations().values().filter_map(|operation| {
                let OperationInput::Tool(invocation) = &operation.record.input else {
                    return None;
                };
                let OperationOutcome::Tool(outcome) = operation.outcome()? else {
                    return None;
                };
                Some((invocation.definition(), &operation.record.grants, outcome))
            }),
            grants,
        )
    }

    fn receipts<'a>(
        &self,
        receipts: impl Iterator<Item = (&'a ToolDefinition, &'a GrantSelection, &'a ToolOutcome)>,
        grants: &BTreeMap<ToolId, GrantSelection>,
    ) -> Result<Evidence> {
        self.validate()?;
        let mut assignments = BTreeSet::new();
        let mut collected: BTreeMap<Assignment, (OutcomeStatus, ResourceStatus)> = BTreeMap::new();
        for (definition, grant, outcome) in receipts {
            if outcome.status != OutcomeStatus::Succeeded {
                continue;
            }
            let fingerprint = definition.offer()?.fingerprint;
            let Some(selected) = self.tools.iter().find(|selected| {
                selected.id == definition.id
                    && selected.definition == fingerprint
                    && selected.accepts_grant(grant)
                    && grants.get(&definition.id) == Some(grant)
            }) else {
                continue;
            };
            if selected.id.as_str() == SEND {
                // Informational delivery does not create or complete work.
                continue;
            }
            let value = outcome.structured.as_ref().ok_or_else(invalid_receipt)?;
            match selected.id.as_str() {
                SPAWN => {
                    let assignment: Assignment = serde_json::from_value(
                        value
                            .get("assignment")
                            .cloned()
                            .ok_or_else(invalid_receipt)?,
                    )
                    .map_err(|_| invalid_receipt())?;
                    assignments.insert(assignment);
                    if assignments.len() > self.max_children() {
                        return Err(problem(ErrorKind::LimitExceeded, "delegation_child_limit"));
                    }
                }
                WAIT | STOP => {
                    let values = value
                        .get("collected")
                        .and_then(serde_json::Value::as_array)
                        .ok_or_else(invalid_receipt)?;
                    if values.len() > self.max_children() {
                        return Err(invalid_receipt());
                    }
                    for result in values {
                        if result
                            .get("disposition")
                            .and_then(serde_json::Value::as_str)
                            != Some("settled")
                        {
                            return Err(invalid_receipt());
                        }
                        let assignment: Assignment = serde_json::from_value(serde_json::json!({
                            "child": result.get("child"),
                            "input": result.get("input"),
                            "turn": result.get("turn"),
                        }))
                        .map_err(|_| invalid_receipt())?;
                        let status: OutcomeStatus = serde_json::from_value(
                            result.get("status").cloned().ok_or_else(invalid_receipt)?,
                        )
                        .map_err(|_| invalid_receipt())?;
                        let resources: ResourceStatus = serde_json::from_value(
                            result
                                .get("resource_status")
                                .cloned()
                                .ok_or_else(invalid_receipt)?,
                        )
                        .map_err(|_| invalid_receipt())?;
                        if let Some((previous_status, previous_resources)) =
                            collected.get_mut(&assignment)
                        {
                            if *previous_status != status {
                                return Err(invalid_receipt());
                            }
                            *previous_resources = previous_resources.join(resources);
                        } else {
                            collected.insert(assignment, (status, resources));
                        }
                    }
                }
                _ => return Err(invalid_receipt()),
            }
        }
        Ok(Evidence {
            assignments: assignments
                .into_iter()
                .map(|assignment| AssignmentEvidence {
                    collected: collected.get(&assignment).map(|(status, _)| *status),
                    resource_status: collected.get(&assignment).map(|(_, resources)| *resources),
                    assignment,
                })
                .collect(),
        })
    }
}

impl CapturedTool {
    fn accepts_grant(&self, grant: &GrantSelection) -> bool {
        self.principal == grant.authority.principal
            && self.scope == grant.authority.scope
            && self.grants == grant.grants
    }
}

fn unavailable() -> Error {
    problem(ErrorKind::Unavailable, "general_delegation_unavailable")
}

fn invalid_receipt() -> Error {
    problem(ErrorKind::Uncertain, "delegation_receipt_invalid")
}

fn problem(kind: ErrorKind, code: &str) -> Error {
    Error::new(kind, code)
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::BindingId;
    use agent_kit_core::authority::AuthorityBinding;
    use agent_kit_core::tools::RecoveryKind;
    use serde_json::json;

    fn tools() -> (Vec<ToolDefinition>, BTreeMap<ToolId, GrantSelection>) {
        let definitions: Vec<_> = ROLES
            .iter()
            .map(|name| ToolDefinition {
                id: ToolId::new(*name).unwrap(),
                version: 1,
                description: format!("Perform {name}"),
                input: InputFormat::Json(json!({"type":"object"})),
                max_input_bytes: 4096,
                max_output_bytes: 4096,
                recovery: RecoveryKind::Reconcile,
            })
            .collect();
        let grants = definitions
            .iter()
            .map(|tool| {
                (
                    tool.id.clone(),
                    GrantSelection {
                        authority: AuthorityBinding {
                            principal: PrincipalId::new("owner").unwrap(),
                            binding: BindingId::new("turn-bound").unwrap(),
                            scope: ScopeId::new("general-children").unwrap(),
                        },
                        grants: vec![GrantId::new(tool.id.as_str()).unwrap()],
                    },
                )
            })
            .collect();
        (definitions, grants)
    }

    fn capture(tools: &[ToolDefinition], grants: &BTreeMap<ToolId, GrantSelection>) -> Policy {
        Policy::capture(
            &tools
                .iter()
                .map(|tool| tool.offer().unwrap())
                .collect::<Vec<_>>(),
            grants,
        )
        .unwrap()
    }

    fn outcome(value: serde_json::Value) -> ToolOutcome {
        ToolOutcome {
            status: OutcomeStatus::Succeeded,
            content: vec![],
            structured: Some(value),
            receipt: None,
            truncated: false,
        }
    }

    fn assignment(index: usize) -> serde_json::Value {
        json!({"child":format!("child-{index}"),"input":format!("input-{index}"),"turn":format!("turn-{index}")})
    }

    fn terminal(index: usize, status: &str) -> serde_json::Value {
        let mut result = assignment(index);
        result["disposition"] = json!("settled");
        result["status"] = json!(status);
        result["resource_status"] = json!("verified");
        result
    }

    #[test]
    fn general_delegation_captures_a_separate_bounded_allowance_without_ultra() {
        let (tools, grants) = tools();
        let policy = capture(&tools, &grants);
        assert_eq!(policy.max_children(), 8);
        assert_eq!(policy.child_generation_steps(), 8);
        assert_eq!(policy.reserved_child_generation_steps(), 64);
        assert_eq!(policy.total_generation_steps(32).unwrap(), 96);
        assert_eq!(
            policy.total_generation_steps(u32::MAX).unwrap_err().code,
            "delegation_allowance_overflow"
        );
        assert_eq!(
            serde_json::from_str::<Policy>(&serde_json::to_string(&policy).unwrap()).unwrap(),
            policy
        );
        let mut missing = grants.clone();
        missing.remove(&tools[3].id);
        assert!(
            Policy::capture(
                &tools
                    .iter()
                    .map(|tool| tool.offer().unwrap())
                    .collect::<Vec<_>>(),
                &missing,
            )
            .is_err()
        );
    }

    #[test]
    fn five_assignments_require_results_for_the_exact_child_turn_and_input() {
        let (tools, grants) = tools();
        let policy = capture(&tools, &grants);
        let spawned: Vec<_> = (0..5)
            .map(|index| outcome(json!({"assignment":assignment(index)})))
            .collect();
        let mut stale = terminal(4, "succeeded");
        stale["input"] = json!("earlier-input");
        let collected = outcome(
            json!({"collected":[terminal(0,"succeeded"),terminal(1,"failed"),terminal(2,"cancelled"),terminal(3,"succeeded"),stale]}),
        );
        let receipts = spawned
            .iter()
            .map(|value| (&tools[0], &grants[&tools[0].id], value));
        let evidence = policy
            .receipts(
                receipts.chain(std::iter::once((
                    &tools[2],
                    &grants[&tools[2].id],
                    &collected,
                ))),
                &grants,
            )
            .unwrap();
        assert_eq!(evidence.assignments.len(), 5);
        assert!(evidence.has_pending());
        assert_eq!(
            evidence
                .assignments
                .iter()
                .filter(|work| work.collected.is_none())
                .count(),
            1
        );
        assert!(
            evidence
                .pending_hint()
                .unwrap()
                .unwrap()
                .contains("child-4")
        );
        let actual = outcome(json!({"collected":[terminal(4,"succeeded")]}));
        let evidence = policy
            .receipts(
                spawned
                    .iter()
                    .map(|value| (&tools[0], &grants[&tools[0].id], value))
                    .chain([
                        (&tools[2], &grants[&tools[2].id], &collected),
                        (&tools[2], &grants[&tools[2].id], &actual),
                    ]),
                &grants,
            )
            .unwrap();
        assert!(!evidence.has_pending());
        assert!(!evidence.has_uncertain());
    }

    #[test]
    fn a_result_from_another_definition_or_binding_does_not_complete_an_assignment() {
        let (tools, grants) = tools();
        let policy = capture(&tools, &grants);
        let spawned = outcome(json!({"assignment":assignment(0)}));
        let collected = outcome(json!({"collected":[terminal(0,"succeeded")]}));
        let mut other_definition = tools[2].clone();
        other_definition.version += 1;
        let mut other_grant = grants[&tools[2].id].clone();
        other_grant.authority.binding = BindingId::new("another-turn").unwrap();
        let evidence = policy
            .receipts(
                [
                    (&tools[0], &grants[&tools[0].id], &spawned),
                    (&other_definition, &grants[&tools[2].id], &collected),
                    (&tools[2], &other_grant, &collected),
                ]
                .into_iter(),
                &grants,
            )
            .unwrap();
        assert!(evidence.has_pending());
    }

    #[test]
    fn malformed_authoritative_receipts_cannot_manufacture_completion() {
        let (tools, grants) = tools();
        let policy = capture(&tools, &grants);
        for value in [json!({}), json!({"assignment":{"child":"child"}})] {
            let receipt = outcome(value);
            assert_eq!(
                policy
                    .receipts(
                        std::iter::once((&tools[0], &grants[&tools[0].id], &receipt)),
                        &grants,
                    )
                    .unwrap_err()
                    .code,
                "delegation_receipt_invalid"
            );
        }
    }

    #[test]
    fn an_uncertain_collected_result_remains_explicit() {
        let (tools, grants) = tools();
        let policy = capture(&tools, &grants);
        let spawned = outcome(json!({"assignment":assignment(0)}));
        let collected = outcome(json!({"collected":[terminal(0,"uncertain")]}));
        let evidence = policy
            .receipts(
                [
                    (&tools[0], &grants[&tools[0].id], &spawned),
                    (&tools[3], &grants[&tools[3].id], &collected),
                ]
                .into_iter(),
                &grants,
            )
            .unwrap();
        assert!(!evidence.has_pending());
        assert!(evidence.has_uncertain());
    }

    #[test]
    fn resource_proof_is_required_and_task_outcomes_remain_immutable() {
        let (tools, grants) = tools();
        let policy = capture(&tools, &grants);
        let spawned = outcome(json!({"assignment":assignment(0)}));
        let mut missing = terminal(0, "cancelled");
        missing.as_object_mut().unwrap().remove("resource_status");
        let missing = outcome(json!({"collected":[missing]}));
        assert_eq!(
            policy
                .receipts(
                    [
                        (&tools[0], &grants[&tools[0].id], &spawned),
                        (&tools[2], &grants[&tools[2].id], &missing),
                    ]
                    .into_iter(),
                    &grants
                )
                .unwrap_err()
                .code,
            "delegation_receipt_invalid"
        );
        let cancelled = outcome(json!({"collected":[terminal(0,"cancelled")]}));
        let changed = outcome(json!({"collected":[terminal(0,"failed")]}));
        assert_eq!(
            policy
                .receipts(
                    [
                        (&tools[0], &grants[&tools[0].id], &spawned),
                        (&tools[2], &grants[&tools[2].id], &cancelled),
                        (&tools[3], &grants[&tools[3].id], &changed),
                    ]
                    .into_iter(),
                    &grants
                )
                .unwrap_err()
                .code,
            "delegation_receipt_invalid"
        );
    }

    #[test]
    fn verified_retirement_resolves_resource_uncertainty_independently_of_receipt_order() {
        let (tools, grants) = tools();
        let policy = capture(&tools, &grants);
        let spawned = outcome(json!({"assignment":assignment(0)}));
        let mut unresolved = terminal(0, "cancelled");
        unresolved["resource_status"] = json!("uncertain");
        let unresolved = outcome(json!({"collected":[unresolved]}));
        let stopped = outcome(json!({"collected":[terminal(0,"cancelled")]}));
        let stable = outcome(json!({"collected":[terminal(0,"cancelled")]}));
        let before = policy
            .receipts(
                [
                    (&tools[0], &grants[&tools[0].id], &spawned),
                    (&tools[2], &grants[&tools[2].id], &unresolved),
                ]
                .into_iter(),
                &grants,
            )
            .unwrap();
        assert!(!before.has_pending());
        assert!(before.has_uncertain());
        assert!(
            before
                .pending_hint()
                .unwrap()
                .unwrap()
                .contains("resource_retirement_unverified")
        );
        let receipts = [
            (&tools[2], &grants[&tools[2].id], &unresolved),
            (&tools[3], &grants[&tools[3].id], &stopped),
            (&tools[2], &grants[&tools[2].id], &stable),
        ];
        for order in [
            [0, 1, 2],
            [0, 2, 1],
            [1, 0, 2],
            [1, 2, 0],
            [2, 0, 1],
            [2, 1, 0],
        ] {
            let evidence = policy
                .receipts(
                    std::iter::once((&tools[0], &grants[&tools[0].id], &spawned))
                        .chain(order.into_iter().map(|index| receipts[index])),
                    &grants,
                )
                .unwrap();
            assert_eq!(
                evidence.assignments[0].collected,
                Some(OutcomeStatus::Cancelled)
            );
            assert_eq!(
                evidence.assignments[0].resource_status,
                Some(ResourceStatus::Verified)
            );
            assert!(!evidence.has_pending());
            assert!(!evidence.has_uncertain());
            assert!(evidence.pending_hint().unwrap().is_none());
        }
    }
}
