//! GRIDA-SEC-004 — private ACP Library selection inspection and resolution.

use super::*;
use crate::host::{
    ImageUpload, TurnControl,
    library::{Selection, Selections},
};
use agent_kit_core::WaitId;
use uuid::Uuid;

const LIST: &str = "co.grida/session/library-selections";
const ANSWER: &str = "co.grida/session/answer-library-selection";
pub(in crate::acp) const CAPABILITIES: [&str; 2] = [LIST, ANSWER];

pub(super) fn available(sessions: &Mutex<ConnectionSessions>) -> bool {
    let sessions = sessions.lock().unwrap();
    CAPABILITIES
        .iter()
        .all(|key| sessions.negotiated.contains(key))
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/library-selections", response = LibrarySelectionsResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListLibrarySelections {
    session_id: SessionId,
    turn_id: TurnId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(transparent)]
struct LibrarySelectionsResponse(Selections);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/answer-library-selection", response = TurnControlResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AnswerLibrarySelection {
    session_id: SessionId,
    turn_id: TurnId,
    request_id: ChangeId,
    expected_session_revision: SessionRevision,
    expected_control_revision: ControlRevision,
    wait_id: WaitId,
    answer: SelectedPng,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum SelectedPng {
    Selected { id: String, data: String },
    Skipped,
}

impl std::fmt::Debug for SelectedPng {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Selected { id, .. } => formatter
                .debug_struct("Selected")
                .field("id", id)
                .finish_non_exhaustive(),
            Self::Skipped => formatter.write_str("Skipped"),
        }
    }
}

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    let list_host = host.clone();
    let list_sessions = sessions.clone();
    RequestRoutes::default()
        .on_receive_request(
            async move |request: ListLibrarySelections, responder, _| {
                let result = async {
                    require(&list_sessions, LIST, Some(&request.session_id))?;
                    let selections = list_host
                        .library_selections(request.session_id, request.turn_id)
                        .await
                        .map_err(host_error)?;
                    Ok(LibrarySelectionsResponse(selections))
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: AnswerLibrarySelection, responder, _| {
                let result = async {
                    require(&sessions, ANSWER, Some(&request.session_id))?;
                    let selection = match request.answer {
                        SelectedPng::Selected { id, data } => {
                            let id = Uuid::parse_str(&id).map_err(|_| Error::invalid_params())?;
                            Selection::Selected {
                                id: id.to_string(),
                                upload: ImageUpload::decode("image/png", &data)
                                    .map_err(host_error)?,
                            }
                        }
                        SelectedPng::Skipped => Selection::Skipped,
                    };
                    let receipt = host
                        .answer_library_selection(
                            TurnControl {
                                session: request.session_id,
                                turn: request.turn_id.clone(),
                                request: request.request_id,
                                expected_session: request.expected_session_revision,
                                expected_control: request.expected_control_revision,
                            },
                            request.wait_id,
                            selection,
                        )
                        .await
                        .map_err(host_error)?;
                    turn_receipt(receipt, request.turn_id)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}
