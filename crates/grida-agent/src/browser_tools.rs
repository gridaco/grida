//! GRIDA-SEC-004 — one typed browser catalog for the captured Desktop owner.

use crate::editor_surfaces::{LIST_OPEN, WORKBENCH_LIST_TABS};
use crate::file_tools::{
    ImageCapture, MAX_TOOL_JPEG_BASE64_BYTES, ToolImageError, prepare_tool_jpeg, verify_tool_jpeg,
};
use crate::tool_host::{
    CallBinding, CapabilityCall, CapabilityDefinition, CapabilityEffect, CapabilityExecutor,
};
use agent_kit_core::inference::InputFormat;
use agent_kit_core::messages::{MediaRef, OutcomeStatus, ResultContent, Retention};
use agent_kit_core::tools::{RecoveryKind, ToolDefinition, ToolOutcome};
use agent_kit_core::{ArtifactId, Error, ErrorKind, Result, ToolId};
use grida_agent_master::presentation::{OPEN, WORKBENCH_SHOW};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::collections::BTreeSet;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

pub(crate) const CAPABILITY: &str = "co.grida/session/browser-tools";
pub(crate) const CAPTURE: &str = "browser_capture";
pub(crate) const WORKBENCH_CLOSE_BROWSER_TAB: &str = "workbench_close_browser_tab";
const CLOSE: &str = "browser_close";
pub(crate) const HELP: &str = "browser_help";
pub(crate) const NAMES: &[&str] = &[
    LIST_OPEN,
    OPEN,
    "browser_open",
    "browser_snapshot",
    "browser_navigate",
    "browser_action",
    "browser_wait",
    CAPTURE,
    "browser_diagnostics",
    "browser_evaluate",
    CLOSE,
    HELP,
];

pub(crate) fn names(workbench: bool) -> &'static [&'static str] {
    static WORKBENCH_NAMES: OnceLock<Vec<&str>> = OnceLock::new();
    if !workbench {
        return NAMES;
    }
    WORKBENCH_NAMES.get_or_init(|| {
        NAMES
            .iter()
            .map(|&name| match name {
                LIST_OPEN => WORKBENCH_LIST_TABS,
                OPEN => WORKBENCH_SHOW,
                other => other,
            })
            .chain([WORKBENCH_CLOSE_BROWSER_TAB])
            .collect()
    })
}

pub(crate) fn wire_name(name: &str) -> &str {
    match name {
        WORKBENCH_LIST_TABS => LIST_OPEN,
        WORKBENCH_SHOW => OPEN,
        WORKBENCH_CLOSE_BROWSER_TAB => CLOSE,
        other => other,
    }
}

pub(crate) fn wire_arguments(name: &str, arguments: &Value) -> Value {
    if name == WORKBENCH_CLOSE_BROWSER_TAB {
        json!({"target":{"kind":"workbench","tabId":arguments["tabId"]}})
    } else {
        arguments.clone()
    }
}

pub(crate) const MAX_INPUT_BYTES: usize = 40 * 1024;
pub(crate) const MAX_REPLY_BYTES: usize = 448 * 1024;
const IMAGE_MIME: &str = "image/jpeg";
const IMAGE_PREFIX: &str = "browser-capture/";
const IMAGE_LOCATOR: &str = "browser-result-jpeg:";
const OWNER_CALL_TIME: Duration = Duration::from_secs(8);
const RESPONSE_MARGIN: Duration = Duration::from_millis(150);

pub(crate) fn append_legacy_browser_guidance(instructions: &mut String, retained: bool) {
    instructions.push_str(r#"For new browser work, use browser_open to open a background page. Copy its entire target object, {"kind":"background","pageId":"…"}, into subsequent calls. Pass its readiness object to browser_wait with condition {"kind":"ready","state":"load"}. Then use browser_snapshot with that target to get the current documentId and element refs. The snapshot's documentId identifies the loaded document. To click, use browser_action with the same target, the current documentId, and {"kind":"click","ref":"…"} as the action. Copy the snapshot node's ref field. Check the page again after an action. Close background pages you no longer need with browser_close and their target object.

For an already open tab, use surface_list_open to get its exact tab ID and use {"kind":"workbench","tabId":"…"} as the browser target."#);
    if retained {
        instructions.push_str(" Use surface_open for explicit presentation.");
    }
    instructions.push_str(" A page stays with its original owner. Evaluation can change the page. After an unknown action outcome, observe the same target before retrying.");
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BrowserToolDescriptor {
    name: String,
    version: u32,
    effect: CapabilityEffect,
    description: String,
    input_schema: Value,
    output_schema: Value,
}

// The Desktop browser feature owns these schemas. Both legacy transports
// continue to bind calls to their existing browser owner under that catalog.
const CATALOG: &str = include_str!("../../../extensions/browser/tools.json");

fn parse_catalog(source: &str) -> Option<Vec<BrowserToolDescriptor>> {
    let catalog: Vec<BrowserToolDescriptor> = serde_json::from_str(source).ok()?;
    let names: BTreeSet<_> = catalog.iter().map(|tool| tool.name.as_str()).collect();
    if catalog.len() != NAMES.len()
        || names != NAMES.iter().copied().collect()
        || catalog.iter().any(|tool| {
            tool.version == 0
                || (tool.name == grida_agent_master::presentation::OPEN
                    && (tool.version != grida_agent_master::presentation::TARGETED_VERSION
                        || tool.effect != CapabilityEffect::Presentation))
                || (tool.name == crate::editor_surfaces::LIST_OPEN && tool.version != 3)
                || tool.description.is_empty()
                || tool.input_schema["type"] != "object"
                || tool.output_schema["type"] != "object"
        })
    {
        return None;
    }
    Some(catalog)
}

fn descriptor(name: &str) -> Result<&'static BrowserToolDescriptor> {
    static PARSED: OnceLock<Option<Vec<BrowserToolDescriptor>>> = OnceLock::new();
    PARSED
        .get_or_init(|| parse_catalog(CATALOG))
        .as_ref()
        .ok_or_else(|| Error::new(ErrorKind::InvalidState, "invalid_browser_tool_catalog"))?
        .iter()
        .find(|tool| tool.name == name)
        .ok_or_else(invalid)
}

pub(crate) fn definitions(
    executor: impl Fn(&'static str) -> Arc<dyn CapabilityExecutor>,
) -> Result<Vec<(CapabilityDefinition, Arc<dyn CapabilityExecutor>)>> {
    native_definitions(false, executor)
}

pub(crate) fn native_definitions(
    workbench: bool,
    executor: impl Fn(&'static str) -> Arc<dyn CapabilityExecutor>,
) -> Result<Vec<(CapabilityDefinition, Arc<dyn CapabilityExecutor>)>> {
    names(workbench)
        .iter()
        .map(|&name| Ok((definition(name, workbench)?, executor(name))))
        .collect()
}

pub(crate) fn definition(name: &str, workbench: bool) -> Result<CapabilityDefinition> {
    let descriptor = descriptor(wire_name(name))?;
    let (version, description) = match (workbench, name) {
        (true, WORKBENCH_SHOW) => (
            descriptor.version,
            "Ask the attached workbench to show a workspace file, HTTP(S) URL, or exact tab. The workbench chooses the viewer. Window focus requires an explicit request. Use browser_open for background browser work.",
        ),
        (true, CLOSE) => (
            2,
            "Close an exact background page owned by this browser scope.",
        ),
        (true, WORKBENCH_CLOSE_BROWSER_TAB) => (
            1,
            "When the user asks to close a visible browser tab, use its exact tab ID from workbench_list_tabs.",
        ),
        _ => (descriptor.version, descriptor.description.as_str()),
    };
    Ok(CapabilityDefinition {
        tool: ToolDefinition {
            id: ToolId::new(name)?,
            version,
            description: description.into(),
            input: InputFormat::Json(
                native_close_schema(name, workbench, descriptor)?
                    .unwrap_or_else(|| descriptor.input_schema.clone()),
            ),
            max_input_bytes: MAX_INPUT_BYTES,
            max_output_bytes: MAX_REPLY_BYTES,
            recovery: RecoveryKind::Unavailable,
        },
        output_schema: descriptor.output_schema.clone(),
        effect: descriptor.effect,
    })
}

fn native_close_schema(
    name: &str,
    workbench: bool,
    descriptor: &BrowserToolDescriptor,
) -> Result<Option<Value>> {
    let kind = match (workbench, name) {
        (true, CLOSE) => "background",
        (true, WORKBENCH_CLOSE_BROWSER_TAB) => "workbench",
        _ => return Ok(None),
    };
    let target = descriptor.input_schema["properties"]["target"]["oneOf"]
        .as_array()
        .and_then(|variants| {
            variants
                .iter()
                .find(|variant| variant["properties"]["kind"]["const"] == kind)
        })
        .ok_or_else(|| Error::new(ErrorKind::InvalidState, "invalid_browser_tool_catalog"))?;
    if name == CLOSE {
        let mut schema = descriptor.input_schema.clone();
        schema["properties"]["target"] = target.clone();
        Ok(Some(schema))
    } else {
        Ok(Some(json!({
            "type":"object",
            "properties":{"tabId":target["properties"]["tabId"]},
            "required":["tabId"],
            "additionalProperties":false
        })))
    }
}

pub(crate) fn validate(name: &str, arguments: &Value) -> Result<()> {
    validate_native(name, false, arguments)
}

pub(crate) fn validate_native(name: &str, workbench: bool, arguments: &Value) -> Result<()> {
    if !names(workbench).contains(&name) {
        return Err(invalid());
    }
    let operation = wire_name(name);
    let descriptor = descriptor(operation)?;
    let schema = native_close_schema(name, workbench, descriptor)?;
    let schema = schema.as_ref().unwrap_or(&descriptor.input_schema);
    if !matches_schema(schema, arguments, false) {
        return Err(invalid());
    }
    if operation == "browser_evaluate"
        && let Some(arg) = arguments.get("arg")
        && serde_json::to_vec(arg).map_or(usize::MAX, |bytes| bytes.len()) > 16 * 1024
    {
        return Err(invalid());
    }
    if operation == "browser_action"
        && arguments["action"]["kind"] == "scroll"
        && arguments["action"]["deltaX"].as_f64().unwrap_or_default() == 0.0
        && arguments["action"]["deltaY"].as_f64().unwrap_or_default() == 0.0
    {
        return Err(invalid());
    }
    if operation == OPEN
        && let Some(path) = arguments["target"]["path"].as_str()
        && !crate::editor_surfaces::valid_path(path)
    {
        return Err(invalid());
    }
    Ok(())
}

// Only the closed schema vocabulary in the browser catalog is needed here. Using
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
    pub(crate) fn with_workbench_help(mut self) -> Self {
        if let Some(data) = self.data.as_mut()
            && data.get("topic").and_then(Value::as_str) == Some("targets")
            && let Some(text) = data.get_mut("text")
            && let Some(previous) = text.as_str()
        {
            *text = Value::String(previous.replace(LIST_OPEN, WORKBENCH_LIST_TABS));
        }
        self
    }

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
                let media = match capture {
                    Capture::Mcp => {
                        if verify_tool_jpeg(&image.mime_type, &image.base64)
                            .await
                            .is_err()
                        {
                            return uncertain();
                        }
                        scoped_jpeg(&call.binding, image.base64)
                    }
                    Capture::Native(retain) => {
                        match prepare_tool_jpeg(&image.mime_type, &image.base64, retain).await {
                            Ok(image) => {
                                data.insert(
                                    "nativeImage".into(),
                                    json!({"width": image.width, "height": image.height}),
                                );
                                Some(image.media)
                            }
                            Err(ToolImageError::Invalid) => return uncertain(),
                            Err(ToolImageError::Unavailable) => None,
                        }
                    }
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
        .filter(|data| !data.is_empty() && data.len() <= MAX_TOOL_JPEG_BASE64_BYTES)
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
    use base64::{Engine, engine::general_purpose::STANDARD};

    #[test]
    fn browser_catalog_requires_the_legacy_names_and_surface_revisions() {
        assert!(parse_catalog(CATALOG).is_some());
        let catalog: Vec<Value> = serde_json::from_str(CATALOG).unwrap();
        for name in [
            crate::editor_surfaces::LIST_OPEN,
            grida_agent_master::presentation::OPEN,
        ] {
            let mut incompatible = catalog.clone();
            let tool = incompatible.iter_mut().find(|tool| tool["name"] == name);
            tool.unwrap()["version"] = json!(2);
            assert!(parse_catalog(&serde_json::to_string(&incompatible).unwrap()).is_none());
        }

        let mut duplicate = catalog.clone();
        duplicate[0] = duplicate[1].clone();
        assert!(parse_catalog(&serde_json::to_string(&duplicate).unwrap()).is_none());

        let mut malformed = catalog;
        malformed[0]["inputSchema"] = json!("object");
        assert!(parse_catalog(&serde_json::to_string(&malformed).unwrap()).is_none());
    }

    #[test]
    fn modern_workbench_names_project_to_the_existing_browser_wire() {
        let legacy = names(false);
        let modern = names(true);
        assert_eq!(modern.len(), legacy.len() + 1);
        for (old, new) in [(LIST_OPEN, WORKBENCH_LIST_TABS), (OPEN, WORKBENCH_SHOW)] {
            assert!(legacy.contains(&old));
            assert!(!legacy.contains(&new));
            assert!(modern.contains(&new));
            assert!(!modern.contains(&old));
            assert_eq!(wire_name(new), old);
            let old = definition(old, false).unwrap();
            let new = definition(new, true).unwrap();
            assert_eq!(new.tool.input, old.tool.input);
            assert_eq!(new.tool.version, old.tool.version);
        }

        for target in [
            json!({"kind":"file","path":"/poster.canvas"}),
            json!({"kind":"url","url":"https://grida.co/_/canvas"}),
            json!({"kind":"tab","tabId":"observed-tab"}),
        ] {
            assert!(validate_native(WORKBENCH_SHOW, true, &json!({"target":target})).is_ok());
        }
        for target in [
            json!({"kind":"url","url":"file:///poster.svg"}),
            json!({"kind":"file","path":"/../poster.svg"}),
        ] {
            assert!(validate_native(WORKBENCH_SHOW, true, &json!({"target":target})).is_err());
        }
    }

    #[test]
    fn modern_browser_close_only_accepts_background_pages() {
        let background = json!({"target":{"kind":"background","pageId":"owned-page"}});
        let visible = json!({"target":{"kind":"workbench","tabId":"observed-tab"}});
        assert!(validate(CLOSE, &background).is_ok());
        assert!(validate(CLOSE, &visible).is_ok());
        assert!(validate_native(CLOSE, true, &background).is_ok());
        assert!(validate_native(CLOSE, true, &visible).is_err());

        let authorized_tab = json!({"tabId":"observed-tab"});
        assert!(validate(WORKBENCH_CLOSE_BROWSER_TAB, &authorized_tab).is_err());
        assert!(validate_native(WORKBENCH_CLOSE_BROWSER_TAB, true, &authorized_tab).is_ok());
        assert!(validate_native(WORKBENCH_CLOSE_BROWSER_TAB, true, &background).is_err());
        assert_eq!(wire_name(WORKBENCH_CLOSE_BROWSER_TAB), CLOSE);
        assert_eq!(
            wire_arguments(WORKBENCH_CLOSE_BROWSER_TAB, &authorized_tab),
            visible
        );
        assert_eq!(definition(CLOSE, false).unwrap().tool.version, 1);
        assert_eq!(definition(CLOSE, true).unwrap().tool.version, 2);
    }

    #[test]
    fn modern_browser_help_names_the_visible_workbench_catalog() {
        let data = json!({"topic":"targets","text":"Get a tab ID from surface_list_open."});
        let reply = Reply {
            disposition: Disposition::NotDispatched,
            data: data.as_object().cloned(),
            error: None,
            image: None,
        };
        assert_eq!(reply.data.as_ref(), data.as_object());
        let modern = reply.with_workbench_help().data.unwrap();
        assert_eq!(modern["text"], "Get a tab ID from workbench_list_tabs.");
    }

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
        let schema = &descriptor("browser_navigate").unwrap().input_schema;
        assert_eq!(schema["type"], "object");
        let mut args = json!({
            "target": {"kind": "workbench", "tabId": "tab"},
            "action": {"kind": "stop"},
        });
        assert!(validate("browser_navigate", &args).is_ok());
        args["action"]["kind"] = json!("reload");
        assert!(!matches_schema(schema, &args, false));
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

    #[tokio::test]
    async fn mcp_capture_requires_complete_decodable_jpeg_pixels() {
        let call = CapabilityCall {
            binding: CallBinding {
                id: BindingId::new("verified-call").unwrap(),
                endpoint: BindingId::new("desktop").unwrap(),
            },
            capability: ToolId::new(CAPTURE).unwrap(),
            version: 1,
            arguments: json!({}),
            cancellation: agent_kit_core::CancellationToken::new(),
            deadline: Instant::now() + OWNER_CALL_TIME,
            max_output_bytes: MAX_REPLY_BYTES,
        };
        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new(&mut jpeg)
            .encode(&[42; 16 * 16 * 3], 16, 16, image::ExtendedColorType::Rgb8)
            .unwrap();
        let scan = jpeg
            .windows(2)
            .position(|bytes| bytes == [0xff, 0xda])
            .unwrap();
        let scan_header = u16::from_be_bytes([jpeg[scan + 2], jpeg[scan + 3]]) as usize;
        let incomplete = &jpeg[..scan + 2 + scan_header];
        // Point the first scan component at a missing Huffman table. The
        // dimensions and closing marker survive, but pixels cannot decode.
        let mut malformed = jpeg.clone();
        malformed[scan + 6] = 0x33;
        for (bytes, status) in [
            (&jpeg[..], OutcomeStatus::Succeeded),
            (incomplete, OutcomeStatus::Uncertain),
            (&malformed[..], OutcomeStatus::Uncertain),
        ] {
            let base64 = STANDARD.encode(bytes);
            let image = Image {
                mime_type: IMAGE_MIME.into(),
                base64: base64.clone(),
            };
            // Both have readable headers, including the complete scan header.
            assert_eq!(
                image::ImageReader::with_format(
                    std::io::Cursor::new(bytes),
                    image::ImageFormat::Jpeg
                )
                .into_dimensions()
                .unwrap(),
                (16, 16),
            );
            let outcome = Reply {
                disposition: Disposition::DispatchedVerified,
                data: None,
                error: None,
                image: Some(image),
            }
            .outcome(&call, Capture::Mcp)
            .await;
            assert_eq!(outcome.status, status);
            if status == OutcomeStatus::Succeeded {
                assert!(matches!(
                    outcome.content.as_slice(),
                    [ResultContent::Media(media)] if mcp_image(media, &call.binding) == Some(&base64)
                ));
            } else {
                assert!(outcome.content.is_empty());
            }
        }
    }
}
