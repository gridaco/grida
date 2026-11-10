//! GRIDA-SEC-004 — durable Library requests and chat-owned retained pixels.

use super::*;
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ResultContent, ToolArguments};
use agent_kit_core::tools::{
    Invocation, InvocationContext, InvocationRecovery, RecoveryKind, Tool, ToolDefinition,
    ToolOutcome,
};
use agent_kit_core::turn::{
    OperationInput, OperationState, ResponseContract, TurnState, WaitRecord,
};
use agent_kit_core::{ToolId, WaitId};
use agent_kit_runtime::{TurnOperations, TurnView as OperationView};
use serde_json::json;

pub(super) const TOOL: &str = "design_search";
const REQUEST: &str = "grida.agent.library-selection";
const ANSWER: &str = "grida.agent.library-selection.answer";
const QUERY_LIMIT: usize = 2048;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Query {
    initial_search_query: String,
}

impl Query {
    fn parse(arguments: &ToolArguments) -> Result<Self> {
        let ToolArguments::Json(value) = arguments else {
            return Err(invalid_query());
        };
        let query: Self = serde_json::from_value(value.clone()).map_err(|_| invalid_query())?;
        query.validate()?;
        Ok(query)
    }

    fn validate(&self) -> Result<()> {
        if self.initial_search_query.trim().is_empty()
            || self.initial_search_query.len() > QUERY_LIMIT
        {
            return Err(invalid_query());
        }
        Ok(())
    }
}

fn invalid_query() -> Error {
    problem(ErrorKind::InvalidInput, "library_selection_query_invalid")
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    operation: OperationId,
    query: Query,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum Answer {
    Selected {
        id: String,
        asset: crate::scratch::AssetRef,
    },
    Skipped,
}

pub(crate) enum Selection {
    Selected { id: String, upload: ImageUpload },
    Skipped,
}

fn wait_id(operation: &OperationId) -> Result<WaitId> {
    WaitId::new(format!("library-selection/{operation}"))
}

fn response_contract() -> Result<ResponseContract> {
    Ok(ResponseContract {
        schema: SchemaId::new(ANSWER)?,
        version: 1,
    })
}

pub(super) fn is_selection(wait: &WaitRecord) -> bool {
    wait.request.schema().as_str() == REQUEST
}

fn read_request(wait: &WaitRecord) -> Result<Request> {
    let request: Request = decode(REQUEST, &wait.request)?;
    if wait.id != wait_id(&request.operation)? || wait.response != response_contract()? {
        return Err(problem(
            ErrorKind::Conflict,
            "library_selection_identity_mismatch",
        ));
    }
    request.query.validate()?;
    Ok(request)
}

fn selection_wait(invocation: &Invocation) -> Result<WaitRecord> {
    let request = Request {
        operation: invocation.id().clone(),
        query: Query::parse(invocation.arguments())?,
    };
    Ok(WaitRecord {
        id: wait_id(invocation.id())?,
        request: encode(REQUEST, 1, &request)?,
        response: response_contract()?,
        answer: None,
        withdrawn: false,
    })
}

fn recorded_invocation<'a>(
    view: &'a OperationView,
    invocation: &Invocation,
) -> Option<&'a OperationState> {
    view.operation(invocation.id()).filter(|operation| {
        matches!(&operation.record.input, OperationInput::Tool(recorded) if recorded == invocation)
    })
}

pub(super) async fn defer_for_answer(
    admission: &ToolAdmission,
    operations: &TurnOperations,
) -> Result<ToolDecision> {
    if &admission.operation != admission.invocation.id()
        || !recorded_invocation(&operations.view(), &admission.invocation)
            .is_some_and(|operation| operation.record.grants == admission.grants)
    {
        return Err(problem(
            ErrorKind::Conflict,
            "library_selection_invocation_mismatch",
        ));
    }
    let wait = selection_wait(&admission.invocation)?;
    let id = wait.id.clone();
    operations.request_input(wait).await?;
    let view = operations.view();
    let wait = view.state.waits().get(&id).ok_or_else(unavailable)?;
    Ok(if wait.is_pending() {
        ToolDecision::Defer(id)
    } else {
        ToolDecision::Permit
    })
}

pub(super) struct LibraryTool {
    operations: TurnOperations,
    definition: ToolDefinition,
}

impl LibraryTool {
    pub(super) fn new(operations: TurnOperations) -> Result<Self> {
        Ok(Self {
            operations,
            definition: ToolDefinition {
                id: ToolId::new(TOOL)?,
                version: 1,
                description: "Ask the user to choose one visual reference from Grida Library. Provide an initial search query. The user may refine it or skip the selection.".into(),
                input: InputFormat::Json(json!({
                    "type": "object",
                    "properties": {
                        "initial_search_query": {"type": "string", "minLength": 1, "maxLength": QUERY_LIMIT}
                    },
                    "required": ["initial_search_query"],
                    "additionalProperties": false
                })),
                max_input_bytes: 16 * 1024,
                max_output_bytes: 4096,
                recovery: RecoveryKind::Reconcile,
            },
        })
    }

    fn result(&self, invocation: Invocation, context: InvocationContext) -> Result<ToolOutcome> {
        let view = self.operations.view();
        if invocation.definition() != &self.definition
            || !recorded_invocation(&view, &invocation)
                .and_then(|operation| operation.attempts.last())
                .is_some_and(|attempt| attempt.id == context.attempt)
        {
            return Err(problem(
                ErrorKind::Conflict,
                "library_selection_invocation_mismatch",
            ));
        }
        let expected = selection_wait(&invocation)?;
        let wait = view
            .state
            .waits()
            .get(&expected.id)
            .ok_or_else(unavailable)?;
        if wait.request != expected.request || wait.response != expected.response {
            return Err(problem(
                ErrorKind::Conflict,
                "library_selection_identity_mismatch",
            ));
        }
        if wait.withdrawn {
            let mut outcome = ToolOutcome::failed("library_selection_withdrawn");
            outcome.status = OutcomeStatus::Cancelled;
            return Ok(outcome);
        }
        let answer = wait.answer.as_ref().ok_or_else(unavailable)?;
        let (content, structured) = match decode(ANSWER, answer)? {
            Answer::Selected { id, asset } if asset.owner() == &view.state.binding().session => (
                vec![
                    ResultContent::Text(format!("The user selected Library reference {id}.")),
                    ResultContent::Media(images::media(&asset)?),
                ],
                json!({"status": "selected", "id": id}),
            ),
            Answer::Selected { .. } => {
                return Err(problem(
                    ErrorKind::Conflict,
                    "library_selection_scope_mismatch",
                ));
            }
            Answer::Skipped => (
                vec![ResultContent::Text(
                    "The user skipped the Library selection.".into(),
                )],
                json!({"status": "skipped"}),
            ),
        };
        Ok(ToolOutcome {
            status: OutcomeStatus::Succeeded,
            content,
            structured: Some(structured),
            receipt: Some(answer.clone()),
            truncated: false,
        })
    }
}

impl Tool for LibraryTool {
    fn definition(&self) -> &ToolDefinition {
        &self.definition
    }

    fn validate(&self, arguments: &ToolArguments) -> Result<()> {
        Query::parse(arguments).map(|_| ())
    }

    fn invoke(
        &self,
        invocation: Invocation,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            self.result(invocation, context)
                .unwrap_or_else(|error| ToolOutcome::failed(&error.code))
        })
    }

    fn recover(
        &self,
        recovery: InvocationRecovery,
        context: InvocationContext,
    ) -> BoxFuture<'_, ToolOutcome> {
        Box::pin(async move {
            self.result(recovery.invocation, context)
                .unwrap_or_else(|_| ToolOutcome::uncertain())
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PendingSelection {
    wait_id: WaitId,
    initial_search_query: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Selections {
    session_id: SessionId,
    turn_id: TurnId,
    control_revision: ControlRevision,
    pub(super) selections: Vec<PendingSelection>,
}

pub(super) fn pending(state: &TurnState) -> Result<Selections> {
    let selections = state
        .waits()
        .values()
        .filter(|wait| wait.is_pending() && is_selection(wait))
        .map(|wait| {
            let request = read_request(wait)?;
            Ok(PendingSelection {
                wait_id: wait.id.clone(),
                initial_search_query: request.query.initial_search_query,
            })
        })
        .collect::<Result<_>>()?;
    Ok(Selections {
        session_id: state.binding().session.clone(),
        turn_id: state.binding().turn.clone(),
        control_revision: state.controls().revision,
        selections,
    })
}

impl Host {
    pub(crate) fn accepts_library_selection(&self) -> bool {
        self.execution
            .as_ref()
            .is_some_and(|execution| execution.tool_result_images)
    }

    pub(crate) async fn library_selections(
        &self,
        session: SessionId,
        turn: TurnId,
    ) -> Result<Selections> {
        self.store.inspect_turn_with(session, turn, pending).await
    }

    pub(crate) async fn answer_library_selection(
        &self,
        control: TurnControl,
        wait_id: WaitId,
        selection: Selection,
    ) -> Result<ControlReceipt> {
        self.owned_control(move |host| async move {
            // Serialize selection intake with other answers and scheduler
            // ownership, so competing selections cannot both retain pixels.
            let work = host.work.lock().await;
            if work.closed {
                return Err(problem(ErrorKind::Unavailable, "host_shutting_down"));
            }
            let target = wait_id.clone();
            let expected = control.expected_control;
            let (existing, can_wake) = host
                .store
                .inspect_turn_with(
                    control.session.clone(),
                    control.turn.clone(),
                    move |state| {
                        let wait = state
                            .waits()
                            .get(&target)
                            .filter(|wait| is_selection(wait))
                            .ok_or_else(unavailable)?;
                        read_request(wait)?;
                        if wait.withdrawn
                            || (wait.answer.is_none()
                                && (state.outcome().is_some()
                                    || state.controls().revision != expected))
                        {
                            return Err(conflict());
                        }
                        Ok((
                            wait.answer.clone(),
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
            if can_wake {
                work.check_answer_capacity(&control.session, &control.turn)?;
            }
            let answer = if let Some(existing) = existing {
                match (&selection, decode(ANSWER, &existing)?) {
                    (Selection::Skipped, Answer::Skipped) => existing,
                    (
                        Selection::Selected { id, upload },
                        Answer::Selected {
                            id: recorded,
                            asset,
                        },
                    ) if *id == recorded
                        && asset.owner() == &control.session
                        && upload.matches(&asset) =>
                    {
                        existing
                    }
                    _ => return Err(conflict()),
                }
            } else {
                let session = host.store.inspect(control.session.clone()).await?;
                if session.revision != control.expected_session
                    || !session.current.as_ref().is_some_and(|turn| {
                        turn.binding.turn == control.turn && turn.controls.revision == expected
                    })
                {
                    return Err(conflict());
                }
                let answer = match selection {
                    Selection::Skipped => Answer::Skipped,
                    Selection::Selected { id, upload } => {
                        let storage = host
                            .execution()?
                            .retained_inputs
                            .clone()
                            .ok_or_else(unavailable)?;
                        let cwd = session_configuration(&session)?.cwd;
                        let owner = control.session.clone();
                        let target = wait_id.clone();
                        let asset = tokio::task::spawn_blocking(move || {
                            storage.retain_library_image(&owner, &cwd, &target, upload)
                        })
                        .await
                        .map_err(|_| unavailable())??;
                        Answer::Selected { id, asset }
                    }
                };
                encode(ANSWER, 1, &answer)?
            };
            let action = SessionControl::Resolve {
                turn: control.turn.clone(),
                expected,
                wait: wait_id,
                answer,
            };
            host.resolve_interaction_locked(work, control, action, can_wake, None)
                .await
        })
        .await
    }
}

fn unavailable() -> Error {
    problem(ErrorKind::Unavailable, "library_selection_unavailable")
}

fn conflict() -> Error {
    problem(
        ErrorKind::Conflict,
        "library_selection_no_longer_answerable",
    )
}

fn decode<T: serde::de::DeserializeOwned>(schema: &str, value: &Envelope) -> Result<T> {
    if value.schema().as_str() != schema || value.version() != 1 {
        return Err(problem(
            ErrorKind::InvalidState,
            "library_selection_contract_invalid",
        ));
    }
    serde_json::from_slice(value.bytes()).map_err(|_| {
        problem(
            ErrorKind::InvalidState,
            "library_selection_contract_invalid",
        )
    })
}
