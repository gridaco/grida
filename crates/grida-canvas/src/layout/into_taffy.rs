use crate::cg::types::*;
use crate::node::scene_graph::SceneGraph;
use crate::node::schema::{LayoutPositioningBasis, Node, NodeId, UniformNodeLayout};
use taffy::prelude::*;

/// Create a Taffy Style with Grida's preferred defaults.
///
/// ## Key differences from Taffy's defaults:
/// - `flex_shrink: 0.0` (instead of 1.0) - prevents children from automatically shrinking
///   when they overflow their flex container
/// - `align_content: Some(AlignContent::Start)` - prevents wrapped rows from stretching
///   and distributing extra vertical space, ensuring gap values are respected exactly
///
/// ## Rationale:
/// In design tools like Grida, users expect fixed-size elements to maintain their specified
/// dimensions and spacing. Taffy's default `flex_shrink: 1.0` causes elements to shrink,
/// and `align_content: None` (which behaves like Stretch) causes wrapped rows to distribute
/// extra space, both of which are unexpected behaviors for a design canvas.
///
/// This is a zero-cost abstraction - the compiler inlines this function.
#[inline]
fn grida_style_default() -> Style {
    Style {
        flex_shrink: 0.0,
        align_content: Some(AlignContent::Start),
        overflow: taffy::Point {
            x: taffy::Overflow::Clip,
            y: taffy::Overflow::Clip,
        },
        ..Style::default()
    }
}

/// Convert schema Axis to Taffy FlexDirection
impl From<Axis> for FlexDirection {
    fn from(axis: Axis) -> Self {
        match axis {
            Axis::Horizontal => FlexDirection::Row,
            Axis::Vertical => FlexDirection::Column,
        }
    }
}

/// Convert schema LayoutWrap to Taffy FlexWrap
impl From<LayoutWrap> for FlexWrap {
    fn from(wrap: LayoutWrap) -> Self {
        match wrap {
            LayoutWrap::Wrap => FlexWrap::Wrap,
            LayoutWrap::NoWrap => FlexWrap::NoWrap,
        }
    }
}

/// Convert schema MainAxisAlignment to Taffy JustifyContent
impl From<MainAxisAlignment> for JustifyContent {
    fn from(alignment: MainAxisAlignment) -> Self {
        match alignment {
            MainAxisAlignment::Start => JustifyContent::Start,
            MainAxisAlignment::End => JustifyContent::End,
            MainAxisAlignment::Center => JustifyContent::Center,
            MainAxisAlignment::SpaceBetween => JustifyContent::SpaceBetween,
            MainAxisAlignment::SpaceAround => JustifyContent::SpaceAround,
            MainAxisAlignment::SpaceEvenly => JustifyContent::SpaceEvenly,
            MainAxisAlignment::Stretch => JustifyContent::Stretch,
        }
    }
}

/// Convert schema CrossAxisAlignment to Taffy AlignItems
impl From<CrossAxisAlignment> for AlignItems {
    fn from(alignment: CrossAxisAlignment) -> Self {
        match alignment {
            CrossAxisAlignment::Start => AlignItems::Start,
            CrossAxisAlignment::End => AlignItems::End,
            CrossAxisAlignment::Center => AlignItems::Center,
            CrossAxisAlignment::Stretch => AlignItems::Stretch,
        }
    }
}

/// Convert schema EdgeInsets to Taffy Rect<LengthPercentage>
impl From<EdgeInsets> for Rect<LengthPercentage> {
    fn from(insets: EdgeInsets) -> Self {
        Rect {
            left: LengthPercentage::length(insets.left),
            right: LengthPercentage::length(insets.right),
            top: LengthPercentage::length(insets.top),
            bottom: LengthPercentage::length(insets.bottom),
        }
    }
}

/// Convert schema LayoutGap to Taffy gap based on flex direction
///
/// **IMPORTANT**: Taffy's gap is absolute (not direction-relative):
/// - `gap.width` = column-gap (horizontal spacing)
/// - `gap.height` = row-gap (vertical spacing)
///
/// Our LayoutGap is direction-relative (main/cross), so we need the flex direction
/// to map correctly. This function should NOT be used directly - use `layout_gap_to_taffy()`
/// with the direction parameter instead.
fn layout_gap_to_taffy(gap: LayoutGap, direction: Axis) -> Size<LengthPercentage> {
    match direction {
        Axis::Horizontal => {
            // Horizontal flex: main=horizontal, cross=vertical
            Size {
                width: LengthPercentage::length(gap.main_axis_gap), // column-gap
                height: LengthPercentage::length(gap.cross_axis_gap), // row-gap
            }
        }
        Axis::Vertical => {
            // Vertical flex: main=vertical, cross=horizontal
            Size {
                width: LengthPercentage::length(gap.cross_axis_gap), // column-gap
                height: LengthPercentage::length(gap.main_axis_gap), // row-gap
            }
        }
    }
}

impl From<LayoutPositioning> for taffy::Position {
    fn from(position: LayoutPositioning) -> Self {
        match position {
            LayoutPositioning::Auto => taffy::Position::Relative,
            LayoutPositioning::Absolute => taffy::Position::Absolute,
        }
    }
}

impl From<LayoutPositioningBasis> for Rect<LengthPercentageAuto> {
    fn from(position: LayoutPositioningBasis) -> Self {
        match position {
            LayoutPositioningBasis::Cartesian(point) => Rect {
                left: LengthPercentageAuto::length(point.x),
                right: LengthPercentageAuto::auto(),
                top: LengthPercentageAuto::length(point.y),
                bottom: LengthPercentageAuto::auto(),
            },
            LayoutPositioningBasis::Inset(inset) => Rect {
                left: LengthPercentageAuto::length(inset.left),
                right: LengthPercentageAuto::length(inset.right),
                top: LengthPercentageAuto::length(inset.top),
                bottom: LengthPercentageAuto::length(inset.bottom),
            },
            LayoutPositioningBasis::Anchored => {
                unreachable!("Anchored positioning is not supported")
            }
        }
    }
}

/// Convert schema LayoutStyle to Taffy Style
/// This provides a predictable, comprehensive mapping from our layout system to Taffy
impl From<UniformNodeLayout> for Style {
    fn from(layout: UniformNodeLayout) -> Self {
        let mut style = grida_style_default();

        // Handle layout mode - only apply flex properties if it's a flex container
        match layout.layout_mode {
            LayoutMode::Flex => {
                // Flex direction
                style.flex_direction = layout.layout_direction.into();

                // Flex wrap
                if let Some(wrap) = layout.layout_wrap {
                    style.flex_wrap = wrap.into();
                }

                // Main axis alignment (justify content)
                if let Some(alignment) = layout.layout_main_axis_alignment {
                    style.justify_content = Some(alignment.into());
                }

                // Cross axis alignment (align items)
                if let Some(alignment) = layout.layout_cross_axis_alignment {
                    style.align_items = Some(alignment.into());
                }

                // Gap - convert with direction awareness
                if let Some(gap) = layout.layout_gap {
                    style.gap = layout_gap_to_taffy(gap, layout.layout_direction);
                }

                // Flex grow
                if let Some(grow) = layout.layout_grow {
                    style.flex_grow = grow;
                }
            }
            LayoutMode::Normal => {
                // For normal layout mode, we don't set flex properties
                // This allows Taffy to use its default block layout behavior
            }
        }

        // Size constraints
        style.size = Size {
            width: if let Some(w) = layout.width {
                if w > 0.0 {
                    Dimension::length(w)
                } else {
                    Dimension::auto()
                }
            } else {
                Dimension::auto()
            },
            height: if let Some(h) = layout.height {
                if h > 0.0 {
                    Dimension::length(h)
                } else {
                    Dimension::auto()
                }
            } else {
                Dimension::auto()
            },
        };

        // Min/Max size constraints
        if let Some(min_w) = layout.min_width {
            style.min_size.width = Dimension::length(min_w);
        }
        if let Some(max_w) = layout.max_width {
            style.max_size.width = Dimension::length(max_w);
        }
        if let Some(min_h) = layout.min_height {
            style.min_size.height = Dimension::length(min_h);
        }
        if let Some(max_h) = layout.max_height {
            style.max_size.height = Dimension::length(max_h);
        }

        // Padding
        if let Some(padding) = layout.layout_padding {
            style.padding = padding.into();
        }

        // Position - Taffy handles positioning automatically
        style.inset = layout.position.into();
        style.position = layout.layout_positioning.into();

        style
    }
}

/// Universal node style mapping - converts any node type to Taffy Style
///
/// This is the central entry point for converting scene graph nodes to Taffy styles.
/// All node types are handled here, providing a unified approach to layout computation.
pub fn node_to_taffy_style(node: &Node, _graph: &SceneGraph, _node_id: &NodeId) -> Style {
    match node {
        Node::Container(n) => container_to_taffy_style(n),
        Node::InitialContainer(icb) => icb_to_taffy_style(icb),
        Node::Rectangle(n) => static_node_style(n.size.width, n.size.height),
        Node::Ellipse(n) => static_node_style(n.size.width, n.size.height),
        Node::TextSpan(n) => text_node_style(n),
        Node::Image(n) => static_node_style(n.size.width, n.size.height),
        Node::Line(n) => static_node_style(n.size.width, n.size.height),
        Node::Group(_) => {
            // Groups don't have size, use Grida defaults
            grida_style_default()
        }
        Node::Error(_) => grida_style_default(), // Error nodes have no dimensions
        // TODO: Add support for other node types as they are implemented
        _ => grida_style_default(), // Fallback for unimplemented node types
    }
}

/// Convert ContainerNodeRec to Taffy Style using existing UniformNodeLayout conversion
fn container_to_taffy_style(container: &crate::node::schema::ContainerNodeRec) -> Style {
    // Use our predictable LayoutStyle -> Style conversion
    let mut style: Style = container.layout().into();

    // Set display based on layout mode
    style.display = if container.layout().layout_mode == LayoutMode::Flex {
        Display::Flex
    } else {
        Display::Block
    };

    style
}

/// Convert InitialContainerNodeRec to Taffy Style
fn icb_to_taffy_style(icb: &crate::node::schema::InitialContainerNodeRec) -> Style {
    Style {
        display: Display::Flex,
        flex_direction: icb.layout_direction.into(),
        flex_wrap: icb.layout_wrap.into(),
        justify_content: Some(icb.layout_main_axis_alignment.into()),
        align_items: Some(icb.layout_cross_axis_alignment.into()),
        gap: layout_gap_to_taffy(icb.layout_gap, icb.layout_direction),
        padding: icb.padding.into(),
        // Size will be set by the layout engine for root ICB nodes
        ..grida_style_default()
    }
}

/// Create a static leaf node style for nodes with fixed dimensions
fn static_node_style(width: f32, height: f32) -> Style {
    Style {
        size: Size {
            width: Dimension::length(width),
            height: Dimension::length(height),
        },
        ..grida_style_default()
    }
}

/// Create a style for text nodes with optional width constraints
fn text_node_style(text: &crate::node::schema::TextSpanNodeRec) -> Style {
    let mut style = grida_style_default();

    // Set width if specified, otherwise auto
    if let Some(width) = text.width {
        style.size.width = Dimension::length(width);
    } else {
        style.size.width = Dimension::auto();
    }

    // Height is auto for text (will be determined by content)
    style.size.height = Dimension::auto();

    style
}
