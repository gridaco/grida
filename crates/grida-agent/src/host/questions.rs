//! Native host composition and controls for product questions.

use super::*;
use agent_kit_core::tools::{InventorySnapshot, Tool};
use agent_kit_core::turn::{OperationInput, TurnState, WaitRecord};
use agent_kit_core::{GrantId, ToolId, WaitId};
use agent_kit_runtime::{AdmissionContext, ToolAdmission, ToolDecision, ToolGate, TurnOperations};
use grida_agent_master::questions::{
    QuestionAnswer, QuestionItem, QuestionItemAnswer, QuestionReply, QuestionStyle, QuestionTool,
    defer_for_answer, prepare_answer, prepare_batch_answer, read_question,
};

pub(super) struct QuestionAccess {
    selection: GrantSelection,
}

impl QuestionAccess {
    pub(super) fn new() -> Result<Self> {
        Ok(Self {
            selection: GrantSelection {
                authority: AuthorityBinding {
                    principal: PrincipalId::new("grida-local")?,
                    binding: BindingId::new("grida-questions-v1")?,
                    scope: ScopeId::new("local-interaction")?,
                },
                grants: vec![GrantId::new("question")?],
            },
        })
    }

    pub(super) fn accepts(&self, selection: &GrantSelection) -> bool {
        selection == &self.selection
    }

    pub(super) fn insert(
        &self,
        operations: TurnOperations,
        inventory: &mut Inventory,
        grants: &mut BTreeMap<ToolId, GrantSelection>,
        batches: bool,
    ) -> Result<()> {
        for style in [QuestionStyle::AnswerDependent, QuestionStyle::Nonblocking] {
            let tool = if batches {
                QuestionTool::new(operations.clone(), style)?
            } else {
                QuestionTool::legacy(operations.clone(), style)?
            };
            grants.insert(tool.definition().id.clone(), self.selection.clone());
            inventory.insert(Arc::new(tool))?;
        }
        Ok(())
    }

    pub(super) fn insert_library(
        &self,
        operations: TurnOperations,
        inventory: &mut Inventory,
        grants: &mut BTreeMap<ToolId, GrantSelection>,
    ) -> Result<()> {
        let tool = library::LibraryTool::new(operations)?;
        grants.insert(tool.definition().id.clone(), self.selection.clone());
        inventory.insert(Arc::new(tool))?;
        Ok(())
    }

    pub(super) async fn reconcile(
        &self,
        operations: &TurnOperations,
        questions: &InventorySnapshot,
    ) -> Result<()> {
        let view = operations.view();
        if !view.state.controls().admits_work() {
            return Ok(());
        }
        for operation in view.state.operations().values() {
            let record = &operation.record;
            let OperationInput::Tool(invocation) = &record.input else {
                continue;
            };
            if !(operation.is_running() || operation.is_uncertain())
                || !self.accepts(&record.grants)
                || questions.restore(invocation.clone()).is_err()
            {
                continue;
            }
            if let Err(error) = operations
                .reconcile_tool(record.id.clone(), questions.clone())
                .await
            {
                if !operations.view().state.controls().admits_work() {
                    return Ok(());
                }
                return Err(error);
            }
        }
        Ok(())
    }
}

impl ToolGate for QuestionAccess {
    fn decide(
        &self,
        admission: ToolAdmission,
        context: AdmissionContext,
    ) -> BoxFuture<'_, Result<ToolDecision>> {
        Box::pin(async move {
            if !self.accepts(&admission.grants) {
                return Err(problem(
                    ErrorKind::Unsupported,
                    "tool_execution_unavailable",
                ));
            }
            match admission.invocation.definition().id.as_str() {
                "question" | "question_async" => {
                    Ok(defer_for_answer(&admission, &context.operations)
                        .await?
                        .unwrap_or(ToolDecision::Permit))
                }
                library::TOOL => library::defer_for_answer(&admission, &context.operations).await,
                _ => Err(problem(
                    ErrorKind::Unsupported,
                    "tool_execution_unavailable",
                )),
            }
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingQuestion {
    pub wait_id: WaitId,
    pub style: QuestionStyle,
    pub question: String,
    pub options: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingQuestionBatch {
    pub wait_id: WaitId,
    pub style: QuestionStyle,
    pub questions: Vec<QuestionItem>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PendingQuestionV2 {
    Legacy(PendingQuestion),
    Batch(PendingQuestionBatch),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionList<T> {
    pub session_id: SessionId,
    pub turn_id: TurnId,
    pub control_revision: ControlRevision,
    pub history_position: HistoryPosition,
    pub questions: Vec<T>,
}

pub type Questions = QuestionList<PendingQuestion>;
pub type QuestionsV2 = QuestionList<PendingQuestionV2>;

pub(super) fn pending(state: &TurnState) -> Result<QuestionsV2> {
    let questions = state
        .waits()
        .values()
        .filter(|wait| !state.controls().cancelled && wait.is_pending() && is_question(wait))
        .map(|wait| {
            let request = read_question(wait)?;
            if request.version == 1 {
                let [item]: [QuestionItem; 1] = request.questions.try_into().map_err(|_| {
                    problem(ErrorKind::InvalidState, "legacy_question_shape_invalid")
                })?;
                Ok(PendingQuestionV2::Legacy(PendingQuestion {
                    wait_id: wait.id.clone(),
                    style: request.style,
                    question: item.question,
                    options: item
                        .options
                        .into_iter()
                        .map(|option| option.label)
                        .collect(),
                }))
            } else {
                Ok(PendingQuestionV2::Batch(PendingQuestionBatch {
                    wait_id: wait.id.clone(),
                    style: request.style,
                    questions: request.questions,
                }))
            }
        })
        .collect::<Result<_>>()?;
    Ok(QuestionList {
        session_id: state.binding().session.clone(),
        turn_id: state.binding().turn.clone(),
        control_revision: state.controls().revision,
        history_position: state.history().position(),
        questions,
    })
}

pub(super) fn is_question(wait: &WaitRecord) -> bool {
    wait.request.schema().as_str() == grida_agent_master::questions::REQUEST_SCHEMA
}

pub(crate) fn reply_text(replies: &[QuestionReply]) -> String {
    if let [reply] = replies
        && reply.question_id.is_none()
    {
        return reply.answer.clone();
    }
    replies
        .iter()
        .map(|reply| format!("Question: {}\nAnswer: {}", reply.question, reply.answer))
        .collect::<Vec<_>>()
        .join("\n\n")
}

enum QuestionResponse {
    Legacy(QuestionAnswer),
    Batch(Vec<QuestionItemAnswer>),
}

impl Host {
    pub async fn questions(&self, session: SessionId, turn: TurnId) -> Result<Questions> {
        let listed = self.questions_v2(session, turn).await?;
        Ok(QuestionList {
            session_id: listed.session_id,
            turn_id: listed.turn_id,
            control_revision: listed.control_revision,
            history_position: listed.history_position,
            questions: listed
                .questions
                .into_iter()
                .filter_map(|entry| match entry {
                    PendingQuestionV2::Legacy(question) => Some(question),
                    PendingQuestionV2::Batch(_) => None,
                })
                .collect(),
        })
    }

    pub async fn questions_v2(&self, session: SessionId, turn: TurnId) -> Result<QuestionsV2> {
        self.store.inspect_turn_with(session, turn, pending).await
    }

    pub async fn answer_question(
        &self,
        control: TurnControl,
        expected_history: HistoryPosition,
        wait_id: WaitId,
        answer: QuestionAnswer,
    ) -> Result<ControlReceipt> {
        self.answer_question_with(
            control,
            expected_history,
            wait_id,
            QuestionResponse::Legacy(answer),
        )
        .await
    }

    pub async fn answer_question_v2(
        &self,
        control: TurnControl,
        expected_history: HistoryPosition,
        wait_id: WaitId,
        answers: Vec<QuestionItemAnswer>,
    ) -> Result<ControlReceipt> {
        self.answer_question_with(
            control,
            expected_history,
            wait_id,
            QuestionResponse::Batch(answers),
        )
        .await
    }

    async fn answer_question_with(
        &self,
        control: TurnControl,
        expected_history: HistoryPosition,
        wait_id: WaitId,
        response: QuestionResponse,
    ) -> Result<ControlReceipt> {
        self.owned_control(move |host| async move {
            let (prepared, can_wake) = host
                .store
                .inspect_turn_with(
                    control.session.clone(),
                    control.turn.clone(),
                    move |state| {
                        let wait = state
                            .waits()
                            .get(&wait_id)
                            .filter(|wait| is_question(wait))
                            .ok_or_else(|| {
                                problem(ErrorKind::Unavailable, "question_unavailable")
                            })?;
                        if state.controls().cancelled && wait.is_pending() {
                            return Err(problem(
                                ErrorKind::Conflict,
                                "question_no_longer_answerable",
                            ));
                        }
                        let mut prepared = match response {
                            QuestionResponse::Legacy(answer) => prepare_answer(wait, answer)?,
                            QuestionResponse::Batch(answers) => {
                                let request = read_question(wait)?;
                                if request.version == 1 {
                                    let [answer]: [QuestionItemAnswer; 1] =
                                        answers.try_into().map_err(|_| {
                                            problem(
                                                ErrorKind::InvalidInput,
                                                "question_answer_invalid",
                                            )
                                        })?;
                                    if request.questions.first().map(|item| item.id.as_str())
                                        != Some(answer.id.as_str())
                                    {
                                        return Err(problem(
                                            ErrorKind::InvalidInput,
                                            "question_answer_invalid",
                                        ));
                                    }
                                    prepare_answer(wait, answer.answer)?
                                } else {
                                    prepare_batch_answer(wait, answers)?
                                }
                            }
                        };
                        if wait.answer.is_some() {
                            // Replay exactly the original control, including the
                            // contribution format of a previous host version.
                            prepared.contribution = state
                                .history()
                                .records()
                                .iter()
                                .find(|record| {
                                    let HistoryRecord::Message(message) = record;
                                    message.id.as_str() == wait.id.as_str()
                                })
                                .cloned();
                        }
                        Ok((
                            prepared,
                            state.outcome().is_none()
                                && state.controls().admits_work()
                                && state.waits().values().all(|other| {
                                    other.id == wait.id
                                        || !grida_agent_master::questions::blocks_progress(other)
                                }),
                        ))
                    },
                )
                .await?;
            let action = if let Some(record) = prepared.contribution {
                SessionControl::ResolveAndAppend {
                    turn: control.turn.clone(),
                    expected: control.expected_control,
                    expected_history,
                    wait: prepared.wait,
                    answer: prepared.answer,
                    records: vec![record],
                }
            } else {
                SessionControl::Resolve {
                    turn: control.turn.clone(),
                    expected: control.expected_control,
                    wait: prepared.wait,
                    answer: prepared.answer,
                }
            };
            host.resolve_interaction(control, action, can_wake, None)
                .await
        })
        .await
    }

    pub(super) async fn resolve_interaction(
        &self,
        control: TurnControl,
        action: SessionControl,
        can_wake: bool,
        timer: Option<&agent_kit_core::CancellationToken>,
    ) -> Result<ControlReceipt> {
        let work = self.work.lock().await;
        self.resolve_interaction_locked(work, control, action, can_wake, timer)
            .await
    }

    pub(super) async fn resolve_interaction_locked(
        &self,
        mut work: tokio::sync::MutexGuard<'_, Work>,
        control: TurnControl,
        action: SessionControl,
        can_wake: bool,
        timer: Option<&agent_kit_core::CancellationToken>,
    ) -> Result<ControlReceipt> {
        if work.closed {
            return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
        }
        if timer.is_some_and(agent_kit_core::CancellationToken::is_cancelled) {
            return Err(problem(ErrorKind::Unavailable, "wakeup_owner_released"));
        }
        // Reserve the existing scheduler's wake alongside the answer.
        // An owner that suspends concurrently releases the same work lock
        // before the scheduler can claim the answered turn.
        if can_wake {
            work.check_answer_capacity(&control.session, &control.turn)?;
        }
        let request = ControlRequest {
            id: control.request,
            session: control.session.clone(),
            expected_revision: control.expected_session,
            action,
        };
        let reply = match &request.action {
            SessionControl::ResolveAndAppend { records, .. } => records.iter().find_map(|record| {
                let HistoryRecord::Message(message) = record;
                grida_agent_master::questions::visible_replies(message)
                    .map(|replies| (message.id.clone(), replies))
            }),
            _ => None,
        };
        let receipt = if let Some((id, replies)) = reply {
            if let Some(existing) = self.store.control_receipt(request.clone()).await? {
                existing
            } else {
                let receipt = self.store.control(request).await?;
                // A suspended worker cannot observe this message. Record the
                // observed acceptance before the scheduler can resume it.
                self.activity_order
                    .record_message(&control.session, &control.turn, &id);
                if replies.iter().any(|reply| reply.question_id.is_some()) {
                    let text = Arc::from(reply_text(&replies));
                    let _ = self
                        .live_updates
                        .send(live::LiveUpdate::Text(live::LiveText {
                            session: control.session.clone(),
                            turn: control.turn.clone(),
                            message: id,
                            offset: 0,
                            replace: true,
                            text,
                            kind: live::LiveTextKind::QuestionReply(replies),
                        }));
                }
                receipt
            }
        } else {
            self.store.control(request).await?
        };
        if can_wake {
            let position = receipt
                .turn
                .as_ref()
                .ok_or_else(|| problem(ErrorKind::Uncertain, "interaction_receipt_missing"))?
                .record()
                .position;
            work.queue_answered(control.session, control.turn, position);
        }
        drop(work);
        self.wake_ready().await;
        Ok(receipt)
    }
}

impl Host {
    pub(super) async fn answered_claim(
        &self,
        session: &SessionId,
        turn: &TurnId,
        view: &SessionView,
    ) -> Result<Option<ClaimRequest>> {
        if !view
            .current
            .as_ref()
            .is_some_and(|current| &current.binding.turn == turn)
        {
            return Ok(None);
        }
        let basis = self
            .store
            .inspect_turn_with(session.clone(), turn.clone(), |state| {
                let ready = state.is_suspended()
                    && state.controls().admits_work()
                    && !state
                        .waits()
                        .values()
                        .any(grida_agent_master::questions::blocks_progress)
                    && state.waits().values().any(|wait| {
                        ((is_question(wait)
                            || library::is_selection(wait)
                            || crate::permissions::is_approval(wait))
                            && wait.answer.is_some())
                            || wakeups::was_delivered(wait)
                    });
                Ok(ready.then(|| (state.binding().epoch, state.position())))
            })
            .await?;
        let Some((epoch, position)) = basis else {
            return Ok(None);
        };
        Ok(Some(ClaimRequest {
            id: change_id()?,
            session: session.clone(),
            expected_revision: view.revision,
            selection: TurnSelection::Resume {
                turn: turn.clone(),
                epoch,
                position,
            },
        }))
    }
}

impl Work {
    pub(super) fn check_answer_capacity(&self, session: &SessionId, turn: &TurnId) -> Result<()> {
        if self.closed {
            return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
        }
        if self.ready.len() >= MAX_READY_SESSIONS
            && !self
                .ready
                .iter()
                .any(|item| item.wakes_answer(session, turn))
        {
            return Err(problem(ErrorKind::LimitExceeded, "host_ready_queue_limit"));
        }
        Ok(())
    }

    pub(super) fn queue_answered(
        &mut self,
        session: SessionId,
        turn: TurnId,
        position: JournalPosition,
    ) {
        if let Some(ReadyWork::Answered {
            position: queued, ..
        }) = self
            .ready
            .iter_mut()
            .find(|item| item.wakes_answer(&session, &turn))
        {
            *queued = (*queued).max(position);
        } else {
            self.defer(ReadyWork::Answered {
                session,
                turn,
                position,
            });
        }
    }
}
