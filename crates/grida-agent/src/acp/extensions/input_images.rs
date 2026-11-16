//! GRIDA-SEC-004 — bounded original-image reads for an attached recorded message.

use super::*;
use crate::host::PromptPart;
use agent_client_protocol::v1::schema::ResourceLink;
use agent_kit_core::{ArtifactId, MessageId};
use base64::{Engine, engine::general_purpose::STANDARD};
use std::fmt;

pub(super) const CAPABILITY: &str = "co.grida/session/input-image";
pub(super) const CHUNKS: &str = "co.grida/session/input-image-chunks";
pub(super) const QUEUED: &str = "co.grida/session/queued-input-image-chunks";

pub(super) fn capability(private_stdio: bool) -> Option<&'static str> {
    (private_stdio && cfg!(any(target_os = "macos", target_os = "linux"))).then_some(CAPABILITY)
}

pub(super) fn chunks_capability(private_stdio: bool) -> Option<&'static str> {
    (private_stdio && cfg!(any(target_os = "macos", target_os = "linux"))).then_some(CHUNKS)
}

pub(super) fn queued_capability(private_stdio: bool) -> Option<&'static str> {
    (private_stdio && cfg!(any(target_os = "macos", target_os = "linux"))).then_some(QUEUED)
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/queued-message", response = QueuedMessageResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QueuedMessageRequest {
    session_id: SessionId,
    input_id: ChangeId,
    expected_session_revision: SessionRevision,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct QueuedMessageResponse {
    input_id: ChangeId,
    text_only: bool,
    text_editable: bool,
    prompt: Vec<ContentBlock>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/read-queued-input-image-chunk", response = QueuedImageChunkResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QueuedImageChunkRequest {
    session_id: SessionId,
    input_id: ChangeId,
    expected_session_revision: SessionRevision,
    attachment_uri: String,
    offset: usize,
}

#[derive(Clone, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct QueuedImageChunkResponse {
    input_id: ChangeId,
    attachment_uri: String,
    mime_type: String,
    total_bytes: usize,
    offset: usize,
    data: String,
    next_offset: Option<usize>,
}

impl fmt::Debug for QueuedImageChunkResponse {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("QueuedImageChunkResponse")
            .field("input_id", &self.input_id)
            .field("offset", &self.offset)
            .field("encoded_bytes", &self.data.len())
            .finish()
    }
}

fn queued_prompt_block(part: PromptPart) -> ContentBlock {
    let prefix = crate::acp::projection::RETAINED_ATTACHMENT_URI;
    match part {
        PromptPart::RetainedImage { asset } => ContentBlock::ResourceLink(
            ResourceLink::new("image.png", format!("{prefix}{}", asset.id()))
                .mime_type("image/png".to_owned())
                .size(i64::try_from(asset.size()).ok()),
        ),
        PromptPart::PreparedImage { image } => ContentBlock::ResourceLink(
            ResourceLink::new(image.name, format!("{prefix}{}", image.original.id()))
                .mime_type(image.mime_type)
                .size(i64::try_from(image.original.size()).ok()),
        ),
        PromptPart::RetainedFile { work } => ContentBlock::ResourceLink(
            ResourceLink::new(
                work.asset().name(),
                format!("{prefix}{}", work.asset().id()),
            )
            .size(i64::try_from(work.asset().size()).ok()),
        ),
        other => lifecycle::prompt_block(other),
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/read-input-image-chunk", response = ImageChunkResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImageChunkRequest {
    session_id: SessionId,
    message_id: MessageId,
    attachment_uri: String,
    offset: usize,
}

#[derive(Clone, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct ImageChunkResponse {
    message_id: MessageId,
    attachment_uri: String,
    mime_type: String,
    total_bytes: usize,
    offset: usize,
    data: String,
    next_offset: Option<usize>,
}

impl fmt::Debug for ImageChunkResponse {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ImageChunkResponse")
            .field("message_id", &self.message_id)
            .field("offset", &self.offset)
            .field("encoded_bytes", &self.data.len())
            .finish()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/read-input-image", response = ImageResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImageRequest {
    session_id: SessionId,
    message_id: MessageId,
    attachment_uri: String,
}

#[derive(Clone, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct ImageResponse {
    message_id: MessageId,
    attachment_uri: String,
    mime_type: String,
    data: String,
}

impl fmt::Debug for ImageResponse {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ImageResponse")
            .field("message_id", &self.message_id)
            .field("encoded_bytes", &self.data.len())
            .finish()
    }
}

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    let chunk_host = host.clone();
    let chunk_sessions = sessions.clone();
    let queued_host = host.clone();
    let queued_sessions = sessions.clone();
    let queued_message_host = host.clone();
    let queued_message_sessions = sessions.clone();
    RequestRoutes::default()
        .on_receive_request(
            async move |request: ImageRequest, responder, _| {
                let result = async {
                    require(&sessions, CAPABILITY, Some(&request.session_id))?;
                    let missing = || unavailable("input_image_unavailable");
                    let attachment = request
                        .attachment_uri
                        .strip_prefix(crate::acp::projection::RETAINED_ATTACHMENT_URI)
                        .and_then(|id| ArtifactId::new(id).ok())
                        .ok_or_else(missing)?;
                    let bytes = host
                        .read_input_image(
                            request.session_id.clone(),
                            request.message_id.clone(),
                            attachment,
                        )
                        .await
                        .map_err(host_error)?;
                    require(&sessions, CAPABILITY, Some(&request.session_id))?;
                    Ok(ImageResponse {
                        message_id: request.message_id,
                        attachment_uri: request.attachment_uri,
                        mime_type: "image/png".into(),
                        data: STANDARD.encode(bytes),
                    })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: ImageChunkRequest, responder, _| {
                let result = async {
                    require(&chunk_sessions, CHUNKS, Some(&request.session_id))?;
                    let attachment = request
                        .attachment_uri
                        .strip_prefix(crate::acp::projection::RETAINED_ATTACHMENT_URI)
                        .and_then(|id| ArtifactId::new(id).ok())
                        .ok_or_else(|| unavailable("input_image_unavailable"))?;
                    let (mime_type, total_bytes, bytes, next_offset) = chunk_host
                        .read_input_image_chunk(
                            request.session_id.clone(),
                            request.message_id.clone(),
                            attachment,
                            request.offset,
                        )
                        .await
                        .map_err(host_error)?;
                    require(&chunk_sessions, CHUNKS, Some(&request.session_id))?;
                    Ok(ImageChunkResponse {
                        message_id: request.message_id,
                        attachment_uri: request.attachment_uri,
                        mime_type,
                        total_bytes,
                        offset: request.offset,
                        data: STANDARD.encode(bytes),
                        next_offset,
                    })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: QueuedMessageRequest, responder, _| {
                let result = async {
                    require(&queued_message_sessions, QUEUED, Some(&request.session_id))?;
                    let parts = queued_message_host
                        .queued_message_parts(
                            &request.session_id,
                            &request.input_id,
                            request.expected_session_revision,
                        )
                        .await
                        .map_err(host_error)?;
                    require(&queued_message_sessions, QUEUED, Some(&request.session_id))?;
                    let text_editable = queued_message_host
                        .queued_text_editable(
                            &request.session_id,
                            &request.input_id,
                            request.expected_session_revision,
                        )
                        .await
                        .map_err(host_error)?;
                    Ok(QueuedMessageResponse {
                        input_id: request.input_id,
                        text_only: matches!(parts.as_slice(), [PromptPart::Text { .. }]),
                        text_editable,
                        prompt: parts.into_iter().map(queued_prompt_block).collect(),
                    })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: QueuedImageChunkRequest, responder, _| {
                let result = async {
                    require(&queued_sessions, QUEUED, Some(&request.session_id))?;
                    let attachment = request
                        .attachment_uri
                        .strip_prefix(crate::acp::projection::RETAINED_ATTACHMENT_URI)
                        .and_then(|id| ArtifactId::new(id).ok())
                        .ok_or_else(|| unavailable("queued_input_image_unavailable"))?;
                    let (mime_type, total_bytes, bytes, next_offset) = queued_host
                        .read_queued_input_image_chunk(
                            request.session_id.clone(),
                            request.input_id.clone(),
                            request.expected_session_revision,
                            attachment,
                            request.offset,
                        )
                        .await
                        .map_err(host_error)?;
                    require(&queued_sessions, QUEUED, Some(&request.session_id))?;
                    Ok(QueuedImageChunkResponse {
                        input_id: request.input_id,
                        attachment_uri: request.attachment_uri,
                        mime_type,
                        total_bytes,
                        offset: request.offset,
                        data: STANDARD.encode(bytes),
                        next_offset,
                    })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}
