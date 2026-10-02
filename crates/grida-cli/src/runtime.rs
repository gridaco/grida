// GRIDA-SEC-006 / GRIDA-SEC-010 / GRIDA-SEC-013 / GRIDA-SEC-014 / GRIDA-SEC-015
// GRIDA-GG: provider — explicit scoped invocation authority; no account token or credential persistence.
// Parse/input admission precedes custody; host lends one invocation's authority.
use crate::{
    credentials::Credentials,
    error::{Error, Origin, Result},
    host::{Environment, Host},
    *,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use grida_ai::{Catalog, ExecutionAuthority, Filter, MediaClient};
use serde_json::{Value, json};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use tokio_util::sync::CancellationToken;

pub struct Output {
    pub value: Value,
    pub lines: Vec<String>,
    pub exit: u8,
}
impl Output {
    fn new(value: Value, lines: Vec<String>) -> Self {
        Self {
            value,
            lines,
            exit: 0,
        }
    }
}
fn text<'a>(v: &'a Value, k: &str) -> &'a str {
    v[k].as_str().unwrap_or("")
}
fn unavailable() -> Error {
    Error::new("unavailable", "Grida could not complete this command.")
}
fn check(token: &CancellationToken) -> Result<()> {
    if token.is_cancelled() {
        Err(Error::cancelled())
    } else {
        Ok(())
    }
}

struct MediaTransport {
    http: http::Transport,
    token: CancellationToken,
}
impl grida_ai::Transport for MediaTransport {
    fn request(&self, r: grida_ai::Request) -> grida_ai::HttpFuture<'_> {
        Box::pin(async move {
            let failure = || grida_ai::TransportError;
            let lane = match r.lane {
                grida_ai::Lane::Provider | grida_ai::Lane::Upload => http::Lane::Provider,
                grida_ai::Lane::Download => http::Lane::Download,
            };
            let mut request =
                http::Request::new(r.method.parse().map_err(|_| failure())?, r.url, r.body);
            request.max_response_bytes = r.max_bytes;
            request.completion = match r.completion {
                grida_ai::ResponseCompletion::Body => http::ResponseCompletion::Body,
                grida_ai::ResponseCompletion::FirstSseEvent => {
                    http::ResponseCompletion::FirstSseEvent
                }
            };
            for (name, value) in r.headers {
                request.headers.insert(
                    ::http::HeaderName::from_bytes(name.as_bytes()).map_err(|_| failure())?,
                    value.parse().map_err(|_| failure())?,
                );
            }
            let response = self
                .http
                .send(lane, request, &self.token)
                .await
                .map_err(|_| failure())?;
            Ok(grida_ai::Response {
                status: response.status,
                headers: response
                    .headers
                    .iter()
                    .filter_map(|(n, v)| v.to_str().ok().map(|v| (n.to_string(), v.into())))
                    .collect(),
                body: response.body.to_vec(),
            })
        })
    }
}
fn media_client(origin: Option<&str>, token: &CancellationToken) -> Result<MediaClient> {
    Ok(MediaClient::new(Arc::new(MediaTransport {
        http: http::Transport::new(origin).map_err(|_| unavailable())?,
        token: token.clone(),
    })))
}

pub async fn run(invocation: Invocation) -> Result<Output> {
    let media = match &invocation.command {
        Command::ModelsInspect(_)
        | Command::ModelsList { .. }
        | Command::Generate { .. }
        | Command::VoicesList { .. } => Some(false),
        Command::RiggingList { .. }
        | Command::RiggingInspect { .. }
        | Command::RiggingCheck { .. }
        | Command::RiggingRun { .. } => Some(true),
        _ => None,
    };
    let token = CancellationToken::new();
    let interrupted = Arc::new(AtomicBool::new(false));
    let signal_token = token.clone();
    let flag = interrupted.clone();
    let signals = tokio::spawn(async move {
        #[cfg(unix)]
        {
            if let Ok(mut term) =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            {
                tokio::select! {_=tokio::signal::ctrl_c()=>{},_=term.recv()=>{}};
            } else {
                let _ = tokio::signal::ctrl_c().await;
            }
        }
        #[cfg(not(unix))]
        let _ = tokio::signal::ctrl_c().await;
        flag.store(true, Ordering::SeqCst);
        signal_token.cancel();
    });
    let result = execute(invocation, host::environment(), token, interrupted).await;
    signals.abort();
    result.map_err(|error| match media {
        Some(mesh) => error.media(mesh),
        None => error,
    })
}
async fn execute(
    invocation: Invocation,
    env: Environment,
    token: CancellationToken,
    interrupted: Arc<AtomicBool>,
) -> Result<Output> {
    let catalog = Catalog::bundled();
    match invocation.command {
        Command::ModelsInspect(model) => {
            let d = input::inspect(&catalog, &model, None)?;
            Ok(Output::new(d.clone(), input::describe(&d)))
        }
        Command::ModelsList {
            provider,
            kind,
            modality,
            available,
            local_image,
            selector,
        } => {
            let mut descriptors = catalog.list(&Filter {
                provider: provider.map(|p| p.as_str().into()),
                kind: kind.map(|k| k.as_str().into()),
                ..Default::default()
            })?;
            descriptors.retain(|d| {
                !matches!(d["feature"].as_str(), Some("rigging" | "rig-check"))
                    && modality.is_none_or(|m| modality_for(text(d, "kind")) == m.as_str())
                    && (!local_image || !input::local_flags(d).is_empty())
            });
            let mut access = json!({"checked":false});
            if available {
                if provider == Some(Provider::Gg) {
                    let credit = read_credits(&env, selector.as_ref(), &token).await?;
                    let eligible = credit["billing_gate"]["allowed"].as_bool() == Some(true);
                    access = json!({"checked":true,"basis":"cached_credits","eligible":eligible,"provider_access":"unverified","credits":credit});
                    if !eligible {
                        descriptors.clear();
                    }
                } else {
                    let credentials =
                        Credentials::open(&env, provider.map(Provider::as_str), false, &token)
                            .await?;
                    let status = credentials
                        .status()
                        .into_iter()
                        .find(|s| s["provider"] == provider.unwrap().as_str())
                        .ok_or_else(unavailable)?;
                    access = status;
                    access["checked"] = json!(true);
                    access["basis"] = json!("key_presence");
                    access["provider_access"] = json!("unverified");
                    if access["configured"] != true {
                        descriptors.clear();
                    }
                }
            }
            let rows: Vec<_> = descriptors
                .into_iter()
                .map(|mut d| {
                    let flags = input::local_flags(&d);
                    d.as_object_mut().unwrap().remove("input_schema");
                    d["local_image_flags"] = json!(flags);
                    d
                })
                .collect();
            let mut lines = if rows.is_empty() {
                vec!["No matching operations.".into()]
            } else {
                vec!["KIND  PROVIDER  MODEL  VARIANT  STATUS  LOCAL IMAGE".into()]
            };
            for d in &rows {
                let flags = d["local_image_flags"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join(", ");
                lines.push(format!(
                    "{}  {}  {}  {}  {}  {}",
                    text(d, "kind"),
                    text(d, "provider_id"),
                    text(d, "model_id"),
                    text(d, "variant"),
                    text(d, "status"),
                    if flags.is_empty() { "none" } else { &flags }
                ));
            }
            lines.push(
                if available {
                    "Access filter only; provider access and generation are unverified."
                } else {
                    "Bundled operations; access has not been checked."
                }
                .into(),
            );
            Ok(Output::new(
                json!({"operations":rows,"access":access}),
                lines,
            ))
        }
        Command::ProvidersList => {
            let credentials = Credentials::open(&env, None, false, &token).await?;
            let providers = credentials.status();
            let mut lines = providers
                .iter()
                .map(|s| {
                    format!(
                        "{}: {} ({}; {})",
                        text(s, "provider"),
                        if s["configured"] == true {
                            "configured"
                        } else {
                            "missing"
                        },
                        s["source"].as_str().unwrap_or("no key"),
                        text(s, "environment")
                    )
                })
                .collect::<Vec<_>>();
            lines.extend([
                "Stored keys use shared plaintext credentials.toml with private permissions."
                    .into(),
                "gg: Grida login and organization required; access not checked.".into(),
            ]);
            Ok(Output::new(
                json!({"providers":providers,"storage":"shared_plaintext_file","gg":{"authentication":"grida_login","checked":false}}),
                lines,
            ))
        }
        Command::ProvidersConfigure {
            provider,
            key_stdin,
        } => {
            let key = if key_stdin {
                credentials::read_key(provider.as_str(), &token).await?
            } else {
                credentials::prompt(provider.as_str(), &token).await?
            };
            let verification = media_client(None, &token)?
                .verify(provider.as_str(), &key, token.clone())
                .await
                .map_err(verification_error)?;
            check(&token)?;
            let stored = provider.as_str();
            tokio::task::spawn_blocking(move || {
                host::provider_store(&env)?
                    .set(stored, &key)
                    .map_err(host::provider_error)
            })
            .await
            .map_err(|_| unavailable())??;
            Ok(provider_output(stored, true, Some(verification)))
        }
        Command::ProvidersRemove(provider) => {
            check(&token)?;
            let p = provider.as_str();
            tokio::task::spawn_blocking(move || {
                host::provider_store(&env)?
                    .remove(p)
                    .map_err(host::provider_error)
            })
            .await
            .map_err(|_| unavailable())??;
            Ok(provider_output(p, false, None))
        }
        Command::VoicesList { key_stdin } => {
            let c = Credentials::open(&env, Some("elevenlabs"), key_stdin, &token).await?;
            let key=c.key("elevenlabs").ok_or_else(||Error::new("provider_key_required","Configure the selected provider with grida providers configure, or supply its environment key or --key-stdin."))?;
            let voices = media_client(None, &token)?
                .voices(
                    key,
                    &grida_ai::VoiceFilter {
                        provider: "elevenlabs".into(),
                    },
                    token.clone(),
                )
                .await?;
            check(&token)?;
            let lines = voices
                .iter()
                .map(|v| format!("{}  {}", text(v, "voice_id"), text(v, "name")))
                .collect();
            Ok(Output::new(
                json!({"provider":"elevenlabs","voices":voices}),
                lines,
            ))
        }
        Command::Generate {
            model,
            source,
            out,
            key_stdin,
            selector,
        } => {
            let d = input::inspect(&catalog, &model, Some(&source))?;
            let value = input::read(&d, &source, &token).await?;
            let parsed = catalog.parse_input(&input::selector(&d), value)?;
            generate(parsed, Some(out), key_stdin, selector, &env, &token).await
        }
        Command::RiggingList { provider, feature } => {
            let mut rows = catalog.list(&Filter {
                provider: provider.map(|p| p.as_str().into()),
                feature: feature.map(|f| f.as_str().into()),
                ..Default::default()
            })?;
            rows.retain(|d| matches!(d["feature"].as_str(), Some("rigging" | "rig-check")));
            let lines = rows
                .iter()
                .map(|d| {
                    format!(
                        "{}  {}{}  {}",
                        text(d, "feature"),
                        text(d, "provider_id"),
                        if d["feature"] == "rigging" {
                            format!("  {}", text(d, "model_id"))
                        } else {
                            String::new()
                        },
                        text(&d["output"], "representation")
                    )
                })
                .collect();
            Ok(Output::new(json!(rows), lines))
        }
        Command::RiggingInspect {
            provider,
            operation,
        } => {
            let d = catalog.inspect(&rig_selector(provider, &operation))?;
            let mut lines = vec![
                format!(
                    "{} ({}){}",
                    text(&d, "feature"),
                    text(&d, "provider_id"),
                    if d["feature"] == "rigging" {
                        format!(" — {}", text(&d, "model_id"))
                    } else {
                        String::new()
                    }
                ),
                format!("Output: {}", text(&d["output"], "representation")),
                "Input schema:".into(),
            ];
            lines.extend(
                serde_json::to_string_pretty(&d["input_schema"])
                    .unwrap()
                    .lines()
                    .map(String::from),
            );
            if d["output"]["representation"] == "structured" {
                lines.push("Output schema:".into());
                lines.extend(
                    serde_json::to_string_pretty(&d["output"]["schema"])
                        .unwrap()
                        .lines()
                        .map(String::from),
                );
            }
            Ok(Output::new(d, lines))
        }
        Command::RiggingCheck {
            provider,
            source,
            key_stdin,
            selector,
        } => {
            let selection = rig_selector(provider, &MeshOperation::Check);
            let value = match source {
                MeshSource::Json(s) => files::read_input(&s, &token).await?,
                MeshSource::Mesh(path) => json!({"mesh":encoded_mesh(&path,&token).await?}),
            };
            let parsed = catalog.parse_input(&selection, value)?;
            generate(parsed, None, key_stdin, selector, &env, &token).await
        }
        Command::RiggingRun {
            provider,
            model,
            source,
            out,
            key_stdin,
            selector,
        } => {
            let selection = rig_selector(provider, &MeshOperation::Rig { model });
            let value = match source {
                RiggingSource::Json(s) => files::read_input(&s, &token).await?,
                RiggingSource::Mesh {
                    path,
                    rig_type,
                    spec,
                } => {
                    json!({"mesh":encoded_mesh(&path,&token).await?,"rig_type":rig_type,"spec":spec})
                }
            };
            let parsed = catalog.parse_input(&selection, value)?;
            generate(parsed, Some(out), key_stdin, selector, &env, &token).await
        }
        command => auth_command(command, env, interrupted).await,
    }
}
fn modality_for(kind: &str) -> &str {
    match kind {
        "image" | "video" => kind,
        "three-d" => "3d",
        _ => "audio",
    }
}
fn rig_selector(provider: MeshProvider, operation: &MeshOperation) -> grida_ai::Selector {
    grida_ai::Selector {
        kind: "three-d".into(),
        model_id: match operation {
            MeshOperation::Check => String::new(),
            MeshOperation::Rig { model } => model.clone(),
        },
        provider: provider.as_str().into(),
        variant: None,
        feature: Some(
            match operation {
                MeshOperation::Check => "rig-check",
                _ => "rigging",
            }
            .into(),
        ),
    }
}
async fn encoded_mesh(path: &str, token: &CancellationToken) -> Result<Value> {
    let mesh = files::read_mesh(path, 60_000_000, token).await?;
    Ok(json!({"data":STANDARD.encode(&mesh.data),"media_type":mesh.media_type}))
}
async fn read_credits(
    env: &Environment,
    selector: Option<&Selector>,
    token: &CancellationToken,
) -> Result<Value> {
    check(token)?;
    let env = env.clone();
    let selected = selector.cloned();
    let handle = tokio::runtime::Handle::current();
    let worker_token = token.clone();
    let result = tokio::task::spawn_blocking(move || {
        let host = Host::open(&env)?;
        let client = account::open(&host, None, handle)?;
        check(&worker_token)?;
        let organization = account::select(&client, selected.as_ref())?;
        check(&worker_token)?;
        client.credits(organization.id).map_err(account::failure)
    })
    .await
    .map_err(|_| unavailable())?;
    check(token)?;
    result
}
async fn authority(
    provider: &str,
    key_stdin: bool,
    selector: Option<&Selector>,
    env: &Environment,
    token: &CancellationToken,
) -> Result<(ExecutionAuthority, Option<String>)> {
    if provider == "gg" {
        check(token)?;
        let env = env.clone();
        let selected = selector.cloned();
        let handle = tokio::runtime::Handle::current();
        let worker_token = token.clone();
        let authority = tokio::task::spawn_blocking(move || -> Result<_> {
            let host = Host::open(&env)?;
            let client = account::open(&host, None, handle)?;
            check(&worker_token)?;
            let org = account::select(&client, selected.as_ref())?;
            check(&worker_token)?;
            let origin = host.config.api_origin;
            let authority = client
                .request_gg_with(org.id, |grant| {
                    if worker_token.is_cancelled() {
                        return Err(grida_auth::Error::new("cancelled"));
                    }
                    Ok(ExecutionAuthority::Gateway {
                        token: grant.token().into(),
                        base_url: origin.clone(),
                        expires_at_ms: parse_date(&grant.expires_at)
                            .map_err(|_| grida_auth::Error::new("invalid_response"))?,
                    })
                })
                .map_err(account::failure)?;
            Ok((authority, Some(origin)))
        })
        .await
        .map_err(|_| unavailable())??;
        check(token)?;
        Ok(authority)
    } else {
        let credentials = Credentials::open(env, Some(provider), key_stdin, token).await?;
        let key = credentials.key(provider).ok_or_else(|| {
            Error::new(
                "provider_key_required",
                "Configure the selected provider with grida providers configure, or supply its environment key or --key-stdin.",
            )
            .origin(Origin::Ai)
        })?;
        Ok((
            ExecutionAuthority::Byok {
                provider: provider.into(),
                key: key.into(),
            },
            None,
        ))
    }
}
async fn generate(
    parsed: grida_ai::Parsed,
    out: Option<String>,
    key_stdin: bool,
    selector: Option<Selector>,
    env: &Environment,
    token: &CancellationToken,
) -> Result<Output> {
    check(token)?;
    let mut directory = if let Some(out) = out {
        Some(
            tokio::task::spawn_blocking(move || {
                files::Directory::prepare(std::path::Path::new(&out))
            })
            .await
            .map_err(|_| unavailable())??,
        )
    } else {
        None
    };
    let result = async {
        check(token)?;
        let (authority, origin) =
            authority(parsed.provider(), key_stdin, selector.as_ref(), env, token).await?;
        check(token)?;
        let result = media_client(origin.as_deref(), token)?
            .execute(&parsed, authority, token.clone())
            .await?;
        if let Some(findings) = result.findings {
            return rigging_check_output(findings, result.task);
        }
        let mut metadata = parsed.descriptor.clone();
        if parsed.descriptor["feature"] == "rigging"
            && let Some(task) = result.task
        {
            metadata["task"] = serde_json::to_value(task).map_err(|_| unavailable())?;
        }
        let task_id = metadata["task"]["id"].as_str().map(String::from);
        let artifacts = result
            .assets
            .into_iter()
            .map(|a| files::Artifact {
                data: a.data,
                media_type: a.media_type,
            })
            .collect::<Vec<_>>();
        let mut dir = directory.take().ok_or_else(unavailable)?;
        // Never race this join with cancellation: publication of returned paid bytes settles.
        let (dir, saved) = tokio::task::spawn_blocking(move || {
            let receipt = dir.save(&metadata, &artifacts);
            (dir, receipt)
        })
        .await
        .map_err(|_| unavailable())?;
        directory = Some(dir);
        let receipt = saved.map_err(|e| {
            let mut error = Error::from(e);
            if let Some(id) = task_id {
                error.value["task_id"] = json!(id);
            }
            error
        })?;
        let mut lines = receipt["artifacts"]
            .as_array()
            .ok_or_else(unavailable)?
            .iter()
            .map(|a| text(a, "path").into())
            .collect::<Vec<_>>();
        lines.push(format!(
            "Receipt: {}/receipt.json",
            text(&receipt, "directory")
        ));
        if parsed.descriptor["feature"] == "rigging" {
            lines.push(format!("Task: {}", text(&receipt["task"], "id")));
            if let Some(c) = receipt["task"].get("credits_consumed") {
                lines.push(format!("Credits consumed: {c}"));
            }
        }
        Ok(Output::new(receipt, lines))
    }
    .await;
    if let Some(directory) = directory {
        directory.abandon();
    }
    result
}
fn rigging_check_output(
    mut findings: Value,
    task: Option<grida_ai::TaskReceipt>,
) -> Result<Output> {
    // The SDK keeps safe task metadata separate from findings. The CLI's public
    // rig-check result requires both, including when a mesh is not riggable.
    findings["task"] =
        serde_json::to_value(task.ok_or_else(unavailable)?).map_err(|_| unavailable())?;
    let mut lines = vec![
        format!(
            "Riggable: {}",
            if findings["riggable"] == true {
                "yes"
            } else {
                "no"
            }
        ),
        format!("Rig type: {}", text(&findings, "rig_type")),
        format!("Task: {}", text(&findings["task"], "id")),
    ];
    if let Some(c) = findings["task"].get("credits_consumed") {
        lines.push(format!("Credits consumed: {c}"));
    }
    Ok(Output::new(findings, lines))
}
fn provider_output(provider: &str, stored: bool, verification: Option<Value>) -> Output {
    let mut value = json!({"provider":provider,"stored":stored,"storage":"plaintext_file","shared":true,"environment_checked":false});
    let mut lines=vec![if stored{format!("{provider}: saved to shared plaintext credentials.toml with private permissions.")}else{format!("{provider}: removed from shared credentials.toml. The provider key has not been revoked.")},"Desktop and CLI share stored keys. Environment overrides remain effective; Grida login is separate.".into()];
    if let Some(v) = verification {
        lines.push(if v["status"]=="accepted"{"Provider accepted the key check. Model access and available credits remain unverified."}else{"No suitable provider key check is available; saved with static validation only."}.into());
        value["verification"] = v;
    }
    Output::new(value, lines)
}
fn verification_error(e: grida_ai::Failure) -> Error {
    Error::new(
        &e.code,
        match e.code.as_str() {
            "invalid_input" => {
                "The provider key has an invalid format. Stored credentials were not changed."
            }
            "credential_rejected" => {
                "The provider rejected this key for inference use. Stored credentials were not changed."
            }
            "access_denied" => {
                "The provider denied the key check. Check key permissions or account restrictions; stored credentials were not changed."
            }
            "aborted" => "Provider configuration cancelled before saving.",
            "timeout" => {
                "The provider key check timed out. Stored credentials were not changed; retry configuration when ready."
            }
            _ => {
                "The provider key check could not be completed. Stored credentials were not changed; retry configuration when ready."
            }
        },
    )
}
async fn auth_command(
    command: Command,
    env: Environment,
    interrupted: Arc<AtomicBool>,
) -> Result<Output> {
    let handle = tokio::runtime::Handle::current();
    tokio::task::spawn_blocking(move || {
        let host = Host::open(&env)?;
        let storage = if let Command::AuthLogin { storage, .. } = &command {
            *storage
        } else {
            None
        };
        let client = account::open(&host, storage, handle)?;
        if interrupted.load(Ordering::SeqCst) {
            return Err(account::failure(grida_auth::Error::new("cancelled")));
        }
        let mut result = match command {
            Command::AuthLogin { no_browser, .. } => {
                let status = client
                    .login(
                        |url| {
                            host.validate_url(url)
                                .map_err(|_| grida_auth::Error::new("browser_failed"))?;
                            if no_browser {
                                use std::io::Write;
                                writeln!(std::io::stderr(), "Open this URL in your browser:\n{url}")
                                    .map_err(|_| grida_auth::Error::new("browser_failed"))
                            } else {
                                host.open_browser(url)
                                    .map_err(|_| grida_auth::Error::new("browser_failed"))
                            }
                        },
                        &interrupted,
                    )
                    .map_err(account::failure)?;
                status_output(status, StatusContext::Login)?
            }
            Command::AuthStatus => status_output(
                client.status().map_err(account::failure)?,
                StatusContext::Local,
            )?,
            Command::AuthLogout => logout_output(client.logout().map_err(account::failure)?),
            Command::AuthStorageShow | Command::AuthStorageMigrate(_) => {
                let value = if let Command::AuthStorageMigrate(s) = command {
                    client.migrate(account::backend(s))
                } else {
                    client.storage_info()
                }
                .map_err(account::failure)?;
                let value = json!(value);
                let lines = vec![
                    format!("Storage: {}", text(&value, "backend")),
                    format!("Profile: {}", text(&value, "profile")),
                    format!("Initialized: {}", value["initialized"]),
                    format!(
                        "Migration: {}",
                        value["migration"].as_str().unwrap_or("none")
                    ),
                ];
                Output::new(value, lines)
            }
            Command::AccountView => {
                let value = account::view(&client)?;
                let id = &value["identity"];
                let mut lines = vec![
                    format!(
                        "Account: {}",
                        id["email"].as_str().unwrap_or(text(id, "id"))
                    ),
                    format!("ID: {}", text(id, "id")),
                    format!("Name: {}", id["display_name"].as_str().unwrap_or("—")),
                    "Organizations:".into(),
                ];
                for org in value["organizations"].as_array().unwrap() {
                    lines.push(format!(
                        "  {} (ID {}) — {}",
                        text(org, "name"),
                        org["id"],
                        text(org, "display_name")
                    ));
                }
                if value["organizations"].as_array().unwrap().is_empty() {
                    lines.push("  None".into());
                }
                Output::new(value, lines)
            }
            Command::AccountCredits(selector) => {
                let value = account::credits(&client, selector.as_ref())?;
                let org = &value["organization"];
                let balance = value["balance_cents"]
                    .as_i64()
                    .map(usd)
                    .unwrap_or_else(|| "unknown".into());
                let lines = vec![
                    format!("Organization: {} (ID {})", text(org, "name"), org["id"]),
                    format!(
                        "Billing account: {}",
                        if value["account_present"] == true {
                            "present"
                        } else {
                            "absent"
                        }
                    ),
                    format!("Credits: {balance} ({})", text(&value, "state")),
                    format!(
                        "Cache updated: {}",
                        value["cache_updated_at"].as_str().unwrap_or("unknown")
                    ),
                    format!(
                        "Cached eligibility: {}",
                        if value["billing_gate"]["allowed"] == true {
                            "allowed"
                        } else {
                            text(&value["billing_gate"], "reason")
                        }
                    ),
                    "Cached estimate; generation checks current access separately.".into(),
                ];
                Output::new(value, lines)
            }
            _ => return Err(unavailable()),
        };
        if interrupted.load(Ordering::SeqCst) {
            return Err(account::failure(grida_auth::Error::new("cancelled")));
        }
        // Every output is an explicit DTO, never a serialized native owner/session.
        result.lines.shrink_to_fit();
        Ok(result)
    })
    .await
    .map_err(|_| unavailable())?
}
enum StatusContext {
    Login,
    Local,
}
fn status_output(status: grida_auth::Status, context: StatusContext) -> Result<Output> {
    let value = json!(status);
    let signed_out = value["state"] == "signed-out";
    let lines = if signed_out {
        vec!["Signed out. Run grida auth login.".into()]
    } else {
        let identity = &value["identity"];
        // Keep timestamp admission unchanged; expiry remains available in JSON.
        iso_ms(value["expiresAt"].as_i64().ok_or_else(unavailable)?)?;
        let account = identity["email"]
            .as_str()
            .filter(|email| !email.trim().is_empty())
            .unwrap_or(text(identity, "id"));
        match context {
            StatusContext::Login => vec![format!("Signed in as {account}.")],
            StatusContext::Local => vec![
                format!("Saved CLI session: {account}"),
                "Not checked online. Run grida account view to verify access.".into(),
            ],
        }
    };
    let mut out = Output::new(value, lines);
    out.exit = u8::from(signed_out);
    Ok(out)
}
fn logout_output(value: grida_auth::Logout) -> Output {
    let mut out = Output::new(
        json!(value),
        vec![
            "Cleared this CLI session locally.".into(),
            format!("Remote revocation: {}.", value.revocation),
            "Other Grida sessions and provider API keys are unchanged.".into(),
        ],
    );
    out.exit = u8::from(value.revocation == "unconfirmed");
    out
}
pub fn iso_ms(ms: i64) -> Result<String> {
    let date = time::OffsetDateTime::from_unix_timestamp_nanos(i128::from(ms) * 1_000_000)
        .map_err(|_| unavailable())?;
    let format = time::format_description::parse_borrowed::<2>(
        "[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond digits:3]Z",
    )
    .map_err(|_| unavailable())?;
    date.format(&format).map_err(|_| unavailable())
}
fn usd(cents: i64) -> String {
    let absolute = cents.unsigned_abs();
    format!(
        "{}{}.{:02} USD",
        if cents < 0 { "-" } else { "" },
        absolute / 100,
        absolute % 100
    )
}

fn parse_date(value: &str) -> Result<i64> {
    time::OffsetDateTime::parse(value, &time::format_description::well_known::Rfc3339)
        .map(|d| (d.unix_timestamp_nanos() / 1_000_000) as i64)
        .map_err(|_| unavailable())
}

#[cfg(all(test, any(target_os = "macos", target_os = "linux")))]
mod tests {
    use super::*;
    use std::{collections::VecDeque, sync::Mutex};

    #[test]
    fn auth_presentation_distinguishes_login_from_local_status_without_changing_json() {
        let identity = grida_auth::Identity {
            id: "synthetic-account".into(),
            email: Some("person@example.invalid".into()),
            display_name: None,
        };
        for status in [
            grida_auth::Status::SignedIn {
                identity: identity.clone(),
                expires_at: 1_800_000_000_000,
            },
            grida_auth::Status::RefreshNeeded {
                identity: identity.clone(),
                expires_at: 0,
            },
        ] {
            let expected_json = json!(status);
            let login = status_output(status.clone(), StatusContext::Login).unwrap();
            let local = status_output(status, StatusContext::Local).unwrap();
            assert_eq!(login.lines, ["Signed in as person@example.invalid."]);
            assert_eq!(
                local.lines,
                [
                    "Saved CLI session: person@example.invalid",
                    "Not checked online. Run grida account view to verify access.",
                ]
            );
            for out in [login, local] {
                assert_eq!(out.value, expected_json);
                assert_eq!(out.exit, 0);
            }
        }
    }

    #[test]
    fn auth_presentation_uses_account_id_when_email_is_missing_or_blank() {
        for email in [None, Some(String::new()), Some(" \t".into())] {
            let status = grida_auth::Status::SignedIn {
                identity: grida_auth::Identity {
                    id: "synthetic-account".into(),
                    email,
                    display_name: Some("A display name is not an account ID".into()),
                },
                expires_at: 1_800_000_000_000,
            };
            let expected_json = json!(status);
            let login = status_output(status.clone(), StatusContext::Login).unwrap();
            let local = status_output(status, StatusContext::Local).unwrap();
            assert_eq!(login.lines, ["Signed in as synthetic-account."]);
            assert_eq!(local.lines[0], "Saved CLI session: synthetic-account");
            assert_eq!(login.value, expected_json);
            assert_eq!(local.value, expected_json);
        }
    }

    #[test]
    fn auth_presentation_preserves_signed_out_exit_and_timestamp_admission() {
        for context in [StatusContext::Login, StatusContext::Local] {
            let out = status_output(grida_auth::Status::SignedOut, context).unwrap();
            assert_eq!(out.lines, ["Signed out. Run grida auth login."]);
            assert_eq!(out.value, json!({"state":"signed-out"}));
            assert_eq!(out.exit, 1);
        }
        let invalid = grida_auth::Status::SignedIn {
            identity: grida_auth::Identity {
                id: "synthetic-account".into(),
                email: None,
                display_name: None,
            },
            expires_at: i64::MAX,
        };
        assert!(status_output(invalid, StatusContext::Local).is_err());
    }

    #[test]
    fn auth_presentation_preserves_logout_revocation_and_exit_status() {
        for revocation in ["confirmed", "unconfirmed", "not-needed"] {
            let out = logout_output(grida_auth::Logout {
                state: "signed-out",
                revocation,
            });
            assert_eq!(
                out.value,
                json!({"state":"signed-out", "revocation":revocation})
            );
            assert_eq!(out.exit, u8::from(revocation == "unconfirmed"));
            assert_eq!(
                out.lines,
                [
                    "Cleared this CLI session locally.",
                    &format!("Remote revocation: {revocation}."),
                    "Other Grida sessions and provider API keys are unchanged.",
                ]
            );
        }
    }

    struct RigCheckReplay(Mutex<VecDeque<Value>>);
    impl grida_ai::Transport for RigCheckReplay {
        fn request(&self, request: grida_ai::Request) -> grida_ai::HttpFuture<'_> {
            Box::pin(async move {
                let step = self
                    .0
                    .lock()
                    .unwrap()
                    .pop_front()
                    .expect("expected request");
                assert_eq!(request.method, step["request"]["method"]);
                assert_eq!(request.url, step["request"]["url"]);
                let response = &step["response"];
                Ok(grida_ai::Response {
                    status: response["status"].as_u64().unwrap() as u16,
                    headers: serde_json::from_value(response["headers"].clone()).unwrap(),
                    body: STANDARD
                        .decode(response["base64"].as_str().unwrap())
                        .unwrap(),
                })
            })
        }
    }

    #[tokio::test]
    async fn rigging_check_keeps_sdk_task_in_json_and_human_output() {
        // These existing vectors derive from the pinned TypeScript public result,
        // whose rig-check schema requires task, independently of Rust's DTO layout.
        let vectors: Vec<Value> = serde_json::from_str(include_str!(
            "../../grida-ai/tests/fixtures/media-wire-vectors.json"
        ))
        .unwrap();
        for provider in ["tripo", "gg"] {
            let vector = vectors
                .iter()
                .find(|v| {
                    v["selector"]["provider"] == provider && v["selector"]["feature"] == "rig-check"
                })
                .unwrap();
            let selector = serde_json::from_value(vector["selector"].clone()).unwrap();
            let parsed = Catalog::bundled()
                .parse_input(&selector, vector["input"].clone())
                .unwrap();
            let replay = Arc::new(RigCheckReplay(Mutex::new(
                vector["transcript"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .cloned()
                    .collect(),
            )));
            let authority = if provider == "gg" {
                ExecutionAuthority::Gateway {
                    token: "synthetic-token".into(),
                    base_url: "https://gg.example".into(),
                    expires_at_ms: i64::MAX,
                }
            } else {
                ExecutionAuthority::Byok {
                    provider: provider.into(),
                    key: "synthetic-key".into(),
                }
            };
            let result = MediaClient::new(replay.clone())
                .execute(&parsed, authority, CancellationToken::new())
                .await
                .unwrap();
            assert!(replay.0.lock().unwrap().is_empty());
            let output = rigging_check_output(result.findings.unwrap(), result.task).unwrap();
            let mut stdout = Vec::new();
            assert_eq!(output::result(&output, true, &mut stdout).unwrap(), 0);
            assert_eq!(
                serde_json::from_slice::<Value>(&stdout).unwrap(),
                vector["result"],
                "{provider}"
            );
            stdout.clear();
            assert_eq!(output::result(&output, false, &mut stdout).unwrap(), 0);
            assert_eq!(
                String::from_utf8(stdout).unwrap(),
                "Riggable: yes\nRig type: biped\nTask: task_test\nCredits consumed: 1\n",
                "{provider}"
            );
        }
    }

    #[test]
    fn non_riggable_check_keeps_task_without_inventing_optional_credits() {
        let output = rigging_check_output(
            json!({"riggable":false,"rig_type":"biped"}),
            Some(grida_ai::TaskReceipt {
                id: "task_checked".into(),
                credits_consumed: None,
            }),
        )
        .unwrap();
        assert_eq!(
            output.value,
            json!({"riggable":false,"rig_type":"biped","task":{"id":"task_checked"}})
        );
        assert_eq!(output.exit, 0);
        assert_eq!(
            output.lines,
            ["Riggable: no", "Rig type: biped", "Task: task_checked"]
        );
        assert!(rigging_check_output(json!({"riggable":false,"rig_type":"biped"}), None).is_err());
    }

    #[tokio::test]
    async fn missing_byok_authority_uses_the_command_family_guidance() {
        // An isolated empty store exercises the actual authority path without
        // reading the user's environment, keyring, or account credentials.
        let temporary = tempfile::tempdir().unwrap();
        let env = Environment::from([
            ("HOME".into(), temporary.path().into()),
            ("GRIDA_HOME".into(), temporary.path().join("grida").into()),
        ]);
        for (mesh, message) in [
            (
                true,
                "Configure Tripo with grida providers configure tripo, or supply TRIPO_API_KEY or --key-stdin.",
            ),
            (
                false,
                "Configure the selected provider with grida providers configure, or supply its environment key or --key-stdin.",
            ),
        ] {
            let error = authority("tripo", false, None, &env, &CancellationToken::new())
                .await
                .err()
                .expect("an empty store cannot grant provider authority")
                .media(mesh);
            assert_eq!(error.exit, 1);
            assert_eq!(
                error.value,
                json!({"code":"provider_key_required","message":message})
            );
        }
    }
}
