//! Bounded process adapters for the embedded and ACP host modes.

#[cfg(any(target_os = "macos", target_os = "linux"))]
pub mod external;

use crate::acp::{self, ListenOptions};
use crate::host::{
    AcceptedRun, FileUpload, Host, ImageUpload, PromptPart, PromptRequest, RunResult, change_id,
    validate_prompt_parts,
};
use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::{Error, ErrorKind, Result, SessionId};
use grida_agent_master::read_account;
use serde::Serialize;
use serde_json::json;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const MAX_STDIN_BYTES: usize = 512 * 1024;
const STOP_TIMEOUT: Duration = Duration::from_secs(8);
/// The longest deadline a headless run accepts. A run is one turn, and long
/// creative or build work can take an hour or more, so the bound only guards
/// against a forgotten process.
pub const MAX_RUN_TIMEOUT: Duration = Duration::from_secs(4 * 60 * 60);

pub struct RunOptions {
    pub cwd: PathBuf,
    pub session: Option<SessionId>,
    pub prompt: Option<String>,
    pub input_png: Option<PathBuf>,
    pub skills: Vec<crate::skills::SkillReference>,
    pub questions: bool,
    /// The reasoning level for the run's turn. The host falls back to the
    /// model's default when the model does not declare that level.
    pub reasoning: Option<agent_kit_core::inference::ReasoningEffort>,
    pub timeout: Duration,
}

/// ACP session identity still requires an absolute directory. This private,
/// empty identity gives attachment-only work no project directory grant.
pub fn attachment_context(state_dir: &Path) -> Result<PathBuf> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        use std::fs::{self, DirBuilder};
        use std::os::unix::fs::DirBuilderExt;

        let unavailable = || problem(ErrorKind::Unavailable, "attachment_context_unavailable");
        let state = state_dir.canonicalize().map_err(|_| unavailable())?;
        crate::scratch::check_private_directory(&state)?;
        let directory = state.join("attachment-context");
        match DirBuilder::new().mode(0o700).create(&directory) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => return Err(unavailable()),
        }
        crate::scratch::check_private_directory(&directory)?;
        if fs::read_dir(&directory)
            .map_err(|_| unavailable())?
            .next()
            .is_some()
        {
            return Err(problem(ErrorKind::Conflict, "attachment_context_not_empty"));
        }
        Ok(directory)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = state_dir;
        Err(problem(
            ErrorKind::Unsupported,
            "attachment_storage_unsupported",
        ))
    }
}

/// Run one task, write its structured records, and drain the owned host.
pub async fn run(
    host: &Host,
    options: RunOptions,
    signal: impl Future<Output = Result<()>>,
) -> Result<u8> {
    run_with_file(host, options, None, signal).await
}

/// Run a task with one explicitly selected local file, independent of PNG
/// provider input support.
pub async fn run_with_file(
    host: &Host,
    options: RunOptions,
    input_file: Option<PathBuf>,
    signal: impl Future<Output = Result<()>>,
) -> Result<u8> {
    let result = if options.timeout.is_zero() || options.timeout > MAX_RUN_TIMEOUT {
        Err(problem(ErrorKind::InvalidInput, "invalid_run_deadline"))
    } else {
        match host.clone().with_headless_guidance(&options.cwd) {
            Ok(scoped) => run_once(&scoped, options, input_file, signal).await,
            Err(error) => Err(error),
        }
    };
    host.shutdown().await?;
    result
}

/// Serve ACP with process lifetime and host shutdown tied to this invocation.
pub async fn serve(
    host: Arc<Host>,
    listener: Option<ListenOptions>,
    signal: impl Future<Output = Result<()>>,
) -> Result<u8> {
    if let Some(listener) = listener {
        let result = tokio::select! {
            result = acp::serve_websocket(host.clone(), listener) => result.map(|()| 0),
            result = signal => result.map(|()| 130),
        };
        host.shutdown().await?;
        return result;
    }
    serve_stdio(host, None, signal).await
}

pub async fn serve_supervised(
    host: Arc<Host>,
    provider: crate::SupervisedProvider,
    signal: impl Future<Output = Result<()>>,
) -> Result<u8> {
    serve_stdio(host, Some(provider), signal).await
}

async fn serve_stdio(
    host: Arc<Host>,
    provider: Option<crate::SupervisedProvider>,
    signal: impl Future<Output = Result<()>>,
) -> Result<u8> {
    let supervised = provider.is_some();
    let side_chats = Arc::new(crate::host::side_chats::SideChats::default());
    tokio::select! {
        result = acp::serve_stdio_with_side_chats(host.clone(), provider, side_chats.clone()) => match result {
            Ok(()) => {}
            Err(acp::ServeError::Shutdown(error)) => return Err(error),
            Err(acp::ServeError::Protocol(error)) => {
                if !supervised {
                    eprintln!("grida-agent: ACP connection ended: {error}");
                }
                return Err(problem(ErrorKind::Unavailable, "acp_connection_failed"));
            }
        },
        result = signal => {
            let sides = side_chats.close_all().await;
            host.shutdown().await.and(sides)?;
            result?;
            return Ok(130);
        }
    }
    Ok(0)
}

async fn run_once(
    host: &Host,
    options: RunOptions,
    input_file: Option<PathBuf>,
    signal: impl Future<Output = Result<()>>,
) -> Result<u8> {
    let deadline = tokio::time::Instant::now() + options.timeout;
    tokio::pin!(signal);
    let mut accepted = tokio::select! {
        result = tokio::time::timeout_at(deadline, admit_run(host, options, input_file)) => result
            .map_err(|_| problem(ErrorKind::Unavailable, "run_deadline_reached"))??,
        result = &mut signal => {
            result?;
            return Ok(130);
        }
    };
    write_record(&json!({
        "schema_version": 1,
        "kind": "accepted",
        "session_id": accepted.session,
        "turn_id": accepted.turn,
        "input_id": accepted.input,
    }))
    .await?;
    let result = tokio::select! {
        result = &mut accepted.completion => result,
        result = &mut signal => {
            result?;
            tokio::time::timeout(STOP_TIMEOUT, async {
                host.cancel(accepted.session.clone(), accepted.turn.clone()).await?;
                Ok::<_, Error>((&mut accepted.completion).await)
            })
            .await
            .map_err(|_| problem(ErrorKind::Uncertain, "run_stop_unverified"))??
        }
        _ = tokio::time::sleep_until(deadline) => {
            host.shutdown().await?;
            accepted.completion.await
        }
    }
    .map_err(|_| problem(ErrorKind::Uncertain, "run_worker_disconnected"))?;
    let (disposition, account, code, interactions, reason) = match result {
        Ok(RunResult::Settled(outcome)) => {
            let (disposition, code) = settled_status(outcome.status);
            let account = outcome.account.as_ref().map(read_account).transpose()?;
            (disposition, account, code, None, None)
        }
        Ok(RunResult::Suspended) => ("suspended", None, 4, None, None),
        Ok(RunResult::InputRequired(pending)) => ("input_required", None, 6, Some(pending), None),
        Err(error) if error.kind == ErrorKind::Uncertain => {
            ("uncertain", None, 5, None, Some(error.code))
        }
        Err(error) => return Err(error),
    };
    let mut finished = json!({
        "schema_version": 1,
        "kind": "finished",
        "session_id": accepted.session,
        "turn_id": accepted.turn,
        "input_id": accepted.input,
        "disposition": disposition,
        "account": account,
    });
    if account.is_some()
        && let Some(billing) = host
            .headless_gateway_billing(accepted.session, accepted.turn)
            .await
    {
        finished["gateway_billing"] = json!(billing);
    }
    if let Some(pending) = interactions {
        if !pending.questions.questions.is_empty() {
            finished["questions"] = json!(pending.questions.questions);
        }
        if !pending.approvals.is_empty() {
            finished["approvals"] = json!(pending.approvals);
        }
    }
    if let Some(reason) = reason {
        finished["reason"] = json!(reason);
    }
    write_record(&finished).await?;
    Ok(code)
}

fn settled_status(status: OutcomeStatus) -> (&'static str, u8) {
    match status {
        OutcomeStatus::Succeeded => ("succeeded", 0),
        OutcomeStatus::Failed => ("failed", 1),
        OutcomeStatus::Cancelled => ("cancelled", 130),
        OutcomeStatus::Uncertain => ("uncertain", 5),
    }
}

async fn admit_run(
    host: &Host,
    options: RunOptions,
    input_file: Option<PathBuf>,
) -> Result<AcceptedRun> {
    let prompt = match options.prompt {
        Some(prompt) => prompt,
        None => read_prompt().await?,
    };
    if prompt.trim().is_empty() {
        return Err(problem(ErrorKind::InvalidInput, "empty_prompt"));
    }
    let mut parts = vec![PromptPart::Text { text: prompt }];
    if let Some(path) = input_file {
        if options.input_png.is_some() {
            return Err(problem(
                ErrorKind::InvalidInput,
                "file_attachment_count_limit",
            ));
        }
        let file = tokio::task::spawn_blocking(move || FileUpload::read_selected_file(&path))
            .await
            .map_err(|_| problem(ErrorKind::Unavailable, "selected_file_unavailable"))??;
        parts.push(PromptPart::File { file });
    }
    if let Some(path) = options.input_png {
        if !host.accepts_images() {
            return Err(problem(ErrorKind::Unsupported, "image_input_unavailable"));
        }
        let image = tokio::task::spawn_blocking(move || ImageUpload::read_selected_png(&path))
            .await
            .map_err(|_| problem(ErrorKind::Unavailable, "selected_image_unavailable"))??;
        parts.push(PromptPart::Image { image });
    }
    let session = if let Some(session) = options.session {
        host.validate_session_workspace(session.clone(), options.cwd)
            .await?;
        session
    } else {
        host.new_session(options.cwd).await?
    };
    parts.extend(
        options
            .skills
            .into_iter()
            .map(|reference| PromptPart::Skill { reference }),
    );
    host.start_prompt(PromptRequest {
        id: change_id()?,
        session,
        parts,
        questions: options.questions,
        operating_regime: None,
        effort: None,
        reasoning: options.reasoning,
    })
    .await
}

pub async fn read_prompt() -> Result<String> {
    let mut bytes = Vec::new();
    tokio::io::stdin()
        .take(MAX_STDIN_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|_| problem(ErrorKind::Unavailable, "prompt_read_failed"))?;
    if bytes.len() > MAX_STDIN_BYTES {
        return Err(problem(ErrorKind::LimitExceeded, "prompt_too_large"));
    }
    String::from_utf8(bytes).map_err(|_| problem(ErrorKind::InvalidInput, "prompt_must_be_utf8"))
}

/// Validate a supplied one-shot prompt before acquiring provider authority.
pub fn validate_prompt(prompt: &str) -> Result<()> {
    if prompt.len() > MAX_STDIN_BYTES {
        return Err(problem(ErrorKind::LimitExceeded, "prompt_too_large"));
    }
    if prompt.trim().is_empty() {
        return Err(problem(ErrorKind::InvalidInput, "empty_prompt"));
    }
    validate_prompt_parts(&[PromptPart::Text {
        text: prompt.into(),
    }])
}

pub async fn write_record(record: &impl Serialize) -> Result<()> {
    let mut bytes = serde_json::to_vec(record)
        .map_err(|_| problem(ErrorKind::InvalidState, "output_encoding_failed"))?;
    bytes.push(b'\n');
    let mut stdout = tokio::io::stdout();
    let result = tokio::time::timeout(Duration::from_secs(5), async {
        stdout.write_all(&bytes).await?;
        stdout.flush().await
    })
    .await;
    match result {
        Ok(Ok(())) => Ok(()),
        _ => Err(problem(ErrorKind::Unavailable, "output_delivery_failed")),
    }
}

pub async fn shutdown_signal() -> Result<()> {
    let unavailable = || problem(ErrorKind::Unavailable, "signal_listener_unavailable");
    #[cfg(unix)]
    {
        let mut termination =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .map_err(|_| unavailable())?;
        tokio::select! {
            _ = termination.recv() => Ok(()),
            interrupt = tokio::signal::ctrl_c() => interrupt.map_err(|_| unavailable()),
        }
    }
    #[cfg(not(unix))]
    tokio::signal::ctrl_c().await.map_err(|_| unavailable())
}

fn problem(kind: ErrorKind, code: &'static str) -> Error {
    Error::new(kind, code)
}
