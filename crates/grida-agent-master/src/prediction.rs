//! Product policy for drafting a possible next user message after a reply.

use agent_kit_core::inference::{
    InferenceOutcome, InferenceRequest, InferenceStatus, Modality, ModelCapabilities,
    PreparedRequest, ReasoningEffort,
};
use agent_kit_core::messages::{Content, Message, MessagePhase, Provenance, ProvenanceKind, Role};
use agent_kit_core::{MessageId, ModelId, Result};

pub const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);
const MAX_TEXT_CHARS: usize = 200;
const MAX_OUTPUT_TOKENS: u64 = 128;

/// A local endpoint keeps its selected model. Hosted predictions use the
/// product's authored economy tier, subject to the connection's live offer.
pub fn model(foreground: &ModelId, local: bool) -> Result<ModelId> {
    if local {
        Ok(foreground.clone())
    } else {
        ModelId::new(include_str!("../data/economy-model.txt").trim())
    }
}

const INSTRUCTION: &str = "The reply above is finished. Predict the single short next message the user is most likely to type, in their language and voice. Ground it in the conversation, its decisions and remaining work. Return only the editable prompt on one line, without quotes, explanation or formatting. If no specific next step is justified, return NONE. Do not answer the proposed prompt or take any action.";

/// The accepted request already contains the master's exact history, compaction
/// replacement, capability-compatible media and original task guidance. Append
/// the response it produced and a private instruction, leaving the parent intact.
pub fn request(
    source: &PreparedRequest,
    reply: &[Message],
    model: &ModelId,
    capabilities: &ModelCapabilities,
    output_limit: Option<u64>,
) -> Result<InferenceRequest> {
    let mut request = source.request().clone();
    request.messages.extend_from_slice(reply);
    if source.request().model != *model || source.capabilities() != capabilities {
        request.messages = request
            .messages
            .into_iter()
            .filter_map(crate::history::portable_message)
            .collect();
        if !capabilities.input_modalities.contains(&Modality::Image) {
            crate::image_attachment::omit_prepared_pixels(&mut request.messages);
        }
    }
    request.messages.push(Message {
        id: MessageId::new("grida-predict-next-prompt")?,
        role: Role::User,
        phase: None,
        content: vec![Content::Text(INSTRUCTION.into())],
        provenance: Provenance {
            source: "composer-prediction".into(),
            kind: ProvenanceKind::Synthetic,
            fingerprint: None,
        },
    });
    request.tools.clear();
    request.extension = None;
    // The subscription endpoint does not accept an output-token parameter.
    // Keep its native contract and the shared deadline and local output bound.
    request.model = model.clone();
    let output_ceiling = [
        source.request().max_output_tokens,
        capabilities.max_output_tokens,
    ]
    .into_iter()
    .flatten()
    .fold(MAX_OUTPUT_TOKENS, u64::min);
    request.max_output_tokens = output_limit.map(|limit| limit.min(output_ceiling));
    request.reasoning = capabilities
        .reasoning
        .contains(&ReasoningEffort::Low)
        .then_some(ReasoningEffort::Low);
    Ok(request)
}

/// Only complete, single-line assistant text is suitable for an editable draft.
pub fn text(outcome: &InferenceOutcome) -> Option<String> {
    if outcome.status != InferenceStatus::Completed || outcome.failure.is_some() {
        return None;
    }
    let mut text = String::new();
    for message in &outcome.messages {
        if message.role != Role::Assistant || message.phase == Some(MessagePhase::Progress) {
            continue;
        }
        for part in &message.content {
            match part {
                Content::Text(part) => text.push_str(part),
                Content::ProviderState(_) | Content::Reasoning(_) => {}
                _ => return None,
            }
        }
    }
    let text = text.trim();
    (!text.is_empty()
        && !text.eq_ignore_ascii_case("none")
        && !text
            .chars()
            .any(|c| c.is_control() || matches!(c, '\u{2028}' | '\u{2029}'))
        && !text.contains("<think>")
        && text.chars().count() <= MAX_TEXT_CHARS)
        .then(|| text.to_owned())
}
