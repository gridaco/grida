//! `SvgTextPainter` — `<text>` / `<tspan>` / `<textPath>` painter.
//!
//! Implemented:
//! - Per-character x/y/dx/dy/rotate from `<text>` and nested `<tspan>`
//!   (Blink's `SvgTextLayoutAttributesBuilder` model — innermost-first
//!   ancestor lookup, `rotate`'s sticky-last rule).
//! - `text-anchor` per anchored chunk (chunks split on explicit `x`).
//! - `dominant-baseline` mapped to a y-offset from Skia's alphabetic
//!   origin, mirroring Blink's `FontBaseline`.
//! - `<textPath>` along an `<path>` referenced via `href` /
//!   `xlink:href` / SVG 2 `path=` attribute, with `startOffset`,
//!   per-glyph tangent rotation, and out-of-range glyph clipping.
//! - XML whitespace collapse per SVG 1.1 §10.15 default `xml:space`.
//!
//! Out of scope (deliberate, see
//! `docs/wg/research/chromium/svg/text-on-path.md`):
//! - BiDi reordering, complex shaping, HarfBuzz cluster mapping.
//! - `textLength` / `lengthAdjust`.
//! - `<textPath side="right">`, `method="stretch"`, `spacing="exact"`.
//! - `baseline-shift` (`super`/`sub`/length) accumulation through `dy`.
//! - Vertical writing modes.
//!
//! Blink anchor: `core/paint/svg_text_painter.{h,cc}`,
//! `core/layout/svg/svg_text_layout_algorithm.cc` (the eventual model).

use csscascade::dom::{DemoDom, DemoNode, DemoNodeData, NodeId};
use skia_safe::{
    Canvas, Color, ContourMeasure, ContourMeasureIter, Font, FontStyle, Paint as SkPaint,
    PaintStyle, Path, Point, Rect, Typeface, Vector,
};

pub(super) mod shaping;

use super::super::dom::attrs::{parse_color, parse_length_px, parse_transform, Paint};
use super::super::dom::element::{get_attr, ElementKind};
use super::super::dom::href::{href_attr, same_document_fragment};
use super::super::dom::path_d::parse_path;
use super::scoped_svg_paint_state::PaintCtx;
use crate::htmlcss::svg::FontResolver;
use shaping::{compute_kerned_advances, shape_text};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TextAnchor {
    Start,
    Middle,
    End,
}

/// Dominant baseline kinds we resolve `dominant-baseline` to. Mirrors
/// Blink's `FontBaseline` enum (`platform/fonts/font_baseline.h`); each
/// variant maps to a y-offset added to Skia's default alphabetic origin
/// so the named baseline lands on the user-supplied `y`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BaselineKind {
    /// Default — Skia draws at the alphabetic baseline natively.
    Alphabetic,
    /// Top of em box (`text-before-edge`, `text-top`).
    TextOver,
    /// Bottom of em box (`text-after-edge`, `text-bottom`).
    TextUnder,
    /// Halfway between top of em and bottom of em (CSS `central`).
    Central,
    /// Halfway up the lowercase x (CSS `middle`).
    XMiddle,
    /// Hanging baseline. Without OpenType BASE table we use Blink's
    /// fallback at 0.2 × ascent above alphabetic.
    Hanging,
    /// Mathematical baseline — half ascent above alphabetic.
    Math,
    /// Ideographic baseline. Without BASE table we fall back to the
    /// bottom of the em box (matches Blink's `kIdeographicUnderBaseline`
    /// fallback).
    IdeographicUnder,
}

fn resolve_baseline(value: Option<&str>) -> BaselineKind {
    match value.map(str::trim).map(str::to_ascii_lowercase).as_deref() {
        Some("middle") => BaselineKind::XMiddle,
        Some("central") => BaselineKind::Central,
        Some("hanging") => BaselineKind::Hanging,
        Some("mathematical") => BaselineKind::Math,
        Some("ideographic") => BaselineKind::IdeographicUnder,
        Some("text-before-edge") | Some("text-top") | Some("before-edge") => BaselineKind::TextOver,
        Some("text-after-edge") | Some("text-bottom") | Some("after-edge") => {
            BaselineKind::TextUnder
        }
        // `auto`, `alphabetic`, `use-script`, `no-change`, `reset-size` and
        // anything unknown all collapse to alphabetic. SVG 2 §10.9.2: in
        // horizontal flow `auto` resolves to `alphabetic`. `use-script`
        // would consult the script's preferred baseline — out of scope;
        // alphabetic is the safest fallback.
        _ => BaselineKind::Alphabetic,
    }
}

/// Y-offset (Skia screen coords, +y down) to add to the user-supplied
/// `y` so that the chosen baseline lands on it. Skia's `draw_str` puts
/// the alphabetic baseline at the origin, so for `Alphabetic` this is
/// always 0.
fn baseline_offset(metrics: &skia_safe::FontMetrics, kind: BaselineKind) -> f32 {
    let ascent = metrics.ascent; // negative in Skia
    let descent = metrics.descent; // positive
    let x_height = metrics.x_height; // positive (0 if font doesn't expose)
    let cap_height = metrics.cap_height; // positive (0 if font doesn't expose)
    match kind {
        BaselineKind::Alphabetic => 0.0,
        BaselineKind::TextOver => -ascent,
        BaselineKind::TextUnder => -descent,
        BaselineKind::Central => -(ascent + descent) / 2.0,
        BaselineKind::XMiddle => x_height / 2.0,
        // CSS Inline Layout 3 §5.1.1: hanging baseline ≈ cap-height
        // top in the dominant script. Blink's `SimpleFontData::
        // GetBaseline(kHangingBaseline)` returns `cap_height` when
        // OS/2 doesn't declare an explicit hanging metric, putting
        // the glyph's cap-line on the user's y. Resvg-test-suite
        // expecteds match this: e.g. `<tspan alignment-baseline=
        // hanging>long</tspan>` renders with the top of "long"'s
        // cap at the user-y, not the full em-top. Earlier we used
        // `-ascent` (em-top), which over-shifted by ~30%. Falls back
        // to `0.8 * (-ascent)` when the font doesn't expose
        // `cap_height` (Devanagari script in
        // `dominant-baseline_hanging.svg` lands closer there).
        BaselineKind::Hanging => {
            if cap_height > 0.0 {
                cap_height
            } else {
                -ascent * 0.8
            }
        }
        BaselineKind::Math => -ascent / 2.0,
        BaselineKind::IdeographicUnder => -descent,
    }
}

pub fn paint(canvas: &Canvas, ctx: &PaintCtx<'_>, root_id: NodeId, node: &DemoNode) {
    // SVG inherits font properties from ancestors (commonly the
    // `<svg>` root carries `font-family` / `font-size`). Walk up the
    // DOM rather than reading only the `<text>` element itself.
    // Resolve font-size with proper parent-relative cascade. Bare
    // `parse_length_px` treats `em`/`ex`/`%` against constants (16/8),
    // which is wrong when an ancestor sets font-size and a child uses
    // `2em` / `200%` / `1.5ex`. Per CSS Fonts 4 §3.3 + Blink, em
    // resolves against the *parent* element's computed font-size, %
    // against parent's font-size as well, and named keywords map to a
    // canonical absolute size.
    let mut font_size = resolve_font_size_at(ctx, node).max(0.0);
    if font_size <= 0.0 {
        // SVG 2 §10 / CSS Fonts 4 §3.3: a zero `font-size` on the
        // text root means the root's *direct* text would be invisible,
        // but descendant `<tspan>` elements can override with their
        // own non-zero `font-size` and remain visible. Walk the
        // subtree and pick the first descendant with a resolved
        // non-zero size as the effective painter size; if none exists
        // there genuinely is nothing to draw.
        font_size = first_nonzero_descendant_font_size(ctx, node).unwrap_or(0.0);
        if font_size <= 0.0 {
            return;
        }
    }

    // 1. Flatten DOM text into per-character attribute records, walking
    //    `<text>` and nested `<tspan>` / `<textPath>` elements. Mirrors
    //    Blink's `SvgTextLayoutAttributesBuilder::Build` with an
    //    innermost-first stack lookup per channel (SVG 1.1 §10.4.3).
    //    `paths` collects one `TextPathInfo` per `<textPath>` we
    //    descended into; glyphs reference them via `text_path_idx`.
    let (glyph_attrs, text_paths) = flatten_glyphs(ctx, root_id, font_size);
    if glyph_attrs.is_empty() {
        return;
    }
    let font_family = read_inherited(ctx, node, "font-family");
    let style = read_font_style(ctx, node);
    let Some(typeface) = pick_typeface(ctx.fonts, font_family.as_deref(), style) else {
        return;
    };
    let mut font = Font::from_typeface(typeface, font_size);
    // Subpixel positioning lets per-glyph advances accumulate at
    // fractional precision instead of snapping each glyph to integer
    // user units. SVG-suite expecteds were rendered with subpixel
    // shaping; without it our pen advances quantize and accumulate a
    // visible left/right drift across long text runs (especially
    // visible under text-anchor=middle/end where the drift becomes
    // an off-center anchor).
    font.set_subpixel(true);

    // 2. Resolve dominant-baseline / alignment-baseline → constant
    //    y-offset added to every glyph's pen y, so the chosen baseline
    //    lands on the user y. SVG 2 §11.10.2.6 + CSS Inline Layout 3
    //    §3.3: `alignment-baseline` on the layout root takes
    //    precedence over `dominant-baseline`; `auto` / `baseline` /
    //    absent falls back to `dominant-baseline`. `read_inherited`
    //    already handles `inherit` by walking ancestors.
    let baseline = {
        let ab = read_inherited(ctx, node, "alignment-baseline");
        let active = match ab.as_deref().map(str::trim) {
            Some(v)
                if !v.is_empty()
                    && !v.eq_ignore_ascii_case("auto")
                    && !v.eq_ignore_ascii_case("baseline") =>
            {
                Some(v.to_string())
            }
            _ => read_inherited(ctx, node, "dominant-baseline"),
        };
        resolve_baseline(active.as_deref())
    };
    let (_line_spacing, metrics) = font.metrics();
    let baseline_y = baseline_offset(&metrics, baseline);

    // 3. Resolve per-glyph (x, y, advance, rotate, chunk_id) by walking
    //    the flattened attrs and propagating the running pen.
    //    Pre-compute inherited letter-spacing / word-spacing per source
    //    element so resolve_positions can apply them per glyph without
    //    walking the DOM each time. Both inherit per CSS Text 3 §10.
    let mut spacing_cache: std::collections::HashMap<NodeId, (f32, f32)> =
        std::collections::HashMap::new();
    for ga in &glyph_attrs {
        spacing_cache.entry(ga.source).or_insert_with(|| {
            let n = ctx.dom.node(ga.source);
            let ls = read_inherited(ctx, n, "letter-spacing")
                .map(|v| parse_spacing_length(&v, font_size))
                .unwrap_or(0.0);
            let ws = read_inherited(ctx, n, "word-spacing")
                .map(|v| parse_spacing_length(&v, font_size))
                .unwrap_or(0.0);
            (ls, ws)
        });
    }
    // Resolve writing-mode at the root. MVP: every vertical-* maps to
    // a single sideways-rotated layout where the inline-axis pen
    // advances along Y. Per Blink (`SvgTextLayoutAlgorithm`,
    // `svg_text_layout_algorithm.h:67-69`) writing-mode is a single
    // boolean threaded through the layout primitives — same shape here.
    let wm = read_inherited(ctx, node, "writing-mode")
        .map(|v| parse_writing_mode(&v))
        .unwrap_or(WritingMode::HorizontalTb);

    // Vertical-mode perpendicular offset on physical X. Blink's
    // formula uses `-ascent` (svg_text_layout_algorithm.cc:158-171),
    // but empirically that overshoots when glyphs are drawn from the
    // baseline-start point and rotated 90° CW around it (Skia's
    // draw-origin convention differs from Blink's positioning). For
    // the MVP we leave perp = 0 and let glyphs sit on the column with
    // body extending right; closer to expected for most fixtures than
    // applying a too-large negative offset.
    let v_perp_x = 0.0_f32;

    // Shape the full flattened character sequence once with HarfBuzz
    // (via SkShaper) so per-glyph advances reflect GPOS pair-kerning.
    // This matches Blink's pipeline: shape first, then apply SVG's
    // per-character x/y/dx/dy/rotate/textPath as displacements on the
    // shaped origins (`svg_text_layout_algorithm.cc:37-90`). Without
    // this, all "Te" / "Tx" / etc. pairs render with the un-kerned
    // advance, and every fixture rendering "Text" scores ~64% from the
    // resulting accumulated drift (Skia's `Font::measureText` only
    // applies the legacy `kern` table, not GPOS).
    // CSS Fonts 4 §6.5 `font-kerning`: `auto` / `normal` apply
    // kerning; `none` disables it. We approximate "kerning off" by
    // skipping the GPOS shaping pass and using standalone per-glyph
    // widths from `font.measure_str` (which only applies the legacy
    // `kern` table, not GPOS pair adjustments — same fallback Blink
    // hits when GPOS is suppressed). Per SVG 2, `font-kerning` is
    // not a presentation attribute — the resvg-test-suite's
    // `as-property.svg` documents this behavior ("must be inside
    // style, otherwise ignored"). Read from `style="…"` (or its
    // ancestor cascade) only, never from the bare attribute.
    let kerning_off = inherited_style_only(ctx, node, "font-kerning")
        .as_deref()
        .map(str::trim)
        .map(|v| v.eq_ignore_ascii_case("none"))
        .unwrap_or(false);
    let shaped_text: String = glyph_attrs.iter().map(|g| g.ch).collect();
    let kerned_advances = if kerning_off {
        let mut buf = [0u8; 4];
        glyph_attrs
            .iter()
            .map(|g| {
                let s = g.ch.encode_utf8(&mut buf);
                let (w, _) = font.measure_str(s, None);
                w
            })
            .collect::<Vec<_>>()
    } else {
        let (shaped_glyphs, shaped_total) = shape_text(&shaped_text, &font);
        compute_kerned_advances(&glyph_attrs, &shaped_glyphs, shaped_total)
    };

    // SVG 1.1 §10.5: `textLength` on `<text>` adjusts the total
    // advance of the contained glyphs.
    // - `lengthAdjust=spacing` (default): inter-glyph advance scales,
    //   each glyph is drawn at its natural size.
    // - `lengthAdjust=spacingAndGlyphs`: advance AND glyph rendering
    //   scale by the same factor — Skia's `Font::set_scale_x` lets
    //   the font draw glyphs with a horizontal x-scale, so we set
    //   that and also scale the kerned advances.
    // Tspan-level textLength isn't applied here yet — needs per-tspan
    // advance subgroups.
    let mut kerned_advances = kerned_advances;
    // Per-tspan font-size scaling. Shaping was done at the painter's
    // root font size; if a tspan overrode the size (e.g. inner tspan
    // sets `font-size=80` inside a `font-size=48` text), scale that
    // glyph's advance proportionally so the next glyph's pen starts at
    // the right edge of the larger / smaller character. The glyph
    // itself gets drawn with a font set to root × scale in
    // `draw_glyphs`. Applied BEFORE textLength so a textLength=N over
    // the run still produces the targeted total width.
    for (i, g) in glyph_attrs.iter().enumerate() {
        if (g.font_size_scale - 1.0).abs() > 0.0001 {
            kerned_advances[i] *= g.font_size_scale;
        }
    }
    // Per-tspan textLength: scale advances within each tspan's glyph
    // range. Inner (smaller) ranges scale first so an outer textLength
    // sees the already-adjusted advances. Tspans with their own
    // explicit `x` reset the chunk, so the outer text root's
    // textLength wouldn't span across them — applied only when no
    // descendant tspan has explicit `x`. Mirrors Blink's nesting
    // semantics for SVG 1.1 §10.5.
    let tl_ranges = collect_text_length_ranges(ctx, root_id, &glyph_attrs, font_size);
    let has_tspan_text_length = tl_ranges.iter().any(|r| !r.is_root);
    let mut root_target_len: Option<f32> = None;
    let mut root_spacing_and_glyphs = false;
    for tr in &tl_ranges {
        if tr.is_root {
            root_target_len = Some(tr.target_len);
            root_spacing_and_glyphs = tr.spacing_and_glyphs;
            continue;
        }
        let slice = &mut kerned_advances[tr.first..=tr.last];
        let natural: f32 = slice.iter().sum();
        if natural > 0.0 && tr.target_len > 0.0 {
            let scale = tr.target_len / natural;
            for a in slice.iter_mut() {
                *a *= scale;
            }
            // `lengthAdjust=spacingAndGlyphs` on a non-root carrier
            // (e.g. `<textPath textLength=… lengthAdjust=
            // spacingAndGlyphs>`) needs both advances AND the font's
            // x-scale to scale together — otherwise the spacing
            // stretches but glyphs render at natural width and the
            // text appears squashed. `Font::set_scale_x` is global to
            // the painter's font instance, so we only apply it when
            // the range covers ALL glyphs (single-textPath /
            // single-tspan case). Multi-range cases would need
            // per-range Font instances and stay on `spacing` semantics
            // for the rest.
            if tr.spacing_and_glyphs && tr.first == 0 && tr.last + 1 == kerned_advances.len() {
                font.set_scale_x(font.scale_x() * scale);
            }
        }
    }
    // The text-root textLength only applies when descendant tspans
    // don't supply their own — otherwise tspans with explicit `x`
    // form their own chunks and the outer textLength would
    // double-scale text that's already been positioned independently.
    if !has_tspan_text_length {
        if let Some(target_len) = root_target_len {
            let natural: f32 = kerned_advances.iter().sum();
            if natural > 0.0 && target_len > 0.0 {
                let scale = target_len / natural;
                for a in &mut kerned_advances {
                    *a *= scale;
                }
                if root_spacing_and_glyphs {
                    font.set_scale_x(font.scale_x() * scale);
                }
            }
        }
    }

    let mut glyphs = resolve_positions(
        &glyph_attrs,
        &font,
        baseline_y,
        &spacing_cache,
        wm,
        v_perp_x,
        &kerned_advances,
        &metrics,
    );

    // 4. Apply text-anchor per anchored chunk (SVG 2 §11.4.4). Each
    //    chunk's anchor is resolved by walking ancestors of the
    //    element that started the chunk (the source of the first
    //    glyph), not the root `<text>`. Lets a `<tspan x=… text-anchor=
    //    middle>` shift only its own chunk.
    apply_anchor(ctx, &mut glyphs, wm);

    // 4b. Map any `<textPath>` glyphs onto their referenced path. Runs
    //     after anchor so the chunk's anchor shift is naturally folded
    //     into the per-glyph arc-length offset (Blink's
    //     `PositionOnPath` consumes `x_linear` in the same way).
    apply_text_path_layout(&mut glyphs, &text_paths, &metrics, baseline_y);

    // 5. Paint glyphs grouped by source element. Every contiguous run
    //    of glyphs that shares a source `<text>` / `<tspan>` is drawn
    //    as one unit using that element's resolved `fill` and
    //    `stroke`. Without this grouping every `<tspan fill="…">` was
    //    rendered black because the painter only consulted the root
    //    `<text>`.
    paint_glyph_groups(canvas, ctx, &glyphs, &font);

    // 6. Paint `text-decoration` lines per anchor element. CSS Text
    //    Decoration 3 §2.5: decorations propagate from the declaring
    //    element to all its descendant text boxes, painted with the
    //    declaring element's own paint. Each glyph may belong to
    //    multiple anchors (one per ancestor that declares
    //    `text-decoration`); we paint outermost-first so descendant
    //    decorations sit on top.
    paint_decorations(canvas, ctx, &glyphs, &font, &metrics);
}

/// Per-character attribute record, the result of flattening the
/// `<text>` / `<tspan>` tree. Mirrors Blink's `SvgCharacterData`.
#[derive(Debug, Clone)]
pub(super) struct GlyphAttr {
    pub(super) ch: char,
    /// Absolute x override from the nearest ancestor with an `x` value
    /// at this character's index in that ancestor.
    x: Option<f32>,
    /// Absolute y override (same lookup rule as `x`).
    y: Option<f32>,
    /// Relative x shift applied after the pen advance / x override.
    dx: Option<f32>,
    /// Relative y shift.
    dy: Option<f32>,
    /// Per-glyph rotation in degrees. The `rotate` attribute has a
    /// "sticky last" rule: if more chars than values, the final value
    /// repeats (SVG 1.1 §10.4.3). Resolved during flattening.
    rotate: Option<f32>,
    /// Index into the painter's `Vec<TextPathInfo>`. `Some(i)` means
    /// this character lives inside a `<textPath>` and will be relocated
    /// onto the path during the layout pass.
    text_path_idx: Option<usize>,
    /// DOM element that emitted this glyph — the directly enclosing
    /// `<text>` or `<tspan>`. Used at paint time to (a) read the
    /// glyph's own `fill`/`stroke` (so per-`<tspan>` paint works), and
    /// (b) walk ancestors to collect `text-decoration` anchors that
    /// cover this glyph.
    source: NodeId,
    /// Cumulative `baseline-shift` from this glyph's enclosing element
    /// chain back to the `<text>` root, in SVG y direction (down is
    /// positive). Per CSS Inline Layout 3, the property accumulates
    /// through nesting; `baseline-shift: baseline` adds 0 (i.e. equals
    /// the parent shift). Applied as an extra dy at resolve time.
    baseline_shift_dy: f32,
    /// Per-tspan `alignment-baseline` override (innermost frame on the
    /// stack at emit time wins). When `Some`, the glyph's y becomes
    /// `pen_y + baseline_offset(metrics, kind) + baseline_shift_dy`
    /// instead of using the root's baseline_y. Lets a single tspan
    /// inside a `<text dominant-baseline="...">` use a different
    /// baseline. SVG 2 §11.10.2 / CSS Inline Layout 3 §3.3.
    alignment_baseline_kind: Option<BaselineKind>,
    /// Effective font-size for THIS glyph divided by the painter's
    /// root font size. `1.0` means "draw with the root font as-is";
    /// any other value swaps to a font sized at `root_size * scale`
    /// for both `compute_kerned_advances` and `draw_glyphs`. Lets a
    /// `<text font-size=48><tspan font-size=80>ex</tspan></text>` mix
    /// 48px and 80px glyphs on a shared baseline. SVG 2 §11.4 / CSS
    /// Fonts 4 §3.3 (font-size inherits, per-tspan override allowed).
    font_size_scale: f32,
}

/// Resolved geometry for one `<textPath>` element. Built once at
/// flatten time and consulted per glyph during the layout pass.
struct TextPathInfo {
    path: Path,
    /// Author-supplied `startOffset`, already rescaled by `pathLength`
    /// when present and resolved as a percentage of total length.
    start_offset: f32,
    /// Total path arc-length, summed across contours.
    total_length: f32,
    /// SVG 2 `side="right"`: reverses the arc-length walk and flips
    /// each glyph by 180° so it reads on the opposite side of the curve.
    side_right: bool,
    /// Per-textPath baseline kind. `dominant-baseline` and (for now)
    /// `alignment-baseline` on the `<textPath>` element override the
    /// inherited value from the enclosing `<text>` — without this, e.g.
    /// `alignment-baseline="middle"` on a textPath has no effect.
    baseline: BaselineKind,
}

/// Per-element attribute lists during DOM walk. Each `<text>` /
/// `<tspan>` pushes one of these; `consumed` counts how many addressable
/// characters from this element have been emitted.
struct ElemAttrs {
    x: Vec<f32>,
    y: Vec<f32>,
    dx: Vec<f32>,
    dy: Vec<f32>,
    rotate: Vec<f32>,
    consumed: usize,
    /// True when this frame is a `<textPath>`. The attribute walk in
    /// `emit_glyph` stops here so the parent `<text>`'s x/y/dx/dy
    /// don't leak into textPath chunks (per SVG 2 §11.4: `<text>`
    /// coordinates apply only to its non-textPath text content).
    is_text_path: bool,
    /// Cumulative `baseline-shift` for this stack frame in SVG y
    /// direction. Equals `parent.baseline_shift_dy + parse(local)`.
    baseline_shift_dy: f32,
    /// Local `alignment-baseline` on this element only (no ancestor
    /// walk — that would conflict with the root's `dominant-baseline`
    /// which is already applied uniformly). When set, every glyph
    /// emitted at or below this stack frame picks up this kind as
    /// its `alignment_baseline_kind` override.
    alignment_baseline: Option<BaselineKind>,
    /// Local `dominant-baseline` on this element only. Applies to
    /// glyphs emitted at or below this frame (descendants inherit the
    /// dominant baseline per CSS Inline Layout 3 §3.3). The root's
    /// dominant-baseline is already folded into `baseline_y` at paint
    /// entry, so this field is consulted only on non-root frames —
    /// i.e. a `<tspan dominant-baseline="middle">` shifts only its
    /// own subtree, not the root's "Some text" siblings. SVG 2
    /// §11.10.2.6.
    dominant_baseline: Option<BaselineKind>,
    /// Effective font-size for THIS frame (already CSS-cascade-
    /// resolved against the root). Inherited from the parent unless a
    /// local `font-size=` overrides. Stored on the frame so
    /// `emit_glyph` can read it innermost-first to set
    /// `GlyphAttr::font_size_scale = frame_size / root_size`. Lets a
    /// nested `<tspan font-size=80>` mix a different glyph size into
    /// the run.
    font_size: f32,
}

impl ElemAttrs {
    fn from_node(
        node: &DemoNode,
        parent_font_size: f32,
        parent_shift_dy: f32,
        viewport: (f32, f32),
    ) -> Self {
        // Resolve this frame's font-size: local `font-size=` cascades
        // against the parent's already-resolved size (CSS Fonts 4 §3.3:
        // em/%/keywords resolve relative to the parent), otherwise
        // inherit the parent's value as-is. The local resolution
        // mirrors the shape-painter's `resolve_font_size_step`.
        let font_size = read_local(node, "font-size")
            .map(|v| resolve_font_size_step(&v, parent_font_size))
            .unwrap_or(parent_font_size)
            .max(0.0);
        let local_shift = read_local(node, "baseline-shift")
            .map(|v| parse_baseline_shift(&v, font_size))
            .unwrap_or(0.0);
        let alignment_baseline = read_local(node, "alignment-baseline").and_then(|v| {
            let trimmed = v.trim();
            if trimmed.is_empty()
                || trimmed.eq_ignore_ascii_case("auto")
                || trimmed.eq_ignore_ascii_case("baseline")
                || trimmed.eq_ignore_ascii_case("inherit")
            {
                None
            } else {
                Some(resolve_baseline(Some(trimmed)))
            }
        });
        let dominant_baseline = read_local(node, "dominant-baseline").and_then(|v| {
            let trimmed = v.trim();
            // `auto` / `baseline` / `inherit`: inherit parent's
            // dominant baseline — no per-tspan override needed.
            // `no-change` / `use-script` / `reset-size`: SVG 1.1
            // shorthand for "keep current baseline" (deprecated in SVG 2
            // but the suite still tests them). Treating them as
            // resolve_baseline → Alphabetic would WIPE the parent's
            // middle/hanging baseline, regressing
            // `dominant-baseline_no-change` and friends. Map them to
            // None so the inherited baseline_y stands.
            if trimmed.is_empty()
                || trimmed.eq_ignore_ascii_case("auto")
                || trimmed.eq_ignore_ascii_case("baseline")
                || trimmed.eq_ignore_ascii_case("inherit")
                || trimmed.eq_ignore_ascii_case("no-change")
                || trimmed.eq_ignore_ascii_case("use-script")
                || trimmed.eq_ignore_ascii_case("reset-size")
            {
                None
            } else {
                Some(resolve_baseline(Some(trimmed)))
            }
        });
        Self {
            // Coord lists may use `em`/`ex` units; resolve them against
            // the current font-size rather than CSS initial 16px. Per
            // SVG 2 §8.5, percentages on `x`/`dx` resolve against the
            // viewport width and `y`/`dy` against the viewport height.
            x: parse_number_list_with_font_pct(get_attr(node, "x"), font_size, viewport.0),
            y: parse_number_list_with_font_pct(get_attr(node, "y"), font_size, viewport.1),
            dx: parse_number_list_with_font_pct(get_attr(node, "dx"), font_size, viewport.0),
            dy: parse_number_list_with_font_pct(get_attr(node, "dy"), font_size, viewport.1),
            // `rotate` is unitless degrees — em/ex don't apply.
            rotate: parse_number_list(get_attr(node, "rotate")),
            consumed: 0,
            is_text_path: false,
            baseline_shift_dy: parent_shift_dy + local_shift,
            alignment_baseline,
            dominant_baseline,
            font_size,
        }
    }
}

/// SVG writing-mode value, resolved at the root `<text>`.
///
/// MVP: we collapse `tb`, `tb-rl`, `vertical-rl`, `vertical-lr` into a
/// single "vertical-downward" mode (text flows top-to-bottom, glyphs
/// rotated 90° CW per `text-orientation: sideways` semantics). The
/// fixtures don't exercise multi-line layout where vertical-rl /
/// vertical-lr would diverge in line-direction.
///
/// Per CSS Writing Modes 4 + Blink (`SvgTextLayoutAlgorithm`,
/// `svg_text_layout_algorithm.h:67-69`): `dx` / `dy` keep their
/// physical-axis meaning in vertical mode. Only the inline-axis pen
/// advance and `text-anchor` axis swap.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WritingMode {
    HorizontalTb,
    Vertical,
}

impl WritingMode {
    fn is_vertical(self) -> bool {
        matches!(self, WritingMode::Vertical)
    }
}

fn parse_writing_mode(value: &str) -> WritingMode {
    match value.trim() {
        "tb" | "tb-rl" | "vertical-rl" | "vertical-lr" | "sideways-lr" | "sideways-rl" => {
            WritingMode::Vertical
        }
        _ => WritingMode::HorizontalTb,
    }
}

/// Parse a CSS `<length-percentage>` for `letter-spacing` / `word-spacing`.
///
/// Per CSS Text 3 §10: `normal` = 0, lengths are raw user units, and
/// percentages resolve against the current font-size (a non-CSS-standard
/// extension that the resvg test suite exercises). Negative values are
/// permitted and contract spacing.
fn parse_spacing_length(value: &str, font_size: f32) -> f32 {
    let v = value.trim();
    match v {
        "" | "normal" | "initial" | "auto" | "inherit" | "unset" => 0.0,
        _ => {
            if let Some(pct) = v.strip_suffix('%') {
                pct.trim()
                    .parse::<f32>()
                    .ok()
                    .map(|n| (n / 100.0) * font_size)
                    .unwrap_or(0.0)
            } else {
                parse_length_px_em(v, font_size).unwrap_or(0.0)
            }
        }
    }
}

/// Parse `baseline-shift` to a SVG-y delta (down is positive).
///
/// CSS Inline Layout 3 §5: `baseline` (or `0`) means no shift relative
/// to the parent baseline; `super`/`sub` use the font's own
/// superscript/subscript metrics (`OS/2.ySuperscriptYOffset` /
/// `ySubscriptYOffset`). Blink approximates with ~0.333em / ~0.2em
/// when those metrics aren't reachable — that matches the observed
/// resvg-test-suite expecteds. Earlier we used 0.5em which over-shot
/// the baseline by a noticeable margin in the diff for `super.svg` /
/// `sub.svg` / `with-rotate.svg` and the nested-super variants.
/// `<percentage>` resolves against the current font-size and raises
/// by that amount; `<length>` raises raw. SVG y grows downward, so
/// "raise" → negative delta.
fn parse_baseline_shift(value: &str, font_size: f32) -> f32 {
    let v = value.trim();
    match v {
        "" | "0" | "baseline" | "initial" | "auto" | "inherit" | "unset" => 0.0,
        "super" => -font_size / 3.0,
        "sub" => font_size / 5.0,
        _ => {
            if let Some(pct) = v.strip_suffix('%') {
                pct.trim()
                    .parse::<f32>()
                    .ok()
                    .map(|n| -(n / 100.0) * font_size)
                    .unwrap_or(0.0)
            } else {
                parse_length_px_em(v, font_size)
                    .map(|len| -len)
                    .unwrap_or(0.0)
            }
        }
    }
}

/// Parse a whitespace- or comma-separated list of `<length>`s. Empty
/// or absent attribute → empty list. Per SVG 1.1 §4.5.4 attribute value
/// syntax for list-of-`<length>`: tokens may be separated by any
/// combination of whitespace and commas.
fn parse_number_list(s: Option<&str>) -> Vec<f32> {
    parse_number_list_with_font(s, 16.0)
}

/// Parse a coord/length list, resolving `em`/`ex` against the supplied
/// font-size. The default `parse_number_list` uses 16/8 constants
/// (CSS initial); on `<text>`/`<tspan>` we have the resolved font-size
/// and want `0.5em` to mean 0.5 × actual font-size, not 0.5 × 16.
fn parse_number_list_with_font(s: Option<&str>, font_size: f32) -> Vec<f32> {
    let Some(s) = s else {
        return Vec::new();
    };
    s.split(|c: char| c == ',' || c.is_whitespace())
        .filter(|t| !t.is_empty())
        .filter_map(|t| parse_length_px_em(t, font_size))
        .collect()
}

/// Like [`parse_number_list_with_font`] but additionally resolves `%`
/// tokens against `axis` (viewport width for x/dx, height for y/dy).
/// Per SVG 2 §8.5 the x/y/dx/dy coordinate lists on `<text>` and
/// `<tspan>` accept `<length-percentage>` items.
fn parse_number_list_with_font_pct(s: Option<&str>, font_size: f32, axis: f32) -> Vec<f32> {
    let Some(s) = s else {
        return Vec::new();
    };
    s.split(|c: char| c == ',' || c.is_whitespace())
        .filter(|t| !t.is_empty())
        .filter_map(|t| parse_length_px_em_pct(t, font_size, axis))
        .collect()
}

/// Length parser that knows about the current font-size for `em`/`ex`.
/// Falls through to [`parse_length_px`] for absolute units.
fn parse_length_px_em(s: &str, font_size: f32) -> Option<f32> {
    let s = s.trim();
    if let Some(num) = s.strip_suffix("em").or_else(|| s.strip_suffix("EM")) {
        return num.trim().parse::<f32>().ok().map(|n| n * font_size);
    }
    if let Some(num) = s.strip_suffix("ex").or_else(|| s.strip_suffix("EX")) {
        // Approximate ex as 0.5em (CSS Values 4 §6.1 fallback when
        // the font doesn't expose an x-height).
        return num.trim().parse::<f32>().ok().map(|n| n * font_size * 0.5);
    }
    parse_length_px(s)
}

/// Length-or-percentage parser that knows about the current font-size
/// for `em`/`ex` and resolves `%` against `axis`. Used for text x/y/
/// dx/dy where percentages resolve against the viewport.
fn parse_length_px_em_pct(s: &str, font_size: f32, axis: f32) -> Option<f32> {
    let s = s.trim();
    if let Some(num) = s.strip_suffix('%') {
        return num.trim().parse::<f32>().ok().map(|n| n / 100.0 * axis);
    }
    parse_length_px_em(s, font_size)
}

fn flatten_glyphs(
    ctx: &PaintCtx<'_>,
    root_id: NodeId,
    font_size: f32,
) -> (Vec<GlyphAttr>, Vec<TextPathInfo>) {
    let mut out = Vec::new();
    let mut paths = Vec::new();
    let root = ctx.dom.node(root_id);
    // Per CSS Inline Layout 3 §5.2 + SVG 1.1 §10.9.2, baseline-shift
    // shifts an element relative to its *parent text content element's*
    // dominant-baseline. The root `<text>` has no such parent, so its
    // own baseline-shift declaration has no effect. The property is
    // also not inheritable, so children of `<text>` start at 0.
    // SVG 2 §8.5: % on text x/y/dx/dy resolves against the SVG
    // viewport. Compute it once at the root — it doesn't change for
    // descendants since `<text>` doesn't host nested `<svg>`.
    let viewport = crate::htmlcss::svg::layout::viewport::nearest_svg_viewport(ctx, root);
    let mut root_frame = ElemAttrs::from_node(root, font_size, 0.0, viewport);
    root_frame.baseline_shift_dy = 0.0;
    let mut stack = vec![root_frame];
    let mut path_stack: Vec<usize> = Vec::new();
    let mut ws = WhitespaceState {
        last_was_space: false,
        has_emitted: false,
    };
    let root_preserve = xml_space_preserve(root);
    walk_glyphs(
        ctx,
        root_id,
        root,
        font_size,
        viewport,
        &mut stack,
        &mut path_stack,
        &mut paths,
        &mut out,
        &mut ws,
        root_preserve,
    );
    if !root_preserve {
        // SVG 1.1 §10.15 default xml:space: strip trailing whitespace
        // of the entire content. Skip when root is in `preserve` mode.
        while matches!(out.last(), Some(g) if g.ch == ' ') {
            out.pop();
        }
    }
    (out, paths)
}

/// Read the effective `xml:space` on `node`. `xml:space="preserve"`
/// suppresses XML whitespace collapse for this element and its
/// descendants until overridden. We don't walk ancestors here —
/// callers thread the inherited value down through `walk_glyphs` so
/// a child's local `xml:space="default"` can override.
///
/// `html5ever` stores the xml-namespaced attribute with local name
/// `space` (the prefix `xml:` is stripped into a namespace), so
/// `get_attr` lookup uses the bare local name.
fn xml_space_preserve(node: &DemoNode) -> bool {
    matches!(read_xml_space(node), Some("preserve"))
}

fn xml_space_for(node: &DemoNode, parent_preserve: bool) -> bool {
    match read_xml_space(node) {
        Some("preserve") => true,
        Some("default") => false,
        _ => parent_preserve,
    }
}

fn read_xml_space(node: &DemoNode) -> Option<&str> {
    let DemoNodeData::Element(data) = &node.data else {
        return None;
    };
    for attr in &data.attrs {
        let local = attr.name.local.as_ref();
        if local == "space" || local == "xml:space" {
            return Some(attr.value.as_ref().trim());
        }
    }
    None
}

/// XML-whitespace collapse state, threaded through the recursive walk
/// so collapsing works across `<tspan>` boundaries: e.g. `<text>Hello
/// <tspan>world</tspan></text>` produces a single space between `o` and
/// `w` rather than dropping it. Per SVG 1.1 §10.15 with default
/// `xml:space`, all `\n` / `\r` / `\t` become space, runs of spaces
/// collapse to one, and leading/trailing spaces of the entire text
/// content are stripped.
struct WhitespaceState {
    last_was_space: bool,
    has_emitted: bool,
}

fn walk_glyphs(
    ctx: &PaintCtx<'_>,
    node_id: NodeId,
    node: &DemoNode,
    font_size: f32,
    viewport: (f32, f32),
    stack: &mut Vec<ElemAttrs>,
    path_stack: &mut Vec<usize>,
    paths: &mut Vec<TextPathInfo>,
    out: &mut Vec<GlyphAttr>,
    ws: &mut WhitespaceState,
    preserve: bool,
) {
    for &cid in &node.children {
        let child = ctx.dom.node(cid);
        match &child.data {
            DemoNodeData::Text(s) => {
                if preserve {
                    // SVG 1.1 §10.15 `xml:space="preserve"`: \n/\r/\t
                    // become space, but spaces are NOT collapsed and
                    // leading/trailing are NOT stripped. Reset the
                    // collapse-state cursor so spaces flanking this
                    // run are kept.
                    for raw in s.chars() {
                        let ch = if matches!(raw, '\n' | '\r' | '\t') {
                            ' '
                        } else {
                            raw
                        };
                        ws.last_was_space = ch == ' ';
                        ws.has_emitted = true;
                        emit_glyph(ch, node_id, stack, path_stack, out);
                    }
                    continue;
                }
                for raw in s.chars() {
                    let ch = if matches!(raw, '\n' | '\r' | '\t') {
                        ' '
                    } else {
                        raw
                    };
                    if ch == ' ' {
                        if !ws.has_emitted || ws.last_was_space {
                            continue;
                        }
                        ws.last_was_space = true;
                    } else {
                        ws.last_was_space = false;
                        ws.has_emitted = true;
                    }
                    // Source element for this glyph is the directly
                    // enclosing element (the `<text>` or `<tspan>`
                    // whose child text node we're consuming) — passed
                    // in via `node_id`.
                    emit_glyph(ch, node_id, stack, path_stack, out);
                }
            }
            DemoNodeData::Element(data) => {
                let kind = ElementKind::from_local_name(data.name.local.as_ref());
                match kind {
                    ElementKind::TSpan | ElementKind::Anchor => {
                        // SVG 2 §5.10.1 / §11: conditional-processing
                        // attributes (`requiredExtensions`,
                        // `systemLanguage`) and `display:none` apply to
                        // `<tspan>` just like any other rendered
                        // element. The container painter's `paint_node`
                        // gate doesn't fire for tspans (they're walked
                        // by the text painter, not dispatched), so
                        // re-apply the same checks here — otherwise a
                        // `<tspan systemLanguage="ru-RU">` paints over
                        // the previous run instead of being skipped.
                        //
                        // SVG 2 §A: `<a>` is a transparent grouping
                        // element — inside `<text>` it's equivalent to
                        // a `<tspan>` for layout/paint purposes (it
                        // adds hyperlink semantics on top, which the
                        // reftest renderer ignores). Walk its
                        // children with the same gate so `<a>Text</a>`
                        // emits glyphs instead of being silently
                        // dropped.
                        let skip = !super::svg_container_painter::required_extensions_match(child)
                            || !super::svg_container_painter::system_language_match(child)
                            || super::visibility::has_display_none(child);
                        if skip {
                            continue;
                        }
                        let parent_shift = stack.last().map(|e| e.baseline_shift_dy).unwrap_or(0.0);
                        stack.push(ElemAttrs::from_node(
                            child,
                            font_size,
                            parent_shift,
                            viewport,
                        ));
                        let child_preserve = xml_space_for(child, preserve);
                        walk_glyphs(
                            ctx,
                            cid,
                            child,
                            font_size,
                            viewport,
                            stack,
                            path_stack,
                            paths,
                            out,
                            ws,
                            child_preserve,
                        );
                        stack.pop();
                    }
                    ElementKind::TextPath => {
                        // SVG 2 §11.4: a `<textPath>` element shall not
                        // have descendant `<textPath>` elements. Browsers
                        // (Blink/WebKit/Gecko) drop the nested element AND
                        // its text content entirely — the outer textPath's
                        // own content still renders, but the inner one is
                        // a no-op. Without this skip, our walker recurses
                        // into the inner textPath and emits a duplicate
                        // run on the second path.
                        if !path_stack.is_empty() {
                            continue;
                        }
                        if let Some(info) = resolve_text_path(ctx, child) {
                            let idx = paths.len();
                            paths.push(info);
                            path_stack.push(idx);
                            // Per SVG 2 §11.4: `<textPath>` itself is not a
                            // valid host for x/y/dx/dy/rotate — those
                            // attributes are ignored on the element. We
                            // still let an enclosing `<text>`'s `x`/`dx`
                            // (inline-axis) leak through as along-path
                            // offsets in `emit_glyph`; `y`/`dy`
                            // (perpendicular) are blocked there since they
                            // would fight the path placement.
                            let parent_shift =
                                stack.last().map(|e| e.baseline_shift_dy).unwrap_or(0.0);
                            let mut tp_attrs =
                                ElemAttrs::from_node(child, font_size, parent_shift, viewport);
                            tp_attrs.x.clear();
                            tp_attrs.y.clear();
                            tp_attrs.dx.clear();
                            tp_attrs.dy.clear();
                            tp_attrs.rotate.clear();
                            tp_attrs.is_text_path = true;
                            stack.push(tp_attrs);
                            let child_preserve = xml_space_for(child, preserve);
                            walk_glyphs(
                                ctx,
                                cid,
                                child,
                                font_size,
                                viewport,
                                stack,
                                path_stack,
                                paths,
                                out,
                                ws,
                                child_preserve,
                            );
                            stack.pop();
                            path_stack.pop();
                        }
                        // No resolvable href + no inline path → skip the
                        // subtree (Blink does the same: empty path → no
                        // glyphs painted).
                    }
                    _ => {
                        // tref / a / etc. — out of scope.
                    }
                }
            }
            _ => {}
        }
    }
}

fn emit_glyph(
    ch: char,
    source: NodeId,
    stack: &mut [ElemAttrs],
    path_stack: &[usize],
    out: &mut Vec<GlyphAttr>,
) {
    // Innermost stack frame with a local `alignment-baseline` OR
    // `dominant-baseline` wins. Walk inner→outer, skipping the root
    // (its baseline is already folded into `baseline_y` for all
    // glyphs); per CSS Inline Layout 3 §3.3 a tspan's
    // `alignment-baseline` overrides its own `dominant-baseline`,
    // and either kind on a tspan shifts only that tspan's subtree.
    let frames_above_root = stack.len().saturating_sub(1);
    let alignment_baseline_kind = stack[..stack.len()]
        .iter()
        .rev()
        .take(frames_above_root)
        .find_map(|e| e.alignment_baseline.or(e.dominant_baseline));
    // Per-glyph font-size scale: innermost frame's resolved
    // `font_size` divided by the root frame's. `1.0` means "draw
    // with the painter's root font as-is"; any other value swaps to
    // a scaled font in `compute_kerned_advances` and `draw_glyphs`.
    let root_font_size = stack.first().map(|e| e.font_size).unwrap_or(16.0);
    let glyph_font_size = stack.last().map(|e| e.font_size).unwrap_or(root_font_size);
    let font_size_scale = if root_font_size > 0.0 {
        glyph_font_size / root_font_size
    } else {
        1.0
    };
    let mut attr = GlyphAttr {
        ch,
        x: None,
        y: None,
        dx: None,
        dy: None,
        rotate: None,
        text_path_idx: path_stack.last().copied(),
        source,
        // Cumulative baseline-shift is precomputed on each frame at
        // push time (parent + local). The innermost frame holds the
        // value to apply to this glyph.
        baseline_shift_dy: stack.last().map(|e| e.baseline_shift_dy).unwrap_or(0.0),
        alignment_baseline_kind,
        font_size_scale,
    };
    // When walking past a `<textPath>` frame (going outer), only the
    // inline-axis attributes (`x`/`dx`) of an enclosing `<text>` flow
    // through to the textPath's glyphs — they shift each character
    // along the arc-length. Per SVG 2 §11.4 the perpendicular attrs
    // (`y`/`dy`) and `rotate` from outside the textPath are dropped:
    // they'd fight the per-tangent placement and rotation. Mirrors
    // Blink's `SvgTextLayoutAttributesBuilder` (only `x`/`dx` are
    // collected for textPath chars from ancestor `<text>`).
    let mut past_text_path = false;
    for elem in stack.iter().rev() {
        let i = elem.consumed;
        if attr.x.is_none() && i < elem.x.len() {
            attr.x = Some(elem.x[i]);
        }
        if attr.dx.is_none() && i < elem.dx.len() {
            attr.dx = Some(elem.dx[i]);
        }
        if !past_text_path {
            if attr.y.is_none() && i < elem.y.len() {
                attr.y = Some(elem.y[i]);
            }
            if attr.dy.is_none() && i < elem.dy.len() {
                attr.dy = Some(elem.dy[i]);
            }
            if attr.rotate.is_none() && !elem.rotate.is_empty() {
                let r = if i < elem.rotate.len() {
                    elem.rotate[i]
                } else {
                    *elem.rotate.last().unwrap()
                };
                attr.rotate = Some(r);
            }
        }
        if elem.is_text_path {
            past_text_path = true;
        }
    }
    out.push(attr);
    for elem in stack.iter_mut() {
        elem.consumed += 1;
    }
}

/// Resolve a `<textPath>` element to its path geometry + start offset.
/// Returns `None` when the reference can't be satisfied (missing href,
/// non-path target, malformed inline `path` attribute).
///
/// Per Blink's `LayoutSVGTextPath::LayoutPath` (`layout_svg_text_path.cc`)
/// the SVG 2 inline `path=` attribute takes precedence over an `href` /
/// `xlink:href` reference, and the referenced `<path>`'s own `transform`
/// attribute is folded into the geometry before the arc-length walk.
fn resolve_text_path(ctx: &PaintCtx<'_>, node: &DemoNode) -> Option<TextPathInfo> {
    // SVG 2 inline path data wins over href.
    let path = if let Some(d) = get_attr(node, "path").filter(|s| !s.trim().is_empty()) {
        parse_path(d)
    } else {
        let id = href_attr(node).and_then(same_document_fragment)?;
        let target_id = ctx.resources.lookup(id)?;
        let target = lookup_path_target(ctx.dom, target_id)?;
        let d = get_attr(target, "d")?;
        let mut p = parse_path(d);
        // Apply the referenced `<path>`'s own transform attribute. Per
        // SVG 2 §11.4.3 & Blink, this fold-in happens once before the
        // arc-length walk so glyph positions are in user-space.
        // `transform-origin` on the path wraps `transform` as
        // `translate(o) * transform * translate(-o)` per CSS Transforms
        // 1 §3.5 — without this a `transform="rotate(90)" transform-
        // origin="center"` rotates around (0, 0) instead of the
        // viewport center.
        if let Some(t) = get_attr(target, "transform").and_then(parse_transform) {
            let origin = super::super::layout::transform::transform_origin_for(ctx, target);
            p = p.with_transform(&super::super::layout::transform::wrap_with_origin(
                &t, origin,
            ));
        }
        p
    };

    let total_length: f32 = ContourMeasureIter::new(&path, false, None)
        .map(|c| c.length())
        .sum();
    if total_length <= 0.0 {
        return None;
    }

    // `startOffset`: number → user units, percentage → fraction of
    // total length. We don't yet honour `pathLength` rescaling on the
    // referenced `<path>` (see deferred-features list in
    // text-on-path.md).
    let start_offset = match get_attr(node, "startOffset") {
        Some(raw) => {
            let raw = raw.trim();
            if let Some(p) = raw.strip_suffix('%') {
                p.trim()
                    .parse::<f32>()
                    .ok()
                    .map(|v| v / 100.0 * total_length)
                    .unwrap_or(0.0)
            } else {
                parse_length_px(raw).unwrap_or(0.0)
            }
        }
        None => 0.0,
    };

    let side_right = matches!(get_attr(node, "side").map(str::trim), Some("right"));

    // Per-textPath baseline. Read `dominant-baseline` first; fall back
    // to `alignment-baseline` (the SVG 2 spec says alignment-baseline
    // shifts the element relative to its parent's baseline, but for
    // textPath at top level treating them as equivalent is good enough
    // for the v1 fixture coverage). If neither is set, the painter's
    // outer-text default applies (we encode this with `Alphabetic` and
    // the apply_text_path_layout pass passes through `baseline_y` when
    // baseline is `Alphabetic`, so nothing changes for the common case).
    let baseline = match get_attr(node, "dominant-baseline")
        .or_else(|| get_attr(node, "alignment-baseline"))
    {
        Some(v) => resolve_baseline(Some(v)),
        None => BaselineKind::Alphabetic,
    };

    Some(TextPathInfo {
        path,
        start_offset,
        total_length,
        side_right,
        baseline,
    })
}

/// Walk back up to find the `<path>` element a textPath references.
/// Basic-shape targets (`<rect>`, `<circle>`, …) are not supported —
/// neither Blink nor usvg implements that yet.
fn lookup_path_target(dom: &DemoDom, id: NodeId) -> Option<&DemoNode> {
    let n = dom.node(id);
    let DemoNodeData::Element(data) = &n.data else {
        return None;
    };
    if matches!(
        ElementKind::from_local_name(data.name.local.as_ref()),
        ElementKind::Path
    ) {
        Some(n)
    } else {
        None
    }
}

#[derive(Debug, Clone, Copy)]
struct ResolvedGlyph {
    ch: char,
    x: f32,
    y: f32,
    advance: f32,
    rotate_deg: f32,
    chunk_id: usize,
    text_path_idx: Option<usize>,
    /// Glyph extends past the path's end (or before its start) — paint
    /// skips it. Per SVG 2 §11.4: "if the [glyph's] center falls outside
    /// the path, the entire glyph is invisible."
    hidden: bool,
    /// When inside a `<textPath>`, the resolved (point, tangent angle)
    /// for the glyph's center. The painter uses this to build the
    /// translate-rotate-translate transform that places the glyph
    /// center on the path with its baseline tangent to it.
    on_path: Option<OnPathPlacement>,
    /// DOM element that emitted this glyph (carried over from
    /// [`GlyphAttr::source`]). Drives per-`<tspan>` paint and
    /// `text-decoration` anchor enumeration at draw time.
    source: NodeId,
    /// Per-glyph font-size scale (carried from `GlyphAttr`). `1.0`
    /// uses the painter's root font; any other value swaps to a
    /// scaled font for `draw_glyphs`. The advance has already been
    /// scaled in `compute_kerned_advances`.
    font_size_scale: f32,
}

#[derive(Debug, Clone, Copy)]
struct OnPathPlacement {
    point: Point,
    /// Tangent direction in degrees, screen-space (`atan2(ty, tx)`).
    /// Combined with the glyph's own `rotate_deg` at draw time.
    tangent_deg: f32,
    /// Perpendicular-to-tangent shift applied AFTER rotation. Carries
    /// the dominant-baseline offset (and, eventually, baseline-shift).
    baseline_shift: f32,
}

/// Resolve absolute (x, y) per glyph from the flattened attributes.
/// Position rules per SVG 1.1 §10.4.3 / SVG 2 §11.4: an absolute x or y
/// resets the pen for that axis; dx/dy are then added; pen advances by
/// the glyph's measured width after each character. Anchored chunks
/// (`chunk_id`) split where any explicit x is set after the first
/// character — `apply_anchor` later shifts each chunk by its
/// text-anchor offset.
fn resolve_positions(
    attrs: &[GlyphAttr],
    font: &Font,
    baseline_y: f32,
    spacing: &std::collections::HashMap<NodeId, (f32, f32)>,
    wm: WritingMode,
    v_perp_x: f32,
    kerned_advances: &[f32],
    metrics: &skia_safe::FontMetrics,
) -> Vec<ResolvedGlyph> {
    let mut pen_x = 0.0f32;
    let mut pen_y = 0.0f32;
    let mut chunk_id: usize = 0;
    let mut prev_text_path_idx: Option<usize> = None;
    let mut out = Vec::with_capacity(attrs.len());
    for (i, g) in attrs.iter().enumerate() {
        // Crossing into / out of a `<textPath>` resets the pen and
        // starts a new anchored chunk — Blink's
        // `SvgTextLayoutAttributesBuilder::ShouldStartAnchoredChunk`
        // returns true at the first character inside textPath. Without
        // this reset, the leading anchor of a `<textPath>` chunk would
        // inherit the running pen from any text before it.
        if g.text_path_idx != prev_text_path_idx {
            if i > 0 {
                chunk_id += 1;
            }
            pen_x = 0.0;
            pen_y = 0.0;
            prev_text_path_idx = g.text_path_idx;
        }
        if g.x.is_some() && i > 0 {
            chunk_id += 1;
        }
        if let Some(x) = g.x {
            pen_x = x;
        }
        if let Some(y) = g.y {
            pen_y = y;
        }
        if let Some(dx) = g.dx {
            pen_x += dx;
        }
        if let Some(dy) = g.dy {
            pen_y += dy;
        }
        // Use the GPOS-kerned advance for this character from the
        // pre-shaped run. Falls back to standalone `measure_str` only
        // when the shape result is missing the entry (defensive — for
        // ASCII strings every cluster has a glyph).
        let mut advance = kerned_advances.get(i).copied().unwrap_or_else(|| {
            let mut buf = [0u8; 4];
            let s = g.ch.encode_utf8(&mut buf);
            font.measure_str(&*s, None).0
        });
        // CSS Text 3 §10: word-spacing is added to the advance of the
        // word-separator characters (U+0020 SPACE, U+00A0 NBSP, U+1361
        // ETHIOPIC WORDSPACE, U+10100/U+10101 AEGEAN WORD SEPARATORS,
        // U+12470/U+12471). We support U+0020 + U+00A0 — the long tail
        // is rare and we don't have a Unicode tables crate here.
        let (letter_spacing, word_spacing) = spacing.get(&g.source).copied().unwrap_or((0.0, 0.0));
        if matches!(g.ch, ' ' | '\u{00A0}') {
            advance += word_spacing;
        }
        // For textPath glyphs we don't apply baseline_y to the linear
        // pen — the perpendicular shift is applied in the textPath
        // pass (perpendicular to the tangent, not to screen-y).
        // baseline-shift IS folded into pen_y for both modes, since
        // the textPath pass reads g.y when computing the perpendicular
        // shift (`g.y + baseline_y`), so the shift naturally rides on
        // the perpendicular axis.
        // In vertical writing-mode (sideways MVP), the inline-axis pen
        // advances on Y. Each glyph is also rotated 90° CW around its
        // origin (added to the user's `rotate=` value). Per Blink, dx
        // and dy keep their physical-axis meaning, so the existing
        // pen_x += dx / pen_y += dy reads above stay correct.
        // baseline_y is the perpendicular offset; in horizontal mode
        // it shifts y, in vertical mode (sideways) the rotation around
        // the glyph origin would move the glyph relative to its
        // baseline, but for a simple MVP we drop the perpendicular
        // baseline shift in vertical so glyphs stack on the same x.
        let user_rotate = g.rotate.unwrap_or(0.0);
        // Per-glyph baseline override: a tspan with its own
        // `alignment-baseline` overrides the root's baseline_y for
        // glyphs in that subtree.
        let glyph_baseline_y = match g.alignment_baseline_kind {
            Some(kind) => baseline_offset(metrics, kind),
            None => baseline_y,
        };
        let (gx, gy, glyph_rotate) = if wm.is_vertical() {
            // Glyph at (pen_x + perp, pen_y), rotated 90° CW. The
            // perpendicular offset places the rotated baseline on the
            // writing column.
            (pen_x + v_perp_x, pen_y, user_rotate + 90.0)
        } else if g.text_path_idx.is_some() {
            (pen_x, pen_y + g.baseline_shift_dy, user_rotate)
        } else {
            (
                pen_x,
                pen_y + glyph_baseline_y + g.baseline_shift_dy,
                user_rotate,
            )
        };
        out.push(ResolvedGlyph {
            ch: g.ch,
            x: gx,
            y: gy,
            advance,
            rotate_deg: glyph_rotate,
            chunk_id,
            text_path_idx: g.text_path_idx,
            hidden: false,
            on_path: None,
            source: g.source,
            font_size_scale: g.font_size_scale,
        });
        // letter-spacing adds tracking after each typographic character
        // (CSS Text 3 §10.1). We add it to the pen but not to the
        // glyph's own advance, matching Blink's behavior in
        // `ShapeResultView::AddRangeOfRuns` where letter-spacing is a
        // post-shape adjustment that doesn't enlarge the glyph's hit
        // box. In vertical writing-mode the inline axis is Y.
        if wm.is_vertical() {
            pen_y += advance + letter_spacing;
        } else {
            pen_x += advance + letter_spacing;
        }
    }
    out
}

/// Map every `<textPath>` glyph to a (point, tangent) on its path,
/// using `glyph.x` (linear position from `resolve_positions`, with
/// `apply_anchor` already folded in) plus `startOffset` as the
/// arc-length of the glyph's *center*. Out-of-range glyphs get
/// `hidden = true` and the painter skips them. Per-glyph `rotate=` is
/// preserved (the painter sums it with `tangent_deg`); the linear y
/// becomes `baseline_shift`, applied perpendicular to the tangent.
///
/// `outer_baseline_y` is the offset for the enclosing `<text>`'s
/// dominant-baseline; the textPath's own `dominant-baseline` /
/// `alignment-baseline` (if set) overrides this per cluster.
///
/// Mirrors Blink's `PositionOnPath` in `svg_text_layout_algorithm.cc`.
fn apply_text_path_layout(
    glyphs: &mut [ResolvedGlyph],
    paths: &[TextPathInfo],
    metrics: &skia_safe::FontMetrics,
    outer_baseline_y: f32,
) {
    if paths.is_empty() {
        return;
    }
    let mut i = 0;
    while i < glyphs.len() {
        let Some(idx) = glyphs[i].text_path_idx else {
            i += 1;
            continue;
        };
        let mut j = i;
        while j < glyphs.len() && glyphs[j].text_path_idx == Some(idx) {
            j += 1;
        }
        let info = &paths[idx];
        let mut mapper = ArcLengthMapper::new(&info.path);
        // Per-textPath baseline override. When the `<textPath>` element
        // sets its own dominant-baseline / alignment-baseline, use that
        // instead of the enclosing `<text>`'s baseline.
        let baseline_y = if matches!(info.baseline, BaselineKind::Alphabetic) {
            outer_baseline_y
        } else {
            baseline_offset(metrics, info.baseline)
        };
        for g in &mut glyphs[i..j] {
            // For `side="right"`, walk the path from end → start: the
            // first glyph (in document order) sits at the path's end and
            // each subsequent glyph moves toward the start. The painter
            // also adds 180° to the tangent so each glyph reads
            // correctly relative to the reversed walking direction
            // (SVG 2 §11.4.3).
            let linear = g.x + g.advance / 2.0 + info.start_offset;
            let arc = if info.side_right {
                info.total_length - linear
            } else {
                linear
            };
            if arc < 0.0 || arc > info.total_length {
                g.hidden = true;
                continue;
            }
            let Some((point, tangent)) = mapper.position_at(arc) else {
                g.hidden = true;
                continue;
            };
            let mut tangent_deg = tangent.y.atan2(tangent.x).to_degrees();
            if info.side_right {
                tangent_deg += 180.0;
            }
            let baseline_shift = g.y + baseline_y;
            g.on_path = Some(OnPathPlacement {
                point,
                tangent_deg,
                baseline_shift,
            });
        }
        i = j;
    }
}

/// Stateful wrapper around `ContourMeasureIter` so sequential glyph
/// queries in increasing arc-length don't re-walk every contour.
/// Mirrors the role of Blink's `Path::PositionCalculator` (a thin
/// stateful wrapper around `SkPathMeasure`).
struct ArcLengthMapper {
    contours: Vec<ContourMeasure>,
    /// Cumulative length BEFORE each contour: `starts[k]` is the sum of
    /// `contours[0..k].length()`. Length is `contours.len() + 1` so the
    /// total length sits at `starts[contours.len()]`.
    starts: Vec<f32>,
}

impl ArcLengthMapper {
    fn new(path: &Path) -> Self {
        let contours: Vec<ContourMeasure> = ContourMeasureIter::new(path, false, None).collect();
        let mut starts = Vec::with_capacity(contours.len() + 1);
        let mut acc = 0.0;
        starts.push(0.0);
        for c in &contours {
            acc += c.length();
            starts.push(acc);
        }
        Self { contours, starts }
    }

    fn position_at(&mut self, arc: f32) -> Option<(Point, Vector)> {
        // Linear scan — the contour count is tiny in practice (typical
        // textPath fixtures have one contour) and queries are roughly
        // monotonic. A binary search is fine but unnecessary.
        for (k, c) in self.contours.iter().enumerate() {
            let local = arc - self.starts[k];
            if local <= c.length() {
                return c.pos_tan(local);
            }
        }
        None
    }
}

/// Apply `text-anchor` per anchored chunk. Each chunk's effective
/// width is the sum of its glyph advances; middle subtracts half, end
/// subtracts the whole, start is a no-op. The anchor is read from the
/// element that started the chunk (the source of the first glyph),
/// walking ancestors via CSS inheritance. Lets a
/// `<tspan x=… text-anchor=middle>` shift only the chunk it spawned,
/// not the whole `<text>`. Blink: `ApplyAnchoring` in
/// `svg_text_layout_algorithm.cc`.
fn apply_anchor(ctx: &PaintCtx<'_>, glyphs: &mut [ResolvedGlyph], wm: WritingMode) {
    let mut i = 0;
    while i < glyphs.len() {
        let cid = glyphs[i].chunk_id;
        let chunk_source = glyphs[i].source;
        let mut j = i;
        let mut width = 0.0;
        while j < glyphs.len() && glyphs[j].chunk_id == cid {
            width += glyphs[j].advance;
            j += 1;
        }
        let anchor = match read_inherited(ctx, ctx.dom.node(chunk_source), "text-anchor")
            .as_deref()
            .map(str::trim)
        {
            Some("middle") => TextAnchor::Middle,
            Some("end") => TextAnchor::End,
            _ => TextAnchor::Start,
        };
        let shift = match anchor {
            TextAnchor::Middle => -width / 2.0,
            TextAnchor::End => -width,
            TextAnchor::Start => 0.0,
        };
        if shift != 0.0 {
            for g in &mut glyphs[i..j] {
                if wm.is_vertical() {
                    g.y += shift;
                } else {
                    g.x += shift;
                }
            }
        }
        i = j;
    }
}

/// Walk `glyphs` in document order and paint each contiguous run of
/// glyphs sharing a source element using that element's own
/// fill / stroke. Implements per-`<tspan>` paint so e.g.
/// `<tspan fill="yellow" stroke="green">` colors only the glyphs from
/// that span, not the whole `<text>`. Within a run the painter still
/// fills first then strokes (SVG 2 §11.3), so per-element ordering is
/// preserved.
fn paint_glyph_groups(canvas: &Canvas, ctx: &PaintCtx<'_>, glyphs: &[ResolvedGlyph], font: &Font) {
    if glyphs.is_empty() {
        return;
    }
    let mut i = 0;
    while i < glyphs.len() {
        let source = glyphs[i].source;
        let mut j = i + 1;
        while j < glyphs.len() && glyphs[j].source == source {
            j += 1;
        }
        let run = &glyphs[i..j];
        let node = ctx.dom.node(source);

        // SVG 2 §11.4 / CSS Display 3: `visibility: hidden` on a
        // `<tspan>` makes the glyphs invisible but they still
        // contribute to text layout (advances are counted by
        // `resolve_positions` upstream — we just skip the fill +
        // stroke draws here). `visibility: collapse` is treated the
        // same in inline-text contexts. The cascade walks ancestors
        // because `visibility` inherits.
        if !super::visibility::is_visible_inherited(ctx.dom, source) {
            i = j;
            continue;
        }

        // Per-tspan group `opacity`: applied to the composited run as
        // a save_layer (not multiplied into per-glyph fill alpha,
        // which would over-darken at kerning overlaps). SVG 2 §6.13:
        // `opacity` is a presentation attribute on `<tspan>` /
        // `<a>` / `<text>` that wraps the rendered output. We walk
        // ancestors source→`<text>` so a `<tspan opacity="0.5">`
        // inside a `<g opacity="0.5">` ends up at 0.25.
        let group_alpha = ancestor_group_opacity(ctx, node);
        let group_layer_opened = if group_alpha < 1.0 {
            let mut p = SkPaint::default();
            p.set_alpha_f(group_alpha.max(0.0));
            canvas.save_layer(&skia_safe::canvas::SaveLayerRec::default().paint(&p));
            true
        } else {
            false
        };

        // `filter=` on a `<tspan>` (CSS Filter Effects 1 / SVG 2
        // §11.4): resolve the funcIRI / function-list against the
        // run's user-space bbox, open one save_layer per filter step
        // carrying the composed `ImageFilter`. Restored last-in-
        // first-out below.
        let tspan_filter_invs = resolve_tspan_filter(ctx, node, run, font);
        let tspan_filter_layers = tspan_filter_invs.len();
        for inv in tspan_filter_invs.iter().rev() {
            let mut p = SkPaint::default();
            p.set_image_filter(Some(inv.image_filter.clone()));
            let rec = skia_safe::canvas::SaveLayerRec::default()
                .bounds(&inv.region_user_space)
                .paint(&p);
            canvas.save_layer(&rec);
        }

        // `mask=` on a `<tspan>` (CSS Masking 1 / SVG 2 §11.4):
        // resolve the referenced `<mask>` against the run's
        // user-space bbox, open a content layer for the run's draws,
        // then composite the mask via `apply_mask` after the run is
        // painted. Per SVG 2 §6.6 effect order (filter, clip, mask,
        // opacity), the mask layer sits inside the filter layer so
        // the filter operates on the masked content. Mirrors the
        // container path.
        let tspan_mask_inv = resolve_tspan_mask(ctx, node, run, font);
        let tspan_mask_layer = tspan_mask_inv.is_some();
        if tspan_mask_layer {
            canvas.save_layer(&skia_safe::canvas::SaveLayerRec::default());
        }

        // Fill — default is black (SVG 2 §11.3) when no inherited
        // value resolves. `url(#…)` paint references resolve to a
        // gradient or pattern shader and are applied via
        // `paint.set_shader`. Pattern resolution needs the run's
        // user-space bbox (gradient/pattern in `objectBoundingBox`
        // units maps against it).
        let fill_paint = build_text_fill_paint(ctx, node, run, font);

        // Stroke — only if non-`none` and a valid paint resolves.
        // `url(#…)` paint references resolve to a gradient or pattern
        // shader (mirrors the fill branch). Pattern/gradient mapping
        // for `objectBoundingBox` units uses the run's user-space
        // bbox.
        let stroke_paint = build_text_stroke_paint(ctx, node, run, font);

        // Paint-order on the run's source element: SVG 2 §11.3 +
        // CSS Paint Order Level 1. Markers don't apply to text;
        // the property reduces to fill/stroke ordering. Default
        // (or invalid) → fill, then stroke.
        let order = resolve_text_paint_order(ctx, node);
        for phase in order {
            match phase {
                TextPhase::Fill => {
                    if let Some(p) = fill_paint.as_ref() {
                        draw_glyphs(canvas, run, font, p);
                    }
                }
                TextPhase::Stroke => {
                    if let Some(p) = stroke_paint.as_ref() {
                        draw_glyphs(canvas, run, font, p);
                    }
                }
            }
        }

        if let Some(inv) = tspan_mask_inv.as_ref() {
            super::svg_container_painter::apply_mask(canvas, ctx, inv);
            canvas.restore();
        }
        for _ in 0..tspan_filter_layers {
            canvas.restore();
        }
        if group_layer_opened {
            canvas.restore();
        }
        i = j;
    }
}

/// One contiguous run of glyphs whose `textLength` should be honored.
/// Indexes into the painter's `glyph_attrs` Vec.
struct TextLengthRange {
    first: usize,
    last: usize,
    target_len: f32,
    is_root: bool,
    spacing_and_glyphs: bool,
}

/// Walk the text DOM (root + descendants) collecting every element
/// that carries a `textLength` attribute, then turn each one into a
/// `[first, last]` glyph index range. Inner ranges (smaller, deeper)
/// come first in the returned Vec so callers that scale in order
/// produce the nested-textLength behavior Blink uses.
fn collect_text_length_ranges(
    ctx: &PaintCtx<'_>,
    root_id: NodeId,
    glyph_attrs: &[GlyphAttr],
    font_size: f32,
) -> Vec<TextLengthRange> {
    let mut out: Vec<TextLengthRange> = Vec::new();

    fn walk(
        ctx: &PaintCtx<'_>,
        root_id: NodeId,
        node_id: NodeId,
        glyph_attrs: &[GlyphAttr],
        font_size: f32,
        out: &mut Vec<TextLengthRange>,
    ) {
        let n = ctx.dom.node(node_id);
        if let Some(target_len) = read_text_length(ctx, n, font_size) {
            let mut first = None;
            let mut last = None;
            for (i, ga) in glyph_attrs.iter().enumerate() {
                let mut cur = Some(ga.source);
                let mut is_in_range = false;
                while let Some(id) = cur {
                    if id == node_id {
                        is_in_range = true;
                        break;
                    }
                    if id == root_id && node_id != root_id {
                        break;
                    }
                    cur = ctx.dom.node(id).parent;
                }
                if is_in_range {
                    if first.is_none() {
                        first = Some(i);
                    }
                    last = Some(i);
                }
            }
            if let (Some(first), Some(last)) = (first, last) {
                let length_adjust = get_attr(n, "lengthAdjust").map(str::trim);
                out.push(TextLengthRange {
                    first,
                    last,
                    target_len,
                    is_root: node_id == root_id,
                    spacing_and_glyphs: matches!(length_adjust, Some("spacingAndGlyphs")),
                });
            }
        }
        for &cid in &n.children {
            let child = ctx.dom.node(cid);
            if !matches!(&child.data, DemoNodeData::Element(_)) {
                continue;
            }
            walk(ctx, root_id, cid, glyph_attrs, font_size, out);
        }
    }

    walk(ctx, root_id, root_id, glyph_attrs, font_size, &mut out);
    // Inner ranges first so the cumulative scaling produces nested
    // semantics (outer textLength sees the inner-adjusted advances).
    out.sort_by_key(|r| r.last - r.first);
    out
}

/// Read `textLength` from a text-root element. Accepts a CSS
/// `<length>` (px / em / mm / etc.), a percentage of the SVG
/// viewport's diagonal axis (per SVG 2 §11.4.1), or a unitless
/// number in user units. Negative / zero values yield `None`.
fn read_text_length(ctx: &PaintCtx<'_>, node: &DemoNode, font_size: f32) -> Option<f32> {
    let raw = get_attr(node, "textLength")?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let lower = trimmed.to_ascii_lowercase();
    if let Some(num) = lower.strip_suffix('%') {
        let n: f32 = num.trim().parse().ok()?;
        let (vw, vh) = crate::htmlcss::svg::layout::viewport::nearest_svg_viewport(ctx, node);
        let diag = (vw * vw + vh * vh).sqrt() / std::f32::consts::SQRT_2;
        return Some(n / 100.0 * diag).filter(|v| *v > 0.0);
    }
    if let Some(num) = lower.strip_suffix("em") {
        let n: f32 = num.trim().parse().ok()?;
        return Some(n * font_size).filter(|v| *v > 0.0);
    }
    if let Some(num) = lower.strip_suffix("ex") {
        let n: f32 = num.trim().parse().ok()?;
        return Some(n * font_size * 0.5).filter(|v| *v > 0.0);
    }
    parse_length_px(trimmed).filter(|v| *v > 0.0)
}

/// Resolve a `filter=` attribute on a tspan / anchor source element to
/// a list of `FilterInvocation`s. Returns an empty vec when nothing
/// resolves (or the chain is invalid). Reference bbox is the run's
/// `run_bbox` so `objectBoundingBox` filter regions cover the glyphs
/// themselves.
fn resolve_tspan_filter(
    ctx: &PaintCtx<'_>,
    node: &DemoNode,
    run: &[ResolvedGlyph],
    font: &Font,
) -> Vec<super::super::resources::filter::FilterInvocation> {
    use super::scoped_svg_paint_state::MAX_FILTER_DEPTH;

    if ctx.filter_depth >= MAX_FILTER_DEPTH {
        return Vec::new();
    }
    let Some(raw) = get_attr(node, "filter") else {
        return Vec::new();
    };
    let v = raw.trim();
    if v.is_empty() || v.eq_ignore_ascii_case("none") {
        return Vec::new();
    }
    let bbox = run_bbox(run, font);
    let mut failed_invalid = false;
    super::effects::resolve_filter_chain(ctx, node, v, bbox, &mut failed_invalid)
}

/// Resolve a `mask=` attribute on a tspan / anchor source element to a
/// `MaskInvocation`. Returns `None` for missing / `none` / unresolved /
/// cyclic / over-depth references, mirroring the container painter's
/// pre-flight checks. The reference bbox is the run's approximate
/// user-space bbox (`run_bbox`) so `objectBoundingBox` mask units map
/// against the glyphs themselves.
fn resolve_tspan_mask(
    ctx: &PaintCtx<'_>,
    node: &DemoNode,
    run: &[ResolvedGlyph],
    font: &Font,
) -> Option<super::super::resources::masker::MaskInvocation> {
    use super::super::resources::svg_resources::parse_url_ref;
    use super::scoped_svg_paint_state::MAX_MASK_DEPTH;

    if ctx.mask_depth >= MAX_MASK_DEPTH {
        return None;
    }
    let raw = get_attr(node, "mask")?;
    let v = raw.trim();
    if v.is_empty() || v.eq_ignore_ascii_case("none") {
        return None;
    }
    let id = parse_url_ref(v)?;
    let target = ctx.resources.lookup(id)?;
    if let Some(chain) = ctx.mask_chain {
        if chain.contains(target) {
            return None;
        }
    }
    let bbox = run_bbox(run, font);
    let viewport = super::super::layout::viewport::nearest_svg_viewport(ctx, node);
    super::super::resources::masker::resolve(ctx.dom, target, bbox, viewport)
}

/// Build the SkPaint used for the fill draws of a text run. Resolves
/// `fill` to either a solid color or a gradient/pattern shader (via
/// `paint_server::resolve`), respecting `fill-opacity`. Returns
/// `None` for `fill="none"`.
fn build_text_fill_paint(
    ctx: &PaintCtx<'_>,
    node: &DemoNode,
    run: &[ResolvedGlyph],
    font: &Font,
) -> Option<SkPaint> {
    let raw = read_inherited(ctx, node, "fill");
    let value = raw.as_deref().map(str::trim);
    if matches!(value, Some("none")) {
        return None;
    }
    let mut paint = SkPaint::default();
    paint.set_anti_alias(true);
    paint.set_style(PaintStyle::Fill);
    let opacity_factor = read_inherited(ctx, node, "fill-opacity")
        .and_then(|v| parse_opacity(&v))
        .map(|v| v.clamp(0.0, 1.0))
        .unwrap_or(1.0);
    if let Some(v) = value {
        if v.starts_with("url(") {
            // Resolve to gradient/pattern. Use the inferred run
            // bbox from the glyph positions (advance + font height
            // approximation) so `objectBoundingBox` units map
            // against the glyphs' visible extent.
            let bbox = run_bbox(run, font);
            let viewport = crate::htmlcss::svg::layout::viewport::nearest_svg_viewport(ctx, node);
            if let Some(resolved) = super::super::resources::paint_server::resolve(
                ctx.dom,
                ctx.resources,
                v,
                bbox,
                viewport,
            ) {
                use super::super::resources::paint_server::Resolved;
                match resolved {
                    Resolved::Shader(s) => {
                        paint.set_shader(s);
                        if opacity_factor < 1.0 {
                            paint.set_alpha_f(opacity_factor);
                        }
                        return Some(paint);
                    }
                    Resolved::Pattern {
                        node: pid,
                        bbox: pbbox,
                    } => {
                        if let Some(s) =
                            super::super::resources::pattern::build_shader(ctx, pid, pbbox)
                        {
                            paint.set_shader(s);
                            if opacity_factor < 1.0 {
                                paint.set_alpha_f(opacity_factor);
                            }
                            return Some(paint);
                        }
                        // Pattern unresolvable → fall through to
                        // funcIRI fallback (default black, per SVG 2).
                    }
                    _ => {}
                }
            }
            // funcIRI didn't resolve. Per SVG 2 §11.3, the funcIRI
            // syntax permits a trailing fallback color: `fill=
            // "url(#g) red"`. Try parsing the trailing portion.
            if let Some(trail) = crate::htmlcss::svg::resources::paint_server::paint_fallback(v) {
                if let Some(Paint::Color(c)) = crate::htmlcss::svg::dom::attrs::parse_paint(trail) {
                    paint.set_color(c);
                    if opacity_factor < 1.0 {
                        let a = (c.a() as f32 / 255.0) * opacity_factor;
                        paint.set_alpha_f(a);
                    }
                    return Some(paint);
                }
            }
            // Default to black.
            paint.set_color(Color::BLACK);
            if opacity_factor < 1.0 {
                paint.set_alpha_f(opacity_factor);
            }
            return Some(paint);
        }
        // Solid color or currentColor.
        let color = match crate::htmlcss::svg::dom::attrs::parse_paint(v) {
            Some(Paint::Color(c)) => c,
            Some(Paint::CurrentColor) => resolve_current_color(ctx, node),
            _ => Color::BLACK,
        };
        paint.set_color(color);
        if opacity_factor < 1.0 {
            let a = (color.a() as f32 / 255.0) * opacity_factor;
            paint.set_alpha_f(a);
        }
        return Some(paint);
    }
    // No fill attribute set → black.
    paint.set_color(Color::BLACK);
    if opacity_factor < 1.0 {
        paint.set_alpha_f(opacity_factor);
    }
    Some(paint)
}

/// Build the SkPaint used for the stroke draws of a text run. Mirrors
/// `build_text_fill_paint` for the stroke branch — resolves `stroke`
/// to either a solid color or a gradient/pattern shader (via
/// `paint_server::resolve`), respecting `stroke-opacity`. Returns
/// `None` for `stroke="none"`, missing `stroke`, or non-positive
/// `stroke-width`.
fn build_text_stroke_paint(
    ctx: &PaintCtx<'_>,
    node: &DemoNode,
    run: &[ResolvedGlyph],
    font: &Font,
) -> Option<SkPaint> {
    let raw = read_inherited(ctx, node, "stroke")?;
    let v = raw.trim();
    if v.eq_ignore_ascii_case("none") {
        return None;
    }
    let width = read_inherited(ctx, node, "stroke-width")
        .and_then(|v| parse_length_px(&v))
        .unwrap_or(1.0);
    if width <= 0.0 {
        return None;
    }
    let opacity_factor = read_inherited(ctx, node, "stroke-opacity")
        .and_then(|v| parse_opacity(&v))
        .map(|v| v.clamp(0.0, 1.0))
        .unwrap_or(1.0);
    let mut paint = SkPaint::default();
    paint.set_anti_alias(true);
    paint.set_style(PaintStyle::Stroke);
    paint.set_stroke_width(width);

    if v.starts_with("url(") {
        let bbox = run_bbox(run, font);
        let viewport = crate::htmlcss::svg::layout::viewport::nearest_svg_viewport(ctx, node);
        if let Some(resolved) = super::super::resources::paint_server::resolve(
            ctx.dom,
            ctx.resources,
            v,
            bbox,
            viewport,
        ) {
            use super::super::resources::paint_server::Resolved;
            match resolved {
                Resolved::Shader(s) => {
                    paint.set_shader(s);
                    if opacity_factor < 1.0 {
                        paint.set_alpha_f(opacity_factor);
                    }
                    return Some(paint);
                }
                Resolved::Pattern {
                    node: pid,
                    bbox: pbbox,
                } => {
                    if let Some(s) = super::super::resources::pattern::build_shader(ctx, pid, pbbox)
                    {
                        paint.set_shader(s);
                        if opacity_factor < 1.0 {
                            paint.set_alpha_f(opacity_factor);
                        }
                        return Some(paint);
                    }
                }
                _ => {}
            }
        }
        // funcIRI fallback color (SVG 2 §11.3): `stroke="url(#g) red"`.
        if let Some(trail) = crate::htmlcss::svg::resources::paint_server::paint_fallback(v) {
            if let Some(Paint::Color(c)) = crate::htmlcss::svg::dom::attrs::parse_paint(trail) {
                paint.set_color(c);
                let a = (c.a() as f32 / 255.0) * opacity_factor;
                paint.set_alpha_f(a);
                return Some(paint);
            }
        }
        // No fallback resolved → SVG 2 says treat as if the property
        // had its initial value, which for `stroke` is `none`. Don't
        // paint the stroke at all.
        return None;
    }

    let color = match crate::htmlcss::svg::dom::attrs::parse_paint(v)? {
        Paint::Color(c) => c,
        Paint::CurrentColor => resolve_current_color(ctx, node),
        _ => return None,
    };
    paint.set_color(color);
    let a = (color.a() as f32 / 255.0) * opacity_factor;
    paint.set_alpha_f(a);
    Some(paint)
}

/// Approximate user-space bbox of a glyph run for `objectBoundingBox`
/// paint-server / mask reference-box resolution. Uses each glyph's
/// `(x, y, advance)` for the horizontal extent and the font's typo /
/// hhea metrics for the vertical extent so the bbox covers the glyph
/// box (not just the advance-square).
fn run_bbox(run: &[ResolvedGlyph], font: &Font) -> skia_safe::Rect {
    if run.is_empty() {
        return skia_safe::Rect::default();
    }
    let metrics = font.metrics().1;
    // Skia exposes `ascent` as a negative number (above baseline) and
    // `descent` as positive (below). Fall back to 0.8em / 0.2em of the
    // font size when the font doesn't supply usable metrics.
    let size = font.size();
    let ascent_above = if metrics.ascent < 0.0 {
        -metrics.ascent
    } else {
        0.8 * size
    };
    let descent_below = if metrics.descent > 0.0 {
        metrics.descent
    } else {
        0.2 * size
    };
    let mut min_x = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for g in run {
        min_x = min_x.min(g.x);
        max_x = max_x.max(g.x + g.advance);
        min_y = min_y.min(g.y - ascent_above);
        max_y = max_y.max(g.y + descent_below);
    }
    if !min_x.is_finite() {
        return skia_safe::Rect::default();
    }
    skia_safe::Rect::new(min_x, min_y, max_x, max_y)
}

/// Two-phase paint-order: fill / stroke. Text doesn't have markers,
/// so `markers` tokens in `paint-order` collapse to no-op.
#[derive(Clone, Copy, PartialEq, Eq)]
enum TextPhase {
    Fill,
    Stroke,
}

/// Resolve the effective `paint-order` for a text run's source
/// element. CSS Paint Order Level 1 / SVG 2 §11.3: a property with
/// any invalid token is invalid as a whole; otherwise listed phases
/// paint in declared order, missing phases append in canonical
/// order (fill, stroke, markers — markers ignored for text).
fn resolve_text_paint_order(ctx: &PaintCtx<'_>, node: &DemoNode) -> [TextPhase; 2] {
    use crate::htmlcss::svg::style::cascade::cascade_property;
    let raw = cascade_property(
        Some(ctx.dom),
        Some(&ctx.resources.stylesheet),
        node,
        "paint-order",
    );
    let Some(raw) = raw else {
        return [TextPhase::Fill, TextPhase::Stroke];
    };
    let trimmed = raw.trim();
    if trimmed.is_empty()
        || trimmed.eq_ignore_ascii_case("normal")
        || trimmed.eq_ignore_ascii_case("inherit")
        || trimmed.eq_ignore_ascii_case("initial")
        || trimmed.eq_ignore_ascii_case("unset")
    {
        return [TextPhase::Fill, TextPhase::Stroke];
    }
    let mut listed: Vec<TextPhase> = Vec::with_capacity(2);
    let mut seen_invalid = false;
    for tok in trimmed.split_ascii_whitespace() {
        match tok.to_ascii_lowercase().as_str() {
            "fill" => {
                if !listed.contains(&TextPhase::Fill) {
                    listed.push(TextPhase::Fill);
                }
            }
            "stroke" => {
                if !listed.contains(&TextPhase::Stroke) {
                    listed.push(TextPhase::Stroke);
                }
            }
            "markers" => {
                // Valid token, ignored for text (no markers).
            }
            _ => {
                seen_invalid = true;
                break;
            }
        }
    }
    if seen_invalid || listed.is_empty() {
        return [TextPhase::Fill, TextPhase::Stroke];
    }
    for canonical in [TextPhase::Fill, TextPhase::Stroke] {
        if !listed.contains(&canonical) {
            listed.push(canonical);
        }
    }
    [listed[0], listed[1]]
}

/// Walk from `node` up to (but not including) the root `<svg>`,
/// multiplying each ancestor's `opacity`. Matches the way SVG layers
/// compose — a tspan with `opacity=0.5` inside a `<g opacity=0.5>`
/// composites at 0.25. The text root's own opacity is consumed by
/// `paint_root_node` already, so we stop at the `<text>`'s parent
/// (which is the typical traversal scope here).
fn ancestor_group_opacity(ctx: &PaintCtx<'_>, node: &DemoNode) -> f32 {
    let mut acc = super::effects::group_opacity(node);
    let mut current = node.parent;
    while let Some(id) = current {
        let n = ctx.dom.node(id);
        if let DemoNodeData::Element(d) = &n.data {
            let kind = ElementKind::from_local_name(d.name.local.as_ref());
            if kind == ElementKind::Text {
                // Root <text> opacity is applied by the container
                // painter when it dispatched into us; don't double-
                // apply.
                break;
            }
        }
        acc *= super::effects::group_opacity(n);
        current = n.parent;
    }
    acc
}

/// Bitset of which line decorations a `text-decoration` declaration
/// requested. SVG 1.1 / CSS Text Decoration 3 take the same keywords.
#[derive(Debug, Clone, Copy, Default)]
struct DecorationLines {
    underline: bool,
    overline: bool,
    line_through: bool,
}

impl DecorationLines {
    fn any(&self) -> bool {
        self.underline || self.overline || self.line_through
    }
}

/// Parse a CSS / SVG `text-decoration` (or `text-decoration-line`)
/// value. Per CSS Text Decoration 3 §2.2 the value is a
/// **space-separated** list of `none | underline | overline |
/// line-through | blink`. Commas are NOT a valid separator — a value
/// like `"underline,overline"` is syntactically invalid and per CSS
/// Values 4 cascading rules falls back to the initial value (`none`).
/// We ignore `blink` and any unknown tokens (e.g.
/// `text-decoration-color` arguments accidentally passed to the line
/// property).
///
/// Returns `None` for `none` (or only-`none`), for invalid values
/// (commas present), and for empty / whitespace-only input.
fn parse_decoration_lines(s: &str) -> Option<DecorationLines> {
    if s.contains(',') {
        return None;
    }
    let mut lines = DecorationLines::default();
    let mut saw_any = false;
    for token in s.split_ascii_whitespace() {
        let lower = token.to_ascii_lowercase();
        match lower.as_str() {
            "none" => return None,
            "underline" => {
                lines.underline = true;
                saw_any = true;
            }
            "overline" => {
                lines.overline = true;
                saw_any = true;
            }
            "line-through" => {
                lines.line_through = true;
                saw_any = true;
            }
            _ => {}
        }
    }
    if saw_any {
        Some(lines)
    } else {
        None
    }
}

/// Walk `glyphs` and paint each `text-decoration` declaration the
/// glyph's ancestor chain contributes. Per CSS Text Decoration 3
/// §2.5, decorations are painted with the declaring element's own
/// `fill` / `stroke`, applied to a horizontal line spanning the
/// glyphs descended from that element. Painting order is outermost-
/// first so descendant declarations layer on top of ancestors'.
///
/// `text-decoration` is technically not inherited in CSS Text 3, but
/// its visual effect propagates to descendant text boxes — the
/// painter walks each glyph's ancestor chain and paints one line per
/// declaration encountered. Glyphs that share an anchor coalesce into
/// a single rect so the line is continuous across `<tspan>` runs.
fn paint_decorations(
    canvas: &Canvas,
    ctx: &PaintCtx<'_>,
    glyphs: &[ResolvedGlyph],
    font: &Font,
    metrics: &skia_safe::FontMetrics,
) {
    if glyphs.is_empty() {
        return;
    }

    // Per glyph: collect the ordered list of (anchor_id, lines) from
    // root → leaf. Same `(anchor_id, line)` may apply to many glyphs;
    // we coalesce in the next pass.
    //
    // Anchors are deduplicated globally in document order: the first
    // glyph that contributes a given anchor fixes its position in the
    // paint sequence; later glyphs with the same anchor extend the
    // range rather than re-emitting.
    let mut anchor_order: Vec<NodeId> = Vec::new();
    // For each anchor: the lines requested + the glyph indices it covers.
    let mut anchor_data: std::collections::HashMap<NodeId, (DecorationLines, Vec<usize>)> =
        std::collections::HashMap::new();

    for (gi, g) in glyphs.iter().enumerate() {
        if g.hidden {
            continue;
        }
        // Walk root → leaf so outer declarations appear earlier in
        // `anchor_order`. We collect ancestors leaf → root then
        // reverse below.
        let mut chain: Vec<(NodeId, DecorationLines)> = Vec::new();
        let mut cursor = Some(g.source);
        while let Some(id) = cursor {
            let n = ctx.dom.node(id);
            if let Some(raw) = read_local(n, "text-decoration") {
                if let Some(lines) = parse_decoration_lines(&raw) {
                    chain.push((id, lines));
                }
            }
            // SVG 1.1 §10.12: text-decoration accumulates from every
            // ancestor that declares it, up to the outermost <svg>.
            // Blink implements this uniformly via CSS — every element
            // copies the parent's AppliedTextDecorationData and appends
            // its own when text-decoration-line != none. The only stop
            // is "decoration boundary": atomic-inline / float / abspos /
            // outermost <svg> / ruby-text. None of those occur inside
            // an SVG subtree, so we just walk to root.
            // See: third_party/blink/renderer/core/css/resolver/
            //      style_adjuster.cc StopPropagateTextDecorations
            cursor = n.parent;
        }
        chain.reverse();
        for (id, lines) in chain {
            if !anchor_order.contains(&id) {
                anchor_order.push(id);
            }
            let entry = anchor_data
                .entry(id)
                .or_insert((DecorationLines::default(), Vec::new()));
            // Multiple glyphs from the same anchor → same lines; we
            // OR-combine in case the same anchor was encountered with
            // different reads (defensive — should be identical).
            entry.0.underline |= lines.underline;
            entry.0.overline |= lines.overline;
            entry.0.line_through |= lines.line_through;
            entry.1.push(gi);
        }
    }

    // Paint anchors outermost-first. Skia draws in submission order so
    // the last-drawn line wins where they overlap (matches the spec's
    // descendants-on-top expectation).
    for anchor_id in anchor_order {
        let (lines, glyph_indices) = match anchor_data.get(&anchor_id) {
            Some(v) => v,
            None => continue,
        };
        if !lines.any() {
            continue;
        }
        paint_anchor_decoration(
            canvas,
            ctx,
            anchor_id,
            *lines,
            glyph_indices,
            glyphs,
            font,
            metrics,
        );
    }
}

/// Paint one decoration anchor's lines. Coalesces consecutive glyph
/// indices into runs so the line is continuous across glyphs that
/// were emitted contiguously, but breaks when the chunk discontinues
/// (e.g. across explicit `x=` overrides).
#[allow(clippy::too_many_arguments)]
fn paint_anchor_decoration(
    canvas: &Canvas,
    ctx: &PaintCtx<'_>,
    anchor_id: NodeId,
    lines: DecorationLines,
    glyph_indices: &[usize],
    glyphs: &[ResolvedGlyph],
    font: &Font,
    metrics: &skia_safe::FontMetrics,
) {
    let anchor_node = ctx.dom.node(anchor_id);
    // Compute the union bbox of the anchor's covered glyphs in user
    // space. Used as the reference box when fill/stroke is a
    // `url(#…)` reference to an objectBoundingBox-units paint server
    // (gradient or pattern). For userSpaceOnUse the bbox is ignored
    // by the resolver, so a coarse approximation is fine.
    let anchor_bbox = run_bbox(
        &glyph_indices
            .iter()
            .filter_map(|&i| glyphs.get(i).copied())
            .collect::<Vec<_>>(),
        font,
    );
    let (fill_paint, stroke_paint) = decoration_paints(ctx, anchor_node, anchor_bbox);
    if fill_paint.is_none() && stroke_paint.is_none() {
        return;
    }

    // Skia FontMetrics: positions are in screen space (positive y =
    // down), measured from the alphabetic baseline. Underline is
    // typically positive (below); strikeout is typically negative
    // (above). Defaults emulate Blink's
    // `LayoutSVGInlineText::DefaultDecorationPosition`.
    let underline_thickness = metrics.underline_thickness().unwrap_or_else(|| {
        // Reasonable default: 1/15 of the font size.
        font.size() / 15.0
    });
    let underline_position = metrics.underline_position().unwrap_or_else(|| {
        // Default ~10% of font size below the baseline.
        font.size() * 0.1
    });
    let strikeout_thickness = metrics.strikeout_thickness().unwrap_or(underline_thickness);
    let strikeout_position = metrics.strikeout_position().unwrap_or_else(|| {
        // Default ~30% of font size above the baseline.
        -font.size() * 0.3
    });
    // Overline sits at the top of the em box (font ascent), with
    // ~one underline-thickness of air above the cap. CSS Text
    // Decoration 3 §3.2.4 leaves position implementation-defined;
    // Blink/Chromium use the line-box top (approximately
    // `metrics.ascent`), and the resvg-test-suite expecteds match
    // that — placing the bar visually above the cap, not touching
    // it. `ascent` is negative (Skia y-up).
    let overline_position = metrics.ascent;

    // Build coalesced runs: groups of consecutive glyph indices
    // (after sorting and dedup), broken when a glyph's `chunk_id`
    // differs from the previous one in the run (so each anchored
    // chunk gets its own line segment — matches Blink's
    // `SVGInlineFlowBox::Paint` behaviour).
    let mut sorted = glyph_indices.to_vec();
    sorted.sort_unstable();
    sorted.dedup();
    if sorted.is_empty() {
        return;
    }

    let mut run_start = sorted[0];
    let mut prev = sorted[0];
    for &idx in &sorted[1..] {
        // Break the coalesced run whenever the decoration line would
        // need to bend or jump:
        // - non-contiguous glyph indices
        // - chunk / textPath boundary (each chunk anchors independently)
        // - per-glyph `y` (a `<text y="80 90 …">` list pushes each glyph
        //   onto its own baseline; one straight line would skip all but
        //   the first)
        // - any rotated glyph (each rotates around its own origin, so
        //   the underline can't be shared with neighbours even if the
        //   angle matches; we paint per-glyph rotated rects instead)
        let breaks = idx != prev + 1
            || glyphs[idx].chunk_id != glyphs[prev].chunk_id
            || glyphs[idx].text_path_idx != glyphs[prev].text_path_idx
            || glyphs[idx].on_path.is_some()
            || glyphs[prev].on_path.is_some()
            || glyphs[idx].y != glyphs[prev].y
            || glyphs[idx].rotate_deg != 0.0
            || glyphs[prev].rotate_deg != 0.0;
        if breaks {
            paint_decoration_run(
                canvas,
                glyphs,
                run_start,
                prev,
                lines,
                underline_position,
                underline_thickness,
                strikeout_position,
                strikeout_thickness,
                overline_position,
                fill_paint.as_ref(),
                stroke_paint.as_ref(),
            );
            run_start = idx;
        }
        prev = idx;
    }
    paint_decoration_run(
        canvas,
        glyphs,
        run_start,
        prev,
        lines,
        underline_position,
        underline_thickness,
        strikeout_position,
        strikeout_thickness,
        overline_position,
        fill_paint.as_ref(),
        stroke_paint.as_ref(),
    );
}

/// Build the fill + stroke paints for a decoration anchor's lines.
/// Uses the anchor element's `fill` / `stroke` cascade — per CSS
/// Text Decoration 3 §3.1: "the color of text decorations is set
/// initially by the value of the 'color' property at the point where
/// the decoration is declared", and SVG inherits that into `fill`.
///
/// `bbox` is the union of the anchor's covered glyphs in user space,
/// used as the reference box when the fill / stroke is a `url(#…)`
/// reference to a pattern or gradient declared with
/// `*Units="objectBoundingBox"`.
fn decoration_paints(
    ctx: &PaintCtx<'_>,
    node: &DemoNode,
    bbox: Rect,
) -> (Option<SkPaint>, Option<SkPaint>) {
    let fill_paint = build_decoration_paint(ctx, node, bbox, "fill", "fill-opacity", None);
    let stroke_width = read_inherited(ctx, node, "stroke-width")
        .and_then(|v| parse_length_px(&v))
        .unwrap_or(1.0);
    let stroke_paint = if stroke_width <= 0.0 {
        None
    } else {
        build_decoration_paint(
            ctx,
            node,
            bbox,
            "stroke",
            "stroke-opacity",
            Some(stroke_width),
        )
    };
    (fill_paint, stroke_paint)
}

/// Build one decoration paint (either fill or stroke) honoring CSS
/// color, `currentColor`, and `url(#…)` paint-server references. When
/// the fill resolves to a pattern or gradient, the resulting shader
/// gives decoration lines the same fill the text glyphs use, mirroring
/// SVG 1.1 §10.12.1's "fill and stroke of the text decoration".
fn build_decoration_paint(
    ctx: &PaintCtx<'_>,
    node: &DemoNode,
    bbox: Rect,
    paint_attr: &str,
    opacity_attr: &str,
    stroke_width: Option<f32>,
) -> Option<SkPaint> {
    let raw = read_inherited(ctx, node, paint_attr);
    let value = raw.as_deref().map(str::trim);
    if matches!(value, Some("none")) {
        return None;
    }
    let opacity_factor = read_inherited(ctx, node, opacity_attr)
        .and_then(|v| parse_opacity(&v))
        .map(|v| v.clamp(0.0, 1.0))
        .unwrap_or(1.0);
    let mut paint = SkPaint::default();
    paint.set_anti_alias(true);
    if let Some(w) = stroke_width {
        paint.set_style(PaintStyle::Stroke);
        paint.set_stroke_width(w);
    } else {
        paint.set_style(PaintStyle::Fill);
    }
    if let Some(v) = value {
        if v.starts_with("url(") {
            let viewport = crate::htmlcss::svg::layout::viewport::nearest_svg_viewport(ctx, node);
            if let Some(resolved) = super::super::resources::paint_server::resolve(
                ctx.dom,
                ctx.resources,
                v,
                bbox,
                viewport,
            ) {
                use super::super::resources::paint_server::Resolved;
                match resolved {
                    Resolved::Shader(s) => {
                        paint.set_shader(s);
                        if opacity_factor < 1.0 {
                            paint.set_alpha_f(opacity_factor);
                        }
                        return Some(paint);
                    }
                    Resolved::Pattern {
                        node: pid,
                        bbox: pbbox,
                    } => {
                        if let Some(s) =
                            super::super::resources::pattern::build_shader(ctx, pid, pbbox)
                        {
                            paint.set_shader(s);
                            if opacity_factor < 1.0 {
                                paint.set_alpha_f(opacity_factor);
                            }
                            return Some(paint);
                        }
                    }
                    _ => {}
                }
            }
            // funcIRI didn't resolve — try the trailing fallback color
            // (`fill="url(#g) red"`), then default to black per SVG 2.
            if let Some(trail) = crate::htmlcss::svg::resources::paint_server::paint_fallback(v) {
                if let Some(Paint::Color(c)) = crate::htmlcss::svg::dom::attrs::parse_paint(trail) {
                    paint.set_color(c);
                    if opacity_factor < 1.0 {
                        let a = (c.a() as f32 / 255.0) * opacity_factor;
                        paint.set_alpha_f(a);
                    }
                    return Some(paint);
                }
            }
            paint.set_color(Color::BLACK);
            if opacity_factor < 1.0 {
                paint.set_alpha_f(opacity_factor);
            }
            return Some(paint);
        }
        let color = match crate::htmlcss::svg::dom::attrs::parse_paint(v) {
            Some(Paint::Color(c)) => c,
            Some(Paint::CurrentColor) => resolve_current_color(ctx, node),
            Some(Paint::None) => return None,
            _ => Color::BLACK,
        };
        paint.set_color(color);
        if opacity_factor < 1.0 {
            let a = (color.a() as f32 / 255.0) * opacity_factor;
            paint.set_alpha_f(a);
        }
        return Some(paint);
    }
    // Absent attribute: fill defaults to black, stroke defaults to none.
    if stroke_width.is_some() {
        return None;
    }
    paint.set_color(Color::BLACK);
    if opacity_factor < 1.0 {
        paint.set_alpha_f(opacity_factor);
    }
    Some(paint)
}

/// Paint each requested line type for one coalesced glyph run. Lines
/// are filled rectangles (so per-tspan `fill="yellow" stroke="green"`
/// gives a solid yellow bar with a green outline, matching SVG 1.1
/// §10.12.1's "fill and stroke of the text decoration").
#[allow(clippy::too_many_arguments)]
fn paint_decoration_run(
    canvas: &Canvas,
    glyphs: &[ResolvedGlyph],
    start: usize,
    end: usize,
    lines: DecorationLines,
    underline_position: f32,
    underline_thickness: f32,
    strikeout_position: f32,
    strikeout_thickness: f32,
    overline_position: f32,
    fill_paint: Option<&SkPaint>,
    stroke_paint: Option<&SkPaint>,
) {
    // For glyphs on a textPath the line would need to follow the
    // path's tangent — out of scope here. Skip silently.
    if glyphs[start].on_path.is_some() {
        return;
    }
    let x_max = glyphs[end].x + glyphs[end].advance;
    let x_min = glyphs[start].x;
    if x_max <= x_min {
        return;
    }

    // Rotated runs are coalesced to a single glyph by the caller (see
    // `paint_anchor_decoration`). Apply the same translate-rotate the
    // glyph painter uses (`draw_glyphs`), then draw the line in the
    // glyph's local frame so the line rotates with it.
    let rotate_deg = glyphs[start].rotate_deg;
    let baseline_y = glyphs[start].y;

    if rotate_deg.abs() >= 0.001 {
        let restore = canvas.save();
        canvas.translate((glyphs[start].x, baseline_y));
        canvas.rotate(rotate_deg, None);
        let advance = glyphs[start].advance;

        let draw_local = |y_offset: f32, thickness: f32| {
            let half = thickness * 0.5;
            let rect = skia_safe::Rect::from_ltrb(0.0, y_offset - half, advance, y_offset + half);
            if let Some(p) = fill_paint {
                canvas.draw_rect(rect, p);
            }
            if let Some(p) = stroke_paint {
                canvas.draw_rect(rect, p);
            }
        };
        if lines.underline {
            draw_local(underline_position, underline_thickness);
        }
        if lines.line_through {
            draw_local(strikeout_position, strikeout_thickness);
        }
        if lines.overline {
            draw_local(overline_position, underline_thickness);
        }
        canvas.restore_to_count(restore);
        return;
    }

    let draw_line = |y_offset: f32, thickness: f32| {
        // `y_offset` is the line's center relative to the baseline;
        // the rect spans (center − ½ thickness, center + ½ thickness).
        let cy = baseline_y + y_offset;
        let half = thickness * 0.5;
        let rect = skia_safe::Rect::from_ltrb(x_min, cy - half, x_max, cy + half);
        if let Some(p) = fill_paint {
            canvas.draw_rect(rect, p);
        }
        if let Some(p) = stroke_paint {
            canvas.draw_rect(rect, p);
        }
    };

    if lines.underline {
        draw_line(underline_position, underline_thickness);
    }
    if lines.line_through {
        draw_line(strikeout_position, strikeout_thickness);
    }
    if lines.overline {
        // Overline center sits on the cap height; thickness mirrors
        // underline since CSS Text 3 doesn't differentiate.
        draw_line(overline_position, underline_thickness);
    }
}

/// Draw resolved glyphs one at a time. Single-character `draw_str`
/// keeps the code small and supports per-glyph rotation via canvas
/// transform — Skia's `SkTextBlobBuilder::allocRunRSXform` would let us
/// batch these into a single blob, but per-char `draw_str` is fast
/// enough for our short SVG fixtures and avoids the extra plumbing.
/// True when `ch` is a bidi/cursive/complex script character that
/// loses contextual shaping when drawn one codepoint at a time:
/// Arabic (U+0600..U+06FF, U+0750..U+077F, U+08A0..U+08FF), Arabic
/// supplements / presentation forms (U+FB50..U+FDFF, U+FE70..U+FEFF),
/// Hebrew (U+0590..U+05FF), Devanagari + other Indic blocks
/// (U+0900..U+0DFF, U+0F00..U+0FFF). For these scripts a per-char
/// `draw_str` produces isolated forms — joining and reordering need
/// the whole run to be passed to Skia at once.
fn ch_needs_run_shaping(ch: char) -> bool {
    let cp = ch as u32;
    matches!(
        cp,
        0x0590..=0x05FF       // Hebrew
            | 0x0600..=0x06FF // Arabic
            | 0x0700..=0x074F // Syriac
            | 0x0750..=0x077F // Arabic Supplement
            | 0x0780..=0x07BF // Thaana
            | 0x07C0..=0x07FF // NKo
            | 0x0800..=0x083F // Samaritan
            | 0x0840..=0x085F // Mandaic
            | 0x08A0..=0x08FF // Arabic Extended-A
            | 0x0900..=0x0DFF // Devanagari/Bengali/etc.
            | 0x0F00..=0x0FFF // Tibetan
            | 0xFB50..=0xFDFF // Arabic Presentation Forms-A
            | 0xFE70..=0xFEFF // Arabic Presentation Forms-B
    )
}

fn draw_glyphs(canvas: &Canvas, glyphs: &[ResolvedGlyph], font: &Font, paint: &SkPaint) {
    // Lazily-built scaled fonts keyed by exact scale value. Most
    // mixed-size runs use one or two distinct scales (e.g.
    // 48 / 80 from a single nested tspan), so a tiny linear search
    // is cheap.
    let mut scaled_fonts: Vec<(f32, Font)> = Vec::new();
    let mut font_for = |scale: f32, base: &Font| -> Font {
        if (scale - 1.0).abs() <= 0.0001 {
            return base.clone();
        }
        for (s, f) in &scaled_fonts {
            if (s - scale).abs() <= 0.0001 {
                return f.clone();
            }
        }
        let mut f = base.clone();
        f.set_size(base.size() * scale);
        scaled_fonts.push((scale, f.clone()));
        f
    };
    let mut i = 0;
    while i < glyphs.len() {
        let g = &glyphs[i];
        if g.hidden {
            i += 1;
            continue;
        }
        let g_owned;
        let g_font: &Font = if (g.font_size_scale - 1.0).abs() <= 0.0001 {
            font
        } else {
            g_owned = font_for(g.font_size_scale, font);
            &g_owned
        };
        // Bidi / cursive shaping: when a contiguous run of glyphs
        // sits on a simple baseline (no rotate, no textPath, no
        // hidden chars in the middle, no per-char positioning gaps,
        // and a uniform font-size scale) and contains any character
        // that needs run-level shaping (Arabic, Hebrew, Devanagari,
        // etc.), draw the whole run as a single string so Skia's
        // HarfBuzz integration sees the full context. Drawing one
        // codepoint at a time yields isolated forms and breaks Arabic
        // joining + bidi. Break the run on any font-size change.
        let mut j = i + 1;
        let simple = g.on_path.is_none()
            && g.rotate_deg.abs() < 0.001
            && (g.font_size_scale - 1.0).abs() <= 0.0001;
        let mut needs_run = ch_needs_run_shaping(g.ch);
        if simple {
            while j < glyphs.len() {
                let n = &glyphs[j];
                if n.hidden
                    || n.on_path.is_some()
                    || n.rotate_deg.abs() >= 0.001
                    || (n.font_size_scale - 1.0).abs() > 0.0001
                {
                    break;
                }
                if ch_needs_run_shaping(n.ch) {
                    needs_run = true;
                }
                j += 1;
            }
        }
        if simple && needs_run && j > i + 1 {
            let mut s = String::with_capacity((j - i) * 4);
            for run_glyph in &glyphs[i..j] {
                s.push(run_glyph.ch);
            }
            // Anchor at the run's first glyph position. Skia's
            // HarfBuzz shaper produces correct per-glyph offsets
            // (joining + bidi reorder) within that run.
            canvas.draw_str(&s, Point::new(g.x, g.y), g_font, paint);
            i = j;
            continue;
        }
        let mut buf = [0u8; 4];
        let s: &str = g.ch.encode_utf8(&mut buf);
        if let Some(p) = g.on_path {
            // Build the textPath transform per
            // docs/wg/research/chromium/svg/text-on-path.md §"Per-glyph
            // placement formula": `T = translate(P) * rotate(θ + char)
            // * translate(-advance/2, baseline_shift)`. The final
            // translate recenters the glyph (Skia draws from the left)
            // and shifts perpendicular to the tangent.
            let restore = canvas.save();
            canvas.translate((p.point.x, p.point.y));
            canvas.rotate(p.tangent_deg + g.rotate_deg, None);
            canvas.translate((-g.advance / 2.0, p.baseline_shift));
            canvas.draw_str(s, Point::new(0.0, 0.0), g_font, paint);
            canvas.restore_to_count(restore);
        } else if g.rotate_deg.abs() < 0.001 {
            canvas.draw_str(s, Point::new(g.x, g.y), g_font, paint);
        } else {
            let restore = canvas.save();
            canvas.translate((g.x, g.y));
            canvas.rotate(g.rotate_deg, None);
            canvas.draw_str(s, Point::new(0.0, 0.0), g_font, paint);
            canvas.restore_to_count(restore);
        }
        i += 1;
    }
}

/// Build a unioned glyph-outline `Path` for a `<text>` element used as
/// a `<clipPath>` child. Walks the text's descendants, shapes their
/// concatenated content with the text root's font, then unions each
/// glyph's outline (translated to its shaped position + the text's
/// `(x, y)` origin) into a single path. Per SVG 2 §14.3.5 a `<text>`
/// inside `<clipPath>` contributes its rendered glyph geometry to the
/// clip region; this is a coarse mirror that handles single-font
/// runs (the most common shape — variable-weight tspans within one
/// `<clipPath>` would need per-tspan shaping to be exact).
///
/// Returns `None` when the font can't be resolved or the text yields
/// no glyphs.
pub(crate) fn build_text_clip_path(ctx: &PaintCtx<'_>, node: &DemoNode) -> Option<Path> {
    let root_size = resolve_font_size_at(ctx, node).max(0.0);
    if root_size <= 0.0 {
        return None;
    }
    let x0 = get_attr(node, "x").and_then(parse_length_px).unwrap_or(0.0);
    let y0 = get_attr(node, "y").and_then(parse_length_px).unwrap_or(0.0);

    let mut state = ClipPathBuildState {
        cursor_x: x0,
        cursor_y: y0,
        last_was_space: true,
        acc: None,
    };
    walk_text_clip_runs(ctx, node, node, &mut state);
    state.acc
}

/// Per-run shaping state for `build_text_clip_path`. Tracks the running
/// pen position so successive tspan / text-data runs concatenate
/// horizontally, and remembers the last-emitted whitespace status so
/// the XML-default whitespace collapse is honored across run
/// boundaries (matches the painter's collapse rule on flat tspan
/// children).
struct ClipPathBuildState {
    cursor_x: f32,
    cursor_y: f32,
    last_was_space: bool,
    acc: Option<Path>,
}

/// Walk the children of a text root for the clip-path glyph builder.
/// `current_source` is the element whose font / position attrs apply to
/// the current text run — for direct text under `<text>` it's the text
/// root, for text under a tspan it's that tspan. Each tspan with
/// explicit `x` or `y` resets the pen.
fn walk_text_clip_runs(
    ctx: &PaintCtx<'_>,
    text_root: &DemoNode,
    current_source: &DemoNode,
    state: &mut ClipPathBuildState,
) {
    for &cid in &current_source.children {
        let child = ctx.dom.node(cid);
        match &child.data {
            DemoNodeData::Text(s) => {
                emit_clip_run(ctx, text_root, current_source, s, state);
            }
            DemoNodeData::Element(_) => {
                if let Some(x) = get_attr(child, "x").and_then(parse_length_px) {
                    state.cursor_x = x;
                    state.last_was_space = true;
                }
                if let Some(y) = get_attr(child, "y").and_then(parse_length_px) {
                    state.cursor_y = y;
                }
                walk_text_clip_runs(ctx, text_root, child, state);
            }
            _ => {}
        }
    }
}

/// Shape one text-data run with the source element's resolved font,
/// emit each glyph's outline path translated to the running pen
/// position, then advance the pen by the run's total advance.
fn emit_clip_run(
    ctx: &PaintCtx<'_>,
    _text_root: &DemoNode,
    source: &DemoNode,
    raw: &str,
    state: &mut ClipPathBuildState,
) {
    // Whitespace collapse: identical to `collect_text_content`'s
    // logic, but threaded so consecutive runs share state.
    let mut text = String::new();
    for ch in raw.chars() {
        if ch.is_whitespace() {
            if !state.last_was_space {
                text.push(' ');
                state.last_was_space = true;
            }
        } else {
            text.push(ch);
            state.last_was_space = false;
        }
    }
    if text.is_empty() {
        return;
    }
    let font_size = resolve_font_size_at(ctx, source).max(0.0);
    if font_size <= 0.0 {
        return;
    }
    let family = read_inherited(ctx, source, "font-family");
    let style = read_font_style(ctx, source);
    let Some(typeface) = pick_typeface(ctx.fonts, family.as_deref(), style) else {
        return;
    };
    let font = Font::from_typeface(typeface, font_size);
    let (shaped, total) = shaping::shape_text(&text, &font);
    if shaped.is_empty() {
        return;
    }
    for g in &shaped {
        let Some(mut glyph_path) = font.get_path(g.id) else {
            continue;
        };
        if glyph_path.is_empty() {
            continue;
        }
        let m = skia_safe::Matrix::translate((
            state.cursor_x + g.position.x,
            state.cursor_y + g.position.y,
        ));
        glyph_path = glyph_path.with_transform(&m);
        state.acc = Some(match state.acc.take() {
            None => glyph_path,
            Some(prev) => {
                skia_safe::op(&prev, &glyph_path, skia_safe::PathOp::Union).unwrap_or(prev)
            }
        });
    }
    state.cursor_x += total.x;
    state.cursor_y += total.y;
}

/// Resolve a CSS `font-family` list against the host-supplied
/// [`FontResolver`]. Walks the comma-separated list, querying the
/// resolver for each token at the requested style, and falls through
/// to [`FontResolver::fallback`] on a full miss.
///
/// Quote/comma handling here is intentionally minimal: tokens are
/// split on `,` and then trimmed of one pair of surrounding `"` or
/// `'`. Quoted family names containing commas are not supported — no
/// resvg-test-suite fixture exercises that, and a real CSS list parser
/// is deferred until one does.
fn pick_typeface(
    resolver: &dyn FontResolver,
    list: Option<&str>,
    style: FontStyle,
) -> Option<Typeface> {
    if let Some(list) = list {
        for raw in list.split(',') {
            let name = raw.trim().trim_matches(|c| c == '"' || c == '\'');
            if name.is_empty() {
                continue;
            }
            if let Some(tf) = resolver.resolve(name, style) {
                return Some(tf);
            }
        }
    }
    resolver.fallback(style)
}

/// Decomposed CSS `font` shorthand. Per CSS Fonts L4 §3.10:
/// `font: [ <style> || <variant> || <weight> || <stretch> ]?
///        <size> [ / <line-height> ]? <family>`.
/// Variant is parsed but not surfaced (we don't track small-caps yet).
#[derive(Default, Debug, Clone)]
struct FontShorthand {
    style: Option<String>,
    weight: Option<String>,
    stretch: Option<String>,
    size: Option<String>,
    family: Option<String>,
}

/// Parse the `font` shorthand into its sub-properties. Best-effort —
/// recognized keywords classify into style/weight/stretch; the first
/// length-or-keyword that resolves as a `<font-size>` becomes the size;
/// everything after it is the family. Returns `None` if no size is
/// detected (the shorthand is invalid without one).
fn parse_font_shorthand(value: &str) -> Option<FontShorthand> {
    // Tokenize: split on whitespace and commas, but keep quoted strings
    // (single or double) as single tokens. Family names can contain
    // multiple words ("Noto Sans") and commas separate alternates.
    let mut tokens: Vec<String> = Vec::new();
    let mut buf = String::new();
    let mut in_quote: Option<char> = None;
    for ch in value.chars() {
        match in_quote {
            Some(q) => {
                if ch == q {
                    in_quote = None;
                    if !buf.is_empty() {
                        tokens.push(std::mem::take(&mut buf));
                    }
                } else {
                    buf.push(ch);
                }
            }
            None => {
                if ch == '"' || ch == '\'' {
                    in_quote = Some(ch);
                    if !buf.is_empty() {
                        tokens.push(std::mem::take(&mut buf));
                    }
                } else if ch.is_whitespace() {
                    if !buf.is_empty() {
                        tokens.push(std::mem::take(&mut buf));
                    }
                } else {
                    buf.push(ch);
                }
            }
        }
    }
    if !buf.is_empty() {
        tokens.push(buf);
    }
    if tokens.is_empty() {
        return None;
    }

    let mut out = FontShorthand::default();
    let mut i = 0usize;

    fn is_style(t: &str) -> bool {
        matches!(t, "italic" | "oblique")
    }
    fn is_variant(t: &str) -> bool {
        matches!(t, "small-caps")
    }
    fn is_weight_keyword(t: &str) -> bool {
        matches!(t, "bold" | "bolder" | "lighter")
    }
    fn is_weight_numeric(t: &str) -> bool {
        // CSS Fonts 4: weight is one of 100..=900 typically, but the
        // shorthand also allows 1..=1000. Distinguish from <font-size>:
        // a bare integer in [1..=1000] without a unit is a weight; a
        // bare integer outside that range or with a unit is a size.
        if let Ok(n) = t.parse::<u32>() {
            (1..=1000).contains(&n)
        } else {
            false
        }
    }
    fn is_stretch(t: &str) -> bool {
        matches!(
            t,
            "ultra-condensed"
                | "extra-condensed"
                | "condensed"
                | "semi-condensed"
                | "semi-expanded"
                | "expanded"
                | "extra-expanded"
                | "ultra-expanded"
        )
    }
    fn is_size_keyword(t: &str) -> bool {
        matches!(
            t,
            "xx-small"
                | "x-small"
                | "small"
                | "medium"
                | "large"
                | "x-large"
                | "xx-large"
                | "smaller"
                | "larger"
        )
    }
    fn is_size_length(t: &str) -> bool {
        // `<length>` or `<percentage>` — has a unit suffix or %
        let lower = t.to_ascii_lowercase();
        [
            "px", "em", "ex", "rem", "pt", "pc", "in", "cm", "mm", "q", "ch",
        ]
        .iter()
        .any(|u| lower.ends_with(u))
            || t.ends_with('%')
            || parse_length_px(t).is_some() // bare number
    }

    // Phase 1: optional style/variant/weight/stretch (any order, max 4).
    let mut consumed_keywords = 0;
    while i < tokens.len() && consumed_keywords < 4 {
        let t = tokens[i].to_ascii_lowercase();
        if is_style(&t) {
            out.style = Some(tokens[i].clone());
        } else if is_variant(&t) {
            // Recognized but not used.
        } else if is_weight_keyword(&t) || is_weight_numeric(&t) {
            // A bare integer here might also be the size if it's
            // outside 1..=1000 — `is_weight_numeric` already gated on
            // that. But "200" is ambiguous: weight 200 vs size 200.
            // Heuristic: if a length-style size token appears later,
            // treat the bare integer as weight. To handle both
            // fixtures we exploit lookahead — peek for a size token.
            let later = tokens
                .iter()
                .skip(i + 1)
                .any(|t2| is_size_keyword(&t2.to_ascii_lowercase()) || is_size_length(t2));
            if later {
                out.weight = Some(tokens[i].clone());
            } else {
                break; // treat as size
            }
        } else if is_stretch(&t) {
            out.stretch = Some(tokens[i].clone());
        } else if t == "normal" {
            // Ambiguous; consume and ignore.
        } else {
            break;
        }
        i += 1;
        consumed_keywords += 1;
    }

    // Phase 2: required size token. Accept either a size keyword
    // ("xx-small" .. "larger") or a <length>/<percentage>/bare number.
    if i >= tokens.len() {
        return None;
    }
    let size_tok = &tokens[i];
    let size_lower = size_tok.to_ascii_lowercase();
    if is_size_keyword(&size_lower) || is_size_length(size_tok) {
        out.size = Some(size_tok.clone());
        i += 1;
    } else {
        return None;
    }

    // Phase 3: optional / line-height, then family. Family can have
    // multiple tokens or comma-separated alternates; we join with " ".
    if i < tokens.len() && tokens[i] == "/" {
        i += 2; // skip "/" and the line-height value
    } else if i < tokens.len() && tokens[i].starts_with('/') {
        // attached form like `/1.2`
        i += 1;
    }
    if i < tokens.len() {
        out.family = Some(tokens[i..].join(" "));
    }

    Some(out)
}

/// Read a font-* sub-property locally (attribute or inline `style`),
/// falling back to extraction from a local `font` shorthand. Per
/// CSS Fonts 4 §3.10 the `font` shorthand resets every sub-property
/// it doesn't mention to its initial value, so a parsed shorthand
/// shadows ancestor longhands even when the requested sub-property
/// wasn't named — without this, `style="font: 50px sans"` lets a
/// parent `font-weight: bold` leak through.
fn read_local_font(node: &DemoNode, prop: &str) -> Option<String> {
    if let Some(v) = read_local(node, prop) {
        return Some(v);
    }
    // Per CSS Fonts 4 §3.10 the `font` shorthand also resets font-
    // variant, font-kerning, font-size-adjust, font-feature-settings,
    // font-language-override, font-optical-sizing, font-variation-
    // settings, line-height — even though it doesn't accept tokens
    // for them. Sub-properties that *can* appear in the shorthand
    // grammar are returned from the parsed result; other shorthand-
    // resettable properties resolve to their initial value so the
    // cascade short-circuits at this node.
    let parsed_in_shorthand = matches!(
        prop,
        "font-style" | "font-weight" | "font-stretch" | "font-size" | "font-family"
    );
    let reset_only = matches!(
        prop,
        "font-variant" | "font-kerning" | "font-size-adjust" | "line-height"
    );
    if !parsed_in_shorthand && !reset_only {
        return None;
    }
    let raw = read_local(node, "font")?;
    let parts = parse_font_shorthand(&raw)?;
    if parsed_in_shorthand {
        let from_shorthand = match prop {
            "font-style" => parts.style,
            "font-weight" => parts.weight,
            "font-stretch" => parts.stretch,
            "font-size" => parts.size,
            "font-family" => parts.family,
            _ => None,
        };
        if from_shorthand.is_some() {
            return from_shorthand;
        }
    }
    // Sub-property not present in the shorthand → return its initial
    // value so the cascade stops here. `font-size` and `font-family`
    // are required by the CSS Fonts grammar; if the shorthand parsed
    // without them something is broken upstream — we shouldn't have
    // gotten this far. Everything else (style/weight/stretch/variant/
    // kerning/size-adjust/line-height) resets to "normal".
    match prop {
        "font-style" | "font-weight" | "font-stretch" | "font-variant" | "font-kerning"
        | "font-size-adjust" | "line-height" => Some("normal".to_string()),
        _ => None,
    }
}

fn read_local(node: &DemoNode, name: &str) -> Option<String> {
    if let Some(v) = get_attr(node, name) {
        return Some(v.to_string());
    }
    read_local_style_only(node, name)
}

/// Like [`read_local`] but ignores the bare attribute — only reads
/// from `style="…"`. Used for non-presentation CSS properties like
/// `font-kerning` that SVG 2 specifies as not-an-attribute.
fn read_local_style_only(node: &DemoNode, name: &str) -> Option<String> {
    let style = get_attr(node, "style")?;
    for decl in style.split(';') {
        if let Some((k, v)) = decl.split_once(':') {
            if k.trim().eq_ignore_ascii_case(name) {
                return Some(v.trim().to_string());
            }
        }
    }
    None
}

/// Walk the ancestor chain reading a non-presentation CSS property
/// from `style="…"` only. Mirrors [`read_inherited`]'s `inherit`
/// keyword handling but skips the bare-attribute hop.
fn inherited_style_only(ctx: &PaintCtx<'_>, node: &DemoNode, name: &str) -> Option<String> {
    fn is_skip(v: &str) -> bool {
        matches!(
            v.trim().to_ascii_lowercase().as_str(),
            "inherit" | "initial" | "unset" | "revert"
        )
    }
    // Per CSS Fonts 4 §3.10 a `font:` shorthand resets several
    // longhands the grammar doesn't accept tokens for (font-kerning,
    // font-variant, font-size-adjust, line-height) — so a parent's
    // `font-kerning: none` should NOT leak through a node whose
    // `style` contains `font: ...`. Treat the shorthand as a
    // cascade barrier for those longhands.
    let shorthand_reset = matches!(
        name,
        "font-kerning" | "font-variant" | "font-size-adjust" | "line-height"
    );
    let has_font_shorthand = |n: &DemoNode| read_local_style_only(n, "font").is_some();
    if let Some(v) = read_local_style_only(node, name) {
        if !is_skip(&v) {
            return Some(v);
        }
    }
    if shorthand_reset && has_font_shorthand(node) {
        return Some("normal".to_string());
    }
    let mut current = node.parent;
    while let Some(id) = current {
        let n = ctx.dom.node(id);
        if let Some(v) = read_local_style_only(n, name) {
            if !is_skip(&v) {
                return Some(v);
            }
        }
        if shorthand_reset && has_font_shorthand(n) {
            return Some("normal".to_string());
        }
        current = n.parent;
    }
    for use_id in super::scoped_svg_paint_state::use_chain_iter(ctx.use_chain) {
        let n = ctx.dom.node(use_id);
        if let Some(v) = read_local_style_only(n, name) {
            if !is_skip(&v) {
                return Some(v);
            }
        }
    }
    None
}

/// Read a CSS-inheritable property by walking the ancestor chain.
/// Used for `font-family`, `font-size`, `fill`, `text-anchor`, etc.
/// — properties SVG inherits per spec, often set on `<svg>` or `<g>`
/// rather than the `<text>` element itself.
///
/// When painting a `<use>` instance, the use's own attributes also
/// participate in inheritance (Blink's "use shadow tree"), even though
/// the cloned subtree's DOM parent is wherever it lives in `<defs>`.
/// `ctx.use_chain` is the stack of `<use>` elements to consult,
/// innermost first.
fn read_inherited(ctx: &PaintCtx<'_>, node: &DemoNode, name: &str) -> Option<String> {
    /// CSS-wide keywords that don't carry information at this level —
    /// the cascade should continue walking. `inherit` explicitly asks
    /// for the parent's value; `initial`/`unset` (without a registered
    /// custom property) collapse to the property's initial value, but
    /// since we don't track per-property defaults at this layer we
    /// approximate by continuing the walk and letting the caller's
    /// final fallback (e.g. `Alphabetic` for dominant-baseline)
    /// supply the initial.
    fn is_skip_keyword(v: &str) -> bool {
        matches!(
            v.trim().to_ascii_lowercase().as_str(),
            "inherit" | "initial" | "unset" | "revert"
        )
    }
    if let Some(v) = read_local_font(node, name) {
        if !is_skip_keyword(&v) {
            return Some(v);
        }
    }
    // SVG 2 §5.6.4: when rendering through a `<use>`, the source-DOM
    // parent of the cloned target is NOT in the cascade — the use
    // shadow tree's effective parent of `target_id` is the `<use>`
    // element itself. Bound the source-DOM walk at `target_id`, then
    // continue from the use chain. Mirrors the fix already applied to
    // `inherited_paint` in svg_shape_painter.
    let boundary = ctx.use_chain.map(|f| f.target_id);
    let mut current = node.parent;
    if let Some(target) = boundary {
        let mut p = current;
        let mut descends = false;
        while let Some(id) = p {
            if id == target {
                descends = true;
                break;
            }
            p = ctx.dom.node(id).parent;
        }
        if !descends {
            current = None;
        }
    }
    while let Some(id) = current {
        let n = ctx.dom.node(id);
        if let Some(v) = read_local_font(n, name) {
            if !is_skip_keyword(&v) {
                return Some(v);
            }
        }
        if Some(id) == boundary {
            break;
        }
        current = n.parent;
    }
    for use_id in crate::htmlcss::svg::paint::scoped_svg_paint_state::use_chain_iter(ctx.use_chain)
    {
        let mut current = Some(use_id);
        while let Some(id) = current {
            let n = ctx.dom.node(id);
            if let Some(v) = read_local_font(n, name) {
                if !is_skip_keyword(&v) {
                    return Some(v);
                }
            }
            current = n.parent;
        }
    }
    None
}

/// Resolve `font-size` for `node` with proper ancestor cascade.
///
/// Walks the ancestor chain collecting raw `font-size` declarations,
/// then resolves outermost-to-innermost so each `em`/`ex`/`%`/`smaller`
/// /`larger` is computed against the parent's resolved size. Initial
/// value is CSS's `medium` = 16px (CSS Fonts 4 §3.3).
/// Walk the subtree rooted at `node` (DFS) and return the first
/// descendant whose resolved `font-size` is strictly positive. Used
/// only as a fallback when the text root itself resolves to zero —
/// without this a `<text font-size="0"><tspan font-size="40">…</tspan></text>`
/// would short-circuit on the root and skip the visible tspan.
fn first_nonzero_descendant_font_size(ctx: &PaintCtx<'_>, node: &DemoNode) -> Option<f32> {
    for &cid in &node.children {
        let child = ctx.dom.node(cid);
        if matches!(child.data, DemoNodeData::Element(_)) {
            let s = resolve_font_size_at(ctx, child).max(0.0);
            if s > 0.0 {
                return Some(s);
            }
            if let Some(s) = first_nonzero_descendant_font_size(ctx, child) {
                return Some(s);
            }
        }
    }
    None
}

fn resolve_font_size_at(ctx: &PaintCtx<'_>, node: &DemoNode) -> f32 {
    let mut chain: Vec<String> = Vec::new();
    if let Some(v) = read_local_font(node, "font-size") {
        chain.push(v);
    }
    // Bound the source-DOM walk at the innermost `<use>` target — the
    // cloned subtree's effective parent is the `<use>`, not the
    // target's source-DOM parent (SVG 2 §5.6.4). Same shape as
    // `read_inherited` above.
    let boundary = ctx.use_chain.map(|f| f.target_id);
    let mut cur = node.parent;
    if let Some(target) = boundary {
        let mut p = cur;
        let mut descends = false;
        while let Some(id) = p {
            if id == target {
                descends = true;
                break;
            }
            p = ctx.dom.node(id).parent;
        }
        if !descends {
            cur = None;
        }
    }
    while let Some(id) = cur {
        let n = ctx.dom.node(id);
        if let Some(v) = read_local_font(n, "font-size") {
            chain.push(v);
        }
        if Some(id) == boundary {
            break;
        }
        cur = n.parent;
    }
    for use_id in crate::htmlcss::svg::paint::scoped_svg_paint_state::use_chain_iter(ctx.use_chain)
    {
        let mut cur = Some(use_id);
        while let Some(id) = cur {
            let n = ctx.dom.node(id);
            if let Some(v) = read_local_font(n, "font-size") {
                chain.push(v);
            }
            cur = n.parent;
        }
    }
    chain.reverse(); // root → leaf
    let mut size = 16.0_f32;
    for v in chain {
        // Don't short-circuit on parent==0 — a child's absolute
        // font-size (e.g. `40`) should override regardless. Only
        // relative units (em/%) would propagate 0 multiplicatively,
        // and that's the correct behavior for those.
        size = resolve_font_size_step(&v, size).max(0.0);
    }
    size
}

/// Apply a single CSS `font-size` declaration against the parent's
/// resolved size. Supports lengths (`px`/`em`/`ex`/`%`/etc.), CSS
/// absolute keywords, and `smaller`/`larger`. Unknown / unparseable
/// values inherit the parent.
fn resolve_font_size_step(value: &str, parent: f32) -> f32 {
    let v = value.trim();
    match v {
        "" | "medium" | "initial" | "inherit" | "unset" => return parent.max(16.0),
        "xx-small" => return 9.0,
        "x-small" => return 10.0,
        "small" => return 13.0,
        "large" => return 18.0,
        "x-large" => return 24.0,
        "xx-large" => return 32.0,
        "smaller" => return parent / 1.2,
        "larger" => return parent * 1.2,
        _ => {}
    }
    if let Some(pct) = v.strip_suffix('%') {
        return pct
            .trim()
            .parse::<f32>()
            .ok()
            .map(|n| (n / 100.0) * parent)
            .unwrap_or(parent);
    }
    if let Some(num) = v.strip_suffix("em").or_else(|| v.strip_suffix("EM")) {
        return num
            .trim()
            .parse::<f32>()
            .ok()
            .map(|n| n * parent)
            .unwrap_or(parent);
    }
    if let Some(num) = v.strip_suffix("ex").or_else(|| v.strip_suffix("EX")) {
        // CSS Values 4 §6.1: ex unit ≈ x-height. Without metrics here
        // we approximate as 0.5em — Blink's fallback when the font
        // doesn't expose `xHeight` (`Length::Em` * 0.5).
        return num
            .trim()
            .parse::<f32>()
            .ok()
            .map(|n| n * parent * 0.5)
            .unwrap_or(parent);
    }
    if let Some(num) = v.strip_suffix("rem") {
        // No CSS root context here; treat as multiples of CSS initial 16px.
        return num
            .trim()
            .parse::<f32>()
            .ok()
            .map(|n| n * 16.0)
            .unwrap_or(parent);
    }
    parse_length_px(v).unwrap_or(parent)
}

fn parse_opacity(s: &str) -> Option<f32> {
    let s = s.trim();
    if let Some(p) = s.strip_suffix('%') {
        p.trim().parse::<f32>().ok().map(|v| v / 100.0)
    } else {
        s.parse::<f32>().ok()
    }
}

/// Compute the cascaded Skia [`FontStyle`] for `node` from CSS
/// `font-style`, `font-weight`, and `font-stretch`. Each property is
/// resolved per CSS Fonts 4 against the inherited cascade (relative
/// keywords like `bolder` / `lighter` consult the running parent
/// weight, per §3.2.4 Table 4).
fn read_font_style(ctx: &PaintCtx<'_>, node: &DemoNode) -> FontStyle {
    let weight = compute_font_weight(ctx, node);
    let width = read_inherited(ctx, node, "font-stretch")
        .as_deref()
        .and_then(parse_font_stretch)
        .unwrap_or(skia_safe::font_style::Width::NORMAL);
    let slant = read_inherited(ctx, node, "font-style")
        .as_deref()
        .map(parse_font_slant)
        .unwrap_or(skia_safe::font_style::Slant::Upright);
    FontStyle::new(skia_safe::font_style::Weight::from(weight), width, slant)
}

/// Parse a CSS `font-style` value to a Skia slant. Per CSS Fonts 4
/// §3.2.1: `normal` → upright; `italic` → italic; `oblique` (with or
/// without a trailing `<angle>`) → italic. Skia exposes a separate
/// `Oblique` slant but most font files only ship Italic faces, so we
/// fold both onto the same slant — the resolver's `match_family_style`
/// picks whatever the font set has.
fn parse_font_slant(s: &str) -> skia_safe::font_style::Slant {
    let trimmed = s.trim().to_ascii_lowercase();
    let head = trimmed.split_whitespace().next().unwrap_or("");
    match head {
        "italic" | "oblique" => skia_safe::font_style::Slant::Italic,
        _ => skia_safe::font_style::Slant::Upright,
    }
}

/// Parse a CSS `font-stretch` keyword to a Skia [`Width`]. Per CSS
/// Fonts 4 §3.2.2 the keywords map 1:1 to the nine width slots. The
/// percentage form is not supported — no resvg-test-suite fixture
/// uses it; deferred until one does.
///
/// [`Width`]: skia_safe::font_style::Width
fn parse_font_stretch(s: &str) -> Option<skia_safe::font_style::Width> {
    use skia_safe::font_style::Width;
    match s.trim().to_ascii_lowercase().as_str() {
        "ultra-condensed" => Some(Width::ULTRA_CONDENSED),
        "extra-condensed" => Some(Width::EXTRA_CONDENSED),
        "condensed" => Some(Width::CONDENSED),
        "semi-condensed" => Some(Width::SEMI_CONDENSED),
        "normal" => Some(Width::NORMAL),
        "semi-expanded" => Some(Width::SEMI_EXPANDED),
        "expanded" => Some(Width::EXPANDED),
        "extra-expanded" => Some(Width::EXTRA_EXPANDED),
        "ultra-expanded" => Some(Width::ULTRA_EXPANDED),
        // SVG 1.1 §10.10 legacy keywords: relative from inherited.
        // Without inherited context here we approximate: from default
        // `normal`, `narrower` → semi-condensed, `wider` → semi-expanded.
        // This matches Blink's fallback when the parent is at default.
        "narrower" => Some(Width::SEMI_CONDENSED),
        "wider" => Some(Width::SEMI_EXPANDED),
        _ => None,
    }
}

/// Resolve `font-weight` for `node` per CSS Fonts 4 §3.2.4. Walks the
/// ancestor chain root → leaf, applying each `font-weight` declaration
/// against the running inherited value. `bolder` / `lighter` consult
/// the per-CSS-Fonts-4 Table 4 to pick a fixed step.
fn compute_font_weight(ctx: &PaintCtx<'_>, node: &DemoNode) -> i32 {
    // Collect the chain of font-weight declarations leaf → root, then
    // apply them root → leaf so each `bolder`/`lighter` resolves
    // against the correct inherited weight.
    let mut chain: Vec<String> = Vec::new();
    if let Some(v) = read_local_font(node, "font-weight") {
        chain.push(v);
    }
    let mut current = node.parent;
    while let Some(id) = current {
        let n = ctx.dom.node(id);
        if let Some(v) = read_local_font(n, "font-weight") {
            chain.push(v);
        }
        current = n.parent;
    }
    let mut weight: i32 = 400;
    for raw in chain.iter().rev() {
        weight = resolve_font_weight_token(raw, weight);
    }
    weight
}

/// Resolve one `font-weight` token against `inherited`. Per CSS Fonts
/// 4 §3.2.4: `normal` = 400, `bold` = 700, numeric values clamp to
/// 1..=1000, `bolder` / `lighter` follow the relative-weight table.
fn resolve_font_weight_token(token: &str, inherited: i32) -> i32 {
    let s = token.trim().to_ascii_lowercase();
    match s.as_str() {
        "normal" => 400,
        "bold" => 700,
        "bolder" => bolder_step(inherited),
        "lighter" => lighter_step(inherited),
        _ => match s.parse::<f32>() {
            // CSS Fonts 4 §3.2.4: numeric weights must be in [1, 1000].
            // Out-of-range values are invalid declarations; the cascade
            // falls back to the inherited value rather than clamping
            // (Blink: `CSSPropertyParserHelpers::ConsumeFontWeightNumber`
            // returns `nullptr` on out-of-range, which triggers the
            // initial-value fallback at the cascade layer).
            Ok(v) if (1.0..=1000.0).contains(&v) => v.round() as i32,
            _ => inherited,
        },
    }
}

/// CSS Fonts 4 §3.2.4 Table 4: `bolder` step.
fn bolder_step(inherited: i32) -> i32 {
    if inherited <= 349 {
        400
    } else if inherited <= 549 {
        700
    } else {
        900
    }
}

/// CSS Fonts 4 §3.2.4 Table 4: `lighter` step. For inherited <100,
/// the spec keeps the value unchanged (already lightest); we follow
/// that literally.
fn lighter_step(inherited: i32) -> i32 {
    if inherited <= 99 {
        inherited
    } else if inherited <= 549 {
        100
    } else if inherited <= 749 {
        400
    } else {
        700
    }
}

fn resolve_current_color(ctx: &PaintCtx<'_>, node: &DemoNode) -> Color {
    fn read(node: &DemoNode) -> Option<Color> {
        if let Some(raw) = get_attr(node, "color") {
            if let Some(c) = parse_color(raw.trim()) {
                return Some(c);
            }
        }
        None
    }
    if let Some(c) = read(node) {
        return c;
    }
    let mut current = node.parent;
    while let Some(id) = current {
        let n = ctx.dom.node(id);
        if let Some(c) = read(n) {
            return c;
        }
        current = n.parent;
    }
    Color::BLACK
}

#[cfg(test)]
mod tests {
    //! Unit tests for the CSS Fonts 4 conformance corners exercised
    //! by the resvg-test-suite. Each test pins one rule from the spec
    //! the painter relies on.

    use super::*;

    #[test]
    fn font_slant_keywords() {
        use skia_safe::font_style::Slant;
        // CSS Fonts 4 §3.2.1: italic and oblique both produce a sloped
        // face; we collapse onto Skia's `Italic` slant since most font
        // files only ship Italic faces.
        assert_eq!(parse_font_slant("italic"), Slant::Italic);
        assert_eq!(parse_font_slant("oblique"), Slant::Italic);
        // `oblique` may carry a trailing <angle>; the angle is
        // informational and must not affect slant selection.
        assert_eq!(parse_font_slant("oblique 14deg"), Slant::Italic);
        assert_eq!(parse_font_slant("normal"), Slant::Upright);
        // Unknown values fall back to upright.
        assert_eq!(parse_font_slant("inherit"), Slant::Upright);
        // Case-insensitive per CSS Fonts 4 §1.5.
        assert_eq!(parse_font_slant("ITALIC"), Slant::Italic);
    }

    #[test]
    fn font_stretch_keywords() {
        use skia_safe::font_style::Width;
        // CSS Fonts 4 §3.2.2: nine keywords, mapped 1:1 to Skia widths.
        assert_eq!(
            parse_font_stretch("ultra-condensed"),
            Some(Width::ULTRA_CONDENSED)
        );
        assert_eq!(parse_font_stretch("condensed"), Some(Width::CONDENSED));
        assert_eq!(parse_font_stretch("normal"), Some(Width::NORMAL));
        assert_eq!(parse_font_stretch("expanded"), Some(Width::EXPANDED));
        assert_eq!(
            parse_font_stretch("ultra-expanded"),
            Some(Width::ULTRA_EXPANDED)
        );
        // Case-insensitive.
        assert_eq!(parse_font_stretch("CONDENSED"), Some(Width::CONDENSED));
        // Percentage form intentionally not supported in v1 — confirm
        // we return None so the caller falls back to NORMAL.
        assert_eq!(parse_font_stretch("87.5%"), None);
        // Unknown keyword → None.
        assert_eq!(parse_font_stretch("squashed"), None);
    }

    #[test]
    fn font_weight_named_and_numeric() {
        // CSS Fonts 4 §3.2.4: named keywords and the 1..=1000 numeric
        // range. In-range absolute values resolve to themselves.
        assert_eq!(resolve_font_weight_token("normal", 400), 400);
        assert_eq!(resolve_font_weight_token("bold", 400), 700);
        assert_eq!(resolve_font_weight_token("100", 400), 100);
        assert_eq!(resolve_font_weight_token("700", 400), 700);
        // Out-of-range numeric values are invalid declarations per
        // CSS Fonts 4 §3.2.4 (Blink:
        // `ConsumeFontWeightNumber` returns nullptr → cascade falls
        // back to the inherited value). We mirror that — `inherited`
        // is returned, not a clamp to 1/1000.
        assert_eq!(resolve_font_weight_token("0", 400), 400);
        assert_eq!(resolve_font_weight_token("1500", 400), 400);
        assert_eq!(resolve_font_weight_token("0", 700), 700);
        // Non-numeric, non-keyword falls back to the inherited value
        // for the same reason.
        assert_eq!(resolve_font_weight_token("heavy", 400), 400);
        // Case-insensitive named keywords.
        assert_eq!(resolve_font_weight_token("BOLD", 400), 700);
    }

    #[test]
    fn font_weight_bolder_table() {
        // CSS Fonts 4 §3.2.4 Table 4 — `bolder` against the
        // inherited weight.
        assert_eq!(resolve_font_weight_token("bolder", 50), 400);
        assert_eq!(resolve_font_weight_token("bolder", 100), 400);
        assert_eq!(resolve_font_weight_token("bolder", 349), 400);
        assert_eq!(resolve_font_weight_token("bolder", 350), 700);
        assert_eq!(resolve_font_weight_token("bolder", 549), 700);
        assert_eq!(resolve_font_weight_token("bolder", 550), 900);
        assert_eq!(resolve_font_weight_token("bolder", 1000), 900);
    }

    #[test]
    fn font_weight_lighter_table() {
        // CSS Fonts 4 §3.2.4 Table 4 — `lighter` against the
        // inherited weight. For inherited <100 the spec keeps the
        // value unchanged ("already lightest").
        assert_eq!(resolve_font_weight_token("lighter", 50), 50);
        assert_eq!(resolve_font_weight_token("lighter", 99), 99);
        assert_eq!(resolve_font_weight_token("lighter", 100), 100);
        assert_eq!(resolve_font_weight_token("lighter", 549), 100);
        assert_eq!(resolve_font_weight_token("lighter", 550), 400);
        assert_eq!(resolve_font_weight_token("lighter", 749), 400);
        assert_eq!(resolve_font_weight_token("lighter", 750), 700);
        assert_eq!(resolve_font_weight_token("lighter", 1000), 700);
    }
}
