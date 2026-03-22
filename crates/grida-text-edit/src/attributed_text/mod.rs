//! Attributed text: a run-based rich text data model.
//!
//! This module implements the data model specified in
//! `docs/wg/feat-text-editing/attributed-text.md`.
//!
//! # Overview
//!
//! [`AttributedText`] pairs a UTF-8 backing string with an ordered sequence of
//! [`StyledRun`]s that fully partition the string. Each run carries a
//! [`TextStyle`] — the complete set of per-character visual attributes.
//!
//! Paragraph-level attributes (alignment, direction, etc.) live in
//! [`ParagraphStyle`] and are uniform across the entire text block.
//!
//! # Invariants
//!
//! The run list satisfies seven invariants at all times (enforced by
//! `debug_assert!` after every mutation):
//!
//! 1. **Non-empty run list** — `runs.len() >= 1`.
//! 2. **Coverage** — first run starts at 0, last run ends at `text.len()`.
//! 3. **Contiguity** — `runs[i].end == runs[i+1].start`.
//! 4. **Non-degenerate** — `start < end` (except the single degenerate
//!    empty-text run).
//! 5. **Maximality** — no two adjacent runs have equal styles.
//! 6. **Boundary alignment** — all offsets are valid UTF-8 char boundaries.
//! 7. **Monotonicity** — `runs[i].start < runs[i+1].start` (implied by 3+4).

pub mod html;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Supporting types (self-contained, aligned with cg::types vocabulary)
// ---------------------------------------------------------------------------

/// Text transform (CSS `text-transform`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TextTransform {
    None,
    Uppercase,
    Lowercase,
    Capitalize,
}

impl Default for TextTransform {
    fn default() -> Self {
        Self::None
    }
}

/// Text decoration line (CSS `text-decoration-line`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TextDecorationLine {
    None,
    Underline,
    Overline,
    LineThrough,
}

impl Default for TextDecorationLine {
    fn default() -> Self {
        Self::None
    }
}

/// Text decoration style (CSS `text-decoration-style`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TextDecorationStyle {
    Solid,
    Double,
    Dotted,
    Dashed,
    Wavy,
}

impl Default for TextDecorationStyle {
    fn default() -> Self {
        Self::Solid
    }
}

/// Font optical sizing mode.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum FontOpticalSizing {
    /// Automatically set `opsz` to the font size.
    Auto,
    /// Disable optical sizing.
    None,
    /// Use a fixed optical size value.
    Fixed(f32),
}

impl Default for FontOpticalSizing {
    fn default() -> Self {
        Self::Auto
    }
}

/// A dimension that can be `Normal` (unset), a fixed px value, or a factor.
///
/// Used for `line_height`, `letter_spacing`, `word_spacing`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum TextDimension {
    /// Normal / auto (no override).
    Normal,
    /// Fixed value in layout-local points (px).
    Fixed(f32),
    /// Multiplier factor (1.0 = 100%).
    Factor(f32),
}

impl Default for TextDimension {
    fn default() -> Self {
        Self::Normal
    }
}

/// An OpenType font feature toggle.
///
/// Tag is a 4-byte ASCII string (e.g. `"kern"`, `"liga"`, `"ss01"`).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct FontFeature {
    pub tag: String,
    pub value: bool,
}

/// A font variation axis value.
///
/// Axis is a 4-byte ASCII tag (e.g. `"wght"`, `"wdth"`, `"slnt"`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FontVariation {
    pub axis: String,
    pub value: f32,
}

/// RGBA color (f32 components, 0.0..1.0).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct RGBA {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

impl RGBA {
    pub const BLACK: Self = Self { r: 0.0, g: 0.0, b: 0.0, a: 1.0 };
    pub const WHITE: Self = Self { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    pub const TRANSPARENT: Self = Self { r: 0.0, g: 0.0, b: 0.0, a: 0.0 };
}

/// Text fill (per-run color/paint).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum TextFill {
    /// Solid color fill.
    Solid(RGBA),
}

impl Default for TextFill {
    fn default() -> Self {
        Self::Solid(RGBA::BLACK)
    }
}

/// Horizontal text alignment (paragraph-level).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TextAlign {
    Left,
    Right,
    Center,
    Justify,
}

impl Default for TextAlign {
    fn default() -> Self {
        Self::Left
    }
}

/// Vertical text alignment (paragraph-level).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TextAlignVertical {
    Top,
    Center,
    Bottom,
}

impl Default for TextAlignVertical {
    fn default() -> Self {
        Self::Top
    }
}

/// Paragraph direction.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ParagraphDirection {
    Ltr,
    Rtl,
    Auto,
}

impl Default for ParagraphDirection {
    fn default() -> Self {
        Self::Ltr
    }
}

/// Hyperlink target on a text run.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Hyperlink {
    pub url: String,
    pub open_in_new_tab: bool,
}

// ---------------------------------------------------------------------------
// TextStyle — the per-run attribute set
// ---------------------------------------------------------------------------

/// The complete set of per-run text attributes.
///
/// Field layout is aligned with `TextStyleRec` in `crates/grida-canvas/src/cg/types.rs`
/// and `TextStyleRec` in `format/grida.fbs`, extended with a `fill` field.
///
/// Two `TextStyle`s are equal iff all fields are structurally equal. This
/// determines whether adjacent runs can be merged (maximality invariant).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TextStyle {
    // --- Font identification ---
    /// Primary font family name (e.g. `"Inter"`, `"Roboto"`).
    pub font_family: String,
    /// Font size in layout-local points. Default: 14.0.
    pub font_size: f32,
    /// Font weight, CSS-compatible 1..1000. Default: 400.
    pub font_weight: u32,
    /// Font width (CSS `font-stretch` percentage). Default: 100.0 (normal).
    pub font_width: f32,
    /// Italic flag. Default: false.
    pub font_style_italic: bool,
    /// OpenType `kern` feature. Default: true.
    pub font_kerning: bool,
    /// Optical sizing mode. Default: Auto.
    pub font_optical_sizing: FontOpticalSizing,

    // --- OpenType extensions ---
    /// Active OpenType feature toggles.
    pub font_features: Vec<FontFeature>,
    /// Variable font axis values.
    pub font_variations: Vec<FontVariation>,

    // --- Spacing ---
    /// Letter spacing. Default: Normal.
    pub letter_spacing: TextDimension,
    /// Word spacing. Default: Normal.
    pub word_spacing: TextDimension,
    /// Line height. Default: Normal.
    pub line_height: TextDimension,

    // --- Decoration ---
    /// Decoration line type. Default: None.
    pub text_decoration_line: TextDecorationLine,
    /// Decoration stroke style. Default: Solid.
    pub text_decoration_style: TextDecorationStyle,
    /// Decoration color override. `None` = inherit from fill.
    pub text_decoration_color: Option<RGBA>,
    /// Skip-ink for decorations. Default: true.
    pub text_decoration_skip_ink: bool,
    /// Decoration thickness (percentage). Default: 1.0.
    pub text_decoration_thickness: f32,

    // --- Transform ---
    /// Text transform. Default: None.
    pub text_transform: TextTransform,

    // --- Fill ---
    /// Text color/fill. Default: solid black.
    pub fill: TextFill,

    // --- Link ---
    /// Hyperlink target. Default: None (no link).
    pub hyperlink: Option<Hyperlink>,
}

impl Default for TextStyle {
    fn default() -> Self {
        Self {
            font_family: String::from("sans-serif"),
            font_size: 14.0,
            font_weight: 400,
            font_width: 100.0,
            font_style_italic: false,
            font_kerning: true,
            font_optical_sizing: FontOpticalSizing::Auto,
            font_features: Vec::new(),
            font_variations: Vec::new(),
            letter_spacing: TextDimension::Normal,
            word_spacing: TextDimension::Normal,
            line_height: TextDimension::Normal,
            text_decoration_line: TextDecorationLine::None,
            text_decoration_style: TextDecorationStyle::Solid,
            text_decoration_color: None,
            text_decoration_skip_ink: true,
            text_decoration_thickness: 1.0,
            text_transform: TextTransform::None,
            fill: TextFill::default(),
            hyperlink: None,
        }
    }
}

// ---------------------------------------------------------------------------
// ParagraphStyle — uniform across the text block
// ---------------------------------------------------------------------------

/// Paragraph-level attributes (not per-run).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ParagraphStyle {
    pub text_align: TextAlign,
    pub text_align_vertical: TextAlignVertical,
    pub paragraph_direction: ParagraphDirection,
    /// Maximum number of visible lines. `None` = unlimited.
    pub max_lines: Option<u32>,
    /// Ellipsis string (e.g. `"..."`). `None` = no truncation indicator.
    pub ellipsis: Option<String>,
    /// First-line text indent in layout-local points.
    pub text_indent: f32,
    /// Extra spacing after each hard line break (`\n`), in layout-local points.
    pub paragraph_spacing: f32,
}

impl Default for ParagraphStyle {
    fn default() -> Self {
        Self {
            text_align: TextAlign::Left,
            text_align_vertical: TextAlignVertical::Top,
            paragraph_direction: ParagraphDirection::Ltr,
            max_lines: None,
            ellipsis: None,
            text_indent: 0.0,
            paragraph_spacing: 0.0,
        }
    }
}

// ---------------------------------------------------------------------------
// StyledRun
// ---------------------------------------------------------------------------

/// A contiguous range of text sharing a single style.
///
/// Offsets are UTF-8 byte offsets into the parent [`AttributedText::text`].
/// `start` is inclusive, `end` is exclusive.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StyledRun {
    /// Start byte offset (UTF-8, inclusive).
    pub start: u32,
    /// End byte offset (UTF-8, exclusive).
    pub end: u32,
    /// The resolved style for this run.
    pub style: TextStyle,
}

impl StyledRun {
    /// Byte length of this run.
    #[inline]
    pub fn len(&self) -> u32 {
        self.end - self.start
    }

    /// Whether this is a zero-length (degenerate) run. Only valid when the
    /// backing text is empty.
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.start == self.end
    }
}

// ---------------------------------------------------------------------------
// Invariant error
// ---------------------------------------------------------------------------

/// Describes a violated invariant (used by [`AttributedText::check_invariants`]).
#[derive(Debug, Clone)]
pub enum InvariantError {
    EmptyRuns,
    CoverageStart { expected: u32, actual: u32 },
    CoverageEnd { expected: u32, actual: u32 },
    Contiguity { index: usize, prev_end: u32, next_start: u32 },
    EmptyRun { index: usize, start: u32, end: u32 },
    NotMaximal { index: usize },
    BadBoundary { index: usize, field: &'static str, offset: u32 },
    Monotonicity { index: usize },
}

impl std::fmt::Display for InvariantError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmptyRuns => write!(f, "runs vec is empty"),
            Self::CoverageStart { expected, actual } => {
                write!(f, "first run starts at {actual}, expected {expected}")
            }
            Self::CoverageEnd { expected, actual } => {
                write!(f, "last run ends at {actual}, expected {expected}")
            }
            Self::Contiguity { index, prev_end, next_start } => {
                write!(f, "gap/overlap at index {index}: prev.end={prev_end}, next.start={next_start}")
            }
            Self::EmptyRun { index, start, end } => {
                write!(f, "empty run at index {index}: start={start}, end={end}")
            }
            Self::NotMaximal { index } => {
                write!(f, "adjacent runs {index} and {} have equal styles", index + 1)
            }
            Self::BadBoundary { index, field, offset } => {
                write!(f, "run {index} {field}={offset} is not a valid char boundary")
            }
            Self::Monotonicity { index } => {
                write!(f, "run {index} start >= run {} start", index + 1)
            }
        }
    }
}

impl std::error::Error for InvariantError {}

// ---------------------------------------------------------------------------
// AttributedText
// ---------------------------------------------------------------------------

/// A string with per-run styling and paragraph-level attributes.
///
/// This is the core data structure for semi-rich text editing. It replaces
/// the plain `String` + uniform `TextStyleRec` currently used by
/// `TextSpanNodeRec`.
///
/// # Examples
///
/// ```
/// use grida_text_edit::attributed_text::{AttributedText, TextStyle};
///
/// // Create with default style
/// let mut at = AttributedText::new("Hello, world!", TextStyle::default());
/// assert_eq!(at.runs().len(), 1);
///
/// // Make "world" bold (byte range 7..12)
/// at.apply_style(7, 12, |s| { s.font_weight = 700; });
/// assert_eq!(at.runs().len(), 3); // "Hello, " | "world" | "!"
/// ```
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AttributedText {
    /// The backing UTF-8 string. Newlines are normalized to `\n`.
    text: String,
    /// The base style. Runs that match this can use delta encoding in serialization.
    default_style: TextStyle,
    /// Paragraph-level attributes.
    paragraph_style: ParagraphStyle,
    /// Ordered, non-overlapping, gap-free, maximal runs.
    runs: Vec<StyledRun>,
    /// Monotonic counter incremented on every mutation (text or style).
    ///
    /// Used by [`SkiaLayoutEngine::ensure_layout_attributed`] to detect
    /// style-only changes that leave the text bytes unchanged but require
    /// a paragraph rebuild.
    #[serde(skip)]
    generation: u64,
}

impl AttributedText {
    // -----------------------------------------------------------------------
    // Construction
    // -----------------------------------------------------------------------

    /// Create an attributed text with a single run covering the entire string.
    pub fn new(text: impl Into<String>, style: TextStyle) -> Self {
        let text = crate::normalize_newlines(&text.into());
        let len = text.len() as u32;
        let runs = vec![StyledRun { start: 0, end: len, style: style.clone() }];
        let this = Self {
            text,
            default_style: style,
            paragraph_style: ParagraphStyle::default(),
            runs,
            generation: 0,
        };
        debug_assert!(this.check_invariants().is_ok(), "{:?}", this.check_invariants());
        this
    }

    /// Create an empty attributed text preserving the given caret style.
    pub fn empty(style: TextStyle) -> Self {
        let runs = vec![StyledRun { start: 0, end: 0, style: style.clone() }];
        Self {
            text: String::new(),
            default_style: style,
            paragraph_style: ParagraphStyle::default(),
            runs,
            generation: 0,
        }
    }

    /// Create from explicit components. Panics if invariants are violated.
    ///
    /// This is intended for deserialization / tests. Prefer [`new`](Self::new)
    /// for normal construction.
    pub fn from_parts(
        text: String,
        default_style: TextStyle,
        paragraph_style: ParagraphStyle,
        runs: Vec<StyledRun>,
    ) -> Self {
        let this = Self { text, default_style, paragraph_style, runs, generation: 0 };
        if let Err(e) = this.check_invariants() {
            panic!("AttributedText::from_parts: invariant violated: {e}");
        }
        this
    }

    /// Non-panicking variant of [`from_parts`](Self::from_parts).
    ///
    /// Returns `Err(InvariantError)` when the runs violate structural
    /// invariants (gaps, overlaps, out-of-bounds offsets, etc.).
    pub fn try_from_parts(
        text: String,
        default_style: TextStyle,
        paragraph_style: ParagraphStyle,
        runs: Vec<StyledRun>,
    ) -> Result<Self, InvariantError> {
        let this = Self { text, default_style, paragraph_style, runs, generation: 0 };
        this.check_invariants()?;
        Ok(this)
    }

    // -----------------------------------------------------------------------
    // Accessors
    // -----------------------------------------------------------------------

    /// The backing text string.
    #[inline]
    pub fn text(&self) -> &str {
        &self.text
    }

    /// Monotonic generation counter. Incremented on every mutation
    /// (text insert/delete **and** style changes). Layout engines use
    /// this to detect when a rebuild is needed even if the text bytes
    /// are unchanged.
    #[inline]
    pub fn generation(&self) -> u64 {
        self.generation
    }

    /// Byte length of the text.
    #[inline]
    pub fn len(&self) -> usize {
        self.text.len()
    }

    /// Whether the text is empty.
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.text.is_empty()
    }

    /// The default (base) style.
    #[inline]
    pub fn default_style(&self) -> &TextStyle {
        &self.default_style
    }

    /// Mutable access to the default style. After modification, call
    /// [`coalesce`](Self::coalesce) if needed.
    #[inline]
    pub fn default_style_mut(&mut self) -> &mut TextStyle {
        &mut self.default_style
    }

    /// The paragraph-level style.
    #[inline]
    pub fn paragraph_style(&self) -> &ParagraphStyle {
        &self.paragraph_style
    }

    /// Mutable access to paragraph style.
    #[inline]
    pub fn paragraph_style_mut(&mut self) -> &mut ParagraphStyle {
        &mut self.paragraph_style
    }

    /// The run list (read-only).
    #[inline]
    pub fn runs(&self) -> &[StyledRun] {
        &self.runs
    }

    /// Number of style runs.
    #[inline]
    pub fn run_count(&self) -> usize {
        self.runs.len()
    }

    // -----------------------------------------------------------------------
    // Querying
    // -----------------------------------------------------------------------

    /// Find the run index containing `offset` (binary search, O(log k)).
    ///
    /// For an offset at a run boundary, returns the run that **starts** at
    /// that offset (the "downstream" run). At the end of text, returns the
    /// last run.
    pub fn run_index_at(&self, offset: u32) -> usize {
        if self.runs.is_empty() {
            return 0;
        }
        // Special case: past the end -> last run
        if offset >= self.text.len() as u32 {
            return self.runs.len() - 1;
        }
        // Binary search: find the first run whose end > offset
        match self.runs.binary_search_by(|r| {
            if r.end <= offset {
                std::cmp::Ordering::Less
            } else if r.start > offset {
                std::cmp::Ordering::Greater
            } else {
                std::cmp::Ordering::Equal
            }
        }) {
            Ok(i) => i,
            Err(i) => i.min(self.runs.len() - 1),
        }
    }

    /// Style at a given byte offset. O(log k).
    pub fn style_at(&self, offset: u32) -> &TextStyle {
        &self.runs[self.run_index_at(offset)].style
    }

    /// Returns the **caret style** for a cursor at `offset`.
    ///
    /// - At position 0: style of the first run.
    /// - At end of text: style of the last run.
    /// - At a run boundary: style of the run that **ends** at `offset`
    ///   (the "upstream" run), matching design-tool convention.
    /// - Inside a run: style of that run.
    pub fn caret_style_at(&self, offset: u32) -> &TextStyle {
        if offset == 0 || self.runs.is_empty() {
            return &self.runs[0].style;
        }
        if offset >= self.text.len() as u32 {
            return &self.runs[self.runs.len() - 1].style;
        }
        // Check if offset is exactly at a run boundary (some run's start).
        // If so, return the previous run's style (upstream).
        let idx = self.run_index_at(offset);
        if self.runs[idx].start == offset && idx > 0 {
            &self.runs[idx - 1].style
        } else {
            &self.runs[idx].style
        }
    }

    /// Returns a slice of runs overlapping the byte range `[lo, hi)`.
    pub fn runs_in_range(&self, lo: u32, hi: u32) -> &[StyledRun] {
        if lo >= hi || self.runs.is_empty() {
            return &[];
        }
        let first = self.run_index_at(lo);
        let last = self.run_index_at(hi.saturating_sub(1).max(lo));
        &self.runs[first..=last]
    }

    // -----------------------------------------------------------------------
    // Mutations
    // -----------------------------------------------------------------------

    /// Insert `s` at byte offset `pos`. The inserted text inherits the style
    /// of the run containing `pos` (or the caret style for empty text).
    ///
    /// # Panics
    ///
    /// Panics in debug mode if `pos` is not a valid char boundary.
    pub fn insert(&mut self, pos: usize, s: &str) {
        if s.is_empty() {
            return;
        }
        self.generation += 1;
        debug_assert!(
            pos <= self.text.len() && (pos == self.text.len() || self.text.is_char_boundary(pos)),
            "insert pos {pos} is not a valid boundary in text of len {}",
            self.text.len()
        );

        let normalized = crate::normalize_newlines(s);
        let n = normalized.len() as u32;
        let pos32 = pos as u32;

        // Find the run containing `pos`.
        let idx = self.run_index_at(pos32);

        // Insert into the text buffer.
        self.text.insert_str(pos, &normalized);

        // Adjust run offsets.
        // The run containing `pos` gets its `end` extended by `n`.
        // All subsequent runs shift by `+n`.
        for (i, run) in self.runs.iter_mut().enumerate() {
            if i == idx {
                // This run contains the insertion point.
                // If pos is at the very start of this run AND it's not the first
                // run, the previous run's end also equals pos, so we extend
                // this run (not the previous one).
                run.end += n;
            } else if i > idx {
                run.start += n;
                run.end += n;
            }
        }

        debug_assert!(self.check_invariants().is_ok(), "{:?}", self.check_invariants());
    }

    /// Insert `s` at byte offset `pos` with a specific style.
    ///
    /// If the given style differs from the surrounding run, new runs are
    /// created. Adjacent equal-style runs are merged.
    pub fn insert_with_style(&mut self, pos: usize, s: &str, style: TextStyle) {
        if s.is_empty() {
            return;
        }
        self.generation += 1;
        debug_assert!(
            pos <= self.text.len() && (pos == self.text.len() || self.text.is_char_boundary(pos)),
            "insert_with_style pos {pos} is not a valid boundary in text of len {}",
            self.text.len()
        );

        let normalized = crate::normalize_newlines(s);
        let n = normalized.len() as u32;
        let pos32 = pos as u32;

        // Split at insertion point if needed (before any mutation).
        self.split_run_at(pos32);

        // Find the insertion index: the first run whose start >= pos32.
        // After split_run_at, pos32 is guaranteed to be at a run boundary
        // (either an existing boundary or a freshly created one), OR at the
        // end of text (past all runs).
        let idx = self.runs.iter()
            .position(|r| r.start >= pos32)
            .unwrap_or(self.runs.len());

        // Insert text into the buffer.
        self.text.insert_str(pos, &normalized);

        // Shift all runs from `idx` onward by `+n` (these are the runs
        // that come AFTER the insertion point).
        for run in &mut self.runs[idx..] {
            run.start += n;
            run.end += n;
        }

        // Insert the new run at the insertion point.
        self.runs.insert(idx, StyledRun {
            start: pos32,
            end: pos32 + n,
            style,
        });

        self.coalesce();
        debug_assert!(self.check_invariants().is_ok(), "{:?}", self.check_invariants());
    }

    /// Delete the byte range `[lo, hi)` from the text and update runs.
    ///
    /// # Panics
    ///
    /// Panics in debug mode if `lo` or `hi` are not valid char boundaries.
    pub fn delete(&mut self, lo: usize, hi: usize) {
        if lo >= hi || lo >= self.text.len() {
            return;
        }
        self.generation += 1;
        let hi = hi.min(self.text.len());
        debug_assert!(
            self.text.is_char_boundary(lo) && self.text.is_char_boundary(hi),
            "delete range [{lo}, {hi}) contains invalid char boundaries"
        );

        let lo32 = lo as u32;
        let hi32 = hi as u32;
        let span = hi32 - lo32;

        // Remove text.
        self.text.drain(lo..hi);
        let new_len = self.text.len() as u32;

        // Adjust runs.
        let mut i = 0;
        while i < self.runs.len() {
            let run = &mut self.runs[i];

            if run.end <= lo32 {
                // Run is entirely before the deleted range — no change.
                i += 1;
            } else if run.start >= hi32 {
                // Run is entirely after the deleted range — shift back.
                run.start -= span;
                run.end -= span;
                i += 1;
            } else if run.start >= lo32 && run.end <= hi32 {
                // Run is entirely within the deleted range — remove it.
                self.runs.remove(i);
                // Don't increment i.
            } else if run.start < lo32 && run.end > hi32 {
                // Deleted range is entirely within this run — shrink it.
                run.end -= span;
                i += 1;
            } else if run.start < lo32 {
                // Run overlaps the start of the deleted range.
                run.end = lo32;
                i += 1;
            } else {
                // Run overlaps the end of the deleted range.
                run.start = lo32;
                run.end -= span;
                i += 1;
            }
        }

        // If all runs were removed (deleted entire text), add degenerate run.
        if self.runs.is_empty() {
            self.runs.push(StyledRun {
                start: 0,
                end: 0,
                style: self.default_style.clone(),
            });
        }

        // Clamp to ensure no run exceeds text length.
        for run in &mut self.runs {
            run.start = run.start.min(new_len);
            run.end = run.end.min(new_len);
        }

        self.coalesce();
        debug_assert!(self.check_invariants().is_ok(), "{:?}", self.check_invariants());
    }

    /// Apply a style mutation to the byte range `[lo, hi)`.
    ///
    /// Splits runs at boundaries, applies `f` to each affected run, then
    /// merges adjacent equal-style runs.
    pub fn apply_style(&mut self, lo: usize, hi: usize, f: impl Fn(&mut TextStyle)) {
        if lo >= hi || self.text.is_empty() {
            return;
        }
        self.generation += 1;
        let lo = lo.min(self.text.len());
        let hi = hi.min(self.text.len());
        if lo >= hi {
            return;
        }
        debug_assert!(
            self.text.is_char_boundary(lo) && self.text.is_char_boundary(hi),
            "apply_style range [{lo}, {hi}) contains invalid char boundaries"
        );
        let lo32 = lo as u32;
        let hi32 = hi as u32;

        // Split at boundaries.
        self.split_run_at(lo32);
        self.split_run_at(hi32);

        // Apply mutation to all runs within [lo32, hi32).
        for run in &mut self.runs {
            if run.start >= lo32 && run.end <= hi32 && run.start < run.end {
                f(&mut run.style);
            }
        }

        self.coalesce();
        debug_assert!(self.check_invariants().is_ok(), "{:?}", self.check_invariants());
    }

    /// Set the style for the byte range `[lo, hi)`, replacing any existing
    /// styles in that range.
    pub fn set_style(&mut self, lo: usize, hi: usize, style: TextStyle) {
        self.apply_style(lo, hi, |s| *s = style.clone());
    }

    /// Replace the text in `[lo, hi)` with `s`, inheriting the style of the
    /// run at `lo`. This is the primitive for `replace_range` edits.
    pub fn replace(&mut self, lo: usize, hi: usize, s: &str) {
        let style_at_lo = self.style_at(lo as u32).clone();
        self.delete(lo, hi);
        if s.is_empty() {
            return;
        }
        // After deletion, the position `lo` may be clamped.
        let pos = lo.min(self.text.len());
        self.insert(pos, s);
        // The inserted text inherited the run style at `pos`, which should
        // match `style_at_lo` after the deletion + coalesce. If the delete
        // removed the run that held that style, we need to force it.
        // Since insert inherits the current run at `pos`, and coalesce ran,
        // this is generally correct. We do a defensive set_style.
        let end = pos + crate::normalize_newlines(s).len();
        if *self.style_at(pos as u32) != style_at_lo {
            self.set_style(pos, end, style_at_lo);
        }
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /// Split the run at `offset` into two runs with the same style.
    /// No-op if `offset` is already at a run boundary or out of range.
    fn split_run_at(&mut self, offset: u32) {
        if offset == 0 || offset >= self.text.len() as u32 {
            return;
        }
        // Find the run containing offset.
        for i in 0..self.runs.len() {
            let run = &self.runs[i];
            if run.start < offset && offset < run.end {
                let second = StyledRun {
                    start: offset,
                    end: run.end,
                    style: run.style.clone(),
                };
                self.runs[i].end = offset;
                self.runs.insert(i + 1, second);
                return;
            }
        }
    }

    /// Merge adjacent runs with equal styles, and remove zero-length runs
    /// (except the degenerate empty-text run).
    pub fn coalesce(&mut self) {
        if self.runs.is_empty() {
            return;
        }

        // Remove zero-length runs (unless it's the only run and text is empty).
        if self.text.is_empty() {
            // Keep exactly one degenerate run.
            self.runs.truncate(1);
            self.runs[0].start = 0;
            self.runs[0].end = 0;
            return;
        }

        // Remove zero-length runs.
        self.runs.retain(|r| r.start < r.end);

        // If that removed everything (shouldn't happen), restore.
        if self.runs.is_empty() {
            self.runs.push(StyledRun {
                start: 0,
                end: self.text.len() as u32,
                style: self.default_style.clone(),
            });
            return;
        }

        // Merge adjacent equal-style runs.
        let mut i = 0;
        while i + 1 < self.runs.len() {
            if self.runs[i].style == self.runs[i + 1].style {
                self.runs[i].end = self.runs[i + 1].end;
                self.runs.remove(i + 1);
            } else {
                i += 1;
            }
        }
    }

    // -----------------------------------------------------------------------
    // Invariant checking
    // -----------------------------------------------------------------------

    /// Validate all six invariants. Returns `Ok(())` if valid, or the first
    /// violation found.
    pub fn check_invariants(&self) -> Result<(), InvariantError> {
        if self.runs.is_empty() {
            return Err(InvariantError::EmptyRuns);
        }

        let text_len = self.text.len() as u32;

        // 1. Coverage: start
        if self.runs[0].start != 0 {
            return Err(InvariantError::CoverageStart {
                expected: 0,
                actual: self.runs[0].start,
            });
        }

        // 1. Coverage: end
        if self.runs.last().unwrap().end != text_len {
            return Err(InvariantError::CoverageEnd {
                expected: text_len,
                actual: self.runs.last().unwrap().end,
            });
        }

        for i in 0..self.runs.len() {
            let run = &self.runs[i];

            // 3. Non-empty (except the empty-text degenerate case)
            if run.start > run.end {
                return Err(InvariantError::EmptyRun {
                    index: i,
                    start: run.start,
                    end: run.end,
                });
            }
            if run.start == run.end && !self.text.is_empty() {
                return Err(InvariantError::EmptyRun {
                    index: i,
                    start: run.start,
                    end: run.end,
                });
            }

            // 5. Boundary alignment
            let s = run.start as usize;
            let e = run.end as usize;
            if s <= self.text.len() && !self.text.is_char_boundary(s) {
                return Err(InvariantError::BadBoundary {
                    index: i,
                    field: "start",
                    offset: run.start,
                });
            }
            if e <= self.text.len() && !self.text.is_char_boundary(e) {
                return Err(InvariantError::BadBoundary {
                    index: i,
                    field: "end",
                    offset: run.end,
                });
            }

            // 2. Contiguity + 6. Monotonicity + 4. Maximality (with next run)
            if i + 1 < self.runs.len() {
                let next = &self.runs[i + 1];

                // 2. Contiguity
                if run.end != next.start {
                    return Err(InvariantError::Contiguity {
                        index: i + 1,
                        prev_end: run.end,
                        next_start: next.start,
                    });
                }

                // 6. Monotonicity
                if run.start >= next.start {
                    return Err(InvariantError::Monotonicity { index: i });
                }

                // 4. Maximality
                if run.style == next.style {
                    return Err(InvariantError::NotMaximal { index: i });
                }
            }
        }

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Conversion: plain text <-> attributed text
// ---------------------------------------------------------------------------

impl From<&str> for AttributedText {
    /// Create an attributed text from a plain string with default style.
    fn from(s: &str) -> Self {
        Self::new(s, TextStyle::default())
    }
}

impl From<String> for AttributedText {
    fn from(s: String) -> Self {
        Self::new(s, TextStyle::default())
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn default_style() -> TextStyle {
        TextStyle::default()
    }

    fn bold_style() -> TextStyle {
        TextStyle { font_weight: 700, ..default_style() }
    }

    fn italic_style() -> TextStyle {
        TextStyle { font_style_italic: true, ..default_style() }
    }

    fn bold_italic_style() -> TextStyle {
        TextStyle { font_weight: 700, font_style_italic: true, ..default_style() }
    }

    fn red_style() -> TextStyle {
        TextStyle {
            fill: TextFill::Solid(RGBA { r: 1.0, g: 0.0, b: 0.0, a: 1.0 }),
            ..default_style()
        }
    }

    // -----------------------------------------------------------------------
    // Construction
    // -----------------------------------------------------------------------

    #[test]
    fn new_single_run() {
        let at = AttributedText::new("Hello", default_style());
        assert_eq!(at.runs().len(), 1);
        assert_eq!(at.runs()[0].start, 0);
        assert_eq!(at.runs()[0].end, 5);
        assert_eq!(at.text(), "Hello");
    }

    #[test]
    fn empty_text_degenerate_run() {
        let at = AttributedText::empty(bold_style());
        assert_eq!(at.runs().len(), 1);
        assert_eq!(at.runs()[0].start, 0);
        assert_eq!(at.runs()[0].end, 0);
        assert_eq!(at.runs()[0].style.font_weight, 700);
    }

    #[test]
    fn normalizes_crlf() {
        let at = AttributedText::new("a\r\nb\rc", default_style());
        assert_eq!(at.text(), "a\nb\nc");
    }

    // -----------------------------------------------------------------------
    // Querying
    // -----------------------------------------------------------------------

    #[test]
    fn style_at_single_run() {
        let at = AttributedText::new("Hello", bold_style());
        assert_eq!(at.style_at(0).font_weight, 700);
        assert_eq!(at.style_at(4).font_weight, 700);
    }

    #[test]
    fn style_at_multiple_runs() {
        let mut at = AttributedText::new("Hello World", default_style());
        at.apply_style(0, 5, |s| { s.font_weight = 700; });
        // "Hello" is bold, " World" is normal
        assert_eq!(at.style_at(0).font_weight, 700);
        assert_eq!(at.style_at(4).font_weight, 700);
        assert_eq!(at.style_at(5).font_weight, 400);
        assert_eq!(at.style_at(10).font_weight, 400);
    }

    #[test]
    fn caret_style_at_boundary() {
        let mut at = AttributedText::new("HelloWorld", default_style());
        at.apply_style(0, 5, |s| { s.font_weight = 700; });
        // At position 5 (boundary between bold "Hello" and normal "World"),
        // caret style should be bold (upstream run).
        assert_eq!(at.caret_style_at(5).font_weight, 700);
        // At position 0, caret style is the first run.
        assert_eq!(at.caret_style_at(0).font_weight, 700);
        // At end of text, caret style is the last run.
        assert_eq!(at.caret_style_at(10).font_weight, 400);
    }

    #[test]
    fn runs_in_range_basic() {
        let mut at = AttributedText::new("AABBCC", default_style());
        at.apply_style(0, 2, |s| { s.font_weight = 700; });
        at.apply_style(4, 6, |s| { s.font_style_italic = true; });
        // 3 runs: [0,2) bold, [2,4) normal, [4,6) italic
        assert_eq!(at.runs().len(), 3);

        let r = at.runs_in_range(1, 5);
        assert_eq!(r.len(), 3); // all three overlap [1, 5)

        let r = at.runs_in_range(0, 2);
        assert_eq!(r.len(), 1); // only the bold run

        let r = at.runs_in_range(2, 4);
        assert_eq!(r.len(), 1); // only the normal run
    }

    // -----------------------------------------------------------------------
    // Insert
    // -----------------------------------------------------------------------

    #[test]
    fn insert_at_start() {
        let mut at = AttributedText::new("World", bold_style());
        at.insert(0, "Hello ");
        assert_eq!(at.text(), "Hello World");
        assert_eq!(at.runs().len(), 1);
        assert_eq!(at.runs()[0].end, 11);
    }

    #[test]
    fn insert_at_end() {
        let mut at = AttributedText::new("Hello", default_style());
        at.insert(5, " World");
        assert_eq!(at.text(), "Hello World");
        assert_eq!(at.runs().len(), 1);
    }

    #[test]
    fn insert_in_middle() {
        let mut at = AttributedText::new("HellWorld", default_style());
        at.insert(4, "o ");
        assert_eq!(at.text(), "Hello World");
    }

    #[test]
    fn insert_preserves_subsequent_runs() {
        let mut at = AttributedText::new("AB", default_style());
        at.apply_style(1, 2, |s| { s.font_weight = 700; });
        // Runs: [0,1) normal "A", [1,2) bold "B"
        assert_eq!(at.runs().len(), 2);

        at.insert(0, "X");
        // Now "XAB": [0,2) normal "XA", [2,3) bold "B"
        assert_eq!(at.text(), "XAB");
        assert_eq!(at.runs().len(), 2);
        assert_eq!(at.runs()[0].start, 0);
        assert_eq!(at.runs()[0].end, 2);
        assert_eq!(at.runs()[1].start, 2);
        assert_eq!(at.runs()[1].end, 3);
        assert_eq!(at.runs()[1].style.font_weight, 700);
    }

    #[test]
    fn insert_into_empty_text() {
        let mut at = AttributedText::empty(bold_style());
        at.insert(0, "Hello");
        assert_eq!(at.text(), "Hello");
        assert_eq!(at.runs().len(), 1);
        assert_eq!(at.runs()[0].style.font_weight, 700);
    }

    #[test]
    fn insert_with_style_different_from_context() {
        let mut at = AttributedText::new("AB", default_style());
        at.insert_with_style(1, "X", bold_style());
        // "AXB": [0,1) normal, [1,2) bold, [2,3) normal
        assert_eq!(at.text(), "AXB");
        assert_eq!(at.runs().len(), 3);
        assert_eq!(at.runs()[1].style.font_weight, 700);
    }

    #[test]
    fn insert_with_style_matching_context_merges() {
        let mut at = AttributedText::new("AB", default_style());
        at.insert_with_style(1, "X", default_style());
        // "AXB": single run since style matches
        assert_eq!(at.text(), "AXB");
        assert_eq!(at.runs().len(), 1);
    }

    // -----------------------------------------------------------------------
    // Delete
    // -----------------------------------------------------------------------

    #[test]
    fn delete_within_single_run() {
        let mut at = AttributedText::new("Hello World", default_style());
        at.delete(5, 11);
        assert_eq!(at.text(), "Hello");
        assert_eq!(at.runs().len(), 1);
    }

    #[test]
    fn delete_spanning_runs() {
        let mut at = AttributedText::new("AABBCC", default_style());
        at.apply_style(0, 2, |s| { s.font_weight = 700; });
        at.apply_style(4, 6, |s| { s.font_style_italic = true; });
        // Runs: [0,2) bold, [2,4) normal, [4,6) italic
        assert_eq!(at.runs().len(), 3);

        at.delete(1, 5);
        // "AC": [0,1) bold, [1,2) italic
        assert_eq!(at.text(), "AC");
        assert_eq!(at.runs().len(), 2);
        assert_eq!(at.runs()[0].style.font_weight, 700);
        assert!(at.runs()[1].style.font_style_italic);
    }

    #[test]
    fn delete_entire_text() {
        let mut at = AttributedText::new("Hello", bold_style());
        at.delete(0, 5);
        assert!(at.is_empty());
        assert_eq!(at.runs().len(), 1);
        assert_eq!(at.runs()[0].start, 0);
        assert_eq!(at.runs()[0].end, 0);
    }

    #[test]
    fn delete_merges_adjacent_equal_style_runs() {
        let mut at = AttributedText::new("ABCDE", default_style());
        at.apply_style(2, 3, |s| { s.font_weight = 700; });
        // Runs: [0,2) normal, [2,3) bold, [3,5) normal
        assert_eq!(at.runs().len(), 3);

        at.delete(2, 3);
        // "ABDE": the two normal runs merge.
        assert_eq!(at.text(), "ABDE");
        assert_eq!(at.runs().len(), 1);
    }

    #[test]
    fn delete_entire_run_in_middle() {
        let mut at = AttributedText::new("AABBCC", default_style());
        at.apply_style(0, 2, |s| { s.font_weight = 700; });
        at.apply_style(4, 6, |s| { s.font_style_italic = true; });
        // Delete the middle "normal" run entirely
        at.delete(2, 4);
        // "AACC": [0,2) bold, [2,4) italic
        assert_eq!(at.text(), "AACC");
        assert_eq!(at.runs().len(), 2);
    }

    // -----------------------------------------------------------------------
    // Apply style
    // -----------------------------------------------------------------------

    #[test]
    fn apply_style_entire_text() {
        let mut at = AttributedText::new("Hello", default_style());
        at.apply_style(0, 5, |s| { s.font_weight = 700; });
        assert_eq!(at.runs().len(), 1);
        assert_eq!(at.runs()[0].style.font_weight, 700);
    }

    #[test]
    fn apply_style_middle_range() {
        let mut at = AttributedText::new("Hello World", default_style());
        at.apply_style(6, 11, |s| { s.font_weight = 700; });
        // "Hello " normal, "World" bold
        assert_eq!(at.runs().len(), 2);
        assert_eq!(at.runs()[0].end, 6);
        assert_eq!(at.runs()[1].start, 6);
        assert_eq!(at.runs()[1].style.font_weight, 700);
    }

    #[test]
    fn apply_style_creates_three_runs() {
        let mut at = AttributedText::new("Hello World!", default_style());
        at.apply_style(6, 11, |s| { s.font_weight = 700; });
        // "Hello " normal, "World" bold, "!" normal
        assert_eq!(at.runs().len(), 3);
    }

    #[test]
    fn apply_style_merges_when_same() {
        let mut at = AttributedText::new("Hello World!", default_style());
        at.apply_style(6, 11, |s| { s.font_weight = 700; });
        assert_eq!(at.runs().len(), 3);

        // Now make the whole thing bold — should merge back to 1 run.
        at.apply_style(0, 12, |s| { s.font_weight = 700; });
        assert_eq!(at.runs().len(), 1);
        assert_eq!(at.runs()[0].style.font_weight, 700);
    }

    #[test]
    fn apply_style_overlapping_ranges() {
        let mut at = AttributedText::new("ABCDEFGH", default_style());
        at.apply_style(0, 4, |s| { s.font_weight = 700; });
        at.apply_style(2, 6, |s| { s.font_style_italic = true; });
        // Expected: [0,2) bold, [2,4) bold+italic, [4,6) italic, [6,8) normal
        assert_eq!(at.runs().len(), 4);
        assert_eq!(at.runs()[0].style.font_weight, 700);
        assert!(!at.runs()[0].style.font_style_italic);
        assert_eq!(at.runs()[1].style.font_weight, 700);
        assert!(at.runs()[1].style.font_style_italic);
        assert_eq!(at.runs()[2].style.font_weight, 400);
        assert!(at.runs()[2].style.font_style_italic);
        assert_eq!(at.runs()[3].style.font_weight, 400);
        assert!(!at.runs()[3].style.font_style_italic);
    }

    #[test]
    fn apply_style_exact_run_boundaries() {
        let mut at = AttributedText::new("AB", default_style());
        at.apply_style(0, 1, |s| { s.font_weight = 700; });
        assert_eq!(at.runs().len(), 2);

        // Apply to the exact same range — no extra splits.
        at.apply_style(0, 1, |s| { s.font_style_italic = true; });
        assert_eq!(at.runs().len(), 2);
        assert_eq!(at.runs()[0].style.font_weight, 700);
        assert!(at.runs()[0].style.font_style_italic);
    }

    #[test]
    fn apply_style_zero_width_range_noop() {
        let mut at = AttributedText::new("Hello", default_style());
        at.apply_style(2, 2, |s| { s.font_weight = 700; });
        assert_eq!(at.runs().len(), 1);
        assert_eq!(at.runs()[0].style.font_weight, 400);
    }

    // -----------------------------------------------------------------------
    // Set style
    // -----------------------------------------------------------------------

    #[test]
    fn set_style_replaces() {
        let mut at = AttributedText::new("Hello", default_style());
        at.set_style(0, 5, bold_style());
        assert_eq!(at.runs().len(), 1);
        assert_eq!(at.runs()[0].style.font_weight, 700);
    }

    // -----------------------------------------------------------------------
    // Replace
    // -----------------------------------------------------------------------

    #[test]
    fn replace_preserves_style() {
        let mut at = AttributedText::new("AAABBB", default_style());
        at.apply_style(0, 3, |s| { s.font_weight = 700; });
        // Replace "AAA" with "XX"
        at.replace(0, 3, "XX");
        assert_eq!(at.text(), "XXBBB");
        assert_eq!(at.runs()[0].style.font_weight, 700);
        assert_eq!(at.runs()[0].end, 2);
    }

    #[test]
    fn replace_with_empty_string() {
        let mut at = AttributedText::new("Hello World", default_style());
        at.replace(5, 11, "");
        assert_eq!(at.text(), "Hello");
    }

    // -----------------------------------------------------------------------
    // Multibyte / Unicode
    // -----------------------------------------------------------------------

    #[test]
    fn insert_multibyte() {
        let mut at = AttributedText::new("AB", default_style());
        at.insert(1, "\u{1F600}"); // Grinning face emoji (4 bytes)
        assert_eq!(at.text(), "A\u{1F600}B");
        assert_eq!(at.runs().len(), 1);
        assert_eq!(at.runs()[0].end, 6); // 1 + 4 + 1
    }

    #[test]
    fn apply_style_multibyte_boundaries() {
        // "A\u{1F600}B" = bytes [0..1) [1..5) [5..6)
        let mut at = AttributedText::new("A\u{1F600}B", default_style());
        at.apply_style(1, 5, |s| { s.font_weight = 700; });
        assert_eq!(at.runs().len(), 3);
        assert_eq!(at.runs()[1].start, 1);
        assert_eq!(at.runs()[1].end, 5);
        assert_eq!(at.runs()[1].style.font_weight, 700);
    }

    #[test]
    fn delete_multibyte() {
        let mut at = AttributedText::new("A\u{1F600}B", default_style());
        at.delete(1, 5); // delete the emoji
        assert_eq!(at.text(), "AB");
        assert_eq!(at.runs().len(), 1);
    }

    // -----------------------------------------------------------------------
    // Invariant checking
    // -----------------------------------------------------------------------

    #[test]
    fn check_invariants_valid() {
        let at = AttributedText::new("Hello", default_style());
        assert!(at.check_invariants().is_ok());
    }

    #[test]
    fn check_invariants_empty_text() {
        let at = AttributedText::empty(default_style());
        assert!(at.check_invariants().is_ok());
    }

    #[test]
    fn from_parts_rejects_bad_coverage() {
        let result = std::panic::catch_unwind(|| {
            AttributedText::from_parts(
                "Hello".into(),
                default_style(),
                ParagraphStyle::default(),
                vec![StyledRun { start: 1, end: 5, style: default_style() }],
            );
        });
        assert!(result.is_err());
    }

    #[test]
    fn from_parts_rejects_gap() {
        let result = std::panic::catch_unwind(|| {
            AttributedText::from_parts(
                "Hello".into(),
                default_style(),
                ParagraphStyle::default(),
                vec![
                    StyledRun { start: 0, end: 2, style: default_style() },
                    StyledRun { start: 3, end: 5, style: bold_style() },
                ],
            );
        });
        assert!(result.is_err());
    }

    #[test]
    fn from_parts_rejects_not_maximal() {
        let result = std::panic::catch_unwind(|| {
            AttributedText::from_parts(
                "Hello".into(),
                default_style(),
                ParagraphStyle::default(),
                vec![
                    StyledRun { start: 0, end: 3, style: default_style() },
                    StyledRun { start: 3, end: 5, style: default_style() },
                ],
            );
        });
        assert!(result.is_err());
    }

    // -----------------------------------------------------------------------
    // Coalesce
    // -----------------------------------------------------------------------

    #[test]
    fn coalesce_merges_adjacent_equal() {
        let mut at = AttributedText::new("Hello", default_style());
        // Manually insert a duplicate run to test coalesce.
        at.runs.clear();
        at.runs.push(StyledRun { start: 0, end: 3, style: default_style() });
        at.runs.push(StyledRun { start: 3, end: 5, style: default_style() });
        at.coalesce();
        assert_eq!(at.runs().len(), 1);
        assert_eq!(at.runs()[0].start, 0);
        assert_eq!(at.runs()[0].end, 5);
    }

    // -----------------------------------------------------------------------
    // Complex scenarios
    // -----------------------------------------------------------------------

    #[test]
    fn bold_then_italic_overlapping() {
        // The classic span-resolution test from the spec.
        let mut at = AttributedText::new("ABCDEFGHIJ", default_style());
        // Bold [0, 5)
        at.apply_style(0, 5, |s| { s.font_weight = 700; });
        // Italic [3, 8)
        at.apply_style(3, 8, |s| { s.font_style_italic = true; });

        assert_eq!(at.runs().len(), 4);
        // [0,3) bold only
        assert_eq!(at.runs()[0].start, 0);
        assert_eq!(at.runs()[0].end, 3);
        assert_eq!(at.runs()[0].style.font_weight, 700);
        assert!(!at.runs()[0].style.font_style_italic);
        // [3,5) bold + italic
        assert_eq!(at.runs()[1].start, 3);
        assert_eq!(at.runs()[1].end, 5);
        assert_eq!(at.runs()[1].style.font_weight, 700);
        assert!(at.runs()[1].style.font_style_italic);
        // [5,8) italic only
        assert_eq!(at.runs()[2].start, 5);
        assert_eq!(at.runs()[2].end, 8);
        assert_eq!(at.runs()[2].style.font_weight, 400);
        assert!(at.runs()[2].style.font_style_italic);
        // [8,10) normal
        assert_eq!(at.runs()[3].start, 8);
        assert_eq!(at.runs()[3].end, 10);
        assert_eq!(at.runs()[3].style.font_weight, 400);
        assert!(!at.runs()[3].style.font_style_italic);
    }

    #[test]
    fn insert_then_style_then_delete() {
        let mut at = AttributedText::new("AC", default_style());
        // Insert "B" between A and C.
        at.insert(1, "B");
        assert_eq!(at.text(), "ABC");
        // Make "B" bold.
        at.apply_style(1, 2, |s| { s.font_weight = 700; });
        assert_eq!(at.runs().len(), 3);
        // Delete "A".
        at.delete(0, 1);
        assert_eq!(at.text(), "BC");
        assert_eq!(at.runs().len(), 2);
        assert_eq!(at.runs()[0].style.font_weight, 700);
        assert_eq!(at.runs()[0].start, 0);
        assert_eq!(at.runs()[0].end, 1);
    }

    #[test]
    fn many_sequential_inserts() {
        let mut at = AttributedText::empty(default_style());
        for ch in "Hello, World!".chars() {
            let pos = at.len();
            at.insert(pos, &ch.to_string());
        }
        assert_eq!(at.text(), "Hello, World!");
        assert_eq!(at.runs().len(), 1);
    }

    #[test]
    fn style_entire_then_unstyle_middle() {
        let mut at = AttributedText::new("ABCDE", default_style());
        // Make everything bold.
        at.apply_style(0, 5, |s| { s.font_weight = 700; });
        assert_eq!(at.runs().len(), 1);
        // Unbold the middle.
        at.apply_style(2, 3, |s| { s.font_weight = 400; });
        assert_eq!(at.runs().len(), 3);
        assert_eq!(at.runs()[0].style.font_weight, 700);
        assert_eq!(at.runs()[1].style.font_weight, 400);
        assert_eq!(at.runs()[2].style.font_weight, 700);
    }

    #[test]
    fn from_plain_str() {
        let at: AttributedText = "Hello".into();
        assert_eq!(at.text(), "Hello");
        assert_eq!(at.runs().len(), 1);
    }

    // -----------------------------------------------------------------------
    // Multi-attribute styling (uses italic, bold_italic, red helpers)
    // -----------------------------------------------------------------------

    #[test]
    fn set_style_italic_then_bold() {
        let mut at = AttributedText::new("ABCD", default_style());
        at.set_style(0, 2, italic_style());
        at.set_style(2, 4, bold_style());
        assert_eq!(at.runs().len(), 2);
        assert!(at.runs()[0].style.font_style_italic);
        assert_eq!(at.runs()[0].style.font_weight, 400);
        assert!(!at.runs()[1].style.font_style_italic);
        assert_eq!(at.runs()[1].style.font_weight, 700);
    }

    #[test]
    fn apply_bold_italic_overlap() {
        let mut at = AttributedText::new("ABCDEF", italic_style());
        // Apply bold to the second half.
        at.apply_style(3, 6, |s| { s.font_weight = 700; });
        assert_eq!(at.runs().len(), 2);
        // First run: italic only.
        assert!(at.runs()[0].style.font_style_italic);
        assert_eq!(at.runs()[0].style.font_weight, 400);
        // Second run: bold+italic.
        assert!(at.runs()[1].style.font_style_italic);
        assert_eq!(at.runs()[1].style.font_weight, 700);
        // Verify it matches bold_italic_style fields.
        assert_eq!(at.runs()[1].style, bold_italic_style());
    }

    #[test]
    fn set_style_red_fill() {
        let mut at = AttributedText::new("Hello", default_style());
        at.set_style(0, 5, red_style());
        assert_eq!(at.runs().len(), 1);
        match &at.runs()[0].style.fill {
            TextFill::Solid(c) => {
                assert_eq!(c.r, 1.0);
                assert_eq!(c.g, 0.0);
                assert_eq!(c.b, 0.0);
                assert_eq!(c.a, 1.0);
            }
        }
    }

    #[test]
    fn delete_preserves_italic_run() {
        let mut at = AttributedText::new("ABCDEF", default_style());
        at.set_style(2, 4, italic_style());
        // Runs: [0,2) default, [2,4) italic, [4,6) default
        at.delete(0, 2);
        // "CDEF": [0,2) italic, [2,4) default
        assert_eq!(at.text(), "CDEF");
        assert_eq!(at.runs().len(), 2);
        assert!(at.runs()[0].style.font_style_italic);
    }

    // -----------------------------------------------------------------------
    // Regression: insert_with_style at end of text
    // -----------------------------------------------------------------------

    #[test]
    fn insert_with_style_at_end_of_text() {
        // Reproduces the panic: typing at the end of a multi-run text.
        let mut at = AttributedText::new("Hello, World!\n", default_style());
        at.apply_style(0, 5, |s| { s.font_weight = 700; });
        at.apply_style(7, 12, |s| { s.font_style_italic = true; });
        // Runs: [0,5) bold, [5,7) normal, [7,12) italic, [12,14) normal

        // Insert at the very end — this used to panic with a contiguity error.
        at.insert_with_style(14, "X", default_style());
        assert_eq!(at.text(), "Hello, World!\nX");
        assert!(at.check_invariants().is_ok());
    }

    #[test]
    fn insert_with_style_at_end_different_style() {
        let mut at = AttributedText::new("AB", default_style());
        at.apply_style(0, 1, |s| { s.font_weight = 700; });
        // Runs: [0,1) bold, [1,2) normal

        // Insert bold text at end.
        at.insert_with_style(2, "C", bold_style());
        assert_eq!(at.text(), "ABC");
        assert!(at.check_invariants().is_ok());
        // Should be: [0,1) bold, [1,2) normal, [2,3) bold
        assert_eq!(at.runs().len(), 3);
    }

    #[test]
    fn insert_with_style_at_end_matching_style_merges() {
        let mut at = AttributedText::new("AB", default_style());
        // Insert default-styled text at end — should merge with last run.
        at.insert_with_style(2, "C", default_style());
        assert_eq!(at.text(), "ABC");
        assert!(at.check_invariants().is_ok());
        assert_eq!(at.runs().len(), 1);
    }

    #[test]
    fn sequential_insert_with_style_at_end() {
        // Simulate typing character by character at the end.
        let mut at = AttributedText::new("Hello", default_style());
        at.apply_style(0, 5, |s| { s.font_weight = 700; });

        for ch in ", World!".chars() {
            let pos = at.len();
            at.insert_with_style(pos, &ch.to_string(), default_style());
            assert!(at.check_invariants().is_ok(), "failed after inserting '{ch}'");
        }
        assert_eq!(at.text(), "Hello, World!");
        // "Hello" bold + ", World!" normal
        assert_eq!(at.runs().len(), 2);
    }

    // -----------------------------------------------------------------------
    // Clone / snapshot round-trip (verifies history can snapshot and restore)
    // -----------------------------------------------------------------------

    #[test]
    fn clone_preserves_full_state() {
        let mut at = AttributedText::new("Hello World", default_style());
        at.apply_style(0, 5, |s| { s.font_weight = 700; });
        at.apply_style(6, 11, |s| { s.font_style_italic = true; });

        // Clone (simulates history snapshot).
        let snapshot = at.clone();

        // Mutate the original.
        at.apply_style(0, 11, |s| { s.font_weight = 400; s.font_style_italic = false; });
        assert_eq!(at.runs().len(), 1); // everything uniform now

        // Snapshot is untouched: [0,5) bold, [5,6) default, [6,11) italic.
        assert_eq!(snapshot.runs().len(), 3);
        assert_eq!(snapshot.runs()[0].style.font_weight, 700);
        assert!(snapshot.runs()[2].style.font_style_italic);
    }

    #[test]
    fn clone_restore_round_trip() {
        let mut at = AttributedText::new("ABCDE", default_style());
        at.apply_style(2, 4, |s| { s.font_weight = 700; });

        // Snapshot before style change.
        let before = at.clone();

        // Apply a style change.
        at.apply_style(0, 5, |s| { s.font_style_italic = true; });
        assert!(at.runs()[0].style.font_style_italic);

        // "Undo" by restoring the snapshot.
        at = before;
        assert_eq!(at.runs().len(), 3);
        assert!(!at.runs()[0].style.font_style_italic);
        assert_eq!(at.runs()[1].style.font_weight, 700);
        assert!(at.check_invariants().is_ok());
    }
}
