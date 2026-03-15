//! Benchmark Fixture Generator Tool
//!
//! Generates a heavy `bench.grida` file with large, loop-generated scenes
//! for benchmarking rendering, layout, and cache performance.
//!
//! ## Usage
//!
//! ```bash
//! cargo run --package cg --example tool_gen_bench_fixture
//! ```
//!
//! ## Output
//!
//! On success the tool prints the byte count, scene count, and output path.

mod fixture_helpers;

use cg::cg::color::CGColor;
use cg::cg::fe::*;
use cg::cg::stroke_width::StrokeWidth;
use cg::cg::types::*;
use cg::node::schema::*;
use fixture_helpers::*;
use std::collections::HashMap;

/// 100×100 grid of rectangles (10 000 nodes).
fn scene_flat_grid() -> Scene {
    let cols = 100;
    let rows = 100;
    let cell = 24.0_f32;
    let gap = 2.0_f32;

    let mut nodes = Vec::with_capacity(cols * rows);
    for row in 0..rows {
        for col in 0..cols {
            let x = col as f32 * (cell + gap);
            let y = row as f32 * (cell + gap);
            let r = ((col * 5) % 256) as u8;
            let g = ((row * 5) % 256) as u8;
            let b = (((col + row) * 3) % 256) as u8;
            nodes.push(rect(x, y, cell, cell, solid(r, g, b, 255)));
        }
    }
    flat_scene("bench-flat-grid", nodes)
}

/// 100×100 grid of ellipses (10 000 nodes).
fn scene_ellipse_grid() -> Scene {
    let cols = 100;
    let rows = 100;
    let cell = 32.0_f32;
    let gap = 4.0_f32;

    let mut nodes = Vec::with_capacity(cols * rows);
    for row in 0..rows {
        for col in 0..cols {
            let x = col as f32 * (cell + gap);
            let y = row as f32 * (cell + gap);
            let r = ((row * 8) % 256) as u8;
            let g = 100;
            let b = ((col * 8) % 256) as u8;
            nodes.push(ellipse(x, y, cell, cell, solid(r, g, b, 255)));
        }
    }
    flat_scene("bench-ellipse-grid", nodes)
}

/// Mixed node types with gradient fills (5 000 nodes).
fn scene_mixed_heavy() -> Scene {
    let count = 5000;
    let cols = 50;
    let cell = 30.0_f32;
    let gap = 4.0_f32;

    let mut nodes = Vec::with_capacity(count);
    for i in 0..count {
        let col = i % cols;
        let row = i / cols;
        let x = col as f32 * (cell + gap);
        let y = row as f32 * (cell + gap);

        let node = match i % 4 {
            0 => rect(x, y, cell, cell, linear_gradient()),
            1 => ellipse(x, y, cell, cell, radial_gradient()),
            2 => rect(x, y, cell, cell, sweep_gradient()),
            _ => {
                let r = ((i * 7) % 256) as u8;
                let g = ((i * 3) % 256) as u8;
                let b = ((i * 11) % 256) as u8;
                rect(x, y, cell, cell, solid(r, g, b, 200))
            }
        };
        nodes.push(node);
    }
    flat_scene("bench-mixed-heavy", nodes)
}

/// Wide container with 10 000 child rectangles.
fn scene_wide_container() -> Scene {
    let child_count: usize = 10_000;
    let cols: usize = 100;
    let cell = 20.0_f32;
    let gap = 2.0_f32;

    let container_w = cols as f32 * (cell + gap);
    let container_h = child_count.div_ceil(cols) as f32 * (cell + gap);

    let container = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: 0.0,
            right: 0.0,
            bottom: 0.0,
            left: 0.0,
        }),
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(container_w),
            layout_target_height: Some(container_h),
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(240, 240, 240, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::None,
        effects: LayerEffects::default(),
        clip: true,
    });

    let container_id: u64 = 1;
    let mut pairs: Vec<(u64, Node)> = vec![(container_id, container)];
    let mut children_ids: Vec<u64> = Vec::with_capacity(child_count);

    for i in 0..child_count {
        let id = (i + 2) as u64;
        let col = i % cols;
        let row = i / cols;
        let x = col as f32 * (cell + gap);
        let y = row as f32 * (cell + gap);
        let r = ((i * 13) % 256) as u8;
        let g = ((i * 7) % 256) as u8;
        let b = ((i * 3) % 256) as u8;
        pairs.push((id, rect(x, y, cell, cell, solid(r, g, b, 255))));
        children_ids.push(id);
    }

    let mut links = HashMap::new();
    links.insert(container_id, children_ids);
    build_scene("bench-wide-container", None, pairs, links, vec![container_id])
}

/// Deeply nested containers (500 levels deep), each with a leaf rect.
fn scene_deep_nesting() -> Scene {
    let depth = 500;
    let mut pairs: Vec<(u64, Node)> = Vec::with_capacity(depth * 2);
    let mut links: HashMap<u64, Vec<u64>> = HashMap::new();
    let mut id_counter: u64 = 1;

    for level in 0..depth {
        let container_id = id_counter;
        id_counter += 1;
        let leaf_id = id_counter;
        id_counter += 1;

        let offset = level as f32 * 4.0;
        let size = 1200.0 - level as f32 * 2.0;
        let size = size.max(20.0);

        let container = Node::Container(ContainerNodeRec {
            active: true,
            opacity: 1.0,
            blend_mode: LayerBlendMode::PassThrough,
            mask: None,
            rotation: 0.0,
            position: LayoutPositioningBasis::Inset(EdgeInsets {
                top: offset,
                right: 0.0,
                bottom: 0.0,
                left: offset,
            }),
            layout_container: LayoutContainerStyle::default(),
            layout_dimensions: LayoutDimensionStyle {
                layout_target_width: Some(size),
                layout_target_height: Some(size),
                layout_min_width: None,
                layout_max_width: None,
                layout_min_height: None,
                layout_max_height: None,
                layout_target_aspect_ratio: None,
            },
            layout_child: None,
            corner_radius: RectangularCornerRadius::default(),
            corner_smoothing: CornerSmoothing(0.0),
            fills: Paints::new(vec![solid(
                (200 - (level % 200)) as u8,
                (100 + (level * 2) % 156) as u8,
                ((level * 5) % 256) as u8,
                30,
            )]),
            strokes: Paints::new(vec![]),
            stroke_style: StrokeStyle::default(),
            stroke_width: StrokeWidth::None,
            effects: LayerEffects::default(),
            clip: false,
        });

        let leaf = rect(2.0, 2.0, 10.0, 10.0, solid(255, 0, 0, 180));

        pairs.push((container_id, container));
        pairs.push((leaf_id, leaf));

        let mut children = vec![leaf_id];
        if level + 1 < depth {
            let next_container_id = id_counter;
            children.push(next_container_id);
        }
        links.insert(container_id, children);
    }

    let root_id = 1u64;
    build_scene("bench-deep-nesting", None, pairs, links, vec![root_id])
}

/// Rotated rectangles spread across the canvas (5 000 nodes).
fn scene_rotated_rects() -> Scene {
    let count = 5000;

    let mut nodes = Vec::with_capacity(count);
    for i in 0..count {
        let angle = (i as f32) * 0.1;
        let radius = 20.0 + (i as f32) * 0.5;
        let x = 800.0 + angle.cos() * radius;
        let y = 800.0 + angle.sin() * radius;
        let rotation = (i as f32) * 7.3;
        let r = ((i * 17) % 256) as u8;
        let g = ((i * 11) % 256) as u8;
        let b = ((i * 5) % 256) as u8;
        nodes.push(rect_rotated(x, y, 20.0, 10.0, rotation, solid(r, g, b, 200)));
    }
    flat_scene("bench-rotated-rects", nodes)
}

/// Text nodes at scale (3 000 text spans).
fn scene_text_heavy() -> Scene {
    let count = 3000;
    let cols = 20;
    let row_h = 28.0_f32;
    let col_w = 200.0_f32;

    let mut nodes = Vec::with_capacity(count);
    for i in 0..count {
        let col = i % cols;
        let row = i / cols;
        let x = col as f32 * col_w;
        let y = row as f32 * row_h;
        let weight = if i % 3 == 0 { 700 } else { 400 };
        let size = 12.0 + (i % 5) as f32 * 2.0;
        nodes.push(text(x, y, &format!("Bench text #{i}"), size, weight));
    }
    flat_scene("bench-text-heavy", nodes)
}

/// Drop-shadow rectangles (2 000 nodes).
/// Each has a drop shadow — the primary target for layer compositing cache.
fn scene_shadow_grid() -> Scene {
    let cols = 50;
    let rows = 40;
    let cell = 40.0_f32;
    let gap = 20.0_f32;

    let mut nodes = Vec::with_capacity(cols * rows);
    for row in 0..rows {
        for col in 0..cols {
            let x = col as f32 * (cell + gap);
            let y = row as f32 * (cell + gap);
            let r = ((col * 7) % 256) as u8;
            let g = ((row * 11) % 256) as u8;
            let b = (((col + row) * 5) % 256) as u8;
            let effects = LayerEffects::new().drop_shadow(FeShadow {
                dx: 4.0,
                dy: 4.0,
                blur: 8.0,
                spread: 0.0,
                color: CGColor::from_rgba(0, 0, 0, 80),
                active: true,
            });
            nodes.push(rect_with_effects(x, y, cell, cell, solid(r, g, b, 255), effects));
        }
    }
    flat_scene("bench-shadow-grid", nodes)
}

/// Blurred rectangles (1 000 nodes).
/// Each has a layer blur effect.
fn scene_blur_grid() -> Scene {
    let cols = 40;
    let rows = 25;
    let cell = 50.0_f32;
    let gap = 10.0_f32;

    let mut nodes = Vec::with_capacity(cols * rows);
    for row in 0..rows {
        for col in 0..cols {
            let x = col as f32 * (cell + gap);
            let y = row as f32 * (cell + gap);
            let r = ((col * 13) % 256) as u8;
            let g = ((row * 7) % 256) as u8;
            let b = 180;
            let effects = LayerEffects {
                blur: Some(FeLayerBlur {
                    active: true,
                    blur: FeBlur::Gaussian(FeGaussianBlur {
                        radius: 3.0 + (col % 5) as f32,
                    }),
                }),
                ..LayerEffects::default()
            };
            nodes.push(rect_with_effects(x, y, cell, cell, solid(r, g, b, 255), effects));
        }
    }
    flat_scene("bench-blur-grid", nodes)
}

/// Mixed scene: plain rects + shadowed rects + blurred rects.
/// Exercises the compositor's split between promoted and live-drawn nodes.
fn scene_mixed_effects() -> Scene {
    let cols = 60;
    let rows = 60;
    let cell = 30.0_f32;
    let gap = 6.0_f32;

    let mut nodes = Vec::with_capacity(cols * rows);
    for row in 0..rows {
        for col in 0..cols {
            let x = col as f32 * (cell + gap);
            let y = row as f32 * (cell + gap);
            let r = ((col * 5 + row * 3) % 256) as u8;
            let g = ((row * 7) % 256) as u8;
            let b = ((col * 11) % 256) as u8;
            let i = row * cols + col;

            let effects = match i % 5 {
                // 40% plain — no effects
                0 | 1 => LayerEffects::default(),
                // 20% drop shadow
                2 => LayerEffects::new().drop_shadow(FeShadow {
                    dx: 2.0,
                    dy: 2.0,
                    blur: 6.0,
                    spread: 0.0,
                    color: CGColor::from_rgba(0, 0, 0, 60),
                    active: true,
                }),
                // 20% inner shadow
                3 => LayerEffects::new().inner_shadow(FeShadow {
                    dx: -1.0,
                    dy: -1.0,
                    blur: 4.0,
                    spread: 0.0,
                    color: CGColor::from_rgba(0, 0, 0, 100),
                    active: true,
                }),
                // 20% layer blur
                _ => LayerEffects {
                    blur: Some(FeLayerBlur {
                        active: true,
                        blur: FeBlur::Gaussian(FeGaussianBlur { radius: 2.0 }),
                    }),
                    ..LayerEffects::default()
                },
            };
            nodes.push(rect_with_effects(x, y, cell, cell, solid(r, g, b, 255), effects));
        }
    }
    flat_scene("bench-mixed-effects", nodes)
}

/// Container with drop shadow wrapping 2000 plain child rects.
/// This exercises the render surface optimization: the shadow is applied
/// ONCE to the composited subtree, not 2000 times.
///
/// Compare with `scene_shadow_grid` where each rect has its own shadow.
fn scene_shadow_container() -> Scene {
    let child_count: usize = 2000;
    let cols: usize = 50;
    let cell = 40.0_f32;
    let gap = 20.0_f32;

    let container_w = cols as f32 * (cell + gap);
    let container_h = child_count.div_ceil(cols) as f32 * (cell + gap);

    let shadow_effects = LayerEffects::new().drop_shadow(FeShadow {
        dx: 4.0,
        dy: 4.0,
        blur: 8.0,
        spread: 0.0,
        color: CGColor::from_rgba(0, 0, 0, 80),
        active: true,
    });

    let container = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: 0.0,
            right: 0.0,
            bottom: 0.0,
            left: 0.0,
        }),
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(container_w),
            layout_target_height: Some(container_h),
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(245, 245, 245, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::None,
        effects: shadow_effects,
        clip: false,
    });

    let container_id: u64 = 1;
    let mut pairs: Vec<(u64, Node)> = vec![(container_id, container)];
    let mut children_ids: Vec<u64> = Vec::with_capacity(child_count);

    for i in 0..child_count {
        let id = (i + 2) as u64;
        let col = i % cols;
        let row = i / cols;
        let x = col as f32 * (cell + gap);
        let y = row as f32 * (cell + gap);
        let r = ((col * 7) % 256) as u8;
        let g = ((row * 11) % 256) as u8;
        let b = (((col + row) * 5) % 256) as u8;
        pairs.push((id, rect(x, y, cell, cell, solid(r, g, b, 255))));
        children_ids.push(id);
    }

    let mut links = HashMap::new();
    links.insert(container_id, children_ids);
    build_scene("bench-shadow-container", None, pairs, links, vec![container_id])
}

/// Container with layer blur wrapping 1000 plain child rects.
/// The blur is applied once to the composited subtree via render surface.
fn scene_blur_container() -> Scene {
    let child_count: usize = 1000;
    let cols: usize = 40;
    let cell = 50.0_f32;
    let gap = 10.0_f32;

    let container_w = cols as f32 * (cell + gap);
    let container_h = child_count.div_ceil(cols) as f32 * (cell + gap);

    let blur_effects = LayerEffects {
        blur: Some(FeLayerBlur {
            active: true,
            blur: FeBlur::Gaussian(FeGaussianBlur { radius: 5.0 }),
        }),
        ..LayerEffects::default()
    };

    let container = Node::Container(ContainerNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::PassThrough,
        mask: None,
        rotation: 0.0,
        position: LayoutPositioningBasis::Inset(EdgeInsets {
            top: 0.0,
            right: 0.0,
            bottom: 0.0,
            left: 0.0,
        }),
        layout_container: LayoutContainerStyle::default(),
        layout_dimensions: LayoutDimensionStyle {
            layout_target_width: Some(container_w),
            layout_target_height: Some(container_h),
            layout_min_width: None,
            layout_max_width: None,
            layout_min_height: None,
            layout_max_height: None,
            layout_target_aspect_ratio: None,
        },
        layout_child: None,
        corner_radius: RectangularCornerRadius::default(),
        corner_smoothing: CornerSmoothing(0.0),
        fills: Paints::new(vec![solid(230, 230, 240, 255)]),
        strokes: Paints::new(vec![]),
        stroke_style: StrokeStyle::default(),
        stroke_width: StrokeWidth::None,
        effects: blur_effects,
        clip: false,
    });

    let container_id: u64 = 1;
    let mut pairs: Vec<(u64, Node)> = vec![(container_id, container)];
    let mut children_ids: Vec<u64> = Vec::with_capacity(child_count);

    for i in 0..child_count {
        let id = (i + 2) as u64;
        let col = i % cols;
        let row = i / cols;
        let x = col as f32 * (cell + gap);
        let y = row as f32 * (cell + gap);
        let r = ((col * 13) % 256) as u8;
        let g = ((row * 7) % 256) as u8;
        let b = 180;
        pairs.push((id, rect(x, y, cell, cell, solid(r, g, b, 255))));
        children_ids.push(id);
    }

    let mut links = HashMap::new();
    links.insert(container_id, children_ids);
    build_scene("bench-blur-container", None, pairs, links, vec![container_id])
}

fn main() {
    let scenes: Vec<(&str, _)> = vec![
        ("bench-flat-grid", scene_flat_grid()),
        ("bench-ellipse-grid", scene_ellipse_grid()),
        ("bench-mixed-heavy", scene_mixed_heavy()),
        ("bench-wide-container", scene_wide_container()),
        ("bench-deep-nesting", scene_deep_nesting()),
        ("bench-rotated-rects", scene_rotated_rects()),
        ("bench-text-heavy", scene_text_heavy()),
        ("bench-shadow-grid", scene_shadow_grid()),
        ("bench-blur-grid", scene_blur_grid()),
        ("bench-mixed-effects", scene_mixed_effects()),
        ("bench-shadow-container", scene_shadow_container()),
        ("bench-blur-container", scene_blur_container()),
    ];

    let total_nodes: usize = scenes
        .iter()
        .map(|(_, s)| s.graph.node_count())
        .sum();
    eprintln!("Generating bench.grida with {} scenes, ~{} total nodes", scenes.len(), total_nodes);

    write_multi_fixture_zip(&scenes, "bench");
}
