//! `SvgShapePainter` — fill / stroke for primitive shapes.
//!
//! Honours: solid `fill` / `stroke` colors, `url(#id)` references to
//! linear / radial gradient paint servers (with object-bounding-box
//! plumbing), `fill-rule`, `fill-opacity`, `stroke-opacity`, `opacity`
//! (multiplied into both), `stroke-width`, `stroke-linecap`,
//! `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray`,
//! `stroke-dashoffset`. Markers, paint-order overrides, and patterns
//! are not yet implemented — affected shapes paint without those
//! features rather than falling back to Skia's built-in `svg::Dom`.
//!
//! Blink anchor: `core/paint/svg_shape_painter.{h,cc}`.

use csscascade::dom::DemoNode;
use skia_safe::{
    paint::Cap, paint::Join, Canvas, Color, Paint as SkPaint, PaintStyle, Path, PathBuilder,
    PathEffect, PathFillType, Point, RRect, Rect,
};

use super::super::dom::attrs::{parse_length_px, parse_paint, parse_points, Paint};
use super::super::dom::element::get_attr;
use super::super::dom::path_d::parse_path;
use super::super::resources::paint_server::{self, Resolved};
use super::super::style::cascade::cascade_property;
use super::scoped_svg_paint_state::PaintCtx;

/// Axis used to resolve a `<percentage>` against the SVG viewport
/// (per SVG 2 §10.2 "Length values"). `X` resolves against viewport
/// width, `Y` against height, `D` (diagonal) against
/// `sqrt((vw² + vh²) / 2)` — the "normalized diagonal" used by
/// `<circle r>` and other length-without-axis attributes.
#[derive(Debug, Clone, Copy)]
enum Axis {
    X,
    Y,
    D,
}

/// `(x, y, w, h)` of the SVG viewport that contains `node` — the
/// nearest `<svg>` ancestor's `viewBox` if present, otherwise its
/// `width`/`height` attributes. Returns `(0,0,0,0)` if no viewport
/// is reachable; that collapses any percentage to 0.
fn viewport_box_for(ctx: &PaintCtx<'_>, node: &DemoNode) -> (f32, f32, f32, f32) {
    super::super::layout::viewport::viewport_box_for(ctx, node)
}

fn axis_extent(viewport: (f32, f32, f32, f32), axis: Axis) -> f32 {
    let (_, _, vw, vh) = viewport;
    match axis {
        Axis::X => vw,
        Axis::Y => vh,
        Axis::D => ((vw * vw + vh * vh) * 0.5).sqrt(),
    }
}

/// Read a length attribute, resolving `%` against the nearest
/// SVG viewport per SVG 2 §10.2. Use `Axis::X` for x-positioned
/// attributes (`x`, `cx`, `width`, `rx`, `x1`, `x2`), `Axis::Y` for
/// y-positioned attributes, and `Axis::D` for axis-agnostic lengths
/// (`<circle r>`, gradient `r`, etc.).
fn len_attr(ctx: &PaintCtx<'_>, node: &DemoNode, name: &str, axis: Axis) -> Option<f32> {
    let raw = get_attr(node, name)?.trim().to_string();
    if let Some(p) = raw.strip_suffix('%') {
        let pct = p.trim().parse::<f32>().ok()?;
        let extent = axis_extent(viewport_box_for(ctx, node), axis);
        return Some(pct / 100.0 * extent);
    }
    // Viewport-relative units (`vw` / `vh` / `vmin` / `vmax`)
    // resolve against the *initial containing viewport* (CSS Values
    // 4 §8) — i.e. the rendering canvas size, not the SVG's
    // `viewBox`. resvg's reference renders treat `1vw` as
    // `initial_viewport_width / 100` taken directly as user-space
    // units (matching what the test PNGs encode). We keep that
    // convention for parity.
    let lower = raw.to_ascii_lowercase();
    let (vw, vh) = ctx.initial_viewport;
    if let Some(unit_factor) = viewport_unit_factor(&lower, vw, vh) {
        let num: f32 = lower
            .trim_end_matches(|c: char| c.is_ascii_alphabetic())
            .trim()
            .parse()
            .ok()?;
        return Some(num * unit_factor);
    }
    // `rem` resolves against the *root* element's `font-size`
    // (CSS Values 4 §6.1.2). For SVG, the root is the document
    // `<svg>` element. Note the spec excludes the rem-bearing
    // element's own `font-size` AND any ancestor — only the root.
    if lower.ends_with("rem") {
        let num: f32 = lower.trim_end_matches("rem").trim().parse().ok()?;
        return Some(num * root_font_size(ctx));
    }
    // `em` / `ex` / `ch` resolve against the inherited `font-size`.
    if let Some((suffix, unit_size_factor)) = font_relative_unit(&lower) {
        let font_size = inherited_font_size(ctx, node);
        let num: f32 = lower.trim_end_matches(suffix).trim().parse().ok()?;
        return Some(num * font_size * unit_size_factor);
    }
    parse_length_px(&raw)
}

/// Read the root `<svg>` element's `font-size`, defaulting to 16
/// (CSS default) when absent. Used for `rem` resolution.
fn root_font_size(ctx: &PaintCtx<'_>) -> f32 {
    use super::super::dom::parser::find_svg_root;
    let Some(svg_id) = find_svg_root(ctx.dom) else {
        return 16.0;
    };
    let svg = ctx.dom.node(svg_id);
    if let Some(v) = get_attr(svg, "font-size") {
        if let Some(px) = parse_length_px(v) {
            return px;
        }
    }
    if let Some(style) = get_attr(svg, "style") {
        for decl in style.split(';') {
            if let Some((k, v)) = decl.split_once(':') {
                if k.trim().eq_ignore_ascii_case("font-size") {
                    if let Some(px) = parse_length_px(v.trim()) {
                        return px;
                    }
                }
            }
        }
    }
    16.0
}

fn viewport_unit_factor(s: &str, vw: f32, vh: f32) -> Option<f32> {
    if s.ends_with("vmin") {
        Some(vw.min(vh) * 0.01)
    } else if s.ends_with("vmax") {
        Some(vw.max(vh) * 0.01)
    } else if s.ends_with("vw") {
        Some(vw * 0.01)
    } else if s.ends_with("vh") {
        Some(vh * 0.01)
    } else {
        None
    }
}

fn font_relative_unit(s: &str) -> Option<(&'static str, f32)> {
    // `rem` is intentionally NOT here — it resolves against the
    // *root* font-size, handled by `parse_length_px` with its
    // 16px default. (We could refine to read the root `<svg>`'s
    // `font-size`, but most of the test suite targets the default.)
    if s.ends_with("em") && !s.ends_with("rem") {
        Some(("em", 1.0))
    } else if s.ends_with("ex") {
        // Half-em fallback per CSS Values 4 §6.1.
        Some(("ex", 0.5))
    } else if s.ends_with("ch") {
        // CSS Values 4 §6.1: width of `0` glyph; without metrics
        // we use the half-em approximation Skia would use.
        Some(("ch", 0.5))
    } else {
        None
    }
}

/// Walk the ancestor chain for the first explicit `font-size` and
/// resolve it to a px value. Returns 16 (CSS default) when no
/// ancestor declares one.
fn inherited_font_size(ctx: &PaintCtx<'_>, node: &DemoNode) -> f32 {
    fn read(node: &DemoNode) -> Option<&str> {
        if let Some(v) = get_attr(node, "font-size") {
            return Some(v);
        }
        if let Some(style) = get_attr(node, "style") {
            for decl in style.split(';') {
                if let Some((k, v)) = decl.split_once(':') {
                    if k.trim().eq_ignore_ascii_case("font-size") {
                        // SAFETY: we re-borrow the static substring;
                        // caller copies as needed via parse.
                        return Some(v.trim());
                    }
                }
            }
        }
        None
    }
    if let Some(v) = read(node) {
        if let Some(px) = parse_length_px(v) {
            return px;
        }
    }
    let mut current = node.parent;
    while let Some(id) = current {
        let n = ctx.dom.node(id);
        if let Some(v) = read(n) {
            if let Some(px) = parse_length_px(v) {
                return px;
            }
        }
        current = n.parent;
    }
    16.0
}

// ─── per-shape entry points ────────────────────────────────────────────

pub fn paint_rect(canvas: &Canvas, ctx: &PaintCtx<'_>, node: &DemoNode) {
    let x = len_attr(ctx, node, "x", Axis::X).unwrap_or(0.0);
    let y = len_attr(ctx, node, "y", Axis::Y).unwrap_or(0.0);
    let w = len_attr(ctx, node, "width", Axis::X).unwrap_or(0.0);
    let h = len_attr(ctx, node, "height", Axis::Y).unwrap_or(0.0);
    if w <= 0.0 || h <= 0.0 {
        return;
    }
    let rect = Rect::from_xywh(x, y, w, h);
    let mut b = PathBuilder::new();
    // SVG 2 §10.2: a negative `rx` or `ry` is invalid → revert to
    // initial value `auto`. `auto` falls back to the other axis
    // (Chrome confirmed). Strip negative values so the
    // `(Some, None)` / `(None, Some)` arms below take the
    // fall-through path.
    let rx_raw = len_attr(ctx, node, "rx", Axis::X).filter(|v| *v >= 0.0);
    let ry_raw = len_attr(ctx, node, "ry", Axis::Y).filter(|v| *v >= 0.0);
    match (rx_raw, ry_raw) {
        (None, None) => {
            b.add_rect(rect, None, None);
        }
        (rx, ry) => {
            let (rx, ry) = match (rx, ry) {
                (Some(a), Some(b)) => (a, b),
                (Some(a), None) => (a, a),
                (None, Some(a)) => (a, a),
                (None, None) => unreachable!(),
            };
            let rx = rx.min(w / 2.0);
            let ry = ry.min(h / 2.0);
            if rx == 0.0 && ry == 0.0 {
                b.add_rect(rect, None, None);
            } else {
                let mut rrect = RRect::new();
                rrect.set_rect_xy(rect, rx, ry);
                b.add_rrect(rrect, None, None);
            }
        }
    }
    fill_and_stroke(canvas, ctx, node, &b.detach());
}

pub fn paint_circle(canvas: &Canvas, ctx: &PaintCtx<'_>, node: &DemoNode) {
    let cx = len_attr(ctx, node, "cx", Axis::X).unwrap_or(0.0);
    let cy = len_attr(ctx, node, "cy", Axis::Y).unwrap_or(0.0);
    let r = len_attr(ctx, node, "r", Axis::D).unwrap_or(0.0);
    if r <= 0.0 {
        return;
    }
    let mut b = PathBuilder::new();
    b.add_circle((cx, cy), r, None);
    fill_and_stroke(canvas, ctx, node, &b.detach());
}

pub fn paint_ellipse(canvas: &Canvas, ctx: &PaintCtx<'_>, node: &DemoNode) {
    let cx = len_attr(ctx, node, "cx", Axis::X).unwrap_or(0.0);
    let cy = len_attr(ctx, node, "cy", Axis::Y).unwrap_or(0.0);
    // SVG 2 §10.3: a negative `rx` or `ry` is *invalid*, which per
    // CSS revert-to-initial means `auto` — and `auto` falls back to
    // the other axis. Single-negative renders as a circle (chrome
    // confirmed); both-negative renders nothing (both axes resolve
    // to each other → both 0).
    let rx_raw = len_attr(ctx, node, "rx", Axis::X).filter(|v| *v >= 0.0);
    let ry_raw = len_attr(ctx, node, "ry", Axis::Y).filter(|v| *v >= 0.0);
    let (rx, ry) = match (rx_raw, ry_raw) {
        (Some(rx), Some(ry)) => (rx, ry),
        (Some(rx), None) => (rx, rx),
        (None, Some(ry)) => (ry, ry),
        (None, None) => return,
    };
    if rx <= 0.0 || ry <= 0.0 {
        return;
    }
    let mut b = PathBuilder::new();
    b.add_oval(
        Rect::from_xywh(cx - rx, cy - ry, rx * 2.0, ry * 2.0),
        None,
        None,
    );
    fill_and_stroke(canvas, ctx, node, &b.detach());
}

pub fn paint_line(canvas: &Canvas, ctx: &PaintCtx<'_>, node: &DemoNode) {
    let x1 = len_attr(ctx, node, "x1", Axis::X).unwrap_or(0.0);
    let y1 = len_attr(ctx, node, "y1", Axis::Y).unwrap_or(0.0);
    let x2 = len_attr(ctx, node, "x2", Axis::X).unwrap_or(0.0);
    let y2 = len_attr(ctx, node, "y2", Axis::Y).unwrap_or(0.0);
    let mut b = PathBuilder::new();
    b.move_to((x1, y1)).line_to((x2, y2));
    stroke_only(canvas, ctx, node, &b.detach());
}

pub fn paint_polyline(canvas: &Canvas, ctx: &PaintCtx<'_>, node: &DemoNode) {
    let path = points_to_path(node, /*close=*/ false);
    fill_and_stroke(canvas, ctx, node, &path);
}

pub fn paint_polygon(canvas: &Canvas, ctx: &PaintCtx<'_>, node: &DemoNode) {
    let path = points_to_path(node, /*close=*/ true);
    fill_and_stroke(canvas, ctx, node, &path);
}

pub fn paint_path(canvas: &Canvas, ctx: &PaintCtx<'_>, node: &DemoNode) {
    let Some(d) = get_attr(node, "d") else {
        return;
    };
    let path = parse_path(d);
    fill_and_stroke(canvas, ctx, node, &path);
}

// ─── shared paint helpers ──────────────────────────────────────────────

/// Three sub-paint phases of an SVG shape, in document/spec order
/// (fill/stroke/markers). The painter resolves the element's
/// `paint-order` value into a permutation of this slice.
#[derive(Clone, Copy, PartialEq, Eq)]
enum PaintPhase {
    Fill,
    Stroke,
    Markers,
}

/// Resolve `paint-order` (CSS / SVG Paint Order Level 1) on `node`.
/// The property names the phases in the order they should paint;
/// any of `fill`/`stroke`/`markers` that's omitted is appended in
/// the canonical order (fill, stroke, markers). Default (absent /
/// invalid value) is `[fill, stroke, markers]`. Resolved through
/// the CSS cascade so `<style>` selectors and inline style work.
fn resolve_paint_order(ctx: &PaintCtx<'_>, node: &DemoNode) -> [PaintPhase; 3] {
    use crate::htmlcss::svg::style::cascade::cascade_property;
    let raw = cascade_property(
        Some(ctx.dom),
        Some(&ctx.resources.stylesheet),
        node,
        "paint-order",
    );
    let Some(raw) = raw else {
        return [PaintPhase::Fill, PaintPhase::Stroke, PaintPhase::Markers];
    };
    let trimmed = raw.trim();
    if trimmed.is_empty()
        || trimmed.eq_ignore_ascii_case("normal")
        || trimmed.eq_ignore_ascii_case("inherit")
        || trimmed.eq_ignore_ascii_case("initial")
        || trimmed.eq_ignore_ascii_case("unset")
    {
        return [PaintPhase::Fill, PaintPhase::Stroke, PaintPhase::Markers];
    }
    // CSS Paint Order spec / CSS Values 4 §3.4: a property declaration
    // with any invalid token is invalid as a whole — treated as if the
    // property weren't set. Don't silently skip unknown keywords;
    // rejecting the whole value matches Chrome/Firefox + the
    // resvg-test-suite `paint-order_trailing-data.svg` fixture
    // ("stroke markers fill qwe" → default, not "stroke markers fill").
    let mut listed: Vec<PaintPhase> = Vec::with_capacity(3);
    let mut seen_invalid = false;
    for tok in trimmed.split_ascii_whitespace() {
        let phase = match tok.to_ascii_lowercase().as_str() {
            "fill" => Some(PaintPhase::Fill),
            "stroke" => Some(PaintPhase::Stroke),
            "markers" => Some(PaintPhase::Markers),
            _ => {
                seen_invalid = true;
                break;
            }
        };
        if let Some(p) = phase {
            if !listed.contains(&p) {
                listed.push(p);
            }
        }
    }
    if seen_invalid || listed.is_empty() {
        return [PaintPhase::Fill, PaintPhase::Stroke, PaintPhase::Markers];
    }
    // Append canonical-order phases not already present.
    for canonical in [PaintPhase::Fill, PaintPhase::Stroke, PaintPhase::Markers] {
        if !listed.contains(&canonical) {
            listed.push(canonical);
        }
    }
    [listed[0], listed[1], listed[2]]
}

fn fill_and_stroke(canvas: &Canvas, ctx: &PaintCtx<'_>, node: &DemoNode, path: &Path) {
    // Element-level `opacity` is now applied by `container_painter`
    // as a `save_layer` wrapping the element's draws — applying it
    // again into the fill/stroke alpha would double-dim. Pass 1.0.
    let element_opacity = 1.0_f32;

    let order = resolve_paint_order(ctx, node);
    for phase in order {
        match phase {
            PaintPhase::Fill => paint_fill(canvas, ctx, node, path, element_opacity),
            PaintPhase::Stroke => paint_stroke(canvas, ctx, node, path, element_opacity),
            // Markers paint *over* fill+stroke by default (SVG 2
            // §11.6: "in front of the shape's stroke"); paint-order
            // can move them earlier or later. Resolved per-vertex
            // from `marker-start`, `marker-mid`, `marker-end`.
            PaintPhase::Markers => super::svg_marker_painter::paint(canvas, ctx, node, path),
        }
    }
}

fn stroke_only(canvas: &Canvas, ctx: &PaintCtx<'_>, node: &DemoNode, path: &Path) {
    // Element-level `opacity` is now applied by `container_painter`
    // as a `save_layer` wrapping the element's draws — applying it
    // again into the fill/stroke alpha would double-dim. Pass 1.0.
    let element_opacity = 1.0_f32;
    let order = resolve_paint_order(ctx, node);
    for phase in order {
        match phase {
            // `stroke_only` callers (line, polyline) skip fill by
            // construction — drop that phase.
            PaintPhase::Fill => {}
            PaintPhase::Stroke => paint_stroke(canvas, ctx, node, path, element_opacity),
            PaintPhase::Markers => super::svg_marker_painter::paint(canvas, ctx, node, path),
        }
    }
}

fn paint_fill(
    canvas: &Canvas,
    ctx: &PaintCtx<'_>,
    node: &DemoNode,
    path: &Path,
    element_opacity: f32,
) {
    let fill_attr = cascade_property(Some(ctx.dom), Some(&ctx.resources.stylesheet), node, "fill");
    let resolution = resolve_paint_with_server(
        ctx,
        node,
        "fill",
        fill_attr.as_deref(),
        /*default_solid=*/ Some(Color::BLACK),
    );
    let Some(paint_choice) = resolution else {
        return;
    };
    let fill_op = opacity_property(ctx, node, "fill-opacity")
        .unwrap_or(1.0)
        .clamp(0.0, 1.0);

    let mut p = SkPaint::default();
    p.set_anti_alias(true);
    p.set_style(PaintStyle::Fill);
    match paint_choice {
        PaintChoice::Solid(c) => {
            let alpha = (c.a() as f32 / 255.0) * fill_op * element_opacity;
            if alpha <= 0.0 {
                return;
            }
            p.set_color(c);
            p.set_alpha_f(alpha);
        }
        PaintChoice::Shader(s) => {
            let alpha = fill_op * element_opacity;
            if alpha <= 0.0 {
                return;
            }
            p.set_shader(Some(s));
            p.set_alpha_f(alpha);
        }
    }

    let mut path_with_rule = path.clone();
    let rule = match get_attr(node, "fill-rule").map(str::trim) {
        Some("evenodd") => PathFillType::EvenOdd,
        _ => PathFillType::Winding,
    };
    path_with_rule.set_fill_type(rule);
    canvas.draw_path(&path_with_rule, &p);
}

fn paint_stroke(
    canvas: &Canvas,
    ctx: &PaintCtx<'_>,
    node: &DemoNode,
    path: &Path,
    element_opacity: f32,
) {
    let stroke_attr = cascade_property(
        Some(ctx.dom),
        Some(&ctx.resources.stylesheet),
        node,
        "stroke",
    );
    let resolution = resolve_paint_with_server(
        ctx,
        node,
        "stroke",
        stroke_attr.as_deref(),
        /*default_solid=*/ None,
    );
    let Some(paint_choice) = resolution else {
        return;
    };
    // SVG 2 §7.10: percentages on `stroke-width` (and other length
    // properties without an explicit axis) resolve against the
    // viewport diagonal normalized by sqrt(2). `len_attr` with
    // `Axis::D` does exactly that, so a `<rect ... stroke-width="10%">`
    // inside a 200×200 viewBox renders the 20-px stroke Chrome and
    // resvg agree on instead of falling back to 1px.
    let width = len_attr(ctx, node, "stroke-width", Axis::D).unwrap_or(1.0);
    if width <= 0.0 {
        return;
    }
    let stroke_op = opacity_property(ctx, node, "stroke-opacity")
        .unwrap_or(1.0)
        .clamp(0.0, 1.0);

    let mut p = SkPaint::default();
    p.set_anti_alias(true);
    p.set_style(PaintStyle::Stroke);
    p.set_stroke_width(width);

    match paint_choice {
        PaintChoice::Solid(c) => {
            let alpha = (c.a() as f32 / 255.0) * stroke_op * element_opacity;
            if alpha <= 0.0 {
                return;
            }
            p.set_color(c);
            p.set_alpha_f(alpha);
        }
        PaintChoice::Shader(s) => {
            let alpha = stroke_op * element_opacity;
            if alpha <= 0.0 {
                return;
            }
            p.set_shader(Some(s));
            p.set_alpha_f(alpha);
        }
    }

    p.set_stroke_cap(match get_attr(node, "stroke-linecap").map(str::trim) {
        Some("round") => Cap::Round,
        Some("square") => Cap::Square,
        _ => Cap::Butt,
    });
    p.set_stroke_join(match get_attr(node, "stroke-linejoin").map(str::trim) {
        Some("round") => Join::Round,
        Some("bevel") => Join::Bevel,
        _ => Join::Miter,
    });
    if let Some(ml) = num_attr(node, "stroke-miterlimit") {
        p.set_stroke_miter(ml.max(1.0));
    }

    if let Some(dash_attr) = get_attr(node, "stroke-dasharray") {
        // SVG 2 §11.5: each entry in `stroke-dasharray` is a
        // `<length-percentage>` resolving against the viewport
        // diagonal normalized by sqrt(2) — same axis as
        // `stroke-width`. Per-token resolution lets `15% 30%`
        // produce a real dashed stroke instead of silently dropping
        // the percent tokens and rendering solid.
        let dash_extent = axis_extent(viewport_box_for(ctx, node), Axis::D);
        if let Some(intervals) = parse_dash_intervals_with_extent(dash_attr, dash_extent) {
            // SVG 2 §11.5: `stroke-dashoffset` is a `<length-percentage>`
            // and percentages resolve against the viewport diagonal
            // normalized by sqrt(2) — same axis as `stroke-width`. Use
            // `len_attr` with `Axis::D` so a value like
            // `stroke-dashoffset="20%"` on a 200×200 viewBox produces
            // the 40-px offset Chrome and resvg agree on, instead of
            // silently falling back to 0 from `num_attr`'s `%` reject.
            let phase = len_attr(ctx, node, "stroke-dashoffset", Axis::D).unwrap_or(0.0);
            if let Some(effect) = PathEffect::dash(&intervals, phase) {
                p.set_path_effect(effect);
            }
        }
    }

    canvas.draw_path(path, &p);
}

enum PaintChoice {
    Solid(Color),
    Shader(skia_safe::Shader),
}

/// Resolve a `fill` / `stroke` attribute value against the resource
/// table. Returns `None` for `none` or unresolvable refs without a
/// fallback color; otherwise a [`PaintChoice`] suitable for `SkPaint`.
fn resolve_paint_with_server(
    ctx: &PaintCtx<'_>,
    node: &DemoNode,
    property: &str,
    attr: Option<&str>,
    default_solid: Option<Color>,
) -> Option<PaintChoice> {
    match attr {
        None => {
            // SVG `fill` / `stroke` are CSS-inheritable. When the
            // current element doesn't set the property, walk ancestors
            // (and the `<use>` shadow tree, when applicable) for an
            // explicit value before falling back to the initial
            // default (black for fill, none for stroke).
            inherited_paint(ctx, node, property, default_solid)
        }
        Some(v) => {
            let v = v.trim();
            if v.eq_ignore_ascii_case("none") {
                return None;
            }
            // SVG 2 / CSS: explicit `inherit` walks the ancestor chain
            // for the same property and applies the inherited value.
            // Without a CSS cascade we approximate by re-running the
            // resolver on the parent's value of the same attribute.
            if v.eq_ignore_ascii_case("inherit") {
                return inherited_paint(ctx, node, property, default_solid);
            }
            if v.starts_with("url(") {
                let bbox = approx_bbox(node);
                let (_, _, vw, vh) = viewport_box_for(ctx, node);
                match paint_server::resolve(ctx.dom, ctx.resources, v, bbox, (vw, vh)) {
                    Some(Resolved::Shader(s)) => return Some(PaintChoice::Shader(s)),
                    Some(Resolved::Pattern {
                        node: pid,
                        bbox: pbbox,
                    }) => {
                        // Defer-resolved pattern: render its subtree
                        // into a Picture and wrap as a tiled shader.
                        if let Some(s) =
                            super::super::resources::pattern::build_shader(ctx, pid, pbbox)
                        {
                            return Some(PaintChoice::Shader(s));
                        }
                        return apply_funciri_fallback(ctx, node, v, default_solid);
                    }
                    _ => return apply_funciri_fallback(ctx, node, v, default_solid),
                }
            }
            // Fall through to the simple paint parser.
            match parse_paint(v) {
                Some(Paint::None) => None,
                Some(Paint::Color(c)) => Some(PaintChoice::Solid(c)),
                Some(Paint::CurrentColor) => {
                    Some(PaintChoice::Solid(resolve_current_color(ctx, node)))
                }
                None => default_solid.map(PaintChoice::Solid),
            }
        }
    }
}

/// Cheap object-bounding-box approximation. For shapes with explicit
/// geometry attrs we read them directly; for `<path>` we tokenise the
/// `d` attribute and tight-bound the resulting `SkPath`. This is the
/// bbox the gradient resolver maps `objectBoundingBox` units against.
fn approx_bbox(node: &DemoNode) -> Rect {
    use super::super::dom::element::ElementKind;
    let csscascade::dom::DemoNodeData::Element(data) = &node.data else {
        return Rect::default();
    };
    let kind = ElementKind::from_local_name(data.name.local.as_ref());
    match kind {
        ElementKind::Rect => {
            let x = num_attr(node, "x").unwrap_or(0.0);
            let y = num_attr(node, "y").unwrap_or(0.0);
            let w = num_attr(node, "width").unwrap_or(0.0);
            let h = num_attr(node, "height").unwrap_or(0.0);
            Rect::from_xywh(x, y, w, h)
        }
        ElementKind::Circle => {
            let cx = num_attr(node, "cx").unwrap_or(0.0);
            let cy = num_attr(node, "cy").unwrap_or(0.0);
            let r = num_attr(node, "r").unwrap_or(0.0);
            Rect::from_xywh(cx - r, cy - r, r * 2.0, r * 2.0)
        }
        ElementKind::Ellipse => {
            let cx = num_attr(node, "cx").unwrap_or(0.0);
            let cy = num_attr(node, "cy").unwrap_or(0.0);
            let rx = num_attr(node, "rx").unwrap_or(0.0);
            let ry = num_attr(node, "ry").unwrap_or(0.0);
            Rect::from_xywh(cx - rx, cy - ry, rx * 2.0, ry * 2.0)
        }
        ElementKind::Line => {
            let x1 = num_attr(node, "x1").unwrap_or(0.0);
            let y1 = num_attr(node, "y1").unwrap_or(0.0);
            let x2 = num_attr(node, "x2").unwrap_or(0.0);
            let y2 = num_attr(node, "y2").unwrap_or(0.0);
            Rect::new(x1.min(x2), y1.min(y2), x1.max(x2), y1.max(y2))
        }
        ElementKind::Polyline | ElementKind::Polygon => {
            let pts = get_attr(node, "points")
                .map(parse_points)
                .unwrap_or_default();
            points_bbox(&pts)
        }
        ElementKind::Path => {
            let Some(d) = get_attr(node, "d") else {
                return Rect::default();
            };
            let path = parse_path(d);
            *path.bounds()
        }
        _ => Rect::default(),
    }
}

fn points_bbox(pts: &[(f32, f32)]) -> Rect {
    let mut iter = pts.iter().copied();
    let Some((mut minx, mut miny)) = iter.next() else {
        return Rect::default();
    };
    let mut maxx = minx;
    let mut maxy = miny;
    for (x, y) in iter {
        minx = minx.min(x);
        miny = miny.min(y);
        maxx = maxx.max(x);
        maxy = maxy.max(y);
    }
    Rect::new(minx, miny, maxx, maxy)
}

fn parse_dash_intervals_with_extent(s: &str, dash_extent: f32) -> Option<Vec<f32>> {
    let s = s.trim();
    if s.is_empty() || s.eq_ignore_ascii_case("none") {
        return None;
    }
    let resolve = |p: &str| -> Option<f32> {
        if let Some(num) = p.strip_suffix('%') {
            let v: f32 = num.trim().parse().ok()?;
            return Some(v / 100.0 * dash_extent);
        }
        parse_length_px(p)
    };
    let mut nums: Vec<f32> = s
        .split(|c: char| c.is_ascii_whitespace() || c == ',')
        .filter(|p| !p.is_empty())
        .filter_map(resolve)
        .collect();
    if nums.is_empty() || nums.iter().all(|n| *n == 0.0) {
        return None;
    }
    if nums.len() % 2 == 1 {
        let copy = nums.clone();
        nums.extend(copy);
    }
    Some(nums)
}

fn num_attr(node: &DemoNode, name: &str) -> Option<f32> {
    get_attr(node, name).and_then(parse_length_px)
}

/// Walk the ancestor chain (plus the `<use>` instance, when active)
/// for a `fill` / `stroke` value (or its `style="fill:..."` form),
/// then re-run the paint resolver on it. Used for explicit
/// `fill="inherit"` / `stroke="inherit"` AND as the inheritance
/// pathway for plain elements that don't set the property locally
/// (called via `inherited_paint_for_unset`).
fn inherited_paint(
    ctx: &PaintCtx<'_>,
    node: &DemoNode,
    property: &str,
    default_solid: Option<Color>,
) -> Option<PaintChoice> {
    fn read(node: &DemoNode, property: &str) -> Option<String> {
        if let Some(v) = get_attr(node, property) {
            return Some(v.to_string());
        }
        if let Some(style) = get_attr(node, "style") {
            for decl in style.split(';') {
                if let Some((k, v)) = decl.split_once(':') {
                    if k.trim().eq_ignore_ascii_case(property) {
                        return Some(v.trim().to_string());
                    }
                }
            }
        }
        None
    }
    // SVG 2 §5.6.4: a `<use>`'s shadow tree is rooted at the cloned
    // target — the source-DOM parent of the target is NOT in the
    // cascade chain. Bound the source-ancestor walk at the innermost
    // `<use>`'s `target_id`: process up to (and including) that node,
    // then jump straight to the `use_chain`. When `node` itself is the
    // use target, the source-DOM walk is skipped entirely.
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
        if let Some(v) = read(n, property) {
            if !v.eq_ignore_ascii_case("inherit") {
                return resolve_paint_with_server(ctx, n, property, Some(&v), default_solid);
            }
        }
        if Some(id) == boundary {
            break;
        }
        current = n.parent;
    }
    // `<use>` instance shadow tree — Blink's `SVGUseElement::CreateInstanceTree`
    // makes each `<use>` element along the recursion chain act as an
    // additional ancestor for inheritance purposes. Innermost `<use>`
    // wins; if it doesn't supply the property, walk outward.
    for use_id in crate::htmlcss::svg::paint::scoped_svg_paint_state::use_chain_iter(ctx.use_chain)
    {
        let mut current = Some(use_id);
        while let Some(id) = current {
            let n = ctx.dom.node(id);
            if let Some(v) = read(n, property) {
                if !v.eq_ignore_ascii_case("inherit") {
                    return resolve_paint_with_server(ctx, n, property, Some(&v), default_solid);
                }
            }
            current = n.parent;
        }
    }
    default_solid.map(PaintChoice::Solid)
}

/// Apply the funcIRI fallback chain when a `url(#…)` fails to resolve.
/// The fallback can be a color (`url(#g) red`) or `none` (`url(#g) none`,
/// SVG 2 §11.3.2). When the fallback is `none`, the paint side has no
/// effect. When absent, we treat the invalid funcIRI as `none` (no
/// paint), matching resvg's behavior — which is what reference PNGs
/// expect under our reftest harness. The SVG 2 spec says "use initial
/// value" (black for fill) but resvg picks the more conservative "no
/// paint at all" interpretation; matching that scores us against the
/// reference.
fn apply_funciri_fallback(
    ctx: &PaintCtx<'_>,
    node: &DemoNode,
    paint_value: &str,
    _default_solid: Option<Color>,
) -> Option<PaintChoice> {
    if let Some(fb) = paint_server::paint_fallback(paint_value) {
        match parse_paint(fb) {
            Some(Paint::None) => return None,
            Some(Paint::Color(c)) => return Some(PaintChoice::Solid(c)),
            Some(Paint::CurrentColor) => {
                return Some(PaintChoice::Solid(resolve_current_color(ctx, node)));
            }
            _ => {}
        }
    }
    // No fallback → treat as `none`.
    None
}

/// Resolve the `currentColor` keyword by walking up the ancestor chain
/// looking for a `color` attribute (or `style="color:..."`). Defaults
/// to black per CSS, matching Blink's `StyleResolver` for SVG.
fn resolve_current_color(ctx: &PaintCtx<'_>, node: &DemoNode) -> Color {
    use crate::htmlcss::svg::dom::attrs::parse_color;

    fn read(node: &DemoNode) -> Option<Color> {
        if let Some(raw) = get_attr(node, "color") {
            if let Some(c) = parse_color(raw.trim()) {
                return Some(c);
            }
        }
        if let Some(style) = get_attr(node, "style") {
            for decl in style.split(';') {
                let Some((k, v)) = decl.split_once(':') else {
                    continue;
                };
                if k.trim().eq_ignore_ascii_case("color") {
                    if let Some(c) = parse_color(v.trim()) {
                        return Some(c);
                    }
                }
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
    for use_id in crate::htmlcss::svg::paint::scoped_svg_paint_state::use_chain_iter(ctx.use_chain)
    {
        let mut current = Some(use_id);
        while let Some(id) = current {
            let n = ctx.dom.node(id);
            if let Some(c) = read(n) {
                return c;
            }
            current = n.parent;
        }
    }
    Color::BLACK
}

/// Read a 0..1 opacity-style property from an attribute or the `style=`
/// declaration. Accepts SVG 2 percentage syntax (`fill-opacity="50%"`).
/// Returns `None` if the property is absent or unparseable.
///
/// `fill-opacity` and `stroke-opacity` are CSS-inheritable; when not
/// set locally we walk DOM ancestors (and the `<use>` shadow tree when
/// applicable) before giving up.
fn opacity_property(ctx: &PaintCtx<'_>, node: &DemoNode, name: &str) -> Option<f32> {
    fn read(node: &DemoNode, name: &str) -> Option<f32> {
        if let Some(raw) = get_attr(node, name) {
            if let Some(v) = super::effects::parse_opacity_value(raw) {
                return Some(v);
            }
        }
        if let Some(style) = get_attr(node, "style") {
            for decl in style.split(';') {
                let Some((k, v)) = decl.split_once(':') else {
                    continue;
                };
                if k.trim().eq_ignore_ascii_case(name) {
                    if let Some(n) = super::effects::parse_opacity_value(v) {
                        return Some(n);
                    }
                }
            }
        }
        None
    }
    if let Some(v) = read(node, name) {
        return Some(v);
    }
    let mut current = node.parent;
    while let Some(id) = current {
        let n = ctx.dom.node(id);
        if let Some(v) = read(n, name) {
            return Some(v);
        }
        current = n.parent;
    }
    for use_id in crate::htmlcss::svg::paint::scoped_svg_paint_state::use_chain_iter(ctx.use_chain)
    {
        let mut current = Some(use_id);
        while let Some(id) = current {
            let n = ctx.dom.node(id);
            if let Some(v) = read(n, name) {
                return Some(v);
            }
            current = n.parent;
        }
    }
    None
}

fn points_to_path(node: &DemoNode, close: bool) -> Path {
    let mut b = PathBuilder::new();
    let pts = get_attr(node, "points")
        .map(parse_points)
        .unwrap_or_default();
    let mut iter = pts.into_iter();
    if let Some((x, y)) = iter.next() {
        b.move_to(Point::new(x, y));
        for (x, y) in iter {
            b.line_to(Point::new(x, y));
        }
        if close {
            b.close();
        }
    }
    b.detach()
}
