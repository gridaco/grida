use super::prelude::*;
use core::str;
use math2::{box_fit::BoxFit, transform::AffineTransform};
use serde::{Deserialize, Serialize};
use std::hash::Hash;

use super::alignment::Alignment;

/// A 2D point with x and y coordinates.
#[derive(Debug, Clone, Copy)]
pub struct CGPoint {
    pub x: f32,
    pub y: f32,
}

impl CGPoint {
    pub fn zero() -> Self {
        Self { x: 0.0, y: 0.0 }
    }

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

impl Default for CGPoint {
    fn default() -> Self {
        Self::zero()
    }
}

impl Into<skia_safe::Point> for CGPoint {
    fn into(self) -> skia_safe::Point {
        skia_safe::Point::new(self.x, self.y)
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
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum FillRule {
    #[serde(rename = "nonzero")]
    NonZero,
    #[serde(rename = "evenodd")]
    EvenOdd,
}

impl Default for FillRule {
    fn default() -> Self {
        FillRule::NonZero
    }
}

/// Defines the shape of stroke endpoints (line caps).
///
/// `StrokeCap` determines how the ends of open paths are rendered when stroked.
/// This only applies to open paths - closed paths join their endpoints seamlessly
/// and do not use line caps.
///
/// # Variants
///
/// ## Butt
/// The stroke ends exactly at the path endpoint with a flat edge perpendicular
/// to the path direction. This is the default and most common cap style.
///
/// ```text
/// ──────────
/// ```
///
/// ## Round
/// The stroke extends beyond the endpoint by half the stroke width, forming
/// a semicircular cap. This creates smooth, rounded line endings.
///
/// ```text
/// ──────────)
/// ```
///
/// ## Square
/// The stroke extends beyond the endpoint by half the stroke width with a
/// rectangular cap. Similar to round but with square corners.
///
/// ```text
/// ──────────┐
/// ```
///
/// # Visual Comparison
///
/// For a horizontal line with 10px stroke width:
/// - **Butt**: Line ends exactly at endpoint
/// - **Round**: Line extends 5px beyond endpoint with semicircle
/// - **Square**: Line extends 5px beyond endpoint with rectangle
///
/// # Common Use Cases
///
/// - **Butt**: Default for most graphics, clean joins with adjacent segments
/// - **Round**: Smooth, friendly appearance for UI elements and illustrations
/// - **Square**: Technical drawings, diagrams requiring precise rectangular caps
///
/// # Cross-Platform Equivalents
///
/// - **SVG**: [`stroke-linecap`](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-linecap) attribute
/// - **Canvas API**: [`CanvasRenderingContext2D.lineCap`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineCap)
/// - **Skia**: [`SkPaint::Cap`](https://api.skia.org/classSkPaint.html#a0f78de8559b795defba93171f6cb6333)
/// - **Flutter**: [`StrokeCap`](https://api.flutter.dev/flutter/dart-ui/StrokeCap.html)
/// - **Figma**: [`strokeCap`](https://www.figma.com/plugin-docs/api/properties/nodes-strokecap/)
///
/// # Example
///
/// ```rust
/// use cg::cg::types::StrokeCap;
///
/// // Default cap style
/// let default_cap = StrokeCap::default();
/// assert_eq!(default_cap, StrokeCap::Butt);
///
/// // Round caps for smooth appearance
/// let smooth = StrokeCap::Round;
/// ```
///
/// # Implementation Notes
///
/// - Only affects **open paths** (lines, polylines, arcs)
/// - Has **no effect** on closed paths (rectangles, ellipses, closed polygons)
/// - Applied during stroke geometry computation or direct Skia rendering
///
/// # See Also
///
/// - [`StrokeAlign`] - Controls stroke positioning relative to path
/// - [`StrokeDashArray`] - Defines dash patterns for strokes
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum StrokeCap {
    /// Flat edge perpendicular to the stroke direction (default)
    #[serde(rename = "butt", alias = "none")]
    Butt,
    /// Semicircular cap extending beyond the endpoint
    #[serde(rename = "round")]
    Round,
    /// Rectangular cap extending beyond the endpoint
    #[serde(rename = "square")]
    Square,
}

impl Default for StrokeCap {
    fn default() -> Self {
        StrokeCap::Butt
    }
}

/// Marker decoration placed at stroke endpoints or vector vertices.
///
/// Unlike [`StrokeCap`] (which maps to native backend caps like Skia `PaintCap`),
/// `StrokeDecoration` represents explicit marker geometry drawn on top of the
/// stroke path. When a decoration is present at an endpoint, the renderer
/// uses `Butt` cap at that endpoint and draws the marker geometry instead.
///
/// All built-in presets are **terminal** (end-to-end aligned): the marker's
/// forward edge or tip is anchored at the logical path endpoint.
///
/// ## Naming convention
///
/// `<shape>_<style>`
///
/// - **shape**: geometric description (e.g. `arrow`, `triangle`, `circle`, `diamond`, `square`, `vertical_bar`)
/// - **style**: `filled`, `open`, etc.
///
/// See: `docs/wg/feat-2d/curve-decoration.md`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub enum StrokeDecoration {
    /// No decoration (endpoint uses the node's stroke_cap as normal).
    #[default]
    #[serde(rename = "none")]
    None,

    /// Arrow lines — two lines forming a right-angle ">" chevron, not filled.
    /// 90° opening at the tip. Anchor: tip (forward edge).
    #[serde(rename = "arrow_lines")]
    ArrowLines,
    /// Filled vertical bar perpendicular to the stroke.
    /// Anchor: center of the stroke-facing edge.
    #[serde(rename = "vertical_bar_filled")]
    VerticalBarFilled,
    /// Filled equilateral triangle pointing forward.
    /// Anchor: tip (forward vertex).
    #[serde(rename = "triangle_filled")]
    TriangleFilled,
    /// Filled circle.
    /// Anchor: forward edge (not center).
    #[serde(rename = "circle_filled")]
    CircleFilled,
    /// Filled axis-aligned square (no rotation).
    /// Anchor: forward edge (not center).
    #[serde(rename = "square_filled")]
    SquareFilled,
    /// Filled diamond (rotated square).
    /// Anchor: forward vertex.
    #[serde(rename = "diamond_filled")]
    DiamondFilled,
}

impl StrokeDecoration {
    /// Returns `true` if this decoration has visible marker geometry.
    pub fn has_marker(&self) -> bool {
        !matches!(self, StrokeDecoration::None)
    }

    /// Returns `true` if this decoration is an open (stroked) shape rather than filled.
    ///
    /// Open decorations should be drawn with `PaintStyle::Stroke` using the
    /// same stroke width as the path, rather than `PaintStyle::Fill`.
    pub fn is_open(&self) -> bool {
        matches!(self, StrokeDecoration::ArrowLines)
    }
}

/// Defines how corners (path segment joins) are rendered when stroked.
///
/// `StrokeJoin` determines the appearance of corners where two path segments meet.
/// This applies to all path types (open and closed) wherever segments join at an angle.
///
/// # Variants
///
/// ## Miter
/// Extends the outer edges of the stroke until they meet at a point, creating a sharp corner.
/// The extension is limited by the miter limit to prevent excessive spikes on acute angles.
///
/// [Video](https://flutter.github.io/assets-for-api-docs/assets/dart-ui/miter_4_join.mp4)
///
/// When the miter limit is exceeded (very acute angles), the join automatically falls back
/// to a bevel join to prevent the spike from extending too far.
///
/// ## Round
/// Joins path segments with a circular arc, creating smooth, rounded corners.
/// The radius of the arc is equal to half the stroke width.
///
/// [Video](https://flutter.github.io/assets-for-api-docs/assets/dart-ui/round_join.mp4)
///
/// ## Bevel
/// Joins path segments with a straight line connecting the outer corners, creating
/// a flattened or chamfered corner.
///
/// [Video](https://flutter.github.io/assets-for-api-docs/assets/dart-ui/bevel_join.mp4)
///
/// # Visual Comparison
///
/// For two path segments meeting at 90°:
/// - **Miter**: Sharp pointed corner extending beyond the join point
/// - **Round**: Smooth circular arc connecting the segments
/// - **Bevel**: Straight diagonal line connecting the outer edges
///
/// # Common Use Cases
///
/// - **Miter**: Technical drawings, architectural diagrams, sharp geometric shapes
/// - **Round**: Smooth UI elements, organic shapes, friendly illustrations
/// - **Bevel**: Chamfered corners, industrial designs, beveled frames
///
/// # Miter Limit Behavior
///
/// The **miter limit** controls when a miter join falls back to a bevel join.
/// It's defined as the ratio of miter length to stroke width:
///
/// ```text
/// miter_limit = miter_length / stroke_width
/// ```
///
/// When this ratio exceeds the limit, the join becomes a bevel. Common default is 4.0.
/// Very acute angles (< ~29° for limit=4.0) will automatically bevel.
///
/// # Cross-Platform Equivalents
///
/// - **SVG**: [`stroke-linejoin`](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-linejoin) attribute
/// - **Canvas API**: [`CanvasRenderingContext2D.lineJoin`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineJoin)
/// - **Skia**: [`SkPaint::Join`](https://api.skia.org/classSkPaint.html#ac582b0cbf59909c9056de34a6b977cca)
/// - **Flutter**: [`StrokeJoin`](https://api.flutter.dev/flutter/dart-ui/StrokeJoin.html)
/// - **Figma**: [`strokeJoin`](https://www.figma.com/plugin-docs/api/properties/nodes-strokejoin/)
///
/// # Example
///
/// ```rust
/// use cg::cg::types::StrokeJoin;
///
/// // Default join style
/// let default_join = StrokeJoin::default();
/// assert_eq!(default_join, StrokeJoin::Miter);
///
/// // Round joins for smooth appearance
/// let smooth = StrokeJoin::Round;
///
/// // Bevel joins for chamfered corners
/// let chamfered = StrokeJoin::Bevel;
/// ```
///
/// # Implementation Notes
///
/// - Applies to **all path types** where segments join (open and closed paths)
/// - Miter joins require a **miter limit** parameter (typically 4.0) to prevent excessive spikes
/// - Round joins may affect performance on complex paths with many segments
/// - The join style interacts with stroke width - wider strokes make joins more prominent
///
/// # See Also
///
/// - [`StrokeCap`] - Controls stroke endpoints for open paths
/// - [`StrokeAlign`] - Controls stroke positioning relative to path
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum StrokeJoin {
    /// Sharp pointed corner with miter limit fallback (default)
    #[serde(rename = "miter")]
    Miter,
    /// Circular arc connecting path segments
    #[serde(rename = "round")]
    Round,
    /// Straight diagonal line connecting outer edges
    #[serde(rename = "bevel")]
    Bevel,
}

impl Default for StrokeJoin {
    fn default() -> Self {
        StrokeJoin::Miter
    }
}

/// Miter limit for stroke joins.
///
/// Controls when a miter join falls back to a bevel join based on the ratio
/// of miter length to stroke width. Common default is 4.0 (standard across
/// Skia, SVG, Canvas API).
///
/// Only affects `StrokeJoin::Miter` joins. When two path segments meet at a sharp
/// angle, the miter join extends the outer edges until they meet. The miter limit
/// prevents excessively long spikes by switching to a bevel join when:
///
/// ```text
/// miter_length / stroke_width > miter_limit
/// ```
///
/// # Default Value
///
/// The default miter limit is **4.0**, which is the standard across:
/// - Skia: Default miter limit
/// - SVG: Default `stroke-miterlimit` attribute
/// - Canvas API: Default `miterLimit` property
/// - PDF: Default miter limit
///
/// A limit of 4.0 means angles less than approximately 29° will bevel.
///
/// # Common Values
///
/// - **1.0**: Only very obtuse angles remain mitered (> ~90°)
/// - **4.0**: Standard default, bevels acute angles (< ~29°)
/// - **10.0**: Allows sharper miters, bevels very acute angles (< ~11°)
///
/// # Example
///
/// ```rust
/// use cg::cg::types::StrokeMiterLimit;
///
/// let default_limit = StrokeMiterLimit::default();
/// assert_eq!(default_limit.value(), 4.0);
///
/// let custom_limit = StrokeMiterLimit::new(10.0);
/// assert_eq!(custom_limit.value(), 10.0);
/// ```
///
/// # See Also
///
/// - [`StrokeJoin`] - The join style that miter limit applies to
/// - [MDN miterLimit](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/miterLimit)
/// - [SVG stroke-miterlimit](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-miterlimit)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct StrokeMiterLimit(#[serde(default = "StrokeMiterLimit::default_value")] pub f32);

impl StrokeMiterLimit {
    pub const DEFAULT_VALUE: f32 = 4.0;

    /// Creates a new miter limit with the specified value.
    pub const fn new(limit: f32) -> Self {
        Self(limit)
    }

    /// Returns the default miter limit value (4.0).
    fn default_value() -> f32 {
        Self::DEFAULT_VALUE
    }

    /// Returns the miter limit value.
    pub fn value(&self) -> f32 {
        self.0
    }
}

impl Default for StrokeMiterLimit {
    fn default() -> Self {
        Self(4.0)
    }
}

impl From<f32> for StrokeMiterLimit {
    fn from(value: f32) -> Self {
        Self(value)
    }
}

/// Stroke alignment.
///
/// - [Flutter](https://api.flutter.dev/flutter/painting/BorderSide/strokeAlign.html)  
/// - [Figma](https://www.figma.com/plugin-docs/api/properties/nodes-strokealign/)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
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

/// Represents a single axis in 2D space.
/// - [Flutter](https://api.flutter.dev/flutter/painting/Axis.html)
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub enum Axis {
    #[serde(rename = "horizontal")]
    Horizontal,
    #[serde(rename = "vertical")]
    Vertical,
}

impl Default for Axis {
    fn default() -> Self {
        Axis::Horizontal
    }
}

/// Alignment of items along the main axis.
///
/// See also:
/// - [MDN justify-content](https://developer.mozilla.org/en-US/docs/Web/CSS/justify-content)
/// - [MDN Main Axis](https://developer.mozilla.org/en-US/docs/Glossary/Main_Axis)
/// - [Flutter MainAxisAlignment](https://api.flutter.dev/flutter/rendering/MainAxisAlignment.html)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum MainAxisAlignment {
    #[serde(rename = "start")]
    Start,
    #[serde(rename = "end")]
    End,
    #[serde(rename = "center")]
    Center,
    #[serde(rename = "space-between")]
    SpaceBetween,
    #[serde(rename = "space-around")]
    SpaceAround,
    #[serde(rename = "space-evenly")]
    SpaceEvenly,
    #[serde(rename = "stretch")]
    Stretch,
}

impl Default for MainAxisAlignment {
    fn default() -> Self {
        MainAxisAlignment::Start
    }
}

/// Alignment of items along the cross axis.
///
/// See also:
/// - [MDN align-items](https://developer.mozilla.org/en-US/docs/Web/CSS/align-items)
/// - [MDN Cross Axis](https://developer.mozilla.org/en-US/docs/Glossary/Cross_Axis)
/// - [Flutter CrossAxisAlignment](https://api.flutter.dev/flutter/rendering/CrossAxisAlignment.html)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum CrossAxisAlignment {
    #[serde(rename = "start")]
    Start,
    #[serde(rename = "end")]
    End,
    #[serde(rename = "center")]
    Center,
    #[serde(rename = "stretch")]
    Stretch,
}

impl Default for CrossAxisAlignment {
    fn default() -> Self {
        CrossAxisAlignment::Start
    }
}

/// Represents **inset distances from the edges** of a rectangular box.
///
/// `EdgeInsets` defines per-edge padding or margin values around a box.
/// It corresponds to CSS properties such as `padding-top`, `padding-right`,
/// `padding-bottom`, and `padding-left`, or Flutter's `EdgeInsets`.
///
/// # Fields
///
/// * `top` — distance from the top edge  
/// * `right` — distance from the right edge  
/// * `bottom` — distance from the bottom edge  
/// * `left` — distance from the left edge
///
/// Each field represents a *positive offset inward* from that edge
/// when applied as padding, or an *outward extension* when used as margin.
///
/// # Example
///
/// ```rust
/// use cg::cg::types::EdgeInsets;
///
/// let padding = EdgeInsets::from_ltrb(8.0, 12.0, 8.0, 12.0);
///
/// assert_eq!(padding.top, 12.0);
/// assert_eq!(padding.left, 8.0);
///
/// let uniform = EdgeInsets::all(10.0);
/// assert!(uniform.is_uniform());
///
/// let none = EdgeInsets::zero();
/// assert!(none.is_zero());
/// ```
///
/// # Relation to other layout concepts
///
/// | Concept | Describes | Typical struct |
/// |----------|------------|----------------|
/// | **Padding / Margin** | insets *around* one element | `EdgeInsets` |
/// | **Gap / Spacing** | distance *between* elements | [`Gap2D`] |
///
/// # Mathematical model
///
/// When applied to a content box of width `W` and height `H`,
///
/// ```text
/// content_width  = W - (left + right)
/// content_height = H - (top + bottom)
/// ```
///
/// Positive values shrink the inner content region (for padding)
/// or expand the outer region (for margin).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EdgeInsets {
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
}

impl EdgeInsets {
    pub fn zero() -> Self {
        Self {
            top: 0.0,
            right: 0.0,
            bottom: 0.0,
            left: 0.0,
        }
    }

    pub fn is_zero(&self) -> bool {
        self.top == 0.0 && self.right == 0.0 && self.bottom == 0.0 && self.left == 0.0
    }

    pub fn is_uniform(&self) -> bool {
        self.top == self.right && self.right == self.bottom && self.bottom == self.left
    }

    pub fn all(value: f32) -> Self {
        Self {
            top: value,
            right: value,
            bottom: value,
            left: value,
        }
    }

    pub fn from_ltrb(left: f32, top: f32, right: f32, bottom: f32) -> Self {
        Self {
            top,
            right,
            bottom,
            left,
        }
    }
}

impl Default for EdgeInsets {
    fn default() -> Self {
        Self::zero()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub enum LayoutMode {
    Normal,
    Flex,
}

impl Default for LayoutMode {
    fn default() -> Self {
        LayoutMode::Normal
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub enum LayoutPositioning {
    Auto,
    Absolute,
}

impl Default for LayoutPositioning {
    fn default() -> Self {
        LayoutPositioning::Auto
    }
}

/// Constraint positioning specifier for constraints layout.
///
/// Defines how a node is anchored along an axis (horizontal or vertical) relative to its parent container.
///
/// ## Horizontal Positioning
/// - [`Start`](LayoutConstraintAnchor::Start): Anchored to the left edge
/// - [`End`](LayoutConstraintAnchor::End): Anchored to the right edge
/// - [`Center`](LayoutConstraintAnchor::Center): Centered horizontally
/// - [`Stretch`](LayoutConstraintAnchor::Stretch): Anchored to both left and right edges
///
/// ## Vertical Positioning
/// - [`Start`](LayoutConstraintAnchor::Start): Anchored to the top edge
/// - [`End`](LayoutConstraintAnchor::End): Anchored to the bottom edge
/// - [`Center`](LayoutConstraintAnchor::Center): Centered vertically
/// - [`Stretch`](LayoutConstraintAnchor::Stretch): Anchored to both top and bottom edges
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub enum LayoutConstraintAnchor {
    /// Start anchor (left for horizontal, top for vertical)
    Start,
    /// End anchor (right for horizontal, bottom for vertical)
    End,
    /// Center anchor (centered along the axis)
    Center,
    /// Stretch anchor (anchored to both edges of the axis)
    Stretch,
}

impl Default for LayoutConstraintAnchor {
    fn default() -> Self {
        LayoutConstraintAnchor::Start
    }
}

/// Defines how a node is constrained relative to its parent container.
///
/// Specifies the constraint positioning behavior for both horizontal and vertical axes,
/// determining how the node will be resized and positioned when its parent's size changes.
///
/// ## Fields
/// - `x`: Horizontal constraint anchor (left, right, center, or stretch)
/// - `y`: Vertical constraint anchor (top, bottom, center, or stretch)
///
/// ## Examples
///
/// Fixed to top-left corner:
/// ```ignore
/// LayoutConstraints {
///     x: LayoutConstraintAnchor::Start,  // left
///     y: LayoutConstraintAnchor::Start,  // top
/// }
/// ```
///
/// Centered in parent:
/// ```ignore
/// LayoutConstraints {
///     x: LayoutConstraintAnchor::Center,  // horizontally centered
///     y: LayoutConstraintAnchor::Center,  // vertically centered
/// }
/// ```
///
/// Stretched to fill parent:
/// ```ignore
/// LayoutConstraints {
///     x: LayoutConstraintAnchor::Stretch,  // left and right edges
///     y: LayoutConstraintAnchor::Stretch,  // top and bottom edges
/// }
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub struct LayoutConstraints {
    /// Horizontal constraint anchor determining how the node is positioned/resized along the x-axis
    pub x: LayoutConstraintAnchor,
    /// Vertical constraint anchor determining how the node is positioned/resized along the y-axis
    pub y: LayoutConstraintAnchor,
}

impl Default for LayoutConstraints {
    fn default() -> Self {
        LayoutConstraints {
            x: LayoutConstraintAnchor::Start,
            y: LayoutConstraintAnchor::Start,
        }
    }
}

/// Defines whether flex items are forced into a single line or can wrap onto multiple lines.
///
/// `LayoutWrap` controls the wrapping behavior of flex items within a flex container.
/// It is the equivalent of the CSS `flex-wrap` property and determines how items
/// are laid out when they exceed the container's size along the main axis.
///
/// # Variants
///
/// * `NoWrap` — All flex items are laid out in a single line, which may cause them to overflow
/// * `Wrap` — Flex items wrap onto multiple lines as needed, from top to bottom
///
/// # Behavior
///
/// ## NoWrap
/// - **Single line**: All items are forced into one line along the main axis
/// - **Overflow**: Items may overflow the container if their total size exceeds the container size
/// - **Shrinking**: Items may shrink (if `flex_shrink > 0`) to fit within the container
/// - **Use case**: When you want all items on one line regardless of container size
///
/// ## Wrap
/// - **Multiple lines**: Items wrap onto new lines when they exceed the container size
/// - **Natural sizing**: Items maintain their preferred size and wrap to new lines as needed
/// - **Cross-axis growth**: Container grows along the cross axis to accommodate multiple lines
/// - **Use case**: Responsive layouts where items should flow naturally (e.g., tag clouds, galleries)
///
/// # CSS Equivalents
///
/// * `flex-wrap: nowrap` → `LayoutWrap::NoWrap`
/// * `flex-wrap: wrap` → `LayoutWrap::Wrap`
///
/// Note: CSS also supports `wrap-reverse`, which is not currently implemented in this enum.
///
/// # Example
///
/// ```rust
/// use cg::cg::types::LayoutWrap;
///
/// // Default: no wrapping
/// let no_wrap = LayoutWrap::default();
/// assert!(matches!(no_wrap, LayoutWrap::NoWrap));
///
/// // Enable wrapping
/// let wrap = LayoutWrap::Wrap;
/// ```
///
/// # Interaction with Other Properties
///
/// - **With `gap`**: Gap is applied between items on the same line and between lines
/// - **With `flex_shrink`**: When `NoWrap`, items may shrink to fit; when `Wrap`, items wrap instead
/// - **With container size**: `Wrap` allows the container to grow along the cross axis
///
/// # See also
///
/// * [CSS flex-wrap](https://developer.mozilla.org/en-US/docs/Web/CSS/flex-wrap)
/// * [Taffy FlexWrap](https://docs.rs/taffy/latest/taffy/style/enum.FlexWrap.html)
/// * [`LayoutGap`] — spacing between items and lines
/// * [`Axis`] — main axis direction
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub enum LayoutWrap {
    /// Items wrap onto multiple lines as needed
    #[serde(rename = "wrap")]
    Wrap,
    /// All items are forced into a single line
    #[serde(rename = "nowrap")]
    NoWrap,
}

impl Default for LayoutWrap {
    fn default() -> Self {
        LayoutWrap::NoWrap
    }
}

/// Represents the **spacing between adjacent elements** in a flex layout container.
///
/// `LayoutGap` is a 2-dimensional scalar type describing the distance between
/// neighboring items in a layout container. It is the geometric equivalent of
/// the CSS `gap` property (or `row-gap`/`column-gap`) and Flutter's `spacing`/`runSpacing`.
///
/// Unlike [`EdgeInsets`], which describes insets around the edges of a single
/// element, `LayoutGap` defines the *inter-element spacing* applied **between**
/// consecutive elements along each axis of a flex container.
///
/// # Fields
///
/// * `main_axis_gap` — spacing between elements along the **main axis** (direction of flex flow)
///   - For `flex-direction: row`, this is the horizontal spacing between items
///   - For `flex-direction: column`, this is the vertical spacing between items
/// * `cross_axis_gap` — spacing between **lines** along the **cross axis** (perpendicular to flex flow)
///   - For `flex-direction: row`, this is the vertical spacing between wrapped rows
///   - For `flex-direction: column`, this is the horizontal spacing between wrapped columns
///
/// # Example
///
/// ```rust
/// use cg::cg::types::LayoutGap;
///
/// // Uniform spacing in both directions
/// let uniform = LayoutGap::uniform(8.0);
///
/// // Separate main-axis and cross-axis spacing
/// let spacing = LayoutGap::new(12.0, 16.0);
///
/// assert!(spacing.main_axis_gap == 12.0);
/// assert!(spacing.cross_axis_gap == 16.0);
/// assert!(LayoutGap::zero().is_zero());
/// ```
///
/// # Relation to other layout concepts
///
/// | Concept | Describes | Typical struct |
/// |----------|------------|----------------|
/// | **Padding / Margin** | insets *around* one element | [`EdgeInsets`] |
/// | **Gap / Spacing** | distance *between* elements | `LayoutGap` |
///
/// # CSS Equivalents
///
/// * `gap: 10px` → `LayoutGap::uniform(10.0)`
/// * `row-gap: 12px; column-gap: 16px` → `LayoutGap::new(16.0, 12.0)` (for row direction)
/// * `row-gap: 12px; column-gap: 16px` → `LayoutGap::new(12.0, 16.0)` (for column direction)
///
/// # See also
///
/// * [`EdgeInsets`] — four-sided per-element insets.
/// * [CSS gap property](https://developer.mozilla.org/en-US/docs/Web/CSS/gap)
/// * [Taffy gap documentation](https://docs.rs/taffy/latest/taffy/)
///
/// # Mathematical model
///
/// For `n` elements of width `wᵢ` laid out along the main axis:
///
/// ```text
/// total_main_size = Σ(wᵢ) + (n - 1) * main_axis_gap
/// total_cross_size = Σ(hᵢ) + (lines - 1) * cross_axis_gap
/// ```
///
/// This definition ensures that the gap is only applied **between**
/// elements, never before the first or after the last.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LayoutGap {
    pub main_axis_gap: f32,
    pub cross_axis_gap: f32,
}

impl LayoutGap {
    #[inline]
    pub const fn zero() -> Self {
        Self {
            main_axis_gap: 0.0,
            cross_axis_gap: 0.0,
        }
    }

    #[inline]
    pub const fn uniform(v: f32) -> Self {
        Self {
            main_axis_gap: v,
            cross_axis_gap: v,
        }
    }

    #[inline]
    pub const fn new(main_axis_gap: f32, cross_axis_gap: f32) -> Self {
        Self {
            main_axis_gap,
            cross_axis_gap,
        }
    }

    #[inline]
    pub fn is_zero(&self) -> bool {
        self.main_axis_gap == 0.0 && self.cross_axis_gap == 0.0
    }

    #[inline]
    pub fn is_uniform(&self) -> bool {
        self.main_axis_gap == self.cross_axis_gap
    }
}

impl Default for LayoutGap {
    fn default() -> Self {
        Self::zero()
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

/// A normalized curvature-continuous (G²) corner smoothing factor.
///
/// `CornerSmoothing` controls how sharply or smoothly corners are blended
/// when joining edges, transitioning from circular fillets (G¹) to
/// curvature-continuous blends (G²).
///
/// # Range
/// - `0.0` — standard rounded corners (circular arcs)
/// - `1.0` — fully smoothed, continuous-curvature corners (Apple-/Figma-style)
///
/// The mathematical foundation is described in
/// https://grida.co/docs/math/g2-curve-blending
///
/// # Examples
/// ```rust
/// use cg::cg::types::CornerSmoothing;
/// let smooth = CornerSmoothing::new(0.6);
/// assert!(smooth.value() > 0.0 && smooth.value() <= 1.0);
/// ```
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
pub struct CornerSmoothing(pub f32);

impl CornerSmoothing {
    /// Creates a new `CornerSmoothing` value, clamped to `[0.0, 1.0]`.
    pub fn new(value: f32) -> Self {
        Self(value.clamp(0.0, 1.0))
    }

    /// Returns the raw normalized value.
    #[inline]
    pub fn value(self) -> f32 {
        self.0
    }

    #[inline]
    pub fn is_zero(&self) -> bool {
        self.0 == 0.0
    }
}

impl Default for CornerSmoothing {
    fn default() -> Self {
        Self(0.0)
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
                solid.color.r.hash(hasher);
                solid.color.g.hash(hasher);
                solid.color.b.hash(hasher);
                solid.color.a.hash(hasher);
                solid.opacity().to_bits().hash(hasher);
                solid.blend_mode.hash(hasher);
            }
            Paint::LinearGradient(gradient) => {
                gradient.opacity.to_bits().hash(hasher);
                gradient.blend_mode.hash(hasher);
                for stop in &gradient.stops {
                    stop.offset.to_bits().hash(hasher);
                    stop.color.r.hash(hasher);
                    stop.color.g.hash(hasher);
                    stop.color.b.hash(hasher);
                    stop.color.a.hash(hasher);
                }
            }
            Paint::RadialGradient(gradient) => {
                gradient.opacity.to_bits().hash(hasher);
                gradient.blend_mode.hash(hasher);
                for stop in &gradient.stops {
                    stop.offset.to_bits().hash(hasher);
                    stop.color.r.hash(hasher);
                    stop.color.g.hash(hasher);
                    stop.color.b.hash(hasher);
                    stop.color.a.hash(hasher);
                }
            }
            Paint::SweepGradient(gradient) => {
                gradient.opacity.to_bits().hash(hasher);
                gradient.blend_mode.hash(hasher);
                for stop in &gradient.stops {
                    stop.offset.to_bits().hash(hasher);
                    stop.color.r.hash(hasher);
                    stop.color.g.hash(hasher);
                    stop.color.b.hash(hasher);
                    stop.color.a.hash(hasher);
                }
            }
            Paint::DiamondGradient(gradient) => {
                gradient.opacity.to_bits().hash(hasher);
                gradient.blend_mode.hash(hasher);
                for stop in &gradient.stops {
                    stop.offset.to_bits().hash(hasher);
                    stop.color.r.hash(hasher);
                    stop.color.g.hash(hasher);
                    stop.color.b.hash(hasher);
                    stop.color.a.hash(hasher);
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

impl From<CGColor> for SolidPaint {
    fn from(color: CGColor) -> Self {
        SolidPaint {
            active: true,
            color,
            blend_mode: BlendMode::default(),
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

    pub fn is_visible(&self) -> bool {
        self.paints.iter().any(|paint| paint.visible())
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct GradientStop {
    /// 0.0 = start, 1.0 = end
    pub offset: f32,
    pub color: CGColor,
}

#[derive(Debug, Clone)]
pub struct LinearGradientPaint {
    pub active: bool,
    pub xy1: Alignment,
    pub xy2: Alignment,
    pub tile_mode: TileMode,
    pub transform: AffineTransform,
    pub stops: Vec<GradientStop>,
    pub opacity: f32,
    pub blend_mode: BlendMode,
}

impl LinearGradientPaint {
    pub fn from_stops(stops: Vec<GradientStop>) -> Self {
        Self {
            stops,
            ..Default::default()
        }
    }

    pub fn from_colors(colors: Vec<CGColor>) -> Self {
        Self {
            stops: colors
                .iter()
                .enumerate()
                .map(|(i, color)| GradientStop {
                    offset: i as f32 / (colors.len() - 1) as f32,
                    color: *color,
                })
                .collect(),
            ..Default::default()
        }
    }
}

impl Default for LinearGradientPaint {
    fn default() -> Self {
        Self {
            active: true,
            xy1: Alignment::CENTER_LEFT,
            xy2: Alignment::CENTER_RIGHT,
            tile_mode: TileMode::default(),
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
    pub tile_mode: TileMode,
}

impl RadialGradientPaint {
    pub fn from_stops(stops: Vec<GradientStop>) -> Self {
        Self {
            stops,
            ..Default::default()
        }
    }

    pub fn from_colors(colors: Vec<CGColor>) -> Self {
        Self {
            stops: colors
                .iter()
                .enumerate()
                .map(|(i, color)| GradientStop {
                    offset: i as f32 / (colors.len() - 1) as f32,
                    color: *color,
                })
                .collect(),
            ..Default::default()
        }
    }
}

impl Default for RadialGradientPaint {
    fn default() -> Self {
        Self {
            active: true,
            transform: AffineTransform::default(),
            stops: Vec::new(),
            opacity: 1.0,
            blend_mode: BlendMode::default(),
            tile_mode: TileMode::default(),
        }
    }
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
/// There are three mutually exclusive modes:
/// - [`ImagePaintFit::Fit`]: single placement using standard “object-fit” semantics
/// - [`ImagePaintFit::Transform`]: single placement with a custom affine transform
/// - [`ImagePaintFit::Tile`]: pattern tiling, where a **tile** is composed first and then repeated
///
/// ### Why introduce `Tile` instead of a flat `repeat` flag?
///
/// Legacy APIs (CSS `background-*`, Flutter `DecorationImage`) combine orthogonal knobs
/// like *fit*, *repeat*, and *scale* on the same object. In practice, many combinations
/// are ignored or become **semantic no-ops**:
///
/// - **`cover + repeat`**: the covered image already spans the box, so extra repeats are clipped
///   and invisible (no-op).
/// - **Flutter `scale` with non-repeating fit**: acts as a decode hint rather than a visual
///   multiplier; the subsequent fit fully determines the mapping, so `scale` has no visible effect.
/// - **SVG/CSS**: the “fit” of content inside a pattern happens **before** repetition; repetition
///   never re-fits a post-composited result.
///
/// These facts suggest that **tiling is a different operation** from single-image fitting and
/// should be modeled explicitly to avoid dead/ignored parameters.
///
/// ### Design goals
/// 1. **Facts-first accuracy**: The renderer composes a **tile** (with its own local fit/anchor),
///    and only then repeats it. This mirrors CSS backgrounds and SVG `<pattern>` semantics and how
///    GPU image shaders (e.g., Skia) treat tiles — as pre-sized quads replicated over a grid.
/// 2. **Type-level correctness**: By making tiling its own variant, invalid combinations like
///    “`cover` + `repeat`” cannot be expressed in the single-fit branch.
/// 3. **Pragmatic ergonomics**: Tiling is **rare** in design tools compared to single-image fitting;
///    surfacing it as an explicit mode keeps common cases simple while still giving power-users a
///    precise, predictable tiling pipeline.
#[derive(Debug, Clone)]
pub enum ImagePaintFit {
    /// Use standard fitting modes that match CSS `object-fit` and Flutter `BoxFit`
    Fit(BoxFit),
    /// Apply custom affine transformation for precise control
    Transform(AffineTransform),
    /// Compose a **tile** first (in tile-local space), then repeat it across the paint box.
    ///
    /// This matches the mental model of:
    /// ```txt
    /// decode → quarter_turns → compose tile (fit inside tile) → pattern transform → repeat
    /// ```
    ///
    /// - The image is placed **inside the tile** using `content_fit` and `content_anchor`.
    /// - The tile has an explicit `tile_size` (px/natural/contain/cover) in box space.
    /// - Repetition uses per-axis `tile_mode` (repeat/mirror/clamp/decal) and optional `spacing`/`phase`.
    /// - An optional `pattern_transform` rotates/translates/scales the **tile grid** without
    ///   affecting the content’s own fit inside the tile.
    ///
    /// #### Why this is accurate
    /// - **Pre-repeat composition** is how CSS backgrounds and SVG patterns actually work:
    ///   `background-size` (or `<image preserveAspectRatio>` inside `<pattern>`) defines the tile,
    ///   then `background-repeat` (or the pattern view) replicates it.
    /// - Prevents **no-op combos**: e.g., “cover + repeat” in box space produces clipped duplicates
    ///   that are indistinguishable from `no-repeat`; here, you would instead choose a tile size and a
    ///   `content_fit` that make visual sense per tile.
    /// - Encourages **declarative clarity**: single placement vs. tiling are different intentions with
    ///   different parameters, so we encode them as different variants.
    ///
    /// See also: [flutter#DecorationImage limitations](https://gist.github.com/softmarshmallow/60dac1c6fea7f9809f9bc48127523bf4)
    Tile(ImageTile),
}

/// Specification for pattern tiling.
///
/// A **tile** defines how an image should be repeated across a container to create
/// a pattern. The `scale` parameter controls how many tiles fit in the container,
/// and `repeat` controls the repetition behavior.
///
/// #### Order of operations
/// 1. Start from the oriented intrinsic image (after `quarter_turns`)
/// 2. Scale the image so that `scale` number of tiles fit in each dimension
/// 3. Apply the `repeat` behavior to fill the container
/// 4. Center the pattern within the container
///
/// #### Scale behavior
/// The `scale` parameter controls how many tiles fit in the container:
/// - When container grows, more tiles are added (not bigger tiles)
/// - Higher scale = more tiles = smaller individual tiles
/// - Formula: `tile_scale = (container_size / image_size) / scale`
///
/// This mirrors:
/// - **CSS**: `background-size` + `background-repeat`
/// - **SVG**: `<image>` inside `<pattern>` with `preserveAspectRatio`
/// - **Skia**: image shader with local matrix and `SkTileMode`
#[derive(Debug, Clone)]
pub struct ImageTile {
    /// Extra spacing between tiles in pixels (box space). Can be negative to overlap.
    // pub spacing: (f32, f32),

    /// Controls the tile size relative to the original image size.
    ///
    /// This scale factor determines the size of each tile relative to the original image:
    /// - `scale = 1.0`: Tiles are the same size as the original image
    /// - `scale = 2.0`: Tiles are 2x larger than the original image (fewer tiles)
    /// - `scale = 0.5`: Tiles are 0.5x smaller than the original image (more tiles)
    ///
    /// The scale is applied directly to the image dimensions: `tile_size = image_size * scale`
    ///
    /// For proper tiling behavior, tiles maintain their size relative to the image
    /// dimensions. When the container grows, more tiles are repeated because the
    /// tile size is independent of the container size.
    pub scale: f32,

    /// How the image should repeat when painted within its container.
    pub repeat: ImageRepeat,
}

/// Defines how an image should repeat when painted within its container.
///
/// This mirrors the behavior of CSS `background-repeat` values, allowing
/// images to tile horizontally, vertically, both, or not at all.
///
/// See also:
/// - https://developer.mozilla.org/en-US/docs/Web/CSS/background-repeat
/// - https://api.flutter.dev/flutter/painting/ImageRepeat.html
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ImageRepeat {
    /// Repeat the image horizontally (X axis) only.
    #[serde(rename = "repeat-x")]
    RepeatX,
    /// Repeat the image vertically (Y axis) only.
    #[serde(rename = "repeat-y")]
    RepeatY,
    /// Repeat the image in both directions.
    #[serde(rename = "repeat")]
    Repeat,
}

impl Default for ImageRepeat {
    fn default() -> Self {
        ImageRepeat::Repeat
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
/// - **`alignement`**: Positions the fitted image within its container using normalized coordinates
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
    /// Positions the fitted image within its container.
    ///
    /// Uses normalized coordinates where `(-1.0, -1.0)` represents the top-left corner,
    /// `(0.0, 0.0)` represents the center, and `(1.0, 1.0)` represents the bottom-right corner.
    /// This behaves similarly to CSS `object-position`.
    pub alignement: Alignment,
    /// Defines how the image should be fitted within its container
    pub fit: ImagePaintFit,
    /// Controls the transparency of the image (0.0 = fully transparent, 1.0 = fully opaque)
    pub opacity: f32,
    /// Determines how the image blends with underlying content
    pub blend_mode: BlendMode,
    /// Applies visual effects like brightness, contrast, saturation, etc.
    pub filters: ImageFilters,
}

// #endregion
