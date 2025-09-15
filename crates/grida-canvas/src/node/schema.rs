use crate::cg;
use crate::cg::types::*;
pub use crate::cg::types::{FontFeature, FontVariation};
use crate::node::repository::NodeRepository;
use crate::shape::*;
use crate::vectornetwork::*;
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
    /// Convert a list of filter effects into a layer effects object.
    /// if multiple effects that is not supported, the last effect will be used.
    pub fn from_array(effects: Vec<FilterEffect>) -> Self {
        let mut layer_effects = Self::default();
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

impl Default for LayerEffects {
    fn default() -> Self {
        Self {
            blur: None,
            backdrop_blur: None,
            shadows: vec![],
        }
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
    pub text_style: Option<TextStyleRec>,
    /// Horizontal alignment.
    pub text_align: Option<TextAlign>,
    /// Vertical alignment of text within its container height.
    ///
    /// See [`TextSpanNodeRec::text_align_vertical`] for detailed documentation
    /// on how vertical text alignment works in this system.
    pub text_align_vertical: Option<TextAlignVertical>,
}

#[derive(Debug, Clone)]
pub enum Node {
    Error(ErrorNodeRec),
    Group(GroupNodeRec),
    Container(ContainerNodeRec),
    Rectangle(RectangleNodeRec),
    Ellipse(EllipseNodeRec),
    Polygon(PolygonNodeRec),
    RegularPolygon(RegularPolygonNodeRec),
    RegularStarPolygon(RegularStarPolygonNodeRec),
    Line(LineNodeRec),
    TextSpan(TextSpanNodeRec),
    SVGPath(SVGPathNodeRec),
    Vector(VectorNodeRec),
    BooleanOperation(BooleanPathOperationNodeRec),
    Image(ImageNodeRec),
}

// node trait
pub trait NodeTrait {
    fn id(&self) -> NodeId;
    fn name(&self) -> Option<String>;
    fn active(&self) -> bool;
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

    fn active(&self) -> bool {
        match self {
            Node::Error(n) => n.active,
            Node::Group(n) => n.active,
            Node::Container(n) => n.active,
            Node::Rectangle(n) => n.active,
            Node::Ellipse(n) => n.active,
            Node::Polygon(n) => n.active,
            Node::RegularPolygon(n) => n.active,
            Node::RegularStarPolygon(n) => n.active,
            Node::Line(n) => n.active,
            Node::TextSpan(n) => n.active,
            Node::SVGPath(n) => n.active,
            Node::Vector(n) => n.active,
            Node::BooleanOperation(n) => n.active,
            Node::Image(n) => n.active,
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

pub trait NodeTransformMixin {
    fn x(&self) -> f32;
    fn y(&self) -> f32;
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
    fn to_vector_network(&self) -> VectorNetwork;
}

/// Intrinsic size node is a node that has a fixed size, and can be rendered soley on its own.
#[derive(Debug, Clone)]
pub enum IntrinsicSizeNode {
    Error(ErrorNodeRec),
    Container(ContainerNodeRec),
    Rectangle(RectangleNodeRec),
    Ellipse(EllipseNodeRec),
    Polygon(PolygonNodeRec),
    RegularPolygon(RegularPolygonNodeRec),
    RegularStarPolygon(RegularStarPolygonNodeRec),
    Line(LineNodeRec),
    SVGPath(SVGPathNodeRec),
    Vector(VectorNodeRec),
    Image(ImageNodeRec),
}

#[derive(Debug, Clone)]
pub enum LeafNode {
    Error(ErrorNodeRec),
    Rectangle(RectangleNodeRec),
    Ellipse(EllipseNodeRec),
    Polygon(PolygonNodeRec),
    RegularPolygon(RegularPolygonNodeRec),
    RegularStarPolygon(RegularStarPolygonNodeRec),
    Line(LineNodeRec),
    TextSpan(TextSpanNodeRec),
    SVGPath(SVGPathNodeRec),
    Vector(VectorNodeRec),
    Image(ImageNodeRec),
}

impl NodeTrait for LeafNode {
    fn id(&self) -> NodeId {
        match self {
            LeafNode::Error(n) => n.id.clone(),
            LeafNode::Rectangle(n) => n.id.clone(),
            LeafNode::Ellipse(n) => n.id.clone(),
            LeafNode::Polygon(n) => n.id.clone(),
            LeafNode::RegularPolygon(n) => n.id.clone(),
            LeafNode::RegularStarPolygon(n) => n.id.clone(),
            LeafNode::Line(n) => n.id.clone(),
            LeafNode::TextSpan(n) => n.id.clone(),
            LeafNode::SVGPath(n) => n.id.clone(),
            LeafNode::Vector(n) => n.id.clone(),
            LeafNode::Image(n) => n.id.clone(),
        }
    }

    fn name(&self) -> Option<String> {
        match self {
            LeafNode::Error(n) => n.name.clone(),
            LeafNode::Rectangle(n) => n.name.clone(),
            LeafNode::Ellipse(n) => n.name.clone(),
            LeafNode::Polygon(n) => n.name.clone(),
            LeafNode::RegularPolygon(n) => n.name.clone(),
            LeafNode::RegularStarPolygon(n) => n.name.clone(),
            LeafNode::Line(n) => n.name.clone(),
            LeafNode::TextSpan(n) => n.name.clone(),
            LeafNode::SVGPath(n) => n.name.clone(),
            LeafNode::Vector(n) => n.name.clone(),
            LeafNode::Image(n) => n.name.clone(),
        }
    }

    fn active(&self) -> bool {
        match self {
            LeafNode::Error(n) => n.active,
            LeafNode::Rectangle(n) => n.active,
            LeafNode::Ellipse(n) => n.active,
            LeafNode::Polygon(n) => n.active,
            LeafNode::RegularPolygon(n) => n.active,
            LeafNode::RegularStarPolygon(n) => n.active,
            LeafNode::Line(n) => n.active,
            LeafNode::TextSpan(n) => n.active,
            LeafNode::SVGPath(n) => n.active,
            LeafNode::Vector(n) => n.active,
            LeafNode::Image(n) => n.active,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ErrorNodeRec {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
    pub transform: AffineTransform,
    pub size: Size,
    pub error: String,
    pub opacity: f32,
}

impl NodeTransformMixin for ErrorNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

impl ErrorNodeRec {
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
pub struct GroupNodeRec {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
    pub transform: Option<AffineTransform>,
    pub children: Vec<NodeId>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

#[derive(Debug, Clone)]
pub struct ContainerNodeRec {
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
    /// Content-only clipping switch.
    ///
    /// When `true`, a clip region equal to this container's own rounded-rect shape is pushed
    /// **before painting descendants**, constraining all child rendering. The container's **own**
    /// stroke/border and outer effects are **not clipped** by this flag and are painted after
    /// the clip is popped.
    ///
    /// - Clips: children/descendants.
    /// - Does **not** clip: this node’s stroke/border (including outside-aligned strokes),
    ///   outlines, drop shadows. (Inner shadows remain bounded to the shape by definition.)
    ///
    /// This flag is intentionally equivalent to an **overflow/content** clip.
    /// If a future “shape clip (self + children)” is added, it will be modeled as a separate attribute.
    pub clip: ContainerClipFlag,
}

impl ContainerNodeRec {
    pub fn to_own_shape(&self) -> RRectShape {
        RRectShape {
            width: self.size.width,
            height: self.size.height,
            corner_radius: self.corner_radius,
        }
    }
}

impl NodeFillsMixin for ContainerNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = vec![fill];
    }

    fn set_fills(&mut self, fills: Vec<Paint>) {
        self.fills = fills;
    }
}

impl NodeTransformMixin for ContainerNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

impl NodeGeometryMixin for ContainerNodeRec {
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

impl NodeShapeMixin for ContainerNodeRec {
    fn to_shape(&self) -> Shape {
        Shape::RRect(self.to_own_shape())
    }

    fn to_path(&self) -> skia_safe::Path {
        build_rrect_path(&self.to_own_shape())
    }

    fn to_vector_network(&self) -> VectorNetwork {
        build_rrect_vector_network(&self.to_own_shape())
    }
}

#[derive(Debug, Clone)]
pub struct RectangleNodeRec {
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

impl RectangleNodeRec {
    pub fn to_own_shape(&self) -> RRectShape {
        RRectShape {
            width: self.size.width,
            height: self.size.height,
            corner_radius: self.corner_radius,
        }
    }
}

impl NodeFillsMixin for RectangleNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = vec![fill];
    }

    fn set_fills(&mut self, fills: Vec<Paint>) {
        self.fills = fills;
    }
}

impl NodeTransformMixin for RectangleNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

impl NodeGeometryMixin for RectangleNodeRec {
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

impl NodeShapeMixin for RectangleNodeRec {
    fn to_shape(&self) -> Shape {
        Shape::RRect(self.to_own_shape())
    }

    fn to_path(&self) -> skia_safe::Path {
        build_rrect_path(&self.to_own_shape())
    }

    fn to_vector_network(&self) -> VectorNetwork {
        build_rrect_vector_network(&self.to_own_shape())
    }
}

#[derive(Debug, Clone)]
pub struct LineNodeRec {
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

impl LineNodeRec {
    /// line's stoke align is no-op, it's always center. this value is ignored, but will be affected when line transforms to a path.
    pub fn get_stroke_align(&self) -> StrokeAlign {
        StrokeAlign::Center
    }
}

/// A node representing an image element, similar to HTML `<img>`.
///
/// Unlike other shape nodes, ImageNodeRec intentionally supports only a single image fill
/// to align with web development patterns where `<img>` elements have a single image source,
/// rather than using images as backgrounds for `<div>` elements (which would support multiple fills).
///
/// This design choice reflects the common distinction in web development:
/// - `<img>` = single image content (what this node represents)
/// - `<div style="background-image: ...">` = multiple background layers (use other shape nodes)
#[derive(Debug, Clone)]
pub struct ImageNodeRec {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
    pub transform: AffineTransform,
    pub size: Size,
    pub corner_radius: RectangularCornerRadius,
    /// Single image fill - intentionally not supporting multiple fills to align with
    /// web development patterns where `<img>` elements have one image source.
    pub fill: ImagePaint,
    pub strokes: Vec<Paint>,
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effects: LayerEffects,
    pub image: ResourceRef,
}

impl NodeStrokesMixin for ImageNodeRec {
    fn set_stroke(&mut self, stroke: Paint) {
        self.strokes = vec![stroke];
    }

    fn set_strokes(&mut self, strokes: Vec<Paint>) {
        self.strokes = strokes;
    }
}

impl ImageNodeRec {
    pub fn to_own_shape(&self) -> RRectShape {
        RRectShape {
            width: self.size.width,
            height: self.size.height,
            corner_radius: self.corner_radius,
        }
    }
}

impl NodeTransformMixin for ImageNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

impl NodeGeometryMixin for ImageNodeRec {
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
pub struct EllipseNodeRec {
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

impl NodeFillsMixin for EllipseNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = vec![fill];
    }

    fn set_fills(&mut self, fills: Vec<Paint>) {
        self.fills = fills;
    }
}

impl NodeShapeMixin for EllipseNodeRec {
    fn to_shape(&self) -> Shape {
        let w = self.size.width;
        let h = self.size.height;
        let angle = self.angle.unwrap_or(360.0);
        let inner_ratio = self.inner_radius.unwrap_or(0.0);

        // Check if arc/ring data needs to be handled.
        // Only treat as ring or arc when the inner radius is greater than zero
        // or when the sweep angle is less than a full circle.
        if inner_ratio > 0.0 || angle != 360.0 {
            if inner_ratio > 0.0 && angle == 360.0 {
                return Shape::EllipticalRing(EllipticalRingShape {
                    width: w,
                    height: h,
                    inner_radius_ratio: inner_ratio,
                });
            } else {
                return Shape::EllipticalRingSector(EllipticalRingSectorShape {
                    width: w,
                    height: h,
                    inner_radius_ratio: inner_ratio,
                    start_angle: self.start_angle,
                    angle: angle,
                    corner_radius: self.corner_radius.unwrap_or(0.0),
                });
            }
        }

        Shape::Ellipse(EllipseShape {
            width: w,
            height: h,
        })
    }

    fn to_path(&self) -> skia_safe::Path {
        (&self.to_shape()).into()
    }

    fn to_vector_network(&self) -> VectorNetwork {
        self.to_shape().to_vector_network()
    }
}

impl NodeTransformMixin for EllipseNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

impl NodeGeometryMixin for EllipseNodeRec {
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
pub struct BooleanPathOperationNodeRec {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
    pub transform: Option<AffineTransform>,
    pub op: BooleanPathOperation,
    pub corner_radius: Option<f32>,
    pub children: Vec<NodeId>,
    pub fills: Vec<Paint>,
    pub strokes: Vec<Paint>,
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effects: LayerEffects,
}

impl NodeFillsMixin for BooleanPathOperationNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = vec![fill];
    }

    fn set_fills(&mut self, fills: Vec<Paint>) {
        self.fills = fills;
    }
}

impl NodeStrokesMixin for BooleanPathOperationNodeRec {
    fn set_stroke(&mut self, stroke: Paint) {
        self.strokes = vec![stroke];
    }

    fn set_strokes(&mut self, strokes: Vec<Paint>) {
        self.strokes = strokes;
    }
}

///
/// Vector Network Node.
///
#[derive(Debug, Clone)]
pub struct VectorNodeRec {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
    pub transform: AffineTransform,
    pub network: VectorNetwork,
    /// The corner radius of the vector node.
    pub corner_radius: f32,
    /// The fill paints of the vector node.
    pub fills: Vec<Paint>,
    pub strokes: Vec<Paint>,
    pub stroke_width: f32,
    pub stroke_width_profile: Option<cg::varwidth::VarWidthProfile>,
    /// Requested stroke alignment. For open paths, `Inside` and `Outside`
    /// alignments are treated as `Center`.
    pub stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effects: LayerEffects,
}

impl NodeFillsMixin for VectorNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = vec![fill];
    }

    fn set_fills(&mut self, fills: Vec<Paint>) {
        self.fills = fills;
    }
}

impl NodeStrokesMixin for VectorNodeRec {
    fn set_stroke(&mut self, stroke: Paint) {
        self.strokes = vec![stroke];
    }

    fn set_strokes(&mut self, strokes: Vec<Paint>) {
        self.strokes = strokes;
    }
}

impl VectorNodeRec {
    /// Build a [`skia_safe::Path`] representing this vector node,
    /// applying the node's `corner_radius` when greater than zero.
    pub fn to_path(&self) -> skia_safe::Path {
        let path: skia_safe::Path = self.network.clone().into();
        if self.corner_radius <= 0.0 {
            path
        } else {
            build_corner_radius_path(&path, self.corner_radius)
        }
    }

    /// Returns the effective stroke alignment for rendering. Open paths do not
    /// support `Inside` or `Outside` stroke alignments, so those cases fall back
    /// to `Center` to ensure the stroke remains visible.
    pub fn get_stroke_align(&self) -> StrokeAlign {
        let path: skia_safe::Path = self.network.clone().into();
        if path.is_empty() || !path.is_last_contour_closed() {
            StrokeAlign::Center
        } else {
            self.stroke_align
        }
    }
}

///
/// SVG Path compatible path node.
///
#[derive(Debug, Clone)]
pub struct SVGPathNodeRec {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
    pub transform: AffineTransform,
    pub fills: Vec<Paint>,
    pub data: String,
    pub strokes: Vec<Paint>,
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    pub stroke_dash_array: Option<Vec<f32>>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effects: LayerEffects,
}

impl NodeFillsMixin for SVGPathNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = vec![fill];
    }

    fn set_fills(&mut self, fills: Vec<Paint>) {
        self.fills = fills;
    }
}

impl NodeStrokesMixin for SVGPathNodeRec {
    fn set_stroke(&mut self, stroke: Paint) {
        self.strokes = vec![stroke];
    }

    fn set_strokes(&mut self, strokes: Vec<Paint>) {
        self.strokes = strokes;
    }
}

impl NodeTransformMixin for SVGPathNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
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
pub struct PolygonNodeRec {
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

impl NodeFillsMixin for PolygonNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = vec![fill];
    }

    fn set_fills(&mut self, fills: Vec<Paint>) {
        self.fills = fills;
    }
}

impl NodeStrokesMixin for PolygonNodeRec {
    fn set_stroke(&mut self, stroke: Paint) {
        self.strokes = vec![stroke];
    }

    fn set_strokes(&mut self, strokes: Vec<Paint>) {
        self.strokes = strokes;
    }
}

impl PolygonNodeRec {
    pub fn to_own_shape(&self) -> SimplePolygonShape {
        SimplePolygonShape {
            points: self.points.clone(),
            corner_radius: self.corner_radius,
        }
    }
}

impl NodeTransformMixin for PolygonNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

impl NodeShapeMixin for PolygonNodeRec {
    fn to_shape(&self) -> Shape {
        Shape::SimplePolygon(self.to_own_shape())
    }

    fn to_path(&self) -> skia_safe::Path {
        let shape = self.to_own_shape();
        build_simple_polygon_path(&shape)
    }

    fn to_vector_network(&self) -> VectorNetwork {
        build_simple_polygon_vector_network(&self.to_own_shape())
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
pub struct RegularPolygonNodeRec {
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

impl NodeFillsMixin for RegularPolygonNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = vec![fill];
    }

    fn set_fills(&mut self, fills: Vec<Paint>) {
        self.fills = fills;
    }
}

impl NodeTransformMixin for RegularPolygonNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

impl NodeGeometryMixin for RegularPolygonNodeRec {
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

impl RegularPolygonNodeRec {
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

impl NodeShapeMixin for RegularPolygonNodeRec {
    fn to_shape(&self) -> Shape {
        Shape::RegularPolygon(self.to_own_shape())
    }

    fn to_path(&self) -> skia_safe::Path {
        build_simple_polygon_path(&SimplePolygonShape {
            points: self.to_points(),
            corner_radius: self.corner_radius,
        })
    }

    fn to_vector_network(&self) -> VectorNetwork {
        build_regular_polygon_vector_network(&self.to_own_shape())
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
pub struct RegularStarPolygonNodeRec {
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

impl NodeFillsMixin for RegularStarPolygonNodeRec {
    fn set_fill(&mut self, fill: Paint) {
        self.fills = vec![fill];
    }

    fn set_fills(&mut self, fills: Vec<Paint>) {
        self.fills = fills;
    }
}

impl NodeTransformMixin for RegularStarPolygonNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

impl NodeGeometryMixin for RegularStarPolygonNodeRec {
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

impl NodeShapeMixin for RegularStarPolygonNodeRec {
    fn to_shape(&self) -> Shape {
        Shape::RegularStarPolygon(self.to_own_shape())
    }

    fn to_path(&self) -> skia_safe::Path {
        build_star_path(&self.to_own_shape())
    }

    fn to_vector_network(&self) -> VectorNetwork {
        build_star_vector_network(&self.to_own_shape())
    }
}

impl RegularStarPolygonNodeRec {
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
pub struct TextSpanNodeRec {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,

    /// Transform applied to the text container.
    pub transform: AffineTransform,

    /// Layout bounds (used for wrapping and alignment).
    pub width: Option<f32>,

    /// Height of the text container box.
    ///
    /// This property defines the height of the "box" that contains the text paragraph.
    /// Unlike width, which affects text layout and wrapping, height does not influence
    /// the Skia text layout engine itself. Instead, it controls the positioning of the
    /// rendered text within the specified height.
    ///
    /// ## Behavior
    ///
    /// - **When `None` (auto)**: The height is effectively "auto", similar to how width
    ///   works. The text will be rendered at its natural height without any vertical
    ///   positioning adjustments.
    ///
    /// - **When `Some(height)`**: The text is positioned within a container of the
    ///   specified height. The actual text layout height (from Skia's paragraph layout)
    ///   remains unchanged, but the y-position where the text is painted is adjusted
    ///   based on the `text_align_vertical` property.
    ///
    /// ## Y-Offset Calculation
    ///
    /// When a height is specified, the y-offset for painting the text is calculated
    /// using simple math based on the alignment:
    ///
    /// ```text
    /// y_offset = match text_align_vertical {
    ///     TextAlignVertical::Top => 0.0,
    ///     TextAlignVertical::Center => (requested_height - textlayout_height) / 2.0,
    ///     TextAlignVertical::Bottom => requested_height - textlayout_height,
    /// }
    /// ```
    ///
    /// Where:
    /// - `requested_height` is the value of this `height` property
    /// - `textlayout_height` is the natural height of the text as calculated by Skia
    ///
    /// ## Valid Use Cases
    ///
    /// It is perfectly valid to request a height smaller than the post-layouted text
    /// height. This allows for text clipping or creating text that extends beyond its
    /// container bounds, similar to how image positioning works with image boxes.
    ///
    /// ## Relationship to Image Positioning
    ///
    /// This behavior is analogous to how image positioning works:
    /// - The image (actual text content) has its natural dimensions
    /// - The image box (height container) defines the positioning space
    /// - The alignment determines how the image is positioned within the box
    pub height: Option<f32>,

    /// Text content (plain UTF-8).
    pub text: String,

    /// Font & fill appearance.
    pub text_style: TextStyleRec,

    /// Horizontal alignment.
    pub text_align: TextAlign,

    /// Vertical alignment of text within its container height.
    ///
    /// This property controls how text is positioned vertically within the height
    /// defined by the `height` property. Since Skia's text layout engine only
    /// supports width-based layout, vertical alignment is handled by this library
    /// through post-layout positioning adjustments.
    ///
    /// ## How It Works
    ///
    /// 1. **Text Layout**: Skia performs the text layout based on width constraints,
    ///    producing a paragraph with a natural height (`textlayout_height`).
    ///
    /// 2. **Height Container**: If a `height` is specified, it defines the container
    ///    height (`requested_height`) within which the text should be positioned.
    ///
    /// 3. **Y-Offset Calculation**: The vertical alignment determines the y-offset
    ///    (delta) where the text is painted:
    ///
    ///    ```text
    ///    y_offset = match text_align_vertical {
    ///        TextAlignVertical::Top => 0.0,
    ///        TextAlignVertical::Center => (requested_height - textlayout_height) / 2.0,
    ///        TextAlignVertical::Bottom => requested_height - textlayout_height,
    ///    }
    ///    ```
    ///
    /// 4. **Rendering**: The text is painted at the calculated y-offset, effectively
    ///    positioning it within the specified height container.
    ///
    /// ## Interaction with Height
    ///
    /// - **When `height` is `None`**: This property has no effect, as there's no
    ///   container height to align within. Text renders at its natural position.
    ///
    /// - **When `height` is `Some(value)`**: This property determines how the text
    ///   is positioned within that height container.
    ///
    /// ## Use Cases
    ///
    /// - **Top Alignment**: Text starts at the top of the container (default behavior)
    /// - **Center Alignment**: Text is vertically centered within the container
    /// - **Bottom Alignment**: Text is positioned at the bottom of the container
    ///
    /// ## Clipping Behavior
    ///
    /// When the requested height is smaller than the natural text height, the text
    /// may be clipped. The alignment determines which part of the text remains visible:
    /// - `Top`: Bottom portion may be clipped
    /// - `Center`: Top and bottom portions may be clipped equally
    /// - `Bottom`: Top portion may be clipped
    pub text_align_vertical: TextAlignVertical,

    /// Maximum number of lines to render.
    /// If `None`, the text will be rendered until the end of the text. ellipsis will be applied if the text is too long.
    pub max_lines: Option<usize>,

    /// Ellipsis text to be shown when the text is too long.
    /// If `None`, the text will be truncated with "...".
    /// to change this behaviour, set ellipsis to empty string.
    pub ellipsis: Option<String>,

    /// Fill paints stack (solid, gradient, etc.)
    pub fills: Vec<Paint>,

    /// Stroke paints stack (solid, gradient, etc.)
    pub strokes: Vec<Paint>,

    /// Stroke width
    pub stroke_width: f32,
    pub stroke_align: StrokeAlign,
    /// Overall node opacity.
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub effects: LayerEffects,
}

impl NodeTransformMixin for TextSpanNodeRec {
    fn x(&self) -> f32 {
        self.transform.x()
    }

    fn y(&self) -> f32 {
        self.transform.y()
    }
}

#[derive(Debug, Clone)]
#[deprecated(note = "Not implemented yet")]
pub struct TextNodeRec {
    pub id: NodeId,
    pub name: Option<String>,
    pub active: bool,
    pub transform: AffineTransform,
    pub size: Size,
    pub text: String,
    pub font_size: f32,
    pub fill: Paint,
    /// Optional stroke paint for outlining text.
    /// Currently supports only a single stroke paint.
    pub stroke: Option<Paint>,
    /// Stroke width in logical pixels. Set to `0.0` to disable.
    pub stroke_width: f32,
    /// Stroke alignment relative to the text glyph outlines.
    /// Only `Center` alignment is honored for now.
    pub stroke_align: StrokeAlign,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

// endregion
