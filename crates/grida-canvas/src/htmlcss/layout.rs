//! Phase 2: `StyledElement` tree → Taffy layout → `LayoutBox` tree.
//!
//! Builds a Taffy tree from the styled IR, runs CSS layout (block flow,
//! flexbox, grid), and produces positioned boxes with resolved dimensions.

use crate::cg::prelude::CGColor;
use crate::runtime::font_repository::FontRepository;

use skia_safe::font_style;
use skia_safe::textlayout::{FontCollection, ParagraphBuilder, ParagraphStyle, TextStyle};

use taffy::style::{Dimension, LengthPercentage, LengthPercentageAuto};
use taffy::{AvailableSpace, NodeId as TaffyNodeId, TaffyTree};

use super::style::*;
use super::types;

// ─── Output types ────────────────────────────────────────────────────

/// A positioned box after layout.
#[derive(Debug)]
pub struct LayoutBox<'a> {
    pub style: &'a StyledElement,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub children: Vec<LayoutNode<'a>>,
}

/// A positioned node — either a box, text, or inline group.
#[derive(Debug)]
pub enum LayoutNode<'a> {
    Box(LayoutBox<'a>),
    Text {
        run: &'a TextRun,
        x: f32,
        y: f32,
        width: f32,
    },
    InlineGroup {
        group: &'a InlineGroup,
        x: f32,
        y: f32,
        width: f32,
    },
}

// ─── Layout computation ──────────────────────────────────────────────

/// Run layout on a `StyledElement` tree and produce a positioned `LayoutBox` tree.
pub fn compute_layout<'a>(
    root: &'a StyledElement,
    available_width: f32,
    fonts: &FontRepository,
) -> LayoutBox<'a> {
    let font_collection = fonts.font_collection();
    let mut taffy: TaffyTree<TextMeasure> = TaffyTree::new();
    // Disable rounding — subpixel precision avoids text wrapping artifacts
    // where Taffy rounds a box width down by 1px, making text that barely
    // fits on one line wrap to two lines.
    taffy.disable_rounding();

    // Build Taffy tree
    let taffy_root = build_taffy_node(&mut taffy, root, font_collection);

    // Run layout with text measurement callback
    let fc = font_collection.clone();
    let _ = taffy.compute_layout_with_measure(
        taffy_root,
        taffy::Size {
            width: AvailableSpace::Definite(available_width),
            height: AvailableSpace::MaxContent,
        },
        |known_dimensions, available_space, _node_id, context, _style| {
            text_measure_func(known_dimensions, available_space, context, &fc)
        },
    );

    // Extract results
    extract_layout(&taffy, taffy_root, root, 0.0, 0.0)
}

/// Compute just the content height (without building a full LayoutBox tree).
pub fn compute_content_height(
    root: &StyledElement,
    available_width: f32,
    fonts: &FontRepository,
) -> f32 {
    let font_collection = fonts.font_collection();
    let mut taffy: TaffyTree<TextMeasure> = TaffyTree::new();
    taffy.disable_rounding();
    let taffy_root = build_taffy_node(&mut taffy, root, font_collection);
    let fc = font_collection.clone();
    let _ = taffy.compute_layout_with_measure(
        taffy_root,
        taffy::Size {
            width: AvailableSpace::Definite(available_width),
            height: AvailableSpace::MaxContent,
        },
        |known_dimensions, available_space, _node_id, context, _style| {
            text_measure_func(known_dimensions, available_space, context, &fc)
        },
    );
    let layout = taffy.layout(taffy_root).unwrap();
    layout.size.height
}

// ─── Taffy tree construction ─────────────────────────────────────────

fn build_taffy_node(
    taffy: &mut TaffyTree<TextMeasure>,
    el: &StyledElement,
    fonts: &FontCollection,
) -> TaffyNodeId {
    let style = element_to_taffy_style(el);

    // Build child nodes
    let mut child_ids: Vec<TaffyNodeId> = Vec::new();

    for child in &el.children {
        match child {
            StyledNode::Element(child_el) => {
                if child_el.display != types::Display::None {
                    child_ids.push(build_taffy_node(taffy, child_el, fonts));
                }
            }
            StyledNode::Text(run) => {
                let leaf_style = taffy::Style {
                    display: taffy::Display::Block,
                    ..taffy::Style::default()
                };
                let text_node = taffy
                    .new_leaf_with_context(
                        leaf_style,
                        TextMeasure {
                            items: vec![InlineRunItem::Text(run.clone())],
                        },
                    )
                    .unwrap();
                child_ids.push(text_node);
            }
            StyledNode::InlineGroup(group) => {
                let leaf_style = taffy::Style {
                    display: taffy::Display::Block,
                    ..taffy::Style::default()
                };
                let text_node = taffy
                    .new_leaf_with_context(
                        leaf_style,
                        TextMeasure {
                            items: group.items.clone(),
                        },
                    )
                    .unwrap();
                child_ids.push(text_node);
            }
        }
    }

    taffy.new_with_children(style, &child_ids).unwrap()
}

/// Taffy context for text/inline leaf nodes. Stores inline items so the
/// measure function can build a Skia Paragraph with placeholders at any
/// available width.
///
/// Mirrors Chromium's `InlineNode::ItemsData()` — the flat list of items
/// used by `LineBreaker` for measurement and line breaking.
#[derive(Debug, Clone)]
struct TextMeasure {
    items: Vec<InlineRunItem>,
}

/// Taffy measure callback — builds a Skia Paragraph at the given available
/// width and returns its intrinsic size.
fn text_measure_func(
    known_dimensions: taffy::Size<Option<f32>>,
    available_space: taffy::Size<AvailableSpace>,
    context: Option<&mut TextMeasure>,
    fonts: &FontCollection,
) -> taffy::Size<f32> {
    let Some(ctx) = context else {
        return taffy::Size::ZERO;
    };

    // If both dimensions are known, use them directly
    if let (Some(w), Some(h)) = (known_dimensions.width, known_dimensions.height) {
        return taffy::Size {
            width: w,
            height: h,
        };
    }

    // Build Paragraph with placeholders for inline box spacing
    // (Chromium: LineBreaker processes kOpenTag/kText/kCloseTag)
    let ps = ParagraphStyle::new();
    let mut builder = ParagraphBuilder::new(&ps, fonts);
    for item in &ctx.items {
        match item {
            InlineRunItem::Text(run) => {
                let ts = build_skia_text_style(&run.font, &run.color);
                builder.push_style(&ts);
                builder.add_text(&run.text);
                builder.pop();
            }
            InlineRunItem::OpenBox { inline_size, .. }
            | InlineRunItem::CloseBox { inline_size } => {
                if *inline_size > 0.0 {
                    builder.add_placeholder(&skia_safe::textlayout::PlaceholderStyle::new(
                        *inline_size,
                        0.01,
                        skia_safe::textlayout::PlaceholderAlignment::Baseline,
                        skia_safe::textlayout::TextBaseline::Alphabetic,
                        0.0,
                    ));
                }
            }
        }
    }
    let mut para = builder.build();

    // Layout at large width first to get intrinsic measurements
    para.layout(100_000.0);
    let max_intrinsic = para.max_intrinsic_width().ceil();
    let min_intrinsic = para.min_intrinsic_width().ceil();

    // Determine layout width from available space
    let layout_width = match available_space.width {
        AvailableSpace::Definite(w) => known_dimensions.width.unwrap_or(w),
        AvailableSpace::MinContent => min_intrinsic,
        AvailableSpace::MaxContent => max_intrinsic,
    };

    // Re-layout at actual width for correct line breaking and height
    para.layout(layout_width);

    taffy::Size {
        width: known_dimensions
            .width
            .unwrap_or(max_intrinsic.min(layout_width)),
        height: known_dimensions.height.unwrap_or(para.height()),
    }
}

/// Convert StyledElement to Taffy Style.
fn element_to_taffy_style(el: &StyledElement) -> taffy::Style {
    taffy::Style {
        display: match el.display {
            types::Display::Flex => taffy::Display::Flex,
            types::Display::Grid => taffy::Display::Grid,
            types::Display::None => taffy::Display::None,
            _ => taffy::Display::Block,
        },
        position: match el.position {
            types::Position::Absolute | types::Position::Fixed => taffy::Position::Absolute,
            _ => taffy::Position::Relative,
        },
        size: taffy::Size {
            width: css_length_to_dim(el.width),
            height: css_length_to_dim(el.height),
        },
        min_size: taffy::Size {
            width: css_length_to_dim(el.min_width),
            height: css_length_to_dim(el.min_height),
        },
        max_size: taffy::Size {
            width: css_length_to_dim(el.max_width),
            height: css_length_to_dim(el.max_height),
        },
        margin: taffy::Rect {
            top: css_length_to_lpa(el.margin.top),
            right: css_length_to_lpa(el.margin.right),
            bottom: css_length_to_lpa(el.margin.bottom),
            left: css_length_to_lpa(el.margin.left),
        },
        padding: taffy::Rect {
            top: LengthPercentage::length(el.padding.top),
            right: LengthPercentage::length(el.padding.right),
            bottom: LengthPercentage::length(el.padding.bottom),
            left: LengthPercentage::length(el.padding.left),
        },
        border: taffy::Rect {
            top: LengthPercentage::length(el.border.top.width),
            right: LengthPercentage::length(el.border.right.width),
            bottom: LengthPercentage::length(el.border.bottom.width),
            left: LengthPercentage::length(el.border.left.width),
        },
        inset: taffy::Rect {
            top: css_length_to_lpa(el.inset.top),
            right: css_length_to_lpa(el.inset.right),
            bottom: css_length_to_lpa(el.inset.bottom),
            left: css_length_to_lpa(el.inset.left),
        },
        flex_direction: match el.flex_direction {
            types::FlexDirection::Row => taffy::FlexDirection::Row,
            types::FlexDirection::RowReverse => taffy::FlexDirection::RowReverse,
            types::FlexDirection::Column => taffy::FlexDirection::Column,
            types::FlexDirection::ColumnReverse => taffy::FlexDirection::ColumnReverse,
        },
        flex_wrap: match el.flex_wrap {
            types::FlexWrap::Nowrap => taffy::FlexWrap::NoWrap,
            types::FlexWrap::Wrap => taffy::FlexWrap::Wrap,
            types::FlexWrap::WrapReverse => taffy::FlexWrap::WrapReverse,
        },
        align_items: Some(map_align_items(el.align_items)),
        justify_content: Some(map_justify_content(el.justify_content)),
        gap: taffy::Size {
            width: LengthPercentage::length(el.column_gap),
            height: LengthPercentage::length(el.row_gap),
        },
        flex_grow: el.flex_grow,
        flex_shrink: el.flex_shrink,
        flex_basis: css_length_to_dim(el.flex_basis),
        align_self: el.align_self.map(|a| match a {
            types::AlignItems::Start => taffy::AlignSelf::FlexStart,
            types::AlignItems::End => taffy::AlignSelf::FlexEnd,
            types::AlignItems::Center => taffy::AlignSelf::Center,
            types::AlignItems::Stretch => taffy::AlignSelf::Stretch,
            types::AlignItems::Baseline => taffy::AlignSelf::Baseline,
        }),
        overflow: taffy::Point {
            x: map_overflow(el.overflow_x),
            y: map_overflow(el.overflow_y),
        },
        ..taffy::Style::default()
    }
}

// ─── Conversion helpers ──────────────────────────────────────────────

fn css_length_to_dim(len: types::CssLength) -> Dimension {
    match len {
        types::CssLength::Px(px) => Dimension::length(px),
        types::CssLength::Percent(pct) => Dimension::percent(pct),
        types::CssLength::Auto => Dimension::auto(),
    }
}

fn css_length_to_lpa(len: types::CssLength) -> LengthPercentageAuto {
    match len {
        types::CssLength::Px(px) => LengthPercentageAuto::length(px),
        types::CssLength::Percent(pct) => LengthPercentageAuto::percent(pct),
        types::CssLength::Auto => LengthPercentageAuto::auto(),
    }
}

fn map_align_items(a: types::AlignItems) -> taffy::AlignItems {
    match a {
        types::AlignItems::Start => taffy::AlignItems::FlexStart,
        types::AlignItems::End => taffy::AlignItems::FlexEnd,
        types::AlignItems::Center => taffy::AlignItems::Center,
        types::AlignItems::Stretch => taffy::AlignItems::Stretch,
        types::AlignItems::Baseline => taffy::AlignItems::Baseline,
    }
}

fn map_justify_content(j: types::JustifyContent) -> taffy::JustifyContent {
    match j {
        types::JustifyContent::Start => taffy::JustifyContent::FlexStart,
        types::JustifyContent::End => taffy::JustifyContent::FlexEnd,
        types::JustifyContent::Center => taffy::JustifyContent::Center,
        types::JustifyContent::SpaceBetween => taffy::JustifyContent::SpaceBetween,
        types::JustifyContent::SpaceAround => taffy::JustifyContent::SpaceAround,
        types::JustifyContent::SpaceEvenly => taffy::JustifyContent::SpaceEvenly,
    }
}

fn map_overflow(ov: types::Overflow) -> taffy::Overflow {
    match ov {
        types::Overflow::Hidden | types::Overflow::Clip => taffy::Overflow::Clip,
        types::Overflow::Scroll => taffy::Overflow::Scroll,
        _ => taffy::Overflow::Visible,
    }
}

// ─── Layout extraction ───────────────────────────────────────────────

fn extract_layout<'a>(
    taffy: &TaffyTree<TextMeasure>,
    taffy_node: TaffyNodeId,
    el: &'a StyledElement,
    offset_x: f32,
    offset_y: f32,
) -> LayoutBox<'a> {
    let layout = taffy.layout(taffy_node).unwrap();
    let x = offset_x + layout.location.x;
    let y = offset_y + layout.location.y;
    let w = layout.size.width;
    let h = layout.size.height;

    let taffy_children = taffy.children(taffy_node).unwrap();
    let mut children = Vec::new();

    let mut child_idx = 0;
    for styled_child in &el.children {
        if child_idx >= taffy_children.len() {
            break;
        }
        match styled_child {
            StyledNode::Element(child_el) => {
                if child_el.display == types::Display::None {
                    continue;
                }
                let child_layout =
                    extract_layout(taffy, taffy_children[child_idx], child_el, 0.0, 0.0);
                children.push(LayoutNode::Box(child_layout));
                child_idx += 1;
            }
            StyledNode::Text(run) => {
                let child_taffy = taffy.layout(taffy_children[child_idx]).unwrap();
                children.push(LayoutNode::Text {
                    run,
                    x: child_taffy.location.x,
                    y: child_taffy.location.y,
                    width: child_taffy.size.width,
                });
                child_idx += 1;
            }
            StyledNode::InlineGroup(group) => {
                let child_taffy = taffy.layout(taffy_children[child_idx]).unwrap();
                children.push(LayoutNode::InlineGroup {
                    group,
                    x: child_taffy.location.x,
                    y: child_taffy.location.y,
                    width: child_taffy.size.width,
                });
                child_idx += 1;
            }
        }
    }

    LayoutBox {
        style: el,
        x,
        y,
        width: w,
        height: h,
        children,
    }
}

// ─── Skia text style builder (for measurement) ───────────────────────

pub(crate) fn build_skia_text_style(font: &FontProps, color: &CGColor) -> TextStyle {
    let mut ts = TextStyle::new();
    ts.set_font_size(font.size);

    let weight = font_style::Weight::from(font.weight.0 as i32);
    let slant = if font.italic {
        font_style::Slant::Italic
    } else {
        font_style::Slant::Upright
    };
    ts.set_font_style(skia_safe::FontStyle::new(
        weight,
        font_style::Width::NORMAL,
        slant,
    ));

    // Map CSS generic families to platform-concrete names
    let families: Vec<String> = font
        .families
        .iter()
        .map(|s| match s.as_str() {
            "system-ui" | "-apple-system" | "BlinkMacSystemFont" => {
                ".AppleSystemUIFont".to_string()
            }
            "sans-serif" => "Helvetica".to_string(),
            "serif" => "Times".to_string(),
            "monospace" => "Menlo".to_string(),
            other => other.to_string(),
        })
        .collect();
    let family_refs: Vec<&str> = families.iter().map(|s| s.as_str()).collect();
    if family_refs.is_empty() {
        ts.set_font_families(&["Helvetica", "Arial"]);
    } else {
        ts.set_font_families(&family_refs);
    }

    ts.set_color(skia_safe::Color::from_argb(
        color.a, color.r, color.g, color.b,
    ));

    match font.line_height {
        types::LineHeight::Normal => {
            ts.set_height_override(true);
            ts.set_height(1.5);
        }
        types::LineHeight::Number(n) => {
            ts.set_height_override(true);
            ts.set_height(n);
        }
        types::LineHeight::Px(px) => {
            ts.set_height_override(true);
            ts.set_height(px / font.size);
        }
    }

    if font.letter_spacing != 0.0 {
        ts.set_letter_spacing(font.letter_spacing);
    }
    if font.word_spacing != 0.0 {
        ts.set_word_spacing(font.word_spacing);
    }

    // Text decoration (bitfield — underline + line-through can both be active)
    use skia_safe::textlayout;
    let mut decoration = textlayout::TextDecoration::NO_DECORATION;
    if font.decoration_underline {
        decoration |= textlayout::TextDecoration::UNDERLINE;
    }
    if font.decoration_line_through {
        decoration |= textlayout::TextDecoration::LINE_THROUGH;
    }
    if font.decoration_overline {
        decoration |= textlayout::TextDecoration::OVERLINE;
    }
    if decoration != textlayout::TextDecoration::NO_DECORATION {
        ts.set_decoration_type(decoration);
        ts.set_decoration_style(textlayout::TextDecorationStyle::Solid);
        ts.set_decoration_color(skia_safe::Color::from_argb(
            color.a, color.r, color.g, color.b,
        ));
        ts.set_decoration_thickness_multiplier(1.0);
    }

    ts
}
