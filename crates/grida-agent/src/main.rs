use agent_kit_core::{Error, ErrorKind, ModelId, Result, SessionId};
use clap::{Arg, ArgAction, ArgGroup, ArgMatches, Command, value_parser};
use grida_agent::host::{GgOptions, Host};
use grida_agent::process::{self, RunOptions};
use grida_agent::{CompatibleOutputLimitField, ProviderOptions, ProviderProtocol, acp, mcp};
use serde_json::json;
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

const DEFAULT_RUN_TIMEOUT_MS: u64 = 120_000;
const MAX_RUN_TIMEOUT_MS: u64 = 600_000;

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
                    Arg::new("skill")
                        .long("skill")
                        .value_name("NAME")
                        .action(ArgAction::Append)
                        .help(
                            "Select a named skill for this prompt. Repeat for additional skills.",
                        ),
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
                    Arg::new("supervised-provider")
                        .long("supervised-provider")
                        .requires("stdio")
                        .action(ArgAction::SetTrue),
                )
                .arg(
                    Arg::new("supervised-gateway-scope")
                        .long("supervised-gateway-scope")
                        .value_name("SCOPE")
                        .requires("supervised-provider")
                        .conflicts_with_all([
                            "credential-env",
                            "credential-home",
                            "compatible-output-limit-field",
                        ])
                        .hide(true),
                )
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
            Command::new("serve-mcp")
                .about("Serve reviewed Grida tools without starting a model session")
                .arg(
                    Arg::new("listen")
                        .long("listen")
                        .value_name("LOOPBACK_MCP_URL")
                        .required(true),
                )
                .arg(
                    Arg::new("server-token-env")
                        .long("server-token-env")
                        .value_name("ENVIRONMENT_VARIABLE")
                        .required(true),
                ),
        )
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
            Arg::new("require-completion-text")
                .long("require-completion-text")
                .action(ArgAction::SetTrue)
                .help("Require answer text before completing newly accepted work"),
        )
        .arg(
            Arg::new("permission-profile")
                .long("permission-profile")
                .value_name("PRIVATE_JSON")
                .value_parser(value_parser!(PathBuf))
                .help("Trusted launch profile for explicitly selected workspace roots"),
        )
        .arg(
            Arg::new("provider")
                .long("provider")
                .value_name("PROTOCOL")
                .value_parser(["openai-compatible", "responses", "anthropic", "gemini"])
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
    if name == "serve-mcp" {
        let options = mcp::ListenOptions::from_environment(
            args.get_one::<String>("listen")
                .expect("required listen address"),
            args.get_one::<String>("server-token-env")
                .expect("required token environment"),
        )?;
        mcp::serve_headless(options, process::shutdown_signal()).await?;
        return Ok(0);
    }
    let state_dir = args
        .get_one::<PathBuf>("state-dir")
        .expect("required state dir");
    if name == "inspect" {
        let host = Host::open(state_dir, None)?;
        let id = SessionId::new(args.get_one::<String>("session").expect("required session"))?;
        let view = host.inspect(id).await?;
        process::write_record(&json!({
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
    let permissions = args
        .get_one::<PathBuf>("permission-profile")
        .map(|path| {
            grida_agent::launch_permissions::load_permission_profile(
                path,
                state_dir,
                provider.credential_home.as_deref(),
            )
        })
        .transpose()?;
    let supervisor = (name == "serve" && args.get_flag("supervised-provider"))
        .then(grida_agent::SupervisedProvider::default);
    let gateway_scope = if name == "serve" {
        args.get_one::<String>("supervised-gateway-scope")
    } else {
        None
    };
    let host = match (&supervisor, gateway_scope) {
        (Some(supervisor), Some(scope)) => {
            if provider.protocol != ProviderProtocol::OpenAiCompatible {
                return Err(problem(ErrorKind::InvalidInput, "gg_protocol_invalid"));
            }
            Host::open_supervised_gateway(
                state_dir,
                GgOptions {
                    model: provider.model,
                    max_output_tokens: provider.max_output_tokens,
                },
                &provider.endpoint,
                scope,
                supervisor.clone(),
            )?
        }
        (Some(supervisor), None) => Host::open_supervised(state_dir, provider, supervisor.clone())?,
        (None, _) => Host::open(state_dir, Some(provider))?,
    };
    let host = match permissions {
        Some(profile) => host.with_permission_profile(profile),
        None => host,
    };
    let host = Arc::new(if args.get_flag("require-completion-text") {
        host.with_required_completion_text()
    } else {
        host
    });
    if name == "serve" {
        if let Some(supervisor) = supervisor {
            return process::serve_supervised(host, supervisor, process::shutdown_signal()).await;
        }
        return process::serve(host, listener, process::shutdown_signal()).await;
    }
    process::run(
        &host,
        RunOptions {
            cwd: args
                .get_one::<PathBuf>("cwd")
                .expect("required cwd")
                .clone(),
            session: args
                .get_one::<String>("session")
                .map(SessionId::new)
                .transpose()?,
            prompt: args.get_one::<String>("prompt").cloned(),
            skills: args
                .get_many::<String>("skill")
                .into_iter()
                .flatten()
                .cloned()
                .map(grida_agent::skills::SkillReference::named)
                .collect::<Result<_>>()?,
            questions: args.get_flag("questions"),
            timeout: Duration::from_millis(
                args.get_one::<u64>("deadline-ms")
                    .copied()
                    .unwrap_or(DEFAULT_RUN_TIMEOUT_MS),
            ),
        },
        process::shutdown_signal(),
    )
    .await
}

fn problem(kind: ErrorKind, code: &'static str) -> Error {
    Error::new(kind, code)
}
