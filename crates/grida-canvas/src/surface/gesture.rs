use crate::surface::cursor::{ResizeDirection, RotationCorner};
use math2::vector2::Vector2;

/// Active gesture on the surface.
///
/// For readonly mode, only `Idle` and `Pan` are used.
/// `MarqueeSelect` is included as a read-only operation (rubber-band selection).
///
/// Editing gestures (Translate, Resize, Rotate) use an **incremental**
/// model: each pointer-move carries a delta from the previous position.
/// The application layer applies that delta immediately so the user sees
/// real-time feedback. When the gesture ends (pointer-up), there is no
/// final commit — the last incremental move already brought the scene to
/// the correct state.
#[derive(Debug, Clone, Copy, Default)]
pub enum SurfaceGesture {
    /// No active gesture.
    #[default]
    Idle,
    /// Panning the canvas (middle-mouse drag or space+drag).
    Pan { anchor_screen: Vector2 },
    /// Rubber-band selection rectangle.
    MarqueeSelect {
        anchor_canvas: Vector2,
        current_canvas: Vector2,
    },
    /// Dragging the current selection to translate it.
    Translate {
        /// Canvas-space position from the previous pointer event.
        /// Updated on every move so the next delta is incremental.
        prev_canvas: Vector2,
    },
    /// Dragging a resize handle.
    Resize {
        /// Which resize handle is being dragged.
        direction: ResizeDirection,
        /// Screen-space position from the previous pointer event.
        prev_screen: Vector2,
    },
    /// Dragging a rotation handle.
    Rotate {
        /// Which corner's rotation handle is being dragged.
        corner: RotationCorner,
        /// Screen-space position from the previous pointer event.
        prev_screen: Vector2,
    },
}

impl SurfaceGesture {
    /// Whether a gesture is actively in progress (not idle).
    pub fn is_active(&self) -> bool {
        !matches!(self, Self::Idle)
    }
}
