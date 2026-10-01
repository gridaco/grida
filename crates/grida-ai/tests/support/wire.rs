use base64::{Engine, engine::general_purpose::STANDARD};
use grida_ai::{Lane, Request, ResponseCompletion};
use serde_json::{Value, json};

/// Compare protocol semantics, retaining every native header. The TS recorder
/// excludes only the Vercel SDK's Node user-agent; model protocol and auth-method
/// headers remain part of the contract. Unknown native headers fail.
pub fn compare(request: &Request, expected: &Value) -> Result<(), String> {
    let completion = if expected["lane"] == "provider"
        && expected["method"] == "POST"
        && expected["url"] == "https://ai-gateway.vercel.sh/v3/ai/video-model"
    {
        ResponseCompletion::FirstSseEvent
    } else {
        ResponseCompletion::Body
    };
    if request.completion != completion {
        return Err(format!(
            "response completion {:?}, expected {completion:?}",
            request.completion
        ));
    }
    let mut headers = request.headers.clone();
    let content_type = headers.get("content-type").cloned();
    let body = if request.body.is_empty() {
        Value::Null
    } else if let Some(boundary) = content_type
        .as_deref()
        .and_then(|v| v.strip_prefix("multipart/form-data; boundary="))
    {
        if boundary.is_empty()
            || !boundary
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"'-_".contains(&b))
        {
            return Err("invalid multipart boundary".into());
        }
        let opening = format!("--{boundary}\r\n");
        let closing = format!("\r\n--{boundary}--\r\n");
        if !request.body.starts_with(opening.as_bytes())
            || !request.body.ends_with(closing.as_bytes())
        {
            return Err("multipart header/body boundary mismatch".into());
        }
        let separator = request
            .body
            .windows(4)
            .position(|b| b == b"\r\n\r\n")
            .ok_or("missing multipart headers")?;
        let start = separator + 4;
        let end = request.body.len() - closing.len();
        if separator < opening.len() || start > end {
            return Err("invalid multipart body".into());
        }
        let head = std::str::from_utf8(&request.body[opening.len()..separator])
            .map_err(|_| "invalid multipart headers")?;
        let mut part_headers = std::collections::BTreeMap::new();
        for line in head.split("\r\n") {
            let (name, value) = line.split_once(':').ok_or("invalid multipart header")?;
            let name = name.to_ascii_lowercase();
            if !matches!(name.as_str(), "content-disposition" | "content-type")
                || value.contains(['\r', '\n'])
                || part_headers
                    .insert(name, value.trim_matches([' ', '\t']))
                    .is_some()
            {
                return Err("unknown or duplicate multipart header".into());
            }
        }
        let disposition = part_headers
            .get("content-disposition")
            .ok_or("missing multipart disposition")?;
        let fields = regex::Regex::new(
            r#"(?i)^form-data;[ \t]*name="([^"\r\n]+)";[ \t]*filename="([^"\r\n]+)"$"#,
        )
        .unwrap()
        .captures(disposition)
        .ok_or("invalid multipart form-data disposition")?;
        let media_type = part_headers
            .get("content-type")
            .filter(|value| !value.is_empty())
            .ok_or("missing multipart content-type")?;
        let payload = &request.body[start..end];
        if payload
            .windows(boundary.len())
            .any(|b| b == boundary.as_bytes())
        {
            return Err("multipart boundary collides with payload".into());
        }
        headers.insert(
            "content-type".into(),
            "multipart/form-data; boundary=<boundary>".into(),
        );
        json!({"multipart":{"name":&fields[1],"filename":&fields[2],"media_type":media_type,"base64":STANDARD.encode(payload)}})
    } else if content_type.as_deref() == Some("application/octet-stream") {
        json!({"base64":STANDARD.encode(&request.body)})
    } else {
        if content_type.as_deref() != Some("application/json") {
            return Err("nonempty JSON body requires application/json".into());
        }
        serde_json::from_slice(&request.body).map_err(|_| "invalid request JSON")?
    };
    let actual = json!({"lane":match request.lane {Lane::Provider=>"provider",Lane::Download=>"download",Lane::Upload=>"upload"},"method":request.method,"url":request.url,"headers":headers,"body":body});
    if &actual != expected {
        return Err(format!(
            "request differs: actual {actual}, expected {expected}"
        ));
    }
    Ok(())
}
