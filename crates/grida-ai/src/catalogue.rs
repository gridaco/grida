// GRIDA-SEC-004 / GRIDA-SEC-006 — explicit provider authority and safe scoped results.
// GRIDA-GG: provider — explicit scoped invocation authority; no account token or credential persistence.
use crate::{Failure, Result, input};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Default, Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Filter {
    pub kind: Option<String>,
    pub model_id: Option<String>,
    pub provider: Option<String>,
    pub feature: Option<String>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Selector {
    pub kind: String,
    #[serde(default)]
    pub model_id: String,
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub feature: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
pub struct Parsed {
    pub descriptor: Value,
    pub input: Value,
}
impl Parsed {
    pub fn kind(&self) -> &str {
        self.descriptor["kind"].as_str().unwrap_or("")
    }
    pub fn provider(&self) -> &str {
        self.descriptor["provider_id"].as_str().unwrap_or("")
    }
    pub fn model_id(&self) -> &str {
        self.descriptor["model_id"].as_str().unwrap_or("")
    }
    pub fn binding_id(&self) -> &str {
        self.descriptor["binding_id"].as_str().unwrap_or("")
    }
}

#[derive(Clone)]
pub struct Catalog {
    operations: Vec<Value>,
}
impl Catalog {
    pub fn bundled() -> Self {
        Self {
            operations: serde_json::from_str(include_str!("../data/operations.json"))
                .expect("validated bundled operation contracts"),
        }
    }
    /// Raw authored facts with snake-case domain keys. Snapshot and service
    /// views retain their separate schema-1 compatibility spelling.
    pub fn facts() -> Value {
        serde_json::from_str(include_str!("../data/facts.json")).expect("validated bundled facts")
    }
    pub fn snapshot() -> Value {
        serde_json::from_str(include_str!("../data/snapshot.json"))
            .expect("validated bundled snapshot")
    }
    pub fn views() -> Value {
        serde_json::from_str(include_str!("../data/views.json"))
            .expect("validated bundled service views")
    }
    pub fn list(&self, filter: &Filter) -> Result<Vec<Value>> {
        validate_filter(filter)?;
        Ok(self
            .operations
            .iter()
            .filter(|d| {
                filter.kind.as_ref().is_none_or(|v| d["kind"] == *v)
                    && filter.model_id.as_ref().is_none_or(|v| d["model_id"] == *v)
                    && filter
                        .provider
                        .as_ref()
                        .is_none_or(|v| d["provider_id"] == *v)
                    && filter.feature.as_ref().is_none_or(|v| d["feature"] == *v)
            })
            .cloned()
            .collect())
    }
    pub fn inspect(&self, selector: &Selector) -> Result<Value> {
        let filter = Filter {
            kind: Some(selector.kind.clone()),
            model_id: if selector.model_id.is_empty() {
                None
            } else {
                Some(selector.model_id.clone())
            },
            provider: Some(selector.provider.clone()),
            feature: selector.feature.clone(),
        };
        validate_filter(&filter)?;
        if selector.variant.as_ref().is_some_and(|v| {
            !["text", "references", "image", "multiview", "mesh"].contains(&v.as_str())
        }) {
            return Err(Failure::new("invalid_input"));
        }
        if (selector.provider == "tripo" || selector.provider == "gg")
            && selector.kind == "three-d"
            && (selector.feature.is_none()
                || selector.feature.as_deref() == Some("model-generation")
                    && selector.variant.is_none())
        {
            return Err(Failure::new("invalid_input"));
        }
        let candidates = self.list(&filter)?;
        let variant = selector.variant.as_deref().or_else(|| {
            if selector.kind == "three-d"
                || selector.kind == "rigging"
                || selector.kind == "rig-check"
            {
                candidates.first().and_then(|d| d["variant"].as_str())
            } else {
                Some("text")
            }
        });
        candidates
            .iter()
            .find(|d| d["variant"].as_str() == variant)
            .cloned()
            .ok_or_else(|| Failure::new("operation_unavailable"))
    }
    pub fn parse_input(&self, selector: &Selector, value: Value) -> Result<Parsed> {
        let descriptor = self.inspect(selector)?;
        let input = input::normalize(&descriptor["input_schema"], value)?;
        Ok(Parsed { descriptor, input })
    }
}
fn validate_filter(f: &Filter) -> Result<()> {
    let kinds = [
        "image",
        "video",
        "music",
        "sound-effect",
        "text-to-speech",
        "three-d",
        "rig-check",
        "rigging",
    ];
    let providers = ["gg", "openrouter", "vercel", "fal", "elevenlabs", "tripo"];
    if f.kind
        .as_ref()
        .is_some_and(|v| !kinds.contains(&v.as_str()))
        || f.provider
            .as_ref()
            .is_some_and(|v| !providers.contains(&v.as_str()))
        || f.model_id
            .as_ref()
            .is_some_and(|v| v.is_empty() || v.encode_utf16().count() > 256)
        || f.feature
            .as_ref()
            .is_some_and(|v| !["model-generation", "rig-check", "rigging"].contains(&v.as_str()))
    {
        return Err(Failure::new("invalid_input"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn all_existing_operations_are_discoverable() {
        let catalogue = Catalog::bundled();
        assert_eq!(catalogue.list(&Filter::default()).unwrap().len(), 112);
        for d in catalogue
            .operations
            .iter()
            .filter(|d| !d["model_id"].is_null())
        {
            let s = Selector {
                kind: d["kind"].as_str().unwrap().into(),
                model_id: d["model_id"].as_str().unwrap().into(),
                provider: d["provider_id"].as_str().unwrap().into(),
                variant: d["variant"].as_str().map(String::from),
                feature: d["feature"].as_str().map(String::from),
            };
            assert_eq!(catalogue.inspect(&s).unwrap(), *d);
        }
    }
}
