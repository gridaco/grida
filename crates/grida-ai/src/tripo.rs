// GRIDA-SEC-004 / GRIDA-SEC-006 — explicit provider authority and safe scoped results.
// GRIDA-GG: provider — explicit scoped invocation authority; no account token or credential persistence.
use crate::{
    Asset, Failure, Lane, MediaResult, Parsed, Request, Result, TaskReceipt, input, invalid,
    media::{ENVELOPE_BYTES, MEDIA_BYTES, Session, allowed, copy, headers},
};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    sync::atomic::{AtomicU64, Ordering},
};

pub(crate) fn identifier(value: &Value, prefix: &str) -> Result<String> {
    let s = value.as_str().ok_or_else(invalid)?;
    let uuid =
        regex::Regex::new(r"(?i)^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$")
            .expect("constant regex");
    let patterned = s.strip_prefix(&format!("{prefix}_")).is_some_and(|r| {
        !r.is_empty()
            && r.len() <= 100
            && r.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    });
    if !uuid.is_match(s) && !patterned {
        return Err(invalid());
    }
    Ok(s.into())
}
fn receipt(v: &Value, require_credits: bool) -> Result<TaskReceipt> {
    let id = identifier(&v["id"], "task")?;
    let credits = if let Some(raw) = v.get("credits_consumed") {
        Some(
            raw.as_f64()
                .filter(|v| v.is_finite() && *v >= 0.0)
                .ok_or_else(|| invalid().task(&id))?,
        )
    } else {
        if require_credits {
            return Err(invalid().task(&id));
        }
        None
    };
    Ok(TaskReceipt {
        id,
        credits_consumed: credits,
    })
}
pub(crate) async fn execute(
    s: &Session<'_>,
    p: &Parsed,
    key: &str,
    base: Option<&str>,
) -> Result<MediaResult> {
    if let Some(base) = base {
        return gateway(s, p, key, base).await;
    }
    let feature = p.descriptor["feature"].as_str().ok_or_else(invalid)?;
    let variant = p.descriptor["variant"].as_str().ok_or_else(invalid)?;
    let mut body = json!({});
    let path;
    if feature == "model-generation" {
        body["model"] = p.binding_id().into();
        body["texture"] = p.input.get("texture").cloned().unwrap_or(true.into());
        body["pbr"] = p
            .input
            .get("pbr")
            .or_else(|| p.input.get("texture"))
            .cloned()
            .unwrap_or(true.into());
        copy(
            &p.input,
            &mut body,
            &[
                ("texture_quality", "texture_quality"),
                ("face_limit", "face_limit"),
                ("seed", "model_seed"),
                ("geometry_quality", "geometry_quality"),
                ("prompt", "prompt"),
            ],
        );
        if variant == "image" {
            body["input"] = upload(s, key, &p.input["image"]).await?.into();
        } else if variant == "multiview" {
            let mut inputs = Vec::new();
            for view in ["front", "left", "back", "right"] {
                if let Some(image) = p.input["images"].get(view) {
                    inputs.push(json!({view:upload(s,key,image).await?}));
                }
            }
            body["inputs"] = inputs.into();
        }
        path = format!("/generation/{variant}-to-model");
    } else {
        let token = upload(s, key, &p.input["mesh"]).await?;
        if token.contains(key) {
            return Err(input::bad());
        }
        body["input"] = token.into();
        if feature == "rig-check" {
            path = "/animations/rig-check".into();
        } else {
            path = "/animations/rig".into();
            body["model"] = p.binding_id().into();
            body["out_format"] = "glb".into();
            copy(
                &p.input,
                &mut body,
                &[("rig_type", "rig_type"), ("spec", "spec")],
            );
        }
    }
    let submitted = tripo_json(
        s,
        key,
        &path,
        "POST",
        Some(serde_json::to_vec(&body).map_err(|_| input::bad())?),
        "application/json",
    )
    .await?;
    let task_id = identifier(&submitted["task_id"], "task")?;
    if task_id.contains(key) {
        return Err(invalid());
    }
    let mut completed = None;
    let outcome = async {
        loop {
            let task = tripo_json(
                s,
                key,
                &format!("/tasks/{task_id}"),
                "GET",
                None,
                "application/json",
            )
            .await?;
            let expected = match feature {
                "rig-check" => vec!["rig_check".into(), "animate_prerigcheck".into()],
                "rigging" => vec!["rig".into(), "animate_rig".into()],
                _ => vec![format!("{variant}_to_model")],
            };
            if task["task_id"] != task_id || !expected.iter().any(|v| task["type"] == *v) {
                return Err(invalid());
            }
            match task["status"].as_str() {
                Some("success") => {
                    let mut r = json!({"id":task_id});
                    if let Some(c) = task.get("credits_consumed") {
                        r["credits_consumed"] = c.clone();
                    }
                    let receipt = receipt(&r, false)?;
                    completed = Some(receipt.clone());
                    if feature == "rig-check" {
                        let findings = check_findings(&task["output"])?;
                        return Ok(MediaResult {
                            field: "findings".into(),
                            assets: vec![],
                            task: Some(receipt),
                            findings: Some(findings),
                        });
                    }
                    let url = task["output"]["model_url"].as_str().ok_or_else(invalid)?;
                    allowed(url, &["cdn.tripo3d.ai", "tripo-data.rg1.data.tripo3d.com"])?;
                    let asset = s.download(url, MEDIA_BYTES).await?;
                    input::validate_glb(&asset.data).map_err(|_| invalid())?;
                    return Ok(MediaResult {
                        field: "glb".into(),
                        assets: vec![Asset {
                            data: asset.data,
                            media_type: "model/gltf-binary".into(),
                        }],
                        task: Some(receipt),
                        findings: None,
                    });
                }
                Some("failed" | "cancelled" | "banned" | "expired") => {
                    return Err(Failure::new("generation_failed"));
                }
                Some("queued" | "running") => {
                    if !task["progress"].as_u64().is_some_and(|v| v <= 100) {
                        return Err(invalid());
                    }
                    s.sleep(2000).await?;
                }
                _ => return Err(invalid()),
            }
        }
    }
    .await;
    outcome.map_err(|e: Failure| e.task(&task_id).completed(completed))
}
async fn tripo_json(
    s: &Session<'_>,
    key: &str,
    path: &str,
    method: &str,
    body: Option<Vec<u8>>,
    content_type: &str,
) -> Result<Value> {
    let mut h = headers("tripo", key);
    h.insert("accept".into(), "application/json".into());
    if body.is_some() {
        h.insert("content-type".into(), content_type.into());
    } else {
        h.remove("content-type");
    }
    let r = s
        .send(Request {
            completion: crate::ResponseCompletion::Body,
            lane: Lane::Provider,
            method: method.into(),
            url: format!("https://openapi.tripo3d.ai/v3{path}"),
            headers: h,
            body: body.unwrap_or_default(),
            max_bytes: 1048576,
        })
        .await?;
    if r.status == 401 {
        return Err(Failure::new("credential_rejected"));
    }
    if r.status == 503 {
        return Err(Failure::new("provider_unavailable"));
    }
    let v: Value = serde_json::from_slice(&r.body).map_err(|_| {
        if r.status == 403 {
            Failure::new("access_denied")
        } else {
            invalid()
        }
    })?;
    match v["code"].as_i64() {
        Some(1000 | 1001) => return Err(Failure::new("credential_rejected")),
        Some(2010) => return Err(Failure::new("insufficient_credits")),
        None => return Err(invalid()),
        _ => {}
    }
    if r.status == 403 {
        return Err(Failure::new("access_denied"));
    }
    if !(200..300).contains(&r.status) || v["code"] != 0 {
        return Err(Failure::new("generation_failed"));
    }
    if !v["data"].is_object() {
        return Err(invalid());
    }
    Ok(v["data"].clone())
}
async fn upload(s: &Session<'_>, key: &str, file: &Value) -> Result<String> {
    let media = file["media_type"].as_str().ok_or_else(input::bad)?;
    let data = input::decode(file["data"].as_str().ok_or_else(input::bad)?, 60_000_000)?;
    static SEQUENCE: AtomicU64 = AtomicU64::new(1);
    let mut boundary = format!("grida-tripo-{}", SEQUENCE.fetch_add(1, Ordering::Relaxed));
    while data
        .windows(boundary.len())
        .any(|v| v == boundary.as_bytes())
    {
        boundary.push('x');
    }
    let name = match media {
        "model/gltf-binary" => "mesh.glb",
        "image/png" => "image.png",
        "image/jpeg" => "image.jpg",
        _ => return Err(input::bad()),
    };
    let mut body=format!("--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\nContent-Type: {media}\r\n\r\n").into_bytes();
    body.extend_from_slice(&data);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    let v = tripo_json(
        s,
        key,
        "/files",
        "POST",
        Some(body),
        &format!("multipart/form-data; boundary={boundary}"),
    )
    .await?;
    identifier(&v["file_token"], "file")
}
async fn gateway(s: &Session<'_>, p: &Parsed, key: &str, base: &str) -> Result<MediaResult> {
    let feature = p.descriptor["feature"].as_str().ok_or_else(invalid)?;
    let mut encoded = p.input.clone();
    if let Some(image) = p.input.get("image") {
        encoded["image"] = gg_upload(s, key, base, image).await?;
    }
    if let Some(mesh) = p.input.get("mesh") {
        encoded["mesh"] = gg_upload(s, key, base, mesh).await?;
    }
    if let Some(images) = p.input["images"].as_object() {
        for (view, image) in images {
            encoded["images"][view] = gg_upload(s, key, base, image).await?;
        }
    }
    let mut body = json!({"input":encoded});
    if feature != "rig-check" {
        body["model_id"] = p.model_id().into();
    }
    if feature == "model-generation" {
        body["variant"] = p.descriptor["variant"].clone();
    }
    let v = gg_post(
        s,
        key,
        base,
        &format!("/{feature}"),
        &body,
        if feature == "rig-check" {
            16384
        } else {
            ENVELOPE_BYTES
        },
    )
    .await?;
    let receipt = receipt(&v["task"], true)?;
    let task_id = receipt.id.clone();
    let completed = Some(receipt.clone());
    let outcome = (|| {
        if v["provider_id"] != "gg"
            || v["feature"] != feature
            || feature != "rig-check" && v["model_id"] != p.model_id()
            || feature == "model-generation" && v["variant"] != p.descriptor["variant"]
        {
            return Err(invalid());
        }
        if feature == "rig-check" {
            return Ok(MediaResult {
                field: "findings".into(),
                assets: vec![],
                task: Some(receipt),
                findings: Some(check_findings(&v)?),
            });
        }
        if v["glb"]["media_type"] != "model/gltf-binary" {
            return Err(invalid());
        }
        let data = input::decode(
            v["glb"]["base64"].as_str().ok_or_else(invalid)?,
            MEDIA_BYTES,
        )
        .map_err(|_| invalid())?;
        input::validate_glb(&data).map_err(|_| invalid())?;
        Ok(MediaResult {
            field: "glb".into(),
            assets: vec![Asset {
                data,
                media_type: "model/gltf-binary".into(),
            }],
            task: Some(receipt),
            findings: None,
        })
    })();
    outcome.map_err(|e: Failure| e.task(&task_id).completed(completed))
}
async fn gg_post(
    s: &Session<'_>,
    key: &str,
    base: &str,
    path: &str,
    body: &Value,
    max: usize,
) -> Result<Value> {
    let r = s
        .send(Request {
            completion: crate::ResponseCompletion::Body,
            lane: Lane::Provider,
            method: "POST".into(),
            url: format!("{base}/api/v1/ai/3d{path}"),
            headers: headers("gg", key),
            body: serde_json::to_vec(body).map_err(|_| input::bad())?,
            max_bytes: max,
        })
        .await?;
    if r.status == 401 {
        return Err(Failure::new("gg_token_expired"));
    }
    if r.status == 402 {
        return Err(Failure::new("insufficient_credits"));
    }
    let v: Value = serde_json::from_slice(&r.body).map_err(|_| invalid())?;
    if !v.is_object() {
        return Err(invalid());
    }
    let error = v.get("error").filter(|v| v.is_object()).unwrap_or(&v);
    if !(200..300).contains(&r.status) || error["code"].is_string() {
        let c = error["code"].as_str().unwrap_or("");
        let c = match c {
            "invalid_request" => "invalid_input",
            "invalid_input"
            | "model_unavailable"
            | "provider_unavailable"
            | "provider_key_required"
            | "credential_rejected"
            | "access_denied"
            | "insufficient_credits"
            | "gg_token_expired"
            | "aborted"
            | "timeout"
            | "invalid_response"
            | "generation_failed" => c,
            _ => "generation_failed",
        };
        let mut e = Failure::new(c);
        if let Ok(id) = identifier(&error["task_id"], "task") {
            e = e.task(&id);
            if let Ok(completed) = receipt(&error["completed_task"], false)
                && completed.id == id
            {
                e = e.completed(Some(completed));
            }
        }
        return Err(e);
    }
    Ok(v)
}
async fn gg_upload(s: &Session<'_>, key: &str, base: &str, file: &Value) -> Result<Value> {
    let bytes = input::decode(file["data"].as_str().ok_or_else(input::bad)?, 60_000_000)?;
    let v = gg_post(
        s,
        key,
        base,
        "/uploads",
        &json!({"media_type":file["media_type"],"byte_length":bytes.len()}),
        32768,
    )
    .await?;
    let upload = v["upload"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 16384)
        .ok_or_else(invalid)?;
    let url = v["upload_url"]
        .as_str()
        .filter(|s| s.len() <= 16384)
        .ok_or_else(invalid)?;
    allowed(url, &["tripo-data.s3.us-west-2.amazonaws.com"])?;
    if url::Url::parse(url).map_err(|_| invalid())?.path() == "/" {
        return Err(invalid());
    }
    let mut h = BTreeMap::new();
    h.insert("content-type".into(), "application/octet-stream".into());
    let r = s
        .send(Request {
            completion: crate::ResponseCompletion::Body,
            lane: Lane::Upload,
            method: "PUT".into(),
            url: url.into(),
            headers: h,
            body: bytes,
            max_bytes: 16384,
        })
        .await?;
    crate::media::success(r.status, false)?;
    Ok(json!({"upload":upload}))
}
fn check_findings(v: &Value) -> Result<Value> {
    let riggable = v["riggable"].as_bool().ok_or_else(invalid)?;
    let kind = v["rig_type"].as_str().ok_or_else(invalid)?;
    if ![
        "biped",
        "quadruped",
        "hexapod",
        "octopod",
        "avian",
        "serpentine",
        "aquatic",
    ]
    .contains(&kind)
    {
        return Err(invalid());
    }
    Ok(json!({"riggable":riggable,"rig_type":kind}))
}
