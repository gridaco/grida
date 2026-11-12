use agent_kit_core::authority::{AuthorityBinding, GrantSelection};
use agent_kit_core::history::{HistoryRecord, validate_exchanges};
use agent_kit_core::inference::{
    InferenceOutcome, InferenceRequest, InferenceStatus, InputFormat, Modality, ModelCapabilities,
    PreparedRequest, ProviderBinding,
};
use agent_kit_core::messages::{
    Content, Message, OutcomeStatus, Provenance, ProvenanceKind, ResultContent, Role,
    ToolArguments, ToolCall, ToolResult,
};
use agent_kit_core::tools::{
    Inventory, Invocation, InvocationContext, RecoveryKind, Tool, ToolDefinition, ToolOutcome,
};
use agent_kit_core::turn::{
    JournalAction, JournalChange, OperationInput, OperationOutcome, OperationRecord, TurnBinding,
    TurnState,
};
use agent_kit_core::{
    AttemptId, BindingId, BoxFuture, ChangeId, MessageId, ModelId, OperationId, PrincipalId,
    ProviderId, Result, ScopeId, SessionId, ToolCallId, ToolId, TurnId,
};
use grida_agent_master::history::project;
use std::collections::BTreeSet;
use std::sync::Arc;

fn state() -> TurnState {
    TurnState::new(TurnBinding {
        session: SessionId::new("session").unwrap(),
        turn: TurnId::new("turn").unwrap(),
        epoch: 1,
    })
    .unwrap()
}

fn record(id: &str, role: Role, content: Vec<Content>) -> HistoryRecord {
    HistoryRecord::Message(Message {
        id: MessageId::new(id).unwrap(),
        role,
        phase: None,
        content,
        provenance: Provenance {
            source: "fixture".into(),
            kind: ProvenanceKind::Observed,
            fingerprint: None,
        },
    })
}

fn text(id: &str, role: Role, value: &str) -> HistoryRecord {
    record(id, role, vec![Content::Text(value.into())])
}

fn messages(records: &[HistoryRecord]) -> Vec<Message> {
    records
        .iter()
        .map(|record| {
            let HistoryRecord::Message(message) = record;
            message.clone()
        })
        .collect()
}

fn apply(state: &mut TurnState, actions: Vec<JournalAction>) {
    let change = JournalChange::new(
        ChangeId::new(format!("event-{}", state.position().0)).unwrap(),
        state.binding().clone(),
        state.position(),
        state.controls().revision,
        actions,
    )
    .unwrap();
    state.apply(change).unwrap();
}

fn append(state: &mut TurnState, records: &[HistoryRecord]) {
    apply(state, vec![JournalAction::AppendHistory(records.to_vec())]);
}

fn grants() -> GrantSelection {
    GrantSelection {
        authority: AuthorityBinding {
            principal: PrincipalId::new("fixture").unwrap(),
            binding: BindingId::new("provider").unwrap(),
            scope: ScopeId::new("turn").unwrap(),
        },
        grants: vec![],
    }
}

fn start_inference(state: &mut TurnState, id: &str, inputs: &[HistoryRecord]) -> OperationId {
    let operation = OperationId::new(id).unwrap();
    let request = PreparedRequest::from_validated(
        InferenceRequest {
            model: ModelId::new("fixture").unwrap(),
            messages: messages(inputs),
            tools: vec![],
            max_output_tokens: None,
            extension: None,
            reasoning: Default::default(),
        },
        ProviderBinding {
            provider: ProviderId::new("fixture").unwrap(),
            authority: grants().authority,
        },
        ModelCapabilities {
            revision: BindingId::new("fixture-v1").unwrap(),
            input_modalities: BTreeSet::from([Modality::Text]),
            json_tools: true,
            text_tools: false,
            max_output_tokens: None,
            reasoning: Default::default(),
        },
    )
    .unwrap();
    start(
        state,
        OperationRecord {
            id: operation.clone(),
            input: OperationInput::Inference(request),
            origin: None,
            source_call: None,
            grants: grants(),
        },
    );
    operation
}

fn start(state: &mut TurnState, record: OperationRecord) {
    let operation = record.id.clone();
    apply(
        state,
        vec![
            JournalAction::prepare(record),
            JournalAction::StartAttempt {
                attempt: attempt(&operation),
                operation,
            },
        ],
    );
}

fn attempt(operation: &OperationId) -> AttemptId {
    AttemptId::new(format!("attempt-{operation}")).unwrap()
}

fn finish(state: &mut TurnState, operation: OperationId, outcome: OperationOutcome) {
    apply(
        state,
        vec![JournalAction::CompleteAttempt {
            attempt: attempt(&operation),
            operation,
            outcome,
        }],
    );
}

fn inference(responses: &[HistoryRecord]) -> OperationOutcome {
    OperationOutcome::Inference(InferenceOutcome {
        status: InferenceStatus::Completed,
        messages: messages(responses),
        usage: vec![],
        failure: None,
        receipt: None,
        terminal_receipt: None,
    })
}

struct RecordedTool(ToolDefinition);
impl Tool for RecordedTool {
    fn definition(&self) -> &ToolDefinition {
        &self.0
    }

    fn validate(&self, _: &ToolArguments) -> Result<()> {
        Ok(())
    }

    fn invoke(&self, _: Invocation, _: InvocationContext) -> BoxFuture<'_, ToolOutcome> {
        panic!("this fixture projects a recorded outcome")
    }
}

fn tool_call() -> ToolCall {
    ToolCall {
        id: ToolCallId::new("inspect-call").unwrap(),
        tool: ToolId::new("inspect").unwrap(),
        arguments: ToolArguments::Json(serde_json::json!({})),
    }
}

fn record_tool_result(
    state: &mut TurnState,
    origin: OperationId,
    call: &ToolCall,
) -> HistoryRecord {
    let tool = RecordedTool(ToolDefinition {
        id: call.tool.clone(),
        version: 1,
        description: "Inspect the document".into(),
        input: InputFormat::Json(serde_json::json!({"type":"object"})),
        max_input_bytes: 1024,
        max_output_bytes: 1024,
        recovery: RecoveryKind::Unavailable,
    });
    let mut inventory = Inventory::new();
    inventory.insert(Arc::new(tool)).unwrap();
    let operation = OperationId::new("inspect-operation").unwrap();
    let invocation = inventory
        .snapshot(std::slice::from_ref(&call.tool))
        .unwrap()
        .prepare(operation.clone(), &call.tool, call.arguments.clone())
        .unwrap()
        .invocation()
        .clone();
    start(
        state,
        OperationRecord {
            id: operation.clone(),
            input: OperationInput::Tool(invocation),
            origin: Some(origin),
            source_call: Some(call.id.clone()),
            grants: grants(),
        },
    );
    let result = ToolResult {
        call: call.id.clone(),
        status: OutcomeStatus::Succeeded,
        content: vec![ResultContent::Text("Document inspected".into())],
        structured: None,
        truncated: false,
    };
    finish(
        state,
        operation,
        OperationOutcome::Tool(ToolOutcome {
            status: result.status,
            content: result.content.clone(),
            structured: None,
            receipt: None,
            truncated: false,
        }),
    );
    record(
        "inspection-result",
        Role::Tool,
        vec![Content::ToolResult(result)],
    )
}

#[test]
fn corrections_follow_the_responses_that_did_not_see_them() {
    let mut state = state();
    let initial = text("initial", Role::User, "Prepare the document.");
    let first = text("first-correction", Role::User, "Use A4.");
    let second = text("second-correction", Role::User, "Use landscape.");
    let third = text("third-correction", Role::User, "Keep the margins wide.");
    append(&mut state, std::slice::from_ref(&initial));
    let original = start_inference(&mut state, "original", std::slice::from_ref(&initial));
    append(&mut state, std::slice::from_ref(&first));

    let call = tool_call();
    let assistant = record(
        "partial",
        Role::Assistant,
        vec![
            Content::Text("I’ll inspect the document.".into()),
            Content::ToolCall(call.clone()),
        ],
    );
    finish(
        &mut state,
        original.clone(),
        inference(std::slice::from_ref(&assistant)),
    );
    let result = record_tool_result(&mut state, original, &call);
    append(&mut state, &[assistant.clone(), result.clone()]);

    let next_input = vec![
        initial.clone(),
        assistant.clone(),
        result.clone(),
        first.clone(),
    ];
    assert_eq!(project(&state), next_input);
    let corrected = start_inference(&mut state, "corrected", &next_input);
    append(&mut state, &[second.clone(), third.clone()]);
    let next_response = text("response", Role::Assistant, "I used A4.");
    finish(
        &mut state,
        corrected,
        inference(std::slice::from_ref(&next_response)),
    );
    append(&mut state, std::slice::from_ref(&next_response));

    let projected = project(&state);
    assert_eq!(
        projected,
        [
            initial.clone(),
            assistant.clone(),
            result.clone(),
            first.clone(),
            next_response.clone(),
            second.clone(),
            third.clone()
        ]
    );
    validate_exchanges(&messages(&projected), false).unwrap();
    assert_eq!(
        state.history().records(),
        &[
            initial,
            first,
            assistant,
            result,
            second,
            third,
            next_response
        ]
    );
}

#[test]
fn partial_publication_retains_causal_order_after_omitting_an_unfinished_call() {
    let mut state = state();
    let initial = text("initial", Role::User, "Prepare the document.");
    let correction = text("correction", Role::User, "Use A4.");
    append(&mut state, std::slice::from_ref(&initial));
    let operation = start_inference(&mut state, "original", std::slice::from_ref(&initial));
    append(&mut state, std::slice::from_ref(&correction));
    let response = text("partial", Role::Assistant, "I’ll inspect the document.");
    let recorded = record(
        "partial",
        Role::Assistant,
        vec![
            Content::Text("I’ll inspect the document.".into()),
            Content::ToolCall(tool_call()),
        ],
    );
    finish(&mut state, operation, inference(&[recorded]));
    append(&mut state, std::slice::from_ref(&response));
    assert_eq!(project(&state), [initial, response, correction]);
}

#[test]
fn an_assistant_message_with_unverified_origin_keeps_its_durable_position() {
    let mut state = state();
    let initial = text("initial", Role::User, "Prepare the document.");
    let correction = text("correction", Role::User, "Use A4.");
    append(&mut state, std::slice::from_ref(&initial));
    let operation = start_inference(&mut state, "original", &[initial]);
    append(&mut state, &[correction]);
    finish(
        &mut state,
        operation,
        inference(&[text("response", Role::Assistant, "Recorded response.")]),
    );
    append(
        &mut state,
        &[text("response", Role::Assistant, "Imported response.")],
    );
    assert_eq!(project(&state), state.history().records());
}
