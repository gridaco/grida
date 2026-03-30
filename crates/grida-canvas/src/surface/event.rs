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

/// IME composition event.
#[derive(Debug, Clone)]
pub enum ImeEvent {
    /// Active composition string (displayed inline with underline).
    Preedit(String),
    /// Composition committed — insert the final text.
    Commit(String),
    /// Composition cancelled — discard preedit.
    Cancel,
}

/// Platform-agnostic input events for the canvas surface.
///
/// Coordinates are provided in both canvas space (world) and screen space
/// (viewport pixels). The host is responsible for the camera transform
/// before constructing these events.
#[derive(Debug, Clone)]
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

    /// A keyboard key was pressed.
    ///
    /// Uses [`KeyName`](crate::text_edit::session::KeyName) as the
    /// platform-agnostic key identifier.
    KeyDown {
        key: crate::text_edit::session::KeyName,
        modifiers: Modifiers,
    },

    /// Text input from the OS (after IME composition, dead-key resolution, etc.).
    ///
    /// This is the *committed* text that should be inserted. It may arrive
    /// alongside or instead of a `KeyDown` event, depending on the platform.
    TextInput {
        text: String,
    },

    /// IME composition event.
    Ime(ImeEvent),
}
