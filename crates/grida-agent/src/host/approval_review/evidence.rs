//! GRIDA-SEC-004 — evidence from the current history view for a single private assessment.

use super::*;
use grida_agent_master::approval_review::{ReviewExchange, ReviewQuestionAnswer};
use std::collections::BTreeSet;

pub(super) const MAX_USER_INSTRUCTIONS: usize = 256;
const MAX_INSTRUCTION_BYTES: usize = 32 * 1024;
const MAX_ASSISTANT_MESSAGE_BYTES: usize = 4096;

#[derive(Clone, Default)]
pub(super) struct PriorInstructions {
    pub(super) authored: Vec<ReviewExchange>,
    trailing_assistant: Option<(Fingerprint, String)>,
    pub(super) inherited: Vec<String>,
}

/// Read the owning chat's authored instructions across storage pages. Each
/// page uses the same history view. The evidence budget applies to user
/// instructions, independently of the number or size of tool-only turns.
pub(super) async fn prior_instructions(
    host: &Host,
    binding: &agent_kit_core::turn::TurnBinding,
) -> Result<Option<PriorInstructions>> {
    let mut cursor = None;
    let mut conversation = ReverseConversation::new();
    let mut inherited = Vec::new();
    let mut inherited_bytes = 0;
    loop {
        let first = cursor.is_none();
        let replay = host
            .store
            .history_replay_window(
                binding.session.clone(),
                cursor,
                review_transcript,
                |HistoryRecord::Message(message)| {
                    message
                        .content
                        .iter()
                        .map(|part| match part {
                            Content::Text(text) => text.len().max(1),
                            _ => 1,
                        })
                        .sum::<usize>()
                        .max(1)
                },
                |seed| {
                    // A generated summary cannot stand in for the user's actual restrictions.
                    let portable = grida_agent_master::conversation_seed::ConversationSeed::from_parts(
                        seed.records.clone(), &seed.provenance,
                    )?;
                    if portable.provenance().entries.iter().any(|entry| {
                        (entry.editable && !entry.omissions.is_empty())
                            || entry.message.is_none() && entry.omissions.iter().any(|part| matches!(
                                part.kind, grida_agent_master::conversation_seed::SeedOmissionKind::Media
                                    | grida_agent_master::conversation_seed::SeedOmissionKind::UnsupportedRoleContent))
                    }) {
                        return Err(problem(ErrorKind::Unavailable, "approval_review_incomplete_seed"));
                    }
                    Ok(0)
                },
            )
            .await;
        let window = match replay {
            Ok(window) => window,
            // A voluntary review may hand off when its supporting context is
            // incomplete. A failed store read is a technical failure.
            Err(error)
                if matches!(
                    error.code.as_str(),
                    "approval_review_incomplete_seed" | "history_projection_limit"
                ) =>
            {
                return Ok(None);
            }
            Err(error) => return Err(error),
        };
        if first
            && window
                .turns
                .last()
                .is_none_or(|turn| turn.id != binding.turn)
        {
            return Err(problem(
                ErrorKind::Conflict,
                "approval_review_history_changed",
            ));
        }
        for entry in window.records.iter().rev() {
            let HistoryRecord::Message(message) = &entry.record;
            if let Some(turn) = &entry.turn {
                if turn != &binding.turn && conversation.push(message).is_none() {
                    return Ok(None);
                }
            } else if message.role == Role::User
                && message.provenance.kind != ProvenanceKind::Observed
            {
                for part in message.content.iter().rev() {
                    let Content::Text(text) = part else {
                        return Ok(None);
                    };
                    inherited_bytes += text.len();
                    inherited.push(text.clone());
                }
            }
            if conversation.reversed.len() + inherited.len() > MAX_USER_INSTRUCTIONS
                || conversation.user_bytes + inherited_bytes > MAX_INSTRUCTION_BYTES
            {
                return Ok(None);
            }
        }
        cursor = window.older;
        if cursor.is_none() {
            break;
        }
    }
    inherited.reverse();
    Ok(Some(conversation.finish(PriorInstructions {
        inherited,
        ..Default::default()
    })))
}

/// The review uses the public transcript's order. Strip non-text assistant
/// content before it crosses the history paging or private review boundary.
fn review_transcript(turn: &TurnState) -> Vec<HistoryRecord> {
    project_conversation(
        turn.history().records(),
        grida_agent_master::questions::transcript(turn),
        &grida_agent_master::history::interrupted_responses(turn),
        crate::host::preceding_turn_fingerprint(&turn.binding().session, &turn.binding().turn).ok(),
    )
}

fn project_conversation(
    journal: &[HistoryRecord],
    transcript: Vec<HistoryRecord>,
    interrupted: &BTreeSet<MessageId>,
    turn_id: Option<Fingerprint>,
) -> Vec<HistoryRecord> {
    // A late model response can display above an earlier steer. Require its
    // position in the committed journal to agree before interpreting the reply.
    let mut previous = None;
    let mut submitted_after = BTreeMap::new();
    for HistoryRecord::Message(message) in journal {
        if message.role == Role::Assistant && message.content.iter().any(visible_part) {
            previous = Some(&message.id);
        } else if plain_input(message)
            || grida_agent_master::questions::is_answer_contribution(message)
        {
            submitted_after.insert(&message.id, previous.take());
        }
    }
    let mut preceding = None;
    transcript
        .into_iter()
        .filter_map(|HistoryRecord::Message(mut message)| {
            match message.role {
                Role::User => {
                    if (plain_input(&message)
                        || grida_agent_master::questions::is_answer_contribution(&message))
                        && let Some(id) = preceding.take()
                    {
                        message.provenance.fingerprint = turn_id.filter(|_| {
                            submitted_after.get(&message.id).copied().flatten() == Some(&id)
                        });
                    }
                }
                Role::Assistant => {
                    message.content.retain(visible_part);
                    if message.content.is_empty() {
                        return None;
                    }
                    preceding = Some(message.id.clone());
                    message.provenance.fingerprint = turn_id;
                    // Preserve an unavailable referent as a barrier. Truncating
                    // could drop the risk or target that made a reply specific.
                    let mut bytes = 0usize;
                    if message.provenance.kind != ProvenanceKind::Generated
                        || interrupted.contains(&message.id)
                        || !message.content.iter().all(|part| match part {
                            Content::Text(text) => {
                                bytes = bytes.saturating_add(text.len());
                                bytes <= MAX_ASSISTANT_MESSAGE_BYTES
                            }
                            _ => false,
                        })
                    {
                        message.content.clear();
                    }
                }
                _ => return None,
            }
            Some(HistoryRecord::Message(message))
        })
        .collect()
}

fn visible_part(part: &Content) -> bool {
    matches!(part, Content::Text(text) if !text.is_empty()) || matches!(part, Content::Media(_))
}

fn plain_input(message: &Message) -> bool {
    message.role == Role::User
        && message.provenance.kind == ProvenanceKind::Supplied
        && matches!(
            message.provenance.source.as_str(),
            "native-client" | crate::host::message_context::SUPPLIED_SOURCE
        )
}

impl PriorInstructions {
    pub(super) fn with_turn(self, state: &TurnState) -> Option<Self> {
        let mut conversation = ReverseConversation::new();
        for HistoryRecord::Message(message) in review_transcript(state).iter().rev() {
            conversation.push(message)?;
        }
        let latest = conversation.finish(self);
        let mut bytes = latest.inherited.iter().map(String::len).sum::<usize>();
        bytes += latest
            .authored
            .iter()
            .map(ReviewExchange::instruction_bytes)
            .sum::<usize>();
        (latest.authored.len() + latest.inherited.len() <= MAX_USER_INSTRUCTIONS
            && bytes <= MAX_INSTRUCTION_BYTES)
            .then_some(latest)
    }
}

// Storage pages arrive newest first. Carry the unmatched reply across page
// boundaries, and the last assistant message into the mutable turn.
enum Awaiting {
    Tail,
    Reply(Fingerprint),
    Neither,
}

struct ReverseConversation {
    reversed: Vec<ReviewExchange>,
    awaiting: Awaiting,
    trailing_assistant: Option<(Fingerprint, String)>,
    user_bytes: usize,
}

impl ReverseConversation {
    fn new() -> Self {
        Self {
            reversed: Vec::new(),
            awaiting: Awaiting::Tail,
            trailing_assistant: None,
            user_bytes: 0,
        }
    }

    fn push(&mut self, message: &Message) -> Option<()> {
        if message.role == Role::Assistant {
            let awaiting = std::mem::replace(&mut self.awaiting, Awaiting::Neither);
            if matches!(awaiting, Awaiting::Neither) {
                return Some(());
            }
            if let Some(origin) = message.provenance.fingerprint {
                let text: String = message
                    .content
                    .iter()
                    .filter_map(|part| match part {
                        Content::Text(text) => Some(text.as_str()),
                        _ => None,
                    })
                    .collect();
                if !text.trim().is_empty() {
                    match awaiting {
                        Awaiting::Tail => self.trailing_assistant = Some((origin, text)),
                        Awaiting::Reply(expected) if expected == origin => {
                            if let Some(ReviewExchange::Plain {
                                preceding_assistant,
                                ..
                            }) = self.reversed.last_mut()
                            {
                                *preceding_assistant = Some(text);
                            }
                        }
                        _ => {}
                    }
                }
            }
            return Some(());
        }
        let exchange =
            if let Some(replies) = grida_agent_master::questions::visible_replies(message) {
                let question_answers = replies
                    .into_iter()
                    .filter(|reply| !reply.skipped)
                    .map(|reply| ReviewQuestionAnswer {
                        question: reply.question,
                        user_answer: reply.answer,
                    })
                    .collect::<Vec<_>>();
                if question_answers.is_empty() {
                    self.awaiting = Awaiting::Neither;
                    return Some(());
                }
                ReviewExchange::Questions { question_answers }
            } else if plain_input(message) {
                let [Content::Text(text)] = message.content.as_slice() else {
                    return None;
                };
                // Resource-link-only inputs are normalized to one JSON text part.
                // An attachment label cannot stand in for authored instructions.
                if text.starts_with(r#"{"kind":"resource_link","#) {
                    return None;
                }
                ReviewExchange::Plain {
                    user: text.clone(),
                    preceding_assistant: None,
                }
            } else if crate::host::message_context::is_supplemental(message)
                || crate::host::editor_observation::is_observation(message)
                || crate::skills::CapturedGuidance::is_message(message)
            {
                // Guidance and observations are distinct from authored instructions.
                return Some(());
            } else {
                // An unfamiliar user contribution may contain a restriction.
                return None;
            };
        self.user_bytes = self.user_bytes.checked_add(exchange.instruction_bytes())?;
        if self.reversed.len() >= MAX_USER_INSTRUCTIONS || self.user_bytes > MAX_INSTRUCTION_BYTES {
            return None;
        }
        self.awaiting = match (message.provenance.fingerprint, &exchange) {
            (Some(origin), ReviewExchange::Plain { .. }) => Awaiting::Reply(origin),
            _ => Awaiting::Neither,
        };
        self.reversed.push(exchange);
        Some(())
    }

    fn finish(mut self, mut earlier: PriorInstructions) -> PriorInstructions {
        match (self.awaiting, earlier.trailing_assistant.take()) {
            (Awaiting::Reply(expected), Some((origin, text))) if expected == origin => {
                if let Some(ReviewExchange::Plain {
                    preceding_assistant,
                    ..
                }) = self.reversed.last_mut()
                {
                    *preceding_assistant = Some(text);
                }
            }
            (Awaiting::Tail, tail) => self.trailing_assistant = tail,
            _ => {}
        }
        earlier.authored.extend(self.reversed.into_iter().rev());
        earlier.trailing_assistant = self.trailing_assistant;
        earlier
    }
}

pub(super) fn prior_manual_decisions(state: &TurnState) -> Result<Vec<String>> {
    let mut evidence = Vec::new();
    for wait in state
        .waits()
        .values()
        .filter(|w| is_approval(w) && w.answer.is_some())
    {
        let request = read_approval(wait)?;
        let Some((decision, None)) = crate::permissions::bound_approval_decision(wait, &request)?
        else {
            continue;
        };
        let target = match &request.effect {
            ApprovalEffect::Command {
                network: Some(destination),
                ..
            } => {
                format!("connection to {}:{}", destination.host, destination.port)
            }
            ApprovalEffect::Read { relative_path, .. } => {
                format!("read {}", relative_path.display())
            }
            ApprovalEffect::Write { relative_path, .. } => {
                format!("write {}", relative_path.display())
            }
            ApprovalEffect::EscalatedCommand { .. } | ApprovalEffect::Command { .. } => {
                format!("command invocation {}", request.operation)
            }
        };
        let decision = match decision {
            ApprovalDecision::ApproveOnce => "approved once",
            ApprovalDecision::Decline => "declined",
        };
        if target.len() <= 256 && evidence.len() < 8 {
            evidence.push(format!("User {decision}: {target}"));
        }
    }
    Ok(evidence)
}

/// Links in the current or immediately preceding submitted prompt can identify
/// the subject of a follow-up. Other client text and tool output stay private.
pub(super) fn observed_reference_urls(source: &InferenceRequest) -> Vec<String> {
    use crate::host::message_context;
    let authored = source.messages.iter().rev().filter(|message| {
        message.role == Role::User
            && message.provenance.kind == ProvenanceKind::Supplied
            && matches!(
                message.provenance.source.as_str(),
                "native-client" | message_context::SUPPLIED_SOURCE
            )
    });
    let Some(input) = authored
        .take(2)
        .find(|input| message_context::has_context(input))
    else {
        return Vec::new();
    };
    let context = source
        .messages
        .iter()
        .find(|message| message_context::is_supplemental_for(message, &input.id));
    let Some([Content::Text(text)]) = context.map(|message| message.content.as_slice()) else {
        return Vec::new();
    };
    // The client serializes selected references as self-closing entries
    // with quoted attributes. Titles and other supplemental prose are not
    // reference URLs. None of this context grants access.
    let mut urls = Vec::new();
    for entry in text.split('<').filter_map(|tag| {
        tag.strip_prefix("reference ")?
            .split_once("/>")
            .map(|(attributes, _)| attributes)
    }) {
        let mut fields = entry.split('"');
        while let (Some(attribute), Some(value)) = (fields.next(), fields.next()) {
            if !matches!(attribute.trim_ascii(), "url=" | "source=") {
                continue;
            }
            let Ok(mut url) = reqwest::Url::parse(&value.replace("&amp;", "&")) else {
                continue;
            };
            if !matches!(url.scheme(), "http" | "https")
                || !url.username().is_empty()
                || url.password().is_some()
            {
                continue;
            }
            url.set_query(None);
            url.set_fragment(None);
            let link = url.to_string();
            if link.len() <= 512 && !urls.contains(&link) {
                urls.push(link);
                if urls.len() == 4 {
                    return urls;
                }
            }
        }
    }
    urls
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn unavailable_history_cannot_transfer_a_decision_to_the_person() {
        let directory = tempfile::tempdir().unwrap();
        let state = directory.path().join("state");
        prepare_state_dir(&state).unwrap();
        open_store(&state.join(DATABASE_FILE)).unwrap();
        let host = Host::open(&state, None).unwrap();
        let binding = agent_kit_core::turn::TurnBinding {
            session: SessionId::new("absent").unwrap(),
            turn: TurnId::new("absent").unwrap(),
            epoch: 0,
        };
        assert!(
            matches!(prior_instructions(&host, &binding).await, Err(error) if error.code.as_str() == "session_missing")
        );
    }

    #[test]
    fn a_plain_reply_can_refer_only_to_visible_prose_committed_before_it() {
        let mut question = Message {
            id: MessageId::new("question").unwrap(),
            role: Role::Assistant,
            provenance: Provenance {
                kind: ProvenanceKind::Generated,
                source: "provider".into(),
                fingerprint: None,
            },
            phase: None,
            content: vec![
                Content::Text("Delete the local draft?".into()),
                Content::Reasoning("private".into()),
            ],
        };
        let reply = crate::host::prompt_input(
            &ChangeId::new("reply").unwrap(),
            &[PromptPart::Text { text: "Yes".into() }],
        )
        .unwrap()
        .remove(0);
        let turn = Fingerprint::of(&"turn").unwrap();
        let preceding = |question: &Message, replied_early: bool, interrupted: bool| {
            let transcript = vec![
                HistoryRecord::Message(question.clone()),
                HistoryRecord::Message(reply.clone()),
            ];
            let mut journal = transcript.clone();
            if replied_early {
                journal.reverse();
            }
            let cut = interrupted
                .then(|| question.id.clone())
                .into_iter()
                .collect();
            let records = project_conversation(&journal, transcript, &cut, Some(turn));
            let mut conversation = ReverseConversation::new();
            for HistoryRecord::Message(message) in records.iter().rev() {
                conversation.push(message).unwrap();
            }
            match conversation.finish(Default::default()).authored.remove(0) {
                ReviewExchange::Plain {
                    preceding_assistant,
                    ..
                } => preceding_assistant,
                _ => panic!("expected a plain chat reply"),
            }
        };
        assert_eq!(
            preceding(&question, false, false).as_deref(),
            Some("Delete the local draft?")
        );
        assert!(preceding(&question, true, false).is_none());
        assert!(preceding(&question, false, true).is_none());
        question.content = vec![Content::Text("x".repeat(MAX_ASSISTANT_MESSAGE_BYTES + 1))];
        assert!(preceding(&question, false, false).is_none());
    }

    #[test]
    fn ambiguous_or_incomplete_user_instructions_stay_with_the_person() {
        let input = |text: &str| {
            let mut messages = crate::host::prompt_input(
                &ChangeId::new("submitted").unwrap(),
                &[PromptPart::Text { text: text.into() }],
            )
            .unwrap();
            HistoryRecord::Message(messages.remove(0))
        };
        let earlier = input("Keep this project offline.");
        let changed = input("Also cancel permission for that outside file.");
        let mut conversation = ReverseConversation::new();
        for HistoryRecord::Message(message) in [&changed, &earlier] {
            conversation.push(message).unwrap();
        }
        let evidence = conversation.finish(Default::default());
        assert_eq!(
            evidence
                .authored
                .iter()
                .map(|entry| match entry {
                    ReviewExchange::Plain { user, .. } => user.as_str(),
                    _ => panic!("expected plain chat text"),
                })
                .collect::<Vec<_>>(),
            [
                "Keep this project offline.",
                "Also cancel permission for that outside file."
            ]
        );

        let mut mixed = earlier.clone();
        let HistoryRecord::Message(message) = &mut mixed;
        message.content.push(Content::Text(
            "Attachment with additional restrictions.".into(),
        ));
        let resource = crate::host::prompt_input(
            &ChangeId::new("attachment").unwrap(),
            &[PromptPart::ResourceLink {
                name: "This label cannot grant authorization.".into(),
                uri: "https://example.com".into(),
                mime_type: None,
            }],
        )
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
        for records in [
            vec![mixed],
            vec![HistoryRecord::Message(resource)],
            vec![input(&"x".repeat(MAX_INSTRUCTION_BYTES + 1))],
            vec![earlier; MAX_USER_INSTRUCTIONS + 1],
        ] {
            let mut conversation = ReverseConversation::new();
            assert!(
                records
                    .iter()
                    .rev()
                    .any(|HistoryRecord::Message(message)| conversation.push(message).is_none())
            );
        }
    }
}
