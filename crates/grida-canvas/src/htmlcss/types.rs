//! CSS-specific type enums that don't exist in `cg::types`.
//!
//! These model CSS semantics that have no direct equivalent in the design-tool
//! schema. Types that DO align 1:1 with cg (e.g. `BlendMode`, `TextAlign`,
//! `FontWeight`) are reused from `cg::prelude` instead.

/// CSS `display` property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Display {
    #[default]
    Block,
    Inline,
    InlineBlock,
    Flex,
    Grid,
    Table,
    TableRow,
    TableCell,
    None,
}

/// CSS `visibility` property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Visibility {
    #[default]
    Visible,
    Hidden,
    Collapse,
}

/// CSS `overflow` property (per axis).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Overflow {
    #[default]
    Visible,
    Hidden,
    Clip,
    Scroll,
    Auto,
}

/// CSS `position` property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Position {
    #[default]
    Static,
    Relative,
    Absolute,
    Fixed,
}

/// CSS `border-style` property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum BorderStyle {
    #[default]
    None,
    Solid,
    Dashed,
    Dotted,
    Double,
    Groove,
    Ridge,
    Inset,
    Outset,
}

/// CSS `box-sizing` property. Initial value: `content-box` per spec.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum BoxSizing {
    #[default]
    ContentBox,
    BorderBox,
}

/// CSS `white-space` property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum WhiteSpace {
    #[default]
    Normal,
    Nowrap,
    Pre,
    PreWrap,
    PreLine,
}

/// CSS `flex-direction` property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum FlexDirection {
    #[default]
    Row,
    RowReverse,
    Column,
    ColumnReverse,
}

/// CSS `flex-wrap` property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum FlexWrap {
    #[default]
    Nowrap,
    Wrap,
    WrapReverse,
}

/// CSS `align-items` / `align-self` property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AlignItems {
    #[default]
    Stretch,
    Start,
    End,
    Center,
    Baseline,
}

/// CSS `justify-content` property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum JustifyContent {
    #[default]
    Start,
    End,
    Center,
    SpaceBetween,
    SpaceAround,
    SpaceEvenly,
}

/// A CSS length value. Percentages are kept as-is for Taffy to resolve.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum CssLength {
    #[default]
    Auto,
    Px(f32),
    Percent(f32),
}

/// CSS line-height (inherited text property).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum LineHeight {
    Normal,
    Number(f32),
    Px(f32),
}

impl Default for LineHeight {
    fn default() -> Self {
        Self::Normal
    }
}

/// CSS `float` property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Float {
    #[default]
    None,
    Left,
    Right,
}

/// CSS `clear` property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Clear {
    #[default]
    None,
    Left,
    Right,
    Both,
}

/// CSS `text-overflow` property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TextOverflow {
    #[default]
    Clip,
    Ellipsis,
}

/// CSS `vertical-align` property (inline-level).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum VerticalAlign {
    #[default]
    Baseline,
    Top,
    Middle,
    Bottom,
    TextTop,
    TextBottom,
    Sub,
    Super,
}

/// CSS `list-style-type` property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ListStyleType {
    #[default]
    Disc,
    Circle,
    Square,
    Decimal,
    DecimalLeadingZero,
    LowerAlpha,
    UpperAlpha,
    LowerRoman,
    UpperRoman,
    None,
}

/// CSS `list-style-position` property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ListStylePosition {
    #[default]
    Outside,
    Inside,
}

// ─── CSS Grid types ─────────────────────────────────────────────────

/// CSS `grid-auto-flow` property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum GridAutoFlow {
    #[default]
    Row,
    Column,
    RowDense,
    ColumnDense,
}

/// A single track sizing value — used in grid-template-columns/rows.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TrackBreadth {
    /// Fixed length in px.
    Px(f32),
    /// Percentage (0.0–1.0).
    Percent(f32),
    /// Flexible `fr` unit.
    Fr(f32),
    /// `auto`
    Auto,
    /// `min-content`
    MinContent,
    /// `max-content`
    MaxContent,
}

/// A track sizing function — `<track-size>` in CSS.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TrackSize {
    /// A single breadth value (used for both min and max).
    Single(TrackBreadth),
    /// `minmax(min, max)`.
    MinMax(TrackBreadth, TrackBreadth),
    /// `fit-content(limit)`.
    FitContent(TrackBreadth),
}

/// A `repeat()` count in grid-template-columns/rows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RepeatCount {
    /// `repeat(<integer>, ...)`
    Count(u16),
    /// `repeat(auto-fill, ...)`
    AutoFill,
    /// `repeat(auto-fit, ...)`
    AutoFit,
}

/// A single component in a grid-template-columns/rows definition.
#[derive(Debug, Clone, PartialEq)]
pub enum GridTemplateEntry {
    /// A single track sizing function.
    Track(TrackSize),
    /// `repeat(count, tracks...)`.
    Repeat(RepeatCount, Vec<TrackSize>),
}

/// CSS grid-column/row placement for an item.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum GridPlacement {
    /// `auto`
    #[default]
    Auto,
    /// A line number (1-based, can be negative).
    Line(i16),
    /// `span <n>`.
    Span(u16),
}
