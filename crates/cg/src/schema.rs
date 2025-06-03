use crate::transform::AffineTransform;
use std::collections::HashMap;

pub type NodeId = String;

#[derive(Debug, Clone, Copy)]
pub struct Color(pub u8, pub u8, pub u8, pub u8);

#[derive(Debug, Clone, Copy)]
pub struct GradientStop {
    /// 0.0 = start, 1.0 = end
    pub offset: f32,
    pub color: Color,
}

#[derive(Debug, Clone)]
pub enum Paint {
    Solid(SolidPaint),
    LinearGradient(LinearGradientPaint),
    RadialGradient(RadialGradientPaint),
}

#[derive(Debug, Clone)]
pub struct SolidPaint {
    pub color: Color,
}

#[derive(Debug, Clone)]
pub struct LinearGradientPaint {
    pub id: String,
    pub transform: super::transform::AffineTransform,
    pub stops: Vec<GradientStop>,
}

#[derive(Debug, Clone)]
pub struct RadialGradientPaint {
    pub id: String,
    pub transform: super::transform::AffineTransform,
    pub stops: Vec<GradientStop>,
}

#[derive(Debug, Clone)]
pub struct Size {
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Copy)]
pub struct RectangularCornerRadius {
    pub tl: f32,
    pub tr: f32,
    pub bl: f32,
    pub br: f32,
}

#[derive(Debug, Clone)]
pub enum Node {
    Container(ContainerNode),
    Rectangle(RectNode),
    Ellipse(EllipseNode),
    Polygon(PolygonNode),
    RegularPolygon(RegularPolygonNode),
    Text(TextNode),
}

#[derive(Debug, Clone)]
pub struct BaseNode {
    pub id: NodeId,
    pub name: String,
    pub active: bool,
}

#[derive(Debug, Clone)]
pub struct ContainerNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub children: Vec<NodeId>,
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct LineNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size, // height is always 0 (ignored)
    pub stroke: Paint,
    pub stroke_width: f32,
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct RectNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub corner_radius: RectangularCornerRadius,
    pub fill: Paint,
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct ImageNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub corner_radius: RectangularCornerRadius,
    pub src: String,
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct EllipseNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub fill: Paint,
    pub stroke: Paint,
    pub stroke_width: f32,
    pub opacity: f32,
}

/// A polygon shape defined by a list of absolute 2D points, following the SVG `<polygon>` model.
///
/// ## Characteristics
/// - Always **closed**: The shape is implicitly closed by connecting the last point back to the first.
/// - For **open shapes**, use a different type such as [`PathNode`] or a potential `PolylineNode`.
///
/// ## Reference
/// Mirrors the behavior of the SVG `<polygon>` element:  
/// https://developer.mozilla.org/en-US/docs/Web/SVG/Element/polygon
#[derive(Debug, Clone)]
pub struct PolygonNode {
    /// Common base metadata and identity.
    pub base: BaseNode,

    /// 2D affine transform matrix applied to the shape.
    pub transform: AffineTransform,

    /// The list of absolute coordinates (x, y) defining the polygon vertices.
    pub points: Vec<(f32, f32)>,

    /// The paint used to fill the interior of the polygon.
    pub fill: Paint,

    /// The stroke paint used to outline the polygon.
    pub stroke: Paint,

    /// The stroke width used to outline the polygon.
    pub stroke_width: f32,

    /// Opacity applied to the polygon shape (`0.0` - transparent, `1.0` - opaque).
    pub opacity: f32,
}

/// A node representing a regular polygon (triangle, square, pentagon, etc.)
/// that fits inside a bounding box defined by `size`, optionally transformed.
///
/// The polygon is defined by `point_count` (number of sides), and is centered
/// within the box, with even and odd point counts having slightly different
/// initial orientations:
/// - Odd `point_count` (e.g. triangle) aligns the top point to the vertical center top.
/// - Even `point_count` aligns the top edge flat.
///
/// The actual rendering is derived, not stored. Rotation should be applied via `transform`.
#[derive(Debug, Clone)]
pub struct RegularPolygonNode {
    /// Core identity + metadata
    pub base: BaseNode,

    /// Affine transform applied to this node
    pub transform: AffineTransform,

    /// Bounding box size the polygon is fit into
    pub size: Size,

    /// Number of equally spaced points (>= 3)
    pub point_count: usize,

    /// Fill paint (solid or gradient)
    pub fill: Paint,

    /// The stroke paint used to outline the polygon.
    pub stroke: Paint,

    /// The stroke width used to outline the polygon.
    pub stroke_width: f32,

    /// Overall node opacity (0.0–1.0)
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct TextNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub text: String,
    pub font_size: f32,
    pub fill: Paint,
    pub opacity: f32,
}

// Example doc tree container
pub type NodeMap = HashMap<NodeId, Node>;
