use core::str;
use math2::{box_fit::BoxFit, transform::AffineTransform};
use serde::Deserialize;

#[derive(Debug, Clone, Copy)]
pub struct Color(pub u8, pub u8, pub u8, pub u8);

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

    pub fn is_zero(&self) -> bool {
        self.tl == 0.0 && self.tr == 0.0 && self.bl == 0.0 && self.br == 0.0
    }

    pub fn is_uniform(&self) -> bool {
        self.tl == self.tr && self.tl == self.bl && self.tl == self.br
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
    Image(ImagePaint),
}

impl Paint {
    pub fn opacity(&self) -> f32 {
        match self {
            Paint::Solid(solid) => solid.opacity,
            Paint::LinearGradient(gradient) => gradient.opacity,
            Paint::RadialGradient(gradient) => gradient.opacity,
            Paint::Image(image) => image.opacity,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SolidPaint {
    pub color: Color,
    pub opacity: f32,
}

impl SolidPaint {
    pub fn transparent() -> Self {
        Self {
            color: Color(0, 0, 0, 0),
            opacity: 0.0,
        }
    }

    pub fn black() -> Self {
        Self {
            color: Color(0, 0, 0, 255),
            opacity: 1.0,
        }
    }

    pub fn white() -> Self {
        Self {
            color: Color(255, 255, 255, 255),
            opacity: 1.0,
        }
    }

    pub fn red() -> Self {
        Self {
            color: Color(255, 0, 0, 255),
            opacity: 1.0,
        }
    }

    pub fn blue() -> Self {
        Self {
            color: Color(0, 0, 255, 255),
            opacity: 1.0,
        }
    }

    pub fn green() -> Self {
        Self {
            color: Color(0, 255, 0, 255),
            opacity: 1.0,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct GradientStop {
    /// 0.0 = start, 1.0 = end
    pub offset: f32,
    pub color: Color,
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
    DropShadow(FeDropShadow),

    /// Inner shadow filter: offset + blur + spread + color
    /// the shadow is clipped to the shape
    InnerShadow(FeDropShadow),

    /// Layer blur filter
    LayerBlur(FeGaussianBlur),

    /// Background blur filter
    /// A background blur effect, similar to CSS `backdrop-filter: blur(...)`
    BackdropBlur(FeGaussianBlur),
}

#[derive(Debug, Clone)]
pub enum FilterShadowEffect {
    DropShadow(FeDropShadow),
    InnerShadow(FeDropShadow),
}

impl Into<FilterEffect> for FilterShadowEffect {
    fn into(self) -> FilterEffect {
        match self {
            FilterShadowEffect::DropShadow(shadow) => FilterEffect::DropShadow(shadow),
            FilterShadowEffect::InnerShadow(shadow) => FilterEffect::InnerShadow(shadow),
        }
    }
}

/// A drop shadow (box-shadow) filter effect (`<feDropShadow>` + spread radius)
/// See also:
/// - https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feDropShadow
/// - https://developer.mozilla.org/en-US/docs/Web/CSS/box-shadow
/// - https://www.figma.com/plugin-docs/api/Effect/#dropshadoweffect
/// - https://api.flutter.dev/flutter/painting/BoxShadow-class.html
#[derive(Debug, Clone, Copy)]
pub struct FeDropShadow {
    /// Horizontal shadow offset in px
    pub dx: f32,

    /// Vertical shadow offset in px
    pub dy: f32,

    /// Blur radius (`stdDeviation` in SVG)
    pub blur: f32,

    /// Spread radius in px
    /// applies outset to the src rect
    pub spread: f32,

    /// Shadow color (includes alpha)
    pub color: Color,
}

/// A standalone blur filter effect (`<feGaussianBlur>`)
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct FeGaussianBlur {
    /// Blur radius (`stdDeviation` in SVG)
    pub radius: f32,
}
// #endregion
