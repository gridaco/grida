// GRIDA-SEC-013 — schema-guided flags grant only explicitly selected file reads.
use crate::{
    GenerationSource, ModelSelection, Request,
    error::{Error, Result},
    files,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use grida_ai::{Catalog, Filter, Selector};
use serde_json::{Map, Value, json};
use std::collections::HashSet;
use tokio_util::sync::CancellationToken;

pub fn inspect(
    catalog: &Catalog,
    model: &ModelSelection,
    source: Option<&GenerationSource>,
) -> Result<Value> {
    let candidates = catalog.list(&Filter {
        model_id: Some(model.model.clone()),
        provider: Some(model.provider.as_str().into()),
        kind: model.kind.map(|v| v.as_str().into()),
        ..Default::default()
    })?;
    let kinds: HashSet<_> = candidates
        .iter()
        .map(|d| d["kind"].as_str().unwrap_or(""))
        .collect();
    if kinds.is_empty() {
        return Err(Error::new(
            "operation_unavailable",
            "This provider/model/input variant has no supported operation. Run grida models list.",
        ));
    }
    if kinds.len() != 1 {
        return Err(Error::usage(
            "Choose the operation with --kind; run grida models list.",
        ));
    }
    let kind = *kinds.iter().next().unwrap();
    let mut variant = model.variant.map(|v| v.as_str());
    if let Some(GenerationSource::Flags(request)) = source {
        let inferred = if request.references.is_some() {
            Some("references")
        } else if request.image.is_some() {
            Some("image")
        } else {
            None
        };
        if let Some(inferred) = inferred {
            if variant.is_some_and(|v| v != inferred) {
                return Err(Error::usage(
                    "The media flag conflicts with --variant; select a compatible input variant.",
                ));
            }
            if inferred == "references" && kind != "image" {
                return Err(Error::usage(
                    "--reference selects image-generation references. Inspect this operation for its media inputs.",
                ));
            }
            if inferred == "image" && !["video", "three-d"].contains(&kind) {
                return Err(Error::usage(
                    "--image selects a video or 3D image input. Use --reference for image-generation references.",
                ));
            }
            variant = Some(inferred);
        }
    }
    let variant = variant.unwrap_or_else(|| {
        if kind == "three-d" {
            if candidates.iter().any(|d| d["variant"] == "text") {
                "text"
            } else {
                candidates[0]["variant"].as_str().unwrap_or("")
            }
        } else {
            "text"
        }
    });
    let d=candidates.iter().find(|d|d["variant"]==variant).ok_or_else(||Error::new("operation_unavailable","This provider/model/input variant has no supported operation. Run grida models list."))?;
    Ok(catalog.inspect(&selector(d))?)
}
pub fn selector(d: &Value) -> Selector {
    Selector {
        kind: text(d, "kind").into(),
        model_id: text(d, "model_id").into(),
        provider: text(d, "provider_id").into(),
        variant: d["variant"].as_str().map(String::from),
        feature: d["feature"].as_str().map(String::from),
    }
}
fn text<'a>(v: &'a Value, k: &str) -> &'a str {
    v[k].as_str().unwrap_or("")
}
pub fn local_flags(d: &Value) -> Vec<&'static str> {
    let p = &d["input_schema"]["properties"];
    let mut result = vec![];
    if p["references"]["items"]["x-grida-url"]["schemes"]
        .as_array()
        .is_some_and(|v| v.iter().any(|s| s == "image-data"))
    {
        result.push("--reference");
    }
    if p["image"]["properties"]["data"]["x-grida-decoded-max-bytes"].is_number() {
        result.push("--image");
    }
    result
}
fn claim<'a>(
    properties: &'a Value,
    claimed: &mut HashSet<String>,
    field: &str,
    flag: &str,
) -> Result<&'a Value> {
    let schema = properties.get(field).ok_or_else(|| {
        Error::usage(format!(
            "{flag} is not supported by this operation. Run grida models inspect for its inputs."
        ))
    })?;
    if !claimed.insert(field.into()) {
        return Err(Error::usage(format!(
            "The {field} field was supplied more than once; choose one input source."
        )));
    }
    Ok(schema)
}
fn scalar(value: &str, schema: &Value, field: &str) -> Result<Value> {
    match schema["type"].as_str() {
        Some("string") => Ok(json!(value)),
        Some("boolean") if ["true", "false"].contains(&value) => Ok(json!(value == "true")),
        Some("number" | "integer") => {
            if let Ok(Value::Number(n)) = serde_json::from_str::<Value>(value)
                && n.as_f64().is_some_and(f64::is_finite)
                && !value.starts_with(char::is_whitespace)
                && !value.ends_with(char::is_whitespace)
            {
                return Ok(Value::Number(n));
            }
            Err(Error::usage(format!(
                "The {field} field needs a {} value. Run grida models inspect for its schema.",
                text(schema, "type")
            )))
        }
        Some("boolean") => Err(Error::usage(format!(
            "The {field} field needs a boolean value. Run grida models inspect for its schema."
        ))),
        _ => Err(Error::usage(format!(
            "The {field} field needs structured input; use --input @file|- and the model schema."
        ))),
    }
}
fn budget(value: &Map<String, Value>, bytes: usize) -> Result<()> {
    if bytes > files::TEXT_LIMIT
        || serde_json::to_vec(value).map_or(true, |v| v.len() > files::TEXT_LIMIT)
    {
        return Err(Error::usage(
            "The assembled input exceeds 16 MiB, including encoded images. Use smaller files or supported HTTPS references.",
        ));
    }
    Ok(())
}
fn file_error(e: files::Error, flag: &str) -> Error {
    if e.code == "cancelled" {
        e.into()
    } else {
        Error::usage(format!(
            "{flag}: cannot read this input. Use a readable regular file of the documented type and size; text must be UTF-8."
        ))
    }
}
async fn image(
    source: &str,
    flag: &str,
    remaining: usize,
    token: &CancellationToken,
) -> Result<files::Artifact> {
    if source.contains("://") || source.starts_with("data:") {
        return Err(Error::usage(format!(
            "{flag} requires a local image file or a supported HTTPS URL. Inline data belongs in --input JSON."
        )));
    }
    files::read_image(source, remaining, token)
        .await
        .map_err(|e| file_error(e, flag))
}
fn https(v: &str) -> bool {
    v.get(..8)
        .is_some_and(|s| s.eq_ignore_ascii_case("https://"))
}
pub async fn read(
    descriptor: &Value,
    source: &GenerationSource,
    token: &CancellationToken,
) -> Result<Value> {
    let GenerationSource::Flags(r) = source else {
        let GenerationSource::Json(s) = source else {
            unreachable!()
        };
        return Ok(files::read_input(s, token).await?);
    };
    read_flags(descriptor, r, token).await
}
async fn read_flags(d: &Value, r: &Request, token: &CancellationToken) -> Result<Value> {
    let p = &d["input_schema"]["properties"];
    let mut claimed = HashSet::new();
    let mut value = Map::new();
    for (yes, field, flag) in [
        (
            r.prompt.is_some() || r.prompt_file.is_some(),
            "prompt",
            "--prompt/--prompt-file",
        ),
        (
            r.text.is_some() || r.text_file.is_some(),
            "text",
            "--text/--text-file",
        ),
        (r.voice.is_some(), "voice_id", "--voice"),
    ] {
        if yes {
            claim(p, &mut claimed, field, flag)?;
        }
    }
    if let Some(refs) = &r.references {
        let s = claim(p, &mut claimed, "references", "--reference")?;
        if s["type"] != "array" {
            return Err(Error::usage(
                "This operation does not accept a list of references.",
            ));
        }
        if s["maxItems"]
            .as_u64()
            .is_some_and(|n| refs.len() as u64 > n)
        {
            return Err(Error::usage(format!(
                "--reference accepts at most {} images for this operation.",
                s["maxItems"]
            )));
        }
    }
    let image_field = r
        .image
        .as_ref()
        .map(|s| if https(s) { "image_url" } else { "image" });
    if let Some(field) = image_field {
        claim(p, &mut claimed, field, "--image in this file or URL form")?;
    }
    for parameter in &r.parameters {
        let schema = claim(p, &mut claimed, &parameter.field, "--param field")?;
        value.insert(
            parameter.field.clone(),
            scalar(&parameter.value, schema, &parameter.field)?,
        );
    }
    for (field, data) in [
        ("prompt", &r.prompt),
        ("text", &r.text),
        ("voice_id", &r.voice),
    ] {
        if let Some(s) = data {
            value.insert(field.into(), json!(s));
        }
    }
    let mut read_bytes = 0;
    budget(&value, read_bytes)?;
    for (field, path, flag) in [
        ("prompt", &r.prompt_file, "--prompt-file"),
        ("text", &r.text_file, "--text-file"),
    ] {
        if let Some(path) = path {
            value.insert(
                field.into(),
                json!(
                    files::read_text(path, token)
                        .await
                        .map_err(|e| file_error(e, flag))?
                ),
            );
        }
    }
    budget(&value, read_bytes)?;
    if let Some(refs) = &r.references {
        value.insert("references".into(), json!([]));
        for source in refs {
            let reference = if https(source) {
                source.clone()
            } else {
                let asset = image(
                    source,
                    "--reference",
                    files::TEXT_LIMIT.saturating_sub(read_bytes),
                    token,
                )
                .await?;
                read_bytes += asset.data.len();
                budget(&value, read_bytes)?;
                format!(
                    "data:{};base64,{}",
                    asset.media_type,
                    STANDARD.encode(&asset.data)
                )
            };
            value
                .get_mut("references")
                .unwrap()
                .as_array_mut()
                .unwrap()
                .push(json!(reference));
            budget(&value, read_bytes)?;
        }
    }
    if let Some(source) = &r.image {
        if image_field == Some("image_url") {
            value.insert("image_url".into(), json!(source));
        } else {
            let asset = image(
                source,
                "--image",
                files::TEXT_LIMIT.saturating_sub(read_bytes),
                token,
            )
            .await?;
            read_bytes += asset.data.len();
            let fields = &p["image"]["properties"];
            if fields["data"]["x-grida-decoded-max-bytes"]
                .as_u64()
                .is_some_and(|n| asset.data.len() as u64 > n)
            {
                return Err(Error::usage(format!(
                    "--image exceeds this operation's decoded limit of {} bytes.",
                    fields["data"]["x-grida-decoded-max-bytes"]
                )));
            }
            if fields["media_type"]["enum"]
                .as_array()
                .is_some_and(|types| !types.iter().any(|t| t == &asset.media_type))
            {
                return Err(Error::usage(
                    "--image has a media type this operation does not accept. Run grida models inspect for accepted types.",
                ));
            }
            value.insert(
                "image".into(),
                json!({"data":STANDARD.encode(&asset.data),"media_type":asset.media_type}),
            );
        }
    }
    budget(&value, read_bytes)?;
    if let Some(required) = d["input_schema"]["required"].as_array() {
        let missing: Vec<_> = required
            .iter()
            .filter_map(Value::as_str)
            .filter(|f| !value.contains_key(*f))
            .collect();
        if !missing.is_empty() {
            return Err(Error::usage(format!(
                "Missing required input: {}. Run grida models inspect for an example.",
                missing.join(", ")
            )));
        }
    }
    Ok(Value::Object(value))
}

pub fn describe(d: &Value) -> Vec<String> {
    let p = &d["input_schema"]["properties"];
    let local = local_flags(d);
    let required = d["input_schema"]["required"].as_array();
    let mut lines = vec![
        format!(
            "{}: {} / {} ({})",
            text(d, "kind"),
            text(d, "provider_id"),
            text(d, "model_id"),
            text(d, "variant")
        ),
        format!("Status: {}", text(d, "status")),
        "Inputs:".into(),
    ];
    if let Some(properties) = p.as_object() {
        for (field, s) in properties {
            let mut details = vec![
                s["type"].as_str().unwrap_or("structured").into(),
                if required.is_some_and(|r| r.iter().any(|v| v == field)) {
                    "required"
                } else {
                    "optional"
                }
                .into(),
            ];
            if let Some(values) = s["enum"].as_array() {
                details.push(format!(
                    "one of {}",
                    values
                        .iter()
                        .map(Value::to_string)
                        .collect::<Vec<_>>()
                        .join(", ")
                ));
            }
            if let Some(default) = s.get("default") {
                details.push(format!("default {default}"));
            }
            for key in ["minimum", "maximum", "minItems", "maxItems", "maxLength"] {
                if s[key].is_number() {
                    details.push(format!("{key} {}", s[key]));
                }
            }
            match field.as_str() {
                "references" => details.push(
                    if local.contains(&"--reference") {
                        "--reference FILE or HTTPS-URL; repeat in order"
                    } else {
                        "--reference HTTPS-URL; repeat in order"
                    }
                    .into(),
                ),
                "image_url" => details.push("--image HTTPS-URL".into()),
                "image" => {
                    details.push("--image FILE".into());
                    let nested = &s["properties"];
                    let maximum = &nested["data"]["x-grida-decoded-max-bytes"];
                    if maximum.is_number() {
                        details.push(format!("decoded maximum {maximum} bytes"));
                    }
                    if let Some(types) = nested["media_type"]["enum"].as_array() {
                        details.push(
                            types
                                .iter()
                                .filter_map(Value::as_str)
                                .collect::<Vec<_>>()
                                .join(", "),
                        );
                    }
                }
                _ => {}
            }
            lines.push(format!("  {field}: {}", details.join("; ")));
        }
    }
    if p.get("image").is_some() && p.get("image_url").is_some() {
        lines.push("Supply exactly one image file or HTTPS URL.".into());
    }
    let quote = |s: &str| format!("'{}'", s.replace('\'', "'\\''"));
    let mut example = vec![
        "grida generate".into(),
        "--provider".into(),
        quote(text(d, "provider_id")),
        "--model".into(),
        quote(text(d, "model_id")),
    ];
    if d["variant"] != "text" {
        example.extend(["--variant".into(), quote(text(d, "variant"))]);
    }
    if d["variant"] == "multiview" {
        example.extend(["--input".into(), "@input.json".into()]);
    } else if p.get("prompt").is_some() {
        example.extend(["--prompt".into(), quote("Describe what to generate")]);
    }
    for (field, flag, value) in [
        ("text", "--text", "Hello from Grida"),
        ("voice_id", "--voice", "YOUR_VOICE_ID"),
    ] {
        if p.get(field).is_some() {
            example.extend([flag.into(), quote(value)]);
        }
    }
    if p.get("references").is_some() {
        example.extend([
            "--reference".into(),
            if local.contains(&"--reference") {
                "./reference.png".into()
            } else {
                quote("https://example.com/reference.png")
            },
        ]);
    }
    if p.get("image").is_some() {
        example.extend(["--image".into(), "./input.png".into()]);
    } else if p.get("image_url").is_some() {
        example.extend(["--image".into(), quote("https://example.com/input.png")]);
    }
    example.extend(["--out".into(), "./result".into()]);
    lines.extend(["".into(),"Example:".into(),format!("  {}",example.join(" ")),"".into(),"--param FIELD=VALUE sets an advertised scalar input. Use --input @file|- for complex JSON.".into()]);
    if d["variant"] == "multiview" {
        lines.push("Multiview inputs use --input JSON with inline image data; JSON strings do not grant local file reads.".into());
    }
    lines.extend(if local.is_empty(){["This operation does not accept local image files.","Total assembled input: 16 MiB."]}else{["Local images: PNG/JPEG/static WebP, at most 8 MiB each (operation limits may be lower).","Total assembled input: 16 MiB including base64. Paths are relative to the working directory."]}.map(String::from));
    lines
}
#[cfg(test)]
mod tests {
    use super::*;
    fn flags() -> Request {
        Request {
            prompt: None,
            prompt_file: None,
            text: None,
            text_file: None,
            references: None,
            image: None,
            voice: None,
            parameters: vec![],
        }
    }
    #[tokio::test]
    async fn collision_and_unsupported_fields_fail_before_file_reads() {
        let d = json!({"input_schema":{"properties":{"prompt":{"type":"string"}},"required":["prompt"]}});
        let mut r = flags();
        r.prompt_file = Some("/missing/never-read".into());
        r.parameters.push(crate::Parameter {
            field: "prompt".into(),
            value: "x".into(),
        });
        let e = read_flags(&d, &r, &CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(
            e.value["message"],
            "The prompt field was supplied more than once; choose one input source."
        );
        r.parameters.clear();
        r.image = Some("/also-not-read".into());
        assert!(
            read_flags(&d, &r, &CancellationToken::new())
                .await
                .unwrap_err()
                .value["message"]
                .as_str()
                .unwrap()
                .starts_with("--image in this file or URL form is not supported")
        );
    }
    #[test]
    fn scalar_parameters_never_grant_structured_values() {
        assert_eq!(
            scalar("false", &json!({"type":"boolean"}), "a").unwrap(),
            json!(false)
        );
        for value in [" 1", "01", "Infinity", "NaN", "0x10"] {
            assert!(scalar(value, &json!({"type":"number"}), "a").is_err());
        }
        assert!(scalar("{}", &json!({"type":"object"}), "a").is_err());
    }
}
