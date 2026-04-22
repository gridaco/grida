//! Styled element IR — resolved CSS properties as plain Rust structs.
//!
//! Property grouping is inspired by Chromium's `ComputedStyle` sub-structs
//! (`StyleBoxData`, `StyleSurroundData`, `StyleBackgroundData`, etc.) but
//! flattened into a single struct since our styled tree is short-lived.
//!
//! ## CG type reuse
//!
//! Types from `cg::prelude` are reused where they align 1:1 with CSS:
//! `CGColor`, `EdgeInsets`, `BlendMode`, `TextAlign`, `FontWeight`,
//! `TextTransform`, `TextDecorationLine`, `TextDecorationStyle`.

use crate::cg::prelude::{
    BlendMode, CGColor, EdgeInsets, FontWeight, TextAlign, TextDecorationStyle, TextTransform,
};

use super::types::*;

// ─── StyledElement ───────────────────────────────────────────────────

/// A styled HTML element with all CSS properties resolved.
///
/// Groups follow Chromium's ComputedStyle organization:
/// - **Box model** — sizing, margin, padding, border (StyleBoxData + StyleSurroundData)
/// - **Background** — background-color, border-radius (StyleBackgroundData)
/// - **Text** — inherited text/font properties (StyleInheritedData)
/// - **Visual effects** — opacity, overflow, blend-mode, visibility, box-shadow (rare non-inherited)
/// - **Positioning** — position, inset, z-index, float (rare non-inherited)
/// - **Flex/Grid** — flex-direction, align-items, gap, etc. (rare non-inherited)
/// - **Children** — child nodes in DOM order
#[derive(Debug, Clone)]
pub struct StyledElement {
    pub tag: String,

    // ── Display (StyleBoxData) ──
    pub display: Display,
    pub visibility: Visibility,
    pub box_sizing: BoxSizing,

    // ── Box Model: sizing (StyleBoxData) ──
    pub width: CssLength,
    pub height: CssLength,
    pub min_width: CssLength,
    pub max_width: CssLength,
    pub min_height: CssLength,
    pub max_height: CssLength,
    /// CSS `aspect-ratio` — stored as `width / height` (e.g. `16/9` → `1.777…`).
    /// `None` means `auto` (no preferred ratio).
    pub aspect_ratio: Option<f32>,

    // ── Box Model: spacing (StyleBoxData + StyleSurroundData) ──
    pub margin: CssEdgeInsets,
    pub padding: EdgeInsets,
    pub border: BorderBox,

    // ── Background (StyleBackgroundData) ──
    /// Background layers, bottom-to-top. May include solid color and/or gradients.
    pub background: Vec<BackgroundLayer>,
    pub border_radius: CornerRadii,
    // TODO: background-position, background-size, background-repeat

    // ── Border Image (Chromium: NinePieceImage) ──
    /// CSS `border-image` — replaces normal borders with a 9-slice image.
    /// `None` when `border-image-source` is not set or is `none`.
    pub border_image: Option<BorderImage>,

    // ── Text / Font (StyleInheritedData — inherited through tree) ──
    pub color: CGColor,
    pub font: FontProps,

    // ── Outline (rare non-inherited — does not affect layout) ──
    /// CSS `outline`. Painted on top of all content, follows border-radius.
    /// Chromium: `OutlinePainter`, `PaintPhase::kSelfOutlineOnly`.
    pub outline: Outline,

    // ── Visual Effects (rare non-inherited) ──
    pub opacity: f32,
    pub blend_mode: BlendMode,
    pub overflow_x: Overflow,
    pub overflow_y: Overflow,
    /// CSS `overflow-clip-margin` — additional px margin around the clip
    /// rect when `overflow: clip` is active. Ignored for `hidden`,
    /// `scroll`, or `auto`.
    pub overflow_clip_margin: f32,
    pub box_shadow: Vec<BoxShadow>,
    /// CSS `filter` chain, applied in order to the element and its
    /// descendants via a paint layer wrapped in a Skia `ImageFilter`.
    pub filter: Vec<FilterFunction>,
    /// CSS `clip-path` — clips the element and its descendants to a
    /// basic shape. Evaluated at paint time against the element's
    /// border box.
    pub clip_path: ClipPath,

    // ── Transform (rare non-inherited) ──
    /// CSS `transform` operations, preserving unresolved percentage/length
    /// operands. Empty means no transform. Resolved to a matrix at paint time.
    pub transform: Vec<TransformOp>,
    /// CSS `transform-origin`. Defaults to 50% 50% (center).
    pub transform_origin: TransformOrigin,

    // ── Positioning (rare non-inherited) ──
    pub position: Position,
    pub inset: CssEdgeInsets,
    pub z_index: Option<i32>,
    pub float: Float,
    pub clear: Clear,

    // ── Flex container (rare non-inherited) ──
    pub flex_direction: FlexDirection,
    pub flex_wrap: FlexWrap,
    pub align_items: AlignItems,
    pub justify_content: JustifyContent,
    /// Per-cell alignment of grid items along the inline axis.
    /// Ignored by flex containers.
    pub justify_items: AlignItems,
    /// Content-level alignment of rows along the block axis (grid) or
    /// cross-axis when `flex-wrap: wrap` (flex). `None` means the CSS
    /// default (`normal`, which behaves like `stretch`) — defer to
    /// Taffy so it can pick the layout-method-appropriate behavior.
    pub align_content: Option<JustifyContent>,
    pub row_gap: f32,
    pub column_gap: f32,

    // ── Flex child (rare non-inherited) ──
    pub flex_grow: f32,
    pub flex_shrink: f32,
    pub flex_basis: CssLength,
    pub align_self: Option<AlignItems>,
    /// Overrides the parent's `justify-items` for this grid cell.
    pub justify_self: Option<AlignItems>,

    // ── Grid container (rare non-inherited) ──
    pub grid_template_columns: Vec<GridTemplateEntry>,
    pub grid_template_rows: Vec<GridTemplateEntry>,
    pub grid_auto_columns: Vec<TrackSize>,
    pub grid_auto_rows: Vec<TrackSize>,
    pub grid_auto_flow: GridAutoFlow,

    // ── Grid child (rare non-inherited) ──
    pub grid_column_start: GridPlacement,
    pub grid_column_end: GridPlacement,
    pub grid_row_start: GridPlacement,
    pub grid_row_end: GridPlacement,

    // ── Widget (form controls) ──
    /// Widget appearance for form controls. Populated from HTML tag +
    /// attributes during collect phase. `WidgetAppearance::None` for
    /// non-widget elements.
    pub widget: WidgetAppearance,

    // ── Replaced content (<img>) ──
    /// For replaced elements (`<img>`), the external content reference.
    /// `None` for normal elements.
    pub replaced: Option<ReplacedContent>,

    // ── Children ──
    pub children: Vec<StyledNode>,
}

/// A node in the styled tree.
#[allow(clippy::large_enum_variant)]
#[derive(Debug, Clone)]
pub enum StyledNode {
    Element(StyledElement),
    Text(TextRun),
    /// Consecutive inline content (text + inline elements) merged into one
    /// paragraph. Each run carries its own font/color — mapped to Skia
    /// ParagraphBuilder push_style/pop per run.
    InlineGroup(InlineGroup),
}

/// Content of a replaced element (Chromium: `LayoutReplaced`).
///
/// Replaced elements have intrinsic dimensions from their content, not
/// from CSS. The `src` URL is resolved via `ImageProvider` at paint time.
///
/// Intrinsic size resolution order (follows HTML spec):
/// 1. Decoded image dimensions (from `ImageProvider::get_size()`)
/// 2. HTML `width`/`height` attributes
/// 3. Default 300×150 (HTML spec fallback for replaced elements)
#[derive(Debug, Clone)]
pub struct ReplacedContent {
    /// Image source URL (from HTML `src` attribute).
    pub src: String,
    /// Alt text for placeholder display when image is unavailable.
    pub alt: Option<String>,
    /// Intrinsic width hint from HTML `width` attribute.
    pub attr_width: Option<u32>,
    /// Intrinsic height hint from HTML `height` attribute.
    pub attr_height: Option<u32>,
    /// CSS `object-fit` — how the image content fits its box.
    pub object_fit: super::types::ObjectFit,
    /// CSS `object-position` — where the content sits inside the box
    /// after `object-fit` scaling. The CSS initial value is `50% 50%`,
    /// which differs from `BackgroundPosition::default()` (`0% 0%`);
    /// construction paths for `<img>` should use
    /// `BackgroundPosition::center()` so the image is centered by
    /// default rather than pinned to the top-left.
    pub object_position: BackgroundPosition,
}

/// Consecutive inline items merged into a single paragraph.
///
/// Maps to Chromium's flat `InlineItem` list within an inline formatting
/// context. Items include text runs and open/close box markers that inject
/// spacing for inline element padding/border/margin.
#[derive(Debug, Clone)]
pub struct InlineGroup {
    pub items: Vec<InlineRunItem>,
    pub text_align: TextAlign,
    /// Inherited `direction` — sets the paragraph's base bidi
    /// direction (LTR / RTL). Passed to Skia's `ParagraphStyle`.
    pub direction: super::types::Direction,
    /// Inherited `text-indent` of the containing block. Applied as a
    /// first-line-only inline-start offset by prepending a Skia
    /// placeholder to the Paragraph.
    pub text_indent: CssLength,
}

/// An item within an inline formatting context.
///
/// Mirrors Chromium's `InlineItem::InlineItemType`:
/// - `Text` → `kText` — a contiguous span of styled text
/// - `OpenBox` → `kOpenTag` — start of an inline box (adds inline-start spacing)
/// - `CloseBox` → `kCloseTag` — end of an inline box (adds inline-end spacing)
#[derive(Debug, Clone)]
pub enum InlineRunItem {
    /// Text content with uniform styling.
    Text(TextRun),
    /// Start of an inline box — injects `inline_size` spacing before text.
    /// Chromium: `HandleOpenTag()` → `position_ += margins.inline_start + borders.inline_start + padding.inline_start`
    OpenBox {
        /// Inline-start spacing = margin + border + padding (inline-start side).
        inline_size: f32,
        decoration: InlineBoxDecoration,
    },
    /// End of an inline box — injects `inline_size` spacing after text.
    /// Chromium: `HandleCloseTag()` → `ComputeInlineEndSize()`
    CloseBox {
        /// Inline-end spacing = padding + border + margin (inline-end side).
        inline_size: f32,
    },
}

// ─── Box Model Sub-types (StyleSurroundData) ─────────────────────────

/// Edge insets that may contain `auto` or `%` values (for margin, inset).
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct CssEdgeInsets {
    pub top: CssLength,
    pub right: CssLength,
    pub bottom: CssLength,
    pub left: CssLength,
}

/// Per-side border properties.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BorderSide {
    pub width: f32,
    pub color: CGColor,
    pub style: BorderStyle,
}

impl Default for BorderSide {
    fn default() -> Self {
        Self {
            width: 0.0,
            color: CGColor::BLACK,
            style: BorderStyle::None,
        }
    }
}

/// Four-sided border box.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct BorderBox {
    pub top: BorderSide,
    pub right: BorderSide,
    pub bottom: BorderSide,
    pub left: BorderSide,
}

/// CSS `border-image` resolved properties (Chromium: NinePieceImage).
///
/// Replaces normal CSS borders with a 9-slice image. The source image is
/// divided into 9 regions by `slice` offsets, then each region is drawn
/// into the corresponding part of the element's border area.
#[derive(Debug, Clone)]
pub struct BorderImage {
    /// Image source — url() or gradient.
    pub source: StyleImage,
    /// Slice offsets (top, right, bottom, left) in source image coordinates.
    /// Defines how the source image is divided into 9 regions.
    pub slice: EdgeInsets,
    /// Whether to paint the center region (CSS `fill` keyword).
    pub fill: bool,
    /// Border-image rendering widths. `None` = use element's border-width.
    pub width: Option<EdgeInsets>,
    /// Outset: extends the border-image area beyond the border box.
    pub outset: EdgeInsets,
    /// Repeat mode for horizontal edges (top/bottom).
    pub repeat_x: super::types::BorderImageRepeat,
    /// Repeat mode for vertical edges (left/right).
    pub repeat_y: super::types::BorderImageRepeat,
}

/// CSS `outline` — uniform stroke painted on top of all content.
///
/// Unlike `border`, outline is always uniform (no per-side control),
/// does not affect layout, and paints over content rather than between
/// background and content.
///
/// Chromium: `ComputedStyle::OutlineWidth()`, `OutlineColor()`,
/// `OutlineStyle()`, `OutlineOffset()`. Painted by `OutlinePainter`
/// during `PaintPhase::kSelfOutlineOnly`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Outline {
    pub width: f32,
    pub color: CGColor,
    pub style: BorderStyle,
    /// Distance from the border edge. Positive = outward, negative = inward.
    pub offset: f32,
}

impl Default for Outline {
    fn default() -> Self {
        Self {
            width: 0.0,
            color: CGColor::BLACK,
            style: BorderStyle::None,
            offset: 0.0,
        }
    }
}

impl Outline {
    /// Returns `true` if the outline is visible (non-zero width + visible style).
    /// Chromium: `ComputedStyle::HasOutline()`.
    pub fn has_outline(&self) -> bool {
        self.width > 0.0 && self.style != BorderStyle::None
    }
}

/// Per-corner border radii with separate x/y values (elliptical).
///
/// CSS: `border-radius: 10px / 20px` → each corner has (rx=10, ry=20).
/// Skia: `RRect::set_rect_radii` takes `[Point; 4]` where each Point is (rx, ry).
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct CornerRadii {
    pub tl_x: f32,
    pub tl_y: f32,
    pub tr_x: f32,
    pub tr_y: f32,
    pub br_x: f32,
    pub br_y: f32,
    pub bl_x: f32,
    pub bl_y: f32,
}

impl CornerRadii {
    /// Create uniform circular radii (same x/y per corner).
    pub fn uniform(tl: f32, tr: f32, br: f32, bl: f32) -> Self {
        Self {
            tl_x: tl,
            tl_y: tl,
            tr_x: tr,
            tr_y: tr,
            br_x: br,
            br_y: br,
            bl_x: bl,
            bl_y: bl,
        }
    }

    pub fn is_zero(&self) -> bool {
        self.tl_x == 0.0
            && self.tl_y == 0.0
            && self.tr_x == 0.0
            && self.tr_y == 0.0
            && self.br_x == 0.0
            && self.br_y == 0.0
            && self.bl_x == 0.0
            && self.bl_y == 0.0
    }

    /// Convert to Skia's `[Point; 4]` format for `RRect::set_rect_radii`.
    pub fn to_skia_radii(&self) -> [skia_safe::Point; 4] {
        [
            skia_safe::Point::new(self.tl_x, self.tl_y),
            skia_safe::Point::new(self.tr_x, self.tr_y),
            skia_safe::Point::new(self.br_x, self.br_y),
            skia_safe::Point::new(self.bl_x, self.bl_y),
        ]
    }

    /// Max radius (for simplified single-value contexts like inline decoration).
    pub fn max_radius(&self) -> f32 {
        self.tl_x
            .max(self.tl_y)
            .max(self.tr_x.max(self.tr_y))
            .max(self.br_x.max(self.br_y))
            .max(self.bl_x.max(self.bl_y))
    }
}

// ─── Visual Effects Sub-types ────────────────────────────────────────

/// CSS `box-shadow` value.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BoxShadow {
    pub offset_x: f32,
    pub offset_y: f32,
    pub blur: f32,
    pub spread: f32,
    pub color: CGColor,
    pub inset: bool,
}

/// CSS `clip-path` basic shapes.
///
/// Positions and lengths resolve against the element's border box at
/// paint time. `Url` (SVG `clipPath` reference) and `path()` / `shape()`
/// are not yet plumbed.
#[derive(Debug, Clone, Default)]
pub enum ClipPath {
    #[default]
    None,
    /// `inset(<top> <right> <bottom> <left> [round <radius>])`.
    ///
    /// Radii are stored as `CssLength` per corner/axis so percentage
    /// values survive collect. Resolution to px happens in
    /// `apply_clip_path` against the inset clip rect.
    Inset {
        top: CssLength,
        right: CssLength,
        bottom: CssLength,
        left: CssLength,
        radius: InsetCornerRadii,
    },
    /// `circle(<radius> at <cx> <cy>)`.
    Circle {
        cx: CssLength,
        cy: CssLength,
        radius: ShapeRadius,
    },
    /// `ellipse(<rx> <ry> at <cx> <cy>)`.
    Ellipse {
        cx: CssLength,
        cy: CssLength,
        rx: ShapeRadius,
        ry: ShapeRadius,
    },
    /// `polygon([<fill-rule>,] <point-list>)`.
    Polygon {
        points: Vec<(CssLength, CssLength)>,
        even_odd: bool,
    },
}

/// Per-corner radii for `clip-path: inset(... round ...)`. Each axis
/// holds a `CssLength` so percentage radii (resolved against the
/// inset clip rect) survive to paint time.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct InsetCornerRadii {
    pub tl_x: CssLength,
    pub tl_y: CssLength,
    pub tr_x: CssLength,
    pub tr_y: CssLength,
    pub br_x: CssLength,
    pub br_y: CssLength,
    pub bl_x: CssLength,
    pub bl_y: CssLength,
}

impl Default for InsetCornerRadii {
    fn default() -> Self {
        let zero = CssLength::Px(0.0);
        Self {
            tl_x: zero,
            tl_y: zero,
            tr_x: zero,
            tr_y: zero,
            br_x: zero,
            br_y: zero,
            bl_x: zero,
            bl_y: zero,
        }
    }
}

impl InsetCornerRadii {
    /// Returns true when every axis is definitely zero. Percentage
    /// values with a non-zero fraction are treated as non-zero even
    /// though the resolved px amount depends on the clip rect.
    pub fn is_zero(&self) -> bool {
        let is_z = |v: CssLength| match v {
            CssLength::Px(p) => p == 0.0,
            CssLength::Percent(p) => p == 0.0,
            CssLength::Calc { px, percent } => px == 0.0 && percent == 0.0,
            CssLength::Auto => true,
        };
        is_z(self.tl_x)
            && is_z(self.tl_y)
            && is_z(self.tr_x)
            && is_z(self.tr_y)
            && is_z(self.br_x)
            && is_z(self.br_y)
            && is_z(self.bl_x)
            && is_z(self.bl_y)
    }
}

/// Radius expression used by `circle()` and `ellipse()` in `clip-path`.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum ShapeRadius {
    /// Explicit length or percentage against the reference box axis.
    Length(CssLength),
    /// `closest-side` — distance from center to nearest edge.
    /// Default per CSS Shapes spec when `circle()` is written without
    /// an explicit radius.
    #[default]
    ClosestSide,
    /// `farthest-side` — distance from center to farthest edge.
    FarthestSide,
}

/// CSS `filter` functions. Scope covers the color/blur filters
/// representable via `skia_safe::image_filters::blur`, drop-shadow, or
/// a 4×5 color matrix. SVG `url()` filter references are not yet
/// plumbed.
#[derive(Debug, Clone, Copy)]
pub enum FilterFunction {
    /// `blur(<length>)` — Gaussian blur. Value is CSS px; Skia sigma is `px / 2`.
    Blur(f32),
    /// `brightness(<number>)` — 1.0 is identity.
    Brightness(f32),
    /// `contrast(<number>)` — 1.0 is identity.
    Contrast(f32),
    /// `grayscale(<0..1>)` — 0 is identity, 1 is full grayscale.
    Grayscale(f32),
    /// `hue-rotate(<angle>)` — radians.
    HueRotate(f32),
    /// `invert(<0..1>)` — 0 is identity, 1 is fully inverted.
    Invert(f32),
    /// `opacity(<0..1>)` — 1 is identity.
    Opacity(f32),
    /// `saturate(<number>)` — 1.0 is identity; 0 is grayscale.
    Saturate(f32),
    /// `sepia(<0..1>)` — 0 is identity, 1 is full sepia tone.
    Sepia(f32),
    /// `drop-shadow(<offset-x> <offset-y> <blur> <color>)` — Gaussian
    /// shadow of the alpha silhouette, composed behind the source.
    DropShadow {
        offset_x: f32,
        offset_y: f32,
        blur: f32,
        color: CGColor,
    },
}

/// CSS `text-shadow` entry — one shadow in a comma-separated list.
#[derive(Debug, Clone, Copy)]
pub struct TextShadow {
    pub offset_x: f32,
    pub offset_y: f32,
    pub blur: f32,
    pub color: CGColor,
}

// ─── Background Sub-types (StyleBackgroundData) ─────────────────────

/// A CSS image value — polymorphic like Chromium's `StyleImage`.
///
/// Gradients are always synchronous (generated at paint time from parameters).
/// URL images are resolved lazily via `ImageProvider` at paint time.
///
/// Chromium: `StyleImage` base class with subclasses `StyleFetchedImage`
/// (URL-referenced), `StyleGeneratedImage` (gradients), `StylePendingImage`.
#[derive(Debug, Clone)]
pub enum StyleImage {
    /// `url("...")` — resolved at paint time via `ImageProvider`.
    /// Chromium: `StyleFetchedImage` wrapping `ImageResourceContent`.
    Url(String),
    /// `linear-gradient(...)` — generated at paint time from parameters.
    LinearGradient(LinearGradient),
    /// `radial-gradient(...)` — generated at paint time from parameters.
    RadialGradient(RadialGradient),
    /// `conic-gradient(...)` — generated at paint time from parameters.
    ConicGradient(ConicGradient),
}

/// A single background layer — solid color or image.
///
/// Mirrors Chromium's `FillLayer` which stores a `StyleImage*` for any
/// background layer type (gradient, url, or none) plus a separate color
/// slot. Our representation flattens this into a two-variant enum.
#[derive(Debug, Clone)]
pub enum BackgroundLayer {
    /// Solid color fill (CSS `background-color`).
    Solid(CGColor),
    /// Image layer with full CSS geometry (size, position, repeat, clip, origin).
    /// Chromium: `FillLayer` with image, size, position, repeat, clip, origin.
    Image(BackgroundImage),
}

/// A CSS background image layer with geometry.
#[derive(Debug, Clone)]
pub struct BackgroundImage {
    pub source: StyleImage,
    pub size: BackgroundSize,
    pub position: BackgroundPosition,
    pub repeat: BackgroundRepeat,
    pub clip: BackgroundBox,
    pub origin: BackgroundBox,
}

/// CSS `background-size`.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum BackgroundSize {
    /// `auto` / `auto auto` — use intrinsic size; fall back to 100% 100%.
    #[default]
    Auto,
    /// `cover`
    Cover,
    /// `contain`
    Contain,
    /// `<width> <height>` with `auto` permitted on either axis.
    Explicit { width: CssLength, height: CssLength },
}

/// CSS `background-position` resolved to a 2D offset.
/// Each axis is `Px`/`Percent`; `Auto` is treated as `Percent(0.0)`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BackgroundPosition {
    pub x: CssLength,
    pub y: CssLength,
}

impl Default for BackgroundPosition {
    /// `0% 0%` — the CSS initial value for `background-position`.
    ///
    /// NOTE: this is **not** the right default for `object-position`,
    /// which is `50% 50%`. Use `BackgroundPosition::center()` at
    /// construction time whenever the context calls for a centered
    /// default.
    fn default() -> Self {
        BackgroundPosition {
            x: CssLength::Percent(0.0),
            y: CssLength::Percent(0.0),
        }
    }
}

impl BackgroundPosition {
    /// `50% 50%` — the CSS initial value for `object-position`.
    pub fn center() -> Self {
        BackgroundPosition {
            x: CssLength::Percent(0.5),
            y: CssLength::Percent(0.5),
        }
    }
}

/// CSS `background-repeat` keyword, per axis.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum BackgroundRepeatKeyword {
    #[default]
    Repeat,
    NoRepeat,
    Space,
    Round,
}

/// CSS `background-repeat` as an `(x, y)` pair.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct BackgroundRepeat {
    pub x: BackgroundRepeatKeyword,
    pub y: BackgroundRepeatKeyword,
}

/// Common box reference for `background-clip` and `background-origin`.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum BackgroundBox {
    #[default]
    BorderBox,
    PaddingBox,
    ContentBox,
}

/// CSS gradient `color-interpolation-method` — the color space where color
/// stops are blended.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum GradientColorSpace {
    #[default]
    Oklab,
    Srgb,
    SrgbLinear,
    Hsl,
    Hwb,
    Lab,
    Lch,
    Oklch,
    DisplayP3,
    Rec2020,
    A98Rgb,
    ProphotoRgb,
    XyzD50,
    XyzD65,
}

/// Hue interpolation strategy for cylindrical color spaces (HSL, HWB, LCH, OKLCH).
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum GradientHueMethod {
    #[default]
    Shorter,
    Longer,
    Increasing,
    Decreasing,
}

/// Resolved CSS `color-interpolation-method` on a gradient.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct GradientInterpolation {
    pub color_space: GradientColorSpace,
    pub hue_method: GradientHueMethod,
}

/// CSS `linear-gradient()` / `repeating-linear-gradient()`.
#[derive(Debug, Clone)]
pub struct LinearGradient {
    /// Angle in CSS degrees (0 = to top, 90 = to right, 180 = to bottom).
    pub angle_deg: f32,
    pub stops: Vec<GradientStop>,
    pub repeating: bool,
    pub interpolation: GradientInterpolation,
}

/// CSS `radial-gradient()` / `repeating-radial-gradient()`.
#[derive(Debug, Clone)]
pub struct RadialGradient {
    pub shape: RadialShape,
    pub size: RadialSize,
    pub center: GradientPosition,
    pub stops: Vec<GradientStop>,
    pub repeating: bool,
    pub interpolation: GradientInterpolation,
}

/// CSS `conic-gradient()` / `repeating-conic-gradient()`.
#[derive(Debug, Clone)]
pub struct ConicGradient {
    /// `from <angle>` — CSS degrees measured clockwise from 12 o'clock.
    /// 0 = top (default). Paint-time conversion adjusts for Skia's +x origin.
    pub from_angle_deg: f32,
    pub center: GradientPosition,
    pub stops: Vec<GradientStop>,
    pub repeating: bool,
    pub interpolation: GradientInterpolation,
}

/// Radial gradient shape.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum RadialShape {
    Circle,
    /// CSS default when shape omitted.
    #[default]
    Ellipse,
}

/// Radial gradient extent.
///
/// `Explicit` carries radii resolved at paint time (percent against box size).
/// For circles, only `x` is meaningful (parser guarantees `y == x`).
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum RadialSize {
    ClosestSide,
    ClosestCorner,
    FarthestSide,
    /// CSS default when size omitted.
    #[default]
    FarthestCorner,
    Explicit {
        x: CssLength,
        y: CssLength,
    },
}

/// Center of a radial or conic gradient. CSS default is `50% 50%`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GradientPosition {
    pub x: CssLength,
    pub y: CssLength,
}

impl Default for GradientPosition {
    fn default() -> Self {
        Self {
            x: CssLength::Percent(0.5),
            y: CssLength::Percent(0.5),
        }
    }
}

/// A gradient color stop.
#[derive(Debug, Clone, Copy)]
pub struct GradientStop {
    /// Stop position. When `offset_is_px` is false this is a fraction
    /// of the gradient line (0.0 = start, 1.0 = end) resolved at
    /// extraction time. When true it is a raw px offset along the
    /// gradient line, resolved to a fraction at paint time using the
    /// geometry-dependent line length. Only meaningful for
    /// linear/radial — conic stop positions are always angular.
    pub offset: f32,
    pub offset_is_px: bool,
    pub color: CGColor,
}

// ─── Text / Font Sub-types (StyleInheritedData) ──────────────────────

/// Font and text styling properties (inherited through the tree).
///
/// Maps to Chromium's `StyleInheritedData` + font-related rare inherited data.
#[derive(Debug, Clone)]
pub struct FontProps {
    pub size: f32,
    pub weight: FontWeight,
    pub italic: bool,
    pub families: Vec<String>,
    pub line_height: LineHeight,
    pub letter_spacing: f32,
    pub word_spacing: f32,
    pub text_align: TextAlign,
    pub text_transform: TextTransform,
    pub direction: super::types::Direction,
    /// Bitfield: multiple decorations can be active simultaneously.
    /// CSS `text-decoration-line: underline line-through` sets both.
    pub decoration_underline: bool,
    pub decoration_overline: bool,
    pub decoration_line_through: bool,
    pub decoration_style: TextDecorationStyle,
    pub decoration_color: Option<CGColor>,
    /// CSS `text-shadow`. Inherited. Bottom-to-top paint order.
    pub text_shadow: Vec<TextShadow>,
    pub white_space: WhiteSpace,
    pub text_indent: CssLength,
    pub text_overflow: TextOverflow,
    pub vertical_align: VerticalAlign,
    /// CSS `image-rendering` — quality hint for raster images used by
    /// `<img>`, `background-image: url()`, and border-image.
    pub image_rendering: super::types::ImageRendering,
    // TODO: word-break, overflow-wrap, tab-size
}

impl Default for FontProps {
    fn default() -> Self {
        Self {
            size: 16.0,
            weight: FontWeight::REGULAR400,
            italic: false,
            families: vec!["system-ui".into(), "sans-serif".into()],
            line_height: LineHeight::Normal,
            letter_spacing: 0.0,
            word_spacing: 0.0,
            text_align: TextAlign::Left,
            text_transform: TextTransform::None,
            direction: super::types::Direction::Ltr,
            decoration_underline: false,
            decoration_overline: false,
            decoration_line_through: false,
            decoration_style: TextDecorationStyle::Solid,
            decoration_color: None,
            text_shadow: Vec::new(),
            white_space: WhiteSpace::Normal,
            text_indent: CssLength::Px(0.0),
            text_overflow: TextOverflow::Clip,
            vertical_align: VerticalAlign::Baseline,
            image_rendering: super::types::ImageRendering::Auto,
        }
    }
}

/// A text run — inline text content with inherited styling.
///
/// Maps to Chromium's `InlineItem` of type `kText` — a contiguous span
/// of text with uniform styling within an inline formatting context.
///
/// For inline elements with box decorations (`<code>`, `<kbd>`, `<mark>`),
/// the run carries an `InlineBoxDecoration` with background, border, radius,
/// and padding. These are painted as separate rects using
/// `Paragraph::get_rects_for_range()` (Chromium: `InlineBoxPainter`).
#[derive(Debug, Clone)]
pub struct TextRun {
    pub text: String,
    pub font: FontProps,
    pub color: CGColor,
    /// Inline box decoration (background, border, border-radius, padding).
    pub decoration: Option<InlineBoxDecoration>,
}

/// Visual box decoration for an inline element — painted as a rect around
/// the text run's character range.
///
/// Maps to Chromium's `InlineBoxState` box decoration data. In Chromium,
/// every inline element with non-zero `padding`, `border`, or `margin`
/// creates box fragments via `HandleOpenTag`/`HandleCloseTag` in
/// `LineBreaker`. The decoration (background, border, border-radius) is
/// painted by `InlineBoxPainter` at the fragment's physical rect.
///
/// In our implementation, decoration rects are computed post-layout via
/// `Paragraph::get_rects_for_range()` and expanded by padding/border.
///
/// **Chromium divergence:** Chromium treats inline padding as layout space
/// (shifts text position, consumes line width). We treat it as visual-only
/// (expands decoration rect outward, text is not inset). See research doc
/// `docs/wg/research/chromium/blink-rendering-pipeline.md`.
#[derive(Debug, Clone)]
pub struct InlineBoxDecoration {
    /// Background color fill (CSS `background-color`).
    pub background: Option<CGColor>,
    /// Border stroke (simplified to uniform — CSS `border`).
    /// Chromium: `ComputeBordersForInline()` in `LineBreaker`.
    pub border: Option<BorderSide>,
    /// Border radius (CSS `border-radius`). Chromium: from `ComputedStyle`.
    pub border_radius: f32,
    /// Inline-axis padding (CSS `padding-left`/`padding-right`).
    /// Chromium: `ComputeLinePadding()` — consumed as layout space.
    /// Our impl: visual expansion of decoration rect only.
    pub padding_inline: f32,
    /// Block-axis padding (CSS `padding-top`/`padding-bottom`).
    pub padding_block: f32,
}

// ─── Widget Appearance (form controls) ──────────────────────────────

/// Widget appearance metadata, extracted from HTML tag + attributes.
///
/// Named after the CSS `appearance` property (Chromium: `ControlPart`).
/// When `appearance: auto`, browsers paint platform-native chrome for
/// these widgets. Our renderer paints a generic/neutral chrome — the
/// "generic platform" look.
///
/// Per CSS spec, widgets are **non-replaced** inline-block elements with
/// standard box model. This enum captures the widget-specific visual
/// identity that goes beyond normal CSS box painting.
///
/// Variant names follow Chromium's `ControlPart` / `-webkit-appearance`
/// keyword values: `TextField`, `Checkbox`, `Radio`, `Menulist`,
/// `PushButton`, `SliderHorizontal`, `ColorWell`.
#[derive(Debug, Clone, Default)]
pub enum WidgetAppearance {
    /// Not a widget — normal CSS element.
    #[default]
    None,
    /// `<input type="text|email|password|search|url|tel|number">`
    /// or `<input>` with no `type` (defaults to `"text"`).
    TextField {
        input_type: TextFieldType,
        placeholder: Option<String>,
        value: Option<String>,
        size: u32, // HTML `size` attribute (default 20)
        disabled: bool,
    },
    /// `<input type="checkbox">`
    Checkbox { checked: bool, disabled: bool },
    /// `<input type="radio">`
    Radio { checked: bool, disabled: bool },
    /// `<textarea>`
    TextArea {
        placeholder: Option<String>,
        value: Option<String>,
        rows: u32,
        cols: u32,
        disabled: bool,
    },
    /// `<select>` — shows selected option text + dropdown caret.
    Menulist {
        selected_text: Option<String>,
        disabled: bool,
    },
    /// `<button>` or `<input type="submit|reset|button">`.
    /// Button content flows through normal children — only metadata here.
    PushButton { disabled: bool },
    /// `<input type="range">`
    SliderHorizontal {
        min: f32,
        max: f32,
        value: f32,
        disabled: bool,
    },
    /// `<input type="color">`
    ColorWell { value: CGColor, disabled: bool },
}

impl WidgetAppearance {
    /// Returns `true` if this is any widget (not `None`).
    pub fn is_widget(&self) -> bool {
        !matches!(self, WidgetAppearance::None)
    }
}

/// Sub-type for text field inputs — determines masking behavior and
/// input-mode hints.
#[derive(Debug, Clone, Default, PartialEq)]
pub enum TextFieldType {
    #[default]
    Text,
    Password,
    Email,
    Search,
    Url,
    Tel,
    Number,
}

// ─── Defaults ────────────────────────────────────────────────────────

impl Default for StyledElement {
    fn default() -> Self {
        Self {
            tag: String::new(),
            display: Display::Block,
            visibility: Visibility::Visible,
            box_sizing: BoxSizing::default(),
            width: CssLength::Auto,
            height: CssLength::Auto,
            min_width: CssLength::Auto,
            max_width: CssLength::Auto,
            min_height: CssLength::Auto,
            max_height: CssLength::Auto,
            aspect_ratio: None,
            margin: CssEdgeInsets::default(),
            padding: EdgeInsets::zero(),
            border: BorderBox::default(),
            background: Vec::new(),
            border_radius: CornerRadii::default(),
            border_image: None,
            color: CGColor::BLACK,
            font: FontProps::default(),
            outline: Outline::default(),
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            overflow_x: Overflow::Visible,
            overflow_y: Overflow::Visible,
            overflow_clip_margin: 0.0,
            box_shadow: Vec::new(),
            filter: Vec::new(),
            clip_path: ClipPath::None,
            transform: Vec::new(),
            transform_origin: TransformOrigin::default(),
            position: Position::Static,
            inset: CssEdgeInsets::default(),
            z_index: None,
            float: Float::None,
            clear: Clear::None,
            flex_direction: FlexDirection::default(),
            flex_wrap: FlexWrap::default(),
            align_items: AlignItems::default(),
            justify_content: JustifyContent::default(),
            justify_items: AlignItems::default(),
            align_content: None,
            row_gap: 0.0,
            column_gap: 0.0,
            flex_grow: 0.0,
            flex_shrink: 1.0,
            flex_basis: CssLength::Auto,
            align_self: None,
            justify_self: None,
            grid_template_columns: Vec::new(),
            grid_template_rows: Vec::new(),
            grid_auto_columns: Vec::new(),
            grid_auto_rows: Vec::new(),
            grid_auto_flow: GridAutoFlow::default(),
            grid_column_start: GridPlacement::default(),
            grid_column_end: GridPlacement::default(),
            grid_row_start: GridPlacement::default(),
            grid_row_end: GridPlacement::default(),
            widget: WidgetAppearance::default(),
            replaced: None,
            children: Vec::new(),
        }
    }
}
