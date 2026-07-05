//! Grida editor core.
//!
//! Reference implementation of the universal canvas spec
//! (`docs/wg/canvas/`); this crate's own binding specs live in `docs/`.
//! This crate is **editor core** in the RFC's architecture: it owns the
//! document working copy and all mutation, history, and command flow.
//! It has no UI and no shell — per contract `ARCH-1`, the full test
//! suite of this crate runs with no renderer.
//!
//! Module ↔ concept mapping (RFC "concept ≈ module" doctrine):
//! - [`document`] — `crates/grida_editor/docs/document.md` (`DOC-*` contracts)
//! - [`history`]  — `crates/grida_editor/docs/history.md` (`HISB-*` contracts)
//! - [`editor`]   — `crates/grida_editor/docs/editor.md` (`ED-*` contracts)
//! - [`bridge`]   — the editor↔renderer seam (infrastructure, not a
//!   concept of its own): mirrors applied mutations into a live
//!   renderer scene. Used by the vertical-slice tests and the shell.
//! - [`hud`]      — `crates/grida_editor/docs/hud.md` (`HUD-*` contracts): the
//!   canvas chrome and its interaction machine — pure and
//!   intent-emitting; depends on no document or editor type.
//! - [`interpret`] — the host side of the HUD seam (`HUD-7`): the one
//!   module where intents become document meaning (rotation
//!   recomposition, resize mapping, marquee resolution, refusals).
//! - [`measurement`] — `docs/wg/canvas/measurement.md` (`MEAS-*`
//!   contracts): the modifier-held spacing readout — host-side, pure,
//!   riding the HUD draw list as decorative host-fed extras.
//! - [`snap`] — `docs/wg/canvas/snap.md` (`SNAP-*` contracts):
//!   gesture-time alignment — geometry snap and pixel-grid
//!   quantization as interpretation stages ([`interpret`] calls them
//!   between intent and mutation), with guide chrome riding the same
//!   host-fed extras channel as [`measurement`].
//! - [`pixel_grid`] — `docs/wg/canvas/pixel-grid.md` (`PXG-*`
//!   contracts): the lattice's visual render as a pure plan; the
//!   shell paints it **above the content**, under the chrome.
//!   Deliberately independent of the snap quantization above
//!   (`PXG-5`).
//! - [`transparency_grid`] — `docs/wg/canvas/transparency-grid.md`
//!   (`TG-*` contracts): the alpha backdrop at the bottom of the
//!   canvas stack, as a pure checker plan; the shell composites it
//!   destination-over after the content pass.
//! - [`ruler`] — `docs/wg/canvas/ruler.md` (`RUL-*` contracts): the
//!   pure strip layout (tick steps, merged selection ranges, marks,
//!   fade) the shell paints; guide *interaction* rides [`hud`] +
//!   [`interpret`], guide *truth* lives in [`document`].
//! - [`ui`]       — `crates/grida_editor/docs/ui.md` / `widgets.md` (`UI-*`,
//!   `WID-*` contracts): the widget layer, feature-free — only the
//!   paint glue lives in the shell.
//! - [`wire`]     — wire encoding of the mutation vocabulary (`DOC-3`
//!   made literal); the currency of both io and sync.
//! - [`io`]       — `docs/wg/canvas/io.md` (`IO-*` contracts):
//!   clipboard fragments, document open/save.
//! - [`sync`]     — `docs/wg/feat-crdt/sync.md` (`SYNC-*` contracts):
//!   authority-ordered optimistic replication, transport-free.
//! - [`sync_net`] — sync transports (infrastructure, not a concept):
//!   in-process loopback for the contract suite (`SYNC-8`), TCP for
//!   the shell.
//! - [`tool`]     — `docs/wg/canvas/tool.md` (`TOOL-*` contracts): the
//!   authoring tool machine (insertion gestures, container adoption,
//!   text/pencil flows).
//! - [`command`]  — the command registry (routing.md's registry
//!   primitive): the one closed vocabulary every command surface —
//!   the binding table, the context menu — references and exactly
//!   one host switch dispatches (`SHELL-3`).
//! - [`keys`]     — `crates/grida_editor/docs/keybindings.md` (`KEY-*`
//!   contracts) + the chain-dispatch half of
//!   `crates/grida_editor/docs/routing.md` (`ROUTE-*`): the normative binding
//!   sheet as data — meaningful-modifier masks, the virtual primary
//!   modifier, command chains over the registry vocabulary, and
//!   enumeration-time table validation.
//! - [`menu`]     — `crates/grida_editor/docs/context-menu.md` (`CTX-*`
//!   contracts): the context menu as data — the closed item taxonomy
//!   (action / submenu / separator) over the registry, enablement
//!   resolved at open time, and the `CTX-4` retarget rule. The
//!   presenter lives in [`ui::menu`].
//! - [`traverse`] — `docs/wg/canvas/traversal.md` (`TRAV-*`
//!   contracts): pure keyboard selection traversal — down/up/across
//!   the tree — plus the scope-relative select-all.
//! - [`arrange`]  — the sheet's z-order rows (keybindings.md
//!   "Arrange"): pure reorder resolution onto the `Move` mutation.
//! - [`mode`]     — `docs/wg/canvas/edit-mode.md` (`MODE-*`
//!   contracts): the exclusive nested-editing slot and the enter
//!   idiom's dispatch table.
//! - [`vector`]   — `docs/wg/feat-vector-network/vector-edit.md` (`VEC-*`
//!   contracts): the vector content-edit mode and the pen — pure
//!   network ops ([`vector::ops`]), hit resolution ([`vector::hit`]),
//!   and the mode machine ([`vector::mode`]).
//! - [`shell`] *(feature `shell`)* — `crates/grida_editor/docs/shell.md`,
//!   M2+M3 shape: one window, canvas view plus the right-side
//!   properties strip.

pub mod align;
pub mod arrange;
pub mod bridge;
pub mod command;
pub mod document;
pub mod editor;
pub mod grouping;
pub mod history;
pub mod hud;
pub mod interpret;
pub mod io;
pub mod keys;
pub mod measurement;
pub mod menu;
pub mod mode;
pub mod pixel_grid;
pub mod ruler;
#[cfg(feature = "shell")]
pub mod shell;
pub mod snap;
pub mod sync;
pub mod sync_net;
pub mod tool;
pub mod transparency_grid;
pub mod traverse;
pub mod ui;
pub mod vector;
pub mod wire;
