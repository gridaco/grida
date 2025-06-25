use math2::vector2::Vector2;

/// Tracks pointer state for the application.
///
/// Currently only stores the cursor position in screen space.
#[derive(Debug, Clone, Copy)]
pub struct InputState {
    /// Cursor position in logical screen coordinates.
    pub cursor: Vector2,
}

impl Default for InputState {
    fn default() -> Self {
        Self { cursor: [0.0, 0.0] }
    }
}
