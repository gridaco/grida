//! The native application menu bar — `crates/grida_editor/docs/menu.md`
//! "The application menu" (`MENU-*`). Translates the pure
//! [`crate::menu::Menu`] value that [`crate::menu::application_menu`]
//! produces into a [`muda`] menu bar, and routes a native activation
//! back to its registry command.
//!
//! The shell owns placement (native chrome) and dispatch (its one
//! registry switch); this module owns neither capability nor
//! enablement — it is a faithful presenter of the menu-as-data
//! (`SHELL-3`, `MENU-1`):
//!
//! - **Actionable rows** carry a positional id (`cmd-0`, `cmd-1`, … in
//!   [`crate::menu::Menu::actions`] order) and are recorded in the
//!   id→command map. On activation the shell looks the command back up
//!   and dispatches it — one id, one command, no menu-only behavior.
//! - **Deferred rows** (`MENU-7`) render as a disabled `"(deferred)"`
//!   item with no id: they can never emit an activation.
//! - **Accelerators are not set here yet.** The shell already owns the
//!   keyboard through the `KEY-*`/`ROUTE-*` winit routing; giving muda
//!   *active* accelerators would double-dispatch every chord. Showing
//!   the sheet's hints (`MENU-3`) without also consuming the key is a
//!   later reconciliation — until then the bar shows no accelerators
//!   (the honest subset: a menu never shows a chord it cannot own).

use std::collections::HashMap;

use muda::{IsMenuItem, Menu, MenuId, MenuItem, PredefinedMenuItem, Submenu};

use crate::command::Command;

/// The live native menu bar plus the map from each actionable item's id
/// to the command it dispatches.
pub(crate) struct MenuBar {
    /// Kept alive for the lifetime of the bar — dropping it would tear
    /// the native menu down.
    _menu: Menu,
    commands: HashMap<MenuId, Command>,
}

impl MenuBar {
    /// Build the native bar from the application menu value. The id
    /// counter increments once per actionable row, walking in the same
    /// depth-first order as [`crate::menu::Menu::actions`] — so the ids
    /// agree with [`crate::menu::Menu::command_bindings`] by
    /// construction.
    pub(crate) fn build(app_menu: &crate::menu::Menu) -> Self {
        let menu = Menu::new();
        let mut commands = HashMap::new();
        let mut next_id = 0usize;

        // macOS: `init_for_nsapp` replaces the whole main menu, so we
        // must supply the standard **application menu** (the bold
        // app-name menu) ourselves — otherwise the OS Quit (⌘Q), Hide
        // (⌘H), and About vanish. These are platform chrome handled by
        // the AppKit responder chain, not editor commands: they carry
        // no id, emit no activation we route, and are exempt from
        // `MENU-1` the same way separators are. ⌘Q here is muda's, not
        // the keybinding sheet's — no double-dispatch (the sheet does
        // not bind it).
        #[cfg(target_os = "macos")]
        {
            let app = Submenu::new("Grida", true);
            let _ = app.append(&PredefinedMenuItem::about(Some("About Grida"), None));
            let _ = app.append(&PredefinedMenuItem::separator());
            let _ = app.append(&PredefinedMenuItem::hide(None));
            let _ = app.append(&PredefinedMenuItem::hide_others(None));
            let _ = app.append(&PredefinedMenuItem::show_all(None));
            let _ = app.append(&PredefinedMenuItem::separator());
            let _ = app.append(&PredefinedMenuItem::quit(None));
            let _ = menu.append(&app);
        }

        for item in &app_menu.items {
            let built = build_item(item, &mut next_id, &mut commands);
            // A malformed append can only drop a row from the bar; it is
            // never fatal to the editor.
            let _ = menu.append(built.as_ref());
        }
        Self {
            _menu: menu,
            commands,
        }
    }

    /// Install the bar as the process menu bar. macOS only for now
    /// (`init_for_nsapp`); the Windows/Linux hosts attach per-window and
    /// are deferred with their shells.
    pub(crate) fn install(&self) {
        #[cfg(target_os = "macos")]
        self._menu.init_for_nsapp();
    }

    /// The command a native activation dispatches, or `None` for an id
    /// this bar does not own (a deferred or foreign item).
    pub(crate) fn command_for(&self, id: &MenuId) -> Option<Command> {
        self.commands.get(id).copied()
    }
}

/// Translate one menu item, threading the action-id counter and the
/// id→command map. Deferred rows and separators get no id.
fn build_item(
    item: &crate::menu::Item,
    next_id: &mut usize,
    commands: &mut HashMap<MenuId, Command>,
) -> Box<dyn IsMenuItem> {
    use crate::menu::Item;
    match item {
        Item::Separator => Box::new(PredefinedMenuItem::separator()),
        Item::Action(a) => {
            let id = MenuId::new(format!("cmd-{}", *next_id));
            *next_id += 1;
            commands.insert(id.clone(), a.command);
            // No accelerator (see the module note): the shell owns the
            // keyboard; muda would double-dispatch.
            Box::new(MenuItem::with_id(id, a.label, a.enabled, None))
        }
        Item::Deferred(d) => {
            // `MENU-7`: inert, disabled, marked — and idless, so it can
            // never emit an activation.
            let label = format!("{} (deferred)", d.label);
            Box::new(MenuItem::new(label, false, None))
        }
        Item::Submenu(s) => {
            // Top-level and nested submenus stay openable regardless of
            // child enablement — the native bar greys individual rows,
            // never a whole menu, so a fully-deferred menu (Settings) is
            // still explorable.
            let sub = Submenu::new(s.label, true);
            for child in &s.items {
                let built = build_item(child, next_id, commands);
                let _ = sub.append(built.as_ref());
            }
            Box::new(sub)
        }
    }
}
