//! GRIDA-SEC-004 — one typed browser catalog for the captured Desktop owner.

use crate::file_tools::ImageCapture;
use crate::tool_host::{
    CallBinding, CapabilityCall, CapabilityDefinition, CapabilityEffect, CapabilityExecutor,
};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{MediaRef, OutcomeStatus, ResultContent, Retention};
use agent_kit_core::tools::{RecoveryKind, ToolDefinition, ToolOutcome};
use agent_kit_core::{ArtifactId, Error, ErrorKind, Result, ToolId};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::sync::Arc;
use std::time::{Duration, Instant};

pub(crate) const CAPABILITY: &str = "co.grida/session/browser-tools";
pub(crate) const CAPTURE: &str = "browser_capture";
pub(crate) const NAMES: &[&str] = &[
    "surface_list_open",
    "surface_open",
    "browser_open",
    "browser_snapshot",
    "browser_navigate",
    "browser_action",
    "browser_wait",
    CAPTURE,
    "browser_diagnostics",
    "browser_evaluate",
    "browser_close",
    "browser_help",
];

pub(crate) const MAX_INPUT_BYTES: usize = 40 * 1024;
pub(crate) const MAX_REPLY_BYTES: usize = 448 * 1024;
const MAX_IMAGE_BYTES: usize = 256 * 1024;
const IMAGE_MIME: &str = "image/jpeg";
const IMAGE_PREFIX: &str = "browser-capture/";
const IMAGE_LOCATOR: &str = "browser-result-jpeg:";
const OWNER_CALL_TIME: Duration = Duration::from_secs(8);
const RESPONSE_MARGIN: Duration = Duration::from_millis(150);

pub(crate) const INSTRUCTIONS: &str = r#"For new browser work, use browser_open to open a background page. Copy its entire target object, {"kind":"background","pageId":"…"}, into subsequent calls. Pass its readiness object to browser_wait with condition {"kind":"ready","state":"load"}. Then use browser_snapshot with that target to get the current documentId and element refs. The snapshot's documentId identifies the loaded document. To click, use browser_action with the same target, the current documentId, and {"kind":"click","ref":"…"} as the action. Copy the snapshot node's ref field. Check the page again after an action. Close background pages you no longer need with browser_close and their target object.

For an already open tab, use surface_list_open to get its exact tab ID and use {"kind":"workbench","tabId":"…"} as the browser target. Use surface_open for explicit presentation. A page stays with its original owner. Evaluation can change the page. After an unknown action outcome, observe the same target before retrying."#;

pub(crate) fn definitions(
    executor: impl Fn(&'static str) -> Arc<dyn CapabilityExecutor>,
) -> Result<Vec<(CapabilityDefinition, Arc<dyn CapabilityExecutor>)>> {
    NAMES
        .iter()
        .map(|name| {
            let (description, input, effect) = spec(name).ok_or_else(invalid)?;
            Ok((
                CapabilityDefinition {
                    tool: ToolDefinition {
                        id: ToolId::new(*name)?,
                        version: match *name {
                            grida_agent_master::presentation::OPEN => grida_agent_master::presentation::TARGETED_VERSION,
                            "surface_list_open" => 3,
                            _ => 1,
                        },
                        description: description.into(),
                        input: InputFormat::Json(input),
                        max_input_bytes: MAX_INPUT_BYTES,
                        max_output_bytes: MAX_REPLY_BYTES,
                        recovery: RecoveryKind::Unavailable,
                    },
                    output_schema: json!({
                        "type": "object",
                        "properties": {
                            "disposition": {"enum": ["not_dispatched", "dispatched_verified", "unknown"]},
                            "error": {"type": "string"}
                        },
                        "required": ["disposition"]
                    }),
                    effect,
                },
                executor(name),
            ))
        })
        .collect()
}

fn spec(name: &str) -> Option<(&'static str, Value, CapabilityEffect)> {
    use CapabilityEffect::{Mutation, Presentation, Read};
    Some(match name {
        "surface_list_open" => (
            "Inspect the exact authorized workbench's open file and browser tabs. Use the returned tab ID to target what the user is viewing.",
            object(json!({}), &[]),
            Read,
        ),
        "surface_open" => (
            "Present a workspace file as described by artifact guidance, or explicitly show a URL or existing tab in the workbench. Use browser_open for new background browser work.",
            object(
                json!({
                    "target": variants([
                        tagged("file", json!({"path": text(grida_agent_master::presentation::MAX_PATH_BYTES)}), &["path"]),
                        tagged("url", json!({"url": url()}), &["url"]),
                        tagged("tab", json!({"tabId": identifier()}), &["tabId"]),
                    ]),
                    "presentation": {"enum":["reveal","focus"]}
                }),
                &["target"],
            ),
            Presentation,
        ),
        "browser_open" => (
            "Open a new independent background page at an HTTP(S) URL. Wait on the returned navigation readiness.",
            object(json!({"url": url()}), &["url"]),
            Mutation,
        ),
        "browser_snapshot" => (
            "Get a page's current documentId, element refs, and viewport. Pass the entire target object. Omit documentId to discover the current document.",
            page(json!({}), &[]),
            Read,
        ),
        "browser_navigate" => (
            "Navigate the exact page guarded by its current document and return navigation readiness. For stop, omit documentId to interrupt the target's pending load.",
            navigation(),
            Mutation,
        ),
        "browser_action" => (
            r#"Perform one click, fill, key press, select, hover, or scroll. Supply the target object and current documentId. For a click, set action to {"kind":"click","ref":"…"} using a ref from the snapshot. Verify the result afterward."#,
            page(json!({"action": actions()}), &["documentId", "action"]),
            Mutation,
        ),
        "browser_wait" => (
            "Wait for a page condition. Use readiness from browser_open or browser_navigate, or guard a current document.",
            targeted(
                json!({
                    "readiness": variants([
                        tagged("navigation", json!({"navigationId": identifier()}), &["navigationId"]),
                        tagged("document", json!({"documentId": identifier()}), &["documentId"]),
                    ]),
                    "condition": variants([
                        tagged("ready", json!({"state":{"enum":["dom-content-loaded","load"]}}), &["state"]),
                        tagged("text", json!({"text":nonempty_text(512)}), &["text"]),
                        tagged("url", json!({"url":nonempty_text(4096)}), &["url"]),
                        tagged("ref", json!({"ref":identifier(),"state":{"enum":["attached","detached","visible","hidden"]}}), &["ref","state"]),
                    ]),
                    "timeoutMs": timeout(),
                }),
                &["condition"],
            ),
            Read,
        ),
        CAPTURE => (
            "Capture viewport pixels and metadata from the exact guarded document. Available to MCP clients and native model connections that accept tool images.",
            page(json!({}), &["documentId"]),
            Read,
        ),
        "browser_diagnostics" => (
            "Read bounded console messages and page or load errors for the target.",
            page(
                json!({"limit": {"type":"integer","minimum":1,"maximum":100}, "cursor": identifier()}),
                &[],
            ),
            Read,
        ),
        "browser_evaluate" => (
            "Call a JavaScript function with one JSON argument in the exact guarded website document. It can affect the website and cannot access Desktop APIs.",
            page(
                json!({"functionText":nonempty_text(16_384),"arg":{},"timeoutMs":timeout()}),
                &["documentId", "functionText"],
            ),
            Mutation,
        ),
        "browser_close" => (
            "Close the exact background page or user-requested workbench tab.",
            object(json!({"target": target()}), &["target"]),
            Mutation,
        ),
        "browser_help" => (
            "Read the browser tool contract for a topic.",
            object(
                json!({"topic":{"enum":["targets","actions","wait","capture","errors"]}}),
                &[],
            ),
            Read,
        ),
        _ => return None,
    })
}

fn navigation() -> Value {
    let mut schema = variants([
        page(
            json!({"action": tagged("stop", json!({}), &[])}),
            &["action"],
        ),
        page(
            json!({"action": variants([
                tagged("goto", json!({"url":url()}), &["url"]),
                tagged("back", json!({}), &[]),
                tagged("forward", json!({}), &[]),
                tagged("reload", json!({}), &[]),
            ])}),
            &["documentId", "action"],
        ),
    ]);
    schema["type"] = json!("object");
    schema
}

fn actions() -> Value {
    variants([
        tagged(
            "fill",
            json!({"ref":identifier(),"value":text(8192)}),
            &["ref", "value"],
        ),
        tagged("click", json!({"ref":identifier()}), &["ref"]),
        tagged("click", json!({"point":point()}), &["point"]),
        tagged("hover", json!({"ref":identifier()}), &["ref"]),
        tagged("hover", json!({"point":point()}), &["point"]),
        tagged(
            "press",
            json!({
                "key":nonempty_text(32),
                "ref":identifier(),
                "modifiers":{
                    "type":"array", "maxItems":4, "uniqueItems":true,
                    "items":{"enum":["Alt","Control","Meta","Shift"]}
                }
            }),
            &["key"],
        ),
        tagged(
            "select",
            json!({"ref":identifier(),"value":text(8192)}),
            &["ref", "value"],
        ),
        tagged(
            "scroll",
            json!({"deltaX":scroll_delta(),"deltaY":scroll_delta(),"point":point()}),
            &[],
        ),
    ])
}

fn point() -> Value {
    object(
        json!({"x":coordinate(),"y":coordinate(),"viewportId":identifier()}),
        &["x", "y", "viewportId"],
    )
}

fn coordinate() -> Value {
    json!({"type":"number","minimum":0,"maximum":32_000})
}

fn scroll_delta() -> Value {
    json!({"type":"number","minimum":-12_000,"maximum":12_000})
}

fn target() -> Value {
    variants([
        tagged("background", json!({"pageId": identifier()}), &["pageId"]),
        tagged("workbench", json!({"tabId": identifier()}), &["tabId"]),
    ])
}

fn page(mut properties: Value, required: &[&str]) -> Value {
    properties["documentId"] = identifier();
    targeted(properties, required)
}

fn targeted(mut properties: Value, required: &[&str]) -> Value {
    properties["target"] = target();
    object(
        properties,
        &["target"]
            .into_iter()
            .chain(required.iter().copied())
            .collect::<Vec<_>>(),
    )
}

fn tagged(kind: &str, mut properties: Value, required: &[&str]) -> Value {
    properties["kind"] = json!({"const": kind});
    object(
        properties,
        &["kind"]
            .into_iter()
            .chain(required.iter().copied())
            .collect::<Vec<_>>(),
    )
}

fn object(properties: Value, required: &[&str]) -> Value {
    json!({"type":"object", "properties":properties, "required":required, "additionalProperties":false})
}

fn variants<const N: usize>(schemas: [Value; N]) -> Value {
    json!({"oneOf":schemas.into_iter().collect::<Vec<_>>()})
}

fn identifier() -> Value {
    nonempty_text(128)
}

fn text(maximum: usize) -> Value {
    json!({"type":"string","maxLength":maximum})
}

fn nonempty_text(maximum: usize) -> Value {
    json!({"type":"string","minLength":1,"maxLength":maximum})
}

fn url() -> Value {
    json!({"type":"string","format":"uri","minLength":1,"maxLength":4096})
}

fn timeout() -> Value {
    json!({"type":"integer","minimum":1,"maximum":5000})
}

pub(crate) fn validate(name: &str, arguments: &Value) -> Result<()> {
    let (_, schema, _) = spec(name).ok_or_else(invalid)?;
    if !matches_schema(&schema, arguments, false) {
        return Err(invalid());
    }
    if name == "browser_evaluate"
        && let Some(arg) = arguments.get("arg")
        && serde_json::to_vec(arg).map_or(usize::MAX, |bytes| bytes.len()) > 16 * 1024
    {
        return Err(invalid());
    }
    if name == "browser_action"
        && arguments["action"]["kind"] == "scroll"
        && arguments["action"]["deltaX"].as_f64().unwrap_or_default() == 0.0
        && arguments["action"]["deltaY"].as_f64().unwrap_or_default() == 0.0
    {
        return Err(invalid());
    }
    if name == "surface_open"
        && let Some(path) = arguments["target"]["path"].as_str()
        && !crate::editor_surfaces::valid_path(path)
    {
        return Err(invalid());
    }
    Ok(())
}

// Only the closed schema vocabulary constructed above is needed here. Using
// the same schema for discovery and admission prevents them drifting apart.
fn matches_schema(schema: &Value, value: &Value, count_code_points: bool) -> bool {
    if let Some(variants) = schema["oneOf"].as_array() {
        return variants
            .iter()
            .filter(|variant| matches_schema(variant, value, count_code_points))
            .take(2)
            .count()
            == 1;
    }
    if let Some(expected) = schema.get("const") {
        return value == expected;
    }
    if let Some(values) = schema["enum"].as_array() {
        return values.contains(value);
    }
    match schema["type"].as_str() {
        Some("object") => value.as_object().is_some_and(|object| {
            schema["required"].as_array().is_some_and(|required| {
                required
                    .iter()
                    .all(|key| key.as_str().is_some_and(|key| object.contains_key(key)))
            }) && object.iter().all(|(key, value)| {
                schema["properties"]
                    .get(key)
                    // The wait's text condition has a Unicode limit. The other
                    // string fields retain their transport byte limits.
                    .is_some_and(|schema| matches_schema(schema, value, key == "text"))
            })
        }),
        Some("string") => value.as_str().is_some_and(|text| {
            let length = if count_code_points {
                text.chars().count()
            } else {
                text.len()
            };
            length >= schema["minLength"].as_u64().unwrap_or(0) as usize
                && length <= schema["maxLength"].as_u64().unwrap_or(u64::MAX) as usize
                && (schema["format"] != "uri"
                    || reqwest::Url::parse(text).is_ok_and(|url| {
                        matches!(url.scheme(), "http" | "https") && url.host().is_some()
                    }))
        }),
        Some("number" | "integer") => value.as_f64().is_some_and(|number| {
            (schema["type"] != "integer" || value.as_i64().is_some())
                && number >= schema["minimum"].as_f64().unwrap_or(f64::MIN)
                && number <= schema["maximum"].as_f64().unwrap_or(f64::MAX)
        }),
        Some("array") => value.as_array().is_some_and(|array| {
            array.len() <= schema["maxItems"].as_u64().unwrap_or(0) as usize
                && array.iter().enumerate().all(|(index, item)| {
                    matches_schema(&schema["items"], item, count_code_points)
                        && (schema["uniqueItems"] != true || !array[..index].contains(item))
                })
        }),
        None => schema.as_object().is_some_and(Map::is_empty),
        _ => false,
    }
}

fn invalid() -> Error {
    Error::new(ErrorKind::InvalidInput, "invalid_browser_tool_arguments")
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Disposition {
    NotDispatched,
    DispatchedVerified,
    Unknown,
}

impl Disposition {
    fn label(&self) -> &'static str {
        match self {
            Self::NotDispatched => "not_dispatched",
            Self::DispatchedVerified => "dispatched_verified",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Image {
    mime_type: String,
    base64: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Reply {
    disposition: Disposition,
    data: Option<Map<String, Value>>,
    error: Option<String>,
    image: Option<Image>,
}

#[derive(Clone)]
pub(crate) enum Capture {
    Mcp,
    Native(Option<Arc<ImageCapture>>),
}

impl Capture {
    pub(crate) fn available(&self) -> bool {
        !matches!(self, Self::Native(None))
    }
}

pub(crate) fn deadline(call: &CapabilityCall) -> Instant {
    call.deadline.min(Instant::now() + OWNER_CALL_TIME)
}

pub(crate) fn owner_timeout(deadline: Instant) -> Option<u64> {
    deadline
        .checked_duration_since(Instant::now())?
        .checked_sub(RESPONSE_MARGIN)
        .map(|duration| duration.as_millis() as u64)
        .filter(|duration| *duration > 0)
}

impl Reply {
    pub(crate) async fn outcome(self, call: &CapabilityCall, capture: Capture) -> ToolOutcome {
        let mut data = self.data.unwrap_or_default();
        if data.contains_key("disposition") || data.contains_key("error") {
            return uncertain();
        }
        let mut content = Vec::new();
        let status = if matches!(self.disposition, Disposition::Unknown) {
            OutcomeStatus::Uncertain
        } else if self.error.is_some() {
            OutcomeStatus::Failed
        } else {
            OutcomeStatus::Succeeded
        };
        if let Some(error) = self.error {
            if error.is_empty()
                || error.len() > 128
                || !error
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte == b'_' || byte.is_ascii_digit())
            {
                return uncertain();
            }
            content.push(ResultContent::Text(error.clone()));
            data.insert("error".into(), error.into());
        }
        match self.image {
            Some(image)
                if status == OutcomeStatus::Succeeded && call.capability.as_str() == CAPTURE =>
            {
                let Some(bytes) = image.decode() else {
                    return uncertain();
                };
                let media = match capture {
                    Capture::Mcp => scoped_jpeg(&call.binding, image.base64),
                    Capture::Native(Some(retain)) => {
                        let result = tokio::task::spawn_blocking(move || {
                            let normalized = crate::host::image_preparation::prepare(&bytes)?;
                            let media = retain(normalized.bytes)?;
                            Ok::<_, Error>((media, normalized.preparation))
                        })
                        .await
                        .ok()
                        .and_then(Result::ok);
                        result.map(|(media, preparation)| {
                            data.insert(
                                "nativeImage".into(),
                                json!({"width": preparation.width, "height": preparation.height}),
                            );
                            media
                        })
                    }
                    Capture::Native(None) => None,
                };
                let Some(media) = media else {
                    return failure(
                        "browser_capture_media_unavailable",
                        self.disposition.label(),
                    );
                };
                content.push(ResultContent::Media(media));
            }
            Some(_) => return uncertain(),
            None if call.capability.as_str() == CAPTURE && status == OutcomeStatus::Succeeded => {
                return uncertain();
            }
            None => {}
        }
        data.insert("disposition".into(), self.disposition.label().into());
        ToolOutcome {
            status,
            content,
            structured: Some(Value::Object(data)),
            receipt: None,
            truncated: false,
        }
    }
}

impl Image {
    fn decode(&self) -> Option<Vec<u8>> {
        if self.mime_type != IMAGE_MIME || self.base64.len() > MAX_IMAGE_BYTES.div_ceil(3) * 4 {
            return None;
        }
        let bytes = STANDARD.decode(&self.base64).ok()?;
        if bytes.len() > MAX_IMAGE_BYTES {
            return None;
        }
        let (width, height) =
            image::ImageReader::with_format(std::io::Cursor::new(&bytes), image::ImageFormat::Jpeg)
                .into_dimensions()
                .ok()?;
        (width > 0 && height > 0 && width.max(height) <= 1024).then_some(bytes)
    }
}

fn scoped_jpeg(binding: &CallBinding, base64: String) -> Option<MediaRef> {
    Some(MediaRef {
        id: ArtifactId::new(format!("{IMAGE_PREFIX}{}", binding.id.as_str())).ok()?,
        access_scope: binding.id.clone(),
        media_type: IMAGE_MIME.into(),
        locator: format!("{IMAGE_LOCATOR}{base64}"),
        retention: Retention::Ephemeral,
    })
}

/// This is an in-memory browser capture for this verified call. It never opens
/// a locator as a path or resolves retained media from a different capability.
pub(crate) fn mcp_image<'a>(media: &'a MediaRef, binding: &CallBinding) -> Option<&'a str> {
    if media.access_scope != binding.id
        || media.media_type != IMAGE_MIME
        || media.retention != Retention::Ephemeral
        || media.id.as_str().strip_prefix(IMAGE_PREFIX) != Some(binding.id.as_str())
    {
        return None;
    }
    media
        .locator
        .strip_prefix(IMAGE_LOCATOR)
        .filter(|data| !data.is_empty() && data.len() <= MAX_IMAGE_BYTES.div_ceil(3) * 4)
}

fn failure(code: &str, disposition: &'static str) -> ToolOutcome {
    let mut outcome = ToolOutcome::failed(code);
    outcome.structured = Some(json!({"error":code,"disposition":disposition}));
    outcome
}

pub(crate) fn unavailable(code: &str) -> ToolOutcome {
    failure(code, "not_dispatched")
}

pub(crate) fn uncertain() -> ToolOutcome {
    let mut outcome = ToolOutcome::uncertain();
    outcome.structured = Some(json!({"disposition":"unknown"}));
    outcome
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::BindingId;

    #[test]
    fn wait_text_limit_counts_unicode_code_points() {
        let mut args = json!({
            "target": {"kind": "workbench", "tabId": "tab"},
            "condition": {"kind": "text", "text": "界🙂".repeat(256)},
        });
        assert!(validate("browser_wait", &args).is_ok());
        args["condition"]["text"] = json!("🙂".repeat(513));
        assert!(validate("browser_wait", &args).is_err());
        args["condition"] = json!({"kind": "url", "url": "界".repeat(1366)});
        assert!(validate("browser_wait", &args).is_err());
    }

    #[test]
    fn only_stop_allows_navigation_without_a_document_guard() {
        let (_, schema, _) = spec("browser_navigate").unwrap();
        assert_eq!(schema["type"], "object");
        let mut args = json!({
            "target": {"kind": "workbench", "tabId": "tab"},
            "action": {"kind": "stop"},
        });
        assert!(validate("browser_navigate", &args).is_ok());
        args["action"]["kind"] = json!("reload");
        assert!(!matches_schema(&schema, &args, false));
        assert!(validate("browser_navigate", &args).is_err());
        args["documentId"] = json!("document");
        assert!(validate("browser_navigate", &args).is_ok());
    }

    #[test]
    fn browser_capture_projection_is_bound_to_the_verified_call() {
        let owned = CallBinding {
            id: BindingId::new("verified-call").unwrap(),
            endpoint: BindingId::new("exact-endpoint").unwrap(),
        };
        let other = CallBinding {
            id: BindingId::new("another-call").unwrap(),
            endpoint: owned.endpoint.clone(),
        };
        let mut media = scoped_jpeg(&owned, "aW1hZ2U=".into()).unwrap();
        assert_eq!(mcp_image(&media, &owned), Some("aW1hZ2U="));
        assert_eq!(mcp_image(&media, &other), None);
        media.locator = "file:///tmp/browser-capture.jpg".into();
        assert_eq!(mcp_image(&media, &owned), None);
    }
}
