use crate::node::schema::NodeId;
use crate::surface::cursor::{ResizeDirection, RotationCorner};
use skia_safe::{Contains, Rect};

/// Action to perform when an overlay hit region is activated.
#[derive(Debug, Clone)]
pub enum OverlayAction {
    /// Select the given node (replaces current selection, or toggles with shift).
    SelectNode(NodeId),
    /// Pointer is over a resize handle. Shows the appropriate directional
    /// cursor. In editing mode (`readonly = false`), pointer-down starts
    /// a `SurfaceGesture::Resize`.
    ResizeHandle(ResizeDirection),
    /// Pointer is over a rotation handle. In editing mode, pointer-down
    /// starts a `SurfaceGesture::Rotate`.
    RotateHandle(RotationCorner),
}

/// A screen-space axis-aligned hit region for overlay UI elements.
#[derive(Debug, Clone)]
pub struct HitRegion {
    /// Screen-space bounding box (pixels).
    pub screen_rect: Rect,
    /// Action to perform when this region receives a pointer-down.
    pub action: OverlayAction,
}

/// Collection of overlay hit regions, rebuilt each frame during the draw pass.
///
/// Regions are checked before the scene graph hit tester, so overlay UI
/// elements (title bars, buttons) take priority over canvas nodes.
#[derive(Debug, Clone, Default)]
pub struct HitRegions {
    regions: Vec<HitRegion>,
}

impl HitRegions {
    pub fn new() -> Self {
        Self::default()
    }

    /// Clear all regions. Called at the start of each frame's draw pass.
    pub fn clear(&mut self) {
        self.regions.clear();
    }

    /// Register a new hit region. Regions pushed later are visually on top.
    pub fn push(&mut self, region: HitRegion) {
        self.regions.push(region);
    }

    /// Test a screen-space point against all regions (front-to-back).
    ///
    /// Returns the action of the first (topmost) hit, if any.
    /// Iterates in reverse so that the last-pushed region wins.
    pub fn hit_test(&self, screen_point: [f32; 2]) -> Option<&OverlayAction> {
        let pt = skia_safe::Point::new(screen_point[0], screen_point[1]);
        for region in self.regions.iter().rev() {
            if region.screen_rect.contains(pt) {
                return Some(&region.action);
            }
        }
        None
    }

    /// Returns true if any interactive region exists.
    pub fn is_empty(&self) -> bool {
        self.regions.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hit_test_returns_topmost() {
        let mut regions = HitRegions::new();
        regions.push(HitRegion {
            screen_rect: Rect::from_xywh(0.0, 0.0, 100.0, 100.0),
            action: OverlayAction::SelectNode(1),
        });
        regions.push(HitRegion {
            screen_rect: Rect::from_xywh(50.0, 50.0, 100.0, 100.0),
            action: OverlayAction::SelectNode(2),
        });

        // Point in overlap: should hit node 2 (last pushed)
        let action = regions.hit_test([75.0, 75.0]).unwrap();
        assert!(matches!(action, OverlayAction::SelectNode(2)));

        // Point only in bottom region
        let action = regions.hit_test([25.0, 25.0]).unwrap();
        assert!(matches!(action, OverlayAction::SelectNode(1)));

        // Point outside all
        assert!(regions.hit_test([200.0, 200.0]).is_none());
    }

    #[test]
    fn clear_removes_all() {
        let mut regions = HitRegions::new();
        regions.push(HitRegion {
            screen_rect: Rect::from_xywh(0.0, 0.0, 10.0, 10.0),
            action: OverlayAction::SelectNode(1),
        });
        assert!(!regions.is_empty());
        regions.clear();
        assert!(regions.is_empty());
        assert!(regions.hit_test([5.0, 5.0]).is_none());
    }
}
