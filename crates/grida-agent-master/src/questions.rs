//! Product questions over durable turn interactions.

use crate::{decode, encode};
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{
    Content, Message, OutcomeStatus, Provenance, ProvenanceKind, ResultContent, Role, ToolArguments,
};
use agent_kit_core::tools::{
    Invocation, InvocationContext, InvocationRecovery, RecoveryKind, Tool, ToolDefinition,
    ToolOutcome,
};
use agent_kit_core::turn::{
    CommitReceipt, OperationInput, OperationState, ResponseContract, WaitRecord,
};
use agent_kit_core::{
    BoxFuture, Envelope, Error, ErrorKind, Fingerprint, MessageId, OperationId, Result, SchemaId,
    ToolId, WaitId,
};
use agent_kit_runtime::{ToolAdmission, ToolDecision, TurnOperations, TurnView};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeSet;

const REQUEST_SCHEMA: &str = "grida.agent.question";
const ANSWER_SCHEMA: &str = "grida.agent.question.answer";
const REGISTRATION_SCHEMA: &str = "grida.agent.question.registration";
const ANSWER_DEPENDENT: &str = "question";
const NONBLOCKING: &str = "question_async";
const MAX_INPUT_BYTES: usize = 16 * 1024;
const MAX_REQUEST_BYTES: usize = MAX_INPUT_BYTES + 1024;
const MAX_QUESTION_BYTES: usize = 2048;
const MAX_OPTIONS: usize = 6;
const MAX_OPTION_BYTES: usize = 256;
const MAX_ANSWER_BYTES: usize = 4096;
const MAX_ANSWER_ENVELOPE_BYTES: usize = 32 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuestionStyle {
    AnswerDependent,
    Nonblocking,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuestionPrompt {
    pub question: String,
    #[serde(default)]
    pub options: Vec<String>,
}

impl QuestionPrompt {
    fn parse(arguments: &ToolArguments) -> Result<Self> {
        let ToolArguments::Json(value) = arguments else {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "question_arguments_invalid",
            ));
        };
        let prompt: Self = serde_json::from_value(value.clone())
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "question_arguments_invalid"))?;
        prompt.validate()?;
        Ok(prompt)
    }

    fn validate(&self) -> Result<()> {
        let mut options = BTreeSet::new();
        if self.question.trim().is_empty()
            || self.question.len() > MAX_QUESTION_BYTES
            || self.options.len() > MAX_OPTIONS
            || self.options.iter().any(|option| {
                let label = option.trim();
                label.is_empty() || option.len() > MAX_OPTION_BYTES || !options.insert(label)
            })
        {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "question_arguments_invalid",
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuestionRequest {
    pub operation: OperationId,
    pub style: QuestionStyle,
    pub prompt: QuestionPrompt,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum QuestionAnswer {
    Text { text: String },
    Choice { index: usize },
    Skipped,
}

impl QuestionAnswer {
    fn text<'a>(&'a self, prompt: &'a QuestionPrompt) -> Result<&'a str> {
        match self {
            Self::Text { text } if !text.trim().is_empty() && text.len() <= MAX_ANSWER_BYTES => {
                Ok(text)
            }
            Self::Choice { index } if *index < prompt.options.len() => Ok(&prompt.options[*index]),
            Self::Skipped => Ok("The user skipped this question."),
            _ => Err(Error::new(
                ErrorKind::InvalidInput,
                "question_answer_invalid",
            )),
        }
    }
}

pub struct PreparedAnswer {
    pub wait: WaitId,
    pub answer: Envelope,
    /// Commit this record atomically with resolution when present.
    pub contribution: Option<HistoryRecord>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct QuestionRegistration {
    pub wait: WaitId,
    pub commit: CommitReceipt,
}

pub fn read_registration(receipt: &Envelope) -> Result<QuestionRegistration> {
    decode(REGISTRATION_SCHEMA, receipt)
}

/// Decode a durable wait for a client that supports product questions.
pub fn read_question(wait: &WaitRecord) -> Result<QuestionRequest> {
    if wait.request.bytes().len() > MAX_REQUEST_BYTES || wait.response != response_contract()? {
        return Err(Error::new(
            ErrorKind::InvalidInput,
            "question_contract_invalid",
        ));
    }
    let request: QuestionRequest = decode(REQUEST_SCHEMA, &wait.request)?;
    if wait.id != wait_id(&request.operation)? {
        return Err(Error::new(
            ErrorKind::Conflict,
            "question_identity_mismatch",
        ));
    }
    request.prompt.validate()?;
    Ok(request)
}

/// Validate a reply before the host commits the correlated resolution.
pub fn prepare_answer(wait: &WaitRecord, answer: QuestionAnswer) -> Result<PreparedAnswer> {
    let request = read_question(wait)?;
    let text = answer.text(&request.prompt)?;
    let envelope = encode(ANSWER_SCHEMA, &answer)?;
    if wait.withdrawn
        || wait
            .answer
            .as_ref()
            .is_some_and(|existing| existing != &envelope)
    {
        return Err(Error::new(
            ErrorKind::Conflict,
            "question_no_longer_answerable",
        ));
    }
    let contribution = if request.style == QuestionStyle::Nonblocking {
        Some(HistoryRecord::Message(Message {
            id: MessageId::new(wait.id.as_str())?,
            role: Role::User,
            phase: None,
            content: vec![Content::Text(format!(
                "Response to question {}\n\n{}",
                wait.id, text,
            ))],
            provenance: Provenance {
                source: "question_response".into(),
                kind: ProvenanceKind::Supplied,
                fingerprint: Some(Fingerprint::of(&(&wait.id, &envelope))?),
            },
        }))
    } else {
        None
    };
    Ok(PreparedAnswer {
        wait: wait.id.clone(),
        answer: envelope,
        contribution,
    })
}

/// A question executor bound to the current turn owner.
pub struct QuestionTool {
    operations: TurnOperations,
    style: QuestionStyle,
    definition: ToolDefinition,
}

impl QuestionTool {
    pub fn new(operations: TurnOperations, style: QuestionStyle) -> Result<Self> {
        let (name, description) = match style {
            QuestionStyle::AnswerDependent => (
                ANSWER_DEPENDENT,
                "Ask one question when progress depends on the answer. Offer short suggested answers when helpful. The user can choose an option, write their own answer, or skip.",
            ),
            QuestionStyle::Nonblocking => (
                NONBLOCKING,
                "Ask one question and continue independent work after the registration result. Use the later user response at the next decision point. The user can choose an option, write their own answer, or skip.",
            ),
        };
        Ok(Self {
            operations,
            style,
            definition: ToolDefinition {
                id: ToolId::new(name)?,
                version: 1,
                description: description.into(),
                input: InputFormat::Json(json!({
                    "type": "object",
                    "properties": {
                        "question": {"type": "string", "minLength": 1, "maxLength": MAX_QUESTION_BYTES},
                        "options": {
                            "type": "array", "maxItems": MAX_OPTIONS, "uniqueItems": true,
                            "items": {"type": "string", "minLength": 1, "maxLength": MAX_OPTION_BYTES}
                        }
                    },
                    "required": ["question"],
                    "additionalProperties": false
                })),
                max_input_bytes: MAX_INPUT_BYTES,
                max_output_bytes: MAX_ANSWER_ENVELOPE_BYTES,
                recovery: RecoveryKind::Reconcile,
            },
        })
    }

    async fn result(
        &self,
        invocation: Invocation,
        context: InvocationContext,
        recovery: bool,
    ) -> Result<ToolOutcome> {
        let view = self.operations.view();
        if invocation.definition() != &self.definition
            || !recorded_invocation(&view, &invocation)
                .and_then(|record| record.attempts.last())
                .is_some_and(|attempt| attempt.id == context.attempt)
        {
            return Err(Error::new(
                ErrorKind::Conflict,
                "question_invocation_mismatch",
            ));
        }
        let expected = question_wait(&invocation, self.style)?;
        let existing = view.state.waits().get(&expected.id);
        if existing.is_some_and(|wait| {
            wait.request != expected.request || wait.response != expected.response
        }) {
            return Err(Error::new(
                ErrorKind::Conflict,
                "question_identity_mismatch",
            ));
        }
        match self.style {
            QuestionStyle::Nonblocking => {
                if recovery && existing.is_none() {
                    return Ok(ToolOutcome::uncertain());
                }
                // The journal retains existing waits after response or withdrawal.
                // Registration returns the original commit when that wait exists.
                let wait = expected.id.clone();
                let commit = self.operations.request_input(expected).await?;
                let receipt = encode(
                    REGISTRATION_SCHEMA,
                    &QuestionRegistration {
                        wait: wait.clone(),
                        commit,
                    },
                )?;
                Ok(success(
                    "Question registered. The user can respond while independent work continues."
                        .into(),
                    json!({"wait": wait, "status": "registered"}),
                    Some(receipt),
                ))
            }
            QuestionStyle::AnswerDependent => {
                let Some(wait) = existing else {
                    return Err(Error::new(ErrorKind::InvalidState, "question_wait_missing"));
                };
                if wait.withdrawn {
                    let mut outcome = ToolOutcome::failed("question_withdrawn");
                    outcome.status = OutcomeStatus::Cancelled;
                    return Ok(outcome);
                }
                let envelope = wait.answer.as_ref().ok_or_else(|| {
                    Error::new(ErrorKind::InvalidState, "question_answer_pending")
                })?;
                if envelope.bytes().len() > MAX_ANSWER_ENVELOPE_BYTES {
                    return Err(Error::new(
                        ErrorKind::LimitExceeded,
                        "question_answer_limit",
                    ));
                }
                let answer: QuestionAnswer = decode(ANSWER_SCHEMA, envelope)?;
                let request = read_question(wait)?;
                let text = answer.text(&request.prompt)?.to_owned();
                let disposition = match answer {
                    QuestionAnswer::Skipped => "skipped",
                    _ => "answered",
                };
                Ok(success(
                    text,
                    json!({"wait": wait.id, "status": disposition}),
                    Some(envelope.clone()),
                ))
            }
        }
    }
}

impl Tool for QuestionTool {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        QuestionPrompt::parse(arguments).map(|_| ())
    }

    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            match self.result(invocation, context, false).await {
                Ok(outcome) => outcome,
                Err(error) if error.kind == ErrorKind::Uncertain => ToolOutcome::uncertain(),
                Err(error) => ToolOutcome::failed(&error.code),
            }
        })
    }

    fn recover(
        &self,
        recovery: InvocationRecovery,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            self.result(recovery.invocation, context, true)
                .await
                .unwrap_or_else(|_| ToolOutcome::uncertain())
        })
    }
}

/// Apply after the host authorizes creating a question in the current turn.
/// The ordinary dispatch authority check still applies once the answer arrives.
pub async fn defer_for_answer(
    admission: &ToolAdmission,
    operations: &TurnOperations,
) -> Result<Option<ToolDecision>> {
    if admission.invocation.definition().id.as_str() != ANSWER_DEPENDENT {
        return Ok(None);
    }
    if &admission.operation != admission.invocation.id()
        || !recorded_invocation(&operations.view(), &admission.invocation)
            .is_some_and(|record| record.record.grants == admission.grants)
    {
        return Err(Error::new(
            ErrorKind::Conflict,
            "question_invocation_mismatch",
        ));
    }
    let wait = question_wait(&admission.invocation, QuestionStyle::AnswerDependent)?;
    let id = wait.id.clone();
    operations.request_input(wait).await?;
    let view = operations.view();
    let current = view
        .state
        .waits()
        .get(&id)
        .ok_or_else(|| Error::new(ErrorKind::InvalidState, "question_wait_missing"))?;
    Ok(Some(if current.is_pending() {
        ToolDecision::Defer(id)
    } else {
        ToolDecision::Permit
    }))
}

fn recorded_invocation<'a>(
    view: &'a TurnView,
    invocation: &Invocation,
) -> Option<&'a OperationState> {
    view.operation(invocation.id()).filter(|operation| {
        matches!(&operation.record.input, OperationInput::Tool(recorded) if recorded == invocation)
    })
}

fn wait_id(operation: &OperationId) -> Result<WaitId> {
    WaitId::new(format!("question/{operation}"))
}

fn response_contract() -> Result<ResponseContract> {
    Ok(ResponseContract {
        schema: SchemaId::new(ANSWER_SCHEMA)?,
        version: 1,
    })
}

fn question_wait(invocation: &Invocation, style: QuestionStyle) -> Result<WaitRecord> {
    let request = QuestionRequest {
        operation: invocation.id().clone(),
        style,
        prompt: QuestionPrompt::parse(invocation.arguments())?,
    };
    Ok(WaitRecord {
        id: wait_id(invocation.id())?,
        request: encode(REQUEST_SCHEMA, &request)?,
        response: response_contract()?,
        answer: None,
        withdrawn: false,
    })
}

fn success(text: String, structured: serde_json::Value, receipt: Option<Envelope>) -> ToolOutcome {
    ToolOutcome {
        status: OutcomeStatus::Succeeded,
        content: vec![ResultContent::Text(text)],
        structured: Some(structured),
        receipt,
        truncated: false,
    }
}
