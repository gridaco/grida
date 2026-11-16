//! GRIDA-SEC-004 — child observations require an attached parent, never a child attachment.

use super::*;
use crate::acp::observation::Observation;

pub(super) const CAPABILITY: &str = "co.grida/subagent/activity";

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/subagent/activity", response = ActivityResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Activity {
    parent_session_id: SessionId,
    after_child_id: Option<SessionId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(transparent)]
struct ActivityResponse(Value);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/subagent/conversation", response = ConversationResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Conversation {
    parent_session_id: SessionId,
    child_id: SessionId,
    before: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(transparent)]
struct ConversationResponse(Value);

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    let activity = (host.clone(), sessions.clone());
    RequestRoutes::default()
        .on_receive_request(
            async move |request: Activity, responder, _| {
                let result = async {
                    let parent = request.parent_session_id;
                    require(&activity.1, CAPABILITY, Some(&parent))?;
                    let _observation = Observation::begin(&activity.1, Some(&parent))?;
                    let page = activity
                        .0
                        .subagent_activity(parent.clone(), request.after_child_id)
                        .await
                        .map_err(host_error)?;
                    require(&activity.1, CAPABILITY, Some(&parent))?;
                    Ok(ActivityResponse(
                        serde_json::to_value(page)
                            .map_err(|_| unavailable("subagent_activity_encoding"))?,
                    ))
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Conversation, responder, _| {
                let result = async {
                    let parent = request.parent_session_id;
                    require(&sessions, CAPABILITY, Some(&parent))?;
                    let _observation = Observation::begin(&sessions, Some(&parent))?;
                    let page = host
                        .subagent_conversation(parent.clone(), request.child_id, request.before)
                        .await
                        .map_err(host_error)?;
                    require(&sessions, CAPABILITY, Some(&parent))?;
                    Ok(ConversationResponse(
                        serde_json::to_value(page)
                            .map_err(|_| unavailable("subagent_activity_encoding"))?,
                    ))
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}
