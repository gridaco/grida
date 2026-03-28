//! Tests for `TextEditSession`, `KeyAction`, `ClickTracker`, and the
//! session-level rich text / undo / IME / scroll integration.
//!
//! **Design principles for these tests:**
//!
//! 1. Don't re-test what `tests.rs` already covers (apply_command, grapheme
//!    boundaries, etc.). Focus on what `TextEditSession` adds on top:
//!    AttributedText synchronization, history snapshots with style, caret
//!    override flow, IME suppression, and the high-level dispatch layer.
//!
//! 2. Prefer multi-step scenarios that exercise state machine transitions
//!    over single-assertion smoke tests. These catch real integration bugs.
//!
//! 3. Always assert the _invariant_ — after every edit, `content.text()`
//!    must equal `state.text`. Several tests verify this explicitly.

use super::time::Duration;
use std::thread;

use super::attributed_text::{
    AttributedText, CGColor, Paint, TextDecorationLine, TextStyle as AttrTextStyle,
};
use super::layout::TextLayoutEngine;
use super::session::{ClickTracker, KeyAction, KeyName, TextEditSession};
use super::simple_layout::SimpleLayoutEngine;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn default_style() -> AttrTextStyle {
    AttrTextStyle {
        font_family: "sans-serif".into(),
        font_size: 16.0,
        ..AttrTextStyle::default()
    }
}

/// Create a session with some text, cursor at end.
fn session(text: &str) -> TextEditSession<SimpleLayoutEngine> {
    let style = default_style();
    let layout = SimpleLayoutEngine::new(300.0, 24.0, 10.0);
    let mut s = TextEditSession::new(layout, style.clone());
    if !text.is_empty() {
        s.content = AttributedText::new(text, style);
        s.state.text = text.to_string();
        s.state.cursor = text.len();
    }
    s
}

/// Assert the critical invariant: content.text() == state.text.
fn assert_content_synced(s: &TextEditSession<SimpleLayoutEngine>) {
    assert_eq!(
        s.content.text(),
        &s.state.text,
        "content.text() and state.text are out of sync"
    );
}

// ===========================================================================
// KeyAction::from_key — exhaustive modifier matrix
//
// This is the single source of truth for keyboard shortcut mapping.
// Getting this wrong means the user presses Cmd+Z and nothing happens,
// or Ctrl+Backspace deletes the wrong amount. Every branch matters.
// ===========================================================================

#[test]
fn key_action_arrow_modifier_matrix() {
    // The full 4×4 matrix: {plain, shift, cmd, cmd+shift} × {left, right, up, down}
    // This is exhaustive — any future change to the mapping will break here.
    let cases: Vec<(bool, bool, bool, KeyName, KeyAction)> = vec![
        // plain arrows
        (
            false,
            false,
            false,
            KeyName::ArrowLeft,
            KeyAction::MoveLeft { extend: false },
        ),
        (
            false,
            false,
            false,
            KeyName::ArrowRight,
            KeyAction::MoveRight { extend: false },
        ),
        (
            false,
            false,
            false,
            KeyName::ArrowUp,
            KeyAction::MoveUp { extend: false },
        ),
        (
            false,
            false,
            false,
            KeyName::ArrowDown,
            KeyAction::MoveDown { extend: false },
        ),
        // shift+arrows (extend selection)
        (
            false,
            false,
            true,
            KeyName::ArrowLeft,
            KeyAction::MoveLeft { extend: true },
        ),
        (
            false,
            false,
            true,
            KeyName::ArrowRight,
            KeyAction::MoveRight { extend: true },
        ),
        (
            false,
            false,
            true,
            KeyName::ArrowUp,
            KeyAction::MoveUp { extend: true },
        ),
        (
            false,
            false,
            true,
            KeyName::ArrowDown,
            KeyAction::MoveDown { extend: true },
        ),
        // cmd+arrows (jump to boundaries)
        (
            true,
            false,
            false,
            KeyName::ArrowLeft,
            KeyAction::MoveHome { extend: false },
        ),
        (
            true,
            false,
            false,
            KeyName::ArrowRight,
            KeyAction::MoveEnd { extend: false },
        ),
        (
            true,
            false,
            false,
            KeyName::ArrowUp,
            KeyAction::MoveDocStart { extend: false },
        ),
        (
            true,
            false,
            false,
            KeyName::ArrowDown,
            KeyAction::MoveDocEnd { extend: false },
        ),
        // cmd+shift+arrows (extend to boundaries)
        (
            true,
            false,
            true,
            KeyName::ArrowLeft,
            KeyAction::MoveHome { extend: true },
        ),
        (
            true,
            false,
            true,
            KeyName::ArrowRight,
            KeyAction::MoveEnd { extend: true },
        ),
        (
            true,
            false,
            true,
            KeyName::ArrowUp,
            KeyAction::MoveDocStart { extend: true },
        ),
        (
            true,
            false,
            true,
            KeyName::ArrowDown,
            KeyAction::MoveDocEnd { extend: true },
        ),
        // word+arrows (option/ctrl)
        (
            false,
            true,
            false,
            KeyName::ArrowLeft,
            KeyAction::MoveWordLeft { extend: false },
        ),
        (
            false,
            true,
            false,
            KeyName::ArrowRight,
            KeyAction::MoveWordRight { extend: false },
        ),
        // word+shift+arrows
        (
            false,
            true,
            true,
            KeyName::ArrowLeft,
            KeyAction::MoveWordLeft { extend: true },
        ),
        (
            false,
            true,
            true,
            KeyName::ArrowRight,
            KeyAction::MoveWordRight { extend: true },
        ),
    ];
    for (cmd, word, shift, key, expected) in cases {
        let actual = KeyAction::from_key(cmd, word, shift, &key);
        assert_eq!(
            actual,
            Some(expected.clone()),
            "from_key(cmd={cmd}, word={word}, shift={shift}, {key:?}) should be {expected:?}"
        );
    }
}

#[test]
fn key_action_deletion_modifier_matrix() {
    let cases: Vec<(bool, bool, KeyName, KeyAction)> = vec![
        (false, false, KeyName::Backspace, KeyAction::Backspace),
        (false, true, KeyName::Backspace, KeyAction::BackspaceWord),
        (true, false, KeyName::Backspace, KeyAction::BackspaceLine),
        (false, false, KeyName::Delete, KeyAction::Delete),
        (false, true, KeyName::Delete, KeyAction::DeleteWord),
        (true, false, KeyName::Delete, KeyAction::DeleteLine),
    ];
    for (cmd, word, key, expected) in cases {
        let actual = KeyAction::from_key(cmd, word, false, &key);
        assert_eq!(
            actual,
            Some(expected.clone()),
            "from_key(cmd={cmd}, word={word}, {key:?}) should be {expected:?}"
        );
    }
}

#[test]
fn key_action_cmd_shortcuts_complete() {
    // Every Cmd+key shortcut the editor supports.
    let cases: Vec<(bool, KeyName, KeyAction)> = vec![
        (false, KeyName::Letter('a'), KeyAction::SelectAll),
        (false, KeyName::Letter('z'), KeyAction::Undo),
        (true, KeyName::Letter('z'), KeyAction::Redo),
        (false, KeyName::Letter('b'), KeyAction::ToggleBold),
        (false, KeyName::Letter('i'), KeyAction::ToggleItalic),
        (false, KeyName::Letter('u'), KeyAction::ToggleUnderline),
        (true, KeyName::Letter('x'), KeyAction::ToggleStrikethrough),
        (true, KeyName::Period, KeyAction::IncreaseFontSize),
        (true, KeyName::Comma, KeyAction::DecreaseFontSize),
    ];
    for (shift, key, expected) in cases {
        let actual = KeyAction::from_key(true, false, shift, &key);
        assert_eq!(
            actual,
            Some(expected.clone()),
            "from_key(cmd=true, shift={shift}, {key:?}) should be {expected:?}"
        );
    }
}

#[test]
fn key_action_character_insertion_vs_cmd_suppression() {
    // Plain character → Insert
    assert_eq!(
        KeyAction::from_key(false, false, false, &KeyName::Character("a".into())),
        Some(KeyAction::Insert("a".into()))
    );
    // Korean character → Insert
    assert_eq!(
        KeyAction::from_key(false, false, false, &KeyName::Character("\u{D55C}".into())),
        Some(KeyAction::Insert("\u{D55C}".into()))
    );
    // Cmd+character → None (don't insert when cmd held)
    assert_eq!(
        KeyAction::from_key(true, false, false, &KeyName::Character("a".into())),
        None
    );
    // Cmd+Space → None (don't insert space when cmd held, e.g. Spotlight)
    assert_eq!(
        KeyAction::from_key(true, false, false, &KeyName::Space),
        None
    );
    // Plain space → Insert
    assert_eq!(
        KeyAction::from_key(false, false, false, &KeyName::Space),
        Some(KeyAction::Insert(" ".into()))
    );
}

// ===========================================================================
// ClickTracker
// ===========================================================================

#[test]
fn click_tracker_full_sequence_and_cap() {
    let mut ct = ClickTracker::new();
    assert_eq!(ct.register(10.0, 10.0), 1);
    assert_eq!(ct.register(10.0, 10.0), 2);
    assert_eq!(ct.register(10.0, 10.0), 3);
    assert_eq!(ct.register(10.0, 10.0), 4);
    // Capped at 4 — fifth click shouldn't go to 5
    assert_eq!(ct.register(10.0, 10.0), 4);
}

#[test]
fn click_tracker_distance_breaks_sequence() {
    let mut ct = ClickTracker::new();
    assert_eq!(ct.register(10.0, 10.0), 1);
    assert_eq!(ct.register(10.0, 10.0), 2);
    // Move far away → resets
    assert_eq!(ct.register(100.0, 100.0), 1);
}

#[test]
fn click_tracker_timeout_breaks_sequence() {
    let mut ct = ClickTracker::new();
    ct.timeout = Duration::from_millis(50);
    assert_eq!(ct.register(10.0, 10.0), 1);
    thread::sleep(Duration::from_millis(60));
    // Same position but too late → resets
    assert_eq!(ct.register(10.0, 10.0), 1);
}

#[test]
fn click_tracker_reset_clears_sequence() {
    let mut ct = ClickTracker::new();
    assert_eq!(ct.register(10.0, 10.0), 1);
    assert_eq!(ct.register(10.0, 10.0), 2);
    ct.reset();
    assert_eq!(ct.register(10.0, 10.0), 1);
}

// ===========================================================================
// TextEditSession — content/state synchronization invariant
//
// The most critical integration concern: after ANY mutation through the
// session API, `content.text()` must equal `state.text`. If these diverge,
// styling runs reference wrong offsets and everything breaks.
// ===========================================================================

#[test]
fn content_stays_synced_through_editing_sequence() {
    let mut s = session("Hello World");
    assert_content_synced(&s);

    s.insert_text(" beautiful");
    assert_content_synced(&s);

    // Select "beautiful" and delete it
    s.state.anchor = Some(6);
    s.state.cursor = 15;
    s.backspace();
    assert_content_synced(&s);

    s.insert_text("cruel");
    assert_content_synced(&s);

    s.undo();
    assert_content_synced(&s);

    s.redo();
    assert_content_synced(&s);
}

#[test]
fn content_stays_synced_through_style_and_text_edits() {
    let mut s = session("abcdef");
    assert_content_synced(&s);

    // Bold a range
    s.state.anchor = Some(0);
    s.state.cursor = 3;
    s.toggle_bold();
    assert_content_synced(&s);

    // Insert in the middle of the bolded range
    s.state.cursor = 2;
    s.state.anchor = None;
    s.insert_text("X");
    assert_content_synced(&s);
    assert_eq!(s.state.text, "abXcdef");

    // Delete across the style boundary
    s.state.anchor = Some(1);
    s.state.cursor = 5;
    s.backspace();
    assert_content_synced(&s);
    assert_eq!(s.state.text, "aef");
}

#[test]
fn content_stays_synced_through_paste() {
    let mut s = session("ab");
    s.state.cursor = 1;
    let mut bold = default_style();
    bold.font_weight = 700;
    let pasted = AttributedText::new("XY", bold);
    s.paste_attributed(&pasted);
    assert_content_synced(&s);
    assert_eq!(s.state.text, "aXYb");
}

#[test]
fn content_stays_synced_through_load() {
    let mut s = session("old");
    s.load_text("new content");
    assert_content_synced(&s);
    s.load_attributed(AttributedText::new("attributed", default_style()));
    assert_content_synced(&s);
}

// ===========================================================================
// Caret style override — the "toggle bold with no selection, then type" flow
//
// This is a subtle state machine: setting bold without a selection doesn't
// mutate the document, it sets a pending override that's consumed by the
// next insert and then cleared. Testing the full lifecycle catches bugs
// where the override leaks or is lost prematurely.
// ===========================================================================

#[test]
fn caret_override_lifecycle() {
    let mut s = session("hello");
    s.state.cursor = 3; // between "hell" and "o"

    // 1. No override initially
    assert!(s.caret_style_override().is_none());

    // 2. Toggle bold → sets override
    s.toggle_bold();
    assert_eq!(s.caret_style_override().unwrap().font_weight, 700);

    // 3. Insert text → uses override, then clears it
    s.insert_text("X");
    assert_eq!(s.state.text, "helXlo");
    assert_eq!(s.content.style_at(3).font_weight, 700); // "X" is bold
    assert_eq!(s.content.style_at(0).font_weight, 400); // "h" is not
    assert_eq!(s.content.style_at(4).font_weight, 400); // "l" is not
    assert!(s.caret_style_override().is_none()); // consumed

    // 4. Set another override, then move — override is discarded
    s.toggle_italic();
    assert!(s.caret_style_override().unwrap().font_style_italic);
    s.move_left(false);
    assert!(s.caret_style_override().is_none()); // discarded by movement
}

#[test]
fn caret_override_stacks_toggles() {
    let mut s = session("abc");
    s.state.cursor = 1;

    // Toggle bold, then italic → override should have both
    s.toggle_bold();
    s.toggle_italic();
    let ov = s.caret_style_override().unwrap();
    assert_eq!(ov.font_weight, 700);
    assert!(ov.font_style_italic);

    // Insert → should get both styles
    s.insert_text("Z");
    let z_style = s.content.style_at(1);
    assert_eq!(z_style.font_weight, 700);
    assert!(z_style.font_style_italic);
}

// ===========================================================================
// Undo/redo — multi-step scenarios that verify both text AND style
//
// The session's history captures RichTextSnapshot (text + runs). These
// tests verify the full round-trip, not just text restoration.
// ===========================================================================

#[test]
fn undo_redo_preserves_styled_text_fully() {
    let mut s = session("abcdef");

    // Step 1: Bold "abc"
    s.state.anchor = Some(0);
    s.state.cursor = 3;
    s.toggle_bold();
    assert_eq!(s.content.style_at(0).font_weight, 700);
    assert_eq!(s.content.style_at(4).font_weight, 400);

    // Step 2: Italic "def"
    s.state.anchor = Some(3);
    s.state.cursor = 6;
    s.toggle_italic();
    assert!(s.content.style_at(4).font_style_italic);

    // Step 3: Insert text at the end
    s.state.anchor = None;
    s.state.cursor = 6;
    s.insert_text("gh");
    assert_eq!(s.state.text, "abcdefgh");

    // Undo insert → "abcdef", styles preserved
    assert!(s.undo());
    assert_eq!(s.state.text, "abcdef");
    assert_eq!(s.content.style_at(0).font_weight, 700);
    assert!(s.content.style_at(4).font_style_italic);
    assert_content_synced(&s);

    // Undo italic → "def" loses italic
    assert!(s.undo());
    assert!(!s.content.style_at(4).font_style_italic);
    assert_eq!(s.content.style_at(0).font_weight, 700); // bold still there
    assert_content_synced(&s);

    // Undo bold → everything default
    assert!(s.undo());
    assert_eq!(s.content.style_at(0).font_weight, 400);
    assert_content_synced(&s);

    // Redo all three
    assert!(s.redo()); // bold "abc"
    assert_eq!(s.content.style_at(0).font_weight, 700);
    assert!(s.redo()); // italic "def"
    assert!(s.content.style_at(4).font_style_italic);
    assert!(s.redo()); // insert "gh"
    assert_eq!(s.state.text, "abcdefgh");
    assert_content_synced(&s);
}

#[test]
fn undo_after_paste_restores_original() {
    let mut s = session("ab");
    s.state.cursor = 2;

    let mut bold = default_style();
    bold.font_weight = 700;
    let pasted = AttributedText::new("XY", bold);
    s.paste_attributed(&pasted);
    assert_eq!(s.state.text, "abXY");
    assert_eq!(s.content.style_at(2).font_weight, 700);

    assert!(s.undo());
    assert_eq!(s.state.text, "ab");
    assert_eq!(s.content.style_at(0).font_weight, 400);
    assert_content_synced(&s);
}

// ===========================================================================
// handle_key_action — integration tests for the dispatch layer
//
// The value here is testing the full pipeline: KeyAction → session method →
// state change → return value. Focus on the tricky parts: IME suppression,
// the return value contract, and the from_key → handle_key_action chain.
// ===========================================================================

#[test]
fn handle_key_action_full_edit_cycle() {
    let mut s = session("");

    // Type "hello"
    for ch in "hello".chars() {
        assert!(s.handle_key_action(KeyAction::Insert(ch.to_string())));
    }
    assert_eq!(s.state.text, "hello");

    // Newline
    assert!(s.handle_key_action(KeyAction::Newline));
    assert_eq!(s.state.text, "hello\n");

    // Tab
    assert!(s.handle_key_action(KeyAction::Tab));
    assert_eq!(s.state.text, "hello\n    ");

    // Select all and delete
    assert!(s.handle_key_action(KeyAction::SelectAll));
    assert!(s.handle_key_action(KeyAction::Delete));
    assert_eq!(s.state.text, "");

    // Undo twice → restore tab, then text
    assert!(s.handle_key_action(KeyAction::Undo));
    assert_eq!(s.state.text, "hello\n    ");
    assert_content_synced(&s);
}

#[test]
fn handle_key_action_ime_suppression_and_commit() {
    let mut s = session("abc");

    // Start IME composition
    assert!(s.handle_key_action(KeyAction::ImePreedit("ko".into())));
    assert_eq!(s.preedit(), Some("ko"));

    // Insert and Tab are suppressed during preedit
    assert!(!s.handle_key_action(KeyAction::Insert("x".into())));
    assert!(!s.handle_key_action(KeyAction::Tab));
    assert_eq!(s.state.text, "abc"); // unchanged

    // But movement and backspace are NOT suppressed (host IME might need them)
    assert!(s.handle_key_action(KeyAction::MoveLeft { extend: false }));
    assert!(s.handle_key_action(KeyAction::MoveRight { extend: false }));

    // Commit the composition
    assert!(s.handle_key_action(KeyAction::ImeCommit("\u{D55C}".into())));
    assert_eq!(s.state.text, "abc\u{D55C}");
    assert_content_synced(&s);
}

#[test]
fn handle_key_action_returns_false_for_noop_undo() {
    let mut s = session("abc");
    // No history → undo returns false
    assert!(!s.handle_key_action(KeyAction::Undo));
    // No future → redo returns false
    assert!(!s.handle_key_action(KeyAction::Redo));
}

#[test]
fn from_key_through_handle_key_action_end_to_end() {
    // Simulate a real host: translate a platform key, then dispatch.
    let mut s = session("Hello World");

    // Cmd+A (select all)
    let action = KeyAction::from_key(true, false, false, &KeyName::Letter('a')).unwrap();
    assert!(s.handle_key_action(action));
    assert_eq!(s.selection_range(), Some((0, 11)));

    // Backspace (delete selection)
    let action = KeyAction::from_key(false, false, false, &KeyName::Backspace).unwrap();
    assert!(s.handle_key_action(action));
    assert_eq!(s.state.text, "");
    assert_content_synced(&s);

    // Cmd+Z (undo)
    let action = KeyAction::from_key(true, false, false, &KeyName::Letter('z')).unwrap();
    assert!(s.handle_key_action(action));
    assert_eq!(s.state.text, "Hello World");
    assert_content_synced(&s);
}

// ===========================================================================
// handle_click — verifying the click_count → action mapping
// ===========================================================================

#[test]
fn handle_click_selects_correctly_by_count() {
    let mut s = session("Hello World");

    // Single click → place cursor, no selection
    s.handle_click(0.0, 0.0, 1, false);
    assert_eq!(s.state.cursor, 0);
    assert!(!s.has_selection());

    // Double click → select word (should include at least "Hello")
    s.handle_click(0.0, 0.0, 2, false);
    assert!(s.has_selection());
    let selected = s.selected_text().unwrap();
    assert!(!selected.is_empty());

    // Quad click → select all
    s.handle_click(0.0, 0.0, 4, false);
    assert_eq!(s.selection_range(), Some((0, 11)));
    assert_eq!(s.selected_text(), Some("Hello World"));
}

#[test]
fn handle_click_shift_extends_from_existing_cursor() {
    let mut s = session("abcdef");

    // Place cursor at start
    s.handle_click(0.0, 0.0, 1, false);
    assert_eq!(s.state.cursor, 0);

    // Shift-click further right → selection from 0 to new position
    s.handle_click(200.0, 0.0, 1, true);
    assert!(s.has_selection());
    let (lo, _hi) = s.selection_range().unwrap();
    assert_eq!(lo, 0);
}

// ===========================================================================
// Pointer events — drag selection
// ===========================================================================

#[test]
fn pointer_drag_creates_and_preserves_selection() {
    let mut s = session("Hello World");

    s.on_pointer_down(0.0, 0.0);
    assert!(s.is_mouse_down());

    // Drag to the right
    s.on_pointer_move(100.0, 0.0);
    assert!(s.has_selection());
    let (lo, hi) = s.selection_range().unwrap();
    assert!(hi > lo);

    // Release — selection persists
    s.on_pointer_up();
    assert!(!s.is_mouse_down());
    assert!(s.has_selection());
    assert_eq!(s.selection_range(), Some((lo, hi)));
}

#[test]
fn pointer_move_without_down_does_not_change_state() {
    let mut s = session("Hello World");
    s.state.cursor = 5;
    let cursor_before = s.state.cursor;
    s.on_pointer_move(0.0, 0.0);
    assert_eq!(s.state.cursor, cursor_before);
    assert!(!s.has_selection());
}

// ===========================================================================
// paste_attributed — style preservation across paste boundary
// ===========================================================================

#[test]
fn paste_attributed_preserves_per_run_style() {
    let mut s = session("ab");
    s.state.cursor = 2;

    let mut bold = default_style();
    bold.font_weight = 700;
    let pasted = AttributedText::new("XY", bold);
    s.paste_attributed(&pasted);

    assert_eq!(s.state.text, "abXY");
    assert_eq!(s.state.cursor, 4); // cursor at end of paste
    assert!(!s.has_selection());

    // Style boundary: "ab" normal, "XY" bold
    assert_eq!(s.content.style_at(0).font_weight, 400);
    assert_eq!(s.content.style_at(1).font_weight, 400);
    assert_eq!(s.content.style_at(2).font_weight, 700);
    assert_eq!(s.content.style_at(3).font_weight, 700);
    assert_content_synced(&s);
}

#[test]
fn paste_attributed_replaces_selection_and_is_undoable() {
    let mut s = session("Hello World");
    s.state.anchor = Some(6);
    s.state.cursor = 11;

    let pasted = AttributedText::new("Rust", default_style());
    s.paste_attributed(&pasted);
    assert_eq!(s.state.text, "Hello Rust");
    assert_content_synced(&s);

    assert!(s.undo());
    assert_eq!(s.state.text, "Hello World");
    assert_content_synced(&s);
}

#[test]
fn paste_attributed_empty_is_noop() {
    let mut s = session("abc");
    let text_before = s.state.text.clone();
    let cursor_before = s.state.cursor;
    s.paste_attributed(&AttributedText::empty(default_style()));
    assert_eq!(s.state.text, text_before);
    assert_eq!(s.state.cursor, cursor_before);
}

// ===========================================================================
// IME lifecycle — the preedit state machine
// ===========================================================================

#[test]
fn ime_preedit_commit_cycle() {
    let mut s = session("abc");

    // 1. No preedit initially
    assert_eq!(s.preedit(), None);

    // 2. Start composition
    s.update_preedit("ko".into());
    assert_eq!(s.preedit(), Some("ko"));

    // 3. Composition update (hangul → combined jamo)
    s.update_preedit("\u{D55C}".into());
    assert_eq!(s.preedit(), Some("\u{D55C}"));

    // 4. Commit — preedit is NOT automatically cleared (host does that)
    //    But the text IS committed
    s.handle_key_action(KeyAction::ImeCommit("\u{D55C}".into()));
    assert_eq!(s.state.text, "abc\u{D55C}");
    assert_content_synced(&s);
}

#[test]
fn ime_cancel_clears_preedit() {
    let mut s = session("abc");
    s.update_preedit("ko".into());
    s.cancel_preedit();
    assert_eq!(s.preedit(), None);
    // Text should be unchanged — preedit never commits
    assert_eq!(s.state.text, "abc");
}

#[test]
fn drain_empty_preedit_only_clears_empty() {
    let mut s = session("abc");

    // Empty preedit sentinel (sent by some IME systems after commit)
    s.update_preedit(String::new());
    assert_eq!(s.preedit(), Some(""));
    s.drain_empty_preedit();
    assert_eq!(s.preedit(), None);

    // Non-empty preedit survives drain
    s.update_preedit("ko".into());
    s.drain_empty_preedit();
    assert_eq!(s.preedit(), Some("ko"));
}

// ===========================================================================
// IME caret positioning — preedit-aware caret_rect
// ===========================================================================

#[test]
fn preedit_caret_advances_past_composed_text() {
    let mut s = session("abc");
    // Cursor at end → offset 3
    assert_eq!(s.state.cursor, 3);
    let cr_before = s.caret_rect();

    // Simulate Korean IME: preedit "한" (3 UTF-8 bytes)
    s.update_preedit("\u{D55C}".into());
    let cr_preedit = s.caret_rect();

    // Caret must advance past the preedit text.
    assert!(
        cr_preedit.x > cr_before.x,
        "caret should advance past preedit: before.x={}, preedit.x={}",
        cr_before.x,
        cr_preedit.x,
    );

    // Same line — y should not change.
    assert_eq!(cr_preedit.y, cr_before.y);
}

#[test]
fn preedit_caret_mid_text() {
    let mut s = session("abcd");
    // Place cursor between 'b' and 'c' → offset 2
    s.state.cursor = 2;
    let cr_before = s.caret_rect();

    // Preedit inserted at cursor position
    s.update_preedit("XY".into());
    let cr_preedit = s.caret_rect();

    // Caret should be further right (past the preedit).
    assert!(
        cr_preedit.x > cr_before.x,
        "mid-text preedit caret should advance: before.x={}, preedit.x={}",
        cr_before.x,
        cr_preedit.x,
    );
}

#[test]
fn preedit_cancel_restores_caret() {
    let mut s = session("abc");
    let cr_before = s.caret_rect();

    s.update_preedit("XY".into());
    let cr_preedit = s.caret_rect();
    assert!(cr_preedit.x > cr_before.x);

    // Cancel preedit → caret returns to the committed cursor position.
    s.cancel_preedit();
    let cr_after = s.caret_rect();
    assert_eq!(cr_after.x, cr_before.x);
    assert_eq!(cr_after.y, cr_before.y);
}

#[test]
fn preedit_caret_cache_invalidated_on_update() {
    let mut s = session("abc");
    let _cr1 = s.caret_rect(); // populate cache

    s.update_preedit("X".into());
    let cr2 = s.caret_rect();

    // Update preedit with longer text → cache must be invalidated.
    s.update_preedit("XYZ".into());
    let cr3 = s.caret_rect();
    assert!(
        cr3.x > cr2.x,
        "caret should advance with longer preedit: cr2.x={}, cr3.x={}",
        cr2.x,
        cr3.x,
    );
}

// ===========================================================================
// Scroll management
// ===========================================================================

#[test]
fn scroll_clamps_to_valid_range() {
    let mut s = session("Hello");
    s.set_layout_height(300.0);

    // Scroll negative → clamped to 0
    s.scroll_by(-100.0);
    assert_eq!(s.scroll_y(), 0.0);

    // Scroll way past content → clamped to max
    s.scroll_by(10000.0);
    assert_eq!(s.scroll_y(), s.max_scroll_y());
}

#[test]
fn scroll_set_and_clamp() {
    let text = (0..50)
        .map(|i| format!("Line {i}"))
        .collect::<Vec<_>>()
        .join("\n");
    let mut s = session(&text);
    s.set_layout_height(50.0); // tiny viewport

    s.set_scroll_y(10.0);
    assert!(s.scroll_y() >= 0.0);
    assert!(s.scroll_y() <= s.max_scroll_y());

    s.set_scroll_y(-5.0);
    assert_eq!(s.scroll_y(), 0.0);
}

// ===========================================================================
// Caret rect caching
// ===========================================================================

#[test]
fn caret_rect_cache_invalidated_by_edits() {
    let mut s = session("Hello");
    s.state.cursor = 0;

    let cr1 = s.caret_rect();
    // Same cursor position → cache hit
    let cr2 = s.caret_rect();
    assert_eq!(cr1, cr2);

    // Edit invalidates cache → different result
    s.insert_text("X");
    let cr3 = s.caret_rect();
    // Cursor moved from 0 to 1, so x must differ
    assert_ne!(cr1.x, cr3.x);
}

// ===========================================================================
// Content loading
// ===========================================================================

#[test]
fn load_text_resets_all_state() {
    let mut s = session("old text");

    // Build up some state
    s.state.anchor = Some(0);
    s.state.cursor = 4;
    s.toggle_bold();
    s.scroll_by(10.0);

    // Load new content → everything resets
    s.load_text("new text");
    assert_eq!(s.state.text, "new text");
    assert_eq!(s.state.cursor, 0);
    assert!(!s.has_selection());
    assert_eq!(s.scroll_y(), 0.0);
    assert_content_synced(&s);
}

#[test]
fn load_attributed_preserves_style() {
    let mut s = session("old");
    let mut bold = default_style();
    bold.font_weight = 700;
    s.load_attributed(AttributedText::new("bold text", bold));

    assert_eq!(s.state.text, "bold text");
    assert_eq!(s.content.style_at(0).font_weight, 700);
    assert_eq!(s.state.cursor, 0);
    assert_content_synced(&s);
}

// ===========================================================================
// Style toggles — selection vs caret override, and toggle-off
// ===========================================================================

#[test]
fn toggle_bold_on_selection_does_not_affect_outside() {
    let mut s = session("Hello World");
    s.state.anchor = Some(0);
    s.state.cursor = 5;
    s.toggle_bold();

    assert_eq!(s.content.style_at(0).font_weight, 700);
    assert_eq!(s.content.style_at(2).font_weight, 700);
    assert_eq!(s.content.style_at(6).font_weight, 400); // outside selection
}

#[test]
fn toggle_bold_twice_is_round_trip() {
    let mut s = session("Hello");
    s.state.anchor = Some(0);
    s.state.cursor = 5;

    s.toggle_bold();
    assert_eq!(s.content.style_at(0).font_weight, 700);
    s.toggle_bold();
    assert_eq!(s.content.style_at(0).font_weight, 400);
    assert_content_synced(&s);
}

#[test]
fn multiple_style_toggles_independent() {
    let mut s = session("Hello");
    s.state.anchor = Some(0);
    s.state.cursor = 5;

    s.toggle_bold();
    s.toggle_italic();
    s.toggle_underline();

    let style = s.content.style_at(0);
    assert_eq!(style.font_weight, 700);
    assert!(style.font_style_italic);
    assert_eq!(style.text_decoration_line, TextDecorationLine::Underline);
}

#[test]
fn adjust_font_size_clamps_to_minimum() {
    let mut s = session("Hello");
    s.state.anchor = Some(0);
    s.state.cursor = 5;
    s.adjust_font_size(-1000.0); // huge negative delta
    assert_eq!(s.content.style_at(0).font_size, 1.0); // clamped to 1.0
}

#[test]
fn set_color_on_selection() {
    let mut s = session("Hello");
    s.state.anchor = Some(0);
    s.state.cursor = 5;
    s.set_color(CGColor::RED);

    let c = s
        .content
        .style_at(0)
        .fills
        .iter()
        .find_map(|p| p.solid_color())
        .unwrap();
    assert_eq!(c, CGColor::RED);
}

// ===========================================================================
// Layout resize — doesn't panic, caret remains valid
// ===========================================================================

#[test]
fn layout_resize_keeps_caret_valid() {
    let mut s = session("Hello World this is a long line of text that may wrap");
    let _cr_before = s.caret_rect();

    s.set_layout_width(50.0); // very narrow → text wraps
    let cr_after = s.caret_rect();
    assert!(cr_after.height > 0.0);

    // Widen again
    s.set_layout_width(800.0);
    let cr_wide = s.caret_rect();
    assert!(cr_wide.height > 0.0);
    assert_content_synced(&s);
}

// ===========================================================================
// Scroll anchoring — first visible line stays pinned across width reflow
// ===========================================================================

#[test]
fn scroll_anchor_pinned_on_width_increase() {
    // Build a long document that wraps heavily at narrow width.
    let text = (0..100)
        .map(|i| format!("Line {i} with some words"))
        .collect::<Vec<_>>()
        .join("\n");
    let mut s = session(&text);
    s.set_layout_width(100.0); // narrow → heavy wrapping
    s.set_layout_height(50.0); // small viewport

    // Scroll to the middle of the document.
    let mid_scroll = s.max_scroll_y() / 2.0;
    s.set_scroll_y(mid_scroll);
    assert!(s.scroll_y() > 0.0);

    // Record which byte offset is at the top of the viewport.
    let metrics_before = s.layout.line_metrics(&s.state.text);
    let anchor_line_before = metrics_before
        .iter()
        .find(|lm| lm.bottom() > s.scroll_y())
        .unwrap();
    let anchor_byte = anchor_line_before.start_index;

    // Widen the editor — wrapping decreases, content height shrinks.
    s.set_layout_width(400.0);

    // The anchor byte offset should still be visible near the top.
    let metrics_after = s.layout.line_metrics(&s.state.text);
    let anchor_line_after = metrics_after
        .iter()
        .find(|lm| lm.start_index <= anchor_byte && anchor_byte < lm.end_index)
        .unwrap();

    // The anchor line's top should be at or just above scroll_y (within one
    // line height tolerance, since sub-line fraction is preserved).
    let drift = (s.scroll_y() - anchor_line_after.top()).abs();
    let tolerance = anchor_line_after.bottom() - anchor_line_after.top();
    assert!(
        drift <= tolerance,
        "anchor line drifted {drift:.1}px from viewport top (tolerance {tolerance:.1}px)"
    );
}

#[test]
fn scroll_anchor_pinned_on_width_decrease() {
    let text = (0..100)
        .map(|i| format!("Line {i} with some words"))
        .collect::<Vec<_>>()
        .join("\n");
    let mut s = session(&text);
    s.set_layout_width(400.0); // wide
    s.set_layout_height(50.0);

    let mid_scroll = s.max_scroll_y() / 2.0;
    s.set_scroll_y(mid_scroll);

    let metrics_before = s.layout.line_metrics(&s.state.text);
    let anchor_line_before = metrics_before
        .iter()
        .find(|lm| lm.bottom() > s.scroll_y())
        .unwrap();
    let anchor_byte = anchor_line_before.start_index;

    // Narrow the editor — wrapping increases, content height grows.
    s.set_layout_width(100.0);

    let metrics_after = s.layout.line_metrics(&s.state.text);
    let anchor_line_after = metrics_after
        .iter()
        .find(|lm| lm.start_index <= anchor_byte && anchor_byte < lm.end_index)
        .unwrap();

    let drift = (s.scroll_y() - anchor_line_after.top()).abs();
    let tolerance = anchor_line_after.bottom() - anchor_line_after.top();
    assert!(
        drift <= tolerance,
        "anchor line drifted {drift:.1}px from viewport top (tolerance {tolerance:.1}px)"
    );
}

#[test]
fn scroll_anchor_at_top_stays_at_top() {
    let text = (0..50)
        .map(|i| format!("Line {i}"))
        .collect::<Vec<_>>()
        .join("\n");
    let mut s = session(&text);
    s.set_layout_width(100.0);
    s.set_layout_height(50.0);

    // scroll_y = 0 — should stay at 0 after any width change.
    assert_eq!(s.scroll_y(), 0.0);
    s.set_layout_width(400.0);
    assert_eq!(s.scroll_y(), 0.0);
    s.set_layout_width(50.0);
    assert_eq!(s.scroll_y(), 0.0);
}

#[test]
fn scroll_clamps_after_width_increase_reduces_content() {
    // Regression: widening can reduce wrapped line count enough that the old
    // scroll_y exceeds the new max_scroll_y.
    let text = (0..50)
        .map(|i| format!("Line {i} with enough words to wrap at narrow widths"))
        .collect::<Vec<_>>()
        .join("\n");
    let mut s = session(&text);
    s.set_layout_width(80.0); // narrow → lots of wrapping
    s.set_layout_height(100.0);

    // Scroll to the very bottom.
    let max = s.max_scroll_y();
    s.set_scroll_y(max);
    assert!((s.scroll_y() - max).abs() < 1.0);

    // Widen drastically — content becomes much shorter.
    s.set_layout_width(2000.0);
    assert!(s.scroll_y() <= s.max_scroll_y());
    assert!(s.scroll_y() >= 0.0);
}
