use crate::cg::types::*;
use crate::node::repository::NodeRepository;
use crate::shape::*;
use math2::rect::Rectangle;
use math2::transform::AffineTransform;

pub type NodeId = String;

#[derive(Debug, Clone)]
pub struct LayerEffects {
    /// single layer blur is supported per layer
    /// layer blur is applied after all other effects
    pub blur: Option<FeGaussianBlur>,
    /// single backdrop blur is supported per layer
    pub backdrop_blur: Option<FeGaussianBlur>,
    /// multiple shadows are supported per layer (drop shadow, inner shadow)
    pub shadows: Vec<FilterShadowEffect>,
}

impl LayerEffects {
    pub fn new_empty() -> Self {
        Self {
            blur: None,
            backdrop_blur: None,
            shadows: vec![],
        }
    }

    /// Convert a list of filter effects into a layer effects object.
    /// if multiple effects that is not supported, the last effect will be used.
    pub fn from_array(effects: Vec<FilterEffect>) -> Self {
        let mut layer_effects = Self::new_empty();
        for effect in effects {
            match effect {
                FilterEffect::LayerBlur(blur) => layer_effects.blur = Some(blur),
                FilterEffect::BackdropBlur(blur) => layer_effects.backdrop_blur = Some(blur),
                FilterEffect::DropShadow(shadow) => layer_effects
                    .shadows
                    .push(FilterShadowEffect::DropShadow(shadow)),
                FilterEffect::InnerShadow(shadow) => layer_effects
                    .shadows
                    .push(FilterShadowEffect::InnerShadow(shadow)),
            }
        }
        layer_effects
    }

    #[deprecated(note = "will be removed")]
    pub fn fallback_first_any_effect(&self) -> Option<FilterEffect> {
        if let Some(blur) = self.blur {
            return Some(FilterEffect::LayerBlur(blur));
        }
        if let Some(backdrop_blur) = self.backdrop_blur {
            return Some(FilterEffect::BackdropBlur(backdrop_blur));
        }
        if !self.shadows.is_empty() {
            return Some(self.shadows.last().unwrap().clone().into());
        }
        None
    }
}

#[derive(Debug, Clone)]
pub struct StrokeStyle {
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,
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
    pub children: Vec<NodeId>,
    pub nodes: NodeRepository,
    pub background_color: Option<CGColor>,
}

// endregion

// region: Node Definitions

/// flat unknown node properties
/// this is a standard spec for each exposed property names and types.
pub struct UnknownNodeProperties {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
    pub transform: AffineTransform,
    pub children: Option<Vec<NodeId>>,
    pub opacity: f32,
    pub blend_mode: BlendMode,

    pub size: Option<Size>,
    pub point_count: Option<usize>,
    pub inner_radius: f32,

    /// start angle in degrees
    /// default is 0.0
    pub start_angle: f32,
    /// sweep angle in degrees (end_angle = start_angle + angle)
    pub angle: Option<f32>,

    /// The scalar corner radius of the shape.
    pub corner_radius: f32,

    /// The top-left corner [Radius] of the rectangular shape.
    pub corner_radius_top_left: Option<Radius>,
    /// The top-right corner [Radius] of the rectangular shape.
    pub corner_radius_top_right: Option<Radius>,
    /// The bottom-right corner [Radius] of the rectangular shape.
    pub corner_radius_bottom_right: Option<Radius>,
    /// The bottom-left corner [Radius] of the rectangular shape.
    pub corner_radius_bottom_left: Option<Radius>,
    // #endregion
    /// The paint used to fill the interior of the shape.
    pub fills: Vec<Paint>,

    /// The stroke paint used to outline the shape.
    pub strokes: Vec<Paint>,
    /// The stroke width used to outline the shape.
    pub stroke_width: f32,
    /// The stroke align used to outline the shape.
    pub stroke_align: StrokeAlign,
    /// The stroke dash array used to outline the shape.
    pub stroke_dash_array: Option<Vec<f32>>,

    /// The effects applied to the shape.
    pub effects: LayerEffects,

    /// Text content (plain UTF-8).
    pub text: Option<String>,
    /// Font & fill appearance.
    pub text_style: Option<TextStyle>,
    /// Horizontal alignment.
    pub text_align: Option<TextAlign>,
    /// Vertical alignment.
    pub text_align_vertical: Option<TextAlignVertical>,
}

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
    Vector(VectorNode),
    BooleanOperation(BooleanPathOperationNode),
    Image(ImageNode),
}

// node trait
pub trait NodeTrait {
    fn id(&self) -> NodeId;
    fn name(&self) -> Option<String>;
}

impl NodeTrait for Node {
    fn id(&self) -> NodeId {
        match self {
            Node::Error(n) => n.id.clone(),
            Node::Group(n) => n.id.clone(),
            Node::Container(n) => n.id.clone(),
            Node::Rectangle(n) => n.id.clone(),
            Node::Ellipse(n) => n.id.clone(),
            Node::Polygon(n) => n.id.clone(),
            Node::RegularPolygon(n) => n.id.clone(),
            Node::RegularStarPolygon(n) => n.id.clone(),
            Node::Line(n) => n.id.clone(),
            Node::TextSpan(n) => n.id.clone(),
            Node::SVGPath(n) => n.id.clone(),
            Node::Vector(n) => n.id.clone(),
            Node::BooleanOperation(n) => n.id.clone(),
            Node::Image(n) => n.id.clone(),
        }
    }

    fn name(&self) -> Option<String> {
        match self {
            Node::Error(n) => n.name.clone(),
            Node::Group(n) => n.name.clone(),
            Node::Container(n) => n.name.clone(),
            Node::Rectangle(n) => n.name.clone(),
            Node::Ellipse(n) => n.name.clone(),
            Node::Polygon(n) => n.name.clone(),
            Node::RegularPolygon(n) => n.name.clone(),
            Node::RegularStarPolygon(n) => n.name.clone(),
            Node::Line(n) => n.name.clone(),
            Node::TextSpan(n) => n.name.clone(),
            Node::SVGPath(n) => n.name.clone(),
            Node::Vector(n) => n.name.clone(),
            Node::BooleanOperation(n) => n.name.clone(),
            Node::Image(n) => n.name.clone(),
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

pub trait NodeShapeMixin {
    fn to_shape(&self) -> Shape;
    fn to_path(&self) -> skia_safe::Path;
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
    SVGPath(SVGPathNode),
    Vector(VectorNode),
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
    SVGPath(SVGPathNode),
    Vector(VectorNode),
    Image(ImageNode),
}

#[derive(Debug, Clone)]
pub struct ErrorNode {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
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
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
    pub transform: AffineTransform,
    pub children: Vec<NodeId>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

#[derive(Debug, Clone)]
pub struct ContainerNode {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
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
    pub effects: LayerEffects,
    pub clip: bool,
}

impl ContainerNode {
    pub fn to_own_shape(&self) -> RRectShape {
        RRectShape {
            width: self.size.width,
            height: self.size.height,
            corner_radius: self.corner_radius,
        }
    }
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

impl NodeShapeMixin for ContainerNode {
    fn to_shape(&self) -> Shape {
        Shape::RRect(self.to_own_shape())
    }

    fn to_path(&self) -> skia_safe::Path {
        build_rrect_path(&self.to_own_shape())
    }
}

#[derive(Debug, Clone)]
pub struct RectangleNode {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
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
    pub effects: LayerEffects,
}

impl RectangleNode {
    pub fn to_own_shape(&self) -> RRectShape {
        RRectShape {
            width: self.size.width,
            height: self.size.height,
            corner_radius: self.corner_radius,
        }
    }
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
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
    pub transform: AffineTransform,
    pub size: Size, // height is always 0 (ignored)
    pub strokes: Vec<Paint>,
    pub stroke_width: f32,
    pub _data_stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effects: LayerEffects,
}

impl LineNode {
    /// line's stoke align is no-op, it's always center. this value is ignored, but will be affected when line transforms to a path.
    pub fn get_stroke_align(&self) -> StrokeAlign {
        StrokeAlign::Center
    }
}

#[derive(Debug, Clone)]
pub struct ImageNode {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
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
    pub effects: LayerEffects,
    pub hash: String,
}

impl ImageNode {
    pub fn to_own_shape(&self) -> RRectShape {
        RRectShape {
            width: self.size.width,
            height: self.size.height,
            corner_radius: self.corner_radius,
        }
    }
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
///
/// ## Arc & Ring support
///
/// **3RD PARTY IMPLEMENTATIONS:**
/// - https://konvajs.org/api/Konva.Arc.html
/// - https://www.figma.com/plugin-docs/api/ArcData/
///
/// For details on arc mathematics, see: <https://mathworld.wolfram.com/Arc.html> (implementation varies)
#[derive(Debug, Clone)]
pub struct EllipseNode {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
    pub transform: AffineTransform,
    pub size: Size,
    pub fills: Vec<Paint>,
    pub strokes: Vec<Paint>,
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effects: LayerEffects,

    /// inner radius - 0 ~ 1
    pub inner_radius: Option<f32>,

    /// start angle in degrees
    /// default is 0.0
    pub start_angle: f32,

    /// sweep angle in degrees (end_angle = start_angle + angle)
    pub angle: Option<f32>,

    pub corner_radius: Option<f32>,
}

impl NodeFillsMixin for EllipseNode {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = vec![fill];
    }

    fn set_fills(&mut self, fills: Vec<Paint>) {
        self.fills = fills;
    }
}

impl NodeShapeMixin for EllipseNode {
    fn to_shape(&self) -> Shape {
        let w = self.size.width;
        let h = self.size.height;
        let angle = self.angle.unwrap_or(360.0);

        // check if art/ring data needs to be handled.
        // if either angle or inner radius is present.
        // if only inner radius is present (or angle is 360) => ring
        // if both are present => arc
        if self.inner_radius.is_some() || angle != 360.0 {
            if self.inner_radius.is_some() && angle == 360.0 {
                return Shape::EllipticalRing(EllipticalRingShape {
                    width: w,
                    height: h,
                    inner_radius_ratio: self.inner_radius.unwrap_or(0.0),
                });
            } else {
                return Shape::EllipticalRingSector(EllipticalRingSectorShape {
                    width: w,
                    height: h,
                    inner_radius_ratio: self.inner_radius.unwrap_or(0.0),
                    start_angle: self.start_angle,
                    angle: angle,
                    corner_radius: self.corner_radius.unwrap_or(0.0),
                });
            }
        }

        return Shape::Ellipse(EllipseShape {
            width: w,
            height: h,
        });
    }

    fn to_path(&self) -> skia_safe::Path {
        (&self.to_shape()).into()
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
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
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
    pub effects: LayerEffects,
}

///
/// Vector Network Node.
///
#[derive(Debug, Clone)]
pub struct VectorNode {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
    pub transform: AffineTransform,
    pub fill: Option<Paint>,
    pub network: VectorNetwork,
    pub strokes: Vec<Paint>,
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effects: LayerEffects,
}

///
/// SVG Path compatible path node.
///
#[derive(Debug, Clone)]
pub struct SVGPathNode {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
    pub transform: AffineTransform,
    pub fill: Paint,
    pub data: String,
    pub stroke: Option<Paint>,
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effects: LayerEffects,
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
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,

    /// 2D affine transform matrix applied to the shape.
    pub transform: AffineTransform,

    /// The list of points defining the polygon vertices.
    pub points: Vec<CGPoint>,

    /// The corner radius of the polygon.
    pub corner_radius: f32,

    /// The paint used to fill the interior of the polygon.
    pub fills: Vec<Paint>,

    /// The stroke paint used to outline the polygon.
    pub strokes: Vec<Paint>,

    /// The stroke width used to outline the polygon.
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,

    /// Opacity applied to the polygon shape (`0.0` - transparent, `1.0` - opaque).
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effects: LayerEffects,
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

impl PolygonNode {
    pub fn to_own_shape(&self) -> SimplePolygonShape {
        SimplePolygonShape {
            points: self.points.clone(),
            corner_radius: self.corner_radius,
        }
    }
}

impl NodeShapeMixin for PolygonNode {
    fn to_shape(&self) -> Shape {
        Shape::SimplePolygon(self.to_own_shape())
    }

    fn to_path(&self) -> skia_safe::Path {
        let shape = self.to_own_shape();
        build_simple_polygon_path(&shape)
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
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,

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
    pub stroke_dash_array: Option<Vec<f32>>,
    /// Overall node opacity (0.0–1.0)
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effects: LayerEffects,
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
    pub fn to_own_shape(&self) -> RegularPolygonShape {
        RegularPolygonShape {
            width: self.size.width,
            height: self.size.height,
            point_count: self.point_count,
            corner_radius: self.corner_radius,
        }
    }

    pub fn to_points(&self) -> Vec<CGPoint> {
        build_regular_polygon_points(&self.to_own_shape())
    }
}

impl NodeShapeMixin for RegularPolygonNode {
    fn to_shape(&self) -> Shape {
        Shape::RegularPolygon(self.to_own_shape())
    }

    fn to_path(&self) -> skia_safe::Path {
        build_simple_polygon_path(&SimplePolygonShape {
            points: self.to_points(),
            corner_radius: self.corner_radius,
        })
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
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,

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
    pub effects: LayerEffects,
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

impl NodeShapeMixin for RegularStarPolygonNode {
    fn to_shape(&self) -> Shape {
        Shape::RegularStarPolygon(self.to_own_shape())
    }

    fn to_path(&self) -> skia_safe::Path {
        build_star_path(&self.to_own_shape())
    }
}

impl RegularStarPolygonNode {
    pub fn to_points(&self) -> Vec<CGPoint> {
        build_star_points(&self.to_own_shape())
    }

    pub fn to_own_shape(&self) -> RegularStarShape {
        RegularStarShape {
            width: self.size.width,
            height: self.size.height,
            inner_radius_ratio: self.inner_radius,
            point_count: self.point_count,
            corner_radius: self.corner_radius,
        }
    }
}

/// A node representing a plain text block (non-rich).
/// For multi-style content, see `RichTextNode` (not implemented yet).
#[derive(Debug, Clone)]
pub struct TextSpanNode {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,

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
    pub effects: LayerEffects,
}

#[derive(Debug, Clone)]
#[deprecated(note = "Not implemented yet")]
pub struct TextNode {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
    pub transform: AffineTransform,
    pub size: Size,
    pub text: String,
    pub font_size: f32,
    pub fill: Paint,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

// endregion
