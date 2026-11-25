// GRIDA-SEC-013 / GRIDA-SEC-014 — explicit local reads and shared credential custody.
use super::{Output, media_client, text, unavailable};
use crate::{
    GenerationSource, Parameter,
    credentials::Credentials,
    error::{Error, Origin, Result},
    files,
    host::Environment,
    input,
};
use grida_ai::Catalog;
use serde_json::{Value, json};
use tokio_util::sync::CancellationToken;

pub(super) async fn get(
    job_id: &str,
    out: Option<String>,
    key_stdin: bool,
    env: &Environment,
    token: &CancellationToken,
) -> Result<Output> {
    let credentials = gateway_credentials(env, key_stdin, token).await?;
    let observed = media_client(None, token)?
        .gateway_job(
            gateway_key(&credentials)?,
            job_id,
            out.is_some(),
            token.clone(),
        )
        .await?;
    let directory = if observed
        .media
        .as_ref()
        .is_some_and(|media| !media.assets.is_empty())
    {
        gateway_directory(out).await?
    } else {
        None
    };
    let mut metadata = observed.receipt["operation"].clone();
    metadata["provider_id"] = json!("gg");
    gateway_output(observed, metadata, directory).await
}

pub(super) struct Input {
    value: Value,
    files: Vec<Parameter>,
}

pub(super) struct Replay {
    record: Value,
    id: String,
}

impl Replay {
    pub(super) async fn read(source: &str, token: &CancellationToken) -> Result<Self> {
        let record = files::read_input(source, token).await?;
        let invalid =
            || Error::usage("Use the original submission.json from a direct Gateway command.");
        if record["provider"] != "gg"
            || !matches!(
                (record["version"].as_u64(), record.get("descriptor")),
                (Some(1), None) | (Some(2), Some(Value::Object(_)))
            )
        {
            return Err(invalid());
        }
        let id = text(&record, "idempotency_key")
            .parse::<uuid::Uuid>()
            .map_err(|_| invalid())?
            .to_string();
        if record["idempotency_key"] != id {
            return Err(invalid());
        }
        Ok(Self { record, id })
    }

    pub(super) fn catalogue(&self) -> Result<Option<Catalog>> {
        self.record
            .get("descriptor")
            .map(|descriptor| Catalog::gateway_replay(descriptor.clone()).map_err(Error::from))
            .transpose()
    }

    fn matches(&self, record: &Value) -> bool {
        ["path", "body_sha256", "key_fingerprint"]
            .iter()
            .all(|field| self.record.get(field) == record.get(field))
    }
}

fn submission_record(
    descriptor: &Value,
    submission: &grida_ai::GatewaySubmission,
    id: &str,
    key: &str,
) -> Value {
    use sha2::{Digest, Sha256};
    let gateway = &descriptor["gateway_operation"];
    json!({
        "version": 2,
        "provider": "gg",
        "idempotency_key": id,
        "path": submission.path(),
        "body_sha256": format!("{:x}", Sha256::digest(submission.body())),
        "key_fingerprint": format!("{:x}", Sha256::digest([b"grida gateway retry v1:".as_slice(), key.as_bytes()].concat())),
        "descriptor": {
            "kind": descriptor["kind"],
            "model_id": descriptor["model_id"],
            "provider_id": descriptor["provider_id"],
            "binding_id": descriptor["binding_id"],
            "variant": descriptor["variant"],
            "feature": descriptor["feature"],
            "input_schema": descriptor["input_schema"],
            "gateway_operation": {
                "standalone": true,
                "id": gateway["id"],
                "path": gateway["path"],
                "interface": gateway["interface"],
                "file_fields": gateway["file_fields"],
            },
        },
    })
}

impl Input {
    pub(super) fn json(value: Value) -> Self {
        Self {
            value,
            files: Vec::new(),
        }
    }

    pub(super) fn mesh(value: Value, path: String) -> Self {
        Self {
            value,
            files: vec![Parameter {
                field: "mesh".into(),
                value: path,
            }],
        }
    }
}

pub(super) async fn read_input(
    descriptor: &Value,
    source: GenerationSource,
    mut files: Vec<Parameter>,
    token: &CancellationToken,
) -> Result<Input> {
    if let GenerationSource::Flags(mut flags) = source {
        let references = flags.references.take();
        let image = flags.image.take();
        let image_flag = references
            .as_ref()
            .map(|_| "--reference")
            .or_else(|| image.as_ref().map(|_| "--image"));
        // The shared parser reserves this field while the Gateway adapter
        // supplies the URL or multipart files before SDK validation.
        let mut value = input::read_flags(descriptor, &flags, image_flag, token).await?;
        if let Some(references) = references {
            files.extend(references.into_iter().map(|path| Parameter {
                field: "image[]".into(),
                value: path,
            }));
        }
        if let Some(image) = image {
            if input::https(&image) {
                if descriptor["input_schema"]["properties"]["image"]["type"] == "object" {
                    return Err(Error::usage(
                        "Use --input JSON for an HTTPS image with a media type.",
                    ));
                }
                value["image"] = json!(image);
            } else {
                files.push(Parameter {
                    field: "image".into(),
                    value: image,
                });
            }
        }
        Ok(Input { value, files })
    } else {
        Ok(Input {
            value: input::read(descriptor, &source, token).await?,
            files,
        })
    }
}

async fn gateway_files(
    descriptor: &Value,
    value: &Value,
    inputs: Vec<Parameter>,
    token: &CancellationToken,
) -> Result<Vec<grida_ai::GatewayFile>> {
    let gateway = &descriptor["gateway_operation"];
    let edit = gateway["interface"] == "images.edits";
    let max_files = if edit {
        descriptor["input_schema"]["properties"]["image"]["maxItems"]
            .as_u64()
            .unwrap_or(0)
            .min(16) as usize
    } else {
        4
    };
    if inputs.len() > max_files {
        return Err(Error::usage(format!(
            "This Gateway operation accepts at most {max_files} local files."
        )));
    }
    let mut fields = std::collections::HashSet::new();
    for file in &inputs {
        let field = file.field.as_str();
        let (object, name) = match field.split_once('.') {
            Some((parent, child)) => (&value[parent], child),
            None => (value, if field == "image[]" { "image" } else { field }),
        };
        let declared = if edit {
            field == "image[]"
        } else {
            gateway["file_fields"]
                .as_array()
                .is_some_and(|fields| fields.iter().any(|f| f == field))
        };
        if !declared || object.get(name).is_some() || (!edit && !fields.insert(field)) {
            return Err(Error::usage(
                "A local file requires a supported Gateway field with no other input source.",
            ));
        }
    }
    let mut files = Vec::with_capacity(inputs.len());
    let mut remaining = 84_934_656;
    for Parameter { field, value: path } in inputs {
        let file = if field == "mesh" {
            files::read_mesh(&path, remaining.min(60_000_000), token).await?
        } else {
            files::read_image(&path, remaining.min(20_000_000), token).await?
        };
        remaining -= file.data.len();
        files.push(grida_ai::GatewayFile {
            field,
            asset: grida_ai::Asset {
                data: file.data,
                media_type: file.media_type,
            },
        });
    }
    Ok(files)
}

async fn gateway_credentials(
    env: &Environment,
    stdin: bool,
    token: &CancellationToken,
) -> Result<Credentials> {
    Credentials::open(env, Some("gg"), stdin, token).await
}

fn gateway_key(credentials: &Credentials) -> Result<&str> {
    credentials.key("gg").ok_or_else(|| {
        let mut error = Error::new(
            "provider_key_required",
            "Supply GG_API_KEY, configure grida ai providers configure gg, or use --key-stdin.",
        )
        .origin(Origin::Ai);
        error.value["provider"] = json!("gg");
        error
    })
}

async fn gateway_directory(out: Option<String>) -> Result<Option<files::Directory>> {
    if let Some(out) = out {
        Ok(Some(
            tokio::task::spawn_blocking(move || {
                files::Directory::prepare(std::path::Path::new(&out))
            })
            .await
            .map_err(|_| unavailable())??,
        ))
    } else {
        Ok(None)
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn submit(
    catalog: &Catalog,
    descriptor: &Value,
    input: Input,
    out: Option<String>,
    replay: Option<Replay>,
    key_stdin: bool,
    env: &Environment,
    token: &CancellationToken,
) -> Result<Output> {
    let id = replay.as_ref().map_or_else(
        || uuid::Uuid::new_v4().to_string(),
        |replay| replay.id.clone(),
    );
    let files = gateway_files(descriptor, &input.value, input.files, token).await?;
    let submission =
        catalog.prepare_gateway(&input::selector(descriptor), input.value, files, &id)?;
    let mut directory = gateway_directory(out).await?;
    let abandon = |error| {
        if let Some(directory) = &directory {
            directory.abandon();
        }
        error
    };
    let credentials = gateway_credentials(env, key_stdin, token)
        .await
        .map_err(abandon)?;
    let key = gateway_key(&credentials).map_err(abandon)?;
    let receipt = submission_record(descriptor, &submission, &id, key);
    if replay
        .as_ref()
        .is_some_and(|replay| !replay.matches(&receipt))
    {
        return Err(abandon(Error::usage(
            "Gateway replay requires the original direct key, operation and exact input.",
        )));
    }
    if let Some(dir) = directory.take() {
        directory = Some(
            tokio::task::spawn_blocking(move || {
                if let Err(error) = dir.gateway_record("submission.json", &receipt) {
                    dir.abandon();
                    return Err(error);
                }
                Ok(dir)
            })
            .await
            .map_err(|_| unavailable())??,
        );
    }
    let result = media_client(None, token)?
        .execute_gateway(submission, key, &id, token.clone(), |accepted| {
            directory
                .as_ref()
                .is_none_or(|directory| directory.gateway_record("job.json", accepted).is_ok())
        })
        .await;
    let result = result.map_err(|e| {
        let mut error = Error::from(e);
        error.value["idempotency_key"] = json!(id);
        if let Some(directory) = &directory {
            error.value["submission"] = json!(directory.path.join("submission.json"));
        }
        error
    })?;
    let incomplete = result.media.is_none();
    let mut output = gateway_output(result, descriptor.clone(), directory).await?;
    if incomplete {
        output.exit = 1;
    }
    Ok(output)
}

async fn gateway_output(
    result: grida_ai::GatewayOutput,
    mut metadata: Value,
    directory: Option<files::Directory>,
) -> Result<Output> {
    let mut summary = result.receipt;
    let job_id = summary["job_id"].as_str().map(str::to_owned);
    let mut lines = Vec::new();
    if let Some(id) = &job_id {
        lines.push(format!("Job: {id}"));
    }
    if let Some(request) = summary["request_id"].as_str() {
        lines.push(format!("Request: {request}"));
    }
    if let Some(status) = summary["status"].as_str() {
        lines.push(format!("Status: {status}"));
    }
    if let Some(status) = summary["result_status"].as_str() {
        lines.push(format!("Result: {status}"));
    }
    if let Some(status) = summary["billing"]["status"].as_str() {
        lines.push(format!("Billing: {status}"));
    }
    let Some(media) = result.media else {
        return Ok(Output::new(summary, lines));
    };
    if let Some(findings) = media.findings {
        lines.push(format!("Riggable: {}", findings["riggable"]));
        lines.push(format!("Rig type: {}", text(&findings, "rig_type")));
        summary["findings"] = findings;
        return Ok(Output::new(summary, lines));
    }
    let mut directory = directory.ok_or_else(unavailable)?;
    let artifacts = media
        .assets
        .into_iter()
        .map(|a| files::Artifact {
            data: a.data,
            media_type: a.media_type,
        })
        .collect::<Vec<_>>();
    metadata["gateway"] = summary.clone();
    let result = tokio::task::spawn_blocking(move || directory.save(&metadata, &artifacts))
        .await
        .map_err(|_| unavailable())?;
    let value = result.map_err(|error| {
        let mut error = Error::from(error);
        error.value["gateway"] = summary;
        error
    })?;
    if let Some(artifacts) = value["artifacts"].as_array() {
        lines.extend(artifacts.iter().map(|a| text(a, "path").to_owned()));
    }
    lines.push(format!(
        "Receipt: {}/receipt.json",
        text(&value, "directory")
    ));
    Ok(Output::new(value, lines))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn gateway_image_flags_satisfy_required_inputs_and_preserve_wire_shape() {
        use base64::{Engine, engine::general_purpose::STANDARD};

        let token = CancellationToken::new();
        let temp = tempfile::tempdir().unwrap();
        let image = temp.path().join("input.png");
        std::fs::write(
            &image,
            STANDARD.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=").unwrap(),
        )
        .unwrap();
        let source_url = "https://media.example.invalid/image.png";
        for (kind, variant, route, interface, flag, source, image_schema, file_field) in [
            (
                "image",
                "references",
                "/v1/images/edits",
                "images.edits",
                "--reference",
                image.to_str().unwrap(),
                json!({"type":"array","minItems":1,"maxItems":2,"items":{"type":"string"}}),
                Some("image[]"),
            ),
            (
                "video",
                "image",
                "/v1/videos",
                "videos",
                "--image",
                image.to_str().unwrap(),
                json!({"type":"string"}),
                Some("image"),
            ),
            (
                "video",
                "image",
                "/v1/videos",
                "videos",
                "--image",
                source_url,
                json!({"type":"string"}),
                None,
            ),
        ] {
            let descriptor = json!({
                "kind":kind, "model_id":"lab/model", "provider_id":"gg", "variant":variant,
                "input_schema":{"type":"object","additionalProperties":false,"required":["prompt","image"],
                    "properties":{"image":image_schema,"prompt":{"type":"string"}}},
                "gateway_operation":{"standalone":true,"id":"fixture.operation","path":route,
                    "interface":interface,"file_fields":["image"]},
            });
            let catalog = Catalog::gateway_replay(descriptor.clone()).unwrap();
            let invocation = crate::parse(
                &[
                    "ai",
                    "generate",
                    "--provider",
                    "gg",
                    "--model",
                    "lab/model",
                    "--prompt",
                    "fixture",
                    flag,
                    source,
                    "--out",
                    "unused",
                ]
                .map(str::to_owned),
            )
            .unwrap();
            let crate::Command::Generate {
                model,
                source,
                gateway_files: files,
                ..
            } = invocation.command
            else {
                panic!("expected generate command");
            };
            let selected = input::inspect(&catalog, &model, Some(&source)).unwrap();
            let input = read_input(&selected, source, files, &token).await.unwrap();
            let files = gateway_files(&selected, &input.value, input.files, &token)
                .await
                .unwrap();
            let wire = catalog
                .prepare_gateway(
                    &input::selector(&selected),
                    input.value,
                    files,
                    "fixture-boundary",
                )
                .unwrap();
            assert_eq!(wire.path(), route);
            if let Some(field) = file_field {
                assert!(
                    String::from_utf8_lossy(wire.body())
                        .contains(&format!("name=\"{field}\"; filename=\"input\""))
                );
            } else {
                let body: Value = serde_json::from_slice(wire.body()).unwrap();
                assert_eq!(
                    body,
                    json!({"model":"lab/model","prompt":"fixture","image":source_url})
                );
            }
        }
    }

    #[tokio::test]
    async fn replay_rebuilds_original_body_and_bypasses_live_discovery() {
        let token = CancellationToken::new();
        let id = "4359db86-44f3-4bef-8d7d-44368dfad5dd";
        let key = "sk-gg-v1-original-fixture";
        let descriptor = json!({
            "kind": "video", "model_id": "lab/withdrawn-video",
            "provider_id": "gg", "binding_id": "lab/withdrawn-video", "variant": "text",
            "input_schema": {
                "type": "object", "additionalProperties": false, "required": ["prompt"],
                "properties": {"prompt": {"type": "string"}, "duration": {"type": "integer", "default": 5}},
            },
            "gateway_operation": {
                "id": "video.lab.withdrawn-video.text", "standalone": true,
                "path": "/v1/videos", "interface": "videos", "file_fields": [],
            },
        });
        let catalog = Catalog::gateway_replay(descriptor.clone()).unwrap();
        let body = json!({"prompt": "fixture prompt"});
        let selection = input::selector(&descriptor);
        let original = catalog
            .prepare_gateway(&selection, body.clone(), vec![], id)
            .unwrap();
        let record = submission_record(&descriptor, &original, id, key);
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("submission.json");
        let serialized = record.to_string();
        assert!(!serialized.contains("fixture prompt") && !serialized.contains(key));
        std::fs::write(&path, serialized).unwrap();
        let receipt_arg = format!("@{}", path.display());
        let replay = Replay::read(&receipt_arg, &token).await.unwrap();
        let restored = replay.catalogue().unwrap().unwrap();
        let recovered = restored
            .prepare_gateway(&selection, body, vec![], &replay.id)
            .unwrap();
        assert_eq!(replay.id, id);
        assert_eq!(recovered.path(), original.path());
        assert_eq!(recovered.body(), original.body());
        assert!(replay.matches(&submission_record(&descriptor, &recovered, id, key)));

        let mut untrusted = record["descriptor"].clone();
        untrusted["gateway_operation"]["path"] = json!("/v1/chat/completions");
        assert!(Catalog::gateway_replay(untrusted).is_err());

        let output = temp.path().join("retry");
        let invocation = crate::parse(
            &[
                "ai",
                "generate",
                "--provider",
                "gg",
                "--model",
                "lab/withdrawn-video",
                "--kind",
                "video",
                "--prompt",
                "fixture prompt",
                "--out",
                output.to_str().unwrap(),
                "--retry-submission",
                &receipt_arg,
            ]
            .map(str::to_owned),
        )
        .unwrap();
        let env = Environment::from([
            (
                "GRIDA_CLI_LOCAL_CONFIG".into(),
                "invalid-if-discovery-runs".into(),
            ),
            ("GG_API_KEY".into(), "sk-gg-v1-different-fixture".into()),
        ]);
        // The invalid discovery configuration is never opened. The mismatched
        // key stops the real command at replay admission, before any paid POST.
        let result = super::super::execute(
            invocation,
            env,
            token,
            std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        )
        .await;
        assert!(matches!(result, Err(error) if error.value["message"]
            == "Gateway replay requires the original direct key, operation and exact input."));
        assert!(!output.exists());
    }

    #[tokio::test]
    async fn local_files_are_admitted_only_by_explicit_flags() {
        let descriptor =
            json!({"gateway_operation":{"interface":"videos","file_fields":["image"]}});
        let input = Input::json(json!({"image":"@does-not-exist.png"}));
        let token = CancellationToken::new();
        let files = gateway_files(&descriptor, &input.value, input.files, &token)
            .await
            .unwrap();
        assert!(files.is_empty());
        assert_eq!(input.value["image"], "@does-not-exist.png");

        let duplicate = Parameter {
            field: "image".into(),
            value: "does-not-exist.png".into(),
        };
        let result = gateway_files(&descriptor, &input.value, vec![duplicate], &token).await;
        assert!(matches!(result, Err(error) if error.value["code"] == "invalid_usage"));
    }
}
