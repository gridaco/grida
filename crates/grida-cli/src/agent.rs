// GRIDA-SEC-006 / GRIDA-SEC-015 — native account authority stays with auth.
// GRIDA-GG: provider — invocation-owned chat authority with scoped renewal.

use crate::error::{Error, Result};
use crate::{AgentAction, AgentCommand, AgentRunArgs, ExternalAgentCommand, account, host, http};
use agent_kit_core::inference::RequestControl;
use agent_kit_core::{BoxFuture, Error as CoreError, ErrorKind, Result as CoreResult};
use agent_kit_providers::{
    StreamingTransport, TerminalReceiptDecoder, TransportFailure, TransportRequest,
    TransportResponse,
};
use grida_agent::gg::{GgConnection, GgGrantRenewal};
use grida_agent::host::{GgOptions, Host};
use grida_agent::process::{self, RunOptions};
use grida_auth::{AuthClient, GgGrant, GgGrantScope};
use serde_json::Value;
use std::num::NonZeroU64;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::Instant;
use tokio_util::sync::CancellationToken;

struct GgTransport {
    connection: Arc<GgConnection>,
    http: http::Transport,
}

struct Renewal(Arc<AuthClient>);

impl GgGrantRenewal for Renewal {
    fn renew(
        &self,
        scope: GgGrantScope,
        closing: CancellationToken,
    ) -> BoxFuture<'_, CoreResult<GgGrant>> {
        let client = Arc::clone(&self.0);
        Box::pin(async move {
            tokio::task::spawn_blocking(move || {
                if closing.is_cancelled() {
                    return Err(CoreError::new(
                        ErrorKind::Unavailable,
                        "gg_authority_closed",
                    ));
                }
                client.renew_gg(&scope).map_err(|error| {
                    let kind = if error.code() == "gg_scope_changed" {
                        ErrorKind::Conflict
                    } else {
                        ErrorKind::Unavailable
                    };
                    CoreError::new(kind, error.code())
                })
            })
            .await
            .map_err(|_| CoreError::new(ErrorKind::Uncertain, "gg_renewal_cleanup_unverified"))?
        })
    }
}

impl StreamingTransport for GgTransport {
    fn send(
        &self,
        request: TransportRequest,
        control: RequestControl,
    ) -> BoxFuture<'_, std::result::Result<TransportResponse, TransportFailure>> {
        Box::pin(async move {
            let request = self
                .connection
                .chat_request(request)
                .map_err(|_| TransportFailure::Unavailable)?;
            self.http.stream_gg_chat(request, control).await
        })
    }

    fn terminal_receipt_decoder(&self) -> Option<Arc<TerminalReceiptDecoder>> {
        Some(self.connection.terminal_receipt_decoder())
    }
}

pub async fn dispatch(command: AgentCommand) -> Result<u8> {
    let signal = process::shutdown_signal();
    tokio::pin!(signal);
    let run = match command.action {
        AgentAction::Run(args) => {
            let AgentRunArgs {
                cwd,
                session,
                prompt,
                initial_title,
                input_png,
                input_file,
                skills,
                questions,
                deadline_ms,
            } = *args;
            let cwd = cwd
                .canonicalize()
                .ok()
                .filter(|cwd| cwd.is_dir())
                .ok_or_else(|| {
                    Error::new(
                        "workspace_unavailable",
                        "The project directory is unavailable.",
                    )
                })?;
            let prompt = match prompt {
                Some(prompt) => prompt,
                None => tokio::select! {
                    biased;
                    result = &mut signal => {
                        result.map_err(failure)?;
                        return Ok(130);
                    }
                    result = tokio::time::timeout(Duration::from_secs(30), process::read_prompt()) => {
                        result.map_err(|_| Error::new("prompt_deadline_reached", "Send the prompt and close stdin."))?.map_err(failure)?
                    }
                },
            };
            process::validate_prompt(&prompt).map_err(failure)?;
            Some((
                RunOptions {
                    cwd,
                    session,
                    prompt: Some(prompt),
                    input_png,
                    skills,
                    questions,
                    reasoning: None,
                    timeout: Duration::from_millis(deadline_ms),
                },
                input_file,
                initial_title,
            ))
        }
        AgentAction::ServeStdio => None,
    };

    let cancel = CancellationToken::new();
    let grant = account::with_gg(
        host::environment(),
        command.selector,
        cancel.clone(),
        |client, grant| {
            GgConnection::from_renewable_grant(grant, Arc::new(Renewal(Arc::clone(client))))
                .map_err(|_| grida_auth::Error::new("gg_handoff_failed"))
        },
    );
    tokio::pin!(grant);
    let connection = Arc::new(tokio::select! {
        biased;
        result = &mut signal => {
            cancel.cancel();
            let _ = grant.await;
            result.map_err(failure)?;
            return Ok(130);
        }
        connection = &mut grant => connection?,
    });
    let api_origin = connection.api_origin();
    let http = http::Transport::new(Some(&api_origin)).map_err(|_| {
        Error::new(
            "gg_transport_unavailable",
            "Gateway chat transport is unavailable.",
        )
    })?;
    let context_window = tokio::select! {
        biased;
        result = &mut signal => {
            result.map_err(failure)?;
            return Ok(130);
        }
        window = gateway_context_window(&http, &api_origin, command.model.as_str(), &cancel) => window,
    };
    let transport = Arc::new(GgTransport {
        connection: connection.clone(),
        http,
    });
    let host = Host::open_gg(
        &command.state_dir,
        GgOptions {
            model: command.model,
            max_output_tokens: command.max_output_tokens,
        },
        connection,
        transport,
    )
    .map_err(failure)?;
    let host = Arc::new(match context_window {
        Some(window) => host.with_model_context_window(window).map_err(failure)?,
        None => host,
    });
    if let Some((run, input_file, initial_title)) = run {
        process::run_with_input(&host, run, input_file, initial_title, signal)
            .await
            .map_err(failure)
    } else {
        process::serve(host, None, signal).await.map_err(failure)
    }
}

async fn gateway_context_window(
    transport: &http::Transport,
    api_origin: &str,
    model: &str,
    cancel: &CancellationToken,
) -> Option<NonZeroU64> {
    let origin = if api_origin == http::LOCAL_GG {
        http::LOCAL_GG
    } else {
        "https://gateway.grida.ai"
    };
    let mut request = http::Request::new(::http::Method::GET, format!("{origin}/v1/models"), "");
    request.headers.insert(
        "accept",
        ::http::HeaderValue::from_static("application/json"),
    );
    request.deadline = Some(Instant::now() + Duration::from_secs(3));
    request.max_response_bytes = 2 * 1024 * 1024;
    let response = transport
        .send(http::Lane::Discovery, request, cancel)
        .await
        .ok()?;
    if response.status != 200 {
        return None;
    }
    let catalogue = serde_json::from_slice(&response.body).ok()?;
    model_context_window(&catalogue, model)
}

fn model_context_window(catalogue: &Value, model: &str) -> Option<NonZeroU64> {
    if catalogue["object"] != "list" {
        return None;
    }
    let models = catalogue["data"]
        .as_array()
        .filter(|models| models.len() <= 1024)?;
    let mut entries = models.iter().filter(|entry| entry["id"] == model);
    let entry = entries.next()?;
    if entries.next().is_some()
        || entry["object"] != "model"
        || !entry["gg"]["interfaces"]
            .as_array()?
            .iter()
            .any(|interface| interface == "chat.completions")
    {
        return None;
    }
    entry["gg"]["limits"]["context_tokens"]
        .as_u64()
        .filter(|capacity| *capacity <= 9_007_199_254_740_991)
        .and_then(NonZeroU64::new)
}

pub async fn dispatch_external(command: ExternalAgentCommand) -> Result<u8> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        process::external::run(
            process::external::RunOptions {
                state_directory: command.state_dir,
                profile: command.profile,
                prompt: command.prompt,
                timeout: Duration::from_millis(command.deadline_ms),
            },
            process::shutdown_signal(),
        )
        .await
        .map_err(failure)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = command;
        Err(Error::new(
            "external_acp_platform_unsupported",
            "Confined external ACP peers are available on macOS and Linux.",
        ))
    }
}

fn failure(error: agent_kit_core::Error) -> Error {
    if error.code.starts_with("config_")
        && let Ok(directory) = grida_agent::configuration::global_directory()
    {
        return Error::new(
            &error.code,
            format!(
                "Check the Grida agent configuration at {:?}.",
                directory.join("config.toml")
            ),
        );
    }
    let message = match error.code.as_str() {
        "config_home_must_be_absolute" => "Set GRIDA_HOME to an absolute directory path.",
        "config_home_unavailable" => {
            "Set GRIDA_HOME to a directory for the Grida agent configuration."
        }
        "empty_prompt" => "Provide a nonempty prompt with --prompt or stdin.",
        "prompt_too_large" => "The prompt is larger than the supported limit.",
        "gg_scope_changed" => "Use the Grida account and organization that opened this host.",
        "external_acp_profile_invalid" | "permission_profile_invalid" => {
            "Use a private profile with the exact reviewed peer and sandbox paths."
        }
        "session_execution_configuration_changed" => {
            "Reopen with the original execution settings to resolve work retained by this older host."
        }
        "session_active_route_changed" => {
            "Resume or stop the accepted turn using its captured connection before selecting another."
        }
        "session_queued_route_changed" => {
            "Run or withdraw the queued input using its captured connection before selecting another."
        }
        "session_goal_route_changed" => {
            "Resolve or clear the Goal under its captured connection before selecting another."
        }
        "session_delegated_route_changed" => {
            "Use the parent task's captured connection for delegated work."
        }
        _ => "Grida could not complete this agent command.",
    };
    let mut failure = Error::new(&error.code, message);
    if error.kind == ErrorKind::Uncertain {
        failure.exit = 5;
    }
    failure
}

#[cfg(test)]
mod tests {
    use super::model_context_window;
    use serde_json::json;

    #[test]
    fn discovers_only_the_selected_chat_models_capacity() {
        let response = |context| {
            json!({
                "object": "list",
                "data": [
                    {"object":"model","id":"example/neighbor","gg":{
                        "interfaces":["chat.completions"],
                        "limits":{"context_tokens":16_384},
                    }},
                    {"object":"model","id":"example/chat","gg":{
                        "interfaces":["chat.completions"],
                        "limits":{"context_tokens":context}
                    }},
                    {"object":"model","id":"example/media","gg":{
                        "interfaces":["images.generations"],
                        "limits":{"context_tokens":32_768},
                    }},
                ],
            })
        };
        assert_eq!(
            model_context_window(&response(json!(131_072)), "example/chat")
                .unwrap()
                .get(),
            131_072
        );
        for model in ["example/unknown", "example/media", "chat"] {
            assert!(model_context_window(&response(json!(131_072)), model).is_none());
        }
        for context in [
            json!(0),
            json!(1.5),
            json!(9_007_199_254_740_992_u64),
            json!(null),
        ] {
            assert!(model_context_window(&response(context), "example/chat").is_none());
        }
    }
}
