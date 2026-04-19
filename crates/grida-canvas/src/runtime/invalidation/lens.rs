//! Lens accessors for [`Node`] variants.
//!
//! Many node variants share identical "shape" when viewed through a
//! particular perspective — almost every variant exposes an opacity,
//! blend mode, and fills; most leaf variants have a single
//! `AffineTransform`. These lenses give the differ a uniform way to
//! read that common state without writing the same match expression
//! per field.
//!
//! Variants that don't have a particular field return the default
//! value for that field (`None` for options, `1.0` for opacity,
//! `PassThrough` for blend mode, etc.). This keeps the differ's
//! classification logic uniform — a missing field never registers as
//! a difference from another missing field.
//!
//! [`Motion`] uniformly covers both positioning models — leaf nodes'
//! `AffineTransform` and `Container`/`Tray` `position + rotation` —
//! so a Container position change registers as the same "Geometry"
//! motion as a leaf transform change.

use crate::cg::prelude::*;
use crate::node::schema::*;
use math2::transform::AffineTransform;

// ---------------------------------------------------------------------------
// Motion lens — the node's own rigid-body position in space.
// ---------------------------------------------------------------------------

/// A uniform "where is this node?" view across variants.
///
/// Two fingerprints are equal iff the node's *own* placement in its
/// parent's space is unchanged — regardless of whether the variant
/// expresses that placement as an `AffineTransform` (leaf variants) or
/// as a `position + rotation` pair (Container, Tray).
///
/// This lens drives the Geometry fast path. Whenever it reports a
/// difference but every other field of the node is unchanged, the
/// change is a rigid-body move — children's local placement is
/// unaffected, only their world transforms need re-deriving.
#[derive(Debug, PartialEq)]
pub enum Motion<'a> {
    /// Leaf variants with an `AffineTransform` field.
    Affine(AffineTransform),
    /// Variants whose transform is optional (`Group`,
    /// `BooleanOperation`).
    OptionAffine(Option<AffineTransform>),
    /// Layout-positioned variants (`Container`, `Tray`). Rotation is
    /// a separate scalar.
    Positioned {
        position: &'a LayoutPositioningBasis,
        rotation: f32,
    },
    /// Variants with no node-level motion (`InitialContainer`).
    Stationary,
}

pub fn motion_of(node: &Node) -> Motion<'_> {
    match node {
        Node::Rectangle(n) => Motion::Affine(n.transform),
        Node::Ellipse(n) => Motion::Affine(n.transform),
        Node::RegularPolygon(n) => Motion::Affine(n.transform),
        Node::RegularStarPolygon(n) => Motion::Affine(n.transform),
        Node::Line(n) => Motion::Affine(n.transform),
        Node::TextSpan(n) => Motion::Affine(n.transform),
        Node::AttributedText(n) => Motion::Affine(n.transform),
        Node::Path(n) => Motion::Affine(n.transform),
        Node::Polygon(n) => Motion::Affine(n.transform),
        Node::Image(n) => Motion::Affine(n.transform),
        Node::Error(n) => Motion::Affine(n.transform),
        Node::Vector(n) => Motion::Affine(n.transform),
        Node::MarkdownEmbed(n) => Motion::Affine(n.transform),
        Node::HTMLEmbed(n) => Motion::Affine(n.transform),
        Node::Group(n) => Motion::OptionAffine(n.transform),
        Node::BooleanOperation(n) => Motion::OptionAffine(n.transform),
        Node::Container(n) => Motion::Positioned {
            position: &n.position,
            rotation: n.rotation,
        },
        Node::Tray(n) => Motion::Positioned {
            position: &n.position,
            rotation: n.rotation,
        },
        Node::InitialContainer(_) => Motion::Stationary,
    }
}

// ---------------------------------------------------------------------------
// Paint lens
// ---------------------------------------------------------------------------

/// A minimal paint fingerprint used by [`paint_differs`].
///
/// These are the fields a Paint-kind change is allowed to touch. If
/// any other field changes, the classifier returns `Full`.
///
/// Note: `strokes` is included because changing stroke color (paint)
/// does not affect render bounds. Stroke width/style *do* affect
/// bounds, so those stay out of the lens and are compared as "other".
#[derive(Debug, PartialEq)]
pub struct PaintLens<'a> {
    pub opacity: f32,
    pub blend_mode: LayerBlendMode,
    pub fills: Option<&'a Paints>,
    pub strokes: Option<&'a Paints>,
}

/// Paint fingerprint for any node variant.
///
/// Variants without a given field return the field's default. Paint-
/// unaware variants (`InitialContainer`) return a constant fingerprint
/// so paint diff always reports `false` for them.
pub fn paint_of(node: &Node) -> PaintLens<'_> {
    match node {
        Node::Rectangle(n) => PaintLens {
            opacity: n.opacity,
            blend_mode: n.blend_mode,
            fills: Some(&n.fills),
            strokes: Some(&n.strokes),
        },
        Node::Ellipse(n) => PaintLens {
            opacity: n.opacity,
            blend_mode: n.blend_mode,
            fills: Some(&n.fills),
            strokes: Some(&n.strokes),
        },
        Node::RegularPolygon(n) => PaintLens {
            opacity: n.opacity,
            blend_mode: n.blend_mode,
            fills: Some(&n.fills),
            strokes: Some(&n.strokes),
        },
        Node::RegularStarPolygon(n) => PaintLens {
            opacity: n.opacity,
            blend_mode: n.blend_mode,
            fills: Some(&n.fills),
            strokes: Some(&n.strokes),
        },
        Node::Polygon(n) => PaintLens {
            opacity: n.opacity,
            blend_mode: n.blend_mode,
            fills: Some(&n.fills),
            strokes: Some(&n.strokes),
        },
        Node::Line(n) => PaintLens {
            opacity: n.opacity,
            blend_mode: n.blend_mode,
            fills: None,
            strokes: Some(&n.strokes),
        },
        Node::Path(n) => PaintLens {
            opacity: n.opacity,
            blend_mode: n.blend_mode,
            fills: Some(&n.fills),
            strokes: Some(&n.strokes),
        },
        Node::Vector(n) => PaintLens {
            opacity: n.opacity,
            blend_mode: n.blend_mode,
            fills: Some(&n.fills),
            strokes: Some(&n.strokes),
        },
        Node::BooleanOperation(n) => PaintLens {
            opacity: n.opacity,
            blend_mode: n.blend_mode,
            fills: Some(&n.fills),
            strokes: Some(&n.strokes),
        },
        Node::Container(n) => PaintLens {
            opacity: n.opacity,
            blend_mode: n.blend_mode,
            fills: Some(&n.fills),
            strokes: Some(&n.strokes),
        },
        Node::Tray(n) => PaintLens {
            opacity: n.opacity,
            blend_mode: n.blend_mode,
            fills: Some(&n.fills),
            strokes: Some(&n.strokes),
        },
        Node::Group(n) => PaintLens {
            opacity: n.opacity,
            blend_mode: n.blend_mode,
            fills: None,
            strokes: None,
        },
        Node::MarkdownEmbed(n) => PaintLens {
            opacity: n.opacity,
            blend_mode: n.blend_mode,
            fills: Some(&n.fills),
            strokes: None,
        },
        Node::HTMLEmbed(n) => PaintLens {
            opacity: n.opacity,
            blend_mode: n.blend_mode,
            fills: Some(&n.fills),
            strokes: None,
        },
        Node::Error(n) => PaintLens {
            opacity: n.opacity,
            blend_mode: LayerBlendMode::PassThrough,
            fills: None,
            strokes: None,
        },
        // Image's fill is a single ImagePaint (not a Paints list);
        // treated as "other" because changing the image resource
        // affects geometry/picture in non-paint-only ways.
        Node::Image(n) => PaintLens {
            opacity: n.opacity,
            blend_mode: n.blend_mode,
            fills: None,
            strokes: Some(&n.strokes),
        },
        // Text paint lives inside `text_style` / `attributed_string`,
        // and changing those also changes layout. Treat the whole
        // thing as "other" for now — paint fast path is conservative.
        Node::TextSpan(_) | Node::AttributedText(_) => PaintLens {
            opacity: 1.0,
            blend_mode: LayerBlendMode::PassThrough,
            fills: None,
            strokes: None,
        },
        Node::InitialContainer(_) => PaintLens {
            opacity: 1.0,
            blend_mode: LayerBlendMode::PassThrough,
            fills: None,
            strokes: None,
        },
    }
}

// ---------------------------------------------------------------------------
// Composed differ helpers
// ---------------------------------------------------------------------------

/// True if the two nodes' rigid-body motion differs.
///
/// For leaf variants this is the `AffineTransform` field; for
/// Container/Tray it's the `(position, rotation)` pair. Drives the
/// [`ChangeKind::Geometry`](super::ChangeKind::Geometry) classifier.
pub fn motion_differs(a: &Node, b: &Node) -> bool {
    motion_of(a) != motion_of(b)
}

/// True if the two nodes' paint fingerprints differ.
pub fn paint_differs(a: &Node, b: &Node) -> bool {
    paint_of(a) != paint_of(b)
}
