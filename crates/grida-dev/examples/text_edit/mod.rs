pub mod layout;
pub mod simple_layout;

pub use layout::{line_index_for_offset, LineMetrics, TextLayoutEngine};
pub use simple_layout::SimpleLayoutEngine;

use unicode_segmentation::UnicodeSegmentation;

// ---------------------------------------------------------------------------
// UTF-8 ↔ UTF-16 helpers  (pub so SkiaLayoutEngine in the example can reuse)
// ---------------------------------------------------------------------------

pub fn utf8_to_utf16_offset(text: &str, utf8: usize) -> usize {
    text[..utf8.min(text.len())].encode_utf16().count()
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
    Delete,
    MoveLeft { extend: bool },
    MoveRight { extend: bool },
    MoveDocStart { extend: bool },
    MoveDocEnd { extend: bool },
    SelectAll,
    /// Directly set cursor (and optionally anchor).  Used when the caller
    /// has already computed the desired offset (e.g. from drag state).
    SetCursorPos { pos: usize, anchor: Option<usize> },

    // --- need layout ---
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

        EditingCommand::Delete => {
            if s.has_selection() {
                s.cursor = delete_selection_in_place(&mut s);
            } else if s.cursor < s.text.len() {
                let next = next_grapheme_boundary(&s.text, s.cursor);
                s.text.drain(s.cursor..next);
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
            let (start, _) = layout.word_boundary_at(&s.text, s.cursor);
            if start < s.cursor {
                s.cursor = start;
            } else if s.cursor > 0 {
                let (start2, _) = layout.word_boundary_at(&s.text, s.cursor - 1);
                s.cursor = start2;
            }
            clear_anchor_if_not_extending(&mut s, extend);
        }

        EditingCommand::MoveWordRight { extend } => {
            set_anchor_if_extending(&mut s, extend);
            let (_, end) = layout.word_boundary_at(&s.text, s.cursor);
            if end > s.cursor {
                s.cursor = end;
            } else if s.cursor < s.text.len() {
                let (_, end2) = layout.word_boundary_at(&s.text, s.cursor + 1);
                s.cursor = end2;
            }
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
