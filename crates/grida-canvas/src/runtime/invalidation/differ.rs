//! Pure-function node differ.
//!
//! [`diff_node`] compares an old and new node value and returns the
//! narrowest [`ChangeKind`] that correctly describes the change.
//!
//! Motion and paint detection are **lens-based** — the functions in
//! [`super::lens`] give a uniform view of those fields across all
//! node variants, so the Geometry and Paint fast paths cover every
//! variant that has those fields without per-variant dispatch.
//!
//! What varies per variant is the "other" category — shape-specific
//! fields (size, corner radius, children, text content, …). Each
//! variant has a tiny `*_other_differs` helper that returns `true`
//! when a non-motion, non-paint field differs.
//!
//! Variants whose "other" fields can't be cheaply compared (complex
//! non-`PartialEq` types like `TextStyleRec`, `AttributedString`) are
//! conservative: they always report `true`. In practice that means
//! Geometry/Paint fast paths don't fire for text today, only for
//! shapes and containers. Text fast paths can be added later by
//! extending `PartialEq` coverage of the text-style types.
//!
//! Guarantee: whenever the differ returns [`ChangeKind::Geometry`]
//! or [`ChangeKind::Paint`], the non-matching field must be within
//! that category. When in doubt → [`ChangeKind::Full`].

use crate::node::schema::Node;

use super::change_kind::ChangeKind;
use super::lens::{motion_differs, paint_differs};

/// Classify the change between two node values.
pub fn diff_node(old: &Node, new: &Node) -> ChangeKind {
    // Different variants → structural. Full.
    if std::mem::discriminant(old) != std::mem::discriminant(new) {
        return ChangeKind::Full;
    }

    let motion = motion_differs(old, new);
    let paint = paint_differs(old, new);
    let other = other_differs(old, new);

    classify(motion, paint, other)
}

/// Classifier: the contract encoded as a truth table.
#[inline]
fn classify(motion: bool, paint: bool, other: bool) -> ChangeKind {
    match (motion, paint, other) {
        (false, false, false) => ChangeKind::None,
        (true, false, false) => ChangeKind::Geometry,
        (false, true, false) => ChangeKind::Paint,
        _ => ChangeKind::Full,
    }
}

/// Per-variant "other fields differ" dispatch.
///
/// "Other" means: everything except the motion lens and the paint
/// lens. For variants with full `PartialEq` coverage this is a flat
/// tuple comparison; for variants with non-`PartialEq` fields (text
/// content, vector networks in some forms) this is conservative and
/// returns `true`.
fn other_differs(old: &Node, new: &Node) -> bool {
    use crate::node::schema::*;

    match (old, new) {
        (Node::Rectangle(a), Node::Rectangle(b)) => rect_other_differs(a, b),
        (Node::Ellipse(a), Node::Ellipse(b)) => ellipse_other_differs(a, b),
        (Node::RegularPolygon(a), Node::RegularPolygon(b)) => regular_polygon_other_differs(a, b),
        (Node::RegularStarPolygon(a), Node::RegularStarPolygon(b)) => {
            regular_star_polygon_other_differs(a, b)
        }
        (Node::Polygon(a), Node::Polygon(b)) => polygon_other_differs(a, b),
        (Node::Line(a), Node::Line(b)) => line_other_differs(a, b),
        (Node::Image(a), Node::Image(b)) => image_other_differs(a, b),
        (Node::Path(a), Node::Path(b)) => path_other_differs(a, b),
        (Node::BooleanOperation(a), Node::BooleanOperation(b)) => {
            boolean_operation_other_differs(a, b)
        }
        (Node::MarkdownEmbed(a), Node::MarkdownEmbed(b)) => markdown_embed_other_differs(a, b),
        (Node::HTMLEmbed(a), Node::HTMLEmbed(b)) => html_embed_other_differs(a, b),
        (Node::Error(a), Node::Error(b)) => error_other_differs(a, b),
        (Node::Group(a), Node::Group(b)) => group_other_differs(a, b),
        (Node::Container(a), Node::Container(b)) => container_other_differs(a, b),
        (Node::Tray(a), Node::Tray(b)) => tray_other_differs(a, b),
        (Node::InitialContainer(a), Node::InitialContainer(b)) => {
            initial_container_other_differs(a, b)
        }
        // Conservative: these variants have fields without PartialEq
        // coverage (VectorNetwork content, TextStyleRec,
        // AttributedString). Reporting `true` keeps fast paths
        // disabled — safe but no Transform/Paint benefit for them.
        (Node::Vector(_), Node::Vector(_)) => true,
        (Node::TextSpan(_), Node::TextSpan(_)) => true,
        (Node::AttributedText(_), Node::AttributedText(_)) => true,
        // Discriminant mismatch is handled in `diff_node` before this
        // function is called.
        _ => true,
    }
}

// ---------------------------------------------------------------------------
// Per-variant "other" comparisons.
//
// Each function compares every field EXCEPT the ones covered by the
// motion lens (`transform` / `position+rotation`) and paint lens
// (`opacity`, `blend_mode`, `fills`, `strokes`). A `true` return
// means "at least one other field differs".
// ---------------------------------------------------------------------------

use crate::node::schema::*;

fn rect_other_differs(a: &RectangleNodeRec, b: &RectangleNodeRec) -> bool {
    a.active != b.active
        || a.mask != b.mask
        || a.size != b.size
        || a.corner_radius != b.corner_radius
        || a.corner_smoothing != b.corner_smoothing
        || a.stroke_style != b.stroke_style
        || a.stroke_width != b.stroke_width
        || a.effects != b.effects
        || a.layout_child != b.layout_child
}

fn ellipse_other_differs(a: &EllipseNodeRec, b: &EllipseNodeRec) -> bool {
    a.active != b.active
        || a.mask != b.mask
        || a.effects != b.effects
        || a.size != b.size
        || a.stroke_style != b.stroke_style
        || a.stroke_width != b.stroke_width
        || a.inner_radius != b.inner_radius
        || a.start_angle != b.start_angle
        || a.angle != b.angle
        || a.corner_radius != b.corner_radius
        || a.layout_child != b.layout_child
}

fn regular_polygon_other_differs(a: &RegularPolygonNodeRec, b: &RegularPolygonNodeRec) -> bool {
    a.active != b.active
        || a.mask != b.mask
        || a.effects != b.effects
        || a.size != b.size
        || a.point_count != b.point_count
        || a.corner_radius != b.corner_radius
        || a.stroke_style != b.stroke_style
        || a.stroke_width != b.stroke_width
        || a.layout_child != b.layout_child
}

fn regular_star_polygon_other_differs(
    a: &RegularStarPolygonNodeRec,
    b: &RegularStarPolygonNodeRec,
) -> bool {
    a.active != b.active
        || a.mask != b.mask
        || a.effects != b.effects
        || a.size != b.size
        || a.point_count != b.point_count
        || a.inner_radius != b.inner_radius
        || a.corner_radius != b.corner_radius
        || a.stroke_style != b.stroke_style
        || a.stroke_width != b.stroke_width
        || a.layout_child != b.layout_child
}

fn polygon_other_differs(a: &PolygonNodeRec, b: &PolygonNodeRec) -> bool {
    a.active != b.active
        || a.mask != b.mask
        || a.effects != b.effects
        || a.points != b.points
        || a.corner_radius != b.corner_radius
        || a.stroke_style != b.stroke_style
        || a.stroke_width != b.stroke_width
        || a.layout_child != b.layout_child
}

fn line_other_differs(a: &LineNodeRec, b: &LineNodeRec) -> bool {
    a.active != b.active
        || a.mask != b.mask
        || a.effects != b.effects
        || a.size != b.size
        || a.stroke_width != b.stroke_width
        || a.stroke_cap != b.stroke_cap
        || a.stroke_miter_limit != b.stroke_miter_limit
        || a.stroke_dash_array != b.stroke_dash_array
        || a._data_stroke_align != b._data_stroke_align
        || a.marker_start_shape != b.marker_start_shape
        || a.marker_end_shape != b.marker_end_shape
        || a.layout_child != b.layout_child
}

fn image_other_differs(a: &ImageNodeRec, b: &ImageNodeRec) -> bool {
    a.active != b.active
        || a.mask != b.mask
        || a.effects != b.effects
        || a.size != b.size
        || a.corner_radius != b.corner_radius
        || a.corner_smoothing != b.corner_smoothing
        || a.fill != b.fill
        || a.stroke_style != b.stroke_style
        || a.stroke_width != b.stroke_width
        || a.image != b.image
        || a.layout_child != b.layout_child
}

fn path_other_differs(a: &PathNodeRec, b: &PathNodeRec) -> bool {
    a.active != b.active
        || a.mask != b.mask
        || a.effects != b.effects
        || a.data != b.data
        || a.stroke_style != b.stroke_style
        || a.stroke_width != b.stroke_width
        || a.layout_child != b.layout_child
}

fn boolean_operation_other_differs(
    a: &BooleanPathOperationNodeRec,
    b: &BooleanPathOperationNodeRec,
) -> bool {
    a.active != b.active
        || a.mask != b.mask
        || a.effects != b.effects
        || a.op != b.op
        || a.corner_radius != b.corner_radius
        || a.stroke_style != b.stroke_style
        || a.stroke_width != b.stroke_width
}

fn markdown_embed_other_differs(a: &MarkdownEmbedNodeRec, b: &MarkdownEmbedNodeRec) -> bool {
    a.active != b.active
        || a.mask != b.mask
        || a.effects != b.effects
        || a.width != b.width
        || a.height != b.height
        || a.corner_radius != b.corner_radius
        || a.markdown != b.markdown
        || a.layout_child != b.layout_child
}

fn html_embed_other_differs(a: &HTMLEmbedNodeRec, b: &HTMLEmbedNodeRec) -> bool {
    a.active != b.active
        || a.mask != b.mask
        || a.effects != b.effects
        || a.size != b.size
        || a.corner_radius != b.corner_radius
        || a.html != b.html
        || a.layout_child != b.layout_child
}

fn error_other_differs(a: &ErrorNodeRec, b: &ErrorNodeRec) -> bool {
    a.active != b.active || a.size != b.size || a.error != b.error
}

fn group_other_differs(a: &GroupNodeRec, b: &GroupNodeRec) -> bool {
    a.active != b.active || a.mask != b.mask
}

fn container_other_differs(a: &ContainerNodeRec, b: &ContainerNodeRec) -> bool {
    // Note: `rotation` and `position` live in the Motion lens (see
    // lens::motion_of) — a change in either alone counts as Geometry,
    // not Full.
    a.active != b.active
        || a.mask != b.mask
        || a.layout_container != b.layout_container
        || a.layout_dimensions != b.layout_dimensions
        || a.layout_child != b.layout_child
        || a.corner_radius != b.corner_radius
        || a.corner_smoothing != b.corner_smoothing
        || a.stroke_style != b.stroke_style
        || a.stroke_width != b.stroke_width
        || a.effects != b.effects
        || a.clip != b.clip
}

fn tray_other_differs(a: &TrayNodeRec, b: &TrayNodeRec) -> bool {
    // `rotation` and `position` handled by the Motion lens; see
    // `container_other_differs` above.
    a.active != b.active
        || a.mask != b.mask
        || a.layout_dimensions != b.layout_dimensions
        || a.corner_radius != b.corner_radius
        || a.corner_smoothing != b.corner_smoothing
        || a.stroke_style != b.stroke_style
        || a.stroke_width != b.stroke_width
}

fn initial_container_other_differs(
    a: &InitialContainerNodeRec,
    b: &InitialContainerNodeRec,
) -> bool {
    a.active != b.active
        || a.layout_mode != b.layout_mode
        || a.layout_direction != b.layout_direction
        || a.layout_wrap != b.layout_wrap
        || a.layout_main_axis_alignment != b.layout_main_axis_alignment
        || a.layout_cross_axis_alignment != b.layout_cross_axis_alignment
        || a.padding != b.padding
        || a.layout_gap != b.layout_gap
}

#[cfg(test)]
mod tests {
    // See cg crate tests for end-to-end verification. The per-variant
    // `*_other_differs` helpers are intentionally trivial field
    // comparisons and need no unit-level test.
}
