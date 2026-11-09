//! Native host composition and controls for product questions.

use super::*;
use agent_kit_core::tools::{InventorySnapshot, Tool};
use agent_kit_core::turn::{OperationInput, TurnState, WaitRecord};
use agent_kit_core::{GrantId, ToolId, WaitId};
use agent_kit_runtime::{AdmissionContext, ToolAdmission, ToolDecision, ToolGate, TurnOperations};
use grida_agent_master::questions::{
    QuestionAnswer, QuestionStyle, QuestionTool, defer_for_answer, prepare_answer, read_question,
};

const QUESTION_REQUEST_SCHEMA: &str = "grida.agent.question";

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
    ) -> Result<()> {
        for style in [QuestionStyle::AnswerDependent, QuestionStyle::Nonblocking] {
            let tool = QuestionTool::new(operations.clone(), style)?;
            grants.insert(tool.definition().id.clone(), self.selection.clone());
            inventory.insert(Arc::new(tool))?;
        }
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
            if !self.accepts(&admission.grants)
                || !matches!(
                    admission.invocation.definition().id.as_str(),
                    "question" | "question_async"
                )
            {
                return Err(problem(
                    ErrorKind::Unsupported,
                    "tool_execution_unavailable",
                ));
            }
            Ok(defer_for_answer(&admission, &context.operations)
                .await?
                .unwrap_or(ToolDecision::Permit))
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
pub struct Questions {
    pub session_id: SessionId,
    pub turn_id: TurnId,
    pub control_revision: ControlRevision,
    pub history_position: HistoryPosition,
    pub questions: Vec<PendingQuestion>,
}

pub(super) fn pending(state: &TurnState) -> Result<Questions> {
    let questions = state
        .waits()
        .values()
        .filter(|wait| wait.is_pending() && is_question(wait))
        .map(|wait| {
            let request = read_question(wait)?;
            Ok(PendingQuestion {
                wait_id: wait.id.clone(),
                style: request.style,
                question: request.prompt.question,
                options: request.prompt.options,
            })
        })
        .collect::<Result<_>>()?;
    Ok(Questions {
        session_id: state.binding().session.clone(),
        turn_id: state.binding().turn.clone(),
        control_revision: state.controls().revision,
        history_position: state.history().position(),
        questions,
    })
}

fn is_question(wait: &WaitRecord) -> bool {
    wait.request.schema().as_str() == QUESTION_REQUEST_SCHEMA
}

impl Host {
    pub async fn questions(&self, session: SessionId, turn: TurnId) -> Result<Questions> {
        self.store.inspect_turn_with(session, turn, pending).await
    }

    pub async fn answer_question(
        &self,
        control: TurnControl,
        expected_history: HistoryPosition,
        wait_id: WaitId,
        answer: QuestionAnswer,
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
                        Ok((
                            prepare_answer(wait, answer)?,
                            state.outcome().is_none()
                                && state.controls().admits_work()
                                && state
                                    .waits()
                                    .values()
                                    .all(|other| other.id == wait.id || !other.is_pending()),
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
            host.resolve_interaction(control, action, can_wake).await
        })
        .await
    }

    pub(super) async fn resolve_interaction(
        &self,
        control: TurnControl,
        action: SessionControl,
        can_wake: bool,
    ) -> Result<ControlReceipt> {
        let mut work = self.work.lock().await;
        if work.closed {
            return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
        }
        // Reserve the existing scheduler's wake alongside the answer.
        // An owner that suspends concurrently releases the same work lock
        // before the scheduler can claim the answered turn.
        if can_wake
            && work.ready.len() >= MAX_READY_SESSIONS
            && !work
                .ready
                .iter()
                .any(|item| item.wakes_answer(&control.session, &control.turn))
        {
            return Err(problem(ErrorKind::LimitExceeded, "host_ready_queue_limit"));
        }
        let receipt = self
            .store
            .control(ControlRequest {
                id: control.request,
                session: control.session.clone(),
                expected_revision: control.expected_session,
                action,
            })
            .await?;
        if can_wake {
            let position = receipt
                .turn
                .as_ref()
                .ok_or_else(|| problem(ErrorKind::Uncertain, "interaction_receipt_missing"))?
                .record()
                .position;
            if let Some(ReadyWork::Answered {
                position: queued, ..
            }) = work
                .ready
                .iter_mut()
                .find(|item| item.wakes_answer(&control.session, &control.turn))
            {
                *queued = (*queued).max(position);
            } else {
                work.defer(ReadyWork::Answered {
                    session: control.session,
                    turn: control.turn,
                    position,
                });
            }
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
                    && state.waits().values().all(|wait| !wait.is_pending())
                    && state.waits().values().any(|wait| {
                        (is_question(wait) || crate::permissions::is_approval(wait))
                            && wait.answer.is_some()
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
