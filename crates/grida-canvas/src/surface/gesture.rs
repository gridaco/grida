use math2::vector2::Vector2;

/// Active gesture on the surface.
///
/// For readonly mode, only `Idle` and `Pan` are used.
/// `MarqueeSelect` is included as a read-only operation (rubber-band selection).
#[derive(Debug, Clone, Copy)]
pub enum SurfaceGesture {
    /// No active gesture.
    Idle,
    /// Panning the canvas (middle-mouse drag or space+drag).
    Pan { anchor_screen: Vector2 },
    /// Rubber-band selection rectangle.
    MarqueeSelect {
        anchor_canvas: Vector2,
        current_canvas: Vector2,
    },
}

impl Default for SurfaceGesture {
    fn default() -> Self {
        Self::Idle
    }
}

impl SurfaceGesture {
    /// Whether a gesture is actively in progress (not idle).
    pub fn is_active(&self) -> bool {
        !matches!(self, Self::Idle)
    }
}
