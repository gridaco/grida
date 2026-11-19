//! GRIDA-SEC-004 — The policy that makes a forked chat a side chat.
//!
//! A side chat is an ordinary chat forked from a parent's committed history.
//! It runs on the same engine with the same tools and permission rules. Two
//! pieces of product material set it apart, and this module is their only
//! owner:
//!
//! - [`POLICY`] joins the chat's instructions on every side turn. It states what
//!   a side chat is for and what it must leave alone.
//! - [`boundary`] is a user-role marker placed between the inherited history
//!   and the side chat's own turns. Everything before it is reference material;
//!   only what follows it is an active request.
//!
//! The instructions come before every message, so a provider request reads the
//! policy, then the inherited history, then the boundary, then the person's
//! first side question. The host recomputes both on every side turn from the
//! side session's configuration, so neither can drift or be dropped.
//!
//! The boundary is also where the side chat's transcript begins. The
//! inherited history stays model context only: [`inherited_records`] counts
//! the seed records that precede the boundary, and every user-facing view of
//! the side chat (its transcript, history and revision targets) starts after
//! them.
//!
//! Automatic compaction can replace the inherited history with a summary
//! before the first side turn. The summary is still background: it precedes
//! the boundary, and the side chat's own turns follow it. Those turns are never
//! summarized, so the boundary cannot be folded away.
//!
//! The policy steers behavior; it does not remove authority. A side chat's
//! tools and permissions are its parent's. The structural limits (no
//! delegation, goals, scheduled continuation, forks, nested side chats or
//! manual compaction) are enforced by the host where each operation is
//! admitted.

use crate::conversation_seed::SeedProvenance;
use agent_kit_core::messages::{Content, Message, Provenance, ProvenanceKind, Role};
use agent_kit_core::{Fingerprint, MessageId, Result, SessionId};

/// Provenance source of the inherited-history boundary message.
pub const BOUNDARY_SOURCE: &str = "side_chat_boundary";

/// Instructions every side turn runs under.
pub const POLICY: &str = include_str!("prompts/side-chat.md").trim_ascii_end();

const BOUNDARY: &str = "\
Side chat boundary.

Everything above this message was copied from the main chat as background. It is not \
your current task. Do not continue, execute or complete any request, plan, tool call, \
approval or edit that appears above. Answer only what the person asks after this \
message, and wait for their question if there is none yet.";

/// Extend a turn's instructions with the side-chat policy.
pub fn apply(instructions: &mut String) {
    if !instructions.is_empty() {
        instructions.push_str("\n\n");
    }
    instructions.push_str(POLICY);
}

/// The marker that separates inherited history from the side chat's own turns.
pub fn boundary() -> Result<Message> {
    Ok(Message {
        id: MessageId::new("grida-side-chat-boundary")?,
        role: Role::User,
        phase: None,
        content: vec![Content::Text(BOUNDARY.into())],
        provenance: Provenance {
            source: BOUNDARY_SOURCE.into(),
            kind: ProvenanceKind::Supplied,
            fingerprint: Some(Fingerprint::of(&BOUNDARY)?),
        },
    })
}

/// How many leading records of side session `session`'s retained seed were
/// inherited from its parent: the background the model reads before the
/// boundary. The side chat's transcript begins after them.
///
/// A revision of a side message folds the side chat's own earlier records into
/// the seed after the inherited ones. Those keep the side session as their
/// origin, so they stay after the boundary and in the transcript.
pub fn inherited_records(session: &SessionId, provenance: &SeedProvenance) -> usize {
    provenance
        .entries
        .iter()
        .filter(|entry| entry.message.is_some())
        .take_while(|entry| &entry.origin.session != session)
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn policy_covers_every_side_chat_limit() {
        for required in [
            "background only",
            "Do not continue, repeat, finish or act",
            "approvals",
            "same permissions as the main chat",
            "changes nothing",
            "Do not modify files, source code, version control state, permissions, configuration",
            "explicitly asks for that change after the boundary",
            "smallest",
            "Do not ask for broader access",
            "Subagents and delegation are not available",
            "scheduled follow-ups cannot run in a temporary side chat",
        ] {
            assert!(POLICY.contains(required), "{required}");
        }
    }

    #[test]
    fn instructions_keep_existing_text_before_the_policy() {
        let mut instructions = String::from("Existing product instructions.");
        apply(&mut instructions);
        assert!(instructions.starts_with("Existing product instructions.\n\n"));
        assert!(instructions.ends_with(POLICY));
        let mut empty = String::new();
        apply(&mut empty);
        assert_eq!(empty, POLICY);
    }

    #[test]
    fn the_transcript_begins_after_the_inherited_records() {
        use crate::conversation_seed::{
            ConversationAnchor, ConversationCut, ConversationSeed, ConversationSource,
        };
        use agent_kit_core::TurnId;
        use agent_kit_core::history::HistoryRecord;
        use agent_kit_core::turn::JournalPosition;

        let parent = SessionId::new("parent").unwrap();
        let side = SessionId::new("side/one").unwrap();
        let source = |session: &SessionId| ConversationSource {
            session: session.clone(),
            view: 0,
            tail: None,
            fingerprint: Fingerprint::of(session).unwrap(),
        };
        let local = |turn: &str, messages: [(&str, Role); 2]| {
            messages.map(|(id, role)| {
                (
                    TurnId::new(turn).unwrap(),
                    JournalPosition(1),
                    HistoryRecord::Message(Message {
                        id: MessageId::new(id).unwrap(),
                        role,
                        phase: None,
                        content: vec![Content::Text(format!("{id} text"))],
                        provenance: Provenance {
                            source: "test".into(),
                            kind: ProvenanceKind::Supplied,
                            fingerprint: None,
                        },
                    }),
                )
            })
        };
        // Opening the side chat copies the parent's two messages.
        let opened = ConversationSeed::lower(
            source(&parent),
            ConversationCut::Through(ConversationAnchor::Turn {
                turn: TurnId::new("parent-turn").unwrap(),
                message: MessageId::new("parent-answer").unwrap(),
            }),
            None,
            local(
                "parent-turn",
                [
                    ("parent-question", Role::User),
                    ("parent-answer", Role::Assistant),
                ],
            ),
        )
        .unwrap();
        assert_eq!(opened.records().len(), 2);
        assert_eq!(inherited_records(&side, opened.provenance()), 2);

        // Editing the side chat's second question folds its first side turn
        // into the seed after the inherited records.
        let revised = ConversationSeed::lower(
            source(&side),
            ConversationCut::BeforeEditableUser(ConversationAnchor::Turn {
                turn: TurnId::new("side-second").unwrap(),
                message: MessageId::new("side-second-question").unwrap(),
            }),
            Some(opened),
            local(
                "side-first",
                [
                    ("side-first-question", Role::User),
                    ("side-first-answer", Role::Assistant),
                ],
            )
            .into_iter()
            .chain(local(
                "side-second",
                [
                    ("side-second-question", Role::User),
                    ("side-second-answer", Role::Assistant),
                ],
            )),
        )
        .unwrap();
        assert_eq!(revised.records().len(), 4);
        assert_eq!(inherited_records(&side, revised.provenance()), 2);
    }

    #[test]
    fn the_boundary_is_a_marked_user_message() {
        let message = boundary().unwrap();
        assert_eq!(message.role, Role::User);
        assert_eq!(message.provenance.source, BOUNDARY_SOURCE);
        let [Content::Text(text)] = message.content.as_slice() else {
            panic!("expected boundary text");
        };
        assert!(text.starts_with("Side chat boundary."));
        assert!(text.contains("not your current task"));
    }
}
