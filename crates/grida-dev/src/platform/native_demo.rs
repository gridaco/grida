use super::native_application::NativeApplication;
use cg::node::schema::Scene;
use cg::resources::{load_scene_images, FontMessage, ImageMessage};
use cg::runtime::scene::{Backend, Renderer};
use cg::window::application::{ApplicationApi, HostEvent, HostEventCallback};
use futures::channel::mpsc;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;

#[allow(dead_code)]
pub async fn run_demo_window(scene: Scene) {
    run_demo_window_with(scene, |_, _, _, _| {}).await;
}

/// Run a demo window with multiple scenes (PageUp/PageDown to switch).
#[allow(dead_code)]
pub async fn run_demo_window_multi(scenes: Vec<Scene>) {
    let first = scenes
        .first()
        .cloned()
        .expect("run_demo_window_multi requires at least one scene");
    run_demo_window_core_multi(first, scenes, |_, _, _, _| {}, None).await;
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
    run_demo_window_core_multi(scene.clone(), vec![scene], init, None).await;
}

pub async fn run_demo_window_with_drop<F>(scene: Scene, init: F, drop_tx: UnboundedSender<PathBuf>)
where
    F: FnOnce(
        &mut Renderer,
        mpsc::UnboundedSender<ImageMessage>,
        mpsc::UnboundedSender<FontMessage>,
        winit::event_loop::EventLoopProxy<HostEvent>,
    ),
{
    run_demo_window_core_multi(scene.clone(), vec![scene], init, Some(drop_tx)).await;
}

async fn run_demo_window_core_multi<F>(
    scene: Scene,
    all_scenes: Vec<Scene>,
    init: F,
    file_drop_tx: Option<UnboundedSender<PathBuf>>,
) where
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
        cg::runtime::scene::RendererOptions {
            use_embedded_fonts: true,
        },
        file_drop_tx.clone(),
        file_drop_tx.is_some(),
    );
    let proxy = el.create_proxy();

    let surface_ptr = app.app.surface_mut_ptr();
    app.app.set_renderer_backend(Backend::GL(surface_ptr));

    println!("📸 Initializing image loader...");
    println!("🔄 Starting to load scene images in background...");
    let scene_clone = scene.clone();
    let tx_clone = tx.clone();
    let event_cb: HostEventCallback = {
        let proxy_clone = proxy.clone();
        Arc::new(move |event: HostEvent| {
            let _ = proxy_clone.send_event(event);
        })
    };
    // Store image_tx and event_cb for scene-switch image loading.
    app.image_tx = Some(tx.clone());
    app.event_cb = Some(event_cb.clone());

    std::thread::spawn(move || {
        let event_cb = event_cb.clone();
        futures::executor::block_on(async move {
            load_scene_images(&scene_clone, tx_clone, event_cb).await;
            println!("✅ Scene images loading completed in background");
        });
    });

    {
        let renderer = app.app.renderer_mut();
        init(renderer, tx, font_tx, proxy);
    }

    {
        let renderer = app.app.renderer_mut();
        renderer.load_scene(scene.clone());
    }
    app.scenes = all_scenes;
    app.scene_index = 0;
    if app.scenes.len() > 1 {
        let title = format!("[1/{}] {}", app.scenes.len(), scene.name);
        app.window.set_title(&title);
    }
    app.app.devtools_rendering_set_show_fps_meter(true);
    app.app.devtools_rendering_set_show_stats(true);
    app.app.devtools_rendering_set_show_hit_testing(true);
    app.app.devtools_rendering_set_show_ruler(true);
    app.app.devtools_rendering_set_show_tiles(false);

    println!("🎭 Starting event loop...");
    if let Err(e) = el.run_app(&mut app) {
        eprintln!("Event loop error: {:?}", e);
    }
}
