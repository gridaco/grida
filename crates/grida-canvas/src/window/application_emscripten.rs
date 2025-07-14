use crate::resource::font_loader::FontMessage;
use crate::resource::image_loader::ImageMessage;
use crate::runtime::camera::Camera2D;
use crate::runtime::scene::Backend;
use crate::runtime::scene::RendererOptions;
use crate::window::application::ApplicationApi;
use crate::window::application::UnknownTargetApplication;
use crate::window::command::ApplicationCommand;
use crate::window::state::{self, GpuState, SurfaceState};
use futures::channel::mpsc;
use math2::{rect::Rectangle, transform::AffineTransform, vector2::Vector2};

#[cfg(target_os = "emscripten")]
use crate::os::emscripten::*;

#[cfg(target_arch = "wasm32")]
use gl::types::*;
#[cfg(target_arch = "wasm32")]
use skia_safe::gpu::gl::FramebufferInfo;

#[cfg(target_arch = "wasm32")]
use std::boxed::Box;

#[cfg(target_os = "emscripten")]
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

#[cfg(target_os = "emscripten")]
unsafe extern "C" fn request_animation_frame_callback(
    time: f64,
    user_data: *mut std::os::raw::c_void,
) -> bool {
    if !user_data.is_null() {
        // Cast the user_data pointer back to &mut EmscriptenApplication and call tick
        let app = &mut *(user_data as *mut EmscriptenApplication);
        app.tick(time);
        // app.redraw_requested();
    }
    true
}

pub struct EmscriptenApplication {
    pub(crate) base: UnknownTargetApplication,
}

impl ApplicationApi for EmscriptenApplication {
    fn tick(&mut self, time: f64) {
        self.base.tick(time);
    }

    fn redraw_requested(&mut self) {
        self.base.redraw_requested();
    }

    fn resize(&mut self, width: u32, height: u32) {
        self.base.resize(width, height);
    }

    fn set_debug(&mut self, debug: bool) {
        self.base.set_debug(debug);
    }

    fn toggle_debug(&mut self) {
        self.base.toggle_debug();
    }

    fn set_verbose(&mut self, verbose: bool) {
        self.base.set_verbose(verbose);
    }

    fn command(&mut self, cmd: ApplicationCommand) -> bool {
        self.base.command(cmd)
    }

    fn get_node_ids_from_point(&mut self, point: Vector2) -> Vec<String> {
        self.base.get_node_ids_from_point(point)
    }

    fn get_node_id_from_point(&mut self, point: Vector2) -> Option<String> {
        self.base.get_node_id_from_point(point)
    }

    fn get_node_ids_from_envelope(&mut self, rect: Rectangle) -> Vec<String> {
        self.base.get_node_ids_from_envelope(rect)
    }

    fn get_node_absolute_bounding_box(&mut self, id: &str) -> Option<Rectangle> {
        self.base.get_node_absolute_bounding_box(id)
    }

    fn export_node_as(
        &mut self,
        id: &str,
        format: crate::export::ExportAs,
    ) -> Option<crate::export::Exported> {
        self.base.export_node_as(id, format)
    }

    fn set_main_camera_transform(&mut self, transform: AffineTransform) {
        self.base.set_main_camera_transform(transform);
    }

    /// Enable or disable rendering of tile overlays.
    fn devtools_rendering_set_show_tiles(&mut self, debug: bool) {
        self.base.devtools_rendering_set_show_tiles(debug);
    }

    fn devtools_rendering_set_show_fps_meter(&mut self, show: bool) {
        self.base.devtools_rendering_set_show_fps_meter(show);
    }

    fn devtools_rendering_set_show_stats(&mut self, show: bool) {
        self.base.devtools_rendering_set_show_stats(show);
    }

    fn devtools_rendering_set_show_hit_testing(&mut self, show: bool) {
        self.base.devtools_rendering_set_show_hit_testing(show);
    }

    fn devtools_rendering_set_show_ruler(&mut self, show: bool) {
        self.base.devtools_rendering_set_show_ruler(show);
    }

    fn load_scene_json(&mut self, json: &str) {
        self.base.load_scene_json(json);
    }

    fn load_dummy_scene(&mut self) {
        self.base.load_dummy_scene();
    }

    /// Load a heavy scene useful for performance benchmarking.
    fn load_benchmark_scene(&mut self, cols: u32, rows: u32) {
        self.base.load_benchmark_scene(cols, rows);
    }
}

impl EmscriptenApplication {
    /// Create a new [`EmscriptenApplication`] with an initialized renderer.
    pub fn new(width: i32, height: i32, options: RendererOptions) -> Self {
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
        let base = UnknownTargetApplication::new(
            state, backend, camera, 120, image_rx, font_rx, None, options,
        );
        let app = Self { base };

        #[cfg(target_os = "emscripten")]
        unsafe {
            // Box and leak the app so its pointer can be used in the callback
            let app_ptr = Box::into_raw(Box::new(app));
            emscripten_request_animation_frame_loop(
                Some(request_animation_frame_callback),
                app_ptr as *mut _,
            );
            // Return the leaked app (ownership is now with the runtime)
            return *Box::from_raw(app_ptr);
        }

        app
    }

    pub fn redraw(&mut self) {
        self.base.redraw();
    }

    /// Update the cursor position in logical screen coordinates and perform a
    /// hit test. Should be called whenever the pointer moves.
    pub fn pointer_move(&mut self, x: f32, y: f32) {
        self.base.pointer_move(x, y);
    }
}
