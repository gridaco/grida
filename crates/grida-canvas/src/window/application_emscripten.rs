use crate::io::io_grida::JSONFlattenResult;
use crate::io::io_grida_patch::TransactionApplyReport;
#[cfg(not(target_arch = "wasm32"))]
use crate::resources::{FontMessage, ImageMessage};
use crate::runtime::camera::Camera2D;
use crate::runtime::changes::ChangeFlags;
use crate::runtime::scene::Backend;
use crate::runtime::scene::RendererOptions;
use crate::window::application::{ApplicationApi, BoundsTarget, UnknownTargetApplication};
use crate::window::command::ApplicationCommand;
use crate::window::state::{self, GpuState, SurfaceState};
#[cfg(not(target_arch = "wasm32"))]
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

#[cfg(target_os = "emscripten")]
unsafe extern "C" fn request_animation_frame_callback_unknown_target(
    time: f64,
    user_data: *mut std::os::raw::c_void,
) -> bool {
    if !user_data.is_null() {
        let app_ptr = user_data as *mut UnknownTargetApplication;
        let app = &mut *app_ptr;

        // Stop the loop and free the application when requested.
        // This avoids a use-after-free if the host calls into `_destroy(...)`
        // while the RAF loop is still active.
        if !app.running() {
            drop(Box::from_raw(app_ptr));
            return false;
        }

        // Use the unified frame() entry point — this drives the clock,
        // timers, and the FrameLoop (poll → flush → complete) in one call.
        // This fixes the web-host stable-frame bug: after pan/zoom stops,
        // FrameLoop::poll() returns Stable once the debounce expires.
        app.frame(time);
    }
    true
}

/// Create a WebGL-backed [`UnknownTargetApplication`] (Emscripten/WebGL).
///
/// This keeps all platform-specific GL setup and the internal RAF tick loop
/// contained to this module, while the returned application is backend-agnostic
/// core logic.
pub fn new_webgl_app(
    width: i32,
    height: i32,
    options: RendererOptions,
) -> Box<UnknownTargetApplication> {
    init_gl();
    let mut gpu_state = create_gpu_state();
    let surface = state::create_surface(&mut gpu_state, width, height);
    let GpuState {
        context,
        framebuffer_info,
    } = gpu_state;
    let mut state = SurfaceState::from_parts(context, framebuffer_info, surface);

    #[cfg(not(target_arch = "wasm32"))]
    let (_image_tx, image_rx) = mpsc::unbounded::<ImageMessage>();
    #[cfg(not(target_arch = "wasm32"))]
    let (_font_tx, font_rx) = mpsc::unbounded::<FontMessage>();

    let camera = Camera2D::new(crate::node::schema::Size {
        width: width as f32,
        height: height as f32,
    });

    let backend = Backend::GL(state.surface_mut_ptr());
    let mut app = Box::new(UnknownTargetApplication::new(
        crate::window::state::AnySurfaceState::from_gpu(state),
        backend,
        camera,
        120,
        #[cfg(not(target_arch = "wasm32"))]
        image_rx,
        #[cfg(not(target_arch = "wasm32"))]
        font_rx,
        None,
        options,
    ));
    app.set_auto_tick(true);

    #[cfg(target_os = "emscripten")]
    unsafe {
        let app_ptr = Box::into_raw(app);
        emscripten_request_animation_frame_loop(
            Some(request_animation_frame_callback_unknown_target),
            app_ptr as *mut _,
        );
        return Box::from_raw(app_ptr);
    }

    #[cfg(not(target_os = "emscripten"))]
    {
        // This constructor is intended for wasm/emscripten only.
        app
    }
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

    fn get_node_absolute_bounding_box(&mut self, target: BoundsTarget) -> Option<Rectangle> {
        self.base.get_node_absolute_bounding_box(target)
    }

    fn export_node_as(
        &mut self,
        id: &str,
        format: crate::export::ExportAs,
    ) -> Option<crate::export::Exported> {
        self.base.export_node_as(id, format)
    }

    fn to_vector_network(&mut self, id: &str) -> Option<JSONFlattenResult> {
        self.base.to_vector_network(id)
    }

    fn get_node_id_path(&self, id: &str) -> Option<Vec<String>> {
        self.base.get_node_id_path(id)
    }

    fn runtime_renderer_set_layer_compositing(&mut self, enable: bool) {
        self.base.runtime_renderer_set_layer_compositing(enable);
    }

    fn runtime_renderer_set_pixel_preview_scale(&mut self, scale: u8) {
        self.base.runtime_renderer_set_pixel_preview_scale(scale);
    }

    fn runtime_renderer_set_pixel_preview_stable(&mut self, stable: bool) {
        self.base.runtime_renderer_set_pixel_preview_stable(stable);
    }

    fn runtime_renderer_set_render_policy_flags(
        &mut self,
        flags: crate::runtime::render_policy::RenderPolicyFlags,
    ) {
        self.base.runtime_renderer_set_render_policy_flags(flags);
    }

    fn runtime_renderer_set_skip_layout(&mut self, skip: bool) {
        self.base.runtime_renderer_set_skip_layout(skip);
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

    fn highlight_strokes(
        &mut self,
        ids: Vec<String>,
        style: Option<crate::devtools::stroke_overlay::StrokeOverlayStyle>,
    ) {
        self.base.highlight_strokes(ids, style);
    }

    fn load_scene_grida1(&mut self, json: &str) {
        self.base.load_scene_grida1(json);
    }

    fn load_scene_grida(&mut self, bytes: &[u8]) {
        self.base.load_scene_grida(bytes);
    }

    fn switch_scene(&mut self, scene_id: &str) {
        self.base.switch_scene(scene_id);
    }

    fn loaded_scene_ids(&self) -> Vec<String> {
        self.base.loaded_scene_ids()
    }

    fn apply_document_transactions(
        &mut self,
        transactions: Vec<Vec<serde_json::Value>>,
    ) -> Vec<TransactionApplyReport> {
        self.base.apply_document_transactions(transactions)
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
    pub fn new(width: i32, height: i32, options: RendererOptions) -> Box<Self> {
        init_gl();
        let mut gpu_state = create_gpu_state();
        let surface = state::create_surface(&mut gpu_state, width, height);
        let GpuState {
            context,
            framebuffer_info,
        } = gpu_state;
        let mut state = SurfaceState::from_parts(context, framebuffer_info, surface);

        #[cfg(not(target_arch = "wasm32"))]
        let (_image_tx, image_rx) = mpsc::unbounded::<ImageMessage>();
        #[cfg(not(target_arch = "wasm32"))]
        let (_font_tx, font_rx) = mpsc::unbounded::<FontMessage>();

        let camera = Camera2D::new(crate::node::schema::Size {
            width: width as f32,
            height: height as f32,
        });

        let backend = Backend::GL(state.surface_mut_ptr());
        let base = UnknownTargetApplication::new(
            crate::window::state::AnySurfaceState::from_gpu(state),
            backend,
            camera,
            120,
            #[cfg(not(target_arch = "wasm32"))]
            image_rx,
            #[cfg(not(target_arch = "wasm32"))]
            font_rx,
            None,
            options,
        );
        let _app = Box::new(Self { base });

        #[cfg(target_os = "emscripten")]
        unsafe {
            // Register the animation frame callback with the leaked pointer.
            let app_ptr = Box::into_raw(_app);
            emscripten_request_animation_frame_loop(
                Some(request_animation_frame_callback),
                app_ptr as *mut _,
            );
            // Reconstruct the box so the caller retains ownership.
            return Box::from_raw(app_ptr);
        }

        #[cfg(not(target_os = "emscripten"))]
        unreachable!("emscripten cannot be initialized on native")
    }

    pub fn redraw(&mut self) {
        self.base.redraw();
    }

    /// Update the cursor position in logical screen coordinates and perform a
    /// hit test. Should be called whenever the pointer moves.
    pub fn pointer_move(&mut self, x: f32, y: f32) {
        self.base.pointer_move(x, y);
    }

    pub fn has_missing_fonts(&self) -> bool {
        self.base.has_missing_fonts()
    }

    pub fn list_missing_fonts(&self) -> Vec<String> {
        self.base.list_missing_fonts()
    }

    pub fn list_available_fonts(&self) -> Vec<String> {
        self.base.list_available_fonts()
    }

    pub fn set_default_fallback_fonts(&mut self, fonts: Vec<String>) {
        self.base.set_default_fallback_fonts(fonts);
    }

    pub fn get_default_fallback_fonts(&self) -> Vec<String> {
        self.base.get_default_fallback_fonts()
    }

    /// Register font data with the renderer.
    ///
    /// Since wasm binaries cannot access network resources directly, font
    /// files must be fetched by the host environment and provided as raw
    /// bytes.  This method allows those bytes to be registered under the given
    /// family name so that subsequent text layout can resolve the typeface.
    ///
    /// Multiple calls with the same `family` and different font files are
    /// supported (e.g. Regular, Bold, Italic per family).
    pub fn add_font(&mut self, family: &str, data: &[u8]) {
        self.base.renderer.add_font(family, data);
        // Newly registered fonts may affect cached text layout; the central
        // apply_changes() dispatcher will invalidate paragraph + picture +
        // compositor caches on the next frame.
        self.base.renderer.mark_changed(ChangeFlags::FONT_LOADED);
    }

    /// Register an image with the renderer and return metadata.
    pub fn add_image(&mut self, data: &[u8]) -> (String, String, u32, u32, String) {
        let result = self.base.renderer.add_image(data);
        self.base.renderer.mark_changed(ChangeFlags::IMAGE_LOADED);
        result
    }

    /// Register image bytes under a caller-specified RID (res:// or system://).
    pub fn add_image_with_rid(&mut self, data: &[u8], rid: &str) -> Option<(u32, u32, String)> {
        let result = self.base.renderer.add_image_with_rid(data, rid);
        if result.is_some() {
            self.base.renderer.mark_changed(ChangeFlags::IMAGE_LOADED);
        }
        result
    }

    pub fn get_image_bytes(&self, id: &str) -> Option<Vec<u8>> {
        self.base.get_image_bytes(id)
    }

    pub fn get_image_size(&self, id: &str) -> Option<(u32, u32)> {
        self.base.get_image_size(id)
    }

    pub fn apply_document_transactions_json(
        &mut self,
        json: &str,
    ) -> Result<Vec<TransactionApplyReport>, serde_json::Error> {
        self.base.apply_document_transactions_json(json)
    }
}
