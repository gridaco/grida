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
    pub const BLACK: Self = Self(0, 0, 0, 0xff);
    pub const WHITE: Self = Self(0xff, 0xff, 0xff, 0xff);
    pub const RED: Self = Self(0xff, 0, 0, 0xff);
    pub const GREEN: Self = Self(0, 0xff, 0, 0xff);
    pub const BLUE: Self = Self(0, 0, 0xff, 0xff);

    pub fn from_rgba(r: u8, g: u8, b: u8, a: u8) -> Self {
        Self(r, g, b, a)
    }

    pub fn from_rgb(r: u8, g: u8, b: u8) -> Self {
        Self(r, g, b, 0xff)
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
            active: true,
            color,
            blend_mode: BlendMode::default(),
        }
    }
}

/// Defines the type of masking applied to a layer.
///
/// This corresponds to the CSS `mask-type` property and is related to `clip-path` functionality.
/// The mask type determines how the mask is interpreted and applied to the layer content.
///
/// # CSS Equivalents
/// - **None**: No masking is applied
/// - **Geometry**: Vector-based masking (equivalent to `clip-path` in CSS)
/// - **Alpha**: Alpha channel masking (equivalent to `mask-type: alpha` in CSS)
/// - **Luminance**: Luminance-based masking (equivalent to `mask-type: luminance` in CSS)
///
/// For more information, see the [MDN documentation on mask-type](https://developer.mozilla.org/en-US/docs/Web/CSS/mask-type).
#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
pub enum LayerMaskType {
    Image(ImageMaskType),

    /// Vector-based masking (clipPath).
    ///
    /// Uses the vector geometry path to define the visible area of the content.
    /// Unlike alpha or luminance masking, this type does not use opacity or brightness values.
    /// The mask is purely geometric - content is either fully visible or fully hidden based on whether
    /// it falls inside or outside the defined vector path. This is equivalent to CSS `clip-path`.
    #[serde(rename = "geometry")]
    Geometry,
}

impl Default for LayerMaskType {
    fn default() -> Self {
        LayerMaskType::Image(ImageMaskType::default())
    }
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
pub enum ImageMaskType {
    /// Alpha channel masking.
    ///
    /// Uses the alpha channel of the mask to determine the opacity of the masked content.
    /// Areas with higher alpha values in the mask will show the content more opaquely.
    #[serde(rename = "alpha")]
    Alpha,
    /// Luminance-based masking.
    ///
    /// Uses the luminance (brightness) of the mask to determine the opacity of the masked content.
    /// Brighter areas in the mask will show the content more opaquely, while darker areas will be more transparent.
    #[serde(rename = "luminance")]
    Luminance,
}

impl Default for ImageMaskType {
    fn default() -> Self {
        ImageMaskType::Alpha
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

/// Layer-level compositing mode.
///
/// - `Blend(BlendMode)`: The layer is **isolated** and composited as a single surface
///   using the given blend mode (e.g., `Normal/SrcOver`, `Multiply`, etc.).
/// - `PassThrough`: The layer **does not** create a compositing boundary. Its children
///   (or its internal paint stack) are drawn directly into the parent and may blend with
///   content beneath the layer. Group opacity should be applied multiplicatively to
///   descendants rather than forcing isolation.
///
/// This mirrors Figma’s semantics:
/// - Groups default to **PassThrough** (non-isolated).
/// - Switching a group to a specific blend mode (e.g., `Normal`) isolates and flattens it.
///
/// Closest CSS analogy:
/// - `PassThrough` ≈ `isolation: auto`
/// - `Blend(BlendMode::Normal)` ≈ `isolation: isolate` + normal compositing
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
#[serde(untagged)]
pub enum LayerBlendMode {
    /// Non-isolated group/layer; children/paints blend directly with the backdrop.
    #[serde(rename = "pass-through")]
    PassThrough,
    /// Isolated layer composited with a specific blend mode.
    Blend(BlendMode),
}

impl From<BlendMode> for LayerBlendMode {
    #[inline]
    fn from(mode: BlendMode) -> Self {
        LayerBlendMode::Blend(mode)
    }
}

impl Into<BlendMode> for LayerBlendMode {
    fn into(self) -> BlendMode {
        match self {
            LayerBlendMode::PassThrough => BlendMode::Normal,
            LayerBlendMode::Blend(mode) => mode,
        }
    }
}

impl Default for LayerBlendMode {
    fn default() -> Self {
        LayerBlendMode::PassThrough
    }
}

/// Blend functions for compositing paints or isolated layers (does **not** include PassThrough).
///
/// - SVG: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/mix-blend-mode
/// - Skia: https://skia.org/docs/user/api/SkBlendMode_Reference/
/// - Flutter: https://api.flutter.dev/flutter/dart-ui/BlendMode.html
/// - Figma: https://help.figma.com/hc/en-us/articles/360039956994
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
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

/// Supported vertical alignment values for text within its container height.
///
/// This enum defines how text is positioned vertically within the height container
/// specified by the `height` property in `TextSpanNodeRec`. Since Skia's text layout
/// engine only supports width-based layout, vertical alignment is implemented by
/// this library through post-layout positioning adjustments.
///
/// ## How Vertical Alignment Works
///
/// The vertical alignment system works by calculating a y-offset (delta) that determines
/// where the text is painted within the specified height container:
///
/// ```text
/// y_offset = match alignment {
///     TextAlignVertical::Top => 0.0,
///     TextAlignVertical::Center => (container_height - text_height) / 2.0,
///     TextAlignVertical::Bottom => container_height - text_height,
/// }
/// ```
///
/// Where:
/// - `container_height` is the value of the `height` property (when specified)
/// - `text_height` is the natural height of the text as calculated by Skia's layout engine
///
/// ## Alignment Behaviors
///
/// ### Top Alignment
/// - **Y-offset**: `0.0` (no vertical adjustment)
/// - **Behavior**: Text starts at the top of the container
/// - **Clipping**: When container height < text height, bottom portion is clipped
/// - **Use case**: Default behavior, suitable for most text layouts
///
/// ### Center Alignment  
/// - **Y-offset**: `(container_height - text_height) / 2.0`
/// - **Behavior**: Text is vertically centered within the container
/// - **Clipping**: When container height < text height, top and bottom portions are clipped equally
/// - **Use case**: Centering text in buttons, cards, or other UI elements
///
/// ### Bottom Alignment
/// - **Y-offset**: `container_height - text_height`
/// - **Behavior**: Text is positioned at the bottom of the container
/// - **Clipping**: When container height < text height, top portion is clipped
/// - **Use case**: Aligning text to the bottom of containers, footers, etc.
///
/// ## Relationship to CSS
///
/// In CSS, this maps to `align-content` or `vertical-align` properties:
/// - [MDN align-content](https://developer.mozilla.org/en-US/docs/Web/CSS/align-content)
/// - [MDN vertical-align](https://developer.mozilla.org/en-US/docs/Web/CSS/vertical-align)
///
/// ## Relationship to Other Frameworks
///
/// - [Konva.js Text.verticalAlign](https://konvajs.org/api/Konva.Text.html#verticalAlign)
/// - [Flutter TextAlignVertical](https://api.flutter.dev/flutter/painting/TextAlignVertical-class.html)
///
/// ## Implementation Notes
///
/// This alignment system is implemented post-layout, meaning:
/// 1. Skia performs text layout based on width constraints only
/// 2. The resulting paragraph has a natural height
/// 3. This library calculates the y-offset based on the alignment choice
/// 4. The text is painted at the calculated offset position
///
/// This approach allows for flexible text positioning while maintaining compatibility
/// with Skia's text layout engine limitations.
#[derive(Debug, Clone, Copy, Deserialize, Hash, PartialEq, Eq)]
pub enum TextAlignVertical {
    /// Align text to the top of the container.
    ///
    /// Text starts at y-position 0 within the height container.
    /// When the container height is smaller than the text height,
    /// the bottom portion of the text will be clipped.
    #[serde(rename = "top")]
    Top,

    /// Center text vertically within the container.
    ///
    /// Text is positioned so that it appears centered within the
    /// height container. When the container height is smaller than
    /// the text height, both top and bottom portions are clipped equally.
    #[serde(rename = "center")]
    Center,

    /// Align text to the bottom of the container.
    ///
    /// Text is positioned at the bottom of the height container.
    /// When the container height is smaller than the text height,
    /// the top portion of the text will be clipped.
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

    pub const BOLD700: Self = Self(700);
    pub const MEDIUM500: Self = Self(500);
    pub const REGULAR400: Self = Self(400);
    pub const LIGHT300: Self = Self(300);
    pub const THIN100: Self = Self(100);
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
    /// Auto mode will set the optical size to the font size.
    /// this is the default behavior.
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

    /// Font width
    /// this is a high-level exposure for `wdth` variable axis.
    /// this is effectively no-op if the font does not support `wdth` feature.
    pub font_width: Option<f32>,

    /// Font italic style.
    pub font_style_italic: bool,

    /// Font kerning.
    /// this is a high-level switch for the font feature `kern`.
    pub font_kerning: bool,

    /// Font optical sizing
    /// this is a high-level exposure for `opsz` variable axis.
    /// this is effectively no-op if the font does not support `opsz` feature.
    ///
    /// defaults to [`FontOpticalSizing::Auto`]
    pub font_optical_sizing: FontOpticalSizing,

    /// OpenType font features
    pub font_features: Option<Vec<FontFeature>>,

    /// Custom font variation axes
    pub font_variations: Option<Vec<FontVariation>>,

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
}

impl TextStyleRec {
    pub fn from_font(font: &str, size: f32) -> Self {
        Self {
            text_decoration: None,
            font_family: font.to_string(),
            font_size: size,
            font_weight: Default::default(),
            font_width: None,
            font_style_italic: false,
            font_kerning: true,
            font_optical_sizing: FontOpticalSizing::Auto,
            font_features: None,
            font_variations: None,
            letter_spacing: Default::default(),
            word_spacing: Default::default(),
            line_height: Default::default(),
            text_transform: TextTransform::None,
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
    pub fn active(&self) -> bool {
        match self {
            Paint::Solid(solid) => solid.active,
            Paint::LinearGradient(gradient) => gradient.active,
            Paint::RadialGradient(gradient) => gradient.active,
            Paint::SweepGradient(gradient) => gradient.active,
            Paint::DiamondGradient(gradient) => gradient.active,
            Paint::Image(image) => image.active,
        }
    }

    pub fn opacity(&self) -> f32 {
        match self {
            Paint::Solid(solid) => solid.opacity(),
            Paint::LinearGradient(gradient) => gradient.opacity,
            Paint::RadialGradient(gradient) => gradient.opacity,
            Paint::SweepGradient(gradient) => gradient.opacity,
            Paint::DiamondGradient(gradient) => gradient.opacity,
            Paint::Image(image) => image.opacity,
        }
    }

    /// Returns `true` if the paint is visible, `false` otherwise.
    ///
    /// A paint is considered visible when:
    /// - It is active (`active() == true`)
    /// - It has non-zero opacity (`opacity() > 0.0`)
    ///
    /// This method combines the `active` and `opacity` properties to determine
    /// whether the paint should be rendered. A paint that is inactive or has
    /// zero opacity is considered invisible and will not be drawn.
    ///
    /// ## Performance Note
    ///
    /// Paints with `opacity == 0.0` have no visual effect regardless of blend mode,
    /// so they can be safely removed from the render list to optimize performance.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let solid_paint = Paint::Solid(SolidPaint {
    ///     active: true,
    ///     color: CGColor::RED,
    ///     blend_mode: BlendMode::Normal,
    /// });
    /// assert!(solid_paint.visible()); // active and opaque
    ///
    /// let transparent_paint = Paint::Solid(SolidPaint {
    ///     active: true,
    ///     color: CGColor::TRANSPARENT,
    ///     blend_mode: BlendMode::Normal,
    /// });
    /// assert!(!transparent_paint.visible()); // active but transparent
    /// ```
    pub fn visible(&self) -> bool {
        if !self.active() {
            return false;
        }
        if self.opacity() == 0.0 {
            return false;
        }
        return true;
    }

    pub fn blend_mode(&self) -> BlendMode {
        match self {
            Paint::Solid(solid) => solid.blend_mode,
            Paint::LinearGradient(gradient) => gradient.blend_mode,
            Paint::RadialGradient(gradient) => gradient.blend_mode,
            Paint::SweepGradient(gradient) => gradient.blend_mode,
            Paint::DiamondGradient(gradient) => gradient.blend_mode,
            Paint::Image(image) => image.blend_mode,
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
                solid.opacity().to_bits().hash(hasher);
                solid.blend_mode.hash(hasher);
            }
            Paint::LinearGradient(gradient) => {
                gradient.opacity.to_bits().hash(hasher);
                gradient.blend_mode.hash(hasher);
                for stop in &gradient.stops {
                    stop.offset.to_bits().hash(hasher);
                    stop.color.0.hash(hasher);
                }
            }
            Paint::RadialGradient(gradient) => {
                gradient.opacity.to_bits().hash(hasher);
                gradient.blend_mode.hash(hasher);
                for stop in &gradient.stops {
                    stop.offset.to_bits().hash(hasher);
                    stop.color.0.hash(hasher);
                }
            }
            Paint::SweepGradient(gradient) => {
                gradient.opacity.to_bits().hash(hasher);
                gradient.blend_mode.hash(hasher);
                for stop in &gradient.stops {
                    stop.offset.to_bits().hash(hasher);
                    stop.color.0.hash(hasher);
                }
            }
            Paint::DiamondGradient(gradient) => {
                gradient.opacity.to_bits().hash(hasher);
                gradient.blend_mode.hash(hasher);
                for stop in &gradient.stops {
                    stop.offset.to_bits().hash(hasher);
                    stop.color.0.hash(hasher);
                }
            }
            Paint::Image(image) => {
                // For image paints, hash the referenced resource identifier
                match &image.image {
                    ResourceRef::HASH(h) | ResourceRef::RID(h) => h.hash(hasher),
                };
                image.opacity.to_bits().hash(hasher);
                image.blend_mode.hash(hasher);
            }
        }
    }
}

/// Ordered stack of [`Paint`] values that are composited sequentially.
///
/// Entries are interpreted in **paint order**: the first item is drawn first,
/// and every subsequent item is composited on top of the pixels produced by the
/// previous paints. This matches Figma and other graphics editors where, for
/// example, `Paints::new([solid, image])` results in the image appearing
/// above the solid color when rendered. User interfaces may display the list in
/// reverse order (top-most paint first); `Paints` always stores the canonical
/// engine order to avoid ambiguity in the renderer and conversion layers.
///
/// The [`BlendMode`] assigned to each [`Paint`] applies to that specific entry
/// while it is composited over the accumulated result. It never retroactively
/// affects paints that were drawn earlier in the stack.
#[derive(Debug, Clone, Default)]
pub struct Paints {
    paints: Vec<Paint>,
}

impl Paints {
    /// Create a new [`Paints`] collection from an ordered list of paints.
    ///
    /// Supports both `Vec<Paint>` and array literals:
    /// - `Paints::new(vec![paint1, paint2])` - traditional approach
    /// - `Paints::new([paint1, paint2])` - ergonomic array literals
    pub fn new<T>(paints: T) -> Self
    where
        T: IntoPaints,
    {
        Self {
            paints: paints.into_paints(),
        }
    }

    /// Returns `true` when there are no paints in the collection.
    pub fn is_empty(&self) -> bool {
        self.paints.is_empty()
    }

    /// Number of paints in the stack.
    pub fn len(&self) -> usize {
        self.paints.len()
    }

    /// Immutable slice access to the ordered paints.
    pub fn as_slice(&self) -> &[Paint] {
        &self.paints
    }

    /// Mutable slice access to the ordered paints.
    pub fn as_mut_slice(&mut self) -> &mut [Paint] {
        &mut self.paints
    }

    /// Consume the collection and return the underlying vector.
    pub fn into_vec(self) -> Vec<Paint> {
        self.paints
    }

    /// Append a new paint to the top of the stack.
    pub fn push(&mut self, paint: Paint) {
        self.paints.push(paint);
    }

    /// Iterate over paints in paint order.
    pub fn iter(&self) -> std::slice::Iter<'_, Paint> {
        self.paints.iter()
    }

    /// Mutable iterator over paints in paint order.
    pub fn iter_mut(&mut self) -> std::slice::IterMut<'_, Paint> {
        self.paints.iter_mut()
    }
}

impl From<Vec<Paint>> for Paints {
    fn from(value: Vec<Paint>) -> Self {
        Paints::new(value)
    }
}

impl From<Paints> for Vec<Paint> {
    fn from(value: Paints) -> Self {
        value.paints
    }
}

// Custom trait to support both Vec<Paint> and array literals in Paints::new()
pub trait IntoPaints {
    fn into_paints(self) -> Vec<Paint>;
}

impl IntoPaints for Vec<Paint> {
    fn into_paints(self) -> Vec<Paint> {
        self
    }
}

impl<const N: usize> IntoPaints for [Paint; N] {
    fn into_paints(self) -> Vec<Paint> {
        self.to_vec()
    }
}

impl FromIterator<Paint> for Paints {
    fn from_iter<I: IntoIterator<Item = Paint>>(iter: I) -> Self {
        Paints::new(iter.into_iter().collect::<Vec<_>>())
    }
}

// Support for array literals - much more ergonomic than vec![]
impl<const N: usize> From<[Paint; N]> for Paints {
    fn from(value: [Paint; N]) -> Self {
        // Most efficient: direct construction without intermediate allocations
        Paints {
            paints: value.to_vec(),
        }
    }
}

// Support for single Paint conversion
impl From<Paint> for Paints {
    fn from(value: Paint) -> Self {
        // More efficient: avoid the intermediate Vec allocation
        Paints {
            paints: vec![value],
        }
    }
}

impl IntoIterator for Paints {
    type Item = Paint;
    type IntoIter = std::vec::IntoIter<Paint>;

    fn into_iter(self) -> Self::IntoIter {
        self.paints.into_iter()
    }
}

impl<'a> IntoIterator for &'a Paints {
    type Item = &'a Paint;
    type IntoIter = std::slice::Iter<'a, Paint>;

    fn into_iter(self) -> Self::IntoIter {
        self.paints.iter()
    }
}

impl<'a> IntoIterator for &'a mut Paints {
    type Item = &'a mut Paint;
    type IntoIter = std::slice::IterMut<'a, Paint>;

    fn into_iter(self) -> Self::IntoIter {
        self.paints.iter_mut()
    }
}

impl std::ops::Deref for Paints {
    type Target = [Paint];

    fn deref(&self) -> &Self::Target {
        self.as_slice()
    }
}

impl std::ops::DerefMut for Paints {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.as_mut_slice()
    }
}

impl Extend<Paint> for Paints {
    fn extend<I: IntoIterator<Item = Paint>>(&mut self, iter: I) {
        self.paints.extend(iter);
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
    pub active: bool,
    pub color: CGColor,
    pub blend_mode: BlendMode,
}

impl SolidPaint {
    pub fn new_color(color: CGColor) -> Self {
        Self {
            active: true,
            color,
            blend_mode: BlendMode::default(),
        }
    }

    /// Returns the opacity as a value between 0.0 and 1.0, derived from the color's alpha channel.
    pub fn opacity(&self) -> f32 {
        self.color.a() as f32 / 255.0
    }

    pub const TRANSPARENT: Self = Self {
        active: true,
        color: CGColor::TRANSPARENT,
        blend_mode: BlendMode::Normal,
    };

    pub const BLACK: Self = Self {
        active: true,
        color: CGColor::BLACK,
        blend_mode: BlendMode::Normal,
    };

    pub const WHITE: Self = Self {
        active: true,
        color: CGColor::WHITE,
        blend_mode: BlendMode::Normal,
    };

    pub const RED: Self = Self {
        active: true,
        color: CGColor::RED,
        blend_mode: BlendMode::Normal,
    };

    pub const BLUE: Self = Self {
        active: true,
        color: CGColor::BLUE,
        blend_mode: BlendMode::Normal,
    };

    pub const GREEN: Self = Self {
        active: true,
        color: CGColor::GREEN,
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
    pub active: bool,
    pub transform: AffineTransform,
    pub stops: Vec<GradientStop>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

impl LinearGradientPaint {
    pub fn from_colors(colors: Vec<CGColor>) -> Self {
        Self {
            active: true,
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
            blend_mode: BlendMode::default(),
        }
    }
}

impl Default for LinearGradientPaint {
    fn default() -> Self {
        Self {
            active: true,
            transform: AffineTransform::default(),
            stops: Vec::new(),
            opacity: 1.0,
            blend_mode: BlendMode::default(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct RadialGradientPaint {
    pub active: bool,
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
    pub blend_mode: BlendMode,
}

#[derive(Debug, Clone)]
pub struct DiamondGradientPaint {
    pub active: bool,
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
    pub blend_mode: BlendMode,
}

#[derive(Debug, Clone)]
pub struct SweepGradientPaint {
    pub active: bool,
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
    pub blend_mode: BlendMode,
}

impl Default for RadialGradientPaint {
    fn default() -> Self {
        Self {
            active: true,
            transform: AffineTransform::default(),
            stops: Vec::new(),
            opacity: 1.0,
            blend_mode: BlendMode::default(),
        }
    }
}

impl Default for DiamondGradientPaint {
    fn default() -> Self {
        Self {
            active: true,
            transform: AffineTransform::default(),
            stops: Vec::new(),
            opacity: 1.0,
            blend_mode: BlendMode::default(),
        }
    }
}

impl Default for SweepGradientPaint {
    fn default() -> Self {
        Self {
            active: true,
            transform: AffineTransform::default(),
            stops: Vec::new(),
            opacity: 1.0,
            blend_mode: BlendMode::default(),
        }
    }
}

/// A reference to a resource that can be identified either by a logical Resource ID (RID) or by a hash.
///
/// `ResourceRef` is used throughout the Grida Canvas to reference external resources like images,
/// fonts, or other binary data. It provides two ways to identify resources:
///
/// ## Variants
///
/// - **`HASH(String)`**: References a resource by its content hash. This is typically used for
///   resources that are stored in memory with a `mem://` URL format. The hash is computed from
///   the resource's binary content using a hashing algorithm.
///
/// - **`RID(String)`**: References a resource by a logical Resource ID. This is typically used
///   for resources that have a human-readable identifier like `res://images/logo.png` or
///   external URLs. RIDs provide a stable way to reference resources that may be loaded
///   from different sources.
///
/// ## Usage
///
/// `ResourceRef` is commonly used in:
/// - [`ImagePaint`] to reference image resources
/// - Resource management systems to track and resolve resource dependencies
/// - Import/export operations to maintain resource references across different formats
///
/// ## Examples
///
/// ```ignore
/// // Reference by logical ID
/// let image_ref = ResourceRef::RID("res://images/logo.png".to_string());
///
/// // Reference by content hash (for in-memory resources)
/// let mem_ref = ResourceRef::HASH("a1b2c3d4e5f6".to_string());
/// ```
///
/// ## Resource Resolution
///
/// The actual resolution of a `ResourceRef` depends on the context:
/// - RID references are typically resolved through a resource index that maps logical IDs to
///   actual resource locations or content hashes
/// - HASH references are typically resolved directly from a byte store using the hash as a key
///
/// Both variants are treated uniformly in most contexts, allowing the resource management
/// system to handle different resource types transparently.
#[derive(Debug, Clone)]
pub enum ResourceRef {
    /// Reference by content hash, typically used for in-memory resources with `mem://` URLs
    HASH(String),
    /// Reference by logical Resource ID, typically used for named resources with `res://` URLs
    RID(String),
}

/// Image filter parameters for color adjustments
///
/// All values are normalized to the range [-1.0, 1.0] where:
/// - `-1.0` = maximum negative adjustment
/// - `0.0` = no change (neutral)
/// - `1.0` = maximum positive adjustment
#[derive(Debug, Clone, Default, serde::Deserialize)]
pub struct ImageFilters {
    /// Exposure adjustment (-1.0 to 1.0, default: 0.0)
    ///
    /// Controls the overall brightness of the image.
    /// - `-1.0` = very dark
    /// - `0.0` = original (no change)
    /// - `1.0` = very bright
    pub exposure: f32,

    /// Contrast adjustment (-0.3 to 0.3, default: 0.0)
    ///
    /// Controls the difference between light and dark areas.
    /// - `-0.3` = low contrast (UI cap)
    /// - `0.0` = original contrast
    /// - `0.3` = high contrast (UI cap)
    pub contrast: f32,

    /// Saturation adjustment (-1.0 to 1.0, default: 0.0)
    ///
    /// Controls the intensity of colors.
    /// - `-1.0` = grayscale (no color)
    /// - `0.0` = original saturation
    /// - `1.0` = highly oversaturated
    pub saturation: f32,

    /// Temperature adjustment (-1.0 to 1.0, default: 0.0)
    ///
    /// Controls the warm/cool color balance.
    /// - `-1.0` = very cool (blue tint)
    /// - `0.0` = neutral (no change)
    /// - `1.0` = very warm (orange tint)
    pub temperature: f32,

    /// Tint adjustment (-1.0 to 1.0, default: 0.0)
    ///
    /// Controls the green/magenta color balance.
    /// - `-1.0` = strong magenta tint
    /// - `0.0` = neutral (no change)
    /// - `1.0` = strong green tint
    pub tint: f32,

    /// Highlights adjustment (-1.0 to 1.0, default: 0.0)
    ///
    /// Controls the brightness of highlight areas.
    /// - `-1.0` = darken highlights
    /// - `0.0` = no change
    /// - `1.0` = brighten highlights
    pub highlights: f32,

    /// Shadows adjustment (-1.0 to 1.0, default: 0.0)
    ///
    /// Controls the brightness of shadow areas.
    /// - `-1.0` = darken shadows
    /// - `0.0` = no change
    /// - `1.0` = brighten shadows
    pub shadows: f32,
}

impl ImageFilters {
    /// Check if any filters are active (non-zero values)
    pub fn has_filters(&self) -> bool {
        self.exposure != 0.0
            || self.contrast != 0.0
            || self.saturation != 0.0
            || self.temperature != 0.0
            || self.tint != 0.0
            || self.highlights != 0.0
            || self.shadows != 0.0
    }
}

/// Defines how an image should be fitted within its container.
///
/// `ImagePaintFit` provides two modes for positioning and scaling images:
/// - **Fit**: Uses standard fitting modes that match CSS `object-fit` and Flutter `BoxFit` behavior
/// - **Transform**: Applies custom affine transformations for precise control
///
/// Both variants output a definite transform matrix that will be applied to the image.
/// The key difference is that `Fit` uses predefined algorithms, while `Transform` gives
/// you 100% customization over how the image will be transformed.
///
/// ## Standard Fitting Modes (Fit)
///
/// The `Fit` variant uses predefined fitting modes that are consistent across
/// web and mobile platforms:
///
/// - **`Contain`**: Scales the image to fit entirely within the container while
///   preserving aspect ratio. Similar to CSS `object-fit: contain`
/// - **`Cover`**: Scales the image to fill the entire container while preserving
///   aspect ratio. Parts of the image may be cropped. Similar to CSS `object-fit: cover`
/// - **`Fill`**: Scales the image to fill the container exactly, potentially
///   distorting the aspect ratio. Similar to CSS `object-fit: fill`
/// - **`None`**: No scaling applied, image is positioned at its natural size.
///   Similar to CSS `object-fit: none`
///
/// ## Custom Transformations (Transform)
///
/// The `Transform` variant allows for custom affine transformations, providing
/// precise control over:
///
/// - **Translation**: Move the image by specific x,y offsets
/// - **Rotation**: Rotate the image by any angle
/// - **Scaling**: Scale the image by different factors on x and y axes
/// - **Skewing**: Apply shear transformations
/// - **Combined operations**: Chain multiple transformations together
///
/// This is particularly useful for:
/// - **Cropping**: Position the image to show specific regions
/// - **Rotation**: Rotate the image to any angle
/// - **Displacement**: Move the image within its bounding box
/// - **Custom scaling**: Apply non-uniform scaling for artistic effects
///
/// ## Special Case: Identity Transform
///
/// When the `Transform` is identity (no transformation), it behaves identically
/// to `BoxFit::Fill` - the image will fill the entire container exactly.
///
///
/// ## Platform Compatibility
///
/// The `Fit` modes are designed to match the behavior of:
/// - CSS `object-fit` property
/// - Flutter `BoxFit` enum
/// - React Native `resizeMode` prop
///
/// This ensures consistent image fitting behavior across web, mobile, and desktop platforms.
#[derive(Debug, Clone)]
pub enum ImagePaintFit {
    /// Use standard fitting modes that match CSS `object-fit` and Flutter `BoxFit`
    Fit(BoxFit),
    /// Apply custom affine transformation for precise control
    Transform(AffineTransform),
}

/// Defines how an image should repeat when painted within its container.
///
/// This mirrors the behavior of CSS `background-repeat` values, allowing
/// images to tile horizontally, vertically, both, or not at all.
///
/// See also:
/// - https://developer.mozilla.org/en-US/docs/Web/CSS/background-repeat
/// - https://api.flutter.dev/flutter/painting/ImageRepeat.html
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageRepeat {
    /// Do not repeat the image. Areas outside the image bounds remain transparent.
    NoRepeat,
    /// Repeat the image horizontally (X axis) only.
    RepeatX,
    /// Repeat the image vertically (Y axis) only.
    RepeatY,
    /// Repeat the image in both directions.
    Repeat,
}

impl Default for ImageRepeat {
    fn default() -> Self {
        ImageRepeat::NoRepeat
    }
}

/// Defines how an image should be painted within its container.
///
/// `ImagePaint` combines an image resource with fitting behavior, visual properties,
/// and effects to create a complete image painting specification.
///
/// ## Key Properties
///
/// - **`image`**: Reference to the image resource to be painted
/// - **`quarter_turns`**: Clockwise 90° rotations applied before layout/fitting
/// - **`fit`**: Defines how the image should be fitted within its container
/// - **`opacity`**: Controls the transparency of the image (0.0 = fully transparent, 1.0 = fully opaque)
/// - **`blend_mode`**: Determines how the image blends with underlying content
/// - **`filters`**: Applies visual effects like brightness, contrast, saturation, etc.
///
#[derive(Debug, Clone)]
pub struct ImagePaint {
    pub active: bool,
    /// Reference to the image resource to be painted
    pub image: ResourceRef,
    /// Number of **clockwise quarter turns** to apply to the **source image**
    /// *before* fitting/cropping/layout math.
    ///
    /// Values are interpreted modulo 4:
    /// - `0` → 0° (no rotation)
    /// - `1` → 90° CW
    /// - `2` → 180°
    /// - `3` → 270° CW
    ///
    /// This is a **discrete, lossless** orientation control:
    /// 90° steps map pixels on the integer grid (no resampling/blur). Use it to
    /// normalize camera photos and to keep `fit/cover/contain` math deterministic.
    ///
    /// # Why a discrete quarter-turn?
    /// - **Image-space property:** Orientation belongs to the pixels themselves,
    ///   not the layout container. Applying it *pre-fit* ensures intrinsic size and
    ///   aspect ratio are computed on the oriented image.
    /// - **Lossless and fast:** 90° rotations are index remaps; they don’t require
    ///   filtering. (Arbitrary angles would require resampling.)
    /// - **Interop-friendly:** Maps cleanly to platform concepts:
    ///   - **EXIF Orientation (TIFF/EXIF):** 1–8 encodes quarter-turns plus optional
    ///     mirror flips. The rotation component here is exactly this field.
    ///   - **CSS:** Use `image-orientation` to request 90° step fixes or `from-image`
    ///     to honor EXIF; browsers treat it as a discrete correction, not a general
    ///     transform.  [oai_citation:0‡MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/CSS/image-orientation?utm_source=chatgpt.com)
    ///   - **Flutter:** `RotatedBox(quarterTurns: ...)` performs a layout-time
    ///     quarter-turn—semantically the same as this field.  [oai_citation:1‡api.flutter.dev](https://api.flutter.dev/flutter/widgets/RotatedBox-class.html?utm_source=chatgpt.com)
    ///
    /// # Invariants
    /// - Always store `quarter_turns % 4`.
    /// - Treat as **non-animatable** (step changes only). If you need animation,
    ///   animate a general transform elsewhere.
    /// - When `quarter_turns` is odd (1 or 3), **swap width/height** when computing
    ///   intrinsic size for fitting.
    ///
    /// # Pipeline placement
    /// ```text
    /// decode → (A) apply quarter_turns → (B) object-position → (C) fit/cover/contain → (D) layer transforms → composite
    /// ```
    /// Applying this first guarantees layout/fitting sees the oriented intrinsic size.
    ///
    /// # EXIF mapping
    /// If you ingest EXIF orientation (values 1–8), normalize to:
    /// ```text
    /// quarter_turns = { 1→0, 6→1, 3→2, 8→3 }   // others add mirror flips
    /// ```
    /// If you also support EXIF **mirrors**, model them as orthogonal flags (e.g.
    /// X/Y flips) in addition to `quarter_turns`. The pair (flips, quarter_turns)
    /// covers all 8 EXIF states cleanly.
    ///
    /// # CSS & web notes
    /// - `image-orientation: from-image;` honors EXIF; discrete angles are supported
    ///   in 90° steps. This is **not** the same as `transform: rotate(...)`, which
    ///   is continuous and layout-space. Use your `quarter_turns` to **bake/normalize
    ///   image orientation** or when drawing to canvas/SVG patterns.  [oai_citation:2‡MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/CSS/image-orientation?utm_source=chatgpt.com)
    ///
    /// # Flutter notes
    /// - Prefer `RotatedBox(quarterTurns = quarter_turns as int)` for widget trees;
    ///   it rotates before layout and stays pixel-crisp for 90° steps. For paint-time
    ///   shaders, use an image shader with a quarter-turn matrix.  [oai_citation:3‡api.flutter.dev](https://api.flutter.dev/flutter/widgets/RotatedBox-class.html?utm_source=chatgpt.com)
    ///
    /// # macOS Preview (rotation behavior)
    /// - Preview’s Rotate Left/Right applies visual 90° turns. For JPEGs, this may
    ///   **re-encode** (not guaranteed lossless) rather than merely toggling EXIF,
    ///   depending on workflow; tools like `jpegtran` perform explicit lossless
    ///   rotations. Don’t rely on external viewers to preserve losslessness—store
    ///   orientation explicitly and normalize yourself on export.  [oai_citation:4‡Ask Different](https://apple.stackexchange.com/questions/299183/will-the-quality-of-my-jpeg-images-taken-by-my-iphone-deteriorate-if-i-rotate-th?utm_source=chatgpt.com)
    ///
    /// # Examples
    /// ```rust,ignore
    /// // Normalize any integer to 0..=3
    /// let q = quarter_turns % 4;
    ///
    /// // Degrees for UI
    /// let degrees = (q as i32) * 90;
    ///
    /// // Swap intrinsic size when odd quarter turn
    /// let (w1, h1) = if q % 2 == 1 { (h0, w0) } else { (w0, h0) };
    ///
    /// // Compose two rotations
    /// let composed = (q + other_q) % 4;
    /// ```
    ///
    /// # Storage & schema
    /// - Store as `u8` (0..=3) or `usize` with `% 4` normalization.
    /// - Serialize as a small integer or as friendly keywords (`"r0"|"r90"|"r180"|"r270"`).
    ///
    /// # See also
    /// - CSS `image-orientation` (discrete image-space correction).  [oai_citation:5‡MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/CSS/image-orientation)
    /// - Flutter `RotatedBox::quarterTurns`.  [oai_citation:6‡api.flutter.dev](https://api.flutter.dev/flutter/widgets/RotatedBox/quarterTurns.html)
    pub quarter_turns: u8,
    /// Defines how the image should be fitted within its container
    pub fit: ImagePaintFit,
    /// Determines how the image should repeat within its container
    pub repeat: ImageRepeat,
    /// Uniform scale factor applied on top of the fit transform (1.0 = original size)
    pub scale: f32,
    /// Controls the transparency of the image (0.0 = fully transparent, 1.0 = fully opaque)
    pub opacity: f32,
    /// Determines how the image blends with underlying content
    pub blend_mode: BlendMode,
    /// Applies visual effects like brightness, contrast, saturation, etc.
    pub filters: ImageFilters,
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
