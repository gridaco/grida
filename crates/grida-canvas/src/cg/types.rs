use core::str;
use math2::{box_fit::BoxFit, transform::AffineTransform};
use serde::Deserialize;

/// A 2D point with x and y coordinates.
#[derive(Debug, Clone, Copy)]
pub struct CGPoint {
    pub x: f32,
    pub y: f32,
}

impl CGPoint {
    pub fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }

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
    pub fn subtract_scaled(&self, other: CGPoint, scale: f32) -> CGPoint {
        CGPoint {
            x: self.x - other.x * scale,
            y: self.y - other.y * scale,
        }
    }
}

impl Into<skia_safe::Point> for CGPoint {
    fn into(self) -> skia_safe::Point {
        skia_safe::Point::new(self.x, self.y)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct CGColor(pub u8, pub u8, pub u8, pub u8);

/// Boolean path operation.
#[derive(Debug, Clone, Copy)]
pub enum BooleanPathOperation {
    Union,        // A ∪ B
    Intersection, // A ∩ B
    Difference,   // A - B
    Xor,          // A ⊕ B
}

/// Blend modes for compositing layers, compatible with Skia and SVG/CSS.
///
/// - SVG: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/mix-blend-mode
/// - Skia: https://skia.org/docs/user/api/SkBlendMode_Reference/
/// - Figma: https://help.figma.com/hc/en-us/articles/360039956994
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum BlendMode {
    // Skia: kSrcOver, CSS: normal
    #[serde(rename = "normal")]
    Normal,
    // Skia: kMultiply
    #[serde(rename = "multiply")]
    Multiply,
    // Skia: kScreen
    #[serde(rename = "screen")]
    Screen,
    // Skia: kOverlay
    #[serde(rename = "overlay")]
    Overlay,
    // Skia: kDarken
    #[serde(rename = "darken")]
    Darken,
    // Skia: kLighten
    #[serde(rename = "lighten")]
    Lighten,
    // Skia: kColorDodge
    #[serde(rename = "color-dodge")]
    ColorDodge,
    // Skia: kColorBurn
    #[serde(rename = "color-burn")]
    ColorBurn,
    // Skia: kHardLight
    #[serde(rename = "hard-light")]
    HardLight,
    // Skia: kSoftLight
    #[serde(rename = "soft-light")]
    SoftLight,
    // Skia: kDifference
    #[serde(rename = "difference")]
    Difference,
    // Skia: kExclusion
    #[serde(rename = "exclusion")]
    Exclusion,
    // Skia: kHue
    #[serde(rename = "hue")]
    Hue,
    // Skia: kSaturation
    #[serde(rename = "saturation")]
    Saturation,
    // Skia: kColor
    #[serde(rename = "color")]
    Color,
    // Skia: kLuminosity
    #[serde(rename = "luminosity")]
    Luminosity,

    /// Like `Normal`, but means no blending at all (pass-through).
    /// This is Figma-specific, and typically treated the same as `Normal`.
    #[serde(rename = "pass-through")]
    PassThrough,
}

impl Default for BlendMode {
    fn default() -> Self {
        BlendMode::Normal
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub enum FillRule {
    #[serde(rename = "nonzero")]
    NonZero,
    #[serde(rename = "evenodd")]
    EvenOdd,
}

/// Stroke alignment.
///
/// - [Flutter](https://api.flutter.dev/flutter/painting/BorderSide/strokeAlign.html)  
/// - [Figma](https://www.figma.com/plugin-docs/api/properties/nodes-strokealign/)
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub enum StrokeAlign {
    #[serde(rename = "inside")]
    Inside,
    #[serde(rename = "center")]
    Center,
    #[serde(rename = "outside")]
    Outside,
}

impl Default for StrokeAlign {
    fn default() -> Self {
        StrokeAlign::Inside
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Radius {
    pub rx: f32,
    pub ry: f32,
}

impl Default for Radius {
    fn default() -> Self {
        Self::zero()
    }
}

impl Radius {
    pub fn circular(radius: f32) -> Self {
        Self {
            rx: radius,
            ry: radius,
        }
    }

    pub fn elliptical(rx: f32, ry: f32) -> Self {
        Self { rx, ry }
    }

    pub fn zero() -> Self {
        Self { rx: 0.0, ry: 0.0 }
    }

    pub fn is_zero(&self) -> bool {
        self.rx == 0.0 && self.ry == 0.0
    }

    pub fn is_uniform(&self) -> bool {
        self.rx == self.ry
    }

    pub fn tuple(&self) -> (f32, f32) {
        (self.rx, self.ry)
    }
}

impl Into<CGPoint> for Radius {
    fn into(self) -> CGPoint {
        CGPoint {
            x: self.rx,
            y: self.ry,
        }
    }
}

impl Into<(f32, f32)> for Radius {
    fn into(self) -> (f32, f32) {
        (self.rx, self.ry)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct RectangularCornerRadius {
    pub tl: Radius,
    pub tr: Radius,
    pub bl: Radius,
    pub br: Radius,
}

impl RectangularCornerRadius {
    pub fn zero() -> Self {
        Self::all(Radius::zero())
    }

    pub fn all(radius: Radius) -> Self {
        Self {
            tl: radius,
            tr: radius,
            bl: radius,
            br: radius,
        }
    }

    pub fn circular(radius: f32) -> Self {
        Self::all(Radius::circular(radius))
    }

    pub fn is_zero(&self) -> bool {
        self.tl.is_zero() && self.tr.is_zero() && self.bl.is_zero() && self.br.is_zero()
    }

    pub fn is_uniform(&self) -> bool {
        // all uniform and the values are the same
        self.tl.is_uniform()
            && self.tr.is_uniform()
            && self.bl.is_uniform()
            && self.br.is_uniform()
            && self.tl.rx == self.tr.rx
            && self.tl.rx == self.bl.rx
            && self.tl.rx == self.br.rx
    }
}

impl Default for RectangularCornerRadius {
    fn default() -> Self {
        Self::zero()
    }
}

// #region text

/// Text Transform (Text Case)
/// - [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/text-transform)
#[derive(Debug, Clone, Copy, Deserialize, Hash, PartialEq, Eq)]
pub enum TextTransform {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "uppercase")]
    Uppercase,
    #[serde(rename = "lowercase")]
    Lowercase,
    #[serde(rename = "capitalize")]
    Capitalize,
}

impl Default for TextTransform {
    fn default() -> Self {
        TextTransform::None
    }
}

/// Supported text decoration modes.
///
/// Only `Underline` and `None` are supported in the current version.
///
/// - [Flutter](https://api.flutter.dev/flutter/dart-ui/TextDecoration-class.html)  
/// - [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/text-decoration)
#[derive(Debug, Clone, Copy, Deserialize, Hash, PartialEq, Eq)]
pub enum TextDecoration {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "underline")]
    Underline,
    #[serde(rename = "overline")]
    Overline,
    #[serde(rename = "line-through")]
    LineThrough,
}

/// Supported horizontal text alignment.
///
/// Does not include `Start` or `End`, as they are not supported currently.
///
/// - [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/text-align)  
/// - [Flutter](https://api.flutter.dev/flutter/dart-ui/TextAlign.html)
#[derive(Debug, Clone, Copy, Deserialize, Hash, PartialEq, Eq)]
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

impl Default for TextAlign {
    fn default() -> Self {
        TextAlign::Left
    }
}

/// Supported vertical alignment values for text.
///
/// In CSS, this maps to `align-content`.
///
/// - [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/align-content)  
/// - [Konva](https://konvajs.org/api/Konva.Text.html#verticalAlign)
#[derive(Debug, Clone, Copy, Deserialize, Hash, PartialEq, Eq)]
pub enum TextAlignVertical {
    #[serde(rename = "top")]
    Top,
    #[serde(rename = "center")]
    Center,
    #[serde(rename = "bottom")]
    Bottom,
}

impl Default for TextAlignVertical {
    fn default() -> Self {
        TextAlignVertical::Top
    }
}

/// Font weight value (1-1000).
///
/// - [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight)  
/// - [Flutter](https://api.flutter.dev/flutter/dart-ui/FontWeight-class.html)  
/// - [OpenType spec](https://learn.microsoft.com/en-us/typography/opentype/spec/os2#usweightclass)
#[derive(Debug, Clone, Copy, Deserialize, Hash, PartialEq, Eq)]
pub struct FontWeight(pub u32);

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
    pub fn new(value: u32) -> Self {
        assert!(
            value >= 1 && value <= 1000,
            "Font weight must be between 1 and 1000"
        );
        Self(value)
    }

    /// Returns the font weight value.
    pub fn value(&self) -> u32 {
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
    pub font_family: String,

    /// Font size in logical pixels.
    pub font_size: f32,

    /// Font weight (100–900).
    pub font_weight: FontWeight,

    /// Font italic style.
    pub italic: bool,

    /// Additional spacing between characters, in logical pixels.  
    /// Default is `0.0`.
    pub letter_spacing: Option<f32>,

    /// Line height
    pub line_height: Option<f32>,

    /// Text transform (e.g. uppercase, lowercase, capitalize)
    pub text_transform: TextTransform,
}
// #endregion

// #region paint

#[derive(Debug, Clone)]
pub enum Paint {
    Solid(SolidPaint),
    LinearGradient(LinearGradientPaint),
    RadialGradient(RadialGradientPaint),
    SweepGradient(SweepGradientPaint),
    Angular(AngularGradientPaint),
    Image(ImagePaint),
}

impl Paint {
    pub fn opacity(&self) -> f32 {
        match self {
            Paint::Solid(solid) => solid.opacity,
            Paint::LinearGradient(gradient) => gradient.opacity,
            Paint::RadialGradient(gradient) => gradient.opacity,
            Paint::SweepGradient(gradient) => gradient.opacity,
            Paint::Angular(gradient) => gradient.opacity,
            Paint::Image(image) => image.opacity,
        }
    }
}

#[derive(Debug, Clone)]
pub enum GradientPaint {
    Linear(LinearGradientPaint),
    Radial(RadialGradientPaint),
    Sweep(SweepGradientPaint),
    Angular(AngularGradientPaint),
}

impl GradientPaint {
    pub fn opacity(&self) -> f32 {
        match self {
            GradientPaint::Linear(gradient) => gradient.opacity,
            GradientPaint::Radial(gradient) => gradient.opacity,
            GradientPaint::Sweep(gradient) => gradient.opacity,
            GradientPaint::Angular(gradient) => gradient.opacity,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SolidPaint {
    pub color: CGColor,
    pub opacity: f32,
}

impl SolidPaint {
    pub fn transparent() -> Self {
        Self {
            color: CGColor(0, 0, 0, 0),
            opacity: 0.0,
        }
    }

    pub fn black() -> Self {
        Self {
            color: CGColor(0, 0, 0, 255),
            opacity: 1.0,
        }
    }

    pub fn white() -> Self {
        Self {
            color: CGColor(255, 255, 255, 255),
            opacity: 1.0,
        }
    }

    pub fn red() -> Self {
        Self {
            color: CGColor(255, 0, 0, 255),
            opacity: 1.0,
        }
    }

    pub fn blue() -> Self {
        Self {
            color: CGColor(0, 0, 255, 255),
            opacity: 1.0,
        }
    }

    pub fn green() -> Self {
        Self {
            color: CGColor(0, 255, 0, 255),
            opacity: 1.0,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct GradientStop {
    /// 0.0 = start, 1.0 = end
    pub offset: f32,
    pub color: CGColor,
}

#[derive(Debug, Clone)]
pub struct LinearGradientPaint {
    pub transform: AffineTransform,
    pub stops: Vec<GradientStop>,
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct RadialGradientPaint {
    pub transform: AffineTransform,
    pub stops: Vec<GradientStop>,
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct SweepGradientPaint {
    pub transform: AffineTransform,
    pub stops: Vec<GradientStop>,
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct AngularGradientPaint {
    pub transform: AffineTransform,
    pub stops: Vec<GradientStop>,
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct ImagePaint {
    pub transform: AffineTransform,
    pub hash: String,
    pub fit: BoxFit,
    pub opacity: f32,
}

// #endregion

// #region effect

/// Represents filter effects inspired by SVG `<filter>` primitives.
///
/// See also:
/// - https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feDropShadow
/// - https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feGaussianBlur
#[derive(Debug, Clone)]
pub enum FilterEffect {
    /// Drop shadow filter: offset + blur + spread + color
    DropShadow(FeShadow),

    /// Inner shadow filter: offset + blur + spread + color
    /// the shadow is clipped to the shape
    InnerShadow(FeShadow),

    /// Layer blur filter
    LayerBlur(FeGaussianBlur),

    /// Background blur filter
    /// A background blur effect, similar to CSS `backdrop-filter: blur(...)`
    BackdropBlur(FeGaussianBlur),
}

#[derive(Debug, Clone)]
pub enum FilterShadowEffect {
    DropShadow(FeShadow),
    InnerShadow(FeShadow),
}

impl Into<FilterEffect> for FilterShadowEffect {
    fn into(self) -> FilterEffect {
        match self {
            FilterShadowEffect::DropShadow(shadow) => FilterEffect::DropShadow(shadow),
            FilterShadowEffect::InnerShadow(shadow) => FilterEffect::InnerShadow(shadow),
        }
    }
}

/// A shadow (box-shadow) filter effect (`<feDropShadow>` + spread radius)
///
/// Grida's standard shadow effect that supports
/// - css box-shadow
/// - css text-shadow
/// - path-shadow (non-box) that supports css box-shadow properties
/// - fully compatible with feDropShadow => [FeShadow] (but no backwards compatibility, since spread is not supported by SVG)
///
/// See also:
/// - https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feDropShadow
/// - https://developer.mozilla.org/en-US/docs/Web/CSS/box-shadow
/// - https://www.figma.com/plugin-docs/api/Effect/#dropshadoweffect
/// - https://api.flutter.dev/flutter/painting/BoxShadow-class.html
#[derive(Debug, Clone, Copy)]
pub struct FeShadow {
    /// Horizontal shadow offset in px
    pub dx: f32,

    /// Vertical shadow offset in px
    pub dy: f32,

    /// Blur radius (`stdDeviation` in SVG)
    pub blur: f32,

    /// Spread radius in px
    /// applies outset (or inset if inner) to the src rect
    pub spread: f32,

    /// Shadow color (includes alpha)
    pub color: CGColor,
}

#[derive(Debug, Clone)]
pub enum FeBlur {
    Gaussian(FeGaussianBlur),
    Progressive(FeProgressiveBlur),
}

/// A standalone blur filter effect (`<feGaussianBlur>`)
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct FeGaussianBlur {
    /// Blur radius (`stdDeviation` in SVG)
    pub radius: f32,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct FeProgressiveBlur {
    // start offset
    pub x1: f32,
    pub y1: f32,

    // end offset
    pub x2: f32,
    pub y2: f32,

    // start radius
    pub radius: f32,

    // end radius
    pub radius2: f32,
}
// #endregion
