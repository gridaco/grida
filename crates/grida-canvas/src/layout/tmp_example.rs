/// Temporary demo/example utilities for testing flex layout integration.
/// This module contains helper structs and functions that bridge between
/// schema types and Taffy layout engine for demonstration purposes.
///
/// **This is NOT part of the production API and will be removed/refactored
/// once layout is fully integrated into the rendering pipeline.**
use super::{ComputedLayout, LayoutStyle};
use crate::node::schema::ContainerNodeRec;
use taffy::prelude::*;
use taffy::TaffyTree;

/// A container node enhanced with layout properties for demo/testing
///
/// This struct combines schema container properties with temporary layout
/// style properties to facilitate incremental testing of layout features.
#[derive(Debug, Clone)]
pub struct ContainerWithStyle {
    /// Base container properties from schema
    pub container: ContainerNodeRec,

    /// Layout-specific properties (demo/testing)
    pub layout: LayoutStyle,
}

impl ContainerWithStyle {
    /// Create from existing container with default layout
    pub fn from_container(container: ContainerNodeRec) -> Self {
        Self {
            container,
            layout: LayoutStyle::default(),
        }
    }

    /// Create with specific layout properties
    pub fn with_layout(mut self, layout: LayoutStyle) -> Self {
        self.layout = layout;
        self
    }

    /// Convert to Taffy style for layout computation
    pub fn to_taffy_style(&self) -> taffy::Style {
        self.layout.to_taffy_style(
            self.padding(),
            self.gap(),
            self.direction(),
            self.wrap(),
            self.justify_content(),
            self.align_items(),
        )
    }

    /// Get container size for layout computation
    pub fn available_size(&self) -> (f32, f32) {
        (self.container.size.width, self.container.size.height)
    }

    /// Get padding as Taffy Rect
    pub fn padding(&self) -> Rect<LengthPercentage> {
        self.container.padding.into()
    }

    /// Get gap as Taffy Size
    pub fn gap(&self) -> Size<LengthPercentage> {
        self.container.layout_gap.into()
    }

    /// Check if this container uses flex layout
    pub fn is_flex_layout(&self) -> bool {
        use crate::cg::types::LayoutMode;
        matches!(self.container.layout_mode, LayoutMode::Flex)
    }

    /// Get flex direction from container's axis
    pub fn direction(&self) -> FlexDirection {
        self.container.layout_direction.into()
    }

    /// Get flex wrap from container's layout_wrap
    pub fn wrap(&self) -> FlexWrap {
        self.container.layout_wrap.into()
    }

    /// Get justify content from container's main axis alignment
    pub fn justify_content(&self) -> Option<JustifyContent> {
        Some(self.container.layout_main_axis_alignment.into())
    }

    /// Get align items from container's cross axis alignment
    pub fn align_items(&self) -> Option<AlignItems> {
        Some(self.container.layout_cross_axis_alignment.into())
    }

    /// Get container ID
    pub fn id(&self) -> &str {
        &self.container.id
    }

    /// Get container name
    pub fn name(&self) -> Option<&String> {
        self.container.name.as_ref()
    }
}

/// Compute flex layout for a container with style and its children
///
/// **This is a temporary demo function.** In production, layout computation
/// will be integrated into the cache/geometry pipeline.
///
/// # Arguments
/// * `container` - The container with layout style
/// * `children` - Vector of child containers with layout styles
///
/// # Returns
/// A vector of computed layouts for each child, in the same order as the input
pub fn compute_flex_layout_for_container(
    container: &ContainerWithStyle,
    children: Vec<&ContainerWithStyle>,
) -> Vec<ComputedLayout> {
    let mut taffy: TaffyTree<()> = TaffyTree::new();

    // Create child nodes
    let child_nodes: Vec<NodeId> = children
        .iter()
        .map(|child| taffy.new_leaf(child.to_taffy_style()).unwrap())
        .collect();

    // Create container node
    let container_node = taffy
        .new_with_children(container.to_taffy_style(), &child_nodes)
        .unwrap();

    // Compute layout
    let (width, height) = container.available_size();
    let available_space = Size {
        width: AvailableSpace::Definite(width),
        height: AvailableSpace::Definite(height),
    };

    taffy
        .compute_layout(container_node, available_space)
        .unwrap();

    // Extract computed layouts
    child_nodes
        .iter()
        .map(|&node_id| {
            let layout = taffy.layout(node_id).unwrap();
            ComputedLayout {
                x: layout.location.x,
                y: layout.location.y,
                width: layout.size.width,
                height: layout.size.height,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_row_layout() {
        use crate::cg::types::*;
        use crate::node::schema::ContainerNodeRec;

        let container = ContainerWithStyle::from_container(ContainerNodeRec {
            id: "test-container".to_string(),
            name: Some("Test Container".to_string()),
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::PassThrough,
            mask: None,
            transform: math2::transform::AffineTransform::identity(),
            size: crate::node::schema::Size {
                width: 300.0,
                height: 100.0,
            },
            corner_radius: RectangularCornerRadius::default(),
            fills: Paints::new([]),
            strokes: Paints::new([]),
            stroke_width: 0.0,
            stroke_align: StrokeAlign::Center,
            stroke_dash_array: None,
            effects: crate::node::schema::LayerEffects::default(),
            clip: ContainerClipFlag::default(),
            layout_mode: crate::cg::types::LayoutMode::Flex,
            layout_direction: crate::cg::types::Axis::Horizontal,
            layout_wrap: crate::cg::types::LayoutWrap::NoWrap,
            layout_main_axis_alignment: crate::cg::types::MainAxisAlignment::Start,
            layout_cross_axis_alignment: crate::cg::types::CrossAxisAlignment::Start,
            padding: EdgeInsets::default(),
            layout_gap: LayoutGap::default(),
        })
        .with_layout(LayoutStyle {
            width: Dimension::length(300.0),
            height: Dimension::auto(),
            ..Default::default()
        });

        let children: Vec<ContainerWithStyle> = (0..3)
            .map(|i| {
                ContainerWithStyle::from_container(ContainerNodeRec {
                    id: format!("child-{}", i),
                    name: Some(format!("Child {}", i)),
                    active: true,
                    opacity: 1.0,
                    blend_mode: LayerBlendMode::PassThrough,
                    mask: None,
                    transform: math2::transform::AffineTransform::identity(),
                    size: crate::node::schema::Size {
                        width: 100.0,
                        height: 100.0,
                    },
                    corner_radius: RectangularCornerRadius::default(),
                    fills: Paints::new([]),
                    strokes: Paints::new([]),
                    stroke_width: 0.0,
                    stroke_align: StrokeAlign::Center,
                    stroke_dash_array: None,
                    effects: crate::node::schema::LayerEffects::default(),
                    clip: ContainerClipFlag::default(),
                    layout_mode: crate::cg::types::LayoutMode::Normal,
                    layout_direction: crate::cg::types::Axis::Horizontal,
                    layout_wrap: crate::cg::types::LayoutWrap::NoWrap,
                    layout_main_axis_alignment: crate::cg::types::MainAxisAlignment::Start,
                    layout_cross_axis_alignment: crate::cg::types::CrossAxisAlignment::Start,
                    padding: EdgeInsets::default(),
                    layout_gap: LayoutGap::default(),
                })
                .with_layout(LayoutStyle {
                    width: Dimension::length(100.0),
                    height: Dimension::length(100.0),
                    ..Default::default()
                })
            })
            .collect();

        let layouts = compute_flex_layout_for_container(&container, children.iter().collect());

        assert_eq!(layouts.len(), 3);
        assert_eq!(layouts[0].x, 0.0);
        assert_eq!(layouts[1].x, 100.0);
        assert_eq!(layouts[2].x, 200.0);
    }

    #[test]
    fn test_wrapping_layout() {
        use crate::cg::types::*;
        use crate::node::schema::ContainerNodeRec;

        let container = ContainerWithStyle::from_container(ContainerNodeRec {
            id: "test-container".to_string(),
            name: Some("Test Container".to_string()),
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::PassThrough,
            mask: None,
            transform: math2::transform::AffineTransform::identity(),
            size: crate::node::schema::Size {
                width: 250.0,
                height: 200.0,
            },
            corner_radius: RectangularCornerRadius::default(),
            fills: Paints::new([]),
            strokes: Paints::new([]),
            stroke_width: 0.0,
            stroke_align: StrokeAlign::Center,
            stroke_dash_array: None,
            effects: crate::node::schema::LayerEffects::default(),
            clip: ContainerClipFlag::default(),
            layout_mode: crate::cg::types::LayoutMode::Flex,
            layout_direction: crate::cg::types::Axis::Horizontal,
            layout_wrap: crate::cg::types::LayoutWrap::Wrap,
            layout_main_axis_alignment: crate::cg::types::MainAxisAlignment::Start,
            layout_cross_axis_alignment: crate::cg::types::CrossAxisAlignment::Start,
            padding: EdgeInsets::default(),
            layout_gap: LayoutGap {
                main_axis_gap: 10.0,
                cross_axis_gap: 10.0,
            },
        })
        .with_layout(LayoutStyle {
            width: Dimension::length(250.0),
            height: Dimension::auto(),
            ..Default::default()
        });

        let children: Vec<ContainerWithStyle> = (0..4)
            .map(|i| {
                ContainerWithStyle::from_container(ContainerNodeRec {
                    id: format!("child-{}", i),
                    name: Some(format!("Child {}", i)),
                    active: true,
                    opacity: 1.0,
                    blend_mode: LayerBlendMode::PassThrough,
                    mask: None,
                    transform: math2::transform::AffineTransform::identity(),
                    size: crate::node::schema::Size {
                        width: 100.0,
                        height: 100.0,
                    },
                    corner_radius: RectangularCornerRadius::default(),
                    fills: Paints::new([]),
                    strokes: Paints::new([]),
                    stroke_width: 0.0,
                    stroke_align: StrokeAlign::Center,
                    stroke_dash_array: None,
                    effects: crate::node::schema::LayerEffects::default(),
                    clip: ContainerClipFlag::default(),
                    layout_mode: crate::cg::types::LayoutMode::Normal,
                    layout_direction: crate::cg::types::Axis::Horizontal,
                    layout_wrap: crate::cg::types::LayoutWrap::NoWrap,
                    layout_main_axis_alignment: crate::cg::types::MainAxisAlignment::Start,
                    layout_cross_axis_alignment: crate::cg::types::CrossAxisAlignment::Start,
                    padding: EdgeInsets::default(),
                    layout_gap: LayoutGap::default(),
                })
                .with_layout(LayoutStyle {
                    width: Dimension::length(100.0),
                    height: Dimension::length(100.0),
                    ..Default::default()
                })
            })
            .collect();

        let layouts = compute_flex_layout_for_container(&container, children.iter().collect());

        assert_eq!(layouts.len(), 4);
        // First two should be on the same row
        assert_eq!(layouts[0].y, layouts[1].y);
        // Third and fourth should be on a new row
        assert_eq!(layouts[2].y, layouts[3].y);
        assert!(layouts[2].y > layouts[0].y);
    }
}
