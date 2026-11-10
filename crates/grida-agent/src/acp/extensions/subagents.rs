//! GRIDA-SEC-004 — delegated child operations require a private parent attachment.

use super::*;
use crate::host::{SubagentAssignment, SubagentInspection, SubagentWork, TurnControl};
use grida_agent_master::subagents::Allocation;

const CREATE: &str = "co.grida/subagent/create";
const ASSIGN: &str = "co.grida/subagent/assign";
const INSPECT: &str = "co.grida/subagent/inspect";
const STOP: &str = "co.grida/subagent/stop";
const PAUSE: &str = "co.grida/subagent/pause";
const RESUME: &str = "co.grida/subagent/resume";
const STEER: &str = "co.grida/subagent/steer";
const RESUME_QUEUE: &str = "co.grida/subagent/resume-queue";
const WITHDRAW: &str = "co.grida/subagent/withdraw";

pub(super) fn capabilities(available: bool) -> impl Iterator<Item = &'static str> {
    [
        CREATE,
        ASSIGN,
        INSPECT,
        STOP,
        PAUSE,
        RESUME,
        STEER,
        RESUME_QUEUE,
        WITHDRAW,
    ]
    .into_iter()
    .filter(move |_| available)
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/subagent/create", response = Created)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Create {
    parent_session_id: SessionId,
    request_id: ChangeId,
    name: String,
    work_turns: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct Created {
    child_id: SessionId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/subagent/assign", response = Assignment)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Assign {
    parent_session_id: SessionId,
    child_id: SessionId,
    parent_turn_id: TurnId,
    input_id: ChangeId,
    instructions: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/subagent/inspect", response = Inspection)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Inspect {
    parent_session_id: SessionId,
    child_id: SessionId,
    input_id: Option<ChangeId>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ChildTask {
    parent_session_id: SessionId,
    child_id: SessionId,
    turn_id: TurnId,
    request_id: ChangeId,
    expected_session_revision: SessionRevision,
    expected_control_revision: ControlRevision,
}

impl ChildTask {
    fn into_control(self) -> (SessionId, TurnControl) {
        (
            self.parent_session_id,
            TurnControl {
                session: self.child_id,
                turn: self.turn_id,
                request: self.request_id,
                expected_session: self.expected_session_revision,
                expected_control: self.expected_control_revision,
            },
        )
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/subagent/stop", response = TurnControlResponse)]
#[serde(transparent)]
struct StopChild(ChildTask);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/subagent/pause", response = TurnControlResponse)]
#[serde(transparent)]
struct PauseChild(ChildTask);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/subagent/resume", response = lifecycle::ResumeResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ResumeChild {
    task: ChildTask,
    expected_epoch: u64,
    expected_journal_position: JournalPosition,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/subagent/steer", response = TurnControlResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SteerChild {
    task: ChildTask,
    expected_history_position: HistoryPosition,
    instructions: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ChildQueue {
    parent_session_id: SessionId,
    child_id: SessionId,
    request_id: ChangeId,
    expected_session_revision: SessionRevision,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/subagent/resume-queue", response = lifecycle::QueueResponse)]
#[serde(transparent)]
struct ResumeQueue(ChildQueue);

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_co.grida/subagent/withdraw", response = lifecycle::QueueResponse)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Withdraw {
    queue: ChildQueue,
    input_id: ChangeId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct Inspection {
    parent_session_id: SessionId,
    child_id: SessionId,
    name: String,
    allocation: Allocation,
    session_revision: SessionRevision,
    admission_paused: bool,
    queued_input_ids: Vec<ChangeId>,
    current: Option<TurnSummary>,
    latest: Option<TurnSummary>,
    assignment: Option<Assignment>,
}

impl From<SubagentInspection> for Inspection {
    fn from(view: SubagentInspection) -> Self {
        let child_id = view.child;
        Self {
            parent_session_id: view.parent,
            child_id: child_id.clone(),
            name: view.name,
            allocation: view.allocation,
            session_revision: view.revision,
            admission_paused: view.admission_paused,
            queued_input_ids: view.queued,
            current: view.current.map(TurnSummary::from),
            latest: view.latest.map(TurnSummary::from),
            assignment: view
                .assignment
                .map(|work| Assignment::from_work(child_id, work)),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
struct Assignment {
    child_id: SessionId,
    parent_turn_id: TurnId,
    input_id: ChangeId,
    max_generation_steps: u32,
    disposition: InputDisposition,
    turn: Option<TurnSummary>,
    result: Option<summaries::SummaryResponse>,
}

impl Assignment {
    fn from_work(child_id: SessionId, work: SubagentWork) -> Self {
        let result = work.turn.as_ref().and_then(|turn| {
            turn.outcome.as_ref().map(|outcome| {
                summaries::SummaryResponse::from_outcome(turn.binding.turn.clone(), outcome)
            })
        });
        Self {
            child_id,
            parent_turn_id: work.parent_turn,
            input_id: work.input,
            max_generation_steps: work.max_generation_steps,
            disposition: work.disposition,
            turn: work.turn.map(TurnSummary::from),
            result,
        }
    }
}

pub(super) fn handlers(host: Arc<Host>, sessions: Arc<Mutex<ConnectionSessions>>) -> RequestRoutes {
    let create = (host.clone(), sessions.clone());
    let assign = (host.clone(), sessions.clone());
    let inspect = (host.clone(), sessions.clone());
    let stop = (host.clone(), sessions.clone());
    let pause = (host.clone(), sessions.clone());
    let resume = (host.clone(), sessions.clone());
    let steer = (host.clone(), sessions.clone());
    let resume_queue = (host.clone(), sessions.clone());
    RequestRoutes::default()
        .on_receive_request(
            async move |request: Create, responder, _| {
                let result = async {
                    require(&create.1, CREATE, Some(&request.parent_session_id))?;
                    let child_id = create
                        .0
                        .create_subagent(
                            request.parent_session_id,
                            request.request_id,
                            request.name,
                            request.work_turns,
                        )
                        .await
                        .map_err(host_error)?;
                    Ok(Created { child_id })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Assign, responder, _| {
                let result = async {
                    require(&assign.1, ASSIGN, Some(&request.parent_session_id))?;
                    let child = request.child_id;
                    let work = assign
                        .0
                        .assign_subagent(SubagentAssignment {
                            parent: request.parent_session_id,
                            child: child.clone(),
                            parent_turn: request.parent_turn_id,
                            input: request.input_id,
                            instructions: request.instructions,
                        })
                        .await
                        .map_err(host_error)?;
                    Ok(Assignment::from_work(child, work))
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Inspect, responder, _| {
                let result = async {
                    require(&inspect.1, INSPECT, Some(&request.parent_session_id))?;
                    inspect
                        .0
                        .inspect_subagent(
                            request.parent_session_id,
                            request.child_id,
                            request.input_id,
                        )
                        .await
                        .map(Inspection::from)
                        .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |StopChild(task): StopChild, responder, _| {
                let result = async {
                    require(&stop.1, STOP, Some(&task.parent_session_id))?;
                    let turn = task.turn_id.clone();
                    let (parent, control) = task.into_control();
                    let receipt = stop
                        .0
                        .stop_subagent(parent, control)
                        .await
                        .map_err(host_error)?;
                    turn_receipt(receipt, turn)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |PauseChild(task): PauseChild, responder, _| {
                let result = async {
                    require(&pause.1, PAUSE, Some(&task.parent_session_id))?;
                    let turn = task.turn_id.clone();
                    let (parent, control) = task.into_control();
                    let receipt = pause
                        .0
                        .pause_subagent(parent, control)
                        .await
                        .map_err(host_error)?;
                    turn_receipt(receipt, turn)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: ResumeChild, responder, _| {
                let result = async {
                    require(&resume.1, RESUME, Some(&request.task.parent_session_id))?;
                    let request_id = request.task.request_id.clone();
                    let (parent, control) = request.task.into_control();
                    let turn = resume
                        .0
                        .resume_subagent(
                            parent,
                            control,
                            request.expected_epoch,
                            request.expected_journal_position,
                        )
                        .await
                        .map_err(host_error)?;
                    Ok(lifecycle::ResumeResponse {
                        request_id,
                        turn: turn.into(),
                    })
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: SteerChild, responder, _| {
                let result = async {
                    require(&steer.1, STEER, Some(&request.task.parent_session_id))?;
                    let turn = request.task.turn_id.clone();
                    let (parent, control) = request.task.into_control();
                    let receipt = steer
                        .0
                        .steer_subagent(
                            parent,
                            control,
                            request.expected_history_position,
                            request.instructions,
                        )
                        .await
                        .map_err(host_error)?;
                    turn_receipt(receipt, turn)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |ResumeQueue(queue): ResumeQueue, responder, _| {
                let result = async {
                    require(
                        &resume_queue.1,
                        RESUME_QUEUE,
                        Some(&queue.parent_session_id),
                    )?;
                    resume_queue
                        .0
                        .resume_subagent_queue(
                            queue.parent_session_id,
                            queue.child_id,
                            queue.request_id,
                            queue.expected_session_revision,
                        )
                        .await
                        .map(lifecycle::QueueResponse::from)
                        .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
        .on_receive_request(
            async move |request: Withdraw, responder, _| {
                let result = async {
                    let queue = request.queue;
                    require(&sessions, WITHDRAW, Some(&queue.parent_session_id))?;
                    host.withdraw_subagent_input(
                        queue.parent_session_id,
                        queue.child_id,
                        queue.request_id,
                        queue.expected_session_revision,
                        request.input_id,
                    )
                    .await
                    .map(lifecycle::QueueResponse::from)
                    .map_err(host_error)
                }
                .await;
                responder.respond_with_result(result)
            },
            on_receive_request!(),
        )
}
