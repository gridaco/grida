use crate::cg::prelude::*;
use crate::node::scene_graph::SceneGraph;
use crate::node::schema::{LayoutPositioningBasis, Node, NodeId, NodeRectMixin, UniformNodeLayout};
use math2::transform::AffineTransform;
use taffy::prelude::*;

/// Create a Taffy Style with Grida's preferred defaults.
///
/// ## Key differences from Taffy's defaults:
/// - `flex_shrink: 0.0` (instead of 1.0) - prevents children from automatically shrinking
///   when they overflow their flex container
///
/// ## Rationale:
/// In design tools like Grida, users expect fixed-size elements to maintain their specified
/// dimensions. Taffy's default `flex_shrink: 1.0` causes elements to shrink when the container
/// is too small, which is unexpected behavior for a design canvas. Users should explicitly
/// opt-in to shrinking behavior if needed.
///
/// This is a zero-cost abstraction - the compiler inlines this function.
#[inline]
fn grida_style_default() -> Style {
    Style {
        flex_shrink: 0.0,
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

/// Convert schema CrossAxisAlignment to Taffy AlignContent
/// This controls how wrapped flex lines are aligned in the cross axis
impl From<CrossAxisAlignment> for AlignContent {
    fn from(alignment: CrossAxisAlignment) -> Self {
        match alignment {
            CrossAxisAlignment::Start => AlignContent::Start,
            CrossAxisAlignment::End => AlignContent::End,
            CrossAxisAlignment::Center => AlignContent::Center,
            CrossAxisAlignment::Stretch => AlignContent::Stretch,
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

                // align_content: Controls how wrapped flex lines are aligned in the cross axis
                // Only relevant when flex-wrap is enabled
                if layout.layout_wrap == Some(LayoutWrap::Wrap) {
                    if let Some(alignment) = layout.layout_cross_axis_alignment {
                        // User specified alignment - use it for line distribution
                        style.align_content = Some(alignment.into());
                    } else {
                        // No alignment specified - use Start to prevent Taffy's default
                        // stretch behavior from expanding gaps between wrapped lines
                        style.align_content = Some(AlignContent::Start);
                    }
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
            width: if let Some(w) = layout.layout_target_width {
                if w > 0.0 {
                    Dimension::length(w)
                } else {
                    Dimension::auto()
                }
            } else {
                Dimension::auto()
            },
            height: if let Some(h) = layout.layout_target_height {
                if h > 0.0 {
                    Dimension::length(h)
                } else {
                    Dimension::auto()
                }
            } else {
                Dimension::auto()
            },
        };

        // Target aspect ratio constraint (w / h)
        if let Some((w, h)) = layout.layout_target_aspect_ratio {
            if w.is_finite() && h.is_finite() && w > 0.0 && h > 0.0 {
                style.aspect_ratio = Some(w / h);
            }
        }

        // Min/Max size constraints
        if let Some(min_w) = layout.layout_min_width {
            style.min_size.width = Dimension::length(min_w);
        }
        if let Some(max_w) = layout.layout_max_width {
            style.max_size.width = Dimension::length(max_w);
        }
        if let Some(min_h) = layout.layout_min_height {
            style.min_size.height = Dimension::length(min_h);
        }
        if let Some(max_h) = layout.layout_max_height {
            style.max_size.height = Dimension::length(max_h);
        }

        // Padding
        if let Some(padding) = layout.layout_padding {
            style.padding = padding.into();
        }

        // Position - Taffy handles positioning automatically
        style.inset = layout.layout_position.into();
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
        Node::Container(n) => n.into(),
        Node::InitialContainer(n) => n.into(),
        Node::Rectangle(n) => n.into(),
        Node::Ellipse(n) => n.into(),
        Node::TextSpan(n) => n.into(),
        Node::Image(n) => n.into(),
        Node::Line(n) => n.into(),
        Node::Polygon(n) => n.into(),
        Node::RegularPolygon(n) => n.into(),
        Node::RegularStarPolygon(n) => n.into(),
        Node::Vector(n) => n.into(),
        Node::Path(n) => n.into(),
        Node::Error(n) => Style {
            size: Size {
                width: Dimension::length(n.size.width),
                height: Dimension::length(n.size.height),
            },
            ..grida_style_default()
        },
        Node::Group(_) => grida_style_default(),
        Node::BooleanOperation(_) => grida_style_default(),
    }
}

/// Helper to apply layout_child properties to a style
/// Also requires the node's transform to set inset for absolute positioning
fn apply_layout_child(
    mut style: Style,
    layout_child: &Option<crate::node::schema::LayoutChildStyle>,
    transform: AffineTransform,
) -> Style {
    if let Some(child_style) = layout_child {
        style.position = child_style.layout_positioning.into();
        style.flex_grow = child_style.layout_grow;

        // For absolute positioning, set inset from transform
        if child_style.layout_positioning == crate::cg::types::LayoutPositioning::Absolute {
            style.inset = Rect {
                left: LengthPercentageAuto::length(transform.x()),
                top: LengthPercentageAuto::length(transform.y()),
                right: LengthPercentageAuto::auto(),
                bottom: LengthPercentageAuto::auto(),
            };
        }
    }
    style
}

/// Convert ContainerNodeRec to Taffy Style
impl From<&crate::node::schema::ContainerNodeRec> for Style {
    fn from(container: &crate::node::schema::ContainerNodeRec) -> Self {
        let mut style: Style = container.layout().into();

        // Set display based on layout mode
        style.display = if container.layout().layout_mode == LayoutMode::Flex {
            Display::Flex
        } else {
            Display::Block
        };

        style
    }
}

/// Convert InitialContainerNodeRec to Taffy Style
impl From<&crate::node::schema::InitialContainerNodeRec> for Style {
    fn from(icb: &crate::node::schema::InitialContainerNodeRec) -> Self {
        Style {
            display: Display::Flex,
            flex_direction: icb.layout_direction.into(),
            flex_wrap: icb.layout_wrap.into(),
            justify_content: Some(icb.layout_main_axis_alignment.into()),
            align_items: Some(icb.layout_cross_axis_alignment.into()),
            align_content: Some(icb.layout_cross_axis_alignment.into()),
            gap: layout_gap_to_taffy(icb.layout_gap, icb.layout_direction),
            padding: icb.padding.into(),
            // Size will be set by the layout engine for root ICB nodes
            ..grida_style_default()
        }
    }
}

/// Convert RectangleNodeRec to Taffy Style
impl From<&crate::node::schema::RectangleNodeRec> for Style {
    fn from(node: &crate::node::schema::RectangleNodeRec) -> Self {
        let style = Style {
            size: Size {
                width: Dimension::length(node.size.width),
                height: Dimension::length(node.size.height),
            },
            ..grida_style_default()
        };
        apply_layout_child(style, &node.layout_child, node.transform)
    }
}

/// Convert EllipseNodeRec to Taffy Style
impl From<&crate::node::schema::EllipseNodeRec> for Style {
    fn from(node: &crate::node::schema::EllipseNodeRec) -> Self {
        let style = Style {
            size: Size {
                width: Dimension::length(node.size.width),
                height: Dimension::length(node.size.height),
            },
            ..grida_style_default()
        };
        apply_layout_child(style, &node.layout_child, node.transform)
    }
}

/// Convert ImageNodeRec to Taffy Style
impl From<&crate::node::schema::ImageNodeRec> for Style {
    fn from(node: &crate::node::schema::ImageNodeRec) -> Self {
        let style = Style {
            size: Size {
                width: Dimension::length(node.size.width),
                height: Dimension::length(node.size.height),
            },
            ..grida_style_default()
        };
        apply_layout_child(style, &node.layout_child, node.transform)
    }
}

/// Convert LineNodeRec to Taffy Style
impl From<&crate::node::schema::LineNodeRec> for Style {
    fn from(node: &crate::node::schema::LineNodeRec) -> Self {
        let style = Style {
            size: Size {
                width: Dimension::length(node.size.width),
                height: Dimension::length(node.size.height),
            },
            ..grida_style_default()
        };
        apply_layout_child(style, &node.layout_child, node.transform)
    }
}

/// Convert PolygonNodeRec to Taffy Style
impl From<&crate::node::schema::PolygonNodeRec> for Style {
    fn from(node: &crate::node::schema::PolygonNodeRec) -> Self {
        let bounds = node.rect();
        let style = Style {
            size: Size {
                width: Dimension::length(bounds.width),
                height: Dimension::length(bounds.height),
            },
            ..grida_style_default()
        };
        apply_layout_child(style, &node.layout_child, node.transform)
    }
}

/// Convert RegularPolygonNodeRec to Taffy Style
impl From<&crate::node::schema::RegularPolygonNodeRec> for Style {
    fn from(node: &crate::node::schema::RegularPolygonNodeRec) -> Self {
        let style = Style {
            size: Size {
                width: Dimension::length(node.size.width),
                height: Dimension::length(node.size.height),
            },
            ..grida_style_default()
        };
        apply_layout_child(style, &node.layout_child, node.transform)
    }
}

/// Convert RegularStarPolygonNodeRec to Taffy Style
impl From<&crate::node::schema::RegularStarPolygonNodeRec> for Style {
    fn from(node: &crate::node::schema::RegularStarPolygonNodeRec) -> Self {
        let style = Style {
            size: Size {
                width: Dimension::length(node.size.width),
                height: Dimension::length(node.size.height),
            },
            ..grida_style_default()
        };
        apply_layout_child(style, &node.layout_child, node.transform)
    }
}

/// Convert TextSpanNodeRec to Taffy Style
impl From<&crate::node::schema::TextSpanNodeRec> for Style {
    fn from(node: &crate::node::schema::TextSpanNodeRec) -> Self {
        let mut style = grida_style_default();

        // Set width if specified, otherwise auto
        if let Some(width) = node.width {
            style.size.width = Dimension::length(width);
        } else {
            style.size.width = Dimension::auto();
        }

        // Height is auto for text (will be determined by content)
        style.size.height = Dimension::auto();

        apply_layout_child(style, &node.layout_child, node.transform)
    }
}

/// Convert VectorNodeRec to Taffy Style
impl From<&crate::node::schema::VectorNodeRec> for Style {
    fn from(node: &crate::node::schema::VectorNodeRec) -> Self {
        let bounds = node.network.bounds();
        let mut style = Style {
            size: Size {
                width: Dimension::length(bounds.width),
                height: Dimension::length(bounds.height),
            },
            ..grida_style_default()
        };

        // Apply layout_child if present
        style = apply_layout_child(style, &node.layout_child, node.transform);

        // If no layout_child is set, apply transform position as absolute positioning
        if node.layout_child.is_none() {
            style.position = Position::Absolute;
            style.inset = Rect {
                left: LengthPercentageAuto::length(node.transform.x()),
                top: LengthPercentageAuto::length(node.transform.y()),
                right: LengthPercentageAuto::auto(),
                bottom: LengthPercentageAuto::auto(),
            };
        }

        style
    }
}

/// Convert PathNodeRec to Taffy Style
impl From<&crate::node::schema::PathNodeRec> for Style {
    fn from(node: &crate::node::schema::PathNodeRec) -> Self {
        let rect = node.rect();
        let mut style = Style {
            size: Size {
                width: Dimension::length(rect.width),
                height: Dimension::length(rect.height),
            },
            ..grida_style_default()
        };

        // Apply layout_child if present
        style = apply_layout_child(style, &node.layout_child, node.transform);

        // If no layout_child is set, apply transform position as absolute positioning
        // This ensures SVGPath nodes with transform coordinates are positioned correctly
        if node.layout_child.is_none() {
            style.position = Position::Absolute;
            style.inset = Rect {
                left: LengthPercentageAuto::length(node.transform.x()),
                top: LengthPercentageAuto::length(node.transform.y()),
                right: LengthPercentageAuto::auto(),
                bottom: LengthPercentageAuto::auto(),
            };
        }

        style
    }
}
