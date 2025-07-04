use skia_safe::{
    gpu::{self, gl::FramebufferInfo, DirectContext},
    Surface,
};

use gl;

pub struct GpuState {
    pub context: DirectContext,
    pub framebuffer_info: FramebufferInfo,
}

/// This struct holds the state of the Rust application between JS calls.
///
/// It is created by [init] and passed to the other exported functions. Note that rust-skia data
/// structures are not thread safe, so a state must not be shared between different Web Workers.
pub struct SurfaceState {
    gpu_state: GpuState,
    surface: Surface,
}

impl SurfaceState {
    fn new(gpu_state: GpuState, surface: Surface) -> Self {
        SurfaceState { gpu_state, surface }
    }

    fn set_surface(&mut self, surface: Surface) {
        self.surface = surface;
    }
}

impl SurfaceState {
    /// Create a new [`SurfaceState`] for native targets using the provided context,
    /// framebuffer information and surface. This mirrors the initialization
    /// logic used on the wasm side.
    pub fn from_parts(
        context: DirectContext,
        framebuffer_info: FramebufferInfo,
        surface: Surface,
    ) -> Self {
        let gpu_state = GpuState {
            context,
            framebuffer_info,
        };
        Self::new(gpu_state, surface)
    }

    /// Recreate the underlying surface with the given dimensions.
    pub fn resize(&mut self, width: i32, height: i32) {
        let surface = create_surface(&mut self.gpu_state, width, height);
        self.set_surface(surface);
    }

    /// Get a mutable pointer to the underlying Skia surface.
    pub fn surface_mut_ptr(&mut self) -> *mut Surface {
        &mut self.surface as *mut Surface
    }

    /// Borrow the underlying Skia surface mutably.
    pub fn surface_mut(&mut self) -> &mut Surface {
        &mut self.surface
    }

    /// Borrow the internal [`DirectContext`].
    pub fn context(&mut self) -> &mut DirectContext {
        &mut self.gpu_state.context
    }

    /// Retrieve framebuffer information.
    pub fn framebuffer_info(&self) -> FramebufferInfo {
        self.gpu_state.framebuffer_info
    }
}
/// Create a GPU-backed surface used for rendering.
pub(crate) fn create_surface(gpu_state: &mut GpuState, width: i32, height: i32) -> Surface {
    unsafe {
        gl::Viewport(0, 0, width, height);
    }
    let backend_render_target =
        gpu::backend_render_targets::make_gl((width, height), 1, 8, gpu_state.framebuffer_info);

    gpu::surfaces::wrap_backend_render_target(
        &mut gpu_state.context,
        &backend_render_target,
        skia_safe::gpu::SurfaceOrigin::BottomLeft,
        skia_safe::ColorType::RGBA8888,
        None,
        None,
    )
    .unwrap()
}
