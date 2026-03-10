//! Tests that viewport culling actually reduces the number of layers drawn.
//!
//! Creates a grid of nodes, positions the camera to show only a portion,
//! and verifies that `cache_picture_used` reflects only visible nodes
//! rather than the full scene.

use cg::cg::prelude::*;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::runtime::camera::Camera2D;
use cg::runtime::scene::{Backend, FrameFlushResult, Renderer};

/// Create a 10x10 grid of 20x20 rectangles with 10px gap.
/// Scene spans 300x300 world pixels (10 * 30).
fn create_10x10_grid() -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let size = 20.0f32;
    let gap = 10.0f32;

    for y in 0..10u32 {
        for x in 0..10u32 {
            let mut rect = nf.create_rectangle_node();
            rect.transform = math2::transform::AffineTransform::new(
                x as f32 * (size + gap),
                y as f32 * (size + gap),
                0.0,
            );
            rect.size = Size {
                width: size,
                height: size,
            };
            rect.set_fill(Paint::Solid(SolidPaint::RED));
            graph.append_child(Node::Rectangle(rect), Parent::Root);
        }
    }

    Scene {
        name: "10x10 grid".to_string(),
        graph,
        background_color: None,
    }
}

fn make_renderer(scene: Scene, vp_w: i32, vp_h: i32) -> Renderer {
    let mut renderer = Renderer::new(
        Backend::new_from_raster(vp_w, vp_h),
        None,
        Camera2D::new(Size {
            width: vp_w as f32,
            height: vp_h as f32,
        }),
    );
    renderer.load_scene(scene);
    renderer
}

fn flush_and_get_stats(
    renderer: &mut Renderer,
) -> cg::runtime::scene::FrameFlushStats {
    match renderer.flush() {
        FrameFlushResult::OK(stats) => stats,
        other => panic!("Expected OK flush, got {:?}", match other {
            FrameFlushResult::NoPending => "NoPending",
            FrameFlushResult::NoFrame => "NoFrame",
            FrameFlushResult::NoScene => "NoScene",
            _ => "OK",
        }),
    }
}

#[test]
fn zoomed_in_draws_fewer_layers_than_zoomed_out() {
    // Scene: 100 nodes in a 300x300 world area.
    // Viewport: 200x200 pixels.
    let scene = create_10x10_grid();
    let mut renderer = make_renderer(scene, 200, 200);

    // --- Frame 1: zoomed out, everything visible ---
    // Center on scene, zoom out so 300x300 world fits in 200x200 viewport
    renderer.camera.set_center(150.0, 150.0);
    renderer.camera.set_zoom(200.0 / 350.0); // ~0.57, shows full scene
    renderer.queue_stable();
    let stats_all = flush_and_get_stats(&mut renderer);

    // --- Frame 2: zoomed in, only a small corner visible ---
    // Zoom to 4x at top-left: viewport shows 50x50 world pixels
    // That covers ~2x2 = 4 nodes out of 100
    renderer.camera.set_center(0.0, 0.0);
    renderer.camera.set_zoom(4.0);
    renderer.queue_stable();
    let stats_zoomed = flush_and_get_stats(&mut renderer);

    let all_display_list = stats_all.frame.display_list_size_estimated;
    let zoomed_display_list = stats_zoomed.frame.display_list_size_estimated;

    // The zoomed-in frame should have a significantly smaller display list
    // (the frame plan only includes visible layers from R-tree query)
    assert!(
        zoomed_display_list < all_display_list,
        "Zoomed-in display list ({zoomed_display_list}) should be smaller than \
         zoomed-out display list ({all_display_list})"
    );

    // Zoomed-in should see at most ~25% of total nodes
    // (50x50 world area out of 300x300)
    assert!(
        zoomed_display_list <= all_display_list / 2,
        "Zoomed-in display list ({zoomed_display_list}) should be at most half of \
         zoomed-out ({all_display_list}), got ratio {:.2}",
        zoomed_display_list as f64 / all_display_list as f64
    );

    println!(
        "all_visible: display_list={all_display_list}, pic_used={}",
        stats_all.draw.cache_picture_used
    );
    println!(
        "zoomed_in:   display_list={zoomed_display_list}, pic_used={}",
        stats_zoomed.draw.cache_picture_used
    );
}

#[test]
fn offscreen_camera_draws_zero_layers() {
    let scene = create_10x10_grid();
    let mut renderer = make_renderer(scene, 200, 200);

    // Point camera far away from the scene (scene is at 0..300)
    renderer.camera.set_center(9999.0, 9999.0);
    renderer.camera.set_zoom(1.0);
    renderer.queue_stable();
    let stats = flush_and_get_stats(&mut renderer);

    assert_eq!(
        stats.frame.display_list_size_estimated, 0,
        "Off-screen camera should have empty display list, got {}",
        stats.frame.display_list_size_estimated
    );

    // With culling, zero pictures should be used
    assert_eq!(
        stats.draw.cache_picture_used, 0,
        "Off-screen camera should use 0 cached pictures, got {}",
        stats.draw.cache_picture_used
    );
}

#[test]
fn pan_changes_visible_set() {
    // Scene: 100 nodes in 300x300 world.
    // Viewport: 100x100 at zoom=1 → sees ~100x100 world area → ~3x3 = 9 nodes max.
    let scene = create_10x10_grid();
    let mut renderer = make_renderer(scene, 100, 100);

    // Pan to top-left corner
    renderer.camera.set_center(0.0, 0.0);
    renderer.camera.set_zoom(1.0);
    renderer.queue_stable();
    let stats_topleft = flush_and_get_stats(&mut renderer);

    // Pan to bottom-right corner
    renderer.camera.set_center(270.0, 270.0);
    renderer.camera.set_zoom(1.0);
    renderer.queue_stable();
    let stats_bottomright = flush_and_get_stats(&mut renderer);

    // Both should show a small subset of 100 nodes
    assert!(
        stats_topleft.frame.display_list_size_estimated < 50,
        "Top-left view should show fewer than 50 nodes, got {}",
        stats_topleft.frame.display_list_size_estimated
    );
    assert!(
        stats_bottomright.frame.display_list_size_estimated < 50,
        "Bottom-right view should show fewer than 50 nodes, got {}",
        stats_bottomright.frame.display_list_size_estimated
    );

    println!(
        "top_left:     display_list={}, pic_used={}",
        stats_topleft.frame.display_list_size_estimated,
        stats_topleft.draw.cache_picture_used,
    );
    println!(
        "bottom_right: display_list={}, pic_used={}",
        stats_bottomright.frame.display_list_size_estimated,
        stats_bottomright.draw.cache_picture_used,
    );
}
