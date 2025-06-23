use super::application::UnknownTargetApplication;
use super::application_native::{NativeApplication, init_native_window};
use crate::font_loader::FontLoader;
use crate::font_loader::FontMessage;
use crate::image_loader::{ImageLoader, ImageMessage, load_scene_images};
use crate::node::schema::*;
use crate::runtime::camera::Camera2D;
use crate::runtime::scene::{Backend, Renderer};
use crate::window::scheduler;
use futures::channel::mpsc;

#[allow(dead_code)]
pub async fn run_demo_window(scene: Scene) {
    run_demo_window_with(scene, |_, _, _, _| {}).await;
}

pub async fn run_demo_window_with<F>(scene: Scene, init: F)
where
    F: FnOnce(
        &mut Renderer,
        mpsc::UnboundedSender<ImageMessage>,
        mpsc::UnboundedSender<FontMessage>,
        winit::event_loop::EventLoopProxy<()>,
    ),
{
    let width = 1080;
    let height = 1080;

    println!("🚀 Starting demo window...");
    let (mut state, el, window, gl_surface, gl_context, scale_factor) =
        init_native_window(width, height);

    let (tx, rx) = mpsc::unbounded();
    let (font_tx, font_rx) = mpsc::unbounded();
    let proxy = el.create_proxy();

    let mut renderer = Renderer::new();
    renderer.set_raf_callback({
        let proxy = proxy.clone();
        move || {
            let _ = proxy.send_event(());
        }
    });

    renderer.set_debug_tiles(true);
    renderer.set_backend(Backend::GL(state.surface_mut_ptr()));

    println!("📸 Initializing image loader...");
    let mut image_loader = ImageLoader::new_lifecycle(tx.clone(), proxy.clone());
    let _font_loader = FontLoader::new_lifecycle(font_tx.clone(), proxy.clone());

    println!("🔄 Starting to load scene images in background...");
    let scene_clone = scene.clone();
    std::thread::spawn(move || {
        futures::executor::block_on(async move {
            load_scene_images(&mut image_loader, &scene_clone).await;
            println!("✅ Scene images loading completed in background");
        });
    });

    init(&mut renderer, tx, font_tx, proxy);

    let camera = Camera2D::new(Size {
        width: width as f32 * scale_factor as f32,
        height: height as f32 * scale_factor as f32,
    });
    renderer.set_camera(camera.clone());
    renderer.load_scene(scene.clone());

    let mut app = NativeApplication {
        app: UnknownTargetApplication {
            renderer,
            state,
            camera,
            input: crate::runtime::input::InputState::default(),
            hit_result: None,
            last_hit_test: std::time::Instant::now(),
            hit_test_interval: std::time::Duration::from_millis(50),
            image_rx: rx,
            font_rx,
            scheduler: scheduler::FrameScheduler::new(144).with_max_fps(144),
            last_frame_time: std::time::Instant::now(),
            last_stats: None,
        },
        gl_surface,
        gl_context,
        window,
    };

    println!("🎭 Starting event loop...");
    if let Err(e) = el.run_app(&mut app) {
        eprintln!("Event loop error: {:?}", e);
    }
}
