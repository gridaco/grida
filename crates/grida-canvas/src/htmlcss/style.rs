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
    pub box_shadow: Vec<BoxShadow>,

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
    pub row_gap: f32,
    pub column_gap: f32,

    // ── Flex child (rare non-inherited) ──
    pub flex_grow: f32,
    pub flex_shrink: f32,
    pub flex_basis: CssLength,
    pub align_self: Option<AlignItems>,

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
    /// Image layer: gradient or URL-referenced image.
    /// Chromium: `FillLayer::image_` field holding a `StyleImage*`.
    Image(StyleImage),
}

/// CSS `linear-gradient()`.
#[derive(Debug, Clone)]
pub struct LinearGradient {
    /// Angle in CSS degrees (0 = to top, 90 = to right, 180 = to bottom).
    pub angle_deg: f32,
    pub stops: Vec<GradientStop>,
}

/// CSS `radial-gradient()`.
#[derive(Debug, Clone)]
pub struct RadialGradient {
    pub stops: Vec<GradientStop>,
    // TODO: shape (circle/ellipse), size, position
}

/// CSS `conic-gradient()`.
#[derive(Debug, Clone)]
pub struct ConicGradient {
    pub stops: Vec<GradientStop>,
    // TODO: from angle, at position
}

/// A gradient color stop.
#[derive(Debug, Clone, Copy)]
pub struct GradientStop {
    pub offset: f32, // 0.0 = start, 1.0 = end
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
    /// Bitfield: multiple decorations can be active simultaneously.
    /// CSS `text-decoration-line: underline line-through` sets both.
    pub decoration_underline: bool,
    pub decoration_overline: bool,
    pub decoration_line_through: bool,
    pub decoration_style: TextDecorationStyle,
    pub decoration_color: Option<CGColor>,
    pub white_space: WhiteSpace,
    pub text_indent: f32,
    pub text_overflow: TextOverflow,
    pub vertical_align: VerticalAlign,
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
            decoration_underline: false,
            decoration_overline: false,
            decoration_line_through: false,
            decoration_style: TextDecorationStyle::Solid,
            decoration_color: None,
            white_space: WhiteSpace::Normal,
            text_indent: 0.0,
            text_overflow: TextOverflow::Clip,
            vertical_align: VerticalAlign::Baseline,
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
            color: CGColor::BLACK,
            font: FontProps::default(),
            outline: Outline::default(),
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            overflow_x: Overflow::Visible,
            overflow_y: Overflow::Visible,
            box_shadow: Vec::new(),
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
            row_gap: 0.0,
            column_gap: 0.0,
            flex_grow: 0.0,
            flex_shrink: 1.0,
            flex_basis: CssLength::Auto,
            align_self: None,
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
