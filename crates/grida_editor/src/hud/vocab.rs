//! The HUD's public vocabulary — events in, intents out, and the two
//! scene queries (`crates/grida_editor/docs/hud.md`).
//!
//! Everything here is deliberately engine- and document-free (`HUD-1`):
//! ids are opaque strings, geometry is `math2`, and the scene is only
//! reachable through [`HudScene`]'s two questions.

use math2::rect::Rectangle;
use math2::transform::AffineTransform;

/// Stable node id — the HUD's own alias; structurally the editor's
/// stable id, but the HUD depends on no editor type (`HUD-1`).
pub type Id = String;

/// Modifier snapshot. Named per the golden input spec's roles:
/// `shift` extends/constrains, `alt` mirrors/centers, `meta` is the
/// region-select override.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Modifiers {
    pub shift: bool,
    pub alt: bool,
    pub meta: bool,
    pub ctrl: bool,
}

/// Pointer button. The HUD routes `Primary` only; `Secondary` and
/// `Middle` classify as `Noop` (the host owns context menus and pan).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PointerButton {
    Primary,
    Secondary,
    Middle,
}

/// A synthesized input event. All points are **logical screen px**;
/// the HUD converts through the pushed camera transform internally.
#[derive(Debug, Clone)]
pub enum HudEvent {
    PointerMove {
        screen: [f32; 2],
    },
    PointerDown {
        screen: [f32; 2],
        button: PointerButton,
        modifiers: Modifiers,
    },
    PointerUp {
        screen: [f32; 2],
        button: PointerButton,
        modifiers: Modifiers,
    },
    /// Live modifier change — re-derives the active gesture's preview
    /// (`SURF-4`).
    ModifiersChanged {
        modifiers: Modifiers,
    },
    /// Esc / focus loss: clears any pending press, cancels any active
    /// gesture (emitting [`Intent::Cancel`]).
    Cancel,
}

/// Resize handle direction (8 regions).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResizeDirection {
    N,
    NE,
    E,
    SE,
    S,
    SW,
    W,
    NW,
}

/// Rotation halo corner (4 regions).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RotationCorner {
    NW,
    NE,
    SE,
    SW,
}

/// A node's selection shape, in canvas (doc) space.
#[derive(Debug, Clone, PartialEq)]
pub enum SelectionShape {
    /// Axis-aligned bounds.
    Rect(Rectangle),
    /// A transformed node: `local` is the node's local-frame bounds
    /// (origin at zero), `matrix` maps local → canvas.
    Transformed {
        local: Rectangle,
        matrix: AffineTransform,
    },
}

impl SelectionShape {
    /// Canvas-space AABB of the shape.
    pub fn aabb(&self) -> Rectangle {
        match self {
            SelectionShape::Rect(r) => *r,
            SelectionShape::Transformed { local, matrix } => {
                let pts: Vec<[f32; 2]> = local
                    .corners()
                    .iter()
                    .map(|c| math2::vector2::transform(*c, matrix))
                    .collect();
                Rectangle::from_points(&pts)
            }
        }
    }
}

/// The two questions the HUD may ask the scene — its entire read
/// surface (`HUD-1`).
pub trait HudScene {
    /// Topmost content node at a canvas-space point.
    fn pick(&self, canvas_point: [f32; 2]) -> Option<Id>;
    /// A node's selection shape.
    fn shape_of(&self, id: &Id) -> Option<SelectionShape>;
}

/// Intent phase for mutating gestures: previews stream during the
/// drag, exactly one commit (or one [`Intent::Cancel`]) ends it
/// (`HUD-2`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Preview,
    Commit,
}

/// Selection mode carried by [`Intent::Select`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SelectMode {
    Replace,
    Toggle,
}

/// The HUD's only content-bearing output (`HUD-1`): what the user
/// meant, never what it does to the document. The host commits and
/// interprets ([`crate::interpret`]).
#[derive(Debug, Clone, PartialEq)]
pub enum Intent {
    /// Instantaneous selection fact (unphased).
    Select { ids: Vec<Id>, mode: SelectMode },
    /// Instantaneous deselect-everything fact (unphased).
    DeselectAll,
    /// Marquee selection: carries the **rect, not ids** — which nodes
    /// a rect selects is scene knowledge the host resolves per
    /// preview.
    Marquee {
        rect: Rectangle,
        additive: bool,
        phase: Phase,
    },
    /// Translate the ids by a cumulative canvas-space delta from the
    /// gesture anchor (deltas, not absolutes: the host holds
    /// baselines). `axis_lock` names the axis movement is constrained
    /// to (`shift`); the other component is already zeroed — carried
    /// so interpretation stages that must not touch the frozen axis
    /// (geometry snap, `docs/wg/canvas/snap.md`) can tell a locked
    /// zero from a genuine one. `pointer` is the raw pointer position
    /// in canvas space — the drop-target probe for hierarchy change
    /// (`docs/wg/canvas/translate.md`); `clone` names the clone
    /// modifier's live state (`alt`), the way `axis_lock` names
    /// `shift`'s role — what either *does* to the document is the
    /// host's interpretation (`HUD-7`).
    Translate {
        ids: Vec<Id>,
        dx: f32,
        dy: f32,
        axis_lock: Option<math2::vector2::Axis>,
        pointer: [f32; 2],
        clone: bool,
        phase: Phase,
    },
    /// Resize: the new union shape, with the dragged anchor named.
    Resize {
        ids: Vec<Id>,
        anchor: ResizeDirection,
        shape: SelectionShape,
        phase: Phase,
    },
    /// Rotate by an angle (radians) measured from the gesture start
    /// around the selection shape's center. What θ *means* to the
    /// document — recompose an affine, compensate a pivot, refuse the
    /// kind — is the host's interpretation (`HUD-7`).
    Rotate {
        ids: Vec<Id>,
        angle: f32,
        phase: Phase,
    },
    /// Double-click on content: the host decides what "edit" means
    /// for the node kind.
    EnterContentEdit { id: Id },
    /// A guide edit (`docs/wg/canvas/ruler.md`, `RUL-9` — the ruler's
    /// one-row extension of this table). `index: None` = a create
    /// drag out of a strip; `Some` = an existing guide. `offset` is
    /// the pointer's canvas coordinate on the guide's axis — raw: the
    /// snap correction and the lattice quantize are interpretation
    /// (`RUL-6`), not the HUD's. `on_strip` reports whether the
    /// pointer sits on the authoring strip — meaningful at commit,
    /// where it means delete-by-return (`RUL-7`); what that does to
    /// the document is the host's call.
    Guide {
        axis: math2::vector2::Axis,
        index: Option<usize>,
        offset: f32,
        on_strip: bool,
        phase: Phase,
    },
    /// Ends any phased stream with nothing recorded.
    Cancel,
}

/// The cursor value the HUD owns; the host maps it to a platform
/// cursor. Reflects what pointer-down would do (`HUD-8`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HudCursor {
    Default,
    /// Pointer-down would select fresh content.
    Pointer,
    /// Pointer-down would claim the selection for translate.
    Move,
    Resize(ResizeDirection),
    Rotate(RotationCorner),
    /// Pointer-down would author or move a guide on this axis
    /// (`ruler.md`): an axis-`x` guide moves along x (ew), an
    /// axis-`y` guide along y (ns).
    Guide(math2::vector2::Axis),
}

/// What one dispatch did, plus the intents it emitted (pull, not
/// push — the host drains them at the same event tail as damage).
#[derive(Debug, Default)]
pub struct HudResponse {
    pub intents: Vec<Intent>,
    pub needs_redraw: bool,
    pub cursor_changed: bool,
    pub hover_changed: bool,
}
