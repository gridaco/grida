//! One-shot timed continuation of an existing task.

use crate::{decode, encode, hex};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{
    Invocation, InvocationContext, InvocationRecovery, RecoveryKind, Tool, ToolDefinition,
    ToolOutcome,
};
use agent_kit_core::turn::{
    ControlRevision, OperationInput, OperationState, ResponseContract, TurnBinding, TurnState,
    WaitRecord,
};
use agent_kit_core::{
    BoxFuture, ChangeId, Envelope, Error, ErrorKind, Fingerprint, OperationId, Result, SchemaId,
    SessionId, ToolId, TurnId, WaitId,
};
use agent_kit_runtime::{ToolAdmission, ToolDecision, TurnOperations};
use serde::{Deserialize, Serialize};
use serde_json::json;

const TOOL: &str = "request_wakeup";
const REQUEST: &str = "grida.agent.wakeup";
const RESPONSE: &str = "grida.agent.wakeup.response";
const MAX_DELAY_MS: u64 = 7 * 24 * 60 * 60 * 1_000;
const MAX_TIMESTAMP_MS: u64 = 9_007_199_254_740_991;
const MAX_PROMPT_BYTES: usize = 4096;
const MAX_REASON_BYTES: usize = 256;
const MAX_REQUEST_BYTES: usize = 32 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WakeupRequest {
    pub delay_ms: u64,
    pub prompt: String,
    pub reason: String,
}

impl WakeupRequest {
    fn parse(arguments: &ToolArguments) -> Result<Self> {
        let ToolArguments::Json(value) = arguments else {
            return Err(invalid_request());
        };
        let request: Self = serde_json::from_value(value.clone()).map_err(|_| invalid_request())?;
        request.validate()?;
        Ok(request)
    }

    fn validate(&self) -> Result<()> {
        if !(1..=MAX_DELAY_MS).contains(&self.delay_ms)
            || self.prompt.trim().is_empty()
            || self.prompt.len() > MAX_PROMPT_BYTES
            || self.reason.trim().is_empty()
            || self.reason.len() > MAX_REASON_BYTES
        {
            return Err(invalid_request());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Wakeup {
    pub session: SessionId,
    pub turn: TurnId,
    pub operation: OperationId,
    pub requested_at_ms: u64,
    pub due_at_ms: u64,
    pub request: WakeupRequest,
    invocation: Fingerprint,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WakeupDisposition {
    Due,
    Cancelled,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct WakeupAnswer {
    wait: WaitId,
    disposition: WakeupDisposition,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Delivery {
    NotDue,
    Paused,
    AlreadyResolved,
    Resolve(Resolution),
}

#[derive(Debug, PartialEq, Eq)]
pub struct Resolution {
    pub request: ChangeId,
    pub wait: WaitId,
    pub expected_control: ControlRevision,
    pub answer: Envelope,
    pub can_wake: bool,
}

pub fn is_wakeup(wait: &WaitRecord) -> bool {
    wait.request.schema().as_str() == REQUEST
}

/// Decode a recorded schedule for a host timer or its inspecting client.
pub fn read_wakeup(wait: &WaitRecord) -> Result<Wakeup> {
    if !is_wakeup(wait)
        || wait.request.bytes().len() > MAX_REQUEST_BYTES
        || wait.response != response_contract()?
    {
        return Err(invalid_request());
    }
    let wakeup: Wakeup = decode(REQUEST, &wait.request)?;
    wakeup.request.validate()?;
    if wait.id != wait_id(&wakeup.session, &wakeup.turn)?
        || due_time(wakeup.requested_at_ms, wakeup.request.delay_ms)? != wakeup.due_at_ms
    {
        return Err(identity_changed());
    }
    Ok(wakeup)
}

/// Read only the matching recorded outcome; pending and withdrawn waits have none.
pub fn read_disposition(wait: &WaitRecord) -> Result<Option<WakeupDisposition>> {
    let Some(envelope) = &wait.answer else {
        return Ok(None);
    };
    if envelope.bytes().len() > 1024 {
        return Err(identity_changed());
    }
    let answer: WakeupAnswer = decode(RESPONSE, envelope)?;
    if answer.wait != wait.id || wait.withdrawn {
        return Err(identity_changed());
    }
    Ok(Some(answer.disposition))
}

/// Calculate an exact ordinary wait resolution from a committed task view.
/// The host still supplies current session revision and commits the control.
pub fn prepare_delivery(
    state: &TurnState,
    wait: &WaitId,
    disposition: WakeupDisposition,
    now_ms: u64,
) -> Result<Delivery> {
    let record = state.waits().get(wait).ok_or_else(unavailable)?;
    let wakeup = bound_wakeup(state, record)?;
    if let Some(recorded) = read_disposition(record)? {
        return if recorded == disposition {
            Ok(Delivery::AlreadyResolved)
        } else {
            Err(Error::new(ErrorKind::Conflict, "wakeup_already_resolved"))
        };
    }
    if record.withdrawn || state.controls().cancelled || state.outcome().is_some() {
        return Err(unavailable());
    }
    if disposition == WakeupDisposition::Due {
        if state.controls().paused {
            return Ok(Delivery::Paused);
        }
        if now_ms < wakeup.due_at_ms {
            return Ok(Delivery::NotDue);
        }
    }
    let answer = WakeupAnswer {
        wait: wait.clone(),
        disposition,
    };
    Ok(Delivery::Resolve(Resolution {
        request: ChangeId::new(hex(Fingerprint::of(&(RESPONSE, &answer))?))?,
        wait: wait.clone(),
        expected_control: state.controls().revision,
        answer: encode(RESPONSE, &answer)?,
        can_wake: disposition == WakeupDisposition::Due
            && state.controls().admits_work()
            && state
                .waits()
                .values()
                .all(|other| other.id == *wait || !other.is_pending()),
    }))
}

/// Invoke only after the host has authorized this scheduled capability. The
/// runtime still validates current dispatch grants when the wait is answered.
pub async fn defer_for_wakeup(
    admission: &ToolAdmission,
    operations: &TurnOperations,
    now_ms: u64,
) -> Result<Option<ToolDecision>> {
    let invocation = &admission.invocation;
    if invocation.definition().id.as_str() != TOOL {
        return Ok(None);
    }
    let view = operations.view();
    let state = &view.state;
    if &admission.operation != invocation.id()
        || !recorded_invocation(state, invocation)
            .is_some_and(|record| record.record.grants == admission.grants)
    {
        return Err(identity_changed());
    }
    let binding = state.binding();
    let id = wait_id(&binding.session, &binding.turn)?;
    if !state.waits().contains_key(&id) {
        let request = WakeupRequest::parse(invocation.arguments())?;
        let schedule = Wakeup {
            session: binding.session.clone(),
            turn: binding.turn.clone(),
            operation: invocation.id().clone(),
            requested_at_ms: now_ms,
            due_at_ms: due_time(now_ms, request.delay_ms)?,
            request,
            invocation: invocation.fingerprint(),
        };
        // Concurrent admissions use the same wait identity. A different
        // operation may never replace the first schedule.
        if let Err(error) = operations
            .request_input(WaitRecord {
                id: id.clone(),
                request: encode(REQUEST, &schedule)?,
                response: response_contract()?,
                answer: None,
                withdrawn: false,
            })
            .await
            && error.code != "wait_identity_reused"
        {
            return Err(error);
        }
    }
    let view = operations.view();
    let wait = view.state.waits().get(&id).ok_or_else(unavailable)?;
    let schedule = bound_wakeup(&view.state, wait)?;
    if &schedule.operation != invocation.id() || schedule.invocation != invocation.fingerprint() {
        return Err(Error::new(ErrorKind::LimitExceeded, "task_wakeup_limit"));
    }
    Ok(Some(if wait.is_pending() {
        ToolDecision::Defer(id)
    } else {
        ToolDecision::Permit
    }))
}

pub struct WakeupTool {
    operations: TurnOperations,
    definition: ToolDefinition,
}

impl WakeupTool {
    pub fn new(operations: TurnOperations) -> Result<Self> {
        Ok(Self {
            operations,
            definition: ToolDefinition {
                id: ToolId::new(TOOL)?, version: 1,
                description: "Schedule one timed wake-up for this task. The task suspends while waiting. Provide a brief reason and what to check when it resumes.".into(),
                input: InputFormat::Json(json!({
                    "type":"object", "properties": {
                        "delay_ms":{"type":"integer", "minimum":1, "maximum":MAX_DELAY_MS},
                        "reason":{"type":"string", "minLength":1, "maxLength":MAX_REASON_BYTES},
                        "prompt":{"type":"string", "minLength":1, "maxLength":MAX_PROMPT_BYTES},
                    },
                    "required":["delay_ms", "reason", "prompt"], "additionalProperties":false,
                })),
                max_input_bytes: MAX_REQUEST_BYTES,
                max_output_bytes: MAX_REQUEST_BYTES,
                recovery: RecoveryKind::Reconcile,
            },
        })
    }

    fn result(&self, invocation: &Invocation, context: &InvocationContext) -> Result<ToolOutcome> {
        let view = self.operations.view();
        let state = &view.state;
        let binding = state.binding();
        if invocation.definition() != &self.definition
            || !recorded_invocation(state, invocation)
                .and_then(|op| op.attempts.last())
                .is_some_and(|attempt| attempt.id == context.attempt)
        {
            return Err(identity_changed());
        }
        let id = wait_id(&binding.session, &binding.turn)?;
        let wait = state.waits().get(&id).ok_or_else(unavailable)?;
        let wakeup = bound_wakeup(state, wait)?;
        if &wakeup.operation != invocation.id() || wakeup.invocation != invocation.fingerprint() {
            return Err(identity_changed());
        }
        if wait.withdrawn {
            let mut result = ToolOutcome::failed("wakeup_withdrawn");
            result.status = OutcomeStatus::Cancelled;
            return Ok(result);
        }
        let disposition = read_disposition(wait)?.ok_or_else(unavailable)?;
        let text = match disposition {
            WakeupDisposition::Due => format!(
                "Scheduled wake-up\n\n{}\n\n{}",
                wakeup.request.reason, wakeup.request.prompt
            ),
            WakeupDisposition::Cancelled => "The user cancelled the scheduled wake-up.".into(),
        };
        Ok(ToolOutcome {
            status: OutcomeStatus::Succeeded,
            content: vec![ResultContent::Text(text)],
            structured: Some(
                json!({"wait":id, "disposition":disposition, "due_at_ms":wakeup.due_at_ms}),
            ),
            receipt: wait.answer.clone(),
            truncated: false,
        })
    }
}

impl Tool for WakeupTool {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        WakeupRequest::parse(arguments).map(|_| ())
    }

    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            self.result(&invocation, &context)
                .unwrap_or_else(|error| ToolOutcome::failed(&error.code))
        })
    }

    fn recover(
        &self,
        recovery: InvocationRecovery,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            self.result(&recovery.invocation, &context)
                .unwrap_or_else(|_| ToolOutcome::uncertain())
        })
    }
}

fn bound_wakeup(state: &TurnState, wait: &WaitRecord) -> Result<Wakeup> {
    let wakeup = read_wakeup(wait)?;
    let TurnBinding { session, turn, .. } = state.binding();
    let Some(OperationInput::Tool(invocation)) = state
        .operations()
        .get(&wakeup.operation)
        .map(|operation| &operation.record.input)
    else {
        return Err(identity_changed());
    };
    if &wakeup.session != session
        || &wakeup.turn != turn
        || invocation.definition().id.as_str() != TOOL
        || invocation.fingerprint() != wakeup.invocation
        || WakeupRequest::parse(invocation.arguments())? != wakeup.request
    {
        return Err(identity_changed());
    }
    Ok(wakeup)
}

fn recorded_invocation<'a>(
    state: &'a TurnState,
    invocation: &Invocation,
) -> Option<&'a OperationState> {
    state.operations().get(invocation.id()).filter(|operation| {
        matches!(&operation.record.input, OperationInput::Tool(recorded) if recorded == invocation)
    })
}

fn wait_id(session: &SessionId, turn: &TurnId) -> Result<WaitId> {
    WaitId::new(format!(
        "wakeup/{}",
        hex(Fingerprint::of(&(REQUEST, session, turn))?)
    ))
}

fn response_contract() -> Result<ResponseContract> {
    Ok(ResponseContract {
        schema: SchemaId::new(RESPONSE)?,
        version: 1,
    })
}

fn due_time(now_ms: u64, delay_ms: u64) -> Result<u64> {
    now_ms
        .checked_add(delay_ms)
        .filter(|due| *due <= MAX_TIMESTAMP_MS)
        .ok_or_else(invalid_request)
}

fn invalid_request() -> Error {
    Error::new(ErrorKind::InvalidInput, "invalid_wakeup_request")
}
fn unavailable() -> Error {
    Error::new(ErrorKind::Unavailable, "wakeup_unavailable")
}
fn identity_changed() -> Error {
    Error::new(ErrorKind::Conflict, "wakeup_identity_changed")
}
