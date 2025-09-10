use core::str;
use math2::{box_fit::BoxFit, transform::AffineTransform};
use serde::Deserialize;
use std::hash::Hash;

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

#[derive(Debug, Clone, Copy, Hash)]
pub struct CGColor(pub u8, pub u8, pub u8, pub u8);

impl CGColor {
    pub const TRANSPARENT: Self = Self(0, 0, 0, 0);
    pub const BLACK: Self = Self(0, 0, 0, 255);
    pub const WHITE: Self = Self(255, 255, 255, 255);
    pub const RED: Self = Self(255, 0, 0, 255);
    pub const GREEN: Self = Self(0, 255, 0, 255);
    pub const BLUE: Self = Self(0, 0, 255, 255);

    pub fn from_rgba(r: u8, g: u8, b: u8, a: u8) -> Self {
        Self(r, g, b, a)
    }

    pub fn from_rgb(r: u8, g: u8, b: u8) -> Self {
        Self(r, g, b, 255)
    }

    pub fn r(&self) -> u8 {
        self.0
    }
    pub fn g(&self) -> u8 {
        self.1
    }
    pub fn b(&self) -> u8 {
        self.2
    }
    pub fn a(&self) -> u8 {
        self.3
    }
}

impl From<CGColor> for SolidPaint {
    fn from(color: CGColor) -> Self {
        SolidPaint {
            color,
            opacity: 1.0,
            blend_mode: BlendMode::default(),
        }
    }
}

/// Boolean path operation.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
pub enum BooleanPathOperation {
    #[serde(rename = "union")]
    Union, // A ∪ B
    #[serde(rename = "intersection")]
    Intersection, // A ∩ B
    #[serde(rename = "difference")]
    Difference, // A - B
    #[serde(rename = "xor")]
    Xor, // A ⊕ B
}

/// # Clipping Model (Single `clip` flag — **clips content only**)
///
/// This module uses a **single clipping switch**, exposed as `clip` on container-like nodes
/// (currently `ContainerNodeRec`). The semantics are intentionally **content-only clipping**
/// (a.k.a. *overflow clip*):
///
/// - When `clip == true`, the runtime **pushes a clip region** equal to the node's own
///   geometry (its rounded-rect path derived from `size` and `corner_radius`) **before painting
///   descendants**, and **pops** it after the descendants are painted.
/// - This clip affects **only the node's children and any drawing that occurs *as part of
///   child painting***. It is **not** a mask for the node's own border/stroke or its
///   outer effects.
///
/// ## What is clipped vs. not clipped
///
/// **Clipped by `clip` (content-only):**
/// - All **descendant nodes** (children, grandchildren, …) drawn while the clip is active.
/// - Any content the container delegates to children (e.g., embedded images, text nodes).
///
/// **Not clipped by `clip` (content-only):**
/// - The container’s **own stroke/border** (including `stroke_align: Outside/Center/Inside`).
///   The stroke is painted **after** children and may extend outside the content region.
/// - The container’s **outer effects** such as **drop shadows** applied via `LayerEffects`.
/// - The container’s **outline/focus rings/debug handles** (if any).
///
/// > Rationale: This mirrors typical "overflow: hidden" semantics in UI frameworks where
/// > the clip is a **descendant clip**, not a **self-mask**. It yields the common “card”
/// > behavior: an image child is clipped to rounded corners, while the card’s border and
/// > drop shadow remain crisp and uncut.
///
/// ## Paint Order (normative for containers)
///
/// Implementers should adhere to the following order to guarantee predictable results:
///
/// 1. Establish transforms / local coordinate space.
/// 2. Paint the container **background/fills** (they naturally fit within the shape).
/// 3. If `clip == true`: **push content clip** using the container’s rounded-rect path.
/// 4. **Paint children** (all descendants paint under the active clip).
/// 5. If `clip == true`: **pop content clip**.
/// 6. Paint the container’s **stroke/border** (may extend outside; not affected by `clip`).
/// 7. Paint **outer effects** (e.g., drop shadows, outlines, overlays).
///
/// ## Interaction with `LayerEffects`
///
/// - **DropShadow**: treated as an **outer effect** for the container; it is **not** masked by
///   the `clip` (content-only). Shadow extents may lie outside the container’s bounds.
/// - **InnerShadow**: always constrained by the container’s **shape**; independent of `clip`.
/// - **LayerBlur**: blurs the container’s **composited layer** (background + children as painted).
///   Since children were already clipped (if `clip == true`), the blur kernel may **bleed outside**
///   the shape; that bleed is **not** additionally masked by `clip`.
/// - **BackdropBlur**: samples content **behind** the container and is **masked to the
///   container’s shape** (not to the content clip). It does not depend on `clip`.
///
/// ## Stroke alignment
///
/// Support for `StrokeAlign::{Inside, Center, Outside}` affects only where the stroke pixels land.
/// The `clip` flag (content-only) **does not** trim any outside/center/inside portions of the
/// container’s own stroke. Descendants remain clipped as described above.
///
/// ## Future extension (non-normative)
///
/// Some products need a **shape clip** (self + children), analogous to CSS `clip-path` / SVG
/// `clipPath`. If ever introduced, it should be a **separate attribute** from `clip` to avoid
/// breaking existing content-only behavior.
///
/// ### Mapping to other ecosystems (informative)
/// - HTML/CSS `overflow: hidden` → `clip` (content-only)
/// - CSS `clip-path` / SVG `clipPath` → (potential future **shape clip**, not implemented)
/// - Flutter `Clip*` wrapping a subtree → (potential future **shape clip**, not implemented)
pub type ContainerClipFlag = bool;

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

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Radius {
    pub rx: f32,
    pub ry: f32,
}

impl Radius {
    pub fn avg(&self) -> f32 {
        (self.rx + self.ry) / 2.0
    }
}

impl Eq for Radius {}

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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

    pub fn avg(&self) -> f32 {
        (self.tl.avg() + self.tr.avg() + self.bl.avg() + self.br.avg()) / 4.0
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
/// - [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/text-decoration-line)
#[derive(Debug, Clone, Copy, Deserialize, Hash, PartialEq, Eq)]
pub enum TextDecorationLine {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "underline")]
    Underline,
    #[serde(rename = "overline")]
    Overline,
    #[serde(rename = "line-through")]
    LineThrough,
}

impl Default for TextDecorationLine {
    fn default() -> Self {
        TextDecorationLine::None
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Hash, PartialEq, Eq)]
pub enum TextDecorationStyle {
    #[serde(rename = "solid")]
    Solid,
    #[serde(rename = "double")]
    Double,
    #[serde(rename = "dotted")]
    Dotted,
    #[serde(rename = "dashed")]
    Dashed,
    #[serde(rename = "wavy")]
    Wavy,
}

impl Default for TextDecorationStyle {
    fn default() -> Self {
        TextDecorationStyle::Solid
    }
}

pub trait FromWithContext<T, C> {
    fn from_with_context(value: T, ctx: &C) -> Self;
}

pub struct DecorationRecBuildContext {
    pub color: CGColor,
}

impl From<&TextStyleRecBuildContext> for DecorationRecBuildContext {
    fn from(ctx: &TextStyleRecBuildContext) -> Self {
        Self { color: ctx.color }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct TextDecorationRec {
    /// Text decoration line (e.g. underline or none).
    pub text_decoration_line: TextDecorationLine,

    /// Text decoration color
    pub text_decoration_color: Option<CGColor>,

    /// Text decoration style (e.g. dashed or solid).
    pub text_decoration_style: Option<TextDecorationStyle>,

    /// Text decoration skip ink
    pub text_decoration_skip_ink: Option<bool>,

    /// The thickness of the decoration stroke as a multiplier of the thickness defined by the font.
    pub text_decoration_thinkness: Option<f32>,
}

impl TextDecorationRec {
    pub fn none() -> Self {
        Self {
            text_decoration_line: TextDecorationLine::None,
            text_decoration_color: None,
            text_decoration_style: None,
            text_decoration_skip_ink: None,
            text_decoration_thinkness: None,
        }
    }

    pub fn underline() -> Self {
        Self {
            text_decoration_line: TextDecorationLine::Underline,
            text_decoration_color: None,
            text_decoration_style: None,
            text_decoration_skip_ink: None,
            text_decoration_thinkness: None,
        }
    }

    pub fn overline() -> Self {
        Self {
            text_decoration_line: TextDecorationLine::Overline,
            text_decoration_color: None,
            text_decoration_style: None,
            text_decoration_skip_ink: None,
            text_decoration_thinkness: None,
        }
    }
}

impl Default for TextDecorationRec {
    fn default() -> Self {
        Self::none()
    }
}

#[derive(Debug, Clone, Copy)]
pub struct TextDecoration {
    pub text_decoration_line: TextDecorationLine,
    pub text_decoration_color: CGColor,
    pub text_decoration_style: TextDecorationStyle,
    pub text_decoration_skip_ink: bool,
    pub text_decoration_thinkness: f32,
}

impl Default for TextDecoration {
    fn default() -> Self {
        Self {
            text_decoration_line: TextDecorationLine::None,
            text_decoration_color: CGColor::TRANSPARENT,
            text_decoration_style: TextDecorationStyle::Solid,
            text_decoration_skip_ink: true,
            text_decoration_thinkness: 1.0,
        }
    }
}

impl FromWithContext<TextDecorationRec, DecorationRecBuildContext> for TextDecoration {
    fn from_with_context(value: TextDecorationRec, ctx: &DecorationRecBuildContext) -> Self {
        let text_decoration_color = value.text_decoration_color.unwrap_or(ctx.color);
        let text_decoration_style = value
            .text_decoration_style
            .unwrap_or(TextDecorationStyle::default());
        let text_decoration_skip_ink = value.text_decoration_skip_ink.unwrap_or(true);
        let text_decoration_thinkness = value.text_decoration_thinkness.unwrap_or(1.0);

        Self {
            text_decoration_line: value.text_decoration_line,
            text_decoration_color: text_decoration_color,
            text_decoration_style: text_decoration_style,
            text_decoration_skip_ink: text_decoration_skip_ink,
            text_decoration_thinkness: text_decoration_thinkness,
        }
    }
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

impl Default for FontWeight {
    fn default() -> Self {
        Self(400)
    }
}

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

/// Context for building a text style.
pub struct TextStyleRecBuildContext {
    /// The color of the text. this is used as fallback for [Decoration::text_decoration_color].
    pub color: CGColor,
    /// List of font families to use as fallbacks when the primary font is missing.
    pub user_fallback_fonts: Vec<String>,
}

impl Default for TextStyleRecBuildContext {
    fn default() -> Self {
        Self {
            color: CGColor::TRANSPARENT,
            user_fallback_fonts: Vec::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct FontFeature {
    pub tag: String,
    pub value: bool,
}

#[derive(Debug, Clone)]
pub struct FontVariation {
    pub axis: String,
    pub value: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum FontOpticalSizing {
    Auto,
    None,
    Fixed(f32),
}

impl Default for FontOpticalSizing {
    fn default() -> Self {
        FontOpticalSizing::Auto
    }
}

#[derive(Debug, Clone)]
pub enum TextLineHeight {
    /// Normal (unset, no override)
    Normal,
    /// px value
    Fixed(f32),
    /// multiplier factor
    Factor(f32),
}

impl Default for TextLineHeight {
    fn default() -> Self {
        TextLineHeight::Normal
    }
}

#[derive(Debug, Clone, Copy)]
pub enum TextLetterSpacing {
    /// Fixed value in px.
    Fixed(f32),
    /// em Factor value (percentage) relative to font size.
    /// 1 = 100% / 1em
    Factor(f32),
}

impl Default for TextLetterSpacing {
    fn default() -> Self {
        TextLetterSpacing::Fixed(0.0)
    }
}

#[derive(Debug, Clone, Copy)]
pub enum TextWordSpacing {
    /// Fixed value in px.
    Fixed(f32),
    /// em Factor value (percentage) relative to font size.
    /// 1 = 100% / 1em
    Factor(f32),
}

impl Default for TextWordSpacing {
    fn default() -> Self {
        TextWordSpacing::Fixed(0.0)
    }
}

/// A set of style properties that can be applied to a text or text span.
#[derive(Debug, Clone)]
pub struct TextStyleRec {
    pub text_decoration: Option<TextDecorationRec>,

    /// Optional font family name (e.g. "Roboto").
    pub font_family: String,

    /// Font size in logical pixels.
    pub font_size: f32,

    /// Font weight (100–900).
    pub font_weight: FontWeight,

    /// Font italic style.
    pub font_style_italic: bool,

    /// Additional spacing between characters, in logical pixels.
    /// Default is `0.0`.
    pub letter_spacing: TextLetterSpacing,

    /// Additional spacing between words, in logical pixels.
    /// Default is `0.0`.
    pub word_spacing: TextWordSpacing,

    /// Line height
    pub line_height: TextLineHeight,

    /// Text transform (e.g. uppercase, lowercase, capitalize)
    pub text_transform: TextTransform,

    /// Font optical sizing
    pub font_optical_sizing: FontOpticalSizing,

    /// OpenType font features
    pub font_features: Option<Vec<FontFeature>>,

    /// Custom font variation axes
    pub font_variations: Option<Vec<FontVariation>>,
}

impl TextStyleRec {
    pub fn from_font(font: &str, size: f32) -> Self {
        Self {
            text_decoration: None,
            font_family: font.to_string(),
            font_size: size,
            font_weight: Default::default(),
            font_style_italic: false,
            letter_spacing: Default::default(),
            word_spacing: Default::default(),
            line_height: Default::default(),
            text_transform: TextTransform::None,
            font_optical_sizing: FontOpticalSizing::Auto,
            font_features: None,
            font_variations: None,
        }
    }
}

// #endregion

// #region paint

#[derive(Debug, Clone)]
pub enum Paint {
    Solid(SolidPaint),
    LinearGradient(LinearGradientPaint),
    RadialGradient(RadialGradientPaint),
    SweepGradient(SweepGradientPaint),
    DiamondGradient(DiamondGradientPaint),
    Image(ImagePaint),
}

impl Paint {
    pub fn opacity(&self) -> f32 {
        match self {
            Paint::Solid(solid) => solid.opacity,
            Paint::LinearGradient(gradient) => gradient.opacity,
            Paint::RadialGradient(gradient) => gradient.opacity,
            Paint::SweepGradient(gradient) => gradient.opacity,
            Paint::DiamondGradient(gradient) => gradient.opacity,
            Paint::Image(image) => image.opacity,
        }
    }

    /// Returns the color of the solid paint, if any.
    pub fn solid_color(&self) -> Option<CGColor> {
        match self {
            Paint::Solid(solid) => Some(solid.color),
            _ => None,
        }
    }

    /// Hash the paint properties for caching purposes
    pub fn hash_for_cache(&self, hasher: &mut std::collections::hash_map::DefaultHasher) {
        match self {
            Paint::Solid(solid) => {
                solid.color.0.hash(hasher);
                solid.opacity.to_bits().hash(hasher);
            }
            Paint::LinearGradient(gradient) => {
                gradient.opacity.to_bits().hash(hasher);
                for stop in &gradient.stops {
                    stop.offset.to_bits().hash(hasher);
                    stop.color.0.hash(hasher);
                }
            }
            Paint::RadialGradient(gradient) => {
                gradient.opacity.to_bits().hash(hasher);
                for stop in &gradient.stops {
                    stop.offset.to_bits().hash(hasher);
                    stop.color.0.hash(hasher);
                }
            }
            Paint::SweepGradient(gradient) => {
                gradient.opacity.to_bits().hash(hasher);
                for stop in &gradient.stops {
                    stop.offset.to_bits().hash(hasher);
                    stop.color.0.hash(hasher);
                }
            }
            Paint::DiamondGradient(gradient) => {
                gradient.opacity.to_bits().hash(hasher);
                for stop in &gradient.stops {
                    stop.offset.to_bits().hash(hasher);
                    stop.color.0.hash(hasher);
                }
            }
            Paint::Image(image) => {
                // For image paints, hash the image hash
                image.hash.hash(hasher);
                image.opacity.to_bits().hash(hasher);
            }
        }
    }
}

#[derive(Debug, Clone)]
pub enum GradientPaint {
    Linear(LinearGradientPaint),
    Radial(RadialGradientPaint),
    Sweep(SweepGradientPaint),
    Diamond(DiamondGradientPaint),
}

impl GradientPaint {
    pub fn opacity(&self) -> f32 {
        match self {
            GradientPaint::Linear(gradient) => gradient.opacity,
            GradientPaint::Radial(gradient) => gradient.opacity,
            GradientPaint::Sweep(gradient) => gradient.opacity,
            GradientPaint::Diamond(gradient) => gradient.opacity,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SolidPaint {
    pub color: CGColor,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

impl SolidPaint {
    pub fn new_color(color: CGColor) -> Self {
        Self {
            color,
            opacity: 1.0,
            blend_mode: BlendMode::default(),
        }
    }

    pub const TRANSPARENT: Self = Self {
        color: CGColor::TRANSPARENT,
        opacity: 0.0,
        blend_mode: BlendMode::Normal,
    };

    pub const BLACK: Self = Self {
        color: CGColor::BLACK,
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
    };

    pub const WHITE: Self = Self {
        color: CGColor::WHITE,
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
    };

    pub const RED: Self = Self {
        color: CGColor::RED,
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
    };

    pub const BLUE: Self = Self {
        color: CGColor::BLUE,
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
    };

    pub const GREEN: Self = Self {
        color: CGColor::GREEN,
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
    };
}

impl From<CGColor> for Paint {
    fn from(color: CGColor) -> Self {
        Paint::Solid(color.into())
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

impl LinearGradientPaint {
    pub fn from_colors(colors: Vec<CGColor>) -> Self {
        Self {
            transform: AffineTransform::default(),
            stops: colors
                .iter()
                .enumerate()
                .map(|(i, color)| GradientStop {
                    offset: i as f32 / (colors.len() - 1) as f32,
                    color: *color,
                })
                .collect(),
            opacity: 1.0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RadialGradientPaint {
    /// # Radial Gradient Transform Model
    ///
    /// ## Coordinate Space
    /// The radial gradient is defined in **unit gradient space**:
    /// - Center: `(0.5, 0.5)`
    /// - Radius: `0.5`
    ///
    /// This forms a normalized circle inside a `[0.0, 1.0] x [0.0, 1.0]` box.
    /// All geometry is defined relative to this unit space.
    ///
    /// ## Scaling to Object Space
    /// The gradient is mapped to the target rectangle by applying a scale matrix derived from its size:
    ///
    /// ```text
    /// local_matrix = scale(width, height) × user_transform
    /// ```
    ///
    /// - `scale(width, height)` transforms the unit circle to match the target rectangle,
    ///   allowing the gradient to become elliptical if `width ≠ height`.
    /// - `user_transform` is an additional affine matrix defined in gradient space (centered at 0.5, 0.5).
    ///
    /// ## Rendering Behavior
    /// When passed to Skia, the shader uses:
    /// - `center = (0.5, 0.5)`
    /// - `radius = 0.5`
    ///
    /// These are interpreted in **local gradient space**, and the `local_matrix` maps device coordinates
    /// back into that space.
    ///
    /// ## Summary
    /// - The gradient definition is resolution-independent.
    /// - `width` and `height` determine how unit space is scaled — they do **not** directly affect center or radius.
    /// - All transforms (e.g. rotation, skew) should be encoded in the `user_transform`, not baked into radius or center.
    pub transform: AffineTransform,
    pub stops: Vec<GradientStop>,
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct DiamondGradientPaint {
    /// # Diamond Gradient Transform Model
    ///
    /// Figma's Diamond Gradient is equivalent to a radial gradient evaluated
    /// using the Manhattan distance metric. The gradient is defined in the same
    /// unit space as [`RadialGradientPaint`]: center at `(0.5, 0.5)` with a
    /// nominal radius of `0.5`.
    ///
    /// Scaling to object space follows the same rule:
    ///
    /// ```text
    /// local_matrix = scale(width, height) × user_transform
    /// ```
    ///
    /// - `scale(width, height)` maps the unit diamond to the target rectangle.
    /// - `user_transform` applies any user supplied transform in gradient space.
    pub transform: AffineTransform,
    pub stops: Vec<GradientStop>,
    pub opacity: f32,
}

#[derive(Debug, Clone)]
pub struct SweepGradientPaint {
    /// # Sweep Gradient Transform Model
    ///
    /// ## Coordinate Space
    /// The sweep gradient is defined in **unit gradient space**:
    /// - Center: `(0.5, 0.5)`
    /// - Angular domain: `0° → 360°` sweeping **clockwise**
    ///
    /// This defines a full circular sweep originating from the center of a `[0.0, 1.0] x [0.0, 1.0]` box.
    /// All angular evaluations happen around that center.
    ///
    /// ## Scaling to Object Space
    /// The gradient is mapped to the target rectangle by applying a scale matrix derived from its size:
    ///
    /// ```text
    /// local_matrix = scale(width, height) × user_transform
    /// ```
    ///
    /// - `scale(width, height)` adapts the normalized sweep space to the visual size of the shape.
    /// - `user_transform` is an additional affine matrix applied **after** scaling,
    ///   allowing rotation, skewing, and movement of the angular center.
    ///
    /// ## Rendering Behavior
    /// When passed to Skia, the shader uses:
    /// - `center = (0.5, 0.5)`
    /// - Angle range = `0.0° to 360.0°`
    ///
    /// These are interpreted in **gradient-local space**, and the `local_matrix` maps device-space coordinates
    /// into that space.
    ///
    /// ## Summary
    /// - The gradient is resolution-independent and relative to a center anchor.
    /// - Use scaling to map the unit system to the bounding box.
    /// - Use the `transform` to rotate, offset, or skew the sweep gradient.
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
