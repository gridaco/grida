//! Tools offered only to work reserved against a particular goal basis.

use super::{Basis, Goal, MAX_CRITERIA, MAX_PROGRESS_BYTES, Report, Status, problem};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{
    Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition, ToolOutcome,
};
use agent_kit_core::turn::{OperationInput, OperationOutcome, OperationState};
use agent_kit_core::{
    BoxFuture, Envelope, ErrorKind, OperationId, Result, SchemaId, ToolId, TurnId,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeSet;
use std::sync::Arc;

const INSPECT: &str = "goal_inspect";
const REPORT: &str = "goal_report";
const REPORT_SCHEMA: &str = "grida.agent.goal.report";
const MAX_REPORT_BYTES: usize = 16 * 1024;

pub(super) fn is_goal_tool(id: &ToolId) -> bool {
    matches!(id.as_str(), INSPECT | REPORT)
}

/// The host still assigns grants and installs the tools in the selected turn.
pub fn for_work(goal: &Goal, turn: &TurnId) -> Result<[Arc<dyn Tool>; 2]> {
    if goal.paused()
        || goal.status() != Status::Active
        || goal
            .reservation()
            .is_none_or(|work| &work.turn != turn || &work.basis != goal.basis())
    {
        return Err(problem(ErrorKind::Conflict, "goal_tool_work_mismatch"));
    }
    let goal = Arc::new(goal.clone());
    Ok([
        Arc::new(GoalTool::new(Kind::Inspect, goal.clone(), turn.clone())?),
        Arc::new(GoalTool::new(Kind::Report, goal, turn.clone())?),
    ])
}

/// Read a successful report from its exact recorded tool operation. Reports
/// from another turn or a superseded goal basis confer no goal authority.
pub fn read_report(
    operation: &OperationState,
    turn: &TurnId,
    basis: &Basis,
) -> Result<Option<Report>> {
    let OperationInput::Tool(invocation) = &operation.record.input else {
        return Ok(None);
    };
    if invocation.definition().id.as_str() != REPORT {
        return Ok(None);
    }
    let Some(OperationOutcome::Tool(outcome)) = operation.outcome() else {
        return Ok(None);
    };
    if outcome.status != OutcomeStatus::Succeeded {
        return Ok(None);
    }
    let receipt = outcome
        .receipt
        .as_ref()
        .filter(|receipt| {
            receipt.schema().as_str() == REPORT_SCHEMA
                && receipt.version() == 1
                && receipt.bytes().len() <= MAX_REPORT_BYTES
        })
        .ok_or_else(invalid_receipt)?;
    let record: Record = serde_json::from_slice(receipt.bytes()).map_err(|_| invalid_receipt())?;
    if &record.operation != invocation.id() || record.operation != operation.record.id {
        return Err(invalid_receipt());
    }
    if &record.turn != turn || &record.basis != basis {
        return Ok(None);
    }
    let ToolArguments::Json(arguments) = invocation.arguments() else {
        return Err(invalid_receipt());
    };
    let expected = parse_report(arguments).map_err(|_| invalid_receipt())?;
    if record.report != expected {
        return Err(invalid_receipt());
    }
    Ok(Some(record.report))
}

#[derive(Clone, Copy)]
enum Kind {
    Inspect,
    Report,
}

struct GoalTool {
    kind: Kind,
    goal: Arc<Goal>,
    turn: TurnId,
    definition: ToolDefinition,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReportArguments {
    report: Report,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    operation: OperationId,
    turn: TurnId,
    basis: Basis,
    report: Report,
}

impl GoalTool {
    fn new(kind: Kind, goal: Arc<Goal>, turn: TurnId) -> Result<Self> {
        let (name, description, schema) = match kind {
            Kind::Inspect => (
                INSPECT,
                "Read the goal, its success criteria, progress, and remaining allowance captured for this work turn.",
                json!({"type":"object", "properties":{}, "additionalProperties":false}),
            ),
            Kind::Report => {
                let description = if goal.user_review_enabled() {
                    "Record progress, a blocker, evidence for verified completion, or a ready_for_review proposal. Use ready_for_review when the person should check the completed work against the goal criteria. Summarize the evidence they should inspect and mention any limitations. Call once. A proposal does not complete the goal."
                } else {
                    "Record a progress, blocked, or completion proposal for this goal. Call once when this work turn has collected its evidence. For completion cite a tool call ID from this turn for each numbered success criterion. The proposal does not change the goal."
                };
                (
                    REPORT,
                    description,
                    report_schema(goal.user_review_enabled()),
                )
            }
        };
        Ok(Self {
            kind,
            goal,
            turn,
            definition: ToolDefinition {
                id: ToolId::new(name)?,
                version: 1,
                description: description.into(),
                input: InputFormat::Json(schema),
                max_input_bytes: MAX_REPORT_BYTES,
                max_output_bytes: 64 * 1024,
                recovery: RecoveryKind::Unavailable,
            },
        })
    }

    fn report(&self, value: &Value) -> Result<Report> {
        let report = parse_report(value)?;
        if matches!(report, Report::ReadyForReview { .. }) && !self.goal.user_review_enabled() {
            return Err(invalid_arguments());
        }
        if let Report::Completion { evidence, .. } = &report {
            let covered: BTreeSet<_> = evidence
                .iter()
                .map(|entry| usize::from(entry.criterion))
                .collect();
            if evidence.len() != covered.len()
                || !covered
                    .iter()
                    .copied()
                    .eq(1..=self.goal.objective().criteria.len())
            {
                return Err(problem(
                    ErrorKind::InvalidInput,
                    "goal_report_criteria_incomplete",
                ));
            }
        }
        Ok(report)
    }

    fn execute(&self, invocation: &Invocation) -> Result<ToolOutcome> {
        let ToolArguments::Json(value) = invocation.arguments() else {
            return Err(invalid_arguments());
        };
        match self.kind {
            Kind::Inspect => {
                if !value.as_object().is_some_and(|object| object.is_empty()) {
                    return Err(invalid_arguments());
                }
                let snapshot = json!({
                    "basis": self.goal.basis(),
                    "objective": self.goal.objective(),
                    "status": self.goal.status(),
                    "progress": self.goal.progress(),
                    "allowance": self.goal.allowance(),
                    "spent": self.goal.spent(),
                    "remaining": self.goal.remaining(),
                    "reserved": self.goal.reservation(),
                });
                Ok(success("Captured goal state", Some(snapshot), None))
            }
            Kind::Report => {
                let report = self.report(value)?;
                let bytes = serde_json::to_vec(&Record {
                    operation: invocation.id().clone(),
                    turn: self.turn.clone(),
                    basis: self.goal.basis().clone(),
                    report,
                })
                .map_err(|_| invalid_receipt())?;
                if bytes.len() > MAX_REPORT_BYTES {
                    return Err(problem(ErrorKind::LimitExceeded, "goal_report_limit"));
                }
                let receipt = Envelope::new(SchemaId::new(REPORT_SCHEMA)?, 1, bytes)?;
                Ok(success(
                    "Goal proposal recorded for settlement. Goal state changes only after evaluation.",
                    None,
                    Some(receipt),
                ))
            }
        }
    }
}

impl Tool for GoalTool {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        let ToolArguments::Json(value) = arguments else {
            return Err(invalid_arguments());
        };
        match self.kind {
            Kind::Inspect if value.as_object().is_some_and(|object| object.is_empty()) => Ok(()),
            Kind::Inspect => Err(invalid_arguments()),
            Kind::Report => self.report(value).map(|_| ()),
        }
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
                    content: vec![],
                    structured: None,
                    receipt: None,
                    truncated: false,
                };
            }
            self.execute(&invocation)
                .unwrap_or_else(|error| ToolOutcome::failed(&error.code))
        })
    }
}

fn report_schema(user_review: bool) -> Value {
    let summary = json!({"type":"string", "minLength":1, "maxLength":MAX_PROGRESS_BYTES});
    let mut schema = json!({"type":"object", "required":["report"], "additionalProperties":false, "properties":{
        "report":{"oneOf":[
            {"type":"object", "required":["kind","summary"], "additionalProperties":false,
                "properties":{"kind":{"const":"progress"},"summary":summary}},
            {"type":"object", "required":["kind","reason","summary"], "additionalProperties":false,
                "properties":{"kind":{"const":"blocked"},"summary":summary,
                    "reason":{"enum":["needs_input","capability_unavailable"]}}},
            {"type":"object", "required":["kind","summary","evidence"], "additionalProperties":false,
                "properties":{"kind":{"const":"completion"},"summary":summary,
                    "evidence":{"type":"array","minItems":1,"maxItems":MAX_CRITERIA,
                        "items":{"type":"object","required":["criterion","call"],"additionalProperties":false,
                            "properties":{"criterion":{"type":"integer","minimum":1,"maximum":MAX_CRITERIA},
                                "call":{"type":"string","minLength":1}}}}}}
        ]}
    }});
    if user_review {
        schema["properties"]["report"]["oneOf"]
            .as_array_mut()
            .expect("goal report alternatives")
            .push(
                json!({"type":"object", "required":["kind","summary"], "additionalProperties":false,
                "properties":{"kind":{"const":"ready_for_review"},"summary":summary}}),
            );
    }
    schema
}

fn success(text: &str, structured: Option<Value>, receipt: Option<Envelope>) -> ToolOutcome {
    ToolOutcome {
        status: OutcomeStatus::Succeeded,
        content: vec![ResultContent::Text(text.into())],
        structured,
        receipt,
        truncated: false,
    }
}

fn invalid_arguments() -> agent_kit_core::Error {
    problem(ErrorKind::InvalidInput, "goal_tool_arguments_invalid")
}
fn invalid_receipt() -> agent_kit_core::Error {
    problem(ErrorKind::InvalidState, "goal_report_receipt_invalid")
}

fn parse_report(value: &Value) -> Result<Report> {
    let arguments: ReportArguments =
        serde_json::from_value(value.clone()).map_err(|_| invalid_arguments())?;
    arguments.report.normalized()
}
