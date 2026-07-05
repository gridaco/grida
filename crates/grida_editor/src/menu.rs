//! The context menu as data — `crates/grida_editor/docs/context-menu.md`
//! (`CTX-*` contracts): the pointer's command surface over the
//! command registry ([`crate::command`]).
//!
//! ## Shape
//!
//! The module is pure and headless: given the working copy and the
//! selection, [`canvas_menu`] returns the menu as a value — items
//! that *reference* registry commands with their enablement already
//! resolved. The shape follows the convergent design of the desktop
//! platforms and the web:
//!
//! - **Items reference commands, never carry behavior** (the
//!   action-centric menus of the Qt lineage; AppKit's target/action).
//!   `CTX-1`: enumerating a menu against the registry finds no
//!   menu-only behavior — the type makes it structural, the suite
//!   makes it cited.
//! - **Enablement is a capability query answered at open time**
//!   (AppKit's menu-item validation): each predicate asks the same
//!   gates its command's handler asks — where a pure resolver exists
//!   ([`crate::arrange::reorder`], [`crate::mode::flattenable`]) the
//!   menu *dry-runs it* — so an enabled item's command succeeds and a
//!   disabled item's would refuse (`CTX-2`). Nothing here is cached;
//!   a menu value is dead the moment the document moves.
//! - **The open menu's entire output is one chosen command** (the
//!   Win32 tracked-popup shape: the surface answers "which command?",
//!   the host dispatches). The presenter ([`crate::ui::menu`]) emits
//!   the choice; the shell's one registry switch runs it.
//! - **The item-kind taxonomy is deliberately small** — action,
//!   submenu, separator — a subset of the web's menu vocabulary
//!   (content/item/separator/sub trees). Checkable and radio kinds
//!   are refused: the spec's paired toggles (Show ⇄ Hide) present the
//!   applicable *direction by label*, so check state has no owner
//!   here.
//!
//! ## Anti-goals
//!
//! - **Not a widget host.** The taxonomy is closed; there are no
//!   custom item kinds and no embedded widgets.
//! - **Not a state owner.** Enablement is computed per open; the
//!   menu never caches capability.
//! - **Not a second dispatcher.** Output is a [`Command`]; dispatch
//!   stays in the host's single registry switch (`SHELL-3`).
//! - **Not a keybinding authority.** Displayed shortcut hints are
//!   derived from the binding sheet ([`crate::keys::hint_for`]),
//!   never authored on items.
//!
//! ## Unshipped rows
//!
//! Spec inventory rows whose commands await their features are not
//! listed (a permanently-disabled row for a nonexistent command would
//! be a lie — the same doctrine as the unshipped keybinding rows):
//! Copy as SVG, mask ⇄ unmask, Edit vector → Planarize, the group
//! cluster (group / ungroup / group-with-container / auto-layout),
//! Lock ⇄ Unlock (no `locked` prop exists in the document model).
//! The layer-row, scene-row, and ruler menus are pending their hosts;
//! this module ships the canvas menu.

use crate::command::Command;
use crate::document::{Id, WorkingCopy};

/// A menu: ordered items, ready to present.
#[derive(Debug, Clone)]
pub struct Menu {
    pub items: Vec<Item>,
}

/// The closed item taxonomy.
#[derive(Debug, Clone)]
pub enum Item {
    /// A command reference: label, registry command, open-time
    /// enablement.
    Action(Action),
    /// A nested item list under one label.
    Submenu(Submenu),
    /// A group boundary.
    Separator,
}

/// An actionable row (`CTX-1`: the command *is* the behavior).
#[derive(Debug, Clone)]
pub struct Action {
    pub command: Command,
    pub label: &'static str,
    /// `CTX-2`: mirrors the command's own gates at open time.
    pub enabled: bool,
}

/// A nested list. Its enablement is derived, never stored: a submenu
/// is exactly as enabled as its contents.
#[derive(Debug, Clone)]
pub struct Submenu {
    pub label: &'static str,
    pub items: Vec<Item>,
}

impl Submenu {
    /// Enabled ⟺ any contained action is enabled (derived — a
    /// submenu has no capability of its own).
    pub fn enabled(&self) -> bool {
        self.items.iter().any(|item| match item {
            Item::Action(a) => a.enabled,
            Item::Submenu(s) => s.enabled(),
            Item::Separator => false,
        })
    }
}

impl Menu {
    /// Every action in the menu, submenus included, in enumeration
    /// order (the `CTX-1` walk).
    pub fn actions(&self) -> Vec<&Action> {
        fn walk<'a>(items: &'a [Item], out: &mut Vec<&'a Action>) {
            for item in items {
                match item {
                    Item::Action(a) => out.push(a),
                    Item::Submenu(s) => walk(&s.items, out),
                    Item::Separator => {}
                }
            }
        }
        let mut out = Vec::new();
        walk(&self.items, &mut out);
        out
    }
}

fn action(command: Command, label: &'static str, enabled: bool) -> Item {
    Item::Action(Action {
        command,
        label,
        enabled,
    })
}

/// The canvas menu (the spec's inventory, restricted to shipped
/// commands — see the module docs' unshipped list) over the current
/// target. Enablement is resolved here, once, at open time (`CTX-2`).
pub fn canvas_menu(doc: &WorkingCopy, selection: &[Id]) -> Menu {
    let some = !selection.is_empty();
    let single = selection.len() == 1;
    // Paired toggle (spec doctrine): present the applicable
    // direction — any visible member means the action hides.
    let any_visible = selection
        .iter()
        .any(|id| doc.node_active(id).unwrap_or(false));
    let toggle_label = if some && !any_visible { "Show" } else { "Hide" };
    let named = single && doc.node_name(&selection[0]).is_some();
    let flatten = crate::mode::can_flatten(doc, selection);
    let create_outlines = crate::mode::can_create_outlines(doc, selection);
    // Exact capability via the same pure resolver the command runs
    // (`CTX-2` refines the spec table's coarse "selection non-empty":
    // an already-frontmost selection disables Bring to front).
    let front =
        some && crate::arrange::reorder(doc, selection, crate::arrange::ZOrder::Front).is_some();
    let back =
        some && crate::arrange::reorder(doc, selection, crate::arrange::ZOrder::Back).is_some();

    Menu {
        items: vec![
            action(Command::Copy, "Copy", some),
            action(Command::Paste, "Paste", true),
            Item::Submenu(Submenu {
                label: "Copy as",
                items: vec![action(Command::CopyAsPng, "PNG", some)],
            }),
            Item::Separator,
            action(Command::CopyName, "Copy name", named),
            action(Command::CopyId, "Copy ID", single),
            Item::Separator,
            action(Command::BringToFront, "Bring to front", front),
            action(Command::SendToBack, "Send to back", back),
            Item::Separator,
            action(Command::Flatten, "Flatten", flatten),
            action(Command::CreateOutlines, "Create Outlines", create_outlines),
            Item::Separator,
            action(Command::ZoomSelection, "Zoom to fit", some),
            Item::Separator,
            action(Command::ToggleVisible, toggle_label, some),
            Item::Separator,
            action(Command::DeleteSelection, "Delete", some),
        ],
    }
}

/// `CTX-4` — opening retargets: a secondary press over an unselected
/// node makes it the selection first (the ordinary pointer-down
/// selection rule); over a selected node — or over empty space — the
/// selection is untouched. Returns the new selection, or `None` for
/// "unchanged".
pub fn retarget(selection: &[Id], hit: Option<&Id>) -> Option<Vec<Id>> {
    let hit = hit?;
    if selection.iter().any(|s| s == hit) {
        None
    } else {
        Some(vec![hit.clone()])
    }
}
