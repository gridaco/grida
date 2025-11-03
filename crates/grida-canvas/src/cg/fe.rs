use super::*;
use serde::Deserialize;

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
    LayerBlur(FeBlur),

    /// Background blur filter
    /// A background blur effect, similar to CSS `backdrop-filter: blur(...)`
    BackdropBlur(FeBlur),

    /// Liquid glass effect
    LiquidGlass(FeLiquidGlass),
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

/// Liquid glass effect parameters
///
/// A physically-based glass effect with refraction, chromatic aberration, and Fresnel reflections.
/// This effect is designed for rectangular container elements (similar to HTML `div` with `border-radius`).
///
/// ## Key Properties
///
/// - **`light_intensity`**: Controls transmission/transparency of the glass (0.0 = opaque, 1.0 = fully transparent)
/// - **`refraction`**: Index of refraction that controls how much light bends (1.0 = no bend/air, 1.5 = typical glass)
/// - **`depth`**: Glass thickness that creates the 3D curved surface effect
/// - **`dispersion`**: Chromatic aberration strength (color separation at edges)
/// - **`blur_radius`**: Background blur radius for frosted glass appearance
///
/// ## Limitations
///
/// This effect only works with rectangular shapes. It uses Signed Distance Fields (SDFs) to generate
/// the 3D glass surface, which requires continuous distance information not available for arbitrary paths.
///
/// ## See also:
/// - Shader implementation: `src/shaders/liquid_glass_effect.sksl`
/// - Documentation: `src/shaders/liquid_glass_effect.md`
/// - Example: `examples/golden_liquid_glass.rs`
#[derive(Debug, Clone, Copy)]
pub struct FeLiquidGlass {
    /// Controls transmission/transparency [0.0-1.0]
    /// Higher values = more see-through glass
    pub light_intensity: f32,

    /// Light angle in degrees (reserved for future use)
    pub light_angle: f32,

    /// Refraction strength [0.0-1.0]
    /// 0.0 = no refraction, 0.5 = typical glass, 1.0 = maximum refraction
    /// Internally mapped to IOR range [1.0-2.0]
    pub refraction: f32,

    /// Glass thickness/depth for 3D surface effect in pixels [1.0+]
    /// Controls the curvature height of the glass surface
    /// Higher values create more pronounced lens curvature and stronger refraction
    /// Typical values: 20-100 pixels
    pub depth: f32,

    /// Chromatic aberration strength [0.0-1.0]
    /// Controls color separation at edges (rainbow effect)
    pub dispersion: f32,

    /// Blur radius for frosted glass effect [0.0+] in pixels
    /// Applied via Skia's native blur before refraction shader
    pub blur_radius: f32,
}

impl Default for FeLiquidGlass {
    fn default() -> Self {
        Self {
            light_intensity: 0.9,
            light_angle: 45.0,
            refraction: 0.8,  // Normalized [0.0-1.0], maps to IOR [1.0-2.0]
            depth: 20.0,      // Absolute pixels [1.0+], typical values: 20-100
            dispersion: 0.5,  // Chromatic aberration strength [0.0-1.0]
            blur_radius: 4.0, // Blur radius in pixels
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
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

/// Progressive blur effect with gradient-based blur intensity.
///
/// Applies a blur that varies in intensity along a gradient direction, creating a smooth
/// transition from sharp to blurred. The blur intensity is controlled by two points (start/end)
/// and their corresponding blur radii.
///
/// ## Coordinate System: Normalized Node-Local Space
///
/// The `start` and `end` coordinates use **normalized node-local space** with [`Alignment`],
/// identical to how linear gradient coordinates work:
///
/// - `Alignment(0.0, 0.0)` = center of the node
/// - `Alignment(-1.0, -1.0)` = top-left corner
/// - `Alignment(1.0, 1.0)` = bottom-right corner
/// - `Alignment(0.0, -1.0)` = top edge center
/// - `Alignment(0.0, 1.0)` = bottom edge center
///
/// Values can extend beyond `[-1.0, 1.0]` to define gradients that start/end outside the node bounds.
///
/// This normalized system ensures the effect scales correctly with the node regardless of its
/// actual pixel dimensions, and works consistently across different rendering contexts.
///
/// ### Important: Canvas vs Node-Local Coordinates
///
/// **In production (node effects)**: Coordinates are **node-local** and automatically scaled
/// to the node's dimensions. A vertical blur from top to bottom is simply:
/// ```rust
/// use cg::cg::{types::FeProgressiveBlur, alignment::Alignment};
///
/// let blur = FeProgressiveBlur {
///     start: Alignment(0.0, -1.0),  // Top center (node-local)
///     end: Alignment(0.0, 1.0),      // Bottom center (node-local)
///     radius: 0.0,
///     radius2: 40.0,
/// };
/// ```
/// This works for **any node size** - the coordinates are relative to the node's bounds.
///
/// **In standalone examples (canvas-space)**: When applying progressive blur directly to a
/// canvas without a node (as in `golden_progressive_blur.rs`), you must manually calculate
/// and convert canvas-space pixel coordinates to normalized coordinates:
/// ```rust
/// # use cg::cg::{types::FeProgressiveBlur, alignment::Alignment};
/// // For a 150×300 rectangle at canvas position (125, 50):
/// // Node bounds: x=125..275, y=50..350
/// // Node center: (200, 200)
/// // Node half-size: (75, 150)
///
/// // To blur from top to bottom in node-local space:
/// let blur = FeProgressiveBlur {
///     start: Alignment(0.0, -1.0),  // Top edge of node
///     end: Alignment(0.0, 1.0),      // Bottom edge of node  
///     radius: 0.0,
///     radius2: 40.0,
/// };
/// ```
///
/// ### Example: Vertical Gradient Blur
///
/// ```rust
/// use cg::cg::{types::FeProgressiveBlur, alignment::Alignment};
///
/// // Blur from sharp at top to maximum at bottom (works for any node size)
/// let blur = FeProgressiveBlur {
///     start: Alignment(0.0, -1.0),  // Top edge (sharp)
///     end: Alignment(0.0, 1.0),      // Bottom edge (max blur)
///     radius: 0.0,    // No blur at start
///     radius2: 40.0,  // 40px blur at end
/// };
/// ```
///
/// ### Example: Diagonal Gradient Blur
///
/// ```rust
/// # use cg::cg::{types::FeProgressiveBlur, alignment::Alignment};
/// // Blur from top-left to bottom-right
/// let blur = FeProgressiveBlur {
///     start: Alignment(-1.0, -1.0),  // Top-left corner (sharp)
///     end: Alignment(1.0, 1.0),      // Bottom-right corner (max blur)
///     radius: 0.0,
///     radius2: 30.0,
/// };
/// ```
///
/// ### Example: Horizontal Gradient Blur
///
/// ```rust
/// # use cg::cg::{types::FeProgressiveBlur, alignment::Alignment};
/// // Blur from left edge to right edge
/// let blur = FeProgressiveBlur {
///     start: Alignment(-1.0, 0.0),  // Left edge center (sharp)
///     end: Alignment(1.0, 0.0),      // Right edge center (max blur)
///     radius: 0.0,
///     radius2: 25.0,
/// };
/// ```
///
/// ## Production Usage: Automatic Scaling
///
/// When used as a `LayerEffects` blur on scene graph nodes, the normalized coordinates
/// are automatically scaled to the node's pixel dimensions:
///
/// ```ignore
/// // For a 200×400 pixel rectangle node:
/// FeProgressiveBlur {
///     start: Alignment(0.0, -1.0),  // Top edge in node-local space
///     end: Alignment(0.0, 1.0),      // Bottom edge in node-local space
///     radius: 0.0,
///     radius2: 40.0,
/// }
/// // The gradient runs vertically through the rectangle regardless of its position on canvas.
/// // Alignment(0.0, -1.0) evaluates to y=0 (top), Alignment(0.0, 1.0) evaluates to y=400 (bottom).
/// ```
///
/// The node can be positioned anywhere on the canvas, and the blur gradient will correctly
/// follow the node's transform (translation, rotation, scale).
///
/// ## Gradient Direction & Interpolation
///
/// The blur intensity is determined by projecting each pixel onto the gradient vector from
/// `start` to `end`:
/// - Pixels at the start point have blur radius = `radius`  
/// - Pixels at the end point have blur radius = `radius2`
/// - Pixels between are linearly interpolated
///
/// ## Implementation Details
///
/// Uses a two-pass separable Gaussian blur for performance (~30× faster than 2D blur):
/// 1. Horizontal pass: blur along X-axis with gradient-varying radius
/// 2. Vertical pass: blur along Y-axis with gradient-varying radius
///
/// This is mathematically equivalent to 2D Gaussian blur while being significantly faster.
///
/// ## See Also
///
/// - [`Alignment`] - The coordinate system used for start/end points
/// - Shader implementation: `src/shaders/progressive_blur_horizontal.sksl`, `progressive_blur_vertical.sksl`
/// - Documentation: `src/shaders/progressive_blur.md`  
/// - Examples: `examples/golden_progressive_blur.rs`, `examples/golden_progressive_blur_backdrop.rs`
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct FeProgressiveBlur {
    /// Gradient start point in normalized node-local space
    ///
    /// Uses [`Alignment`] coordinates where `(0.0, 0.0)` is the center,
    /// `(-1.0, -1.0)` is top-left, and `(1.0, 1.0)` is bottom-right.
    pub start: Alignment,

    /// Gradient end point in normalized node-local space
    ///
    /// Uses [`Alignment`] coordinates where `(0.0, 0.0)` is the center,
    /// `(-1.0, -1.0)` is top-left, and `(1.0, 1.0)` is bottom-right.
    pub end: Alignment,

    /// Blur radius at gradient start point (pixels)
    pub radius: f32,

    /// Blur radius at gradient end point (pixels)
    pub radius2: f32,
}
