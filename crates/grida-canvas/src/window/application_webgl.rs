use crate::resource::font_loader::FontMessage;
use crate::resource::image_loader::ImageMessage;
use crate::runtime::camera::Camera2D;
use crate::runtime::scene::Backend;
use crate::window::application::ApplicationApi;
use crate::window::application::UnknownTargetApplication;
use crate::window::command::ApplicationCommand;
use crate::window::state::{self, GpuState, SurfaceState};
use futures::channel::mpsc;
use math2::{rect::Rectangle, transform::AffineTransform, vector2::Vector2};

#[cfg(target_arch = "wasm32")]
use gl::types::*;
#[cfg(target_arch = "wasm32")]
use skia_safe::gpu::gl::FramebufferInfo;

#[cfg(target_arch = "wasm32")]
use std::boxed::Box;

#[cfg(target_arch = "wasm32")]
unsafe extern "C" {
    pub fn emscripten_GetProcAddress(
        name: *const ::std::os::raw::c_char,
    ) -> *const ::std::os::raw::c_void;
}

#[cfg(target_arch = "wasm32")]
fn init_gl() {
    unsafe {
        gl::load_with(|addr| {
            let addr = std::ffi::CString::new(addr).unwrap();
            emscripten_GetProcAddress(addr.into_raw() as *const _) as *const _
        });
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn init_gl() {
    // no-op
}

#[cfg(target_arch = "wasm32")]
fn create_gpu_state() -> GpuState {
    let interface = skia_safe::gpu::gl::Interface::new_native().unwrap();
    let context = skia_safe::gpu::direct_contexts::make_gl(interface, None).unwrap();
    let framebuffer_info = {
        let mut fboid: GLint = 0;
        unsafe { gl::GetIntegerv(gl::FRAMEBUFFER_BINDING, &mut fboid) };

        FramebufferInfo {
            fboid: fboid.try_into().unwrap(),
            format: skia_safe::gpu::gl::Format::RGBA8.into(),
            protected: skia_safe::gpu::Protected::No,
        }
    };

    GpuState {
        context,
        framebuffer_info,
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn create_gpu_state() -> GpuState {
    // no-op
    panic!("create_gpu_state is not supported on native");
}

pub struct WebGlApplication {
    pub(crate) app: UnknownTargetApplication,
}

impl ApplicationApi for WebGlApplication {
    fn tick(&mut self) {
        self.app.tick();
    }

    fn resize(&mut self, width: u32, height: u32) {
        self.app.resize(width, height);
    }

    fn set_debug(&mut self, debug: bool) {
        self.app.set_debug(debug);
    }

    fn toggle_debug(&mut self) {
        self.app.toggle_debug();
    }

    fn set_verbose(&mut self, verbose: bool) {
        self.app.set_verbose(verbose);
    }

    fn command(&mut self, cmd: ApplicationCommand) -> bool {
        self.app.command(cmd)
    }

    fn get_node_ids_from_point(&mut self, point: Vector2) -> Vec<String> {
        self.app.get_node_ids_from_point(point)
    }

    fn get_node_id_from_point(&mut self, point: Vector2) -> Option<String> {
        self.app.get_node_id_from_point(point)
    }

    fn get_node_ids_from_envelope(&mut self, rect: Rectangle) -> Vec<String> {
        self.app.get_node_ids_from_envelope(rect)
    }

    fn get_node_absolute_bounding_box(&mut self, id: &str) -> Option<Rectangle> {
        self.app.get_node_absolute_bounding_box(id)
    }

    fn set_main_camera_transform(&mut self, transform: AffineTransform) {
        self.app.set_main_camera_transform(transform);
    }

    /// Enable or disable rendering of tile overlays.
    fn devtools_rendering_set_show_tiles(&mut self, debug: bool) {
        self.app.devtools_rendering_set_show_tiles(debug);
    }

    fn devtools_rendering_set_show_fps_meter(&mut self, show: bool) {
        self.app.devtools_rendering_set_show_fps_meter(show);
    }

    fn devtools_rendering_set_show_stats(&mut self, show: bool) {
        self.app.devtools_rendering_set_show_stats(show);
    }

    fn devtools_rendering_set_show_hit_testing(&mut self, show: bool) {
        self.app.devtools_rendering_set_show_hit_testing(show);
    }

    fn devtools_rendering_set_show_ruler(&mut self, show: bool) {
        self.app.devtools_rendering_set_show_ruler(show);
    }

    fn load_scene_json(&mut self, json: &str) {
        self.app.load_scene_json(json);
    }

    fn load_dummy_scene(&mut self) {
        self.app.load_dummy_scene();
    }

    /// Load a heavy scene useful for performance benchmarking.
    fn load_benchmark_scene(&mut self, cols: u32, rows: u32) {
        self.app.load_benchmark_scene(cols, rows);
    }
}

impl WebGlApplication {
    /// Create a new [`WebGlApplication`] with an initialized renderer.
    pub fn new(width: i32, height: i32) -> Self {
        init_gl();
        let mut gpu_state = create_gpu_state();
        let surface = state::create_surface(&mut gpu_state, width, height);
        let GpuState {
            context,
            framebuffer_info,
        } = gpu_state;
        let mut state = SurfaceState::from_parts(context, framebuffer_info, surface);

        let (_image_tx, image_rx) = mpsc::unbounded::<ImageMessage>();
        let (_font_tx, font_rx) = mpsc::unbounded::<FontMessage>();

        let camera = Camera2D::new(crate::node::schema::Size {
            width: width as f32,
            height: height as f32,
        });

        let backend = Backend::GL(state.surface_mut_ptr());
        let app = Self {
            app: UnknownTargetApplication::new(state, backend, camera, 120, image_rx, font_rx),
        };

        app
    }

    pub fn redraw(&mut self) {
        self.app.redraw();
    }

    /// Update the cursor position in logical screen coordinates and perform a
    /// hit test. Should be called whenever the pointer moves.
    pub fn pointer_move(&mut self, x: f32, y: f32) {
        self.app.pointer_move(x, y);
    }
}
