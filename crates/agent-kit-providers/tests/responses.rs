mod support;

use agent_kit_core::authority::AuthorityBinding;
use agent_kit_core::inference::{
    FailureKind, InferenceOutcome, InferenceRequest, InferenceStatus, InferenceUpdate,
    InputMeasurement, MeasurementKind, Modality, ModelCapabilities, Provider, ProviderBinding,
};
use agent_kit_core::messages::{
    Content, Message, MessagePhase, OutcomeStatus, ResultContent, Role, ToolCall, ToolResult,
};
use agent_kit_core::{BindingId, ModelId, PrincipalId, ProviderId, ScopeId};
use agent_kit_providers::{
    ReasoningEffort, Responses, ResponsesEndpoint, ResponsesProfile, StreamLimits,
    TransportOperation,
};
use serde_json::{Value, json};
use std::sync::Arc;
use std::time::Duration;
use support::{FixtureTransport, control, frame, limits, message, request, response, tool_request};

fn adapter(
    transport: Arc<FixtureTransport>,
    endpoint: ResponsesEndpoint,
    replay: &str,
    live: &str,
) -> Responses {
    make_adapter(transport, endpoint, replay, live, "wire-model", limits())
}

fn make_adapter(
    transport: Arc<FixtureTransport>,
    endpoint: ResponsesEndpoint,
    replay: &str,
    live: &str,
    wire_model: &str,
    limits: StreamLimits,
) -> Responses {
    let binding = ProviderBinding {
        provider: ProviderId::new("responses").unwrap(),
        authority: AuthorityBinding {
            principal: PrincipalId::new("principal").unwrap(),
            binding: BindingId::new(live).unwrap(),
            scope: ScopeId::new("chat").unwrap(),
        },
    };
    let models = [(
        ModelId::new("model").unwrap(),
        ResponsesProfile {
            wire_model: ModelId::new(wire_model).unwrap(),
            reasoning_effort: Some(ReasoningEffort::XHigh),
            capabilities: ModelCapabilities {
                revision: BindingId::new("profile").unwrap(),
                input_modalities: [Modality::Text].into(),
                json_tools: true,
                text_tools: false,
                max_output_tokens: None,
            },
        },
    )]
    .into();
    Responses::new(
        binding,
        BindingId::new(replay).unwrap(),
        endpoint,
        models,
        transport,
        limits,
    )
    .unwrap()
}

fn completed(output: Option<Value>) -> Value {
    let mut value = json!({
        "type": "response.completed",
        "response": {
            "status": "completed",
            "usage": {
                "input_tokens": 20,
                "input_tokens_details": {"cached_tokens": 8},
                "output_tokens": 12,
                "output_tokens_details": {"reasoning_tokens": 10}
            }
        }
    });
    if let Some(output) = output {
        value["response"]["output"] = output;
    }
    value
}

fn item(index: usize, item: Value) -> Value {
    json!({"type": "response.output_item.done", "output_index": index, "item": item})
}

fn answer(id: &str, text: &str) -> Value {
    item(
        0,
        json!({
            "type": "message", "id": id, "role": "assistant", "status": "completed",
            "phase": "final_answer", "content": [{"type": "output_text", "text": text, "annotations": []}]
        }),
    )
}

fn call(index: usize, id: &str, arguments: &str) -> Value {
    item(
        index,
        json!({
            "type": "function_call", "id": id, "call_id": "call_remote",
            "name": "echo", "arguments": arguments, "status": "completed"
        }),
    )
}

fn text_delta(value: &str) -> Value {
    json!({"type": "response.output_text.delta", "item_id": "msg_1", "delta": value})
}

fn first_call(outcome: &InferenceOutcome) -> &ToolCall {
    outcome
        .messages
        .iter()
        .flat_map(|message| &message.content)
        .find_map(|content| match content {
            Content::ToolCall(call) => Some(call),
            _ => None,
        })
        .expect("finalized function call")
}

fn body(transport: &FixtureTransport, request: usize) -> Value {
    let requests = transport.requests.lock().unwrap();
    assert_eq!(
        requests[request].0.operation,
        TransportOperation::OpenAiResponses
    );
    serde_json::from_slice(&requests[request].0.body).unwrap()
}

async fn run(provider: &Responses, request: InferenceRequest, attempt: &str) -> InferenceOutcome {
    let run = provider
        .start(provider.prepare(request).unwrap(), control(attempt))
        .unwrap();
    tokio::time::timeout(Duration::from_secs(2), run.finish())
        .await
        .expect("fixture reached terminal outcome")
}

#[tokio::test]
async fn subscription_replays_completed_encrypted_items_and_remote_call_identity() {
    let events = [
        json!({"type": "response.created", "response": {"id": "resp_first"}}),
        json!({
            "type": "response.output_item.added", "output_index": 0,
            "item": {"type": "reasoning", "id": "rs_1", "encrypted_content": "incomplete-ciphertext"}
        }),
        json!({
            "type": "response.reasoning_summary_text.delta", "item_id": "rs_1", "delta": "Résumé"
        }),
        json!({"type":"response.reasoning_text.delta","item_id":"rs_1","delta":"private-raw-reasoning"}),
        item(
            0,
            json!({
                "type": "reasoning", "id": "rs_1", "encrypted_content": "finished-ciphertext",
                "summary": [{"type": "summary_text", "text": "Résumé"}],
                "content": [{"type": "reasoning_text", "text": "private-raw-reasoning"}]
            }),
        ),
        json!({
            "type": "response.function_call_arguments.delta", "item_id": "fc_1",
            "output_index": 1, "delta": "{"
        }),
        call(1, "fc_1", r#"{"value":"echo"}"#),
        completed(Some(json!([
            {"type": "reasoning", "id": "rs_1"}, {"type": "function_call", "id": "fc_1"}
        ]))),
    ];
    let first_wire: Vec<_> = events.into_iter().flat_map(frame).collect();
    let second_wire = [
        text_delta("Echo"),
        answer("msg_1", "Echo."),
        completed(None),
    ];
    let transport = FixtureTransport::new([
        Ok(response(first_wire.chunks(3).map(<[u8]>::to_vec), true)),
        Ok(response(second_wire.into_iter().map(frame), true)),
    ]);
    let first = adapter(
        transport.clone(),
        ResponsesEndpoint::Subscription,
        "lineage",
        "first",
    );
    let mut request = tool_request();
    request.max_output_tokens = None;
    request.messages.insert(
        0,
        message(
            "instruction",
            Role::System,
            vec![Content::Text("Rules.".into())],
        ),
    );
    let prepared = first.prepare(request.clone()).unwrap();
    let changed_wire = make_adapter(
        transport.clone(),
        ResponsesEndpoint::Subscription,
        "lineage",
        "first",
        "other-model",
        limits(),
    );
    assert!(
        changed_wire
            .start(prepared.clone(), control("changed-wire"))
            .is_err()
    );
    let mut stream = first
        .start(prepared.clone(), control("sample-first"))
        .unwrap();
    let mut summaries = Vec::new();
    tokio::time::timeout(Duration::from_secs(2), async {
        while let Some(update) = stream.next().await {
            match update {
                InferenceUpdate::ReasoningDelta { text, .. } => summaries.push(text),
                InferenceUpdate::Usage(_) => {}
                unexpected => panic!("unexpected visible update: {unexpected:?}"),
            }
        }
    })
    .await
    .expect("fixture reached terminal outcome");
    let outcome = stream.finish().await;
    assert_eq!(outcome.status, InferenceStatus::Completed);
    assert_eq!(summaries, ["Résumé"]);
    assert_eq!(outcome.usage.len(), 4);
    assert!(
        outcome
            .usage
            .iter()
            .all(|usage| usage.attempt.as_str() == "sample-first" && usage.final_value)
    );
    assert_eq!(outcome.receipt.unwrap().bytes(), b"request_123");
    let first_body = body(&transport, 0);
    assert_eq!(first_body["model"], "wire-model");
    assert_eq!(first_body["instructions"], "Rules.");
    assert_eq!(first_body["store"], false);
    assert_eq!(first_body["stream"], true);
    assert_eq!(first_body["reasoning"]["effort"], "xhigh");
    assert_eq!(
        first_body["include"],
        json!(["reasoning.encrypted_content"])
    );
    assert!(first_body.get("max_output_tokens").is_none());
    assert!(first_body.get("previous_response_id").is_none());
    assert_eq!(first_body["input"].as_array().unwrap().len(), 1);
    assert_eq!(first_body["tools"][0]["strict"], false);

    let local_call = outcome.messages[1]
        .content
        .iter()
        .find_map(|content| {
            if let Content::ToolCall(call) = content {
                Some(call)
            } else {
                None
            }
        })
        .unwrap();
    assert_ne!(local_call.id.as_str(), "call_remote");
    let call_id = local_call.id.clone();
    let retained = serde_json::to_vec(&outcome.messages).unwrap();
    let restored: Vec<Message> = serde_json::from_slice(&retained).unwrap();
    request.messages.extend(restored);
    request.messages.push(message(
        "result",
        Role::Tool,
        vec![Content::ToolResult(ToolResult {
            call: call_id,
            status: OutcomeStatus::Succeeded,
            content: vec![ResultContent::Text("echo".into())],
            structured: None,
            truncated: false,
        })],
    ));

    let fresh = adapter(
        transport.clone(),
        ResponsesEndpoint::Subscription,
        "lineage",
        "second",
    );
    assert!(fresh.start(prepared, control("stale")).is_err());
    for rejected in [
        adapter(
            transport.clone(),
            ResponsesEndpoint::Subscription,
            "changed",
            "third",
        ),
        adapter(
            transport.clone(),
            ResponsesEndpoint::Api,
            "lineage",
            "third",
        ),
        make_adapter(
            transport.clone(),
            ResponsesEndpoint::Subscription,
            "lineage",
            "third",
            "other-model",
            limits(),
        ),
    ] {
        assert_eq!(
            rejected.prepare(request.clone()).unwrap_err().code,
            "provider_state_binding_changed"
        );
    }
    let mut edited = request.clone();
    edited.messages[2]
        .content
        .insert(0, Content::Text("edited".into()));
    assert_eq!(
        fresh.prepare(edited).unwrap_err().code,
        "provider_state_binding_changed"
    );
    assert_eq!(transport.requests.lock().unwrap().len(), 1);

    let outcome = run(&fresh, request, "sample-second").await;
    assert_eq!(outcome.status, InferenceStatus::Completed);
    assert_eq!(outcome.messages[0].phase, Some(MessagePhase::Answer));
    assert_eq!(
        outcome.messages[0].content[0],
        Content::Text("Echo.".into())
    );
    let continued = body(&transport, 1);
    assert_eq!(
        continued["input"][1]["encrypted_content"],
        "finished-ciphertext"
    );
    assert_eq!(continued["input"][2]["id"], "fc_1");
    assert_eq!(continued["input"][2]["call_id"], "call_remote");
    assert_eq!(continued["input"][3]["type"], "function_call_output");
    assert_eq!(continued["input"][3]["call_id"], "call_remote");
    assert!(
        continued["input"][3]["output"]
            .as_str()
            .unwrap()
            .contains("echo")
    );
    assert!(!continued.to_string().contains("private-raw-reasoning"));
    assert!(!continued.to_string().contains("incomplete-ciphertext"));
}

#[tokio::test]
async fn only_api_profile_accepts_explicit_output_bound() {
    let transport = FixtureTransport::new([Ok(response(
        [answer("msg_1", "Hello"), completed(None)]
            .into_iter()
            .map(frame),
        true,
    ))]);
    let subscription = adapter(
        transport.clone(),
        ResponsesEndpoint::Subscription,
        "lineage",
        "live",
    );
    assert_eq!(
        subscription.prepare(request()).unwrap_err().code,
        "responses_output_limit_unsupported"
    );
    assert!(transport.requests.lock().unwrap().is_empty());
    let api = adapter(transport.clone(), ResponsesEndpoint::Api, "lineage", "live");
    assert_eq!(
        run(&api, request(), "attempt").await.status,
        InferenceStatus::Completed
    );
    assert_eq!(body(&transport, 0)["max_output_tokens"], 32);
    assert_eq!(body(&transport, 0)["instructions"], "");
}

#[tokio::test]
async fn incomplete_and_failed_streams_preserve_prefix_usage_and_classify_safe_codes() {
    let secret = "provider-details-to-redact";
    let cases = [
        (
            json!({"type": "response.incomplete", "response": {
                "incomplete_details": {"reason": "max_output_tokens"},
                "usage": {"input_tokens": 7}
            }}),
            InferenceStatus::Limited,
            Some(FailureKind::OutputLimit),
        ),
        (
            json!({"type": "response.incomplete", "response": {
                "incomplete_details": {"reason": "content_filter"},
                "usage": {"input_tokens": 7}
            }}),
            InferenceStatus::Refused,
            None,
        ),
        (
            json!({"type": "response.failed", "response": {
                "error": {"code": "context_length_exceeded", "message": secret},
                "usage": {"input_tokens": 7}
            }}),
            InferenceStatus::Limited,
            Some(FailureKind::ContextLimit),
        ),
        (
            json!({"type": "response.failed", "response": {
                "error": {"type": "usage_limit_reached", "message": secret},
                "usage": {"input_tokens": 7}
            }}),
            InferenceStatus::Failed,
            Some(FailureKind::Quota),
        ),
        (
            json!({"type": "response.failed", "response": {
                "error": {"code": "rate_limit_exceeded", "message": secret},
                "usage": {"input_tokens": 7}
            }}),
            InferenceStatus::Failed,
            Some(FailureKind::RateLimit),
        ),
    ];
    for (terminal, status, failure_kind) in cases {
        let transport = FixtureTransport::new([Ok(response(
            [text_delta("A prefix"), call(1, "fc_1", "{}"), terminal]
                .into_iter()
                .map(frame),
            true,
        ))]);
        let provider = adapter(transport, ResponsesEndpoint::Api, "lineage", "live");
        let outcome = run(&provider, tool_request(), "attempt").await;
        assert_eq!(outcome.status, status);
        assert_eq!(outcome.messages.len(), 1);
        assert_eq!(
            outcome.messages[0].content,
            [Content::Text("A prefix".into())]
        );
        assert_eq!(
            outcome.failure.as_ref().map(|failure| failure.kind),
            failure_kind
        );
        assert_eq!(outcome.usage.len(), 1);
        assert_eq!(outcome.usage[0].quantity, 7);
        assert!(outcome.usage[0].final_value);
        assert!(!serde_json::to_string(&outcome).unwrap().contains(secret));
    }
}

#[tokio::test]
async fn tool_calls_require_verified_terminal_and_use_attempt_scoped_identity() {
    let one_call = call(0, "fc_1", "{}");
    let valid = [one_call.clone(), completed(None)];
    let transport = FixtureTransport::new([
        Ok(response(valid.clone().into_iter().map(frame), true)),
        Ok(response(valid.into_iter().map(frame), true)),
        Ok(response([frame(one_call.clone())], false)),
        Ok(response(
            [
                one_call.clone(),
                completed(Some(json!([
                    {"type": "function_call", "id": "fc_mismatched"}
                ]))),
            ]
            .into_iter()
            .map(frame),
            true,
        )),
        Ok(response(
            [one_call, call(1, "fc_2", "{}"), completed(None)]
                .into_iter()
                .map(frame),
            true,
        )),
    ]);
    let provider = adapter(transport, ResponsesEndpoint::Api, "lineage", "live");
    let a = run(&provider, tool_request(), "attempt-a").await;
    let b = run(&provider, tool_request(), "attempt-b").await;
    assert_ne!(first_call(&a).id, first_call(&b).id);
    for (attempt, code) in [
        ("no-terminal", "missing_terminal_event"),
        ("wrong-terminal", "terminal_output_changed"),
        ("duplicate", "invalid_tool_call_identity"),
    ] {
        let outcome = run(&provider, tool_request(), attempt).await;
        assert_eq!(outcome.status, InferenceStatus::Interrupted);
        assert!(outcome.messages.is_empty());
        assert_eq!(outcome.failure.unwrap().code, code);
    }
}

#[tokio::test]
async fn cancelled_stream_releases_partial_text_without_exposing_completed_tool_or_state() {
    let transport = FixtureTransport::new([Ok(response(
        [call(0, "fc_1", "{}"), text_delta("Visible prefix")]
            .into_iter()
            .map(frame),
        true,
    ))]);
    let provider = adapter(transport, ResponsesEndpoint::Api, "lineage", "live");
    let control = control("cancelled");
    let cancel = control.cancellation.clone();
    let mut stream = provider
        .start(provider.prepare(tool_request()).unwrap(), control)
        .unwrap();
    assert!(matches!(
        stream.next().await,
        Some(InferenceUpdate::TextDelta { text, .. }) if text == "Visible prefix"
    ));
    cancel.cancel();
    let outcome = stream.finish().await;
    assert_eq!(outcome.status, InferenceStatus::Interrupted);
    assert_eq!(
        outcome.messages[0].content,
        [Content::Text("Visible prefix".into())]
    );
    assert_eq!(outcome.messages.len(), 1);
    assert_eq!(outcome.receipt.unwrap().bytes(), b"request_123");
}

#[tokio::test]
async fn bounded_arguments_and_unoffered_tools_never_enter_the_outcome() {
    let transport = FixtureTransport::new([
        Ok(response(
            [
                call(0, "fc_1", r#"{"value":"over-limit"}"#),
                completed(None),
            ]
            .into_iter()
            .map(frame),
            true,
        )),
        Ok(response(
            [call(0, "fc_1", "{}"), completed(None)]
                .into_iter()
                .map(frame),
            true,
        )),
    ]);
    let provider = make_adapter(
        transport,
        ResponsesEndpoint::Api,
        "lineage",
        "live",
        "wire-model",
        StreamLimits {
            max_tool_argument_bytes: 8,
            ..limits()
        },
    );
    let limited = run(&provider, tool_request(), "oversized").await;
    assert_eq!(limited.status, InferenceStatus::Limited);
    assert_eq!(limited.failure.unwrap().code, "tool_argument_limit");
    assert!(limited.messages.is_empty());
    let unoffered = run(&provider, request(), "unoffered").await;
    assert_eq!(unoffered.status, InferenceStatus::Interrupted);
    assert_eq!(unoffered.failure.unwrap().code, "unoffered_tool_call");
    assert!(unoffered.messages.is_empty());
}

#[tokio::test]
async fn api_counts_the_same_prepared_input_used_for_generation() {
    let prior = [
        item(
            0,
            json!({
                "type": "reasoning",
                "id": "rs_seed",
                "encrypted_content": "retained-ciphertext",
                "summary": []
            }),
        ),
        call(1, "fc_seed", r#"{"value":"echo"}"#),
        completed(None),
    ];
    let measured = br#"{"object":"response.input_tokens","input_tokens":143}"#;
    let transport = FixtureTransport::new([
        Ok(response(prior.into_iter().map(frame), false)),
        Ok(response(measured.chunks(3).map(<[u8]>::to_vec), false)),
        Ok(response(
            [answer("msg_2", "Echo."), completed(None)]
                .into_iter()
                .map(frame),
            false,
        )),
    ]);
    let provider = adapter(transport.clone(), ResponsesEndpoint::Api, "replay", "live");
    let mut input = tool_request();
    input.messages.insert(
        0,
        message(
            "rules",
            Role::System,
            vec![Content::Text("Preserve the tool exchange.".into())],
        ),
    );
    let earlier = run(&provider, input.clone(), "earlier").await;
    assert_eq!(earlier.status, InferenceStatus::Completed);
    let call_id = first_call(&earlier).id.clone();
    input.messages.extend(earlier.messages);
    input.messages.push(message(
        "result",
        Role::Tool,
        vec![Content::ToolResult(ToolResult {
            call: call_id,
            status: OutcomeStatus::Succeeded,
            content: vec![ResultContent::Text("echo".into())],
            structured: None,
            truncated: false,
        })],
    ));

    let prepared = provider.prepare(input).unwrap();
    let mut lifetime = control("next");
    lifetime.deadline = Some(std::time::Instant::now() + Duration::from_secs(10));
    assert_eq!(
        provider
            .measure_input_async(&prepared, lifetime.request_control())
            .await
            .unwrap(),
        InputMeasurement {
            tokens: 143,
            kind: MeasurementKind::Exact
        },
    );
    let deadline = lifetime.deadline;
    assert_eq!(
        provider
            .start(prepared, lifetime)
            .unwrap()
            .finish()
            .await
            .status,
        InferenceStatus::Completed,
    );

    let sent = transport.requests.lock().unwrap();
    assert_eq!(
        sent[1].0.operation,
        TransportOperation::OpenAiResponsesInputTokens
    );
    assert_eq!(sent[2].0.operation, TransportOperation::OpenAiResponses);
    assert_eq!(sent[1].0.binding, sent[2].0.binding);
    assert_eq!(sent[1].1.deadline, deadline);
    assert_eq!(sent[2].1.deadline, deadline);
    assert!(sent[1].0.max_response_bytes <= 4096);
    let count: Value = serde_json::from_slice(&sent[1].0.body).unwrap();
    let mut generation: Value = serde_json::from_slice(&sent[2].0.body).unwrap();
    let generation = generation.as_object_mut().unwrap();
    for field in ["stream", "store", "include", "max_output_tokens"] {
        assert!(generation.remove(field).is_some());
    }
    assert_eq!(count.as_object().unwrap(), generation);
    assert_eq!(count["model"], "wire-model");
    assert_eq!(count["instructions"], "Preserve the tool exchange.");
    assert_eq!(count["tools"][0]["name"], "echo");
    assert_eq!(count["reasoning"]["effort"], "xhigh");
    assert_eq!(
        count["input"][1]["encrypted_content"],
        "retained-ciphertext"
    );
    assert_eq!(count["input"][2]["call_id"], "call_remote");
    assert_eq!(count["input"][3]["call_id"], "call_remote");
}

#[tokio::test]
async fn count_requires_the_api_profile_and_the_original_binding() {
    let transport = FixtureTransport::new([]);
    let subscription = adapter(
        transport.clone(),
        ResponsesEndpoint::Subscription,
        "replay",
        "live",
    );
    let mut input = request();
    input.max_output_tokens = None;
    let prepared = subscription.prepare(input).unwrap();
    let lifetime = control("fixture").request_control();
    let failure = subscription
        .measure_input_async(&prepared, lifetime.clone())
        .await
        .unwrap_err();
    assert_eq!(failure.kind, FailureKind::Configuration);
    assert_eq!(failure.code, "input_measurement_unavailable");

    let api = adapter(transport.clone(), ResponsesEndpoint::Api, "replay", "live");
    assert_eq!(
        api.measure_input_async(&prepared, lifetime.clone())
            .await
            .unwrap_err()
            .code,
        "prepared_provider_binding_changed",
    );
    let prepared = api.prepare(request()).unwrap();
    lifetime.cancellation.cancel();
    assert_eq!(
        api.measure_input_async(&prepared, lifetime)
            .await
            .unwrap_err()
            .kind,
        FailureKind::Cancelled,
    );
    assert!(transport.requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn count_preserves_typed_http_failures_and_rejects_invalid_counts() {
    for (status, body, kind, code) in [
        (
            401,
            r#"{"error":{"code":"authentication_error"}}"#,
            FailureKind::Authentication,
            "authentication_required",
        ),
        (
            429,
            r#"{"error":{"code":"rate_limit_error"}}"#,
            FailureKind::RateLimit,
            "rate_limit",
        ),
        (
            429,
            r#"{"error":{"code":"insufficient_quota"}}"#,
            FailureKind::Quota,
            "quota_exhausted",
        ),
        (
            200,
            r#"{"object":"response.input_tokens","input_tokens":-1}"#,
            FailureKind::Protocol,
            "input_measurement_invalid",
        ),
        (
            200,
            r#"{"object":"other","input_tokens":4}"#,
            FailureKind::Protocol,
            "input_measurement_invalid",
        ),
    ] {
        let mut reply = response([body.as_bytes().to_vec()], false);
        reply.status = status;
        reply.retry_after_ms = Some(750);
        let transport = FixtureTransport::new([Ok(reply)]);
        let provider = adapter(transport, ResponsesEndpoint::Api, "replay", "live");
        let failure = provider
            .measure_input_async(
                &provider.prepare(request()).unwrap(),
                control("fixture").request_control(),
            )
            .await
            .unwrap_err();
        assert_eq!(failure.kind, kind);
        assert_eq!(failure.code, code);
        assert_eq!(failure.retry_after_ms, (status != 200).then_some(750));
    }

    let transport = FixtureTransport::new([Ok(response([vec![b' '; 4097]], false))]);
    let provider = adapter(transport, ResponsesEndpoint::Api, "replay", "live");
    let failure = provider
        .measure_input_async(
            &provider.prepare(request()).unwrap(),
            control("fixture").request_control(),
        )
        .await
        .unwrap_err();
    assert_eq!(failure.kind, FailureKind::Protocol);
    assert_eq!(failure.code, "input_measurement_invalid");
}
