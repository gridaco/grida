//! Menus as data — `crates/grida_editor/docs/menu.md` (`MENU-*`
//! contracts): the command surfaces over the command registry
//! ([`crate::command`]). Two builders: [`canvas_menu`] (the pointer's
//! context menu) and [`application_menu`] (the persistent top-level
//! bar). Both return a [`Menu`] value — items that *reference* registry
//! commands with enablement already resolved — presented natively (the
//! application bar) or by [`crate::ui::menu`] (the context popover).
//!
//! ## Shape
//!
//! The module is pure and headless: given the working copy and the
//! selection, the builders return the menu as a value. The shape
//! follows the convergent design of the desktop platforms and the web:
//!
//! - **Items reference commands, never carry behavior** (the
//!   action-centric menus of the Qt lineage; AppKit's target/action).
//!   `MENU-1`: enumerating a menu against the registry finds no
//!   menu-only behavior — the type makes it structural, the suite
//!   makes it cited.
//! - **Enablement is a capability query answered at open time**
//!   (AppKit's menu-item validation): each predicate asks the same
//!   gates its command's handler asks — where a pure resolver exists
//!   ([`crate::arrange::reorder`], [`crate::mode::flattenable`]) the
//!   menu *dry-runs it* — so an enabled item's command succeeds and a
//!   disabled item's would refuse (`MENU-2`). Nothing here is cached;
//!   a menu value is dead the moment the document moves.
//! - **The open menu's entire output is one chosen command** (the
//!   Win32 tracked-popup shape: the surface answers "which command?",
//!   the host dispatches). The presenter ([`crate::ui::menu`]) emits
//!   the choice; the shell's one registry switch runs it.
//! - **The item-kind taxonomy is deliberately small** — action,
//!   submenu, separator, and deferred — a subset of the web's menu
//!   vocabulary (content/item/separator/sub trees). Checkable and radio
//!   kinds are refused: the spec's paired toggles (Show ⇄ Hide) present
//!   the applicable *direction by label*, so check state has no owner
//!   here.
//! - **A deferred item is an inert placeholder** (`MENU-7`): a labelled
//!   row that references no command, is always disabled, and dispatches
//!   nothing. It exists only on the application menu — where the menu
//!   doubles as a coverage map — and names the system a not-yet-built
//!   row waits on. It is the one row whose disabled state means "not
//!   built yet"; on the context surfaces (which carry no deferred rows)
//!   disabled always means "not applicable here" (`MENU-2`).
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
//! The two surfaces treat a not-yet-built row oppositely (`menu.md`):
//!
//! - On the **context menu**, an inventory row whose command does not
//!   exist is *omitted* — a permanently-disabled row for a nonexistent
//!   command would be a lie (the same doctrine as the unshipped
//!   keybinding rows): Copy as SVG, mask ⇄ unmask, Edit vector →
//!   Planarize, auto-layout, Lock ⇄ Unlock (no `locked` prop exists in
//!   the document model). Group / Ungroup / Group with container ship.
//! - On the **application menu**, the same rows are *shown deferred*
//!   (`MENU-7`) — disabled placeholders naming the blocking system, so
//!   the bar is the enumerated backlog. See [`application_menu`].
//!
//! The layer-row, scene-row, and ruler menus are pending their hosts.

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
    /// An inert placeholder for a not-yet-built row (`MENU-7`):
    /// references no command, always disabled, dispatches nothing.
    /// Application menu only — the one row whose disabled state means
    /// "not built yet".
    Deferred(Deferred),
}

/// An actionable row (`MENU-1`: the command *is* the behavior).
#[derive(Debug, Clone)]
pub struct Action {
    pub command: Command,
    pub label: &'static str,
    /// `MENU-2`: mirrors the command's own gates at open time.
    pub enabled: bool,
}

/// A deferred placeholder (`MENU-7`): a row shown before its command
/// exists, so the application menu enumerates the backlog. It carries
/// no [`Command`] — it can never dispatch — and names the system it
/// waits on.
#[derive(Debug, Clone)]
pub struct Deferred {
    pub label: &'static str,
    /// The system / command path this row waits on (a dev annotation,
    /// not a user string): "mask system", "boolean-ops command family".
    pub awaiting: &'static str,
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
            Item::Separator | Item::Deferred(_) => false,
        })
    }
}

impl Menu {
    /// Every action in the menu, submenus included, in enumeration
    /// order (the `MENU-1` walk).
    pub fn actions(&self) -> Vec<&Action> {
        fn walk<'a>(items: &'a [Item], out: &mut Vec<&'a Action>) {
            for item in items {
                match item {
                    Item::Action(a) => out.push(a),
                    Item::Submenu(s) => walk(&s.items, out),
                    // Deferred rows reference no command — never actions
                    // (`MENU-1`/`MENU-7`).
                    Item::Separator | Item::Deferred(_) => {}
                }
            }
        }
        let mut out = Vec::new();
        walk(&self.items, &mut out);
        out
    }

    /// The native-host routing contract (`MENU-1`): a stable id for each
    /// actionable row — DFS action order, `"cmd-0"`, `"cmd-1"`, … — paired
    /// with the command it dispatches. A native menu (e.g. the desktop
    /// bar) tags each item with this id and, on activation, looks the
    /// command back up: one id, one command, no menu-only behavior.
    /// Deferred rows and separators get no id — they never dispatch.
    ///
    /// The id is positional (per action, in [`Self::actions`] order), so a
    /// host that builds the tree in the same order can assign ids by the
    /// same counter and stay in agreement without threading this map
    /// through the build.
    pub fn command_bindings(&self) -> Vec<(String, Command)> {
        self.actions()
            .iter()
            .enumerate()
            .map(|(i, a)| (format!("cmd-{i}"), a.command))
            .collect()
    }
}

fn action(command: Command, label: &'static str, enabled: bool) -> Item {
    Item::Action(Action {
        command,
        label,
        enabled,
    })
}

/// The selection-scoped enablement both menu surfaces resolve against
/// the working copy — computed once (`MENU-2`) and shared so the canvas
/// menu and the application bar cannot drift on what a command enables.
struct SelectionCaps {
    /// Any node is selected.
    some: bool,
    /// The paired visibility toggle's applicable label ("Show"/"Hide").
    toggle_label: &'static str,
    flatten: bool,
    create_outlines: bool,
    /// Bring-to-front / send-to-back would move something — `MENU-2`
    /// dry-run of the same `arrange::reorder` resolver the command runs
    /// (an already-frontmost selection disables Bring to front).
    front: bool,
    back: bool,
    /// A dissolvable member exists — `MENU-2` dry-run of the same
    /// `grouping::ungroup` resolver the command runs.
    ungroup: bool,
}

impl SelectionCaps {
    fn resolve(doc: &WorkingCopy, selection: &[Id]) -> Self {
        let some = !selection.is_empty();
        // Paired toggle (spec doctrine): present the applicable
        // direction — any visible member means the action hides.
        let any_visible = selection
            .iter()
            .any(|id| doc.node_active(id).unwrap_or(false));
        let toggle_label = if some && !any_visible { "Show" } else { "Hide" };
        SelectionCaps {
            some,
            toggle_label,
            flatten: crate::mode::can_flatten(doc, selection),
            create_outlines: crate::mode::can_create_outlines(doc, selection),
            front: some
                && crate::arrange::reorder(doc, selection, crate::arrange::ZOrder::Front).is_some(),
            back: some
                && crate::arrange::reorder(doc, selection, crate::arrange::ZOrder::Back).is_some(),
            ungroup: selection
                .iter()
                .any(|id| crate::grouping::ungroup(doc, id).is_some()),
        }
    }
}

/// The canvas menu (the spec's inventory, restricted to shipped
/// commands — see the module docs' unshipped list) over the current
/// target. Enablement is resolved here, once, at open time (`MENU-2`).
pub fn canvas_menu(doc: &WorkingCopy, selection: &[Id]) -> Menu {
    let SelectionCaps {
        some,
        toggle_label,
        flatten,
        create_outlines,
        front,
        back,
        ungroup,
    } = SelectionCaps::resolve(doc, selection);
    // Canvas-only, single-target affordances (Copy name / Copy ID).
    let single = selection.len() == 1;
    let named = single && doc.node_name(&selection[0]).is_some();

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
            action(Command::Group, "Group", some),
            action(Command::Ungroup, "Ungroup", ungroup),
            action(Command::GroupWithContainer, "Group with container", some),
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

/// `MENU-5` — opening retargets: a secondary press over an unselected
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

fn deferred(label: &'static str, awaiting: &'static str) -> Item {
    Item::Deferred(Deferred { label, awaiting })
}

fn submenu(label: &'static str, items: Vec<Item>) -> Item {
    Item::Submenu(Submenu { label, items })
}

/// The enablement inputs the application menu needs beyond the working
/// copy — the pieces that live above the document (history, active
/// mode). The shell supplies them from the [`crate::editor::Editor`] so
/// live rows stay `MENU-2`-honest without the menu reaching for state
/// it does not own.
pub struct AppMenuContext<'a> {
    pub doc: &'a WorkingCopy,
    pub selection: &'a [Id],
    /// A text content mode is active — the Text menu is shown.
    pub text_mode: bool,
    /// History has an undoable / redoable entry.
    pub can_undo: bool,
    pub can_redo: bool,
}

/// The application menu (`menu.md` "The application menu"): the
/// persistent top-level bar as a value, live rows wired to registry
/// commands and unbuilt rows shown deferred (`MENU-7`). The bar's items
/// are the top-level submenus; the native host presents them.
///
/// Enablement for the selection-scoped rows dry-runs the same resolvers
/// as [`canvas_menu`] (`MENU-2`); global rows (zoom, view toggles) are
/// always applicable; Undo/Redo read the supplied history flags.
/// Align/Distribute enablement is the coarse "selection non-empty" —
/// the exact per-resolver refinement is a later `MENU-2` slice.
pub fn application_menu(ctx: &AppMenuContext) -> Menu {
    let AppMenuContext {
        doc,
        selection,
        text_mode,
        can_undo,
        can_redo,
    } = *ctx;
    let SelectionCaps {
        some,
        toggle_label,
        flatten,
        create_outlines,
        front,
        back,
        ungroup,
    } = SelectionCaps::resolve(doc, selection);

    use crate::align::{Align, Distribute};

    let mut bar = vec![
        submenu(
            "File",
            vec![
                deferred("Open .grida", "file-open command + native file dialog"),
                action(Command::Save, "Save as .grida", true),
                Item::Separator,
                deferred("Import Image", "image-import command + native file dialog"),
                deferred("Import Figma", "Figma import path"),
            ],
        ),
        submenu(
            "Edit",
            vec![
                action(Command::Undo, "Undo", can_undo),
                action(Command::Redo, "Redo", can_redo),
                Item::Separator,
                action(Command::Cut, "Cut", some),
                action(Command::Copy, "Copy", some),
                action(Command::Paste, "Paste", true),
                action(Command::CopyAsPng, "Copy as PNG", some),
                deferred("Copy as SVG", "SVG export (io-external)"),
                deferred("Pick color", "eyedropper / color-pick system"),
                Item::Separator,
                action(Command::Duplicate, "Duplicate", some),
                action(Command::DeleteSelection, "Delete", some),
            ],
        ),
        submenu(
            "Object",
            vec![
                action(Command::GroupWithContainer, "Container selection", some),
                action(Command::Group, "Group selection", some),
                action(Command::Ungroup, "Ungroup selection", ungroup),
                Item::Separator,
                action(Command::BringToFront, "Bring to front", front),
                action(Command::BringForward, "Bring forward", some),
                action(Command::SendBackward, "Send backward", some),
                action(Command::SendToBack, "Send to back", back),
                Item::Separator,
                action(Command::Flatten, "Flatten", flatten),
                action(Command::CreateOutlines, "Create outlines", create_outlines),
                action(Command::ToggleVisible, toggle_label, some),
                Item::Separator,
                deferred("Boolean ops", "boolean-ops command family"),
                deferred("Use as mask", "mask system"),
                deferred("Flip horizontal", "flip transform op"),
                deferred("Flip vertical", "flip transform op"),
                deferred("Rotate 90°", "quantized rotate op"),
                deferred("Rotate 180°", "quantized rotate op"),
                deferred("Outline stroke", "stroke→fill geometry"),
                deferred("Remove fill", "paint-list mutations"),
                deferred("Remove stroke", "paint-list mutations"),
                deferred("Swap fill and stroke", "paint-list mutations"),
                deferred("Lock / Unlock", "lock system (`locked` prop absent)"),
                deferred("Add layout", "layout system (feat-layout)"),
            ],
        ),
        submenu(
            "Arrange",
            vec![
                action(Command::Align(Align::Left), "Align left", some),
                action(
                    Command::Align(Align::HCenter),
                    "Align horizontal centers",
                    some,
                ),
                action(Command::Align(Align::Right), "Align right", some),
                action(Command::Align(Align::Top), "Align top", some),
                action(
                    Command::Align(Align::VCenter),
                    "Align vertical centers",
                    some,
                ),
                action(Command::Align(Align::Bottom), "Align bottom", some),
                Item::Separator,
                action(
                    Command::Distribute(Distribute::Horizontal),
                    "Distribute horizontal spacing",
                    some,
                ),
                action(
                    Command::Distribute(Distribute::Vertical),
                    "Distribute vertical spacing",
                    some,
                ),
                Item::Separator,
                deferred("Round to pixel", "pixel-round op"),
                deferred("Tidy up", "tidy/pack layout"),
                deferred("Pack horizontal", "tidy/pack layout"),
                deferred("Pack vertical", "tidy/pack layout"),
                deferred("Distribute edges / centers", "edge/center distribute"),
            ],
        ),
        submenu(
            "View",
            vec![
                action(Command::ZoomIn, "Zoom in", true),
                action(Command::ZoomOut, "Zoom out", true),
                action(Command::Zoom100, "Zoom to 100%", true),
                action(Command::ZoomFit, "Zoom to fit", true),
                action(Command::ZoomSelection, "Zoom to selection", some),
                Item::Separator,
                action(Command::TogglePixelGrid, "Pixel grid", true),
                action(Command::ToggleRuler, "Ruler", true),
                action(Command::ToggleUi, "Show/Hide UI", true),
                submenu(
                    "Snapping",
                    vec![
                        action(Command::ToggleSnapPixelGrid, "Snap to pixel grid", true),
                        action(Command::ToggleSnapGeometry, "Snap to geometry", true),
                    ],
                ),
                Item::Separator,
                deferred("Minimize UI", "minimize-UI view state"),
            ],
        ),
    ];

    if text_mode {
        bar.push(submenu(
            "Text",
            vec![
                deferred("Bold", "text-attribute command system"),
                deferred("Italic", "text-attribute command system"),
                deferred("Underline", "text-attribute command system"),
                deferred("Strikethrough", "text-attribute command system"),
            ],
        ));
    }

    bar.push(submenu(
        "Settings",
        vec![
            deferred("General", "settings dialog system"),
            deferred("Keyboard shortcuts", "keybinding settings UI"),
        ],
    ));

    Menu { items: bar }
}
