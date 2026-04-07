//! Rich text editing session.
//!
//! [`TextEditSession`] bundles the pure editing state ([`TextEditorState`]),
//! a layout engine implementing [`ManagedTextLayout`], and an
//! [`AttributedText`] content model into a single, self-contained editing
//! session.
//!
//! The session is generic over the layout backend `L: ManagedTextLayout`.
//! Built-in implementations:
//! - `SkiaLayoutEngine` — real shaping via Skia Paragraph (behind `skia` feature).
//! - `SimpleLayoutEngine` — monospace, no wrapping; for deterministic tests.
//!
//! External consumers (e.g. `grida-canvas`) can provide their own implementation
//! that delegates to the host's paragraph cache.
//!
//! This is the primary integration point that hosts (WASM canvas, winit
//! desktop, headless tests) consume. The session does **not** own any
//! rendering surface or window — drawing is the host's responsibility.
//! The session exposes the layout engine and geometry queries needed to
//! render text, caret, and selection overlays.
//!
//! # Feature status
//!
//! ## Editing
//!
//! - [x] Text insertion — IME commit + direct character input
//! - [x] Backspace — delete grapheme before cursor (or selected range)
//! - [x] Delete — delete grapheme after cursor (or selected range)
//! - [x] Word-granularity backspace/delete (UAX #29)
//! - [x] Line-granularity backspace/delete
//! - [x] Enter — insert newline
//! - [x] Tab — insert 4 spaces
//!
//! ## Cursor movement
//!
//! - [x] Left/Right — grapheme-cluster navigation
//! - [x] Up/Down — line-aware navigation (Skia line metrics + position_at_point)
//! - [x] Home/End — line start/end
//! - [x] PageUp/PageDown — move by visible lines
//! - [x] Cmd+Left/Right — line start/end (macOS)
//! - [x] Cmd+Up/Down — document start/end (macOS)
//! - [x] Option+Left/Right — word jump (macOS)
//! - [x] Ctrl+Left/Right — word jump (Windows/Linux)
//!
//! ## Selection
//!
//! - [x] Shift+arrow — extend selection in any direction
//! - [x] Shift+modifier — extend selection with the same jumps as above
//! - [x] Pointer click — place cursor
//! - [x] Pointer drag — drag-to-select range
//! - [x] Shift+click — extend selection from current cursor to click position
//! - [x] Double-click — select word (Skia `get_word_boundary`)
//! - [x] Triple-click — select visual line (Skia `get_line_metrics`)
//! - [x] Quad-click — select entire document
//! - [x] Cmd/Ctrl+A — select all
//!
//! ## Clipboard
//!
//! - [x] Copy/Cut — HTML + plain text (via [`selected_html`](TextEditSession::selected_html))
//! - [x] Paste — HTML with formatting, or plain text fallback
//!   (via [`paste_attributed`](TextEditSession::paste_attributed))
//!
//! ## Rendering (host responsibility, session provides data)
//!
//! - [x] Multiline text with wrapping
//! - [x] Cursor blink (500 ms, resets on any input)
//! - [x] Selection highlight (Skia `get_rects_for_range`)
//! - [x] Empty-line selection invariant (configurable via [`EmptyLineSelectionPolicy`](crate::EmptyLineSelectionPolicy))
//! - [x] IME composition (preedit rendered inline with underline)
//!
//! ## History
//!
//! - [x] Undo/redo — snapshot-based with merge grouping
//!   (consecutive typing, backspace, or delete are grouped; paste,
//!   newline, and IME commit are discrete steps; style changes are
//!   discrete steps; snapshots capture both text and style runs)
//!
//! ## Rich text (per-run styling via [`AttributedText`])
//!
//! - [x] Toggle bold (variable font `wght` axis)
//! - [x] Toggle italic (real italic typeface)
//! - [x] Toggle underline
//! - [x] Toggle strikethrough
//! - [x] Adjust font size (delta, clamped to >= 1.0)
//! - [x] Set font size (absolute)
//! - [x] Set font family
//! - [x] Set text color
//! - [x] Caret style override (toggle with no selection sets typing style)
//! - [x] Per-run layout via Skia ParagraphBuilder (pushStyle/addText per run)
//! - [x] Variable font axis interpolation (wght, opsz via FontArguments)
//!
//! ## Scroll
//!
//! - [x] Vertical scroll (caller provides delta)
//! - [x] Auto-scroll to keep cursor visible
//! - [x] Scroll clamping
//! - [x] Scroll anchoring on width reflow (first visible line stays pinned)
//!
//! ## Not yet implemented
//!
//! - [ ] Visual-order bidi cursor movement

use super::time::{Duration, Instant};

use super::{
    apply_command_mut,
    attributed_text::{
        html::{html_to_attributed_text, runs_to_html},
        AttributedText, CGColor, Paint, TextDecorationLine, TextStyle as AttrTextStyle,
    },
    history::{EditKind, GenericEditHistory},
    layout::{line_index_for_offset, CaretRect, ManagedTextLayout},
    EditDelta, EditingCommand, TextEditorState,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default cursor blink interval.
pub const BLINK_INTERVAL: Duration = Duration::from_millis(500);

// ---------------------------------------------------------------------------
// KeyAction — platform-neutral keyboard intent
// ---------------------------------------------------------------------------

/// A platform-neutral description of what a key press *means* for text editing.
///
/// Hosts translate their platform-specific key events (winit `KeyboardInput`,
/// browser `KeyboardEvent`, etc.) into a `KeyAction` and pass it to
/// [`TextEditSession::handle_key_action`]. This keeps the modifier → intent
/// mapping (Cmd vs Ctrl, Alt vs Option, etc.) in one place.
///
/// `KeyAction` deliberately does **not** include clipboard operations (copy,
/// cut, paste) because those require host-specific I/O (system clipboard
/// access). The host handles clipboard keys itself, calling the session's
/// `selected_html()`, `paste_attributed()`, etc. directly.
#[derive(Clone, Debug, PartialEq)]
pub enum KeyAction {
    /// Insert a character or string.
    Insert(String),
    /// Insert a newline.
    Newline,
    /// Insert a tab (typically 4 spaces).
    Tab,

    // -- Deletion --
    Backspace,
    BackspaceWord,
    BackspaceLine,
    Delete,
    DeleteWord,
    DeleteLine,

    // -- Movement (`extend` = Shift held → extend selection) --
    MoveLeft {
        extend: bool,
    },
    MoveRight {
        extend: bool,
    },
    MoveUp {
        extend: bool,
    },
    MoveDown {
        extend: bool,
    },
    MoveWordLeft {
        extend: bool,
    },
    MoveWordRight {
        extend: bool,
    },
    MoveHome {
        extend: bool,
    },
    MoveEnd {
        extend: bool,
    },
    MoveDocStart {
        extend: bool,
    },
    MoveDocEnd {
        extend: bool,
    },
    MovePageUp {
        extend: bool,
    },
    MovePageDown {
        extend: bool,
    },

    // -- Selection --
    SelectAll,

    // -- History --
    Undo,
    Redo,

    // -- Rich text formatting --
    ToggleBold,
    ToggleItalic,
    ToggleUnderline,
    ToggleStrikethrough,
    IncreaseFontSize,
    DecreaseFontSize,

    // -- IME --
    /// IME composition update (preedit string).
    ImePreedit(String),
    /// IME commit (finalized text).
    ImeCommit(String),
}

impl KeyAction {
    /// Build a `KeyAction` from platform-neutral modifier flags and a key name.
    ///
    /// This is the "standard keyboard shortcut mapping" that every text editor
    /// uses. The host calls this with its own modifier state translated into
    /// the four booleans:
    ///
    /// - `cmd`: Cmd (macOS) or Ctrl (Windows/Linux) — the "primary" modifier.
    /// - `word`: Option (macOS) or Ctrl (Windows/Linux) — the "word jump" modifier.
    /// - `shift`: Shift key.
    /// - `key`: A platform-neutral key identifier (see [`KeyName`]).
    ///
    /// Returns `Some(action)` for recognized editing keys, `None` for keys
    /// the session doesn't handle (the host may handle them, e.g. function keys).
    pub fn from_key(cmd: bool, word: bool, shift: bool, key: &KeyName) -> Option<Self> {
        match key {
            KeyName::ArrowLeft => Some(if cmd {
                Self::MoveHome { extend: shift }
            } else if word {
                Self::MoveWordLeft { extend: shift }
            } else {
                Self::MoveLeft { extend: shift }
            }),
            KeyName::ArrowRight => Some(if cmd {
                Self::MoveEnd { extend: shift }
            } else if word {
                Self::MoveWordRight { extend: shift }
            } else {
                Self::MoveRight { extend: shift }
            }),
            KeyName::ArrowUp => Some(if cmd {
                Self::MoveDocStart { extend: shift }
            } else {
                Self::MoveUp { extend: shift }
            }),
            KeyName::ArrowDown => Some(if cmd {
                Self::MoveDocEnd { extend: shift }
            } else {
                Self::MoveDown { extend: shift }
            }),
            KeyName::Home => Some(Self::MoveHome { extend: shift }),
            KeyName::End => Some(Self::MoveEnd { extend: shift }),
            KeyName::PageUp => Some(Self::MovePageUp { extend: shift }),
            KeyName::PageDown => Some(Self::MovePageDown { extend: shift }),

            KeyName::Backspace => Some(if cmd {
                Self::BackspaceLine
            } else if word {
                Self::BackspaceWord
            } else {
                Self::Backspace
            }),
            KeyName::Delete => Some(if cmd {
                Self::DeleteLine
            } else if word {
                Self::DeleteWord
            } else {
                Self::Delete
            }),
            KeyName::Enter => Some(Self::Newline),
            KeyName::Tab => Some(Self::Tab),
            KeyName::Space if !cmd => Some(Self::Insert(" ".into())),

            // Cmd/Ctrl shortcuts
            KeyName::Letter('a') if cmd => Some(Self::SelectAll),
            KeyName::Letter('z') if cmd && shift => Some(Self::Redo),
            KeyName::Letter('z') if cmd => Some(Self::Undo),
            KeyName::Letter('b') if cmd => Some(Self::ToggleBold),
            KeyName::Letter('i') if cmd => Some(Self::ToggleItalic),
            KeyName::Letter('u') if cmd => Some(Self::ToggleUnderline),
            KeyName::Letter('x') if cmd && shift => Some(Self::ToggleStrikethrough),
            KeyName::Period if cmd && shift => Some(Self::IncreaseFontSize),
            KeyName::Comma if cmd && shift => Some(Self::DecreaseFontSize),

            // Character insertion (only when no cmd modifier and no IME active)
            KeyName::Character(c) if !cmd => Some(Self::Insert(c.clone())),

            _ => None,
        }
    }
}

/// Platform-neutral key identifiers used by [`KeyAction::from_key`].
///
/// Hosts map their platform-specific key codes to these variants.
/// Only keys relevant to text editing are included.
#[derive(Clone, Debug, PartialEq)]
pub enum KeyName {
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    ArrowDown,
    Home,
    End,
    PageUp,
    PageDown,
    Backspace,
    Delete,
    Enter,
    Tab,
    Space,
    /// A-Z (lowercase). For shortcut matching only — actual character
    /// insertion uses [`Character`](Self::Character).
    Letter(char),
    /// 0-9. For shortcut matching (e.g. Shift+1 = zoom to fit).
    /// The bridge normalizes shifted symbols (`!@#…`) back to digits.
    Digit(u8),
    /// `.` key (for Cmd+Shift+> = increase font size).
    Period,
    /// `,` key (for Cmd+Shift+< = decrease font size).
    Comma,
    /// A printable character or string (from the OS key event).
    Character(String),
    /// Escape key. Not used for text editing commands, but useful for
    /// the application layer to detect exit-edit-mode intent.
    Escape,
}

// ---------------------------------------------------------------------------
// ClickTracker — multi-click detection
// ---------------------------------------------------------------------------

/// Tracks multi-click sequences (double-click, triple-click, etc.).
///
/// Call [`register`](Self::register) on each pointer-down event. It returns
/// the click count (1 = single, 2 = double/word, 3 = triple/line, 4+ = all).
///
/// The tracker uses a time window and distance threshold to determine
/// whether consecutive clicks form a sequence.
#[derive(Debug, Clone)]
pub struct ClickTracker {
    count: u32,
    last_time: Option<Instant>,
    last_pos: (f32, f32),
    /// Maximum time between clicks to count as a sequence.
    pub timeout: Duration,
    /// Maximum distance (in either axis) between clicks to count as a sequence.
    pub distance: f32,
}

impl Default for ClickTracker {
    fn default() -> Self {
        Self {
            count: 0,
            last_time: None,
            last_pos: (0.0, 0.0),
            timeout: Duration::from_millis(400),
            distance: 5.0,
        }
    }
}

impl ClickTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a click at position `(x, y)`. Returns the click count
    /// (1, 2, 3, or 4 — capped at 4).
    pub fn register(&mut self, x: f32, y: f32) -> u32 {
        let now = Instant::now();
        let in_sequence = self
            .last_time
            .map(|t| {
                now.duration_since(t) < self.timeout
                    && (self.last_pos.0 - x).abs() < self.distance
                    && (self.last_pos.1 - y).abs() < self.distance
            })
            .unwrap_or(false);

        self.count = if in_sequence {
            (self.count + 1).min(4)
        } else {
            1
        };
        self.last_time = Some(now);
        self.last_pos = (x, y);
        self.count
    }

    /// Reset the click sequence (e.g. on focus loss).
    pub fn reset(&mut self) {
        self.count = 0;
        self.last_time = None;
    }
}

// ---------------------------------------------------------------------------
// Snapshot for undo/redo
// ---------------------------------------------------------------------------

/// Snapshot capturing both editor state and attributed text for undo/redo.
#[derive(Clone)]
pub struct RichTextSnapshot {
    pub state: TextEditorState,
    pub content: AttributedText,
}

// ---------------------------------------------------------------------------
// ScrollAnchor — reading-position snapshot for reflow
// ---------------------------------------------------------------------------

/// Snapshot of the user's reading position before a reflow operation.
///
/// Captures the byte offset of the first visible line and the pixel distance
/// from that line's top to `scroll_y`, so the same content can be pinned to
/// the same screen position after the layout changes.
struct ScrollAnchor {
    /// `start_index` of the first visible line before reflow.
    byte_offset: usize,
    /// `scroll_y - line.top()` — the fractional pixel offset within that line.
    offset_within_line: f32,
}

// ---------------------------------------------------------------------------
// TextEditSession
// ---------------------------------------------------------------------------

/// A self-contained rich text editing session.
///
/// Bundles editing state, layout engine, attributed content, history,
/// cursor blink, pointer tracking, IME composition, and scroll.
///
/// Generic over the layout backend `L`. Built-in options:
/// - `SkiaLayoutEngine` (behind `skia` feature) — real shaping.
/// - `SimpleLayoutEngine` — monospace, for tests.
///
/// Hosts create a session, feed events into it, and use the exposed
/// layout engine + geometry queries to render.
pub struct TextEditSession<L: ManagedTextLayout> {
    /// Pure editing state: text, cursor, anchor.
    pub state: TextEditorState,

    /// Layout engine (generic — could be Skia, simple, or host-provided).
    pub layout: L,

    /// Attributed text model (runs of styled text).
    pub content: AttributedText,

    /// Explicit caret style override (set by Cmd+B/I/U with no selection).
    /// Cleared on cursor movement.
    caret_style_override: Option<AttrTextStyle>,

    // -- Blink state --
    cursor_visible: bool,
    last_blink: Instant,

    // -- Pointer state --
    mouse_down: bool,
    drag_anchor_utf8: Option<usize>,

    // -- IME --
    /// Active IME preedit string (NOT in state.text; rendered inline).
    preedit: Option<String>,

    /// Undo / redo history capturing both text and style state.
    history: GenericEditHistory<RichTextSnapshot>,

    /// Vertical scroll offset in layout-local pixels.
    scroll_y: f32,

    /// Cached caret rectangle — avoids redundant recomputation within a frame.
    /// Invalidated (set to `None`) whenever cursor or text changes.
    cached_caret_rect: Option<CaretRect>,
}

impl<L: ManagedTextLayout> TextEditSession<L> {
    /// Create a new empty editing session with the given layout engine and
    /// default style.
    pub fn new(layout: L, default_style: AttrTextStyle) -> Self {
        Self {
            state: TextEditorState::with_cursor(String::new(), 0),
            layout,
            content: AttributedText::empty(default_style),
            caret_style_override: None,
            cursor_visible: true,
            last_blink: Instant::now(),
            mouse_down: false,
            drag_anchor_utf8: None,
            preedit: None,
            history: GenericEditHistory::new(),
            scroll_y: 0.0,
            cached_caret_rect: None,
        }
    }

    /// Create a session pre-loaded with text content.
    pub fn with_content(layout: L, content: AttributedText) -> Self {
        let text = content.text().to_owned();
        let cursor = text.len();
        Self {
            state: TextEditorState::with_cursor(text, cursor),
            layout,
            content,
            caret_style_override: None,
            cursor_visible: true,
            last_blink: Instant::now(),
            mouse_down: false,
            drag_anchor_utf8: None,
            preedit: None,
            history: GenericEditHistory::new(),
            scroll_y: 0.0,
            cached_caret_rect: None,
        }
    }

    // -----------------------------------------------------------------------
    // Invariant: state.text == content.text()
    // -----------------------------------------------------------------------

    /// Assert that the two text copies (`state.text` and `content.text()`)
    /// are identical.
    ///
    /// This is a **debug-only** check (compiled away in release builds).
    /// The dual-source-of-truth design means mutations update one copy
    /// and then patch the other. If any code path forgets to synchronize,
    /// this assertion will catch it immediately.
    #[inline]
    fn assert_text_synced(&self) {
        debug_assert_eq!(
            self.state.text,
            self.content.text(),
            "BUG: TextEditSession state.text and content.text() diverged"
        );
    }

    // -----------------------------------------------------------------------
    // Accessors
    // -----------------------------------------------------------------------

    /// Current caret style override (if set).
    pub fn caret_style_override(&self) -> Option<&AttrTextStyle> {
        self.caret_style_override.as_ref()
    }

    /// Set the caret style override explicitly (e.g., from a property panel).
    pub fn set_caret_style_override(&mut self, style: Option<AttrTextStyle>) {
        self.caret_style_override = style;
    }

    /// Whether the cursor is currently in its visible blink phase.
    ///
    /// **Prefer [`should_show_caret`](Self::should_show_caret)** for
    /// rendering decisions — it combines blink state with selection state.
    pub fn cursor_visible(&self) -> bool {
        self.cursor_visible
    }

    /// Whether the caret should be painted this frame.
    ///
    /// Combines the blink phase (`cursor_visible`) with the selection
    /// state: when text is selected, the caret is hidden regardless of
    /// the blink timer.  This is the single authority for "should I draw
    /// the caret?" — callers should not need to check `has_selection()`
    /// separately.
    pub fn should_show_caret(&self) -> bool {
        self.state.should_show_caret() && self.cursor_visible
    }

    /// Whether a mouse drag is in progress.
    pub fn is_mouse_down(&self) -> bool {
        self.mouse_down
    }

    /// Current IME preedit string, if any.
    pub fn preedit(&self) -> Option<&str> {
        self.preedit.as_deref()
    }

    /// Current vertical scroll offset.
    pub fn scroll_y(&self) -> f32 {
        self.scroll_y
    }

    /// Set the scroll offset directly.
    pub fn set_scroll_y(&mut self, y: f32) {
        self.scroll_y = y;
        self.clamp_scroll();
    }

    pub fn has_selection(&self) -> bool {
        self.state.has_selection()
    }

    pub fn selected_text(&self) -> Option<&str> {
        self.state.selected_text()
    }

    pub fn selection_range(&self) -> Option<(usize, usize)> {
        self.state.selection_range()
    }

    // -----------------------------------------------------------------------
    // Caret geometry (cached)
    // -----------------------------------------------------------------------

    /// Return the caret rectangle, using a per-frame cache.
    ///
    /// When an IME preedit is active, the caret is positioned at the
    /// **end** of the preedit text (not the committed cursor offset).
    /// This is computed by laying out the display text (committed text
    /// with preedit spliced in) and querying the caret at
    /// `cursor + preedit.len()`.
    pub fn caret_rect(&mut self) -> CaretRect {
        if let Some(ref cr) = self.cached_caret_rect {
            return cr.clone();
        }
        let cr = match self.preedit.as_deref() {
            Some(preedit) if !preedit.is_empty() => {
                let cursor = self.state.cursor;
                let text = &self.state.text;
                let mut display = String::with_capacity(text.len() + preedit.len());
                display.push_str(&text[..cursor]);
                display.push_str(preedit);
                display.push_str(&text[cursor..]);
                self.layout.caret_rect_at(&display, cursor + preedit.len())
            }
            _ => self
                .layout
                .caret_rect_at(&self.state.text, self.state.cursor),
        };
        self.cached_caret_rect = Some(cr.clone());
        cr
    }

    /// Invalidate the cached caret rect (call after cursor/text changes).
    pub fn invalidate_caret_cache(&mut self) {
        self.cached_caret_rect = None;
    }

    // -----------------------------------------------------------------------
    // Snapshot helpers
    // -----------------------------------------------------------------------

    /// Capture the current state + content as a snapshot for history.
    fn snapshot(&self) -> RichTextSnapshot {
        RichTextSnapshot {
            state: self.state.clone(),
            content: self.content.clone(),
        }
    }

    /// Restore from a snapshot.
    fn restore(&mut self, snap: RichTextSnapshot) {
        self.state = snap.state;
        self.content = snap.content;
        self.assert_text_synced();
        self.caret_style_override = None;
        self.cached_caret_rect = None;
        self.layout.invalidate();
        self.layout.ensure_layout(&self.content);
        self.ensure_cursor_visible();
    }

    // -----------------------------------------------------------------------
    // Core: apply an editing command (text mutation)
    // -----------------------------------------------------------------------

    /// Apply an editing command, recording undo history automatically.
    pub fn apply(&mut self, cmd: EditingCommand) {
        let kind = cmd.edit_kind();
        let pre_snapshot = kind.and_then(|k| {
            if !self.history.would_merge(k) {
                Some((self.snapshot(), k))
            } else {
                None
            }
        });
        let merge_kind = if pre_snapshot.is_none() { kind } else { None };

        let old_cursor = self.state.cursor;
        let delta = apply_command_mut(&mut self.state, cmd, &mut self.layout);
        self.invalidate_caret_cache();
        if let Some(d) = delta {
            if let Some((snap, k)) = pre_snapshot {
                self.history.push(&snap, k);
            } else if let Some(k) = merge_kind {
                self.history.push_merge(k);
            }
            self.sync_content_with_delta(&d, old_cursor);
        } else if self.state.cursor != old_cursor {
            self.caret_style_override = None;
        }
        self.assert_text_synced();
        self.reset_blink();
        self.layout.ensure_layout(&self.content);
        self.ensure_cursor_visible();
    }

    /// Apply a command with an explicit edit kind (for IME commits, paste, etc.).
    pub fn apply_with_kind(&mut self, cmd: EditingCommand, kind: EditKind) {
        let pre_snapshot = if !self.history.would_merge(kind) {
            Some(self.snapshot())
        } else {
            None
        };

        let old_cursor = self.state.cursor;
        let delta = apply_command_mut(&mut self.state, cmd, &mut self.layout);
        self.invalidate_caret_cache();
        if let Some(d) = delta {
            if let Some(snap) = pre_snapshot {
                self.history.push(&snap, kind);
            } else {
                self.history.push_merge(kind);
            }
            self.sync_content_with_delta(&d, old_cursor);
        } else if self.state.cursor != old_cursor {
            self.caret_style_override = None;
        }
        self.assert_text_synced();
        self.reset_blink();
        self.layout.ensure_layout(&self.content);
        self.ensure_cursor_visible();
    }

    /// Update the `AttributedText` content using the edit delta returned by
    /// `apply_command_mut` — O(1) offset lookup instead of O(n) text diff.
    fn sync_content_with_delta(&mut self, delta: &EditDelta, old_cursor: usize) {
        let insert_style = self
            .caret_style_override
            .clone()
            .unwrap_or_else(|| self.content.caret_style_at(old_cursor as u32).clone());

        let old_end = delta.offset + delta.old_len;
        let new_end = delta.offset + delta.new_len;

        if delta.old_len > 0 {
            self.content.delete(delta.offset, old_end);
        }
        if delta.new_len > 0 {
            let inserted = &self.state.text[delta.offset..new_end];
            self.content
                .insert_with_style(delta.offset, inserted, insert_style);
        }

        self.layout.invalidate();
        self.caret_style_override = None;
    }

    // -----------------------------------------------------------------------
    // Undo / redo
    // -----------------------------------------------------------------------

    /// Undo the last edit. Returns `true` if an undo was performed.
    pub fn undo(&mut self) -> bool {
        if let Some(prev) = self.history.undo(&self.snapshot()) {
            self.restore(prev);
            self.reset_blink();
            true
        } else {
            false
        }
    }

    /// Redo the last undone edit. Returns `true` if a redo was performed.
    pub fn redo(&mut self) -> bool {
        if let Some(next) = self.history.redo(&self.snapshot()) {
            self.restore(next);
            self.reset_blink();
            true
        } else {
            false
        }
    }

    // -----------------------------------------------------------------------
    // Rich text: style toggles
    // -----------------------------------------------------------------------

    /// Toggle bold on the selection, or set caret style override.
    pub fn toggle_bold(&mut self) {
        if let Some((lo, hi)) = self.selection_range() {
            self.history.push(&self.snapshot(), EditKind::Style);
            let is_bold = self.content.style_at(lo as u32).font_weight >= 700;
            let new_weight = if is_bold { 400 } else { 700 };
            self.content.apply_style(lo, hi, |s| {
                s.font_weight = new_weight;
            });
            self.layout.invalidate();
        } else {
            let current = self.caret_style_override.clone().unwrap_or_else(|| {
                self.content
                    .caret_style_at(self.state.cursor as u32)
                    .clone()
            });
            let mut new_style = current;
            new_style.font_weight = if new_style.font_weight >= 700 {
                400
            } else {
                700
            };
            self.caret_style_override = Some(new_style);
        }
    }

    /// Toggle italic on the selection, or set caret style override.
    pub fn toggle_italic(&mut self) {
        if let Some((lo, hi)) = self.selection_range() {
            self.history.push(&self.snapshot(), EditKind::Style);
            let is_italic = self.content.style_at(lo as u32).font_style_italic;
            self.content.apply_style(lo, hi, |s| {
                s.font_style_italic = !is_italic;
            });
            self.layout.invalidate();
        } else {
            let current = self.caret_style_override.clone().unwrap_or_else(|| {
                self.content
                    .caret_style_at(self.state.cursor as u32)
                    .clone()
            });
            let mut new_style = current;
            new_style.font_style_italic = !new_style.font_style_italic;
            self.caret_style_override = Some(new_style);
        }
    }

    /// Toggle underline on the selection, or set caret style override.
    pub fn toggle_underline(&mut self) {
        if let Some((lo, hi)) = self.selection_range() {
            self.history.push(&self.snapshot(), EditKind::Style);
            let is_underline = self.content.style_at(lo as u32).text_decoration_line
                == TextDecorationLine::Underline;
            let new_deco = if is_underline {
                TextDecorationLine::None
            } else {
                TextDecorationLine::Underline
            };
            self.content.apply_style(lo, hi, |s| {
                s.text_decoration_line = new_deco;
            });
            self.layout.invalidate();
        } else {
            let current = self.caret_style_override.clone().unwrap_or_else(|| {
                self.content
                    .caret_style_at(self.state.cursor as u32)
                    .clone()
            });
            let mut new_style = current;
            new_style.text_decoration_line =
                if new_style.text_decoration_line == TextDecorationLine::Underline {
                    TextDecorationLine::None
                } else {
                    TextDecorationLine::Underline
                };
            self.caret_style_override = Some(new_style);
        }
    }

    /// Toggle strikethrough on the selection, or set caret style override.
    pub fn toggle_strikethrough(&mut self) {
        if let Some((lo, hi)) = self.selection_range() {
            self.history.push(&self.snapshot(), EditKind::Style);
            let is_strike = self.content.style_at(lo as u32).text_decoration_line
                == TextDecorationLine::LineThrough;
            let new_deco = if is_strike {
                TextDecorationLine::None
            } else {
                TextDecorationLine::LineThrough
            };
            self.content.apply_style(lo, hi, |s| {
                s.text_decoration_line = new_deco;
            });
            self.layout.invalidate();
        } else {
            let current = self.caret_style_override.clone().unwrap_or_else(|| {
                self.content
                    .caret_style_at(self.state.cursor as u32)
                    .clone()
            });
            let mut new_style = current;
            new_style.text_decoration_line =
                if new_style.text_decoration_line == TextDecorationLine::LineThrough {
                    TextDecorationLine::None
                } else {
                    TextDecorationLine::LineThrough
                };
            self.caret_style_override = Some(new_style);
        }
    }

    /// Adjust font size by `delta` (clamped to >= 1.0) on the selection,
    /// or set caret style override.
    pub fn adjust_font_size(&mut self, delta: f32) {
        const MIN_FONT_SIZE: f32 = 1.0;
        if let Some((lo, hi)) = self.selection_range() {
            self.history.push(&self.snapshot(), EditKind::Style);
            self.content.apply_style(lo, hi, |s| {
                s.font_size = (s.font_size + delta).max(MIN_FONT_SIZE);
            });
            self.layout.invalidate();
        } else {
            let current = self.caret_style_override.clone().unwrap_or_else(|| {
                self.content
                    .caret_style_at(self.state.cursor as u32)
                    .clone()
            });
            let mut new_style = current;
            new_style.font_size = (new_style.font_size + delta).max(MIN_FONT_SIZE);
            self.caret_style_override = Some(new_style);
        }
    }

    /// Set a color on the selection or caret style.
    pub fn set_color(&mut self, color: CGColor) {
        if let Some((lo, hi)) = self.selection_range() {
            self.history.push(&self.snapshot(), EditKind::Style);
            self.content.apply_style(lo, hi, |s| {
                s.fills = vec![Paint::from(color)];
            });
            self.layout.invalidate();
        } else {
            let mut style = self.caret_style_override.clone().unwrap_or_else(|| {
                self.content
                    .caret_style_at(self.state.cursor as u32)
                    .clone()
            });
            style.fills = vec![Paint::from(color)];
            self.caret_style_override = Some(style);
        }
    }

    /// Set the font family on the selection or caret style.
    pub fn set_font_family(&mut self, family: &str) {
        let family = family.to_string();
        if let Some((lo, hi)) = self.selection_range() {
            self.history.push(&self.snapshot(), EditKind::Style);
            self.content.apply_style(lo, hi, |s| {
                s.font_family = family.clone();
            });
            self.layout.invalidate();
        } else {
            let mut style = self.caret_style_override.clone().unwrap_or_else(|| {
                self.content
                    .caret_style_at(self.state.cursor as u32)
                    .clone()
            });
            style.font_family = family;
            self.caret_style_override = Some(style);
        }
    }

    /// Set font size on the selection or caret style (absolute, not delta).
    pub fn set_font_size(&mut self, size: f32) {
        let size = size.max(1.0);
        if let Some((lo, hi)) = self.selection_range() {
            self.history.push(&self.snapshot(), EditKind::Style);
            self.content.apply_style(lo, hi, |s| {
                s.font_size = size;
            });
            self.layout.invalidate();
        } else {
            let mut style = self.caret_style_override.clone().unwrap_or_else(|| {
                self.content
                    .caret_style_at(self.state.cursor as u32)
                    .clone()
            });
            style.font_size = size;
            self.caret_style_override = Some(style);
        }
    }

    // -----------------------------------------------------------------------
    // Rich paste: insert an AttributedText (from HTML clipboard)
    // -----------------------------------------------------------------------

    /// Paste attributed text (from HTML clipboard), preserving per-run formatting.
    pub fn paste_attributed(&mut self, pasted: &AttributedText) {
        if pasted.is_empty() {
            return;
        }
        self.history.push(&self.snapshot(), EditKind::Paste);

        // Delete selection if any.
        if let Some((lo, hi)) = self.selection_range() {
            self.content.delete(lo, hi);
            self.state.text = self.content.text().to_owned();
            self.state.cursor = lo;
            self.state.anchor = None;
        }

        let pos = self.state.cursor;

        // Insert each run from the pasted content with its own style.
        for run in pasted.runs() {
            let start = run.start as usize;
            let end = run.end as usize;
            if start >= end || end > pasted.text().len() {
                continue;
            }
            let slice = &pasted.text()[start..end];
            let insert_at = pos + start;
            self.content
                .insert_with_style(insert_at, slice, run.style.clone());
        }

        self.state.text = self.content.text().to_owned();
        self.state.cursor = pos + pasted.text().len();
        self.state.anchor = None;
        self.caret_style_override = None;
        self.assert_text_synced();
        self.invalidate_caret_cache();
        self.layout.invalidate();
        self.reset_blink();
        self.layout.ensure_layout(&self.content);
        self.ensure_cursor_visible();
    }

    // -----------------------------------------------------------------------
    // Clipboard helpers (plain text + HTML)
    // -----------------------------------------------------------------------

    /// Get HTML representation of the selection (for clipboard copy).
    pub fn selected_html(&self) -> Option<String> {
        self.selection_range()
            .map(|(lo, hi)| runs_to_html(&self.content, lo, hi))
    }

    /// Parse HTML clipboard content into an `AttributedText` using the
    /// session's default style as the base.
    pub fn parse_html_paste(&self, html: &str) -> Result<AttributedText, String> {
        let base = self.content.default_style().clone();
        html_to_attributed_text(html, base).map_err(|e| e.to_string())
    }

    // -----------------------------------------------------------------------
    // Convenience command wrappers
    // -----------------------------------------------------------------------

    pub fn insert_text(&mut self, s: &str) {
        self.apply(EditingCommand::Insert(s.to_owned()));
    }

    pub fn backspace(&mut self) {
        self.apply(EditingCommand::Backspace);
    }

    pub fn backspace_word(&mut self) {
        self.apply(EditingCommand::BackspaceWord);
    }

    pub fn backspace_line(&mut self) {
        self.apply(EditingCommand::BackspaceLine);
    }

    pub fn delete_forward(&mut self) {
        self.apply(EditingCommand::Delete);
    }

    pub fn delete_word_forward(&mut self) {
        self.apply(EditingCommand::DeleteWord);
    }

    pub fn delete_line_forward(&mut self) {
        self.apply(EditingCommand::DeleteLine);
    }

    pub fn move_left(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveLeft { extend });
    }

    pub fn move_right(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveRight { extend });
    }

    pub fn move_up(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveUp { extend });
    }

    pub fn move_down(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveDown { extend });
    }

    pub fn move_home(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveHome { extend });
    }

    pub fn move_end(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveEnd { extend });
    }

    pub fn move_doc_start(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveDocStart { extend });
    }

    pub fn move_doc_end(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveDocEnd { extend });
    }

    pub fn move_page_up(&mut self, extend: bool) {
        self.apply(EditingCommand::MovePageUp { extend });
    }

    pub fn move_page_down(&mut self, extend: bool) {
        self.apply(EditingCommand::MovePageDown { extend });
    }

    pub fn move_word_left(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveWordLeft { extend });
    }

    pub fn move_word_right(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveWordRight { extend });
    }

    pub fn select_all(&mut self) {
        self.apply(EditingCommand::SelectAll);
    }

    // -----------------------------------------------------------------------
    // High-level dispatch
    // -----------------------------------------------------------------------

    /// Dispatch a platform-neutral [`KeyAction`] to the session.
    ///
    /// Returns `true` if the session's visible state changed (text, cursor,
    /// selection, or formatting) — i.e., the host should redraw. Returns
    /// `false` for no-op actions (e.g. undo on empty history).
    ///
    /// Clipboard operations (copy/cut/paste) are **not** handled here
    /// because they require host-specific I/O. The host should check for
    /// those keys before calling this method.
    pub fn handle_key_action(&mut self, action: KeyAction) -> bool {
        // Suppress character insertion during active IME composition.
        if self.preedit.is_some() {
            match &action {
                KeyAction::Insert(_) | KeyAction::Tab => return false,
                _ => {}
            }
        }

        match action {
            KeyAction::Insert(s) => {
                self.insert_text(&s);
                true
            }
            KeyAction::Newline => {
                self.insert_text("\n");
                true
            }
            KeyAction::Tab => {
                self.insert_text("    ");
                true
            }

            KeyAction::Backspace => {
                self.backspace();
                true
            }
            KeyAction::BackspaceWord => {
                self.backspace_word();
                true
            }
            KeyAction::BackspaceLine => {
                self.backspace_line();
                true
            }
            KeyAction::Delete => {
                self.delete_forward();
                true
            }
            KeyAction::DeleteWord => {
                self.delete_word_forward();
                true
            }
            KeyAction::DeleteLine => {
                self.delete_line_forward();
                true
            }

            KeyAction::MoveLeft { extend } => {
                self.move_left(extend);
                true
            }
            KeyAction::MoveRight { extend } => {
                self.move_right(extend);
                true
            }
            KeyAction::MoveUp { extend } => {
                self.move_up(extend);
                true
            }
            KeyAction::MoveDown { extend } => {
                self.move_down(extend);
                true
            }
            KeyAction::MoveWordLeft { extend } => {
                self.move_word_left(extend);
                true
            }
            KeyAction::MoveWordRight { extend } => {
                self.move_word_right(extend);
                true
            }
            KeyAction::MoveHome { extend } => {
                self.move_home(extend);
                true
            }
            KeyAction::MoveEnd { extend } => {
                self.move_end(extend);
                true
            }
            KeyAction::MoveDocStart { extend } => {
                self.move_doc_start(extend);
                true
            }
            KeyAction::MoveDocEnd { extend } => {
                self.move_doc_end(extend);
                true
            }
            KeyAction::MovePageUp { extend } => {
                self.move_page_up(extend);
                true
            }
            KeyAction::MovePageDown { extend } => {
                self.move_page_down(extend);
                true
            }

            KeyAction::SelectAll => {
                self.select_all();
                true
            }

            KeyAction::Undo => self.undo(),
            KeyAction::Redo => self.redo(),

            KeyAction::ToggleBold => {
                self.toggle_bold();
                true
            }
            KeyAction::ToggleItalic => {
                self.toggle_italic();
                true
            }
            KeyAction::ToggleUnderline => {
                self.toggle_underline();
                true
            }
            KeyAction::ToggleStrikethrough => {
                self.toggle_strikethrough();
                true
            }
            KeyAction::IncreaseFontSize => {
                self.adjust_font_size(1.0);
                true
            }
            KeyAction::DecreaseFontSize => {
                self.adjust_font_size(-1.0);
                true
            }

            KeyAction::ImePreedit(text) => {
                self.update_preedit(text);
                true
            }
            KeyAction::ImeCommit(text) => {
                self.apply_with_kind(EditingCommand::Insert(text), EditKind::ImeCommit);
                true
            }
        }
    }

    /// Handle a pointer-down click using a [`ClickTracker`]'s count.
    ///
    /// The host calls `click_tracker.register(x, y)` to get the click count,
    /// then passes it here along with layout-local coordinates and whether
    /// Shift is held.
    ///
    /// This centralizes the click_count → action mapping:
    /// - 1 = place cursor (or extend if shift)
    /// - 2 = select word
    /// - 3 = select line
    /// - 4+ = select all
    pub fn handle_click(&mut self, x: f32, y: f32, click_count: u32, shift: bool) {
        if shift && click_count == 1 {
            self.shift_click(x, y);
        } else {
            match click_count {
                1 => self.on_pointer_down(x, y),
                2 => self.select_word_at(x, y),
                3 => self.select_line_at(x, y),
                _ => self.select_all(),
            }
        }
    }

    // -----------------------------------------------------------------------
    // Pointer / mouse events
    // -----------------------------------------------------------------------

    /// Handle a primary pointer down at layout-local coordinates.
    pub fn on_pointer_down(&mut self, x: f32, y: f32) {
        self.mouse_down = true;
        let pos = self.layout.position_at_point(&self.state.text, x, y);
        self.state.cursor = pos;
        self.state.anchor = None;
        self.drag_anchor_utf8 = Some(pos);
        self.invalidate_caret_cache();
        self.reset_blink();
    }

    /// Handle pointer move during a drag (layout-local coordinates).
    pub fn on_pointer_move(&mut self, x: f32, y: f32) {
        if !self.mouse_down {
            return;
        }
        let pos = self.layout.position_at_point(&self.state.text, x, y);
        if let Some(anchor) = self.drag_anchor_utf8 {
            if pos != anchor {
                self.state.anchor = Some(anchor);
                self.state.cursor = pos;
            } else {
                self.state.anchor = None;
                self.state.cursor = pos;
            }
        } else {
            self.drag_anchor_utf8 = Some(pos);
            self.state.cursor = pos;
        }
        self.invalidate_caret_cache();
    }

    /// Handle pointer up (end of drag gesture).
    pub fn on_pointer_up(&mut self) {
        self.mouse_down = false;
        self.drag_anchor_utf8 = None;
    }

    /// Handle shift-click: extend selection to the clicked point.
    pub fn shift_click(&mut self, x: f32, y: f32) {
        self.apply(EditingCommand::ExtendTo { x, y });
        self.reset_blink();
    }

    /// Select the word at the given layout-local point (double-click).
    pub fn select_word_at(&mut self, x: f32, y: f32) {
        self.apply(EditingCommand::SelectWordAt { x, y });
        self.mouse_down = false;
        self.drag_anchor_utf8 = None;
    }

    /// Select the line at the given layout-local point (triple-click).
    pub fn select_line_at(&mut self, x: f32, y: f32) {
        self.apply(EditingCommand::SelectLineAt { x, y });
        self.mouse_down = false;
        self.drag_anchor_utf8 = None;
    }

    // -----------------------------------------------------------------------
    // Layout sizing
    // -----------------------------------------------------------------------

    /// Set the available layout width and rebuild layout.
    ///
    /// Uses **scroll anchoring** to keep the user's reading position stable
    /// across reflow: the first visible line before the width change stays
    /// at the same screen-y after the width change.
    pub fn set_layout_width(&mut self, w: f32) {
        // 1. Snapshot the scroll anchor before reflow.
        let anchor = self.scroll_anchor();

        // 2. Rebuild layout at the new width.
        self.layout.set_layout_width(w.max(1.0));
        self.layout.ensure_layout(&self.content);
        self.cached_caret_rect = None;

        // 3. Restore scroll position from anchor, then clamp.
        self.restore_scroll_anchor(anchor);
    }

    /// Set the available layout height (viewport height).
    pub fn set_layout_height(&mut self, h: f32) {
        self.layout.set_layout_height(h.max(1.0));
        self.clamp_scroll();
    }

    // -----------------------------------------------------------------------
    // Scroll
    // -----------------------------------------------------------------------

    /// Total content height from the layout engine.
    pub fn content_height(&mut self) -> f32 {
        let metrics = self.layout.line_metrics(&self.state.text);
        if let Some(last) = metrics.last() {
            last.baseline + last.descent
        } else {
            0.0
        }
    }

    /// Maximum scroll offset (content may be shorter than viewport).
    pub fn max_scroll_y(&mut self) -> f32 {
        (self.content_height() - self.layout.layout_height()).max(0.0)
    }

    /// Clamp scroll_y to valid range.
    pub fn clamp_scroll(&mut self) {
        let max = self.max_scroll_y();
        self.scroll_y = self.scroll_y.clamp(0.0, max);
    }

    // -----------------------------------------------------------------------
    // Scroll anchoring
    // -----------------------------------------------------------------------

    /// Capture the scroll anchor: the byte offset and sub-line pixel fraction
    /// of the first line visible at the current `scroll_y`.
    ///
    /// Used before a reflow operation so the reading position can be restored
    /// afterwards via [`restore_scroll_anchor`].
    fn scroll_anchor(&mut self) -> ScrollAnchor {
        if self.scroll_y <= 0.0 {
            return ScrollAnchor {
                byte_offset: 0,
                offset_within_line: 0.0,
            };
        }
        let metrics = self.layout.line_metrics(&self.state.text);
        if metrics.is_empty() {
            return ScrollAnchor {
                byte_offset: 0,
                offset_within_line: 0.0,
            };
        }
        // Find the first line whose bottom is below scroll_y (i.e. at least
        // partially visible).
        let idx = metrics
            .iter()
            .position(|lm| lm.bottom() > self.scroll_y)
            .unwrap_or(metrics.len() - 1);
        let line = &metrics[idx];
        ScrollAnchor {
            byte_offset: line.start_index,
            offset_within_line: self.scroll_y - line.top(),
        }
    }

    /// Restore scroll_y so the anchor line sits at the same sub-line screen
    /// position it had before reflow.
    fn restore_scroll_anchor(&mut self, anchor: ScrollAnchor) {
        // Fast path: was at the very top, stay there.
        if anchor.byte_offset == 0 && anchor.offset_within_line == 0.0 {
            self.scroll_y = 0.0;
            return;
        }
        let metrics = self.layout.line_metrics(&self.state.text);
        if metrics.is_empty() {
            self.scroll_y = 0.0;
            return;
        }
        // Find the line that contains (or starts at) the anchor byte offset.
        let idx = line_index_for_offset(&metrics, anchor.byte_offset);
        let new_top = metrics[idx].top();
        self.scroll_y = new_top + anchor.offset_within_line;
        self.clamp_scroll();
    }

    /// Adjust scroll offset by `delta` pixels (positive = scroll down).
    pub fn scroll_by(&mut self, delta: f32) {
        self.scroll_y += delta;
        self.clamp_scroll();
    }

    /// Adjust scroll so the caret is within the visible viewport.
    ///
    /// **Ordering constraint:** `ensure_layout` must be called
    /// before this method when editing rich text.
    pub fn ensure_cursor_visible(&mut self) {
        let cr = self.caret_rect();
        let viewport_height = self.layout.layout_height();
        let margin = cr.height;

        if cr.y < self.scroll_y + margin {
            self.scroll_y = (cr.y - margin).max(0.0);
        }

        let cursor_bottom = cr.y + cr.height;
        if cursor_bottom > self.scroll_y + viewport_height - margin {
            self.scroll_y = cursor_bottom - viewport_height + margin;
        }

        self.clamp_scroll();
    }

    // -----------------------------------------------------------------------
    // Blink
    // -----------------------------------------------------------------------

    /// Reset the blink timer (cursor becomes visible).
    pub fn reset_blink(&mut self) {
        self.cursor_visible = true;
        self.last_blink = Instant::now();
    }

    /// Advance the blink timer. Returns `true` if visibility changed.
    ///
    /// When a selection is active the caret is unconditionally hidden, so
    /// the timer is not toggled — this avoids unnecessary redraws and
    /// ensures the caret appears immediately when the selection is
    /// collapsed.
    pub fn tick_blink(&mut self) -> bool {
        // No blinking while text is selected — the caret is not shown.
        if self.state.has_selection() {
            // Keep the phase "visible" so that collapsing the selection
            // will show the caret immediately without waiting for a full
            // blink interval.
            if !self.cursor_visible {
                self.cursor_visible = true;
                self.last_blink = Instant::now();
                return true;
            }
            return false;
        }

        if self.last_blink.elapsed() >= BLINK_INTERVAL {
            self.cursor_visible = !self.cursor_visible;
            self.last_blink = Instant::now();
            true
        } else {
            false
        }
    }

    /// When the next blink toggle will occur.
    pub fn next_blink_deadline(&self) -> Instant {
        self.last_blink + BLINK_INTERVAL
    }

    // -----------------------------------------------------------------------
    // IME composition
    // -----------------------------------------------------------------------

    /// Update the IME preedit string.
    pub fn update_preedit(&mut self, text: String) {
        self.preedit = Some(text);
        self.cached_caret_rect = None;
        self.reset_blink();
    }

    /// Cancel/clear the IME preedit.
    pub fn cancel_preedit(&mut self) {
        self.preedit = None;
        self.cached_caret_rect = None;
        self.reset_blink();
    }

    /// Clear a sentinel empty-preedit left by the IME system.
    ///
    /// After Ime::Preedit("") is received and the next KeyboardInput
    /// event processes, call this to allow subsequent key events to
    /// route to text insertion.
    pub fn drain_empty_preedit(&mut self) {
        if self.preedit.as_deref() == Some("") {
            self.preedit = None;
        }
    }

    // -----------------------------------------------------------------------
    // Content loading
    // -----------------------------------------------------------------------

    /// Replace the entire content with new text and default style.
    pub fn load_text(&mut self, text: &str) {
        let default_style = self.content.default_style().clone();
        self.content = AttributedText::new(text, default_style);
        self.state.text = self.content.text().to_owned();
        self.state.cursor = 0;
        self.state.anchor = None;
        self.caret_style_override = None;
        self.assert_text_synced();
        self.cached_caret_rect = None;
        self.layout.invalidate();
        self.scroll_y = 0.0;
        self.reset_blink();
    }

    /// Replace the entire content with attributed text (e.g., from HTML).
    pub fn load_attributed(&mut self, content: AttributedText) {
        self.state.text = content.text().to_owned();
        self.content = content;
        self.state.cursor = 0;
        self.state.anchor = None;
        self.caret_style_override = None;
        self.assert_text_synced();
        self.cached_caret_rect = None;
        self.layout.invalidate();
        self.scroll_y = 0.0;
        self.reset_blink();
    }
}
