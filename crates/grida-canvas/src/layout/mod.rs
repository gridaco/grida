pub mod cache;
pub mod engine;
mod into_taffy;
pub mod tree;

/// Computed layout result containing position and size
///
/// This is the output from Taffy's layout computation, representing
/// the final position and dimensions of a laid-out element.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ComputedLayout {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl From<&taffy::Layout> for ComputedLayout {
    fn from(layout: &taffy::Layout) -> Self {
        Self {
            x: layout.location.x,
            y: layout.location.y,
            width: layout.size.width,
            height: layout.size.height,
        }
    }
}
