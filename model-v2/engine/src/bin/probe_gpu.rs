//! probe_gpu — real GPU frame-cost harness, headless (no window).
//!
//! The raster probe is the always-on tool; this one exists for the TWO wins
//! whose value is reusing a persistent GPU texture across frames — the scene
//! raster cache and layerization. On CPU raster a texture re-blit is a
//! full-frame memcpy that can be SLOWER than redrawing rects, so raster would
//! call a real GPU win a regression. Only here is the sign correct.
//!
//! Method (surfaceless CGL on macOS, EGL on Linux — recipe from
//! `crates/grida/src/window/headless.rs`): render to a GPU-backed Skia surface,
//! then `flush_and_submit()` to force the GPU to finish — the wall time around
//! (render + flush) is the real frame cost. `execute_ns` alone is a lie on GPU
//! (Skia only records commands).
//!
//! This is a MANUAL escalation tool, never a gate section: GPU timing is
//! high-variance (driver scheduling, thermal), so it informs judgement on the
//! two GPU wins, it does not auto-fail a build.
//!
//!   cargo run --release --features native-gl-context --bin probe_gpu

#[cfg(not(feature = "native-gl-context"))]
fn main() {
    eprintln!("probe_gpu needs the native-gl-context feature:");
    eprintln!("  cargo run --release --features native-gl-context --bin probe_gpu");
    std::process::exit(2);
}

#[cfg(feature = "native-gl-context")]
fn main() {
    imp::run();
}

#[cfg(feature = "native-gl-context")]
mod imp {
    use std::ffi::CString;
    use std::time::Instant;

    use anchor_engine::cache::SceneCache;
    use anchor_engine::{frame::render, paint::PaintCtx};
    use anchor_lab::math::{Affine, RectF};
    use anchor_lab::model::*;
    use anchor_lab::resolve::{ResolveOptions, RotationInFlow};

    use gl::types::GLenum;
    use glutin::config::ConfigTemplateBuilder;
    use glutin::context::{ContextApi, ContextAttributesBuilder, Version};
    use glutin::display::{DisplayApiPreference, GlDisplay};
    use skia_safe::gpu;

    const W: i32 = 1360;
    const H: i32 = 900;
    const WARMUP: usize = 20;
    const FRAMES: usize = 240;

    // ── headless GPU context (copied recipe; Skia-managed FBO) ──────────────

    struct HeadlessGpu {
        surface: skia_safe::Surface,
        gr_context: gpu::DirectContext,
        _gl_context: glutin::context::PossiblyCurrentContext,
    }

    impl HeadlessGpu {
        fn new(w: i32, h: i32) -> Result<Self, String> {
            #[cfg(target_os = "macos")]
            let pref = DisplayApiPreference::Cgl;
            #[cfg(target_os = "linux")]
            let pref = DisplayApiPreference::Egl;

            let display = unsafe {
                glutin::display::Display::new(platform_display_handle(), pref)
                    .map_err(|e| format!("glutin display: {e}"))?
            };
            let template = ConfigTemplateBuilder::new()
                .with_alpha_size(8)
                .with_stencil_size(8)
                .with_depth_size(24);
            let cfg = unsafe {
                display
                    .find_configs(template.build())
                    .map_err(|e| format!("find configs: {e}"))?
                    .next()
                    .ok_or("no GL config")?
            };
            let attrs = ContextAttributesBuilder::new()
                .with_context_api(ContextApi::OpenGl(Some(Version::new(3, 3))))
                .build(None);
            let fallback = ContextAttributesBuilder::new()
                .with_context_api(ContextApi::OpenGl(None))
                .build(None);
            let not_current = unsafe {
                display
                    .create_context(&cfg, &attrs)
                    .or_else(|_| display.create_context(&cfg, &fallback))
                    .map_err(|e| format!("create context: {e}"))?
            };
            let gl_context = make_current_surfaceless(not_current)?;

            gl::load_with(|s| {
                CString::new(s)
                    .map(|c| display.get_proc_address(c.as_c_str()))
                    .unwrap_or(std::ptr::null())
            });
            let interface = gpu::gl::Interface::new_load_with(|name| {
                if name == "eglGetCurrentDisplay" {
                    return std::ptr::null();
                }
                CString::new(name)
                    .map(|c| display.get_proc_address(c.as_c_str()))
                    .unwrap_or(std::ptr::null())
            })
            .ok_or("skia GL interface")?;
            let mut gr_context =
                gpu::direct_contexts::make_gl(interface, None).ok_or("skia DirectContext")?;

            let surface = gpu::surfaces::render_target(
                &mut gr_context,
                gpu::Budgeted::Yes,
                &skia_safe::ImageInfo::new_n32_premul((w, h), None),
                Some(0),
                gpu::SurfaceOrigin::TopLeft,
                None,
                false,
                None,
            )
            .ok_or("GPU render target")?;

            Ok(Self {
                surface,
                gr_context,
                _gl_context: gl_context,
            })
        }

        fn gl_info(&self) {
            println!(
                "  GL: {} / {} / {}",
                gl_string(gl::VENDOR),
                gl_string(gl::RENDERER),
                gl_string(gl::VERSION)
            );
        }
    }

    #[cfg(target_os = "macos")]
    fn platform_display_handle() -> raw_window_handle::RawDisplayHandle {
        use raw_window_handle::{AppKitDisplayHandle, RawDisplayHandle};
        RawDisplayHandle::AppKit(AppKitDisplayHandle::new())
    }
    #[cfg(target_os = "linux")]
    fn platform_display_handle() -> raw_window_handle::RawDisplayHandle {
        use raw_window_handle::{RawDisplayHandle, XlibDisplayHandle};
        RawDisplayHandle::Xlib(XlibDisplayHandle::new(None, 0))
    }

    #[cfg(target_os = "macos")]
    fn make_current_surfaceless(
        ctx: glutin::context::NotCurrentContext,
    ) -> Result<glutin::context::PossiblyCurrentContext, String> {
        match ctx {
            glutin::context::NotCurrentContext::Cgl(c) => {
                Ok(glutin::context::PossiblyCurrentContext::Cgl(
                    c.make_current_surfaceless()
                        .map_err(|e| format!("CGL surfaceless: {e}"))?,
                ))
            }
            #[allow(unreachable_patterns)]
            _ => Err("expected CGL context".into()),
        }
    }
    #[cfg(target_os = "linux")]
    fn make_current_surfaceless(
        ctx: glutin::context::NotCurrentContext,
    ) -> Result<glutin::context::PossiblyCurrentContext, String> {
        match ctx {
            glutin::context::NotCurrentContext::Egl(c) => {
                Ok(glutin::context::PossiblyCurrentContext::Egl(
                    c.make_current_surfaceless()
                        .map_err(|e| format!("EGL surfaceless: {e}"))?,
                ))
            }
            #[allow(unreachable_patterns)]
            _ => Err("expected EGL context".into()),
        }
    }

    fn gl_string(name: GLenum) -> String {
        unsafe {
            let p = gl::GetString(name);
            if p.is_null() {
                "<null>".into()
            } else {
                std::ffi::CStr::from_ptr(p as *const _)
                    .to_string_lossy()
                    .into_owned()
            }
        }
    }

    // ── scene + view (minimal; mirrors probe.rs packed) ─────────────────────

    fn opts() -> ResolveOptions {
        ResolveOptions {
            viewport: (W as f32, H as f32),
            rotation_in_flow: RotationInFlow::VisualOnly,
        }
    }

    fn packed(n: usize) -> (Document, RectF) {
        const CELL: f32 = 20.0;
        let cols = ((n as f32 * W as f32 / H as f32).sqrt().ceil() as usize).max(1);
        let rows = n.div_ceil(cols);
        let mut b = DocBuilder::new();
        for i in 0..n {
            let mut h = Header::new(SizeIntent::Fixed(CELL * 0.8), SizeIntent::Fixed(CELL * 0.8));
            h.x = AxisBinding::start((i % cols) as f32 * CELL);
            h.y = AxisBinding::start((i / cols) as f32 * CELL);
            h.rotation = (i % 7) as f32 * 5.0;
            b.add(
                0,
                h,
                Payload::Shape {
                    desc: ShapeDesc::Rect,
                },
            );
        }
        (
            b.build(),
            RectF {
                x: 0.0,
                y: 0.0,
                w: cols as f32 * CELL,
                h: rows as f32 * CELL,
            },
        )
    }

    fn fit_view(a: RectF) -> Affine {
        let s = (W as f32 / a.w).min(H as f32 / a.h) * 0.95;
        Affine {
            a: s,
            b: 0.0,
            c: 0.0,
            d: s,
            e: (W as f32 - s * a.w) / 2.0,
            f: (H as f32 - s * a.h) / 2.0,
        }
    }

    fn dist_ms(mut ns: Vec<u128>) -> (f64, f64, f64) {
        ns.sort_unstable();
        let ms = |i: usize| ns[i.min(ns.len() - 1)] as f64 / 1e6;
        (ms(ns.len() / 2), ms(ns.len() * 99 / 100), ms(ns.len() - 1))
    }

    pub fn run() {
        println!("== probe_gpu (headless GPU, real flush timing) ==");
        let mut gpu = match HeadlessGpu::new(W, H) {
            Ok(g) => g,
            Err(e) => {
                eprintln!("headless GPU unavailable: {e}");
                eprintln!("(the raster probe remains the primary tool)");
                std::process::exit(1);
            }
        };
        gpu.gl_info();
        let ctx = PaintCtx::new(None);

        println!(
            "\n{:<12} {:>8}  {:>22}  {:>7} {:>7}",
            "scenario", "nodes", "gpu frame p50/p99/max", "fps", "fps99"
        );
        for &n in &[10_000usize, 100_000] {
            let (doc, aabb) = packed(n);
            let base = fit_view(aabb);
            let mut pan = 0.0f32;
            let mut dir = 1.0f32;
            let mut wall = Vec::with_capacity(FRAMES);

            for frame in 0..(WARMUP + FRAMES) {
                pan += dir * 6.0;
                if pan.abs() > 240.0 {
                    dir = -dir;
                }
                let mut view = base;
                view.e += pan;

                let t = Instant::now();
                {
                    let canvas = gpu.surface.canvas();
                    canvas.clear(skia_safe::Color::WHITE);
                    let _ = render(canvas, &doc, &opts(), &view, &ctx);
                }
                gpu.gr_context.flush_and_submit(); // force GPU to finish
                let elapsed = t.elapsed().as_nanos();
                if frame >= WARMUP {
                    wall.push(elapsed);
                }
            }
            let (p50, p99, max) = dist_ms(wall);
            println!(
                "{:<12} {:>8}  {:>8.3}/{:>7.3}/{:>7.3}  {:>7.1} {:>6.1}",
                "view_pan",
                n,
                p50,
                p99,
                max,
                1000.0 / p50,
                1000.0 / p99
            );

            // Win 1 on real GPU: the compositor's offscreen is backend-matched
            // (Canvas::new_surface → GPU), so the cached image is a GPU texture
            // and the blit is a GPU texture draw. Pan reverses beyond the margin
            // so re-rasters are periodic (the honest amortized number).
            let mut cache = SceneCache::new(W, H);
            let mut cpan = 0.0f32;
            let mut cdir = 1.0f32;
            let mut cwall = Vec::with_capacity(FRAMES);
            for frame in 0..(WARMUP + FRAMES) {
                cpan += cdir * 6.0;
                if cpan.abs() > 500.0 {
                    cdir = -cdir;
                }
                let mut view = base;
                view.e += cpan;
                let t = Instant::now();
                {
                    let canvas = gpu.surface.canvas();
                    canvas.clear(skia_safe::Color::WHITE);
                    cache.frame(canvas, &doc, &opts(), &view, &ctx, false);
                }
                gpu.gr_context.flush_and_submit();
                let elapsed = t.elapsed().as_nanos();
                if frame >= WARMUP {
                    cwall.push(elapsed);
                }
            }
            let (cp50, cp99, cmax) = dist_ms(cwall);
            println!(
                "{:<12} {:>8}  {:>8.3}/{:>7.3}/{:>7.3}  {:>7.1} {:>6.1}",
                "  +cache",
                n,
                cp50,
                cp99,
                cmax,
                1000.0 / cp50,
                1000.0 / cp99
            );
        }
    }
}
