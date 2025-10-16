use taffy::prelude::*;

mod into_taffy;
pub mod tmp_example;

/// Simplified layout style wrapper for Taffy
///
/// This represents child-specific layout properties that can be applied
/// to any node participating in flex layout.
#[derive(Debug, Clone)]
pub struct LayoutStyle {
    pub width: Dimension,
    pub height: Dimension,
    pub flex_grow: f32,
}

impl Default for LayoutStyle {
    fn default() -> Self {
        Self {
            width: Dimension::auto(),
            height: Dimension::auto(),
            flex_grow: 0.0,
        }
    }
}

impl LayoutStyle {
    /// Convert to Taffy Style with all container properties
    ///
    /// This method takes container-level properties as parameters since
    /// they come from the parent container's schema properties.
    pub fn to_taffy_style(
        &self,
        padding: Rect<LengthPercentage>,
        gap: Size<LengthPercentage>,
        flex_direction: FlexDirection,
        flex_wrap: FlexWrap,
        justify_content: Option<JustifyContent>,
        align_items: Option<AlignItems>,
    ) -> Style {
        Style {
            display: Display::Flex,
            flex_direction,
            flex_wrap,
            gap,
            size: Size {
                width: self.width,
                height: self.height,
            },
            padding,
            justify_content,
            align_items,
            flex_grow: self.flex_grow,
            flex_shrink: 1.0,
            flex_basis: Dimension::auto(),
            ..Default::default()
        }
    }
}

/// Computed layout result containing position and size
///
/// This is the output from Taffy's layout computation, representing
/// the final position and dimensions of a laid-out element.
#[derive(Debug, Clone, Copy)]
pub struct ComputedLayout {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}
