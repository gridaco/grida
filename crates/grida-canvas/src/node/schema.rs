use crate::cg::types::*;
use crate::node::repository::NodeRepository;
use crate::painter::cvt;
use crate::sk::mappings::ToSkPath;
use math2::rect::Rectangle;
use math2::transform::AffineTransform;

pub type NodeId = String;

/// A 2D point with x and y coordinates.
#[derive(Debug, Clone, Copy)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

impl Point {
    /// Subtracts a scaled vector from this point.
    ///
    /// # Arguments
    ///
    /// * `other` - The point to subtract
    /// * `scale` - The scale factor to apply to the other point
    ///
    /// # Returns
    ///
    /// A new point representing the result of the vector operation
    pub fn subtract_scaled(&self, other: Point, scale: f32) -> Point {
        Point {
            x: self.x - other.x * scale,
            y: self.y - other.y * scale,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Size {
    pub width: f32,
    pub height: f32,
}

// region: Scene
#[derive(Debug, Clone)]
pub struct Scene {
    pub id: String,
    pub name: String,
    pub transform: AffineTransform,
    pub children: Vec<NodeId>,
    pub nodes: NodeRepository,
    pub background_color: Option<Color>,
}

// endregion

// region: Node Definitions

#[derive(Debug, Clone)]
pub enum Node {
    Error(ErrorNode),
    Group(GroupNode),
    Container(ContainerNode),
    Rectangle(RectangleNode),
    Ellipse(EllipseNode),
    Polygon(PolygonNode),
    RegularPolygon(RegularPolygonNode),
    RegularStarPolygon(RegularStarPolygonNode),
    Line(LineNode),
    TextSpan(TextSpanNode),
    SVGPath(SVGPathNode),
    BooleanOperation(BooleanPathOperationNode),
    Image(ImageNode),
}

// node trait
pub trait NodeTrait {
    fn id(&self) -> NodeId;
    fn name(&self) -> String;
}

impl NodeTrait for Node {
    fn id(&self) -> NodeId {
        match self {
            Node::Error(n) => n.base.id.clone(),
            Node::Group(n) => n.base.id.clone(),
            Node::Container(n) => n.base.id.clone(),
            Node::Rectangle(n) => n.base.id.clone(),
            Node::Ellipse(n) => n.base.id.clone(),
            Node::Polygon(n) => n.base.id.clone(),
            Node::RegularPolygon(n) => n.base.id.clone(),
            Node::RegularStarPolygon(n) => n.base.id.clone(),
            Node::Line(n) => n.base.id.clone(),
            Node::TextSpan(n) => n.base.id.clone(),
            Node::SVGPath(n) => n.base.id.clone(),
            Node::BooleanOperation(n) => n.base.id.clone(),
            Node::Image(n) => n.base.id.clone(),
        }
    }

    fn name(&self) -> String {
        match self {
            Node::Error(n) => n.base.name.clone(),
            Node::Group(n) => n.base.name.clone(),
            Node::Container(n) => n.base.name.clone(),
            Node::Rectangle(n) => n.base.name.clone(),
            Node::Ellipse(n) => n.base.name.clone(),
            Node::Polygon(n) => n.base.name.clone(),
            Node::RegularPolygon(n) => n.base.name.clone(),
            Node::RegularStarPolygon(n) => n.base.name.clone(),
            Node::Line(n) => n.base.name.clone(),
            Node::TextSpan(n) => n.base.name.clone(),
            Node::SVGPath(n) => n.base.name.clone(),
            Node::BooleanOperation(n) => n.base.name.clone(),
            Node::Image(n) => n.base.name.clone(),
        }
    }
}

pub trait NodeFillsMixin {
    fn set_fill(&mut self, fill: Paint);
    fn set_fills(&mut self, fills: Vec<Paint>);
}

pub trait NodeStrokesMixin {
    fn set_stroke(&mut self, stroke: Paint);
    fn set_strokes(&mut self, strokes: Vec<Paint>);
}

pub trait NodeGeometryMixin {
    fn rect(&self) -> Rectangle;
    /// if there is any valud stroke that should be taken into account for rendering, return true.
    /// stroke_width > 0.0 and at least one stroke with opacity > 0.0.
    fn has_stroke_geometry(&self) -> bool;

    fn render_bounds_stroke_width(&self) -> f32;
}

/// Intrinsic size node is a node that has a fixed size, and can be rendered soley on its own.
#[derive(Debug, Clone)]
pub enum IntrinsicSizeNode {
    Error(ErrorNode),
    Container(ContainerNode),
    Rectangle(RectangleNode),
    Ellipse(EllipseNode),
    Polygon(PolygonNode),
    RegularPolygon(RegularPolygonNode),
    RegularStarPolygon(RegularStarPolygonNode),
    Line(LineNode),
    TextSpan(TextSpanNode),
    Path(SVGPathNode),
    Image(ImageNode),
}

#[derive(Debug, Clone)]
pub enum LeafNode {
    Error(ErrorNode),
    Rectangle(RectangleNode),
    Ellipse(EllipseNode),
    Polygon(PolygonNode),
    RegularPolygon(RegularPolygonNode),
    RegularStarPolygon(RegularStarPolygonNode),
    Line(LineNode),
    TextSpan(TextSpanNode),
    Path(SVGPathNode),
    Image(ImageNode),
}

#[derive(Debug, Clone)]
pub struct BaseNode {
    pub id: NodeId,
    pub name: String,
    pub active: bool,
}

#[derive(Debug, Clone)]
pub struct ErrorNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub error: String,
    pub opacity: f32,
}

impl ErrorNode {
    pub fn rect(&self) -> Rectangle {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: self.size.width,
            height: self.size.height,
        }
    }
}

#[derive(Debug, Clone)]
pub struct GroupNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub children: Vec<NodeId>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

#[derive(Debug, Clone)]
pub struct ContainerNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub corner_radius: RectangularCornerRadius,
    pub children: Vec<NodeId>,
    pub fills: Vec<Paint>,
    pub strokes: Vec<Paint>,
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effect: Option<FilterEffect>,
    pub clip: bool,
}

impl NodeFillsMixin for ContainerNode {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = vec![fill];
    }

    fn set_fills(&mut self, fills: Vec<Paint>) {
        self.fills = fills;
    }
}

impl NodeGeometryMixin for ContainerNode {
    fn rect(&self) -> Rectangle {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: self.size.width,
            height: self.size.height,
        }
    }

    fn has_stroke_geometry(&self) -> bool {
        self.stroke_width > 0.0 && self.strokes.iter().any(|s| s.opacity() > 0.0)
    }

    fn render_bounds_stroke_width(&self) -> f32 {
        if self.has_stroke_geometry() {
            self.stroke_width
        } else {
            0.0
        }
    }
}

#[derive(Debug, Clone)]
pub struct RectangleNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub corner_radius: RectangularCornerRadius,
    pub fills: Vec<Paint>,
    pub strokes: Vec<Paint>,
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effect: Option<FilterEffect>,
}

impl NodeFillsMixin for RectangleNode {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = vec![fill];
    }

    fn set_fills(&mut self, fills: Vec<Paint>) {
        self.fills = fills;
    }
}

impl NodeGeometryMixin for RectangleNode {
    fn rect(&self) -> Rectangle {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: self.size.width,
            height: self.size.height,
        }
    }

    fn has_stroke_geometry(&self) -> bool {
        self.stroke_width > 0.0 && self.strokes.iter().any(|s| s.opacity() > 0.0)
    }

    fn render_bounds_stroke_width(&self) -> f32 {
        if self.has_stroke_geometry() {
            self.stroke_width
        } else {
            0.0
        }
    }
}

#[derive(Debug, Clone)]
pub struct LineNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size, // height is always 0 (ignored)
    pub strokes: Vec<Paint>,
    pub stroke_width: f32,
    pub _data_stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

impl LineNode {
    /// line's stoke align is no-op, it's always center. this value is ignored, but will be affected when line transforms to a path.
    pub fn get_stroke_align(&self) -> StrokeAlign {
        StrokeAlign::Center
    }
}

#[derive(Debug, Clone)]
pub struct ImageNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub corner_radius: RectangularCornerRadius,
    pub fill: ImagePaint,
    pub stroke: Paint,
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effect: Option<FilterEffect>,
    pub hash: String,
}

impl NodeGeometryMixin for ImageNode {
    fn rect(&self) -> Rectangle {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: self.size.width,
            height: self.size.height,
        }
    }

    fn has_stroke_geometry(&self) -> bool {
        self.stroke_width > 0.0 && self.stroke.opacity() > 0.0
    }

    fn render_bounds_stroke_width(&self) -> f32 {
        if self.has_stroke_geometry() {
            self.stroke_width
        } else {
            0.0
        }
    }
}

/// A node representing an ellipse shape.
///
/// Like RectangleNode, uses a top-left based coordinate system (x,y,width,height).
/// The ellipse is drawn within the bounding box defined by these coordinates.
#[derive(Debug, Clone)]
pub struct EllipseNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub fills: Vec<Paint>,
    pub strokes: Vec<Paint>,
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effect: Option<FilterEffect>,
}

impl NodeFillsMixin for EllipseNode {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = vec![fill];
    }

    fn set_fills(&mut self, fills: Vec<Paint>) {
        self.fills = fills;
    }
}

impl NodeGeometryMixin for EllipseNode {
    fn rect(&self) -> Rectangle {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: self.size.width,
            height: self.size.height,
        }
    }

    fn has_stroke_geometry(&self) -> bool {
        self.stroke_width > 0.0 && self.strokes.iter().any(|s| s.opacity() > 0.0)
    }

    fn render_bounds_stroke_width(&self) -> f32 {
        if self.has_stroke_geometry() {
            self.stroke_width
        } else {
            0.0
        }
    }
}

#[derive(Debug, Clone)]
pub struct BooleanPathOperationNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub op: BooleanPathOperation,
    pub children: Vec<NodeId>,
    pub fill: Paint,
    pub stroke: Option<Paint>,
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effect: Option<FilterEffect>,
}

///
/// SVG Path compatible path node.
///
#[derive(Debug, Clone)]
pub struct SVGPathNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub fill: Paint,
    pub data: String,
    pub stroke: Option<Paint>,
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effect: Option<FilterEffect>,
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

    /// The list of points defining the polygon vertices.
    pub points: Vec<Point>,

    /// The corner radius of the polygon.
    pub corner_radius: f32,

    /// The paint used to fill the interior of the polygon.
    pub fills: Vec<Paint>,

    /// The stroke paint used to outline the polygon.
    pub strokes: Vec<Paint>,

    /// The stroke width used to outline the polygon.
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,

    /// Opacity applied to the polygon shape (`0.0` - transparent, `1.0` - opaque).
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effect: Option<FilterEffect>,
    pub stroke_dash_array: Option<Vec<f32>>,
}

impl NodeFillsMixin for PolygonNode {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = vec![fill];
    }

    fn set_fills(&mut self, fills: Vec<Paint>) {
        self.fills = fills;
    }
}

impl NodeStrokesMixin for PolygonNode {
    fn set_stroke(&mut self, stroke: Paint) {
        self.strokes = vec![stroke];
    }

    fn set_strokes(&mut self, strokes: Vec<Paint>) {
        self.strokes = strokes;
    }
}

impl ToSkPath for PolygonNode {
    fn to_sk_path(&self) -> skia_safe::Path {
        cvt::sk_polygon_path(&self.points, self.corner_radius)
    }
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
///
/// For details on regular polygon mathematics, see: <https://mathworld.wolfram.com/RegularPolygon.html> (implementation varies)
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

    /// The corner radius of the polygon.
    pub corner_radius: f32,

    /// Fill paint (solid or gradient)
    pub fills: Vec<Paint>,

    /// The stroke paint used to outline the polygon.
    pub strokes: Vec<Paint>,

    /// The stroke width used to outline the polygon.
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    /// Overall node opacity (0.0–1.0)
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effect: Option<FilterEffect>,
    pub stroke_dash_array: Option<Vec<f32>>,
}

impl NodeFillsMixin for RegularPolygonNode {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = vec![fill];
    }

    fn set_fills(&mut self, fills: Vec<Paint>) {
        self.fills = fills;
    }
}

impl NodeGeometryMixin for RegularPolygonNode {
    fn rect(&self) -> Rectangle {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: self.size.width,
            height: self.size.height,
        }
    }

    fn has_stroke_geometry(&self) -> bool {
        self.stroke_width > 0.0 && self.strokes.iter().any(|s| s.opacity() > 0.0)
    }

    fn render_bounds_stroke_width(&self) -> f32 {
        if self.has_stroke_geometry() {
            self.stroke_width
        } else {
            0.0
        }
    }
}

impl RegularPolygonNode {
    pub fn to_polygon(&self) -> PolygonNode {
        let w = self.size.width;
        let h = self.size.height;
        let cx = w / 2.0;
        let cy = h / 2.0;
        let r = w.min(h) / 2.0;
        let angle_offset = if self.point_count % 2 == 0 {
            std::f32::consts::PI / self.point_count as f32
        } else {
            -std::f32::consts::PI / 2.0
        };

        let points: Vec<Point> = (0..self.point_count)
            .map(|i| {
                let theta = (i as f32 / self.point_count as f32) * 2.0 * std::f32::consts::PI
                    + angle_offset;
                let x = cx + r * theta.cos();
                let y = cy + r * theta.sin();
                Point { x, y }
            })
            .collect();

        PolygonNode {
            base: self.base.clone(),
            transform: self.transform,
            points,
            corner_radius: self.corner_radius,
            fills: self.fills.clone(),
            strokes: self.strokes.clone(),
            stroke_width: self.stroke_width,
            stroke_align: self.stroke_align,
            opacity: self.opacity,
            blend_mode: self.blend_mode,
            effect: self.effect.clone(),
            stroke_dash_array: self.stroke_dash_array.clone(),
        }
    }
}

/// A regular star polygon node rendered within a bounding box.
///
/// This node represents a geometric star shape composed of alternating outer and inner vertices evenly spaced around a center,
/// forming a symmetric star with `point_count` spikes. Each spike is constructed by alternating between an outer point
/// (determined by the bounding box) and an inner point (scaled by `inner_radius`).
///
/// For details on star polygon mathematics, see: <https://mathworld.wolfram.com/StarPolygon.html>
#[derive(Debug, Clone)]
pub struct RegularStarPolygonNode {
    /// Core identity + metadata
    pub base: BaseNode,

    /// Affine transform applied to this node
    pub transform: AffineTransform,

    /// Bounding box size the polygon is fit into
    pub size: Size,

    /// Number of equally spaced points (>= 3)
    pub point_count: usize,

    /// The `inner_radius` defines the radius of the inner vertices of the star, relative to the center.
    ///
    /// It controls the sharpness of the star's angles:
    /// - A smaller value (closer to 0) results in sharper, spikier points.
    /// - A larger value (closer to or greater than the outer radius) makes the shape closer to a regular polygon with 2 × point_count edges.
    ///
    /// The outer radius is defined by the bounding box (`size`), while the `inner_radius` places the inner points on a second concentric circle.
    /// Unlike `corner_radius`, which affects the rounding of outer corners, `inner_radius` controls the depth of the inner angles between the points.
    pub inner_radius: f32,

    /// The corner radius of the polygon.
    pub corner_radius: f32,

    /// Fill paint (solid or gradient)
    pub fills: Vec<Paint>,

    /// The stroke paint used to outline the polygon.
    pub strokes: Vec<Paint>,

    /// The stroke width used to outline the polygon.
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    /// Overall node opacity (0.0–1.0)
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effect: Option<FilterEffect>,
    pub stroke_dash_array: Option<Vec<f32>>,
}

impl NodeFillsMixin for RegularStarPolygonNode {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = vec![fill];
    }

    fn set_fills(&mut self, fills: Vec<Paint>) {
        self.fills = fills;
    }
}

impl NodeGeometryMixin for RegularStarPolygonNode {
    fn rect(&self) -> Rectangle {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: self.size.width,
            height: self.size.height,
        }
    }

    fn has_stroke_geometry(&self) -> bool {
        // TODO: implement this
        true
    }

    fn render_bounds_stroke_width(&self) -> f32 {
        if self.has_stroke_geometry() {
            self.stroke_width
        } else {
            0.0
        }
    }
}

impl RegularStarPolygonNode {
    pub fn to_polygon(&self) -> PolygonNode {
        let w = self.size.width;
        let h = self.size.height;
        let cx = w / 2.0;
        let cy = h / 2.0;
        let outer_r = cx.min(cy);
        let inner_r = outer_r * self.inner_radius;
        let step = std::f32::consts::PI / self.point_count as f32;
        let start_angle = -std::f32::consts::PI / 2.0;

        let mut points = Vec::with_capacity(self.point_count * 2);
        for i in 0..(self.point_count * 2) {
            let angle = start_angle + i as f32 * step;
            let r = if i % 2 == 0 { outer_r } else { inner_r };
            let x = cx + r * angle.cos();
            let y = cy + r * angle.sin();
            points.push(Point { x, y });
        }

        PolygonNode {
            base: self.base.clone(),
            transform: self.transform,
            points,
            corner_radius: self.corner_radius,
            fills: self.fills.clone(),
            strokes: self.strokes.clone(),
            stroke_width: self.stroke_width,
            stroke_align: self.stroke_align,
            opacity: self.opacity,
            blend_mode: self.blend_mode,
            effect: self.effect.clone(),
            stroke_dash_array: self.stroke_dash_array.clone(),
        }
    }
}

/// A node representing a plain text block (non-rich).
/// For multi-style content, see `RichTextNode` (not implemented yet).
#[derive(Debug, Clone)]
pub struct TextSpanNode {
    /// Metadata and identity.
    pub base: BaseNode,

    /// Transform applied to the text container.
    pub transform: AffineTransform,

    /// Layout bounds (used for wrapping and alignment).
    pub size: Size,

    /// Text content (plain UTF-8).
    pub text: String,

    /// Font & fill appearance.
    pub text_style: TextStyle,

    /// Horizontal alignment.
    pub text_align: TextAlign,

    /// Vertical alignment.
    pub text_align_vertical: TextAlignVertical,

    /// Fill paint (solid or gradient)
    pub fill: Paint,

    /// Stroke paint (solid or gradient)
    pub stroke: Option<Paint>,

    /// Stroke width
    pub stroke_width: Option<f32>,
    pub stroke_align: StrokeAlign,
    /// Overall node opacity.
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

#[derive(Debug, Clone)]
#[deprecated(note = "Not implemented yet")]
pub struct TextNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub text: String,
    pub font_size: f32,
    pub fill: Paint,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

// endregion
