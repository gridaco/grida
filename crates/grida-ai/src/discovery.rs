// GRIDA-SEC-004 — provider input validation and bounded first-party credentials.
use crate::{
    Failure, Lane, MediaClient, Request, Result,
    input::{bad, js_trim},
    invalid,
    media::{Session, headers},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashSet},
    time::Duration,
};
use tokio::time::Instant;
use tokio_util::sync::CancellationToken;

#[derive(Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct VoiceFilter {
    pub provider: String,
}

pub fn normalize_key(provider: &str, value: &str) -> Result<String> {
    if value.len() > 4096
        || !["openrouter", "vercel", "fal", "elevenlabs", "tripo"].contains(&provider)
    {
        return Err(bad());
    }
    let key = js_trim(value);
    if key.is_empty()
        || key.bytes().any(|b| !(33..=126).contains(&b))
        || key.to_ascii_uppercase().starts_with("PASTE_")
            && key.to_ascii_uppercase().ends_with("_KEY_HERE")
    {
        return Err(bad());
    }
    match provider {
        "openrouter" if !key.starts_with("sk-or-") || key.len() == 6 => return Err(bad()),
        "vercel" if key == "vck_" => return Err(bad()),
        "fal" => {
            let p = key.split(':').collect::<Vec<_>>();
            if p.len() != 2 || p.iter().any(|p| p.is_empty()) {
                return Err(bad());
            }
        }
        _ => {}
    }
    Ok(key.into())
}
impl MediaClient {
    pub async fn verify(
        &self,
        provider: &str,
        key: &str,
        cancellation: CancellationToken,
    ) -> Result<Value> {
        let key = normalize_key(provider, key)?;
        let s = Session {
            http: self.http.as_ref(),
            cancellation,
            gg_expires_at_ms: None,
            json_parse_error: "invalid_response",
            deadline: Instant::now() + Duration::from_secs(10),
        };
        s.check()?;
        if provider == "elevenlabs" {
            return Ok(json!({"status":"not_supported"}));
        }
        let url = match provider {
            "tripo" => "https://openapi.tripo3d.ai/v3/account/balance",
            "openrouter" => "https://openrouter.ai/api/v1/key",
            "vercel" => "https://ai-gateway.vercel.sh/v1/credits",
            "fal" => "https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai/flux/dev",
            _ => return Err(bad()),
        };
        let mut h = headers(provider, &key);
        h.remove("content-type");
        h.insert("accept".into(), "application/json".into());
        let response = s
            .send(Request {
                completion: crate::ResponseCompletion::Body,
                lane: Lane::Provider,
                method: "GET".into(),
                url: url.into(),
                headers: h,
                body: vec![],
                max_bytes: 65536,
            })
            .await
            .map_err(|e| {
                if e.code == "generation_failed" {
                    Failure::new("unavailable")
                } else {
                    e
                }
            })?;
        match response.status {
            401 => return Err(Failure::new("credential_rejected")),
            403 => return Err(Failure::new("access_denied")),
            200 => {}
            _ => return Err(Failure::new("unavailable")),
        }
        let v: Value = serde_json::from_slice(&response.body).map_err(|_| invalid())?;
        match provider {
            "tripo" => {
                if v["code"] == 1000 || v["code"] == 1001 {
                    return Err(Failure::new("credential_rejected"));
                }
                if v["code"] != 0
                    || ![&v["data"]["balance"], &v["data"]["frozen"]]
                        .iter()
                        .all(|v| v.as_f64().is_some_and(|v| v.is_finite() && v >= 0.0))
                {
                    return Err(invalid());
                }
            }
            "openrouter" => match v["data"]["is_management_key"].as_bool() {
                Some(false) => {}
                Some(true) => return Err(Failure::new("credential_rejected")),
                None => return Err(invalid()),
            },
            "vercel" => {
                let r = regex::Regex::new(r"^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$")
                    .expect("constant regex");
                for value in [&v["balance"], &v["total_used"]] {
                    let text = value.as_str().ok_or_else(invalid)?;
                    if !r.is_match(text) || !text.parse::<f64>().is_ok_and(|n| n.is_finite()) {
                        return Err(invalid());
                    }
                }
            }
            "fal" => {
                if !v["prices"].as_array().is_some_and(|a| {
                    a.iter().any(|p| {
                        p["endpoint_id"] == "fal-ai/flux/dev"
                            && p["unit_price"].as_f64().is_some_and(f64::is_finite)
                            && [&p["unit"], &p["currency"]]
                                .iter()
                                .all(|v| v.as_str().is_some_and(|v| !js_trim(v).is_empty()))
                    })
                }) {
                    return Err(invalid());
                }
            }
            _ => return Err(bad()),
        }
        Ok(json!({"status":"accepted"}))
    }
    pub async fn voices(
        &self,
        key: &str,
        filter: &VoiceFilter,
        cancellation: CancellationToken,
    ) -> Result<Vec<Value>> {
        if filter.provider != "elevenlabs" {
            return Err(bad());
        }
        let key = js_trim(key);
        if key.is_empty() {
            return Err(Failure::new("provider_key_required"));
        }
        let s = Session {
            http: self.http.as_ref(),
            cancellation,
            gg_expires_at_ms: None,
            json_parse_error: "invalid_response",
            deadline: Instant::now() + Duration::from_secs(300),
        };
        let mut voices = BTreeMap::new();
        let mut seen = HashSet::new();
        let mut cursor: Option<String> = None;
        for _ in 0..10 {
            let mut url =
                url::Url::parse("https://api.elevenlabs.io/v2/voices").map_err(|_| invalid())?;
            url.query_pairs_mut().append_pair("page_size", "100");
            if let Some(c) = &cursor {
                url.query_pairs_mut().append_pair("next_page_token", c);
            }
            let mut h = BTreeMap::new();
            h.insert("xi-api-key".into(), key.into());
            h.insert("accept".into(), "application/json".into());
            let r = s
                .send(Request {
                    completion: crate::ResponseCompletion::Body,
                    lane: Lane::Provider,
                    method: "GET".into(),
                    url: url.to_string(),
                    headers: h,
                    body: vec![],
                    max_bytes: 2 * 1024 * 1024,
                })
                .await?;
            if r.status == 401 || r.status == 403 {
                return Err(Failure::new("provider_access_denied"));
            }
            if !(200..300).contains(&r.status) {
                return Err(Failure::new("generation_failed"));
            }
            if !r.headers.get("content-type").is_some_and(|s| {
                s.split(';')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .eq_ignore_ascii_case("application/json")
            }) {
                return Err(invalid());
            }
            let v: Value = serde_json::from_slice(&r.body).map_err(|_| invalid())?;
            let has_more = v["has_more"].as_bool().ok_or_else(invalid)?;
            let entries = v["voices"].as_array().ok_or_else(invalid)?;
            let projected = entries
                .iter()
                .map(|voice| {
                    Ok((
                        bounded(&voice["voice_id"], 256)?,
                        bounded(&voice["name"], 256)?,
                    ))
                })
                .collect::<Result<Vec<_>>>()?;
            cursor = if v["next_page_token"].is_null() {
                None
            } else {
                Some(bounded(&v["next_page_token"], 1024)?)
            };
            if has_more {
                let c = cursor.as_ref().ok_or_else(invalid)?;
                if !seen.insert(c.clone()) {
                    return Err(invalid());
                }
            }
            for (id, name) in projected {
                voices
                    .entry(id.clone())
                    .or_insert(json!({"voice_id":id,"name":name}));
                if voices.len() == 2000 {
                    break;
                }
            }
            if !has_more || voices.len() == 2000 {
                break;
            }
        }
        let mut out = voices.into_values().collect::<Vec<_>>();
        out.sort_by(|a, b| {
            a["name"]
                .as_str()
                .unwrap_or("")
                .encode_utf16()
                .cmp(b["name"].as_str().unwrap_or("").encode_utf16())
                .then(
                    a["voice_id"]
                        .as_str()
                        .unwrap_or("")
                        .encode_utf16()
                        .cmp(b["voice_id"].as_str().unwrap_or("").encode_utf16()),
                )
        });
        Ok(out)
    }
}
fn bounded(v: &Value, max: usize) -> Result<String> {
    let s = js_trim(v.as_str().ok_or_else(invalid)?);
    if s.is_empty() || s.chars().count() > max {
        return Err(invalid());
    }
    Ok(s.into())
}
