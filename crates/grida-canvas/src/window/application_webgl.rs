use crate::font_loader::FontMessage;
use crate::image_loader::ImageMessage;
use crate::node::factory::*;
use crate::node::schema::*;
use crate::runtime::camera::Camera2D;
use crate::runtime::scene::{Backend, Renderer};
use crate::window::application::UnknownTargetApplication;
use crate::window::scheduler;
use crate::window::state::{self, GpuState, State};
use futures::channel::mpsc;

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

#[cfg(target_arch = "wasm32")]
pub struct WebGlApplication {
    pub(crate) app: UnknownTargetApplication,
}

#[cfg(target_arch = "wasm32")]
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
        let mut state = State::from_parts(context, framebuffer_info, surface);

        let (_image_tx, image_rx) = mpsc::unbounded::<ImageMessage>();
        let (_font_tx, font_rx) = mpsc::unbounded::<FontMessage>();

        let mut renderer = Renderer::new();
        renderer.set_backend(Backend::GL(state.surface_mut_ptr()));

        let camera = Camera2D::new(crate::node::schema::Size {
            width: width as f32,
            height: height as f32,
        });
        renderer.set_camera(camera.clone());

        Self {
            app: UnknownTargetApplication {
                renderer,
                state,
                camera,
                input: crate::runtime::input::InputState::default(),
                hit_result: None,
                last_hit_test: std::time::Instant::now(),
                image_rx,
                font_rx,
                scheduler: scheduler::FrameScheduler::new(60).with_max_fps(60),
                last_frame_time: std::time::Instant::now(),
                last_stats: None,
            },
        }
    }

    pub fn resize(&mut self, width: i32, height: i32) {
        self.app.resize(width as u32, height as u32);
    }

    pub fn redraw(&mut self) {
        self.app.redraw();
    }

    pub fn load_dummy_scene(&mut self) {
        use crate::node::repository::NodeRepository;
        use crate::node::schema::*;
        use math2::transform::AffineTransform;

        let nf = NodeFactory::new();
        let mut nodes = NodeRepository::new();

        // Create a few rectangles with different colors and positions
        let mut rect1 = nf.create_rectangle_node();
        rect1.base.name = "Red Rectangle".to_string();
        rect1.transform = AffineTransform::new(100.0, 100.0, 0.0);
        rect1.size = Size {
            width: 150.0,
            height: 100.0,
        };
        rect1.fill = Paint::Solid(SolidPaint {
            color: Color(255, 0, 0, 255), // Red
            opacity: 1.0,
        });
        let rect1_id = rect1.base.id.clone();
        nodes.insert(Node::Rectangle(rect1));

        let mut rect2 = nf.create_rectangle_node();
        rect2.base.name = "Blue Rectangle".to_string();
        rect2.transform = AffineTransform::new(300.0, 100.0, 0.0);
        rect2.size = Size {
            width: 120.0,
            height: 80.0,
        };
        rect2.fill = Paint::Solid(SolidPaint {
            color: Color(0, 0, 255, 255), // Blue
            opacity: 1.0,
        });
        let rect2_id = rect2.base.id.clone();
        nodes.insert(Node::Rectangle(rect2));

        let mut rect3 = nf.create_rectangle_node();
        rect3.base.name = "Green Rectangle".to_string();
        rect3.transform = AffineTransform::new(500.0, 100.0, 0.0);
        rect3.size = Size {
            width: 100.0,
            height: 120.0,
        };
        rect3.fill = Paint::Solid(SolidPaint {
            color: Color(0, 255, 0, 255), // Green
            opacity: 1.0,
        });
        let rect3_id = rect3.base.id.clone();
        nodes.insert(Node::Rectangle(rect3));

        // Create a scene with the rectangles
        let scene = Scene {
            id: "dummy".to_string(),
            name: "Dummy Scene".to_string(),
            transform: AffineTransform::identity(),
            children: vec![rect1_id, rect2_id, rect3_id],
            nodes,
            background_color: Some(Color(240, 240, 240, 255)), // Light gray background
        };

        // Load the scene into the renderer
        self.app.renderer.load_scene(scene);
    }

    /// Load a scene from a JSON string using the `io_json` parser.
    pub fn load_scene_json(&mut self, json: &str) {
        use crate::io::io_json;
        use math2::transform::AffineTransform;

        let Ok(file) = io_json::parse(json) else {
            eprintln!("failed to parse scene json");
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
}

#[cfg(target_arch = "wasm32")]
// #[unsafe(no_mangle)]
pub extern "C" fn init(width: i32, height: i32) -> Box<WebGlApplication> {
    Box::new(WebGlApplication::new(width, height))
}

#[cfg(target_arch = "wasm32")]
// #[unsafe(no_mangle)]
pub unsafe extern "C" fn resize_surface(app: *mut WebGlApplication, width: i32, height: i32) {
    if let Some(app) = app.as_mut() {
        app.resize(width, height);
    }
}

#[cfg(target_arch = "wasm32")]
// #[unsafe(no_mangle)]
pub unsafe extern "C" fn redraw(app: *mut WebGlApplication) {
    if let Some(app) = app.as_mut() {
        app.redraw();
    }
}

#[cfg(target_arch = "wasm32")]
// #[unsafe(no_mangle)]
pub unsafe extern "C" fn load_scene_json(app: *mut WebGlApplication, ptr: *const u8, len: usize) {
    if let Some(app) = app.as_mut() {
        let slice = std::slice::from_raw_parts(ptr, len);
        if let Ok(json) = std::str::from_utf8(slice) {
            app.load_scene_json(json);
        }
    }
}
