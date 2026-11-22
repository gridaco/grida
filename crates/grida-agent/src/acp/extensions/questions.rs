//! Negotiated question inspection and correlated responses.

use super::{QUESTION_BATCH_LIST as QUESTIONS_V2, *};
use crate::host::{Questions, QuestionsV2, TurnControl};
use agent_kit_core::WaitId;
use grida_agent_master::questions::{QuestionAnswer, QuestionItemAnswer};

const QUESTIONS: &str = "co.grida/session/questions";
const ANSWER: &str = "co.grida/session/answer-question";
const ANSWER_V2: &str = "co.grida/session/answer-question-v2";
pub(super) const CAPABILITIES: [&str; 4] = [QUESTIONS, ANSWER, QUESTIONS_V2, ANSWER_V2];
/// Semantic support for dismissing a question locally until turn completion.
pub(super) const OPTIONAL: &str = "co.grida/session/optional-questions";

/// Choose the question shape for newly admitted work. An attached supervisor
/// can request singleton tools for a consumer that uses the older interface.
pub(super) fn support(
    sessions: &Mutex<ConnectionSessions>,
    meta: Option<&Meta>,
) -> Result<(bool, bool)> {
    let use_batches = match meta.and_then(|meta| meta.get(QUESTIONS_V2)) {
        None => true,
        Some(Value::Bool(false)) => false,
        Some(_) => return Err(Error::invalid_params().data("question_batch_preference_invalid")),
    };
    let sessions = sessions.lock().unwrap();
    let batches = use_batches && has_pair(&sessions, QUESTIONS_V2, ANSWER_V2);
    Ok((batches || has_pair(&sessions, QUESTIONS, ANSWER), batches))
}

fn has_pair(sessions: &ConnectionSessions, list: &str, answer: &str) -> bool {
    sessions.negotiated.contains(list) && sessions.negotiated.contains(answer)
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

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/questions-v2", response = QuestionsV2Response)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListQuestionsV2 {
    session_id: SessionId,
    turn_id: TurnId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(transparent)]
struct QuestionsV2Response(QuestionsV2);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/session/answer-question-v2", response = TurnControlResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AnswerQuestionV2 {
    session_id: SessionId,
    turn_id: TurnId,
    request_id: ChangeId,
    expected_session_revision: SessionRevision,
    expected_control_revision: ControlRevision,
    expected_history_position: HistoryPosition,
    wait_id: WaitId,
    answers: Vec<QuestionItemAnswer>,
}

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    let list_host = host.clone();
    let list_sessions = sessions.clone();
    let list_v2_host = host.clone();
    let list_v2_sessions = sessions.clone();
    let answer_v2_host = host.clone();
    let answer_v2_sessions = sessions.clone();
    RequestRoutes::default()
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
        .on_receive_request(
            async move |request: ListQuestionsV2, responder, _| {
                let result = async {
                    require(&list_v2_sessions, QUESTIONS_V2, Some(&request.session_id))?;
                    let questions = list_v2_host
                        .questions_v2(request.session_id, request.turn_id)
                        .await
                        .map_err(host_error)?;
                    Ok(QuestionsV2Response(questions))
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: AnswerQuestionV2, responder, _| {
                let result = async {
                    require(&answer_v2_sessions, ANSWER_V2, Some(&request.session_id))?;
                    let receipt = answer_v2_host
                        .answer_question_v2(
                            TurnControl {
                                session: request.session_id,
                                turn: request.turn_id.clone(),
                                request: request.request_id,
                                expected_session: request.expected_session_revision,
                                expected_control: request.expected_control_revision,
                            },
                            request.expected_history_position,
                            request.wait_id,
                            request.answers,
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
