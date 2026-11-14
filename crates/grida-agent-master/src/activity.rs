//! How recorded turn work is described to the person.
//!
//! Both decisions are pure functions of retained history. Reopening a chat
//! repeats the same description without any model request.

use agent_kit_core::messages::{Content, Message, MessagePhase, OutcomeStatus, Role};
use agent_kit_core::{MessageId, ToolId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// The kind of work a tool call performed, as presented to the person.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityKind {
    Read,
    Search,
    Edit,
    Execute,
    Generate,
    Integration,
    Delegate,
    Ask,
    Other,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Activity {
    pub kind: ActivityKind,
    /// The configured integration name for an integration tool.
    pub source: Option<String>,
}

const MCP_PREFIX: &str = "mcp_";

/// Classify a tool by its identity alone.
pub fn classify(tool: &ToolId) -> Activity {
    let id = tool.as_str();
    if let Some((source, _)) = id
        .strip_prefix(MCP_PREFIX)
        .and_then(|rest| rest.split_once('_'))
        .filter(|(source, name)| !source.is_empty() && !name.is_empty())
    {
        return Activity {
            kind: ActivityKind::Integration,
            source: Some(source.to_owned()),
        };
    }
    let kind = match id {
        "read_file"
        | "list_files"
        | "view_image"
        | "inspect_retained_file"
        | "capture_image_reference"
        | "svg_read_selected_text"
        | "surface_list_open"
        | "goal_inspect" => ActivityKind::Read,
        "search_text" | "design_search" => ActivityKind::Search,
        "svg_replace_selected_text" | "place_generated_image" | "crop_retained_image" => {
            ActivityKind::Edit
        }
        "exec_command" | "write_stdin" | "before_completion_command" => ActivityKind::Execute,
        "generate_image" | "generate_image_from_workspace_reference" => ActivityKind::Generate,
        "review" | "delegate_review" | "collect_review" => ActivityKind::Delegate,
        "question" | "question_async" => ActivityKind::Ask,
        _ => ActivityKind::Other,
    };
    Activity { kind, source: None }
}

/// Identify each turn's final answer among its assistant messages, in order.
///
/// An adapter's explicit phase is authoritative. Without one, only the turn's
/// concluding assistant response qualifies, and only when it has readable text
/// and requested no further tool work. A stopped turn has no inferred answer:
/// its last text may be an interrupted partial response. Arrival order alone
/// never makes text final.
pub fn final_answers<'a>(
    turn: impl IntoIterator<Item = &'a Message>,
    outcome: Option<OutcomeStatus>,
) -> BTreeSet<MessageId> {
    let assistant: Vec<_> = turn
        .into_iter()
        .filter(|message| message.role == Role::Assistant)
        .collect();
    let explicit: BTreeSet<_> = assistant
        .iter()
        .filter(|message| message.phase == Some(MessagePhase::Answer))
        .map(|message| message.id.clone())
        .collect();
    if !explicit.is_empty() || outcome == Some(OutcomeStatus::Cancelled) {
        return explicit;
    }
    assistant
        .last()
        .filter(|message| {
            message.phase.is_none()
                && !message
                    .content
                    .iter()
                    .any(|part| matches!(part, Content::ToolCall(_)))
                && message
                    .content
                    .iter()
                    .any(|part| matches!(part, Content::Text(text) if !text.trim().is_empty()))
        })
        .map(|message| message.id.clone())
        .into_iter()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_kit_core::ToolCallId;
    use agent_kit_core::messages::{Provenance, ProvenanceKind, ToolArguments, ToolCall};

    fn message(id: &str, phase: Option<MessagePhase>, content: Vec<Content>) -> Message {
        Message {
            id: MessageId::new(id).unwrap(),
            role: Role::Assistant,
            phase,
            content,
            provenance: Provenance {
                source: "test".into(),
                kind: ProvenanceKind::Generated,
                fingerprint: None,
            },
        }
    }

    fn text(value: &str) -> Content {
        Content::Text(value.into())
    }

    fn call(id: &str) -> Content {
        Content::ToolCall(ToolCall {
            id: ToolCallId::new(id).unwrap(),
            tool: ToolId::new("read_file").unwrap(),
            arguments: ToolArguments::Json(serde_json::json!({})),
        })
    }

    fn ids(set: BTreeSet<MessageId>) -> Vec<String> {
        set.into_iter().map(|id| id.as_str().to_owned()).collect()
    }

    #[test]
    fn tools_are_classified_by_identity() {
        let kind = |id: &str| classify(&ToolId::new(id).unwrap());
        assert_eq!(kind("read_file").kind, ActivityKind::Read);
        assert_eq!(kind("search_text").kind, ActivityKind::Search);
        assert_eq!(kind("exec_command").kind, ActivityKind::Execute);
        assert_eq!(kind("write_stdin").kind, ActivityKind::Execute);
        assert_eq!(kind("svg_replace_selected_text").kind, ActivityKind::Edit);
        assert_eq!(kind("generate_image").kind, ActivityKind::Generate);
        assert_eq!(kind("question").kind, ActivityKind::Ask);
        assert_eq!(
            kind("mcp_docs_search"),
            Activity {
                kind: ActivityKind::Integration,
                source: Some("docs".into())
            }
        );
        assert_eq!(kind("mcp_").kind, ActivityKind::Other);
        assert_eq!(kind("unknown_tool").kind, ActivityKind::Other);
    }

    #[test]
    fn the_concluding_tool_free_response_is_the_answer() {
        let turn = [
            message("plan", None, vec![text("I'll check the files."), call("a")]),
            message("answer", None, vec![text("Done.")]),
        ];
        assert_eq!(
            ids(final_answers(&turn, Some(OutcomeStatus::Succeeded))),
            ["answer"]
        );
    }

    #[test]
    fn a_response_that_requested_tools_is_never_the_answer() {
        let turn = [message("work", None, vec![text("Reading."), call("a")])];
        assert!(final_answers(&turn, Some(OutcomeStatus::Succeeded)).is_empty());
        let empty = [message("blank", None, vec![text("  ")])];
        assert!(final_answers(&empty, None).is_empty());
    }

    #[test]
    fn a_stopped_turn_keeps_its_partial_text_as_work() {
        let turn = [message("partial", None, vec![text("Starting the")])];
        assert!(final_answers(&turn, Some(OutcomeStatus::Cancelled)).is_empty());
        let explicit = [message(
            "done",
            Some(MessagePhase::Answer),
            vec![text("Done.")],
        )];
        assert_eq!(
            ids(final_answers(&explicit, Some(OutcomeStatus::Cancelled))),
            ["done"]
        );
    }

    #[test]
    fn explicit_phases_are_authoritative() {
        let turn = [
            message("answer", Some(MessagePhase::Answer), vec![text("Result.")]),
            message(
                "note",
                Some(MessagePhase::Progress),
                vec![text("Later note.")],
            ),
        ];
        assert_eq!(
            ids(final_answers(&turn, Some(OutcomeStatus::Succeeded))),
            ["answer"]
        );
        let commentary = [message(
            "note",
            Some(MessagePhase::Progress),
            vec![text("Still working.")],
        )];
        assert!(final_answers(&commentary, None).is_empty());
    }
}
