//! Shared text-editor fixtures harness.
//!
//! Loads `fixtures/text-editor/v1.json` (the repo-level fixture file) and
//! runs each case against this crate's `apply_command_mut`. The same fixture
//! file is consumed by `packages/grida-text-editor/__tests__/shared_fixtures.test.ts`,
//! so any drift between the two implementations shows up here.
//!
//! V1 fixtures are ASCII-only and use pure commands (no layout, no IME,
//! no clipboard), so UTF-8 byte offsets and UTF-16 code-unit offsets are
//! equivalent and no encoding translation is required.
//!
//! The fixture file is `include_str!`-baked into the binary; no fs at runtime.
use super::{apply_command_mut, EditingCommand, SimpleLayoutEngine, TextEditorState};

use serde::Deserialize;

const FIXTURE_JSON: &str = include_str!("../../../../fixtures/text-editor/v1.json");

#[derive(Debug, Deserialize)]
struct Fixture {
    #[allow(dead_code)]
    version: String,
    #[allow(dead_code)]
    description: String,
    tests: Vec<FixtureCase>,
}

#[derive(Debug, Deserialize)]
struct FixtureCase {
    id: String,
    initial: SnapshotState,
    commands: Vec<RawCommand>,
    #[serde(rename = "final")]
    final_state: SnapshotState,
}

#[derive(Debug, Deserialize, PartialEq, Clone)]
struct SnapshotState {
    text: String,
    caret: usize,
    anchor: Option<usize>,
}

/// Mirrors the TS discriminated-union shape on disk.  We translate each
/// variant into the Rust `EditingCommand` enum before dispatch.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum RawCommand {
    Insert {
        text: String,
    },
    Delete {
        granularity: Option<String>,
    },
    Backspace {
        granularity: Option<String>,
    },
    Replace {
        start: usize,
        end: usize,
        text: String,
    },
    MoveLeft {
        extend: bool,
        granularity: Option<String>,
    },
    MoveRight {
        extend: bool,
        granularity: Option<String>,
    },
    MoveDocStart {
        extend: bool,
    },
    MoveDocEnd {
        extend: bool,
    },
    SelectAll,
    SetSelection {
        anchor: usize,
        focus: usize,
    },
}

/// Translate a `RawCommand` (borrowed) into the sequence of `EditingCommand`s
/// it represents.  Most variants map 1:1.  `Replace` does not have a single
/// Rust counterpart, so it's expressed as `SetCursorPos(anchor=start, focus=end)`
/// followed by `Insert(text)` — the `Insert` path replaces the active
/// selection, giving the same net effect.
fn translate(raw: &RawCommand) -> Vec<EditingCommand> {
    match raw {
        RawCommand::Insert { text } => vec![EditingCommand::Insert(text.clone())],
        RawCommand::Delete { granularity } => match granularity.as_deref() {
            None | Some("grapheme") => vec![EditingCommand::Delete],
            Some("word") => vec![EditingCommand::DeleteWord],
            Some(other) => panic!("unsupported delete granularity: {other:?}"),
        },
        RawCommand::Backspace { granularity } => match granularity.as_deref() {
            None | Some("grapheme") => vec![EditingCommand::Backspace],
            Some("word") => vec![EditingCommand::BackspaceWord],
            Some(other) => panic!("unsupported backspace granularity: {other:?}"),
        },
        RawCommand::Replace { start, end, text } => vec![
            EditingCommand::SetCursorPos {
                pos: *end,
                anchor: Some(*start),
            },
            EditingCommand::Insert(text.clone()),
        ],
        RawCommand::MoveLeft {
            extend,
            granularity,
        } => match granularity.as_deref() {
            None | Some("grapheme") => vec![EditingCommand::MoveLeft { extend: *extend }],
            Some("word") => vec![EditingCommand::MoveWordLeft { extend: *extend }],
            Some(other) => panic!("unsupported move_left granularity: {other:?}"),
        },
        RawCommand::MoveRight {
            extend,
            granularity,
        } => match granularity.as_deref() {
            None | Some("grapheme") => vec![EditingCommand::MoveRight { extend: *extend }],
            Some("word") => vec![EditingCommand::MoveWordRight { extend: *extend }],
            Some(other) => panic!("unsupported move_right granularity: {other:?}"),
        },
        RawCommand::MoveDocStart { extend } => {
            vec![EditingCommand::MoveDocStart { extend: *extend }]
        }
        RawCommand::MoveDocEnd { extend } => vec![EditingCommand::MoveDocEnd { extend: *extend }],
        RawCommand::SelectAll => vec![EditingCommand::SelectAll],
        RawCommand::SetSelection { anchor, focus } => vec![EditingCommand::SetCursorPos {
            pos: *focus,
            anchor: Some(*anchor),
        }],
    }
}

/// Convert the post-run `TextEditorState` to the snapshot shape used in the
/// fixture.  Mirrors the TS reader: `anchor == cursor` collapses to `None`.
fn snapshot(state: &TextEditorState) -> SnapshotState {
    let anchor = match state.anchor {
        Some(a) if a != state.cursor => Some(a),
        _ => None,
    };
    SnapshotState {
        text: state.text.clone(),
        caret: state.cursor,
        anchor,
    }
}

fn build_initial(initial: &SnapshotState) -> TextEditorState {
    TextEditorState {
        text: initial.text.clone(),
        cursor: initial.caret,
        anchor: initial.anchor,
    }
}

fn run_case(case: &FixtureCase) {
    let mut state = build_initial(&case.initial);
    let mut layout = SimpleLayoutEngine::default_test();
    for raw in &case.commands {
        for cmd in translate(raw) {
            apply_command_mut(&mut state, cmd, &mut layout);
        }
    }
    let got = snapshot(&state);
    assert_eq!(
        got, case.final_state,
        "fixture case {:?} produced wrong final state",
        case.id
    );
}

#[test]
fn shared_fixtures_v1() {
    let fixture: Fixture = serde_json::from_str(FIXTURE_JSON)
        .expect("fixtures/text-editor/v1.json must parse as the expected schema");
    assert!(
        !fixture.tests.is_empty(),
        "fixture file must contain at least one test"
    );
    for case in &fixture.tests {
        run_case(case);
    }
}
