//! Negotiated question inspection and correlated responses.

use super::*;
use crate::host::{Questions, TurnControl};
use agent_kit_core::WaitId;
use grida_agent_master::questions::QuestionAnswer;

const QUESTIONS: &str = "co.grida/session/questions";
const ANSWER: &str = "co.grida/session/answer-question";
pub(super) const CAPABILITIES: [&str; 2] = [QUESTIONS, ANSWER];

pub(super) fn available(sessions: &Mutex<ConnectionSessions>) -> bool {
    let sessions = sessions.lock().unwrap();
    CAPABILITIES
        .iter()
        .all(|key| sessions.negotiated.contains(key))
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/questions", response = QuestionsResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListQuestions {
    session_id: SessionId,
    turn_id: TurnId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(transparent)]
struct QuestionsResponse(Questions);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/answer-question", response = TurnControlResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AnswerQuestion {
    session_id: SessionId,
    turn_id: TurnId,
    request_id: ChangeId,
    expected_session_revision: SessionRevision,
    expected_control_revision: ControlRevision,
    expected_history_position: HistoryPosition,
    wait_id: WaitId,
    answer: QuestionAnswer,
}

pub(super) fn handlers(
    host: Arc<Host>,
    sessions: Arc<Mutex<ConnectionSessions>>,
) -> Builder<
    Agent,
    impl HandleDispatchFrom<Client>,
    impl agent_client_protocol::RunWithConnectionTo<Client>,
    impl agent_client_protocol::HandleConnectionClose<Client>,
> {
    let list_host = host.clone();
    let list_sessions = sessions.clone();
    Agent
        .v1()
        .on_receive_request(
            async move |request: ListQuestions, responder, _| {
                let result = async {
                    require(&list_sessions, QUESTIONS, Some(&request.session_id))?;
                    let questions = list_host
                        .questions(request.session_id, request.turn_id)
                        .await
                        .map_err(host_error)?;
                    Ok(QuestionsResponse(questions))
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: AnswerQuestion, responder, _| {
                let result = async {
                    require(&sessions, ANSWER, Some(&request.session_id))?;
                    let receipt = host
                        .answer_question(
                            TurnControl {
                                session: request.session_id,
                                turn: request.turn_id.clone(),
                                request: request.request_id,
                                expected_session: request.expected_session_revision,
                                expected_control: request.expected_control_revision,
                            },
                            request.expected_history_position,
                            request.wait_id,
                            request.answer,
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
