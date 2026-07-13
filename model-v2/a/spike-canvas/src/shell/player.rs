//! Minimal live host for the reference SVG animation path.
//!
//! This module owns the ambient clock, window, controls, and the temporary
//! redraw timer standing in for the not-yet-built compositor. The engine still
//! receives exactly one explicit `SampleTime` per frame.

use std::num::NonZeroU32;
use std::path::Path;
use std::time::{Duration, Instant};

use anchor_engine::damage::diff_frame;
use anchor_engine::frame::{self, FrameProduct, FrameRequest};
use anchor_engine::paint::PaintCtx;
use anchor_engine::playback_clock::{HostTime, PlaybackRange};
use anchor_lab::animation::{AnimationProgram, SampleTime};
use anchor_lab::resolve::ResolveOptions;
use anchor_lab::svg_animation::{CompiledRectSvgAnimation, RectSvgAnimationSource, SourceSnapshot};
use glutin::prelude::GlSurface;
use skia_safe::Color;
use winit::application::ApplicationHandler;
use winit::event::{ElementState, WindowEvent};
use winit::event_loop::{ActiveEventLoop, ControlFlow};
use winit::keyboard::{Key, NamedKey};

use super::player_transport::{PlayerTransport, ScrubPhase};
use super::window::WindowInit;
use crate::camera::Camera;

const FRAME_INTERVAL: Duration = Duration::from_nanos(16_666_667);
const CONTROLS_HEIGHT: f32 = 88.0;

pub fn run(path: &Path) -> Result<(), String> {
    let source = std::fs::read_to_string(path)
        .map_err(|error| format!("read {}: {error}", path.display()))?;
    let compiled =
        RectSvgAnimationSource::parse(SourceSnapshot::new(path.display().to_string(), source))
            .map_err(|error| error.to_string())?
            .into_compiled_profile1()
            .map_err(|error| error.to_string())?;
    let range = program_range(compiled.animation())?;

    let title = path
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| format!("Grida SVG animation — {name}"))
        .unwrap_or_else(|| "Grida SVG animation".to_string());
    let init = super::window::create_window(&title, 1200, 760);
    let WindowInit {
        gpu,
        el,
        window,
        gl_surface,
        gl_context,
        scale_factor,
        glow_context,
    } = init;

    let egui_ctx = egui::Context::default();
    egui_ctx.set_visuals(egui::Visuals::dark());
    let egui_winit = egui_winit::State::new(
        egui_ctx.clone(),
        egui::ViewportId::ROOT,
        &window,
        Some(scale_factor as f32),
        None,
        None,
    );
    let egui_painter = egui_glow::Painter::new(glow_context, "", None, false)
        .map_err(|error| format!("create playback controls: {error}"))?;

    let epoch = Instant::now();
    let transport = PlayerTransport::new(range).map_err(|error| error.to_string())?;
    let viewport = compiled.viewport();
    let mut app = AnimationApp {
        compiled,
        transport,
        epoch,
        options: ResolveOptions {
            viewport,
            ..Default::default()
        },
        camera: Camera::new(),
        paint_ctx: PaintCtx::default(),
        egui_ctx,
        egui_winit,
        egui_painter,
        last_frame: None,
        last_time: range.start(),
        next_redraw: Instant::now(),
        dpr: scale_factor as f32,
        title,
        gpu,
        window,
        gl_surface,
        gl_context,
        exiting: false,
        fatal_error: None,
    };
    app.fit_view();

    println!(
        "playing {} (on-screen transport; Space pause/resume, R or Home restart, Esc quit)",
        path.display()
    );
    el.run_app(&mut app)
        .map_err(|error| format!("event loop: {error}"))?;
    match app.fatal_error {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

fn program_range(program: &AnimationProgram) -> Result<PlaybackRange, String> {
    let end = program
        .tracks()
        .iter()
        .map(|track| track.timing().active_end())
        .max()
        .ok_or_else(|| "SVG contains no supported animation tracks".to_string())?;
    PlaybackRange::new(SampleTime::ZERO, end).map_err(|error| error.to_string())
}

fn format_time(time: SampleTime) -> String {
    let milliseconds = time.nanoseconds().max(0) as u64 / 1_000_000;
    let minutes = milliseconds / 60_000;
    let seconds = milliseconds / 1_000 % 60;
    let millis = milliseconds % 1_000;
    format!("{minutes}:{seconds:02}.{millis:03}")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TransportAction {
    Restart,
    SetPlayback(bool),
    Seek(SampleTime),
    Scrub {
        position: SampleTime,
        phase: ScrubPhase,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PlayerShortcut {
    Exit,
    TogglePlayback,
    Restart,
}

struct AnimationApp {
    compiled: CompiledRectSvgAnimation,
    transport: PlayerTransport,
    epoch: Instant,
    options: ResolveOptions,
    camera: Camera,
    paint_ctx: PaintCtx,
    egui_ctx: egui::Context,
    egui_winit: egui_winit::State,
    egui_painter: egui_glow::Painter,
    last_frame: Option<FrameProduct>,
    last_time: SampleTime,
    next_redraw: Instant,
    dpr: f32,
    title: String,
    gpu: super::window::GpuSurface,
    window: winit::window::Window,
    gl_surface: glutin::surface::Surface<glutin::surface::WindowSurface>,
    gl_context: glutin::context::PossiblyCurrentContext,
    exiting: bool,
    fatal_error: Option<String>,
}

impl AnimationApp {
    fn host_time(&self) -> HostTime {
        let nanoseconds = self.epoch.elapsed().as_nanos().min(u128::from(u64::MAX)) as u64;
        HostTime::from_nanoseconds(nanoseconds)
    }

    fn fit_view(&mut self) {
        let size = self.window.inner_size();
        let (width, height) = self.compiled.viewport();
        let controls_height =
            (CONTROLS_HEIGHT * self.dpr).min(size.height.saturating_sub(1) as f32);
        self.camera.fit(
            (0.0, 0.0, width, height),
            (
                size.width.max(1) as f32,
                (size.height as f32 - controls_height).max(1.0),
            ),
            24.0 * self.dpr,
        );
    }

    fn request_frame(&mut self) {
        self.window.request_redraw();
        self.next_redraw = Instant::now() + FRAME_INTERVAL;
    }

    fn draw(&mut self) -> Result<(), String> {
        let now = self.host_time();
        let time = self
            .transport
            .sample(now)
            .map_err(|error| error.to_string())?;
        let canvas = self.gpu.surface.canvas();
        canvas.clear(Color::from_rgb(0xF7, 0xF8, 0xF9));
        let (product, _) = frame::render_request(
            canvas,
            self.compiled.document(),
            FrameRequest::Sample {
                program: self.compiled.animation(),
                time,
            },
            &self.options,
            &self.camera.view(),
            &self.paint_ctx,
        )
        .map_err(|error| error.to_string())?;
        let changed = self
            .last_frame
            .as_ref()
            .map(|previous| diff_frame(previous, &product).changed.len())
            .unwrap_or(0);
        self.last_frame = Some(product);
        self.last_time = time;

        self.gpu.gr_context.flush_and_submit();
        let presented_playback_requested = self.paint_controls()?;
        self.window.pre_present_notify();
        self.gl_surface
            .swap_buffers(&self.gl_context)
            .map_err(|error| format!("present frame: {error}"))?;
        let now = self.host_time();
        self.transport
            .present_complete(time, presented_playback_requested, now)
            .map_err(|error| error.to_string())?;
        self.update_title(changed);
        Ok(())
    }

    fn paint_controls(&mut self) -> Result<bool, String> {
        use glow::HasContext as _;

        let playback_requested = self.transport.has_automatic_frame_demand();
        let presented_playback_requested = self.transport.presented_playback_requested();
        let raw = self.egui_winit.take_egui_input(&self.window);
        let ctx = self.egui_ctx.clone();
        let mut action = None;
        let full = ctx.run_ui(raw, |ui| {
            action = self.build_controls(ui, playback_requested, presented_playback_requested);
        });
        self.egui_winit
            .handle_platform_output(&self.window, full.platform_output);
        let primitives = ctx.tessellate(full.shapes, full.pixels_per_point);
        let (width, height): (u32, u32) = self.window.inner_size().into();
        unsafe {
            self.egui_painter
                .gl()
                .bind_framebuffer(glow::FRAMEBUFFER, None);
        }
        self.egui_painter.paint_and_update_textures(
            [width, height],
            full.pixels_per_point,
            &primitives,
            &full.textures_delta,
        );
        self.gpu.gr_context.reset(None);

        if let Some(action) = action {
            self.apply_control(action)?;
        }
        Ok(playback_requested)
    }

    fn build_controls(
        &self,
        ui: &mut egui::Ui,
        playback_requested: bool,
        presented_playback_requested: bool,
    ) -> Option<TransportAction> {
        let mut action = None;
        egui::Panel::bottom("animation-player-controls")
            .exact_size(CONTROLS_HEIGHT)
            .frame(
                egui::Frame::new()
                    .fill(egui::Color32::from_rgba_unmultiplied(15, 23, 42, 248))
                    .stroke(egui::Stroke::new(1.0, egui::Color32::from_gray(55)))
                    .inner_margin(egui::Margin::symmetric(18, 10)),
            )
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    let restart = egui::Button::new(
                        egui::RichText::new("Restart").color(egui::Color32::WHITE),
                    )
                    .min_size(egui::vec2(76.0, 28.0));
                    if ui.add(restart).clicked() {
                        action = Some(TransportAction::Restart);
                    }
                    let label = if playback_requested { "Pause" } else { "Play" };
                    let playback = egui::Button::new(
                        egui::RichText::new(label)
                            .strong()
                            .color(egui::Color32::WHITE),
                    )
                    .fill(egui::Color32::from_rgb(37, 99, 235))
                    .min_size(egui::vec2(68.0, 28.0));
                    if ui.add(playback).clicked() {
                        action = Some(TransportAction::SetPlayback(!presented_playback_requested));
                    }
                    ui.add_space(8.0);
                    ui.label(
                        egui::RichText::new(format!(
                            "{} / {}",
                            format_time(self.last_time),
                            format_time(self.transport.range().end())
                        ))
                        .monospace(),
                    );
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        ui.label(
                            egui::RichText::new("Space  Play/Pause    R/Home  Restart")
                                .small()
                                .color(egui::Color32::from_gray(148)),
                        );
                    });
                });

                let range = self.transport.range();
                let mut position = self
                    .last_time
                    .nanoseconds()
                    .clamp(range.start().nanoseconds(), range.end().nanoseconds());
                ui.spacing_mut().slider_width = ui.available_width();
                let response = ui.add(
                    egui::Slider::new(
                        &mut position,
                        range.start().nanoseconds()..=range.end().nanoseconds(),
                    )
                    .show_value(false),
                );
                if response.drag_stopped() {
                    action = Some(TransportAction::Scrub {
                        position: SampleTime::from_nanoseconds(position),
                        phase: ScrubPhase::End,
                    });
                } else if response.drag_started() {
                    action = Some(TransportAction::Scrub {
                        position: SampleTime::from_nanoseconds(position),
                        phase: ScrubPhase::Begin,
                    });
                } else if response.dragged() && response.changed() {
                    action = Some(TransportAction::Scrub {
                        position: SampleTime::from_nanoseconds(position),
                        phase: ScrubPhase::Update,
                    });
                } else if response.changed() {
                    action = Some(TransportAction::Seek(SampleTime::from_nanoseconds(
                        position,
                    )));
                }
            });
        action
    }

    fn apply_control(&mut self, action: TransportAction) -> Result<(), String> {
        match action {
            TransportAction::Restart => self.restart(),
            TransportAction::SetPlayback(playing) => self.set_playback(playing),
            TransportAction::Seek(position) => self.seek(position),
            TransportAction::Scrub { position, phase } => self.scrub(position, phase),
        }
    }

    fn update_title(&self, changed: usize) {
        let state = if self.transport.has_automatic_frame_demand() {
            "playing"
        } else {
            "paused"
        };
        let milliseconds = self.last_time.nanoseconds() as f64 / 1_000_000.0;
        self.window.set_title(&format!(
            "{} — {milliseconds:.1} ms — {state} — {changed} scene nodes changed",
            self.title
        ));
    }

    fn toggle_playback(&mut self) -> Result<(), String> {
        let now = self.host_time();
        self.transport
            .toggle_playback(now)
            .map_err(|error| error.to_string())?;
        self.request_frame();
        Ok(())
    }

    fn set_playback(&mut self, playing: bool) -> Result<(), String> {
        let now = self.host_time();
        self.transport
            .set_playback(playing, now)
            .map_err(|error| error.to_string())?;
        self.request_frame();
        Ok(())
    }

    fn restart(&mut self) -> Result<(), String> {
        let now = self.host_time();
        self.transport
            .restart(now)
            .map_err(|error| error.to_string())?;
        self.request_frame();
        Ok(())
    }

    fn seek(&mut self, position: SampleTime) -> Result<(), String> {
        let now = self.host_time();
        self.transport
            .seek(position, now)
            .map_err(|error| error.to_string())?;
        self.request_frame();
        Ok(())
    }

    fn scrub(&mut self, position: SampleTime, phase: ScrubPhase) -> Result<(), String> {
        let now = self.host_time();
        self.transport
            .scrub(position, phase, now)
            .map_err(|error| error.to_string())?;
        self.request_frame();
        Ok(())
    }

    fn fail(&mut self, event_loop: &ActiveEventLoop, error: String) {
        self.fatal_error = Some(error);
        self.exiting = true;
        event_loop.exit();
    }
}

impl ApplicationHandler for AnimationApp {
    fn resumed(&mut self, _event_loop: &ActiveEventLoop) {
        self.request_frame();
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        _window_id: winit::window::WindowId,
        event: WindowEvent,
    ) {
        if let WindowEvent::KeyboardInput { event, .. } = &event {
            let shortcut = match &event.logical_key {
                Key::Named(NamedKey::Escape) => Some(PlayerShortcut::Exit),
                Key::Named(NamedKey::Space) => Some(PlayerShortcut::TogglePlayback),
                Key::Named(NamedKey::Home) => Some(PlayerShortcut::Restart),
                Key::Character(value) if value.eq_ignore_ascii_case("r") => {
                    Some(PlayerShortcut::Restart)
                }
                _ => None,
            };
            if let Some(shortcut) = shortcut {
                if event.state == ElementState::Pressed && !event.repeat {
                    let result = match shortcut {
                        PlayerShortcut::Exit => {
                            self.exiting = true;
                            event_loop.exit();
                            return;
                        }
                        PlayerShortcut::TogglePlayback => self.toggle_playback(),
                        PlayerShortcut::Restart => self.restart(),
                    };
                    if let Err(error) = result {
                        self.fail(event_loop, error);
                    }
                }
                return;
            }
        }

        let response = self.egui_winit.on_window_event(&self.window, &event);
        let egui_input = matches!(
            &event,
            WindowEvent::CursorEntered { .. }
                | WindowEvent::CursorLeft { .. }
                | WindowEvent::CursorMoved { .. }
                | WindowEvent::MouseInput { .. }
                | WindowEvent::MouseWheel { .. }
                | WindowEvent::KeyboardInput { .. }
                | WindowEvent::Ime(_)
                | WindowEvent::Touch(_)
        );
        let gated = match &event {
            WindowEvent::CursorMoved { .. }
            | WindowEvent::MouseInput { .. }
            | WindowEvent::MouseWheel { .. } => {
                response.consumed || self.egui_ctx.egui_wants_pointer_input()
            }
            WindowEvent::KeyboardInput { .. } | WindowEvent::Ime(_) => {
                response.consumed || self.egui_ctx.egui_wants_keyboard_input()
            }
            _ => false,
        };
        if egui_input {
            self.request_frame();
        }
        if gated {
            return;
        }

        match event {
            WindowEvent::CloseRequested => {
                self.exiting = true;
                event_loop.exit();
            }
            WindowEvent::Resized(size) => {
                let width = size.width.max(1);
                let height = size.height.max(1);
                self.gl_surface.resize(
                    &self.gl_context,
                    NonZeroU32::new(width).expect("width is clamped to one"),
                    NonZeroU32::new(height).expect("height is clamped to one"),
                );
                self.gpu.recreate(width as i32, height as i32);
                self.fit_view();
                self.request_frame();
            }
            WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                self.dpr = scale_factor as f32;
                self.fit_view();
                self.request_frame();
            }
            WindowEvent::RedrawRequested if !self.exiting => {
                if let Err(error) = self.draw() {
                    self.fail(event_loop, error);
                }
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        if self.exiting {
            return;
        }
        if !self.transport.has_automatic_frame_demand() {
            event_loop.set_control_flow(ControlFlow::Wait);
            return;
        }

        let now = Instant::now();
        if now >= self.next_redraw {
            self.request_frame();
        }
        event_loop.set_control_flow(ControlFlow::WaitUntil(self.next_redraw));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compile(source: &str) -> CompiledRectSvgAnimation {
        RectSvgAnimationSource::parse(SourceSnapshot::new("player-test.svg", source))
            .unwrap()
            .into_compiled_profile1()
            .unwrap()
    }

    #[test]
    fn playback_range_covers_the_latest_track_end() {
        let compiled = compile(
            r##"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60">
  <rect x="0" y="0" width="10" height="10">
    <animate attributeName="x" from="0" to="10" dur="1s"/>
  </rect>
  <rect x="0" y="20" width="10" height="10">
    <animate attributeName="x" from="0" to="10" begin="500ms" dur="1s" repeatCount="2"/>
  </rect>
</svg>"##,
        );
        let range = program_range(compiled.animation()).unwrap();
        assert_eq!(range.start(), SampleTime::ZERO);
        assert_eq!(range.end(), SampleTime::from_nanoseconds(2_500_000_000));
    }

    #[test]
    fn playback_range_refuses_a_static_source() {
        let compiled = compile(
            r##"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60">
  <rect x="0" y="0" width="10" height="10"/>
</svg>"##,
        );
        assert_eq!(
            program_range(compiled.animation()).unwrap_err(),
            "SVG contains no supported animation tracks"
        );
    }

    #[test]
    fn control_time_uses_stable_minute_second_millisecond_format() {
        assert_eq!(format_time(SampleTime::ZERO), "0:00.000");
        assert_eq!(
            format_time(SampleTime::from_nanoseconds(61_234_000_000)),
            "1:01.234"
        );
    }
}
