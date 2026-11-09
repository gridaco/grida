use agent_kit_core::messages::OutcomeStatus;
use agent_kit_core::{Error, ErrorKind, ModelId, Result, SessionId};
use clap::{Arg, ArgAction, ArgGroup, ArgMatches, Command, value_parser};
use grida_agent::host::{Host, PromptPart, PromptRequest, RunResult, change_id};
use grida_agent::{CompatibleOutputLimitField, ProviderOptions, ProviderProtocol, acp};
use grida_agent_master::read_account;
use serde::Serialize;
use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const MAX_STDIN_BYTES: usize = 512 * 1024;
const DEFAULT_RUN_TIMEOUT_MS: u64 = 120_000;
const MAX_RUN_TIMEOUT_MS: u64 = 600_000;
const STOP_TIMEOUT: Duration = Duration::from_secs(8);

fn main() -> ExitCode {
    let matches = command().get_matches();
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(_) => {
            eprintln!("grida-agent: async_runtime_unavailable");
            return ExitCode::FAILURE;
        }
    };
    let result = runtime.block_on(dispatch(matches));
    // A stalled stdio pipe can retain a Tokio blocking I/O thread. The host
    // has its own verified shutdown deadline before this runtime is discarded.
    runtime.shutdown_timeout(Duration::from_millis(250));
    match result {
        Ok(code) => ExitCode::from(code),
        Err(error) => {
            eprintln!("grida-agent: {}", error.code);
            ExitCode::from(if error.kind == ErrorKind::Uncertain {
                5
            } else {
                1
            })
        }
    }
}

fn command() -> Command {
    Command::new("grida-agent")
        .version(env!("CARGO_PKG_VERSION"))
        .about("Native Grida Agent host")
        .subcommand_required(true)
        .subcommand(launch(
            Command::new("run")
                .about("Run one prompt without interactive UI")
                .arg(
                    Arg::new("cwd")
                        .long("cwd")
                        .value_name("DIRECTORY")
                        .value_parser(value_parser!(PathBuf))
                        .required(true),
                )
                .arg(Arg::new("session").long("session").value_name("SESSION_ID"))
                .arg(
                    Arg::new("questions")
                        .long("questions")
                        .action(ArgAction::SetTrue)
                        .help("Allow questions and exit with an identified input-required result."),
                )
                .arg(
                    Arg::new("prompt")
                        .long("prompt")
                        .value_name("TEXT")
                        .help("Prompt text. Reads bounded UTF-8 from stdin when omitted."),
                )
                .arg(
                    Arg::new("deadline-ms")
                        .long("deadline-ms")
                        .value_name("MILLISECONDS")
                        .value_parser(value_parser!(u64).range(1..=MAX_RUN_TIMEOUT_MS))
                        .default_value("120000"),
                ),
        ))
        .subcommand(launch(
            Command::new("serve")
                .about("Serve stable Agent Client Protocol")
                .arg(Arg::new("stdio").long("stdio").action(ArgAction::SetTrue))
                .arg(
                    Arg::new("listen")
                        .long("listen")
                        .value_name("LOOPBACK_WS_URL")
                        .requires("server-token-env"),
                )
                .arg(
                    Arg::new("server-token-env")
                        .long("server-token-env")
                        .value_name("ENVIRONMENT_VARIABLE")
                        .requires("listen"),
                )
                .group(
                    ArgGroup::new("transport")
                        .args(["stdio", "listen"])
                        .required(true),
                ),
        ))
        .subcommand(
            Command::new("inspect")
                .about("Read a persisted session without running a prompt")
                .arg(state_dir())
                .arg(Arg::new("session").value_name("SESSION_ID").required(true)),
        )
}

fn state_dir() -> Arg {
    Arg::new("state-dir")
        .long("state-dir")
        .value_name("DIRECTORY")
        .value_parser(value_parser!(PathBuf))
        .required(true)
}

fn launch(command: Command) -> Command {
    command
        .arg(state_dir())
        .arg(
            Arg::new("provider")
                .long("provider")
                .value_name("PROTOCOL")
                .value_parser(["openai-compatible", "anthropic", "gemini"])
                .default_value("openai-compatible"),
        )
        .arg(
            Arg::new("endpoint")
                .long("endpoint")
                .value_name("BASE_URL")
                .help("Explicit provider HTTPS base URL, or loopback HTTP for local providers")
                .required(true),
        )
        .arg(
            Arg::new("model")
                .long("model")
                .value_name("ID")
                .required(true),
        )
        .arg(
            Arg::new("credential-env")
                .long("credential-env")
                .value_name("ENVIRONMENT_VARIABLE")
                .help("Read the provider credential from this host environment variable")
                .conflicts_with("credential-home"),
        )
        .arg(
            Arg::new("credential-home")
                .long("credential-home")
                .value_name("DIRECTORY")
                .value_parser(value_parser!(PathBuf))
                .help("Read the selected vendor's stored key from an explicit Grida home"),
        )
        .arg(
            Arg::new("compatible-output-limit-field")
                .long("compatible-output-limit-field")
                .value_parser(["max-completion-tokens", "max-tokens"])
                .help("Select the output-limit field for an OpenAI-compatible endpoint"),
        )
        .arg(
            Arg::new("max-output-tokens")
                .long("max-output-tokens")
                .value_name("TOKENS")
                .value_parser(value_parser!(u64).range(1..=65_536))
                .default_value("4096"),
        )
}

async fn dispatch(matches: ArgMatches) -> Result<u8> {
    let (name, args) = matches.subcommand().expect("required subcommand");
    let state_dir = args
        .get_one::<PathBuf>("state-dir")
        .expect("required state dir");
    if name == "inspect" {
        let host = Host::open(state_dir, None)?;
        let id = SessionId::new(args.get_one::<String>("session").expect("required session"))?;
        let view = host.inspect(id).await?;
        write_record(&json!({
            "schema_version": 1,
            "kind": "session",
            "session_id": view.session,
            "revision": view.revision,
            "admission_paused": view.admission_paused,
            "current": view.current,
            "latest": view.latest,
        }))
        .await?;
        return Ok(0);
    }
    let provider = ProviderOptions {
        compatible_output_limit_field: args.get_one::<String>("compatible-output-limit-field").map(
            |value| match value.as_str() {
                "max-completion-tokens" => CompatibleOutputLimitField::MaxCompletionTokens,
                "max-tokens" => CompatibleOutputLimitField::MaxTokens,
                _ => unreachable!("validated compatible output-limit field"),
            },
        ),
        protocol: args
            .get_one::<String>("provider")
            .expect("provider default")
            .parse::<ProviderProtocol>()?,
        credential_home: args.get_one::<PathBuf>("credential-home").cloned(),
        endpoint: args
            .get_one::<String>("endpoint")
            .expect("required endpoint")
            .clone(),
        model: ModelId::new(args.get_one::<String>("model").expect("required model"))?,
        credential_env: args.get_one::<String>("credential-env").cloned(),
        max_output_tokens: *args
            .get_one::<u64>("max-output-tokens")
            .expect("output default"),
    };
    let listener = if name == "serve" {
        args.get_one::<String>("listen")
            .map(|address| {
                let token_env = args
                    .get_one::<String>("server-token-env")
                    .expect("required by listen");
                if provider.credential_env.as_deref() == Some(token_env.as_str()) {
                    return Err(problem(
                        ErrorKind::InvalidInput,
                        "server_token_requires_separate_environment",
                    ));
                }
                acp::ListenOptions::from_environment(address, token_env)
            })
            .transpose()?
    } else {
        None
    };
    let host = Arc::new(Host::open(state_dir, Some(provider))?);
    if let Some(listener) = listener {
        let result = tokio::select! {
            result = acp::serve_websocket(host.clone(), listener) => result.map(|()| 0),
            result = shutdown_signal() => result.map(|()| 130),
        };
        host.shutdown().await?;
        return result;
    }
    if name == "serve" {
        tokio::select! {
            result = acp::serve_stdio(host.clone()) => match result {
                Ok(()) => {}
                Err(acp::ServeError::Shutdown(error)) => return Err(error),
                Err(acp::ServeError::Protocol(error)) => {
                    eprintln!("grida-agent: ACP connection ended: {error}");
                    return Err(problem(ErrorKind::Unavailable, "acp_connection_failed"));
                }
            },
            result = shutdown_signal() => {
                result?;
                host.shutdown().await?;
                return Ok(130);
            }
        }
        return Ok(0);
    }
    let deadline = Duration::from_millis(
        args.get_one::<u64>("deadline-ms")
            .copied()
            .unwrap_or(DEFAULT_RUN_TIMEOUT_MS),
    );
    let result = run(&host, args, deadline).await;
    host.shutdown().await?;
    result
}

async fn run(host: &Host, args: &ArgMatches, timeout: Duration) -> Result<u8> {
    let deadline = tokio::time::Instant::now() + timeout;
    let signal = shutdown_signal();
    tokio::pin!(signal);
    let mut accepted = tokio::select! {
        result = tokio::time::timeout_at(deadline, admit_run(host, args)) => result
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
    .map_err(|_| problem(ErrorKind::Uncertain, "run_worker_disconnected"))??;
    let (disposition, account, code, questions) = match result {
        RunResult::Settled(outcome) => {
            let (disposition, code) = match outcome.status {
                OutcomeStatus::Succeeded => ("succeeded", 0),
                OutcomeStatus::Failed => ("failed", 1),
                OutcomeStatus::Cancelled => ("cancelled", 130),
                OutcomeStatus::Uncertain => ("uncertain", 5),
            };
            let account = outcome.account.as_ref().map(read_account).transpose()?;
            (disposition, account, code, None)
        }
        RunResult::Suspended => ("suspended", None, 4, None),
        RunResult::InputRequired(pending) => ("input_required", None, 6, Some(pending.questions)),
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
    if let Some(questions) = questions {
        finished["questions"] = json!(questions);
    }
    write_record(&finished).await?;
    Ok(code)
}

async fn admit_run(host: &Host, args: &ArgMatches) -> Result<grida_agent::host::AcceptedRun> {
    let cwd = args.get_one::<PathBuf>("cwd").expect("required cwd");
    let prompt = match args.get_one::<String>("prompt") {
        Some(prompt) => prompt.clone(),
        None => read_prompt().await?,
    };
    if prompt.trim().is_empty() {
        return Err(problem(ErrorKind::InvalidInput, "empty_prompt"));
    }
    let session = selected_session(host, cwd, args.get_one::<String>("session")).await?;
    host.start_prompt(PromptRequest {
        id: change_id()?,
        session,
        parts: vec![PromptPart::Text { text: prompt }],
        questions: args.get_flag("questions"),
    })
    .await
}

async fn selected_session(host: &Host, cwd: &Path, id: Option<&String>) -> Result<SessionId> {
    if let Some(id) = id {
        let session = SessionId::new(id)?;
        host.load_session(session.clone(), cwd.into()).await?;
        Ok(session)
    } else {
        host.new_session(cwd.into()).await
    }
}

async fn read_prompt() -> Result<String> {
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

async fn write_record(record: &impl Serialize) -> Result<()> {
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

async fn shutdown_signal() -> Result<()> {
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
