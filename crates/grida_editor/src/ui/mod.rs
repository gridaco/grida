//! Editor UI logic — the view-agnostic half.
//!
//! The shell's chrome is egui-rendered (`shell::egui_panels`); what
//! remains here is the logic that view sits on top of and that the
//! headless tests exercise directly:
//!
//! - [`bind`] — the widget→document binding vocabulary (`Emission`,
//!   `BindingProperty`, `apply`); panel edits become preview/commit
//!   emissions applied through the editor (`ARCH-3`, one history entry
//!   per interaction).
//! - [`hierarchy`] — the layers-tree flattening and drag→drop geometry
//!   (`flatten`, `resolve_drop`), pure functions over a `TreeRow` list.
//!
//! The hand-rolled `UiLayer` widget framework this module used to host
//! (properties/toolbar/menu panels, the `widgets/*` set, focus,
//! scrolling) was retired when the chrome moved to egui.

pub mod bind;
pub mod hierarchy;
