//! Minimal plain-text editor built directly on winit + Skia.
//!
//! Editing logic lives in `grida_dev::text_edit` (no Skia dependency).
//! This file wires it up to Skia paragraph layout (`SkiaLayoutEngine`) and
//! the winit event loop.
//!
//! Feature checklist
//! -----------------
//! Editing
//!   [x] Text insertion – IME commit (Ime::Commit) + Key::Character fallback
//!   [x] Backspace – delete grapheme before cursor (or selected range)
//!   [x] Delete    – delete grapheme after cursor (or selected range)
//!   [x] Enter     – insert newline
//!   [x] Tab       – insert 4 spaces
//!
//! Cursor movement
//!   [x] ← / →                grapheme-cluster navigation
//!   [x] ↑ / ↓                line-aware navigation (Skia line-metrics + position_at_point)
//!   [x] Home / End            line start / end
//!   [x] PageUp / PageDown     move by ~visible lines (manifesto viewport boundaries)
//!   [x] Cmd+← / →            line start / end  (macOS)
//!   [x] Cmd+↑ / ↓            document start / end  (macOS)
//!   [x] Option+← / →         word jump  (macOS)
//!   [x] Ctrl+← / →           word jump  (Windows / Linux)
//!
//! Selection
//!   [x] Shift+arrow           extend selection in any direction
//!   [x] Shift+Cmd/Opt/Ctrl    extend selection with the same jumps as above
//!   [x] Mouse click           place cursor
//!   [x] Mouse drag            drag-to-select range
//!   [x] Shift+click           extend selection from current cursor to click position
//!   [x] k=2 double-click      select word  (Skia get_word_boundary)
//!   [x] k=3 triple-click      select visual line  (Skia get_line_metrics)
//!   [x] k=4 quad-click        select entire document
//!   [x] Cmd+A                 select all
//!
//! Clipboard
//!   [x] Cmd/Ctrl+C            copy selection
//!   [x] Cmd/Ctrl+X            cut selection
//!   [x] Cmd/Ctrl+V            paste
//!
//! Rendering
//!   [x] Multiline text with wrapping
//!   [x] Cursor blink (500 ms, resets on any input)
//!   [x] Selection highlight (Skia get_rects_for_range)
//!   [x] Empty-line selection invariant (configurable: GlyphRect vs LineBox)
//!   [x] Resize – paragraph relaid out on window resize
//!
//!   [x] IME composition (set_ime_allowed + Preedit → underlined inline segment;
//!                        Key::Character suppressed during active composition)
//!
//! Not yet implemented
//!   [ ] Undo / redo
//!   [ ] Scroll (vertical)
//!   [ ] Visual-order bidi cursor movement

#![allow(clippy::single_match)]

use std::ffi::CString;
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
        FontCollection, Paragraph, ParagraphBuilder, ParagraphStyle, RectHeightStyle,
        RectWidthStyle, TextDecoration, TextStyle,
    },
    Color, ColorType, FontMgr, Paint, Point, Rect, Surface,
};
use winit::{
    application::ApplicationHandler,
    dpi::{LogicalPosition, LogicalSize, PhysicalSize},
    event::{ElementState, Ime, MouseButton, WindowEvent},
    event_loop::{ActiveEventLoop, ControlFlow, EventLoop},
    keyboard::{Key, ModifiersState, NamedKey},
    window::{Window, WindowAttributes, WindowId},
};

use grida_dev::text_edit::{
    apply_command, prev_grapheme_boundary, snap_grapheme_boundary, utf16_to_utf8_offset,
    utf8_to_utf16_offset, EditingCommand, LineMetrics, TextEditorState, TextLayoutEngine,
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

// ---------------------------------------------------------------------------
// SkiaLayoutEngine  — implements TextLayoutEngine using Skia Paragraph
// ---------------------------------------------------------------------------

/// Skia-backed `TextLayoutEngine`.
///
/// Rebuilds the `Paragraph` lazily when text or layout_width changes.
struct SkiaLayoutEngine {
    font_collection: FontCollection,
    paragraph: Option<Paragraph>,
    layout_width: f32,
    layout_height: f32,
    /// Text at the time of the last paragraph build.
    cached_text: String,
}

impl SkiaLayoutEngine {
    fn new(layout_width: f32, layout_height: f32) -> Self {
        let mut fc = FontCollection::new();
        fc.set_default_font_manager(FontMgr::new(), None);
        Self {
            font_collection: fc,
            paragraph: None,
            layout_width,
            layout_height,
            cached_text: String::new(),
        }
    }

    fn ensure_layout(&mut self, text: &str) {
        if self.paragraph.is_none() || self.cached_text != text {
            self.rebuild(text);
        }
    }

    fn rebuild(&mut self, text: &str) {
        let mut style = ParagraphStyle::new();
        style.set_apply_rounding_hack(false);
        let mut ts = TextStyle::new();
        ts.set_font_size(FONT_SIZE);
        ts.set_color(Color::BLACK);
        ts.set_font_families(&["Menlo", "Courier New", "monospace"]);
        let mut builder = ParagraphBuilder::new(&style, &self.font_collection);
        builder.push_style(&ts);
        builder.add_text(text);
        let mut para = builder.build();
        para.layout(self.layout_width);
        self.paragraph = Some(para);
        self.cached_text = text.to_owned();
    }

    fn set_layout_width(&mut self, w: f32) {
        let new_w = (w - PADDING * 2.0).max(1.0);
        if (new_w - self.layout_width).abs() > 0.5 {
            self.layout_width = new_w;
            self.paragraph = None; // invalidate
        }
    }

    fn set_layout_height(&mut self, h: f32) {
        let new_h = (h - PADDING * 2.0).max(1.0);
        if (new_h - self.layout_height).abs() > 0.5 {
            self.layout_height = new_h;
        }
    }

    /// Return a reference to the paragraph, ensuring it's built for `text`.
    fn para(&mut self, text: &str) -> &Paragraph {
        self.ensure_layout(text);
        self.paragraph.as_ref().unwrap()
    }
}

impl TextLayoutEngine for SkiaLayoutEngine {
    fn line_metrics(&mut self, text: &str) -> Vec<LineMetrics> {
        let skia = self.para(text).get_line_metrics();
        skia.iter()
            .map(|lm| LineMetrics {
                start_index: utf16_to_utf8_offset(text, lm.start_index),
                end_index: utf16_to_utf8_offset(text, lm.end_index).min(text.len()),
                baseline: lm.baseline as f32,
                ascent: lm.ascent as f32,
                descent: lm.descent as f32,
            })
            .collect()
    }

    fn position_at_point(&mut self, text: &str, x: f32, y: f32) -> usize {
        self.ensure_layout(text);
        let para = self.paragraph.as_ref().unwrap();
        let metrics = para.get_line_metrics();

        // Empty-line check: if the target y falls within an empty line's band,
        // return that line's start offset directly.  Skia's hit-test returns
        // the previous line's position for empty lines → cursor gets locked.
        for lm in &metrics {
            let top = lm.baseline as f32 - lm.ascent as f32;
            let bot = lm.baseline as f32 + lm.descent as f32;
            if y >= top - 0.5 && y <= bot + 0.5 {
                if lm.end_index.saturating_sub(lm.start_index) <= 1 {
                    return utf16_to_utf8_offset(text, lm.start_index).min(text.len());
                }
                break;
            }
        }

        let pwa = para.get_glyph_position_at_coordinate(Point::new(x, y));
        let raw = utf16_to_utf8_offset(text, pwa.position.max(0) as usize).min(text.len());
        // Use snap_grapheme_boundary rather than prev_grapheme_boundary:
        // Skia often returns the exact start of a grapheme; prev_grapheme_boundary
        // would step back one cluster in that case, locking the cursor on the
        // previous line (the empty-line lock bug).
        snap_grapheme_boundary(text, raw)
    }

    fn caret_x_at(&mut self, text: &str, offset: usize) -> f32 {
        if offset == 0 {
            return 0.0;
        }
        if text[..offset].ends_with('\n') {
            return 0.0;
        }
        self.ensure_layout(text);
        let u16_end = utf8_to_utf16_offset(text, offset);

        // Query the rect for the ENTIRE grapheme cluster that ends at `offset`,
        // not just the last UTF-16 code unit.
        //
        // Without this, complex-script combining marks (Devanagari virama/vowel
        // signs, Thai sara) produce a rect positioned at the base consonant
        // rather than the visual end of the cluster, causing the caret to jump
        // leftward after stepping through the cluster — visually incorrect for
        // LTR scripts.
        let cluster_start = prev_grapheme_boundary(text, offset);
        let u16_start = utf8_to_utf16_offset(text, cluster_start);

        let rects = self.paragraph.as_ref().unwrap().get_rects_for_range(
            u16_start..u16_end,
            RectHeightStyle::Max,
            RectWidthStyle::Tight,
        );
        // Use the rightmost right edge across all returned rects (handles bidi
        // runs where the cluster may span more than one rect).
        rects.iter().map(|tb| tb.rect.right()).fold(0.0_f32, f32::max)
    }

    fn word_boundary_at(&mut self, text: &str, offset: usize) -> (usize, usize) {
        self.ensure_layout(text);
        let u16_pos = utf8_to_utf16_offset(text, offset) as u32;
        let para = self.paragraph.as_ref().unwrap();
        let range = para.get_word_boundary(u16_pos);
        let start = utf16_to_utf8_offset(text, range.start as usize);
        let end = utf16_to_utf8_offset(text, range.end as usize);
        (start, end)
    }

    fn viewport_height(&self) -> f32 {
        self.layout_height
    }
}

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

struct TextEditor {
    /// Pure editing state: text, cursor, anchor.
    pub state: TextEditorState,
    /// Skia-backed layout engine (shared with apply_command calls).
    layout: SkiaLayoutEngine,

    // UI-only state (not part of editing logic)
    cursor_visible: bool,
    last_blink: Instant,
    mouse_down: bool,
    drag_anchor_utf8: Option<usize>,

    /// Active IME preedit string (NOT in state.text; rendered inline).
    preedit: Option<String>,

    empty_line_policy: EmptyLineSelectionPolicy,
}

impl TextEditor {
    fn new(config: TextEditorConfig) -> Self {
        Self {
            state: TextEditorState::with_cursor(String::new(), 0),
            layout: SkiaLayoutEngine::new(
                (WINDOW_W as f32) - PADDING * 2.0,
                (WINDOW_H as f32) - PADDING * 2.0,
            ),
            cursor_visible: true,
            last_blink: Instant::now(),
            mouse_down: false,
            drag_anchor_utf8: None,
            preedit: None,
            empty_line_policy: config.empty_line_policy,
        }
    }

    // -----------------------------------------------------------------------
    // Core: apply an editing command
    // -----------------------------------------------------------------------

    fn apply(&mut self, cmd: EditingCommand) {
        self.state = apply_command(&self.state, cmd, &mut self.layout);
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

    fn delete_forward(&mut self) {
        self.apply(EditingCommand::Delete);
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
        self.layout.set_layout_width(w);
    }

    fn set_layout_height(&mut self, h: f32) {
        self.layout.set_layout_height(h);
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
        self.preedit = if text.is_empty() { None } else { Some(text) };
        self.reset_blink();
    }

    fn cancel_preedit(&mut self) {
        self.preedit = None;
        self.reset_blink();
    }

    // -----------------------------------------------------------------------
    // Caret geometry helpers (for cursor rendering and IME popup placement)
    // -----------------------------------------------------------------------

    fn cursor_x(&mut self) -> f32 {
        self.layout.caret_x_at(&self.state.text, self.state.cursor)
    }

    /// Baseline y of the cursor line, in layout-local space.
    /// Handles the Skia phantom-line case for trailing newlines.
    fn cursor_baseline_y(&mut self) -> f32 {
        self.layout.ensure_layout(&self.state.text);
        let metrics = self.layout.paragraph.as_ref().unwrap().get_line_metrics();
        if metrics.is_empty() {
            return FONT_SIZE;
        }
        let cur_u16 = utf8_to_utf16_offset(&self.state.text, self.state.cursor);
        let idx = skia_line_index_for_u16_offset(&metrics, cur_u16);
        let baseline = metrics[idx].baseline as f32;

        // Skia does NOT emit line metrics for a trailing '\n'. Extrapolate.
        let after_trailing_newline = self.state.cursor > 0
            && self.state.text[..self.state.cursor].ends_with('\n')
            && idx == metrics.len() - 1;
        if after_trailing_newline {
            let line_height = if metrics.len() >= 2 {
                (metrics[metrics.len() - 1].baseline
                    - metrics[metrics.len() - 2].baseline) as f32
            } else {
                FONT_SIZE * 1.3
            };
            return baseline + line_height;
        }

        baseline
    }

    // -----------------------------------------------------------------------
    // Draw
    // -----------------------------------------------------------------------

    fn draw(&mut self, canvas: &skia_safe::Canvas) {
        canvas.clear(Color::WHITE);
        let origin = Point::new(PADDING, PADDING);

        let preedit = self.preedit.as_deref().filter(|p| !p.is_empty()).map(str::to_owned);

        if let Some(ref p) = preedit {
            // ---- preedit mode ----
            let pre = &self.state.text[..self.state.cursor];
            let post = &self.state.text[self.state.cursor..];
            let display_text = format!("{}{}{}", pre, p, post);

            let preedit_end_utf8 = pre.len() + p.len();
            let preedit_start_u16 = utf8_to_utf16_offset(&display_text, pre.len());
            let preedit_end_u16 = utf8_to_utf16_offset(&display_text, preedit_end_utf8);

            let ts_normal = {
                let mut ts = TextStyle::new();
                ts.set_font_size(FONT_SIZE);
                ts.set_color(Color::BLACK);
                ts.set_font_families(&["Menlo", "Courier New", "monospace"]);
                ts
            };
            let ts_preedit = {
                let mut ts = TextStyle::new();
                ts.set_font_size(FONT_SIZE);
                ts.set_color(Color::BLACK);
                ts.set_font_families(&["Menlo", "Courier New", "monospace"]);
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
            // ---- normal mode ----
            self.layout.ensure_layout(&self.state.text);

            // Selection
            if let Some((lo, hi)) = self.selection_range() {
                if lo < hi {
                    let u16_lo = utf8_to_utf16_offset(&self.state.text, lo);
                    let u16_hi = utf8_to_utf16_offset(&self.state.text, hi);
                    let rects = selection_rects_with_empty_line_invariant(
                        self.layout.paragraph.as_ref().unwrap(),
                        &self.state.text,
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

            // Text
            if let Some(ref para) = self.layout.paragraph {
                para.paint(canvas, origin);
            }

            // Cursor
            if self.cursor_visible && !self.has_selection() {
                let cx = self.cursor_x();
                let cy = self.cursor_baseline_y();
                let cursor_rect = Rect::from_xywh(
                    cx + origin.x - CURSOR_WIDTH / 2.0,
                    cy - FONT_SIZE + origin.y,
                    CURSOR_WIDTH,
                    FONT_SIZE * 1.2,
                );
                let mut cp = Paint::default();
                cp.set_color(Color::BLACK);
                cp.set_anti_alias(false);
                canvas.draw_rect(cursor_rect, &cp);
            }
        }
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

        let mut editor = TextEditor::new(TextEditorConfig {
            empty_line_policy: self.config.empty_line_policy,
        });
        editor.set_layout_width(w as f32);
        editor.set_layout_height(h as f32);
        editor.state.text = concat!(
            "Hello, World!\n",
            "Type here to edit text.\n",
            "\n",
            "=== Controls ===\n",
            "← → ↑ ↓  move cursor         Shift+arrow  extends selection\n",
            "Cmd+← / →  line start/end     Cmd+↑ / ↓  document start/end\n",
            "Option+← / →  word jump       Ctrl+← / →  word jump (Win/Linux)\n",
            "Home / End  line start/end    PageUp / PageDown  move by ~visible lines\n",
            "Double-click  select word     Mouse drag  select range\n",
            "Cmd+A  select all             Cmd+C / X / V  clipboard\n",
            "\n",
            "=== Writing Systems / Shaping / Selection Tests ===\n",
            "\n",
            "[Latin + punctuation]\n",
            "The quick brown fox jumps over 13 lazy dogs. (quotes) \u{201C}like this\u{201D} and \u{2018}this\u{2019}.\n",
            "Hyphens: state-of-the-art \u{2014} em dash \u{2014} en dash \u{2013} minus \u{2212}  ellipsis \u{2026}\n",
            "\n",
            "[Accents / combining marks]\n",
            "precomposed: caf\u{00E9}, na\u{00EF}ve, co\u{00F6}perate\n",
            "combining:   cafe\u{0301}  (e + U+0301)   a\u{0308} (a + U+0308)\n",
            "edge:        Z\u{0351}\u{0327}\u{0301}  (stacked combining marks)\n",
            "\n",
            "[Hangul]\n",
            "Korean: \u{C548}\u{B155}\u{D558}\u{C138}\u{C694}  (precomposed syllables)\n",
            "Jamo:   \u{3147}\u{314F}\u{3134}\u{3134}\u{3155}\u{3147}\u{314E}\u{314F}\u{3145}\u{3154}\u{3147}\u{3155}  (decomposed jamo sequence)\n",
            "Mix:    ABC\u{AC00}\u{B098}\u{B2E4}123 (Latin + Hangul + digits)\n",
            "\n",
            "[Japanese]\n",
            "\u{65E5}\u{672C}\u{8A9E}: \u{3053}\u{3093}\u{306B}\u{3061}\u{306F}\u{4E16}\u{754C}  / \u{30AB}\u{30BF}\u{30AB}\u{30CA}: \u{30C6}\u{30B9}\u{30C8}  / \u{3072}\u{3089}\u{304C}\u{306A}: \u{3066}\u{3059}\u{3068}\n",
            "\n",
            "[Chinese]\n",
            "\u{4E2D}\u{6587}: \u{4F60}\u{597D}\u{FF0C}\u{4E16}\u{754C}\u{3002}\u{7E41}\u{9AD4}\u{5B57}\u{FF1A}\u{7E41}\u{9AD4}\u{4E2D}\u{6587}\u{3002}\n",
            "\n",
            "[Arabic (RTL) + mixing]\n",
            "\u{0627}\u{0644}\u{0639}\u{0631}\u{0628}\u{064A}\u{0629}: \u{0645}\u{0631}\u{062D}\u{0628}\u{0627} \u{0628}\u{0627}\u{0644}\u{0639}\u{0627}\u{0644}\u{0645}\n",
            "mix RTL/LTR: ABC \u{0627}\u{0644}\u{0639}\u{0631}\u{0628}\u{064A}\u{0629} 123 DEF\n",
            "numbers: \u{0661}\u{0662}\u{0663}\u{0664}\u{0665}  vs  12345\n",
            "\n",
            "[Hebrew (RTL) + mixing]\n",
            "\u{05E2}\u{05D1}\u{05E8}\u{05D9}\u{05EA}: \u{05E9}\u{05DC}\u{05D5}\u{05DD} \u{05E2}\u{05D5}\u{05DC}\u{05DD}\n",
            "mix RTL/LTR: ABC \u{05E9}\u{05DC}\u{05D5}\u{05DD} 123 DEF\n",
            "\n",
            "[Devanagari (conjuncts / reordering)]\n",
            "\u{0939}\u{093F}\u{0928}\u{094D}\u{0926}\u{0940}: \u{0928}\u{092E}\u{0938}\u{094D}\u{0924}\u{0947} \u{0926}\u{0941}\u{0928}\u{093F}\u{092F}\u{093E}  / conjunct-ish: \u{0915}\u{094D}\u{0937}, \u{0924}\u{094D}\u{0930}, \u{091C}\u{094D}\u{091E}\n",
            "\n",
            "[Thai (no spaces between words)]\n",
            "\u{0E44}\u{0E17}\u{0E22}: \u{0E2A}\u{0E27}\u{0E31}\u{0E2A}\u{0E14}\u{0E35}\u{0E42}\u{0E25}\u{0E01} (word boundaries can be tricky)\n",
            "\n",
            "[Emoji / ZWJ sequences / skin tones]\n",
            "emoji: \u{1F600} \u{1F601} \u{1F602} \u{1F605} \u{1F607}\n",
            "ZWJ family: \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}   couple: \u{1F469}\u{200D}\u{2764}\u{FE0F}\u{200D}\u{1F469}\n",
            "professions: \u{1F9D1}\u{200D}\u{1F4BB}  \u{1F469}\u{200D}\u{1F52C}  \u{1F468}\u{200D}\u{1F373}\n",
            "skin tones: \u{1F44D} \u{1F44D}\u{1F3FB} \u{1F44D}\u{1F3FD} \u{1F44D}\u{1F3FF}\n",
            "flags: \u{1F1F0}\u{1F1F7} \u{1F1FA}\u{1F1F8} \u{1F1EF}\u{1F1F5} \u{1F1EB}\u{1F1F7}\n",
            "\n",
            "[Ligature hint (font-dependent)]\n",
            "fi fl ffi ffl (ligatures may appear depending on font)\n",
            "\n",
            "[Whitespace / tabs]\n",
            "spaces: A  B   C    D\n",
            "tabs:   A\tB\tC\tD\n",
        )
        .to_string();
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
                inner.editor.cancel_preedit();
                inner.editor.insert_text(&s);
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
                        inner.editor.backspace();
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::Delete) => {
                        inner.editor.delete_forward();
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::Enter) => {
                        inner.editor.insert_text("\n");
                        inner.window.request_redraw();
                    }

                    Key::Character(c) if cmd => {
                        match c.to_lowercase().as_str() {
                            "a" => {
                                inner.editor.select_all();
                                inner.window.request_redraw();
                            }
                            "c" => {
                                if let Some(sel) = inner.editor.selected_text() {
                                    let _ = self.clipboard.set_text(sel.to_string());
                                }
                            }
                            "x" => {
                                if let Some(sel) = inner.editor.selected_text() {
                                    let _ = self.clipboard.set_text(sel.to_string());
                                }
                                if inner.editor.has_selection() {
                                    inner.editor.apply(EditingCommand::Delete);
                                    inner.window.request_redraw();
                                }
                            }
                            "v" => {
                                if let Ok(text) = self.clipboard.get_text() {
                                    inner.editor.insert_text(&text);
                                    inner.window.request_redraw();
                                }
                            }
                            _ => {}
                        }
                    }

                    Key::Character(c)
                        if !cmd && inner.editor.preedit.is_none() =>
                    {
                        inner.editor.insert_text(c.as_str());
                        inner.window.request_redraw();
                    }

                    Key::Named(NamedKey::Space) => {
                        inner.editor.insert_text(" ");
                        inner.window.request_redraw();
                    }
                    Key::Named(NamedKey::Tab) => {
                        inner.editor.insert_text("    ");
                        inner.window.request_redraw();
                    }

                    _ => {}
                }
            }

            WindowEvent::CursorMoved { position, .. } => {
                let x = position.x as f32;
                let y = position.y as f32;
                self.last_mouse_pos = (x, y);
                inner.editor.on_mouse_move(x - PADDING, y - PADDING);
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

                    if shift {
                        inner.editor.shift_click(local_x, local_y);
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
                            1 => inner.editor.on_mouse_down(local_x, local_y),
                            2 => inner.editor.select_word_at(local_x, local_y),
                            3 => inner.editor.select_line_at(local_x, local_y),
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

                let cx = inner.editor.cursor_x() + PADDING;
                let cy = inner.editor.cursor_baseline_y() - FONT_SIZE + PADDING;
                inner.window.set_ime_cursor_area(
                    LogicalPosition::new(cx as f64, cy as f64),
                    LogicalSize::new(1.0f64, FONT_SIZE as f64),
                );

                let deadline = inner.editor.next_blink_deadline();
                event_loop.set_control_flow(ControlFlow::WaitUntil(deadline));
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
