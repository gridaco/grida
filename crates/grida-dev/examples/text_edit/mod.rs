pub mod history;
pub mod layout;
pub mod simple_layout;

pub use history::{EditHistory, EditKind};
pub use layout::{line_index_for_offset, LineMetrics, TextLayoutEngine};
pub use simple_layout::SimpleLayoutEngine;

use unicode_segmentation::UnicodeSegmentation;

// ---------------------------------------------------------------------------
// UTF-8 ↔ UTF-16 helpers  (pub so SkiaLayoutEngine in the example can reuse)
// ---------------------------------------------------------------------------

pub fn utf8_to_utf16_offset(text: &str, utf8: usize) -> usize {
    let safe = floor_char_boundary(text, utf8);
    text[..safe].encode_utf16().count()
}

pub fn utf16_to_utf8_offset(text: &str, utf16: usize) -> usize {
    let mut count = 0usize;
    for (byte_idx, ch) in text.char_indices() {
        if count >= utf16 {
            return byte_idx;
        }
        count += ch.len_utf16();
    }
    text.len()
}

/// Normalize CRLF (`\r\n`) and lone CR (`\r`) to LF (`\n`).
pub fn normalize_newlines(s: &str) -> String {
    s.replace("\r\n", "\n").replace('\r', "\n")
}

// ---------------------------------------------------------------------------
// Grapheme boundary helpers
// ---------------------------------------------------------------------------

pub fn prev_grapheme_boundary(text: &str, pos: usize) -> usize {
    if pos == 0 {
        return 0;
    }
    let mut prev = 0;
    for (i, g) in text.grapheme_indices(true) {
        let end = i + g.len();
        if end >= pos {
            return prev;
        }
        prev = end;
    }
    prev
}

/// Snap `pos` to the **start of its grapheme cluster**.
///
/// Unlike `prev_grapheme_boundary`, this returns `pos` unchanged when `pos`
/// is already exactly at a grapheme cluster start — it does NOT step back to
/// the previous boundary.  Use this wherever the goal is "ensure the offset
/// is a valid cursor stop" rather than "find the grapheme before the cursor".
pub fn snap_grapheme_boundary(text: &str, pos: usize) -> usize {
    let pos = pos.min(text.len());
    if pos == 0 {
        return 0;
    }
    for (i, g) in text.grapheme_indices(true) {
        let end = i + g.len();
        if i <= pos && pos < end {
            return i; // pos is inside this cluster — snap to its start
        }
        if i > pos {
            // overshot without a match (should not happen for well-formed UTF-8)
            return i;
        }
    }
    text.len()
}

pub fn next_grapheme_boundary(text: &str, pos: usize) -> usize {
    for (i, g) in text.grapheme_indices(true) {
        if i >= pos {
            return i + g.len();
        }
    }
    text.len()
}

// ---------------------------------------------------------------------------
// Char-boundary safety helpers
//
// These are the ONLY functions that should be used to adjust a raw byte
// offset when there is any possibility it does not fall on a char boundary
// (e.g. after `pos + 1` / `pos - 1` arithmetic on multi-byte text).
// They mirror the nightly `str::floor_char_boundary` / `str::ceil_char_boundary`.
// ---------------------------------------------------------------------------

/// Snap `pos` backward to the nearest char boundary at or before `pos`.
pub fn floor_char_boundary(text: &str, pos: usize) -> usize {
    let pos = pos.min(text.len());
    let mut p = pos;
    while p > 0 && !text.is_char_boundary(p) {
        p -= 1;
    }
    p
}

/// Snap `pos` forward to the nearest char boundary at or after `pos`.
pub fn ceil_char_boundary(text: &str, pos: usize) -> usize {
    let pos = pos.min(text.len());
    let mut p = pos;
    while p < text.len() && !text.is_char_boundary(p) {
        p += 1;
    }
    p
}

// ---------------------------------------------------------------------------
// Word segment boundary (UAX #29)
// ---------------------------------------------------------------------------

/// Find the UAX #29 word segment containing `offset`.
///
/// Returns `(start, end)` — the byte range of the segment. This is the
/// standalone equivalent of `TextLayoutEngine::word_boundary_at` so that
/// pure editing commands (`BackspaceWord`, `DeleteWord`) can resolve word
/// boundaries without requiring a layout engine.
pub fn word_segment_at(text: &str, offset: usize) -> (usize, usize) {
    let offset = offset.min(text.len());
    let mut last_start = 0usize;
    for (byte_idx, segment) in text.split_word_bound_indices() {
        let end = byte_idx + segment.len();
        if byte_idx <= offset && offset < end {
            return (byte_idx, end);
        }
        last_start = byte_idx;
    }
    (last_start, text.len())
}

/// Find the start of the previous word segment from `pos`.
///
/// If `pos` is at the start of a segment, returns the start of the
/// preceding segment. Used by `BackspaceWord` to determine delete range.
fn prev_word_segment_start(text: &str, pos: usize) -> usize {
    if pos == 0 {
        return 0;
    }
    let (seg_start, _) = word_segment_at(text, pos);
    if seg_start < pos {
        return seg_start;
    }
    // pos is exactly at a segment boundary — step back into the previous one
    if pos > 0 {
        let safe = floor_char_boundary(text, pos.saturating_sub(1));
        let (prev_start, _) = word_segment_at(text, safe);
        return prev_start;
    }
    0
}

/// Find the end of the current word segment from `pos`.
///
/// If `pos` is at the end of a segment, returns the end of the next
/// segment. Used by `DeleteWord` to determine delete range.
fn next_word_segment_end(text: &str, pos: usize) -> usize {
    if pos >= text.len() {
        return text.len();
    }
    let (_, seg_end) = word_segment_at(text, pos);
    if seg_end > pos {
        return seg_end;
    }
    // pos is exactly at a segment boundary — step into the next one
    if pos < text.len() {
        let safe = ceil_char_boundary(text, pos + 1);
        let (_, next_end) = word_segment_at(text, safe);
        return next_end;
    }
    text.len()
}

// ---------------------------------------------------------------------------
// Core state
// ---------------------------------------------------------------------------

/// Pure editing state: text buffer, cursor, and optional selection anchor.
///
/// All offsets are UTF-8 byte offsets on grapheme cluster boundaries.
/// When `anchor == None` or `anchor == Some(cursor)`, there is no selection
/// (caret mode). The selected range is always `[min, max)`.
#[derive(Clone, Debug, PartialEq)]
pub struct TextEditorState {
    pub text: String,
    /// Caret position (UTF-8 byte offset).
    pub cursor: usize,
    /// Selection anchor. `None` is equivalent to `Some(cursor)` (no selection).
    pub anchor: Option<usize>,
}

impl TextEditorState {
    pub fn new(text: impl Into<String>) -> Self {
        let text = text.into();
        let cursor = text.len();
        Self { text, cursor, anchor: None }
    }

    pub fn with_cursor(text: impl Into<String>, cursor: usize) -> Self {
        Self { text: text.into(), cursor, anchor: None }
    }

    pub fn has_selection(&self) -> bool {
        self.anchor.map_or(false, |a| a != self.cursor)
    }

    pub fn selection_range(&self) -> Option<(usize, usize)> {
        self.anchor.map(|a| {
            let lo = a.min(self.cursor);
            let hi = a.max(self.cursor);
            (lo, hi)
        })
    }

    pub fn selected_text(&self) -> Option<&str> {
        self.selection_range().map(|(lo, hi)| &self.text[lo..hi])
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Editing commands understood by [`apply_command`].
///
/// Commands that require geometry (move_up, move_down, etc.) call through the
/// provided `TextLayoutEngine`; pure commands (insert, backspace, move_left,
/// etc.) do not touch the layout engine at all.
#[derive(Clone, Debug)]
pub enum EditingCommand {
    // --- pure (no layout needed) ---
    Insert(String),
    Backspace,
    BackspaceWord,
    Delete,
    DeleteWord,
    MoveLeft { extend: bool },
    MoveRight { extend: bool },
    MoveDocStart { extend: bool },
    MoveDocEnd { extend: bool },
    SelectAll,
    /// Directly set cursor (and optionally anchor).  Used when the caller
    /// has already computed the desired offset (e.g. from drag state).
    SetCursorPos { pos: usize, anchor: Option<usize> },

    // --- need layout ---
    BackspaceLine,
    DeleteLine,
    MoveUp { extend: bool },
    MoveDown { extend: bool },
    MoveHome { extend: bool },
    MoveEnd { extend: bool },
    MovePageUp { extend: bool },
    MovePageDown { extend: bool },
    MoveWordLeft { extend: bool },
    MoveWordRight { extend: bool },

    // --- point-based (need layout.position_at_point) ---
    /// Place caret at the text position nearest to (x, y).
    MoveTo { x: f32, y: f32 },
    /// Extend the current selection focus to (x, y) keeping the anchor fixed.
    ExtendTo { x: f32, y: f32 },
    /// Select the word at (x, y).
    SelectWordAt { x: f32, y: f32 },
    /// Select the visual line at (x, y).
    SelectLineAt { x: f32, y: f32 },
}

impl EditingCommand {
    /// Classify this command for undo/redo grouping.
    ///
    /// Returns `Some(kind)` for text-mutating commands (insert, delete) and
    /// `None` for cursor-only commands (movement, selection).
    pub fn edit_kind(&self) -> Option<EditKind> {
        match self {
            Self::Insert(s) => {
                let clusters: Vec<&str> = s.graphemes(true).collect();
                if clusters.len() == 1 {
                    if clusters[0] == "\n" {
                        Some(EditKind::Newline)
                    } else {
                        Some(EditKind::Typing)
                    }
                } else {
                    Some(EditKind::Paste)
                }
            }
            Self::Backspace | Self::BackspaceWord | Self::BackspaceLine => {
                Some(EditKind::Backspace)
            }
            Self::Delete | Self::DeleteWord | Self::DeleteLine => {
                Some(EditKind::Delete)
            }
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// apply_command
// ---------------------------------------------------------------------------

/// Apply a single editing command to `state`, returning the new state.
///
/// Layout-dependent commands call into `layout`; pure commands do not.
/// The function is intentionally pure in the non-layout path (no side effects).
pub fn apply_command(
    state: &TextEditorState,
    command: EditingCommand,
    layout: &mut dyn TextLayoutEngine,
) -> TextEditorState {
    let mut s = state.clone();

    match command {
        EditingCommand::Insert(text) => {
            let pos = delete_selection_in_place(&mut s);
            let normalized = normalize_newlines(&text);
            s.text.insert_str(pos, &normalized);
            s.cursor = pos + normalized.len();
            s.anchor = None;
        }

        EditingCommand::Backspace => {
            if s.has_selection() {
                s.cursor = delete_selection_in_place(&mut s);
            } else if s.cursor > 0 {
                let prev = prev_grapheme_boundary(&s.text, s.cursor);
                s.text.drain(prev..s.cursor);
                s.cursor = prev;
            }
            s.anchor = None;
        }

        EditingCommand::BackspaceWord => {
            if s.has_selection() {
                s.cursor = delete_selection_in_place(&mut s);
            } else if s.cursor > 0 {
                let target = prev_word_segment_start(&s.text, s.cursor);
                s.text.drain(target..s.cursor);
                s.cursor = target;
            }
            s.anchor = None;
        }

        EditingCommand::Delete => {
            if s.has_selection() {
                s.cursor = delete_selection_in_place(&mut s);
            } else if s.cursor < s.text.len() {
                let next = next_grapheme_boundary(&s.text, s.cursor);
                s.text.drain(s.cursor..next);
            }
            s.anchor = None;
        }

        EditingCommand::DeleteWord => {
            if s.has_selection() {
                s.cursor = delete_selection_in_place(&mut s);
            } else if s.cursor < s.text.len() {
                let target = next_word_segment_end(&s.text, s.cursor);
                s.text.drain(s.cursor..target);
            }
            s.anchor = None;
        }

        EditingCommand::MoveLeft { extend } => {
            if !extend && s.has_selection() {
                if let Some((lo, _)) = s.selection_range() {
                    s.cursor = lo;
                    s.anchor = None;
                    return s;
                }
            }
            set_anchor_if_extending(&mut s, extend);
            s.cursor = prev_grapheme_boundary(&s.text, s.cursor);
            clear_anchor_if_not_extending(&mut s, extend);
        }

        EditingCommand::MoveRight { extend } => {
            if !extend && s.has_selection() {
                if let Some((_, hi)) = s.selection_range() {
                    s.cursor = hi;
                    s.anchor = None;
                    return s;
                }
            }
            set_anchor_if_extending(&mut s, extend);
            s.cursor = next_grapheme_boundary(&s.text, s.cursor);
            clear_anchor_if_not_extending(&mut s, extend);
        }

        EditingCommand::MoveDocStart { extend } => {
            set_anchor_if_extending(&mut s, extend);
            s.cursor = 0;
            clear_anchor_if_not_extending(&mut s, extend);
        }

        EditingCommand::MoveDocEnd { extend } => {
            set_anchor_if_extending(&mut s, extend);
            s.cursor = s.text.len();
            clear_anchor_if_not_extending(&mut s, extend);
        }

        EditingCommand::SelectAll => {
            s.anchor = Some(0);
            s.cursor = s.text.len();
        }

        EditingCommand::SetCursorPos { pos, anchor } => {
            s.cursor = pos.min(s.text.len());
            s.anchor = anchor;
        }

        EditingCommand::BackspaceLine => {
            if s.has_selection() {
                s.cursor = delete_selection_in_place(&mut s);
            } else {
                let metrics = layout.line_metrics(&s.text);
                let line_idx = line_index_for_offset_utf8(&metrics, s.cursor);
                let line_start = metrics[line_idx].start_index;
                if line_start < s.cursor {
                    s.text.drain(line_start..s.cursor);
                    s.cursor = line_start;
                }
            }
            s.anchor = None;
        }

        EditingCommand::DeleteLine => {
            if s.has_selection() {
                s.cursor = delete_selection_in_place(&mut s);
            } else {
                let metrics = layout.line_metrics(&s.text);
                let line_idx = line_index_for_offset_utf8(&metrics, s.cursor);
                let lm = &metrics[line_idx];
                let mut line_end = lm.end_index.min(s.text.len());
                if line_end > 0 && s.text[..line_end].ends_with('\n') {
                    line_end = prev_grapheme_boundary(&s.text, line_end);
                }
                if s.cursor < line_end {
                    s.text.drain(s.cursor..line_end);
                }
            }
            s.anchor = None;
        }

        EditingCommand::MoveUp { extend } => {
            set_anchor_if_extending(&mut s, extend);
            let x = layout.caret_x_at(&s.text, s.cursor);
            let metrics = layout.line_metrics(&s.text);
            let line_idx = line_index_for_offset_utf8(&metrics, s.cursor);
            if line_idx > 0 {
                let prev = &metrics[line_idx - 1];
                let target_y = prev.baseline - prev.ascent * 0.5;
                s.cursor = layout.position_at_point(&s.text, x, target_y.max(0.0));
            } else {
                s.cursor = 0;
            }
            clear_anchor_if_not_extending(&mut s, extend);
        }

        EditingCommand::MoveDown { extend } => {
            set_anchor_if_extending(&mut s, extend);
            let x = layout.caret_x_at(&s.text, s.cursor);
            let metrics = layout.line_metrics(&s.text);
            let line_idx = line_index_for_offset_utf8(&metrics, s.cursor);
            if line_idx + 1 < metrics.len() {
                let next = &metrics[line_idx + 1];
                let target_y = next.baseline - next.ascent * 0.5;
                // Delegate to position_at_point; implementations handle empty lines.
                s.cursor = layout.position_at_point(&s.text, x, target_y.max(0.0));
            } else {
                s.cursor = s.text.len();
            }
            clear_anchor_if_not_extending(&mut s, extend);
        }

        EditingCommand::MoveHome { extend } => {
            set_anchor_if_extending(&mut s, extend);
            let metrics = layout.line_metrics(&s.text);
            let line_idx = line_index_for_offset_utf8(&metrics, s.cursor);
            s.cursor = metrics[line_idx].start_index;
            clear_anchor_if_not_extending(&mut s, extend);
        }

        EditingCommand::MoveEnd { extend } => {
            set_anchor_if_extending(&mut s, extend);
            let metrics = layout.line_metrics(&s.text);
            let line_idx = line_index_for_offset_utf8(&metrics, s.cursor);
            let lm = &metrics[line_idx];
            let mut end = lm.end_index.min(s.text.len());
            // Step back over trailing newline so caret sits before it visually.
            if end > 0 && s.text[..end].ends_with('\n') {
                end = prev_grapheme_boundary(&s.text, end);
            }
            s.cursor = end;
            clear_anchor_if_not_extending(&mut s, extend);
        }

        EditingCommand::MovePageUp { extend } => {
            set_anchor_if_extending(&mut s, extend);
            let metrics = layout.line_metrics(&s.text);
            if metrics.is_empty() {
                s.cursor = 0;
            } else {
                let line_height =
                    (metrics[0].ascent + metrics[0].descent).max(1.0);
                let visible_lines =
                    (layout.viewport_height() / line_height).floor().max(1.0) as usize;
                let line_idx = line_index_for_offset_utf8(&metrics, s.cursor);
                let steps = visible_lines.min(line_idx);
                if steps == 0 {
                    s.cursor = 0;
                } else {
                    let target_line = line_idx - steps;
                    let target_y = metrics[target_line].baseline
                        - metrics[target_line].ascent * 0.5;
                    let x = layout.caret_x_at(&s.text, s.cursor);
                    s.cursor = layout.position_at_point(&s.text, x, target_y.max(0.0));
                }
            }
            clear_anchor_if_not_extending(&mut s, extend);
        }

        EditingCommand::MovePageDown { extend } => {
            set_anchor_if_extending(&mut s, extend);
            let metrics = layout.line_metrics(&s.text);
            if metrics.is_empty() {
                s.cursor = s.text.len();
            } else {
                let line_height =
                    (metrics[0].ascent + metrics[0].descent).max(1.0);
                let visible_lines =
                    (layout.viewport_height() / line_height).floor().max(1.0) as usize;
                let line_idx = line_index_for_offset_utf8(&metrics, s.cursor);
                let remaining = metrics.len().saturating_sub(1).saturating_sub(line_idx);
                let steps = visible_lines.min(remaining);
                if steps == 0 {
                    s.cursor = s.text.len();
                } else {
                    let target_line = line_idx + steps;
                    let target_y = metrics[target_line].baseline
                        - metrics[target_line].ascent * 0.5;
                    let x = layout.caret_x_at(&s.text, s.cursor);
                    s.cursor = layout.position_at_point(&s.text, x, target_y.max(0.0));
                }
            }
            clear_anchor_if_not_extending(&mut s, extend);
        }

        EditingCommand::MoveWordLeft { extend } => {
            set_anchor_if_extending(&mut s, extend);
            let mut pos = s.cursor;
            loop {
                let old = pos;
                let (seg_start, _) = layout.word_boundary_at(&s.text, pos);
                pos = if seg_start < old {
                    seg_start
                } else if old > 0 {
                    let prev = prev_grapheme_boundary(&s.text, old);
                    layout.word_boundary_at(&s.text, prev).0
                } else {
                    break;
                };
                if pos == old {
                    break;
                }
                if !s.text[pos..old].chars().all(|c| c.is_whitespace()) {
                    break;
                }
            }
            s.cursor = pos;
            clear_anchor_if_not_extending(&mut s, extend);
        }

        EditingCommand::MoveWordRight { extend } => {
            set_anchor_if_extending(&mut s, extend);
            let mut pos = s.cursor;
            loop {
                let old = pos;
                let (_, seg_end) = layout.word_boundary_at(&s.text, pos);
                pos = if seg_end > old {
                    seg_end
                } else if old < s.text.len() {
                    let next = next_grapheme_boundary(&s.text, old);
                    layout.word_boundary_at(&s.text, next).1
                } else {
                    break;
                };
                if pos == old {
                    break;
                }
                if !s.text[old..pos].chars().all(|c| c.is_whitespace()) {
                    break;
                }
            }
            s.cursor = pos.min(s.text.len());
            clear_anchor_if_not_extending(&mut s, extend);
        }

        EditingCommand::MoveTo { x, y } => {
            let pos = layout.position_at_point(&s.text, x, y);
            s.cursor = pos;
            s.anchor = None;
        }

        EditingCommand::ExtendTo { x, y } => {
            if s.anchor.is_none() {
                s.anchor = Some(s.cursor);
            }
            s.cursor = layout.position_at_point(&s.text, x, y);
        }

        EditingCommand::SelectWordAt { x, y } => {
            let pos = layout.position_at_point(&s.text, x, y);
            let (start, end) = layout.word_boundary_at(&s.text, pos);
            s.anchor = Some(start);
            s.cursor = end;
        }

        EditingCommand::SelectLineAt { x, y } => {
            let pos = layout.position_at_point(&s.text, x, y);
            let metrics = layout.line_metrics(&s.text);
            if metrics.is_empty() {
                s.anchor = Some(0);
                s.cursor = s.text.len();
            } else {
                let idx = line_index_for_offset_utf8(&metrics, pos);
                let lm = &metrics[idx];
                s.anchor = Some(lm.start_index);
                s.cursor = lm.end_index.min(s.text.len());
            }
        }
    }

    debug_assert!(
        s.cursor <= s.text.len() && s.text.is_char_boundary(s.cursor),
        "apply_command produced invalid cursor {} for text len {}",
        s.cursor,
        s.text.len(),
    );
    debug_assert!(
        s.anchor.map_or(true, |a| a <= s.text.len() && s.text.is_char_boundary(a)),
        "apply_command produced invalid anchor {:?} for text len {}",
        s.anchor,
        s.text.len(),
    );

    s
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

fn delete_selection_in_place(s: &mut TextEditorState) -> usize {
    if let Some((lo, hi)) = s.selection_range() {
        s.text.drain(lo..hi);
        s.anchor = None;
        lo
    } else {
        s.cursor
    }
}

fn set_anchor_if_extending(s: &mut TextEditorState, extend: bool) {
    if extend && s.anchor.is_none() {
        s.anchor = Some(s.cursor);
    }
}

fn clear_anchor_if_not_extending(s: &mut TextEditorState, extend: bool) {
    if !extend {
        s.anchor = None;
    }
}

/// line_index_for_offset using UTF-8 metrics (mirrors the Skia-agnostic version).
pub fn line_index_for_offset_utf8(metrics: &[LineMetrics], utf8_offset: usize) -> usize {
    for (i, lm) in metrics.iter().enumerate().rev() {
        if lm.start_index <= utf8_offset {
            return i;
        }
    }
    0
}

#[cfg(test)]
mod tests;
