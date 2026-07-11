//! Backend-independent resolved text layout.
//!
//! A [`TextLayoutOracle`] is the only authority that may turn authored text
//! into line and glyph geometry. The resolver consumes only this contract and
//! stores the final artifact; renderers must not independently reflow text.

use crate::math::RectF;
use crate::measure::layout_text_payload;
use crate::model::TextPayloadRef;
use std::ops::Range;
use std::sync::Arc;

/// Opaque key into the font registry owned by a text-layout backend.
///
/// The key identifies the exact font instance used to shape a glyph run. A
/// renderer resolves it through the same backend/registry instead of trying
/// to reconstruct a font from authored style.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct TextFontKey(u32);

impl TextFontKey {
    pub const fn new(value: u32) -> Self {
        Self(value)
    }

    pub const fn get(self) -> u32 {
        self.0
    }
}

/// One positioned glyph emitted by a shaping backend.
#[derive(Debug, Clone, PartialEq)]
pub struct TextGlyph {
    /// Backend glyph identifier in the font selected by its run.
    pub id: u16,
    /// UTF-8 byte offset of the source cluster that produced this glyph.
    pub cluster: u32,
    /// Glyph origin in text-box-local coordinates.
    pub x: f32,
    pub y: f32,
    /// Optional glyph ink bounds in text-box-local coordinates.
    pub bounds: Option<RectF>,
}

/// A positioned run shaped with one exact font.
#[derive(Debug, Clone, PartialEq)]
pub struct TextGlyphRun {
    pub line_index: usize,
    /// Index into the authored attributed runs; `None` for uniform text.
    pub source_run: Option<usize>,
    /// Exact font-instance identity within the declared layout environment.
    /// Durability and cross-process meaning depend on that environment's
    /// identity policy; [`TextFontKey`] is only a replay-registry address and
    /// must not substitute for this field in semantic comparisons.
    pub font_identity: String,
    /// Opaque address in the replay registry accompanying this artifact.
    pub font: TextFontKey,
    pub glyphs: Vec<TextGlyph>,
}

/// Metrics and source mapping for one materialized visual line.
#[derive(Debug, Clone, PartialEq)]
pub struct TextLine {
    /// Visible source text on this line. A separator discarded by soft wrap
    /// and an authored newline are intentionally absent.
    pub text: String,
    /// UTF-8 byte range in the authored string corresponding to `text`.
    pub byte_range: Range<u32>,
    /// Complete source range consumed by the line, including an authored
    /// newline or separator whitespace discarded at a soft wrap.
    pub source_range: Range<u32>,
    /// Why this visual line ended.
    pub end: TextLineBreak,
    pub left: f32,
    pub width: f32,
    pub top: f32,
    pub height: f32,
    pub baseline: f32,
    pub ascent: f32,
    pub descent: f32,
}

/// The boundary that ended one materialized visual line.
///
/// This is deliberately richer than a `hard_break` bit: a final line is not
/// an authored newline, and consumers such as caret placement must be able to
/// distinguish it from both a soft wrap and truncation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextLineBreak {
    /// The oracle selected a wrap opportunity before more source content.
    Soft,
    /// An authored line terminator ended the line.
    Explicit,
    /// The line reaches the end of the complete, untruncated source.
    Terminal,
    /// Paragraph overflow policy replaced or omitted remaining source.
    Truncated,
}

/// The owned result of resolving one text payload under one width constraint.
///
/// The result is returned and stored behind [`Arc`], establishing the one
/// source that each geometry-sensitive consumer must progressively adopt.
/// The current proving engine consumes it for sizing, painting, bounds, and
/// damage; complete picking, selection, and export projections remain open.
#[derive(Debug, Clone, PartialEq)]
pub struct TextLayout {
    /// Stable oracle and oracle-version identifier.
    pub oracle: &'static str,
    /// Identity of the complete font/language environment used by this
    /// result. A proving backend may explicitly label a process-local value;
    /// such an artifact is inspectable but not portable or durable.
    pub environment: String,
    /// Exact optional maximum inline extent supplied to this oracle call.
    /// `None` means that the inline axis was unconstrained.
    pub width_constraint: Option<f32>,
    /// Final text box assigned by surrounding layout, in node-local
    /// coordinates. This is not a synonym for logical or ink bounds.
    pub assigned_box: RectF,
    /// Measured logical content extent reported by the oracle.
    pub width: f32,
    pub height: f32,
    pub lines: Vec<TextLine>,
    pub glyph_runs: Vec<TextGlyphRun>,
    /// Logical layout bounds when supplied by the oracle.
    pub logical_bounds: Option<RectF>,
    /// Union of glyph ink when supplied by the oracle.
    pub ink_bounds: Option<RectF>,
    /// Glyphs the oracle could not resolve under its explicit font
    /// environment. Strict hosts report any nonzero value as a resolution
    /// error instead of accepting silent tofu.
    pub unresolved_glyphs: usize,
}

impl TextLayout {
    /// Attach the box assigned by surrounding layout to an oracle result.
    ///
    /// Oracles initially report their measured content box because they are
    /// also called during size negotiation. The resolver calls this exactly
    /// once for the stored final artifact after all box rules have settled.
    pub fn with_assigned_box(self: Arc<Self>, assigned_box: RectF) -> Arc<TextLayout> {
        if self.assigned_box == assigned_box {
            return self;
        }
        Arc::new(TextLayout {
            assigned_box,
            ..self.as_ref().clone()
        })
    }
}

/// Pure text-layout boundary used by model resolution.
pub trait TextLayoutOracle {
    /// Resolve authored text under an optional maximum logical width.
    fn layout(&self, text: TextPayloadRef<'_>, max_width: Option<f32>) -> Arc<TextLayout>;
}

/// Honest adapter for the lab's deterministic `0.6 / 1.2` metric.
///
/// This is a layout oracle, not a shaper: it produces line metrics and source
/// ranges but deliberately emits no glyph runs.
#[derive(Debug, Clone, Copy, Default)]
pub struct StubTextLayoutOracle;

pub const STUB_TEXT_LAYOUT_ORACLE: StubTextLayoutOracle = StubTextLayoutOracle;
pub const STUB_TEXT_LAYOUT_ORACLE_ID: &str = "stub@lab-0";
pub const STUB_TEXT_LAYOUT_ENVIRONMENT_ID: &str = "fontless@lab-0";

impl TextLayoutOracle for StubTextLayoutOracle {
    fn layout(&self, text: TextPayloadRef<'_>, max_width: Option<f32>) -> Arc<TextLayout> {
        let measured_lines = layout_text_payload(text, max_width);
        let mut cursor = 0usize;
        let mut top = 0.0;
        let mut lines = Vec::with_capacity(measured_lines.len());

        for (index, line) in measured_lines.into_iter().enumerate() {
            if index > 0 {
                if text.text.as_bytes().get(cursor) == Some(&b'\n') {
                    cursor += 1;
                } else if !line.text.starts_with(' ') {
                    // The deterministic stub discards only ASCII separator
                    // spaces that would otherwise trail a soft-wrapped line.
                    while text.text.as_bytes().get(cursor) == Some(&b' ') {
                        cursor += 1;
                    }
                }
            }

            debug_assert!(
                text.text[cursor..].starts_with(&line.text),
                "stub line must remain a contiguous source slice"
            );
            let start = cursor;
            cursor += line.text.len();
            let end = cursor;
            let ascent = line.baseline_y - top;
            let descent = line.height - ascent;
            lines.push(TextLine {
                text: line.text,
                byte_range: u32::try_from(start).expect("text offset exceeds u32")
                    ..u32::try_from(end).expect("text offset exceeds u32"),
                source_range: u32::try_from(start).expect("text offset exceeds u32")
                    ..u32::try_from(end).expect("text offset exceeds u32"),
                end: TextLineBreak::Terminal,
                left: 0.0,
                width: line.width,
                top,
                height: line.height,
                baseline: line.baseline_y,
                ascent,
                descent,
            });
            top += line.height;
        }

        for index in 0..lines.len() {
            let consumed_end = lines
                .get(index + 1)
                .map(|next| next.byte_range.start)
                .unwrap_or_else(|| u32::try_from(text.text.len()).expect("text exceeds u32"));
            lines[index].source_range.end = consumed_end;
            lines[index].end = if text
                .text
                .as_bytes()
                .get(lines[index].byte_range.end as usize)
                == Some(&b'\n')
            {
                TextLineBreak::Explicit
            } else if index + 1 == lines.len() {
                TextLineBreak::Terminal
            } else {
                TextLineBreak::Soft
            };
        }

        let width = lines.iter().map(|line| line.width).fold(0.0, f32::max);
        let height = lines.iter().map(|line| line.height).sum();
        Arc::new(TextLayout {
            oracle: STUB_TEXT_LAYOUT_ORACLE_ID,
            environment: STUB_TEXT_LAYOUT_ENVIRONMENT_ID.to_owned(),
            width_constraint: max_width,
            assigned_box: RectF {
                x: 0.0,
                y: 0.0,
                w: width,
                h: height,
            },
            width,
            height,
            lines,
            glyph_runs: Vec::new(),
            logical_bounds: Some(RectF {
                x: 0.0,
                y: 0.0,
                w: width,
                h: height,
            }),
            ink_bounds: None,
            unresolved_glyphs: 0,
        })
    }
}
