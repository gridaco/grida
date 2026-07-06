//! The shell's winit application handler.
//!
//! Event translation is cribbed from
//! `crates/grida_dev/src/platform/native_application.rs`, but document
//! mutation goes through [`Editor`] + [`crate::bridge`] instead of
//! `grida_dev`'s `EditorDocument`: the editor owns truth, a gesture is
//! begin → silent previews → commit (one history entry, `HISB-2` /
//! `SURF-2`).
//!
//! ## HUD hosting (`crates/grida_editor/docs/hud.md`)
//!
//! Canvas pointer input routes to the [`crate::hud::Hud`] machine —
//! not the engine's built-in surface. The shell is the HUD's host: it
//! forwards logical-screen events, answers the two scene queries
//! through [`bridge::EngineScene`], drains the returned intents into
//! [`crate::interpret::Interpreter`] (the one place intents become
//! document meaning, `HUD-7`), paints the chrome draw list between
//! content and panels, and pushes the selection mirror down at the
//! reflect tail (`HUD-3`: intents up, mirror down, same event). The
//! engine surface still owns exactly two things: the camera (pan /
//! zoom commands, middle-drag pan) and the text-edit session, which
//! receives events directly while active.
//!
//! ## Frame orchestration (`crates/grida_editor/docs/frame.md`)
//!
//! No call site talks to the renderer about content. Every mutation —
//! panel edit, gesture preview, tool insert, undo, paste, sync drain —
//! lands in the editor's damage ledger, and the tail of every host
//! event runs [`ShellApp::reflect_frame`]: drain, reflect into the
//! renderer (narrow record-copy or wholesale reload), re-sync panels
//! and title, request the redraw (`FRAME-1..4`). The scattered
//! per-site mirror/flush/redraw plumbing this replaces is the failure
//! mode `FRAME-2` names.
//!
//! ## Chrome (egui)
//!
//! The shell's panels — properties, hierarchy, toolbar, context menu —
//! are all egui-rendered ([`super::egui_panels`]), painted on the shared
//! GL context as the last recomposition step (`paint_egui`). egui is the
//! top input tier: every event is fed to it first in [`ShellApp::window_event`],
//! and pointer/keyboard input it wants never reaches the HUD, tools, or
//! canvas. Panel edits still flow through [`crate::ui::bind::apply`]
//! (previews silent, one history entry per interaction) and reach pixels
//! via the damage ledger like everything else.

use glutin::{
    context::PossiblyCurrentContext,
    prelude::GlSurface,
    surface::{Surface as GlutinSurface, WindowSurface},
};
use grida::node::schema::Size;
use grida::overlay::{Modifiers, PointerButton, SurfaceEvent};
use grida::runtime::invalidation::GlobalFlag;
use grida::runtime::render_policy::RenderPolicy;
use grida::text_edit::session::KeyName;
use grida::window::application::{ApplicationApi, HostEvent, UnknownTargetApplication};
use grida::window::command::ApplicationCommand;
use math2::transform::AffineTransform;
use std::num::NonZeroU32;
use winit::application::ApplicationHandler;
use winit::event::{ElementState, KeyEvent, MouseButton, MouseScrollDelta, WindowEvent};
use winit::event_loop::ActiveEventLoop;
// `key_without_modifiers` — the layout-base key a shortcut resolves
// against, before the OS composes it (Option+A → 'å', dead keys, non-US
// layouts). See `on_key_pressed`'s binding lookup.
use winit::keyboard::{Key, NamedKey};
use winit::platform::modifier_supplement::KeyEventExtModifierSupplement;
use winit::window::Window;

use crate::bridge::{self, EngineScene};
use crate::document::{Id, Mutation, PropPatch};
use crate::editor::{Editor, Recording};
use crate::history::Origin;
use crate::hud::{Hud, HudCursor, HudEvent, HudPrim, ResizeDirection, Role};
use crate::interpret::{self, InterpretScene, Interpreter};
use crate::keys::{self, Command, KeyCode};
use crate::mode::{EditMode, EnterDispatch, dispatch_enter};
use crate::paint_session::gradient::chrome::layout as gradient_layout;
use crate::paint_session::gradient::mode::{GradientSession, PaintTarget};
use crate::shell::session::SyncSession;
use crate::tool::{Tool, ToolMachine, ToolOutcome};
use crate::vector::mode::{EscapeStep, VecMods, VectorMode, VectorTool as VecTool};

pub(crate) struct ShellApp {
    pub(crate) editor: Editor,
    pub(crate) app: UnknownTargetApplication,
    pub(crate) gl_surface: GlutinSurface<WindowSurface>,
    pub(crate) gl_context: PossiblyCurrentContext,
    pub(crate) window: Window,
    // ── egui integration spike (golden-hopping-clock plan) ───────────
    /// The egui context — the immediate-mode UI's retained backend
    /// (fonts, memory, tessellation). Cheap `Arc` clone; cloned locally
    /// each frame so the build closure can borrow `&mut self`.
    pub(crate) egui_ctx: egui::Context,
    /// winit↔egui bridge: translates window events into egui `RawInput`
    /// and applies egui's platform output (cursor, clipboard).
    pub(crate) egui_winit: egui_winit::State,
    /// The egui_glow painter — draws egui's tessellated meshes on the
    /// *same* GL context Skia renders on (`window.rs` glow handle).
    pub(crate) egui_painter: egui_glow::Painter,
    /// Last present's wall-clock cost (ms), shown in the egui panel for
    /// the perf A/B. Set at the tail of the `RedrawRequested` arm.
    pub(crate) last_frame_ms: f32,
    /// The egui-rendered editor panels (the real migration off
    /// `UiLayer`) — owns only transient view state (edit buffers).
    pub(crate) egui_panels: super::egui_panels::EguiPanels,
    /// The context menu, egui-rendered: its inventory + anchor (logical
    /// px) while open, `None` when closed (the model — `crate::menu` —
    /// is reused unchanged; only the view is egui).
    pub(crate) menu_open: Option<(crate::menu::Menu, egui::Pos2)>,
    pub(crate) modifiers: winit::keyboard::ModifiersState,
    /// The HUD machine — canvas chrome + interaction
    /// (`crates/grida_editor/docs/hud.md`).
    pub(crate) hud: Hud,
    /// The intent interpreter — the one host module where intents
    /// become document meaning (`HUD-7`).
    pub(crate) interp: Interpreter,
    /// Injected-clock epoch for the HUD's multi-click tracking.
    pub(crate) epoch: std::time::Instant,
    /// Cached typeface for the HUD's size badge.
    pub(crate) hud_font: Option<skia_safe::Font>,
    /// Middle-drag pan in flight: pointer events route to the engine
    /// surface (camera is engine view state) until the button lifts.
    pub(crate) pan_active: bool,
    pub(crate) exiting: bool,
    /// The authoring tool machine (`docs/wg/canvas/tool.md`).
    pub(crate) tools: ToolMachine,
    /// Ruler visibility (`docs/wg/canvas/ruler.md`): per-instance
    /// view state, ⇧R (web parity). Mirrored into the HUD (`RUL-8`).
    pub(crate) ruler: bool,
    /// Pixel-grid render visibility (`docs/wg/canvas/pixel-grid.md`):
    /// per-instance view state, ⇧' (web parity). Independent of the
    /// snap-to-pixel-grid toggle (`PXG-5`).
    pub(crate) pixelgrid: bool,
    /// Outline (wireframe) render mode — drives the engine's
    /// `RenderPolicy` wireframe preset. A content view state (repaints
    /// the scene, not just the overlay). ⇧⌘O (web parity).
    pub(crate) outline_mode: bool,
    /// Whether outline mode ignores clip/mask content
    /// (`RenderPolicy::ignore_clips_content`). Defaults on, matching
    /// `WIREFRAME_DEFAULT`; only meaningful while `outline_mode` is on.
    pub(crate) outline_ignore_clips: bool,
    /// Pixel-preview scale (`Renderer::set_pixel_preview_scale`): 0
    /// disabled, 1 = 1x, 2 = 2x. A content view state.
    pub(crate) pixel_preview: u8,
    /// Shell chrome visibility (keybindings.md, Mod+\): when false
    /// `build_inspector` builds no egui, so the panels/toolbar/menu are
    /// neither drawn nor input-claiming and the canvas stands alone.
    pub(crate) ui_visible: bool,
    /// Window scale factor (physical px = logical px × dpr).
    pub(crate) dpr: f32,
    /// Last title pushed to the window (`update_title` sets only on
    /// change — it runs on every reflect).
    pub(crate) title: String,
    /// The opened document's path (`--open`); Cmd+S targets it (or
    /// mints `untitled.grida` on first save).
    pub(crate) doc_path: Option<std::path::PathBuf>,
    /// System clipboard handle (IO-5 cross-instance copy/paste).
    pub(crate) clipboard: Option<arboard::Clipboard>,
    /// Active sync session, if any (`--listen` / `--join`).
    pub(crate) session: Option<SyncSession>,
    /// The edit-mode slot (`edit-mode.md` MODE-1): at most one nested
    /// editing context. Text sessions stay engine-owned (their slot
    /// mirror is deferred with the session promotion); the vector
    /// mode lives here.
    pub(crate) mode: EditMode,
    /// The pen key is physically held — the keep-projecting modifier
    /// (`vector-edit.md` VEC-5; keybindings.md "P held").
    pub(crate) pen_key_held: bool,
    /// The pen was armed with nothing selected: the first canvas
    /// placement creates a vector node and enters its mode
    /// (`vector-edit.md` entry).
    pub(crate) pen_pending: bool,
    /// Momentary hold overlay (`KEY-5`): Space = hand, Z = zoom. A
    /// *virtual* tool overlay (tool.md — hand/zoom are not taxonomy
    /// members): the tool machine's state is untouched, so releasing
    /// the key restores the prior tool exactly, even mid-gesture.
    pub(crate) hold: Option<HoldTool>,
    /// Sticky hand (the `H` row): the same overlay, latched — any
    /// tool selection or the escape ladder releases it.
    pub(crate) hand_sticky: bool,
    /// A hand-overlay pan rides the primary button: this marks the
    /// drag so its release closes the camera gesture even if the hold
    /// key lifted mid-drag.
    pub(crate) hold_pan: bool,
    /// The opacity digit command's multi-tap state (`KEY-6`).
    pub(crate) opacity_taps: keys::OpacityTaps,
    /// The platform the binding table resolves against (`KEY-3`).
    pub(crate) platform: keys::Platform,
    /// The native application menu bar (`menu.md` "The application
    /// menu", `MENU-*`). Built lazily on first resume and rebuilt when
    /// the state it reflects changes.
    pub(crate) menu_bar: Option<crate::shell::menubar::MenuBar>,
    /// The selection the live `menu_bar` was built against — a change
    /// triggers a rebuild (enablement, paired-toggle labels).
    pub(crate) menu_selection: Vec<crate::document::Id>,
    /// A command ran or a mode changed: rebuild the menu bar next tick
    /// (undo/redo availability, text-mode gating, toggle direction).
    pub(crate) menu_dirty: bool,
}

/// The momentary (hold) virtual tools — keybindings.md's `(hold)`
/// rows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum HoldTool {
    Hand,
    Zoom,
}

impl ShellApp {
    /// Window title per the brief: history depth readout, plus a sync
    /// marker while a session is active. Runs on every reflect; the
    /// window only sees actual changes.
    pub(crate) fn update_title(&mut self) {
        let sync = if self.session.is_some() { " ⇅" } else { "" };
        let title = format!("grida_editor — {} entries{sync}", self.editor.history_len());
        if self.title != title {
            self.window.set_title(&title);
            self.title = title;
        }
    }

    /// The frame choke point (`FRAME-2`, `crates/grida_editor/docs/frame.md`):
    /// drain the editor's damage ledger and reflect it into the
    /// renderer, then fan out everything else derived from document
    /// state — panel re-syncs, the window title — from the same
    /// drain. Runs once at the tail of every host event; no other
    /// call site mirrors, flushes, or schedules content frames.
    fn reflect_frame(&mut self) {
        let damage = self.editor.take_damage();
        if bridge::reflect(self.editor.document(), self.app.renderer_mut(), &damage) {
            // All panels are egui now (properties, hierarchy, toolbar,
            // menu) — read live each frame, nothing to sync here.
            self.window.request_redraw();
        }
        // The guides mirror-down (`RUL-9`, same shape as the
        // selection mirror below): whatever this event did to the
        // guide set — an interpreted guide intent, an undo, a sync
        // drain — the HUD mirror reconciles here, once. Guide damage
        // is overlay damage: chrome repaints, no content frame.
        self.hud.set_guides(self.editor.guides());
        if damage.guides {
            self.overlay_damaged();
        }
        // The selection mirror-down (`HUD-3`, `SURF-7`): whatever this
        // event did to the editor's selection — an intent the
        // interpreter committed, an undo's context restore, a panel
        // click, a paste, an ED-7 prune — the HUD mirror and the
        // selection-dependent panels reconcile here, once. A selection
        // change re-shapes the chrome and can unmount the properties
        // strip, so it is overlay damage: the base repaints beneath.
        if self.hud.selection() != self.editor.selection() {
            self.hud.set_selection(self.editor.selection());
            // The egui hierarchy reads the selection live and reveals on
            // change itself (`HIER-4`) — no panel sync needed here.
            self.overlay_damaged();
        }
        // MODE-6 subject pinning: whatever this event did — an undo
        // crossing the mode's entry, a remote delete of the subject —
        // the mode reconciles here, once. A dead mode drops with no
        // residue.
        let drop_mode = match &mut self.mode {
            EditMode::Vector(m) => !m.reconcile(&self.editor),
            EditMode::Gradient(s) => !s.reconcile(&self.editor),
            _ => false,
        };
        if drop_mode {
            self.mode = EditMode::None;
            self.overlay_damaged();
        }
        self.update_title();
    }

    /// Overlay damage (hud.md "Compositing rule"): an overlay's visual
    /// coverage changed — HUD chrome (hover, marquee, selection
    /// chrome), a panel mounting or unmounting, chrome dormancy
    /// flipping on a tool switch. Schedule a present. The present
    /// itself is a full recomposition (base restored from the content
    /// cache — see the RedrawRequested arm), so overlay changes need
    /// no content frame of their own; quiescence holds — no event, no
    /// damage, no present.
    fn overlay_damaged(&mut self) {
        self.window.request_redraw();
    }

    /// Push the current outline-mode state into the engine render
    /// policy. Outline mode swaps `STANDARD`⇄`WIREFRAME_DEFAULT`, with
    /// the independent `ignore_clips_content` sub-toggle applied on top
    /// (both fields are `pub` on `RenderPolicy`). A content change, so
    /// it invalidates the picture cache (`GlobalFlag::Config`) and
    /// requests a full repaint — never the overlay path.
    fn apply_outline_policy(&mut self) {
        let policy = if self.outline_mode {
            RenderPolicy {
                ignore_clips_content: self.outline_ignore_clips,
                ..RenderPolicy::WIREFRAME_DEFAULT
            }
        } else {
            RenderPolicy::STANDARD
        };
        let r = self.app.renderer_mut();
        r.set_render_policy(policy);
        r.mark_global(GlobalFlag::Config);
        eprintln!(
            "grida_editor: outline: {} (ignore clips: {})",
            if self.outline_mode { "on" } else { "off" },
            self.outline_ignore_clips
        );
        self.window.request_redraw();
    }

    /// Set the pixel-preview scale (0 disabled / 1 = 1x / 2 = 2x) on the
    /// engine and mirror it onto shell state. A content change (same
    /// invalidation path as [`Self::apply_outline_policy`]).
    fn set_pixel_preview(&mut self, scale: u8) {
        let scale = scale.min(2);
        // A redundant radio pick (e.g. "1x" while already 1x) would
        // otherwise drop the picture cache and force a full repaint.
        if scale == self.pixel_preview {
            return;
        }
        self.pixel_preview = scale;
        let r = self.app.renderer_mut();
        r.set_pixel_preview_scale(scale);
        r.mark_global(GlobalFlag::Config);
        eprintln!("grida_editor: pixel preview: {scale}x");
        self.window.request_redraw();
    }

    /// Milliseconds since shell start — the HUD's injected clock.
    fn now_ms(&self) -> u64 {
        self.epoch.elapsed().as_millis() as u64
    }

    /// The camera transform in the HUD's space: canvas → **logical**
    /// screen px (the engine camera projects to physical px; the HUD,
    /// like the UI layers, works in logical).
    fn logical_view(&self) -> AffineTransform {
        let inv_dpr = 1.0 / self.dpr.max(0.01);
        let scale = AffineTransform::from_acebdf(inv_dpr, 0.0, 0.0, 0.0, inv_dpr, 0.0);
        scale.compose(&self.app.view_matrix())
    }

    /// Dispatch one event into the HUD and commit whatever it meant:
    /// scene queries answered by [`bridge::EngineScene`], intents
    /// drained into the interpreter (`HUD-7`), shell follow-ups
    /// (text-session entry, cursor) applied. Document changes reach
    /// pixels through the damage ledger at the event-tail reflect;
    /// selection changes come back to the HUD as the mirror push
    /// there too.
    fn dispatch_hud(&mut self, event: HudEvent) {
        self.hud.set_view(self.logical_view());
        let now = self.now_ms();
        let response = {
            let scene = EngineScene {
                app: &self.app,
                doc: self.editor.document(),
            };
            self.hud.dispatch(event, &scene, now)
        };
        for intent in &response.intents {
            let mut facts = {
                let scene = EngineScene {
                    app: &self.app,
                    doc: self.editor.document(),
                };
                interpret::facts_for(intent, &scene)
            };
            // Host state the snap stages read (snap.md): the logical
            // zoom (SNAP-9 thresholds are screen-space) and the live
            // disable modifier (SNAP-3; ctrl per the golden input
            // spec).
            facts.zoom = self.app.renderer().camera.get_zoom() / self.dpr.max(0.01);
            facts.snap_disabled = self.modifiers.control_key();
            // Guides feed snapping only while the ruler shows them
            // (RUL-8 — snapping to an invisible line reads as a bug;
            // web parity).
            if self.ruler {
                facts.snap_guides = self.editor.guides().to_vec();
            }
            let outcome = self.interp.apply(&mut self.editor, intent, &facts);
            if let Some(id) = outcome.enter_content_edit {
                self.enter_content_edit(id);
            }
        }
        if response.cursor_changed {
            self.apply_hud_cursor();
        }
        // Chrome visuals changed (hover, marquee, gesture state):
        // overlay damage — the base repaints beneath the new chrome.
        if response.needs_redraw {
            self.overlay_damaged();
        }
    }

    /// Cancel any in-flight HUD gesture (Esc, pre-save): the machine
    /// emits its `Cancel`, the interpreter aborts the editor frame.
    fn cancel_hud_gesture(&mut self) -> bool {
        if !self.hud.gesture_active() {
            return false;
        }
        self.dispatch_hud(HudEvent::Cancel);
        true
    }

    /// The enter idiom (`edit-mode.md` MODE-2): resolve by the
    /// dispatch table — text session, vector mode, or a named
    /// deferred row.
    fn enter_content_edit(&mut self, id: Id) {
        // The session reads the renderer scene — reflect pending
        // damage first so it sees current state.
        self.reflect_frame();
        match dispatch_enter(&self.editor, &id) {
            EnterDispatch::Text(id) => {
                let entered = self
                    .editor
                    .document()
                    .internal_id(&id)
                    .is_some_and(|iid| self.app.text_edit_enter_by_id(iid));
                if entered {
                    self.tools.begin_text_edit_existing(&mut self.editor, id);
                }
            }
            EnterDispatch::Vector(id) => self.enter_vector_mode(id, VecTool::Cursor),
            // Entering a primitive is a commitment: flatten first,
            // then the vector mode on the flattened node.
            EnterDispatch::FlattenThenVector(id) => {
                if crate::mode::flatten_to_vector(&mut self.editor, &id) {
                    self.enter_vector_mode(id, VecTool::Cursor);
                }
            }
            // Deferred row (the dispatch *order* is contract-bound;
            // the handling lands with the paint sessions).
            EnterDispatch::ImagePaintSession(_) | EnterDispatch::NotEnterable => {}
        }
    }

    /// Map the HUD's cursor value to the platform cursor. Only applies
    /// while the cursor tool is armed — authoring tools own the
    /// crosshair ([`ShellApp::update_cursor_icon`]).
    fn apply_hud_cursor(&mut self) {
        if !matches!(self.tools.tool(), Tool::Cursor) {
            return;
        }
        let icon = match self.hud.cursor() {
            HudCursor::Default => winit::window::CursorIcon::Default,
            HudCursor::Pointer => winit::window::CursorIcon::Pointer,
            HudCursor::Move => winit::window::CursorIcon::Move,
            HudCursor::Resize(dir) => match dir {
                ResizeDirection::N | ResizeDirection::S => winit::window::CursorIcon::NsResize,
                ResizeDirection::E | ResizeDirection::W => winit::window::CursorIcon::EwResize,
                ResizeDirection::NE | ResizeDirection::SW => winit::window::CursorIcon::NeswResize,
                ResizeDirection::NW | ResizeDirection::SE => winit::window::CursorIcon::NwseResize,
            },
            HudCursor::Rotate(_) => winit::window::CursorIcon::Grab,
            // An axis-x guide moves along x (ew); axis-y along y (ns)
            // — ruler.md's axis orientation, web cursor parity.
            HudCursor::Guide(axis) => match axis {
                math2::vector2::Axis::X => winit::window::CursorIcon::EwResize,
                math2::vector2::Axis::Y => winit::window::CursorIcon::NsResize,
            },
        };
        self.window.set_cursor(winit::window::Cursor::Icon(icon));
    }

    fn build_modifiers(&self) -> Modifiers {
        Modifiers {
            shift: self.modifiers.shift_key(),
            alt: self.modifiers.alt_key(),
            ctrl_or_cmd: self.primary_held(),
        }
    }

    fn primary_held(&self) -> bool {
        if cfg!(target_os = "macos") {
            self.modifiers.super_key()
        } else {
            self.modifiers.control_key()
        }
    }

    /// The HUD's modifier snapshot (`meta` = the region-select
    /// override key, ⌘ on macOS).
    fn hud_modifiers(&self) -> crate::hud::Modifiers {
        crate::hud::Modifiers {
            shift: self.modifiers.shift_key(),
            alt: self.modifiers.alt_key(),
            meta: self.modifiers.super_key(),
            ctrl: self.modifiers.control_key(),
        }
    }

    /// The vector mode's live modifier snapshot: shift = additive /
    /// axis lock; keep-projecting = the held pen key; bend = the
    /// meta hold; alt = independent tangent drag (a provisional
    /// mirroring mapping until the sheet binds it).
    fn vec_mods(&self) -> VecMods {
        VecMods {
            shift: self.modifiers.shift_key(),
            keep_projecting: self.pen_key_held,
            bend: self.modifiers.super_key(),
            mirroring: if self.modifiers.alt_key() {
                crate::vector::ops::Mirroring::None
            } else {
                crate::vector::ops::Mirroring::Auto
            },
        }
    }

    /// Logical zoom (screen px per canvas unit) — the vector mode's
    /// screen-space thresholds divide by it.
    fn logical_zoom(&self) -> f32 {
        self.app.renderer().camera.get_zoom() / self.dpr.max(0.01)
    }

    /// Enter the vector content mode on `id` (MODE-1: the previous
    /// occupant exits in full first).
    fn enter_vector_mode(&mut self, id: Id, tool: VecTool) {
        self.exit_active_mode();
        if let Some(mut mode) = VectorMode::enter(&self.editor, id) {
            mode.set_tool(tool);
            self.mode = EditMode::Vector(Box::new(mode));
            self.overlay_damaged();
        }
    }

    /// Enter the gradient paint session on the paint at `(id, target,
    /// index)` (MODE-1: the previous occupant exits first). No-op when
    /// the address is not a gradient.
    fn enter_paint_session(&mut self, id: Id, target: PaintTarget, index: usize) {
        self.exit_active_mode();
        if let Some(session) = GradientSession::enter(&self.editor, id, target, index) {
            self.mode = EditMode::Gradient(Box::new(session));
            self.overlay_damaged();
        }
    }

    /// Exit whatever occupies the edit-mode slot, restoring the
    /// document selection to the world above (`vector-edit.md` exit).
    fn exit_active_mode(&mut self) {
        let prev = std::mem::take(&mut self.mode);
        match prev {
            EditMode::Vector(mode) => {
                let out = mode.exit(&mut self.editor);
                self.editor.set_selection(if out.deleted {
                    Vec::new()
                } else {
                    vec![out.node]
                });
                self.overlay_damaged();
            }
            // A paint session leaves its subject selected (no cleanup
            // doctrine — its edits already committed).
            EditMode::Gradient(session) => {
                let node = session.node().clone();
                session.exit(&mut self.editor);
                self.editor.set_selection(vec![node]);
                self.overlay_damaged();
            }
            _ => {}
        }
    }

    /// Engine-surface dispatch — text-session events only (the engine
    /// owns the session's pointer and keys while active). Everything
    /// else routes to the HUD; the engine surface holds no selection
    /// the shell reads.
    fn dispatch_engine_text(&mut self, event: SurfaceEvent) -> grida::overlay::SurfaceResponse {
        self.app.handle_surface_event(event)
    }

    /// Application commands — camera only (pan / zoom); selection
    /// commands go through the editor directly.
    fn run_command(&mut self, cmd: ApplicationCommand) -> bool {
        self.app.command(cmd)
    }

    // -- io: clipboard + save (docs/wg/canvas/io.md) --------------------------

    /// Cmd+C: encode the selection as a wire envelope onto the system
    /// clipboard (IO-5 — plain text, so a second instance can paste).
    fn copy_selection(&mut self) {
        let selection = self.editor.selection().to_vec();
        if selection.is_empty() {
            return;
        }
        match crate::io::copy(&self.editor, &selection) {
            Ok(json) => {
                if let Some(clipboard) = self.clipboard.as_mut()
                    && let Err(e) = clipboard.set_text(json)
                {
                    eprintln!("grida_editor: clipboard: {e}");
                }
            }
            Err(e) => eprintln!("grida_editor: copy: {e}"),
        }
    }

    /// Offer plain text to the system clipboard (the copy-name /
    /// copy-id commands — menu.md reference additions).
    fn set_clipboard_text(&mut self, text: String) -> bool {
        let Some(clipboard) = self.clipboard.as_mut() else {
            return false;
        };
        if let Err(e) = clipboard.set_text(text) {
            eprintln!("grida_editor: clipboard: {e}");
            return false;
        }
        true
    }

    /// Mod+Shift+C: render the whole selection as one raster and offer
    /// it to the system clipboard as an image (io-external.md "copy
    /// toward the outside"; `IOX-7`). Renders from committed state at
    /// document scale: each selected root's subtree in isolation (its
    /// own opacity applies, ancestor opacity does not), composited in
    /// paint order over the selection's union bounds.
    fn copy_selection_as_png(&mut self) -> bool {
        let Some((width, height, pixels)) = self.render_selection_raster() else {
            return false;
        };
        if let Some(clipboard) = self.clipboard.as_mut()
            && let Err(e) = clipboard.set_image(arboard::ImageData {
                width,
                height,
                bytes: pixels.into(),
            })
        {
            eprintln!("grida_editor: clipboard: {e}");
        }
        true
    }

    /// Composite the selection into one RGBA raster (see
    /// [`Self::copy_selection_as_png`]); `None` when nothing renders.
    ///
    /// A selected node whose ancestor is also selected is dropped — it
    /// is already drawn by that ancestor's subtree export. The
    /// surviving **roots** are painted back-to-front (the engine's
    /// flat layer list is document paint order) into a surface sized
    /// to their union render bounds; each root is exported with a
    /// camera fit to that union, so world positions compose with no
    /// offset math. Overlapping roots stack correctly; effects that
    /// cross a node boundary (backdrop blends) are not reproduced —
    /// each root renders in isolation, the same isolation single-node
    /// export already uses.
    fn render_selection_raster(&self) -> Option<(usize, usize, Vec<u8>)> {
        let selection = self.editor.selection();
        if selection.is_empty() {
            return None;
        }
        let doc = self.editor.document();
        let selected: std::collections::HashSet<Id> = selection.iter().cloned().collect();
        // A root is a selected node with no selected ancestor.
        let root_set: std::collections::HashSet<Id> = selection
            .iter()
            .filter(|id| !doc.has_ancestor_in(id, &selected))
            .cloned()
            .collect();

        let renderer = self.app.renderer();
        let cache = renderer.get_cache();

        // Roots in paint order (back-to-front): scan the flat layer
        // list once, climbing each leaf to its containing root.
        let mut ordered = Vec::new();
        let mut seen: std::collections::HashSet<Id> = std::collections::HashSet::new();
        for entry in &cache.layers.layers {
            let Some(stable) = doc.stable_id(entry.id) else {
                continue;
            };
            let mut cur = Some(stable.clone());
            while let Some(c) = cur {
                if root_set.contains(&c) {
                    if seen.insert(c.clone())
                        && let Some(iid) = doc.internal_id(&c)
                    {
                        ordered.push(iid);
                    }
                    break;
                }
                cur = doc.node_parent(&c).flatten();
            }
        }
        if ordered.is_empty() {
            return None;
        }

        // Union of the drawn roots' render bounds.
        let rects: Vec<math2::rect::Rectangle> = ordered
            .iter()
            .filter_map(|iid| cache.geometry.get_render_bounds(iid))
            .collect();
        if rects.is_empty() {
            return None;
        }
        let union = math2::rect::union(&rects);
        if !(union.width > 0.0 && union.height > 0.0) {
            return None;
        }

        // Composite each root, each exported with a camera fit to the
        // union so it lands at its world position; paint in order.
        let mut surface =
            skia_safe::surfaces::raster_n32_premul((union.width as i32, union.height as i32))?;
        let canvas = surface.canvas();
        canvas.clear(skia_safe::Color::TRANSPARENT);
        for iid in &ordered {
            if let Some(image) = renderer.export_node_image(iid, union, (union.width, union.height))
            {
                canvas.draw_image(&image, (0.0, 0.0), None);
            }
        }

        // RGBA readback — the system clipboard's image flavor carries
        // raw pixels; the platform side writes the encoded forms.
        let image = surface.image_snapshot();
        let (w, h) = (image.width(), image.height());
        let info = skia_safe::ImageInfo::new(
            (w, h),
            skia_safe::ColorType::RGBA8888,
            skia_safe::AlphaType::Unpremul,
            None,
        );
        let mut pixels = vec![0u8; w as usize * h as usize * 4];
        image
            .read_pixels(
                &info,
                &mut pixels,
                w as usize * 4,
                (0, 0),
                skia_safe::image::CachingHint::Allow,
            )
            .then_some((w as usize, h as usize, pixels))
    }

    /// Cmd+V: resolve the system clipboard through the paste sniffing
    /// order (io-external.md `IOX-2`, shipped subset): the native wire
    /// envelope (row 1) first — one history entry (IO-6), fresh ids
    /// (IO-3), pasted nodes selected — then an image flavor (row 4)
    /// as an image node. Rows 2/3/5 (peer-editor payloads, SVG source
    /// text, plain text) are named deferrals (`TODO.md`). A payload
    /// matching no row refuses as a no-op, silent to the document.
    fn paste_clipboard(&mut self) {
        if let Some(text) = self.clipboard.as_mut().and_then(|c| c.get_text().ok())
            && let Ok(ids) = crate::io::paste(&mut self.editor, &text, None)
        {
            self.editor.set_selection(ids);
            return;
        }
        let Some(img) = self.clipboard.as_mut().and_then(|c| c.get_image().ok()) else {
            return;
        };
        self.paste_image(&img);
    }

    /// Paste sniffing row 4: clipboard RGBA → PNG bytes → the engine
    /// image store (content-hash rid) → an image node at natural
    /// size, centered on the visible viewport (`IOX-5` keybinding
    /// placement), inserted by [`crate::io::insert_image`].
    fn paste_image(&mut self, img: &arboard::ImageData<'_>) {
        let (w, h) = (img.width as i32, img.height as i32);
        if w <= 0 || h <= 0 || img.bytes.len() < img.width * img.height * 4 {
            return;
        }
        // Encode the raw RGBA to PNG — the encoded form the image
        // store ingests (and the form a document-side resource store
        // would pack once it exists).
        let info = skia_safe::ImageInfo::new(
            (w, h),
            skia_safe::ColorType::RGBA8888,
            skia_safe::AlphaType::Unpremul,
            None,
        );
        let data = skia_safe::Data::new_copy(&img.bytes);
        let Some(png) = skia_safe::images::raster_from_data(&info, data, img.width * 4)
            .and_then(|raster| raster.encode(None, skia_safe::EncodedImageFormat::PNG, None))
        else {
            return;
        };
        let (_, rid, iw, ih, _) = self.app.add_image(png.as_bytes());
        if iw == 0 || ih == 0 {
            return;
        }
        // IOX-5: keybinding paste lands at the visible viewport
        // center (the hierarchy strip overlays the canvas on the
        // left — same inset rule as the camera fit).
        let center = {
            let cam = &self.app.renderer().camera;
            let size = *cam.get_size();
            let inset = super::HIER_WIDTH * self.dpr;
            let at =
                cam.screen_to_canvas_point([inset + (size.width - inset) * 0.5, size.height * 0.5]);
            (at[0], at[1])
        };
        match crate::io::insert_image(&mut self.editor, &rid, (iw as f32, ih as f32), center) {
            Ok(id) => self.editor.set_selection(vec![id]),
            Err(e) => eprintln!("grida_editor: paste image: {e}"),
        }
    }

    /// Cmd+D: duplicate the selection (keybindings.md; translate.md
    /// `TRL-4`). The offset is *measured* from the armed
    /// (origin, clone) pairs — a scene read, resolved before the
    /// mutable dispatch — so drag-clone followed by repeated
    /// duplicates step-and-repeats.
    fn duplicate_selection(&mut self) {
        if self.editor.selection().is_empty() {
            return;
        }
        let offset = {
            let scene = EngineScene {
                app: &self.app,
                doc: self.editor.document(),
            };
            self.interp.duplicate_offset(&self.editor, &scene)
        };
        self.interp.duplicate(&mut self.editor, offset);
    }

    /// Cmd+S: save the committed working copy as `.grida` (an
    /// in-flight HUD gesture is cancelled first — save writes
    /// committed state).
    fn save_document(&mut self) {
        self.cancel_hud_gesture();
        let path = self
            .doc_path
            .clone()
            .unwrap_or_else(|| std::path::PathBuf::from("untitled.grida"));
        match crate::io::save(&self.editor, &path) {
            Ok(()) => self.doc_path = Some(path),
            Err(e) => eprintln!("grida_editor: save: {e}"),
        }
    }

    // -- sync session (docs/wg/feat-crdt/sync.md) --------------------------------

    /// Drain the sync session (shell tick): local edits out, received
    /// commits in. Remote applications accrue damage like any other
    /// batch; the reflect point repaints them and pushes any ED-7
    /// selection prune down to the HUD mirror.
    fn drain_sync(&mut self) {
        if let Some(session) = self.session.as_mut() {
            session.drain(&mut self.editor);
        }
    }

    fn deselect(&mut self) {
        self.editor.set_selection(Vec::new());
        self.window.request_redraw();
    }

    /// Key routing (routing.md): capture layers first — the engine
    /// text session, then widget focus behind the `KEY-4` focus
    /// guard, then the active edit mode — with the binding table's
    /// chain dispatch at the bottom (keybindings.md). All key meaning
    /// below the capture layers flows through the table — no inline
    /// behavior (`SHELL-1`/`KEY-1`).
    /// Two distinct currencies, distinct types so they can't be
    /// confused: `key` is winit's composed `logical_key` (what the user
    /// typed — text entry, menu nav, focused-widget input), while `code`
    /// is the layout-base [`KeyCode`] the binding table is authored
    /// against, derived once at the event boundary from
    /// `key_without_modifiers`. Every shortcut path reads `code`;
    /// character input reads `key`/`text`. A composed glyph cannot reach
    /// a shortcut matcher because it is not a `KeyCode`.
    fn on_key_pressed(&mut self, key: &Key, code: Option<KeyCode>, text: Option<&str>) {
        // Capture: the engine-owned text session consumes keys and
        // printable input entirely (`ROUTE-4`).
        if self.app.text_edit_is_active() {
            self.text_edit_key(key, code, text);
            self.reconcile_text_session();
            return;
        }
        // The table (`KEY-1`/`KEY-3`) is authored against base,
        // layout-independent keys plus explicit modifier Reqs; `code` is
        // already that base key (see the boundary derivation), so it
        // resolves directly. Option+A composes 'å', Option+H is a dead
        // key, an AZERTY 'a' sits on the physical Q — all collapsed to
        // the base key before we get here.
        let binding = code.and_then(|c| keys::resolve(c, self.key_mods(), self.platform));
        // Focus-legal rows (`KEY-4`'s marked exceptions — the
        // primary-modifier command chords) dispatch before the
        // focused widget (`UI-3` command priority).
        if let Some(b) = binding
            && b.focus_legal
        {
            self.dispatch_chain(b);
            return;
        }
        // Widget focus is now egui's (`egui_wants_keyboard_input` gates
        // canvas keys upstream in `window_event`); the old UiLayer
        // focused-widget routing is gone with the framework.
        // Edit-mode key capture (routing.md capture layer 1): the
        // active vector mode re-resolves keys first.
        if matches!(self.mode, EditMode::Vector(_)) && self.on_vector_mode_key(code) {
            return;
        }
        if matches!(self.mode, EditMode::Gradient(_)) && self.on_gradient_mode_key(code) {
            return;
        }
        // Chain dispatch (routing.md): the chord's commands in
        // declared order, first consumer wins. An advertised chord
        // stops here even when every handler declines — the claims
        // suppression of `ROUTE-3`.
        if let Some(b) = binding {
            self.dispatch_chain(b);
        }
    }

    /// The physical modifier state, as the binding table reads it.
    fn key_mods(&self) -> keys::Mods {
        keys::Mods {
            shift: self.modifiers.shift_key(),
            alt: self.modifiers.alt_key(),
            ctrl: self.modifiers.control_key(),
            meta: self.modifiers.super_key(),
        }
    }

    /// Walk a binding's command chain (routing.md chain dispatch).
    /// `(hold)` rows activate their overlay instead; the release path
    /// in [`Self::on_key_released`] restores (`KEY-5`).
    fn dispatch_chain(&mut self, binding: &'static keys::Binding) {
        if binding.hold {
            // Key repeat re-fires the press; the overlay set is
            // idempotent.
            match binding.chain[0] {
                Command::HandHold => self.hold = Some(HoldTool::Hand),
                Command::ZoomHold => self.hold = Some(HoldTool::Zoom),
                _ => {}
            }
            return;
        }
        for cmd in binding.chain {
            if self.command(*cmd) {
                return;
            }
        }
    }

    /// Key releases: the momentary holds restore the prior state
    /// exactly (`KEY-5` — the overlay never touched the tool machine),
    /// and the pen key's keep-projecting configuration drops (VEC-5).
    fn on_key_released(&mut self, code: Option<KeyCode>) {
        // Base [`KeyCode`], like the press that armed the hold — a hold
        // released under Option/AltGr or on a non-US layout still
        // restores (`KEY-5`). `map_key_code` folds both space forms to
        // `KeyCode::Space`.
        match code {
            Some(KeyCode::Char('p')) => self.pen_key_held = false,
            Some(KeyCode::Char('z')) => {
                if self.hold == Some(HoldTool::Zoom) {
                    self.hold = None;
                }
            }
            Some(KeyCode::Space) => {
                if self.hold == Some(HoldTool::Hand) {
                    self.hold = None;
                }
            }
            _ => {}
        }
    }

    /// The hand overlay is live: momentary (Space) or sticky (H).
    fn hand_active(&self) -> bool {
        self.hand_sticky || self.hold == Some(HoldTool::Hand)
    }

    // -- context menu (crates/grida_editor/docs/menu.md) ----------------------

    /// A secondary press on the canvas: retarget (`MENU-5`), build the
    /// inventory over the current target, open at the point. The
    /// shell adds only the targeting context — the inventory and its
    /// enablement are [`crate::menu`]'s (`SHELL-3`).
    fn open_context_menu(&mut self, canvas_point: [f32; 2], ui_point: [f32; 2]) {
        // Chrome hidden (Mod+\): the context menu is chrome too — do not
        // open a menu that `build_inspector` would refuse to render.
        if !self.ui_visible {
            return;
        }
        let hit = {
            let scene = EngineScene {
                app: &self.app,
                doc: self.editor.document(),
            };
            use crate::hud::HudScene as _;
            scene.pick(canvas_point)
        };
        if let Some(selection) = crate::menu::retarget(self.editor.selection(), hit.as_ref()) {
            self.editor.set_selection(selection);
            self.overlay_damaged();
        }
        let menu = crate::menu::canvas_menu(self.editor.document(), self.editor.selection());
        // egui context menu: stash the inventory + anchor; `build_inspector`
        // renders it (native `egui::Popup`) and the shell dispatches the
        // chosen command (`MENU-1`).
        self.menu_open = Some((menu, egui::Pos2::new(ui_point[0], ui_point[1])));
        self.window.request_redraw();
    }

    // -- The command registry (keybindings.md `KEY-1`; routing.md) ---------

    /// Dispatch one registry command. Returns **consumed**; a
    /// declined command has made no state change (`ROUTE-2`).
    /// Rebuild the native application menu bar from current editor
    /// state (`menu.md`): enablement, paired-toggle direction, undo/redo
    /// availability, and text-mode gating are all resolved here, once,
    /// at build time — the same `MENU-2` discipline as the context menu.
    fn rebuild_menu_bar(&mut self) {
        let app_menu = crate::menu::application_menu(&crate::menu::AppMenuContext {
            doc: self.editor.document(),
            selection: self.editor.selection(),
            text_mode: matches!(self.mode, EditMode::Text { .. }),
            can_undo: self.editor.can_undo(),
            can_redo: self.editor.can_redo(),
            outline_mode: self.outline_mode,
        });
        let bar = crate::shell::menubar::MenuBar::build(&app_menu);
        bar.install();
        self.menu_bar = Some(bar);
        self.menu_selection = self.editor.selection().to_vec();
        self.menu_dirty = false;
    }

    fn command(&mut self, cmd: Command) -> bool {
        let consumed = self.dispatch(cmd);
        // Only a consumed command can move the state the menu bar
        // reflects (enablement, history, mode, toggle direction); a
        // decline (`ROUTE-2`) leaves it untouched, so mark the bar dirty
        // only then (`MENU-2`).
        if consumed {
            self.menu_dirty = true;
        }
        consumed
    }

    fn dispatch(&mut self, cmd: Command) -> bool {
        match cmd {
            Command::Undo => self.editor.undo(),
            Command::Redo => self.editor.redo(),
            Command::Cut => {
                if self.editor.selection().is_empty() {
                    return false;
                }
                self.copy_selection();
                self.delete_selection();
                true
            }
            Command::Copy => {
                if self.editor.selection().is_empty() {
                    return false;
                }
                self.copy_selection();
                true
            }
            Command::CopyAsPng => self.copy_selection_as_png(),
            Command::Paste => {
                self.paste_clipboard();
                true
            }
            Command::Duplicate => {
                if self.editor.selection().is_empty() {
                    return false;
                }
                self.duplicate_selection();
                true
            }
            Command::Save => {
                self.save_document();
                true
            }
            // The context menu's reference additions: single-target
            // clipboard affordances (`MENU-2`: the gates here are
            // exactly the menu's enablement predicates).
            Command::CopyName => {
                let [id] = self.editor.selection() else {
                    return false;
                };
                let Some(name) = self.editor.document().node_name(id) else {
                    return false;
                };
                self.set_clipboard_text(name)
            }
            Command::CopyId => {
                let [id] = self.editor.selection() else {
                    return false;
                };
                let id = id.clone();
                self.set_clipboard_text(id)
            }
            // Delete's alternative chain (routing.md): inside vector
            // edit the sub-selection delete consumes; outside (or on
            // an empty sub-selection) it declines and the node delete
            // runs.
            Command::DeleteSubSelection => {
                let consumed = if let EditMode::Vector(m) = &mut self.mode {
                    m.delete(&mut self.editor)
                } else {
                    false
                };
                if consumed {
                    self.overlay_damaged();
                }
                consumed
            }
            Command::DeleteSelection => {
                if self.editor.selection().is_empty() {
                    return false;
                }
                self.delete_selection();
                true
            }
            Command::SelectAll => {
                let all =
                    crate::traverse::select_all(self.editor.document(), self.editor.selection());
                if all.is_empty() {
                    return false;
                }
                self.editor.set_selection(all);
                true
            }
            Command::EscapeLadder => self.escape_ladder(),
            Command::EnterContentEdit => self.enter_command(),
            Command::SelectChildren => self.select_children_command(),
            Command::SelectParent => self.select_parent_command(),
            Command::NextSibling => self.sibling_step(true),
            Command::PrevSibling => self.sibling_step(false),
            // Translate nudge (snap.md's pipeline row): an exact
            // keyboard step — quantize-only, never geometry-snapped
            // (`SNAP-6`). Declines on empty selection so the chain
            // falls through to the camera pan (`NUDGE-5`).
            Command::NudgeSelection { dx, dy } => {
                let ids = self.editor.selection().to_vec();
                if ids.is_empty() {
                    return false;
                }
                self.interp.nudge(&mut self.editor, &ids, dx, dy);
                true
            }
            Command::PanCamera { dx, dy } => {
                // `NUDGE-5`: a fixed screen-space step — view state
                // only, no document mutation, no entry.
                self.run_command(ApplicationCommand::Pan {
                    tx: dx * self.dpr,
                    ty: dy * self.dpr,
                })
            }
            Command::ResizeNudge { dw, dh } => {
                let ids = self.editor.selection().to_vec();
                self.interp.resize_nudge(&mut self.editor, &ids, dw, dh)
            }
            Command::SetTool(tool) => {
                self.select_tool(tool);
                true
            }
            Command::PenTool => self.arm_pen(),
            Command::HandTool => {
                self.hand_sticky = true;
                true
            }
            // Hold rows never reach the registry dispatch — the chain
            // walk intercepts them (`KEY-5`).
            Command::HandHold | Command::ZoomHold => true,
            Command::BringToFront => self.reorder_z(crate::arrange::ZOrder::Front),
            Command::SendToBack => self.reorder_z(crate::arrange::ZOrder::Back),
            Command::BringForward => self.reorder_z(crate::arrange::ZOrder::Forward),
            Command::SendBackward => self.reorder_z(crate::arrange::ZOrder::Backward),
            // Flatten (Mod+E): the destructive multi-select combine —
            // one baked vector per selection partition
            // (flatten.md `FLAT-1`). Distinct from the mode-entry flatten
            // (double-click / Enter), which flattens one primitive to
            // enter vector edit.
            Command::Flatten => {
                if !matches!(self.mode, EditMode::None) {
                    return false;
                }
                let selection = self.editor.selection().to_vec();
                // Text members bake through the renderer's fonts (the
                // same primitive as Create Outlines); built up front so
                // the mutation pass owns `editor` alone.
                let mut outlines: std::collections::HashMap<
                    crate::document::Id,
                    grida::vectornetwork::VectorNetwork,
                > = std::collections::HashMap::new();
                for id in &selection {
                    if let Some(iid) = self.editor.document().internal_id(id)
                        && let Some(net) = self.app.renderer().outline_text_node(&iid)
                    {
                        outlines.insert(id.clone(), net);
                    }
                }
                // Pre-mint an id pool (one per partition ceiling) so the
                // minter does not borrow `editor` while
                // `flatten_selection` holds it mutably.
                let n = self.editor.document().partition_selection(&selection).len();
                let mut pool = (0..n)
                    .map(|_| self.tools.mint_id(&self.editor))
                    .collect::<Vec<_>>()
                    .into_iter();
                crate::mode::flatten_selection(
                    &mut self.editor,
                    &selection,
                    || pool.next().expect("one pre-minted id per partition"),
                    |id| outlines.get(id).cloned(),
                )
            }
            // Create Outlines: convert selected text to its glyph-outline
            // vector paths (create-outlines.md `OUTL-*`). The outlines are
            // built up front through the renderer's fonts (both `editor`
            // and `renderer` read immutably) so the mutation pass owns
            // `editor` alone.
            Command::CreateOutlines => {
                if !matches!(self.mode, EditMode::None) {
                    return false;
                }
                let selection = self.editor.selection().to_vec();
                let mut outlines: std::collections::HashMap<
                    crate::document::Id,
                    grida::vectornetwork::VectorNetwork,
                > = std::collections::HashMap::new();
                for id in &selection {
                    if let Some(iid) = self.editor.document().internal_id(id)
                        && let Some(net) = self.app.renderer().outline_text_node(&iid)
                    {
                        outlines.insert(id.clone(), net);
                    }
                }
                crate::mode::create_outlines(&mut self.editor, &selection, |id| {
                    outlines.get(id).cloned()
                })
            }
            Command::Align(op) => self.align_selection(op),
            Command::Distribute(op) => self.distribute_selection(op),
            Command::Group => self.group_selection(crate::grouping::WrapKind::Group),
            Command::GroupWithContainer => {
                self.group_selection(crate::grouping::WrapKind::Container)
            }
            Command::Ungroup => self.ungroup_selection(),
            Command::ToggleVisible => self.toggle_visible(),
            Command::Opacity(digit) => self.set_selection_opacity(digit),
            Command::ZoomIn => self.run_command(ApplicationCommand::ZoomIn),
            Command::ZoomOut => self.run_command(ApplicationCommand::ZoomOut),
            Command::Zoom100 => self.run_command(ApplicationCommand::ZoomTo100),
            Command::ZoomFit => {
                let ids = self.editor.document().children(None);
                self.fit_camera_to_visible(&ids)
            }
            Command::ZoomSelection => self.zoom_to_selection(),
            // View toggles (ruler.md / pixel-grid.md; web parity).
            // Per-instance view state — overlay damage only, never a
            // document frame.
            Command::ToggleRuler => {
                self.ruler = !self.ruler;
                self.hud.set_ruler(self.ruler);
                eprintln!(
                    "grida_editor: ruler: {}",
                    if self.ruler { "on" } else { "off" }
                );
                self.overlay_damaged();
                true
            }
            // Chrome visibility (keybindings.md, Mod+\): hide the whole
            // shell UI so the canvas stands alone. `build_inspector`
            // gates on `ui_visible`, so egui builds nothing and claims no
            // input; we also drop any open context menu.
            Command::ToggleUi => {
                self.ui_visible = !self.ui_visible;
                if !self.ui_visible {
                    self.menu_open = None;
                }
                // The ruler L rides the hierarchy strip's edge (`RUL-8`);
                // with the strip gone the corner moves to the window
                // edge, so re-push the HUD's origin mirror for its
                // hover-to-guide hit test.
                let ruler_origin = self.ruler_origin();
                self.hud.set_ruler_origin(ruler_origin);
                // Reclaim / release the right strip: the camera inset
                // now tracks `ui_visible`, so re-derive the viewport.
                let size = self.window.inner_size();
                self.apply_viewport(size.width, size.height);
                eprintln!(
                    "grida_editor: ui: {}",
                    if self.ui_visible { "on" } else { "off" }
                );
                self.window.request_redraw();
                true
            }
            Command::TogglePixelGrid => {
                self.pixelgrid = !self.pixelgrid;
                eprintln!(
                    "grida_editor: pixel grid: {}",
                    if self.pixelgrid { "on" } else { "off" }
                );
                self.overlay_damaged();
                true
            }
            // Outline / pixel-preview are engine render-policy changes:
            // unlike the ruler/grid overlays these repaint the scene
            // content, so they route through the config-invalidation
            // path (`apply_outline_policy` / `set_pixel_preview_scale`
            // + `mark_global(Config)`), never `overlay_damaged`.
            Command::ToggleOutlineMode => {
                self.outline_mode = !self.outline_mode;
                self.apply_outline_policy();
                true
            }
            Command::ToggleOutlineIgnoresClips => {
                self.outline_ignore_clips = !self.outline_ignore_clips;
                self.apply_outline_policy();
                true
            }
            Command::SetPixelPreview(scale) => {
                self.set_pixel_preview(scale);
                true
            }
            Command::CyclePixelPreview => {
                self.set_pixel_preview((self.pixel_preview + 1) % 3);
                true
            }
            // The snap toggles (snap.md; both on by default). Mod+'
            // rides Figma's pixel-grid-snap key; Mod+; sits next to
            // it for geometry.
            Command::ToggleSnapPixelGrid => {
                self.interp.snap.pixel_grid = !self.interp.snap.pixel_grid;
                eprintln!(
                    "grida_editor: snap to pixel grid: {}",
                    if self.interp.snap.pixel_grid {
                        "on"
                    } else {
                        "off"
                    }
                );
                true
            }
            Command::ToggleSnapGeometry => {
                self.interp.snap.geometry = !self.interp.snap.geometry;
                eprintln!(
                    "grida_editor: snap to geometry: {}",
                    if self.interp.snap.geometry {
                        "on"
                    } else {
                        "off"
                    }
                );
                true
            }
            Command::PrevScene => self.run_command(ApplicationCommand::PrevScene),
            Command::NextScene => self.run_command(ApplicationCommand::NextScene),
            // Reserved rows consume and do nothing — the chord is
            // owned so future meaning does not collide (the sheet's
            // "Reserved" section; K/Q per tool.md).
            Command::Reserved(_) => true,
        }
    }

    /// The escape ladder (routing.md ladder idiom — one rung per
    /// press): sticky hand → armed-unplaced pen → authoring tool →
    /// in-flight chrome gesture → deselect. (The vector mode's rungs
    /// live in its capture layer, MODE-10.)
    fn escape_ladder(&mut self) -> bool {
        if self.hand_sticky {
            self.hand_sticky = false;
            return true;
        }
        if self.pen_pending {
            // The armed-but-unplaced pen: disarm, nothing else (the
            // tool rung of the ladder).
            self.pen_pending = false;
            return true;
        }
        if let Some(out) = self.tools.escape(&mut self.editor) {
            self.process_tool(out);
            return true;
        }
        // HUD rung: abort an in-flight chrome gesture before touching
        // the selection.
        if self.cancel_hud_gesture() {
            return true;
        }
        self.deselect();
        true
    }

    /// Tool selection (the sheet's tool rows): disarms the pen and
    /// releases the sticky hand — the overlay never outlives an
    /// explicit tool choice.
    fn select_tool(&mut self, tool: Tool) {
        self.pen_pending = false;
        self.hand_sticky = false;
        self.tools.set_tool(tool);
        // The egui toolbar reads the active tool live each frame — no sync.
        self.update_cursor_icon();
        // Arming/disarming flips chrome dormancy: overlay damage, not
        // just a redraw.
        self.overlay_damaged();
    }

    /// The pen row (vector-edit.md entry): with a single vector
    /// selected, arm it inside that node's mode (primitives flatten
    /// first); with an empty selection, pen-from-scratch — the first
    /// canvas placement creates the node and enters the mode.
    fn arm_pen(&mut self) -> bool {
        if let [id] = self.editor.selection() {
            let id = id.clone();
            match dispatch_enter(&self.editor, &id) {
                EnterDispatch::Vector(_) => {
                    self.pen_key_held = true;
                    self.enter_vector_mode(id, VecTool::Pen);
                    true
                }
                EnterDispatch::FlattenThenVector(_) => {
                    if crate::mode::flatten_to_vector(&mut self.editor, &id) {
                        self.pen_key_held = true;
                        self.enter_vector_mode(id, VecTool::Pen);
                    }
                    true
                }
                _ => false,
            }
        } else if self.editor.selection().is_empty() {
            self.pen_key_held = true;
            self.pen_pending = true;
            true
        } else {
            false
        }
    }

    /// Enter's first chain member (edit-mode.md MODE-2, traversal.md
    /// TRAV-1): a single enterable node resolves through the dispatch
    /// table; everything else declines to select-children.
    fn enter_command(&mut self) -> bool {
        if !matches!(self.mode, EditMode::None) {
            return false;
        }
        let [id] = self.editor.selection() else {
            return false;
        };
        let id = id.clone();
        if matches!(
            dispatch_enter(&self.editor, &id),
            EnterDispatch::NotEnterable | EnterDispatch::ImagePaintSession(_)
        ) {
            return false;
        }
        self.enter_content_edit(id);
        true
    }

    /// Enter's descent (`TRAV-1`): replace the selection with the
    /// union of children. A childless selection is a consumed no-op —
    /// Enter never falls through to the host.
    fn select_children_command(&mut self) -> bool {
        if self.editor.selection().is_empty() {
            return false;
        }
        let union =
            crate::traverse::children_union(self.editor.document(), self.editor.selection());
        if !union.is_empty() {
            self.editor.set_selection(union);
            self.reveal_selection();
        }
        true
    }

    /// Shift+Enter's ascent (`TRAV-2`): union of parents, top-level
    /// members contributing themselves; an all-top-level selection
    /// changes nothing but stays owned.
    fn select_parent_command(&mut self) -> bool {
        match crate::traverse::parents_union(self.editor.document(), self.editor.selection()) {
            Some(parents) => {
                self.editor.set_selection(parents);
                self.reveal_selection();
                true
            }
            None => !self.editor.selection().is_empty(),
        }
    }

    /// Tab / Shift+Tab (`TRAV-4`): the anchor's next/previous sibling.
    fn sibling_step(&mut self, forward: bool) -> bool {
        let Some(next) =
            crate::traverse::sibling(self.editor.document(), self.editor.selection(), forward)
        else {
            return false;
        };
        self.editor.set_selection(vec![next]);
        self.reveal_selection();
        true
    }

    /// Traversal keeps its result visible (`TRAV-5`): when the new
    /// selection's world bounds escape the viewport, pan the camera
    /// the minimal distance to reveal them — no zoom change, no
    /// document mutation, no history entry.
    fn reveal_selection(&mut self) {
        let ids = self.editor.selection().to_vec();
        if ids.is_empty() {
            return;
        }
        let rects: Vec<math2::rect::Rectangle> = {
            let scene = EngineScene {
                app: &self.app,
                doc: self.editor.document(),
            };
            ids.iter().filter_map(|id| scene.world_bounds(id)).collect()
        };
        if rects.is_empty() {
            return;
        }
        let bounds = math2::rect::union(&rects);
        let cam = &self.app.renderer().camera;
        let size = *cam.get_size();
        let view_min = cam.screen_to_canvas_point([0.0, 0.0]);
        let view_max = cam.screen_to_canvas_point([size.width, size.height]);
        let zoom = cam.get_zoom();
        // Per-axis minimal pan; bounds larger than the viewport align
        // their near edge.
        let step = |lo: f32, hi: f32, blo: f32, bhi: f32| {
            if blo < lo {
                blo - lo
            } else if bhi > hi {
                (bhi - hi).min(blo - lo)
            } else {
                0.0
            }
        };
        let dx = step(view_min[0], view_max[0], bounds.x, bounds.x + bounds.width);
        let dy = step(view_min[1], view_max[1], bounds.y, bounds.y + bounds.height);
        if dx != 0.0 || dy != 0.0 {
            // The engine pan is authored in screen px (it divides by
            // zoom internally).
            self.run_command(ApplicationCommand::Pan {
                tx: dx * zoom,
                ty: dy * zoom,
            });
        }
    }

    /// The sheet's Arrange rows: z-order via the `Move` mutation
    /// (post-removal index, `DOC-5`), resolved by [`crate::arrange`].
    fn reorder_z(&mut self, op: crate::arrange::ZOrder) -> bool {
        let Some((ids, parent, index)) =
            crate::arrange::reorder(self.editor.document(), self.editor.selection(), op)
        else {
            return false;
        };
        self.editor
            .dispatch(
                vec![Mutation::Move { ids, parent, index }],
                Origin::Local,
                Recording::Record {
                    label: Some("reorder".into()),
                },
            )
            .is_ok()
    }

    /// Align rows (align.md): resolve the batch against the selection's
    /// world bounds (sourced from the engine geometry cache) and apply
    /// it as a single history entry (`ALIGN-7`). Declines silently when
    /// the resolver declines (all-in-flow / top-level single / already
    /// aligned).
    fn align_selection(&mut self, op: crate::align::Align) -> bool {
        let selection = self.editor.selection().to_vec();
        let batch = {
            let scene = EngineScene {
                app: &self.app,
                doc: self.editor.document(),
            };
            crate::align::align(
                self.editor.document(),
                &selection,
                |id| scene.world_bounds(id),
                op,
            )
        };
        self.apply_batch(batch, "align")
    }

    /// Distribute rows (align.md): same shape as [`Self::align_selection`].
    fn distribute_selection(&mut self, op: crate::align::Distribute) -> bool {
        let selection = self.editor.selection().to_vec();
        let batch = {
            let scene = EngineScene {
                app: &self.app,
                doc: self.editor.document(),
            };
            crate::align::distribute(
                self.editor.document(),
                &selection,
                |id| scene.world_bounds(id),
                op,
            )
        };
        self.apply_batch(batch, "distribute")
    }

    /// Apply a resolved resolver batch (align / distribute / group /
    /// ungroup) as one recorded history entry; `None` declines silently.
    fn apply_batch(&mut self, batch: Option<Vec<Mutation>>, label: &str) -> bool {
        let Some(batch) = batch else {
            return false;
        };
        self.editor
            .dispatch(
                batch,
                Origin::Local,
                Recording::Record {
                    label: Some(label.into()),
                },
            )
            .is_ok()
    }

    /// Group rows (grouping.md): wrap each selection partition in one new
    /// group / container (`GRP-1`). Pre-mint one wrapper id per partition
    /// (the flatten pattern — the minter can't reborrow `editor` while the
    /// resolver holds the document), resolve against the engine world
    /// bounds, apply as one entry, then retarget the selection to the new
    /// wrappers (`GRP-5`).
    fn group_selection(&mut self, kind: crate::grouping::WrapKind) -> bool {
        let selection = self.editor.selection().to_vec();
        let n = self.editor.document().partition_selection(&selection).len();
        let mut pool = (0..n)
            .map(|_| self.tools.mint_id(&self.editor))
            .collect::<Vec<_>>()
            .into_iter();
        // The minter records what it hands out so the retarget selects the
        // wrappers actually created (a skipped partition mints nothing).
        let mut minted: Vec<crate::document::Id> = Vec::new();
        let batch = {
            let scene = EngineScene {
                app: &self.app,
                doc: self.editor.document(),
            };
            crate::grouping::group(
                self.editor.document(),
                &selection,
                |id| scene.world_bounds(id),
                kind,
                || {
                    let id = pool.next().expect("one pre-minted id per partition");
                    minted.push(id.clone());
                    id
                },
            )
        };
        let label = match kind {
            crate::grouping::WrapKind::Group => "group",
            crate::grouping::WrapKind::Container => "group with container",
        };
        if self.apply_batch(batch, label) {
            self.editor.set_selection(minted);
            true
        } else {
            false
        }
    }

    /// Ungroup row (grouping.md `GRP-4`): dissolve every dissolvable member
    /// of the selection as one entry. The resolver is single-id; several
    /// groups compose safely only when processed in **descending** document
    /// index (an earlier, higher-index dissolve can't shift a later,
    /// lower-index one's target slot). A dissolvable nested under another
    /// selected dissolvable is skipped (that composition is deferred). The
    /// promoted children become the new selection (`GRP-5`).
    fn ungroup_selection(&mut self) -> bool {
        let selection = self.editor.selection().to_vec();
        let (batch, promoted) = {
            let doc = self.editor.document();
            let candidates: Vec<crate::document::Id> = selection
                .iter()
                .filter(|id| crate::grouping::ungroup(doc, id).is_some())
                .cloned()
                .collect();
            let cand_set: std::collections::HashSet<crate::document::Id> =
                candidates.iter().cloned().collect();
            // Drop candidates that sit under another candidate (nested).
            let mut dissolvable: Vec<crate::document::Id> = candidates
                .iter()
                .filter(|id| !doc.has_ancestor_in(id, &cand_set))
                .cloned()
                .collect();
            // Descending sibling index for index-safe batch composition.
            // `sort_by_cached_key` so the per-key `children` allocation
            // runs once per node, not on every comparison.
            dissolvable.sort_by_cached_key(|id| {
                let parent = doc.node_parent(id).flatten();
                let siblings = doc.children(parent.as_ref());
                std::cmp::Reverse(siblings.iter().position(|s| s == id).unwrap_or(0))
            });
            let mut batch: Vec<Mutation> = Vec::new();
            let mut promoted: Vec<crate::document::Id> = Vec::new();
            for g in &dissolvable {
                if let Some(muts) = crate::grouping::ungroup(doc, g) {
                    promoted.extend(doc.children(Some(g)));
                    batch.extend(muts);
                }
            }
            ((!batch.is_empty()).then_some(batch), promoted)
        };
        if self.apply_batch(batch, "ungroup") {
            self.editor.set_selection(promoted);
            true
        } else {
            false
        }
    }

    /// Mod+Shift+H: flip visibility on every selected member (the
    /// `active` flag — one batch, one entry).
    fn toggle_visible(&mut self) -> bool {
        let ids = self.editor.selection().to_vec();
        if ids.is_empty() {
            return false;
        }
        let batch: Vec<Mutation> = ids
            .iter()
            .filter_map(|id| {
                self.editor
                    .document()
                    .node_active(id)
                    .map(|active| Mutation::Patch {
                        id: id.clone(),
                        set: Box::new(PropPatch {
                            active: Some(!active),
                            ..Default::default()
                        }),
                    })
            })
            .collect();
        if batch.is_empty() {
            return false;
        }
        self.editor
            .dispatch(
                batch,
                Origin::Local,
                Recording::Record {
                    label: Some("toggle visible".into()),
                },
            )
            .is_ok()
    }

    /// Opacity digits (`KEY-6`): tenths, 0 = 100%, a double-tapped 0
    /// inside the multi-tap window = 0%.
    fn set_selection_opacity(&mut self, digit: u8) -> bool {
        let ids = self.editor.selection().to_vec();
        if ids.is_empty() {
            return false;
        }
        let now = self.now_ms();
        let value = self.opacity_taps.resolve(digit, now);
        let batch: Vec<Mutation> = ids
            .iter()
            .map(|id| Mutation::Patch {
                id: id.clone(),
                set: Box::new(PropPatch {
                    opacity: Some(value),
                    ..Default::default()
                }),
            })
            .collect();
        self.editor
            .dispatch(
                batch,
                Origin::Local,
                Recording::Record {
                    label: Some("opacity".into()),
                },
            )
            .is_ok()
    }

    /// Shift+2 — fit the camera to the selection (resolved
    /// editor-side; see [`Self::fit_camera_to_visible`]).
    fn zoom_to_selection(&mut self) -> bool {
        let ids = self.editor.selection().to_vec();
        self.fit_camera_to_visible(&ids)
    }

    /// Shift+1 / Shift+2 — fit the camera to the given nodes' union
    /// bounds. The engine has its own fit, but it centers on the full
    /// camera viewport; the left hierarchy strip *overlays* the
    /// canvas (`apply_viewport`), so the visible canvas rect is inset
    /// and the engine fit lands off-center under the strip. Resolved
    /// here instead: zoom the padded bounds into the visible rect,
    /// then center them there.
    fn fit_camera_to_visible(&mut self, ids: &[Id]) -> bool {
        let rects: Vec<math2::rect::Rectangle> = {
            let scene = EngineScene {
                app: &self.app,
                doc: self.editor.document(),
            };
            ids.iter().filter_map(|id| scene.world_bounds(id)).collect()
        };
        if rects.is_empty() {
            return false;
        }
        let bounds = math2::rect::union(&rects);
        let cam_size = *self.app.renderer().camera.get_size();
        // Visible canvas rect in camera screen px: the camera already
        // excludes the right properties strip; the hierarchy strip
        // covers `[0, HIER_WIDTH]` on the left.
        let inset = super::HIER_WIDTH * self.dpr;
        let vis_w = (cam_size.width - inset).max(1.0);
        let vis_h = cam_size.height;
        let pad = FIT_PADDING_PX * self.dpr;
        let fit_w = (vis_w - pad * 2.0).max(1.0);
        let fit_h = (vis_h - pad * 2.0).max(1.0);
        let zoom = (fit_w / bounds.width.max(1.0)).min(fit_h / bounds.height.max(1.0));
        if !zoom.is_finite() || zoom <= 0.0 {
            return false;
        }
        let cam = &mut self.app.renderer_mut().camera;
        cam.set_zoom(zoom);
        // Land the bounds center on the *visible* rect's center, not
        // the camera's: read back the world point under that screen
        // point post-zoom (set_zoom may clamp) and pan the difference.
        // Rotation-safe by construction.
        let at = cam.screen_to_canvas_point([inset + vis_w * 0.5, vis_h * 0.5]);
        cam.translate(
            bounds.x + bounds.width * 0.5 - at[0],
            bounds.y + bounds.height * 0.5 - at[1],
        );
        self.window.request_redraw();
        true
    }

    /// The visible canvas center in camera screen px (physical). The
    /// camera already excludes the right properties strip; the hierarchy
    /// strip covers `[0, HIER_WIDTH]` on the left, so the visible center
    /// sits at `inset + (width - inset)/2`. The one home for that inset
    /// rule (`fit_camera_to_visible` still inlines its own copy — it
    /// needs `inset`/`vis_w` for the fit ratio too — and can migrate
    /// here later).
    fn visible_center_screen(&self) -> [f32; 2] {
        let cam_size = *self.app.renderer().camera.get_size();
        let inset = super::HIER_WIDTH * self.dpr;
        let vis_w = (cam_size.width - inset).max(1.0);
        [inset + vis_w * 0.5, cam_size.height * 0.5]
    }

    /// Set the camera zoom to an absolute percentage, anchored at the
    /// visible canvas center — the view control's numeric field and
    /// 50/100/200 presets (direct camera UX, no registry command). `pct`
    /// is clamped to the control's 2–256% range; the target is
    /// dpr-scaled (the camera works in physical px).
    fn zoom_to_pct(&mut self, pct: f32) {
        let target = pct.clamp(2.0, 256.0) / 100.0 * self.dpr;
        let center = self.visible_center_screen();
        self.app.renderer_mut().camera.set_zoom_at(target, center);
        self.window.request_redraw();
    }

    /// Key routing while the gradient session is active (the session's
    /// rungs of the MODE-10 ladder): Escape exits, Delete/Backspace
    /// removes the selected stop (`GRAD-6`). Returns whether consumed —
    /// a declined Delete (no stop selected) falls through to the chain,
    /// so deleting the subject node ends the session via reconcile.
    fn on_gradient_mode_key(&mut self, code: Option<KeyCode>) -> bool {
        match code {
            Some(KeyCode::Escape) => {
                self.exit_active_mode();
                self.overlay_damaged();
                true
            }
            Some(KeyCode::Delete | KeyCode::Backspace) => {
                let removed = if let EditMode::Gradient(s) = &mut self.mode {
                    s.delete_selected(&mut self.editor)
                } else {
                    false
                };
                if removed {
                    self.overlay_damaged();
                }
                removed
            }
            _ => false,
        }
    }

    /// Key routing while the vector mode is active (`routing.md`
    /// capture; the mode's rungs of the MODE-10 ladder). Matches the
    /// layout-base [`KeyCode`] (the mode's letters are shortcuts, not
    /// text), so its tool keys survive Option-composition and non-US
    /// layouts like the sheet's do. Returns whether the key was consumed.
    fn on_vector_mode_key(&mut self, code: Option<KeyCode>) -> bool {
        match code {
            Some(KeyCode::Escape) => {
                let step = if let EditMode::Vector(m) = &mut self.mode {
                    m.escape(&mut self.editor)
                } else {
                    return false;
                };
                if step == EscapeStep::ExitRequested {
                    self.exit_active_mode();
                }
                self.overlay_damaged();
                true
            }
            // Delete is NOT captured here: it rides the table's
            // alternative chain [delete-sub-selection,
            // delete-selection] (routing.md) — the first member
            // resolves against this mode and declines on an empty
            // sub-selection.
            Some(
                dir @ (KeyCode::ArrowLeft
                | KeyCode::ArrowRight
                | KeyCode::ArrowUp
                | KeyCode::ArrowDown),
            ) => {
                let step = if self.modifiers.shift_key() {
                    10.0
                } else {
                    1.0
                };
                let (dx, dy) = match dir {
                    KeyCode::ArrowLeft => (-step, 0.0),
                    KeyCode::ArrowRight => (step, 0.0),
                    KeyCode::ArrowUp => (0.0, -step),
                    _ => (0.0, step),
                };
                let consumed = if let EditMode::Vector(m) = &mut self.mode {
                    m.nudge(&mut self.editor, dx, dy)
                } else {
                    false
                };
                if consumed {
                    self.overlay_damaged();
                }
                consumed
            }
            // The mode's legal tool set (MODE-8); everything else in the
            // tool vocabulary is refused — consumed, never a misbinding
            // outside the mode.
            Some(KeyCode::Char('v')) => {
                if let EditMode::Vector(m) = &mut self.mode {
                    m.set_tool(VecTool::Cursor);
                }
                self.overlay_damaged();
                true
            }
            Some(KeyCode::Char('p')) if !self.modifiers.shift_key() => {
                if let EditMode::Vector(m) = &mut self.mode {
                    m.set_tool(VecTool::Pen);
                }
                self.pen_key_held = true;
                self.overlay_damaged();
                true
            }
            Some(KeyCode::Char('r' | 'o' | 'y' | 'a' | 'f' | 't' | 'l' | 'k' | 'q')) => true,
            _ => false,
        }
    }

    /// Feed a key to the engine's text-edit session: KeyDown for
    /// navigation/deletion/shortcuts (including Escape — the engine
    /// exits internally and `reconcile_text_session` closes the
    /// editor's frame), TextInput for character insertion.
    fn text_edit_key(&mut self, key: &Key, code: Option<KeyCode>, text: Option<&str>) {
        let modifiers = self.build_modifiers();
        let shortcut = self.primary_held() || self.modifiers.alt_key();
        if let Some(key_name) = map_text_key(key, code, shortcut) {
            let response = self.dispatch_engine_text(SurfaceEvent::KeyDown {
                key: key_name,
                modifiers,
            });
            if response.needs_redraw {
                self.window.request_redraw();
            }
        }
        // Character insertion rides TextInput — the engine's KeyDown
        // path skips Insert actions to avoid double insertion.
        if self.app.text_edit_is_active()
            && !self.primary_held()
            && let Some(t) = text
            && !t.is_empty()
            && t.chars().all(|c| !c.is_control())
        {
            let response = self.dispatch_engine_text(SurfaceEvent::TextInput {
                text: t.to_string(),
            });
            if response.needs_redraw {
                self.window.request_redraw();
            }
        }
    }

    // -- UI-space helpers --------------------------------------------------

    /// Physical → logical (UI-space) point. The HUD works in logical px.
    fn to_ui_point(&self, physical: [f32; 2]) -> [f32; 2] {
        [physical[0] / self.dpr, physical[1] / self.dpr]
    }

    // -- tool machine (docs/wg/canvas/tool.md) ---------------------------------

    /// Reflect a tool outcome's shell follow-ups: selection adoption,
    /// text-session entry, toolbar/cursor chrome. The content changes
    /// themselves reach pixels through the damage ledger at the
    /// event-tail reflect (`FRAME-2`).
    fn process_tool(&mut self, out: ToolOutcome) {
        let effective = out.is_effective();
        if let Some(selection) = out.select {
            // The mirror push and panel syncs happen at the
            // event-tail reflect (HUD-3).
            self.editor.set_selection(selection);
        }
        if let Some(id) = out.enter_text_edit {
            // The engine session reads the renderer scene — reflect
            // the pending insert damage before entering so the node
            // exists there.
            self.reflect_frame();
            self.enter_text_session(id);
        }
        // The egui toolbar reads the active tool live each frame — no sync.
        self.update_cursor_icon();
        // An effective outcome can end the tool's pointer claim —
        // chrome dormancy may flip back: overlay damage.
        if effective {
            self.overlay_damaged();
        }
    }

    /// Enter the engine's text-edit session for a node; on failure the
    /// machine's frame is closed immediately (nothing dangles).
    fn enter_text_session(&mut self, id: Id) {
        let entered = self
            .editor
            .document()
            .internal_id(&id)
            .is_some_and(|iid| self.app.text_edit_enter_by_id(iid));
        if !entered {
            let out = self.tools.finish_text(&mut self.editor, None);
            self.process_tool(out);
        }
    }

    /// Post-event hook while a text session is pending: when the
    /// engine exited its session (Escape, click-away — its internal
    /// commit only touches the renderer scene), close the machine's
    /// gesture frame through the editor with the session's final text,
    /// so the document records exactly one entry (`TOOL-6`).
    fn reconcile_text_session(&mut self) {
        if !self.tools.in_text_session() || self.app.text_edit_is_active() {
            return;
        }
        let Some(id) = self.tools.text_session_node() else {
            return;
        };
        let renderer_text = self.editor.document().internal_id(&id).and_then(|iid| {
            self.app
                .renderer()
                .scene
                .as_ref()
                .and_then(|s| s.graph.get_node(&iid).ok())
                .and_then(crate::document::node_text)
        });
        // Only carry a patch when the session actually changed the
        // text (an unmodified edit records nothing).
        let final_text = match renderer_text {
            Some(text) if Some(&text) != self.editor.node_text(&id).as_ref() => Some(text),
            _ => None,
        };
        let out = self.tools.finish_text(&mut self.editor, final_text);
        self.process_tool(out);
    }

    /// Crosshair while an authoring tool is armed.
    fn update_cursor_icon(&mut self) {
        let icon = if matches!(self.tools.tool(), Tool::Cursor) {
            winit::window::CursorIcon::Default
        } else {
            winit::window::CursorIcon::Crosshair
        };
        self.window.set_cursor(winit::window::Cursor::Icon(icon));
    }

    /// Backspace/Delete: remove the selection's top-level subtrees as
    /// one recorded batch (one undo restores everything).
    fn delete_selection(&mut self) {
        let selection = self.editor.selection().to_vec();
        if selection.is_empty() {
            return;
        }
        let wanted: std::collections::HashSet<&Id> = selection.iter().collect();
        let mut tops: Vec<Id> = Vec::new();
        crate::io::collect_top_level(self.editor.document(), None, &wanted, &mut tops);
        let batch: Vec<Mutation> = tops.into_iter().map(|id| Mutation::Remove { id }).collect();
        if batch.is_empty() {
            return;
        }
        if self
            .editor
            .dispatch(batch, Origin::Local, Recording::Record { label: None })
            .is_ok()
        {
            self.editor.set_selection(Vec::new());
        }
    }

    /// Re-derive the canvas viewport (window minus the properties
    /// strip, `SHELL-2` spirit).
    ///
    /// The camera shrinks by the **right** strip only: the renderer
    /// paints content into `[0, camera_w]` with no viewport-origin
    /// API, so the right (properties) panel exactly covers the unpainted
    /// remainder, while the left hierarchy panel *overlays* the canvas
    /// (egui paints it opaque and gates its input). A true two-sided
    /// viewport inset needs engine support.
    pub(crate) fn apply_viewport(&mut self, width: u32, height: u32) {
        // The right inset is the egui properties panel's width — but only
        // while the chrome shows. Hidden (Mod+\), the canvas reclaims the
        // full width (the panel is not painted, so nothing covers it).
        let panel_physical = if self.ui_visible {
            super::PANEL_WIDTH * self.dpr
        } else {
            0.0
        };
        let content_w = (width as f32 - panel_physical).max(1.0);
        self.app.renderer_mut().camera.set_size(Size {
            width: content_w,
            height: height as f32,
        });
        self.app
            .renderer_mut()
            .update_viewport_size(content_w, height as f32);
        // An open context menu is anchored to the old viewport — dismiss
        // on resize (platform behavior).
        self.menu_open = None;
    }

    /// The measurement readout's subjects (measurement.md): A = the
    /// selection's union bounds, B = the hovered node's bounds — both
    /// canvas-space world AABBs read from the live scene.
    fn measurement_subjects(
        &self,
    ) -> (
        Option<math2::rect::Rectangle>,
        Option<math2::rect::Rectangle>,
    ) {
        let scene = EngineScene {
            app: &self.app,
            doc: self.editor.document(),
        };
        let worlds: Vec<math2::rect::Rectangle> = self
            .editor
            .selection()
            .iter()
            .filter_map(|id| scene.world_bounds(id))
            .collect();
        let a = (!worlds.is_empty()).then(|| math2::rect::union(&worlds));
        let b = self.hud.hover().and_then(|id| scene.world_bounds(id));
        (a, b)
    }

    /// Paint the transparency grid (transparency-grid.md): the alpha
    /// backdrop at the very bottom of the canvas stack. The renderer
    /// owns the surface clear, so painting *first* is impossible —
    /// instead this composites **after** the content pass with
    /// destination-over blends: the cells, then the base, each
    /// landing beneath whatever is already on the surface, so the
    /// final stack reads base → cells → solid background → content
    /// (`TG-2`). An opaque scene background covers everything —
    /// skipped outright.
    fn draw_transparency_grid(&mut self) {
        if let Some(scene) = self.app.renderer().scene.as_ref()
            && let Some(bg) = scene.background_color
            && bg.a == u8::MAX
        {
            return;
        }
        let view = self.app.view_matrix();
        let [[sx, _, tx], [_, sy, ty]] = view.matrix;
        let visible = self.app.renderer().camera.rect();
        let cells = crate::transparency_grid::plan(sx.abs(), &visible);

        // Filled cells (even index sums), canvas-anchored, projected
        // to device px.
        let step = cells.step;
        let mut path = skia_safe::PathBuilder::new();
        for i in cells.ix[0]..=cells.ix[1] {
            for j in cells.iy[0]..=cells.iy[1] {
                if (i + j).rem_euclid(2) != 0 {
                    continue;
                }
                let x0 = sx * (i as f32 * step) + tx;
                let y0 = sy * (j as f32 * step) + ty;
                let x1 = sx * ((i + 1) as f32 * step) + tx;
                let y1 = sy * ((j + 1) as f32 * step) + ty;
                path.add_rect(
                    skia_safe::Rect::new(x0.min(x1), y0.min(y1), x0.max(x1), y0.max(y1)),
                    None,
                    None,
                );
            }
        }
        let mut cell_paint = skia_safe::Paint::default();
        cell_paint.set_anti_alias(false);
        cell_paint.set_blend_mode(skia_safe::BlendMode::DstOver);
        // Low-alpha neutral cells over the base (web parity:
        // rgba(150, 150, 150, 0.15)).
        cell_paint.set_color(skia_safe::Color::from_argb(0x26, 150, 150, 150));

        // SAFETY: same discipline as `draw_ui` — the surface pointer
        // is minted at use and `self.app` is not moved while it lives.
        let surface = unsafe { &mut *self.app.surface_mut_ptr() };
        let canvas = surface.canvas();
        canvas.draw_path(&path.detach(), &cell_paint);
        // The base, beneath the cells: the blank-canvas white — also
        // what keeps the window surface opaque for background-less
        // documents (the GL config is transparency-capable).
        let mut base = skia_safe::Paint::default();
        base.set_blend_mode(skia_safe::BlendMode::DstOver);
        base.set_color(skia_safe::Color::WHITE);
        canvas.draw_paint(&base);
        if let Some(mut ctx) = surface.recording_context()
            && let Some(mut direct) = ctx.as_direct_context()
        {
            direct.flush_and_submit();
        }
    }

    /// Paint the pixel grid (pixel-grid.md): **above the content**,
    /// under every other overlay — the lattice must stay visible over
    /// filled artwork at high zoom (its whole purpose; the canvas
    /// stack is normative in transparency-grid.md). The plan is the
    /// pure module ([`crate::pixel_grid`], `PXG-2/4`); this glue
    /// strokes each planned integer coordinate as one device-pixel
    /// hairline in device space (`PXG-3` — the width never scales
    /// with the camera).
    fn draw_pixel_grid(&mut self) {
        let zoom = self.app.renderer().camera.get_zoom() / self.dpr.max(0.01);
        let visible = self.app.renderer().camera.rect();
        let Some(lines) = crate::pixel_grid::plan(self.pixelgrid, zoom, &visible) else {
            return;
        };
        let view = self.app.view_matrix();
        let [[sx, _, tx], [_, sy, ty]] = view.matrix;
        let (Some(&x0), Some(&x1), Some(&y0), Some(&y1)) = (
            lines.xs.first(),
            lines.xs.last(),
            lines.ys.first(),
            lines.ys.last(),
        ) else {
            return;
        };
        let mut paint = skia_safe::Paint::default();
        paint.set_anti_alias(false);
        paint.set_style(skia_safe::paint::Style::Stroke);
        paint.set_stroke_width(crate::pixel_grid::STROKE_DEVICE_PX);
        // Low-alpha neutral hairlines (web parity:
        // rgba(150, 150, 150, 0.15)).
        paint.set_color(skia_safe::Color::from_argb(0x26, 150, 150, 150));
        let mut path = skia_safe::PathBuilder::new();
        let (py0, py1) = (sy * y0 as f32 + ty, sy * y1 as f32 + ty);
        for x in &lines.xs {
            let px = sx * *x as f32 + tx;
            path.move_to((px, py0));
            path.line_to((px, py1));
        }
        let (px0, px1) = (sx * x0 as f32 + tx, sx * x1 as f32 + tx);
        for y in &lines.ys {
            let py = sy * *y as f32 + ty;
            path.move_to((px0, py));
            path.line_to((px1, py));
        }
        // SAFETY: same discipline as `draw_ui` — the surface pointer
        // is minted at use and `self.app` is not moved while it lives.
        let surface = unsafe { &mut *self.app.surface_mut_ptr() };
        let canvas = surface.canvas();
        canvas.draw_path(&path.detach(), &paint);
        if let Some(mut ctx) = surface.recording_context()
            && let Some(mut direct) = ctx.as_direct_context()
        {
            direct.flush_and_submit();
        }
    }

    /// Paint the HUD chrome (hud.md): build the draw list (which also
    /// refreshes the hit registry the next pointer-down consults) and
    /// project it onto the window canvas in logical space. Dormant
    /// while a non-cursor tool is armed or the engine text session is
    /// active — except the ruler's guides, which are document chrome,
    /// not interaction chrome: their only display coupling is the
    /// ruler toggle (`RUL-8`), so dormancy paints them alone.
    fn draw_hud(&mut self) {
        // The vector mode's chrome replaces the document chrome
        // wholesale while the mode is active (edit-mode.md: the mode
        // owns the canvas's meaning).
        let vector_draw = if let EditMode::Vector(m) = &self.mode {
            Some(
                self.editor
                    .node_vector_network(m.node())
                    .map(|net| {
                        // The node's *world* transform (whole ancestor
                        // chain), not its own local one — otherwise a
                        // nested node's chrome lands at its
                        // parent-relative offset from the canvas origin.
                        let frame = crate::vector::chrome::NodeFrame::from(
                            self.editor.node_world_transform(m.node()),
                        );
                        crate::vector::chrome::build(m, &net, frame)
                    })
                    .unwrap_or_default(),
            )
        } else {
            None
        };
        if let Some(draw) = vector_draw {
            if !draw.prims.is_empty() {
                self.paint_hud_list(&draw);
            }
            return;
        }
        // The gradient session's chrome likewise replaces the document
        // chrome while active (its handles + stop track own the canvas).
        if let EditMode::Gradient(s) = &self.mode {
            if let Some(draw) = s.chrome(&self.editor, self.logical_zoom())
                && !draw.prims.is_empty()
            {
                self.paint_hud_list(&draw);
            }
            return;
        }
        if self.app.text_edit_is_active() || self.tools.wants_pointer() {
            if self.ruler {
                let draw = crate::hud::HudDraw {
                    prims: self
                        .editor
                        .guides()
                        .iter()
                        .map(|g| HudPrim::Rule {
                            axis: g.axis,
                            offset: g.offset,
                            role: Role::Guide,
                        })
                        .collect(),
                };
                if !draw.prims.is_empty() {
                    self.paint_hud_list(&draw);
                }
            }
            return;
        }
        self.hud.set_view(self.logical_view());
        let mut draw = {
            let scene = EngineScene {
                app: &self.app,
                doc: self.editor.document(),
            };
            self.hud.chrome(&scene)
        };
        // Host-fed extras (hud.md "Not a snapping engine"): the
        // measurement readout rides the draw list, decorative only —
        // appended after the chrome build, so it can never register a
        // hit region (`MEAS-2`). Recomputed from (modifier, idle,
        // selection, hover) at every present; there is no retained
        // measurement state to dismiss (`MEAS-1`).
        let (a, b) = self.measurement_subjects();
        if let Some(m) =
            crate::measurement::readout(self.modifiers.alt_key(), !self.hud.gesture_active(), a, b)
        {
            draw.prims.extend(crate::measurement::chrome(&m));
        }
        // Snap-guide chrome (snap.md, `SNAP-8`): the same host-extras
        // channel — non-empty exactly while the active translate's
        // last preview geometry-snapped.
        draw.prims.extend(self.interp.snap_guides());
        // Drop-target overlay (translate.md, `TRL-8`): the prospective
        // parent's highlight while a translate would re-parent.
        draw.prims.extend(self.interp.drop_chrome());
        if draw.prims.is_empty() {
            return;
        }
        self.paint_hud_list(&draw);
    }

    /// Project and paint a HUD draw list in logical space (the shared
    /// tail of [`ShellApp::draw_hud`] and its dormant guide-only
    /// path).
    fn paint_hud_list(&mut self, draw: &crate::hud::HudDraw) {
        let view = self.logical_view();
        // SAFETY: same discipline as `draw_ui` — the surface pointer
        // is minted at use and `self.app` is not moved while it lives.
        let surface = unsafe { &mut *self.app.surface_mut_ptr() };
        let canvas = surface.canvas();
        canvas.save();
        canvas.scale((self.dpr, self.dpr));
        paint_hud(canvas, draw, &view, self.hud_font.as_ref());
        canvas.restore();
        if let Some(mut ctx) = surface.recording_context()
            && let Some(mut direct) = ctx.as_direct_context()
        {
            direct.flush_and_submit();
        }
    }

    /// Paint the ruler strips (ruler.md): shell-contained frame
    /// chrome — the L sits at the **canvas viewport's** top/left
    /// edges, between the panels, so strips and panels never overlap.
    /// Layout math is the pure module ([`crate::ruler`]: step
    /// selection `RUL-2`, merged ranges `RUL-3`, fade), operating in
    /// strip-local px; this glue projects it to the viewport and is
    /// the style sheet. Back to front per strip: background,
    /// separator, selection ranges, guide marks, ticks. The corner
    /// square at the L's origin stays blank (`RUL-1` spirit — neither
    /// axis owns it).
    fn draw_ruler(&mut self) {
        if !self.ruler {
            return;
        }
        let size = self.window.inner_size();
        let (win_w, win_h) = (size.width as f32 / self.dpr, size.height as f32 / self.dpr);
        let view = self.logical_view();
        let [[zx, _, tx], [_, zy, ty]] = view.matrix;

        // Selection ranges: each selected node's world bounds project
        // onto both axes (merging happens per strip below).
        let (ranges_x, ranges_y) = {
            let scene = EngineScene {
                app: &self.app,
                doc: self.editor.document(),
            };
            let mut xs: Vec<[f32; 2]> = Vec::new();
            let mut ys: Vec<[f32; 2]> = Vec::new();
            for id in self.editor.selection() {
                if let Some(b) = scene.world_bounds(id) {
                    xs.push([b.x, b.x + b.width]);
                    ys.push([b.y, b.y + b.height]);
                }
            }
            (xs, ys)
        };
        let guides = self.editor.guides().to_vec();
        let active_guide = self.hud.active_guide();
        let hover_guide = self.hud.hover_guide();

        const STRIP: f32 = crate::ruler::STRIP_PX;
        const TICK_H: f32 = 6.0;
        let color = skia_safe::Color::from_argb(0x80, 128, 128, 128);
        let bg = skia_safe::Color::from_argb(0xFF, 250, 250, 250);
        let accent = skia_safe::Color::from_argb(0xFF, 80, 200, 255);
        let accent_bg = skia_safe::Color::from_argb(0x40, 80, 200, 255);
        let mark = MEASUREMENT_ACCENT;
        let fill = |color: skia_safe::Color| {
            let mut p = skia_safe::Paint::default();
            p.set_anti_alias(true);
            p.set_color(color);
            p
        };
        let stroke = |color: skia_safe::Color, width: f32| {
            let mut p = fill(color);
            p.set_style(skia_safe::paint::Style::Stroke);
            p.set_stroke_width(width);
            p
        };

        // The L's geometry: corner at the canvas viewport's top-left
        // (right of the hierarchy strip), top strip ending at the
        // properties strip, left strip running the full height. The
        // ruler *content* additionally skips the corner band, so the
        // corner square stays blank.
        let origin = self.ruler_origin();
        let strips = [
            // (horizontal, along-axis span, cross-axis origin, zoom,
            //  offset, ranges)
            (
                true,
                [origin[0], win_w - self.ruler_right_inset()],
                origin[1],
                zx,
                tx,
                &ranges_x,
            ),
            (false, [origin[1], win_h], origin[0], zy, ty, &ranges_y),
        ];

        // SAFETY: same discipline as `draw_ui`.
        let surface = unsafe { &mut *self.app.surface_mut_ptr() };
        let canvas = surface.canvas();
        canvas.save();
        canvas.scale((self.dpr, self.dpr));

        // One pass per strip. `horizontal` = the top strip (reads x).
        for (horizontal, span, cross, zoom, offset, ranges) in strips {
            let font = self.hud_font.as_ref();
            // Content (ticks, marks, ranges) starts past the corner
            // band; positions below are absolute screen px.
            let content_from = span[0] + STRIP;
            let content_to = span[1];
            // A tick/mark/boundary at screen `pos` along the strip.
            let tick_line =
                |canvas: &skia_safe::Canvas, pos: f32, h: f32, paint: &skia_safe::Paint| {
                    if horizontal {
                        canvas.draw_line((pos, cross + STRIP - h), (pos, cross + STRIP), paint);
                    } else {
                        canvas.draw_line((cross + STRIP - h, pos), (cross + STRIP, pos), paint);
                    }
                };
            let tick_label =
                |canvas: &skia_safe::Canvas, pos: f32, text: &str, paint: &skia_safe::Paint| {
                    let Some(font) = font else { return };
                    if horizontal {
                        canvas.draw_str(text, (pos + 3.0, cross + STRIP - 9.0), font, paint);
                    } else {
                        canvas.save();
                        canvas.translate((cross + STRIP - 9.0, pos - 3.0));
                        canvas.rotate(-90.0, None);
                        canvas.draw_str(text, (0.0, 0.0), font, paint);
                        canvas.restore();
                    }
                };
            let clamp_span = |a: f32, b: f32| -> Option<(f32, f32)> {
                let (lo, hi) = (a.max(content_from), b.min(content_to));
                (hi > lo).then_some((lo, hi))
            };

            // Background + inner-edge separator, spanning the strip
            // (corner band included — content skips it below).
            let strip_rect = if horizontal {
                skia_safe::Rect::from_xywh(span[0], cross, span[1] - span[0], STRIP)
            } else {
                skia_safe::Rect::from_xywh(cross, span[0], STRIP, span[1] - span[0])
            };
            canvas.draw_rect(strip_rect, &fill(bg));
            let sep = cross + STRIP - 0.5;
            if horizontal {
                canvas.draw_line((span[0], sep), (span[1], sep), &stroke(color, 1.0));
            } else {
                canvas.draw_line((sep, span[0]), (sep, span[1]), &stroke(color, 1.0));
            }

            // Selection ranges (RUL-3): merged, filled, boundary-
            // labelled with the accent; boundaries become priority
            // points the regular ticks fade near.
            let mut priority: Vec<f32> = Vec::new();
            for range in crate::ruler::merge_ranges(ranges) {
                let (a, b) = (range[0] * zoom + offset, range[1] * zoom + offset);
                if let Some((lo, hi)) = clamp_span(a, b) {
                    let rect = if horizontal {
                        skia_safe::Rect::from_xywh(lo, cross, hi - lo, STRIP)
                    } else {
                        skia_safe::Rect::from_xywh(cross, lo, STRIP, hi - lo)
                    };
                    canvas.draw_rect(rect, &fill(accent_bg));
                }
                for (pos, unit) in [(a, range[0]), (b, range[1])] {
                    if !(content_from..=content_to).contains(&pos) {
                        continue;
                    }
                    tick_line(canvas, pos, STRIP, &stroke(accent, 1.0));
                    tick_label(canvas, pos, &crate::ruler::label(unit), &fill(accent));
                    priority.push(pos);
                }
            }

            // Guide marks (RUL-10): the strip that reads axis `a`
            // marks the axis-`a` guides — full-strip accent ticks,
            // labelled; the active one reads as selected (blue), the
            // hovered one strokes heavier.
            let mark_axis = if horizontal {
                math2::vector2::Axis::X
            } else {
                math2::vector2::Axis::Y
            };
            for (index, guide) in guides.iter().enumerate() {
                if guide.axis != mark_axis {
                    continue;
                }
                let pos = guide.offset * zoom + offset;
                if !(content_from..=content_to).contains(&pos) {
                    continue;
                }
                let emphasized = active_guide == Some(index) || hover_guide == Some(index);
                let mark_color = if active_guide == Some(index) {
                    HUD_ACCENT
                } else {
                    mark
                };
                let width = if emphasized { 2.0 } else { 1.0 };
                tick_line(canvas, pos, STRIP, &stroke(mark_color, width));
                tick_label(
                    canvas,
                    pos,
                    &crate::ruler::label(guide.offset),
                    &fill(mark_color),
                );
                priority.push(pos);
            }

            // Regular ticks (RUL-2), faded near priority points so
            // authored positions win the label space. The pure module
            // works in strip-local px; translate through the content
            // origin.
            let priority_local: Vec<f32> = priority.iter().map(|p| p - content_from).collect();
            for tick in crate::ruler::ticks(zoom, offset - content_from, content_to - content_from)
            {
                let alpha = crate::ruler::fade(tick.px, &priority_local);
                if alpha <= 0.0 {
                    continue;
                }
                let faded = color.with_a((alpha * color.a() as f32) as u8);
                let pos = tick.px + content_from;
                tick_line(canvas, pos, TICK_H, &stroke(faded, 1.0));
                tick_label(canvas, pos, &crate::ruler::label(tick.unit), &fill(faded));
            }
        }

        canvas.restore();
        if let Some(mut ctx) = surface.recording_context()
            && let Some(mut direct) = ctx.as_direct_context()
        {
            direct.flush_and_submit();
        }
    }

    /// The canvas viewport's top-left in logical px — the ruler L's
    /// corner: right of the hierarchy strip, at the window top. With
    /// the chrome hidden (Mod+\) the hierarchy strip is gone, so the
    /// corner sits at the window's left edge — otherwise the vertical
    /// strip would float in the vacated panel gap (an invalid state).
    pub(super) fn ruler_origin(&self) -> [f32; 2] {
        [self.ruler_left_inset(), 0.0]
    }

    /// The left inset the ruler L rides: the hierarchy strip's width
    /// while the chrome shows, zero once it is hidden.
    fn ruler_left_inset(&self) -> f32 {
        if self.ui_visible {
            super::HIER_WIDTH
        } else {
            0.0
        }
    }

    /// The right inset the top ruler strip ends short of: the
    /// properties strip's width while the chrome shows, zero once it is
    /// hidden.
    fn ruler_right_inset(&self) -> f32 {
        if self.ui_visible {
            super::PANEL_WIDTH
        } else {
            0.0
        }
    }

    /// Pan/zoom translation for scroll + pinch, cribbed from grida_dev.
    fn scroll_command(&self, event: &WindowEvent) -> ApplicationCommand {
        match event {
            WindowEvent::PinchGesture { delta, .. } => {
                let d = *delta as f32;
                if d.abs() < 0.002 {
                    ApplicationCommand::None
                } else {
                    ApplicationCommand::ZoomDelta { delta: d }
                }
            }
            WindowEvent::MouseWheel { delta, .. } => {
                if self.primary_held() {
                    let dy = match delta {
                        MouseScrollDelta::PixelDelta(d) => d.y as f32,
                        MouseScrollDelta::LineDelta(_, y) => *y * 16.0,
                    };
                    ApplicationCommand::ZoomDelta { delta: dy * 0.002 }
                } else {
                    match delta {
                        MouseScrollDelta::PixelDelta(delta) => ApplicationCommand::Pan {
                            tx: -(delta.x as f32),
                            ty: -(delta.y as f32),
                        },
                        _ => ApplicationCommand::None,
                    }
                }
            }
            _ => ApplicationCommand::None,
        }
    }
}

impl ApplicationHandler<HostEvent> for ShellApp {
    fn resumed(&mut self, _event_loop: &ActiveEventLoop) {
        // Build the native menu bar now that the app is active (macOS
        // wants a live NSApp before `init_for_nsapp`).
        self.rebuild_menu_bar();
        self.window.request_redraw();
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        _window_id: winit::window::WindowId,
        event: WindowEvent,
    ) {
        // ── egui spike: UI-first arbitration (new top tier) ──────────
        // Feed every event to egui, then gate the canvas: pointer /
        // keyboard input egui is using must not also reach the HUD,
        // tools, or the UiLayer strips. Non-input events (RedrawRequested,
        // Resized, ModifiersChanged, Close) always pass through — they
        // are not exclusive input.
        let resp = self.egui_winit.on_window_event(&self.window, &event);
        if resp.repaint {
            self.window.request_redraw();
        }
        let gated = match &event {
            WindowEvent::CursorMoved { .. }
            | WindowEvent::MouseInput { .. }
            | WindowEvent::MouseWheel { .. }
            | WindowEvent::PinchGesture { .. } => {
                resp.consumed || self.egui_ctx.egui_wants_pointer_input()
            }
            WindowEvent::KeyboardInput { .. } | WindowEvent::Ime(_) => {
                resp.consumed || self.egui_ctx.egui_wants_keyboard_input()
            }
            _ => false,
        };
        if !gated {
            self.handle_window_event(event_loop, event);
        }
        // The frame choke point (FRAME-2): whatever the event did to
        // the document, it reaches pixels here — and only here.
        if !self.exiting {
            self.reflect_frame();
        }
    }

    fn user_event(&mut self, _event_loop: &ActiveEventLoop, event: HostEvent) {
        if self.exiting {
            return;
        }
        self.handle_user_event(event);
        self.reflect_frame();
    }

    fn about_to_wait(&mut self, _event_loop: &ActiveEventLoop) {
        if self.exiting {
            return;
        }
        // Drain native menu-bar activations. muda posts to a global
        // channel; each id maps to exactly one registry command
        // (`MENU-1`), dispatched through the shell's one switch — the
        // same path a keybinding or context-menu choice takes.
        while let Ok(ev) = muda::MenuEvent::receiver().try_recv() {
            let cmd = self.menu_bar.as_ref().and_then(|b| b.command_for(&ev.id));
            if let Some(cmd) = cmd {
                self.command(cmd);
                self.reflect_frame();
            }
        }
        // Rebuild the bar when the state it mirrors changed — a command
        // ran (`menu_dirty`) or the selection moved (pointer/keyboard).
        // Cheap: the bar is small and never open at this point.
        if self.menu_dirty || self.editor.selection() != self.menu_selection.as_slice() {
            self.rebuild_menu_bar();
        }
    }
}

impl ShellApp {
    /// egui spike present step (plan §5): run the immediate-mode UI,
    /// paint its meshes on the shared GL context, then reset Ganesh's
    /// cached GL state so the next frame's Skia ops start clean.
    fn paint_egui(&mut self) {
        use glow::HasContext as _;

        let raw = self.egui_winit.take_egui_input(&self.window);
        // Clone the Arc-backed context so the build closure can borrow
        // `&mut self` — the handle we `run`/`tessellate` on is separate
        // from `self.egui_ctx`.
        let ctx = self.egui_ctx.clone();
        // egui 0.35: `run_ui` hands the closure a root `&mut Ui` (was
        // `run` → `&Context` pre-0.31); panels nest into that Ui.
        let full = ctx.run_ui(raw, |ui| self.build_inspector(ui));
        self.egui_winit
            .handle_platform_output(&self.window, full.platform_output);
        let prims = ctx.tessellate(full.shapes, full.pixels_per_point);
        let (w, h): (u32, u32) = self.window.inner_size().into();
        // Bind the window's default framebuffer (fbo 0, confirmed in
        // window.rs) — the same target Skia drew into — so egui
        // composites on top of the frame rather than into the void.
        unsafe {
            self.egui_painter
                .gl()
                .bind_framebuffer(glow::FRAMEBUFFER, None);
        }
        self.egui_painter.paint_and_update_textures(
            [w, h],
            full.pixels_per_point,
            &prims,
            &full.textures_delta,
        );
        // The Skia↔raw-GL reset dance: egui just issued raw GL, so
        // Ganesh's cached state is stale. Force a full re-sync before
        // the next frame's `surface.canvas().clear()`. If this proves
        // insufficient (flicker/corruption), that is the signal to move
        // to a Skia-native egui painter (plan Option B).
        {
            // SAFETY: same discipline as `draw_ui`.
            let surface = unsafe { &mut *self.app.surface_mut_ptr() };
            if let Some(mut rec) = surface.recording_context()
                && let Some(mut direct) = rec.as_direct_context()
            {
                direct.reset(None);
            }
        }
        // egui asked to animate (cursor blink, etc.) — schedule a frame.
        if full
            .viewport_output
            .get(&egui::ViewportId::ROOT)
            .is_some_and(|v| v.repaint_delay.is_zero())
        {
            self.window.request_redraw();
        }
    }

    /// The egui-rendered inspector — delegates to the real properties
    /// panel (`egui_panels`), which reads editor queries and writes
    /// through `bind::apply`, exactly like the `UiLayer` panel it
    /// replaces. Disjoint field borrows keep the borrow checker happy.
    fn build_inspector(&mut self, ui: &mut egui::Ui) {
        // Chrome visibility (Mod+\): the egui panels hide with the rest
        // of the shell UI. Building nothing means egui claims no area,
        // so `egui_wants_pointer_input` is false and the canvas stands
        // alone — same contract the old UiLayer paint gate had.
        if !self.ui_visible {
            return;
        }
        self.egui_panels.hierarchy(ui, &mut self.editor);
        // The active gradient session's address, so the panel reflects
        // the open Edit toggle and shows its stop list (`PSES-1`).
        let active_session = if let EditMode::Gradient(s) = &self.mode {
            Some((s.node().clone(), s.target(), s.index()))
        } else {
            None
        };
        let view = super::egui_panels::ViewState {
            zoom_pct: (self.logical_zoom() * 100.0).round() as i32,
            outline_mode: self.outline_mode,
            outline_ignore_clips: self.outline_ignore_clips,
            pixel_preview: self.pixel_preview,
            pixelgrid: self.pixelgrid,
            ruler: self.ruler,
        };
        let (session_request, view_action) = self.egui_panels.properties(
            ui,
            &mut self.editor,
            self.last_frame_ms,
            active_session,
            view,
        );
        match view_action {
            Some(super::egui_panels::ViewAction::Command(cmd)) => {
                self.command(cmd);
            }
            Some(super::egui_panels::ViewAction::ZoomToPct(pct)) => {
                self.zoom_to_pct(pct);
            }
            None => {}
        }
        // Drain the panel's Edit-toggle after the frame (the panel holds
        // no EditMode): a request for the active paint exits, otherwise
        // enters (MODE-1).
        if let Some(req) = session_request {
            let editing = matches!(
                &self.mode,
                EditMode::Gradient(s) if s.edits(&req.node, req.target, req.index)
            );
            if editing {
                self.exit_active_mode();
            } else {
                self.enter_paint_session(req.node, req.target, req.index);
            }
        }
        let pen_active = self.pen_pending || matches!(self.mode, EditMode::Vector(_));
        if let Some(cmd) = super::egui_panels::toolbar(ui, self.tools.tool(), pen_active) {
            self.command(cmd);
        }
        // Context menu (egui): take it out so the render can borrow
        // `self`; put it back only while it stays open. A chosen command
        // dispatches through the one registry switch (`MENU-1`).
        if let Some((menu, pos)) = self.menu_open.take() {
            match super::egui_panels::context_menu(ui, &menu, pos) {
                super::egui_panels::ContextMenuResult::Open => {
                    self.menu_open = Some((menu, pos));
                }
                super::egui_panels::ContextMenuResult::Close => {}
                super::egui_panels::ContextMenuResult::Chosen(cmd) => {
                    self.command(cmd);
                }
            }
        }
    }

    fn handle_window_event(&mut self, event_loop: &ActiveEventLoop, event: WindowEvent) {
        if let WindowEvent::RedrawRequested = &event {
            // ── The present: a FULL recomposition, every time (hud.md
            // "Compositing rule"). The GL surface is double-buffered:
            // the back buffer holds the frame from TWO presents ago,
            // so partial redraws ("only the panel changed") are
            // unsound — they alternate stale buffers into view (zombie
            // panels / chrome flickering with the pointer). Every
            // present therefore rebuilds base ⊕ chrome ⊕ panels.
            //
            // Defense-in-depth: damage is normally drained at the
            // event tail before a redraw is ever delivered; reflect
            // again so a paint can never present a stale mirror.
            self.reflect_frame();
            // egui spike: time the whole present for the perf A/B.
            let egui_frame_start = std::time::Instant::now();
            // 0. Clear to transparent — the true bottom of the stack.
            //    The blit below composites an alpha snapshot with
            //    source-over: without this, regions the content
            //    leaves transparent would keep the buffer from two
            //    presents ago instead of falling through to the
            //    transparency grid (step 4).
            {
                // SAFETY: same discipline as `draw_ui`.
                let surface = unsafe { &mut *self.app.surface_mut_ptr() };
                surface.canvas().clear(skia_safe::Color::TRANSPARENT);
            }
            // 1. Base restore — cheap full-surface blit of the
            //    engine's content cache (captured mid-flush, before
            //    any shell overlay, so it is content-only and covers
            //    the panel strip too). Never wrong: a pending content
            //    frame repaints fully over it in step 2.
            let restored = self.app.renderer_mut().blit_content_cache();
            // 2. Content — flush the pending frame if any (document
            //    damage, camera). NOTE: never *queue* here; with no
            //    frame pending the engine's `queue()` fires the host
            //    redraw callback, which requests another redraw — a
            //    permanent repaint loop.
            self.app.redraw_requested();
            // 3. Fallback — no cache (startup, cache-skipping zoom
            //    strategies): guarantee the base with one synchronous
            //    plan-path frame (no FrameCounter, no callback, no
            //    loop). Idempotent when step 2 already painted.
            if !restored {
                let renderer = self.app.renderer_mut();
                let rect = renderer.camera.rect();
                let zoom = renderer.camera.get_zoom();
                let change = renderer.camera.change_kind();
                let plan = renderer.build_frame_plan(rect, zoom, true, change);
                renderer.camera.consume_change();
                renderer.flush_with_plan(plan);
            }
            // 4. Transparency grid: destination-over — lands beneath
            //    the content and its background, the bottom of the
            //    canvas stack (transparency-grid.md).
            self.draw_transparency_grid();
            // 5. Pixel grid: above the content, under every other
            //    overlay (pixel-grid.md; the stack is normative in
            //    transparency-grid.md).
            self.draw_pixel_grid();
            // 6. HUD chrome above content, beneath the panels (hud.md).
            self.draw_hud();
            // 7. Ruler strips at the canvas viewport's edges (ruler.md).
            self.draw_ruler();
            // 8. egui chrome (properties/hierarchy/toolbar/menu) —
            //    topmost, on the shared GL context.
            self.paint_egui();
            if let Err(e) = self.gl_surface.swap_buffers(&self.gl_context) {
                eprintln!("error swapping buffers: {e:?}");
            }
            self.last_frame_ms = egui_frame_start.elapsed().as_secs_f32() * 1000.0;
        }

        if let WindowEvent::CloseRequested = &event {
            self.exiting = true;
            event_loop.exit();
            return;
        }
        if self.exiting {
            return;
        }

        match &event {
            WindowEvent::Resized(size) => {
                self.gl_surface.resize(
                    &self.gl_context,
                    NonZeroU32::new(size.width).unwrap_or(unsafe { NonZeroU32::new_unchecked(1) }),
                    NonZeroU32::new(size.height).unwrap_or(unsafe { NonZeroU32::new_unchecked(1) }),
                );
                self.app.resize(size.width, size.height);
                // Re-derive canvas viewport (minus panel) + UI viewport.
                self.apply_viewport(size.width, size.height);
            }
            WindowEvent::ModifiersChanged(modifiers) => {
                let was_alt = self.modifiers.alt_key();
                self.modifiers = modifiers.state();
                // Live modifier reconfiguration mid-gesture (SURF-4):
                // the HUD re-derives its active preview.
                if !self.app.text_edit_is_active() {
                    self.dispatch_hud(HudEvent::ModifiersChanged {
                        modifiers: self.hud_modifiers(),
                    });
                }
                // The measurement readout keys on this modifier
                // (`MEAS-1`): appearing and dismissing are overlay
                // damage, within the same dispatched event.
                if self.modifiers.alt_key() != was_alt {
                    self.overlay_damaged();
                }
            }
            WindowEvent::CursorMoved { position, .. } => {
                let screen_point = [position.x as f32, position.y as f32];
                self.app.set_cursor_position(screen_point);
                // Text session: the engine owns the pointer (caret
                // drag inside, exit on outside click) — reconciled
                // after every event.
                if self.app.text_edit_is_active() {
                    let canvas_point = self
                        .app
                        .renderer()
                        .camera
                        .screen_to_canvas_point(screen_point);
                    let response = self.dispatch_engine_text(SurfaceEvent::PointerMove {
                        canvas_point,
                        screen_point,
                    });
                    self.reconcile_text_session();
                    if response.needs_redraw {
                        self.window.request_redraw();
                    }
                    return;
                }
                // Middle-drag pan in flight: the engine surface owns
                // the camera gesture.
                if self.pan_active {
                    let canvas_point = self
                        .app
                        .renderer()
                        .camera
                        .screen_to_canvas_point(screen_point);
                    let response = self.app.handle_surface_event(SurfaceEvent::PointerMove {
                        canvas_point,
                        screen_point,
                    });
                    if response.needs_redraw {
                        self.window.request_redraw();
                    }
                    return;
                }
                // (egui claims pointer input over its panels upstream in
                // `window_event`; anything reaching here is canvas-bound.)
                // Edit-mode rung (edit-mode.md capture): an active
                // vector mode owns content input above the tools.
                if matches!(self.mode, EditMode::Vector(_)) {
                    let mods = self.vec_mods();
                    let zoom = self.logical_zoom();
                    let canvas_point = self
                        .app
                        .renderer()
                        .camera
                        .screen_to_canvas_point(screen_point);
                    let logical = self.to_ui_point(screen_point);
                    if let EditMode::Vector(m) = &mut self.mode {
                        m.pointer_move(&mut self.editor, canvas_point, logical, zoom, mods);
                    }
                    self.overlay_damaged();
                    return;
                }
                // The gradient paint session owns content input likewise
                // (MODE-1: above the tools and the HUD).
                if matches!(self.mode, EditMode::Gradient(_)) {
                    let zoom = self.logical_zoom();
                    let canvas_point = self
                        .app
                        .renderer()
                        .camera
                        .screen_to_canvas_point(screen_point);
                    if let EditMode::Gradient(s) = &mut self.mode {
                        s.pointer_move(&mut self.editor, canvas_point, zoom);
                    }
                    self.overlay_damaged();
                    return;
                }
                // Tool rung (SURF-1): an armed tool owns content input.
                if self.tools.wants_pointer() {
                    let canvas_point = self
                        .app
                        .renderer()
                        .camera
                        .screen_to_canvas_point(screen_point);
                    let out = self
                        .tools
                        .pointer_move(&mut self.editor, canvas_point, screen_point);
                    self.process_tool(out);
                    return;
                }
                // Content rung: the HUD machine (hud.md), in logical
                // screen space.
                self.dispatch_hud(HudEvent::PointerMove {
                    screen: self.to_ui_point(screen_point),
                });
            }
            WindowEvent::MouseInput { state, button, .. } => {
                let pointer_button = match button {
                    MouseButton::Left => PointerButton::Primary,
                    MouseButton::Right => PointerButton::Secondary,
                    MouseButton::Middle => PointerButton::Middle,
                    _ => PointerButton::Primary,
                };
                let screen_point = self.app.input_cursor();
                let modifiers = self.build_modifiers();
                let canvas_point = self
                    .app
                    .renderer()
                    .camera
                    .screen_to_canvas_point(screen_point);
                // Text session: the engine routes clicks (inside =
                // caret, outside = exit-commit) — reconciled after.
                if self.app.text_edit_is_active() {
                    let surface_event = match state {
                        ElementState::Pressed => SurfaceEvent::PointerDown {
                            canvas_point,
                            screen_point,
                            button: pointer_button,
                            modifiers,
                        },
                        ElementState::Released => SurfaceEvent::PointerUp {
                            canvas_point,
                            screen_point,
                            button: pointer_button,
                            modifiers,
                        },
                    };
                    let response = self.dispatch_engine_text(surface_event);
                    self.reconcile_text_session();
                    if response.needs_redraw {
                        self.window.request_redraw();
                    }
                    return;
                }
                // Middle button: camera pan via the engine surface
                // (view state, not content — the HUD never sees it).
                if matches!(pointer_button, PointerButton::Middle) {
                    let surface_event = match state {
                        ElementState::Pressed => {
                            self.pan_active = true;
                            SurfaceEvent::PointerDown {
                                canvas_point,
                                screen_point,
                                button: pointer_button,
                                modifiers,
                            }
                        }
                        ElementState::Released => {
                            self.pan_active = false;
                            SurfaceEvent::PointerUp {
                                canvas_point,
                                screen_point,
                                button: pointer_button,
                                modifiers,
                            }
                        }
                    };
                    let response = self.app.handle_surface_event(surface_event);
                    if response.needs_redraw {
                        self.window.request_redraw();
                    }
                    return;
                }
                // The hand overlay (Space hold / sticky H): the
                // primary button pans exactly like the middle button —
                // masqueraded as a middle press so the engine surface
                // owns the camera gesture. The tool machine never sees
                // it (`KEY-5`'s restore is trivial: nothing switched).
                if matches!(pointer_button, PointerButton::Primary)
                    && (self.hand_active() || self.hold_pan)
                {
                    let surface_event = match state {
                        ElementState::Pressed => {
                            self.pan_active = true;
                            self.hold_pan = true;
                            SurfaceEvent::PointerDown {
                                canvas_point,
                                screen_point,
                                button: PointerButton::Middle,
                                modifiers,
                            }
                        }
                        ElementState::Released => {
                            self.pan_active = false;
                            self.hold_pan = false;
                            SurfaceEvent::PointerUp {
                                canvas_point,
                                screen_point,
                                button: PointerButton::Middle,
                                modifiers,
                            }
                        }
                    };
                    let response = self.app.handle_surface_event(surface_event);
                    if response.needs_redraw {
                        self.window.request_redraw();
                    }
                    return;
                }
                // The zoom overlay (Z hold): click steps in, Alt+click
                // steps out — camera view state only.
                if matches!(pointer_button, PointerButton::Primary)
                    && self.hold == Some(HoldTool::Zoom)
                {
                    if matches!(state, ElementState::Pressed) {
                        self.run_command(if self.modifiers.alt_key() {
                            ApplicationCommand::ZoomOut
                        } else {
                            ApplicationCommand::ZoomIn
                        });
                    }
                    return;
                }
                // (egui claims pointer input over its panels upstream in
                // `window_event`; anything reaching here is canvas-bound.)
                // `ui_point` (logical px) still anchors a context-menu open.
                let ui_point = self.to_ui_point(screen_point);
                // The pointer's command surface (menu.md): a
                // secondary press on the canvas opens the menu —
                // retarget first (`MENU-5`), then the inventory over
                // the target. Secondary never reaches the tool/HUD
                // rungs; in-mode menus are deferred (a secondary
                // press inside vector edit is swallowed, named in
                // the spec's deferral note).
                if matches!(pointer_button, PointerButton::Secondary) {
                    if matches!(state, ElementState::Pressed)
                        && matches!(self.mode, EditMode::None)
                        && !self.tools.pointer_busy()
                        && !self.hud.gesture_active()
                    {
                        self.open_context_menu(canvas_point, ui_point);
                    }
                    return;
                }
                // Pen-from-scratch: the first placement creates a
                // one-vertex vector at the click and enters its mode
                // projecting from it (`vector-edit.md` entry; VEC-2's
                // fresh path if authoring ends degenerate).
                if self.pen_pending && matches!(state, ElementState::Pressed) {
                    self.pen_pending = false;
                    let entry_depth = self.editor.history_len();
                    let id = self.tools.mint_id(&self.editor);
                    let created = self.editor.dispatch(
                        vec![Mutation::Insert {
                            parent: None,
                            index: self.editor.children(None).len(),
                            fragment: Box::new(crate::tool::vector_fragment(
                                id.clone(),
                                "Vector",
                                canvas_point,
                                crate::document::polyline_network(&[(0.0, 0.0)]),
                            )),
                        }],
                        Origin::Local,
                        Recording::Record {
                            label: Some("vector.pen".to_string()),
                        },
                    );
                    if created.is_ok() {
                        self.exit_active_mode();
                        if let Some(mode) =
                            VectorMode::enter_created(&self.editor, id, entry_depth, 0)
                        {
                            self.mode = EditMode::Vector(Box::new(mode));
                        }
                        self.overlay_damaged();
                    }
                    return;
                }
                // Edit-mode rung (edit-mode.md capture): the active
                // vector mode owns content clicks.
                if matches!(self.mode, EditMode::Vector(_)) {
                    let mods = self.vec_mods();
                    let zoom = self.logical_zoom();
                    let now = self.now_ms();
                    let logical = self.to_ui_point(screen_point);
                    let mut exit_requested = false;
                    if let EditMode::Vector(m) = &mut self.mode {
                        match state {
                            ElementState::Pressed => {
                                let out = m.pointer_down(
                                    &mut self.editor,
                                    canvas_point,
                                    logical,
                                    zoom,
                                    now,
                                    mods,
                                );
                                exit_requested = out.exit_requested;
                            }
                            ElementState::Released => {
                                m.pointer_up(&mut self.editor, canvas_point);
                            }
                        }
                    }
                    if exit_requested {
                        // Double-click on empty canvas: the enter
                        // idiom's inverse (VEC-13).
                        self.exit_active_mode();
                    }
                    self.overlay_damaged();
                    return;
                }
                // The gradient paint session owns content clicks likewise
                // (MODE-1). It has no canvas exit — a gradient is
                // control-only (GRAD-8); Escape and the panel toggle end
                // it.
                if matches!(self.mode, EditMode::Gradient(_)) {
                    let zoom = self.logical_zoom();
                    let now = self.now_ms();
                    let screen = self.to_ui_point(screen_point);
                    let mut exit = false;
                    if let EditMode::Gradient(s) = &mut self.mode {
                        match state {
                            ElementState::Pressed => {
                                exit = s
                                    .pointer_down(&mut self.editor, canvas_point, screen, zoom, now)
                                    .exit_requested;
                            }
                            ElementState::Released => {
                                s.pointer_up(&mut self.editor, canvas_point, zoom);
                            }
                        }
                    }
                    // Double-click on empty canvas exits, like Escape.
                    if exit {
                        self.exit_active_mode();
                    }
                    self.overlay_damaged();
                    return;
                }
                // Tool rung (SURF-1): an armed tool owns content input.
                if self.tools.wants_pointer() {
                    let out = match state {
                        ElementState::Pressed => {
                            self.tools
                                .pointer_down(&mut self.editor, canvas_point, screen_point)
                        }
                        ElementState::Released => {
                            self.tools.pointer_up(&mut self.editor, canvas_point)
                        }
                    };
                    self.process_tool(out);
                    return;
                }
                // Content rung: the HUD machine (hud.md). Intents come
                // back and the interpreter commits them; the dblclick
                // enter-content-edit intent opens the engine's text
                // session through [`ShellApp::enter_content_edit`].
                let hud_modifiers = self.hud_modifiers();
                let hud_event = match state {
                    ElementState::Pressed => HudEvent::PointerDown {
                        screen: ui_point,
                        button: hud_button(pointer_button),
                        modifiers: hud_modifiers,
                    },
                    ElementState::Released => HudEvent::PointerUp {
                        screen: ui_point,
                        button: hud_button(pointer_button),
                        modifiers: hud_modifiers,
                    },
                };
                self.dispatch_hud(hud_event);
            }
            WindowEvent::KeyboardInput {
                event:
                    key_event @ KeyEvent {
                        state: ElementState::Pressed,
                        ..
                    },
                ..
            } => {
                let key = key_event.logical_key.clone();
                // The shortcut currency, derived once: the layout-base
                // key (`key_without_modifiers` — Option+A is 'å' in
                // `logical_key`) folded to the table's [`KeyCode`].
                let code = map_key_code(&key_event.key_without_modifiers());
                let text = key_event.text.as_ref().map(|t| t.to_string());
                self.on_key_pressed(&key, code, text.as_deref());
            }
            WindowEvent::KeyboardInput {
                event:
                    key_event @ KeyEvent {
                        state: ElementState::Released,
                        ..
                    },
                ..
            } => {
                let code = map_key_code(&key_event.key_without_modifiers());
                self.on_key_released(code);
            }
            _ => {
                // Open-menu modality: scroll and pinch are swallowed
                // (the camera must not move under an anchored menu).
                if self.menu_open.is_some()
                    && matches!(
                        &event,
                        WindowEvent::MouseWheel { .. } | WindowEvent::PinchGesture { .. }
                    )
                {
                    return;
                }
                // Wheel over an egui panel is claimed upstream in
                // `window_event`; anything here pans/zooms the camera.
                let cmd = self.scroll_command(&event);
                if !matches!(cmd, ApplicationCommand::None) {
                    self.run_command(cmd);
                }
            }
        }
    }

    fn handle_user_event(&mut self, event: HostEvent) {
        match event {
            HostEvent::Tick => {
                self.app.tick_with_current_time();
                self.drain_sync();
            }
            HostEvent::RedrawRequest => self.window.request_redraw(),
            HostEvent::ImageLoaded(_) | HostEvent::FontLoaded(_) => {
                self.app.notify_resource_loaded();
            }
            // The shell owns document loading (lifecycle per shell.md);
            // scene pushes through the host-event channel are ignored.
            HostEvent::LoadScene(_) => {}
        }
    }
}

/// Map a winit logical key onto the binding table's [`KeyCode`]
/// vocabulary (characters canonicalized via
/// [`keys::canonical_char`]).
fn map_key_code(key: &Key) -> Option<KeyCode> {
    match key {
        Key::Character(c) => {
            let mut chars = c.chars();
            let ch = chars.next()?;
            if chars.next().is_some() {
                return None;
            }
            if ch == ' ' {
                return Some(KeyCode::Space);
            }
            Some(KeyCode::Char(keys::canonical_char(ch)))
        }
        Key::Named(named) => Some(match named {
            NamedKey::ArrowLeft => KeyCode::ArrowLeft,
            NamedKey::ArrowRight => KeyCode::ArrowRight,
            NamedKey::ArrowUp => KeyCode::ArrowUp,
            NamedKey::ArrowDown => KeyCode::ArrowDown,
            NamedKey::Escape => KeyCode::Escape,
            NamedKey::Enter => KeyCode::Enter,
            NamedKey::Tab => KeyCode::Tab,
            NamedKey::Space => KeyCode::Space,
            NamedKey::Backspace => KeyCode::Backspace,
            NamedKey::Delete => KeyCode::Delete,
            NamedKey::PageUp => KeyCode::PageUp,
            NamedKey::PageDown => KeyCode::PageDown,
            _ => return None,
        }),
        _ => None,
    }
}

/// Map an engine pointer button to the HUD's.
fn hud_button(button: PointerButton) -> crate::hud::PointerButton {
    match button {
        PointerButton::Primary => crate::hud::PointerButton::Primary,
        PointerButton::Secondary => crate::hud::PointerButton::Secondary,
        PointerButton::Middle => crate::hud::PointerButton::Middle,
    }
}

/// Chrome accent (selection blue) in ARGB.
const HUD_ACCENT: skia_safe::Color = skia_safe::Color::new(0xFF_0D_7D_FF);

/// Measurement + snap-guide accent in ARGB — the web workbench's red
/// (`WorkbenchColors.red`, #f44336, the token both overlays use
/// there), so the readouts read apart from selection chrome.
const MEASUREMENT_ACCENT: skia_safe::Color = skia_safe::Color::new(0xFF_F4_43_36);

/// Readout (measurement + snap) hairline width, logical px — the web
/// HUD's `DEFAULT_LINE_WIDTH` (0.5 CSS px; one device px on 2×
/// displays).
const READOUT_STROKE: f32 = 0.5;

/// Snap-point crosshair box size, logical px (the web HUD's
/// `CROSSHAIR_SIZE`) — screen-fixed, centered on the hit point.
const CROSSHAIR_SIZE: f32 = 4.0;

/// Zoom-to-fit margin around the fitted bounds, logical px per side
/// (screen-fixed, so the breathing room is the same at every zoom).
const FIT_PADDING_PX: f32 = 64.0;

/// Project the HUD draw list (canvas-space geometry) through the view
/// transform and paint it in logical screen space. The HUD ships
/// geometry and roles; this is the shell's entire "style sheet".
fn paint_hud(
    canvas: &skia_safe::Canvas,
    draw: &crate::hud::HudDraw,
    view: &AffineTransform,
    font: Option<&skia_safe::Font>,
) {
    let project = |p: [f32; 2]| -> skia_safe::Point {
        let s = math2::vector2::transform(p, view);
        skia_safe::Point::new(s[0], s[1])
    };
    let stroke = |color: skia_safe::Color, width: f32| {
        let mut paint = skia_safe::Paint::default();
        paint.set_anti_alias(true);
        paint.set_style(skia_safe::paint::Style::Stroke);
        paint.set_stroke_width(width);
        paint.set_color(color);
        paint
    };
    let fill = |color: skia_safe::Color| {
        let mut paint = skia_safe::Paint::default();
        paint.set_anti_alias(true);
        paint.set_color(color);
        paint
    };

    let role_color = |role: &Role| match role {
        Role::Hover => HUD_ACCENT.with_a(0x99),
        // Vector edit-mode chrome: idle/selected at the accent, the
        // rest translucent (hover parity with Role::Hover).
        Role::VectorHover | Role::VectorPreview | Role::VectorTangent => HUD_ACCENT.with_a(0x99),
        // Persistent guides share the readout red (the web paints its
        // guide hairlines and strip marks with the same token); the
        // actively-edited guide reads as selected — the accent blue.
        Role::Measurement | Role::Snap | Role::Guide | Role::GuideHover => MEASUREMENT_ACCENT,
        Role::GuideActive => HUD_ACCENT,
        _ => HUD_ACCENT,
    };

    for prim in &draw.prims {
        match prim {
            HudPrim::Outline { corners, role } => {
                let mut path = skia_safe::PathBuilder::new();
                path.move_to(project(corners[0]));
                for c in &corners[1..] {
                    path.line_to(project(*c));
                }
                path.close();
                let width = match role {
                    Role::Measurement | Role::Snap => READOUT_STROKE,
                    // The drop-target highlight strokes heavier than
                    // selection chrome (web DROPZONE_BORDER_WIDTH
                    // parity) so the prospective parent reads through
                    // the drag.
                    Role::DropTarget => 2.0,
                    _ => 1.0,
                };
                canvas.draw_path(&path.detach(), &stroke(role_color(role), width));
            }
            HudPrim::Knob { anchor, size } => {
                let c = project(*anchor);
                let half = size * 0.5;
                let rect = skia_safe::Rect::from_xywh(c.x - half, c.y - half, *size, *size);
                canvas.draw_rect(rect, &fill(skia_safe::Color::WHITE));
                canvas.draw_rect(rect, &stroke(HUD_ACCENT, 1.0));
            }
            HudPrim::Region { rect, .. } => {
                let a = project([rect.x, rect.y]);
                let b = project([rect.x + rect.width, rect.y + rect.height]);
                let screen = skia_safe::Rect::new(a.x, a.y, b.x, b.y);
                canvas.draw_rect(screen, &fill(HUD_ACCENT.with_a(0x14)));
                canvas.draw_rect(screen, &stroke(HUD_ACCENT.with_a(0x80), 1.0));
            }
            HudPrim::Pill { anchor, text, role } => {
                let Some(font) = font else { continue };
                let a = project(*anchor);
                let text_paint = fill(skia_safe::Color::WHITE);
                let (width, _) = font.measure_str(text, Some(&text_paint));
                let (pad_x, height) = (6.0, 16.0);
                // The size badge hangs below its anchor; measurement
                // labels center on their line midpoint.
                let top = match role {
                    // Vertically centered on the anchor: the measurement
                    // readout and the gradient offset badge (which floats
                    // beside its chip).
                    Role::Measurement | Role::GradientBadge => a.y - height * 0.5,
                    _ => a.y + 6.0,
                };
                let rect = skia_safe::Rect::from_xywh(
                    a.x - width * 0.5 - pad_x,
                    top,
                    width + pad_x * 2.0,
                    height,
                );
                canvas.draw_round_rect(rect, 3.0, 3.0, &fill(role_color(role)));
                canvas.draw_str(
                    text,
                    skia_safe::Point::new(a.x - width * 0.5, top + height - 4.5),
                    font,
                    &text_paint,
                );
            }
            HudPrim::Line { a, b, dashed, role } => {
                let width = match role {
                    Role::Measurement | Role::Snap => READOUT_STROKE,
                    _ => 1.0,
                };
                let mut paint = stroke(role_color(role), width);
                if *dashed {
                    // The web hud's auxiliary dash: 4 on, 3 off,
                    // screen px.
                    paint.set_path_effect(skia_safe::PathEffect::dash(&[4.0, 3.0], 0.0));
                }
                canvas.draw_line(project(*a), project(*b), &paint);
            }
            HudPrim::Point { anchor, role } => {
                // The web HUD's snap-point marker: an "X" of two
                // diagonals over a screen-fixed box, stroked at the
                // readout hairline width, crossing exactly on the
                // projected point.
                let c = project(*anchor);
                let half = CROSSHAIR_SIZE * 0.5;
                let paint = stroke(role_color(role), READOUT_STROKE);
                canvas.draw_line((c.x - half, c.y - half), (c.x + half, c.y + half), &paint);
                canvas.draw_line((c.x + half, c.y - half), (c.x - half, c.y + half), &paint);
            }
            HudPrim::Curve {
                a,
                b,
                ta,
                tb,
                dashed,
                role,
            } => {
                let p0 = project(*a);
                let p3 = project(*b);
                let p1 = project([a[0] + ta[0], a[1] + ta[1]]);
                let p2 = project([b[0] + tb[0], b[1] + tb[1]]);
                let mut path = skia_safe::PathBuilder::new();
                path.move_to(p0);
                path.cubic_to(p1, p2, p3);
                let mut paint = stroke(role_color(role), 1.0);
                if *dashed {
                    paint.set_path_effect(skia_safe::PathEffect::dash(&[4.0, 3.0], 0.0));
                }
                canvas.draw_path(&path.detach(), &paint);
            }
            HudPrim::Dot { anchor, role } => {
                // Screen-fixed dot: vertex and knob chrome. Selected
                // fills the accent; everything else fills white with
                // the role's stroke.
                let c = project(*anchor);
                let radius = 3.0;
                match role {
                    Role::VectorSelected => {
                        canvas.draw_circle(c, radius, &fill(HUD_ACCENT));
                        canvas.draw_circle(c, radius, &stroke(skia_safe::Color::WHITE, 1.0));
                    }
                    _ => {
                        canvas.draw_circle(c, radius, &fill(skia_safe::Color::WHITE));
                        canvas.draw_circle(c, radius, &stroke(role_color(role), 1.0));
                    }
                }
            }
            HudPrim::GradientHandle { anchor, active } => {
                // The gradient frame handle: a screen-fixed white circle,
                // ringed in the accent while hovered/dragged.
                let c = project(*anchor);
                let radius = gradient_layout::HANDLE_RADIUS;
                canvas.draw_circle(c, radius, &fill(skia_safe::Color::WHITE));
                let (ring, width) = if *active {
                    (HUD_ACCENT, 2.0)
                } else {
                    (skia_safe::Color::from_argb(0xff, 0xc8, 0xc8, 0xc8), 1.0)
                };
                canvas.draw_circle(c, radius, &stroke(ring, width));
            }
            HudPrim::GradientChip {
                anchor,
                color,
                toward,
                selected,
                preview,
            } => {
                // A color-stop chip: a rounded square filled with the
                // stop's color, rotated so an edge faces the track, with
                // a caret pointing back at the track point `toward`.
                let c = project(*anchor);
                let t = project(*toward);
                // Unit direction from the chip toward its caret target;
                // degenerate (chip == target) falls back to straight down.
                let dir = math2::vector2::normalize([t.x - c.x, t.y - c.y]);
                let (ux, uy) = if dir == [0.0, 0.0] {
                    (0.0, 1.0)
                } else {
                    (dir[0], dir[1])
                };
                let half = gradient_layout::CHIP * 0.5;
                let alpha = if *preview { 0x99 } else { color[3] };
                let fillc = skia_safe::Color::from_argb(alpha, color[0], color[1], color[2]);
                let (ring, ring_w) = if *selected {
                    (HUD_ACCENT, 2.0)
                } else if *preview {
                    (skia_safe::Color::from_argb(0x99, 0xff, 0xff, 0xff), 1.5)
                } else {
                    (skia_safe::Color::from_argb(0xff, 0xd0, 0xd0, 0xd0), 1.5)
                };
                canvas.save();
                canvas.translate((c.x, c.y));
                canvas.rotate(uy.atan2(ux).to_degrees(), None);
                let rect = skia_safe::Rect::from_xywh(-half, -half, half * 2.0, half * 2.0);
                canvas.draw_round_rect(rect, 3.0, 3.0, &fill(fillc));
                canvas.draw_round_rect(rect, 3.0, 3.0, &stroke(ring, ring_w));
                canvas.restore();
                // The caret: a small triangle just past the edge facing
                // `toward`, pointing at it (the track point off a straight
                // axis; the gradient center on the sweep ring).
                let (px, py) = (-uy, ux);
                let (ctip, chalf) = (gradient_layout::CARET_TIP, gradient_layout::CARET_HALF);
                let tip = (c.x + ux * (half + ctip), c.y + uy * (half + ctip));
                let b1 = (c.x + ux * half + px * chalf, c.y + uy * half + py * chalf);
                let b2 = (c.x + ux * half - px * chalf, c.y + uy * half - py * chalf);
                let mut tri = skia_safe::PathBuilder::new();
                tri.move_to(tip);
                tri.line_to(b1);
                tri.line_to(b2);
                tri.close();
                canvas.draw_path(&tri.detach(), &fill(ring));
            }
            HudPrim::Rule { axis, offset, role } => {
                // Full-length hairline at a canvas offset: project the
                // offset, span the current clip (the logical viewport).
                // Hovered/active guides stroke heavier (the web's
                // affordance).
                let clip = canvas
                    .local_clip_bounds()
                    .unwrap_or_else(|| skia_safe::Rect::from_xywh(-1e5, -1e5, 2e5, 2e5));
                let width = match role {
                    Role::GuideHover | Role::GuideActive => 2.0,
                    Role::Measurement | Role::Snap => READOUT_STROKE,
                    _ => 1.0,
                };
                let paint = stroke(role_color(role), width);
                match axis {
                    math2::vector2::Axis::X => {
                        let x = project([*offset, 0.0]).x;
                        canvas.draw_line((x, clip.top), (x, clip.bottom), &paint);
                    }
                    math2::vector2::Axis::Y => {
                        let y = project([0.0, *offset]).y;
                        canvas.draw_line((clip.left, y), (clip.right, y), &paint);
                    }
                }
            }
        }
    }
}

/// Map a winit logical key to the engine [`KeyName`] for the
/// text-edit session. `shortcut` = a shortcut modifier is held, so a
/// character key maps to [`KeyName::Letter`] (the form
/// `KeyAction::from_key` matches shortcuts against) instead of a
/// literal character insertion.
fn map_text_key(key: &Key, code: Option<KeyCode>, shortcut: bool) -> Option<KeyName> {
    match key {
        Key::Named(NamedKey::ArrowLeft) => Some(KeyName::ArrowLeft),
        Key::Named(NamedKey::ArrowRight) => Some(KeyName::ArrowRight),
        Key::Named(NamedKey::ArrowUp) => Some(KeyName::ArrowUp),
        Key::Named(NamedKey::ArrowDown) => Some(KeyName::ArrowDown),
        Key::Named(NamedKey::Home) => Some(KeyName::Home),
        Key::Named(NamedKey::End) => Some(KeyName::End),
        Key::Named(NamedKey::PageUp) => Some(KeyName::PageUp),
        Key::Named(NamedKey::PageDown) => Some(KeyName::PageDown),
        Key::Named(NamedKey::Backspace) => Some(KeyName::Backspace),
        Key::Named(NamedKey::Delete) => Some(KeyName::Delete),
        Key::Named(NamedKey::Enter) => Some(KeyName::Enter),
        Key::Named(NamedKey::Tab) => Some(KeyName::Tab),
        Key::Named(NamedKey::Space) => Some(KeyName::Space),
        Key::Named(NamedKey::Escape) => Some(KeyName::Escape),
        // A shortcut letter resolves against the layout-base key
        // (`KEY-3`, `code`), not the composed glyph — Option+letter must
        // not reach the engine's shortcut path as a foreign character.
        // Plain typing rides the composed key (and TextInput/`text`).
        Key::Character(_) if shortcut => match code {
            Some(KeyCode::Char(base)) => Some(KeyName::Letter(base)),
            _ => None,
        },
        Key::Character(c) => Some(KeyName::Character(c.to_string())),
        _ => None,
    }
}
