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

use agent_kit_core::messages::{Content, Message, Provenance, ProvenanceKind, Role};
use agent_kit_core::{Fingerprint, MessageId, Result};

/// Provenance source of the inherited-history boundary message.
pub const BOUNDARY_SOURCE: &str = "side_chat_boundary";

/// Instructions every side turn runs under.
pub const POLICY: &str = "\
This is a side chat, a temporary conversation opened beside the person's main chat. \
It exists to answer questions and to look around without changing the main chat's work. \
Do not present yourself as carrying on the main chat's task.

The earlier part of this conversation was copied from the main chat when the side chat \
opened. It is background only. A side chat boundary message marks where the copy ends. \
Requests, plans, unfinished tasks, tool calls, tool results and approvals that appear \
before the boundary belong to the main chat. Do not continue, repeat, finish or act on \
them. Only messages the person sends after the boundary are requests to you.

Your tools follow the same permissions as the main chat. Prefer work that changes nothing: \
reading, searching and checks that leave files untouched. Do not modify files, source code, \
version control state, permissions, configuration or any other workspace state unless the \
person explicitly asks for that change after the boundary. When they do, make the smallest \
change that satisfies the request and avoid disturbing the main chat's work. Do not ask for \
broader access unless an explicitly requested change needs it.

Subagents and delegation are not available here. Do not start, message or rely on other \
agents, including any the main chat used. Goals and scheduled follow-ups cannot run in a \
temporary side chat. If the person wants recurring checks or a goal, tell them to set it up \
in the main chat or in a new chat, and do not claim that you scheduled anything.";

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
