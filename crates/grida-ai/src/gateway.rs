// GRIDA-SEC-004 / GRIDA-SEC-006 — public discovery never carries invocation authority.
use crate::{Catalog, Failure, Lane, MediaClient, Request, Result, invalid};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

const ORIGIN: &str = "https://gateway.grida.ai";
const LIMIT: usize = 2 * 1024 * 1024;

/// Current public offerings intersected with native interfaces. Model identity is
/// data; supporting a new wire protocol still requires a client release.
pub struct GatewayCatalogue {
    operations: Vec<Value>,
    pub revision: String,
    rigging: BTreeMap<String, Value>,
}
impl GatewayCatalogue {
    pub fn from_public(models: &Value, contracts: &Value) -> Result<Self> {
        if models["object"] != "list" {
            return Err(invalid());
        }
        let revision = bounded(&models["revision"], 160)?.to_owned();
        let data = models["data"]
            .as_array()
            .filter(|v| v.len() <= 1024)
            .ok_or_else(invalid)?;
        let entries = contracts["x-gg-operations"]
            .as_array()
            .filter(|v| v.len() <= 2048)
            .ok_or_else(invalid)?;
        let mut offered = BTreeMap::new();
        for model in data {
            let id = bounded(&model["id"], 256)?;
            if model["object"] != "model" || offered.insert(id, model).is_some() {
                return Err(invalid());
            }
        }
        let mut seen = BTreeSet::new();
        let mut operations = Vec::new();
        let mut schema_budget = 8 * 1024 * 1024;
        for entry in entries {
            let Some(model_id) = entry["model_id"].as_str() else {
                continue;
            };
            let Some(model) = offered.get(model_id) else {
                continue;
            };
            let operation = bounded(&entry["operation_id"], 256)?;
            if !operation
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
                || !seen.insert(operation)
            {
                return Err(invalid());
            }
            if !model["gg"]["operation_ids"]
                .as_array()
                .is_some_and(|v| v.iter().any(|id| id == operation))
            {
                continue;
            }
            if entry["content_type"] != "application/json" || entry["request_view"] != "json" {
                continue;
            }
            let kind = entry["kind"].as_str().unwrap_or("");
            let (interface, field, media) = match (
                kind,
                entry["path"].as_str(),
                entry["delivery"].as_str(),
                entry["response_mode"].as_str(),
            ) {
                (
                    "image",
                    Some("/v1/images/generations"),
                    Some("transient_base64"),
                    Some("synchronous"),
                ) => ("images.generations", "images", "image/*"),
                (
                    "image",
                    Some("/v1/images/edits"),
                    Some("transient_base64"),
                    Some("synchronous"),
                ) => ("images.edits", "images", "image/*"),
                ("video", Some("/v1/videos"), Some("provider_reference"), Some("job")) => {
                    ("videos", "videos", "video/*")
                }
                ("music", Some(path), Some("provider_reference"), Some("job"))
                    if path == format!("/v1/endpoints/{operation}") =>
                {
                    ("endpoints", "audio", "audio/*")
                }
                ("three-d", Some(path), Some("provider_reference"), Some("job"))
                    if path == format!("/v1/endpoints/{operation}")
                        && entry["variant"] != "mesh" =>
                {
                    ("endpoints", "glb", "model/gltf-binary")
                }
                _ => continue,
            };
            if !model["gg"]["interfaces"]
                .as_array()
                .is_some_and(|v| v.iter().any(|i| i == interface))
            {
                continue;
            }
            let variant = match entry["variant"].as_str() {
                Some("generate") if kind == "music" => "text",
                Some(v @ ("text" | "references" | "image" | "multiview")) => v,
                _ => continue,
            };
            let mut schema = resolve(&entry["request_schema"], contracts, 0, &mut schema_budget)?;
            if schema["type"] != "object"
                || !schema["properties"].is_object()
                || schema["additionalProperties"] != false
            {
                continue;
            }
            // Selection supplies the fixed model throughout root object constraints,
            // including intersections introduced while resolving $ref siblings.
            if !project_selected_model(&mut schema, model_id) {
                continue;
            }
            let result_schema = resolve(&entry["result_schema"], contracts, 0, &mut schema_budget)?;
            if !known_result(kind, &result_schema) {
                continue;
            }
            let mut descriptor = json!({
                "kind": kind, "model_id": model_id, "provider_id": "gg", "binding_id": model_id,
                "variant": variant, "status": "listed", "input_schema": schema,
                "output": {"representation":"native","data":"Uint8Array","field":field,
                    "cardinality":if matches!(kind,"music"|"three-d") {"one"} else {"many"},
                    "media_types":[media],"max_total_bytes":crate::media::MEDIA_BYTES},
                "operation_id": operation,
                "gateway_operation": {"id":operation,"interface":interface,"result_schema":result_schema},
                "catalogue_revision": revision,
                "pricing": model["gg"]["pricing"], "pricing_context": model["gg"]["pricing_context"],
            });
            if kind == "three-d" {
                descriptor["feature"] = json!("model-generation");
            }
            operations.push(descriptor);
        }
        operations.sort_by(|a, b| {
            a["gateway_operation"]["id"]
                .as_str()
                .cmp(&b["gateway_operation"]["id"].as_str())
        });
        Ok(Self {
            operations,
            revision,
            rigging: BTreeMap::new(),
        })
    }
    fn from_discovery(models: &Value, endpoints: &Value, contracts: &Value) -> Result<Self> {
        let mut current = Self::from_public(models, contracts)?;
        if endpoints["object"] != "list" || endpoints["revision"] != models["revision"] {
            return Err(invalid());
        }
        let endpoints = endpoints["data"]
            .as_array()
            .filter(|a| a.len() <= 2048)
            .ok_or_else(invalid)?;
        let mut seen = BTreeSet::new();
        let mut schema_budget = 8 * 1024 * 1024;
        let installed = Catalog::bundled();
        for endpoint in endpoints {
            let id = bounded(&endpoint["id"], 256)?;
            if endpoint["object"] != "endpoint" || !seen.insert(id) {
                return Err(invalid());
            }
            let Some(entry) = contracts["x-gg-operations"]
                .as_array()
                .and_then(|entries| entries.iter().find(|e| e["operation_id"] == id))
            else {
                continue;
            };
            if endpoint["operation"] != id
                || entry["endpoint_id"] != id
                || entry["path"] != format!("/v1/endpoints/{id}")
                || endpoint["model"] != entry["model_id"]
                || endpoint["kind"] != "three-d"
                || entry["kind"] != "three-d"
                || entry["variant"] != "mesh"
                || entry["response_mode"] != "job"
                || entry["content_type"] != "application/json"
                || entry["request_view"] != "json"
            {
                continue;
            }
            let valid = match entry["feature"].as_str() {
                Some("rigging") => {
                    entry["delivery"] == "provider_reference"
                        && !entry["model_id"].is_null()
                        && models["data"].as_array().is_some_and(|models| {
                            models.iter().any(|m| {
                                m["id"] == entry["model_id"]
                                    && m["gg"]["interfaces"].as_array().is_some_and(|interfaces| {
                                        interfaces.iter().any(|interface| interface == "endpoints")
                                    })
                                    && m["gg"]["operation_ids"]
                                        .as_array()
                                        .is_some_and(|ops| ops.iter().any(|op| op == id))
                            })
                        })
                }
                Some("rig-check") => {
                    id == "three-d.tripo.rig-check"
                        && entry["model_id"].is_null()
                        && entry["delivery"] == "structured"
                }
                _ => false,
            };
            if !valid {
                continue;
            }
            let request = resolve(&entry["request_schema"], contracts, 0, &mut schema_budget)?;
            if !fixed_rigging_request(&request, entry, &installed) {
                continue;
            }
            let result = resolve(&entry["result_schema"], contracts, 0, &mut schema_budget)?;
            let compatible = if entry["feature"] == "rigging" {
                known_result("three-d", &result)
            } else {
                result["type"] == "object"
                    && result["properties"]["riggable"]["type"] == "boolean"
                    && result["properties"]["rig_type"]["type"] == "string"
                    && result["required"].as_array().is_some_and(|required| {
                        required.iter().any(|p| p == "riggable")
                            && required.iter().any(|p| p == "rig_type")
                    })
            };
            if compatible {
                current.rigging.insert(id.to_owned(), endpoint.clone());
            }
        }
        Ok(current)
    }
    /// Replace all bundled GG choices. Discovery failure never falls back to a
    /// stale offering; BYOK remains the installed adapter snapshot.
    pub fn overlay(self, mut catalogue: Catalog) -> Catalog {
        let mut current = self.operations;
        for offered in &mut current {
            // These installed native adapters own local-file uploads and a
            // different input representation. Keep their typed implementation,
            // but only while the exact GG model/variant is currently offered.
            if offered["kind"] == "three-d"
                && let Some(installed) = catalogue.operations.iter().find(|d| {
                    d["provider_id"] == "gg"
                        && d["kind"] == "three-d"
                        && d["feature"] == "model-generation"
                        && d["model_id"] == offered["model_id"]
                        && d["variant"] == offered["variant"]
                })
            {
                let operation_id = offered["operation_id"].clone();
                let pricing = offered["pricing"].clone();
                let context = offered["pricing_context"].clone();
                *offered = installed.clone();
                offered["operation_id"] = operation_id;
                offered["pricing"] = pricing;
                offered["pricing_context"] = context;
            }
        }
        for installed in &catalogue.operations {
            let id = match installed["feature"].as_str() {
                Some("rig-check") => "three-d.tripo.rig-check".to_owned(),
                Some("rigging") => format!(
                    "three-d.{}.mesh",
                    installed["model_id"]
                        .as_str()
                        .unwrap_or("")
                        .replace('/', ".")
                ),
                _ => continue,
            };
            if installed["provider_id"] == "gg"
                && let Some(endpoint) = self.rigging.get(&id)
            {
                let mut descriptor = installed.clone();
                descriptor["pricing"] = endpoint["pricing"].clone();
                descriptor["pricing_context"] = endpoint["pricing_context"].clone();
                descriptor["catalogue_revision"] = self.revision.clone().into();
                current.push(descriptor);
            }
        }
        catalogue.operations.retain(|d| d["provider_id"] != "gg");
        catalogue.operations.extend(current);
        catalogue
    }
}
impl MediaClient {
    pub async fn gateway_catalogue(
        &self,
        cancellation: CancellationToken,
    ) -> Result<GatewayCatalogue> {
        self.gateway_catalogue_at(ORIGIN, cancellation).await
    }
    /// The host may substitute only its explicitly admitted isolated fixture
    /// origin; production callers use gateway_catalogue without configuration.
    pub async fn gateway_catalogue_at(
        &self,
        origin: &str,
        cancellation: CancellationToken,
    ) -> Result<GatewayCatalogue> {
        if ![ORIGIN, "http://127.0.0.1:3041"].contains(&origin) {
            return Err(Failure::new("catalogue_unavailable"));
        }
        let read = async {
            let mut values = Vec::new();
            let mut observations = Vec::new();
            for path in ["/v1/models", "/v1/endpoints", "/schemas/operations.json"] {
                if cancellation.is_cancelled() {
                    return Err(Failure::new("aborted"));
                }
                let request = Request {
                    lane: Lane::Discovery,
                    method: "GET".into(),
                    url: format!("{origin}{path}"),
                    headers: BTreeMap::from([("accept".into(), "application/json".into())]),
                    body: vec![],
                    max_bytes: LIMIT,
                    completion: crate::ResponseCompletion::Body,
                };
                let response = tokio::select! {
                    _ = cancellation.cancelled() => return Err(Failure::new("aborted")),
                    response = self.http.request(request) => response.map_err(|_| Failure::new("catalogue_unavailable"))?,
                };
                if response.status != 200
                    || response.body.len() > LIMIT
                    || !response.headers.get("content-type").is_some_and(|v| {
                        v.split(';')
                            .next()
                            .unwrap_or("")
                            .trim()
                            .eq_ignore_ascii_case(if path == "/schemas/operations.json" {
                                "application/schema+json"
                            } else {
                                "application/json"
                            })
                    })
                {
                    return Err(Failure::new("catalogue_unavailable"));
                }
                let value = serde_json::from_slice(&response.body)
                    .map_err(|_| Failure::new("catalogue_unavailable"))?;
                if !fresh(
                    &response.headers,
                    &value,
                    path != "/schemas/operations.json",
                ) {
                    return Err(Failure::new("catalogue_unavailable"));
                }
                values.push(value);
                observations.push((response.headers, tokio::time::Instant::now()));
            }
            for ((value, (mut headers, retrieved)), index) in
                values.iter().zip(observations).zip(0..)
            {
                let age = headers
                    .get("age")
                    .and_then(|age| age.parse::<u64>().ok())
                    .unwrap_or(0)
                    .saturating_add(retrieved.elapsed().as_secs());
                headers.insert("age".into(), age.to_string());
                if !fresh(&headers, value, index != 2) {
                    return Err(Failure::new("catalogue_unavailable"));
                }
            }
            GatewayCatalogue::from_discovery(&values[0], &values[1], &values[2])
                .map_err(|_| Failure::new("catalogue_unavailable"))
        };
        tokio::time::timeout(Duration::from_secs(15), read)
            .await
            .map_err(|_| Failure::new("catalogue_unavailable"))?
    }
}
fn fresh(headers: &BTreeMap<String, String>, value: &Value, scheduled: bool) -> bool {
    use time::{
        OffsetDateTime,
        format_description::well_known::{Rfc2822, Rfc3339},
    };
    let now = OffsetDateTime::now_utc();
    let age = match headers.get("age") {
        None => 0,
        Some(age) => match age.parse::<i64>() {
            Ok(age) if age >= 0 => age,
            _ => return false,
        },
    };
    if age >= 300 {
        return false;
    }
    if let Some(date) = headers.get("date") {
        let Ok(date) = OffsetDateTime::parse(date, &Rfc2822) else {
            return false;
        };
        if (now - date).whole_seconds().max(age) >= 300 {
            return false;
        }
    }
    if scheduled {
        let Some(at) = value.get("next_change_at") else {
            return false;
        };
        if at.is_null() {
            return true;
        }
        let Some(at) = at.as_str() else {
            return false;
        };
        let Ok(at) = OffsetDateTime::parse(at, &Rfc3339) else {
            return false;
        };
        if at <= now {
            return false;
        }
    }
    true
}
fn known_result(kind: &str, schema: &Value) -> bool {
    let field = match kind {
        "image" => "data",
        "video" => "videos",
        "music" => "audio",
        "three-d" => "glb",
        _ => return false,
    };
    if schema["type"] != "object"
        || !schema["required"]
            .as_array()
            .is_some_and(|v| v.iter().any(|v| v == field))
    {
        return false;
    }
    let shape = &schema["properties"][field];
    let reference = if matches!(kind, "image" | "video") {
        if shape["type"] != "array" {
            return false;
        }
        &shape["items"]
    } else {
        shape
    };
    let property = if kind == "image" { "b64_json" } else { "url" };
    reference["type"] == "object"
        && reference["properties"][property]["type"] == "string"
        && (kind != "music"
            || reference["properties"]["media_type"]["const"] == "audio/mpeg"
                && reference["required"].as_array().is_some_and(|required| {
                    required.iter().any(|field| field == "url")
                        && required.iter().any(|field| field == "media_type")
                }))
}
fn project_selected_model(schema: &mut Value, model: &str) -> bool {
    let Some(fields) = schema.as_object_mut() else {
        return schema == true;
    };
    if let Some(properties) = fields.get_mut("properties").and_then(Value::as_object_mut) {
        if properties
            .get("model")
            .is_some_and(|constraint| crate::input::normalize(constraint, json!(model)).is_err())
        {
            return false;
        }
        properties.remove("model");
    }
    if let Some(required) = fields.get_mut("required").and_then(Value::as_array_mut) {
        required.retain(|value| value != "model");
    }
    if let Some(examples) = fields.get_mut("examples").and_then(Value::as_array_mut) {
        for example in examples {
            if let Some(fields) = example.as_object_mut() {
                fields.remove("model");
            }
        }
    }
    if let Some(intersection) = fields.get_mut("allOf").and_then(Value::as_array_mut) {
        for constraint in intersection {
            if !project_selected_model(constraint, model) {
                return false;
            }
        }
    }
    true
}
/// The installed upload adapter owns a closed layout, not an arbitrary input
/// schema engine. New composed layouts require adapter work before any upload.
fn fixed_rigging_request(schema: &Value, operation: &Value, installed: &Catalog) -> bool {
    fn composed(value: &Value) -> bool {
        match value {
            Value::Object(fields) => {
                fields.keys().any(|key| {
                    ["allOf", "anyOf", "oneOf", "if", "then", "else", "not"].contains(&key.as_str())
                }) || fields.values().any(composed)
            }
            Value::Array(values) => values.iter().any(composed),
            _ => false,
        }
    }
    if schema["type"] != "object" || composed(schema) {
        return false;
    }
    let Some(adapter) = installed.operations.iter().find(|adapter| {
        adapter["provider_id"] == "gg"
            && adapter["feature"] == operation["feature"]
            && (operation["model_id"].is_null() || adapter["model_id"] == operation["model_id"])
    }) else {
        return false;
    };
    let mut request =
        json!({"mesh":{"url":"https://assets.example/mesh.glb","media_type":"model/gltf-binary"}});
    if operation["feature"] == "rig-check" {
        return crate::input::normalize(schema, request).is_ok();
    }
    let fields = &adapter["input_schema"]["properties"];
    let (Some(types), Some(specs)) = (
        fields["rig_type"]["enum"].as_array(),
        fields["spec"]["enum"].as_array(),
    ) else {
        return false;
    };
    for rig_type in types {
        for spec in specs {
            request["rig_type"] = rig_type.clone();
            request["spec"] = spec.clone();
            if crate::input::normalize(schema, request.clone()).is_err() {
                return false;
            }
        }
    }
    true
}
fn bounded(value: &Value, max: usize) -> Result<&str> {
    value
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= max && !s.chars().any(char::is_control))
        .ok_or_else(invalid)
}
fn resolve(schema: &Value, root: &Value, depth: usize, budget: &mut usize) -> Result<Value> {
    let cost = 16 + schema.as_str().map_or(0, str::len);
    *budget = budget.checked_sub(cost).ok_or_else(invalid)?;
    if depth > 32 {
        return Err(invalid());
    }
    if let Some(reference) = schema["$ref"].as_str() {
        let pointer = reference
            .strip_prefix('#')
            .filter(|s| s.starts_with('/'))
            .ok_or_else(invalid)?;
        let mut resolved = resolve(
            root.pointer(pointer).ok_or_else(invalid)?,
            root,
            depth + 1,
            budget,
        )?;
        // Draft 2020-12 $ref siblings intersect with the target; overwriting
        // a duplicate keyword could weaken the upstream constraint.
        if let Some(fields) = schema.as_object() {
            let siblings = fields
                .iter()
                .filter(|(key, _)| *key != "$ref")
                .map(|(key, value)| Ok((key.clone(), resolve(value, root, depth + 1, budget)?)))
                .collect::<Result<serde_json::Map<_, _>>>()?;
            if !siblings.is_empty() {
                let target = resolved.as_object_mut().ok_or_else(invalid)?;
                let all = target
                    .entry("allOf")
                    .or_insert_with(|| json!([]))
                    .as_array_mut()
                    .ok_or_else(invalid)?;
                all.push(Value::Object(siblings));
            }
        }
        return Ok(resolved);
    }
    match schema {
        Value::Object(fields) => fields
            .iter()
            .map(|(k, v)| Ok((k.clone(), resolve(v, root, depth + 1, budget)?)))
            .collect::<Result<serde_json::Map<_, _>>>()
            .map(Value::Object),
        Value::Array(values) => values
            .iter()
            .map(|v| resolve(v, root, depth + 1, budget))
            .collect::<Result<Vec<_>>>()
            .map(Value::Array),
        _ => Ok(schema.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixtures() -> (Value, Value) {
        (
            json!({"object":"list","revision":"synthetic","next_change_at":null,"data":[{"id":"lab/new-model","object":"model","gg":{"interfaces":["images.generations"],"operation_ids":["image.lab.new-model.text"]}}]}),
            json!({"x-gg-operations":[{"operation_id":"image.lab.new-model.text","model_id":"lab/new-model","kind":"image","variant":"text","content_type":"application/json","request_view":"json","path":"/v1/images/generations","delivery":"transient_base64","response_mode":"synchronous","request_schema":{"$ref":"#/$defs/Input"},"result_schema":{"type":"object","required":["data"],"properties":{"data":{"type":"array","items":{"type":"object","properties":{"b64_json":{"type":"string"}}}}}}}],"$defs":{"Input":{"type":"object","additionalProperties":false,"properties":{"model":{"type":"string","const":"lab/new-model"},"prompt":{"type":"string","minLength":1}},"required":["model","prompt"]}}}),
        )
    }
    fn public_fixture() -> Value {
        serde_json::from_str(include_str!(
            "../../../packages/grida-ai/src/testing/fixtures/gg-discovery-public.json"
        ))
        .unwrap()
    }
    #[test]
    fn current_public_gpt_image_schema_validates_nested_conditions_and_pixel_limits() {
        let fixture = public_fixture();
        let catalogue = GatewayCatalogue::from_discovery(
            &fixture["models"],
            &fixture["endpoints"],
            &fixture["operations"],
        )
        .unwrap()
        .overlay(Catalog::bundled());
        let selector = crate::Selector {
            kind: "image".into(),
            model_id: "openai/gpt-image-2.6-flare".into(),
            provider: "gg".into(),
            variant: Some("text".into()),
            feature: None,
        };
        assert!(
            catalogue
                .parse_input(&selector, json!({"prompt":"An ordinary teapot"}))
                .is_ok()
        );
        assert!(
            catalogue
                .parse_input(
                    &selector,
                    json!({"prompt":"An ordinary teapot","frame_count":2})
                )
                .is_err()
        );
        assert!(catalogue.parse_input(&selector,json!({"prompt":"An ordinary teapot","output_format":"gif","frame_count":2,"size":"1024x1024"})).is_ok());
        for size in ["1025x1025", "16x16", "3840x3840", "1000x2000"] {
            assert!(catalogue.parse_input(&selector,json!({"prompt":"An ordinary teapot","output_format":"gif","frame_count":2,"size":size})).is_err(),"{size}");
        }
        assert!(catalogue.parse_input(&selector,json!({"prompt":"An ordinary teapot","output_format":"gif","frame_count":2,"size":"1024x1024","n":5})).is_err());
    }
    #[test]
    fn reference_siblings_intersect_instead_of_replacing_constraints() {
        let root = json!({"$defs":{"Text":{"type":"string","minLength":10,"maxLength":20}}});
        let schema = resolve(
            &json!({"$ref":"#/$defs/Text","minLength":1,"maxLength":15}),
            &root,
            0,
            &mut 65536,
        )
        .unwrap();
        for value in ["short", "1234567890123456"] {
            assert!(crate::input::normalize(&schema, json!(value)).is_err());
        }
        assert!(crate::input::normalize(&schema, json!("1234567890")).is_ok());
    }
    #[test]
    fn music_result_must_match_the_hosted_mp3_contract() {
        let schema = json!({"type":"object","required":["audio"],"properties":{"audio":{"type":"object","required":["url","media_type"],"properties":{"url":{"type":"string"},"media_type":{"const":"audio/mpeg"}}}}});
        assert!(known_result("music", &schema));
        let mut unsupported = schema.clone();
        unsupported["properties"]["audio"]["properties"]["media_type"]["const"] =
            json!("audio/wav");
        assert!(!known_result("music", &unsupported));
        unsupported = schema.clone();
        unsupported["properties"]["audio"]["required"] = json!(["media_type"]);
        assert!(!known_result("music", &unsupported));
    }
    #[test]
    fn discovery_expiry_obeys_http_age_date_and_scheduled_changes() {
        use time::{
            OffsetDateTime,
            format_description::well_known::{Rfc2822, Rfc3339},
        };
        let now = OffsetDateTime::now_utc();
        let model = json!({"next_change_at":null});
        assert!(fresh(&BTreeMap::new(), &model, true));
        for age in ["300", "9999", "invalid", "-1"] {
            assert!(!fresh(
                &BTreeMap::from([("age".into(), age.into())]),
                &model,
                true
            ));
        }
        let old = (now - time::Duration::seconds(301))
            .format(&Rfc2822)
            .unwrap();
        assert!(!fresh(
            &BTreeMap::from([("date".into(), old)]),
            &model,
            true
        ));
        assert!(!fresh(
            &BTreeMap::new(),
            &json!({"next_change_at":(now-time::Duration::seconds(1)).format(&Rfc3339).unwrap()}),
            true
        ));
        assert!(fresh(
            &BTreeMap::new(),
            &json!({"next_change_at":(now+time::Duration::seconds(30)).format(&Rfc3339).unwrap()}),
            true
        ));
    }
    #[test]
    fn model_less_rig_check_is_current_only_with_the_matching_endpoint() {
        let fixture = public_fixture();
        let current = GatewayCatalogue::from_discovery(
            &fixture["models"],
            &fixture["endpoints"],
            &fixture["operations"],
        )
        .unwrap()
        .overlay(Catalog::bundled());
        let selector = crate::Selector {
            kind: "three-d".into(),
            provider: "gg".into(),
            model_id: String::new(),
            variant: None,
            feature: Some("rig-check".into()),
        };
        assert!(current.inspect(&selector).is_ok());
        let mut endpoints = fixture["endpoints"].clone();
        endpoints["data"]
            .as_array_mut()
            .unwrap()
            .retain(|e| e["id"] != "three-d.tripo.rig-check");
        let current = GatewayCatalogue::from_discovery(
            &fixture["models"],
            &endpoints,
            &fixture["operations"],
        )
        .unwrap()
        .overlay(Catalog::bundled());
        assert!(current.inspect(&selector).is_err());
        let mut byok = selector.clone();
        byok.provider = "tripo".into();
        assert!(current.inspect(&byok).is_ok());
    }
    #[test]
    fn new_ids_use_existing_interfaces_and_retired_choices_disappear() {
        let (models, contracts) = fixtures();
        let catalog = GatewayCatalogue::from_public(&models, &contracts)
            .unwrap()
            .overlay(Catalog::bundled());
        let choices = catalog
            .list(&crate::Filter {
                provider: Some("gg".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(choices.len(), 1);
        assert_eq!(choices[0]["model_id"], "lab/new-model");
        let selector = crate::Selector {
            kind: "image".into(),
            model_id: "lab/new-model".into(),
            provider: "gg".into(),
            variant: None,
            feature: None,
        };
        assert!(
            catalog
                .parse_input(&selector, json!({"prompt":"hello"}))
                .is_ok()
        );
        assert!(
            catalog
                .parse_input(&selector, json!({"prompt":""}))
                .is_err()
        );
        assert!(
            catalog
                .parse_input(&selector, json!({"model":"lab/other","prompt":"x"}))
                .is_err()
        );
        assert!(
            !catalog
                .list(&crate::Filter {
                    provider: Some("fal".into()),
                    ..Default::default()
                })
                .unwrap()
                .is_empty()
        );
    }
    #[test]
    fn resolved_sibling_constraints_and_expansion_bounds_are_preserved() {
        let (_, mut contracts) = fixtures();
        contracts["$defs"]["Input"]["properties"]["prompt"] =
            json!({"$ref":"#/$defs/Text","maxLength":5});
        contracts["$defs"]["Text"] = json!({"type":"string","minLength":1});
        let schema = resolve(&contracts["$defs"]["Input"], &contracts, 0, &mut 65536).unwrap();
        assert_eq!(schema["properties"]["prompt"]["allOf"][0]["maxLength"], 5);
        assert!(
            crate::input::normalize(&schema, json!({"model":"lab/new-model","prompt":"123456"}))
                .is_err()
        );
        assert!(resolve(&contracts["$defs"]["Input"], &contracts, 0, &mut 16).is_err());
        contracts["$defs"]["Cycle"] = json!({"$ref":"#/$defs/Cycle"});
        assert!(resolve(&contracts["$defs"]["Cycle"], &contracts, 0, &mut 65536).is_err());
    }
    #[test]
    fn selected_model_is_projected_through_reference_sibling_intersections() {
        let (models, mut contracts) = fixtures();
        contracts["x-gg-operations"][0]["request_schema"] = json!({"$ref":"#/$defs/Input","required":["model","prompt"],"properties":{"model":{"const":"lab/new-model"},"prompt":{"type":"string","minLength":2,"maxLength":5}},"additionalProperties":false});
        let catalogue = GatewayCatalogue::from_public(&models, &contracts)
            .unwrap()
            .overlay(Catalog::bundled());
        let selector = crate::Selector {
            kind: "image".into(),
            provider: "gg".into(),
            model_id: "lab/new-model".into(),
            variant: Some("text".into()),
            feature: None,
        };
        assert!(
            catalogue
                .parse_input(&selector, json!({"prompt":"hello"}))
                .is_ok()
        );
        for prompt in ["", "x", "toolong"] {
            assert!(
                catalogue
                    .parse_input(&selector, json!({"prompt":prompt}))
                    .is_err()
            );
        }
        contracts["x-gg-operations"][0]["request_schema"]["allOf"] = json!([true]);
        assert!(
            !GatewayCatalogue::from_public(&models, &contracts)
                .unwrap()
                .operations
                .is_empty()
        );
        contracts["x-gg-operations"][0]["request_schema"]["allOf"] = json!([false]);
        assert!(
            GatewayCatalogue::from_public(&models, &contracts)
                .unwrap()
                .operations
                .is_empty()
        );
        contracts["x-gg-operations"][0]["request_schema"]["allOf"] = json!([]);
        contracts["x-gg-operations"][0]["request_schema"]["properties"]["model"]["const"] =
            json!("lab/other-model");
        assert!(
            GatewayCatalogue::from_public(&models, &contracts)
                .unwrap()
                .operations
                .is_empty()
        );
    }
    #[test]
    fn rigging_requires_current_interface_and_the_installed_request_layout() {
        let mut fixture = public_fixture();
        let rig_id = "three-d.tripo.rig-v1.0.mesh";
        fixture["models"]["data"].as_array_mut().unwrap().push(json!({"object":"model","id":"tripo/rig-v1.0","gg":{"interfaces":["endpoints"],"operation_ids":[rig_id]}}));
        fixture["endpoints"]["data"].as_array_mut().unwrap().push(json!({"object":"endpoint","id":rig_id,"operation":rig_id,"model":"tripo/rig-v1.0","kind":"three-d"}));
        fixture["operations"]["$defs"]["RigInput"] = json!({"type":"object","properties":{"mesh":{"$ref":"#/$defs/source_glb"},"rig_type":{"type":"string","enum":["biped"]},"spec":{"type":"string","enum":["tripo","mixamo"]}},"required":["mesh","rig_type","spec"],"additionalProperties":false});
        fixture["operations"]["x-gg-operations"].as_array_mut().unwrap().push(json!({"operation_id":rig_id,"endpoint_id":rig_id,"model_id":"tripo/rig-v1.0","kind":"three-d","variant":"mesh","feature":"rigging","response_mode":"job","delivery":"provider_reference","content_type":"application/json","request_view":"json","path":format!("/v1/endpoints/{rig_id}"),"request_schema":{"$ref":"#/$defs/RigInput"},"result_schema":{"type":"object","required":["glb"],"properties":{"glb":{"type":"object","properties":{"url":{"type":"string"}}}}}}));
        let selector = crate::Selector {
            kind: "three-d".into(),
            provider: "gg".into(),
            model_id: "tripo/rig-v1.0".into(),
            variant: None,
            feature: Some("rigging".into()),
        };
        let project = |fixture: &Value| {
            GatewayCatalogue::from_discovery(
                &fixture["models"],
                &fixture["endpoints"],
                &fixture["operations"],
            )
            .unwrap()
            .overlay(Catalog::bundled())
        };
        assert!(project(&fixture).inspect(&selector).is_ok());
        let index = fixture["models"]["data"].as_array().unwrap().len() - 1;
        fixture["models"]["data"][index]["gg"]["interfaces"] = json!([]);
        assert!(project(&fixture).inspect(&selector).is_err());
        fixture["models"]["data"][index]["gg"]["interfaces"] = json!(["endpoints"]);
        fixture["operations"]["$defs"]["RigInput"]["required"]
            .as_array_mut()
            .unwrap()
            .push(json!("new_control"));
        assert!(project(&fixture).inspect(&selector).is_err());
        let selector = crate::Selector {
            model_id: String::new(),
            feature: Some("rig-check".into()),
            ..selector
        };
        assert!(project(&fixture).inspect(&selector).is_ok());
        fixture["operations"]["$defs"]["three-d.tripo.rig-check.input"]["required"]
            .as_array_mut()
            .unwrap()
            .push(json!("new_control"));
        assert!(project(&fixture).inspect(&selector).is_err());
    }
    #[test]
    fn discovered_numeric_multiples_are_checked_recursively() {
        let (models, mut contracts) = fixtures();
        contracts["$defs"]["Input"]["properties"]["duration"] =
            json!({"type":"number","allOf":[{"multipleOf":2}]});
        let catalogue = GatewayCatalogue::from_public(&models, &contracts)
            .unwrap()
            .overlay(Catalog::bundled());
        let selector = crate::Selector {
            kind: "image".into(),
            provider: "gg".into(),
            model_id: "lab/new-model".into(),
            variant: Some("text".into()),
            feature: None,
        };
        assert!(
            catalogue
                .parse_input(&selector, json!({"prompt":"hello","duration":4}))
                .is_ok()
        );
        assert!(
            catalogue
                .parse_input(&selector, json!({"prompt":"hello","duration":3}))
                .is_err()
        );
        assert!(
            catalogue
                .parse_input(
                    &selector,
                    json!({"prompt":"hello","duration":9007199254740991u64})
                )
                .is_err()
        );
        assert!(
            crate::input::normalize(&json!({"type":"number","multipleOf":0.1}), json!(0.3)).is_ok()
        );
        assert!(
            crate::input::normalize(&json!({"type":"number","multipleOf":0.1}), json!(0.35))
                .is_err()
        );
        for divisor in [json!(0), json!(-2), json!("2")] {
            assert!(
                crate::input::normalize(&json!({"type":"number","multipleOf":divisor}), json!(4))
                    .is_err()
            );
        }
    }
    #[test]
    fn unknown_interfaces_untrusted_references_and_inconsistent_model_do_not_execute() {
        let (mut models, mut contracts) = fixtures();
        models["data"][0]["gg"]["interfaces"] = json!(["future.images"]);
        assert_eq!(
            GatewayCatalogue::from_public(&models, &contracts)
                .unwrap()
                .operations
                .len(),
            0
        );
        models["data"][0]["gg"]["interfaces"] = json!(["images.generations"]);
        contracts["x-gg-operations"][0]["content_type"] = json!("multipart/form-data");
        assert!(
            GatewayCatalogue::from_public(&models, &contracts)
                .unwrap()
                .operations
                .is_empty()
        );
        contracts["x-gg-operations"][0]["content_type"] = json!("application/json");
        let original_result = contracts["x-gg-operations"][0]["result_schema"].clone();
        contracts["x-gg-operations"][0]["result_schema"] = json!({"type":"object","required":["unknown"],"properties":{"unknown":{"type":"string"}}});
        assert!(
            GatewayCatalogue::from_public(&models, &contracts)
                .unwrap()
                .operations
                .is_empty()
        );
        contracts["x-gg-operations"][0]["result_schema"] = original_result;
        contracts["x-gg-operations"][0]["request_schema"] =
            json!({"$ref":"https://other.test/schema"});
        assert!(GatewayCatalogue::from_public(&models, &contracts).is_err());
        contracts["x-gg-operations"][0]["request_schema"] = json!({"$ref":"#/$defs/Input"});
        contracts["$defs"]["Input"]["properties"]["model"]["const"] = json!("lab/other");
        assert_eq!(
            GatewayCatalogue::from_public(&models, &contracts)
                .unwrap()
                .operations
                .len(),
            0
        );
    }
    use crate::{ExecutionAuthority, HttpFuture, MediaClient, Response, Transport, TransportError};
    use std::sync::{Arc, Mutex};
    type RecordedRequest = (String, String, crate::Lane, BTreeMap<String, String>, Value);
    struct Fake {
        requests: Mutex<Vec<RecordedRequest>>,
        replies: Mutex<std::collections::VecDeque<Value>>,
    }
    impl Transport for Fake {
        fn request(&self, request: crate::Request) -> HttpFuture<'_> {
            Box::pin(async move {
                let schema = request.url.ends_with("/schemas/operations.json");
                let body = if request.body.is_empty() {
                    Value::Null
                } else {
                    serde_json::from_slice(&request.body).unwrap()
                };
                self.requests.lock().unwrap().push((
                    request.method,
                    request.url,
                    request.lane,
                    request.headers,
                    body,
                ));
                let reply = self
                    .replies
                    .lock()
                    .unwrap()
                    .pop_front()
                    .ok_or(TransportError)?;
                if reply == "transport_failure" {
                    return Err(TransportError);
                }
                let retry = reply == "poll_429";
                let mut response_headers = BTreeMap::from([(
                    "content-type".into(),
                    if schema {
                        "application/schema+json".into()
                    } else {
                        "application/json".into()
                    },
                )]);
                if retry {
                    response_headers.insert("retry-after".into(), "2".into());
                }
                Ok(Response {
                    status: if retry { 429 } else { 200 },
                    headers: response_headers,
                    body: serde_json::to_vec(&reply).unwrap(),
                })
            })
        }
    }
    fn fake(replies: Vec<Value>) -> Arc<Fake> {
        Arc::new(Fake {
            requests: Mutex::new(vec![]),
            replies: Mutex::new(replies.into()),
        })
    }
    fn authority() -> ExecutionAuthority {
        ExecutionAuthority::Gateway {
            token: "synthetic-product-token".into(),
            base_url: "https://grida.co".into(),
            expires_at_ms: i64::MAX,
        }
    }
    fn image(catalog: Catalog) -> crate::Parsed {
        catalog
            .parse_input(
                &crate::Selector {
                    kind: "image".into(),
                    model_id: "lab/new-model".into(),
                    provider: "gg".into(),
                    variant: None,
                    feature: None,
                },
                json!({"prompt":"hello"}),
            )
            .unwrap()
    }
    #[tokio::test]
    async fn public_discovery_never_carries_authority_and_dynamic_images_use_only_product_route() {
        let (models, contracts) = fixtures();
        let transport = fake(vec![
            models,
            json!({"object":"list","revision":"synthetic","next_change_at":null,"data":[]}),
            contracts,
            json!({"data":[{"b64_json":"iVBORw0KGgo=","media_type":"image/png"}]}),
        ]);
        let client = MediaClient::new(transport.clone());
        let catalog = client
            .gateway_catalogue(CancellationToken::new())
            .await
            .unwrap()
            .overlay(Catalog::bundled());
        let result = client
            .execute(&image(catalog), authority(), CancellationToken::new())
            .await
            .unwrap();
        assert_eq!(result.assets[0].media_type, "image/png");
        let calls = transport.requests.lock().unwrap();
        assert_eq!(calls.len(), 4);
        for call in &calls[..3] {
            assert_eq!(call.0, "GET");
            assert_eq!(call.2, Lane::Discovery);
            assert!(!call.3.contains_key("authorization"));
            assert!(call.4.is_null());
            assert!(call.1.starts_with("https://gateway.grida.ai/"));
        }
        assert_eq!(calls[3].1, "https://grida.co/api/v1/ai/operations");
        assert_eq!(
            calls[3].3["authorization"],
            "Bearer synthetic-product-token"
        );
        assert_eq!(
            calls[3].4,
            json!({"operation_id":"image.lab.new-model.text","input":{"prompt":"hello","model":"lab/new-model"}})
        );
    }
    #[tokio::test]
    async fn dynamic_descriptor_mutation_fails_before_authority_and_paid_posts_never_retry() {
        let (models, contracts) = fixtures();
        let catalog = GatewayCatalogue::from_public(&models, &contracts)
            .unwrap()
            .overlay(Catalog::bundled());
        let mut parsed = image(catalog.clone());
        let transport = fake(vec![json!("transport_failure")]);
        let client = MediaClient::new(transport.clone());
        parsed.descriptor["gateway_operation"]["id"] = json!("image.attacker.other.text");
        assert_eq!(
            client
                .execute(&parsed, authority(), CancellationToken::new())
                .await
                .unwrap_err()
                .code,
            "invalid_input"
        );
        assert!(transport.requests.lock().unwrap().is_empty());
        assert!(
            client
                .execute(&image(catalog), authority(), CancellationToken::new())
                .await
                .is_err()
        );
        assert_eq!(transport.requests.lock().unwrap().len(), 1);
    }
    #[tokio::test(start_paused = true)]
    async fn accepted_jobs_poll_same_identity_and_retain_receipt_on_failure() {
        let (mut models, mut contracts) = fixtures();
        models["data"][0]["gg"]["interfaces"] = json!(["videos"]);
        models["data"][0]["gg"]["operation_ids"] = json!(["video.lab.new-model.text"]);
        let entry = &mut contracts["x-gg-operations"][0];
        entry["operation_id"] = json!("video.lab.new-model.text");
        entry["kind"] = json!("video");
        entry["path"] = json!("/v1/videos");
        entry["delivery"] = json!("provider_reference");
        entry["response_mode"] = json!("job");
        entry["result_schema"] = json!({"type":"object","required":["videos"],"properties":{"videos":{"type":"array","items":{"type":"object","properties":{"url":{"type":"string"}}}}}});
        let catalog = GatewayCatalogue::from_public(&models, &contracts)
            .unwrap()
            .overlay(Catalog::bundled());
        let parsed = catalog
            .parse_input(
                &crate::Selector {
                    kind: "video".into(),
                    model_id: "lab/new-model".into(),
                    provider: "gg".into(),
                    variant: None,
                    feature: None,
                },
                json!({"prompt":"hello"}),
            )
            .unwrap();
        let job = json!({"object":"job","id":"req_synthetic","operation_id":"video.lab.new-model.text","model":"lab/new-model","interface":"videos","status":"accepted","result_status":"pending","result":null});
        let mut failure = job.clone();
        failure["status"] = json!("failed");
        failure["result_status"] = json!("unavailable");
        let transport = fake(vec![job, json!("poll_429"), failure]);
        let error = MediaClient::new(transport.clone())
            .execute(&parsed, authority(), CancellationToken::new())
            .await
            .unwrap_err();
        assert_eq!(error.code, "generation_failed");
        assert_eq!(error.task_id.as_deref(), Some("req_synthetic"));
        let calls = transport.requests.lock().unwrap();
        assert_eq!(calls.len(), 3);
        assert_eq!(calls[0].0, "POST");
        assert_eq!(calls[1].0, "GET");
        assert_eq!(
            calls[1].1,
            "https://grida.co/api/v1/ai/jobs?request_id=req_synthetic"
        );
        assert_eq!(calls[2].0, "GET");
        assert_eq!(calls[2].1, calls[1].1);
    }
}
