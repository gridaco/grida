/// Cursor icon for the surface.
///
/// Maps to platform cursor types (e.g. winit `CursorIcon`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CursorIcon {
    #[default]
    Default,
    Pointer,
    Grab,
    Grabbing,
    Crosshair,
    Move,
}
