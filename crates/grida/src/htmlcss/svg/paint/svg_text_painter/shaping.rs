//! Skia Shaper integration for SVG text.
//!
//! Wraps SkShaper (HarfBuzz-backed) into a single-call API that returns
//! per-glyph positions and the total advance of the shaped run, plus a
//! per-character advance computer that maps shaped glyphs back to
//! input characters via UTF-8 byte cluster offsets.
//!
//! Blink anchor: `core/layout/svg/svg_text_layout_algorithm.{h,cc}`
//! consumes the same shaping kernel HTML uses
//! (`platform/fonts/shaping/harfbuzz_shaper.cc`); the SVG-specific
//! per-character positioning is a separate post-pass that runs on the
//! shaped advances.
//!
//! Members are `pub(super)` so the orchestrator in
//! `svg_text_painter/mod.rs` can drive them; they are not part of the
//! public crate surface.
//!
//! See `docs/wg/research/chromium/svg/text.md` for the layout pipeline
//! shape this fits into.

use skia_safe::{Font, Point};

use super::GlyphAttr;

/// Per-glyph data captured from `Shaper::shape`. `position` is the
/// cumulative kerned origin in font units (0 at the start of the run);
/// `cluster` maps back to the byte offset in the input UTF-8 string.
#[derive(Debug, Clone, Copy, Default)]
pub(super) struct ShapedGlyph {
    #[allow(dead_code)]
    pub(super) id: skia_safe::GlyphId,
    pub(super) position: Point,
    pub(super) cluster: u32,
}

/// `Shaper::RunHandler` that flattens all runs (font / script segments)
/// into one growing `Vec<ShapedGlyph>`. For the typical SVG `<text>`
/// run this is a single run; multi-script text gets multiple runs in
/// document order. Positions inside each run are relative to the run's
/// `RunInfo.advance` cursor; we accumulate that cursor here so the
/// resulting positions are absolute over the whole shaped string.
struct ShapeCollector {
    out: Vec<ShapedGlyph>,
    // Internal scratch buffers reused across runs; owned by the
    // collector so `Buffer::new` can borrow them mutably from the
    // run_buffer callback. Not part of the public output — read `out`.
    pending: Vec<skia_safe::GlyphId>,
    pending_pos: Vec<Point>,
    pending_clusters: Vec<u32>,
    run_origin: Point,
}

impl ShapeCollector {
    fn new() -> Self {
        Self {
            out: Vec::new(),
            pending: Vec::new(),
            pending_pos: Vec::new(),
            pending_clusters: Vec::new(),
            run_origin: Point::new(0.0, 0.0),
        }
    }
}

impl skia_safe::shaper::RunHandler for ShapeCollector {
    fn begin_line(&mut self) {
        self.run_origin = Point::new(0.0, 0.0);
    }
    fn run_info(&mut self, _info: &skia_safe::shaper::run_handler::RunInfo) {}
    fn commit_run_info(&mut self) {}
    fn run_buffer<'a>(
        &'a mut self,
        info: &skia_safe::shaper::run_handler::RunInfo,
    ) -> skia_safe::shaper::run_handler::Buffer<'a> {
        let n = info.glyph_count;
        self.pending.clear();
        self.pending_pos.clear();
        self.pending_clusters.clear();
        self.pending.resize(n, 0);
        self.pending_pos.resize(n, Point::default());
        self.pending_clusters.resize(n, 0);
        skia_safe::shaper::run_handler::Buffer {
            glyphs: &mut self.pending,
            positions: &mut self.pending_pos,
            offsets: None,
            clusters: Some(&mut self.pending_clusters),
            point: self.run_origin,
        }
    }
    fn commit_run_buffer(&mut self, info: &skia_safe::shaper::run_handler::RunInfo) {
        for i in 0..self.pending.len() {
            self.out.push(ShapedGlyph {
                id: self.pending[i],
                position: Point::new(
                    self.run_origin.x + self.pending_pos[i].x,
                    self.run_origin.y + self.pending_pos[i].y,
                ),
                cluster: self.pending_clusters[i],
            });
        }
        self.run_origin = Point::new(
            self.run_origin.x + info.advance.x,
            self.run_origin.y + info.advance.y,
        );
    }
    fn commit_line(&mut self) {}
}

/// Map per-character GlyphAttrs to per-character kerned advances via
/// the shaped result. Returns one f32 per `glyph_attrs[i]`.
///
/// The mapping is by UTF-8 byte offset (`ShapedGlyph.cluster`). For each
/// `glyph_attrs[i]` we know its byte offset in the input string, find
/// the matching shaped glyph, and the advance is `shaped[k+1].x −
/// shaped[k].x`. The last character's advance is `total.x − shaped[k].x`.
///
/// Edge cases:
/// - Ligature: 2 chars map to 1 glyph. We assign the glyph's full
///   advance to the FIRST char and 0 to the rest; visual position is
///   approximated.
/// - Mark: 1 char maps to 0 glyphs (or to a glyph with 0 advance). We
///   treat the mark's advance as 0, which keeps subsequent chars on
///   the kerned cumulative position.
/// - Multiple shaped glyphs for one character (rare): sum their advances.
///
/// If no shaped glyph matches, fall back to standalone `font.measure_str`
/// for that character (defensive — shouldn't happen for ASCII).
pub(super) fn compute_kerned_advances(
    glyph_attrs: &[GlyphAttr],
    shaped: &[ShapedGlyph],
    total: Point,
) -> Vec<f32> {
    if shaped.is_empty() {
        return vec![0.0; glyph_attrs.len()];
    }
    // Byte offsets of each character in the flattened string.
    let mut byte_offsets = Vec::with_capacity(glyph_attrs.len());
    let mut cursor = 0usize;
    for g in glyph_attrs {
        byte_offsets.push(cursor as u32);
        cursor += g.ch.len_utf8();
    }
    let total_bytes = cursor as u32;
    let mut out = Vec::with_capacity(glyph_attrs.len());
    for i in 0..glyph_attrs.len() {
        let start_byte = byte_offsets[i];
        let end_byte = if i + 1 < byte_offsets.len() {
            byte_offsets[i + 1]
        } else {
            total_bytes
        };
        // Find the first shaped glyph at or after start_byte. Its origin
        // is the start of this character's visible run. Find the first
        // shaped glyph at or after end_byte (or end of shaped list);
        // its origin marks the next character's start, so the advance
        // for this character is the difference.
        let start_glyph = shaped.iter().position(|g| g.cluster >= start_byte);
        let end_glyph = shaped.iter().position(|g| g.cluster >= end_byte);
        let advance = match start_glyph {
            None => 0.0,
            Some(s) => {
                let this_x = shaped[s].position.x;
                let next_x = match end_glyph {
                    Some(e) if e > s => shaped[e].position.x,
                    _ => total.x, // last character
                };
                (next_x - this_x).max(0.0)
            }
        };
        out.push(advance);
    }
    out
}

/// Shape `text` with `font` via SkShaper (HarfBuzz-backed). Returns
/// per-glyph positions with GPOS pair adjustments + the total advance
/// of the run. Empty string returns an empty vec.
///
/// Per Blink's `HarfBuzzShaper::Shape` pipeline (`harfbuzz_shaper.cc`)
/// and our research note on `core/layout/svg/svg_text_layout_algorithm.cc`,
/// this is the same shaping kernel used for HTML and SVG; the
/// SVG-specific per-character positioning runs as a *post* pass on the
/// shaped advances.
pub(super) fn shape_text(text: &str, font: &Font) -> (Vec<ShapedGlyph>, Point) {
    if text.is_empty() {
        return (Vec::new(), Point::new(0.0, 0.0));
    }
    // Skia's `Shaper` construction is documented as expensive — cache
    // a single instance per process. `Shaper` is Send+Sync per
    // skia-safe (`unsafe_send_sync!` in modules/shaper.rs).
    static SHAPER: std::sync::OnceLock<skia_safe::Shaper> = std::sync::OnceLock::new();
    let shaper = SHAPER.get_or_init(|| skia_safe::Shaper::new(None));
    let mut collector = ShapeCollector::new();
    shaper.shape(
        text,
        font,
        /* left_to_right */ true,
        f32::INFINITY,
        &mut collector,
    );
    let total = collector.run_origin;
    (collector.out, total)
}
