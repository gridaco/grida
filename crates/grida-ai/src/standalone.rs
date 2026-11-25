// GRIDA-SEC-004 / GRIDA-GG: provider — direct media requests use only a standalone key.
use crate::{
    Asset, Failure, Lane, MediaClient, MediaResult, Request, Response, Result, TaskReceipt,
    gateway::ORIGIN,
    input, invalid,
    media::{self, Session},
};
use serde_json::{Value, json};
use std::{collections::BTreeMap, time::Duration};
use tokio::time::Instant;
use tokio_util::sync::CancellationToken;

const JSON_BYTES: usize = 1_048_576;
const ASYNC_BYTES: usize = 84_934_656;

pub struct GatewayFile {
    pub field: String,
    pub asset: Asset,
}

pub struct GatewaySubmission {
    path: String,
    operation: String,
    model: Value,
    interface: String,
    image_count: usize,
    content_type: String,
    body: Vec<u8>,
}

pub struct GatewayOutput {
    pub media: Option<MediaResult>,
    pub receipt: Value,
}

pub fn gateway_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 160
        && value != "."
        && value != ".."
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
}

impl GatewaySubmission {
    pub fn path(&self) -> &str {
        &self.path
    }
    pub fn body(&self) -> &[u8] {
        &self.body
    }
    pub(crate) fn prepare(
        descriptor: &Value,
        mut value: Value,
        files: Vec<GatewayFile>,
        boundary: &str,
    ) -> Result<Self> {
        let op = &descriptor["gateway_operation"];
        if op["standalone"] != true || !gateway_id(boundary) || boundary.len() > 70 {
            return Err(input::bad());
        }
        let path = op["path"].as_str().ok_or_else(invalid)?;
        let operation = op["id"]
            .as_str()
            .filter(|s| gateway_id(s))
            .ok_or_else(invalid)?;
        let interface = op["interface"].as_str().ok_or_else(invalid)?;
        let edit = interface == "images.edits";
        let model = descriptor["model_id"].clone();
        let mut schema = descriptor["input_schema"].clone();
        if edit {
            let image = schema["properties"]
                .as_object_mut()
                .ok_or_else(invalid)?
                .remove("image")
                .ok_or_else(invalid)?;
            schema["required"]
                .as_array_mut()
                .ok_or_else(invalid)?
                .retain(|v| v != "image");
            if files.len() < image["minItems"].as_u64().unwrap_or(1) as usize
                || files.len() > image["maxItems"].as_u64().unwrap_or(0) as usize
                || value.get("image").is_some()
            {
                return Err(input::bad());
            }
        }
        let mut placeholders = Vec::new();
        if !edit && files.len() > 4 {
            return Err(input::bad());
        }
        for file in &files {
            let field = &file.field;
            if edit {
                if field != "image[]" {
                    return Err(input::bad());
                }
            } else {
                if !op["file_fields"]
                    .as_array()
                    .is_some_and(|v| v.iter().any(|x| x == field))
                    || placeholders.contains(&field)
                {
                    return Err(input::bad());
                }
                let (fields, name) = location(&mut value, field, true)?;
                if fields.contains_key(name) {
                    return Err(input::bad());
                }
                let (parent, leaf) = field.split_once('.').unwrap_or(("", field));
                let field_schema = if parent.is_empty() {
                    &schema["properties"][leaf]
                } else {
                    &schema["properties"][parent]["properties"][leaf]
                };
                let url = "https://media.example.invalid/grida-local-input";
                fields.insert(
                    name.into(),
                    if field_schema["type"] == "string" {
                        json!(url)
                    } else {
                        json!({"url":url,"media_type":file.asset.media_type})
                    },
                );
                placeholders.push(field);
            }
            let data = &file.asset.data;
            if field == "mesh" {
                if data.len() > 60_000_000 {
                    return Err(input::bad());
                }
                input::validate_glb(data).map_err(|_| input::bad())?;
            } else if data.len() > 20_000_000
                || !matches!(
                    file.asset.media_type.as_str(),
                    "image/png" | "image/jpeg" | "image/webp"
                )
                || media::image_mime(data) != Some(file.asset.media_type.as_str())
            {
                return Err(input::bad());
            }
        }
        let mut value = input::normalize(&schema, value)?;
        for field in placeholders {
            let (fields, name) = location(&mut value, field, false)?;
            fields.remove(name).ok_or_else(input::bad)?;
            if let Some((parent, _)) = field.split_once('.')
                && fields.is_empty()
            {
                value.as_object_mut().ok_or_else(input::bad)?.remove(parent);
            }
        }
        let output_count = value["n"].as_u64().unwrap_or(1) as usize;
        if interface != "endpoints" {
            value["model"] = model.clone();
        }
        let limit = if path.starts_with("/v1/images/") {
            20 * JSON_BYTES
        } else {
            JSON_BYTES
        };
        let encoded = serde_json::to_vec(&value).map_err(|_| input::bad())?;
        if encoded.len() > limit {
            return Err(input::bad());
        }
        let (content_type, body) = if files.is_empty() {
            ("application/json".into(), encoded)
        } else {
            let mut body = Vec::new();
            if edit {
                for (name, value) in value.as_object().ok_or_else(input::bad)? {
                    let scalar = match value {
                        Value::String(s) => s.clone(),
                        Value::Bool(_) | Value::Number(_) => value.to_string(),
                        _ => return Err(input::bad()),
                    };
                    part(&mut body, boundary, name, None, scalar.as_bytes())?;
                }
            } else {
                part(&mut body, boundary, "input", None, &encoded)?;
            }
            for file in files {
                part(
                    &mut body,
                    boundary,
                    &file.field,
                    Some(&file.asset.media_type),
                    &file.asset.data,
                )?;
                if body.len() > ASYNC_BYTES {
                    return Err(input::bad());
                }
            }
            body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());
            if body.len() > ASYNC_BYTES {
                return Err(input::bad());
            }
            (format!("multipart/form-data; boundary={boundary}"), body)
        };
        Ok(Self {
            path: path.into(),
            operation: operation.into(),
            model,
            interface: interface.into(),
            image_count: output_count,
            content_type,
            body,
        })
    }
}

fn location<'a, 'b>(
    value: &'a mut Value,
    field: &'b str,
    create: bool,
) -> Result<(&'a mut serde_json::Map<String, Value>, &'b str)> {
    let mut object = value.as_object_mut().ok_or_else(input::bad)?;
    let name = if let Some((parent, child)) = field.split_once('.') {
        let nested = if create {
            object.entry(parent).or_insert_with(|| json!({}))
        } else {
            object.get_mut(parent).ok_or_else(input::bad)?
        };
        object = nested.as_object_mut().ok_or_else(input::bad)?;
        child
    } else {
        field
    };
    Ok((object, name))
}

fn part(
    body: &mut Vec<u8>,
    boundary: &str,
    name: &str,
    mime: Option<&str>,
    data: &[u8],
) -> Result<()> {
    if name.is_empty()
        || name.len() > 128
        || !name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.-[]".contains(&b))
    {
        return Err(input::bad());
    }
    body.extend_from_slice(
        format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"").as_bytes(),
    );
    if let Some(mime) = mime {
        body.extend_from_slice(format!("; filename=\"input\"\r\nContent-Type: {mime}").as_bytes());
    }
    body.extend_from_slice(b"\r\n\r\n");
    body.extend_from_slice(data);
    body.extend_from_slice(b"\r\n");
    Ok(())
}

impl MediaClient {
    fn standalone_session(&self, cancellation: CancellationToken) -> Session<'_> {
        Session {
            http: self.http.as_ref(),
            cancellation,
            deadline: Instant::now() + Duration::from_secs(630),
            gg_expires_at_ms: None,
            json_parse_error: "invalid_response",
        }
    }

    pub async fn execute_gateway(
        &self,
        submission: GatewaySubmission,
        key: &str,
        idempotency: &str,
        cancellation: CancellationToken,
        accepted: impl FnOnce(&Value) -> bool,
    ) -> Result<GatewayOutput> {
        if !gateway_id(idempotency) || idempotency.len() > 128 {
            return Err(input::bad());
        }
        let session = self.standalone_session(cancellation);
        let mut headers = authorization(key)?;
        headers.insert("content-type".into(), submission.content_type.clone());
        headers.insert("idempotency-key".into(), idempotency.into());
        let image = submission.interface.starts_with("images.");
        let mut submission = submission;
        let body = std::mem::take(&mut submission.body);
        let response = session
            .send(Request {
                lane: Lane::StandaloneGateway,
                method: "POST".into(),
                url: format!("{ORIGIN}{}", submission.path),
                headers,
                body,
                max_bytes: if image {
                    media::ENVELOPE_BYTES
                } else {
                    JSON_BYTES
                },
                completion: Default::default(),
            })
            .await?;
        let value = gateway_response(&response)?;
        if image {
            let id = response_request_id(&response, &value);
            let mut remaining = media::MEDIA_BYTES;
            let report = |error| with_request(error, id);
            let images = media::bounded_items(&value["data"], submission.image_count)
                .map_err(report)?
                .iter()
                .map(|item| {
                    let asset = media::image_base64(
                        item["b64_json"].as_str().ok_or_else(invalid)?,
                        &mut remaining,
                    )?;
                    if media::image_mime(&asset.data).is_none()
                        || item["media_type"]
                            .as_str()
                            .is_some_and(|mime| mime != asset.media_type)
                    {
                        return Err(invalid());
                    }
                    Ok(asset)
                })
                .collect::<Result<Vec<_>>>()
                .map_err(report)?;
            let status = response
                .headers
                .get("x-gg-billing-status")
                .map(String::as_str);
            let charge = response
                .headers
                .get("x-gg-charged-mills")
                .and_then(|s| money(s));
            return Ok(GatewayOutput {
                media: Some(MediaResult::assets("images", images)),
                receipt: json!({"request_id":id,"billing":{"status":status.filter(|s| billing_status(s)),
                    "charged_mills":charge.filter(|_| status == Some("settled"))}}),
            });
        }
        let id = value["id"]
            .as_str()
            .filter(|id| gateway_id(id))
            .ok_or_else(invalid)?;
        let request_id = value["request_id"]
            .as_str()
            .filter(|id| gateway_id(id))
            .ok_or_else(invalid)?;
        let outcome = async {
            let receipt = job_receipt(&value, id)?;
            if value["operation_id"] != submission.operation
                || value["model"] != submission.model
                || value["interface"] != submission.interface
            {
                return Err(invalid());
            }
            if !accepted(&receipt) {
                return Err(Failure::new("gateway_receipt_unavailable"));
            }
            let mut job = value.clone();
            loop {
                if job["operation_id"] != submission.operation
                    || job["model"] != submission.model
                    || job["interface"] != submission.interface
                    || job["request_id"] != request_id
                {
                    return Err(invalid());
                }
                let receipt = job_receipt(&job, id)?;
                if job["result_status"] == "available" {
                    return saveable(&session, &job, receipt).await;
                }
                if job["status"] == "unknown" || job["result_status"] != "pending" {
                    return Ok(GatewayOutput {
                        media: None,
                        receipt,
                    });
                }
                session.sleep(1500).await?;
                job = read_job(&session, key, id).await?;
            }
        }
        .await;
        outcome.map_err(|e| e.task(id).request(request_id))
    }

    pub async fn gateway_job(
        &self,
        key: &str,
        id: &str,
        collect: bool,
        cancellation: CancellationToken,
    ) -> Result<GatewayOutput> {
        let session = self.standalone_session(cancellation);
        let job = read_job(&session, key, id).await?;
        let receipt = job_receipt(&job, id)?;
        if collect && job["result_status"] == "available" {
            return saveable(&session, &job, receipt)
                .await
                .map_err(|e| e.task(id));
        }
        Ok(GatewayOutput {
            media: None,
            receipt,
        })
    }
}

fn authorization(key: &str) -> Result<BTreeMap<String, String>> {
    let key = crate::normalize_key("gg", key)?;
    Ok(BTreeMap::from([
        ("authorization".into(), format!("Bearer {key}")),
        ("accept".into(), "application/json".into()),
    ]))
}

async fn read_job(session: &Session<'_>, key: &str, id: &str) -> Result<Value> {
    if !gateway_id(id) {
        return Err(input::bad());
    }
    let response = session
        .send(Request {
            lane: Lane::StandaloneGateway,
            method: "GET".into(),
            url: format!("{ORIGIN}/v1/jobs/{id}"),
            headers: authorization(key)?,
            body: vec![],
            max_bytes: JSON_BYTES,
            completion: Default::default(),
        })
        .await?;
    gateway_response(&response).map_err(|e| e.task(id))
}

fn gateway_response(response: &Response) -> Result<Value> {
    let value: Value = serde_json::from_slice(&response.body).unwrap_or(Value::Null);
    let request_id = response_request_id(response, &value);
    if (200..300).contains(&response.status) {
        return if value.is_object() {
            Ok(value)
        } else {
            Err(with_request(invalid(), request_id))
        };
    }
    let code = match (response.status, value["error"]["code"].as_str()) {
        (401, _) => "invalid_api_key",
        (402, Some("cost_limit_exceeded")) => "cost_limit_exceeded",
        (402, _) => "insufficient_credits",
        (403, _) => "provider_access_denied",
        (404, Some("job_not_found")) => "job_not_found",
        (404, _) => "operation_unavailable",
        (409, Some("already_submitted")) => "already_submitted",
        (409, Some("idempotency_conflict")) => "idempotency_conflict",
        (409, Some("price_revision_changed")) => "price_revision_changed",
        (410, _) => "job_expired",
        (429, Some("key_budget_exceeded")) => "key_budget_exceeded",
        (429, _) => "provider_rate_limited",
        (400 | 413 | 415, _) => "invalid_input",
        _ => "generation_failed",
    };
    Err(with_request(Failure::new(code), request_id))
}

fn response_request_id<'a>(response: &'a Response, value: &'a Value) -> Option<&'a str> {
    response
        .headers
        .get("x-request-id")
        .map(String::as_str)
        .into_iter()
        .chain(value["error"]["request_id"].as_str())
        .find(|id| gateway_id(id))
}

fn with_request(error: Failure, request_id: Option<&str>) -> Failure {
    match request_id {
        Some(id) => error.request(id),
        None => error,
    }
}

fn billing_status(value: &str) -> bool {
    matches!(
        value,
        "reserved" | "pending" | "settled" | "not_billable" | "released"
    )
}

fn money(value: &str) -> Option<&str> {
    let (whole, fraction) = value.split_once('.').unwrap_or((value, ""));
    (!whole.is_empty()
        && whole.len() <= 20
        && fraction.len() <= 18
        && whole
            .bytes()
            .chain(fraction.bytes())
            .all(|b| b.is_ascii_digit()))
    .then_some(value)
}

fn job_receipt(job: &Value, id: &str) -> Result<Value> {
    let request = job["request_id"]
        .as_str()
        .filter(|id| gateway_id(id))
        .ok_or_else(invalid)?;
    let status = job["status"]
        .as_str()
        .filter(|s| {
            matches!(
                *s,
                "accepted" | "running" | "succeeded" | "failed" | "unknown"
            )
        })
        .ok_or_else(invalid)?;
    let result = job["result_status"]
        .as_str()
        .filter(|s| matches!(*s, "pending" | "available" | "unavailable" | "expired"))
        .ok_or_else(invalid)?;
    if job["object"] != "job" || job["id"] != id {
        return Err(invalid());
    }
    let billing = job["billing"]["status"]
        .as_str()
        .filter(|s| billing_status(s));
    let kind = match job["interface"].as_str() {
        Some("videos") => "video",
        Some("endpoints")
            if job["operation_id"]
                .as_str()
                .is_some_and(|id| id.starts_with("three-d.")) =>
        {
            "three-d"
        }
        _ => {
            return Err(Failure::new("operation_unavailable")
                .task(id)
                .request(request));
        }
    };
    let model = job["model"]
        .as_str()
        .filter(|s| s.len() <= 256 && !s.chars().any(char::is_control));
    Ok(
        json!({"job_id":id,"request_id":request,"status":status,"result_status":result,
        "operation":{"kind":kind,"model_id":model,"binding_id":model},
        "billing":{"status":billing,"charged_mills":job["billing"]["charged_mills"].as_str()
            .and_then(money).filter(|_| billing == Some("settled"))}}),
    )
}

async fn saveable(session: &Session<'_>, job: &Value, receipt: Value) -> Result<GatewayOutput> {
    let result = &job["result"];
    let mut media = if job["operation_id"] == "three-d.tripo.rig-check" {
        let riggable = result["riggable"].as_bool().ok_or_else(invalid)?;
        let rig_type = result["rig_type"]
            .as_str()
            .filter(|s| gateway_id(s))
            .ok_or_else(invalid)?;
        let mut output = MediaResult::assets("findings", vec![]);
        output.findings = Some(json!({"riggable":riggable,"rig_type":rig_type}));
        output
    } else {
        let (field, reference) = if job["interface"] == "videos" {
            ("videos", &media::bounded_items(&result["videos"], 1)?[0])
        } else if job["interface"] == "endpoints"
            && job["operation_id"]
                .as_str()
                .is_some_and(|s| s.starts_with("three-d."))
        {
            ("glb", &result["glb"])
        } else {
            return Err(Failure::new("operation_unavailable"));
        };
        let url = reference["url"]
            .as_str()
            .filter(|s| s.starts_with("https://"))
            .ok_or_else(invalid)?;
        let mut asset = session.download(url, media::MEDIA_BYTES).await?;
        if field == "glb" {
            input::validate_glb(&asset.data)?;
            asset.media_type = "model/gltf-binary".into();
        } else {
            if let Some(content_type) = reference["media_type"].as_str() {
                asset.media_type = content_type.into();
            }
            media::validate_video(&asset)?;
        }
        MediaResult::assets(field, vec![asset])
    };
    media.task = Some(TaskReceipt {
        id: receipt["job_id"].as_str().ok_or_else(invalid)?.into(),
        credits_consumed: None,
    });
    Ok(GatewayOutput {
        media: Some(media),
        receipt,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{HttpFuture, Transport, TransportError};
    use std::{
        collections::VecDeque,
        sync::{Arc, Mutex},
    };

    const KEY: &str = "sk-gg-v1-synthetic-direct-key";
    const JOB: &str = "req_fixture-job";
    const REQUEST: &str = "req_fixture-request";

    struct Fixture(Mutex<VecDeque<(&'static str, &'static str, Option<Value>)>>);
    impl Transport for Fixture {
        fn request(&self, request: Request) -> HttpFuture<'_> {
            let (method, path, response) = self
                .0
                .lock()
                .unwrap()
                .pop_front()
                .expect("unexpected request");
            assert_eq!(request.method, method);
            assert_eq!(request.url, format!("{ORIGIN}{path}"));
            assert_eq!(request.lane, Lane::StandaloneGateway);
            assert_eq!(
                request.headers.get("authorization").unwrap(),
                &format!("Bearer {KEY}")
            );
            if method == "POST" {
                assert_eq!(request.headers["idempotency-key"], "fixture-id");
                assert_eq!(
                    serde_json::from_slice::<Value>(&request.body).unwrap(),
                    json!({"model":"lab/model","prompt":"run"})
                );
            } else {
                assert!(
                    request.body.is_empty() && !request.headers.contains_key("idempotency-key")
                );
            }
            Box::pin(async move {
                let value = response.ok_or(TransportError)?;
                Ok(Response {
                    status: 200,
                    headers: BTreeMap::new(),
                    body: serde_json::to_vec(&value).unwrap(),
                })
            })
        }
    }

    fn video_descriptor() -> Value {
        json!({
            "model_id":"lab/model","gateway_operation":{
                "standalone":true,"id":"video.lab.model.image","path":"/v1/videos",
                "interface":"videos","file_fields":["image"]
            },
            "input_schema":{"type":"object","additionalProperties":false,"required":["prompt"],
                "properties":{"prompt":{"type":"string"},"image":{"type":"string"}}}
        })
    }

    fn job(status: &str, result: &str) -> Value {
        json!({"object":"job","id":JOB,"request_id":REQUEST,"operation_id":"video.lab.model.image",
            "model":"lab/model","interface":"videos","status":status,"result_status":result,
            "billing":{"status":"pending","charged_mills":null}})
    }

    #[test]
    fn job_readback_does_not_report_an_unsupported_operation_as_three_d() {
        let mut value = job("succeeded", "available");
        value["interface"] = json!("endpoints");
        value["operation_id"] = json!("music.google.lyria-3.generate");
        let error = job_receipt(&value, JOB).unwrap_err();
        assert_eq!(error.code, "operation_unavailable");
        assert_eq!(error.request_id.as_deref(), Some(REQUEST));
    }

    #[tokio::test]
    async fn replay_uses_the_original_identity_after_the_submit_reply_is_lost() {
        let fixture = Arc::new(Fixture(Mutex::new(VecDeque::from([
            ("POST", "/v1/videos", None),
            ("POST", "/v1/videos", Some(job("succeeded", "expired"))),
        ]))));
        let client = MediaClient::new(fixture.clone());
        let prepare = || {
            GatewaySubmission::prepare(
                &video_descriptor(),
                json!({"prompt":"run"}),
                vec![],
                "fixture-id",
            )
            .unwrap()
        };
        assert!(
            client
                .execute_gateway(
                    prepare(),
                    KEY,
                    "fixture-id",
                    CancellationToken::new(),
                    |_| {
                        panic!("the first response was lost");
                    }
                )
                .await
                .is_err()
        );
        let replay = client
            .execute_gateway(
                prepare(),
                KEY,
                "fixture-id",
                CancellationToken::new(),
                |receipt| {
                    assert_eq!(receipt["job_id"], JOB);
                    true
                },
            )
            .await
            .unwrap();
        assert_eq!(replay.receipt["request_id"], REQUEST);
        assert!(fixture.0.lock().unwrap().is_empty());
    }

    #[test]
    fn direct_multipart_omits_the_local_source_from_json_and_rejects_conflicts() {
        let local = || GatewayFile {
            field: "image".into(),
            asset: Asset {
                data: b"\x89PNG\r\nfixture".to_vec(),
                media_type: "image/png".into(),
            },
        };
        let descriptor = video_descriptor();
        let request = GatewaySubmission::prepare(
            &descriptor,
            json!({"prompt":"run"}),
            vec![local()],
            "fixture-id",
        )
        .unwrap();
        assert_eq!(request.path(), "/v1/videos");
        let body = String::from_utf8_lossy(request.body());
        let text_part = body.split_once("name=\"input\"\r\n\r\n").unwrap().1;
        let fields = text_part.split_once("\r\n").unwrap().0;
        assert_eq!(
            serde_json::from_str::<Value>(fields).unwrap(),
            json!({"model":"lab/model","prompt":"run"})
        );
        assert!(body.contains("name=\"image\"; filename=\"input\""));
        assert!(
            GatewaySubmission::prepare(
                &descriptor,
                json!({"prompt":"run","image":"https://example.com/image.png"}),
                vec![local()],
                "fixture-id"
            )
            .is_err()
        );
        assert!(
            GatewaySubmission::prepare(
                &descriptor,
                json!({"prompt":"run"}),
                vec![local(), local()],
                "fixture-id"
            )
            .is_err()
        );
    }

    #[tokio::test(start_paused = true)]
    async fn accepted_job_is_recorded_before_an_interrupted_poll_and_resumes_with_get() {
        let fixture = Arc::new(Fixture(Mutex::new(VecDeque::from([
            ("POST", "/v1/videos", Some(job("accepted", "pending"))),
            ("GET", "/v1/jobs/req_fixture-job", None),
            (
                "GET",
                "/v1/jobs/req_fixture-job",
                Some(job("succeeded", "expired")),
            ),
        ]))));
        let client = MediaClient::new(fixture.clone());
        let mut acceptance = None;
        let submission = GatewaySubmission::prepare(
            &video_descriptor(),
            json!({"prompt":"run"}),
            vec![],
            "fixture-id",
        )
        .unwrap();
        let error = client
            .execute_gateway(
                submission,
                KEY,
                "fixture-id",
                CancellationToken::new(),
                |receipt| {
                    acceptance = Some(receipt.clone());
                    true
                },
            )
            .await
            .err()
            .expect("synthetic transport interruption");
        assert_eq!(acceptance.unwrap()["job_id"], JOB);
        assert_eq!(error.task_id.as_deref(), Some(JOB));
        assert_eq!(error.request_id.as_deref(), Some(REQUEST));
        let recovered = client
            .gateway_job(KEY, JOB, true, CancellationToken::new())
            .await
            .unwrap();
        assert_eq!(recovered.receipt["result_status"], "expired");
        assert_eq!(recovered.receipt["billing"]["status"], "pending");
        assert!(recovered.media.is_none());
        assert!(fixture.0.lock().unwrap().is_empty());
    }
}
