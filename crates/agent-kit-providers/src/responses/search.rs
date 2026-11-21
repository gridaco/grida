//! Only provider-reported search actions and HTTP(S) citations are public.
//! Provider continuation data stays in the separately scoped replay envelope.
use agent_kit_core::messages::{ProviderEvidence, SearchAction, SearchStatus, UrlCitation};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use url::Url;

pub(super) const MAX_CITATIONS: usize = 64;

/// Older Responses profiles ignored annotation metadata. An invalid annotation
/// container must not discard otherwise valid assistant text.
pub(super) fn read_annotations<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<Value>, D::Error> {
    Ok(match Value::deserialize(deserializer)? {
        Value::Array(mut entries) => {
            entries.truncate(MAX_CITATIONS);
            entries
        }
        _ => Vec::new(),
    })
}

fn text(value: Option<&Value>) -> Option<String> {
    let text = value?.as_str()?;
    if text.is_empty() || text.chars().any(char::is_control) {
        return None;
    }
    Some(text[..text.floor_char_boundary(text.len().min(1024))].into())
}

fn link(value: Option<&Value>) -> Option<String> {
    let value = value?.as_str()?;
    if value.len() > 4096 || value.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return None;
    }
    let url = Url::parse(value).ok()?;
    (matches!(url.scheme(), "https" | "http")
        && url.as_str().len() <= 4096
        && url.has_host()
        && url.username().is_empty()
        && url.password().is_none())
    .then(|| url.into())
}

fn search_status(status: Option<&str>) -> SearchStatus {
    match status {
        Some("in_progress" | "searching") => SearchStatus::InProgress,
        Some("completed") => SearchStatus::Completed,
        Some("failed") => SearchStatus::Failed,
        _ => SearchStatus::Unknown,
    }
}

/// Streams can report different fields of the same hosted call at each stage.
/// Keep the provider's wire state for replay and derive the public observation from it.
#[derive(Clone, Default, Deserialize, Serialize)]
pub(super) struct Call {
    #[serde(skip_serializing_if = "Option::is_none")]
    encrypted_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    action: Option<Value>,
}

impl Call {
    pub(super) fn progress(status: &str) -> Self {
        Self {
            status: Some(status.into()),
            ..Self::default()
        }
    }

    pub(super) fn merge(&mut self, report: Self) {
        if report.encrypted_content.is_some() {
            self.encrypted_content = report.encrypted_content;
        }
        let previous = search_status(self.status.as_deref());
        let next = search_status(report.status.as_deref());
        let advances = match next {
            SearchStatus::Unknown => self.status.is_none(),
            SearchStatus::InProgress => {
                matches!(previous, SearchStatus::Unknown | SearchStatus::InProgress)
            }
            SearchStatus::Completed | SearchStatus::Failed => true,
        };
        if advances && report.status.is_some() {
            self.status = report.status;
        }
        if report.action.is_some() {
            self.action = report.action;
        }
    }

    pub(super) fn evidence(&self) -> ProviderEvidence {
        let status = search_status(self.status.as_deref());
        let action = self
            .action
            .as_ref()
            .and_then(|value| match value.get("type")?.as_str()? {
                "search" => Some(SearchAction::Search {
                    query: text(value.get("query")),
                    queries: value
                        .get("queries")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                        .take(8)
                        .filter_map(|q| text(Some(q)))
                        .collect(),
                }),
                "open_page" => Some(SearchAction::OpenPage {
                    url: link(value.get("url")),
                }),
                "find_in_page" => Some(SearchAction::FindInPage {
                    url: link(value.get("url")),
                    pattern: text(value.get("pattern")),
                }),
                _ => None,
            });
        ProviderEvidence::WebSearch { status, action }
    }
}

pub(super) fn citation(
    annotation: &Value,
    characters: usize,
    offset: usize,
) -> Option<ProviderEvidence> {
    if annotation.get("type")?.as_str()? != "url_citation" {
        return None;
    }
    let start = usize::try_from(annotation.get("start_index")?.as_u64()?).ok()?;
    let end = usize::try_from(annotation.get("end_index")?.as_u64()?).ok()?;
    if start >= end || end > characters {
        return None;
    }
    Some(ProviderEvidence::UrlCitation(UrlCitation {
        start_index: offset.checked_add(start)?,
        end_index: offset.checked_add(end)?,
        url: link(annotation.get("url"))?,
        title: text(annotation.get("title")).unwrap_or_default(),
    }))
}

pub(super) fn terminal_citations(
    original: &[super::WireContent],
    parts: &[Value],
) -> Result<Vec<ProviderEvidence>, &'static str> {
    use super::WireContent;
    if parts.len() != original.len() {
        return Err("terminal_output_changed");
    }
    let mut citations = Vec::new();
    let mut offset = 0;
    for (wire, part) in original.iter().zip(parts) {
        let text = match wire {
            WireContent::OutputText { text, .. }
                if part["type"] == "output_text" && part["text"] == text.as_str() =>
            {
                text
            }
            WireContent::Refusal { refusal }
                if part["type"] == "refusal" && part["refusal"] == refusal.as_str() =>
            {
                offset += refusal.chars().count();
                continue;
            }
            _ => return Err("terminal_output_changed"),
        };
        let count = text.chars().count();
        if let Some(annotations) = part["annotations"].as_array() {
            citations.extend(
                annotations
                    .iter()
                    .take(MAX_CITATIONS.saturating_sub(citations.len()))
                    .filter_map(|item| citation(item, count, offset)),
            );
        }
        offset += count;
    }
    Ok(citations)
}

/// Restore public citations on their original output-text part. Their public
/// offsets address the whole message; Responses indexes each part separately.
pub(super) fn replay_citations(
    parts: &mut [super::WireContent],
    projection: &[agent_kit_core::messages::Content],
) {
    use super::WireContent;
    use agent_kit_core::messages::Content;
    if !projection.iter().any(|p| {
        matches!(
            p,
            Content::ProviderEvidence(ProviderEvidence::UrlCitation(_))
        )
    }) {
        return;
    }
    let mut offset = 0;
    for part in parts {
        match part {
            WireContent::Refusal { refusal } => offset += refusal.chars().count(),
            WireContent::OutputText { text, annotations } => {
                let end = offset + text.chars().count();
                *annotations = projection
                    .iter()
                    .filter_map(|p| {
                        let Content::ProviderEvidence(ProviderEvidence::UrlCitation(c)) = p else {
                            return None;
                        };
                        (c.start_index >= offset && c.end_index <= end).then(|| {
                            serde_json::json!({
                                "type":"url_citation","url":c.url,"title":c.title,
                                "start_index":c.start_index-offset,"end_index":c.end_index-offset
                            })
                        })
                    })
                    .collect();
                offset = end;
            }
        }
    }
}
