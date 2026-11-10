use agent_kit_core::{Error, ErrorKind, ModelId, Result, SessionId};
use clap::{Arg, ArgAction, ArgGroup, ArgMatches, Command, value_parser};
use grida_agent::configuration::WorkspaceConfiguration;
use grida_agent::host::{GgOptions, Host};
use grida_agent::mcp_client::McpClient;
use grida_agent::process::{self, RunOptions};
use grida_agent::{
    CompatibleOutputLimitField, EffortPreset, OperatingRegime, ProviderOptions, ProviderProtocol,
    acp, mcp,
};
use serde_json::json;
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;
use zeroize::Zeroizing;

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
    let command = Command::new("grida-agent")
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
                        .required_unless_present_any(["permission-profile", "input-png", "input-file"])
                        .help("Working directory. Defaults to the trusted profile's primary or a private attachment context."),
                )
                .arg(
                    Arg::new("input-png")
                        .long("input-png")
                        .value_name("FILE")
                        .value_parser(value_parser!(PathBuf))
                        .help("Attach one explicitly selected PNG to the prompt"),
                )
                .arg(
                    Arg::new("input-file")
                        .long("input-file")
                        .value_name("FILE")
                        .value_parser(value_parser!(PathBuf))
                        .conflicts_with("input-png")
                        .help("Attach one explicitly selected regular file for bounded local inspection"),
                )
                .arg(Arg::new("session").long("session").value_name("SESSION_ID"))
                .arg(Arg::new("effort").long("effort").value_parser(["standard", "ultra"])
                    .default_value("standard").help("Select bounded agent effort independently of Plan or Act."))
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
                    Arg::new("subagents")
                        .long("subagents")
                        .requires("stdio")
                        .action(ArgAction::SetTrue)
                        .help("Allow the private launcher to own bounded text-only subagents"),
                )
                .arg(
                    Arg::new("supervised-provider")
                        .long("supervised-provider")
                        .requires("stdio")
                        .conflicts_with("headless-surface")
                        .action(ArgAction::SetTrue),
                )
                .arg(
                    Arg::new("desktop-image-generation")
                        .long("desktop-image-generation")
                        .value_name("BINDING")
                        .requires_all(["supervised-provider", "credential-home"])
                        .conflicts_with_all([
                            "credential-env",
                            "supervised-configured-endpoint-key",
                            "supervised-gateway-scope",
                            "supervised-chatgpt-scope",
                            "listen",
                        ])
                        .hide(true),
                )
                .arg(
                    Arg::new("workspace-configuration")
                        .long("workspace-configuration")
                        .value_name("DIRECTORY")
                        .value_parser(value_parser!(PathBuf))
                        .requires_all(["supervised-provider", "workspace-configuration-epoch"])
                        .conflicts_with("listen")
                        .hide(true),
                )
                .arg(
                    Arg::new("workspace-configuration-epoch")
                        .long("workspace-configuration-epoch")
                        .value_name("UUID")
                        .value_parser(value_parser!(uuid::Uuid))
                        .requires("workspace-configuration")
                        .hide(true),
                )
                .arg(
                    Arg::new("supervised-configured-endpoint-key")
                        .long("supervised-configured-endpoint-key")
                        .value_name("ENDPOINT_ID")
                        .requires_all(["supervised-provider", "credential-home"])
                        .conflicts_with_all([
                            "supervised-gateway-scope",
                            "supervised-chatgpt-scope",
                            "listen",
                        ])
                        .hide(true),
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
                            "llama-cpp-input-count",
                        ])
                        .hide(true),
                )
                .arg(
                    Arg::new("supervised-chatgpt-scope")
                        .long("supervised-chatgpt-scope")
                        .value_name("SCOPE")
                        .requires("supervised-provider")
                        .conflicts_with_all([
                            "supervised-gateway-scope",
                            "credential-env",
                            "credential-home",
                            "compatible-output-limit-field",
                            "llama-cpp-input-count",
                            "max-output-tokens",
                        ])
                        .hide(true),
                )
                .arg(
                    Arg::new("listen")
                        .long("listen")
                        .value_name("LOOPBACK_WS_URL")
                        .requires("server-token-env")
                        .conflicts_with_all(["mcp-endpoint", "headless-surface"]),
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
            Command::new("serve-editor-mcp")
                .hide(true)
                .arg(
                    Arg::new("listen")
                        .long("listen")
                        .required(true),
                )
                .arg(
                    Arg::new("server-token-env")
                        .long("server-token-env")
                        .required(true),
                ),
        )
        .subcommand(
            Command::new("inspect")
                .about("Read a persisted session without running a prompt")
                .arg(state_dir())
                .arg(Arg::new("session").value_name("SESSION_ID").required(true)),
        );
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    let command = command
        .subcommand(Command::new("workspace-file").hide(true))
        .subcommand(
            Command::new("inspect-external")
                .hide(true)
                .arg(state_dir())
                .arg(external_run_id().required(true)),
        )
        .subcommand(
            Command::new("run-external")
                .about("Run one text turn through a reviewed, confined ACP peer")
                .arg(state_dir())
                .arg(external_run_id())
                .arg(
                    Arg::new("profile")
                        .long("profile")
                        .value_name("PRIVATE_PROFILE_FILE")
                        .value_parser(value_parser!(PathBuf))
                        .required(true),
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
                        .value_parser(value_parser!(u64).range(1..=MAX_RUN_TIMEOUT_MS))
                        .default_value("120000"),
                ),
        );
    command
}

fn state_dir() -> Arg {
    Arg::new("state-dir")
        .long("state-dir")
        .value_name("DIRECTORY")
        .value_parser(value_parser!(PathBuf))
        .required(true)
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn external_run_id() -> Arg {
    Arg::new("run-id")
        .long("run-id")
        .value_name("UUID")
        .value_parser(value_parser!(uuid::Uuid))
        .hide(true)
}

fn launch(command: Command) -> Command {
    command
        .arg(state_dir())
        .arg(
            Arg::new("mode")
                .long("mode")
                .value_parser(["act", "plan"])
                .default_value("act")
                .help("Choose authorized execution or investigation and proposal only"),
        )
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
            Arg::new("headless-surface")
                .long("headless-surface")
                .action(ArgAction::SetTrue)
                .help("Offer the headless surface operation to Act prompts"),
        )
        .arg(
            Arg::new("mcp-endpoint")
                .long("mcp-endpoint")
                .value_name("LOOPBACK_MCP_URL")
                .requires_all(["mcp-token-env", "mcp-source", "mcp-tool"])
                .help("Opt into a trusted numeric-loopback MCP peer for Act prompts"),
        )
        .arg(
            Arg::new("mcp-token-env")
                .long("mcp-token-env")
                .value_name("ENVIRONMENT_VARIABLE")
                .requires("mcp-endpoint")
                .help("Read the outbound MCP bearer from the host environment"),
        )
        .arg(
            Arg::new("mcp-source")
                .long("mcp-source")
                .value_name("ID")
                .requires("mcp-endpoint")
                .help("Set the trusted MCP source namespace"),
        )
        .arg(
            Arg::new("mcp-tool")
                .long("mcp-tool")
                .value_name("NAME")
                .requires("mcp-endpoint")
                .action(ArgAction::Append)
                .help("Allow one exact MCP tool name. Repeat for additional tools."),
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
            Arg::new("llama-cpp-input-count")
                .long("llama-cpp-input-count")
                .action(ArgAction::SetTrue)
                .help("Use the llama.cpp text request counter on a direct numeric-loopback /v1 endpoint"),
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
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    if name == "workspace-file" {
        return grida_agent::workspace_file::serve_stdio().map(|()| 0);
    }
    if name == "serve-mcp" || name == "serve-editor-mcp" {
        let options = mcp::ListenOptions::from_environment(
            args.get_one::<String>("listen")
                .expect("required listen address"),
            args.get_one::<String>("server-token-env")
                .expect("required token environment"),
        )?;
        if name == "serve-editor-mcp" {
            mcp::serve_editor(options, process::shutdown_signal()).await?;
        } else {
            mcp::serve_headless(options, process::shutdown_signal()).await?;
        }
        return Ok(0);
    }
    let state_dir = args
        .get_one::<PathBuf>("state-dir")
        .expect("required state dir");
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    if name == "run-external" {
        let options = process::external::RunOptions {
            state_directory: state_dir.clone(),
            profile: args
                .get_one::<PathBuf>("profile")
                .expect("required external ACP profile")
                .clone(),
            prompt: args.get_one::<String>("prompt").cloned(),
            timeout: Duration::from_millis(
                *args
                    .get_one::<u64>("deadline-ms")
                    .expect("deadline default"),
            ),
        };
        let shutdown = process::shutdown_signal();
        return match args.get_one::<uuid::Uuid>("run-id") {
            Some(id) => process::external::run_identified(options, *id, shutdown).await,
            None => process::external::run(options, shutdown).await,
        };
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    if name == "inspect-external" {
        return process::external::inspect(
            state_dir,
            *args
                .get_one::<uuid::Uuid>("run-id")
                .expect("required run id"),
        )
        .await;
    }
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
        llama_cpp_input_count: args.get_flag("llama-cpp-input-count"),
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
    let run_cwd = if name == "run" {
        match (args.get_one::<PathBuf>("cwd"), permissions.as_ref()) {
            (Some(cwd), _) => Some(cwd.clone()),
            (None, Some(profile)) => Some(profile.primary_directory()?.to_owned()),
            (None, None) => None,
        }
    } else {
        None
    };
    let supervisor = if name == "serve" && args.get_flag("supervised-provider") {
        Some(
            match args.get_one::<String>("supervised-configured-endpoint-key") {
                Some(key) => grida_agent::SupervisedProvider::for_configured_endpoint(key)?,
                None => grida_agent::SupervisedProvider::default(),
            },
        )
    } else {
        None
    };
    let gateway_scope = if name == "serve" {
        args.get_one::<String>("supervised-gateway-scope")
    } else {
        None
    };
    let chatgpt_scope = if name == "serve" {
        args.get_one::<String>("supervised-chatgpt-scope")
    } else {
        None
    };
    let subagents = name == "serve" && args.get_flag("subagents");
    if subagents && supervisor.is_some() && (gateway_scope.is_none() || chatgpt_scope.is_some()) {
        return Err(problem(
            ErrorKind::Unsupported,
            "subagent_supervised_gateway_required",
        ));
    }
    let regime = if args
        .get_one::<String>("mode")
        .is_some_and(|mode| mode == "plan")
    {
        OperatingRegime::Plan
    } else {
        OperatingRegime::Act
    };
    if supervisor.is_some()
        && args.get_one::<String>("mcp-endpoint").is_some()
        && (gateway_scope.is_none() || chatgpt_scope.is_some())
    {
        return Err(problem(
            ErrorKind::Unsupported,
            "mcp_supervised_gateway_required",
        ));
    }
    let provider_env = provider.credential_env.clone();
    let desktop_image_generation = if name == "serve" {
        args.get_one::<String>("desktop-image-generation")
    } else {
        None
    };
    if desktop_image_generation.is_some()
        && (provider.protocol != ProviderProtocol::OpenAiCompatible
            || !matches!(
                provider.endpoint.as_str(),
                "https://openrouter.ai/api/v1" | "https://ai-gateway.vercel.sh/v1"
            ))
    {
        return Err(problem(
            ErrorKind::InvalidInput,
            "desktop_image_generation_provider_invalid",
        ));
    }
    let workspace_configuration = if name == "serve" {
        args.get_one::<PathBuf>("workspace-configuration")
            .zip(args.get_one::<uuid::Uuid>("workspace-configuration-epoch"))
            .map(|(directory, epoch)| WorkspaceConfiguration::new(directory.clone(), *epoch))
    } else {
        None
    };
    let host = match (&supervisor, gateway_scope, chatgpt_scope) {
        (Some(supervisor), _, Some(scope)) => {
            if provider.protocol != ProviderProtocol::Responses {
                return Err(problem(
                    ErrorKind::InvalidInput,
                    "chatgpt_subscription_protocol_invalid",
                ));
            }
            Host::open_supervised_chatgpt(
                state_dir,
                &provider.endpoint,
                provider.model,
                scope,
                supervisor.clone(),
                workspace_configuration.as_ref(),
            )?
        }
        (Some(supervisor), Some(scope), None) => {
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
                workspace_configuration.as_ref(),
            )?
        }
        (Some(supervisor), None, None) => Host::open_supervised(
            state_dir,
            provider,
            supervisor.clone(),
            workspace_configuration.as_ref(),
        )?,
        (None, _, _) => Host::open(state_dir, Some(provider))?,
    };
    let mcp_client = outbound_mcp(args, regime, provider_env.as_deref()).await?;
    let host = host.with_operating_regime(regime);
    let host = match desktop_image_generation {
        Some(binding) => host.with_desktop_image_generation(binding)?,
        None => host,
    };
    let ultra = name == "run"
        && args
            .get_one::<String>("effort")
            .is_some_and(|value| value == "ultra");
    let host = if subagents || ultra {
        host.with_subagents()
    } else {
        host
    };
    let host = if ultra {
        host.with_effort(EffortPreset::Ultra)?
    } else {
        host
    };
    let host = match mcp_client {
        Some(client) => host.with_mcp_client(client)?,
        None => host,
    };
    let host = if args.get_flag("headless-surface") {
        host.with_headless_surface()?
    } else {
        host
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
    process::run_with_file(
        &host,
        RunOptions {
            cwd: match run_cwd {
                Some(cwd) => cwd,
                None => process::attachment_context(state_dir)?,
            },
            session: args
                .get_one::<String>("session")
                .map(SessionId::new)
                .transpose()?,
            prompt: args.get_one::<String>("prompt").cloned(),
            input_png: args.get_one::<PathBuf>("input-png").cloned(),
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
        args.get_one::<PathBuf>("input-file").cloned(),
        process::shutdown_signal(),
    )
    .await
}

// GRIDA-SEC-004 — only the trusted launch can choose a peer or credential source.
async fn outbound_mcp(
    args: &ArgMatches,
    regime: OperatingRegime,
    provider_env: Option<&str>,
) -> Result<Option<McpClient>> {
    let Some(endpoint) = args
        .get_one::<String>("mcp-endpoint")
        .filter(|_| regime.is_act())
    else {
        return Ok(None);
    };
    let token_env = args
        .get_one::<String>("mcp-token-env")
        .expect("required by the outbound MCP endpoint");
    if token_env.is_empty()
        || token_env.len() > 128
        || !token_env
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    {
        return Err(problem(
            ErrorKind::InvalidInput,
            "invalid_mcp_token_environment_name",
        ));
    }
    if provider_env.is_some_and(|name| name.eq_ignore_ascii_case(token_env)) {
        return Err(problem(
            ErrorKind::InvalidInput,
            "mcp_token_requires_separate_environment",
        ));
    }
    let token = std::env::var(token_env)
        .map(Zeroizing::new)
        .map_err(|_| problem(ErrorKind::Unavailable, "mcp_token_unavailable"))?;
    let source = args
        .get_one::<String>("mcp-source")
        .expect("required by the outbound MCP endpoint");
    let tools = args
        .get_many::<String>("mcp-tool")
        .expect("required by the outbound MCP endpoint")
        .map(String::as_str)
        .collect::<Vec<_>>();
    Ok(Some(
        McpClient::connect(source, endpoint, &token, &tools).await?,
    ))
}

fn problem(kind: ErrorKind, code: &'static str) -> Error {
    Error::new(kind, code)
}
