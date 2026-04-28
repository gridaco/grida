//! `<pattern>` paint server realization.
//!
//! Records the pattern subtree once into an `SkPicture` per call (we
//! don't yet cache; that's a future per-client/per-bbox cache pass),
//! then wraps the picture as a tiled `Shader` via `Picture::to_shader`.
//! Honors `patternUnits` (default `objectBoundingBox`),
//! `patternContentUnits` (default `userSpaceOnUse`), `patternTransform`,
//! `viewBox` + `preserveAspectRatio`, and href-based attribute
//! inheritance.
//!
//! Output type: `Option<Shader>`. The internal `PictureRecorder` uses a
//! recording `Canvas`, but no `&Canvas` argument crosses the public
//! API — that's why this resource container can live in `resources/`
//! despite needing to recursively run the painter on the pattern's
//! children. `paint_server::resolve_node` returns a deferred
//! [`Resolved::Pattern`] variant; `svg_shape_painter` completes
//! resolution by calling [`build_shader`] here.
//!
//! Blink anchor: `core/layout/svg/layout_svg_resource_pattern.{h,cc}` —
//! specifically `LayoutSVGResourcePattern::CalculatePatternBoundaries`
//! and `BuildTileImageTransform`. Skia svg::Dom anchor:
//! `modules/svg/src/SkSVGPattern.cpp::asPaint`.

use csscascade::dom::{DemoDom, DemoNode, DemoNodeData, NodeId};
use skia_safe::{FilterMode, Matrix, PictureRecorder, Rect, Shader, TileMode};

use super::super::dom::attrs::{
    parse_preserve_aspect_ratio, parse_transform, parse_viewbox, AlignX, AlignY, Fit,
    PreserveAspectRatio,
};
use super::super::dom::element::{get_attr, ElementKind};
use super::super::dom::href::{href_attr, same_document_fragment};
use super::super::paint::scoped_svg_paint_state::{PaintCtx, MAX_PATTERN_DEPTH};
use super::super::paint::svg_container_painter::paint_children;
use super::svg_resources::Resources;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Units {
    UserSpaceOnUse,
    ObjectBoundingBox,
}

/// A length attribute on `<pattern>`. Stored unresolved because percent
/// resolution depends on `patternUnits` (not known until merge completes):
/// in `objectBoundingBox` mode `<n>%` is treated as the fraction `n/100`;
/// in `userSpaceOnUse` mode it's `n/100 * viewport_extent`.
#[derive(Debug, Clone, Copy)]
enum Length {
    Px(f32),
    Percent(f32),
}

#[derive(Debug, Clone, Copy, Default)]
struct PatternAttrs {
    x: Option<Length>,
    y: Option<Length>,
    width: Option<Length>,
    height: Option<Length>,
    pattern_units: Option<Units>,
    pattern_content_units: Option<Units>,
    pattern_transform: Option<Matrix>,
    view_box: Option<(f32, f32, f32, f32)>,
    preserve_aspect_ratio: Option<PreserveAspectRatio>,
    has_children: bool,
}

/// Resolve a `<pattern>` reference into a Skia tiled shader.
///
/// Steps mirror `SkSVGPattern::asPaint` and Blink's pattern realization:
/// 1. Walk the `href` chain, merging pattern attributes (later
///    references override only fields the closer pattern leaves blank).
/// 2. Compute the tile rect in user space using `patternUnits`.
/// 3. Compose the local matrix that takes shader-local coords into
///    pattern-content space (combining `patternTransform`, the tile
///    origin, `viewBox`, and `patternContentUnits`).
/// 4. Record the pattern's children to a Picture via a sub-paint walk.
/// 5. Wrap the Picture in a Shader with `TileMode::Repeat` and the
///    composed local matrix.
///
/// Returns `None` when the pattern cycles, lacks any inheritable
/// content, or has a degenerate tile rect (≤0 width or height — Skia's
/// shader would produce undefined output).
pub fn build_shader(ctx: &PaintCtx<'_>, node: NodeId, bbox: Rect) -> Option<Shader> {
    if ctx.pattern_depth >= MAX_PATTERN_DEPTH {
        return None;
    }
    let (attrs, content_node) = collect_inherited(ctx.dom, ctx.resources, node, 0)?;
    if !attrs.has_children {
        return None;
    }

    // Defaults per SVG 1.1 §13.3 / SVG 2 §13.3:
    // - patternUnits: objectBoundingBox
    // - patternContentUnits: userSpaceOnUse
    // - x/y/w/h: 0
    let pattern_units = attrs.pattern_units.unwrap_or(Units::ObjectBoundingBox);
    let content_units = attrs.pattern_content_units.unwrap_or(Units::UserSpaceOnUse);

    // Resolve x/y/w/h to user-space values. `patternUnits` chooses the
    // basis: in `objectBoundingBox` we multiply fractions (and percent,
    // which the spec also treats as a fraction here) by bbox extents;
    // in `userSpaceOnUse` raw lengths pass through and percent resolves
    // against the viewport.
    let resolve = |v: Option<Length>, axis: Axis| -> f32 {
        let Some(v) = v else { return 0.0 };
        match (pattern_units, v) {
            (Units::ObjectBoundingBox, Length::Px(n)) => match axis {
                Axis::X => bbox.width() * n,
                Axis::Y => bbox.height() * n,
            },
            (Units::ObjectBoundingBox, Length::Percent(p)) => match axis {
                // SVG 2 §13.3: percentages in objectBoundingBox space are
                // treated as the fraction (so 7.5% == 0.075).
                Axis::X => bbox.width() * (p / 100.0),
                Axis::Y => bbox.height() * (p / 100.0),
            },
            (Units::UserSpaceOnUse, Length::Px(n)) => n,
            (Units::UserSpaceOnUse, Length::Percent(p)) => match axis {
                Axis::X => ctx.initial_viewport.0 * (p / 100.0),
                Axis::Y => ctx.initial_viewport.1 * (p / 100.0),
            },
        }
    };
    let rx = resolve(attrs.x, Axis::X);
    let ry = resolve(attrs.y, Axis::Y);
    let rw = resolve(attrs.width, Axis::X);
    let rh = resolve(attrs.height, Axis::Y);

    // Build the tile rect in user space. The objectBoundingBox case
    // additionally translates by the bbox origin (tile.x/y are relative
    // to the bbox, not absolute).
    let tile = match pattern_units {
        Units::ObjectBoundingBox => Rect::from_xywh(bbox.left + rx, bbox.top + ry, rw, rh),
        Units::UserSpaceOnUse => Rect::from_xywh(rx, ry, rw, rh),
    };

    if tile.width() <= 0.0 || tile.height() <= 0.0 {
        return None;
    }

    // Reject singular `patternTransform` (e.g. `matrix(0 0 0 0 0 0)`).
    // Skia's `makeShader` returns null on a non-invertible local matrix
    // and skia-safe panics on unwrap. Bail to "no shader" so the caller
    // can fall back to its solid-color fallback.
    if let Some(t) = attrs.pattern_transform {
        t.invert()?;
    }

    // Compute `content_to_tile`: maps a child's natural coordinate space
    // into the picture's tile-content space, where (0, 0)–(tile.w, tile.h)
    // covers exactly one tile cell.
    //
    //   - With viewBox:   viewBox rect → tile rect (SVG 1.1 §7.8 / 13.3),
    //                     applying `preserveAspectRatio`.
    //   - Without viewBox + patternContentUnits=objectBoundingBox:
    //                     children's [0, 1] range maps to the bbox extents,
    //                     so the tile content is scaled by bbox dimensions.
    //   - Otherwise:      identity (children are already in user space).
    //
    // SVG 2 §13.3 also says that when `viewBox` is present,
    // `patternContentUnits` is ignored — that's encoded in the
    // if/else-if order below.
    let content_to_tile = if let Some(vb) = attrs.view_box {
        let par = attrs.preserve_aspect_ratio.unwrap_or_default();
        Some(view_box_to_tile_matrix(
            vb,
            tile.width(),
            tile.height(),
            par,
        ))
    } else if matches!(content_units, Units::ObjectBoundingBox) {
        Some(Matrix::scale((bbox.width(), bbox.height())))
    } else {
        None
    };

    // Shader-local matrix: maps picture coords to user-space coords.
    // Skia inverts this when sampling. The picture's (0, 0) ends up at
    // user-space (tile.left, tile.top) (after patternTransform). Content
    // scaling lives inside the picture, not here.
    let mut shader_local = Matrix::translate((tile.left, tile.top));
    if let Some(t) = attrs.pattern_transform {
        shader_local.pre_concat(&t);
    }

    // Record the children into a picture. The recorder canvas applies
    // `content_to_tile` so children — drawn at their natural coords —
    // land in tile-content space. Use a generous recording bounds (rather
    // than the tile rect) so geometry that happens to extend slightly
    // beyond one cell isn't lost during recording; the shader-side tile
    // rect (passed to `to_shader` below) is what enforces the tile cell.
    let picture_bounds = Rect::from_xywh(0.0, 0.0, tile.width(), tile.height());
    let mut recorder = PictureRecorder::new();
    let inner_canvas = recorder.begin_recording(picture_bounds, false);
    if let Some(m) = content_to_tile {
        inner_canvas.concat(&m);
    }
    // Recurse with deeper pattern depth so a self-referential pattern
    // chain terminates rather than spinning the picture recorder.
    let inner_ctx = ctx.with_deeper_pattern();
    paint_children(inner_canvas, &inner_ctx, content_node);
    let picture = recorder.finish_recording_as_picture(Some(&picture_bounds))?;

    // `Picture::to_shader(tile_modes, filter_mode, local_matrix, tile_rect)`.
    // tile_rect = bounds of the picture's tile cell. tile_modes = repeat
    // both axes (SVG patterns tile infinitely in both).
    Some(picture.to_shader(
        Some((TileMode::Repeat, TileMode::Repeat)),
        FilterMode::Linear,
        Some(&shader_local),
        Some(&picture_bounds),
    ))
}

#[derive(Clone, Copy)]
enum Axis {
    X,
    Y,
}

/// Walk the `href` chain (with cycle protection), merging missing
/// attributes from referenced patterns. Returns the resolved attribute
/// set plus the node whose children should be rendered (the closest
/// non-empty subtree, per SVG 1.1 §13.3).
fn collect_inherited(
    dom: &DemoDom,
    resources: &Resources,
    node_id: NodeId,
    depth: u32,
) -> Option<(PatternAttrs, NodeId)> {
    // Same fixed limit as `<use>` — Blink's `kSVGUseRecursionLimit`.
    if depth > 8 {
        return None;
    }
    let node = dom.node(node_id);
    let DemoNodeData::Element(data) = &node.data else {
        return None;
    };
    if ElementKind::from_local_name(data.name.local.as_ref()) != ElementKind::Pattern {
        return None;
    }

    let mut attrs = parse_local(dom, node);
    // Walk the href chain (if any) and merge missing fields.
    let referenced = href_attr(node)
        .and_then(same_document_fragment)
        .and_then(|id| resources.lookup(id));
    let content_node = match referenced {
        Some(target_id) if target_id != node_id => {
            if let Some((parent_attrs, parent_content)) =
                collect_inherited(dom, resources, target_id, depth + 1)
            {
                merge_inherited(&mut attrs, &parent_attrs);
                if attrs.has_children {
                    node_id
                } else {
                    attrs.has_children = parent_attrs.has_children;
                    parent_content
                }
            } else {
                node_id
            }
        }
        _ => node_id,
    };

    Some((attrs, content_node))
}

fn parse_local(dom: &DemoDom, node: &DemoNode) -> PatternAttrs {
    let pattern_units = match get_attr(node, "patternUnits") {
        Some("userSpaceOnUse") => Some(Units::UserSpaceOnUse),
        Some("objectBoundingBox") => Some(Units::ObjectBoundingBox),
        _ => None,
    };
    let pattern_content_units = match get_attr(node, "patternContentUnits") {
        Some("userSpaceOnUse") => Some(Units::UserSpaceOnUse),
        Some("objectBoundingBox") => Some(Units::ObjectBoundingBox),
        _ => None,
    };
    let has_children = node
        .children
        .iter()
        .any(|&cid| matches!(dom.node(cid).data, DemoNodeData::Element(_)));
    PatternAttrs {
        x: get_attr(node, "x").and_then(parse_length),
        y: get_attr(node, "y").and_then(parse_length),
        width: get_attr(node, "width").and_then(parse_length),
        height: get_attr(node, "height").and_then(parse_length),
        pattern_units,
        pattern_content_units,
        pattern_transform: get_attr(node, "patternTransform").and_then(parse_transform),
        view_box: get_attr(node, "viewBox").and_then(parse_viewbox),
        preserve_aspect_ratio: get_attr(node, "preserveAspectRatio")
            .map(parse_preserve_aspect_ratio),
        has_children,
    }
}

fn parse_length(s: &str) -> Option<Length> {
    let s = s.trim();
    if let Some(num) = s.strip_suffix('%') {
        num.trim().parse::<f32>().ok().map(Length::Percent)
    } else {
        super::super::dom::attrs::parse_length_px(s).map(Length::Px)
    }
}

/// Merge any *unset* fields on `into` from `from` (later href entries
/// don't override fields the closer entry set). Mirrors Blink's
/// `SVGPatternElement::CollectPatternAttributes`.
fn merge_inherited(into: &mut PatternAttrs, from: &PatternAttrs) {
    if into.x.is_none() {
        into.x = from.x;
    }
    if into.y.is_none() {
        into.y = from.y;
    }
    if into.width.is_none() {
        into.width = from.width;
    }
    if into.height.is_none() {
        into.height = from.height;
    }
    if into.pattern_units.is_none() {
        into.pattern_units = from.pattern_units;
    }
    if into.pattern_content_units.is_none() {
        into.pattern_content_units = from.pattern_content_units;
    }
    if into.pattern_transform.is_none() {
        into.pattern_transform = from.pattern_transform;
    }
    if into.view_box.is_none() {
        into.view_box = from.view_box;
    }
    if into.preserve_aspect_ratio.is_none() {
        into.preserve_aspect_ratio = from.preserve_aspect_ratio;
    }
}

/// Build the matrix that maps from the `viewBox` user space into the
/// tile rect, applying `preserveAspectRatio`. Mirrors the math in
/// `compute_viewport_ctm` (root_painter) but without the viewport
/// translation — the caller supplies it via `shader_local`.
fn view_box_to_tile_matrix(
    vb: (f32, f32, f32, f32),
    tile_w: f32,
    tile_h: f32,
    par: PreserveAspectRatio,
) -> Matrix {
    let (vb_x, vb_y, vb_w, vb_h) = vb;
    let scale_x = tile_w / vb_w;
    let scale_y = tile_h / vb_h;
    let (sx, sy) = match par.fit {
        Fit::None => (scale_x, scale_y),
        Fit::Meet => {
            let s = scale_x.min(scale_y);
            (s, s)
        }
        Fit::Slice => {
            let s = scale_x.max(scale_y);
            (s, s)
        }
    };
    let dx = match par.align_x {
        AlignX::Min => 0.0,
        AlignX::Mid => (tile_w - vb_w * sx) / 2.0,
        AlignX::Max => tile_w - vb_w * sx,
    };
    let dy = match par.align_y {
        AlignY::Min => 0.0,
        AlignY::Mid => (tile_h - vb_h * sy) / 2.0,
        AlignY::Max => tile_h - vb_h * sy,
    };
    let mut m = Matrix::translate((dx, dy));
    m.pre_concat(&Matrix::scale((sx, sy)));
    m.pre_concat(&Matrix::translate((-vb_x, -vb_y)));
    m
}
