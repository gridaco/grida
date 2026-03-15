//! Extreme Benchmark Fixture Generator Tool
//!
//! Generates `bench-max.grida` — a very large file (100K–1M+ nodes) for
//! stress-testing rendering, layout, cache, and I/O pipelines at scale.
//!
//! **Warning:** This tool allocates significant memory and the output file
//! can exceed 200 MB.  Run in release mode for faster generation:
//!
//! ## Usage
//!
//! ```bash
//! cargo run --release --package cg --example tool_gen_bench_max_fixture
//! ```
//!
//! ## Output
//!
//! On success the tool prints the byte count, scene count, and output path.

mod fixture_helpers;

use cg::cg::stroke_width::StrokeWidth;
use cg::cg::types::*;
use cg::node::schema::*;
use fixture_helpers::*;
use std::collections::HashMap;

/// 500×500 grid of rectangles (250 000 nodes).
fn scene_flat_grid() -> Scene {
    let cols = 500;
    let rows = 500;
    let cell = 16.0_f32;
    let gap = 1.0_f32;

    let mut nodes = Vec::with_capacity(cols * rows);
    for row in 0..rows {
        for col in 0..cols {
            let x = col as f32 * (cell + gap);
            let y = row as f32 * (cell + gap);
            let r = ((col * 7) % 256) as u8;
            let g = ((row * 7) % 256) as u8;
            let b = (((col + row) * 3) % 256) as u8;
            nodes.push(rect(x, y, cell, cell, solid(r, g, b, 255)));
        }
    }
    flat_scene("bench-max-flat-grid", nodes)
}

/// 300×300 grid of ellipses (90 000 nodes).
fn scene_ellipse_grid() -> Scene {
    let cols = 300;
    let rows = 300;
    let cell = 20.0_f32;
    let gap = 2.0_f32;

    let mut nodes = Vec::with_capacity(cols * rows);
    for row in 0..rows {
        for col in 0..cols {
            let x = col as f32 * (cell + gap);
            let y = row as f32 * (cell + gap);
            let r = ((row * 5) % 256) as u8;
            let g = 120;
            let b = ((col * 5) % 256) as u8;
            nodes.push(ellipse(x, y, cell, cell, solid(r, g, b, 255)));
        }
    }
    flat_scene("bench-max-ellipse-grid", nodes)
}

/// Mixed node types with gradient fills (100 000 nodes).
fn scene_mixed_heavy() -> Scene {
    let count = 100_000;
    let cols = 200;
    let cell = 20.0_f32;
    let gap = 2.0_f32;

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
    flat_scene("bench-max-mixed-heavy", nodes)
}

/// Wide container with 100 000 child rectangles.
fn scene_wide_container() -> Scene {
    let child_count: usize = 100_000;
    let cols: usize = 200;
    let cell = 14.0_f32;
    let gap = 1.0_f32;

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
    let mut pairs: Vec<(u64, Node)> = Vec::with_capacity(child_count + 1);
    pairs.push((container_id, container));
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
    build_scene(
        "bench-max-wide-container",
        None,
        pairs,
        links,
        vec![container_id],
    )
}

/// Deeply nested containers (2 000 levels deep), each with a leaf rect.
fn scene_deep_nesting() -> Scene {
    let depth: usize = 2_000;
    let mut pairs: Vec<(u64, Node)> = Vec::with_capacity(depth * 2);
    let mut links: HashMap<u64, Vec<u64>> = HashMap::new();
    let mut id_counter: u64 = 1;

    for level in 0..depth {
        let container_id = id_counter;
        id_counter += 1;
        let leaf_id = id_counter;
        id_counter += 1;

        let offset = level as f32 * 2.0;
        let size = (5000.0 - level as f32 * 2.0).max(20.0);

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
    build_scene("bench-max-deep-nesting", None, pairs, links, vec![root_id])
}

/// Rotated rectangles spread across the canvas (100 000 nodes).
fn scene_rotated_rects() -> Scene {
    let count = 100_000;

    let mut nodes = Vec::with_capacity(count);
    for i in 0..count {
        let angle = (i as f32) * 0.03;
        let radius = 20.0 + (i as f32) * 0.15;
        let x = 5000.0 + angle.cos() * radius;
        let y = 5000.0 + angle.sin() * radius;
        let rotation = (i as f32) * 7.3;
        let r = ((i * 17) % 256) as u8;
        let g = ((i * 11) % 256) as u8;
        let b = ((i * 5) % 256) as u8;
        nodes.push(rect_rotated(
            x,
            y,
            16.0,
            8.0,
            rotation,
            solid(r, g, b, 200),
        ));
    }
    flat_scene("bench-max-rotated-rects", nodes)
}

/// Text nodes at extreme scale (50 000 text spans).
fn scene_text_heavy() -> Scene {
    let count = 50_000;
    let cols = 50;
    let row_h = 24.0_f32;
    let col_w = 180.0_f32;

    let mut nodes = Vec::with_capacity(count);
    for i in 0..count {
        let col = i % cols;
        let row = i / cols;
        let x = col as f32 * col_w;
        let y = row as f32 * row_h;
        let weight = if i % 3 == 0 { 700 } else { 400 };
        let size = 10.0 + (i % 5) as f32 * 2.0;
        nodes.push(text(x, y, &format!("Max bench #{i}"), size, weight));
    }
    flat_scene("bench-max-text-heavy", nodes)
}

/// Multiple wide containers side-by-side (10 containers × 10 000 children = 100 010 nodes).
fn scene_multi_container() -> Scene {
    let num_containers: usize = 10;
    let children_per: usize = 10_000;
    let cols: usize = 100;
    let cell = 14.0_f32;
    let gap = 1.0_f32;

    let total = num_containers * (1 + children_per);
    let mut pairs: Vec<(u64, Node)> = Vec::with_capacity(total);
    let mut links: HashMap<u64, Vec<u64>> = HashMap::new();
    let mut root_ids: Vec<u64> = Vec::with_capacity(num_containers);
    let mut id_counter: u64 = 1;

    for ci in 0..num_containers {
        let container_id = id_counter;
        id_counter += 1;
        root_ids.push(container_id);

        let offset_x = ci as f32 * 1600.0;
        let container_w = cols as f32 * (cell + gap);
        let container_h = children_per.div_ceil(cols) as f32 * (cell + gap);

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
                left: offset_x,
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
            fills: Paints::new(vec![solid(
                (200 + ci * 5) as u8,
                (220 + ci * 3) as u8,
                240,
                255,
            )]),
            strokes: Paints::new(vec![]),
            stroke_style: StrokeStyle::default(),
            stroke_width: StrokeWidth::None,
            effects: LayerEffects::default(),
            clip: true,
        });

        pairs.push((container_id, container));
        let mut children_ids: Vec<u64> = Vec::with_capacity(children_per);

        for j in 0..children_per {
            let id = id_counter;
            id_counter += 1;
            let col = j % cols;
            let row = j / cols;
            let x = col as f32 * (cell + gap);
            let y = row as f32 * (cell + gap);
            let r = ((j * 11 + ci * 37) % 256) as u8;
            let g = ((j * 7 + ci * 23) % 256) as u8;
            let b = ((j * 3 + ci * 59) % 256) as u8;
            pairs.push((id, rect(x, y, cell, cell, solid(r, g, b, 255))));
            children_ids.push(id);
        }

        links.insert(container_id, children_ids);
    }

    build_scene("bench-max-multi-container", None, pairs, links, root_ids)
}

fn main() {
    eprintln!("Building scenes (this may take a while)...");

    let scenes: Vec<(&str, _)> = vec![
        ("bench-max-flat-grid", scene_flat_grid()),
        ("bench-max-ellipse-grid", scene_ellipse_grid()),
        ("bench-max-mixed-heavy", scene_mixed_heavy()),
        ("bench-max-wide-container", scene_wide_container()),
        ("bench-max-deep-nesting", scene_deep_nesting()),
        ("bench-max-rotated-rects", scene_rotated_rects()),
        ("bench-max-text-heavy", scene_text_heavy()),
        ("bench-max-multi-container", scene_multi_container()),
    ];

    let total_nodes: usize = scenes.iter().map(|(_, s)| s.graph.node_count()).sum();
    eprintln!(
        "Encoding bench-max.grida: {} scenes, ~{} total nodes",
        scenes.len(),
        total_nodes
    );

    write_multi_fixture_zip(&scenes, "bench-max");
}
