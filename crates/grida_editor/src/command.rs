//! The command registry — the editor's one command vocabulary
//! (routing.md's registry primitive, `SHELL-3`'s headless command
//! set).
//!
//! Commands are *referenced* by every command surface and dispatched
//! by exactly one host switch: the binding table ([`crate::keys`],
//! `KEY-1` table–registry equality) and the context menu
//! ([`crate::menu`], `MENU-1` command-surface equality) both bind rows
//! to members of this enum; neither carries behavior of its own. This
//! is the action-centric shape the desktop platforms converged on —
//! an item names a command, the command decides for itself whether it
//! applies (consumed or declined, `ROUTE-2`), and adding a surface
//! never adds a dispatcher.
//!
//! The enum is closed on purpose: an unbound row is unrepresentable,
//! and a new command is a registry change reviewed here, not a
//! surface-local handler.

use crate::tool::Tool;

/// The command registry's vocabulary (`KEY-1`/`MENU-1`, routing.md):
/// every binding-table row and menu item dispatches one of these by
/// name. Handlers live host-side (the shell's `command` switch) and
/// decide for themselves whether they apply — consumed or declined, a
/// declined handler has no effect (`ROUTE-2`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Command {
    Undo,
    Redo,
    Cut,
    Copy,
    /// Mod+Shift+C — the outward raster flavor (io-external.md "copy
    /// toward the outside", `IOX-7`): render the selection, offer it
    /// to the system clipboard as an image.
    CopyAsPng,
    Paste,
    Duplicate,
    Save,
    /// Copy the single selected node's name to the system clipboard —
    /// a menu-only surface entry (menu.md reference
    /// additions); declines unless exactly one named node is selected.
    CopyName,
    /// Copy the single selected node's stable id to the system
    /// clipboard (menu.md reference additions).
    CopyId,
    /// Vector edit's sub-selection delete — the first member of
    /// Delete's alternative chain (routing.md): declines outside the
    /// mode or on an empty sub-selection.
    DeleteSubSelection,
    DeleteSelection,
    SelectAll,
    /// The escape ladder — a single command owning its rungs
    /// (routing.md ladder idiom; one rung per press, `ROUTE-5`).
    EscapeLadder,
    EnterContentEdit,
    SelectChildren,
    SelectParent,
    NextSibling,
    PrevSibling,
    /// Translate nudge (nudge.md); declines on an empty selection so
    /// the chain falls through to the camera pan (`NUDGE-5`).
    NudgeSelection {
        dx: f32,
        dy: f32,
    },
    /// Screen-space camera pan — the empty-selection arrow fallback.
    PanCamera {
        dx: f32,
        dy: f32,
    },
    /// Resize nudge (`NUDGE-3`): origin-anchored, all-or-nothing.
    ResizeNudge {
        dw: f32,
        dh: f32,
    },
    SetTool(Tool),
    /// The pen entry (vector-edit.md): arm on the selected vector /
    /// flattenable primitive, or pen-from-scratch on empty selection.
    PenTool,
    /// Sticky hand (H) — a virtual tool overlay, not a `Tool` member.
    HandTool,
    /// Momentary hand (Space, hold) — `KEY-5`.
    HandHold,
    /// Momentary zoom (Z, hold) — `KEY-5`.
    ZoomHold,
    BringToFront,
    SendToBack,
    BringForward,
    SendBackward,
    Flatten,
    /// Create Outlines — convert selected text to its glyph-outline
    /// vector paths, per node in place (`OUTL-*`,
    /// [create-outlines.md](../../../docs/wg/feat-vector-network/create-outlines.md)).
    /// Distinct from Flatten (union) and outline *mode* (the wireframe
    /// view). Declines unless a text node is selected.
    CreateOutlines,
    /// Align the selection to one edge or per-axis center — align.md's
    /// reference-frame rule (`ALIGN-1`). Declines on an all-in-flow or
    /// top-level-single selection.
    Align(crate::align::Align),
    /// Distribute the selection's equal edge-to-edge gaps along an axis
    /// (`ALIGN-5`). Declines with fewer than three movable members.
    Distribute(crate::align::Distribute),
    /// Wrap each selection partition in a plain group node — grouping.md's
    /// per-partition rule (`GRP-1`). Declines on an empty selection.
    Group,
    /// Dissolve each selected group / boolean node, promoting its children
    /// to the wrapper's slot with world position held (`GRP-4`). Declines
    /// unless the selection holds a dissolvable node.
    Ungroup,
    /// Wrap each partition in a Container/Frame instead of a group
    /// (`GRP-1`, [`crate::grouping::WrapKind::Container`]).
    GroupWithContainer,
    ToggleVisible,
    /// Opacity digit (`KEY-6`): 1–9 → tenths, 0 → 100%, double-tap 0
    /// → 0% (the multi-tap window is [`crate::keys::OpacityTaps`]'
    /// state, a stateful command — never a binding-table feature).
    Opacity(u8),
    ZoomIn,
    ZoomOut,
    Zoom100,
    ZoomFit,
    ZoomSelection,
    ToggleRuler,
    /// Mod+\ — hide/show the whole shell chrome (panels, toolbar,
    /// context menu) so the canvas stands alone, then restore it. Per-
    /// instance view state, like the ruler and pixel-grid toggles.
    ToggleUi,
    TogglePixelGrid,
    ToggleSnapPixelGrid,
    ToggleSnapGeometry,
    PrevScene,
    NextScene,
    /// A reserved row (sheet "Reserved"): consumed, does nothing —
    /// the chord is owned so future meaning does not collide.
    Reserved(&'static str),
}

impl Command {
    /// The registry name (`KEY-1`/`MENU-1` surface–registry equality is
    /// checked against these).
    pub fn name(&self) -> &'static str {
        match self {
            Command::Undo => "undo",
            Command::Redo => "redo",
            Command::Cut => "cut",
            Command::Copy => "copy",
            Command::CopyAsPng => "copy-as-png",
            Command::Paste => "paste",
            Command::Duplicate => "duplicate",
            Command::Save => "save",
            Command::CopyName => "copy-name",
            Command::CopyId => "copy-id",
            Command::DeleteSubSelection => "delete-sub-selection",
            Command::DeleteSelection => "delete-selection",
            Command::SelectAll => "select-all",
            Command::EscapeLadder => "escape-ladder",
            Command::EnterContentEdit => "enter-content-edit",
            Command::SelectChildren => "select-children",
            Command::SelectParent => "select-parent",
            Command::NextSibling => "next-sibling",
            Command::PrevSibling => "prev-sibling",
            Command::NudgeSelection { .. } => "nudge-selection",
            Command::PanCamera { .. } => "pan-camera",
            Command::ResizeNudge { .. } => "resize-nudge",
            Command::SetTool(_) => "set-tool",
            Command::PenTool => "pen-tool",
            Command::HandTool => "hand-tool",
            Command::HandHold => "hand-hold",
            Command::ZoomHold => "zoom-hold",
            Command::BringToFront => "bring-to-front",
            Command::SendToBack => "send-to-back",
            Command::BringForward => "bring-forward",
            Command::SendBackward => "send-backward",
            Command::Flatten => "flatten",
            Command::CreateOutlines => "create-outlines",
            Command::Align(_) => "align",
            Command::Distribute(_) => "distribute",
            Command::Group => "group",
            Command::Ungroup => "ungroup",
            Command::GroupWithContainer => "group-with-container",
            Command::ToggleVisible => "toggle-visible",
            Command::Opacity(_) => "opacity",
            Command::ZoomIn => "zoom-in",
            Command::ZoomOut => "zoom-out",
            Command::Zoom100 => "zoom-100",
            Command::ZoomFit => "zoom-fit",
            Command::ZoomSelection => "zoom-selection",
            Command::ToggleRuler => "toggle-ruler",
            Command::ToggleUi => "toggle-ui",
            Command::TogglePixelGrid => "toggle-pixel-grid",
            Command::ToggleSnapPixelGrid => "toggle-snap-pixel-grid",
            Command::ToggleSnapGeometry => "toggle-snap-geometry",
            Command::PrevScene => "prev-scene",
            Command::NextScene => "next-scene",
            Command::Reserved(name) => name,
        }
    }
}
