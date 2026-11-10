// GRIDA-SEC-006 / GRIDA-SEC-015 — native account authority stays with auth.
// GRIDA-GG: provider — invocation-owned chat authority with scoped renewal.

use crate::error::{Error, Result};
use crate::{AgentAction, AgentCommand, ExternalAgentCommand, account, host, http};
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
use std::sync::Arc;
use std::time::Duration;
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
        AgentAction::Run {
            cwd,
            session,
            prompt,
            skills,
            questions,
            deadline_ms,
        } => {
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
            Some(RunOptions {
                cwd,
                session,
                prompt: Some(prompt),
                input_png: None,
                skills,
                questions,
                timeout: Duration::from_millis(deadline_ms),
            })
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
    let http = http::Transport::new(Some(&connection.api_origin())).map_err(|_| {
        Error::new(
            "gg_transport_unavailable",
            "Gateway chat transport is unavailable.",
        )
    })?;
    let transport = Arc::new(GgTransport {
        connection: connection.clone(),
        http,
    });
    let host = Arc::new(
        Host::open_gg(
            &command.state_dir,
            GgOptions {
                model: command.model,
                max_output_tokens: command.max_output_tokens,
            },
            connection,
            transport,
        )
        .map_err(failure)?,
    );
    if let Some(run) = run {
        process::run(&host, run, signal).await.map_err(failure)
    } else {
        process::serve(host, None, signal).await.map_err(failure)
    }
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
    let message = match error.code.as_str() {
        "empty_prompt" => "Provide a nonempty prompt with --prompt or stdin.",
        "prompt_too_large" => "The prompt is larger than the supported limit.",
        "gg_scope_changed" => "Use the Grida account and organization that opened this host.",
        "external_acp_profile_invalid" | "permission_profile_invalid" => {
            "Use a private profile with the exact reviewed peer and sandbox paths."
        }
        "session_execution_configuration_changed" => {
            "Select the same provider, model, account, and organization as the saved chat."
        }
        _ => "Grida could not complete this agent command.",
    };
    let mut failure = Error::new(&error.code, message);
    if error.kind == ErrorKind::Uncertain {
        failure.exit = 5;
    }
    failure
}
