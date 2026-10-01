// GRIDA-SEC-004 — provider input validation and bounded first-party credentials.
use crate::{Failure, Result};
use base64::{
    Engine, alphabet,
    engine::{GeneralPurpose, GeneralPurposeConfig},
};
use serde_json::{Map, Value};

pub(crate) fn bad() -> Failure {
    Failure::new("invalid_input")
}
pub(crate) fn js_trim(value: &str) -> &str {
    value.trim_matches(|c: char| matches!(c, '\u{0009}'..='\u{000d}' | ' ' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'))
}
pub(crate) fn decode(text: &str, maximum: usize) -> Result<Vec<u8>> {
    if text.is_empty() || text.len() > maximum.div_ceil(3) * 4 || !text.len().is_multiple_of(4) {
        return Err(bad());
    }
    // JS atob accepts nonzero padding bits. Preserve that wire behavior.
    let engine = GeneralPurpose::new(
        &alphabet::STANDARD,
        GeneralPurposeConfig::new().with_decode_allow_trailing_bits(true),
    );
    let bytes = engine.decode(text).map_err(|_| bad())?;
    if bytes.is_empty() || bytes.len() > maximum {
        return Err(bad());
    }
    Ok(bytes)
}
pub(crate) fn data_url(image: &Value) -> Result<String> {
    let data = image["data"].as_str().ok_or_else(bad)?;
    let media = image["media_type"].as_str().ok_or_else(bad)?;
    Ok(format!("data:{media};base64,{data}"))
}
pub(crate) fn normalize(schema: &Value, value: Value) -> Result<Value> {
    let mut value = value;
    match schema["type"].as_str() {
        Some("object") => {
            let object = value.as_object().ok_or_else(bad)?;
            let fields = schema["properties"].as_object().ok_or_else(bad)?;
            if schema["additionalProperties"] == false
                && object.keys().any(|k| !fields.contains_key(k))
            {
                return Err(bad());
            }
            if schema["required"].as_array().is_some_and(|names| {
                names
                    .iter()
                    .any(|n| !object.contains_key(n.as_str().unwrap_or("")))
            }) {
                return Err(bad());
            }
            let mut result = Map::new();
            for (name, field) in fields {
                if let Some(v) = object.get(name) {
                    result.insert(name.clone(), normalize(field, v.clone())?);
                } else if let Some(default) = field.get("default") {
                    result.insert(name.clone(), default.clone());
                }
            }
            value = Value::Object(result);
            if schema["x-grida-portable-glb"] == true {
                let bytes = decode(value["data"].as_str().ok_or_else(bad)?, 60_000_000)?;
                validate_glb(&bytes).map_err(|_| bad())?;
            }
        }
        Some("array") => {
            let list = value.as_array().ok_or_else(bad)?;
            if list.len() < schema["minItems"].as_u64().unwrap_or(0) as usize
                || list.len() > schema["maxItems"].as_u64().unwrap_or(u64::MAX) as usize
            {
                return Err(bad());
            }
            value = list
                .iter()
                .map(|v| normalize(&schema["items"], v.clone()))
                .collect::<Result<Vec<_>>>()?
                .into();
        }
        Some("string") => {
            let text = value.as_str().ok_or_else(bad)?;
            let text = if schema["x-grida-trim"] == true {
                js_trim(text)
            } else {
                text
            };
            let count = if schema["x-grida-length-unit"] == "utf16" {
                text.encode_utf16().count()
            } else {
                text.chars().count()
            };
            if schema["x-grida-nonblank"] == true && js_trim(text).is_empty()
                || count < schema["minLength"].as_u64().unwrap_or(0) as usize
                || count > schema["maxLength"].as_u64().unwrap_or(u64::MAX) as usize
                || count > schema["x-grida-max-length"].as_u64().unwrap_or(u64::MAX) as usize
            {
                return Err(bad());
            }
            if let Some(pattern) = schema["pattern"].as_str()
                && !regex::Regex::new(pattern)
                    .map_err(|_| bad())?
                    .is_match(text)
            {
                return Err(bad());
            }
            if let Some(mode) = schema["x-grida-positive-pair"].as_str() {
                for part in text.split(['x', ':']) {
                    let n: f64 = part.parse().map_err(|_| bad())?;
                    if !n.is_finite()
                        || n <= 0.0
                        || mode == "safe-integer" && (n.fract() != 0.0 || n > 9007199254740991.0)
                    {
                        return Err(bad());
                    }
                }
            }
            if schema["x-grida-excluded-values"]
                .as_array()
                .is_some_and(|a| a.iter().any(|v| v == text))
            {
                return Err(bad());
            }
            if let Some(rule) = schema.get("x-grida-url") {
                let url = url::Url::parse(text).map_err(|_| bad())?;
                let inline = rule["schemes"]
                    .as_array()
                    .is_some_and(|a| a.iter().any(|v| v == "image-data"))
                    && regex::Regex::new("(?i)^data:image/[a-z0-9.+-]+[;,]")
                        .expect("constant regex")
                        .is_match(text);
                if url.scheme() != "https" && !inline
                    || !url.username().is_empty()
                    || url.password().is_some()
                    || rule["fragments"] != true && url.fragment().is_some_and(|v| !v.is_empty())
                {
                    return Err(bad());
                }
            }
            value = if let Some(max) = schema["x-grida-decoded-max-bytes"].as_u64() {
                base64::engine::general_purpose::STANDARD
                    .encode(decode(text, max as usize)?)
                    .into()
            } else {
                text.into()
            };
        }
        Some("number" | "integer") => {
            let n = value.as_f64().ok_or_else(bad)?;
            if !n.is_finite()
                || schema["type"] == "integer" && (n.fract() != 0.0 || n.abs() > 9007199254740991.0)
                || schema["minimum"].as_f64().is_some_and(|v| n < v)
                || schema["maximum"].as_f64().is_some_and(|v| n > v)
                || schema["exclusiveMinimum"].as_f64().is_some_and(|v| n <= v)
            {
                return Err(bad());
            }
        }
        Some("boolean") if !value.is_boolean() => return Err(bad()),
        _ => {}
    }
    if let Some(variants) = schema["anyOf"].as_array()
        && !variants.iter().any(|s| matches_schema(s, &value))
    {
        return Err(bad());
    }
    if let Some(variants) = schema["oneOf"].as_array()
        && variants
            .iter()
            .filter(|s| matches_schema(s, &value))
            .count()
            != 1
    {
        return Err(bad());
    }
    if let Some(variants) = schema["allOf"].as_array()
        && variants.iter().any(|s| !matches_schema(s, &value))
    {
        return Err(bad());
    }
    if !matches_schema(schema, &value) {
        return Err(bad());
    }
    Ok(value)
}
fn matches_schema(s: &Value, v: &Value) -> bool {
    if let Some(n) = v.as_f64()
        && (s["maximum"].as_f64().is_some_and(|max| n > max)
            || s["minimum"].as_f64().is_some_and(|min| n < min))
    {
        return false;
    }
    if s.get("const").is_some_and(|c| c != v)
        || s["enum"].as_array().is_some_and(|a| !a.contains(v))
        || s.get("not").is_some_and(|n| matches_schema(n, v))
    {
        return false;
    }
    if s["required"]
        .as_array()
        .is_some_and(|a| a.iter().any(|k| v.get(k.as_str().unwrap_or("")).is_none()))
    {
        return false;
    }
    if let Some(fields) = s["properties"].as_object() {
        for (key, schema) in fields {
            if let Some(value) = v.get(key)
                && !matches_schema(schema, value)
            {
                return false;
            }
        }
    }
    if let Some(condition) = s.get("if")
        && matches_schema(condition, v)
        && let Some(then) = s.get("then")
    {
        return matches_schema(then, v);
    }
    true
}
pub(crate) fn validate_glb(data: &[u8]) -> Result<()> {
    let word = |at: usize| -> Result<u32> {
        Ok(u32::from_le_bytes(
            data.get(at..at + 4)
                .ok_or_else(bad)?
                .try_into()
                .map_err(|_| bad())?,
        ))
    };
    if data.len() < 20
        || data.len() > 64 * 1024 * 1024
        || data.get(..4) != Some(b"glTF")
        || word(4)? != 2
        || word(8)? as usize != data.len()
    {
        return Err(bad());
    }
    let mut offset = 12;
    let mut chunks = 0;
    let mut json = None;
    let mut bin_len = None;
    while offset < data.len() {
        let size = word(offset)? as usize;
        let kind = word(offset + 4)?;
        offset += 8;
        if !size.is_multiple_of(4) || offset + size > data.len() {
            return Err(bad());
        }
        if chunks == 0 && (kind != 0x4e4f534a || size > 4 * 1024 * 1024) {
            return Err(bad());
        }
        match kind {
            0x4e4f534a if chunks == 0 => {
                json = Some(
                    serde_json::from_slice::<Value>(&data[offset..offset + size])
                        .map_err(|_| bad())?,
                )
            }
            0x004e4942 if bin_len.is_none() => bin_len = Some(size),
            _ => return Err(bad()),
        }
        offset += size;
        chunks += 1;
    }
    let document = json.ok_or_else(bad)?;
    if document["asset"]["version"] != "2.0" {
        return Err(bad());
    }
    for name in ["extensionsUsed", "extensionsRequired"] {
        if let Some(value) = document.get(name) {
            let entries = value.as_array().ok_or_else(bad)?;
            if entries.iter().any(|v| {
                v.as_str().is_none_or(|s| {
                    [
                        "EXT_meshopt_compression",
                        "KHR_draco_mesh_compression",
                        "KHR_texture_basisu",
                    ]
                    .contains(&s)
                })
            }) {
                return Err(bad());
            }
        }
    }
    for name in ["buffers", "images"] {
        if let Some(value) = document.get(name) {
            let entries = value.as_array().ok_or_else(bad)?;
            if entries
                .iter()
                .any(|v| !v.is_object() || v.get("uri").is_some())
            {
                return Err(bad());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn trim_matches_javascript_and_utf16_bounds() {
        let s = json!({"type":"string","x-grida-trim":true,"x-grida-max-length":2,"x-grida-length-unit":"utf16"});
        assert_eq!(normalize(&s, json!("\u{feff}😀 ")).unwrap(), "😀");
        assert!(normalize(&s, json!("😀x")).is_err());
        assert_eq!(js_trim("\u{0085}x\u{0085}"), "\u{0085}x\u{0085}");
    }
    #[test]
    fn strict_base64_and_safe_integers() {
        assert_eq!(decode("AQID", 3).unwrap(), [1, 2, 3]);
        assert!(decode("AQI", 3).is_err());
        assert!(normalize(&json!({"type":"integer"}), json!(9007199254740992u64)).is_err());
    }
}
