use crate::devtools::{fps_overlay, hit_overlay, ruler_overlay, stats_overlay, tile_overlay};
use crate::dummy;
use crate::export::{export_node_as, ExportAs, Exported};
use crate::node::schema::Scene;
use crate::resource::{FontMessage, ImageMessage};
use crate::runtime::camera::Camera2D;
use crate::runtime::repository::ResourceRepository;
use crate::runtime::scene::{Backend, FrameFlushResult, Renderer};
use crate::sys::clock;
use crate::sys::scheduler;
use crate::sys::timer::TimerMgr;
use crate::window::command::ApplicationCommand;
use futures::channel::mpsc;
use math2::{rect::Rectangle, transform::AffineTransform, vector2::Vector2};

pub trait ApplicationApi {
    fn tick(&mut self, time: f64);
    fn resize(&mut self, width: u32, height: u32);
    fn redraw_requested(&mut self);

    /// Handle a [`ApplicationCommand`]. Returns `true` if the caller should exit.
    fn command(&mut self, cmd: ApplicationCommand) -> bool;
    //
    fn set_debug(&mut self, debug: bool);
    fn toggle_debug(&mut self);
    fn set_verbose(&mut self, verbose: bool);

    fn set_main_camera_transform(&mut self, transform: AffineTransform);

    /// returns the top-most node id at the point, if any.
    fn get_node_id_from_point(&mut self, point: Vector2) -> Option<String>;
    /// returns all node ids at the point, if any. ordered from top to bottom.
    fn get_node_ids_from_point(&mut self, point: Vector2) -> Vec<String>;
    /// returns all node ids intersecting with the envelope in canvas space.
    fn get_node_ids_from_envelope(&mut self, envelope: Rectangle) -> Vec<String>;
    fn get_node_absolute_bounding_box(&mut self, id: &str) -> Option<Rectangle>;
    fn export_node_as(&mut self, id: &str, format: ExportAs) -> Option<Exported>;

    /// Enable or disable rendering of tile overlays.
    fn devtools_rendering_set_show_tiles(&mut self, debug: bool);
    fn devtools_rendering_set_show_fps_meter(&mut self, show: bool);
    fn devtools_rendering_set_show_stats(&mut self, show: bool);
    fn devtools_rendering_set_show_hit_testing(&mut self, show: bool);
    fn devtools_rendering_set_show_ruler(&mut self, show: bool);

    /// Load a scene from a JSON string using the `io_grida` parser.
    fn load_scene_json(&mut self, json: &str);

    // static demo scenes
    /// Load a simple demo scene with a few colored rectangles.
    fn load_dummy_scene(&mut self);
    /// Load a heavy scene useful for performance benchmarking.
    fn load_benchmark_scene(&mut self, cols: u32, rows: u32);
}

/// Host events
pub enum HostEvent {
    /// tick the clock for the application
    /// the Tick Hz should aim higher than the target FPS
    Tick,

    /// request a redraw
    RedrawRequest,

    /// notify image loaded
    ImageLoaded(ImageMessage),

    /// notify font loaded
    FontLoaded(FontMessage),

    /// load a new scene on the renderer
    LoadScene(Scene),
}

pub struct Clipboard {
    pub(crate) data: Option<Vec<u8>>,
}

impl Default for Clipboard {
    fn default() -> Self {
        Self { data: None }
    }
}

impl Clipboard {
    pub(crate) fn set_data(&mut self, data: Vec<u8>) {
        self.data = Some(data);
    }
}

/// Shared application logic independent of the final target.
pub struct UnknownTargetApplication {
    pub(crate) debug: bool,
    pub(crate) verbose: bool,
    pub(crate) clock: clock::EventLoopClock,
    pub(crate) timer: TimerMgr,
    pub(crate) clipboard: Clipboard,
    pub(crate) scheduler: scheduler::FrameScheduler,
    pub(crate) request_redraw: crate::runtime::scene::RequestRedrawCallback,
    pub(crate) renderer: Renderer,
    pub(crate) state: super::state::SurfaceState,
    pub(crate) input: super::input::InputState,
    pub(crate) hit_test_result: Option<crate::node::schema::NodeId>,
    pub(crate) hit_test_last: std::time::Instant,
    pub(crate) hit_test_interval: std::time::Duration,
    pub(crate) image_rx: mpsc::UnboundedReceiver<ImageMessage>,
    pub(crate) font_rx: mpsc::UnboundedReceiver<FontMessage>,
    pub(crate) last_frame_time: std::time::Instant,
    pub(crate) last_stats: Option<String>,
    pub(crate) devtools_selection: Option<crate::node::schema::NodeId>,
    pub(crate) devtools_rendering_show_fps: bool,
    pub(crate) devtools_rendering_show_tiles: bool,
    pub(crate) devtools_rendering_show_stats: bool,
    pub(crate) devtools_rendering_show_hit_overlay: bool,
    pub(crate) devtools_rendering_show_ruler: bool,
    pub(crate) queue_stable_debounce_millis: u64,

    /// timer id for debouncing stable frame queues
    queue_stable_timer: Option<crate::sys::timer::TimerId>,
}

impl ApplicationApi for UnknownTargetApplication {
    /// tick the application clock and timer.
    /// this can be called as many times as needed, from different sources (e.g. isolated timer thread, or raf, as the platform requires)
    fn tick(&mut self, time: f64) {
        self.clock.tick(time);
        self.timer.tick(self.clock.now());
    }

    /// Update backing resources after a window resize.
    fn resize(&mut self, width: u32, height: u32) {
        self.state.resize(width as i32, height as i32);
        self.renderer.backend = Backend::GL(self.state.surface_mut_ptr());
        self.renderer.invalidate_cache();
        self.renderer.camera.set_size(crate::node::schema::Size {
            width: width as f32,
            height: height as f32,
        });
        self.queue();
    }

    fn redraw_requested(&mut self) {
        self.redraw();
    }

    fn command(&mut self, cmd: ApplicationCommand) -> bool {
        match cmd {
            ApplicationCommand::ZoomIn => {
                let current_zoom = self.renderer.camera.get_zoom();
                self.renderer.camera.set_zoom(current_zoom * 1.2);
                self.queue();
                return true;
            }
            ApplicationCommand::ZoomOut => {
                let current_zoom = self.renderer.camera.get_zoom();
                self.renderer.camera.set_zoom(current_zoom / 1.2);
                self.queue();
                return true;
            }
            ApplicationCommand::ZoomDelta { delta } => {
                let current_zoom = self.renderer.camera.get_zoom();
                let zoom_factor = 1.0 + delta;
                if zoom_factor.is_finite() && zoom_factor > 0.0 {
                    self.renderer
                        .camera
                        .set_zoom_at(current_zoom * zoom_factor, self.input.cursor);
                }
                self.queue();
                return true;
            }
            ApplicationCommand::Pan { tx, ty } => {
                let zoom = self.renderer.camera.get_zoom();
                self.renderer
                    .camera
                    .translate(tx * (1.0 / zoom), ty * (1.0 / zoom));
                self.queue();
                return true;
            }
            ApplicationCommand::ToggleDebugMode => {
                self.toggle_debug();
                self.queue();
                return true;
            }
            ApplicationCommand::TryCopyAsPNG => {
                if let Some(id) = self.devtools_selection.clone() {
                    let exported = self.export_node_as(&id, ExportAs::png());
                    if let Some(exported) = exported {
                        self.clipboard.set_data(exported.data().to_vec());
                        return true;
                    }
                }
            }
            ApplicationCommand::None => {}
        }

        false
    }

    fn set_debug(&mut self, debug: bool) {
        self.debug = debug;

        self.devtools_rendering_show_fps = self.debug;
        self.devtools_rendering_show_tiles = self.debug;
        self.devtools_rendering_show_stats = self.debug;
        self.devtools_rendering_show_hit_overlay = self.debug;
        self.devtools_rendering_show_ruler = self.debug;
    }

    fn toggle_debug(&mut self) {
        self.set_debug(!self.debug);
    }

    fn set_verbose(&mut self, verbose: bool) {
        self.verbose = verbose;
    }

    fn set_main_camera_transform(&mut self, transform: AffineTransform) {
        self.renderer.camera.set_transform(transform);
        self.queue();
    }

    fn get_node_ids_from_point(&mut self, point: Vector2) -> Vec<String> {
        let tester = self.get_hit_tester();
        tester.hits(point)
    }

    fn get_node_id_from_point(&mut self, point: Vector2) -> Option<String> {
        let tester = self.get_hit_tester();
        tester.hit_first(point)
    }

    fn get_node_ids_from_envelope(&mut self, envelope: Rectangle) -> Vec<String> {
        let tester = self.get_hit_tester();
        tester.intersects(&envelope)
    }

    fn get_node_absolute_bounding_box(&mut self, id: &str) -> Option<Rectangle> {
        self.renderer.get_cache().geometry().get_world_bounds(id)
    }

    fn export_node_as(&mut self, id: &str, format: ExportAs) -> Option<Exported> {
        if let Some(scene) = self.renderer.scene.as_ref() {
            return export_node_as(scene, &self.renderer.get_cache().geometry, id, format);
        }
        return None;
    }

    fn devtools_rendering_set_show_tiles(&mut self, debug: bool) {
        self.devtools_rendering_show_tiles = debug;
    }

    fn devtools_rendering_set_show_fps_meter(&mut self, show: bool) {
        self.devtools_rendering_show_fps = show;
    }

    fn devtools_rendering_set_show_stats(&mut self, show: bool) {
        self.devtools_rendering_show_stats = show;
    }

    fn devtools_rendering_set_show_hit_testing(&mut self, show: bool) {
        self.devtools_rendering_show_hit_overlay = show;
    }

    fn devtools_rendering_set_show_ruler(&mut self, show: bool) {
        self.devtools_rendering_show_ruler = show;
    }

    fn load_scene_json(&mut self, json: &str) {
        use crate::io::io_grida;

        let Ok(file) = io_grida::parse(json) else {
            let err = io_grida::parse(json).unwrap_err();
            eprintln!("failed to parse scene json: {}", err);
            return;
        };

        let nodes = file
            .document
            .nodes
            .into_iter()
            .map(|(id, node)| (id, node.into()))
            .collect();

        let scene_id = file.document.entry_scene_id.unwrap_or_else(|| {
            file.document
                .scenes
                .keys()
                .next()
                .cloned()
                .unwrap_or_else(|| "scene".to_string())
        });

        if let Some(scene) = file.document.scenes.get(&scene_id) {
            let scene = crate::node::schema::Scene {
                id: scene_id,
                name: scene.name.clone(),
                children: scene.children.clone(),
                nodes,
                background_color: scene.background_color.clone().map(Into::into),
            };
            self.renderer.load_scene(scene);
        }
    }

    fn load_dummy_scene(&mut self) {
        let scene = dummy::create_dummy_scene();
        self.renderer.load_scene(scene);
    }

    fn load_benchmark_scene(&mut self, cols: u32, rows: u32) {
        let scene = dummy::create_benchmark_scene(cols, rows);
        self.renderer.load_scene(scene);
    }
}

impl UnknownTargetApplication {
    /// Create a new [`UnknownTargetApplication`] with a renderer configured for
    /// the given backend and camera. Each platform should supply a callback
    /// that requests a redraw on the host when invoked.
    pub fn new(
        state: super::state::SurfaceState,
        backend: Backend,
        camera: Camera2D,
        target_fps: u32,
        image_rx: mpsc::UnboundedReceiver<ImageMessage>,
        font_rx: mpsc::UnboundedReceiver<FontMessage>,
        request_redraw: Option<crate::runtime::scene::RequestRedrawCallback>,
        options: crate::runtime::scene::RendererOptions,
    ) -> Self {
        let request_redraw = request_redraw.unwrap_or_else(|| std::sync::Arc::new(|| {}));
        let renderer =
            Renderer::new_with_options(backend, Some(request_redraw.clone()), camera, options);

        let debug = false;

        Self {
            debug,
            verbose: false,
            clock: clock::EventLoopClock::new(),
            clipboard: Clipboard::default(),
            request_redraw,
            renderer,
            state,
            input: super::input::InputState::default(),
            hit_test_result: None,
            hit_test_last: std::time::Instant::now(),
            hit_test_interval: std::time::Duration::from_millis(0),
            image_rx,
            font_rx,
            scheduler: scheduler::FrameScheduler::new(target_fps).with_max_fps(target_fps),
            last_frame_time: std::time::Instant::now(),
            last_stats: None,
            devtools_selection: None,
            devtools_rendering_show_fps: debug,
            devtools_rendering_show_tiles: debug,
            devtools_rendering_show_stats: debug,
            devtools_rendering_show_hit_overlay: debug,
            devtools_rendering_show_ruler: debug,
            timer: TimerMgr::new(),
            queue_stable_timer: None,
            queue_stable_debounce_millis: 50,
        }
    }

    /// Request a redraw from the host window using the provided callback.
    pub fn request_redraw(&self) {
        (self.request_redraw)();
    }

    fn queue(&mut self) {
        self.renderer.queue_unstable();

        if let Some(id) = self.queue_stable_timer.take() {
            self.timer.cancel(id);
        }

        let renderer_ptr: *mut Renderer = &mut self.renderer;
        self.queue_stable_timer = Some(self.timer.set_timeout(
            std::time::Duration::from_millis(self.queue_stable_debounce_millis),
            move || unsafe {
                (*renderer_ptr).queue_stable();
            },
        ));

        // TODO: can't use debounce - let's try this later
        // self.debounce(
        //     std::time::Duration::from_millis(100),
        //     || self.renderer.queue_stable(),
        //     false,
        //     true,
        // );
    }

    fn process_image_queue(&mut self) {
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

    fn process_font_queue(&mut self) {
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

    fn get_hit_tester(&mut self) -> crate::hittest::HitTester {
        crate::hittest::HitTester::new(self.renderer.get_cache())
    }

    fn verbose(&self, msg: &str) {
        if self.verbose {
            println!("{}", msg);
        }
    }

    /// Hit test the current cursor position and store the result.
    pub(crate) fn perform_hit_test(&mut self) {
        if self.hit_test_interval != std::time::Duration::ZERO
            && self.hit_test_last.elapsed() < self.hit_test_interval
        {
            return;
        }
        self.hit_test_last = std::time::Instant::now();
        let camera = &self.renderer.camera;
        let point = camera.screen_to_canvas_point(self.input.cursor);
        let new_hit_result = self.get_node_id_from_point(point);
        if self.hit_test_result != new_hit_result {
            self.queue();
        }
        self.hit_test_result = new_hit_result;
    }

    pub(crate) fn resource_loaded(&mut self) {
        self.process_image_queue();
        self.process_font_queue();
    }

    /// Perform a redraw and print diagnostic information.
    pub(crate) fn redraw(&mut self) {
        let now = self.clock.now() + self.last_frame_time.elapsed().as_secs_f64() * 1000.0;
        self.tick(now);

        let __frame_start = std::time::Instant::now();

        let stats = match self.renderer.flush() {
            FrameFlushResult::OK(stats) => stats,
            FrameFlushResult::NoFrame => {
                self.verbose("redraw/noframe: No frame to flush");
                return;
            }
            FrameFlushResult::NoScene => {
                self.verbose("redraw/noscene: No scene to flush");
                return;
            }
            FrameFlushResult::NoPending => {
                self.verbose("redraw/nopending: No pending frame to flush");
                return;
            }
        };

        let overlay_time = self.draw_and_flush_devtools_overlay();

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
            overlay_time.as_secs_f64() * 1000.0,
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

        self.verbose(&stat_string);

        self.last_stats = Some(stat_string);

        self.last_frame_time = __frame_start;
    }

    fn draw_and_flush_devtools_overlay(&mut self) -> std::time::Duration {
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
                    stats_overlay::StatsOverlay::draw(surface, s, &self.clock);
                }
            }
            if self.devtools_rendering_show_hit_overlay {
                hit_overlay::HitOverlay::draw(
                    surface,
                    self.hit_test_result.as_ref(),
                    self.devtools_selection.as_ref(),
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
        overlay_flush_time + overlay_draw_time
    }

    /// Update the cursor position and run a debounced hit test.
    #[allow(dead_code)]
    pub(crate) fn pointer_move(&mut self, x: f32, y: f32) {
        self.input.cursor = [x, y];
        self.perform_hit_test();
    }

    // Timer convenience methods

    /// Sets a timeout that will execute the callback after the specified duration
    ///
    /// Returns a `TimerId` that can be used to cancel the timeout
    pub fn set_timeout<F>(
        &mut self,
        duration: std::time::Duration,
        callback: F,
    ) -> crate::sys::timer::TimerId
    where
        F: FnOnce() + Send + 'static,
    {
        self.timer.set_timeout(duration, callback)
    }

    /// Sets a repeating timer that will execute the callback at regular intervals
    ///
    /// Returns a `TimerId` that can be used to cancel the interval
    pub fn set_interval<F>(
        &mut self,
        interval: std::time::Duration,
        callback: F,
    ) -> crate::sys::timer::TimerId
    where
        F: Fn() + Send + 'static,
    {
        self.timer.set_interval(interval, callback)
    }

    /// Create a debounced function associated with the application's timer manager.
    pub fn debounce<F>(
        &mut self,
        wait: std::time::Duration,
        callback: F,
        leading: bool,
        trailing: bool,
    ) -> crate::sys::timer::Debounce
    where
        F: FnMut() + Send + 'static,
    {
        self.timer.debounce(wait, callback, leading, trailing)
    }

    /// Cancels a timer by its ID
    ///
    /// Returns `true` if the timer was found and cancelled, `false` otherwise
    pub fn cancel_timer(&mut self, id: crate::sys::timer::TimerId) -> bool {
        self.timer.cancel(id)
    }
}
