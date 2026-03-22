use math2::vector2::Vector2;

/// Modifier keys held during an input event.
#[derive(Debug, Clone, Copy, Default)]
pub struct Modifiers {
    pub shift: bool,
    pub alt: bool,
    pub ctrl_or_cmd: bool,
}

/// Which pointer button was pressed or released.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PointerButton {
    Primary,
    Secondary,
    Middle,
}

/// Platform-agnostic input events for the canvas surface.
///
/// Coordinates are provided in both canvas space (world) and screen space
/// (viewport pixels). The host is responsible for the camera transform
/// before constructing these events.
#[derive(Debug, Clone, Copy)]
pub enum SurfaceEvent {
    PointerMove {
        canvas_point: Vector2,
        screen_point: Vector2,
    },
    PointerDown {
        canvas_point: Vector2,
        screen_point: Vector2,
        button: PointerButton,
        modifiers: Modifiers,
    },
    PointerUp {
        canvas_point: Vector2,
        screen_point: Vector2,
        button: PointerButton,
        modifiers: Modifiers,
    },
    ModifiersChanged(Modifiers),
}
