//! Headless GPU rendering context.
//!
//! Creates an OpenGL context and GPU-backed Skia surface without opening a
//! window. Useful for benchmarks, tests, CLI tools, and SDK usage that need
//! GPU rendering but no display.
//!
//! Requires the `native-gl-context` feature.
//!
//! # Usage
//!
//! ```rust,ignore
//! use cg::window::headless::HeadlessGpu;
//!
//! let mut gpu = HeadlessGpu::new(1000, 1000).expect("GPU init");
//! let mut renderer = gpu.create_renderer();
//! renderer.load_scene(scene);
//! renderer.queue_stable();
//! let _ = renderer.flush();
//! ```
//!
//! # Platform support
//!
//! | OS      | Backend | Method                             |
//! |---------|---------|------------------------------------|
//! | macOS   | CGL     | `make_current_surfaceless`         |
//! | Linux   | EGL     | `make_current_surfaceless`         |
//! | Windows | —       | not yet supported (needs WGL hack) |

use crate::node::schema::Size;
use crate::runtime::camera::Camera2D;
use crate::runtime::scene::{Backend, Renderer};
use gl::types::*;
use glutin::config::ConfigTemplateBuilder;
use glutin::context::{ContextApi, ContextAttributesBuilder, Version};
use glutin::display::GlDisplay;
use skia_safe::gpu;
use std::ffi::CString;

/// A headless GPU rendering context owning the GL state and Skia surface.
///
/// Drop order matters: `surface` must be dropped before `gr_context`, and
/// `gr_context` before `_gl_context`. Rust drops fields in declaration order,
/// so the field order here is intentional.
pub struct HeadlessGpu {
    pub surface: skia_safe::Surface,
    pub gr_context: gpu::DirectContext,
    /// Keep the GL context alive. Never accessed directly.
    _gl_context: glutin::context::PossiblyCurrentContext,
    width: i32,
    height: i32,
}

impl HeadlessGpu {
    /// Create a new headless GPU context with an offscreen surface of the
    /// given dimensions.
    pub fn new(width: i32, height: i32) -> Result<Self, String> {
        let (gl_context, gr_context) = create_headless_gl_context()?;
        let mut gr = gr_context;
        let surface = create_gpu_surface(&mut gr, width, height)?;
        Ok(Self {
            surface,
            gr_context: gr,
            _gl_context: gl_context,
            width,
            height,
        })
    }

    /// Build a [`Renderer`] that draws to this GPU surface.
    ///
    /// The renderer borrows the surface via raw pointer, so `self` must
    /// outlive the returned `Renderer`.
    pub fn create_renderer(&mut self) -> Renderer {
        let surface_ptr: *mut skia_safe::Surface = &mut self.surface;
        Renderer::new(
            Backend::GL(surface_ptr),
            None,
            Camera2D::new(Size {
                width: self.width as f32,
                height: self.height as f32,
            }),
        )
    }

    /// Print GL vendor, renderer, and version to stdout.
    pub fn print_gl_info(&self) {
        println!("  GL Vendor:   {}", gl_string(gl::VENDOR));
        println!("  GL Renderer: {}", gl_string(gl::RENDERER));
        println!("  GL Version:  {}", gl_string(gl::VERSION));
    }

    /// Width of the offscreen surface in pixels.
    pub fn width(&self) -> i32 {
        self.width
    }

    /// Height of the offscreen surface in pixels.
    pub fn height(&self) -> i32 {
        self.height
    }
}

// ---------------------------------------------------------------------------
// Platform-specific GL bootstrap
// ---------------------------------------------------------------------------

fn create_headless_gl_context(
) -> Result<(glutin::context::PossiblyCurrentContext, gpu::DirectContext), String> {
    use glutin::display::DisplayApiPreference;

    #[cfg(target_os = "macos")]
    let pref = DisplayApiPreference::Cgl;
    #[cfg(target_os = "linux")]
    let pref = DisplayApiPreference::Egl;
    #[cfg(target_os = "windows")]
    return Err("Headless GPU is not yet supported on Windows".into());

    #[cfg(not(target_os = "windows"))]
    {
        // 1. Display
        let display = unsafe {
            glutin::display::Display::new(platform_raw_display_handle(), pref)
                .map_err(|e| format!("glutin display: {e}"))?
        };

        // 2. Config (pixel format)
        let template = ConfigTemplateBuilder::new()
            .with_alpha_size(8)
            .with_stencil_size(8)
            .with_depth_size(24);
        let gl_config = unsafe {
            display
                .find_configs(template.build())
                .map_err(|e| format!("find configs: {e}"))?
                .next()
                .ok_or("no GL config available")?
        };

        // 3. Context (no window handle)
        let ctx_attrs = ContextAttributesBuilder::new()
            .with_context_api(ContextApi::OpenGl(Some(Version::new(3, 3))))
            .build(None);
        let fallback = ContextAttributesBuilder::new()
            .with_context_api(ContextApi::OpenGl(None))
            .build(None);
        let not_current = unsafe {
            display
                .create_context(&gl_config, &ctx_attrs)
                .or_else(|_| display.create_context(&gl_config, &fallback))
                .map_err(|e| format!("create context: {e}"))?
        };

        // 4. Make current (surfaceless — no window, no pbuffer)
        let gl_context = make_current_surfaceless(not_current)?;

        // 5. Load GL function pointers
        gl::load_with(|s| {
            let Ok(cstr) = CString::new(s) else {
                return std::ptr::null();
            };
            display.get_proc_address(cstr.as_c_str())
        });

        // 6. Skia GL interface + DirectContext
        let interface = gpu::gl::Interface::new_load_with(|name| {
            if name == "eglGetCurrentDisplay" {
                return std::ptr::null();
            }
            let Ok(cstr) = CString::new(name) else {
                return std::ptr::null();
            };
            display.get_proc_address(cstr.as_c_str())
        })
        .ok_or("failed to create Skia GL interface")?;

        let gr_context = gpu::direct_contexts::make_gl(interface, None)
            .ok_or("failed to create Skia DirectContext")?;

        Ok((gl_context, gr_context))
    }
}

/// Create an offscreen GPU-backed Skia surface. Skia manages its own FBO.
fn create_gpu_surface(
    gr_context: &mut gpu::DirectContext,
    width: i32,
    height: i32,
) -> Result<skia_safe::Surface, String> {
    gpu::surfaces::render_target(
        gr_context,
        gpu::Budgeted::Yes,
        &skia_safe::ImageInfo::new_n32_premul((width, height), None),
        Some(0),
        gpu::SurfaceOrigin::TopLeft,
        None,
        false,
        None,
    )
    .ok_or_else(|| "failed to create GPU render target surface".into())
}

// ---------------------------------------------------------------------------
// Platform helpers
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
fn platform_raw_display_handle() -> raw_window_handle::RawDisplayHandle {
    use raw_window_handle::{AppKitDisplayHandle, RawDisplayHandle};
    RawDisplayHandle::AppKit(AppKitDisplayHandle::new())
}

#[cfg(target_os = "linux")]
fn platform_raw_display_handle() -> raw_window_handle::RawDisplayHandle {
    use raw_window_handle::{RawDisplayHandle, XlibDisplayHandle};
    RawDisplayHandle::Xlib(XlibDisplayHandle::new(None, 0))
}

/// Make a GL context current without binding it to any surface.
#[cfg(target_os = "macos")]
fn make_current_surfaceless(
    ctx: glutin::context::NotCurrentContext,
) -> Result<glutin::context::PossiblyCurrentContext, String> {
    match ctx {
        glutin::context::NotCurrentContext::Cgl(cgl) => {
            let current = cgl
                .make_current_surfaceless()
                .map_err(|e| format!("CGL make_current_surfaceless: {e}"))?;
            Ok(glutin::context::PossiblyCurrentContext::Cgl(current))
        }
        #[allow(unreachable_patterns)]
        _ => Err("expected CGL context on macOS".into()),
    }
}

#[cfg(target_os = "linux")]
fn make_current_surfaceless(
    ctx: glutin::context::NotCurrentContext,
) -> Result<glutin::context::PossiblyCurrentContext, String> {
    match ctx {
        glutin::context::NotCurrentContext::Egl(egl) => {
            let current = egl
                .make_current_surfaceless()
                .map_err(|e| format!("EGL make_current_surfaceless: {e}"))?;
            Ok(glutin::context::PossiblyCurrentContext::Egl(current))
        }
        #[allow(unreachable_patterns)]
        _ => Err("expected EGL context on Linux".into()),
    }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

fn gl_string(name: GLenum) -> String {
    unsafe {
        let ptr = gl::GetString(name);
        if ptr.is_null() {
            return "<null>".to_string();
        }
        std::ffi::CStr::from_ptr(ptr as *const _)
            .to_string_lossy()
            .into_owned()
    }
}
