//! GRIDA-SEC-004 — Private listing and stopping of an attached chat's processes.

use super::*;
use crate::processes::ProcessEntry;

pub(in crate::acp) const PROCESSES: &str = "co.grida/session/processes";
/// Processes one stop request may name.
const MAX_STOP_IDS: usize = crate::processes::MAX_PROCESSES_PER_CHAT;

pub(super) fn capabilities(private: bool) -> impl Iterator<Item = &'static str> {
    private.then_some(PROCESSES).into_iter()
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/processes", response = ProcessesResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListProcesses {
    session_id: SessionId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct ProcessesResponse {
    session_id: SessionId,
    processes: Vec<ProcessEntry>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/stop-processes", response = StopResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StopProcesses {
    session_id: SessionId,
    /// Omitted stops every process of the chat.
    process_ids: Option<Vec<u64>>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct StopResponse {
    session_id: SessionId,
    /// The named processes that have ended.
    stopped: Vec<u64>,
}

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    let list = (host.clone(), sessions.clone());
    RequestRoutes::default()
        .on_receive_request(
            async move |request: ListProcesses, responder, _| {
                let result = require(&list.1, PROCESSES, Some(&request.session_id)).map(|()| {
                    ProcessesResponse {
                        processes: list.0.processes(&request.session_id),
                        session_id: request.session_id,
                    }
                });
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: StopProcesses, responder, _| {
                let result = async {
                    require(&sessions, PROCESSES, Some(&request.session_id))?;
                    if let Some(ids) = &request.process_ids {
                        let unique = ids.iter().collect::<BTreeSet<_>>();
                        if ids.is_empty()
                            || ids.len() > MAX_STOP_IDS
                            || unique.len() != ids.len()
                            || ids.contains(&0)
                        {
                            return Err(Error::invalid_params());
                        }
                    }
                    let stopped = host
                        .stop_processes(&request.session_id, request.process_ids.as_deref())
                        .await;
                    Ok(StopResponse {
                        session_id: request.session_id,
                        stopped,
                    })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}
