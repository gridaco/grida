//! Passive context supplied with a user message at the native chat boundary.

use super::{PromptPart, problem};
use agent_kit_core::messages::{Content, Message, Provenance, ProvenanceKind, Role};
use agent_kit_core::{ErrorKind, MessageId, Result};
use grida_agent_master::conversation_seed::MESSAGE_CONTEXT_SOURCE as SOURCE;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub(crate) const MAX_BYTES: usize = 16 * 1024;
const MAX_PARTS: usize = 16;
const MAX_DEPTH: usize = 8;
// GRIDA-SEC-007: accepted skill provenance is projected by the host.
const SKILL_DISPLAY_KIND: &str = "skill";
pub(super) const SUPPLIED_SOURCE: &str = "native-client-with-message-context";

/// The client supplies an inference view and an opaque presentation view.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MessageContext {
    model_text: String,
    pub(crate) display_parts: Vec<DisplayPart>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DisplayPart {
    kind: String,
    version: u16,
    data: Map<String, Value>,
}

impl MessageContext {
    fn validate(&self) -> Result<()> {
        if self.model_text.trim().is_empty()
            || self.display_parts.iter().any(|part| {
                !identifier(&part.kind)
                    || part.version == 0
                    || !part.data.values().all(|value| bounded_depth(value, 1))
            })
        {
            return Err(problem(ErrorKind::InvalidInput, "message_context_invalid"));
        }
        if self.display_parts.len() > MAX_PARTS
            || serde_json::to_vec(self)
                .map_err(|_| problem(ErrorKind::InvalidInput, "message_context_invalid"))?
                .len()
                > MAX_BYTES
        {
            return Err(problem(
                ErrorKind::LimitExceeded,
                "message_context_too_large",
            ));
        }
        Ok(())
    }

    pub(super) fn model_message(&self, authored: &MessageId) -> Result<Message> {
        Ok(Message {
            id: MessageId::new(supplemental_id(authored))?,
            role: Role::User,
            phase: None,
            content: vec![Content::Text(format!(
                "Supplemental context supplied by the client\n{}",
                self.model_text
            ))],
            provenance: Provenance {
                source: SOURCE.into(),
                kind: ProvenanceKind::Observed,
                fingerprint: None,
            },
        })
    }
}

pub(crate) fn context(parts: &[PromptPart]) -> Option<&MessageContext> {
    parts.iter().find_map(|part| match part {
        PromptPart::MessageContext { context } => Some(context),
        _ => None,
    })
}

/// The accepted skill descriptor supplies its own display part. The client
/// supplies ordinary supplemental context through a separate input part.
pub(crate) fn display_parts(
    parts: &[PromptPart],
    skills: &[crate::skills::SkillDescription],
) -> Vec<DisplayPart> {
    let mut display = context(parts)
        .into_iter()
        .flat_map(|context| &context.display_parts)
        .filter(|part| part.kind != SKILL_DISPLAY_KIND)
        .cloned()
        .collect::<Vec<_>>();
    display.extend(skills.iter().map(|skill| {
        let mut data = serde_json::json!({
            "name": skill.name,
            "source": skill.source,
            "uri": skill.uri,
        })
        .as_object()
        .expect("skill display object")
        .clone();
        if let Some(extension) = &skill.extension {
            data.insert("extension".into(), Value::String(extension.clone()));
        }
        DisplayPart {
            kind: SKILL_DISPLAY_KIND.into(),
            version: 1,
            data,
        }
    }));
    display
}

/// The text the person authored on an input that also selected a skill.
pub(super) fn skill_input_text(parts: &[PromptPart]) -> String {
    let mut text = String::new();
    for part in parts {
        match part {
            PromptPart::Text { text: authored } => text.push_str(authored),
            PromptPart::ResourceLink { .. } => {
                text.push_str(&serde_json::to_string(part).expect("serializable reference"))
            }
            _ => {}
        }
    }
    text
}

pub(super) fn validate_client_display_parts(parts: &[PromptPart]) -> Result<()> {
    if context(parts).is_some_and(|context| {
        context
            .display_parts
            .iter()
            .any(|part| part.kind == SKILL_DISPLAY_KIND)
    }) {
        return Err(problem(ErrorKind::InvalidInput, "message_context_invalid"));
    }
    Ok(())
}

pub(super) fn validate_parts(parts: &[PromptPart]) -> Result<()> {
    if let Some(context) = context(parts) {
        if parts
            .iter()
            .filter(|part| matches!(part, PromptPart::MessageContext { .. }))
            .count()
            != 1
        {
            return Err(problem(ErrorKind::InvalidInput, "message_context_invalid"));
        }
        context.validate()?;
        if context.display_parts.is_empty()
            && !parts.iter().any(|part| match part {
                PromptPart::Text { text } => !text.trim().is_empty(),
                PromptPart::Image { .. }
                | PromptPart::SelectedImage { .. }
                | PromptPart::RetainedImage { .. }
                | PromptPart::PreparedImage { .. }
                | PromptPart::File { .. }
                | PromptPart::RetainedFile { .. }
                | PromptPart::ResourceLink { .. }
                | PromptPart::FileReference { .. } => true,
                _ => false,
            })
        {
            return Err(problem(
                ErrorKind::InvalidInput,
                "message_context_requires_visible_input",
            ));
        }
    }
    Ok(())
}

pub(crate) fn has_context(message: &Message) -> bool {
    message.role == Role::User
        && message.provenance.kind == ProvenanceKind::Supplied
        && message.provenance.source == SUPPLIED_SOURCE
}

pub(crate) fn is_supplemental(message: &Message) -> bool {
    message.role == Role::User
        && message.provenance.kind == ProvenanceKind::Observed
        && message.provenance.source == SOURCE
}

fn supplemental_id(authored: &MessageId) -> String {
    format!("{SOURCE}/{authored}")
}

pub(super) fn is_supplemental_for(message: &Message, authored: &MessageId) -> bool {
    is_supplemental(message) && message.id.as_str() == supplemental_id(authored)
}

fn identifier(value: &str) -> bool {
    (1..=64).contains(&value.len())
        && value.as_bytes()[0].is_ascii_lowercase()
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'.')
        })
}

fn bounded_depth(value: &Value, depth: usize) -> bool {
    depth <= MAX_DEPTH
        && match value {
            Value::Array(values) => values.iter().all(|value| bounded_depth(value, depth + 1)),
            Value::Object(values) => values.values().all(|value| bounded_depth(value, depth + 1)),
            _ => true,
        }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::ChangeId;

    #[test]
    fn supplemental_input_keeps_authored_provenance_and_identity() {
        let context = serde_json::from_value(serde_json::json!({
            "modelText": "Model view.",
            "displayParts": [{"kind":"test.note","version":1,"data":{"label":"Display view."}}]
        }))
        .unwrap();
        let part = PromptPart::MessageContext { context };
        let id = ChangeId::new("submitted-input").unwrap();
        let authored = PromptPart::Text {
            text: "<note>Literal user text.</note>".into(),
        };
        let ordinary = super::super::prompt_input(&id, std::slice::from_ref(&authored)).unwrap();
        let supplied = super::super::prompt_input(&id, &[authored, part.clone()]).unwrap();
        let [primary, supplemental] = supplied.as_slice() else {
            panic!("expected authored and supplemental messages");
        };
        assert_eq!(primary.id, ordinary[0].id);
        assert_eq!(primary.content, ordinary[0].content);
        assert_eq!(primary.provenance.kind, ProvenanceKind::Supplied);
        assert!(is_supplemental(supplemental));
        assert!(is_supplemental_for(supplemental, &primary.id));
        assert!(!is_supplemental_for(supplemental, &supplemental.id));
        assert_ne!(primary.id, supplemental.id);
        let without_text = super::super::prompt_input(&id, &[part]).unwrap();
        assert_eq!(without_text[0].id, primary.id);
        assert_eq!(without_text[0].provenance.kind, ProvenanceKind::Supplied);
        assert!(without_text[0].content.is_empty());
        assert_eq!(without_text[1], *supplemental);
    }
}
