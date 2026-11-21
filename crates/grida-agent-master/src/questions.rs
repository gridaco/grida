//! Product questions over durable turn interactions.

use crate::{decode, encode};
use agent_kit_core::history::HistoryRecord;
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{
    Content, Message, OutcomeStatus, Provenance, ProvenanceKind, ResultContent, Role,
    ToolArguments, ToolResult,
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
use std::collections::{BTreeMap, BTreeSet};

/// Request identity used to recognize registered questions without opening their payload.
pub const REQUEST_SCHEMA: &str = "grida.agent.question";
const ANSWER_SCHEMA: &str = "grida.agent.question.answer";
pub(crate) const ANSWER_SOURCE: &str = "question_response";
pub(crate) const TOOL_ANSWER_SOURCE: &str = "question_tool_response";

/// Whether this saved message is a user contribution accepted by the question owner.
pub fn is_answer_contribution(message: &Message) -> bool {
    message.role == Role::User
        && message.provenance.kind == ProvenanceKind::Supplied
        && matches!(
            message.provenance.source.as_str(),
            ANSWER_SOURCE | TOOL_ANSWER_SOURCE
        )
}
const OPEN_REPLY: &str = "<send_user_message_question_reply>";
const CLOSE_REPLY: &str = "</send_user_message_question_reply>";
const REGISTRATION_SCHEMA: &str = "grida.agent.question.registration";
const ANSWER_DEPENDENT: &str = "question";
const NONBLOCKING: &str = "question_async";
const LEGACY_VERSION: u32 = 1;
const BATCH_VERSION: u32 = 2;
const MAX_INPUT_BYTES: usize = 16 * 1024;
const MAX_REQUEST_BYTES: usize = MAX_INPUT_BYTES + 1024;
const MAX_QUESTIONS: usize = 3;
const MAX_ID_BYTES: usize = 64;
const MAX_HEADER_BYTES: usize = 48;
const MAX_QUESTION_BYTES: usize = 2048;
const MAX_OPTIONS: usize = 6;
const MAX_OPTION_BYTES: usize = 256;
const MAX_OPTION_DESCRIPTION_BYTES: usize = 512;
const MAX_ANSWER_BYTES: usize = 4096;
const LEGACY_MAX_ANSWER_BYTES: usize = 32 * 1024;
// Allow three free-text answers, including JSON escaping in both result forms.
const MAX_BATCH_RESULT_BYTES: usize = 160 * 1024;
const MAX_BATCH_ANSWER_BYTES: usize = 80 * 1024;
const SKIP_TEXT: &str = "The user skipped this question.";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuestionStyle {
    AnswerDependent,
    Nonblocking,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct LegacyPrompt {
    question: String,
    #[serde(default)]
    options: Vec<String>,
}

impl LegacyPrompt {
    fn into_item(self) -> QuestionItem {
        QuestionItem {
            id: "question".into(),
            header: None,
            question: self.question,
            options: self
                .options
                .into_iter()
                .map(|label| QuestionOption {
                    label,
                    description: None,
                })
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuestionOption {
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuestionItem {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub header: Option<String>,
    pub question: String,
    #[serde(default)]
    pub options: Vec<QuestionOption>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct BatchPrompt {
    questions: Vec<QuestionItem>,
}

fn arguments_invalid() -> Error {
    Error::new(ErrorKind::InvalidInput, "question_arguments_invalid")
}

fn answer_invalid() -> Error {
    Error::new(ErrorKind::InvalidInput, "question_answer_invalid")
}

fn valid_text(value: &str, maximum: usize) -> bool {
    !value.trim().is_empty() && value.len() <= maximum
}

fn valid_id(value: &str) -> bool {
    (1..=MAX_ID_BYTES).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
}

fn validate_questions(questions: &[QuestionItem]) -> Result<()> {
    let mut ids = BTreeSet::new();
    if !(1..=MAX_QUESTIONS).contains(&questions.len())
        || questions.iter().any(|item| {
            let mut labels = BTreeSet::new();
            !valid_id(&item.id)
                || !ids.insert(&item.id)
                || !valid_text(&item.question, MAX_QUESTION_BYTES)
                || item
                    .header
                    .as_deref()
                    .is_some_and(|header| !valid_text(header, MAX_HEADER_BYTES))
                || item.options.len() > MAX_OPTIONS
                || item.options.iter().any(|option| {
                    !valid_text(&option.label, MAX_OPTION_BYTES)
                        || !labels.insert(option.label.trim())
                        || option.description.as_deref().is_some_and(|description| {
                            !valid_text(description, MAX_OPTION_DESCRIPTION_BYTES)
                        })
                })
        })
    {
        return Err(arguments_invalid());
    }
    Ok(())
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct StoredQuestionRequest<T> {
    operation: OperationId,
    style: QuestionStyle,
    prompt: T,
}

pub struct QuestionRequest {
    pub operation: OperationId,
    pub style: QuestionStyle,
    pub version: u32,
    pub questions: Vec<QuestionItem>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum QuestionAnswer {
    Text { text: String },
    Choice { index: usize },
    Skipped,
}

impl QuestionAnswer {
    fn text<'a>(&'a self, item: &'a QuestionItem) -> Result<Option<&'a str>> {
        match self {
            Self::Text { text } if valid_text(text, MAX_ANSWER_BYTES) => Ok(Some(text)),
            Self::Choice { index } => item
                .options
                .get(*index)
                .map(|option| Some(option.label.as_str()))
                .ok_or_else(answer_invalid),
            Self::Skipped => Ok(None),
            _ => Err(answer_invalid()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuestionItemAnswer {
    pub id: String,
    pub answer: QuestionAnswer,
}

pub struct PreparedAnswer {
    pub wait: WaitId,
    pub answer: Envelope,
    /// Commit this record atomically with resolution when present.
    pub contribution: Option<HistoryRecord>,
}

/// A correlated reply in the model's contextual user message.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QuestionReply {
    pub question_item_id: WaitId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub question_id: Option<String>,
    pub question: String,
    pub answer: String,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub skipped: bool,
}

/// A question reply is attributed by its host-created message. A user can
/// freely quote or paste the same markup without changing how it is displayed.
pub fn visible_replies(message: &Message) -> Option<Vec<QuestionReply>> {
    if message.role != Role::User
        || !matches!(
            message.provenance.source.as_str(),
            ANSWER_SOURCE | TOOL_ANSWER_SOURCE
        )
    {
        return None;
    }
    let [Content::Text(content)] = message.content.as_slice() else {
        return None;
    };
    let body = content
        .strip_prefix(OPEN_REPLY)?
        .strip_suffix(CLOSE_REPLY)?;
    let replies: Vec<QuestionReply> = serde_json::from_str(body).ok()?;
    let first = replies.first()?;
    let mut ids = BTreeSet::new();
    if replies.len() > MAX_QUESTIONS
        || replies.iter().any(|reply| {
            reply.question_item_id != first.question_item_id
                || reply
                    .question_id
                    .as_deref()
                    .map_or(replies.len() != 1, |id| !valid_id(id) || !ids.insert(id))
        })
    {
        return None;
    }
    let attributed = match message.provenance.kind {
        ProvenanceKind::Supplied => message.id.as_str() == first.question_item_id.as_str(),
        ProvenanceKind::Transformed => message.id.as_str().starts_with("seed/"),
        _ => false,
    };
    attributed.then_some(replies)
}

/// The accepted answers that reached this inference, either as a contextual
/// user message or as the completed result of its exact question operation.
pub fn replies_in_context(
    state: &agent_kit_core::turn::TurnState,
    contribution: &Message,
    context: &[Message],
) -> Option<Vec<QuestionReply>> {
    let replies = visible_replies(contribution)?;
    let wait = state.waits().get(&replies.first()?.question_item_id)?;
    let request = read_question(wait).ok()?;
    let envelope = wait.answer.as_ref()?;
    let prepared = recorded_answer(wait, &request, envelope).ok()?;
    let HistoryRecord::Message(expected) = prepared.contribution?;
    if expected != *contribution {
        return None;
    }
    let included = match request.style {
        QuestionStyle::Nonblocking => context.contains(contribution),
        QuestionStyle::AnswerDependent => {
            let operation = state.operations().get(&request.operation)?;
            let call = operation.record.source_call.as_ref()?;
            let Some(agent_kit_core::turn::OperationOutcome::Tool(outcome)) = operation.outcome()
            else {
                return None;
            };
            if outcome.receipt.as_ref() != Some(envelope) {
                return None;
            }
            let expected = answer_outcome(wait, &request, envelope).ok()?;
            context.iter().any(|message| {
                let [Content::ToolResult(result)] = message.content.as_slice() else {
                    return false;
                };
                message.role == Role::Tool
                    && message.provenance.kind == ProvenanceKind::Observed
                    && &result.call == call
                    && result.status == OutcomeStatus::Succeeded
                    && !result.truncated
                    && answered_wait(result) == Some(wait.id.as_str())
                    && result.content == expected.content
                    && result.structured == expected.structured
            })
        }
    };
    included.then_some(replies)
}

/// Older turns recorded required answers only in the tool result and used a
/// plain user message for optional answers. Render them from the original
/// journaled wait without changing their model inputs or stored history.
pub fn transcript(state: &agent_kit_core::turn::TurnState) -> Vec<HistoryRecord> {
    let mut records = crate::history::project(state);
    if !state
        .waits()
        .values()
        .any(|wait| wait.request.schema().as_str() == REQUEST_SCHEMA && wait.answer.is_some())
    {
        return records;
    }
    let positions: BTreeMap<_, _> = records
        .iter()
        .enumerate()
        .filter_map(|(index, record)| {
            let HistoryRecord::Message(message) = record;
            matches!(
                message.provenance.source.as_str(),
                ANSWER_SOURCE | TOOL_ANSWER_SOURCE
            )
            .then_some((message.id.as_str().to_owned(), index))
        })
        .collect();
    let mut by_wait = BTreeMap::new();
    for wait in state.waits().values() {
        let Some(answer) = wait
            .answer
            .as_ref()
            .filter(|_| wait.request.schema().as_str() == REQUEST_SCHEMA)
        else {
            continue;
        };
        let position = positions.get(wait.id.as_str()).copied();
        if let Some(index) = position {
            let HistoryRecord::Message(message) = &records[index];
            if visible_replies(message).is_some() {
                continue;
            }
        }
        let Some(reply) = read_question(wait)
            .ok()
            .and_then(|request| recorded_answer(wait, &request, answer).ok())
            .and_then(|prepared| prepared.contribution)
        else {
            continue;
        };
        if let Some(index) = position {
            records[index] = reply;
        } else {
            by_wait.insert(wait.id.as_str(), reply);
        }
    }
    if by_wait.is_empty() {
        return records;
    }
    let mut output = Vec::with_capacity(records.len() + by_wait.len());
    for record in records {
        let HistoryRecord::Message(message) = &record;
        let following: Vec<_> = message
            .content
            .iter()
            .filter_map(|part| match part {
                Content::ToolResult(result) if message.role == Role::Tool => {
                    answered_wait(result).and_then(|wait| by_wait.remove(wait))
                }
                _ => None,
            })
            .collect();
        output.push(record);
        output.extend(following);
    }
    output.extend(by_wait.into_values());
    output
}

/// A required tool result identifies the exact wait consumed by that step,
/// even when a provider reuses a tool call ID in a subsequent generation.
pub(crate) fn answered_wait(result: &ToolResult) -> Option<&str> {
    let data = result.structured.as_ref()?;
    matches!(data.get("status")?.as_str()?, "answered" | "skipped")
        .then(|| data.get("wait")?.as_str())
        .flatten()
}

/// Every unknown wait remains required. Only a validated optional product
/// question may stay open while other work resumes or finishes.
pub fn blocks_progress(wait: &WaitRecord) -> bool {
    wait.is_pending() && !is_optional(wait)
}

pub(crate) fn is_optional(wait: &WaitRecord) -> bool {
    wait.request.schema().as_str() == REQUEST_SCHEMA
        && read_question(wait).is_ok_and(|request| request.style == QuestionStyle::Nonblocking)
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
    let version = wait.request.version();
    if wait.request.bytes().len() > MAX_REQUEST_BYTES
        || wait.request.schema().as_str() != REQUEST_SCHEMA
        || !matches!(version, LEGACY_VERSION | BATCH_VERSION)
        || wait.response != response_contract(version)?
    {
        return Err(Error::new(
            ErrorKind::InvalidInput,
            "question_contract_invalid",
        ));
    }
    let (operation, style, questions) = if version == LEGACY_VERSION {
        let request: StoredQuestionRequest<LegacyPrompt> = decode(REQUEST_SCHEMA, &wait.request)?;
        (
            request.operation,
            request.style,
            vec![request.prompt.into_item()],
        )
    } else {
        let request: StoredQuestionRequest<BatchPrompt> =
            serde_json::from_slice(wait.request.bytes()).map_err(|_| arguments_invalid())?;
        (request.operation, request.style, request.prompt.questions)
    };
    if wait.id != wait_id(&operation)? {
        return Err(Error::new(
            ErrorKind::Conflict,
            "question_identity_mismatch",
        ));
    }
    validate_questions(&questions)?;
    Ok(QuestionRequest {
        operation,
        style,
        version,
        questions,
    })
}

/// Validate a reply using the original singleton contract.
pub fn prepare_answer(wait: &WaitRecord, answer: QuestionAnswer) -> Result<PreparedAnswer> {
    let request = read_question(wait)?;
    if request.version != LEGACY_VERSION {
        return Err(answer_invalid());
    }
    prepare_answers(
        wait,
        &request,
        vec![QuestionItemAnswer {
            id: request.questions[0].id.clone(),
            answer,
        }],
    )
}

/// Correlate each answer to its question and prepare a single atomic settlement.
pub fn prepare_batch_answer(
    wait: &WaitRecord,
    answers: Vec<QuestionItemAnswer>,
) -> Result<PreparedAnswer> {
    let request = read_question(wait)?;
    if request.version != BATCH_VERSION {
        return Err(answer_invalid());
    }
    prepare_answers(wait, &request, answers)
}

fn ordered_answers(
    request: &QuestionRequest,
    answers: Vec<QuestionItemAnswer>,
) -> Result<Vec<QuestionItemAnswer>> {
    if answers.len() != request.questions.len() {
        return Err(answer_invalid());
    }
    let mut by_id = BTreeMap::new();
    for answer in answers {
        if by_id.insert(answer.id, answer.answer).is_some() {
            return Err(answer_invalid());
        }
    }
    request
        .questions
        .iter()
        .map(|item| {
            let answer = by_id.remove(&item.id).ok_or_else(answer_invalid)?;
            answer.text(item)?;
            Ok(QuestionItemAnswer {
                id: item.id.clone(),
                answer,
            })
        })
        .collect()
}

fn decode_answers(
    request: &QuestionRequest,
    envelope: &Envelope,
) -> Result<Vec<QuestionItemAnswer>> {
    if envelope.schema().as_str() != ANSWER_SCHEMA || envelope.version() != request.version {
        return Err(answer_invalid());
    }
    let limit = if request.version == LEGACY_VERSION {
        LEGACY_MAX_ANSWER_BYTES
    } else {
        MAX_BATCH_ANSWER_BYTES
    };
    if envelope.bytes().len() > limit {
        return Err(Error::new(
            ErrorKind::LimitExceeded,
            "question_answer_limit",
        ));
    }
    if request.version == LEGACY_VERSION {
        Ok(vec![QuestionItemAnswer {
            id: request.questions[0].id.clone(),
            answer: decode(ANSWER_SCHEMA, envelope)?,
        }])
    } else {
        serde_json::from_slice(envelope.bytes()).map_err(|_| answer_invalid())
    }
}

fn recorded_answer(
    wait: &WaitRecord,
    request: &QuestionRequest,
    envelope: &Envelope,
) -> Result<PreparedAnswer> {
    prepare_answers(wait, request, decode_answers(request, envelope)?)
}

fn prepare_answers(
    wait: &WaitRecord,
    request: &QuestionRequest,
    answers: Vec<QuestionItemAnswer>,
) -> Result<PreparedAnswer> {
    let answers = ordered_answers(request, answers)?;
    let legacy = request.version == LEGACY_VERSION;
    let envelope = if legacy {
        encode(ANSWER_SCHEMA, &answers[0].answer)?
    } else {
        encode_batch(ANSWER_SCHEMA, &answers)?
    };
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
    let contribution = if !legacy
        || request.style == QuestionStyle::Nonblocking
        || !matches!(answers[0].answer, QuestionAnswer::Skipped)
    {
        let replies = request
            .questions
            .iter()
            .zip(&answers)
            .map(|(item, answer)| {
                let text = answer.answer.text(item)?;
                Ok(QuestionReply {
                    question_item_id: wait.id.clone(),
                    question_id: (!legacy).then(|| item.id.clone()),
                    question: item.question.clone(),
                    answer: text.unwrap_or(SKIP_TEXT).into(),
                    skipped: !legacy && text.is_none(),
                })
            })
            .collect::<Result<Vec<_>>>()?;
        // Keep quoted markup in model- or user-authored strings inside JSON.
        let body = serde_json::to_string(&replies)
            .map_err(|_| Error::new(ErrorKind::InvalidInput, "question_reply_invalid"))?
            .replace('<', "\\u003c");
        Some(HistoryRecord::Message(Message {
            id: MessageId::new(wait.id.as_str())?,
            role: Role::User,
            phase: None,
            content: vec![Content::Text(format!(
                "{OPEN_REPLY}\n{body}\n{CLOSE_REPLY}"
            ))],
            provenance: Provenance {
                source: match request.style {
                    QuestionStyle::Nonblocking => ANSWER_SOURCE,
                    QuestionStyle::AnswerDependent => TOOL_ANSWER_SOURCE,
                }
                .into(),
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

fn answer_outcome(
    wait: &WaitRecord,
    request: &QuestionRequest,
    envelope: &Envelope,
) -> Result<ToolOutcome> {
    let answers = ordered_answers(request, decode_answers(request, envelope)?)?;
    let disposition = if answers
        .iter()
        .all(|entry| entry.answer == QuestionAnswer::Skipped)
    {
        "skipped"
    } else {
        "answered"
    };
    let mut structured = json!({"wait": wait.id, "status": disposition});
    let text = if request.version == LEGACY_VERSION {
        answers[0]
            .answer
            .text(&request.questions[0])?
            .unwrap_or(SKIP_TEXT)
            .to_owned()
    } else {
        let answers = request
            .questions
            .iter()
            .zip(&answers)
            .map(|(item, answer)| Ok(json!({"id": item.id, "answer": answer.answer.text(item)?})))
            .collect::<Result<Vec<_>>>()?;
        let text = json!({"answers": answers}).to_string();
        structured["answers"] = json!(answers);
        text
    };
    Ok(success(text, structured, Some(envelope.clone())))
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
                "Ask one to three short questions when progress depends on the answers. Prefer one question when that is enough. Use stable snake_case IDs, short headings, and mutually exclusive options when helpful. The user can choose an option, write their own answer, or skip.",
            ),
            QuestionStyle::Nonblocking => (
                NONBLOCKING,
                "Ask one to three short questions and continue independent work after the registration result. Prefer one question when that is enough. Use stable snake_case IDs, short headings, and mutually exclusive options when helpful. The user can choose an option, write their own answer, or skip. Use later answers at the next decision point.",
            ),
        };
        let options = json!({
            "type": "array",
            "description": "Suggested answers in display order. Put the recommended option first. Omit for free-text-only input. The client always offers a write-in answer.",
            "maxItems": MAX_OPTIONS,
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string", "minLength": 1, "maxLength": MAX_OPTION_BYTES},
                    "description": {"type": "string", "minLength": 1, "maxLength": MAX_OPTION_DESCRIPTION_BYTES}
                },
                "required": ["label"],
                "additionalProperties": false
            }
        });
        Ok(Self {
            operations,
            style,
            definition: ToolDefinition {
                id: ToolId::new(name)?,
                version: BATCH_VERSION,
                description: description.into(),
                input: InputFormat::Json(json!({
                    "type": "object",
                    "properties": {
                        "questions": {
                            "type": "array", "minItems": 1, "maxItems": MAX_QUESTIONS,
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": {"type": "string", "pattern": "^[a-z0-9_]+$", "minLength": 1, "maxLength": MAX_ID_BYTES},
                                    "header": {"type": "string", "minLength": 1, "maxLength": MAX_HEADER_BYTES},
                                    "question": {"type": "string", "minLength": 1, "maxLength": MAX_QUESTION_BYTES},
                                    "options": options
                                },
                                "required": ["id", "question"],
                                "additionalProperties": false
                            }
                        }
                    },
                    "required": ["questions"],
                    "additionalProperties": false
                })),
                max_input_bytes: MAX_INPUT_BYTES,
                max_output_bytes: MAX_BATCH_RESULT_BYTES,
                recovery: RecoveryKind::Reconcile,
            },
        })
    }

    /// Restore the exact tool definition captured by an accepted singleton call.
    pub fn legacy(operations: TurnOperations, style: QuestionStyle) -> Result<Self> {
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
                version: LEGACY_VERSION,
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
                max_output_bytes: LEGACY_MAX_ANSWER_BYTES,
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
                let request = read_question(wait)?;
                answer_outcome(wait, &request, envelope)
            }
        }
    }
}

impl Tool for QuestionTool {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        if self.definition.version == LEGACY_VERSION {
            let prompt: LegacyPrompt = parse_prompt(arguments)?;
            validate_questions(&[prompt.into_item()])
        } else {
            let prompt: BatchPrompt = parse_prompt(arguments)?;
            validate_questions(&prompt.questions)
        }
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

fn response_contract(version: u32) -> Result<ResponseContract> {
    Ok(ResponseContract {
        schema: SchemaId::new(ANSWER_SCHEMA)?,
        version,
    })
}

fn parse_prompt<T: serde::de::DeserializeOwned>(arguments: &ToolArguments) -> Result<T> {
    let ToolArguments::Json(value) = arguments else {
        return Err(arguments_invalid());
    };
    T::deserialize(value).map_err(|_| arguments_invalid())
}

fn encode_batch(schema: &str, value: &impl Serialize) -> Result<Envelope> {
    let bytes = serde_json::to_vec(value)
        .map_err(|_| Error::new(ErrorKind::InvalidInput, "question_write_invalid"))?;
    Envelope::new(SchemaId::new(schema)?, BATCH_VERSION, bytes)
}

fn question_wait(invocation: &Invocation, style: QuestionStyle) -> Result<WaitRecord> {
    let version = invocation.definition().version;
    let request = match version {
        LEGACY_VERSION => {
            let prompt: LegacyPrompt = parse_prompt(invocation.arguments())?;
            encode(
                REQUEST_SCHEMA,
                &StoredQuestionRequest {
                    operation: invocation.id().clone(),
                    style,
                    prompt,
                },
            )?
        }
        BATCH_VERSION => {
            let prompt: BatchPrompt = parse_prompt(invocation.arguments())?;
            encode_batch(
                REQUEST_SCHEMA,
                &StoredQuestionRequest {
                    operation: invocation.id().clone(),
                    style,
                    prompt,
                },
            )?
        }
        _ => return Err(arguments_invalid()),
    };
    Ok(WaitRecord {
        id: wait_id(invocation.id())?,
        request,
        response: response_contract(version)?,
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
