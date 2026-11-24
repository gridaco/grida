//! Negotiated queue and task lifecycle operations.

use super::*;
use crate::host::{PromptPart, QueueEdit, TurnControl};
use agent_client_protocol::v1::schema::ResourceLink;
use agent_kit_core::WaitId;

const ENQUEUE: &str = "co.grida/session/enqueue";
const INPUT: &str = "co.grida/session/input";
const REPLACE: &str = "co.grida/session/replace";
const REPLACE_TEXT: &str = "co.grida/session/replace-text";
const WITHDRAW: &str = "co.grida/session/withdraw";
const REORDER: &str = "co.grida/session/reorder";
const RESUME_QUEUE: &str = "co.grida/session/resume-queue";
const STEER: &str = "co.grida/session/steer";
const PAUSE: &str = "co.grida/session/pause";
const RESUME: &str = "co.grida/session/resume";
pub(super) const CAPABILITIES: [&str; 10] = [
    ENQUEUE,
    INPUT,
    REPLACE,
    REPLACE_TEXT,
    WITHDRAW,
    REORDER,
    RESUME_QUEUE,
    STEER,
    PAUSE,
    RESUME,
];

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/enqueue", response = SubmitResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Enqueue {
    #[serde(rename = "_meta")]
    meta: Option<Meta>,
    session_id: SessionId,
    input_id: ChangeId,
    initial_title: Option<String>,
    prompt: Vec<ContentBlock>,
    selected_file: Option<SelectedFile>,
    selected_image: Option<crate::host::SelectedImage>,
    attachments: Option<Vec<attachments::Attachment>>,
    operating_regime: Option<crate::OperatingRegime>,
    effort: Option<crate::EffortPreset>,
    #[serde(default)]
    reasoning: Option<agent_kit_core::inference::ReasoningEffort>,
    editor_endpoint_id: Option<BindingId>,
    #[serde(default)]
    editor_presentation: bool,
    #[serde(default)]
    editor_browser_tools: bool,
    editor_svg_target_id: Option<BindingId>,
    editor_tool_context_id: Option<BindingId>,
    editor_context: Option<EditorObservation>,
    message_context: Option<MessageContext>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/input", response = InputResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Input {
    session_id: SessionId,
    input_id: ChangeId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct InputResponse {
    receipt: SubmitResponse,
    settings: InputSettings,
    text_only: bool,
    text_editable: bool,
    prompt: Vec<ContentBlock>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    display_parts: Vec<DisplayPart>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QueueBasis {
    session_id: SessionId,
    request_id: ChangeId,
    expected_session_revision: SessionRevision,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/replace", response = QueueResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Replace {
    #[serde(rename = "_meta")]
    meta: Option<Meta>,
    queue: QueueBasis,
    input_id: ChangeId,
    replacement_input_id: ChangeId,
    prompt: Vec<ContentBlock>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/replace-text", response = QueueResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReplaceText {
    queue: QueueBasis,
    input_id: ChangeId,
    replacement_input_id: ChangeId,
    text: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/withdraw", response = QueueResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Withdraw {
    queue: QueueBasis,
    input_id: ChangeId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/reorder", response = QueueResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Reorder {
    queue: QueueBasis,
    input_ids: Vec<ChangeId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/resume-queue", response = QueueResponse)]
#[serde(transparent)]
struct ResumeQueue(QueueBasis);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
pub(super) struct QueueResponse {
    session_id: SessionId,
    request_id: ChangeId,
    session_revision: SessionRevision,
}

impl From<ControlReceipt> for QueueResponse {
    fn from(receipt: ControlReceipt) -> Self {
        Self {
            session_id: receipt.session,
            request_id: receipt.request,
            session_revision: receipt.revision,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TaskBasis {
    session_id: SessionId,
    turn_id: TurnId,
    request_id: ChangeId,
    expected_session_revision: SessionRevision,
    expected_control_revision: ControlRevision,
}

impl From<TaskBasis> for TurnControl {
    fn from(task: TaskBasis) -> Self {
        Self {
            session: task.session_id,
            turn: task.turn_id,
            request: task.request_id,
            expected_session: task.expected_session_revision,
            expected_control: task.expected_control_revision,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/steer", response = TurnControlResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Steer {
    task: TaskBasis,
    expected_history_position: HistoryPosition,
    prompt: Vec<ContentBlock>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/pause", response = TurnControlResponse)]
#[serde(transparent)]
struct Pause(TaskBasis);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/resume", response = ResumeResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Resume {
    task: TaskBasis,
    expected_epoch: u64,
    expected_journal_position: JournalPosition,
    cancelled_wakeup_id: Option<WaitId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
pub(super) struct ResumeResponse {
    pub(super) request_id: ChangeId,
    pub(super) turn: TurnSummary,
}

pub(super) fn handlers(
    host: Arc<Host>,
    sessions: Arc<Mutex<ConnectionSessions>>,
    image_intake: bool,
    embedded_context: bool,
) -> RequestRoutes {
    let enqueue = (host.clone(), sessions.clone());
    let input = (host.clone(), sessions.clone());
    let replace = (host.clone(), sessions.clone());
    let replace_text = (host.clone(), sessions.clone());
    let withdraw = (host.clone(), sessions.clone());
    let reorder = (host.clone(), sessions.clone());
    let resume_queue = (host.clone(), sessions.clone());
    let steer = (host.clone(), sessions.clone());
    let pause = (host.clone(), sessions.clone());
    RequestRoutes::default()
        .on_supervised_request(
            async move |request: Enqueue, responder, _| {
                let result = async {
                    require(&enqueue.1, ENQUEUE, Some(&request.session_id))?;
                    editor_binding(
                        &enqueue.1,
                        request.editor_endpoint_id.as_ref(),
                        request.editor_presentation,
                        request.editor_browser_tools,
                        request.editor_svg_target_id.as_ref(),
                        request.editor_tool_context_id.as_ref(),
                        false,
                    )?;
                    let mut parts = identified_prompt(
                        request.prompt,
                        image_intake || enqueue.0.has_routes(),
                        embedded_context,
                        request.selected_file,
                        request.selected_image,
                        &enqueue.1,
                        request.editor_endpoint_id.is_some(),
                    )?;
                    if let Some(items) = request.attachments {
                        attachments::append(
                            &mut parts,
                            items,
                            &enqueue.1,
                            &request.session_id,
                            request.editor_endpoint_id.is_some(),
                        )?;
                    }
                    append_editor_context(&mut parts, request.editor_context, &enqueue.1)?;
                    append_message_context(&mut parts, request.message_context, &enqueue.1)?;
                    let (questions, question_batches) =
                        questions::support(&enqueue.1, request.meta.as_ref())?;
                    let accepted = enqueue
                        .0
                        .enqueue_with_context(
                            PromptRequest {
                                id: request.input_id,
                                session: request.session_id,
                                parts,
                                questions,
                                question_batches,
                                operating_regime: operating_regime(
                                    &enqueue.1,
                                    request.operating_regime,
                                )?,
                                effort: effort(&enqueue.1, request.effort)?,
                                reasoning: request.reasoning,
                            },
                            SubmissionContext {
                                web_search: selection::web_search(
                                    request.meta.as_ref(),
                                    &enqueue.1,
                                )?,
                                initial_title: initial_title(&enqueue.1, request.initial_title)?,
                                selection_revision: selection::revision(
                                    request.meta.as_ref(),
                                    &enqueue.1,
                                )?,
                                editor_endpoint: request.editor_endpoint_id,
                                editor_presentation: request.editor_presentation,
                                editor_browser_tools: request.editor_browser_tools,
                                editor_svg_target: request.editor_svg_target_id,
                                editor_tool_context_id: request.editor_tool_context_id,
                                ..SubmissionContext::default()
                            },
                        )
                        .await
                        .map_err(host_error)?;
                    Ok(SubmitResponse::from(accepted))
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Input, responder, _| {
                let result = async {
                    require(&input.1, INPUT, Some(&request.session_id))?;
                    let queue_actions = require(
                        &input.1,
                        super::queue_actions::CAPABILITY,
                        Some(&request.session_id),
                    )
                    .is_ok();
                    let inspected = input
                        .0
                        .inspect_input(request.session_id, request.input_id)
                        .await
                        .map_err(host_error)?;
                    let disposition = inspected.receipt.disposition.clone();
                    let mut receipt = SubmitResponse::from(inspected.receipt);
                    if queue_actions {
                        match disposition {
                            InputDisposition::CheckedOut { .. } => {
                                receipt.disposition = SubmissionDisposition::CheckedOut;
                            }
                            InputDisposition::Transferred { turn } => {
                                receipt.disposition = SubmissionDisposition::Transferred;
                                receipt.turn_id = Some(turn);
                            }
                            _ => {}
                        }
                    }
                    let display = crate::host::message_context::display_parts(
                        &inspected.parts,
                        &inspected.settings.skills,
                    );
                    Ok(InputResponse {
                        receipt,
                        settings: inspected.settings,
                        text_editable: inspected.text_editable,
                        text_only: matches!(inspected.parts.as_slice(), [PromptPart::Text { .. }]),
                        display_parts: display_parts(display, &input.1),
                        prompt: inspected
                            .parts
                            .into_iter()
                            .filter_map(prompt_block)
                            .collect(),
                    })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_supervised_request(
            async move |request: Replace, responder, _| {
                let result = async {
                    require(&replace.1, REPLACE, Some(&request.queue.session_id))?;
                    let (questions, question_batches) =
                        questions::support(&replace.1, request.meta.as_ref())?;
                    let edit = QueueEdit::Replace {
                        input: request.input_id,
                        replacement: request.replacement_input_id,
                        parts: prompt_parts(request.prompt, image_intake, false)?,
                        questions,
                        question_batches,
                    };
                    edit_queue(&replace.0, request.queue, edit).await
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: ReplaceText, responder, _| {
                let result = async {
                    require(
                        &replace_text.1,
                        REPLACE_TEXT,
                        Some(&request.queue.session_id),
                    )?;
                    replace_text
                        .0
                        .replace_queued_text(
                            request.queue.session_id,
                            request.queue.request_id,
                            request.queue.expected_session_revision,
                            request.input_id,
                            request.replacement_input_id,
                            request.text,
                        )
                        .await
                        .map(QueueResponse::from)
                        .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Withdraw, responder, _| {
                let result = async {
                    require(&withdraw.1, WITHDRAW, Some(&request.queue.session_id))?;
                    edit_queue(
                        &withdraw.0,
                        request.queue,
                        QueueEdit::Withdraw {
                            input: request.input_id,
                        },
                    )
                    .await
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Reorder, responder, _| {
                let result = async {
                    require(&reorder.1, REORDER, Some(&request.queue.session_id))?;
                    edit_queue(
                        &reorder.0,
                        request.queue,
                        QueueEdit::Reorder {
                            inputs: request.input_ids,
                        },
                    )
                    .await
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_supervised_request(
            async move |ResumeQueue(queue): ResumeQueue, responder, _| {
                let result = async {
                    require(&resume_queue.1, RESUME_QUEUE, Some(&queue.session_id))?;
                    resume_queue
                        .0
                        .resume_queue(
                            queue.session_id,
                            queue.request_id,
                            queue.expected_session_revision,
                        )
                        .await
                        .map(QueueResponse::from)
                        .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Steer, responder, _| {
                let result = async {
                    require(&steer.1, STEER, Some(&request.task.session_id))?;
                    let turn = request.task.turn_id.clone();
                    let parts = request
                        .prompt
                        .into_iter()
                        .map(prompt_part)
                        .collect::<Result<_>>()?;
                    let receipt = steer
                        .0
                        .steer(
                            request.task.into(),
                            request.expected_history_position,
                            parts,
                        )
                        .await
                        .map_err(host_error)?;
                    turn_receipt(receipt, turn)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |Pause(task): Pause, responder, _| {
                let result = async {
                    require(&pause.1, PAUSE, Some(&task.session_id))?;
                    let turn = task.turn_id.clone();
                    let receipt = pause.0.pause(task.into()).await.map_err(host_error)?;
                    turn_receipt(receipt, turn)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_supervised_request(
            async move |request: Resume, responder, _| {
                let result = async {
                    let session = request.task.session_id.clone();
                    require(&sessions, RESUME, Some(&session))?;
                    let request_id = request.task.request_id.clone();
                    let turn = match request.cancelled_wakeup_id {
                        Some(wait) => {
                            require(&sessions, wakeups::CONTINUE_CANCELLED, Some(&session))?;
                            host.resume_cancelled_wakeup(
                                request.task.into(),
                                request.expected_epoch,
                                request.expected_journal_position,
                                wait,
                            )
                            .await
                        }
                        None => {
                            host.resume(
                                request.task.into(),
                                request.expected_epoch,
                                request.expected_journal_position,
                            )
                            .await
                        }
                    }
                    .map_err(host_error)?;
                    require(&sessions, RESUME, Some(&session))?;
                    Ok(ResumeResponse {
                        request_id,
                        turn: TurnSummary::from(turn),
                    })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}

async fn edit_queue(host: &Host, queue: QueueBasis, edit: QueueEdit) -> Result<QueueResponse> {
    host.edit_queue(
        queue.session_id,
        queue.request_id,
        queue.expected_session_revision,
        edit,
    )
    .await
    .map(QueueResponse::from)
    .map_err(host_error)
}

pub(super) fn prompt_block(part: PromptPart) -> Option<ContentBlock> {
    Some(match part {
        PromptPart::MessageContext { .. } => return None,
        PromptPart::Text { text } => text.into(),
        PromptPart::EditorObservation { .. } => {
            ContentBlock::ResourceLink(crate::acp::projection::editor_context_link())
        }
        PromptPart::ResourceLink {
            name,
            uri,
            mime_type,
        } => ContentBlock::ResourceLink(ResourceLink::new(name, uri).mime_type(mime_type)),
        PromptPart::Skill { reference } => reference.uri().map_or_else(
            || format!("Selected skill {}.", reference.name()).into(),
            |uri| ContentBlock::ResourceLink(ResourceLink::new(reference.name(), uri)),
        ),
        PromptPart::RetainedImage { .. }
        | PromptPart::PreparedImage { .. }
        | PromptPart::Image { .. }
        | PromptPart::SelectedImage { .. } => crate::host::RETAINED_IMAGE_LABEL.trim().into(),
        PromptPart::RetainedFile { work } => {
            grida_agent_master::retained_file::display_name(work.asset().name())
                .as_deref()
                .map_or("Attached file.", str::trim)
                .into()
        }
        PromptPart::File { .. } => "Attached file.".into(),
        PromptPart::FileReference { reference } => {
            ContentBlock::ResourceLink(crate::acp::projection::file_reference_link(&reference))
        }
    })
}
