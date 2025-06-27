use crate::devtools::{fps_overlay, hit_overlay, ruler_overlay, stats_overlay, tile_overlay};
use crate::dummy;
use crate::resource::{FontMessage, ImageMessage};
use crate::runtime::camera::Camera2D;
use crate::runtime::repository::ResourceRepository;
use crate::runtime::scene::{Backend, Renderer};
use crate::window::command::WindowCommand;
use crate::window::scheduler;
use futures::channel::mpsc;

/// Shared application logic independent of the final target.
pub struct UnknownTargetApplication {
    pub(crate) renderer: Renderer,
    pub(crate) state: super::state::State,
    pub(crate) input: super::input::InputState,
    pub(crate) hit_result: Option<crate::node::schema::NodeId>,
    pub(crate) last_hit_test: std::time::Instant,
    pub(crate) hit_test_interval: std::time::Duration,
    pub(crate) image_rx: mpsc::UnboundedReceiver<ImageMessage>,
    pub(crate) font_rx: mpsc::UnboundedReceiver<FontMessage>,
    pub(crate) scheduler: scheduler::FrameScheduler,
    pub(crate) last_frame_time: std::time::Instant,
    pub(crate) last_stats: Option<String>,
    pub(crate) devtools_rendering_show_fps: bool,
    pub(crate) devtools_rendering_show_tiles: bool,
    pub(crate) devtools_rendering_show_stats: bool,
    pub(crate) devtools_rendering_show_hit_overlay: bool,
    pub(crate) devtools_rendering_show_ruler: bool,
}

impl UnknownTargetApplication {
    /// Create a new [`UnknownTargetApplication`] with a renderer configured for
    /// the given backend and camera. Each platform should supply a callback
    /// that requests a redraw on the host when invoked.
    pub fn new(
        state: super::state::State,
        backend: Backend,
        camera: Camera2D,
        target_fps: u32,
        image_rx: mpsc::UnboundedReceiver<ImageMessage>,
        font_rx: mpsc::UnboundedReceiver<FontMessage>,
    ) -> Self {
        let renderer = Renderer::new(backend, Box::new(|| {}), camera);

        Self {
            renderer,
            state,
            input: super::input::InputState::default(),
            hit_result: None,
            last_hit_test: std::time::Instant::now(),
            hit_test_interval: std::time::Duration::from_millis(0),
            image_rx,
            font_rx,
            scheduler: scheduler::FrameScheduler::new(target_fps).with_max_fps(target_fps),
            last_frame_time: std::time::Instant::now(),
            last_stats: None,
            devtools_rendering_show_fps: false,
            devtools_rendering_show_tiles: false,
            devtools_rendering_show_stats: false,
            devtools_rendering_show_hit_overlay: false,
            devtools_rendering_show_ruler: false,
        }
    }

    /// Provide the platform-specific callback used to request a redraw from the
    /// host window.
    pub fn set_request_redraw(&mut self, cb: crate::runtime::scene::RequestRedrawCallback) {
        self.renderer.set_request_redraw(cb);
    }

    pub(crate) fn process_image_queue(&mut self) {
        let mut updated = false;
        while let Ok(Some(msg)) = self.image_rx.try_next() {
            self.renderer.add_image(msg.src.clone(), &msg.data);
            println!("📝 Registered image with renderer: {}", msg.src);
            updated = true;
        }
        if updated {
            self.renderer.invalidate_cache();
        }
    }

    pub(crate) fn process_font_queue(&mut self) {
        let mut updated = false;
        let mut font_count = 0;
        while let Ok(Some(msg)) = self.font_rx.try_next() {
            let family_name = &msg.family;
            self.renderer.add_font(family_name, &msg.data);

            if let Some(style) = &msg.style {
                println!(
                    "📝 Registered font with renderer: '{}' (style: {})",
                    family_name, style
                );
            } else {
                println!("📝 Registered font with renderer: '{}'", family_name);
            }
            font_count += 1;
            updated = true;
        }
        if updated {
            self.renderer.invalidate_cache();
            if font_count > 0 {
                self.print_font_repository_info();
            }
        }
    }

    fn print_font_repository_info(&self) {
        let font_repo = self.renderer.fonts.borrow();
        let family_count = font_repo.family_count();
        let total_font_count = font_repo.total_font_count();

        println!("\n🔍 Font Repository Status:");
        println!("===========================");
        println!("Font families: {}", family_count);
        println!("Total fonts: {}", total_font_count);

        if family_count > 0 {
            println!("\n📋 Registered font families:");
            println!("---------------------------");
            for (i, (family_name, font_variants)) in font_repo.iter().enumerate() {
                println!(
                    "  {}. {} ({} variants)",
                    i + 1,
                    family_name,
                    font_variants.len()
                );
                for (j, font_data) in font_variants.iter().enumerate() {
                    println!("     - Variant {}: {} bytes", j + 1, font_data.len());
                }
            }
        }
        println!("✅ Font repository information printed");
    }

    /// Hit test the current cursor position and store the result.
    pub(crate) fn perform_hit_test(&mut self) {
        if self.hit_test_interval != std::time::Duration::ZERO
            && self.last_hit_test.elapsed() < self.hit_test_interval
        {
            return;
        }
        self.last_hit_test = std::time::Instant::now();

        let camera = &self.renderer.camera;
        let point = camera.screen_to_canvas_point(self.input.cursor);
        let tester = crate::hittest::HitTester::new(self.renderer.get_cache());

        let new_hit_result = tester.hit_first(point);
        if self.hit_result != new_hit_result {
            self.renderer.queue_unstable();
        }
        self.hit_result = new_hit_result;
    }

    /// Handle a [`WindowCommand`]. Returns `true` if the caller should exit.
    pub(crate) fn command(&mut self, cmd: WindowCommand) -> bool {
        match cmd {
            WindowCommand::ZoomIn => {
                let current_zoom = self.renderer.camera.get_zoom();
                self.renderer.camera.set_zoom(current_zoom * 1.2);
                self.renderer.queue_unstable();
            }
            WindowCommand::ZoomOut => {
                let current_zoom = self.renderer.camera.get_zoom();
                self.renderer.camera.set_zoom(current_zoom / 1.2);
                self.renderer.queue_unstable();
            }
            WindowCommand::ZoomDelta { delta } => {
                let current_zoom = self.renderer.camera.get_zoom();
                let zoom_factor = 1.0 + delta;
                if zoom_factor.is_finite() && zoom_factor > 0.0 {
                    self.renderer
                        .camera
                        .set_zoom_at(current_zoom * zoom_factor, self.input.cursor);
                }
                self.renderer.queue_unstable();
            }
            WindowCommand::Pan { tx, ty } => {
                let zoom = self.renderer.camera.get_zoom();
                self.renderer
                    .camera
                    .translate(tx * (1.0 / zoom), ty * (1.0 / zoom));
                self.renderer.queue_unstable();
            }
            WindowCommand::Resize { width, height } => {
                self.resize(width, height);
            }
            WindowCommand::None => {}
        }

        false
    }

    /// Perform a redraw and print diagnostic information.
    pub(crate) fn redraw(&mut self) {
        let __frame_start = std::time::Instant::now();
        let __queue_start = std::time::Instant::now();
        self.process_image_queue();
        self.process_font_queue();
        let __queue_time = __queue_start.elapsed();

        let stats = match self.renderer.flush() {
            Some(stats) => stats,
            None => return,
        };

        let mut overlay_flush_time = std::time::Duration::ZERO;
        let overlay_draw_time: std::time::Duration;

        {
            let __overlay_start = std::time::Instant::now();
            let surface = self.state.surface_mut();
            if self.devtools_rendering_show_fps {
                fps_overlay::FpsMeter::draw(surface, self.scheduler.average_fps());
            }
            if self.devtools_rendering_show_stats {
                if let Some(s) = self.last_stats.as_deref() {
                    stats_overlay::StatsOverlay::draw(surface, s);
                }
            }
            if self.devtools_rendering_show_hit_overlay {
                hit_overlay::HitOverlay::draw(
                    surface,
                    self.hit_result.as_ref(),
                    &self.renderer.camera,
                    self.renderer.get_cache(),
                    &self.renderer.fonts,
                );
            }
            if self.devtools_rendering_show_tiles {
                tile_overlay::TileOverlay::draw(
                    surface,
                    &self.renderer.camera,
                    self.renderer.get_cache().tile.tiles(),
                );
            }
            if self.devtools_rendering_show_ruler {
                ruler_overlay::Ruler::draw(surface, &self.renderer.camera);
            }
            if let Some(mut ctx) = surface.recording_context() {
                if let Some(mut direct) = ctx.as_direct_context() {
                    let __overlay_flush_start = std::time::Instant::now();
                    direct.flush_and_submit();
                    overlay_flush_time = __overlay_flush_start.elapsed();
                }
            }
            overlay_draw_time = __overlay_start.elapsed();
        }

        let __sleep_start = std::time::Instant::now();
        self.scheduler.sleep_to_maintain_fps();
        let __sleep_time = __sleep_start.elapsed();

        let __total_frame_time = __frame_start.elapsed();
        let stat_string = format!(
            "fps*: {:.0} | t: {:.2}ms | render: {:.1}ms | flush: {:.1}ms | overlays: {:.1}ms | frame: {:.1}ms | list: {:.1}ms ({:?}) | draw: {:.1}ms | $:pic: {:?} ({:?} use) | $:geo: {:?} | tiles: {:?} ({:?} use)",
            1.0 / __total_frame_time.as_secs_f64(),
            __total_frame_time.as_secs_f64() * 1000.0,
            stats.total_duration.as_secs_f64() * 1000.0,
            stats.flush_duration.as_secs_f64() * 1000.0,
            (overlay_flush_time.as_secs_f64() + overlay_draw_time.as_secs_f64()) * 1000.0,
            stats.frame_duration.as_secs_f64() * 1000.0,
            stats.frame.display_list_duration.as_secs_f64() * 1000.0,
            stats.frame.display_list_size_estimated,
            stats.draw.painter_duration.as_secs_f64() * 1000.0,
            stats.draw.cache_picture_size,
            stats.draw.cache_picture_used,
            stats.draw.cache_geometry_size,
            stats.draw.tiles_total,
            stats.draw.tiles_used,
        );
        println!("{}", stat_string);
        self.last_stats = Some(stat_string);

        self.last_frame_time = __frame_start;
    }

    /// Update backing resources after a window resize.
    pub(crate) fn resize(&mut self, width: u32, height: u32) {
        self.state.resize(width as i32, height as i32);
        self.renderer.backend = Backend::GL(self.state.surface_mut_ptr());
        self.renderer.invalidate_cache();
        self.renderer.camera.set_size(crate::node::schema::Size {
            width: width as f32,
            height: height as f32,
        });
        self.renderer.queue_unstable();
    }

    /// Update the cursor position and run a debounced hit test.
    #[allow(dead_code)]
    pub(crate) fn pointer_move(&mut self, x: f32, y: f32) {
        self.input.cursor = [x, y];
        self.perform_hit_test();
    }

    /// Enable or disable rendering of tile overlays.
    pub fn devtools_rendering_set_show_tiles(&mut self, debug: bool) {
        self.devtools_rendering_show_tiles = debug;
    }

    pub fn devtools_rendering_set_show_fps_meter(&mut self, show: bool) {
        self.devtools_rendering_show_fps = show;
    }

    pub fn devtools_rendering_set_show_stats(&mut self, show: bool) {
        self.devtools_rendering_show_stats = show;
    }

    pub fn devtools_rendering_set_show_hit_testing(&mut self, show: bool) {
        self.devtools_rendering_show_hit_overlay = show;
    }

    pub fn devtools_rendering_set_show_ruler(&mut self, show: bool) {
        self.devtools_rendering_show_ruler = show;
    }

    // static demo scenes

    /// Load a simple demo scene with a few colored rectangles.
    #[allow(dead_code)]
    pub(crate) fn load_dummy_scene(&mut self) {
        let scene = dummy::create_dummy_scene();
        self.renderer.load_scene(scene);
    }

    /// Load a heavy scene useful for performance benchmarking.
    #[allow(dead_code)]
    pub(crate) fn load_benchmark_scene(&mut self, cols: u32, rows: u32) {
        let scene = dummy::create_benchmark_scene(cols, rows);
        self.renderer.load_scene(scene);
    }
}
