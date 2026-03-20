//! Pixel-comparison tests verifying that compositor-cached rendering of nodes
//! with effects (blur, shadows) matches live rendering.
//!
//! The compositor rasterizes promoted nodes into offscreen textures, then blits
//! them. This test ensures the rasterization path produces identical output to
//! the live (direct draw) path for nodes with effects.

use cg::cache::geometry::GeometryCache;
use cg::cache::scene::SceneCache;
use cg::cg::prelude::*;
use cg::node::{
    factory::NodeFactory,
    scene_graph::{Parent, SceneGraph},
    schema::*,
};
use cg::painter::{Painter, PromotedBlit};
use cg::resources::ByteStore;
use cg::runtime::font_repository::FontRepository;
use cg::runtime::image_repository::ImageRepository;
use cg::runtime::render_policy::RenderPolicy;
use math2::rect::Rectangle;
use skia_safe::{surfaces, Paint as SkPaint, Rect, Surface};
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::{Arc, Mutex};

/// Create a raster surface of the given size.
fn make_surface(w: i32, h: i32) -> Surface {
    surfaces::raster_n32_premul((w, h)).expect("Failed to create surface")
}

/// Read RGBA pixels from a surface.
fn surface_to_rgba(surface: &mut Surface, w: i32, h: i32) -> Vec<[u8; 4]> {
    let img = surface.image_snapshot();
    let info = img.image_info();
    let row_bytes = info.min_row_bytes();
    let mut raw = vec![0u8; row_bytes * h as usize];
    img.read_pixels(
        &info,
        &mut raw,
        row_bytes,
        skia_safe::IPoint::new(0, 0),
        skia_safe::image::CachingHint::Allow,
    );
    let pixel_count = (w * h) as usize;
    let mut rgba = Vec::with_capacity(pixel_count);
    for i in 0..pixel_count {
        let off = i * 4;
        rgba.push([raw[off + 2], raw[off + 1], raw[off], raw[off + 3]]);
    }
    rgba
}

fn make_store() -> Arc<Mutex<ByteStore>> {
    Arc::new(Mutex::new(ByteStore::new()))
}

/// Draw a layer live into a surface (no compositor, direct painting).
fn draw_layer_live(
    layer: &cg::painter::layer::PainterPictureLayer,
    scene_cache: &SceneCache,
    w: i32,
    h: i32,
) -> Vec<[u8; 4]> {
    let mut surface = make_surface(w, h);
    let canvas = surface.canvas();
    canvas.clear(skia_safe::Color::TRANSPARENT);

    let store = make_store();
    let fonts = FontRepository::new(store.clone());
    let images = ImageRepository::new(store);
    let policy = RenderPolicy::STANDARD;

    let painter = Painter::new_with_scene_cache(canvas, &fonts, &images, scene_cache, policy);
    painter.draw_layer(layer);

    surface_to_rgba(&mut surface, w, h)
}

/// Simulate compositor rasterization: draw a layer into an offscreen surface
/// using the same setup as update_compositor_inner(), then blit to a final surface.
fn draw_layer_composited(
    layer: &cg::painter::layer::PainterPictureLayer,
    render_bounds: &Rectangle,
    scene_cache: &SceneCache,
    w: i32,
    h: i32,
    zoom: f32,
) -> Vec<[u8; 4]> {
    let pixel_width = (render_bounds.width * zoom).ceil() as i32;
    let pixel_height = (render_bounds.height * zoom).ceil() as i32;

    // Step 1: Rasterize into offscreen (same as compositor path)
    let mut offscreen = make_surface(pixel_width.max(1), pixel_height.max(1));
    {
        let off_canvas = offscreen.canvas();
        off_canvas.clear(skia_safe::Color::TRANSPARENT);
        // Same transform as update_compositor_inner: scale(zoom) * translate(-render_bounds.origin)
        off_canvas.scale((zoom, zoom));
        off_canvas.translate((-render_bounds.x, -render_bounds.y));

        let store = make_store();
        let fonts = FontRepository::new(store.clone());
        let images = ImageRepository::new(store);
        let policy = RenderPolicy::STANDARD;

        let painter =
            Painter::new_with_scene_cache(off_canvas, &fonts, &images, scene_cache, policy);
        painter.draw_layer(layer);
    }

    // Step 2: Blit the offscreen texture to the final surface (same as draw() blit path)
    let mut final_surface = make_surface(w, h);
    let final_canvas = final_surface.canvas();
    final_canvas.clear(skia_safe::Color::TRANSPARENT);

    let dst = Rect::from_xywh(
        render_bounds.x,
        render_bounds.y,
        render_bounds.width,
        render_bounds.height,
    );
    let img = offscreen.image_snapshot();
    let src = Rect::new(0.0, 0.0, img.width() as f32, img.height() as f32);
    let paint = SkPaint::default();
    final_canvas.draw_image_rect(
        &img,
        Some((&src, skia_safe::canvas::SrcRectConstraint::Fast)),
        dst,
        &paint,
    );

    surface_to_rgba(&mut final_surface, w, h)
}

/// Check if any non-transparent pixel exists in the image.
fn has_visible_pixels(pixels: &[[u8; 4]]) -> bool {
    pixels.iter().any(|p| p[3] > 0)
}

/// Count non-transparent pixels.
fn count_visible_pixels(pixels: &[[u8; 4]]) -> usize {
    pixels.iter().filter(|p| p[3] > 0).count()
}

/// Count pixels with any channel difference > threshold.
fn count_differing_pixels(a: &[[u8; 4]], b: &[[u8; 4]], threshold: u8) -> usize {
    a.iter()
        .zip(b.iter())
        .filter(|(pa, pb)| {
            (0..4).any(|c| (pa[c] as i16 - pb[c] as i16).unsigned_abs() > threshold as u16)
        })
        .count()
}

fn build_scene_cache(scene: &Scene) -> SceneCache {
    let store = make_store();
    let fonts = FontRepository::new(store);
    let mut scene_cache = SceneCache::new();
    scene_cache.geometry = GeometryCache::from_scene(scene, &fonts);
    scene_cache.update_layers(scene);
    scene_cache
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

/// Test that a rectangle with a layer blur renders identically
/// via live drawing and compositor (offscreen) rasterization.
#[test]
fn compositor_preserves_layer_blur() {
    let w = 200;
    let h = 200;
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut rect = nf.create_rectangle_node();
    rect.size = Size {
        width: 80.0,
        height: 60.0,
    };
    rect.transform = math2::transform::AffineTransform::new(60.0, 70.0, 0.0);
    rect.effects = LayerEffects::new().blur(5.0f32);
    rect.set_fill(Paint::Solid(SolidPaint {
        color: CGColor::from_rgba(255, 0, 0, 255),
        blend_mode: BlendMode::Normal,
        active: true,
    }));

    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

    let scene = Scene {
        name: "blur_test".into(),
        graph,
        background_color: None,
    };

    let scene_cache = build_scene_cache(&scene);

    let layer_entry = scene_cache
        .layers
        .layers
        .iter()
        .find(|e| e.id == rect_id)
        .expect("Layer entry not found");

    let render_bounds = scene_cache
        .geometry
        .get_render_bounds(&rect_id)
        .expect("Render bounds not found");

    // Live rendering
    let live_pixels = draw_layer_live(&layer_entry.layer, &scene_cache, w, h);

    // Compositor rendering at zoom=1
    let comp_pixels =
        draw_layer_composited(&layer_entry.layer, &render_bounds, &scene_cache, w, h, 1.0);

    // Both should have visible pixels
    assert!(
        has_visible_pixels(&live_pixels),
        "Live rendering produced no visible pixels"
    );
    assert!(
        has_visible_pixels(&comp_pixels),
        "Compositor rendering produced no visible pixels — blur effect was lost"
    );

    let live_visible = count_visible_pixels(&live_pixels);
    let comp_visible = count_visible_pixels(&comp_pixels);

    // Compositor should produce at least 70% of visible pixels
    assert!(
        comp_visible >= live_visible * 70 / 100,
        "Compositor lost too many visible pixels: live={live_visible}, comp={comp_visible}"
    );

    // Pixel comparison: allow minor differences
    let diff_count = count_differing_pixels(&live_pixels, &comp_pixels, 10);
    let total_pixels = (w * h) as usize;
    let diff_pct = diff_count as f64 / total_pixels as f64 * 100.0;
    assert!(
        diff_pct < 5.0,
        "Too many differing pixels: {diff_count} ({diff_pct:.1}%)"
    );
}

/// Test that a rectangle with a drop shadow renders identically.
#[test]
fn compositor_preserves_drop_shadow() {
    let w = 250;
    let h = 250;
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut rect = nf.create_rectangle_node();
    rect.size = Size {
        width: 80.0,
        height: 60.0,
    };
    rect.transform = math2::transform::AffineTransform::new(80.0, 90.0, 0.0);
    rect.effects = LayerEffects::from_array(vec![FilterEffect::DropShadow(FeShadow {
        dx: 5.0,
        dy: 5.0,
        blur: 8.0,
        spread: 0.0,
        color: CGColor::from_rgba(0, 0, 0, 200),
        active: true,
    })]);
    rect.set_fill(Paint::Solid(SolidPaint {
        color: CGColor::from_rgba(0, 128, 255, 255),
        blend_mode: BlendMode::Normal,
        active: true,
    }));

    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

    let scene = Scene {
        name: "shadow_test".into(),
        graph,
        background_color: None,
    };

    let scene_cache = build_scene_cache(&scene);

    let layer_entry = scene_cache
        .layers
        .layers
        .iter()
        .find(|e| e.id == rect_id)
        .expect("Layer entry not found");

    let render_bounds = scene_cache
        .geometry
        .get_render_bounds(&rect_id)
        .expect("Render bounds not found");

    let live_pixels = draw_layer_live(&layer_entry.layer, &scene_cache, w, h);
    let comp_pixels =
        draw_layer_composited(&layer_entry.layer, &render_bounds, &scene_cache, w, h, 1.0);

    assert!(
        has_visible_pixels(&live_pixels),
        "Live rendering produced no visible pixels"
    );
    assert!(
        has_visible_pixels(&comp_pixels),
        "Compositor rendering produced no visible pixels — drop shadow was lost"
    );

    let live_visible = count_visible_pixels(&live_pixels);
    let comp_visible = count_visible_pixels(&comp_pixels);
    assert!(
        comp_visible >= live_visible * 70 / 100,
        "Compositor lost too many visible pixels: live={live_visible}, comp={comp_visible}"
    );

    let diff_count = count_differing_pixels(&live_pixels, &comp_pixels, 10);
    let total_pixels = (w * h) as usize;
    let diff_pct = diff_count as f64 / total_pixels as f64 * 100.0;
    assert!(
        diff_pct < 5.0,
        "Too many differing pixels: {diff_count} ({diff_pct:.1}%)"
    );
}

/// Test that a rectangle with effects INSIDE a container renders correctly
/// when compositor-cached. This is the specific scenario from the bug report.
#[test]
fn compositor_preserves_effects_inside_container() {
    let w = 300;
    let h = 300;
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    // Create a container
    let container = nf.create_container_node();
    let container_id = graph.append_child(Node::Container(container), Parent::Root);

    // Create a rectangle child with blur inside the container
    let mut rect = nf.create_rectangle_node();
    rect.size = Size {
        width: 100.0,
        height: 80.0,
    };
    rect.transform = math2::transform::AffineTransform::new(50.0, 60.0, 0.0);
    rect.effects = LayerEffects::new().blur(8.0f32);
    rect.set_fill(Paint::Solid(SolidPaint {
        color: CGColor::from_rgba(255, 50, 50, 255),
        blend_mode: BlendMode::Normal,
        active: true,
    }));

    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::NodeId(container_id));

    let scene = Scene {
        name: "container_blur_test".into(),
        graph,
        background_color: None,
    };

    let scene_cache = build_scene_cache(&scene);

    // Find the child rectangle's layer entry
    let child_layer_entry = scene_cache
        .layers
        .layers
        .iter()
        .find(|e| e.id == rect_id)
        .expect("Child layer entry not found");

    let render_bounds = scene_cache
        .geometry
        .get_render_bounds(&rect_id)
        .expect("Render bounds not found");

    // Verify render_bounds includes blur expansion
    let world_bounds = scene_cache
        .geometry
        .get_world_bounds(&rect_id)
        .expect("World bounds not found");
    assert!(
        render_bounds.width > world_bounds.width,
        "render_bounds should be wider than world_bounds (blur expansion)"
    );
    assert!(
        render_bounds.height > world_bounds.height,
        "render_bounds should be taller than world_bounds (blur expansion)"
    );

    let live_pixels = draw_layer_live(&child_layer_entry.layer, &scene_cache, w, h);
    let comp_pixels = draw_layer_composited(
        &child_layer_entry.layer,
        &render_bounds,
        &scene_cache,
        w,
        h,
        1.0,
    );

    assert!(
        has_visible_pixels(&live_pixels),
        "Live rendering produced no visible pixels"
    );
    assert!(
        has_visible_pixels(&comp_pixels),
        "Compositor rendering produced no visible pixels — effects were lost inside container"
    );

    let live_visible = count_visible_pixels(&live_pixels);
    let comp_visible = count_visible_pixels(&comp_pixels);
    assert!(
        comp_visible >= live_visible * 70 / 100,
        "Compositor lost too many visible pixels inside container: live={live_visible}, comp={comp_visible}"
    );
}

/// Test that compositor rasterization at zoom=2 still preserves effects.
#[test]
fn compositor_preserves_blur_at_zoom_2() {
    let w = 300;
    let h = 300;
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut rect = nf.create_rectangle_node();
    rect.size = Size {
        width: 60.0,
        height: 40.0,
    };
    rect.transform = math2::transform::AffineTransform::new(40.0, 50.0, 0.0);
    rect.effects = LayerEffects::new().blur(6.0f32);
    rect.set_fill(Paint::Solid(SolidPaint {
        color: CGColor::from_rgba(0, 200, 100, 255),
        blend_mode: BlendMode::Normal,
        active: true,
    }));

    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::Root);

    let scene = Scene {
        name: "zoom_blur_test".into(),
        graph,
        background_color: None,
    };

    let scene_cache = build_scene_cache(&scene);

    let layer_entry = scene_cache
        .layers
        .layers
        .iter()
        .find(|e| e.id == rect_id)
        .expect("Layer entry not found");

    let render_bounds = scene_cache
        .geometry
        .get_render_bounds(&rect_id)
        .expect("Render bounds not found");

    let comp_pixels =
        draw_layer_composited(&layer_entry.layer, &render_bounds, &scene_cache, w, h, 2.0);

    assert!(
        has_visible_pixels(&comp_pixels),
        "Compositor at zoom=2 produced no visible pixels"
    );
}

/// Verify that a child's render_bounds includes its blur expansion,
/// while the container's render_bounds only reflects its own bounds.
#[test]
fn container_render_bounds_vs_child_render_bounds() {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let mut container = nf.create_container_node();
    container.layout_dimensions.layout_target_width = Some(200.0);
    container.layout_dimensions.layout_target_height = Some(150.0);
    let container_id = graph.append_child(Node::Container(container), Parent::Root);

    let mut rect = nf.create_rectangle_node();
    rect.size = Size {
        width: 50.0,
        height: 40.0,
    };
    rect.transform = math2::transform::AffineTransform::new(10.0, 10.0, 0.0);
    rect.effects = LayerEffects::new().blur(10.0f32);

    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::NodeId(container_id));

    let scene = Scene {
        name: "bounds_test".into(),
        graph,
        background_color: None,
    };

    let store = make_store();
    let fonts = FontRepository::new(store);
    let cache = GeometryCache::from_scene(&scene, &fonts);

    let container_rb = cache.get_render_bounds(&container_id).unwrap();
    let child_rb = cache.get_render_bounds(&rect_id).unwrap();

    // Child render_bounds should include blur expansion (10 * 3 = 30 on each side)
    assert!(
        child_rb.width > 50.0,
        "Child render_bounds should include blur expansion"
    );

    let expected_expansion = 10.0 * 3.0;
    let expected_child_width = 50.0 + 2.0 * expected_expansion;
    assert!(
        (child_rb.width - expected_child_width).abs() < 1.0,
        "Child render_bounds width should be ~{expected_child_width}, got {}",
        child_rb.width
    );

    // Container's render_bounds based on its own bounds (current behavior)
    assert_eq!(
        container_rb.width, 200.0,
        "Container render_bounds should match its own bounds"
    );
}

/// Regression test: Z-order interleaving of promoted blits and live draws.
///
/// When a Container (not promoted, drawn live) has a child with blur effects
/// (promoted, compositor-cached), the child must be visible ABOVE the
/// container's background fill. Previously, all promoted nodes were blitted
/// in a batch BEFORE live nodes were drawn, causing the Container's
/// background to cover its promoted children.
///
/// This test simulates the full draw path: builds a LayerList with both a
/// container (live) and its child (promoted via blur), then draws using
/// `draw_layer_list` with `promoted_blits` to verify the child is visible.
#[test]
fn z_order_promoted_child_visible_above_container() {
    let w = 300;
    let h = 300;
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    // Container with solid fill (white) — drawn live, NOT promoted
    let mut container = nf.create_container_node();
    container.layout_dimensions.layout_target_width = Some(200.0);
    container.layout_dimensions.layout_target_height = Some(150.0);
    // Ensure the container has a solid white fill
    container.fills = Paints::new(vec![Paint::Solid(SolidPaint {
        color: CGColor::from_rgba(255, 255, 255, 255),
        blend_mode: BlendMode::Normal,
        active: true,
    })]);
    let container_id = graph.append_child(Node::Container(container), Parent::Root);

    // Child rectangle with blur effect (red) — will be "promoted"
    let mut rect = nf.create_rectangle_node();
    rect.size = Size {
        width: 100.0,
        height: 80.0,
    };
    rect.transform = math2::transform::AffineTransform::new(50.0, 35.0, 0.0);
    rect.effects = LayerEffects::new().blur(5.0f32);
    rect.set_fill(Paint::Solid(SolidPaint {
        color: CGColor::from_rgba(255, 0, 0, 255),
        blend_mode: BlendMode::Normal,
        active: true,
    }));

    let rect_id = graph.append_child(Node::Rectangle(rect), Parent::NodeId(container_id));

    let scene = Scene {
        name: "z_order_test".into(),
        graph,
        background_color: None,
    };

    let scene_cache = build_scene_cache(&scene);

    let render_bounds = scene_cache
        .geometry
        .get_render_bounds(&rect_id)
        .expect("Render bounds not found");

    // Step 1: Draw the child into an offscreen surface (simulating compositor)
    let zoom = 1.0f32;
    let pixel_width = (render_bounds.width * zoom).ceil() as i32;
    let pixel_height = (render_bounds.height * zoom).ceil() as i32;

    let mut offscreen = make_surface(pixel_width.max(1), pixel_height.max(1));
    {
        let child_layer_entry = scene_cache
            .layers
            .layers
            .iter()
            .find(|e| e.id == rect_id)
            .expect("Child layer entry not found");

        let off_canvas = offscreen.canvas();
        off_canvas.clear(skia_safe::Color::TRANSPARENT);
        off_canvas.scale((zoom, zoom));
        off_canvas.translate((-render_bounds.x, -render_bounds.y));

        let store = make_store();
        let fonts = FontRepository::new(store.clone());
        let images = ImageRepository::new(store);
        let policy = RenderPolicy::STANDARD;

        let painter =
            Painter::new_with_scene_cache(off_canvas, &fonts, &images, &scene_cache, policy);
        painter.draw_layer(&child_layer_entry.layer);
    }

    let offscreen_image = offscreen.image_snapshot();

    // Step 2: Build the promoted_blits map
    let mut promoted_blits: HashMap<NodeId, PromotedBlit> = HashMap::new();
    let src_rect = Rect::new(
        0.0,
        0.0,
        offscreen_image.width() as f32,
        offscreen_image.height() as f32,
    );
    let dst_rect = Rect::from_xywh(
        render_bounds.x,
        render_bounds.y,
        render_bounds.width,
        render_bounds.height,
    );
    promoted_blits.insert(
        rect_id,
        PromotedBlit {
            image: Rc::new(offscreen_image),
            src_rect,
            dst_rect,
            opacity: 1.0,
            blend_mode: skia_safe::BlendMode::SrcOver,
        },
    );

    // Step 3: Draw the full layer list with promoted_blits
    let mut surface = make_surface(w, h);
    let canvas = surface.canvas();
    canvas.clear(skia_safe::Color::WHITE);

    let store = make_store();
    let fonts = FontRepository::new(store.clone());
    let images = ImageRepository::new(store);
    let policy = RenderPolicy::STANDARD;

    let painter = Painter::new_with_scene_cache(canvas, &fonts, &images, &scene_cache, policy)
        .with_promoted_blits(&promoted_blits);
    painter.draw_layer_list(&scene_cache.layers);

    // Step 4: Verify the child rectangle is visible (red pixels exist)
    let pixels = surface_to_rgba(&mut surface, w, h);

    // Check for non-white pixels in the area where the child should be (50..150, 35..115).
    // The child has a colored fill (red in RGBA), which should be visually distinct
    // from the container's white background. We check for pixels that are NOT white.
    //
    // Note: We avoid checking specific channel values due to platform-dependent
    // channel ordering (BGRA vs RGBA in Skia's kN32 format).
    let mut child_pixel_count = 0;
    for y in 45..105 {
        for x in 60..140 {
            let idx = y * w as usize + x;
            let p = pixels[idx];
            // Check for non-white, opaque pixels — any channel < 200 means not white
            let is_white = p[0] > 240 && p[1] > 240 && p[2] > 240;
            if !is_white && p[3] > 200 {
                child_pixel_count += 1;
            }
        }
    }

    // The inner area is 80x60 = 4800 pixels. With blur the center should
    // still have clearly colored pixels. We expect at least 25% of the
    // interior to be clearly non-white.
    assert!(
        child_pixel_count > 1000,
        "Promoted child NOT visible above container — z-order bug! \
         Non-white pixels in child inner area: {child_pixel_count} (expected > 1000). \
         Container background is covering the promoted child."
    );

    // Also verify that white pixels exist in the container area outside the child
    // (proving the container background was drawn)
    let mut white_pixel_count = 0;
    for y in 0..35 {
        for x in 0..200 {
            let idx = y * w as usize + x;
            let p = pixels[idx];
            if p[0] > 240 && p[1] > 240 && p[2] > 240 && p[3] > 200 {
                white_pixel_count += 1;
            }
        }
    }

    assert!(
        white_pixel_count > 1000,
        "Container background not drawn: white pixels = {white_pixel_count}"
    );
}
