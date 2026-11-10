//! Named skill selection for attached ACP sessions.

use super::*;
use crate::skills::SkillDescription;

pub(super) const CATALOG: &str = "co.grida/session/skills";

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/skills", response = SkillsResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Skills {
    session_id: SessionId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
struct SkillsResponse {
    skills: Vec<SkillDescription>,
}

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    RequestRoutes::default().on_receive_request(
        async move |request: Skills, responder, _| {
            let result = async {
                require(&sessions, CATALOG, Some(&request.session_id))?;
                let skills = host
                    .skill_catalog(request.session_id)
                    .await
                    .map_err(host_error)?;
                Ok(SkillsResponse { skills })
            }
            .await;
            responder.respond_with_result(result)
        },
        on_receive_request!(),
    )
}
