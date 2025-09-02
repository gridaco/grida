use super::application::HostEvent;
use super::application_native::NativeApplication;
use crate::node::schema::*;
use crate::resource::font_loader::FontLoader;
use crate::resource::font_loader::FontMessage;
use crate::resource::image_loader::{load_scene_images, ImageLoader, ImageMessage};
use crate::runtime::scene::{Backend, Renderer};
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
        winit::event_loop::EventLoopProxy<HostEvent>,
    ),
{
    let width = 1080;
    let height = 1080;

    println!("🚀 Starting demo window...");
    let (tx, rx) = mpsc::unbounded();
    let (font_tx, font_rx) = mpsc::unbounded();

    let (mut app, el) = NativeApplication::new_with_options(
        width,
        height,
        rx,
        font_rx,
        crate::runtime::scene::RendererOptions {
            use_embedded_fonts: true,
        },
    );
    let proxy = el.create_proxy();

    app.app.renderer.backend = Backend::GL(app.app.state.surface_mut_ptr());

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

    init(&mut app.app.renderer, tx, font_tx, proxy);

    app.app.renderer.load_scene(scene.clone());
    app.app.devtools_rendering_show_fps = true;
    app.app.devtools_rendering_show_stats = true;
    app.app.devtools_rendering_show_hit_overlay = true;
    app.app.devtools_rendering_show_ruler = true;
    app.app.devtools_rendering_show_tiles = false;

    println!("🎭 Starting event loop...");
    if let Err(e) = el.run_app(&mut app) {
        eprintln!("Event loop error: {:?}", e);
    }
}
