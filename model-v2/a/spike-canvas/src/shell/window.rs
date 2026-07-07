//! Window + GL + Skia surface setup — cribbed from
//! `crates/grida_editor/src/shell/window.rs` (itself a spin-off of the
//! grida_dev winit host), reduced to what the spike needs and with the
//! surface state inlined (the spike does not depend on the grida crate).

use gl::types::GLint;
use glutin::{
    config::{ConfigTemplateBuilder, GlConfig},
    context::{ContextApi, ContextAttributesBuilder, PossiblyCurrentContext},
    display::{GetGlDisplay, GlDisplay},
    prelude::NotCurrentGlContext,
    surface::{Surface as GlutinSurface, SurfaceAttributesBuilder, WindowSurface},
};
use glutin_winit::DisplayBuilder;
#[allow(deprecated)]
use raw_window_handle::HasRawWindowHandle;
use skia_safe::gpu;
use std::{ffi::CString, num::NonZeroU32};
use winit::{
    dpi::LogicalSize,
    event_loop::EventLoop,
    window::{Window, WindowAttributes},
};

/// The GPU surface bundle; `recreate` re-wraps the framebuffer after a
/// window resize (same fb_info, new dimensions).
pub struct GpuSurface {
    pub gr_context: gpu::DirectContext,
    pub fb_info: gpu::gl::FramebufferInfo,
    pub num_samples: usize,
    pub stencil_size: usize,
    pub surface: skia_safe::Surface,
}

impl GpuSurface {
    pub fn recreate(&mut self, width: i32, height: i32) {
        let backend_render_target = gpu::backend_render_targets::make_gl(
            (width, height),
            self.num_samples,
            self.stencil_size,
            self.fb_info,
        );
        self.surface = gpu::surfaces::wrap_backend_render_target(
            &mut self.gr_context,
            &backend_render_target,
            gpu::SurfaceOrigin::BottomLeft,
            skia_safe::ColorType::RGBA8888,
            None,
            None,
        )
        .expect("could not recreate skia surface");
    }
}

pub struct WindowInit {
    pub gpu: GpuSurface,
    pub el: EventLoop<()>,
    pub window: Window,
    pub gl_surface: GlutinSurface<WindowSurface>,
    pub gl_context: PossiblyCurrentContext,
    pub scale_factor: f64,
    /// egui_glow's GL handle over the SAME context Skia renders on —
    /// one context, two painters (the grida_editor egui-spike pattern).
    pub glow_context: std::sync::Arc<glow::Context>,
}

pub fn create_window(title: &str, width: i32, height: i32) -> WindowInit {
    let el = EventLoop::new().expect("failed to build event loop");

    let window_attributes = WindowAttributes::default()
        .with_title(title)
        .with_inner_size(LogicalSize::new(width, height));

    let template = ConfigTemplateBuilder::new()
        .with_alpha_size(8)
        .with_transparency(true);

    let display_builder = DisplayBuilder::new().with_window_attributes(window_attributes.into());
    let (window, gl_config) = display_builder
        .build(&el, template, |mut configs| {
            let mut best = configs.next().expect("no gl config available");
            for config in configs {
                let transparency_check = config.supports_transparency().unwrap_or(false)
                    & !best.supports_transparency().unwrap_or(false);
                if transparency_check || config.num_samples() < best.num_samples() {
                    best = config;
                }
            }
            best
        })
        .expect("failed to build window");
    let window = window.expect("could not create window with OpenGL context");
    #[allow(deprecated)]
    let raw_window_handle = window
        .raw_window_handle()
        .expect("failed to retrieve RawWindowHandle");

    let scale_factor = window.scale_factor();

    let context_attributes = ContextAttributesBuilder::new().build(Some(raw_window_handle));
    let fallback_context_attributes = ContextAttributesBuilder::new()
        .with_context_api(ContextApi::Gles(None))
        .build(Some(raw_window_handle));

    let not_current_gl_context = unsafe {
        gl_config
            .display()
            .create_context(&gl_config, &context_attributes)
            .unwrap_or_else(|_| {
                gl_config
                    .display()
                    .create_context(&gl_config, &fallback_context_attributes)
                    .expect("failed to create context")
            })
    };

    let (width, height): (u32, u32) = window.inner_size().into();

    let attrs = SurfaceAttributesBuilder::<WindowSurface>::new().build(
        raw_window_handle,
        NonZeroU32::new(width).unwrap_or(unsafe { NonZeroU32::new_unchecked(1) }),
        NonZeroU32::new(height).unwrap_or(unsafe { NonZeroU32::new_unchecked(1) }),
    );

    let gl_surface = unsafe {
        gl_config
            .display()
            .create_window_surface(&gl_config, &attrs)
            .expect("could not create gl window surface")
    };

    let gl_context = not_current_gl_context
        .make_current(&gl_surface)
        .expect("could not make GL context current");

    gl::load_with(|s| {
        let Ok(cstr) = CString::new(s) else {
            return std::ptr::null();
        };
        gl_config.display().get_proc_address(cstr.as_c_str())
    });

    let glow_context = std::sync::Arc::new(unsafe {
        glow::Context::from_loader_function_cstr(|s| gl_config.display().get_proc_address(s))
    });

    let interface = skia_safe::gpu::gl::Interface::new_load_with(|name| {
        if name == "eglGetCurrentDisplay" {
            return std::ptr::null();
        }
        let Ok(cstr) = CString::new(name) else {
            return std::ptr::null();
        };
        gl_config.display().get_proc_address(cstr.as_c_str())
    })
    .expect("could not create skia GL interface");

    let mut gr_context = skia_safe::gpu::direct_contexts::make_gl(interface, None)
        .expect("could not create skia direct context");

    let fb_info = {
        let mut fboid: GLint = 0;
        unsafe { gl::GetIntegerv(gl::FRAMEBUFFER_BINDING, &mut fboid) };
        gpu::gl::FramebufferInfo {
            fboid: fboid.try_into().unwrap_or_default(),
            format: skia_safe::gpu::gl::Format::RGBA8.into(),
            ..Default::default()
        }
    };

    let num_samples = gl_config.num_samples() as usize;
    let stencil_size = gl_config.stencil_size() as usize;

    let backend_render_target = gpu::backend_render_targets::make_gl(
        (width as i32, height as i32),
        num_samples,
        stencil_size,
        fb_info,
    );

    let surface = gpu::surfaces::wrap_backend_render_target(
        &mut gr_context,
        &backend_render_target,
        gpu::SurfaceOrigin::BottomLeft,
        skia_safe::ColorType::RGBA8888,
        None,
        None,
    )
    .expect("could not create skia surface");

    WindowInit {
        gpu: GpuSurface {
            gr_context,
            fb_info,
            num_samples,
            stencil_size,
            surface,
        },
        el,
        window,
        gl_surface,
        gl_context,
        scale_factor,
        glow_context,
    }
}
