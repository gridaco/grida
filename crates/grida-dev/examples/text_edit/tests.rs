//! Deterministic editing-logic tests.
//!
//! All tests use `SimpleLayoutEngine` — no Skia, no winit.  The layout is
//! monospace / no-wrap, so every assertion is exact.

use super::{apply_command, layout::TextLayoutEngine, snap_grapheme_boundary, word_segment_at, EditHistory, EditKind, EditingCommand, SimpleLayoutEngine, TextEditorState};

fn layout() -> SimpleLayoutEngine {
    SimpleLayoutEngine::default_test()
}

/// Shorthand: apply one command and return the new state.
fn apply(state: &TextEditorState, cmd: EditingCommand) -> TextEditorState {
    apply_command(state, cmd, &mut layout())
}

// ---------------------------------------------------------------------------
// Text insertion / deletion
// ---------------------------------------------------------------------------

#[test]
fn insert_at_end() {
    let s = TextEditorState::new("Hello");
    let s = apply(&s, EditingCommand::Insert(" World".into()));
    assert_eq!(s.text, "Hello World");
    assert_eq!(s.cursor, 11);
}

#[test]
fn insert_replaces_selection() {
    let mut s = TextEditorState::new("Hello World");
    s.cursor = 6;
    s.anchor = Some(11);
    let s = apply(&s, EditingCommand::Insert("Rust".into()));
    assert_eq!(s.text, "Hello Rust");
    assert_eq!(s.cursor, 10);
    assert!(!s.has_selection());
}

#[test]
fn insert_normalizes_crlf() {
    let s = TextEditorState::new("");
    let s = apply(&s, EditingCommand::Insert("a\r\nb".into()));
    assert_eq!(s.text, "a\nb");
}

#[test]
fn backspace_grapheme() {
    let s = TextEditorState::with_cursor("Hello", 5);
    let s = apply(&s, EditingCommand::Backspace);
    assert_eq!(s.text, "Hell");
    assert_eq!(s.cursor, 4);
}

#[test]
fn backspace_emoji_cluster() {
    // 👍🏽 is a 2-codepoint ZWJ sequence (8 UTF-8 bytes).
    let s = TextEditorState::with_cursor("a👍🏽b", 9); // after 👍🏽
    let s = apply(&s, EditingCommand::Backspace);
    assert_eq!(s.text, "ab");
    assert_eq!(s.cursor, 1);
}

#[test]
fn backspace_deletes_selection() {
    let mut s = TextEditorState::new("Hello World");
    s.cursor = 11;
    s.anchor = Some(6);
    let s = apply(&s, EditingCommand::Backspace);
    assert_eq!(s.text, "Hello ");
    assert_eq!(s.cursor, 6);
}

#[test]
fn delete_grapheme() {
    let s = TextEditorState::with_cursor("Hello", 0);
    let s = apply(&s, EditingCommand::Delete);
    assert_eq!(s.text, "ello");
    assert_eq!(s.cursor, 0);
}

// ---------------------------------------------------------------------------
// Cursor: left / right
// ---------------------------------------------------------------------------

#[test]
fn move_left_collapses_selection_to_lo() {
    let mut s = TextEditorState::new("Hello");
    s.cursor = 5;
    s.anchor = Some(2);
    // selection [2,5); MoveLeft without extend → collapse to lo
    let s = apply(&s, EditingCommand::MoveLeft { extend: false });
    assert_eq!(s.cursor, 2);
    assert!(!s.has_selection());
}

#[test]
fn move_right_collapses_selection_to_hi() {
    let mut s = TextEditorState::new("Hello");
    s.cursor = 2;
    s.anchor = Some(5);
    let s = apply(&s, EditingCommand::MoveRight { extend: false });
    assert_eq!(s.cursor, 5);
    assert!(!s.has_selection());
}

#[test]
fn move_left_extends_selection() {
    let s = TextEditorState::with_cursor("Hello", 3);
    let s = apply(&s, EditingCommand::MoveLeft { extend: true });
    assert_eq!(s.cursor, 2);
    assert_eq!(s.anchor, Some(3));
}

// ---------------------------------------------------------------------------
// Cursor: home / end
// ---------------------------------------------------------------------------

#[test]
fn move_home_goes_to_line_start() {
    // "Hello\nWorld", cursor at 8 (middle of "World")
    let s = TextEditorState::with_cursor("Hello\nWorld", 8);
    let s = apply(&s, EditingCommand::MoveHome { extend: false });
    assert_eq!(s.cursor, 6); // start of "World"
}

#[test]
fn move_end_goes_before_newline() {
    // "Hello\nWorld", cursor at 0
    let s = TextEditorState::with_cursor("Hello\nWorld", 0);
    let s = apply(&s, EditingCommand::MoveEnd { extend: false });
    // end of "Hello" line is before the \n at index 5
    assert_eq!(s.cursor, 5);
}

// ---------------------------------------------------------------------------
// Cursor: up / down (line navigation)
// ---------------------------------------------------------------------------

#[test]
fn move_down_to_nonempty_line() {
    // "Hello\nWorld", cursor at 0 (start of "Hello")
    let s = TextEditorState::with_cursor("Hello\nWorld", 0);
    let s = apply(&s, EditingCommand::MoveDown { extend: false });
    // x=0, target line = "World" (start=6), position_at_point(x=0, line1_y) → offset 6
    assert_eq!(s.cursor, 6);
}

#[test]
fn move_down_over_empty_line() {
    // "Hello\n\nWorld", cursor at 5 (end of "Hello", before first \n)
    let s = TextEditorState::with_cursor("Hello\n\nWorld", 5);
    let s = apply(&s, EditingCommand::MoveDown { extend: false });
    // line 1 is empty ("\n" at index 6); SimpleLayoutEngine returns start_index = 6
    assert_eq!(s.cursor, 6, "cursor should land on empty line (index 6)");
}

#[test]
fn move_down_from_empty_line() {
    // "Hello\n\nWorld", cursor at 6 (on the empty line)
    let s = TextEditorState::with_cursor("Hello\n\nWorld", 6);
    let s = apply(&s, EditingCommand::MoveDown { extend: false });
    // line 2 is "World" (start=7); cursor should land at start
    assert_eq!(s.cursor, 7, "cursor should move to start of 'World'");
}

#[test]
fn move_up_over_empty_line() {
    // "Hello\n\nWorld", cursor at 7 (start of "World")
    let s = TextEditorState::with_cursor("Hello\n\nWorld", 7);
    let s = apply(&s, EditingCommand::MoveUp { extend: false });
    // target line = empty line 1 (start=6)
    assert_eq!(s.cursor, 6, "cursor should land on empty line");
}

#[test]
fn move_up_from_first_line_goes_to_zero() {
    let s = TextEditorState::with_cursor("Hello\nWorld", 2);
    let s = apply(&s, EditingCommand::MoveUp { extend: false });
    assert_eq!(s.cursor, 0);
}

#[test]
fn move_down_from_last_line_goes_to_end() {
    let s = TextEditorState::with_cursor("Hello\nWorld", 8);
    let s = apply(&s, EditingCommand::MoveDown { extend: false });
    assert_eq!(s.cursor, 11); // text.len()
}

// ---------------------------------------------------------------------------
// Cursor: word navigation
// ---------------------------------------------------------------------------

#[test]
fn move_word_right() {
    let s = TextEditorState::with_cursor("hello world", 0);
    let s = apply(&s, EditingCommand::MoveWordRight { extend: false });
    // UAX#29: "hello" ends at 5
    assert_eq!(s.cursor, 5);
}

#[test]
fn move_word_left() {
    let s = TextEditorState::with_cursor("hello world", 11);
    let s = apply(&s, EditingCommand::MoveWordLeft { extend: false });
    // "world" starts at 6
    assert_eq!(s.cursor, 6);
}

// ---------------------------------------------------------------------------
// Select all
// ---------------------------------------------------------------------------

#[test]
fn select_all() {
    let s = TextEditorState::with_cursor("Hello", 2);
    let s = apply(&s, EditingCommand::SelectAll);
    assert_eq!(s.anchor, Some(0));
    assert_eq!(s.cursor, 5);
}

// ---------------------------------------------------------------------------
// Point-based selection
// ---------------------------------------------------------------------------

#[test]
fn move_to_point() {
    // SimpleLayoutEngine: line_height=24, char_width=10
    // "Hello\nWorld": line 0 y=0..24, line 1 y=24..48
    // (x=30, y=30) → line 1, column 3 → offset = 6 + 3 = 9 ("l" in "World")
    let s = TextEditorState::with_cursor("Hello\nWorld", 0);
    let s = apply(&s, EditingCommand::MoveTo { x: 30.0, y: 30.0 });
    assert_eq!(s.cursor, 9);
    assert!(!s.has_selection());
}

#[test]
fn select_word_at() {
    // "Hello World", click at x=65 (column 6 = 'W' in "World")
    let s = TextEditorState::with_cursor("Hello World", 0);
    let s = apply(&s, EditingCommand::SelectWordAt { x: 65.0, y: 0.0 });
    // "World" runs from 6 to 11
    assert_eq!(s.anchor, Some(6));
    assert_eq!(s.cursor, 11);
}

#[test]
fn select_line_at() {
    // "Hello\nWorld", click on line 1
    let s = TextEditorState::with_cursor("Hello\nWorld", 0);
    let s = apply(&s, EditingCommand::SelectLineAt { x: 0.0, y: 30.0 });
    assert_eq!(s.anchor, Some(6));
    assert_eq!(s.cursor, 11);
}

// ---------------------------------------------------------------------------
// Extend-to
// ---------------------------------------------------------------------------

#[test]
fn extend_to_sets_anchor_on_first_use() {
    let s = TextEditorState::with_cursor("Hello", 2);
    // ExtendTo from cursor=2 to click position at x=40 (col 4 = "o")
    let s = apply(&s, EditingCommand::ExtendTo { x: 40.0, y: 0.0 });
    assert_eq!(s.anchor, Some(2), "anchor should be the original cursor");
    assert_eq!(s.cursor, 4);
}

// ---------------------------------------------------------------------------
// snap_grapheme_boundary (the function SkiaLayoutEngine must use)
// ---------------------------------------------------------------------------

#[test]
fn snap_stays_at_valid_boundary() {
    // ASCII: every byte offset that is a char start should be returned as-is.
    let t = "Hello\n\nWorld";
    assert_eq!(snap_grapheme_boundary(t, 0), 0);
    assert_eq!(snap_grapheme_boundary(t, 5), 5,  "start of first \\n");
    assert_eq!(snap_grapheme_boundary(t, 6), 6,  "start of second \\n");
    assert_eq!(snap_grapheme_boundary(t, 7), 7,  "start of 'W' — this is what SkiaLayoutEngine returns");
    assert_eq!(snap_grapheme_boundary(t, 12), 12, "text.len()");
}

#[test]
fn snap_mid_cluster_snaps_to_start() {
    // 👋 is a 4-byte grapheme cluster.  Middle bytes should snap to 0.
    let t = "\u{1F44B}!"; // "👋!"
    assert_eq!(snap_grapheme_boundary(t, 0), 0);
    assert_eq!(snap_grapheme_boundary(t, 1), 0, "mid-cluster → snap to 0");
    assert_eq!(snap_grapheme_boundary(t, 2), 0, "mid-cluster → snap to 0");
    assert_eq!(snap_grapheme_boundary(t, 3), 0, "mid-cluster → snap to 0");
    assert_eq!(snap_grapheme_boundary(t, 4), 4, "'!' starts at 4");
}

// ---------------------------------------------------------------------------
// Loop: move_down walks through all lines without getting stuck
// ---------------------------------------------------------------------------

/// Walk the cursor down through every line of `text` one step at a time.
/// Returns the sequence of (line_index, cursor_offset) at each step.
fn walk_down(text: &str) -> Vec<(usize, usize)> {
    let mut lay = SimpleLayoutEngine::default_test();
    let mut s = TextEditorState::with_cursor(text, 0);
    let mut path: Vec<(usize, usize)> = Vec::new();
    let max_steps = text.lines().count() + 10; // generous upper bound

    for _ in 0..max_steps {
        let metrics = lay.line_metrics(text);
        let line = metrics.iter().position(|lm| {
            lm.start_index <= s.cursor && s.cursor < lm.end_index
        }).unwrap_or(metrics.len() - 1);
        path.push((line, s.cursor));

        if s.cursor >= text.len() {
            break;
        }
        let before = s.cursor;
        s = apply_command(&s, EditingCommand::MoveDown { extend: false }, &mut lay);
        if s.cursor == before {
            // Cursor did not advance — record the stuck position and bail.
            path.push((line, s.cursor));
            break;
        }
    }
    path
}

#[test]
fn move_down_never_locks_simple() {
    let text = "Line0\n\nLine2\n\nLine4";
    let path = walk_down(text);

    // Verify every cursor in the path is strictly increasing (or at text.len()).
    let cursors: Vec<usize> = path.iter().map(|(_, c)| *c).collect();
    for w in cursors.windows(2) {
        assert!(
            w[1] >= w[0],
            "cursor went backwards: {} → {}",
            w[0], w[1]
        );
    }
    // Must eventually reach the last line.
    let last_cursor = cursors.last().copied().unwrap_or(0);
    assert!(
        last_cursor >= text.len() - "Line4".len(),
        "cursor never reached last line, stuck at {}",
        last_cursor
    );
}

#[test]
fn move_down_reaches_end_of_document() {
    // Mirrors the wd_text_editor initial text structure: content, empty lines, more content.
    let text = concat!(
        "Hello, World!\n",
        "Type here to edit text.\n",
        "\n",
        "=== Controls ===\n",
        "\n",
        "Latin text: The quick brown fox jumps over 13 lazy dogs.\n",
        "\n",
        "[Hangul]\n",
        "Korean: \u{C548}\u{B155}\u{D558}\u{C138}\u{C694}\n",
        "\n",
        "[Emoji]\n",
        "emoji: \u{1F600} \u{1F601}\n",
    );

    let line_count = text.matches('\n').count();
    let mut lay = SimpleLayoutEngine::default_test();
    let mut s = TextEditorState::with_cursor(text, 0);

    for step in 0..=(line_count + 2) {
        if s.cursor >= text.len() {
            break;
        }
        let before = s.cursor;
        s = apply_command(&s, EditingCommand::MoveDown { extend: false }, &mut lay);
        assert!(
            s.cursor > before || s.cursor == text.len(),
            "cursor locked at offset {} on step {}",
            before,
            step
        );
    }

    assert_eq!(
        s.cursor, text.len(),
        "cursor should reach end of document"
    );
}

#[test]
fn move_down_consecutive_empty_lines() {
    // Three consecutive empty lines followed by content.
    let text = "A\n\n\n\nB";
    //          A  \n \n \n \n B
    // bytes:   0   1  2  3  4  5
    let path = walk_down(text);
    let cursors: Vec<usize> = path.iter().map(|(_, c)| *c).collect();

    // Every step must advance.
    for w in cursors.windows(2) {
        assert!(w[1] > w[0], "stuck: {} → {}", w[0], w[1]);
    }
    // Last cursor is either at 'B' (5) or past it (text.len()=6 after final down).
    assert!(*cursors.last().unwrap() >= 5, "should reach last line");
}

// ---------------------------------------------------------------------------
// Loop: move_left / move_right walk through text without getting stuck
//
// Left/right movement operates in logical (Unicode) order regardless of
// visual direction.  RTL scripts like Arabic and Hebrew are therefore
// tested with the same traversal invariants as LTR text:
//   - move_right from 0 → text.len() must visit every grapheme boundary
//     exactly once, and the cursor must strictly increase at every step.
//   - move_left from text.len() → 0 is the mirror image.
// ---------------------------------------------------------------------------

/// Collect every grapheme-cluster start offset in `text` in order.
fn grapheme_starts(text: &str) -> Vec<usize> {
    use unicode_segmentation::UnicodeSegmentation;
    text.grapheme_indices(true).map(|(i, _)| i).collect()
}

/// Walk cursor right through `text` one grapheme at a time starting from
/// offset 0.  Returns the list of cursor positions after each MoveRight.
fn walk_right(text: &str) -> Vec<usize> {
    let mut s = TextEditorState::with_cursor(text, 0);
    let mut positions = vec![0];
    let max_steps = text.chars().count() + 5;
    for _ in 0..max_steps {
        if s.cursor >= text.len() {
            break;
        }
        s = apply(&s, EditingCommand::MoveRight { extend: false });
        positions.push(s.cursor);
    }
    positions
}

/// Walk cursor left through `text` one grapheme at a time starting from
/// `text.len()`.  Returns the list of cursor positions after each MoveLeft.
fn walk_left(text: &str) -> Vec<usize> {
    let mut s = TextEditorState::new(text); // cursor = text.len()
    let mut positions = vec![text.len()];
    let max_steps = text.chars().count() + 5;
    for _ in 0..max_steps {
        if s.cursor == 0 {
            break;
        }
        s = apply(&s, EditingCommand::MoveLeft { extend: false });
        positions.push(s.cursor);
    }
    positions
}

// --- ASCII / Latin -----------------------------------------------------------

#[test]
fn move_right_visits_every_ascii_grapheme() {
    let text = "Hello!";
    let positions = walk_right(text);
    assert_eq!(positions, vec![0, 1, 2, 3, 4, 5, 6]);
}

#[test]
fn move_left_visits_every_ascii_grapheme() {
    let text = "Hello!";
    let positions = walk_left(text);
    assert_eq!(positions, vec![6, 5, 4, 3, 2, 1, 0]);
}

// --- Emoji / multi-byte grapheme clusters -----------------------------------

#[test]
fn move_right_through_emoji_clusters() {
    // ZWJ family: 👨‍👩‍👧‍👦 is one grapheme cluster (25 bytes).
    // 😀 is a single grapheme (4 bytes).
    let text = "A\u{1F600}B"; // "A😀B"  — 1 + 4 + 1 = 6 bytes
    let positions = walk_right(text);
    assert_eq!(positions, vec![0, 1, 5, 6],
        "should step over the 4-byte emoji in one move");
}

#[test]
fn move_right_through_skin_tone_emoji() {
    // 👍🏽 = U+1F44D + U+1F3FD (thumbs up + medium skin tone modifier) = 8 bytes, 1 grapheme.
    let text = "\u{1F44D}\u{1F3FD}!"; // 8 + 1 = 9 bytes
    let positions = walk_right(text);
    assert_eq!(positions, vec![0, 8, 9]);
}

#[test]
fn move_left_through_emoji_clusters() {
    let text = "A\u{1F600}B"; // A😀B, 6 bytes
    let positions = walk_left(text);
    assert_eq!(positions, vec![6, 5, 1, 0],
        "should step back over the 4-byte emoji in one move");
}

// --- Arabic (RTL) -----------------------------------------------------------
//
// Logical-order movement: move_right advances toward higher byte offsets
// regardless of visual direction.  Arabic characters are 2 bytes each in
// UTF-8 (U+0600–U+06FF range, which encodes as 2-byte sequences).

#[test]
fn move_right_through_arabic_never_locks() {
    // From wd_text_editor default text, Arabic-only portion (logical characters):
    // "مرحبا" = م(2) ر(2) ح(2) ب(2) ا(2) = 10 bytes, 5 graphemes
    let text = "\u{0645}\u{0631}\u{062D}\u{0628}\u{0627}"; // مرحبا
    let positions = walk_right(text);
    let starts = grapheme_starts(text);

    // Every grapheme boundary is visited in ascending order.
    assert_eq!(&positions[..starts.len()], starts.as_slice(),
        "move_right should visit all {} Arabic grapheme starts", starts.len());
    assert_eq!(*positions.last().unwrap(), text.len());
}

#[test]
fn move_left_through_arabic_never_locks() {
    let text = "\u{0645}\u{0631}\u{062D}\u{0628}\u{0627}"; // مرحبا (10 bytes)
    let positions = walk_left(text);

    // Must start at text.len() and strictly decrease to 0.
    assert_eq!(positions[0], text.len());
    for w in positions.windows(2) {
        assert!(w[1] < w[0], "cursor did not retreat: {} → {}", w[0], w[1]);
    }
    assert_eq!(*positions.last().unwrap(), 0);
}

#[test]
fn move_right_arabic_with_latin_mix() {
    // "ABC العربية 123" — from wd_text_editor default text
    // This exercises the bidi-mixed case at a logical-order level.
    let text = "ABC \u{0627}\u{0644}\u{0639}\u{0631}\u{0628}\u{064A}\u{0629} 123";
    let starts = grapheme_starts(text);
    let positions = walk_right(text);

    // Every grapheme boundary should be visited exactly, in order.
    for (i, &expected) in starts.iter().enumerate() {
        assert_eq!(
            positions[i], expected,
            "step {} should be at byte {} (grapheme start), got {}",
            i, expected, positions[i]
        );
    }
    assert_eq!(*positions.last().unwrap(), text.len());
}

// --- Hebrew (RTL) -----------------------------------------------------------

#[test]
fn move_right_through_hebrew_never_locks() {
    // "שלום" = שׁ(2) ל(2) ו(2) ם(2) = 8 bytes, 4 graphemes
    let text = "\u{05E9}\u{05DC}\u{05D5}\u{05DD}"; // שלום
    let positions = walk_right(text);
    let starts = grapheme_starts(text);

    assert_eq!(&positions[..starts.len()], starts.as_slice());
    assert_eq!(*positions.last().unwrap(), text.len());
}

#[test]
fn move_left_through_hebrew_never_locks() {
    let text = "\u{05E9}\u{05DC}\u{05D5}\u{05DD}"; // שלום (8 bytes)
    let positions = walk_left(text);

    assert_eq!(positions[0], text.len());
    for w in positions.windows(2) {
        assert!(w[1] < w[0], "cursor did not retreat: {} → {}", w[0], w[1]);
    }
    assert_eq!(*positions.last().unwrap(), 0);
}

// --- Hangul / Korean --------------------------------------------------------
// Precomposed Hangul syllables are 3 bytes each (U+AC00–U+D7A3).

#[test]
fn move_right_through_korean_precomposed() {
    // "안녕" = 안(3) 녕(3) = 6 bytes, 2 graphemes
    let text = "\u{C548}\u{B155}"; // 안녕
    let positions = walk_right(text);
    assert_eq!(positions, vec![0, 3, 6]);
}

#[test]
fn move_left_through_korean_precomposed() {
    let text = "\u{C548}\u{B155}"; // 안녕 (6 bytes)
    let positions = walk_left(text);
    assert_eq!(positions, vec![6, 3, 0]);
}

#[test]
fn move_right_korean_and_latin_mix() {
    // "ABC가나다123" — from wd_text_editor default text
    // Hangul syllables are 3-byte grapheme clusters.
    let text = "ABC\u{AC00}\u{B098}\u{B2E4}123";
    let starts = grapheme_starts(text);
    let positions = walk_right(text);

    for (i, &expected) in starts.iter().enumerate() {
        assert_eq!(positions[i], expected,
            "step {}: expected byte {}, got {}", i, expected, positions[i]);
    }
    assert_eq!(*positions.last().unwrap(), text.len());
}

// ---------------------------------------------------------------------------
// Devanagari (conjuncts / reordering)
//
// Devanagari uses a virama (U+094D, ्) to form conjunct consonants.
// A base consonant + virama + next consonant = ONE grapheme cluster.
// Vowel signs (matras) also attach to the preceding consonant cluster.
//
// Verified with `unicode_segmentation` (UAX#29 grapheme cluster rules):
//
//   "नमस्ते" (18 bytes, 3 clusters):
//     [0] "न"        bytes 0-2   (3 bytes, U+0928)
//     [1] "म"        bytes 3-5   (3 bytes, U+092E)
//     [2] "स्ते"     bytes 6-17  (12 bytes, U+0938 + U+094D + U+0924 + U+0947)
//           ↑ virama fuses the full conjunct+vowel into one cluster
//
//   "क्ष" (9 bytes, 1 cluster):
//     [0] "क्ष"      bytes 0-8   (9 bytes, U+0915 + U+094D + U+0937)
//           ↑ the entire word is one grapheme cluster
//
//   "हिन्दी" (18 bytes, 2 clusters):
//     [0] "हि"       bytes 0-5   (6 bytes, U+0939 + U+093F)
//     [1] "न्दी"     bytes 6-17  (12 bytes, U+0928 + U+094D + U+0926 + U+0940)
//
// Correct cursor behaviour: never stop at a position that is NOT a cluster
// boundary (e.g. must NOT stop at byte 3 inside "स्ते").
// ---------------------------------------------------------------------------

#[test]
fn move_right_through_devanagari_namaste() {
    let text = "नमस्ते";
    // Clusters: "न"(0) "म"(3) "स्ते"(6) — end at 18.
    let positions = walk_right(text);
    assert_eq!(positions, vec![0, 3, 6, 18],
        "conjunct 'स्ते' must be stepped over as ONE cluster (12 bytes)");
}

#[test]
fn move_left_through_devanagari_namaste() {
    let text = "नमस्ते";
    let positions = walk_left(text);
    assert_eq!(positions, vec![18, 6, 3, 0],
        "moving left must not stop inside the conjunct cluster");
}

#[test]
fn move_right_through_devanagari_conjunct_ksha() {
    // "क्ष" is a single grapheme cluster (9 bytes).
    let text = "क्ष";
    let positions = walk_right(text);
    assert_eq!(positions, vec![0, 9],
        "entire conjunct word 'क्ष' is one cluster — one step from 0 to 9");
}

#[test]
fn move_right_through_devanagari_hindi() {
    let text = "हिन्दी";
    // Clusters: "हि"(0) "न्दी"(6) — end at 18.
    let positions = walk_right(text);
    assert_eq!(positions, vec![0, 6, 18]);
}

#[test]
fn move_right_devanagari_never_stops_at_virama() {
    // Virama (U+094D) must NEVER be a cursor stop on its own.
    // "स्त" = U+0938 + U+094D + U+0924 = 9 bytes, 1 cluster.
    let text = "स्त";
    let positions = walk_right(text);
    // Must go 0 → 9 directly; must NOT visit byte 3 (after 'स') or byte 6 (the virama).
    assert_eq!(positions, vec![0, 9],
        "virama at byte 3 and the second consonant at byte 6 must not be cursor stops");
}

#[test]
fn move_right_devanagari_matches_grapheme_starts() {
    // Full wd_text_editor line: "नमस्ते दुनिया"
    let text = "नमस्ते दुनिया";
    let starts = grapheme_starts(text);
    let positions = walk_right(text);
    assert_eq!(&positions[..starts.len()], starts.as_slice(),
        "move_right must visit exactly the UAX#29 grapheme cluster starts");
    assert_eq!(*positions.last().unwrap(), text.len());
}

// ---------------------------------------------------------------------------
// Thai (combining vowel marks / no spaces between words)
//
// Thai vowel marks (sara) are combining characters that attach to the
// preceding consonant.  They form one grapheme cluster with their base.
//
// Verified with `unicode_segmentation` (UAX#29):
//
//   "สวัสดี" (18 bytes, 4 clusters):
//     [0] "ส"        bytes 0-2   (3 bytes, U+0E2A)
//     [1] "วั"       bytes 3-8   (6 bytes, U+0E27 + U+0E31 sara_a)
//     [2] "ส"        bytes 9-11  (3 bytes, U+0E2A)
//     [3] "ดี"       bytes 12-17 (6 bytes, U+0E14 + U+0E35 sara_ii)
//           ↑ sara (vowel sign) bonds to its base consonant
//
//   "โลก" (9 bytes, 3 clusters — each consonant standalone):
//     [0] "โ"  [1] "ล"  [2] "ก"   (3 bytes each)
//
// Note: Thai does not insert spaces between words; word segmentation requires
// a language-aware tokenizer.  Cursor movement here operates at the grapheme
// cluster level and does NOT respect word boundaries.
// ---------------------------------------------------------------------------

#[test]
fn move_right_through_thai_sawatdi() {
    let text = "สวัสดี";
    // Clusters: ส(0) วั(3) ส(9) ดี(12) — end at 18.
    let positions = walk_right(text);
    assert_eq!(positions, vec![0, 3, 9, 12, 18],
        "sara U+0E31 must attach to 'ว' — combined cluster is 6 bytes");
}

#[test]
fn move_left_through_thai_sawatdi() {
    let text = "สวัสดี";
    let positions = walk_left(text);
    assert_eq!(positions, vec![18, 12, 9, 3, 0]);
}

#[test]
fn move_right_through_thai_lok() {
    // "โลก" — three standalone consonants, each 3 bytes.
    let text = "โลก";
    let positions = walk_right(text);
    assert_eq!(positions, vec![0, 3, 6, 9]);
}

#[test]
fn move_right_thai_never_stops_inside_sara() {
    // "วั" = U+0E27 + U+0E31 = 6 bytes, 1 cluster.
    // Cursor must NOT stop at byte 3 (the sara alone).
    let text = "วั";
    let positions = walk_right(text);
    assert_eq!(positions, vec![0, 6],
        "sara at byte 3 must not be a cursor stop — it bonds with 'ว'");
}

#[test]
fn move_right_thai_full_word_matches_grapheme_starts() {
    // Full wd_text_editor Thai line: "สวัสดีโลก"
    let text = "สวัสดีโลก";
    let starts = grapheme_starts(text);
    let positions = walk_right(text);
    assert_eq!(&positions[..starts.len()], starts.as_slice(),
        "move_right must visit exactly the UAX#29 grapheme cluster starts");
    assert_eq!(*positions.last().unwrap(), text.len());
}

#[test]
fn move_left_thai_full_word_matches_grapheme_starts() {
    let text = "สวัสดีโลก";
    let starts = grapheme_starts(text);
    let positions = walk_left(text);
    // walk_left starts at text.len() and goes down; reverse of walk_right.
    let mut expected: Vec<usize> = starts.clone();
    expected.push(text.len());
    expected.reverse();
    assert_eq!(positions, expected);
}

// ---------------------------------------------------------------------------
// Per-step cursor trace: Devanagari and Thai
//
// These tests enumerate EVERY cursor position produced by repeated MoveRight
// (or MoveLeft) presses so that any change in behaviour is immediately
// visible as a diff.  They also explain WHY the step sizes vary.
//
// Rule: for LTR scripts (Devanagari, Thai) every step moves the VISUAL caret
// rightward.  The byte delta per step varies because grapheme clusters have
// different widths.  The visual caret position is correct only when
// `caret_x_at` queries the rect for the WHOLE last grapheme cluster (not just
// the last code unit) — combining marks like virama / sara are positioned at
// the base consonant in Skia and would otherwise cause backward caret jumps.
//   - simple Devanagari consonant: 3 bytes
//   - Devanagari conjunct (consonant + virama + consonant + vowel): up to 12 bytes
//   - simple Thai consonant: 3 bytes
//   - Thai consonant + sara (vowel mark): 6 bytes
//
// For RTL scripts (Arabic, Hebrew) each MoveRight step increases the byte
// offset (logical forward), but the VISUAL caret moves leftward because the
// text renders right-to-left.  This is the "mixed direction" that can look
// surprising.  Visual-order bidi cursor movement is not yet implemented;
// logical-order movement is the correct baseline.
// ---------------------------------------------------------------------------

// ── Devanagari step trace ──────────────────────────────────────────────────

#[test]
fn devanagari_namaste_right_step_trace() {
    // "नमस्ते" — 18 bytes, 3 grapheme clusters:
    //
    //   step 0 → 1: cursor 0→3   "न"  (3 bytes, simple consonant)
    //   step 1 → 2: cursor 3→6   "म"  (3 bytes, simple consonant)
    //   step 2 → 3: cursor 6→18  "स्ते" (12 bytes: स + ् + त + े, ONE conjunct)
    //
    // The 12-byte jump is correct — the whole conjunct+vowel is one cluster.
    let text = "नमस्ते";
    let positions = walk_right(text);
    assert_eq!(positions[0], 0,  "step 0: start");
    assert_eq!(positions[1], 3,  "step 1: after 'न' (3 bytes)");
    assert_eq!(positions[2], 6,  "step 2: after 'म' (3 bytes)");
    assert_eq!(positions[3], 18, "step 3: after 'स्ते' (12-byte conjunct)");
}

#[test]
fn devanagari_namaste_left_step_trace() {
    let text = "नमस्ते";
    let positions = walk_left(text);
    assert_eq!(positions[0], 18, "start at end");
    assert_eq!(positions[1], 6,  "step 1: jump back 12 bytes over 'स्ते' conjunct");
    assert_eq!(positions[2], 3,  "step 2: back over 'म' (3 bytes)");
    assert_eq!(positions[3], 0,  "step 3: back over 'न' (3 bytes)");
}

#[test]
fn devanagari_virama_makes_large_jump() {
    // "ब + ् + ब + ् + ब" = two viramas binding three consonants.
    // Expected clusters: whole thing is ONE cluster (virama chains).
    let text = "ब्ब्ब";
    let starts = grapheme_starts(text);
    let positions = walk_right(text);
    // Whatever the cluster count, every step must land on a grapheme start.
    assert_eq!(&positions[..starts.len()], starts.as_slice());
    assert_eq!(*positions.last().unwrap(), text.len());
    // And no step may land inside the chain (any byte that is not a cluster start).
    for &pos in positions.iter() {
        if pos < text.len() {
            assert!(
                starts.contains(&pos),
                "cursor landed at byte {} which is not a grapheme start in {:?}",
                pos, text
            );
        }
    }
}

// ── Thai step trace ────────────────────────────────────────────────────────

#[test]
fn thai_sawatdee_right_step_trace() {
    // "สวัสดี" — 18 bytes, 4 grapheme clusters:
    //
    //   step 0 → 1: cursor 0→3   "ส"  (3 bytes, standalone consonant)
    //   step 1 → 2: cursor 3→9   "วั" (6 bytes: ว + ั sara-a, ONE cluster)
    //   step 2 → 3: cursor 9→12  "ส"  (3 bytes, standalone consonant)
    //   step 3 → 4: cursor 12→18 "ดี" (6 bytes: ด + ี sara-ii, ONE cluster)
    //
    // Sara vowel marks are Extend characters in UAX#29, so they bond with
    // the preceding consonant into one grapheme cluster.
    let text = "สวัสดี";
    let positions = walk_right(text);
    assert_eq!(positions[0], 0,  "step 0: start");
    assert_eq!(positions[1], 3,  "step 1: after 'ส' (3 bytes)");
    assert_eq!(positions[2], 9,  "step 2: after 'วั' (6-byte cluster: ว+sara)");
    assert_eq!(positions[3], 12, "step 3: after second 'ส' (3 bytes)");
    assert_eq!(positions[4], 18, "step 4: after 'ดี' (6-byte cluster: ด+sara)");
}

#[test]
fn thai_sawatdee_left_step_trace() {
    let text = "สวัสดี";
    let positions = walk_left(text);
    assert_eq!(positions[0], 18, "start at end");
    assert_eq!(positions[1], 12, "step 1: back over 'ดี' (6-byte cluster)");
    assert_eq!(positions[2], 9,  "step 2: back over second 'ส' (3 bytes)");
    assert_eq!(positions[3], 3,  "step 3: back over 'วั' (6-byte cluster)");
    assert_eq!(positions[4], 0,  "step 4: back over first 'ส' (3 bytes)");
}

#[test]
fn thai_sara_step_never_stops_mid_cluster() {
    // Comprehensive: every cursor position must be a grapheme start.
    let text = "สวัสดีโลก";
    let starts = grapheme_starts(text);
    let positions = walk_right(text);
    for &pos in positions.iter() {
        if pos < text.len() {
            assert!(
                starts.contains(&pos),
                "cursor at byte {} is not a grapheme start (mid-cluster stop in {:?})",
                pos, text
            );
        }
    }
}

// ── RTL visual-vs-logical note ────────────────────────────────────────────

#[test]
fn rtl_arabic_right_always_increases_byte_offset() {
    // For RTL text, MoveRight advances the LOGICAL (byte) offset even though
    // the visual caret moves LEFT on screen.  This is the expected behaviour
    // until visual-order bidi cursor movement is implemented.
    let text = "مرحبا بالعالم"; // "Hello world" in Arabic
    let positions = walk_right(text);
    for w in positions.windows(2) {
        assert!(
            w[1] > w[0],
            "MoveRight must always increase the byte offset; got {} → {}",
            w[0], w[1]
        );
    }
}

#[test]
fn rtl_hebrew_left_always_decreases_byte_offset() {
    // Symmetric: MoveLeft always decreases the byte offset for RTL text too.
    let text = "שלום עולם"; // "Hello world" in Hebrew
    let positions = walk_left(text);
    for w in positions.windows(2) {
        assert!(
            w[1] < w[0],
            "MoveLeft must always decrease the byte offset; got {} → {}",
            w[0], w[1]
        );
    }
}

// ---------------------------------------------------------------------------
// PageUp / PageDown
// ---------------------------------------------------------------------------

#[test]
fn page_down_moves_by_visible_lines() {
    // viewport_height=60, line_height=24 → visible ≈ 2 lines
    let mut lay = SimpleLayoutEngine::new(60.0, 24.0, 10.0);
    let text = "L0\nL1\nL2\nL3\nL4";
    let s = TextEditorState::with_cursor(text, 0); // line 0
    let s2 = apply_command(&s, EditingCommand::MovePageDown { extend: false }, &mut lay);
    // target_line = 0 + 2 = 2, start = index of "L2"
    assert_eq!(s2.cursor, 6, "should jump to line 2");
}

// ---------------------------------------------------------------------------
// Undo / redo
// ---------------------------------------------------------------------------

#[test]
fn undo_restores_previous_state() {
    let mut h = EditHistory::new();
    let s0 = TextEditorState::with_cursor("Hello", 5);
    h.push(&s0, EditKind::Typing);
    let s1 = apply(&s0, EditingCommand::Insert(" W".into()));

    let restored = h.undo(&s1).expect("should undo");
    assert_eq!(restored, s0);
}

#[test]
fn redo_after_undo() {
    let mut h = EditHistory::new();
    let s0 = TextEditorState::with_cursor("Hello", 5);
    h.push(&s0, EditKind::Typing);
    let s1 = apply(&s0, EditingCommand::Insert("!".into()));

    let restored = h.undo(&s1).expect("undo");
    assert_eq!(restored, s0);

    let redone = h.redo(&restored).expect("redo");
    assert_eq!(redone, s1);
}

#[test]
fn redo_cleared_by_new_edit() {
    let mut h = EditHistory::new();
    let s0 = TextEditorState::with_cursor("Hello", 5);
    h.push(&s0, EditKind::Typing);
    let s1 = apply(&s0, EditingCommand::Insert("!".into()));

    h.undo(&s1).expect("undo");

    h.push(&s0, EditKind::Typing);
    assert!(!h.can_redo(), "redo stack should be cleared after new edit");
}

#[test]
fn consecutive_typing_merges_into_one_undo_step() {
    let mut h = EditHistory::new();
    let s0 = TextEditorState::with_cursor("", 0);

    h.push(&s0, EditKind::Typing);
    let s1 = apply(&s0, EditingCommand::Insert("H".into()));
    h.push(&s1, EditKind::Typing);
    let s2 = apply(&s1, EditingCommand::Insert("i".into()));
    h.push(&s2, EditKind::Typing);
    let s3 = apply(&s2, EditingCommand::Insert("!".into()));

    assert_eq!(h.undo_len(), 1, "consecutive typing should merge");

    let restored = h.undo(&s3).expect("undo");
    assert_eq!(restored, s0, "should jump back to state before entire typing run");
}

#[test]
fn different_kinds_do_not_merge() {
    let mut h = EditHistory::new();
    let s0 = TextEditorState::with_cursor("abc", 3);

    h.push(&s0, EditKind::Typing);
    let s1 = apply(&s0, EditingCommand::Insert("d".into()));

    h.push(&s1, EditKind::Backspace);
    let s2 = apply(&s1, EditingCommand::Backspace);

    assert_eq!(h.undo_len(), 2, "Typing then Backspace should be 2 entries");

    let after_first_undo = h.undo(&s2).expect("undo backspace");
    assert_eq!(after_first_undo, s1);

    let after_second_undo = h.undo(&after_first_undo).expect("undo typing");
    assert_eq!(after_second_undo, s0);
}

#[test]
fn timeout_breaks_merge() {
    use std::time::Duration;

    let mut h = EditHistory::with_merge_timeout(Duration::from_secs(2));
    let s0 = TextEditorState::with_cursor("", 0);

    h.push(&s0, EditKind::Typing);
    let s1 = apply(&s0, EditingCommand::Insert("a".into()));

    h.expire_top();

    h.push(&s1, EditKind::Typing);
    let s2 = apply(&s1, EditingCommand::Insert("b".into()));

    assert_eq!(h.undo_len(), 2, "expired timeout should break merge");

    let restored = h.undo(&s2).expect("undo second group");
    assert_eq!(restored, s1);
}

#[test]
fn ime_commit_never_merges() {
    let mut h = EditHistory::new();
    let s0 = TextEditorState::with_cursor("", 0);

    h.push(&s0, EditKind::ImeCommit);
    let s1 = apply(&s0, EditingCommand::Insert("가".into()));

    h.push(&s1, EditKind::ImeCommit);
    let s2 = apply(&s1, EditingCommand::Insert("나".into()));

    assert_eq!(h.undo_len(), 2, "IME commits should never merge");
}

#[test]
fn newline_never_merges() {
    let mut h = EditHistory::new();
    let s0 = TextEditorState::with_cursor("a", 1);

    h.push(&s0, EditKind::Newline);
    let s1 = apply(&s0, EditingCommand::Insert("\n".into()));

    h.push(&s1, EditKind::Newline);
    let s2 = apply(&s1, EditingCommand::Insert("\n".into()));

    assert_eq!(h.undo_len(), 2, "newlines should never merge");
    let _ = s2;
}

#[test]
fn paste_never_merges() {
    let mut h = EditHistory::new();
    let s0 = TextEditorState::with_cursor("", 0);

    h.push(&s0, EditKind::Paste);
    let s1 = apply(&s0, EditingCommand::Insert("hello world".into()));

    h.push(&s1, EditKind::Paste);
    let _s2 = apply(&s1, EditingCommand::Insert("foo bar".into()));

    assert_eq!(h.undo_len(), 2, "pastes should never merge");
}

#[test]
fn undo_on_empty_stack_returns_none() {
    let mut h = EditHistory::new();
    let s = TextEditorState::with_cursor("x", 1);
    assert!(h.undo(&s).is_none());
}

#[test]
fn redo_on_empty_stack_returns_none() {
    let mut h = EditHistory::new();
    let s = TextEditorState::with_cursor("x", 1);
    assert!(h.redo(&s).is_none());
}

#[test]
fn max_entries_evicts_oldest() {
    let mut h = EditHistory::with_max_entries(3);

    let s0 = TextEditorState::with_cursor("", 0);
    h.push(&s0, EditKind::Newline);
    let s1 = apply(&s0, EditingCommand::Insert("\n".into()));

    h.push(&s1, EditKind::Newline);
    let s2 = apply(&s1, EditingCommand::Insert("\n".into()));

    h.push(&s2, EditKind::Newline);
    let s3 = apply(&s2, EditingCommand::Insert("\n".into()));

    assert_eq!(h.undo_len(), 3);

    h.push(&s3, EditKind::Newline);
    let s4 = apply(&s3, EditingCommand::Insert("\n".into()));

    assert_eq!(h.undo_len(), 3, "oldest entry should be evicted");

    let r = h.undo(&s4).expect("undo");
    assert_eq!(r, s3, "most recent entry is s3");
}

#[test]
fn edit_kind_classification() {
    assert_eq!(EditingCommand::Insert("a".into()).edit_kind(), Some(EditKind::Typing));
    assert_eq!(EditingCommand::Insert("\n".into()).edit_kind(), Some(EditKind::Newline));
    assert_eq!(EditingCommand::Insert("hello world".into()).edit_kind(), Some(EditKind::Paste));
    assert_eq!(EditingCommand::Backspace.edit_kind(), Some(EditKind::Backspace));
    assert_eq!(EditingCommand::BackspaceWord.edit_kind(), Some(EditKind::Backspace));
    assert_eq!(EditingCommand::Delete.edit_kind(), Some(EditKind::Delete));
    assert_eq!(EditingCommand::DeleteWord.edit_kind(), Some(EditKind::Delete));
    assert_eq!(EditingCommand::MoveLeft { extend: false }.edit_kind(), None);
    assert_eq!(EditingCommand::SelectAll.edit_kind(), None);
}

// ---------------------------------------------------------------------------
// Word segment boundary (UAX #29)
// ---------------------------------------------------------------------------

#[test]
fn word_segment_at_returns_correct_segments() {
    //                   0123456789...
    let text = "(abc) d efg h?";
    // UAX#29 segments: ( | abc | ) | _ | d | _ | efg | _ | h | ?
    assert_eq!(word_segment_at(text, 0), (0, 1));   // (
    assert_eq!(word_segment_at(text, 1), (1, 4));   // abc
    assert_eq!(word_segment_at(text, 3), (1, 4));   // still inside abc
    assert_eq!(word_segment_at(text, 4), (4, 5));   // )
    assert_eq!(word_segment_at(text, 5), (5, 6));   // space
    assert_eq!(word_segment_at(text, 6), (6, 7));   // d
    assert_eq!(word_segment_at(text, 8), (8, 11));  // efg
    assert_eq!(word_segment_at(text, 12), (12, 13)); // h
    assert_eq!(word_segment_at(text, 13), (13, 14)); // ?
}

// ---------------------------------------------------------------------------
// Word deletion: BackspaceWord
// ---------------------------------------------------------------------------

#[test]
fn backspace_word_deletes_word() {
    // "hello world" cursor at 11 (end) → delete "world"
    let s = TextEditorState::with_cursor("hello world", 11);
    let s = apply(&s, EditingCommand::BackspaceWord);
    assert_eq!(s.text, "hello ");
    assert_eq!(s.cursor, 6);
}

#[test]
fn backspace_word_deletes_space() {
    // "hello world" cursor at 6 (after space, before 'w') → delete space
    let s = TextEditorState::with_cursor("hello world", 6);
    let s = apply(&s, EditingCommand::BackspaceWord);
    assert_eq!(s.text, "helloworld");
    assert_eq!(s.cursor, 5);
}

#[test]
fn backspace_word_deletes_punctuation() {
    let s = TextEditorState::with_cursor("(abc)", 5);
    let s = apply(&s, EditingCommand::BackspaceWord);
    assert_eq!(s.text, "(abc");
    assert_eq!(s.cursor, 4);
}

#[test]
fn backspace_word_at_start_is_noop() {
    let s = TextEditorState::with_cursor("hello", 0);
    let s = apply(&s, EditingCommand::BackspaceWord);
    assert_eq!(s.text, "hello");
    assert_eq!(s.cursor, 0);
}

#[test]
fn backspace_word_deletes_selection_first() {
    let mut s = TextEditorState::with_cursor("hello world", 5);
    s.anchor = Some(11);
    let s = apply(&s, EditingCommand::BackspaceWord);
    assert_eq!(s.text, "hello");
    assert_eq!(s.cursor, 5);
}

#[test]
fn backspace_word_repeated() {
    // "(abc) d" cursor at end (7)
    // Step 1: delete "d" → "(abc) "
    // Step 2: delete " " → "(abc)"
    // Step 3: delete ")" → "(abc"
    // Step 4: delete "abc" → "("
    // Step 5: delete "(" → ""
    let mut s = TextEditorState::with_cursor("(abc) d", 7);
    s = apply(&s, EditingCommand::BackspaceWord);
    assert_eq!(s.text, "(abc) ", "step 1: delete 'd'");

    s = apply(&s, EditingCommand::BackspaceWord);
    assert_eq!(s.text, "(abc)", "step 2: delete space");

    s = apply(&s, EditingCommand::BackspaceWord);
    assert_eq!(s.text, "(abc", "step 3: delete ')'");

    s = apply(&s, EditingCommand::BackspaceWord);
    assert_eq!(s.text, "(", "step 4: delete 'abc'");

    s = apply(&s, EditingCommand::BackspaceWord);
    assert_eq!(s.text, "", "step 5: delete '('");
}

// ---------------------------------------------------------------------------
// Word deletion: DeleteWord
// ---------------------------------------------------------------------------

#[test]
fn delete_word_deletes_word() {
    // "hello world" cursor at 0 → delete "hello"
    let s = TextEditorState::with_cursor("hello world", 0);
    let s = apply(&s, EditingCommand::DeleteWord);
    assert_eq!(s.text, " world");
    assert_eq!(s.cursor, 0);
}

#[test]
fn delete_word_deletes_space() {
    // "hello world" cursor at 5 (on space) → delete " "
    let s = TextEditorState::with_cursor("hello world", 5);
    let s = apply(&s, EditingCommand::DeleteWord);
    assert_eq!(s.text, "helloworld");
    assert_eq!(s.cursor, 5);
}

#[test]
fn delete_word_deletes_punctuation() {
    let s = TextEditorState::with_cursor("(abc)", 0);
    let s = apply(&s, EditingCommand::DeleteWord);
    assert_eq!(s.text, "abc)");
    assert_eq!(s.cursor, 0);
}

#[test]
fn delete_word_at_end_is_noop() {
    let s = TextEditorState::with_cursor("hello", 5);
    let s = apply(&s, EditingCommand::DeleteWord);
    assert_eq!(s.text, "hello");
    assert_eq!(s.cursor, 5);
}

#[test]
fn delete_word_repeated() {
    // "(abc) d" cursor at 0
    // Step 1: delete "(" → "abc) d"
    // Step 2: delete "abc" → ") d"
    // Step 3: delete ")" → " d"
    // Step 4: delete " " → "d"
    // Step 5: delete "d" → ""
    let mut s = TextEditorState::with_cursor("(abc) d", 0);
    s = apply(&s, EditingCommand::DeleteWord);
    assert_eq!(s.text, "abc) d", "step 1: delete '('");

    s = apply(&s, EditingCommand::DeleteWord);
    assert_eq!(s.text, ") d", "step 2: delete 'abc'");

    s = apply(&s, EditingCommand::DeleteWord);
    assert_eq!(s.text, " d", "step 3: delete ')'");

    s = apply(&s, EditingCommand::DeleteWord);
    assert_eq!(s.text, "d", "step 4: delete space");

    s = apply(&s, EditingCommand::DeleteWord);
    assert_eq!(s.text, "", "step 5: delete 'd'");
}

// ---------------------------------------------------------------------------
// Word navigation: full walk through user's example
// ---------------------------------------------------------------------------

#[test]
fn move_word_right_walks_all_segments() {
    // "(abc) d efg h?" — cursor should stop at every UAX#29 segment boundary.
    let text = "(abc) d efg h?";
    let mut s = TextEditorState::with_cursor(text, 0);
    let mut stops = vec![0usize];
    for _ in 0..20 {
        if s.cursor >= text.len() {
            break;
        }
        s = apply(&s, EditingCommand::MoveWordRight { extend: false });
        stops.push(s.cursor);
    }
    // Expected: ( | abc | ) | _ | d | _ | efg | _ | h | ?
    assert_eq!(stops, vec![0, 1, 4, 5, 6, 7, 8, 11, 12, 13, 14]);
}

#[test]
fn move_word_left_walks_all_segments() {
    let text = "(abc) d efg h?";
    let mut s = TextEditorState::new(text); // cursor at end (14)
    let mut stops = vec![14usize];
    for _ in 0..20 {
        if s.cursor == 0 {
            break;
        }
        s = apply(&s, EditingCommand::MoveWordLeft { extend: false });
        stops.push(s.cursor);
    }
    assert_eq!(stops, vec![14, 13, 12, 11, 8, 7, 6, 5, 4, 1, 0]);
}

// ---------------------------------------------------------------------------
// Line deletion: BackspaceLine / DeleteLine
// ---------------------------------------------------------------------------

#[test]
fn backspace_line_deletes_to_line_start() {
    // "Hello\nWorld" cursor at 8 (middle of "World") → delete "Wo"
    let s = TextEditorState::with_cursor("Hello\nWorld", 8);
    let s = apply(&s, EditingCommand::BackspaceLine);
    assert_eq!(s.text, "Hello\nrld");
    assert_eq!(s.cursor, 6);
}

#[test]
fn backspace_line_at_line_start_is_noop() {
    let s = TextEditorState::with_cursor("Hello\nWorld", 6);
    let s = apply(&s, EditingCommand::BackspaceLine);
    assert_eq!(s.text, "Hello\nWorld");
    assert_eq!(s.cursor, 6);
}

#[test]
fn backspace_line_on_first_line() {
    let s = TextEditorState::with_cursor("Hello World", 5);
    let s = apply(&s, EditingCommand::BackspaceLine);
    assert_eq!(s.text, " World");
    assert_eq!(s.cursor, 0);
}

#[test]
fn backspace_line_with_selection_deletes_selection() {
    let mut s = TextEditorState::with_cursor("Hello\nWorld", 8);
    s.anchor = Some(6);
    let s = apply(&s, EditingCommand::BackspaceLine);
    assert_eq!(s.text, "Hello\nrld");
    assert_eq!(s.cursor, 6);
}

#[test]
fn delete_line_deletes_to_line_end() {
    // "Hello\nWorld" cursor at 8 → delete "rld"
    let s = TextEditorState::with_cursor("Hello\nWorld", 8);
    let s = apply(&s, EditingCommand::DeleteLine);
    assert_eq!(s.text, "Hello\nWo");
    assert_eq!(s.cursor, 8);
}

#[test]
fn delete_line_at_line_end_is_noop() {
    // cursor at 5 (end of "Hello", before \n) — line content ends at 5
    let s = TextEditorState::with_cursor("Hello\nWorld", 5);
    let s = apply(&s, EditingCommand::DeleteLine);
    assert_eq!(s.text, "Hello\nWorld");
    assert_eq!(s.cursor, 5);
}

#[test]
fn delete_line_on_last_line() {
    let s = TextEditorState::with_cursor("Hello\nWorld", 8);
    let s = apply(&s, EditingCommand::DeleteLine);
    assert_eq!(s.text, "Hello\nWo");
    assert_eq!(s.cursor, 8);
}

#[test]
fn delete_line_from_start_of_line() {
    // cursor at 0 → delete entire "Hello" (but not the \n)
    let s = TextEditorState::with_cursor("Hello\nWorld", 0);
    let s = apply(&s, EditingCommand::DeleteLine);
    assert_eq!(s.text, "\nWorld");
    assert_eq!(s.cursor, 0);
}
