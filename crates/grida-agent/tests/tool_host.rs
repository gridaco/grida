//! GRIDA-SEC-004 — endpoint, caller grant and result-correlation fixtures.

use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{OutcomeStatus, ToolArguments};
use agent_kit_core::tools::{
    Inventory, InvocationContext, RecoveryKind, ToolDefinition, ToolOutcome,
};
use agent_kit_core::{
    AttemptId, BindingId, BoxFuture, CancellationToken, Error, ErrorKind, OperationId, Result,
    ToolId,
};
use grida_agent::surface_tools::headless_surface;
use grida_agent::tool_host::{
    CapabilityCall, CapabilityDefinition, CapabilityEffect, CapabilityExecutor, CapabilityReply,
    ToolHost,
};
use serde_json::{Value, json};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};
use tokio::sync::Notify;

fn deadline() -> Instant {
    Instant::now() + Duration::from_secs(2)
}

#[tokio::test]
async fn headless_presentation_has_the_same_result_through_both_adapters() {
    let host = headless_surface().unwrap();
    let id = ToolId::new("surface_open").unwrap();
    let grant = host.grant(&id).unwrap();
    let arguments = json!({"path": "/poster.canvas"});
    let direct = grant
        .invoke(
            1,
            arguments.clone(),
            CancellationToken::new(),
            deadline(),
            8192,
        )
        .await
        .unwrap();
    let mut inventory = Inventory::new();
    inventory.insert(Arc::new(grant)).unwrap();
    let native = inventory
        .snapshot(std::slice::from_ref(&id))
        .unwrap()
        .prepare(
            OperationId::new("presentation").unwrap(),
            &id,
            ToolArguments::Json(arguments),
        )
        .unwrap()
        .invoke(InvocationContext {
            attempt: AttemptId::new("presentation-attempt").unwrap(),
            cancellation: CancellationToken::new(),
            deadline: Some(deadline()),
            max_output_bytes: 8192,
        })
        .await;
    assert_eq!(direct.status, native.status);
    assert_eq!(direct.structured, native.structured);
    assert_eq!(direct.content, native.content);
    assert_ne!(direct.receipt, native.receipt);
    assert_eq!(native.status, OutcomeStatus::Succeeded);
    assert_eq!(
        native.structured,
        Some(json!({"path": "/poster.canvas", "requested": false, "reason": "not_interactive"}))
    );
}

struct Editor {
    started: Notify,
    runs: AtomicUsize,
    behavior: Behavior,
}

enum Behavior {
    WaitForCancellation,
    WrongReply,
    DomainFailure,
}

impl CapabilityExecutor for Editor {
    fn validate(&self, arguments: &Value) -> Result<()> {
        if *arguments != json!({"document": "artwork"}) {
            return Err(Error::new(
                ErrorKind::InvalidInput,
                "invalid_document_argument",
            ));
        }
        Ok(())
    }

    fn invoke(&self, call: CapabilityCall) -> BoxFuture<'_, CapabilityReply> {
        Box::pin(async move {
            self.runs.fetch_add(1, Ordering::Relaxed);
            self.started.notify_one();
            let mut binding = call.binding;
            let mut outcome = ToolOutcome::failed("document_locked");
            outcome.structured = Some(json!({"document": "artwork", "reason": "read_only"}));
            match self.behavior {
                Behavior::WaitForCancellation => {
                    call.cancellation.cancelled().await;
                    outcome.status = OutcomeStatus::Cancelled;
                    outcome.structured = Some(json!({"saved": true}));
                }
                Behavior::WrongReply => {
                    binding.endpoint = BindingId::new("replacement-generation").unwrap();
                }
                Behavior::DomainFailure => {}
            }
            CapabilityReply { binding, outcome }
        })
    }
}

fn editor(behavior: Behavior) -> (ToolHost, ToolId, Arc<Editor>) {
    let id = ToolId::new("document_edit").unwrap();
    let executor = Arc::new(Editor {
        started: Notify::new(),
        runs: AtomicUsize::new(0),
        behavior,
    });
    let host = ToolHost::new([(
        CapabilityDefinition {
            tool: ToolDefinition {
                id: id.clone(),
                version: 1,
                description: "Edit the selected document".into(),
                input: InputFormat::Json(json!({"type":"object"})),
                max_input_bytes: 64,
                max_output_bytes: 4096,
                recovery: RecoveryKind::Unavailable,
            },
            output_schema: json!({"type":"object"}),
            effect: CapabilityEffect::Mutation,
        },
        executor.clone() as Arc<dyn CapabilityExecutor>,
    )])
    .unwrap();
    (host, id, executor)
}

#[tokio::test]
async fn closed_or_revoked_grants_and_bad_arguments_never_dispatch() {
    let (host, id, executor) = editor(Behavior::DomainFailure);
    let grant = host.grant(&id).unwrap();
    let input = json!({"document": "artwork"});
    for (version, arguments, code) in [
        (2, input.clone(), "host_capability_changed"),
        (
            1,
            json!({"document": "artwork", "endpoint": "replacement"}),
            "invalid_document_argument",
        ),
        (
            1,
            json!({"document": "a".repeat(128)}),
            "host_capability_input_limit",
        ),
    ] {
        assert_eq!(
            grant
                .invoke(
                    version,
                    arguments,
                    CancellationToken::new(),
                    deadline(),
                    4096
                )
                .await
                .unwrap_err()
                .code,
            code
        );
    }
    let cancellation = CancellationToken::new();
    cancellation.cancel();
    assert_eq!(
        grant
            .invoke(1, input.clone(), cancellation, deadline(), 4096)
            .await
            .unwrap()
            .status,
        OutcomeStatus::Cancelled
    );
    grant.revoke();
    assert!(grant.describe().is_err());
    let other_grant = host.grant(&id).unwrap();
    drop(host);
    assert_eq!(
        other_grant
            .invoke(1, input, CancellationToken::new(), deadline(), 4096)
            .await
            .unwrap_err()
            .code,
        "tool_endpoint_unavailable"
    );
    assert_eq!(executor.runs.load(Ordering::Relaxed), 0);
}

#[tokio::test]
async fn disconnected_endpoint_never_redirects_an_active_call() {
    let (host, id, executor) = editor(Behavior::WaitForCancellation);
    let (replacement, _, new_executor) = editor(Behavior::DomainFailure);
    assert_ne!(host.endpoint(), replacement.endpoint());
    let grant = host.grant(&id).unwrap();
    let task = tokio::spawn(async move {
        grant
            .invoke(
                1,
                json!({"document": "artwork"}),
                CancellationToken::new(),
                deadline(),
                4096,
            )
            .await
            .unwrap()
    });
    executor.started.notified().await;
    host.close();
    let reply = task.await.unwrap();
    assert_eq!(reply.status, OutcomeStatus::Uncertain);
    let evidence: Value = serde_json::from_slice(reply.receipt.unwrap().bytes()).unwrap();
    assert_eq!(evidence["binding"]["endpoint"], host.endpoint().as_str());
    assert_eq!(evidence["reply_verified"], false);
    assert_eq!(new_executor.runs.load(Ordering::Relaxed), 0);
}

#[tokio::test]
async fn cancellation_reaches_the_owner_and_retains_reported_effects() {
    let (host, id, executor) = editor(Behavior::WaitForCancellation);
    let grant = host.grant(&id).unwrap();
    let cancellation = CancellationToken::new();
    let operation_cancellation = cancellation.clone();
    let task = tokio::spawn(async move {
        grant
            .invoke(
                1,
                json!({"document": "artwork"}),
                operation_cancellation,
                deadline(),
                4096,
            )
            .await
            .unwrap()
    });
    executor.started.notified().await;
    cancellation.cancel();
    let reply = task.await.unwrap();
    assert_eq!(reply.status, OutcomeStatus::Cancelled);
    assert_eq!(reply.structured, Some(json!({"saved": true})));
}

#[tokio::test]
async fn an_unrelated_reply_is_uncertain_and_a_domain_result_is_preserved() {
    for behavior in [Behavior::WrongReply, Behavior::DomainFailure] {
        let mismatch = matches!(behavior, Behavior::WrongReply);
        let (host, id, _) = editor(behavior);
        let reply = host
            .grant(&id)
            .unwrap()
            .invoke(
                1,
                json!({"document": "artwork"}),
                CancellationToken::new(),
                deadline(),
                4096,
            )
            .await
            .unwrap();
        if mismatch {
            assert_eq!(reply.status, OutcomeStatus::Uncertain);
            assert_eq!(reply.structured, None);
        } else {
            assert_eq!(reply.status, OutcomeStatus::Failed);
            assert_eq!(
                reply.structured,
                Some(json!({"document": "artwork", "reason": "read_only"}))
            );
        }
    }
}
