// GRIDA-SEC-004 / GRIDA-SEC-006 — explicit provider authority and safe scoped results.
// GRIDA-GG: provider — explicit scoped invocation authority; no account token or credential persistence.
use crate::{Catalog, Failure, Lane, Parsed, Request, Response, Result, Transport, input, invalid};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{collections::BTreeMap, sync::Arc, time::Duration};
use tokio::time::Instant;
use tokio_util::sync::CancellationToken;

pub const MEDIA_BYTES: usize = 64 * 1024 * 1024;
pub(crate) const ENVELOPE_BYTES: usize = MEDIA_BYTES.div_ceil(3) * 4 + 65536;

/// Authority for one frozen provider selection; it never falls back to another account.
pub enum ExecutionAuthority {
    Byok {
        provider: String,
        key: String,
    },
    Gateway {
        token: String,
        base_url: String,
        expires_at_ms: i64,
    },
}
#[derive(Debug, Clone)]
pub struct Asset {
    pub data: Vec<u8>,
    pub media_type: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TaskReceipt {
    pub id: String,
    #[serde(
        skip_serializing_if = "Option::is_none",
        serialize_with = "serialize_credits"
    )]
    pub credits_consumed: Option<f64>,
}
fn serialize_credits<S: serde::Serializer>(
    credits: &Option<f64>,
    serializer: S,
) -> std::result::Result<S::Ok, S::Error> {
    match credits {
        Some(v) if v.fract() == 0.0 && *v <= 9007199254740991.0 => {
            serializer.serialize_u64(*v as u64)
        }
        Some(v) => serializer.serialize_f64(*v),
        None => serializer.serialize_none(),
    }
}
#[derive(Debug, Clone)]
pub struct MediaResult {
    pub field: String,
    pub assets: Vec<Asset>,
    pub task: Option<TaskReceipt>,
    pub findings: Option<Value>,
}
impl MediaResult {
    pub(crate) fn assets(field: &str, assets: Vec<Asset>) -> Self {
        Self {
            field: field.into(),
            assets,
            task: None,
            findings: None,
        }
    }
}
pub struct MediaClient {
    pub(crate) http: Arc<dyn Transport>,
}
impl MediaClient {
    pub fn new(http: Arc<dyn Transport>) -> Self {
        Self { http }
    }
    pub async fn execute(
        &self,
        parsed: &Parsed,
        authority: ExecutionAuthority,
        cancellation: CancellationToken,
    ) -> Result<MediaResult> {
        // Revalidate public input, including any caller-mutated Parsed, before I/O.
        let selector = crate::Selector {
            kind: parsed.kind().into(),
            model_id: parsed.model_id().into(),
            provider: parsed.provider().into(),
            variant: parsed.descriptor["variant"].as_str().map(String::from),
            feature: parsed.descriptor["feature"].as_str().map(String::from),
        };
        let parsed = Catalog::bundled().parse_input(&selector, parsed.input.clone())?;
        let duration = if parsed.kind() == "three-d" {
            if parsed.provider() == "gg" { 780 } else { 600 }
        } else if parsed.provider() == "fal"
            && parsed.binding_id().starts_with("openai/gpt-image-2.5/")
        {
            600
        } else {
            300
        };
        let mut session = Session {
            http: self.http.as_ref(),
            cancellation,
            gg_expires_at_ms: None,
            json_parse_error: if parsed.kind() == "three-d" {
                "invalid_response"
            } else {
                "generation_failed"
            },
            deadline: Instant::now() + Duration::from_secs(duration),
        };
        session.check()?;
        let (key, base) = match authority {
            ExecutionAuthority::Byok { provider, key }
                if provider == parsed.provider() && provider != "gg" =>
            {
                let normalized = input::js_trim(&key).to_string();
                if normalized.is_empty() || normalized.bytes().any(|b| !(33..=126).contains(&b)) {
                    return Err(Failure::new(
                        if matches!(parsed.kind(), "three-d" | "sound-effect" | "text-to-speech") {
                            "provider_key_required"
                        } else {
                            "provider_unavailable"
                        },
                    ));
                }
                (normalized, None)
            }
            ExecutionAuthority::Gateway {
                token,
                base_url,
                expires_at_ms,
            } if parsed.provider() == "gg" => {
                if token.is_empty() || token.bytes().any(|b| !(33..=126).contains(&b)) {
                    return Err(Failure::new("gg_token_expired"));
                }
                let url = url::Url::parse(&base_url).map_err(|_| Failure::new("invalid_input"))?;
                if !url.username().is_empty()
                    || url.password().is_some()
                    || url.query().is_some()
                    || url.fragment().is_some()
                    || (url.scheme() != "https"
                        && !(url.scheme() == "http"
                            && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))))
                {
                    return Err(Failure::new("invalid_input"));
                }
                session.gg_expires_at_ms = Some(expires_at_ms);
                session.check_gg()?;
                (token, Some(url.origin().ascii_serialization()))
            }
            _ => return Err(Failure::new("provider_unavailable")),
        };
        match parsed.kind() {
            "image" => self.image(&session, &parsed, &key, base.as_deref()).await,
            "video" => self.video(&session, &parsed, &key, base.as_deref()).await,
            "music" | "sound-effect" | "text-to-speech" => {
                self.audio(&session, &parsed, &key, base.as_deref()).await
            }
            "three-d" if parsed.provider() == "fal" => {
                self.fal_three_d(&session, &parsed, &key).await
            }
            "three-d" => crate::tripo::execute(&session, &parsed, &key, base.as_deref()).await,
            _ => Err(Failure::new("operation_unavailable")),
        }
    }
    async fn image(
        &self,
        s: &Session<'_>,
        p: &Parsed,
        key: &str,
        base: Option<&str>,
    ) -> Result<MediaResult> {
        let count = p.input["n"].as_u64().ok_or_else(input::bad)? as usize;
        let cap = if p.provider() == "vercel" { count } else { 4 };
        let mut assets = Vec::new();
        let mut remaining = count;
        let mut remaining_bytes = MEDIA_BYTES;
        while remaining > 0 {
            s.check()?;
            if remaining_bytes == 0 {
                return Err(invalid());
            }
            let n = remaining.min(cap);
            let mut body = p.input.clone();
            body["n"] = n.into();
            let result = match p.provider() {
                "openrouter" => {
                    body["model"] = p.binding_id().into();
                    if let Some(refs) = body.as_object_mut().and_then(|b| b.remove("references")) {
                        body["input_references"] = refs
                            .as_array()
                            .ok_or_else(input::bad)?
                            .iter()
                            .map(|r| json!({"type":"image_url","image_url":{"url":r}}))
                            .collect();
                    }
                    background(&mut body);
                    let v = s
                        .json(
                            "POST",
                            "https://openrouter.ai/api/v1/images",
                            headers("openrouter", key),
                            Some(&body),
                            ENVELOPE_BYTES,
                        )
                        .await?;
                    let data = v["data"].as_array().ok_or_else(invalid)?;
                    data.iter()
                        .filter_map(|i| i["b64_json"].as_str())
                        .map(|b| image_base64(b, &mut remaining_bytes))
                        .collect::<Result<Vec<_>>>()?
                }
                "gg" => {
                    body["model_id"] = p.model_id().into();
                    if let Some(size) = body.as_object_mut().and_then(|b| b.remove("size")) {
                        let (w, h) = pair(size.as_str().ok_or_else(input::bad)?, 'x')?;
                        body["width"] = json!(w);
                        body["height"] = json!(h);
                    }
                    if body["background"] == "auto" {
                        body.as_object_mut()
                            .ok_or_else(input::bad)?
                            .remove("background");
                    }
                    let v = s
                        .json(
                            "POST",
                            &format!("{}/api/v1/ai/images/generations", base.ok_or_else(invalid)?),
                            headers("gg", key),
                            Some(&body),
                            ENVELOPE_BYTES,
                        )
                        .await?;
                    v["images"]
                        .as_array()
                        .ok_or_else(invalid)?
                        .iter()
                        .map(|i| {
                            image_base64(
                                i["base64"].as_str().ok_or_else(invalid)?,
                                &mut remaining_bytes,
                            )
                        })
                        .collect::<Result<Vec<_>>>()?
                }
                "vercel" => {
                    let mut wire = json!({"prompt":body["prompt"],"n":n});
                    copy(
                        &body,
                        &mut wire,
                        &[("size", "size"), ("aspect_ratio", "aspectRatio")],
                    );
                    // Preserve the pinned adapter's omission of zero on image routes.
                    if body["seed"].as_f64().is_some_and(|v| v != 0.0) {
                        wire["seed"] = body["seed"].clone();
                    }
                    let namespace = if p.binding_id().starts_with("openai/") {
                        "openai"
                    } else {
                        "vercel"
                    };
                    let mut options = json!({});
                    copy(&body, &mut options, &[("quality", "quality")]);
                    if body["background"].as_str().is_some_and(|b| b != "auto") {
                        options["background"] = body["background"].clone();
                        if body["background"] == "transparent" {
                            options["output_format"] = "png".into();
                        }
                    }
                    wire["providerOptions"] = if options.as_object().is_some_and(|v| !v.is_empty())
                    {
                        json!({namespace:options})
                    } else {
                        json!({})
                    };
                    if let Some(refs) = body["references"].as_array() {
                        wire["files"] =
                            refs.iter().map(|r| json!({"type":"url","url":r})).collect();
                    }
                    let mut h = vercel_model_headers(key);
                    h.insert("ai-image-model-specification-version".into(), "3".into());
                    h.insert("ai-model-id".into(), p.binding_id().into());
                    let v = s
                        .json(
                            "POST",
                            "https://ai-gateway.vercel.sh/v3/ai/image-model",
                            h,
                            Some(&wire),
                            ENVELOPE_BYTES,
                        )
                        .await?;
                    v["images"]
                        .as_array()
                        .ok_or_else(invalid)?
                        .iter()
                        .map(|i| {
                            image_base64(i.as_str().ok_or_else(invalid)?, &mut remaining_bytes)
                        })
                        .collect::<Result<Vec<_>>>()?
                }
                "fal" => {
                    let mut wire = json!({"prompt":body["prompt"],"num_images":n});
                    copy(
                        &body,
                        &mut wire,
                        &[
                            ("aspect_ratio", "aspect_ratio"),
                            ("seed", "seed"),
                            ("quality", "quality"),
                            ("references", "image_urls"),
                        ],
                    );
                    if let Some(size) = body["size"].as_str() {
                        let (w, h) = pair(size, 'x')?;
                        wire["image_size"] = json!({"width":w,"height":h});
                    } else if p.binding_id().starts_with("openai/gpt-image-2.5/") {
                        wire["image_size"] = "auto".into();
                    }
                    copy(&body, &mut wire, &[("background", "background")]);
                    background(&mut wire);
                    let v = fal_result(s, p.binding_id(), key, &wire, FalKind::Image).await?;
                    let entries = v["images"].as_array().ok_or_else(invalid)?;
                    if entries.is_empty() || entries.len() > n {
                        return Err(invalid());
                    }
                    let mut out = Vec::new();
                    for entry in entries {
                        let url = entry["url"].as_str().ok_or_else(invalid)?;
                        fal_allowed(url, FalKind::Image, false)?;
                        let a = s.download(url, remaining_bytes).await?;
                        consume_bytes(&mut remaining_bytes, a.data.len())?;
                        let mime = image_mime(&a.data).unwrap_or("image/png");
                        out.push(Asset {
                            data: a.data,
                            media_type: mime.into(),
                        });
                    }
                    out
                }
                _ => return Err(Failure::new("provider_unavailable")),
            };
            if result.is_empty() || result.len() > n {
                return Err(invalid());
            }
            assets.extend(result);
            remaining -= n;
        }
        Ok(MediaResult::assets("images", assets))
    }
    async fn video(
        &self,
        s: &Session<'_>,
        p: &Parsed,
        key: &str,
        base: Option<&str>,
    ) -> Result<MediaResult> {
        let mut wire = json!({});
        copy(
            &p.input,
            &mut wire,
            &[
                ("prompt", "prompt"),
                ("aspect_ratio", "aspect_ratio"),
                ("resolution", "resolution"),
                ("duration", "duration"),
                ("fps", "fps"),
                ("seed", "seed"),
            ],
        );
        let mut assets = Vec::new();
        let mut remaining_bytes = MEDIA_BYTES;
        match p.provider() {
            "gg" => {
                wire["model_id"] = p.model_id().into();
                let v = s
                    .json(
                        "POST",
                        &format!("{}/api/v1/ai/videos/generations", base.ok_or_else(invalid)?),
                        headers("gg", key),
                        Some(&wire),
                        ENVELOPE_BYTES,
                    )
                    .await?;
                for i in bounded_items(&v["videos"], 16)? {
                    let a = video_base64(
                        i["base64"].as_str().ok_or_else(invalid)?,
                        i["media_type"].as_str().ok_or_else(invalid)?,
                        remaining_bytes,
                    )?;
                    consume_bytes(&mut remaining_bytes, a.data.len())?;
                    assets.push(a);
                }
            }
            "fal" => {
                let lite = p.binding_id() == "fal-ai/veo3.1/lite/image-to-video";
                if lite {
                    if let Some(d) = p.input["duration"].as_u64() {
                        wire["duration"] = format!("{d}s").into();
                    }
                    if let Some(r) = p.input["resolution"].as_str() {
                        let (res, aspect) = match r {
                            "1280x720" => ("720p", "16:9"),
                            "720x1280" => ("720p", "9:16"),
                            "1920x1080" => ("1080p", "16:9"),
                            "1080x1920" => ("1080p", "9:16"),
                            _ => return Err(input::bad()),
                        };
                        wire["resolution"] = res.into();
                        wire["aspect_ratio"] = aspect.into();
                    }
                    copy(&p.input, &mut wire, &[("generate_audio", "generate_audio")]);
                }
                let frame = if p.binding_id() == "alibaba/wan-3.0/image-to-video" {
                    "start_image_url"
                } else {
                    "image_url"
                };
                if !p.input["image"].is_null() {
                    wire[frame] = input::data_url(&p.input["image"])?.into();
                } else {
                    copy(&p.input, &mut wire, &[("image_url", frame)]);
                }
                let v = fal_result(s, p.binding_id(), key, &wire, FalKind::Video).await?;
                let list = if v["videos"].is_array() {
                    v["videos"].clone()
                } else {
                    json!([v["video"]])
                };
                for i in bounded_items(&list, 16)? {
                    let url = i["url"].as_str().ok_or_else(invalid)?;
                    fal_allowed(url, FalKind::Video, false)?;
                    let mut a = s.download(url, remaining_bytes).await?;
                    a.media_type = i["content_type"].as_str().unwrap_or("video/mp4").into();
                    validate_video(&a)?;
                    consume_bytes(&mut remaining_bytes, a.data.len())?;
                    assets.push(a);
                }
            }
            "openrouter" => {
                wire["model"] = p.binding_id().into();
                if let Some(r) = wire
                    .as_object_mut()
                    .ok_or_else(invalid)?
                    .remove("resolution")
                {
                    wire["size"] = r;
                }
                if let Some(image) = p.input["image_url"].as_str() {
                    wire["frame_images"] = json!([{"type":"image_url","image_url":{"url":image},"frame_type":"first_frame"}]);
                }
                let base = "https://openrouter.ai/api/v1/videos";
                let h = headers("openrouter", key);
                let v = s
                    .json("POST", base, h.clone(), Some(&wire), 1048576)
                    .await?;
                let id = v["id"]
                    .as_str()
                    .filter(|id| !id.is_empty() && id.len() <= 4096)
                    .ok_or_else(invalid)?;
                let endpoint = format!("{base}/{}", segment(id));
                let poll = v["polling_url"].as_str().unwrap_or(&endpoint);
                allowed(poll, &["openrouter.ai", "*.openrouter.ai"])?;
                loop {
                    let status = s.json("GET", poll, h.clone(), None, 1048576).await?;
                    match status["status"].as_str() {
                        Some("completed") => break,
                        Some("failed" | "cancelled" | "expired") => {
                            return Err(Failure::new("generation_failed"));
                        }
                        _ => s.sleep(2000).await?,
                    }
                }
                let response = s
                    .send(Request {
                        completion: crate::ResponseCompletion::Body,
                        lane: Lane::Provider,
                        method: "GET".into(),
                        url: format!("{endpoint}/content?index=0"),
                        headers: h,
                        body: vec![],
                        max_bytes: remaining_bytes,
                    })
                    .await?;
                success(response.status, false)?;
                let a = Asset {
                    media_type: response
                        .headers
                        .get("content-type")
                        .cloned()
                        .unwrap_or_else(|| "video/mp4".into()),
                    data: response.body,
                };
                validate_video(&a)?;
                consume_bytes(&mut remaining_bytes, a.data.len())?;
                assets.push(a);
            }
            "vercel" => {
                let mut body = json!({"n":1,"providerOptions":{}});
                copy(
                    &p.input,
                    &mut body,
                    &[
                        ("prompt", "prompt"),
                        ("aspect_ratio", "aspectRatio"),
                        ("resolution", "resolution"),
                        ("duration", "duration"),
                        ("fps", "fps"),
                        ("seed", "seed"),
                    ],
                );
                if let Some(image) = p.input["image_url"].as_str() {
                    body["image"] = json!({"type":"url","url":image});
                }
                let mut h = vercel_model_headers(key);
                h.insert("ai-video-model-specification-version".into(), "3".into());
                h.insert("ai-model-id".into(), p.binding_id().into());
                h.insert("accept".into(), "text/event-stream".into());
                let response = s
                    .send(Request {
                        completion: crate::ResponseCompletion::FirstSseEvent,
                        lane: Lane::Provider,
                        method: "POST".into(),
                        url: "https://ai-gateway.vercel.sh/v3/ai/video-model".into(),
                        headers: h,
                        body: serde_json::to_vec(&body).map_err(|_| input::bad())?,
                        max_bytes: ENVELOPE_BYTES,
                    })
                    .await?;
                success(response.status, false)?;
                let event =
                    sse_first(&response.body).map_err(|_| Failure::new("generation_failed"))?;
                validate_gateway_video_event(&event)?;
                for i in bounded_items(&event["videos"], 16)? {
                    let media = i["mediaType"].as_str().ok_or_else(invalid)?;
                    let a = match i["type"].as_str() {
                        Some("base64") => video_base64(
                            i["data"].as_str().ok_or_else(invalid)?,
                            media,
                            remaining_bytes,
                        )?,
                        Some("url") => {
                            let u = i["url"].as_str().ok_or_else(invalid)?;
                            if !u.starts_with("data:") {
                                allowed(u, &["ai-gateway.vercel.sh"]).map_err(|_| {
                                    Failure::new("unsupported_untrusted_result_origin")
                                })?;
                            }
                            let mut a = s.download(u, remaining_bytes).await?;
                            a.media_type = media.into();
                            a
                        }
                        _ => return Err(invalid()),
                    };
                    validate_video(&a)?;
                    consume_bytes(&mut remaining_bytes, a.data.len())?;
                    assets.push(a);
                }
            }
            _ => return Err(Failure::new("provider_unavailable")),
        }
        if assets.is_empty() {
            return Err(invalid());
        }
        Ok(MediaResult::assets("videos", assets))
    }
    async fn audio(
        &self,
        s: &Session<'_>,
        p: &Parsed,
        key: &str,
        base: Option<&str>,
    ) -> Result<MediaResult> {
        if p.kind() == "music" {
            let mut body = p.input.clone();
            body["model_id"] = p.model_id().into();
            let v = s
                .json(
                    "POST",
                    &format!("{}/api/v1/ai/music/generations", base.ok_or_else(invalid)?),
                    headers("gg", key),
                    Some(&body),
                    32 * 1024 * 1024 * 4 / 3 + 65536,
                )
                .await?;
            let filename = v["audio"]["file_name"].as_str().ok_or_else(invalid)?;
            if v["model_id"] != p.model_id()
                || v["provider_id"] != "gg"
                || v["audio"]["media_type"] != "audio/mpeg"
                || filename.len() > 132
                || filename.contains(['/', '\\'])
                || !filename.to_lowercase().ends_with(".mp3")
            {
                return Err(invalid());
            }
            let data = input::decode(
                v["audio"]["base64"].as_str().ok_or_else(invalid)?,
                32 * 1024 * 1024,
            )
            .map_err(|_| invalid())?;
            return Ok(MediaResult::assets(
                "audio",
                vec![Asset {
                    data,
                    media_type: "audio/mpeg".into(),
                }],
            ));
        }
        let (mut body, url) = if p.kind() == "sound-effect" {
            let mut b = json!({"text":p.input["prompt"],"model_id":p.binding_id()});
            copy(
                &p.input,
                &mut b,
                &[
                    ("duration_seconds", "duration_seconds"),
                    ("loop", "loop"),
                    ("prompt_influence", "prompt_influence"),
                ],
            );
            (
                b,
                "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128"
                    .to_string(),
            )
        } else {
            (
                json!({"text":p.input["text"],"model_id":p.binding_id()}),
                format!(
                    "https://api.elevenlabs.io/v1/text-to-speech/{}?output_format=mp3_44100_128",
                    segment(p.input["voice_id"].as_str().ok_or_else(input::bad)?)
                ),
            )
        };
        let _ = &mut body;
        let mut h = headers("elevenlabs", key);
        h.insert("accept".into(), "audio/mpeg".into());
        let response = s
            .send(Request {
                completion: crate::ResponseCompletion::Body,
                lane: Lane::Provider,
                method: "POST".into(),
                url,
                headers: h,
                body: serde_json::to_vec(&body).map_err(|_| input::bad())?,
                max_bytes: 16 * 1024 * 1024,
            })
            .await?;
        if p.kind() == "text-to-speech" && matches!(response.status, 401 | 403) {
            return Err(Failure::new("provider_access_denied"));
        }
        success(response.status, false)?;
        let media = response
            .headers
            .get("content-type")
            .map(|v| {
                v.split(';')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_ascii_lowercase()
            })
            .unwrap_or_default();
        if media != "audio/mpeg" || response.body.is_empty() {
            return Err(invalid());
        }
        Ok(MediaResult::assets(
            "audio",
            vec![Asset {
                data: response.body,
                media_type: media,
            }],
        ))
    }
    async fn fal_three_d(&self, s: &Session<'_>, p: &Parsed, key: &str) -> Result<MediaResult> {
        let body = if p.input.get("prompt").is_some() {
            json!({"prompt":p.input["prompt"]})
        } else {
            let field = if p.model_id() == "fal-ai/trellis-2" {
                "image_url"
            } else {
                "input_image_url"
            };
            json!({field:input::data_url(&p.input["image"]) ?})
        };
        let result = fal_result(s, p.binding_id(), key, &body, FalKind::ThreeD).await?;
        let file = result
            .get("model_glb")
            .or_else(|| result.get("model_urls").and_then(|v| v.get("glb")))
            .ok_or_else(invalid)?;
        let url = file["url"].as_str().ok_or_else(invalid)?;
        allowed(url, &["fal.run", "*.fal.run", "fal.media", "*.fal.media"])?;
        if file
            .get("file_size")
            .is_some_and(|v| !v.as_u64().is_some_and(|n| n <= MEDIA_BYTES as u64))
        {
            return Err(invalid());
        }
        let a = s.download(url, MEDIA_BYTES).await?;
        // Legacy fal operations promise a GLB 2 header; portable mesh validation
        // belongs to Tripo and rigging, whose existing contract requires it.
        if a.data.len() < 12
            || &a.data[..4] != b"glTF"
            || u32::from_le_bytes(a.data[4..8].try_into().unwrap()) != 2
            || u32::from_le_bytes(a.data[8..12].try_into().unwrap()) as usize != a.data.len()
        {
            return Err(invalid());
        }
        Ok(MediaResult::assets(
            "glb",
            vec![Asset {
                data: a.data,
                media_type: "model/gltf-binary".into(),
            }],
        ))
    }
}

pub(crate) struct Session<'a> {
    pub http: &'a dyn Transport,
    pub cancellation: CancellationToken,
    pub deadline: Instant,
    pub gg_expires_at_ms: Option<i64>,
    pub json_parse_error: &'static str,
}
impl Session<'_> {
    pub fn check(&self) -> Result<()> {
        if self.cancellation.is_cancelled() {
            Err(Failure::new("aborted"))
        } else if Instant::now() >= self.deadline {
            Err(Failure::new("timeout"))
        } else {
            Ok(())
        }
    }
    pub fn check_gg(&self) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| Failure::new("gg_token_expired"))?
            .as_millis();
        if self
            .gg_expires_at_ms
            .is_some_and(|expires| expires <= 0 || now >= expires as u128)
        {
            return Err(Failure::new("gg_token_expired"));
        }
        Ok(())
    }
    pub async fn send(&self, request: Request) -> Result<Response> {
        if request.lane == Lane::Provider && request.url.contains("/api/v1/ai/") {
            self.check_gg()?;
        }
        self.check()?;
        let max = request.max_bytes;
        let response = tokio::select! {biased;_ = self.cancellation.cancelled()=>return Err(Failure::new("aborted")),_=tokio::time::sleep_until(self.deadline)=>return Err(Failure::new("timeout")),r=self.http.request(request)=>r.map_err(|_|Failure::new("generation_failed"))?};
        self.check()?;
        if response.body.len() > max
            || (300..400).contains(&response.status)
            || response
                .headers
                .get("content-length")
                .and_then(|v| v.parse::<u64>().ok())
                .is_some_and(|n| n > max as u64)
        {
            return Err(invalid());
        }
        Ok(response)
    }
    pub async fn json(
        &self,
        method: &str,
        url: &str,
        h: BTreeMap<String, String>,
        body: Option<&Value>,
        max: usize,
    ) -> Result<Value> {
        let gg = url.contains("/api/v1/ai/");
        let r = self
            .send(Request {
                completion: crate::ResponseCompletion::Body,
                lane: Lane::Provider,
                method: method.into(),
                url: url.into(),
                headers: h,
                body: body
                    .map(serde_json::to_vec)
                    .transpose()
                    .map_err(|_| input::bad())?
                    .unwrap_or_default(),
                max_bytes: max,
            })
            .await?;
        success(r.status, gg)?;
        serde_json::from_slice(&r.body).map_err(|_| Failure::new(self.json_parse_error))
    }
    pub async fn download(&self, url: &str, max: usize) -> Result<Asset> {
        if max == 0 {
            return Err(invalid());
        }
        if url.starts_with("data:") {
            return inline_asset(url, max);
        }
        let r = self
            .send(Request {
                completion: crate::ResponseCompletion::Body,
                lane: Lane::Download,
                method: "GET".into(),
                url: url.into(),
                headers: BTreeMap::new(),
                body: vec![],
                max_bytes: max,
            })
            .await?;
        success(r.status, false)?;
        if r.body.is_empty() {
            return Err(invalid());
        }
        Ok(Asset {
            data: r.body,
            media_type: r.headers.get("content-type").cloned().unwrap_or_default(),
        })
    }
    pub async fn sleep(&self, millis: u64) -> Result<()> {
        self.check()?;
        tokio::select! {biased;_=self.cancellation.cancelled()=>Err(Failure::new("aborted")),_=tokio::time::sleep_until(self.deadline)=>Err(Failure::new("timeout")),_=tokio::time::sleep(Duration::from_millis(millis))=>self.check()}
    }
}
// These identify the model protocol and explicit BYOK authentication, independently
// of the SDK used by the client. Account verification uses its own REST headers.
fn vercel_model_headers(key: &str) -> BTreeMap<String, String> {
    let mut h = headers("vercel", key);
    h.insert("ai-gateway-protocol-version".into(), "0.0.1".into());
    h.insert("ai-gateway-auth-method".into(), "api-key".into());
    h
}
pub(crate) fn headers(provider: &str, key: &str) -> BTreeMap<String, String> {
    let mut h = BTreeMap::new();
    h.insert("content-type".into(), "application/json".into());
    if provider == "elevenlabs" {
        h.insert("xi-api-key".into(), key.into());
    } else {
        h.insert(
            "authorization".into(),
            format!("{} {key}", if provider == "fal" { "Key" } else { "Bearer" }),
        );
    }
    h
}
pub(crate) fn success(status: u16, gg: bool) -> Result<()> {
    if (200..300).contains(&status) {
        Ok(())
    } else {
        Err(Failure::new(if gg && status == 401 {
            "gg_token_expired"
        } else if gg && status == 402 {
            "insufficient_credits"
        } else {
            "generation_failed"
        }))
    }
}
pub(crate) fn copy(from: &Value, to: &mut Value, names: &[(&str, &str)]) {
    for (a, b) in names {
        if let Some(v) = from.get(*a) {
            to[*b] = v.clone();
        }
    }
}
pub(crate) fn allowed(value: &str, hosts: &[&str]) -> Result<()> {
    let url = url::Url::parse(value).map_err(|_| invalid())?;
    let host = url.host_str().ok_or_else(invalid)?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.port().is_some()
        || !hosts.iter().any(|h| {
            if let Some(suffix) = h.strip_prefix("*.") {
                host.ends_with(&format!(".{suffix}"))
            } else {
                host == *h
            }
        })
    {
        return Err(invalid());
    }
    Ok(())
}
pub(crate) fn segment(s: &str) -> String {
    const SET: &percent_encoding::AsciiSet = &percent_encoding::NON_ALPHANUMERIC
        .remove(b'-')
        .remove(b'_')
        .remove(b'.')
        .remove(b'!')
        .remove(b'~')
        .remove(b'*')
        .remove(b'\'')
        .remove(b'(')
        .remove(b')');
    percent_encoding::utf8_percent_encode(s, SET).to_string()
}

fn pair(s: &str, delimiter: char) -> Result<(u64, u64)> {
    let (a, b) = s.split_once(delimiter).ok_or_else(input::bad)?;
    Ok((
        a.parse().map_err(|_| input::bad())?,
        b.parse().map_err(|_| input::bad())?,
    ))
}
fn background(body: &mut Value) {
    if body["background"] == "transparent" {
        body["output_format"] = "png".into();
    }
    if body["background"] == "auto"
        && let Some(o) = body.as_object_mut()
    {
        o.remove("background");
    }
}
fn consume_bytes(remaining: &mut usize, size: usize) -> Result<()> {
    *remaining = remaining.checked_sub(size).ok_or_else(invalid)?;
    Ok(())
}
fn image_base64(b: &str, remaining: &mut usize) -> Result<Asset> {
    let data = output_base64(b, *remaining, true)?;
    consume_bytes(remaining, data.len())?;
    let mime = image_mime(&data).unwrap_or("image/png");
    Ok(Asset {
        media_type: mime.into(),
        data,
    })
}
fn image_mime(b: &[u8]) -> Option<&'static str> {
    if b.starts_with(b"\x89PNG") {
        Some("image/png")
    } else if b.starts_with(&[255, 216]) {
        Some("image/jpeg")
    } else if b.starts_with(b"GIF") {
        Some("image/gif")
    } else if b.starts_with(b"RIFF") && b.get(8..12) == Some(b"WEBP") {
        Some("image/webp")
    } else if b.starts_with(b"BM") {
        Some("image/bmp")
    } else if b.starts_with(b"II\x2a\x00") || b.starts_with(b"MM\x00\x2a") {
        Some("image/tiff")
    } else if b.get(..12) == Some(b"\x00\x00\x00\x20ftypavif") {
        Some("image/avif")
    } else if b.get(..12) == Some(b"\x00\x00\x00\x20ftypheic") {
        Some("image/heic")
    } else {
        None
    }
}
fn bounded_items(v: &Value, n: usize) -> Result<&Vec<Value>> {
    v.as_array()
        .filter(|v| !v.is_empty() && v.len() <= n)
        .ok_or_else(invalid)
}
fn video_base64(b: &str, mime: &str, maximum: usize) -> Result<Asset> {
    let a = Asset {
        data: output_base64(b, maximum, false)?,
        media_type: mime.into(),
    };
    validate_video(&a)?;
    Ok(a)
}
fn validate_video(a: &Asset) -> Result<()> {
    if a.data.is_empty()
        || !regex::Regex::new("(?i)^video/[a-z0-9.+-]+$")
            .expect("constant regex")
            .is_match(&a.media_type)
    {
        Err(invalid())
    } else {
        Ok(())
    }
}
fn output_base64(text: &str, maximum: usize, image: bool) -> Result<Vec<u8>> {
    use base64::{
        Engine, alphabet,
        engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig},
    };
    let compact = if image {
        text.replace('-', "+")
            .replace('_', "/")
            .chars()
            .filter(|c| !matches!(c, '\t' | '\n' | '\u{c}' | '\r' | ' '))
            .collect::<String>()
    } else {
        text.to_string()
    };
    if compact.len() > maximum.div_ceil(3) * 4 {
        return Err(invalid());
    }
    let engine = GeneralPurpose::new(
        &alphabet::STANDARD,
        GeneralPurposeConfig::new()
            .with_decode_allow_trailing_bits(true)
            .with_decode_padding_mode(DecodePaddingMode::Indifferent),
    );
    let bytes = engine.decode(compact).map_err(|_| invalid())?;
    if bytes.is_empty() || bytes.len() > maximum {
        return Err(invalid());
    }
    Ok(bytes)
}
fn inline_asset(value: &str, maximum: usize) -> Result<Asset> {
    let mut url = url::Url::parse(value).map_err(|_| invalid())?;
    url.set_fragment(None);
    let text = url.as_str();
    let (metadata, payload) = text
        .strip_prefix("data:")
        .and_then(|s| s.split_once(','))
        .ok_or_else(invalid)?;
    let mut fields = metadata.split(';').collect::<Vec<_>>();
    let encoded = fields
        .last()
        .is_some_and(|v| v.eq_ignore_ascii_case("base64"));
    if encoded {
        fields.pop();
    }
    if fields
        .iter()
        .skip(1)
        .any(|v| v.eq_ignore_ascii_case("base64"))
    {
        return Err(invalid());
    }
    let media_type = if fields.first() == Some(&"") {
        if fields.len() == 1 {
            "text/plain;charset=US-ASCII".into()
        } else {
            format!("text/plain;{}", fields[1..].join(";"))
        }
    } else {
        fields.join(";")
    };
    let data = if encoded {
        let compact = payload
            .chars()
            .filter(|c| !matches!(c, '\t' | '\n' | '\u{c}' | '\r' | ' '))
            .collect::<String>();
        output_base64(&compact, maximum, false)?
    } else {
        if payload.len() > maximum.saturating_mul(3) {
            return Err(invalid());
        }
        let decoded = percent_encoding::percent_decode_str(payload).collect::<Vec<_>>();
        if decoded.is_empty() || decoded.len() > maximum {
            return Err(invalid());
        }
        decoded
    };
    Ok(Asset { data, media_type })
}
#[derive(Clone, Copy, PartialEq)]
enum FalKind {
    Image,
    Video,
    ThreeD,
}
fn fal_allowed(value: &str, kind: FalKind, queue: bool) -> Result<()> {
    let hosts: &[&str] = if kind == FalKind::ThreeD && queue {
        &["queue.fal.run"]
    } else {
        &["fal.run", "*.fal.run", "fal.media", "*.fal.media"]
    };
    if kind == FalKind::ThreeD {
        return allowed(value, hosts);
    }
    // Image/video adapters historically report malformed origins as provider
    // failures; keep that safe error projection while enforcing host authority.
    let url = url::Url::parse(value).map_err(|_| Failure::new("generation_failed"))?;
    if url.scheme() != "https"
        || !url.host_str().is_some_and(|host| {
            ["fal.run", "fal.media"]
                .iter()
                .any(|h| host == *h || host.ends_with(&format!(".{h}")))
        })
    {
        return Err(Failure::new("generation_failed"));
    }
    allowed(value, hosts).map_err(|_| {
        if kind == FalKind::Image {
            Failure::new("generation_failed")
        } else {
            invalid()
        }
    })
}
async fn fal_result(
    s: &Session<'_>,
    binding: &str,
    key: &str,
    body: &Value,
    kind: FalKind,
) -> Result<Value> {
    let h = headers("fal", key);
    let submit = s
        .json(
            "POST",
            &format!("https://queue.fal.run/{binding}"),
            h.clone(),
            Some(body),
            1048576,
        )
        .await?;
    let status = submit["status_url"].as_str().ok_or_else(|| {
        if kind == FalKind::ThreeD {
            invalid()
        } else {
            Failure::new("generation_failed")
        }
    })?;
    let response = submit["response_url"].as_str().ok_or_else(|| {
        if kind == FalKind::ThreeD {
            invalid()
        } else {
            Failure::new("generation_failed")
        }
    })?;
    fal_allowed(status, kind, true)?;
    fal_allowed(response, kind, true)?;
    let seconds = match kind {
        FalKind::Image if binding.starts_with("openai/gpt-image-2.5/") => 600,
        FalKind::Image => 120,
        FalKind::Video => 300,
        FalKind::ThreeD => 600,
    };
    let poll = Session {
        http: s.http,
        cancellation: s.cancellation.clone(),
        deadline: s
            .deadline
            .min(Instant::now() + Duration::from_secs(seconds)),
        gg_expires_at_ms: s.gg_expires_at_ms,
        json_parse_error: s.json_parse_error,
    };
    loop {
        let result = poll.json("GET", status, h.clone(), None, 1048576).await?;
        if kind == FalKind::ThreeD
            && (!result["error"].is_null() || !result["error_type"].is_null())
        {
            return Err(Failure::new("generation_failed"));
        }
        match result["status"].as_str() {
            Some("COMPLETED") => break,
            Some("IN_QUEUE" | "IN_PROGRESS") => {
                poll.sleep(if kind == FalKind::Image { 1000 } else { 2000 })
                    .await?
            }
            None if kind == FalKind::ThreeD => return Err(invalid()),
            _ => return Err(Failure::new("generation_failed")),
        }
    }
    s.json("GET", response, h, None, 1048576).await
}
fn sse_first(bytes: &[u8]) -> Result<Value> {
    let end = crate::first_sse_event_end(bytes).ok_or_else(invalid)?;
    let text = std::str::from_utf8(&bytes[..end]).map_err(|_| invalid())?;
    let normalized = text
        .trim_start_matches('\u{feff}')
        .replace("\r\n", "\n")
        .replace('\r', "\n");
    for event in normalized.split("\n\n") {
        let data = event
            .lines()
            .filter_map(|l| {
                if l == "data" {
                    Some("")
                } else {
                    l.strip_prefix("data:")
                        .map(|s| s.strip_prefix(' ').unwrap_or(s))
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        if event
            .lines()
            .any(|line| line == "data" || line.starts_with("data:"))
        {
            return serde_json::from_str(&data).map_err(|_| invalid());
        }
    }
    Err(invalid())
}

// The gateway SDK validates this wire union before the media domain sees it.
// Retain that boundary and its safe failure projection when using direct REST.
fn validate_gateway_video_event(event: &Value) -> Result<()> {
    let valid_videos = event["videos"].as_array().is_some_and(|items| {
        items.iter().all(|item| {
            item["mediaType"].is_string()
                && match item["type"].as_str() {
                    Some("url") => item["url"].is_string(),
                    Some("base64") => item["data"].is_string(),
                    _ => false,
                }
        })
    });
    let valid_warnings = event.get("warnings").is_none_or(|value| {
        value.as_array().is_some_and(|items| {
            items.iter().all(|item| match item["type"].as_str() {
                Some("unsupported" | "compatibility") => {
                    item["feature"].is_string() && item.get("details").is_none_or(Value::is_string)
                }
                Some("other") => item["message"].is_string(),
                _ => false,
            })
        })
    });
    let valid_metadata = event.get("providerMetadata").is_none_or(|value| {
        value.as_object().is_some_and(|entries| {
            entries
                .values()
                .all(|entry| entry.is_object() && entry.get("videos").is_none_or(Value::is_array))
        })
    });
    if event["type"] != "result" || !valid_videos || !valid_warnings || !valid_metadata {
        return Err(Failure::new("generation_failed"));
    }
    Ok(())
}
