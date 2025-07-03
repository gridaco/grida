use crate::resource::font_loader::FontMessage;
use crate::resource::image_loader::ImageMessage;
use crate::runtime::camera::Camera2D;
use crate::runtime::scene::Backend;
use crate::window::application::UnknownTargetApplication;
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

    pub fn tick(&mut self) {
        self.app.tick();
    }

    pub fn resize(&mut self, width: i32, height: i32) {
        self.app.resize(width as u32, height as u32);
    }

    pub fn redraw(&mut self) {
        self.app.redraw();
    }

    /// Update the cursor position in logical screen coordinates and perform a
    /// hit test. Should be called whenever the pointer moves.
    pub fn pointer_move(&mut self, x: f32, y: f32) {
        self.app.pointer_move(x, y);
    }

    pub fn get_node_ids_from_point(&mut self, x: f32, y: f32) -> Vec<String> {
        self.app.get_node_ids_from_point([x, y])
    }

    pub fn get_node_id_from_point(&mut self, x: f32, y: f32) -> Option<String> {
        self.app.get_node_id_from_point([x, y])
    }

    pub fn get_node_ids_from_envelope(&mut self, rect: Rectangle) -> Vec<String> {
        self.app.get_node_ids_from_envelope(rect)
    }

    pub fn set_main_camera_transform(&mut self, transform: AffineTransform) {
        self.app.set_main_camera_transform(transform);
    }

    /// Forward a [`ApplicationCommand`] to the inner application.
    pub fn command(&mut self, cmd: crate::window::command::ApplicationCommand) {
        self.app.command(cmd);
    }

    pub fn load_dummy_scene(&mut self) {
        self.app.load_dummy_scene();
    }

    /// Load a heavy scene useful for performance benchmarking.
    pub fn load_benchmark_scene(&mut self, cols: u32, rows: u32) {
        self.app.load_benchmark_scene(cols, rows);
    }

    /// Load a scene from a JSON string using the `io_json` parser.
    pub fn load_scene_json(&mut self, json: &str) {
        use crate::io::io_json;
        use math2::transform::AffineTransform;

        let Ok(file) = io_json::parse(json) else {
            let err = io_json::parse(json).unwrap_err();
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
                transform: AffineTransform::identity(),
                children: scene.children.clone(),
                nodes,
                background_color: scene.background_color.clone().map(Into::into),
            };
            self.app.renderer.load_scene(scene);
        }
    }

    /// Enable or disable rendering of tile overlays.
    pub fn devtools_rendering_set_show_tiles(&mut self, debug: bool) {
        self.app.devtools_rendering_set_show_tiles(debug);
    }

    pub fn devtools_rendering_set_show_fps_meter(&mut self, show: bool) {
        self.app.devtools_rendering_set_show_fps_meter(show);
    }

    pub fn devtools_rendering_set_show_stats(&mut self, show: bool) {
        self.app.devtools_rendering_set_show_stats(show);
    }

    pub fn devtools_rendering_set_show_hit_testing(&mut self, show: bool) {
        self.app.devtools_rendering_set_show_hit_testing(show);
    }

    pub fn devtools_rendering_set_show_ruler(&mut self, show: bool) {
        self.app.devtools_rendering_set_show_ruler(show);
    }
}
