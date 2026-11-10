mod support;
use agent_kit_core::authority::AuthorityBinding;
use agent_kit_core::inference::{
    DispatchEvidence, FailureKind, InferenceRequest, InferenceStatus, InferenceUpdate, InputFormat,
    Modality, ModelCapabilities, Provider, ProviderBinding,
};
use agent_kit_core::messages::{
    Content, MediaRef, OutcomeStatus, ResultContent, Retention, Role, ToolArguments, ToolCall,
    ToolResult,
};
use agent_kit_core::{
    ArtifactId, AttemptId, BindingId, ErrorKind, ModelId, PrincipalId, ProviderId, ScopeId,
    ToolCallId, ToolId,
};
use agent_kit_providers::{
    InputImageResolver, ModelProfile, OpenAiCompatible, OutputLimitField, StreamLimits,
    TransportFailure, TransportOperation,
};
use serde_json::{Value, json};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;
use support::{
    FixtureTransport, control, frame, limits, message, offer, request, response, tool_request,
};

fn binding() -> ProviderBinding {
    ProviderBinding {
        provider: ProviderId::new("compatible").unwrap(),
        authority: AuthorityBinding {
            principal: PrincipalId::new("principal").unwrap(),
            binding: BindingId::new("endpoint").unwrap(),
            scope: ScopeId::new("chat").unwrap(),
        },
    }
}

fn profile() -> ModelProfile {
    ModelProfile {
        capabilities: ModelCapabilities {
            revision: BindingId::new("capabilities").unwrap(),
            input_modalities: [Modality::Text].into(),
            json_tools: true,
            text_tools: false,
            max_output_tokens: Some(1024),
        },
        output_limit: OutputLimitField::CompletionTokens,
        include_usage: true,
    }
}

fn adapter(transport: Arc<FixtureTransport>) -> OpenAiCompatible {
    configured(transport, profile(), limits())
}

fn configured(
    transport: Arc<FixtureTransport>,
    profile: ModelProfile,
    limits: StreamLimits,
) -> OpenAiCompatible {
    OpenAiCompatible::new(
        binding(),
        [(ModelId::new("model").unwrap(), profile)].into(),
        transport,
        limits,
    )
    .unwrap()
}

fn choice(delta: Value, finish: Option<&str>) -> Vec<u8> {
    frame(
        json!({ "id": "response-local", "choices": [{ "index": 0, "delta": delta, "finish_reason": finish }] }),
    )
}

fn done() -> Vec<u8> {
    b"data: [DONE]\n\n".to_vec()
}

fn text_response(text: &str) -> Vec<Vec<u8>> {
    vec![
        choice(json!({ "role": "assistant", "content": text }), None),
        choice(json!({}), Some("stop")),
        done(),
    ]
}

fn function_response(arguments: [&str; 2]) -> Vec<Vec<u8>> {
    vec![
        choice(
            json!({ "tool_calls": [{ "index": 0, "id": "call-local", "type": "function", "function": { "name": "echo", "arguments": arguments[0] } }] }),
            None,
        ),
        choice(
            json!({ "tool_calls": [{ "index": 0, "function": { "arguments": arguments[1] } }] }),
            None,
        ),
        choice(json!({}), Some("tool_calls")),
        done(),
    ]
}

async fn execute(
    provider: &OpenAiCompatible,
    request: InferenceRequest,
    attempt: &str,
) -> agent_kit_core::inference::InferenceOutcome {
    let prepared = provider.prepare(request).unwrap();
    provider
        .start(prepared, control(attempt))
        .unwrap()
        .finish()
        .await
}

#[tokio::test]
async fn prepare_is_read_only_and_dispatch_uses_the_bound_route() {
    let transport = FixtureTransport::new([Ok(response(text_response("hello"), false))]);
    let provider = adapter(transport.clone());
    let prepared = provider.prepare(request()).unwrap();
    assert_eq!(
        provider.measure_input(&prepared).unwrap_err().kind,
        ErrorKind::Unsupported
    );
    assert!(transport.requests.lock().unwrap().is_empty());
    let mut lifetime = control("attempt-1");
    lifetime.deadline = Some(std::time::Instant::now() + Duration::from_secs(5));
    let deadline = lifetime.deadline;
    let run = provider.start(prepared, lifetime).unwrap();
    assert!(transport.requests.lock().unwrap().is_empty());
    assert_eq!(run.finish().await.status, InferenceStatus::Completed);
    let requests = transport.requests.lock().unwrap();
    let (request, control) = &requests[0];
    let body: Value = serde_json::from_slice(&request.body).unwrap();
    assert_eq!(request.binding, binding());
    assert_eq!(request.operation, TransportOperation::ChatCompletions);
    assert_eq!(request.max_response_bytes, limits().max_response_bytes);
    assert_eq!(body["stream"], true);
    assert_eq!(body["stream_options"]["include_usage"], true);
    assert_eq!(body["max_completion_tokens"], 32);
    assert_eq!(body["messages"][0]["role"], "user");
    assert_eq!(control.deadline, deadline);
}

#[tokio::test]
async fn model_profile_selects_legacy_token_field_without_implied_usage_support() {
    let transport = FixtureTransport::new([Ok(response(text_response("hello"), false))]);
    let provider = configured(
        transport.clone(),
        ModelProfile {
            output_limit: OutputLimitField::Tokens,
            include_usage: false,
            ..profile()
        },
        limits(),
    );
    execute(&provider, request(), "legacy").await;
    let body: Value =
        serde_json::from_slice(&transport.requests.lock().unwrap()[0].0.body).unwrap();
    assert_eq!(body["max_tokens"], 32);
    assert!(body.get("stream_options").is_none());
    assert!(body.get("max_completion_tokens").is_none());
}

// Ollama's compatible stream sends reasoning as its own delta. The terminal
// usage frame and marker use the common Chat Completions contract.
#[tokio::test]
async fn compatible_reasoning_remains_separate_from_text_and_portable_history() {
    let transport = FixtureTransport::new([
        Ok(response(
            [
                choice(
                    json!({"role":"assistant","content":"","reasoning":"Consider "}),
                    None,
                ),
                choice(json!({"content":"","reasoning":"the prompt"}), None),
                choice(json!({"content":"Answer"}), None),
                choice(json!({}), Some("stop")),
                frame(json!({"id":"response-local","choices":[],"usage":{
                    "prompt_tokens":11,"completion_tokens":7,"total_tokens":18
                }})),
                done(),
            ],
            false,
        )),
        Ok(response(text_response("Continuing"), false)),
    ]);
    let provider = configured(
        transport.clone(),
        ModelProfile {
            output_limit: OutputLimitField::Tokens,
            ..profile()
        },
        limits(),
    );
    let mut continuation = request();
    let mut run = provider
        .start(
            provider.prepare(continuation.clone()).unwrap(),
            control("local"),
        )
        .unwrap();
    let mut reasoning = String::new();
    let mut text = String::new();
    while let Some(update) = run.next().await {
        match update {
            InferenceUpdate::ReasoningDelta { text, .. } => reasoning.push_str(&text),
            InferenceUpdate::TextDelta { text: delta, .. } => text.push_str(&delta),
            _ => {}
        }
    }
    let outcome = run.finish().await;
    assert_eq!(outcome.status, InferenceStatus::Completed);
    assert_eq!(reasoning, "Consider the prompt");
    assert_eq!(text, "Answer");
    assert_eq!(
        outcome.messages[0].content,
        [Content::Reasoning(reasoning), Content::Text(text)]
    );
    assert!(outcome.usage.iter().any(|usage| {
        usage.category == "output_tokens" && usage.quantity == 7 && usage.final_value
    }));

    continuation.messages.extend(outcome.messages);
    continuation.messages.push(message(
        "continuation",
        Role::User,
        vec![Content::Text("Go on".into())],
    ));
    assert_eq!(
        execute(&provider, continuation, "local-continuation")
            .await
            .status,
        InferenceStatus::Completed
    );
    let requests = transport.requests.lock().unwrap();
    let body: Value = serde_json::from_slice(&requests[1].0.body).unwrap();
    assert_eq!(body["max_tokens"], 32);
    assert_eq!(body["stream_options"]["include_usage"], true);
    assert!(body.get("max_completion_tokens").is_none());
    assert_eq!(
        body["messages"][1],
        json!({"role":"assistant","content":"Answer"})
    );
}

#[tokio::test]
async fn compatible_reasoning_content_is_retained_on_interruption() {
    let transport = FixtureTransport::new([Ok(response(
        [
            choice(json!({"reasoning_content":"Partial reasoning"}), None),
            choice(json!({"content":"Partial answer"}), None),
        ],
        false,
    ))]);
    let outcome = execute(&adapter(transport), request(), "interrupted-reasoning").await;
    assert_eq!(outcome.status, InferenceStatus::Interrupted);
    assert_eq!(
        outcome.messages[0].content,
        [
            Content::Reasoning("Partial reasoning".into()),
            Content::Text("Partial answer".into()),
        ]
    );
}

#[test]
fn unsupported_inputs_and_request_bounds_fail_before_dispatch() {
    let transport = FixtureTransport::new([]);
    let provider = configured(
        transport.clone(),
        profile(),
        StreamLimits {
            max_request_bytes: 512,
            ..limits()
        },
    );
    let mut media = request();
    media.messages[0].content.push(Content::Media(MediaRef {
        id: ArtifactId::new("image").unwrap(),
        media_type: "image/png".into(),
        locator: "private-locator".into(),
        access_scope: BindingId::new("media").unwrap(),
        retention: Retention::Retained,
    }));
    assert_eq!(
        provider.prepare(media).unwrap_err().kind,
        ErrorKind::Unsupported
    );
    let mut oversized = request();
    oversized.messages[0].content = vec![Content::Text("x".repeat(1024))];
    assert_eq!(
        provider.prepare(oversized).unwrap_err().kind,
        ErrorKind::LimitExceeded
    );
    let mut wrong_tool = tool_request();
    wrong_tool.tools[0].input = InputFormat::Text;
    assert_eq!(
        provider.prepare(wrong_tool).unwrap_err().kind,
        ErrorKind::Unsupported
    );
    assert!(transport.requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn compatible_png_resolves_only_on_dispatch_and_keeps_order_and_bounds() {
    let transport = FixtureTransport::new([Ok(response(text_response("image"), false))]);
    let mut profile = profile();
    profile
        .capabilities
        .input_modalities
        .insert(Modality::Image);
    let png = MediaRef {
        id: ArtifactId::new("image").unwrap(),
        media_type: "image/png".into(),
        locator: "private-locator".into(),
        access_scope: BindingId::new("media").unwrap(),
        retention: Retention::Retained,
    };
    let mut input = request();
    input.messages[0].content = vec![
        Content::Text("Before".into()),
        Content::Media(png.clone()),
        Content::Text("After".into()),
    ];
    let reads = Arc::new(AtomicUsize::new(0));
    let count = reads.clone();
    let provider = OpenAiCompatible::with_image_resolver(
        binding(),
        [(ModelId::new("model").unwrap(), profile)].into(),
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
    let mut wrong_mime = input.clone();
    let Content::Media(media) = &mut wrong_mime.messages[0].content[1] else {
        panic!("fixture requires media");
    };
    media.media_type = "image/jpeg".into();
    assert_eq!(
        provider.prepare(wrong_mime).unwrap_err().code,
        "unsupported_compatible_input_image"
    );
    let prepared = provider.prepare(input).unwrap();
    assert_eq!(reads.load(Ordering::Relaxed), 0);
    let outcome = provider
        .start(prepared.clone(), control("image"))
        .unwrap()
        .finish()
        .await;
    assert_eq!(outcome.status, InferenceStatus::Completed);
    let Err(error) = provider.start(prepared, control("oversized-image")) else {
        panic!("oversized bytes must stop dispatch");
    };
    assert_eq!(error.kind, ErrorKind::LimitExceeded);
    assert_eq!(reads.load(Ordering::Relaxed), 2);
    let requests = transport.requests.lock().unwrap();
    assert_eq!(requests.len(), 1);
    let body: Value = serde_json::from_slice(&requests[0].0.body).unwrap();
    assert_eq!(
        body["messages"][0],
        json!({"role":"user","content":[
            {"type":"text","text":"Before"},
            {"type":"image_url","image_url":{"url":"data:image/png;base64,iVBORw=="}},
            {"type":"text","text":"After"}
        ]})
    );
    assert!(
        !requests[0]
            .0
            .body
            .windows(15)
            .any(|bytes| bytes == b"private-locator")
    );
}

fn png_tool_adapter(
    transport: Arc<FixtureTransport>,
    limits: StreamLimits,
    resolver: Arc<InputImageResolver>,
) -> OpenAiCompatible {
    let mut profile = profile();
    profile
        .capabilities
        .input_modalities
        .insert(Modality::Image);
    OpenAiCompatible::with_image_resolver(
        binding(),
        [(ModelId::new("model").unwrap(), profile)].into(),
        transport,
        limits,
        Some(resolver),
    )
    .unwrap()
}

fn png_tool_request() -> InferenceRequest {
    let mut request = request();
    let call = |id: &str| ToolCall {
        id: ToolCallId::new(id).unwrap(),
        tool: ToolId::new("filesystem/view_image").unwrap(),
        arguments: ToolArguments::Json(json!({ "file": id })),
    };
    let first = call("z-call");
    let second = call("a-call");
    request.messages.push(message(
        "assistant",
        Role::Assistant,
        vec![
            Content::ToolCall(first.clone()),
            Content::ToolCall(second.clone()),
        ],
    ));
    // Runtime records siblings in durable ID order, which can differ from
    // the provider's call array order.
    for call in [second, first] {
        let id = call.id.as_str();
        let image = MediaRef {
            id: ArtifactId::new(id).unwrap(),
            media_type: "image/png".into(),
            locator: format!("private-locator/{id}"),
            access_scope: BindingId::new("media").unwrap(),
            retention: Retention::Retained,
        };
        request.messages.push(message(
            &format!("result-{id}"),
            Role::Tool,
            vec![Content::ToolResult(ToolResult {
                call: call.id.clone(),
                status: OutcomeStatus::Succeeded,
                content: vec![ResultContent::Text(id.into()), ResultContent::Media(image)],
                structured: Some(json!({ "width": 2 })),
                truncated: false,
            })],
        ));
    }
    request
}

#[tokio::test]
async fn reviewed_png_tool_images_follow_all_correlated_sibling_replies() {
    let transport = FixtureTransport::new([Ok(response(text_response("done"), false))]);
    let reads = Arc::new(AtomicUsize::new(0));
    let provider = png_tool_adapter(
        transport.clone(),
        limits(),
        Arc::new({
            let reads = reads.clone();
            move |media, maximum| {
                let index = reads.fetch_add(1, Ordering::Relaxed);
                assert_eq!(maximum, limits().max_request_bytes / 4 * 3 - index * 4);
                Ok(match media.id.as_str() {
                    "a-call" => vec![0x89, b'P', b'N', b'A'],
                    "z-call" => vec![0x89, b'P', b'N', b'Z'],
                    _ => panic!("unexpected media identity"),
                })
            }
        }),
    )
    .with_retained_png_tool_results();
    let mut input = png_tool_request();
    input.messages.push(message(
        "follow-up",
        Role::User,
        vec![Content::Text("Compare those.".into())],
    ));
    let prepared = provider.prepare(input.clone()).unwrap();
    assert_eq!(prepared.request(), &input);
    assert_eq!(reads.load(Ordering::Relaxed), 0);
    let outcome = provider
        .start(prepared, control("tool-images"))
        .unwrap()
        .finish()
        .await;
    assert_eq!(outcome.status, InferenceStatus::Completed);
    assert_eq!(reads.load(Ordering::Relaxed), 2);

    let requests = transport.requests.lock().unwrap();
    assert_eq!(requests.len(), 1);
    let body: Value = serde_json::from_slice(&requests[0].0.body).unwrap();
    let messages = body["messages"].as_array().unwrap();
    assert_eq!(messages.len(), 6);
    let first_call = messages[1]["tool_calls"][0]["id"].as_str().unwrap();
    let second_call = messages[1]["tool_calls"][1]["id"].as_str().unwrap();
    let first_label = format!("Tool-provided image 1 for result {first_call}");
    let second_label = format!("Tool-provided image 1 for result {second_call}");
    for (message, call, result, label) in [
        (&messages[2], second_call, "a-call", &second_label),
        (&messages[3], first_call, "z-call", &first_label),
    ] {
        assert_eq!(message["role"], "tool");
        assert_eq!(message["tool_call_id"], call);
        assert_eq!(
            serde_json::from_str::<Value>(message["content"].as_str().unwrap()).unwrap(),
            json!({"status":"succeeded","content":[result, format!("[{label} attached below]")],"structured":{"width":2},"truncated":false})
        );
    }
    assert_eq!(
        messages[4],
        json!({"role":"user","content":[
            {"type":"text","text":second_label},
            {"type":"image_url","image_url":{"url":"data:image/png;base64,iVBOQQ=="}},
            {"type":"text","text":first_label},
            {"type":"image_url","image_url":{"url":"data:image/png;base64,iVBOWg=="}},
        ]})
    );
    assert_eq!(
        messages[5],
        json!({"role":"user","content":"Compare those."})
    );
    assert!(!String::from_utf8_lossy(&requests[0].0.body).contains("private-locator"));
}

#[test]
fn compatible_tool_images_refuse_invalid_exchanges_and_unreviewed_profiles() {
    let transport = FixtureTransport::new([]);
    let resolver: Arc<InputImageResolver> = Arc::new(|_, _| panic!("prepare must not read images"));
    let generic = png_tool_adapter(transport.clone(), limits(), resolver.clone());
    let reviewed = png_tool_adapter(transport.clone(), limits(), resolver.clone())
        .with_retained_png_tool_results();
    let input = png_tool_request();
    assert_eq!(
        generic.prepare(input.clone()).unwrap_err().code,
        "unsupported_tool_media"
    );
    assert_eq!(
        adapter(transport.clone())
            .with_retained_png_tool_results()
            .prepare(input.clone())
            .unwrap_err()
            .code,
        "unsupported_tool_media"
    );
    let mut no_tools = profile();
    no_tools.capabilities.json_tools = false;
    no_tools
        .capabilities
        .input_modalities
        .insert(Modality::Image);
    let no_tools = OpenAiCompatible::with_image_resolver(
        binding(),
        [(input.model.clone(), no_tools)].into(),
        transport.clone(),
        limits(),
        Some(resolver),
    )
    .unwrap()
    .with_retained_png_tool_results();
    assert_eq!(
        no_tools.prepare(input.clone()).unwrap_err().code,
        "unsupported_tool_media"
    );

    let mut missing = input.clone();
    missing.messages.pop();
    assert_eq!(
        reviewed.prepare(missing).unwrap_err().code,
        "incomplete_tool_exchange"
    );

    let mut interrupted = input.clone();
    interrupted.messages.insert(
        3,
        message("early", Role::User, vec![Content::Text("too early".into())]),
    );
    assert_eq!(
        reviewed.prepare(interrupted).unwrap_err().code,
        "invalid_compatible_tool_exchange"
    );

    let mut orphan = input.clone();
    orphan.messages.remove(1);
    assert_eq!(
        reviewed.prepare(orphan).unwrap_err().code,
        "unmatched_tool_result"
    );

    let mut unsupported = input;
    let Content::ToolResult(result) = &mut unsupported.messages[2].content[0] else {
        panic!("fixture requires a tool result");
    };
    let ResultContent::Media(media) = &mut result.content[1] else {
        panic!("fixture requires media");
    };
    media.media_type = "image/jpeg".into();
    assert_eq!(
        reviewed.prepare(unsupported).unwrap_err().code,
        "unsupported_tool_media"
    );
    assert!(transport.requests.lock().unwrap().is_empty());
}

#[test]
fn compatible_tool_images_enforce_resolver_and_encoded_request_bounds() {
    let transport = FixtureTransport::new([]);
    for overrun in [false, true] {
        let provider = png_tool_adapter(
            transport.clone(),
            StreamLimits {
                max_request_bytes: 4096,
                ..limits()
            },
            Arc::new(move |media, maximum| {
                assert_eq!(media.id.as_str(), "a-call");
                assert_eq!(maximum, 3072);
                Ok(vec![0; maximum + usize::from(overrun)])
            }),
        )
        .with_retained_png_tool_results();
        let mut input = png_tool_request();
        let Content::ToolResult(result) = &mut input.messages[3].content[0] else {
            panic!("fixture requires a tool result");
        };
        result.content.pop();
        let prepared = provider.prepare(input).unwrap();
        let Err(error) = provider.start(prepared, control("tool-image-too-large")) else {
            panic!("oversized bytes must stop dispatch");
        };
        assert_eq!(error.kind, ErrorKind::LimitExceeded);
        assert_eq!(error.code, "request_byte_limit");
    }
    assert!(transport.requests.lock().unwrap().is_empty());
}

#[test]
fn prepared_request_cannot_switch_binding_before_dispatch() {
    let transport = FixtureTransport::new([]);
    let provider = adapter(transport.clone());
    let foreign = ProviderBinding {
        provider: ProviderId::new("other").unwrap(),
        ..binding()
    };
    let prepared = agent_kit_core::inference::PreparedRequest::from_validated(
        request(),
        foreign,
        profile().capabilities,
    )
    .unwrap();
    assert!(provider.start(prepared, control("wrong-binding")).is_err());
    assert!(transport.requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn byte_fragmented_text_finishes_without_waiting_for_socket_eof() {
    let bytes: Vec<u8> = text_response("안녕하세요").into_iter().flatten().collect();
    let transport =
        FixtureTransport::new([Ok(response(bytes.into_iter().map(|byte| vec![byte]), true))]);
    let result = tokio::time::timeout(
        Duration::from_secs(1),
        execute(&adapter(transport), request(), "fragmented"),
    )
    .await
    .unwrap();
    assert_eq!(result.status, InferenceStatus::Completed);
    assert_eq!(
        result.messages[0].content,
        vec![Content::Text("안녕하세요".into())]
    );
}

#[tokio::test]
async fn completed_tool_arguments_and_message_ids_are_attempt_scoped() {
    let script = || response(function_response(["{\"value\":", "\"complete\"}"]), false);
    let transport = FixtureTransport::new([Ok(script()), Ok(script())]);
    let provider = adapter(transport);
    let mut first = provider
        .start(
            provider.prepare(tool_request()).unwrap(),
            control("attempt-one"),
        )
        .unwrap();
    let Some(InferenceUpdate::ToolCall(call)) = first.next().await else {
        panic!("complete tool call")
    };
    assert_eq!(
        call.arguments,
        ToolArguments::Json(json!({ "value": "complete" }))
    );
    let first = first.finish().await;
    let second = execute(&provider, tool_request(), "attempt-two").await;
    let Content::ToolCall(other) = &second.messages[0].content[0] else {
        panic!("tool call")
    };
    assert_ne!(first.messages[0].id, second.messages[0].id);
    assert_ne!(call.id, other.id);
    assert_eq!(first.messages[0].content, vec![Content::ToolCall(call)]);
}

#[tokio::test]
async fn request_lowering_preserves_tool_result_correlation_and_uses_wire_names() {
    let transport = FixtureTransport::new([Ok(response(text_response("done"), false))]);
    let provider = adapter(transport.clone());
    let mut request = request();
    request.tools = vec![offer("filesystem/read")];
    let call_id = agent_kit_core::ToolCallId::new("old-call").unwrap();
    request.messages.push(message(
        "assistant",
        Role::Assistant,
        vec![Content::ToolCall(agent_kit_core::messages::ToolCall {
            id: call_id.clone(),
            tool: ToolId::new("filesystem/read").unwrap(),
            arguments: ToolArguments::Json(json!({ "value": "file" })),
        })],
    ));
    request.messages.push(message(
        "result",
        Role::Tool,
        vec![Content::ToolResult(ToolResult {
            call: call_id,
            status: OutcomeStatus::Succeeded,
            content: vec![ResultContent::Text("contents".into())],
            structured: None,
            truncated: false,
        })],
    ));
    execute(&provider, request, "continued").await;
    let body: Value =
        serde_json::from_slice(&transport.requests.lock().unwrap()[0].0.body).unwrap();
    assert_eq!(
        body["messages"][1]["tool_calls"][0]["id"],
        body["messages"][2]["tool_call_id"]
    );
    assert_eq!(
        body["messages"][2]["content"],
        r#"{"status":"succeeded","content":["contents"],"structured":null,"truncated":false}"#
    );
    let name = body["tools"][0]["function"]["name"].as_str().unwrap();
    assert!(
        name.bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    );
    assert_eq!(
        body["messages"][1]["tool_calls"][0]["function"]["name"],
        name
    );
}

#[tokio::test]
async fn incomplete_or_malformed_tool_arguments_never_become_invocations() {
    for (script, code) in [
        (
            function_response(["{\"value\":", "invalid"]),
            "invalid_tool_arguments",
        ),
        (
            function_response(["{\"value\":", "\"incomplete\"}"])[..2].to_vec(),
            "missing_terminal_event",
        ),
    ] {
        let transport = FixtureTransport::new([Ok(response(script, false))]);
        let provider = adapter(transport);
        let mut run = provider
            .start(
                provider.prepare(tool_request()).unwrap(),
                control("invalid"),
            )
            .unwrap();
        assert!(run.next().await.is_none());
        let result = run.finish().await;
        assert_eq!(result.status, InferenceStatus::Interrupted);
        assert_eq!(result.failure.unwrap().code, code);
        assert!(result.messages.is_empty());
    }
}

#[tokio::test]
async fn unoffered_tool_names_never_resolve_as_existing_capabilities() {
    let script = vec![
        choice(
            json!({ "tool_calls": [{ "index": 0, "id": "unknown", "function": { "name": "different", "arguments": "{}" } }] }),
            Some("tool_calls"),
        ),
        done(),
    ];
    let result = execute(
        &adapter(FixtureTransport::new([Ok(response(script, false))])),
        tool_request(),
        "unknown-tool",
    )
    .await;
    assert_eq!(result.status, InferenceStatus::Interrupted);
    assert_eq!(result.failure.unwrap().code, "unoffered_tool_call");
    assert!(result.messages.is_empty());
}

#[tokio::test]
async fn terminal_usage_replaces_cumulative_values_and_keeps_attempt_identity() {
    let script = vec![
        frame(
            json!({ "choices": [{ "index": 0, "delta": { "content": "ok" } }], "usage": { "prompt_tokens": 3, "completion_tokens": 2 } }),
        ),
        choice(json!({}), Some("stop")),
        frame(
            json!({ "choices": [], "usage": { "prompt_tokens": 5, "completion_tokens": 9, "prompt_tokens_details": { "cached_tokens": 1 } } }),
        ),
        done(),
    ];
    let provider = adapter(FixtureTransport::new([Ok(response(script, false))]));
    let mut run = provider
        .start(provider.prepare(request()).unwrap(), control("usage"))
        .unwrap();
    let mut updates = Vec::new();
    while let Some(update) = run.next().await {
        if let InferenceUpdate::Usage(usage) = update {
            updates.push(usage);
        }
    }
    let result = run.finish().await;
    let output = result
        .usage
        .iter()
        .find(|entry| entry.category == "output_tokens")
        .unwrap();
    assert_eq!(output.quantity, 9);
    assert_eq!(output.revision, 2);
    assert!(output.final_value);
    assert_eq!(output.attempt, AttemptId::new("usage").unwrap());
    assert!(updates.iter().any(|entry| entry.category == "output_tokens"
        && entry.quantity == 2
        && !entry.final_value));
}

#[tokio::test]
async fn first_party_usage_frames_preserve_missing_counts_and_reported_zero() {
    // The first-party codec omits its usage frame when no category is known.
    let no_usage = response(
        vec![choice(json!({"content":"finished"}), Some("stop")), done()],
        false,
    );
    let partial_usage = response(
        vec![
            choice(json!({"content":"finished"}), Some("stop")),
            frame(json!({
                "choices": [],
                "usage": {
                    "completion_tokens": 7,
                    "prompt_tokens_details": { "cached_tokens": 0 }
                }
            })),
            done(),
        ],
        false,
    );
    let provider = adapter(FixtureTransport::new([Ok(no_usage), Ok(partial_usage)]));
    let prepared = provider.prepare(request()).unwrap();
    let first = provider
        .start(prepared.clone(), control("unknown-usage"))
        .unwrap()
        .finish()
        .await;
    assert_eq!(first.status, InferenceStatus::Completed);
    assert!(first.usage.is_empty());

    let second = provider
        .start(prepared, control("partial-usage"))
        .unwrap()
        .finish()
        .await;
    assert_eq!(second.status, InferenceStatus::Completed);
    assert!(
        second
            .usage
            .iter()
            .all(|entry| { entry.attempt.as_str() == "partial-usage" && entry.final_value })
    );
    assert_eq!(
        second
            .usage
            .iter()
            .map(|entry| (entry.category.as_str(), entry.quantity))
            .collect::<Vec<_>>(),
        [("cached_input_tokens", 0), ("output_tokens", 7)]
    );
}

#[tokio::test]
async fn eof_after_finish_reason_keeps_known_usage_and_reports_interruption() {
    let script = vec![
        choice(json!({ "content": "partial" }), Some("stop")),
        frame(json!({ "choices": [], "usage": { "prompt_tokens": 12, "completion_tokens": 1 } })),
    ];
    let result = execute(
        &adapter(FixtureTransport::new([Ok(response(script, false))])),
        request(),
        "eof",
    )
    .await;
    assert_eq!(result.status, InferenceStatus::Interrupted);
    assert_eq!(result.failure.unwrap().code, "missing_terminal_event");
    assert_eq!(
        result.messages[0].content,
        vec![Content::Text("partial".into())]
    );
    assert!(
        result
            .usage
            .iter()
            .any(|entry| entry.category == "input_tokens" && entry.quantity == 12)
    );
    assert_eq!(result.receipt.unwrap().bytes(), b"request_123");
}

#[tokio::test]
async fn finish_reason_distinguishes_refusal_and_output_limit() {
    let transport = FixtureTransport::new([
        Ok(response(
            [
                choice(json!({ "refusal": "Declined" }), Some("stop")),
                done(),
            ],
            false,
        )),
        Ok(response(
            [
                choice(json!({ "content": "partial" }), Some("length")),
                done(),
            ],
            false,
        )),
        Ok(response([done()], false)),
    ]);
    let provider = adapter(transport);
    assert_eq!(
        execute(&provider, request(), "refusal").await.status,
        InferenceStatus::Refused
    );
    assert_eq!(
        execute(&provider, request(), "limit").await.status,
        InferenceStatus::Limited
    );
    let malformed = execute(&provider, request(), "malformed-terminal").await;
    assert_eq!(malformed.status, InferenceStatus::Interrupted);
    assert_eq!(malformed.failure.unwrap().code, "missing_finish_reason");
}

#[tokio::test]
async fn http_errors_are_bounded_and_use_fixed_safe_codes() {
    let mut failure = response(
        [
            br#"{"error":{"code":"insufficient_quota","message":"private-provider-body"}}"#
                .to_vec(),
        ],
        false,
    );
    failure.status = 429;
    failure.retry_after_ms = Some(400);
    let transport = FixtureTransport::new([Ok(failure)]);
    let result = execute(&adapter(transport.clone()), request(), "quota").await;
    assert_eq!(result.status, InferenceStatus::Failed);
    assert!(
        !serde_json::to_string(&result)
            .unwrap()
            .contains("private-provider-body")
    );
    let failure = result.failure.unwrap();
    assert_eq!(failure.kind, FailureKind::Quota);
    assert_eq!(failure.code, "quota_exhausted");
    assert_eq!(failure.retry_after_ms, Some(400));
    assert_eq!(transport.requests.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn only_a_trusted_complete_code_and_type_prove_compatible_admission_rejection() {
    for (opt_in, kind, body_interrupted, status, evidence) in [
        (
            true,
            "rate_limit_error",
            false,
            InferenceStatus::Failed,
            Some(DispatchEvidence::RejectedBeforeExecution),
        ),
        (
            false,
            "rate_limit_error",
            false,
            InferenceStatus::Failed,
            None,
        ),
        (
            true,
            "server_error",
            false,
            InferenceStatus::Interrupted,
            None,
        ),
        (
            true,
            "rate_limit_error",
            true,
            InferenceStatus::Interrupted,
            None,
        ),
    ] {
        let body = serde_json::to_vec(
            &json!({ "error": { "code": "rate_limit_exceeded", "type": kind } }),
        )
        .unwrap();
        let mut reply = response([body.clone()], false);
        reply.status = 429;
        reply.retry_after_ms = Some(1000);
        if body_interrupted {
            reply.body = Box::pin(futures_util::stream::iter([
                Ok(body),
                Err(TransportFailure::Interrupted),
            ]));
        }
        let transport = FixtureTransport::new([Ok(reply)]);
        let mut provider = adapter(transport.clone());
        if opt_in {
            provider = provider.with_admission_rate_limit_evidence();
        }
        let result = execute(&provider, request(), "rate").await;
        assert_eq!(result.status, status);
        let failure = result.failure.unwrap();
        assert_eq!(failure.kind, FailureKind::RateLimit);
        assert_eq!(failure.retry_after_ms, Some(1000));
        assert_eq!(failure.dispatch, evidence);
        assert!(result.messages.is_empty());
        assert!(result.usage.is_empty());
        assert_eq!(transport.requests.lock().unwrap().len(), 1);
    }
}

#[tokio::test]
async fn transport_failure_retains_dispatch_certainty() {
    let transport = FixtureTransport::new([
        Err(TransportFailure::Unavailable),
        Err(TransportFailure::Interrupted),
    ]);
    let provider = adapter(transport);
    assert_eq!(
        execute(&provider, request(), "unavailable").await.status,
        InferenceStatus::Failed
    );
    assert_eq!(
        execute(&provider, request(), "interrupted").await.status,
        InferenceStatus::Interrupted
    );
}

#[tokio::test]
async fn http_failures_distinguish_quota_model_rejections_and_dispatch_uncertainty() {
    use FailureKind::{Authentication, Configuration, ContextLimit, Quota, RateLimit, Transient};
    use InferenceStatus::{Failed, Interrupted, Limited};
    for (status, provider_code, disposition, kind, safe_code) in [
        (
            401,
            "model_not_found",
            Failed,
            Authentication,
            "authentication_required",
        ),
        (
            403,
            "model_not_found",
            Failed,
            Configuration,
            "model_unavailable",
        ),
        (
            404,
            "unknown_route",
            Failed,
            Configuration,
            "provider_request_rejected",
        ),
        (
            400,
            "context_length_exceeded",
            Limited,
            ContextLimit,
            "context_limit",
        ),
        (
            429,
            "credit_balance_exhausted",
            Failed,
            Quota,
            "quota_exhausted",
        ),
        (
            429,
            "organization_spend_limit_exceeded",
            Failed,
            Quota,
            "quota_exhausted",
        ),
        (
            429,
            "project_spend_limit_exceeded",
            Failed,
            Quota,
            "quota_exhausted",
        ),
        (
            429,
            "organization_usage_limit_exceeded",
            Failed,
            Quota,
            "quota_exhausted",
        ),
        (429, "slow_down", Failed, RateLimit, "rate_limit"),
        (
            408,
            "timeout",
            Interrupted,
            Transient,
            "provider_unavailable",
        ),
        (
            504,
            "gateway_timeout",
            Interrupted,
            Transient,
            "provider_unavailable",
        ),
    ] {
        let mut reply = response(
            [serde_json::to_vec(
                &json!({"error":{"code":provider_code,"message":"private diagnostic"}}),
            )
            .unwrap()],
            false,
        );
        reply.status = status;
        reply.request_id = Some("fixture-request".into());
        reply.retry_after_ms = Some(250);
        let transport = FixtureTransport::new([Ok(reply)]);
        let outcome = execute(&adapter(transport.clone()), request(), "http-failure").await;
        assert_eq!(outcome.status, disposition, "{status} {provider_code}");
        assert!(outcome.messages.is_empty());
        assert_eq!(
            outcome.receipt.as_ref().unwrap().bytes(),
            b"fixture-request"
        );
        assert!(
            !serde_json::to_string(&outcome)
                .unwrap()
                .contains("private diagnostic")
        );
        let error = outcome.failure.unwrap();
        assert_eq!(
            (error.kind, error.code.as_str(), error.retry_after_ms),
            (kind, safe_code, Some(250))
        );
        assert_eq!(transport.requests.lock().unwrap().len(), 1);
    }
}

#[tokio::test]
async fn streamed_error_preserves_partial_text_and_only_previously_completed_calls() {
    for (error, kind, code, completed) in [
        (
            json!({"type":"rate_limit_error"}),
            FailureKind::RateLimit,
            "rate_limit",
            false,
        ),
        (
            json!({"code":"invalid_api_key"}),
            FailureKind::Authentication,
            "authentication_required",
            true,
        ),
    ] {
        let mut frames = vec![
            choice(json!({"content":"Visible prefix"}), None),
            choice(
                json!({"tool_calls":[{"index":0,"id":"call","type":"function","function":{"name":"echo","arguments":"{}"}}]}),
                None,
            ),
        ];
        if completed {
            frames.push(choice(json!({}), Some("tool_calls")));
        }
        frames.push(frame(json!({"error":error})));
        let transport = FixtureTransport::new([Ok(response(frames, false))]);
        let outcome = execute(
            &adapter(transport.clone()),
            tool_request(),
            "streamed-error",
        )
        .await;
        assert_eq!(outcome.status, InferenceStatus::Interrupted);
        let content = &outcome.messages[0].content;
        assert_eq!(content[0], Content::Text("Visible prefix".into()));
        assert_eq!(content.len(), 1 + usize::from(completed));
        if completed {
            assert!(matches!(&content[1], Content::ToolCall(call) if call.tool.as_str() == "echo"));
        }
        let error = outcome.failure.unwrap();
        assert_eq!((error.kind, error.code.as_str()), (kind, code));
        assert_eq!(transport.requests.lock().unwrap().len(), 1);
    }
}

#[tokio::test]
async fn event_limit_preserves_valid_prefix_even_within_one_chunk() {
    let mut body = choice(json!({ "content": "prefix" }), None);
    body.extend_from_slice(b"data: ");
    body.extend(vec![b'x'; 300]);
    let provider = configured(
        FixtureTransport::new([Ok(response([body], false))]),
        profile(),
        StreamLimits {
            max_event_bytes: 256,
            ..limits()
        },
    );
    let result = execute(&provider, request(), "oversized-event").await;
    assert_eq!(result.status, InferenceStatus::Limited);
    assert_eq!(result.failure.unwrap().code, "event_byte_limit");
    assert_eq!(
        result.messages[0].content,
        vec![Content::Text("prefix".into())]
    );
}

#[tokio::test]
async fn response_byte_limit_caps_data_across_events() {
    let chunks = (0..100)
        .map(|_| choice(json!({ "content": "x" }), None))
        .collect::<Vec<_>>();
    let provider = configured(
        FixtureTransport::new([Ok(response(chunks, false))]),
        profile(),
        StreamLimits {
            max_response_bytes: 512,
            max_event_bytes: 256,
            max_tool_argument_bytes: 256,
            ..limits()
        },
    );
    let result = execute(&provider, request(), "oversized-response").await;
    assert_eq!(result.status, InferenceStatus::Limited);
    assert_eq!(result.failure.unwrap().code, "response_byte_limit");
}

#[tokio::test]
async fn cancellation_preserves_observed_request_receipt_and_partial_text() {
    let transport = FixtureTransport::new([Ok(response(
        [choice(json!({ "content": "partial" }), None)],
        true,
    ))]);
    let provider = adapter(transport.clone());
    let control = control("cancelled");
    let parent = control.cancellation.clone();
    let mut run = provider
        .start(provider.prepare(request()).unwrap(), control)
        .unwrap();
    assert!(matches!(
        run.next().await,
        Some(InferenceUpdate::TextDelta { .. })
    ));
    parent.cancel();
    let result = run.finish().await;
    assert_eq!(result.status, InferenceStatus::Interrupted);
    assert_eq!(result.failure.unwrap().kind, FailureKind::Cancelled);
    assert_eq!(result.receipt.unwrap().bytes(), b"request_123");
    assert_eq!(
        result.messages[0].content,
        vec![Content::Text("partial".into())]
    );
    assert!(
        transport.requests.lock().unwrap()[0]
            .1
            .cancellation
            .is_cancelled()
    );
}
