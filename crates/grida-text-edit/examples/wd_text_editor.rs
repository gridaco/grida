//! Rich-text editor prototype built directly on winit + Skia.
//!
//! Uses the grida-text-edit crate for editing logic, `AttributedText` for
//! per-run styling, and Skia paragraph layout for rendering.
//!
//! Rich text shortcuts:
//!   Cmd/Ctrl+B           toggle bold
//!   Cmd/Ctrl+I           toggle italic
//!   Cmd/Ctrl+U           toggle underline
//!   Cmd/Ctrl+Shift+X     toggle strikethrough
//!   Cmd/Ctrl+Shift+>     increase font size (+1 pt)
//!   Cmd/Ctrl+Shift+<     decrease font size (-1 pt)

#![allow(clippy::single_match)]

//
// Feature checklist
// -----------------
// Editing
//   [x] Text insertion – IME commit (Ime::Commit) + Key::Character fallback
//   [x] Backspace – delete grapheme before cursor (or selected range)
//   [x] Delete    – delete grapheme after cursor (or selected range)
//   [x] Option/Ctrl+Backspace – delete word segment backward (UAX #29)
//   [x] Option/Ctrl+Delete   – delete word segment forward  (UAX #29)
//   [x] Cmd+Backspace         – delete to line start
//   [x] Cmd+Delete            – delete to line end
//   [x] Enter     – insert newline
//   [x] Tab       – insert 4 spaces
//
// Cursor movement
//   [x] ← / →                grapheme-cluster navigation
//   [x] ↑ / ↓                line-aware navigation (Skia line-metrics + position_at_point)
//   [x] Home / End            line start / end
//   [x] PageUp / PageDown     move by ~visible lines (manifesto viewport boundaries)
//   [x] Cmd+← / →            line start / end  (macOS)
//   [x] Cmd+↑ / ↓            document start / end  (macOS)
//   [x] Option+← / →         word jump  (macOS)
//   [x] Ctrl+← / →           word jump  (Windows / Linux)
//
// Selection
//   [x] Shift+arrow           extend selection in any direction
//   [x] Shift+Cmd/Opt/Ctrl    extend selection with the same jumps as above
//   [x] Mouse click           place cursor
//   [x] Mouse drag            drag-to-select range
//   [x] Shift+click           extend selection from current cursor to click position
//   [x] k=2 double-click      select word  (Skia get_word_boundary)
//   [x] k=3 triple-click      select visual line  (Skia get_line_metrics)
//   [x] k=4 quad-click        select entire document
//   [x] Cmd+A                 select all
//
// Clipboard
//   [x] Cmd/Ctrl+C            copy selection (HTML + plain text fallback)
//   [x] Cmd/Ctrl+X            cut selection (HTML + plain text fallback)
//   [x] Cmd/Ctrl+V            paste (HTML with formatting, or plain text fallback)
//       Copy/paste preserves bold, italic, underline, font size, color.
//       Cross-app: paste from Chrome/Word/Figma imports formatting;
//       copy from here pastes with formatting into other apps.
//
// Rendering
//   [x] Multiline text with wrapping
//   [x] Cursor blink (500 ms, resets on any input)
//   [x] Selection highlight (Skia get_rects_for_range)
//   [x] Empty-line selection invariant (configurable: GlyphRect vs LineBox)
//   [x] Resize – paragraph relaid out on window resize
//
//   [x] IME composition (set_ime_allowed + Preedit → underlined inline segment;
//                        Key::Character suppressed during active composition)
//
// History
//   [x] Undo / redo (Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z)
//       Snapshot-based history with merge: consecutive typing, backspace, or
//       delete are grouped; paste, newline, and IME commit are discrete steps.
//       Snapshots capture both text and style runs, so undo/redo restores
//       formatting changes (bold, italic, underline, font size) as well.
//
// Rich text (per-run styling via AttributedText)
//   [x] Cmd/Ctrl+B         toggle bold (variable font wght axis)
//   [x] Cmd/Ctrl+I         toggle italic (real italic typeface)
//   [x] Cmd/Ctrl+U         toggle underline
//   [x] Cmd/Ctrl+Shift+X   toggle strikethrough
//   [x] Cmd/Ctrl+Shift+>   increase font size (+1 pt, min 1)
//   [x] Cmd/Ctrl+Shift+<   decrease font size (-1 pt, min 1)
//   [x] Caret style override (toggle with no selection sets typing style)
//   [x] Per-run layout via Skia ParagraphBuilder (pushStyle/addText per run)
//   [x] Variable font axis interpolation (wght, opsz via FontArguments)
//
// Dev-only function key presets (no GUI needed)
//   [x] F1: black  F2: red  F3: blue          set text color
//   [x] F5: Inter (sans)  F6: Lora (serif)  F7: Inconsolata (mono)
//   [x] Drag-and-drop .txt / .html files to load content
//
// Scroll
//   [x] Vertical scroll (mouse wheel / trackpad)
//   [x] Auto-scroll to keep cursor visible
//   [x] Viewport clipping
//
// Not yet implemented
//   [ ] Visual-order bidi cursor movement

use std::ffi::CString;
use std::fs;
use std::num::NonZeroU32;
use std::time::{Duration, Instant};

use arboard::Clipboard;
use gl::types::GLint;
use glutin::{
    config::{ConfigTemplateBuilder, GlConfig},
    context::{ContextApi, ContextAttributesBuilder, PossiblyCurrentContext},
    display::{GetGlDisplay, GlDisplay},
    prelude::{GlSurface, NotCurrentGlContext},
    surface::{Surface as GlutinSurface, SurfaceAttributesBuilder, WindowSurface},
};
use glutin_winit::DisplayBuilder;
#[allow(deprecated)]
use raw_window_handle::HasRawWindowHandle;
use skia_safe::{
    gpu::{self, backend_render_targets, gl::FramebufferInfo, surfaces::wrap_backend_render_target},
    textlayout::{
        Paragraph, ParagraphBuilder, ParagraphStyle, RectHeightStyle,
        RectWidthStyle, TextDecoration, TextStyle,
    },
    Color, ColorType, Paint, Point, Rect, Surface,
};
use winit::{
    application::ApplicationHandler,
    dpi::{LogicalPosition, LogicalSize, PhysicalSize},
    event::{ElementState, Ime, MouseButton, MouseScrollDelta, WindowEvent},
    event_loop::{ActiveEventLoop, ControlFlow, EventLoop},
    keyboard::{Key, KeyCode, ModifiersState, NamedKey, PhysicalKey},
    window::{Window, WindowAttributes, WindowId},
};

use grida_text_edit::{
    apply_command_mut, utf8_to_utf16_offset,
    CaretRect, EditDelta, EditKind, EditingCommand, GenericEditHistory,
    SkiaLayoutEngine, TextEditorState, TextLayoutEngine,
    attributed_text::{
        AttributedText, TextStyle as AttrTextStyle,
        TextDecorationLine, TextFill, RGBA,
        html::{runs_to_html, html_to_attributed_text},
    },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WINDOW_W: u32 = 800;
const WINDOW_H: u32 = 600;
const PADDING: f32 = 24.0;
const FONT_SIZE: f32 = 18.0;
const BLINK_INTERVAL: Duration = Duration::from_millis(500);
const CURSOR_WIDTH: f32 = 2.0;

// ---------------------------------------------------------------------------
// Empty-line selection policy (doc §"Empty-line selection invariant")
// ---------------------------------------------------------------------------

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum EmptyLineSelectionPolicy {
    None,
    GlyphRect,
    LineBox,
}

/// Compute selection rectangles for the UTF-16 range `u16_lo..u16_hi`.
fn selection_rects_with_empty_line_invariant(
    paragraph: &Paragraph,
    text: &str,
    u16_lo: usize,
    u16_hi: usize,
    layout_width: f32,
    policy: EmptyLineSelectionPolicy,
) -> Vec<Rect> {
    let raw = paragraph.get_rects_for_range(
        u16_lo..u16_hi,
        RectHeightStyle::Max,
        RectWidthStyle::Tight,
    );

    if policy == EmptyLineSelectionPolicy::None {
        return raw.iter().map(|tb| tb.rect).collect();
    }

    let metrics = paragraph.get_line_metrics();

    struct LineBand {
        top: f32,
        bottom: f32,
        left: f32,
        right: f32,
        has_content: bool,
        start_u16: usize,
        end_u16: usize,
    }

    let mut bands: Vec<LineBand> = metrics
        .iter()
        .map(|lm| {
            let top = lm.baseline as f32 - lm.ascent as f32;
            let bot = lm.baseline as f32 + lm.descent as f32;
            LineBand {
                top,
                bottom: bot,
                left: f32::MAX,
                right: f32::MIN,
                has_content: false,
                start_u16: lm.start_index,
                end_u16: lm.end_index,
            }
        })
        .collect();

    for tb in &raw {
        let mid_y = (tb.rect.top + tb.rect.bottom) * 0.5;
        for band in &mut bands {
            if mid_y >= band.top - 0.5 && mid_y <= band.bottom + 0.5 {
                band.left = band.left.min(tb.rect.left);
                band.right = band.right.max(tb.rect.right);
                band.has_content = true;
                break;
            }
        }
    }

    let text_u16_len = text.encode_utf16().count();
    let sel_first_line = skia_line_index_for_u16_offset(&metrics, u16_lo);
    let sel_last_line =
        skia_line_index_for_u16_offset(&metrics, u16_hi.saturating_sub(1).max(u16_lo));

    let mut out: Vec<Rect> = Vec::with_capacity(bands.len());
    for (i, band) in bands.iter().enumerate() {
        if i < sel_first_line || i > sel_last_line {
            continue;
        }
        if !band.has_content {
            let w = match policy {
                EmptyLineSelectionPolicy::GlyphRect => FONT_SIZE * 0.5,
                EmptyLineSelectionPolicy::LineBox => layout_width,
                EmptyLineSelectionPolicy::None => unreachable!(),
            };
            out.push(Rect::from_ltrb(0.0, band.top, w, band.bottom));
            continue;
        }

        let mut left = band.left;
        let mut right = band.right;
        let is_zero_width = (right - left).abs() < 0.5;

        match policy {
            EmptyLineSelectionPolicy::GlyphRect => {
                if is_zero_width {
                    right = left + FONT_SIZE * 0.5;
                }
            }
            EmptyLineSelectionPolicy::LineBox => {
                if is_zero_width {
                    left = 0.0;
                    right = layout_width;
                } else {
                    let fully_covered =
                        u16_lo <= band.start_u16 && u16_hi >= band.end_u16;
                    let is_first = i == sel_first_line;
                    let is_last = i == sel_last_line;
                    if fully_covered || (!is_first && !is_last) {
                        left = 0.0;
                        right = layout_width;
                    } else {
                        if is_first && u16_lo <= band.start_u16 {
                            left = 0.0;
                        }
                        if is_last && u16_hi >= band.end_u16 {
                            right = layout_width;
                        }
                        if is_first && !is_last {
                            right = layout_width;
                        }
                        if is_last && !is_first {
                            left = 0.0;
                        }
                    }
                }
            }
            EmptyLineSelectionPolicy::None => unreachable!(),
        }

        out.push(Rect::from_ltrb(left, band.top, right, band.bottom));
    }

    // Trailing phantom line
    if u16_hi >= text_u16_len && text.ends_with('\n') && metrics.len() >= 2 {
        let phantom = &metrics[metrics.len() - 1];
        let top = phantom.baseline as f32 - phantom.ascent as f32;
        let bot = phantom.baseline as f32 + phantom.descent as f32;
        let already_covered = out.iter().any(|r| {
            let mid = (r.top + r.bottom) * 0.5;
            mid >= top - 1.0 && mid <= bot + 1.0
        });
        if !already_covered {
            let w = match policy {
                EmptyLineSelectionPolicy::GlyphRect => FONT_SIZE * 0.5,
                EmptyLineSelectionPolicy::LineBox => layout_width,
                EmptyLineSelectionPolicy::None => unreachable!(),
            };
            out.push(Rect::from_ltrb(0.0, top, w, bot));
        }
    }

    out
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

struct TextEditorConfig {
    empty_line_policy: EmptyLineSelectionPolicy,
}

impl Default for TextEditorConfig {
    fn default() -> Self {
        Self { empty_line_policy: EmptyLineSelectionPolicy::GlyphRect }
    }
}

// SkiaLayoutEngine lives in text_edit::skia_layout (shared with tests).

// ---------------------------------------------------------------------------
// Utility: find line index from Skia UTF-16 offset (for selection_rects only)
// ---------------------------------------------------------------------------

fn skia_line_index_for_u16_offset(
    metrics: &[skia_safe::textlayout::LineMetrics],
    u16_offset: usize,
) -> usize {
    for (i, lm) in metrics.iter().enumerate().rev() {
        if lm.start_index <= u16_offset {
            return i;
        }
    }
    0
}

// ---------------------------------------------------------------------------
// TextEditor  – thin shell: pure editing state + Skia layout + UI state
// ---------------------------------------------------------------------------

/// Snapshot capturing both editor state and attributed text for undo/redo.
#[derive(Clone)]
struct RichTextSnapshot {
    state: TextEditorState,
    content: AttributedText,
}

struct TextEditor {
    /// Pure editing state: text, cursor, anchor.
    pub state: TextEditorState,
    /// Skia-backed layout engine (shared with apply_command calls).
    layout: SkiaLayoutEngine,

    /// Attributed text model (runs of styled text).
    pub content: AttributedText,

    /// Explicit caret style override (set by Cmd+B/I/U with no selection).
    /// Cleared on cursor movement.
    caret_style_override: Option<AttrTextStyle>,

    // UI-only state (not part of editing logic)
    cursor_visible: bool,
    last_blink: Instant,
    mouse_down: bool,
    drag_anchor_utf8: Option<usize>,

    /// Active IME preedit string (NOT in state.text; rendered inline).
    preedit: Option<String>,

    empty_line_policy: EmptyLineSelectionPolicy,

    /// Undo / redo history capturing both text and style state.
    history: GenericEditHistory<RichTextSnapshot>,

    /// Vertical scroll offset in layout-local pixels.
    scroll_y: f32,

    /// Cached caret rectangle — avoids redundant recomputation within a frame.
    /// Invalidated (set to `None`) whenever cursor or text changes.
    cached_caret_rect: Option<CaretRect>,
}

impl TextEditor {
    fn new(config: TextEditorConfig, default_style: AttrTextStyle) -> Self {
        Self {
            state: TextEditorState::with_cursor(String::new(), 0),
            layout: SkiaLayoutEngine::new(
                (WINDOW_W as f32) - PADDING * 2.0,
                (WINDOW_H as f32) - PADDING * 2.0,
            ),
            content: AttributedText::empty(default_style),
            caret_style_override: None,
            cursor_visible: true,
            last_blink: Instant::now(),
            mouse_down: false,
            drag_anchor_utf8: None,
            preedit: None,
            empty_line_policy: config.empty_line_policy,
            history: GenericEditHistory::new(),
            scroll_y: 0.0,
            cached_caret_rect: None,
        }
    }

    /// Return the caret rectangle, using a per-frame cache.
    fn caret_rect(&mut self) -> CaretRect {
        if let Some(ref cr) = self.cached_caret_rect {
            return cr.clone();
        }
        let cr = self.layout.caret_rect_at(&self.state.text, self.state.cursor);
        self.cached_caret_rect = Some(cr.clone());
        cr
    }

    /// Invalidate the cached caret rect (call after cursor/text changes).
    fn invalidate_caret_cache(&mut self) {
        self.cached_caret_rect = None;
    }

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
        self.caret_style_override = None;
        self.cached_caret_rect = None;
        self.layout.invalidate();
        self.layout.ensure_layout_attributed(&self.content);
        self.ensure_cursor_visible();
    }

    // -----------------------------------------------------------------------
    // Core: apply an editing command (text mutation)
    // -----------------------------------------------------------------------

    fn apply(&mut self, cmd: EditingCommand) {
        let kind = cmd.edit_kind();
        // Capture snapshot BEFORE mutation — history.push requires the
        // pre-edit state so that undo restores the correct document.
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
            // The edit mutated the document — record history.
            if let Some((snap, k)) = pre_snapshot {
                self.history.push(&snap, k);
            } else if let Some(k) = merge_kind {
                self.history.push_merge(k);
            }
            self.sync_content_with_delta(&d, old_cursor);
        } else if self.state.cursor != old_cursor {
            self.caret_style_override = None;
        }
        self.reset_blink();
        // Ensure attributed layout is up-to-date before querying caret geometry,
        // otherwise ensure_cursor_visible triggers the plain-text rebuild path.
        self.layout.ensure_layout_attributed(&self.content);
        self.ensure_cursor_visible();
    }

    fn apply_with_kind(&mut self, cmd: EditingCommand, kind: EditKind) {
        // Capture snapshot BEFORE mutation.
        let pre_snapshot = if !self.history.would_merge(kind) {
            Some(self.snapshot())
        } else {
            None
        };

        let old_cursor = self.state.cursor;
        let delta = apply_command_mut(&mut self.state, cmd, &mut self.layout);
        self.invalidate_caret_cache();
        if let Some(d) = delta {
            // The edit mutated the document — record history.
            if let Some(snap) = pre_snapshot {
                self.history.push(&snap, kind);
            } else {
                self.history.push_merge(kind);
            }
            self.sync_content_with_delta(&d, old_cursor);
        } else if self.state.cursor != old_cursor {
            self.caret_style_override = None;
        }
        self.reset_blink();
        self.layout.ensure_layout_attributed(&self.content);
        self.ensure_cursor_visible();
    }

    /// Update the `AttributedText` content and incremental layout using
    /// the edit delta returned by `apply_command_mut` — O(1) offset lookup
    /// instead of O(n) text diff.
    fn sync_content_with_delta(&mut self, delta: &EditDelta, old_cursor: usize) {
        let insert_style = self.caret_style_override.clone()
            .unwrap_or_else(|| self.content.caret_style_at(old_cursor as u32).clone());

        let old_end = delta.offset + delta.old_len;
        let new_end = delta.offset + delta.new_len;

        if delta.old_len > 0 {
            self.content.delete(delta.offset, old_end);
        }
        if delta.new_len > 0 {
            let inserted = &self.state.text[delta.offset..new_end];
            self.content.insert_with_style(delta.offset, inserted, insert_style);
        }

        // Invalidate the per-block layout so the next ensure_layout_attributed
        // call rebuilds the affected blocks. (notify_edit is designed for the
        // plain-text path and doesn't handle per-run attributed styles.)
        self.layout.invalidate();

        // After any text edit, clear the override.
        self.caret_style_override = None;
    }

    // -----------------------------------------------------------------------
    // Undo / redo — restores full snapshot (text + styles)
    // -----------------------------------------------------------------------

    fn undo(&mut self) -> bool {
        if let Some(prev) = self.history.undo(&self.snapshot()) {
            self.restore(prev);
            self.reset_blink();
            true
        } else {
            false
        }
    }

    fn redo(&mut self) -> bool {
        if let Some(next) = self.history.redo(&self.snapshot()) {
            self.restore(next);
            self.reset_blink();
            true
        } else {
            false
        }
    }

    // -----------------------------------------------------------------------
    // Rich text: toggle bold / italic / underline
    // -----------------------------------------------------------------------

    fn toggle_bold(&mut self) {
        if let Some((lo, hi)) = self.selection_range() {
            self.history.push(&self.snapshot(), EditKind::Style);
            let is_bold = self.content.style_at(lo as u32).font_weight >= 700;
            let new_weight = if is_bold { 400 } else { 700 };
            self.content.apply_style(lo, hi, |s| { s.font_weight = new_weight; });
            self.layout.invalidate();
        } else {
            let current = self.caret_style_override.clone()
                .unwrap_or_else(|| self.content.caret_style_at(self.state.cursor as u32).clone());
            let mut new_style = current;
            new_style.font_weight = if new_style.font_weight >= 700 { 400 } else { 700 };
            self.caret_style_override = Some(new_style);
        }
    }

    fn toggle_italic(&mut self) {
        if let Some((lo, hi)) = self.selection_range() {
            self.history.push(&self.snapshot(), EditKind::Style);
            let is_italic = self.content.style_at(lo as u32).font_style_italic;
            self.content.apply_style(lo, hi, |s| { s.font_style_italic = !is_italic; });
            self.layout.invalidate();
        } else {
            let current = self.caret_style_override.clone()
                .unwrap_or_else(|| self.content.caret_style_at(self.state.cursor as u32).clone());
            let mut new_style = current;
            new_style.font_style_italic = !new_style.font_style_italic;
            self.caret_style_override = Some(new_style);
        }
    }

    fn toggle_underline(&mut self) {
        if let Some((lo, hi)) = self.selection_range() {
            self.history.push(&self.snapshot(), EditKind::Style);
            let is_underline = self.content.style_at(lo as u32).text_decoration_line
                == TextDecorationLine::Underline;
            let new_deco = if is_underline { TextDecorationLine::None } else { TextDecorationLine::Underline };
            self.content.apply_style(lo, hi, |s| { s.text_decoration_line = new_deco; });
            self.layout.invalidate();
        } else {
            let current = self.caret_style_override.clone()
                .unwrap_or_else(|| self.content.caret_style_at(self.state.cursor as u32).clone());
            let mut new_style = current;
            new_style.text_decoration_line = if new_style.text_decoration_line == TextDecorationLine::Underline {
                TextDecorationLine::None
            } else {
                TextDecorationLine::Underline
            };
            self.caret_style_override = Some(new_style);
        }
    }

    fn toggle_strikethrough(&mut self) {
        if let Some((lo, hi)) = self.selection_range() {
            self.history.push(&self.snapshot(), EditKind::Style);
            let is_strike = self.content.style_at(lo as u32).text_decoration_line
                == TextDecorationLine::LineThrough;
            let new_deco = if is_strike { TextDecorationLine::None } else { TextDecorationLine::LineThrough };
            self.content.apply_style(lo, hi, |s| { s.text_decoration_line = new_deco; });
            self.layout.invalidate();
        } else {
            let current = self.caret_style_override.clone()
                .unwrap_or_else(|| self.content.caret_style_at(self.state.cursor as u32).clone());
            let mut new_style = current;
            new_style.text_decoration_line = if new_style.text_decoration_line == TextDecorationLine::LineThrough {
                TextDecorationLine::None
            } else {
                TextDecorationLine::LineThrough
            };
            self.caret_style_override = Some(new_style);
        }
    }

    /// Increase font size by `delta` (clamped to >= 1.0).
    fn increase_font_size(&mut self, delta: f32) {
        self.adjust_font_size(delta);
    }

    /// Decrease font size by `delta` (clamped to >= 1.0).
    fn decrease_font_size(&mut self, delta: f32) {
        self.adjust_font_size(-delta);
    }

    fn adjust_font_size(&mut self, delta: f32) {
        const MIN_FONT_SIZE: f32 = 1.0;
        if let Some((lo, hi)) = self.selection_range() {
            self.history.push(&self.snapshot(), EditKind::Style);
            self.content.apply_style(lo, hi, |s| {
                s.font_size = (s.font_size + delta).max(MIN_FONT_SIZE);
            });
            self.layout.invalidate();
        } else {
            let current = self.caret_style_override.clone()
                .unwrap_or_else(|| self.content.caret_style_at(self.state.cursor as u32).clone());
            let mut new_style = current;
            new_style.font_size = (new_style.font_size + delta).max(MIN_FONT_SIZE);
            self.caret_style_override = Some(new_style);
        }
    }

    // -----------------------------------------------------------------------
    // Dev-only: function key style presets
    // -----------------------------------------------------------------------

    /// Set a preset color on the selection or caret style.
    fn dev_set_color(&mut self, color: RGBA) {
        if let Some((lo, hi)) = self.selection_range() {
            self.history.push(&self.snapshot(), EditKind::Style);
            self.content.apply_style(lo, hi, |s| {
                s.fill = TextFill::Solid(color);
            });
            self.layout.invalidate();
        } else {
            let mut style = self.caret_style_override.clone()
                .unwrap_or_else(|| self.content.caret_style_at(self.state.cursor as u32).clone());
            style.fill = TextFill::Solid(color);
            self.caret_style_override = Some(style);
        }
    }

    /// Set the font family on the selection or caret style.
    fn dev_set_font(&mut self, family: &str) {
        let family = family.to_string();
        if let Some((lo, hi)) = self.selection_range() {
            self.history.push(&self.snapshot(), EditKind::Style);
            self.content.apply_style(lo, hi, |s| { s.font_family = family.clone(); });
            self.layout.invalidate();
        } else {
            let mut style = self.caret_style_override.clone()
                .unwrap_or_else(|| self.content.caret_style_at(self.state.cursor as u32).clone());
            style.font_family = family;
            self.caret_style_override = Some(style);
        }
    }

    // -----------------------------------------------------------------------
    // Rich paste: insert an AttributedText (from HTML clipboard)
    // -----------------------------------------------------------------------

    fn paste_attributed(&mut self, pasted: &AttributedText) {
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
            let insert_at = pos + start; // offset within the growing text
            self.content.insert_with_style(insert_at, slice, run.style.clone());
        }

        self.state.text = self.content.text().to_owned();
        self.state.cursor = pos + pasted.text().len();
        self.state.anchor = None;
        self.caret_style_override = None;
        self.layout.invalidate();
        self.reset_blink();
    }

    // -----------------------------------------------------------------------
    // Convenience wrappers (called from event handler)
    // -----------------------------------------------------------------------

    fn insert_text(&mut self, s: &str) {
        self.apply(EditingCommand::Insert(s.to_owned()));
    }

    fn backspace(&mut self) {
        self.apply(EditingCommand::Backspace);
    }

    fn backspace_word(&mut self) {
        self.apply(EditingCommand::BackspaceWord);
    }

    fn backspace_line(&mut self) {
        self.apply(EditingCommand::BackspaceLine);
    }

    fn delete_forward(&mut self) {
        self.apply(EditingCommand::Delete);
    }

    fn delete_word_forward(&mut self) {
        self.apply(EditingCommand::DeleteWord);
    }

    fn delete_line_forward(&mut self) {
        self.apply(EditingCommand::DeleteLine);
    }

    fn move_left(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveLeft { extend });
    }

    fn move_right(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveRight { extend });
    }

    fn move_up(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveUp { extend });
    }

    fn move_down(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveDown { extend });
    }

    fn move_home(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveHome { extend });
    }

    fn move_end(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveEnd { extend });
    }

    fn move_doc_start(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveDocStart { extend });
    }

    fn move_doc_end(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveDocEnd { extend });
    }

    fn move_page_up(&mut self, extend: bool) {
        self.apply(EditingCommand::MovePageUp { extend });
    }

    fn move_page_down(&mut self, extend: bool) {
        self.apply(EditingCommand::MovePageDown { extend });
    }

    fn move_word_left(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveWordLeft { extend });
    }

    fn move_word_right(&mut self, extend: bool) {
        self.apply(EditingCommand::MoveWordRight { extend });
    }

    fn select_all(&mut self) {
        self.apply(EditingCommand::SelectAll);
    }

    fn has_selection(&self) -> bool {
        self.state.has_selection()
    }

    fn selected_text(&self) -> Option<&str> {
        self.state.selected_text()
    }

    fn selection_range(&self) -> Option<(usize, usize)> {
        self.state.selection_range()
    }

    // -----------------------------------------------------------------------
    // Mouse
    // -----------------------------------------------------------------------

    fn on_mouse_down(&mut self, x: f32, y: f32) {
        self.mouse_down = true;
        let pos = self.layout.position_at_point(&self.state.text, x, y);
        self.state.cursor = pos;
        self.state.anchor = None;
        self.drag_anchor_utf8 = Some(pos);
        self.invalidate_caret_cache();
        self.reset_blink();
    }

    fn on_mouse_move(&mut self, x: f32, y: f32) {
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

    fn on_mouse_up(&mut self) {
        self.mouse_down = false;
        self.drag_anchor_utf8 = None;
    }

    fn shift_click(&mut self, x: f32, y: f32) {
        self.apply(EditingCommand::ExtendTo { x, y });
        self.reset_blink();
    }

    fn select_word_at(&mut self, x: f32, y: f32) {
        self.apply(EditingCommand::SelectWordAt { x, y });
        self.mouse_down = false;
        self.drag_anchor_utf8 = None;
    }

    fn select_line_at(&mut self, x: f32, y: f32) {
        self.apply(EditingCommand::SelectLineAt { x, y });
        self.mouse_down = false;
        self.drag_anchor_utf8 = None;
    }

    // -----------------------------------------------------------------------
    // Layout sizing
    // -----------------------------------------------------------------------

    fn set_layout_width(&mut self, w: f32) {
        self.layout.set_layout_width((w - PADDING * 2.0).max(1.0));
        // After a width change the layout is invalidated; rebuild
        // immediately from the attributed content so the plain-text
        // `ensure_layout` path (called internally by trait methods)
        // doesn't clobber per-run styles.
        self.layout.ensure_layout_attributed(&self.content);
        self.cached_caret_rect = None;
    }

    fn set_layout_height(&mut self, h: f32) {
        self.layout.set_layout_height((h - PADDING * 2.0).max(1.0));
        self.clamp_scroll();
    }

    // -----------------------------------------------------------------------
    // Scroll
    // -----------------------------------------------------------------------

    /// Total content height from the layout engine.
    fn content_height(&mut self) -> f32 {
        let metrics = self.layout.line_metrics(&self.state.text);
        if let Some(last) = metrics.last() {
            last.baseline + last.descent
        } else {
            0.0
        }
    }

    /// Maximum scroll offset (content may be shorter than viewport).
    fn max_scroll_y(&mut self) -> f32 {
        (self.content_height() - self.layout.layout_height).max(0.0)
    }

    /// Clamp scroll_y to valid range.
    fn clamp_scroll(&mut self) {
        let max = self.max_scroll_y();
        self.scroll_y = self.scroll_y.clamp(0.0, max);
    }

    /// Adjust scroll offset by `delta` pixels (positive = scroll down).
    fn scroll_by(&mut self, delta: f32) {
        self.scroll_y += delta;
        self.clamp_scroll();
    }

    /// Adjust scroll so the caret is within the visible viewport.
    ///
    /// **Ordering constraint:** `ensure_layout_attributed` must be called
    /// before this method when editing rich text. `caret_rect()` internally
    /// triggers `ensure_layout` (the plain-text path); if the attributed
    /// blocks haven't been built yet, `ensure_layout` would rebuild them
    /// with uniform styling, losing all formatting.
    fn ensure_cursor_visible(&mut self) {
        let cr = self.caret_rect();
        let viewport_height = self.layout.layout_height;
        let margin = cr.height; // one line of margin

        // Cursor above viewport
        if cr.y < self.scroll_y + margin {
            self.scroll_y = (cr.y - margin).max(0.0);
        }

        // Cursor below viewport
        let cursor_bottom = cr.y + cr.height;
        if cursor_bottom > self.scroll_y + viewport_height - margin {
            self.scroll_y = cursor_bottom - viewport_height + margin;
        }

        self.clamp_scroll();
    }

    // -----------------------------------------------------------------------
    // Blink
    // -----------------------------------------------------------------------

    fn reset_blink(&mut self) {
        self.cursor_visible = true;
        self.last_blink = Instant::now();
    }

    fn tick_blink(&mut self) -> bool {
        if self.last_blink.elapsed() >= BLINK_INTERVAL {
            self.cursor_visible = !self.cursor_visible;
            self.last_blink = Instant::now();
            true
        } else {
            false
        }
    }

    fn next_blink_deadline(&self) -> Instant {
        self.last_blink + BLINK_INTERVAL
    }

    // -----------------------------------------------------------------------
    // IME composition
    // -----------------------------------------------------------------------

    fn update_preedit(&mut self, text: String) {
        self.preedit = Some(text);
        self.reset_blink();
    }

    fn cancel_preedit(&mut self) {
        self.preedit = None;
        self.reset_blink();
    }

    // -----------------------------------------------------------------------
    // Draw
    // -----------------------------------------------------------------------

    fn draw(&mut self, canvas: &skia_safe::Canvas) {
        canvas.clear(Color::WHITE);

        // Clip to the text area and translate by the scroll offset.
        canvas.save();
        canvas.clip_rect(
            Rect::from_xywh(
                PADDING,
                PADDING,
                self.layout.layout_width,
                self.layout.layout_height,
            ),
            None,
            None,
        );
        let origin = Point::new(PADDING, PADDING - self.scroll_y);

        let preedit = self.preedit.as_deref().filter(|p| !p.is_empty()).map(str::to_owned);

        if let Some(ref p) = preedit {
            // ---- preedit mode ----
            let pre = &self.state.text[..self.state.cursor];
            let post = &self.state.text[self.state.cursor..];
            let display_text = format!("{}{}{}", pre, p, post);

            let preedit_end_utf8 = pre.len() + p.len();
            let preedit_start_u16 = utf8_to_utf16_offset(&display_text, pre.len());
            let preedit_end_u16 = utf8_to_utf16_offset(&display_text, preedit_end_utf8);

            let font_families: Vec<&str> = self.layout.config.font_families.iter().map(|s| s.as_str()).collect();
            let ts_normal = {
                let mut ts = TextStyle::new();
                ts.set_font_size(FONT_SIZE);
                ts.set_color(Color::BLACK);
                ts.set_font_families(&font_families);
                ts
            };
            let ts_preedit = {
                let mut ts = TextStyle::new();
                ts.set_font_size(FONT_SIZE);
                ts.set_color(Color::BLACK);
                ts.set_font_families(&font_families);
                ts.set_decoration_type(TextDecoration::UNDERLINE);
                ts
            };
            let mut para_style = ParagraphStyle::new();
            para_style.set_apply_rounding_hack(false);
            let mut builder =
                ParagraphBuilder::new(&para_style, &self.layout.font_collection);
            builder.push_style(&ts_normal);
            builder.add_text(pre);
            builder.push_style(&ts_preedit);
            builder.add_text(p.as_str());
            builder.pop();
            builder.add_text(post);
            let mut dp = builder.build();
            dp.layout(self.layout.layout_width);

            // Selection
            if let Some((lo, hi)) = self.selection_range() {
                if lo < hi {
                    let u16_lo = utf8_to_utf16_offset(&display_text, lo);
                    let u16_hi = utf8_to_utf16_offset(&display_text, hi);
                    let rects = selection_rects_with_empty_line_invariant(
                        &dp,
                        &display_text,
                        u16_lo,
                        u16_hi,
                        self.layout.layout_width,
                        self.empty_line_policy,
                    );
                    let mut sp = Paint::default();
                    sp.set_color(Color::from_argb(80, 66, 133, 244));
                    sp.set_anti_alias(true);
                    for r in &rects {
                        canvas.draw_rect(
                            Rect::from_ltrb(
                                r.left + origin.x,
                                r.top + origin.y,
                                r.right + origin.x,
                                r.bottom + origin.y,
                            ),
                            &sp,
                        );
                    }
                }
            }

            dp.paint(canvas, origin);

            // Cursor at end of preedit
            let cx = if preedit_start_u16 < preedit_end_u16 {
                let rects = dp.get_rects_for_range(
                    (preedit_end_u16 - 1)..preedit_end_u16,
                    RectHeightStyle::Max,
                    RectWidthStyle::Tight,
                );
                rects.last().map(|tb| tb.rect.right()).unwrap_or(0.0)
            } else {
                0.0
            };
            let cy = {
                let skia_metrics = dp.get_line_metrics();
                if skia_metrics.is_empty() {
                    FONT_SIZE
                } else {
                    let idx = skia_line_index_for_u16_offset(&skia_metrics, preedit_end_u16);
                    skia_metrics[idx].baseline as f32
                }
            };
            let mut cp = Paint::default();
            cp.set_color(Color::BLACK);
            cp.set_anti_alias(false);
            canvas.draw_rect(
                Rect::from_xywh(
                    cx + origin.x - CURSOR_WIDTH / 2.0,
                    cy - FONT_SIZE + origin.y,
                    CURSOR_WIDTH,
                    FONT_SIZE * 1.2,
                ),
                &cp,
            );
        } else {
            // ---- normal mode (rich text, per-block layout) ----
            self.layout.ensure_layout_attributed(&self.content);

            // Selection (using per-block selection_rects_for_range)
            if let Some((lo, hi)) = self.selection_range() {
                if lo < hi {
                    let sel_rects = self.layout.selection_rects_for_range(
                        &self.state.text, lo, hi,
                    );
                    let mut sp = Paint::default();
                    sp.set_color(Color::from_argb(80, 66, 133, 244));
                    sp.set_anti_alias(true);
                    for r in &sel_rects {
                        canvas.draw_rect(
                            Rect::from_ltrb(
                                r.x + origin.x,
                                r.y + origin.y,
                                r.x + r.width + origin.x,
                                r.y + r.height + origin.y,
                            ),
                            &sp,
                        );
                    }
                }
            }

            // Text (per-block painting with origin offset)
            self.layout.paint_paragraph_at(canvas, &self.state.text, origin);

            // Cursor
            if self.cursor_visible && !self.has_selection() {
                let cr = self.caret_rect();
                let cursor_rect = Rect::from_xywh(
                    cr.x + origin.x - CURSOR_WIDTH / 2.0,
                    cr.y + origin.y,
                    CURSOR_WIDTH,
                    cr.height,
                );
                let mut cp = Paint::default();
                cp.set_color(Color::BLACK);
                cp.set_anti_alias(false);
                canvas.draw_rect(cursor_rect, &cp);
            }
        }

        canvas.restore();
    }
}

// ---------------------------------------------------------------------------
// GL + Skia surface helpers
// ---------------------------------------------------------------------------

struct GlSkiaSurface {
    gr_context: skia_safe::gpu::DirectContext,
    fb_info: FramebufferInfo,
    surface: Surface,
    gl_surface: GlutinSurface<WindowSurface>,
    gl_context: PossiblyCurrentContext,
    num_samples: usize,
    stencil_bits: usize,
}

impl GlSkiaSurface {
    fn recreate_skia_surface(&mut self, width: i32, height: i32) {
        let backend = backend_render_targets::make_gl(
            (width, height),
            self.num_samples,
            self.stencil_bits,
            self.fb_info,
        );
        self.surface = wrap_backend_render_target(
            &mut self.gr_context,
            &backend,
            gpu::SurfaceOrigin::BottomLeft,
            ColorType::RGBA8888,
            None,
            None,
        )
        .expect("could not re-create skia surface");
    }

    fn flush_and_present(&mut self) {
        self.gr_context.flush_and_submit();
        self.gl_surface.swap_buffers(&self.gl_context).expect("swap buffers");
    }
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

struct TextEditorApp {
    config: TextEditorConfig,
    inner: Option<AppInner>,
    modifiers: ModifiersState,
    clipboard: Clipboard,
    last_mouse_pos: (f32, f32),
    click_count: u32,
    last_click_time: Option<Instant>,
    last_click_pos: (f32, f32),
}

struct AppInner {
    window: Window,
    gl_skia: GlSkiaSurface,
    editor: TextEditor,
}

impl TextEditorApp {
    fn new(config: TextEditorConfig) -> Self {
        Self {
            config,
            inner: None,
            modifiers: ModifiersState::empty(),
            clipboard: Clipboard::new().expect("could not open system clipboard"),
            last_mouse_pos: (0.0, 0.0),
            click_count: 0,
            last_click_time: None,
            last_click_pos: (0.0, 0.0),
        }
    }
}

impl ApplicationHandler for TextEditorApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.inner.is_some() {
            return;
        }

        let window_attrs = WindowAttributes::default()
            .with_title("wd_text_editor – Skia text editor prototype")
            .with_inner_size(winit::dpi::LogicalSize::new(WINDOW_W, WINDOW_H));

        let template = ConfigTemplateBuilder::new().with_alpha_size(8);
        let display_builder =
            DisplayBuilder::new().with_window_attributes(window_attrs.into());

        let (window, gl_config) = display_builder
            .build(event_loop, template, |mut cfgs| {
                let mut best = cfgs.next().expect("no GL config");
                for c in cfgs {
                    if c.num_samples() < best.num_samples() {
                        best = c;
                    }
                }
                best
            })
            .expect("failed to build GL window");
        let window = window.expect("window creation failed");

        #[allow(deprecated)]
        let raw_handle = window.raw_window_handle().expect("raw window handle");

        let ctx_attrs = ContextAttributesBuilder::new().build(Some(raw_handle));
        let fallback_attrs = ContextAttributesBuilder::new()
            .with_context_api(ContextApi::Gles(None))
            .build(Some(raw_handle));

        let not_current = unsafe {
            gl_config
                .display()
                .create_context(&gl_config, &ctx_attrs)
                .unwrap_or_else(|_| {
                    gl_config
                        .display()
                        .create_context(&gl_config, &fallback_attrs)
                        .expect("GL context creation failed")
                })
        };

        let (w, h): (u32, u32) = window.inner_size().into();
        let surf_attrs = SurfaceAttributesBuilder::<WindowSurface>::new().build(
            raw_handle,
            NonZeroU32::new(w).unwrap_or(unsafe { NonZeroU32::new_unchecked(1) }),
            NonZeroU32::new(h).unwrap_or(unsafe { NonZeroU32::new_unchecked(1) }),
        );
        let gl_surface = unsafe {
            gl_config
                .display()
                .create_window_surface(&gl_config, &surf_attrs)
                .expect("GL surface creation failed")
        };

        let gl_context = not_current.make_current(&gl_surface).expect("make current");

        gl::load_with(|s| {
            let Ok(c) = CString::new(s) else { return std::ptr::null(); };
            gl_config.display().get_proc_address(c.as_c_str())
        });

        let interface = skia_safe::gpu::gl::Interface::new_load_with(|name| {
            if name == "eglGetCurrentDisplay" {
                return std::ptr::null();
            }
            let Ok(c) = CString::new(name) else { return std::ptr::null(); };
            gl_config.display().get_proc_address(c.as_c_str())
        })
        .expect("Skia GL interface");

        let mut gr_context =
            skia_safe::gpu::direct_contexts::make_gl(interface, None).expect("Skia DirectContext");

        let fb_info = {
            let mut fboid: GLint = 0;
            unsafe { gl::GetIntegerv(gl::FRAMEBUFFER_BINDING, &mut fboid) };
            FramebufferInfo {
                fboid: fboid.try_into().unwrap_or_default(),
                format: skia_safe::gpu::gl::Format::RGBA8.into(),
                ..Default::default()
            }
        };

        let num_samples = gl_config.num_samples() as usize;
        let stencil_bits = gl_config.stencil_size() as usize;

        let backend = backend_render_targets::make_gl(
            (w as i32, h as i32),
            num_samples,
            stencil_bits,
            fb_info,
        );
        let skia_surface = wrap_backend_render_target(
            &mut gr_context,
            &backend,
            gpu::SurfaceOrigin::BottomLeft,
            ColorType::RGBA8888,
            None,
            None,
        )
        .expect("Skia surface");

        let gl_skia = GlSkiaSurface {
            gr_context,
            fb_info,
            surface: skia_surface,
            gl_surface,
            gl_context,
            num_samples,
            stencil_bits,
        };

        let default_style = AttrTextStyle {
            font_family: String::from("Inter"),
            font_size: FONT_SIZE,
            ..AttrTextStyle::default()
        };

        let mut editor = TextEditor::new(
            TextEditorConfig { empty_line_policy: self.config.empty_line_policy },
            default_style.clone(),
        );

        // Load Inter variable fonts (upright + italic).
        // Skia will match the correct weight/slant from the variable font axes.
        let inter_upright = include_bytes!(
            "../../../fixtures/fonts/Inter/Inter-VariableFont_opsz,wght.ttf"
        );
        let inter_italic = include_bytes!(
            "../../../fixtures/fonts/Inter/Inter-Italic-VariableFont_opsz,wght.ttf"
        );
        let lora_upright = include_bytes!(
            "../../../fixtures/fonts/Lora/Lora-VariableFont_wght.ttf"
        );
        let lora_italic = include_bytes!(
            "../../../fixtures/fonts/Lora/Lora-Italic-VariableFont_wght.ttf"
        );
        let inconsolata = include_bytes!(
            "../../../fixtures/fonts/Inconsolata/Inconsolata-VariableFont_wdth,wght.ttf"
        );
        editor.layout.add_font_family("Inter", &[inter_upright, inter_italic]);
        editor.layout.add_font_family("Lora", &[lora_upright, lora_italic]);
        editor.layout.add_font_family("Inconsolata", &[inconsolata]);
        editor.layout.config.font_families = vec!["Inter".into()];

        editor.set_layout_width(w as f32);
        editor.set_layout_height(h as f32);

        let demo_text = concat!(
            "Grida Rich Text Editor\n",
            "\n",
            "Formatting\n",
            "  Cmd+B  bold       Cmd+I  italic\n",
            "  Cmd+U  underline  Cmd+Shift+X  strikethrough\n",
            "\n",
            "Font Size\n",
            "  Cmd+Shift+>  increase    Cmd+Shift+<  decrease\n",
            "\n",
            "Fonts (dev)\n",
            "  F5  Inter (sans)  F6  Lora (serif)  F7  Inconsolata (mono)\n",
            "\n",
            "Colors (dev)\n",
            "  F1  black   F2  red   F3  blue\n",
            "\n",
            "Editing\n",
            "  Cmd+Z  undo   Cmd+Shift+Z  redo\n",
            "  Cmd+C  copy   Cmd+X  cut   Cmd+V  paste (with formatting)\n",
            "  Cmd+A  select all\n",
            "\n",
            "The quick brown fox jumps over 13 lazy dogs.\n",
        );

        editor.content = AttributedText::new(demo_text, default_style.clone());
        editor.state.text = demo_text.to_string();

        // Pre-style the title.
        // "Grida Rich Text Editor" — bold, 24px
        let title_end = "Grida Rich Text Editor".len();
        editor.content.apply_style(0, title_end, |s| {
            s.font_weight = 700;
            s.font_size = 24.0;
        });

        editor.state.cursor = editor.state.text.len();

        window.set_ime_allowed(true);
        window.set_ime_cursor_area(
            LogicalPosition::new(PADDING as f64, PADDING as f64),
            LogicalSize::new(1.0f64, FONT_SIZE as f64),
        );

        window.request_redraw();

        self.inner = Some(AppInner { window, gl_skia, editor });
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        _window_id: WindowId,
        event: WindowEvent,
    ) {
        let next_blink = self
            .inner
            .as_ref()
            .map(|i| i.editor.next_blink_deadline())
            .unwrap_or_else(|| Instant::now() + BLINK_INTERVAL);
        event_loop.set_control_flow(ControlFlow::WaitUntil(next_blink));

        let Some(inner) = self.inner.as_mut() else { return; };

        match event {
            WindowEvent::CloseRequested => {
                event_loop.exit();
            }
            WindowEvent::Resized(PhysicalSize { width, height }) => {
                let w = width.max(1);
                let h = height.max(1);
                inner.gl_skia.gl_surface.resize(
                    &inner.gl_skia.gl_context,
                    NonZeroU32::new(w).unwrap(),
                    NonZeroU32::new(h).unwrap(),
                );
                inner.gl_skia.recreate_skia_surface(w as i32, h as i32);
                inner.editor.set_layout_width(w as f32);
                inner.editor.set_layout_height(h as f32);
                inner.window.request_redraw();
            }

            WindowEvent::ModifiersChanged(m) => {
                self.modifiers = m.state();
            }

            WindowEvent::Ime(Ime::Preedit(text, _cursor_range)) => {
                inner.editor.update_preedit(text);
                inner.window.request_redraw();
            }
            WindowEvent::Ime(Ime::Commit(s)) => {
                inner.editor.apply_with_kind(
                    EditingCommand::Insert(s),
                    EditKind::ImeCommit,
                );
                inner.window.request_redraw();
            }
            WindowEvent::Ime(Ime::Enabled) => {
                inner.editor.cancel_preedit();
            }
            WindowEvent::Ime(Ime::Disabled) => {
                inner.editor.cancel_preedit();
                inner.window.request_redraw();
            }

            WindowEvent::KeyboardInput { event: ke, .. }
                if ke.state == ElementState::Pressed =>
            {
                let meta = self.modifiers.super_key();
                let alt = self.modifiers.alt_key();
                let ctrl = self.modifiers.control_key();
                let shift = self.modifiers.shift_key();
                let cmd = meta || ctrl;
                let word = alt || ctrl;

                match &ke.logical_key {
                    Key::Named(NamedKey::ArrowLeft) => {
                        if meta {
                            inner.editor.move_home(shift);
                        } else if word {
                            inner.editor.move_word_left(shift);
                        } else {
                            inner.editor.move_left(shift);
                        }
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::ArrowRight) => {
                        if meta {
                            inner.editor.move_end(shift);
                        } else if word {
                            inner.editor.move_word_right(shift);
                        } else {
                            inner.editor.move_right(shift);
                        }
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::ArrowUp) => {
                        if meta {
                            inner.editor.move_doc_start(shift);
                        } else {
                            inner.editor.move_up(shift);
                        }
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::ArrowDown) => {
                        if meta {
                            inner.editor.move_doc_end(shift);
                        } else {
                            inner.editor.move_down(shift);
                        }
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::Home) => {
                        inner.editor.move_home(shift);
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::End) => {
                        inner.editor.move_end(shift);
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::PageUp) => {
                        inner.editor.move_page_up(shift);
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::PageDown) => {
                        inner.editor.move_page_down(shift);
                        inner.window.request_redraw();
                    }

                    Key::Named(NamedKey::Backspace) => {
                        if meta {
                            inner.editor.backspace_line();
                        } else if word {
                            inner.editor.backspace_word();
                        } else {
                            inner.editor.backspace();
                        }
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::Delete) => {
                        if meta {
                            inner.editor.delete_line_forward();
                        } else if word {
                            inner.editor.delete_word_forward();
                        } else {
                            inner.editor.delete_forward();
                        }
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::Enter) => {
                        inner.editor.insert_text("\n");
                        inner.window.request_redraw();
                    }

                    _ if cmd => {
                        match ke.physical_key {
                            PhysicalKey::Code(KeyCode::KeyB) => {
                                inner.editor.toggle_bold();
                                inner.window.request_redraw();
                            }
                            PhysicalKey::Code(KeyCode::KeyI) => {
                                inner.editor.toggle_italic();
                                inner.window.request_redraw();
                            }
                            PhysicalKey::Code(KeyCode::KeyU) => {
                                inner.editor.toggle_underline();
                                inner.window.request_redraw();
                            }
                            // Cmd+Shift+> (Period) — increase font size
                            PhysicalKey::Code(KeyCode::Period) if shift => {
                                inner.editor.increase_font_size(1.0);
                                inner.window.request_redraw();
                            }
                            // Cmd+Shift+< (Comma) — decrease font size
                            PhysicalKey::Code(KeyCode::Comma) if shift => {
                                inner.editor.decrease_font_size(1.0);
                                inner.window.request_redraw();
                            }
                            PhysicalKey::Code(KeyCode::KeyA) => {
                                inner.editor.select_all();
                                inner.window.request_redraw();
                            }
                            PhysicalKey::Code(KeyCode::KeyZ) => {
                                if shift {
                                    if inner.editor.redo() {
                                        inner.window.request_redraw();
                                    }
                                } else if inner.editor.undo() {
                                    inner.window.request_redraw();
                                }
                            }
                            PhysicalKey::Code(KeyCode::KeyC) => {
                                if let Some((lo, hi)) = inner.editor.selection_range() {
                                    let plain = inner.editor.selected_text().unwrap_or("").to_string();
                                    let html = runs_to_html(&inner.editor.content, lo, hi);
                                    let _ = self.clipboard.set_html(&html, Some(&plain));
                                }
                            }
                            PhysicalKey::Code(KeyCode::KeyX) if shift => {
                                // Cmd+Shift+X — toggle strikethrough
                                inner.editor.toggle_strikethrough();
                                inner.window.request_redraw();
                            }
                            PhysicalKey::Code(KeyCode::KeyX) => {
                                // Cmd+X — cut
                                if let Some((lo, hi)) = inner.editor.selection_range() {
                                    let plain = inner.editor.selected_text().unwrap_or("").to_string();
                                    let html = runs_to_html(&inner.editor.content, lo, hi);
                                    let _ = self.clipboard.set_html(&html, Some(&plain));
                                }
                                if inner.editor.has_selection() {
                                    inner.editor.apply(EditingCommand::Delete);
                                    inner.window.request_redraw();
                                }
                            }
                            PhysicalKey::Code(KeyCode::KeyV) => {
                                // Try HTML first (preserves formatting), fall back to plain text.
                                let mut handled = false;
                                if let Ok(html) = self.clipboard.get().html() {
                                    let base = inner.editor.content.default_style().clone();
                                    if let Ok(pasted) = html_to_attributed_text(&html, base) {
                                        inner.editor.paste_attributed(&pasted);
                                        inner.window.request_redraw();
                                        handled = true;
                                    }
                                }
                                if !handled {
                                    if let Ok(text) = self.clipboard.get_text() {
                                        inner.editor.insert_text(&text);
                                        inner.window.request_redraw();
                                    }
                                }
                            }
                            _ => {}
                        }
                    }

                    // -------------------------------------------------------
                    // Dev-only function key bindings
                    // -------------------------------------------------------
                    // F1: black  F2: red  F3: blue    — color presets
                    // F5: Inter (sans)  F6: Lora (serif)  F7: Inconsolata (mono)
                    Key::Named(NamedKey::F1) => {
                        inner.editor.dev_set_color(RGBA::BLACK);
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::F2) => {
                        inner.editor.dev_set_color(RGBA { r: 0.9, g: 0.2, b: 0.2, a: 1.0 });
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::F3) => {
                        inner.editor.dev_set_color(RGBA { r: 0.2, g: 0.4, b: 0.9, a: 1.0 });
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::F5) => {
                        inner.editor.dev_set_font("Inter");
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::F6) => {
                        inner.editor.dev_set_font("Lora");
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::F7) => {
                        inner.editor.dev_set_font("Inconsolata");
                        inner.window.request_redraw();
                    }

                    Key::Character(c)
                        if !cmd && inner.editor.preedit.is_none() =>
                    {
                        inner.editor.insert_text(c.as_str());
                        inner.window.request_redraw();
                    }

                    Key::Named(NamedKey::Space)
                        if inner.editor.preedit.is_none() =>
                    {
                        inner.editor.insert_text(" ");
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::Tab)
                        if inner.editor.preedit.is_none() =>
                    {
                        inner.editor.insert_text("    ");
                        inner.window.request_redraw();
                    }

                    _ => {}
                }

                // Drain the empty-preedit sentinel left by Ime::Preedit("").
                // It blocked the text-insertion arms above for exactly this
                // one KeyboardInput event; now reset so the next key works
                // normally.
                if inner.editor.preedit.as_deref() == Some("") {
                    inner.editor.preedit = None;
                }
            }

            WindowEvent::MouseWheel { delta, .. } => {
                let dy = match delta {
                    MouseScrollDelta::PixelDelta(pos) => pos.y as f32,
                    MouseScrollDelta::LineDelta(_, lines) => lines * FONT_SIZE * 3.0,
                };
                inner.editor.scroll_by(-dy);
                inner.window.request_redraw();
            }

            WindowEvent::CursorMoved { position, .. } => {
                let x = position.x as f32;
                let y = position.y as f32;
                self.last_mouse_pos = (x, y);
                inner.editor.on_mouse_move(
                    x - PADDING,
                    y - PADDING + inner.editor.scroll_y,
                );
                if inner.editor.mouse_down {
                    inner.window.request_redraw();
                }
            }

            WindowEvent::MouseInput {
                state,
                button: MouseButton::Left,
                ..
            } => match state {
                ElementState::Pressed => {
                    let (x, y) = self.last_mouse_pos;
                    let local_x = x - PADDING;
                    let local_y = y - PADDING;
                    let shift = self.modifiers.shift_key();

                    let scroll_y = inner.editor.scroll_y;
                    let layout_y = local_y + scroll_y;

                    if shift {
                        inner.editor.shift_click(local_x, layout_y);
                        inner.window.request_redraw();
                    } else {
                        let now = Instant::now();
                        let in_sequence = self
                            .last_click_time
                            .map(|t| {
                                let (px, py) = self.last_click_pos;
                                now.duration_since(t) < Duration::from_millis(400)
                                    && (px - x).abs() < 5.0
                                    && (py - y).abs() < 5.0
                            })
                            .unwrap_or(false);

                        self.click_count =
                            if in_sequence { (self.click_count + 1).min(4) } else { 1 };
                        self.last_click_time = Some(now);
                        self.last_click_pos = (x, y);

                        match self.click_count {
                            1 => inner.editor.on_mouse_down(local_x, layout_y),
                            2 => inner.editor.select_word_at(local_x, layout_y),
                            3 => inner.editor.select_line_at(local_x, layout_y),
                            _ => inner.editor.select_all(),
                        }
                        inner.window.request_redraw();
                    }
                }
                ElementState::Released => {
                    inner.editor.on_mouse_up();
                }
            },

            WindowEvent::RedrawRequested => {
                inner.editor.tick_blink();
                {
                    let canvas = inner.gl_skia.surface.canvas();
                    inner.editor.draw(canvas);
                }
                inner.gl_skia.flush_and_present();

                let cr = inner.editor.caret_rect();
                let scroll_y = inner.editor.scroll_y;
                inner.window.set_ime_cursor_area(
                    LogicalPosition::new(
                        (cr.x + PADDING) as f64,
                        (cr.y + PADDING - scroll_y) as f64,
                    ),
                    LogicalSize::new(1.0f64, cr.height as f64),
                );

                let deadline = inner.editor.next_blink_deadline();
                event_loop.set_control_flow(ControlFlow::WaitUntil(deadline));
            }

            // ---------------------------------------------------------------
            // Dev-only: drag-and-drop .txt / .html files to load content
            // ---------------------------------------------------------------
            WindowEvent::DroppedFile(path) => {
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_ascii_lowercase());

                match ext.as_deref() {
                    Some("txt") => match fs::read_to_string(&path) {
                        Ok(content) => {
                            let default_style = inner.editor.content.default_style().clone();
                            inner.editor.content = AttributedText::new(&content, default_style);
                            inner.editor.state.text = inner.editor.content.text().to_owned();
                            inner.editor.state.cursor = 0;
                            inner.editor.state.anchor = None;
                            inner.editor.caret_style_override = None;
                            inner.editor.cached_caret_rect = None;
                            inner.editor.layout.invalidate();
                            inner.editor.scroll_y = 0.0;
                            inner.editor.reset_blink();
                            eprintln!("loaded plain text: {}", path.display());
                            inner.window.request_redraw();
                        }
                        Err(err) => {
                            eprintln!("failed to read {}: {err}", path.display());
                        }
                    },
                    Some("html" | "htm") => match fs::read_to_string(&path) {
                        Ok(html) => {
                            let base = inner.editor.content.default_style().clone();
                            match html_to_attributed_text(&html, base) {
                                Ok(content) => {
                                    inner.editor.state.text = content.text().to_owned();
                                    inner.editor.content = content;
                                    inner.editor.state.cursor = 0;
                                    inner.editor.state.anchor = None;
                                    inner.editor.caret_style_override = None;
                                    inner.editor.cached_caret_rect = None;
                                    inner.editor.layout.invalidate();
                                    inner.editor.scroll_y = 0.0;
                                    inner.editor.reset_blink();
                                    eprintln!("loaded HTML: {}", path.display());
                                    inner.window.request_redraw();
                                }
                                Err(e) => {
                                    eprintln!("malformed HTML in {}: {e}", path.display());
                                }
                            }
                        }
                        Err(err) => {
                            eprintln!("failed to read {}: {err}", path.display());
                        }
                    },
                    _ => {
                        eprintln!(
                            "unsupported drop (expected .txt or .html): {}",
                            path.display()
                        );
                    }
                }
            }

            _ => {}
        }
    }

    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        let Some(inner) = self.inner.as_mut() else { return; };
        if inner.editor.tick_blink() {
            inner.window.request_redraw();
        }
        let deadline = inner.editor.next_blink_deadline();
        event_loop.set_control_flow(ControlFlow::WaitUntil(deadline));
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

fn main() {
    let policy = std::env::args()
        .find(|a| a.starts_with("--rect-mode="))
        .map(|a| match a.strip_prefix("--rect-mode=").unwrap() {
            "none" => EmptyLineSelectionPolicy::None,
            "tight" => EmptyLineSelectionPolicy::GlyphRect,
            "linebox" => EmptyLineSelectionPolicy::LineBox,
            other => {
                eprintln!("unknown --rect-mode={other}, using 'tight'");
                EmptyLineSelectionPolicy::GlyphRect
            }
        })
        .unwrap_or(EmptyLineSelectionPolicy::GlyphRect);

    let config = TextEditorConfig { empty_line_policy: policy };
    let el = EventLoop::new().expect("event loop");
    let mut app = TextEditorApp::new(config);
    el.run_app(&mut app).expect("run_app");
}
