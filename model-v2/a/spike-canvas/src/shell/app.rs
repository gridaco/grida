//! The app loop: window events → interaction FSM → lab ops → resolve →
//! paint. The document is the ONLY mutable truth; undo is a snapshot
//! stack of it; every mutation goes through `anchor_lab::ops` and lands
//! in the gesture log as a header diff (writes) + typed errors.

use std::num::NonZeroU32;

use anchor_engine::journal::Journal;
use anchor_engine::query::Query;
use anchor_lab::model::{Document, NodeId};
use anchor_lab::ops::{self, Axis, Op, ResizeDrag};
use anchor_lab::resolve::Resolved;
use glutin::prelude::GlSurface;
use winit::application::ApplicationHandler;
use winit::event::{ElementState, MouseButton, MouseScrollDelta, WindowEvent};
use winit::event_loop::ActiveEventLoop;
use winit::keyboard::{Key, ModifiersState, NamedKey};

use super::window::WindowInit;
use crate::camera::Camera;
use crate::interaction::{
    box_center_screen, diff_header, dist, handle_at, parent_point, resize_anchors, screen_angle,
    Drag, Fsm, Gesture, LogEntry, DRAG_THRESHOLD,
};
use crate::paint::paint_ctx;
use crate::shell::hud::{self, HandleKind};
use crate::{resolve_and_build_doc, scene};
use anchor_engine::paint::PaintCtx;

pub struct App {
    // document + editor state
    pub doc: Document,
    pub artboard: NodeId,
    pub selection: Option<NodeId>,
    pub hover: Option<NodeId>,
    pub undo: Vec<Document>,
    pub redo: Vec<Document>,
    pub log: Vec<LogEntry>,
    /// The session op-log (ENG-5.1) — every gesture recorded as typed ops for
    /// replay. Records only; undo remains the snapshot stacks above (ENG-5.5).
    pub journal: Journal,

    // interaction
    pub fsm: Fsm,
    pub gesture: Option<Gesture>,
    pub space_held: bool,
    pub cursor: (f32, f32),
    pub modifiers: ModifiersState,

    // view
    pub camera: Camera,
    pub ctx: PaintCtx,
    pub dpr: f32,
    pub last_frame_ms: f32,
    /// Per-stage frame breakdown (ms): [resolve+list, scene, flush, egui, gpu, swap].
    /// `gpu` is a `glFinish` — the REAL GPU work (blocks until done), so `swap`
    /// after it is pure vsync idle, not work. This separates "the display is
    /// pacing us" (fine) from "we are slow" (a problem) — the distinction my
    /// headless probes and the raw swap-wall both hid.
    pub bd: [f32; 6],
    frame_count: u64,
    /// One-time diagnostic: every frame appended to `/tmp/anchor-spike-frames.log`
    /// (truncated per run), flushed each frame so a kill preserves it. Captures
    /// the inter-frame GAP (true fps, incl. time spent outside draw) during a
    /// real pan — the signal idle capture can't see. NOT the dev-iteration
    /// method; a human-in-the-loop bridge to show the symptom once.
    /// Opt-in via `ANCHOR_FRAMELOG=1` — off by default so its per-frame file
    /// I/O never sits in the latency path during normal use.
    want_framelog: bool,
    frame_log: Option<std::io::BufWriter<std::fs::File>>,
    frame_clock: std::time::Instant,
    /// Previous frame's resolved tier and the count of nodes that changed
    /// against it (ENG-2.2 damage) — shown in the panel; not yet used to
    /// scope repaint (OS-2a).
    last_resolved: Option<Resolved>,
    pub last_damage: usize,

    // panels (egui overlay on the shared GL context)
    egui_ctx: egui::Context,
    egui_winit: egui_winit::State,
    egui_painter: egui_glow::Painter,
    pub ir_draft: String,
    pub ir_dirty: bool,
    pub ir_error: Option<String>,
    /// Cmd+\ toggles the egui dev panels off, to feel raw canvas paint cost
    /// (the panel is a per-frame egui layout + GL composite). Default on.
    pub ui_visible: bool,

    // shell
    gpu: super::window::GpuSurface,
    window: winit::window::Window,
    gl_surface: glutin::surface::Surface<glutin::surface::WindowSurface>,
    gl_context: glutin::context::PossiblyCurrentContext,
    exiting: bool,
}

pub fn run(init: WindowInit) {
    let WindowInit {
        gpu,
        el,
        window,
        gl_surface,
        gl_context,
        scale_factor,
        glow_context,
    } = init;

    // egui overlay — the grida_editor egui-spike pattern: one GL
    // context, two painters (Skia below, egui above).
    let egui_ctx = egui::Context::default();
    egui_ctx.set_visuals(egui::Visuals::light());
    let egui_winit = egui_winit::State::new(
        egui_ctx.clone(),
        egui::ViewportId::ROOT,
        &window,
        Some(scale_factor as f32),
        None,
        None,
    );
    let egui_painter = egui_glow::Painter::new(glow_context, "", None, false)
        .expect("failed to create egui_glow painter");

    let (doc, artboard) = scene::from_env();
    let mut app = App {
        doc,
        artboard,
        selection: None,
        hover: None,
        undo: Vec::new(),
        redo: Vec::new(),
        log: Vec::new(),
        journal: Journal::new(),
        fsm: Fsm::Idle,
        gesture: None,
        space_held: false,
        cursor: (0.0, 0.0),
        modifiers: ModifiersState::default(),
        camera: Camera::new(),
        ctx: paint_ctx(),
        dpr: scale_factor as f32,
        last_frame_ms: 0.0,
        bd: [0.0; 6],
        frame_count: 0,
        want_framelog: std::env::var("ANCHOR_FRAMELOG").is_ok(),
        frame_log: None,
        frame_clock: std::time::Instant::now(),
        last_resolved: None,
        last_damage: 0,
        egui_ctx,
        egui_winit,
        egui_painter,
        ir_draft: String::new(),
        ir_dirty: false,
        ir_error: None,
        ui_visible: true,
        gpu,
        window,
        gl_surface,
        gl_context,
        exiting: false,
    };

    app.fit_artboard();
    el.run_app(&mut app).expect("event loop");
}

impl App {
    /// Live geometry must use the same host-font oracle as live painting.
    /// The returned drawlist is intentionally discarded when a pointer or
    /// editor query needs only the resolved tier.
    fn resolve_live(&self) -> Resolved {
        resolve_and_build_doc(&self.doc, &self.ctx).0
    }

    fn fit_artboard(&mut self) {
        let resolved = self.resolve_live();
        let ab = resolved.aabb_of(self.artboard);
        let size = self.window.inner_size();
        self.camera.fit(
            (ab.x, ab.y, ab.w, ab.h),
            (size.width as f32, size.height as f32),
            60.0 * self.dpr,
        );
    }

    fn name_of(&self, id: NodeId) -> String {
        self.doc
            .get(id)
            .header
            .name
            .clone()
            .unwrap_or_else(|| format!("#{id}"))
    }

    fn push_undo(&mut self) {
        self.undo.push(self.doc.clone());
        if self.undo.len() > 64 {
            self.undo.remove(0);
        }
        self.redo.clear();
    }

    /// Apply a typed op through the engine's dispatch (`anchor_lab::ops::apply`)
    /// and record it in the journal (ENG-5.1). `resolved` must be a fresh
    /// resolve of the current document — callers pass the same resolve they
    /// already computed, so this is byte-identical to the pre-journal free-fn
    /// path (guarded by the lab's `apply ≡ free_fn` test).
    fn apply_op(&mut self, resolved: &Resolved, op: Op) -> ops::OpResult {
        let result = ops::apply(&mut self.doc, resolved, &op);
        self.journal.record(op, result.clone());
        result
    }

    fn log_push(&mut self, entry: LogEntry) {
        self.log.push(entry);
        if self.log.len() > 40 {
            self.log.remove(0);
        }
    }

    fn undo(&mut self) {
        if let Some(prev) = self.undo.pop() {
            self.redo.push(std::mem::replace(&mut self.doc, prev));
            self.after_structural();
            self.log_push(LogEntry {
                title: format!("undo (depth {})", self.undo.len()),
                writes: vec![],
                errors: vec![],
            });
        }
    }

    fn redo(&mut self) {
        if let Some(next) = self.redo.pop() {
            self.undo.push(std::mem::replace(&mut self.doc, next));
            self.after_structural();
            self.log_push(LogEntry {
                title: "redo".into(),
                writes: vec![],
                errors: vec![],
            });
        }
    }

    /// After undo/redo/delete: drop dangling references.
    fn after_structural(&mut self) {
        self.selection = self.selection.filter(|id| self.doc.get_opt(*id).is_some());
        self.hover = self.hover.filter(|id| self.doc.get_opt(*id).is_some());
        self.fsm = Fsm::Idle;
        self.gesture = None;
    }

    // ── pointer ─────────────────────────────────────────────────────

    fn pointer_down(&mut self) {
        if self.space_held {
            self.fsm = Fsm::Dragging(Drag::Pan {
                last_screen: self.cursor,
            });
            return;
        }
        let resolved = self.resolve_live();

        // Handle grab on the current selection wins over picking.
        if let Some(sel) = self.selection {
            if resolved.world_opt(sel).is_some() {
                let hs = hud::handles(&self.doc, &resolved, &self.camera, sel, self.dpr);
                if let Some(kind) = handle_at(&hs, self.cursor, self.dpr) {
                    self.begin_handle_drag(kind, sel);
                    return;
                }
            }
        }

        let (wx, wy) = self.camera.screen_to_world(self.cursor);
        match Query::new(&self.doc, &resolved).hit_point(wx, wy) {
            Some(hit) if hit != self.doc.root => {
                self.selection = Some(hit);
                self.fsm = Fsm::Pressed {
                    id: hit,
                    at_screen: self.cursor,
                };
            }
            _ => {
                self.selection = None;
                self.fsm = Fsm::Idle;
            }
        }
    }

    fn begin_handle_drag(&mut self, kind: HandleKind, id: NodeId) {
        let resolved = self.resolve_live();
        match kind {
            HandleKind::Rotate => {
                self.push_undo();
                self.gesture = Some(Gesture::begin(
                    &self.doc,
                    id,
                    &format!("rotate '{}'", self.name_of(id)),
                ));
                let center = box_center_screen(&self.doc, &resolved, &self.camera, id);
                self.fsm = Fsm::Dragging(Drag::Rotate {
                    id,
                    center_screen: center,
                    grab_deg: screen_angle(center, self.cursor),
                    start_rot: self.doc.get(id).header.rotation,
                    derived: self.doc.get(id).payload.box_is_derived(),
                });
            }
            HandleKind::Edge(_) | HandleKind::Corner(_) => {
                let (ax, ay) = resize_anchors(kind);
                let begin =
                    |axis, anchor| ResizeDrag::begin(&self.doc, &resolved, id, axis, anchor);
                let dx = ax.map(|a| begin(Axis::X, a));
                let dy = ay.map(|a| begin(Axis::Y, a));
                // A derived box refuses resize — the wall is a log line,
                // not a silent nothing.
                if matches!(dx, Some(Err(_))) || matches!(dy, Some(Err(_))) {
                    let e = dx
                        .and_then(|r| r.err())
                        .or(dy.and_then(|r| r.err()))
                        .unwrap();
                    self.log_push(LogEntry {
                        title: format!("resize '{}'", self.name_of(id)),
                        writes: vec![],
                        errors: vec![format!("w/h: Err({e:?})")],
                    });
                    return;
                }
                self.push_undo();
                self.gesture = Some(Gesture::begin(
                    &self.doc,
                    id,
                    &format!("resize '{}'", self.name_of(id)),
                ));
                let dx = dx.map(|r| r.unwrap());
                let dy = dy.map(|r| r.unwrap());
                self.fsm = match (dx, dy) {
                    (Some(dx), Some(dy)) => Fsm::Dragging(Drag::ResizeCorner { id, dx, dy }),
                    (Some(drag), None) | (None, Some(drag)) => {
                        Fsm::Dragging(Drag::ResizeEdge { id, drag })
                    }
                    (None, None) => Fsm::Idle,
                };
            }
        }
    }

    fn pointer_move(&mut self) {
        // Threshold: a Pressed node becomes a Move drag after 3px.
        if let Fsm::Pressed { id, at_screen } = self.fsm {
            if dist(self.cursor, at_screen) > DRAG_THRESHOLD * self.dpr {
                self.push_undo();
                self.gesture = Some(Gesture::begin(
                    &self.doc,
                    id,
                    &format!("move '{}'", self.name_of(id)),
                ));
                self.fsm = Fsm::Dragging(Drag::Move {
                    id,
                    last_screen: at_screen,
                });
            }
        }

        match &mut self.fsm {
            Fsm::Dragging(Drag::Pan { last_screen }) => {
                let (lx, ly) = *last_screen;
                self.camera.pan(self.cursor.0 - lx, self.cursor.1 - ly);
                *last_screen = self.cursor;
            }
            Fsm::Dragging(Drag::Move { id, last_screen }) => {
                let id = *id;
                let last = *last_screen;
                *last_screen = self.cursor;
                let resolved = self.resolve_live();
                let p0 = parent_point(&self.doc, &resolved, &self.camera, id, last);
                let p1 = parent_point(&self.doc, &resolved, &self.camera, id, self.cursor);
                let b = resolved.box_of(id);
                let rx = self.apply_op(
                    &resolved,
                    Op::SetX {
                        id,
                        value: b.x + (p1.0 - p0.0),
                    },
                );
                let ry = self.apply_op(
                    &resolved,
                    Op::SetY {
                        id,
                        value: b.y + (p1.1 - p0.1),
                    },
                );
                if let Some(g) = &mut self.gesture {
                    if let Err(e) = rx {
                        g.error(format!("x: Err({e:?})"));
                    }
                    if let Err(e) = ry {
                        g.error(format!("y: Err({e:?})"));
                    }
                }
            }
            Fsm::Dragging(Drag::ResizeEdge { id, drag }) => {
                let id = *id;
                let drag = *drag;
                let resolved = self.resolve_live();
                let p = parent_point(&self.doc, &resolved, &self.camera, id, self.cursor);
                let target = match drag.axis {
                    Axis::X => p.0,
                    Axis::Y => p.1,
                };
                let r = self.apply_op(&resolved, Op::ResizeDrag { id, drag, target });
                if let (Some(g), Err(e)) = (&mut self.gesture, r) {
                    g.error(format!("{:?}: Err({e:?})", drag.axis));
                }
            }
            Fsm::Dragging(Drag::ResizeCorner { id, dx, dy }) => {
                let id = *id;
                let (dx, dy) = (*dx, *dy);
                let r1 = self.resolve_live();
                let p = parent_point(&self.doc, &r1, &self.camera, id, self.cursor);
                let rx = self.apply_op(
                    &r1,
                    Op::ResizeDrag {
                        id,
                        drag: dx,
                        target: p.0,
                    },
                );
                let r2 = self.resolve_live();
                let p = parent_point(&self.doc, &r2, &self.camera, id, self.cursor);
                let ry = self.apply_op(
                    &r2,
                    Op::ResizeDrag {
                        id,
                        drag: dy,
                        target: p.1,
                    },
                );
                if let Some(g) = &mut self.gesture {
                    if let Err(e) = rx {
                        g.error(format!("x: Err({e:?})"));
                    }
                    if let Err(e) = ry {
                        g.error(format!("y: Err({e:?})"));
                    }
                }
            }
            Fsm::Dragging(Drag::Rotate {
                id,
                center_screen,
                grab_deg,
                start_rot,
                derived,
            }) => {
                let id = *id;
                let mut deg = *start_rot + screen_angle(*center_screen, self.cursor) - *grab_deg;
                if self.modifiers.shift_key() {
                    deg = (deg / 15.0).round() * 15.0;
                }
                let derived = *derived;
                let resolved = self.resolve_live();
                let r = if derived {
                    self.apply_op(&resolved, Op::RotateDerivedCenterFeel { id, deg })
                } else {
                    self.apply_op(&resolved, Op::SetRotation { id, deg })
                };
                if let (Some(g), Err(e)) = (&mut self.gesture, r) {
                    g.error(format!("rotation: Err({e:?})"));
                }
            }
            _ => {
                // Idle / Pressed: hover tracking only.
                let resolved = self.resolve_live();
                let (wx, wy) = self.camera.screen_to_world(self.cursor);
                self.hover = Query::new(&self.doc, &resolved)
                    .hit_point(wx, wy)
                    .filter(|h| *h != self.doc.root);
            }
        }
    }

    fn pointer_up(&mut self) {
        let fsm = std::mem::take(&mut self.fsm);
        if let Fsm::Dragging(drag) = fsm {
            let mutated = !matches!(drag, Drag::Pan { .. });
            if mutated {
                if let Some(g) = self.gesture.take() {
                    let writes = diff_header(&g.before, &self.doc.get(g.id).header);
                    if writes.is_empty() && g.errors.is_empty() {
                        // No-op gesture: drop the snapshot it reserved.
                        self.undo.pop();
                    } else {
                        self.log_push(LogEntry {
                            title: g.title,
                            writes,
                            errors: g.errors,
                        });
                    }
                }
            }
        }
    }

    // ── keys ────────────────────────────────────────────────────────

    fn key(&mut self, key: Key, pressed: bool) {
        if key == Key::Named(NamedKey::Space) {
            self.space_held = pressed;
            return;
        }
        if !pressed {
            return;
        }
        let primary = self.modifiers.super_key() || self.modifiers.control_key();
        match key {
            Key::Named(NamedKey::Escape) => {
                self.selection = None;
            }
            Key::Named(NamedKey::Backspace) | Key::Named(NamedKey::Delete) => {
                if let Some(id) = self.selection {
                    let name = self.name_of(id);
                    self.push_undo();
                    let resolved = self.resolve_live();
                    match self.apply_op(&resolved, Op::Delete { id }) {
                        Ok(n) => {
                            self.after_structural();
                            self.log_push(LogEntry {
                                title: format!("delete '{name}'"),
                                writes: vec![format!("{n} node(s) removed")],
                                errors: vec![],
                            });
                        }
                        Err(e) => {
                            self.undo.pop();
                            self.log_push(LogEntry {
                                title: format!("delete '{name}'"),
                                writes: vec![],
                                errors: vec![format!("Err({e:?})")],
                            });
                        }
                    }
                }
            }
            Key::Named(
                k @ (NamedKey::ArrowLeft
                | NamedKey::ArrowRight
                | NamedKey::ArrowUp
                | NamedKey::ArrowDown),
            ) => {
                if let Some(id) = self.selection {
                    let step = if self.modifiers.shift_key() {
                        10.0
                    } else {
                        1.0
                    };
                    let (dx, dy) = match k {
                        NamedKey::ArrowLeft => (-step, 0.0),
                        NamedKey::ArrowRight => (step, 0.0),
                        NamedKey::ArrowUp => (0.0, -step),
                        _ => (0.0, step),
                    };
                    self.push_undo();
                    let before = self.doc.get(id).header.clone();
                    let resolved = self.resolve_live();
                    let rx = self.apply_op(
                        &resolved,
                        Op::SetX {
                            id,
                            value: resolved.box_of(id).x + dx,
                        },
                    );
                    let ry = self.apply_op(
                        &resolved,
                        Op::SetY {
                            id,
                            value: resolved.box_of(id).y + dy,
                        },
                    );
                    let writes = diff_header(&before, &self.doc.get(id).header);
                    let mut errors = vec![];
                    if let Err(e) = rx {
                        errors.push(format!("x: Err({e:?})"));
                    }
                    if let Err(e) = ry {
                        errors.push(format!("y: Err({e:?})"));
                    }
                    if writes.is_empty() && errors.is_empty() {
                        self.undo.pop();
                    } else {
                        self.log_push(LogEntry {
                            title: format!("nudge '{}'", self.name_of(id)),
                            writes,
                            errors,
                        });
                    }
                }
            }
            Key::Character(ref c) if primary && c.as_str() == "z" => {
                if self.modifiers.shift_key() {
                    self.redo();
                } else {
                    self.undo();
                }
            }
            Key::Character(ref c) if primary && self.modifiers.shift_key() && c.as_str() == "g" => {
                if let Some(id) = self.selection {
                    let name = self.name_of(id);
                    let resolved = self.resolve_live();
                    self.push_undo();
                    match self.apply_op(&resolved, Op::Ungroup { id }) {
                        Ok(n) => {
                            self.selection = None;
                            self.log_push(LogEntry {
                                title: format!("ungroup '{name}'"),
                                writes: vec![format!("{n} field writes (bake)")],
                                errors: vec![],
                            });
                        }
                        Err(e) => {
                            self.undo.pop();
                            self.log_push(LogEntry {
                                title: format!("ungroup '{name}'"),
                                writes: vec![],
                                errors: vec![format!("Err({e:?})")],
                            });
                        }
                    }
                }
            }
            Key::Character(ref c) if primary && c.as_str() == "0" => {
                self.fit_artboard();
            }
            Key::Character(ref c) if primary && (c.as_str() == "=" || c.as_str() == "+") => {
                let size = self.window.inner_size();
                self.camera
                    .zoom_about((size.width as f32 / 2.0, size.height as f32 / 2.0), 1.2);
            }
            Key::Character(ref c) if primary && c.as_str() == "-" => {
                let size = self.window.inner_size();
                self.camera.zoom_about(
                    (size.width as f32 / 2.0, size.height as f32 / 2.0),
                    1.0 / 1.2,
                );
            }
            Key::Character(ref c) if primary && c.as_str() == "\\" => {
                // Toggle the dev panels — feel raw canvas paint without the
                // per-frame egui overlay.
                self.ui_visible = !self.ui_visible;
                self.window.request_redraw();
            }
            _ => {}
        }
    }

    // ── paint ───────────────────────────────────────────────────────

    fn draw(&mut self) {
        let ms = |t: std::time::Instant| t.elapsed().as_secs_f32() * 1000.0;
        let t0 = std::time::Instant::now();
        // The inter-frame GAP: wall time since the last draw START. This is the
        // true frame period (fps = 1000/gap) — it includes everything BETWEEN
        // draws (event loop, scheduling, present blocking), which the in-draw
        // stage sum does not. If gap >> draw, the problem is not rendering.
        let gap = t0.duration_since(self.frame_clock).as_secs_f32() * 1000.0;
        self.frame_clock = t0;
        let (resolved, list) = resolve_and_build_doc(&self.doc, &self.ctx);
        self.last_damage = match &self.last_resolved {
            Some(prev) => anchor_engine::damage::diff(prev, &resolved).changed.len(),
            None => 0,
        };
        let t_resolve_build = ms(t0);

        let t1 = std::time::Instant::now();
        let canvas = self.gpu.surface.canvas();
        canvas.clear(skia_safe::Color::from_argb(255, 0xF7, 0xF8, 0xF9));
        anchor_engine::paint::execute(canvas, &list, &self.camera.view(), &self.ctx);
        hud::paint_hud_dpr(
            canvas,
            &self.doc,
            &resolved,
            &self.camera,
            self.selection,
            self.hover,
            &self.ctx,
            self.dpr,
        );
        let t_scene = ms(t1);

        let t2 = std::time::Instant::now();
        self.gpu.gr_context.flush_and_submit();
        let t_flush = ms(t2);

        let t3 = std::time::Instant::now();
        self.paint_egui(resolved.reports.len());
        let t_egui = ms(t3);

        // glFinish: block until the GPU has ACTUALLY finished all submitted
        // work (scene + egui). Its wall time is the real GPU cost; whatever
        // swap_buffers then spends is pure vsync idle, not work. This is the
        // measurement the OpenGL literature prescribes — a raw swap wall only
        // ever shows multiples of the refresh interval and hides the truth.
        let t_gpu = std::time::Instant::now();
        unsafe {
            gl::Finish();
        }
        let t_gpufinish = ms(t_gpu);

        let t4 = std::time::Instant::now();
        if let Err(e) = self.gl_surface.swap_buffers(&self.gl_context) {
            eprintln!("swap_buffers: {e:?}");
        }
        let t_swap = ms(t4);

        self.last_frame_ms = ms(t0);
        self.bd = [
            t_resolve_build,
            t_scene,
            t_flush,
            t_egui,
            t_gpufinish,
            t_swap,
        ];
        self.frame_count += 1;

        // Per-run frame log (opt-in `ANCHOR_FRAMELOG=1`). Truncated on the first
        // frame; flushed every frame so a hard kill during panning preserves it.
        if self.want_framelog && self.frame_log.is_none() {
            let path = "/tmp/anchor-spike-frames.log";
            match std::fs::File::create(path) {
                Ok(f) => {
                    let sz = self.window.inner_size();
                    eprintln!(
                        "frame log -> {path}  (dpr {:.1} surface {}x{})",
                        self.dpr, sz.width, sz.height
                    );
                    self.frame_log = Some(std::io::BufWriter::new(f));
                }
                Err(e) => eprintln!("frame log open failed: {e}"),
            }
        }
        if let Some(w) = self.frame_log.as_mut() {
            use std::io::Write as _;
            let panning = matches!(self.fsm, Fsm::Dragging(Drag::Pan { .. }));
            let dragging = matches!(self.fsm, Fsm::Dragging(_));
            let _ = writeln!(
                w,
                "f{:<6} gap {:7.2}ms ({:6.1}fps)  draw {:6.2} = res+list {:.2} scene {:.2} flush {:.2} egui {:.2} gpu {:.2} vsync {:.2}  | pan={} drag={} cursor=({:.0},{:.0}) damage={} zoom={:.2}",
                self.frame_count, gap, 1000.0 / gap.max(0.001),
                self.last_frame_ms,
                t_resolve_build, t_scene, t_flush, t_egui, t_gpufinish, t_swap,
                panning as u8, dragging as u8,
                self.cursor.0, self.cursor.1, self.last_damage, self.camera.zoom,
            );
            let _ = w.flush();
        }

        self.last_resolved = Some(resolved);
    }

    // ── panels (egui) ───────────────────────────────────────────────

    fn paint_egui(&mut self, _report_count: usize) {
        use glow::HasContext as _;

        if !self.ui_visible {
            // Panels hidden (Cmd+\): drain accumulated input so it can't pile
            // up while hidden, but skip the panel build + egui GL composite —
            // the point is to feel raw canvas paint cost.
            let _ = self.egui_winit.take_egui_input(&self.window);
            return;
        }

        let raw = self.egui_winit.take_egui_input(&self.window);
        let ctx = self.egui_ctx.clone();
        let full = ctx.run_ui(raw, |ui| self.build_panels(ui));
        self.egui_winit
            .handle_platform_output(&self.window, full.platform_output);
        let prims = ctx.tessellate(full.shapes, full.pixels_per_point);
        let (w, h): (u32, u32) = self.window.inner_size().into();
        // Composite onto the frame Skia just drew (default framebuffer).
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
        // egui issued raw GL — resync Ganesh before the next Skia frame
        // (the grida_editor reset dance).
        self.gpu.gr_context.reset(None);
        // RENDER ON DEMAND: do NOT auto-request another redraw here. egui asks
        // for an immediate repaint every frame (the code-editor keeps it
        // unsettled), which drove continuous rendering — the CPU racing ahead
        // of vsync, filling the present chain 2-3 frames deep = the input lag
        // (winit#2468 / glutin#1322). Redraws now come only from real input
        // events (window_event), so each input maps to one frame presented
        // ASAP: shallow chain, tight input->photon coupling, no idle GPU burn.
        // Cost: egui's own animations (cursor blink) don't tick when idle —
        // acceptable for a dev panel, and any click/keypress redraws it.
    }

    fn build_panels(&mut self, ui: &mut egui::Ui) {
        // Keep the draft mirroring the document until the user edits it.
        if !self.ir_dirty {
            self.ir_draft = anchor_lab::textir::print(&self.doc);
        }
        let resolved = self.resolve_live();

        egui::Panel::right("spike-panel")
            .exact_size(380.0)
            .show(ui, |ui: &mut egui::Ui| {
                ui.add_space(6.0);
                ui.horizontal(|ui| {
                    ui.heading("anchor spike — E10");
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.button("fit").clicked() {
                            self.fit_artboard();
                        }
                    });
                });
                ui.label(
                    egui::RichText::new(format!(
                        "frame {:.2} ms · zoom {:.0}% · undo {} · redo {} · damage {} · journal {}",
                        self.last_frame_ms,
                        self.camera.zoom * 100.0,
                        self.undo.len(),
                        self.redo.len(),
                        self.last_damage,
                        self.journal.len(),
                    ))
                    .monospace()
                    .weak(),
                );
                ui.label(
                    egui::RichText::new(format!(
                        "  resolve+list {:.2} · scene {:.2} · flush {:.2} · egui {:.2} · GPU {:.2} · vsync {:.2}",
                        self.bd[0], self.bd[1], self.bd[2], self.bd[3], self.bd[4], self.bd[5],
                    ))
                    .monospace()
                    .weak(),
                );
                ui.separator();

                // ── selection ────────────────────────────────────
                if let Some(id) = self.selection {
                    if let Some(node) = self.doc.get_opt(id) {
                        let b = resolved.box_of(id);
                        ui.label(
                            egui::RichText::new(format!(
                                "{} <{}>  x {:.1}  y {:.1}  w {:.1}  h {:.1}{}",
                                node.header.name.as_deref().unwrap_or("node"),
                                node.payload.kind_name(),
                                b.x,
                                b.y,
                                b.w,
                                b.h,
                                if node.header.rotation != 0.0 {
                                    format!("  rot {:.1}°", node.header.rotation)
                                } else {
                                    String::new()
                                }
                            ))
                            .monospace(),
                        );
                        ui.label(
                            egui::RichText::new(
                                "reads are resolved xywh — intent may be end/span/auto",
                            )
                            .weak()
                            .small(),
                        );
                        ui.separator();
                    }
                }

                // ── resolver reports (this resolve) ──────────────
                if !resolved.reports.is_empty() {
                    ui.label(egui::RichText::new("reports — this resolve").strong());
                    for r in resolved.reports.iter().take(6) {
                        ui.label(
                            egui::RichText::new(format!("{r:?}"))
                                .monospace()
                                .small()
                                .color(egui::Color32::from_rgb(0xB9, 0x7F, 0x22)),
                        );
                    }
                    if resolved.reports.len() > 6 {
                        ui.label(
                            egui::RichText::new(format!("… {} more", resolved.reports.len() - 6))
                                .weak()
                                .small(),
                        );
                    }
                    ui.separator();
                }

                // ── writes log ───────────────────────────────────
                ui.label(egui::RichText::new("writes — per gesture, typed").strong());
                egui::ScrollArea::vertical()
                    .id_salt("log")
                    .max_height(170.0)
                    .show(ui, |ui| {
                        if self.log.is_empty() {
                            ui.label(egui::RichText::new("no gestures yet").weak());
                        }
                        for e in self.log.iter().rev() {
                            ui.label(
                                egui::RichText::new(format!(
                                    "{} — {} write{}",
                                    e.title,
                                    e.writes.len(),
                                    if e.writes.len() == 1 { "" } else { "s" }
                                ))
                                .monospace()
                                .strong(),
                            );
                            for wline in &e.writes {
                                ui.label(
                                    egui::RichText::new(format!("  {wline}"))
                                        .monospace()
                                        .small()
                                        .color(egui::Color32::from_rgb(0x2F, 0x7D, 0x5D)),
                                );
                            }
                            for eline in &e.errors {
                                ui.label(
                                    egui::RichText::new(format!("  {eline}"))
                                        .monospace()
                                        .small()
                                        .color(egui::Color32::from_rgb(0xE2, 0x57, 0x4C)),
                                );
                            }
                        }
                    });
                ui.separator();

                // ── the IR, live + editable ──────────────────────
                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new("document IR").strong());
                    if self.ir_dirty {
                        if ui.button("apply").clicked() {
                            self.apply_ir();
                        }
                        if ui.button("discard").clicked() {
                            self.ir_dirty = false;
                            self.ir_error = None;
                        }
                    } else {
                        ui.label(egui::RichText::new("(edit to enable apply)").weak().small());
                    }
                });
                if let Some(err) = &self.ir_error {
                    ui.label(
                        egui::RichText::new(err)
                            .monospace()
                            .small()
                            .color(egui::Color32::from_rgb(0xE2, 0x57, 0x4C)),
                    );
                }
                egui::ScrollArea::vertical().id_salt("ir").show(ui, |ui| {
                    let resp = ui.add(
                        egui::TextEdit::multiline(&mut self.ir_draft)
                            .code_editor()
                            .desired_width(f32::INFINITY)
                            .desired_rows(18),
                    );
                    if resp.changed() {
                        self.ir_dirty = true;
                    }
                });
            });
    }

    /// Apply the edited IR: parse → replace the document (undoable).
    /// A bad IR is a TYPED parse error shown in place — the document
    /// stays untouched (the op-layer doctrine at the text seam).
    fn apply_ir(&mut self) {
        match anchor_lab::textir::parse(&self.ir_draft) {
            Ok(newdoc) => {
                self.push_undo();
                self.doc = newdoc;
                self.artboard =
                    scene::find_named(&self.doc, scene::ARTBOARD).unwrap_or(self.doc.root);
                self.after_structural();
                self.ir_dirty = false;
                self.ir_error = None;
                self.log_push(LogEntry {
                    title: "apply IR".into(),
                    writes: vec!["document replaced (undoable)".into()],
                    errors: vec![],
                });
            }
            Err(e) => {
                self.ir_error = Some(format!("{e}"));
            }
        }
    }
}

impl ApplicationHandler for App {
    fn resumed(&mut self, _el: &ActiveEventLoop) {
        self.window.request_redraw();
    }

    fn window_event(
        &mut self,
        el: &ActiveEventLoop,
        _wid: winit::window::WindowId,
        event: WindowEvent,
    ) {
        // UI-first arbitration (the grida_editor shell pattern): egui
        // sees every event; input it is using must not also reach the
        // canvas FSM. Non-input events always pass through.
        let resp = self.egui_winit.on_window_event(&self.window, &event);
        // RENDER ON DEMAND: do NOT redraw just because egui wants to repaint.
        // A RedrawRequested is itself an event, so `egui wants repaint ->
        // request_redraw` self-perpetuated a continuous render loop (the input
        // lag). Real input still drives redraws below (canvas via the fall-
        // through request, egui-consumed input via the `gated` branch), so the
        // panel stays responsive; only egui's idle self-animation is dropped.
        let _ = resp.repaint;
        // With the panels hidden there is nothing to arbitrate — every input
        // goes to the canvas (incl. the Cmd+\ that toggles them back on).
        let gated = if !self.ui_visible {
            false
        } else {
            match &event {
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
            }
        };
        if gated {
            self.window.request_redraw();
            return;
        }
        match event {
            WindowEvent::RedrawRequested => {
                if !self.exiting {
                    self.draw();
                }
                return;
            }
            WindowEvent::CloseRequested => {
                self.exiting = true;
                el.exit();
                return;
            }
            WindowEvent::Resized(size) => {
                self.gl_surface.resize(
                    &self.gl_context,
                    NonZeroU32::new(size.width).unwrap_or(unsafe { NonZeroU32::new_unchecked(1) }),
                    NonZeroU32::new(size.height).unwrap_or(unsafe { NonZeroU32::new_unchecked(1) }),
                );
                self.gpu.recreate(size.width as i32, size.height as i32);
            }
            WindowEvent::ModifiersChanged(m) => {
                self.modifiers = m.state();
            }
            WindowEvent::CursorMoved { position, .. } => {
                self.cursor = (position.x as f32, position.y as f32);
                self.pointer_move();
            }
            WindowEvent::MouseWheel { delta, .. } => {
                let (dx, dy) = match delta {
                    MouseScrollDelta::LineDelta(x, y) => (x * 40.0, y * 40.0),
                    MouseScrollDelta::PixelDelta(p) => (p.x as f32, p.y as f32),
                };
                if self.modifiers.super_key() || self.modifiers.control_key() {
                    self.camera.zoom_about(self.cursor, (dy / 240.0).exp());
                } else {
                    self.camera.pan(dx, dy);
                }
            }
            WindowEvent::PinchGesture { delta, .. } => {
                self.camera.zoom_about(self.cursor, (delta as f32).exp());
            }
            WindowEvent::MouseInput { state, button, .. } => match (state, button) {
                (ElementState::Pressed, MouseButton::Left) => self.pointer_down(),
                (ElementState::Released, MouseButton::Left) => self.pointer_up(),
                (ElementState::Pressed, MouseButton::Middle) => {
                    self.fsm = Fsm::Dragging(Drag::Pan {
                        last_screen: self.cursor,
                    });
                }
                (ElementState::Released, MouseButton::Middle) => self.pointer_up(),
                _ => {}
            },
            WindowEvent::KeyboardInput { event, .. } => {
                let pressed = event.state == ElementState::Pressed;
                self.key(event.logical_key.clone(), pressed);
            }
            _ => return,
        }
        self.window.request_redraw();
    }
}
