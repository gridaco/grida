//! GRIDA-SEC-004 — negotiated readback of one exact retained tool-result image.

use super::*;
use agent_kit_core::{ArtifactId, ToolCallId};
use base64::{Engine, engine::general_purpose::STANDARD};

pub(crate) const CAPABILITY: &str = "co.grida/session/tool-images";

pub(super) fn capability(private_stdio: bool) -> Option<&'static str> {
    (private_stdio && cfg!(any(target_os = "macos", target_os = "linux"))).then_some(CAPABILITY)
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/read-tool-image-chunk", response = ImageChunkResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImageChunkRequest {
    session_id: SessionId,
    turn_id: TurnId,
    tool_call_id: ToolCallId,
    media_id: ArtifactId,
    content_index: usize,
    offset: usize,
}

#[derive(Clone, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct ImageChunkResponse {
    session_id: SessionId,
    turn_id: TurnId,
    tool_call_id: ToolCallId,
    media_id: ArtifactId,
    content_index: usize,
    mime_type: String,
    total_bytes: usize,
    offset: usize,
    data: String,
    next_offset: Option<usize>,
}

impl std::fmt::Debug for ImageChunkResponse {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ToolImageChunkResponse")
            .field("offset", &self.offset)
            .field("encoded_bytes", &self.data.len())
            .finish()
    }
}

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    RequestRoutes::default().on_receive_request(
        async move |request: ImageChunkRequest, responder, _| {
            let _observation = match super::super::observation::Observation::begin(
                &sessions,
                Some(&request.session_id),
            ) {
                Ok(guard) => guard,
                Err(error) => return responder.respond_with_error(error),
            };
            let result = async {
                require(&sessions, CAPABILITY, Some(&request.session_id))?;
                let (total_bytes, bytes, next_offset) = host
                    .read_tool_image_chunk(
                        request.session_id.clone(),
                        request.turn_id.clone(),
                        request.tool_call_id.clone(),
                        request.media_id.clone(),
                        request.content_index,
                        request.offset,
                    )
                    .await
                    .map_err(host_error)?;
                require(&sessions, CAPABILITY, Some(&request.session_id))?;
                Ok(ImageChunkResponse {
                    session_id: request.session_id,
                    turn_id: request.turn_id,
                    tool_call_id: request.tool_call_id,
                    media_id: request.media_id,
                    content_index: request.content_index,
                    mime_type: "image/png".into(),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_clients_cannot_advertise_or_negotiate_tool_image_readback() {
        assert!(
            super::super::advertised(false, false, false, false, false, false)
                .get(CAPABILITY)
                .is_none()
        );
        let metadata = [(CAPABILITY.to_owned(), Value::from(1))]
            .into_iter()
            .collect();
        assert!(
            !super::super::negotiated(Some(&metadata), false, false, false, false, false, false)
                .contains(CAPABILITY)
        );
    }
}
