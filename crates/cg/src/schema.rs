use crate::transform::AffineTransform;
use serde::Deserialize;
use std::collections::HashMap;
use std::f32::consts::PI;

pub type NodeId = String;

#[derive(Debug, Clone, Copy)]
pub struct Color(pub u8, pub u8, pub u8, pub u8);

/// Represents filter effects inspired by SVG `<filter>` primitives.
///
/// See also:
/// - https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feDropShadow
/// - https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feGaussianBlur
#[derive(Debug, Clone)]
pub enum FilterEffect {
    /// Drop shadow filter: offset + blur + color
    DropShadow(FeDropShadow),

    /// Gaussian blur filter: blur only
    GaussianBlur(FeGaussianBlur),
}

/// A drop shadow filter effect (`<feDropShadow>`)
#[derive(Debug, Clone, Copy)]
pub struct FeDropShadow {
    /// Horizontal shadow offset in px
    pub dx: f32,

    /// Vertical shadow offset in px
    pub dy: f32,

    /// Blur radius (`stdDeviation` in SVG)
    pub blur: f32,

    /// Shadow color (includes alpha)
    pub color: Color,
}

/// A standalone blur filter effect (`<feGaussianBlur>`)
#[derive(Debug, Clone, Copy)]
pub struct FeGaussianBlur {
    /// Blur radius (`stdDeviation` in SVG)
    pub radius: f32,
}

/// Blend modes for compositing layers, compatible with Skia and SVG/CSS.
///
/// - SVG: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/mix-blend-mode
/// - Skia: https://skia.org/docs/user/api/SkBlendMode_Reference/
/// - Figma: https://help.figma.com/hc/en-us/articles/360039956994
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlendMode {
    // Skia: kSrcOver, CSS: normal
    Normal,

    // Skia: kMultiply
    Multiply,
    // Skia: kScreen
    Screen,
    // Skia: kOverlay
    Overlay,
    // Skia: kDarken
    Darken,
    // Skia: kLighten
    Lighten,
    // Skia: kColorDodge
    ColorDodge,
    // Skia: kColorBurn
    ColorBurn,
    // Skia: kHardLight
    HardLight,
    // Skia: kSoftLight
    SoftLight,
    // Skia: kDifference
    Difference,
    // Skia: kExclusion
    Exclusion,
    // Skia: kHue
    Hue,
    // Skia: kSaturation
    Saturation,
    // Skia: kColor
    Color,
    // Skia: kLuminosity
    Luminosity,

    /// Like `Normal`, but means no blending at all (pass-through).
    /// This is Figma-specific, and typically treated the same as `Normal`.
    PassThrough,
}

impl From<BlendMode> for skia_safe::BlendMode {
    fn from(mode: BlendMode) -> Self {
        use skia_safe::BlendMode::*;
        match mode {
            BlendMode::Normal => SrcOver,
            BlendMode::Multiply => Multiply,
            BlendMode::Screen => Screen,
            BlendMode::Overlay => Overlay,
            BlendMode::Darken => Darken,
            BlendMode::Lighten => Lighten,
            BlendMode::ColorDodge => ColorDodge,
            BlendMode::ColorBurn => ColorBurn,
            BlendMode::HardLight => HardLight,
            BlendMode::SoftLight => SoftLight,
            BlendMode::Difference => Difference,
            BlendMode::Exclusion => Exclusion,
            BlendMode::Hue => Hue,
            BlendMode::Saturation => Saturation,
            BlendMode::Color => Color,
            BlendMode::Luminosity => Luminosity,
            BlendMode::PassThrough => SrcOver, // fallback
        }
    }
}

/// Supported text decoration modes.
///
/// Only `Underline` and `None` are supported in the current version.
///
/// - [Flutter](https://api.flutter.dev/flutter/dart-ui/TextDecoration-class.html)  
/// - [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/text-decoration)
#[derive(Debug, Clone, Copy, Deserialize)]
pub enum TextDecoration {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "underline")]
    Underline,
}

/// Supported horizontal text alignment.
///
/// Does not include `Start` or `End`, as they are not supported currently.
///
/// - [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/text-align)  
/// - [Flutter](https://api.flutter.dev/flutter/dart-ui/TextAlign.html)
#[derive(Debug, Clone, Copy, Deserialize)]
pub enum TextAlign {
    #[serde(rename = "left")]
    Left,
    #[serde(rename = "right")]
    Right,
    #[serde(rename = "center")]
    Center,
    #[serde(rename = "justify")]
    Justify,
}

/// Supported vertical alignment values for text.
///
/// In CSS, this maps to `align-content`.
///
/// - [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/align-content)  
/// - [Konva](https://konvajs.org/api/Konva.Text.html#verticalAlign)
#[derive(Debug, Clone, Copy, Deserialize)]
pub enum TextAlignVertical {
    #[serde(rename = "top")]
    Top,
    #[serde(rename = "center")]
    Center,
    #[serde(rename = "bottom")]
    Bottom,
}

/// Font weight value (1-1000).
///
/// - [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight)  
/// - [Flutter](https://api.flutter.dev/flutter/dart-ui/FontWeight-class.html)  
/// - [OpenType spec](https://learn.microsoft.com/en-us/typography/opentype/spec/os2#usweightclass)
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct FontWeight(pub u16);

impl FontWeight {
    /// Creates a new font weight value.
    ///
    /// # Arguments
    ///
    /// * `value` - The font weight value (1-1000)
    ///
    /// # Panics
    ///
    /// Panics if the value is not between 1 and 1000.
    pub fn new(value: u16) -> Self {
        assert!(
            value >= 1 && value <= 1000,
            "Font weight must be between 1 and 1000"
        );
        Self(value)
    }

    /// Returns the font weight value.
    pub fn value(&self) -> u16 {
        self.0
    }

    pub fn default() -> Self {
        Self(400)
    }
}

/// A set of style properties that can be applied to a text or text span.
#[derive(Debug, Clone)]
pub struct TextStyle {
    /// Text decoration (e.g. underline or none).
    pub text_decoration: TextDecoration,

    /// Optional font family name (e.g. "Roboto").
    pub font_family: Option<String>,

    /// Font size in logical pixels.
    pub font_size: f32,

    /// Font weight (100–900).
    pub font_weight: FontWeight,

    /// Additional spacing between characters, in logical pixels.  
    /// Default is `0.0`.
    pub letter_spacing: Option<f32>,

    /// Line height
    pub line_height: Option<f32>,
}

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

impl RectangularCornerRadius {
    pub fn zero() -> Self {
        Self::all(0.0)
    }

    pub fn all(value: f32) -> Self {
        Self {
            tl: value,
            tr: value,
            bl: value,
            br: value,
        }
    }
}

// region: Scene
#[derive(Debug, Clone)]
pub struct SceneNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub children: Vec<NodeId>,
}

// endregion

// region: Node Definitions

#[derive(Debug, Clone)]
pub enum Node {
    Group(GroupNode),
    Rectangle(RectangleNode),
    Ellipse(EllipseNode),
    Polygon(PolygonNode),
    RegularPolygon(RegularPolygonNode),
    Line(LineNode),
    TextSpan(TextSpanNode),
    Image(ImageNode),
}

#[derive(Debug, Clone)]
pub struct BaseNode {
    pub id: NodeId,
    pub name: String,
    pub active: bool,
    pub blend_mode: BlendMode,
}

#[derive(Debug, Clone)]
pub struct GroupNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub children: Vec<NodeId>,
    pub opacity: f32,
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
pub struct RectangleNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub corner_radius: RectangularCornerRadius,
    pub fill: Paint,
    pub stroke: Paint,
    pub stroke_width: f32,
    pub opacity: f32,
    pub effect: Option<FilterEffect>,
}

#[derive(Debug, Clone)]
pub struct ImageNode {
    pub base: BaseNode,
    pub transform: AffineTransform,
    pub size: Size,
    pub corner_radius: RectangularCornerRadius,
    pub fill: Paint,
    pub stroke: Paint,
    pub stroke_width: f32,
    pub opacity: f32,
    pub effect: Option<FilterEffect>,
    pub _ref: String,
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

impl RegularPolygonNode {
    pub fn to_polygon(&self) -> PolygonNode {
        let cx = self.size.width / 2.0;
        let cy = self.size.height / 2.0;
        let r = cx.min(cy); // fit within bounding box

        let angle_offset = if self.point_count % 2 == 0 {
            PI / self.point_count as f32
        } else {
            -PI / 2.0
        };

        let points: Vec<(f32, f32)> = (0..self.point_count)
            .map(|i| {
                let angle = (i as f32 / self.point_count as f32) * 2.0 * PI + angle_offset;
                let x = cx + r * angle.cos();
                let y = cy + r * angle.sin();
                (x, y)
            })
            .collect();

        PolygonNode {
            base: self.base.clone(),
            transform: self.transform,
            points,
            fill: self.fill.clone(),
            stroke: self.stroke.clone(),
            stroke_width: self.stroke_width,
            opacity: self.opacity,
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

    /// Overall node opacity.
    pub opacity: f32,
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
}

// endregion

// Example doc tree container
pub type NodeMap = HashMap<NodeId, Node>;
