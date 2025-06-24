use crate::font_loader::FontMessage;
use crate::image_loader::ImageMessage;
use crate::node::{factory::NodeFactory, repository::NodeRepository, schema::*};
use crate::repository::ResourceRepository;
use crate::runtime::camera::Camera2D;
use crate::runtime::scene::{Backend, Renderer};
use crate::window::command::WindowCommand;
use crate::window::scheduler;
use crate::window::{fps, hit_overlay, ruler, stats_overlay, tile_overlay};
use futures::channel::mpsc;

/// Shared application logic independent of the final target.
pub struct UnknownTargetApplication {
    pub(crate) renderer: Renderer,
    pub(crate) state: crate::window::state::State,
    pub(crate) camera: Camera2D,
    pub(crate) input: crate::runtime::input::InputState,
    pub(crate) hit_result: Option<crate::node::schema::NodeId>,
    pub(crate) last_hit_test: std::time::Instant,
    pub(crate) hit_test_interval: std::time::Duration,
    pub(crate) image_rx: mpsc::UnboundedReceiver<ImageMessage>,
    pub(crate) font_rx: mpsc::UnboundedReceiver<FontMessage>,
    pub(crate) scheduler: scheduler::FrameScheduler,
    pub(crate) last_frame_time: std::time::Instant,
    pub(crate) last_stats: Option<String>,
    pub(crate) show_fps: bool,
    pub(crate) show_stats: bool,
    pub(crate) show_hit_overlay: bool,
    pub(crate) show_ruler: bool,
}

impl UnknownTargetApplication {
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
        let font_repo = self.renderer.font_repository.borrow();
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

        let camera = &self.camera;
        let point = camera.screen_to_canvas_point(self.input.cursor);
        let tester = crate::hit_test::HitTester::new(self.renderer.scene_cache());

        let new_hit_result = tester.hit_first(point);
        if self.hit_result != new_hit_result {
            self.renderer.queue();
        }
        self.hit_result = new_hit_result;
    }

    /// Handle a [`WindowCommand`]. Returns `true` if the caller should exit.
    pub(crate) fn command(&mut self, cmd: WindowCommand) -> bool {
        match cmd {
            WindowCommand::Close => return true,
            WindowCommand::ZoomIn => {
                let current_zoom = self.camera.get_zoom();
                self.camera.set_zoom(current_zoom * 1.2);
                if self.renderer.set_camera(self.camera.clone()) {
                    self.renderer.queue();
                }
            }
            WindowCommand::ZoomOut => {
                let current_zoom = self.camera.get_zoom();
                self.camera.set_zoom(current_zoom / 1.2);
                if self.renderer.set_camera(self.camera.clone()) {
                    self.renderer.queue();
                }
            }
            WindowCommand::ZoomDelta { delta } => {
                let current_zoom = self.camera.get_zoom();
                let zoom_factor = 1.0 + delta;
                if zoom_factor.is_finite() && zoom_factor > 0.0 {
                    self.camera
                        .set_zoom_at(current_zoom * zoom_factor, self.input.cursor);
                }
                if self.renderer.set_camera(self.camera.clone()) {
                    self.renderer.queue();
                }
            }
            WindowCommand::Pan { tx, ty } => {
                let zoom = self.camera.get_zoom();
                self.camera.translate(tx * (1.0 / zoom), ty * (1.0 / zoom));
                if self.renderer.set_camera(self.camera.clone()) {
                    self.renderer.queue();
                }
            }
            WindowCommand::Resize { width, height } => {
                self.resize(width, height);
            }
            WindowCommand::Redraw => {
                self.redraw();
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
            if self.show_fps {
                fps::FpsMeter::draw(surface, self.scheduler.average_fps());
            }
            if self.show_stats {
                if let Some(s) = self.last_stats.as_deref() {
                    stats_overlay::StatsOverlay::draw(surface, s);
                }
            }
            if self.show_hit_overlay {
                hit_overlay::HitOverlay::draw(
                    surface,
                    self.hit_result.as_ref(),
                    &self.camera,
                    self.renderer.scene_cache(),
                    &self.renderer.font_repository,
                );
            }
            if self.renderer.debug_tiles() {
                tile_overlay::TileOverlay::draw(
                    surface,
                    &self.camera,
                    self.renderer.scene_cache().tile.tiles(),
                );
            }
            if self.show_ruler {
                ruler::Ruler::draw(surface, &self.camera);
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
            "fps*: {:.0} | t: {:.2}ms | render: {:.1}ms | flush: {:.1}ms | overlays: {:.1}ms | frame: {:.1}ms | list: {:.1}ms ({:?}) | draw: {:.1}ms | $:pic: {:?} ({:?} use) | $:geo: {:?} | tiles: {:?} ({:?} use) | q: {:?} | z: {:?}",
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
            __queue_time,
            __sleep_time
        );
        println!("{}", stat_string);
        self.last_stats = Some(stat_string);

        self.last_frame_time = __frame_start;

        if stats.frame.should_repaint_all {
            self.renderer.queue();
        }
    }

    /// Update backing resources after a window resize.
    pub(crate) fn resize(&mut self, width: u32, height: u32) {
        self.state.resize(width as i32, height as i32);
        self.renderer
            .set_backend(Backend::GL(self.state.surface_mut_ptr()));
        self.renderer.invalidate_cache();

        self.camera.size = crate::node::schema::Size {
            width: width as f32,
            height: height as f32,
        };
        // Always update the camera and queue a new frame after resizing
        // to ensure the surface repaints even if the quantized
        // transform does not change.
        self.renderer.set_camera(self.camera.clone());
        self.renderer.queue();
    }

    /// Update the cursor position and run a debounced hit test.
    pub(crate) fn pointer_move(&mut self, x: f32, y: f32) {
        self.input.cursor = [x, y];
        self.perform_hit_test();
    }

    /// Load a simple demo scene with a few colored rectangles.
    pub(crate) fn load_dummy_scene(&mut self) {
        let nf = NodeFactory::new();
        let mut nodes = NodeRepository::new();

        let mut rect1 = nf.create_rectangle_node();
        rect1.base.name = "Red Rectangle".to_string();
        rect1.transform = math2::transform::AffineTransform::new(100.0, 100.0, 0.0);
        rect1.size = Size {
            width: 150.0,
            height: 100.0,
        };
        rect1.fill = Paint::Solid(SolidPaint {
            color: Color(255, 0, 0, 255),
            opacity: 1.0,
        });
        let rect1_id = rect1.base.id.clone();
        nodes.insert(Node::Rectangle(rect1));

        let mut rect2 = nf.create_rectangle_node();
        rect2.base.name = "Blue Rectangle".to_string();
        rect2.transform = math2::transform::AffineTransform::new(300.0, 100.0, 0.0);
        rect2.size = Size {
            width: 120.0,
            height: 80.0,
        };
        rect2.fill = Paint::Solid(SolidPaint {
            color: Color(0, 0, 255, 255),
            opacity: 1.0,
        });
        let rect2_id = rect2.base.id.clone();
        nodes.insert(Node::Rectangle(rect2));

        let mut rect3 = nf.create_rectangle_node();
        rect3.base.name = "Green Rectangle".to_string();
        rect3.transform = math2::transform::AffineTransform::new(500.0, 100.0, 0.0);
        rect3.size = Size {
            width: 100.0,
            height: 120.0,
        };
        rect3.fill = Paint::Solid(SolidPaint {
            color: Color(0, 255, 0, 255),
            opacity: 1.0,
        });
        let rect3_id = rect3.base.id.clone();
        nodes.insert(Node::Rectangle(rect3));

        let scene = Scene {
            id: "dummy".to_string(),
            name: "Dummy Scene".to_string(),
            transform: math2::transform::AffineTransform::identity(),
            children: vec![rect1_id, rect2_id, rect3_id],
            nodes,
            background_color: Some(Color(240, 240, 240, 255)),
        };

        self.renderer.load_scene(scene);
    }

    /// Load a heavy scene useful for performance benchmarking.
    pub(crate) fn load_benchmark_scene(&mut self, cols: u32, rows: u32) {
        let nf = NodeFactory::new();
        let mut nodes = NodeRepository::new();
        let mut children = Vec::new();

        let size = 20.0f32;
        let spacing = 5.0f32;
        for y in 0..rows {
            for x in 0..cols {
                let mut rect = nf.create_rectangle_node();
                rect.base.name = format!("rect-{}-{}", x, y);
                rect.transform = math2::transform::AffineTransform::new(
                    x as f32 * (size + spacing),
                    y as f32 * (size + spacing),
                    0.0,
                );
                rect.size = Size {
                    width: size,
                    height: size,
                };
                rect.fill = Paint::Solid(SolidPaint {
                    color: Color(((x * 5) % 255) as u8, ((y * 3) % 255) as u8, 128, 255),
                    opacity: 1.0,
                });
                let id = rect.base.id.clone();
                nodes.insert(Node::Rectangle(rect));
                children.push(id);
            }
        }

        let scene = Scene {
            id: "benchmark".to_string(),
            name: "Benchmark Scene".to_string(),
            transform: math2::transform::AffineTransform::identity(),
            children,
            nodes,
            background_color: Some(Color(255, 255, 255, 255)),
        };

        self.renderer.load_scene(scene);
    }

    /// Enable or disable rendering of tile overlays.
    pub fn devtools_rendering_set_show_tiles(&mut self, debug: bool) {
        self.renderer.devtools_rendering_set_show_tiles(debug);
    }

    /// Returns `true` if tile overlay rendering is enabled.
    pub fn debug_tiles(&self) -> bool {
        self.renderer.debug_tiles()
    }

    pub fn devtools_rendering_set_show_fps_meter(&mut self, show: bool) {
        self.show_fps = show;
    }

    pub fn show_fps(&self) -> bool {
        self.show_fps
    }

    pub fn devtools_rendering_set_show_stats(&mut self, show: bool) {
        self.show_stats = show;
    }

    pub fn show_stats(&self) -> bool {
        self.show_stats
    }

    pub fn devtools_rendering_set_show_hit_testing(&mut self, show: bool) {
        self.show_hit_overlay = show;
    }

    pub fn show_hit_overlay(&self) -> bool {
        self.show_hit_overlay
    }

    pub fn set_show_ruler(&mut self, show: bool) {
        self.show_ruler = show;
    }

    pub fn show_ruler(&self) -> bool {
        self.show_ruler
    }
}
