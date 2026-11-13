mod support;

use agent_kit_core::authority::AuthorityBinding;
use agent_kit_core::inference::{
    FailureKind, InferenceRequest, InferenceStatus, InferenceUpdate, Modality, ModelCapabilities,
    Provider, ProviderBinding,
};
use agent_kit_core::messages::{
    Content, MediaRef, OutcomeStatus, ResultContent, Retention, Role, ToolArguments, ToolCall,
    ToolResult,
};
use agent_kit_core::{ArtifactId, BindingId, ErrorKind, ModelId, PrincipalId, ProviderId, ScopeId};
use agent_kit_providers::{Anthropic, Gemini, GeminiProfile, StreamLimits, TransportOperation};
use serde_json::{Value, json};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use support::{FixtureTransport, control, frame, limits, message, request, response, tool_request};

fn binding(provider: &str) -> ProviderBinding {
    ProviderBinding {
        provider: ProviderId::new(provider).unwrap(),
        authority: AuthorityBinding {
            principal: PrincipalId::new("principal").unwrap(),
            binding: BindingId::new("endpoint").unwrap(),
            scope: ScopeId::new("chat").unwrap(),
        },
    }
}

fn capabilities() -> ModelCapabilities {
    ModelCapabilities {
        revision: BindingId::new("capabilities").unwrap(),
        input_modalities: [Modality::Text].into(),
        json_tools: true,
        text_tools: false,
        max_output_tokens: Some(1024),
        reasoning: Default::default(),
    }
}

fn anthropic(transport: Arc<FixtureTransport>) -> Anthropic {
    Anthropic::new(
        binding("anthropic"),
        [(ModelId::new("model").unwrap(), capabilities())].into(),
        transport,
        limits(),
    )
    .unwrap()
}

fn gemini(transport: Arc<FixtureTransport>, binding: ProviderBinding) -> Gemini {
    gemini_with_replay(transport, binding, "stable-lineage")
}

fn gemini_with_replay(
    transport: Arc<FixtureTransport>,
    binding: ProviderBinding,
    replay_binding: &str,
) -> Gemini {
    Gemini::new(
        binding,
        BindingId::new(replay_binding).unwrap(),
        [(
            ModelId::new("model").unwrap(),
            GeminiProfile {
                capabilities: capabilities(),
                requires_tool_signatures: true,
            },
        )]
        .into(),
        transport,
        limits(),
    )
    .unwrap()
}

fn tool_result(call: &ToolCall, name: &str, text: &str) -> agent_kit_core::messages::Message {
    message(
        name,
        Role::Tool,
        vec![Content::ToolResult(ToolResult {
            call: call.id.clone(),
            status: OutcomeStatus::Succeeded,
            content: vec![ResultContent::Text(text.into())],
            structured: None,
            truncated: false,
        })],
    )
}

fn recorded_calls(message: &agent_kit_core::messages::Message) -> Vec<ToolCall> {
    message
        .content
        .iter()
        .filter_map(|content| match content {
            Content::ToolCall(call) => Some(call.clone()),
            _ => None,
        })
        .collect()
}

fn sent(transport: &FixtureTransport, index: usize, operation: TransportOperation) -> Value {
    let requests = transport.requests.lock().unwrap();
    let (request, _) = &requests[index];
    assert_eq!(request.operation, operation);
    serde_json::from_slice(&request.body).unwrap()
}

// Source: Anthropic Messages streaming docs, including cumulative usage,
// input_json_delta, and the terminal message_stop event.
fn claude_start() -> Value {
    json!({"type":"message_start","message":{"role":"assistant","content":[],"usage":{
        "input_tokens":11,"output_tokens":1,"cache_read_input_tokens":3
    }}})
}

fn claude_tool() -> Vec<Value> {
    vec![
        claude_start(),
        json!({"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}),
        json!({"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Checking"}}),
        json!({"type":"content_block_stop","index":0}),
        json!({"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"call_1","name":"echo","input":{}}}),
        json!({"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"value\":"}}),
        json!({"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\"hello\"}"}}),
        json!({"type":"content_block_stop","index":1}),
        json!({"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":7}}),
        json!({"type":"message_stop"}),
    ]
}

#[tokio::test]
async fn anthropic_commits_complete_tool_blocks_and_preserves_result_identity() {
    let stream = claude_tool()
        .into_iter()
        .flat_map(frame)
        .map(|byte| vec![byte]);
    let transport = FixtureTransport::new([
        Ok(response(stream, true)),
        Ok(response([
            claude_start(),
            json!({"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}),
            json!({"type":"message_stop"}),
        ].into_iter().map(frame), true)),
    ]);
    let adapter = anthropic(transport.clone());
    let mut first = tool_request();
    first.messages.insert(
        0,
        message(
            "system",
            Role::System,
            vec![Content::Text("Use tools".into())],
        ),
    );
    let mut run = adapter
        .start(
            adapter.prepare(first.clone()).unwrap(),
            control("claude-attempt"),
        )
        .unwrap();
    let mut updates = Vec::new();
    while let Some(update) = run.next().await {
        updates.push(update);
    }
    let outcome = run.finish().await;
    assert_eq!(outcome.status, InferenceStatus::Completed);
    let call = recorded_calls(&outcome.messages[0]).pop().unwrap();
    assert_eq!(
        call.arguments,
        ToolArguments::Json(json!({"value":"hello"}))
    );
    assert!(updates.contains(&InferenceUpdate::ToolCall(call.clone())));
    assert_eq!(
        outcome
            .usage
            .iter()
            .find(|usage| usage.category == "output_tokens")
            .unwrap()
            .quantity,
        7
    );
    assert!(
        outcome
            .usage
            .iter()
            .all(|usage| usage.final_value && usage.attempt.as_str() == "claude-attempt")
    );
    let first_body = sent(&transport, 0, TransportOperation::AnthropicMessages);
    assert_eq!(first_body["system"][0]["text"], "Use tools");
    assert_eq!(first_body["max_tokens"], 32);
    assert_eq!(first_body["tools"][0]["input_schema"]["type"], "object");
    let mut continuation = first;
    continuation.messages.push(outcome.messages[0].clone());
    continuation
        .messages
        .push(tool_result(&call, "result", "hello"));
    continuation.messages.push(message(
        "new-input",
        Role::User,
        vec![Content::Text("continue".into())],
    ));
    let next = adapter
        .start(
            adapter.prepare(continuation).unwrap(),
            control("claude-next"),
        )
        .unwrap()
        .finish()
        .await;
    assert_eq!(next.status, InferenceStatus::Completed);
    let next_body = sent(&transport, 1, TransportOperation::AnthropicMessages);
    assert_eq!(
        next_body["messages"][1]["content"][1]["id"],
        next_body["messages"][2]["content"][0]["tool_use_id"]
    );
    assert_eq!(next_body["messages"][2]["content"][0]["is_error"], false);
    assert_eq!(next_body["messages"][2]["content"][1]["text"], "continue");
}

#[tokio::test]
async fn anthropic_eof_and_in_stream_error_keep_only_known_evidence() {
    let incomplete = claude_tool().into_iter().take(7).map(frame);
    let overloaded = [
        claude_start(),
        json!({"type":"error","error":{"type":"overloaded_error","message":"private-overload"}}),
    ]
    .into_iter()
    .map(frame);
    let transport = FixtureTransport::new([
        Ok(response(incomplete, false)),
        Ok(response(overloaded, false)),
    ]);
    let adapter = anthropic(transport);
    let a = adapter
        .start(adapter.prepare(tool_request()).unwrap(), control("first"))
        .unwrap()
        .finish()
        .await;
    assert_eq!(a.status, InferenceStatus::Interrupted);
    assert!(recorded_calls(&a.messages[0]).is_empty());
    assert_eq!(a.messages[0].content, [Content::Text("Checking".into())]);
    assert!(a.usage.iter().all(|usage| !usage.final_value));
    let b = adapter
        .start(adapter.prepare(tool_request()).unwrap(), control("second"))
        .unwrap()
        .finish()
        .await;
    assert_eq!(b.failure.as_ref().unwrap().kind, FailureKind::Transient);
    assert!(
        !serde_json::to_string(&b)
            .unwrap()
            .contains("private-overload")
    );
}

#[test]
fn anthropic_rejects_missing_required_token_limit_before_dispatch() {
    let transport = FixtureTransport::new([]);
    let provider = anthropic(transport.clone());
    let request = InferenceRequest {
        max_output_tokens: None,
        ..request()
    };
    assert_eq!(
        provider.prepare(request).unwrap_err().code,
        "output_token_limit_required"
    );
    assert!(transport.requests.lock().unwrap().is_empty());
}

// Source: Google GenerateContent REST and the parallel thought-signature
// examples. Preserve the original Part order and return any provider call ID.
fn gemini_parts() -> Vec<Value> {
    vec![
        json!({"text":"Check values","thought":true,"thoughtSignature":"c2lnbg==","partMetadata":{"fixture":true}}),
        json!({"functionCall":{"name":"echo","args":{"value":"first"},"id":"provider-1"},"thoughtSignature":"Y2FsbA=="}),
        json!({"functionCall":{"name":"echo","args":{"value":"second"}}}),
    ]
}

fn gemini_candidate(parts: Vec<Value>, stop: Option<&str>) -> Value {
    let mut candidate = json!({"index":0,"content":{"role":"model","parts":parts}});
    if let Some(stop) = stop {
        candidate["finishReason"] = stop.into();
    }
    json!({"candidates":[candidate],"responseId":"same-id"})
}

#[tokio::test]
async fn gemini_lowers_only_retained_user_pngs_and_resolves_bytes_at_dispatch() {
    let transport = FixtureTransport::new([Ok(response(
        [frame(gemini_candidate(
            vec![json!({"text":"seen"})],
            Some("STOP"),
        ))],
        false,
    ))]);
    let model = ModelId::new("gemini-3.8-flash").unwrap();
    let mut capability = capabilities();
    capability.input_modalities.insert(Modality::Image);
    let png = MediaRef {
        id: ArtifactId::new("image").unwrap(),
        media_type: "image/png".into(),
        locator: "private-locator".into(),
        access_scope: BindingId::new("media").unwrap(),
        retention: Retention::Retained,
    };
    let mut input = request();
    input.model = model.clone();
    input.messages[0].content = vec![
        Content::Text("Before".into()),
        Content::Media(png.clone()),
        Content::Text("After".into()),
    ];
    let reads = Arc::new(AtomicUsize::new(0));
    let count = reads.clone();
    let adapter = Gemini::with_image_resolver(
        binding("gemini"),
        BindingId::new("stable-lineage").unwrap(),
        [(
            model.clone(),
            GeminiProfile {
                capabilities: capability,
                requires_tool_signatures: true,
            },
        )]
        .into(),
        transport.clone(),
        StreamLimits {
            max_request_bytes: 512,
            ..limits()
        },
        Some(Arc::new(move |media, limit| {
            assert_eq!(media, &png);
            assert_eq!(limit, 384);
            if count.fetch_add(1, Ordering::Relaxed) == 0 {
                Ok(vec![0x89, b'P', b'N', b'G'])
            } else {
                Ok(vec![0; limit + 1])
            }
        })),
    )
    .unwrap();
    let mut jpeg = input.clone();
    let Content::Media(media) = &mut jpeg.messages[0].content[1] else {
        panic!("fixture requires media");
    };
    media.media_type = "image/jpeg".into();
    assert_eq!(
        adapter.prepare(jpeg).unwrap_err().code,
        "unsupported_conversation_content"
    );
    let prepared = adapter.prepare(input).unwrap();
    assert_eq!(reads.load(Ordering::Relaxed), 0);
    let outcome = adapter
        .start(prepared.clone(), control("image"))
        .unwrap()
        .finish()
        .await;
    assert_eq!(outcome.status, InferenceStatus::Completed);
    assert_eq!(
        sent(
            &transport,
            0,
            TransportOperation::GeminiStreamGenerateContent { model }
        )["contents"][0],
        json!({"role":"user","parts":[
            {"text":"Before"},
            {"inlineData":{"mimeType":"image/png","data":"iVBORw=="}},
            {"text":"After"}
        ]})
    );
    let Err(error) = adapter.start(prepared, control("oversized")) else {
        panic!("oversized image must stop before dispatch");
    };
    assert_eq!(error.kind, ErrorKind::LimitExceeded);
    assert_eq!(reads.load(Ordering::Relaxed), 2);
    assert_eq!(transport.requests.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn strict_gemini_refuses_retained_unsigned_first_call_before_replay_dispatch() {
    let mut unsigned = gemini_parts();
    unsigned[1]
        .as_object_mut()
        .unwrap()
        .remove("thoughtSignature");
    let transport = FixtureTransport::new([Ok(response(
        [frame(gemini_candidate(unsigned, Some("STOP")))],
        false,
    ))]);
    let permissive = Gemini::new(
        binding("gemini"),
        BindingId::new("stable-lineage").unwrap(),
        [(
            ModelId::new("model").unwrap(),
            GeminiProfile {
                capabilities: capabilities(),
                requires_tool_signatures: false,
            },
        )]
        .into(),
        transport.clone(),
        limits(),
    )
    .unwrap();
    let mut next = tool_request();
    let old = permissive
        .start(permissive.prepare(next.clone()).unwrap(), control("old"))
        .unwrap()
        .finish()
        .await;
    assert_eq!(old.status, InferenceStatus::Completed);
    let assistant = old.messages.into_iter().next().unwrap();
    let calls = recorded_calls(&assistant);
    assert_eq!(calls.len(), 2);
    next.messages.push(assistant);
    next.messages.push(tool_result(&calls[0], "r1", "first"));
    next.messages.push(tool_result(&calls[1], "r2", "second"));
    let strict = gemini(transport.clone(), binding("gemini"));
    assert_eq!(
        strict.prepare(next).unwrap_err().code,
        "missing_tool_thought_signature"
    );
    assert_eq!(transport.requests.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn gemini_replays_signed_parts_and_parallel_result_order_after_serialization() {
    let parts = gemini_parts();
    let transport = FixtureTransport::new([
        Ok(response([
            gemini_candidate(parts[..1].to_vec(), None),
            gemini_candidate(parts[1..].to_vec(), Some("STOP")),
            json!({"usageMetadata":{"promptTokenCount":9,"candidatesTokenCount":8,"thoughtsTokenCount":4}}),
        ].into_iter().map(frame), false)),
        Ok(response([frame(gemini_candidate(vec![json!({"text":"done"})], Some("STOP")))], false)),
    ]);
    let adapter = gemini(transport.clone(), binding("gemini"));
    let mut original = tool_request();
    original.messages.insert(
        0,
        message(
            "instructions",
            Role::System,
            vec![Content::Text("Use tools".into())],
        ),
    );
    let mut run = adapter
        .start(
            adapter.prepare(original.clone()).unwrap(),
            control("gemini-attempt"),
        )
        .unwrap();
    while let Some(update) = run.next().await {
        assert!(!matches!(
            update,
            InferenceUpdate::ToolCall(_) | InferenceUpdate::ProviderState { .. }
        ));
    }
    let outcome = run.finish().await;
    assert_eq!(outcome.status, InferenceStatus::Completed);
    assert!(
        outcome
            .usage
            .iter()
            .all(|usage| usage.final_value && usage.attempt.as_str() == "gemini-attempt")
    );
    let assistant = serde_json::from_slice::<agent_kit_core::messages::Message>(
        &serde_json::to_vec(&outcome.messages[0]).unwrap(),
    )
    .unwrap();
    let calls = recorded_calls(&assistant);
    assert_eq!(calls.len(), 2);
    assert_ne!(calls[0].id, calls[1].id);
    let operation = TransportOperation::GeminiStreamGenerateContent {
        model: original.model.clone(),
    };
    let first_body = sent(&transport, 0, operation.clone());
    assert_eq!(
        first_body["systemInstruction"]["parts"][0]["text"],
        "Use tools"
    );
    assert_eq!(
        first_body["tools"][0]["functionDeclarations"][0]["parametersJsonSchema"]["type"],
        "object"
    );
    original.messages.push(assistant);
    // The application is free to retain results in a different local order.
    original
        .messages
        .push(tool_result(&calls[1], "r2", "second value"));
    original
        .messages
        .push(tool_result(&calls[0], "r1", "first value"));
    let mut fresh_execution = binding("gemini");
    fresh_execution.authority.binding = BindingId::new("fresh-execution").unwrap();
    let restored = gemini(transport.clone(), fresh_execution.clone());
    let old_prepared = adapter.prepare(original.clone()).unwrap();
    assert_eq!(
        restored
            .start(old_prepared, control("stale-authority"))
            .err()
            .unwrap()
            .code,
        "prepared_provider_binding_changed"
    );
    let next = restored
        .start(
            restored.prepare(original.clone()).unwrap(),
            control("gemini-next"),
        )
        .unwrap()
        .finish()
        .await;
    assert_eq!(next.status, InferenceStatus::Completed);
    let body = sent(&transport, 1, operation);
    assert_eq!(body["contents"][1]["parts"], json!(parts));
    assert_eq!(
        body["contents"][2]["parts"][0]["functionResponse"]["id"],
        "provider-1"
    );
    assert_eq!(
        body["contents"][2]["parts"][0]["functionResponse"]["response"]["content"][0],
        "first value"
    );
    assert!(
        body["contents"][2]["parts"][1]["functionResponse"]
            .get("id")
            .is_none()
    );
    assert_eq!(
        body["contents"][2]["parts"][1]["functionResponse"]["response"]["content"][0],
        "second value"
    );

    let mut changed = original.clone();
    changed.messages[2].content[0] = Content::Reasoning("changed projection".into());
    assert_eq!(
        adapter.prepare(changed).unwrap_err().code,
        "provider_state_binding_changed"
    );
    assert_eq!(
        gemini_with_replay(transport.clone(), fresh_execution, "rotated-lineage")
            .prepare(original)
            .unwrap_err()
            .code,
        "provider_state_binding_changed"
    );
    assert_eq!(transport.requests.lock().unwrap().len(), 2);
}

#[tokio::test]
async fn gemini_never_admits_unsigned_or_incompletely_framed_tool_calls() {
    let mut unsigned = gemini_parts();
    unsigned[1]
        .as_object_mut()
        .unwrap()
        .remove("thoughtSignature");
    let mut partial_args = gemini_parts();
    partial_args[1]["functionCall"]["willContinue"] = true.into();
    let transport = FixtureTransport::new([
        Ok(response(
            [frame(gemini_candidate(unsigned, Some("STOP")))],
            false,
        )),
        Ok(response(
            [
                frame(gemini_candidate(gemini_parts(), Some("STOP"))),
                b"data: {\"usageMetadata\":".to_vec(),
            ],
            false,
        )),
        Ok(response(
            [frame(gemini_candidate(gemini_parts(), None))],
            false,
        )),
        Ok(response(
            [frame(gemini_candidate(partial_args, Some("STOP")))],
            false,
        )),
    ]);
    let adapter = gemini(transport, binding("gemini"));
    for code in [
        "missing_tool_thought_signature",
        "incomplete_event",
        "missing_finish_reason",
        "unsupported_streamed_function_arguments",
    ] {
        let mut run = adapter
            .start(adapter.prepare(tool_request()).unwrap(), control(code))
            .unwrap();
        while let Some(update) = run.next().await {
            assert!(!matches!(update, InferenceUpdate::ToolCall(_)));
        }
        let outcome = run.finish().await;
        assert_eq!(outcome.status, InferenceStatus::Interrupted);
        assert_eq!(outcome.failure.unwrap().code, code);
        assert!(
            outcome
                .messages
                .iter()
                .flat_map(|message| &message.content)
                .all(|part| { !matches!(part, Content::ToolCall(_) | Content::ProviderState(_)) })
        );
    }
}

#[tokio::test]
async fn gemini_distinguishes_prompt_refusal_and_non_retriable_payment_failure() {
    let mut payment = response(
        [br#"{"error":{"type":"authentication_error","message":"private-billing"}}"#.to_vec()],
        true,
    );
    payment.status = 402;
    let transport = FixtureTransport::new([
        Ok(response(
            [frame(json!({"promptFeedback":{"blockReason":"SAFETY"}}))],
            false,
        )),
        Ok(payment),
    ]);
    let adapter = gemini(transport, binding("gemini"));
    let refused = adapter
        .start(adapter.prepare(request()).unwrap(), control("blocked"))
        .unwrap()
        .finish()
        .await;
    assert_eq!(refused.status, InferenceStatus::Refused);
    let failed = adapter
        .start(adapter.prepare(request()).unwrap(), control("payment"))
        .unwrap()
        .finish()
        .await;
    assert!(
        !serde_json::to_string(&failed)
            .unwrap()
            .contains("private-billing")
    );
    let failure = failed.failure.unwrap();
    assert_eq!(failure.kind, FailureKind::Quota);
    assert_eq!(failure.code, "payment_required");
}

#[tokio::test]
async fn anthropic_distinguishes_context_exhaustion_from_output_limit() {
    let reply = |reason: &str| {
        response([
        claude_start(),
        json!({"type":"message_delta","delta":{"stop_reason":reason},"usage":{"output_tokens":2}}),
        json!({"type":"message_stop"}),
    ].into_iter().map(frame), false)
    };
    let transport = FixtureTransport::new([
        Ok(reply("model_context_window_exceeded")),
        Ok(reply("max_tokens")),
    ]);
    let adapter = anthropic(transport);
    for (attempt, expected) in [
        ("context", Some(FailureKind::ContextLimit)),
        ("output", None),
    ] {
        let outcome = adapter
            .start(adapter.prepare(request()).unwrap(), control(attempt))
            .unwrap()
            .finish()
            .await;
        assert_eq!(outcome.status, InferenceStatus::Limited);
        assert_eq!(outcome.failure.map(|failure| failure.kind), expected);
    }
}
