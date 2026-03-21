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

/// Single wide container with 10 000 absolutely positioned child rectangles.
///
/// Children use `rect_absolute` so Taffy places them on the explicit grid (same pattern as
/// `bench-blur-container`). Without `LayoutPositioning::Absolute`, `LayoutMode::Normal` would
/// stack them in block flow and ignore transform-based cell coordinates.
///
/// `clip: true` on the container exercises clipping against a tight bounds rect that matches
/// the grid extent (last row/column edges, no extra slack gap).
fn scene_wide_container() -> Scene {
    let child_count: usize = 10_000;
    let cols: usize = 100;
    let cell = 20.0_f32;
    let gap = 2.0_f32;
    let rows = child_count.div_ceil(cols);

    let container_w = cols as f32 * cell + (cols - 1).max(0) as f32 * gap;
    let container_h = rows as f32 * cell + (rows - 1).max(0) as f32 * gap;

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
        pairs.push((id, rect_absolute(x, y, cell, cell, solid(r, g, b, 255))));
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

/// Text spans with stroke (3 000 nodes).
fn scene_text_stroke_heavy() -> Scene {
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
        let stroke_w = 1.0 + (i % 3) as f32;
        nodes.push(Node::TextSpan(TextSpanNodeRec {
            active: true,
            transform: AffineTransform::new(x, y, 0.0),
            width: None,
            height: None,
            layout_child: None,
            text: format!("Stroke text #{i}"),
            text_style: {
                let mut ts = TextStyleRec::from_font("Inter", size);
                ts.font_weight = FontWeight(weight);
                ts
            },
            text_align: TextAlign::Left,
            text_align_vertical: TextAlignVertical::Top,
            max_lines: None,
            ellipsis: None,
            fills: Paints::new(vec![solid(30, 30, 40, 255)]),
            strokes: Paints::new(vec![solid(255, 140, 0, 255)]),
            stroke_width: stroke_w,
            stroke_align: StrokeAlign::Center,
            opacity: 1.0,
            blend_mode: LayerBlendMode::PassThrough,
            mask: None,
            effects: LayerEffects::default(),
        }));
    }
    flat_scene("bench-text-stroke-heavy", nodes)
}

/// Filled rectangles with uniform stroke (2 000 nodes).
fn scene_stroke_rect_grid() -> Scene {
    let cols = 50;
    let rows = 40;
    let cell = 40.0_f32;
    let gap = 8.0_f32;

    let mut nodes = Vec::with_capacity(cols * rows);
    for row in 0..rows {
        for col in 0..cols {
            let x = col as f32 * (cell + gap);
            let y = row as f32 * (cell + gap);
            let r = ((col * 7) % 256) as u8;
            let g = ((row * 11) % 256) as u8;
            let b = (((col + row) * 5) % 256) as u8;
            let sw = 1.0 + (col % 4) as f32;
            nodes.push(Node::Rectangle(RectangleNodeRec {
                active: true,
                opacity: 1.0,
                blend_mode: LayerBlendMode::PassThrough,
                mask: None,
                transform: AffineTransform::from_box_center(x, y, cell, cell, 0.0),
                size: Size {
                    width: cell,
                    height: cell,
                },
                corner_radius: RectangularCornerRadius::default(),
                corner_smoothing: CornerSmoothing(0.0),
                fills: Paints::new(vec![solid(r, g, b, 230)]),
                strokes: Paints::new(vec![solid(20, 20, 30, 255)]),
                stroke_style: StrokeStyle::default(),
                stroke_width: StrokeWidth::Uniform(sw),
                effects: LayerEffects::default(),
                layout_child: None,
            }));
        }
    }
    flat_scene("bench-stroke-rect-grid", nodes)
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
                spread: 4.0,
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
        pairs.push((id, rect_absolute(x, y, cell, cell, solid(r, g, b, 255))));
        children_ids.push(id);
    }

    let mut links = HashMap::new();
    links.insert(container_id, children_ids);
    build_scene("bench-blur-container", None, pairs, links, vec![container_id])
}

/// 1000 individually-blurred rects inside a plain container (no container effects).
/// This proves the bottleneck is per-node effects, not the absence of a container.
/// Should perform the same as blur-grid (~7 fps).
fn scene_blur_children_in_container() -> Scene {
    let child_count: usize = 1000;
    let cols: usize = 40;
    let cell = 50.0_f32;
    let gap = 10.0_f32;

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
        effects: LayerEffects::default(), // NO effects on container
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
        let effects = LayerEffects {
            blur: Some(FeLayerBlur {
                active: true,
                blur: FeBlur::Gaussian(FeGaussianBlur {
                    radius: 3.0 + (col % 5) as f32,
                }),
            }),
            ..LayerEffects::default()
        };
        pairs.push((
            id,
            rect_absolute_with_effects(x, y, cell, cell, solid(r, g, b, 255), effects),
        ));
        children_ids.push(id);
    }

    let mut links = HashMap::new();
    links.insert(container_id, children_ids);
    build_scene(
        "bench-blur-children-in-container",
        None,
        pairs,
        links,
        vec![container_id],
    )
}

/// Progressive-blurred rectangles (~300 nodes).
/// Each has a layer progressive blur with varying gradient directions.
fn scene_progressive_blur_grid() -> Scene {
    let cols = 20;
    let rows = 15;
    let cell = 50.0_f32;
    let gap = 10.0_f32;

    let mut nodes = Vec::with_capacity(cols * rows);
    for row in 0..rows {
        for col in 0..cols {
            let x = col as f32 * (cell + gap);
            let y = row as f32 * (cell + gap);
            let r = ((col * 11) % 256) as u8;
            let g = ((row * 9) % 256) as u8;
            let b = 160;

            // Rotate gradient direction per node for variety
            let angle = (col + row) as f32 * 0.3;
            let sx = angle.cos();
            let sy = angle.sin();

            let effects = LayerEffects {
                blur: Some(FeLayerBlur {
                    active: true,
                    blur: FeBlur::Progressive(FeProgressiveBlur {
                        start: Alignment(-sx, -sy),
                        end: Alignment(sx, sy),
                        radius: 0.0,
                        radius2: 6.0 + (col % 4) as f32 * 2.0,
                    }),
                }),
                ..LayerEffects::default()
            };
            nodes.push(rect_with_effects(x, y, cell, cell, solid(r, g, b, 255), effects));
        }
    }
    flat_scene("bench-progressive-blur-grid", nodes)
}

/// High-contrast vertical stripes under semi-transparent panels with backdrop blur.
/// Stripes span the full grid so blur visibly smears fine detail; roots list stripes first.
fn scene_backdrop_blur_grid() -> Scene {
    let cols = 20;
    let rows = 15;
    let cell = 52.0_f32;
    let gap = 8.0_f32;

    let grid_w = cols as f32 * cell + (cols - 1).max(0) as f32 * gap;
    let grid_h = rows as f32 * cell + (rows - 1).max(0) as f32 * gap;
    let stripe_w = 14.0_f32;
    let n_stripes = ((grid_w / stripe_w).ceil() as usize).max(1);

    let mut pairs: Vec<(u64, Node)> = Vec::with_capacity(n_stripes + cols * rows);
    let mut roots: Vec<u64> = Vec::with_capacity(n_stripes + cols * rows);
    let mut id: u64 = 1;

    for i in 0..n_stripes {
        let left = i as f32 * stripe_w;
        if left >= grid_w {
            break;
        }
        let w = stripe_w.min(grid_w - left);
        let cx = left + w * 0.5;
        let cy = grid_h * 0.5;
        // Slate / rose stripes — high contrast so backdrop blur is obvious.
        let fill = if i % 2 == 0 {
            solid(15, 23, 42, 255)
        } else {
            solid(244, 63, 94, 255)
        };
        pairs.push((id, rect(cx, cy, w, grid_h, fill)));
        roots.push(id);
        id += 1;
    }

    for row in 0..rows {
        for col in 0..cols {
            let x = col as f32 * (cell + gap);
            let y = row as f32 * (cell + gap);
            let blur = 4.0 + (col % 5) as f32;
            let effects = LayerEffects::new().backdrop_blur(blur);
            pairs.push((
                id,
                rect_with_effects(
                    x,
                    y,
                    cell,
                    cell,
                    solid(255, 255, 255, 72),
                    effects,
                ),
            ));
            roots.push(id);
            id += 1;
        }
    }

    build_scene(
        "bench-backdrop-blur-grid",
        None,
        pairs,
        HashMap::new(),
        roots,
    )
}

/// Rectangles with procedural noise overlay (500 nodes).
fn scene_noise_grid() -> Scene {
    let cols = 25;
    let rows = 20;
    let cell = 44.0_f32;
    let gap = 8.0_f32;

    let mut nodes = Vec::with_capacity(cols * rows);
    for row in 0..rows {
        for col in 0..cols {
            let x = col as f32 * (cell + gap);
            let y = row as f32 * (cell + gap);
            let r = ((col * 9) % 256) as u8;
            let g = ((row * 13) % 256) as u8;
            let b = 140;
            let effects = LayerEffects {
                noises: vec![FeNoiseEffect {
                    active: true,
                    noise_size: 1.2 + (row % 3) as f32 * 0.4,
                    density: 0.25 + (col % 5) as f32 * 0.08,
                    num_octaves: 3,
                    seed: (col * 31 + row * 17) as f32,
                    coloring: NoiseEffectColors::Mono {
                        color: CGColor::from_rgba(255, 255, 255, 40),
                    },
                    blend_mode: BlendMode::Normal,
                }],
                ..LayerEffects::default()
            };
            nodes.push(rect_with_effects(x, y, cell, cell, solid(r, g, b, 255), effects));
        }
    }
    flat_scene("bench-noise-grid", nodes)
}

/// Liquid glass on a zebra stripe field, composed like `fixtures/l0_effects_glass.rs` / L0 scene
/// "L0 Effects Glass": white base, black vertical stripes (even indices), then inset rounded glass
/// with empty fills and `FeLiquidGlass` matching the golden reference.
fn scene_glass_grid() -> Scene {
    let cols = 15;
    let rows = 10;
    let cell = 64.0_f32;
    let gap = 12.0_f32;
    // Same stripe pitch as L0 (`l0_effects_glass.rs`).
    let stripe_w = 10.0_f32;
    // Inset glass like L0's padding around the 300px panel (40 / 300 ≈ 13%).
    let inset = (cell * (40.0 / 300.0)).clamp(6.0, 14.0);

    let n_stripes_per_cell = (cell / stripe_w).ceil() as i32;
    let nodes_per_cell = 1 + (n_stripes_per_cell as usize + 1) / 2 + 1;
    let mut pairs: Vec<(u64, Node)> = Vec::with_capacity(cols * rows * nodes_per_cell);
    let mut roots: Vec<u64> = Vec::with_capacity(cols * rows * nodes_per_cell);
    let mut id: u64 = 1;

    for row in 0..rows {
        for col in 0..cols {
            let x = col as f32 * (cell + gap);
            let y = row as f32 * (cell + gap);

            // 1) White tile (shows through stripe gaps).
            pairs.push((id, rect(x, y, cell, cell, solid(255, 255, 255, 255))));
            roots.push(id);
            id += 1;

            // 2) Black vertical stripes on even indices only (odd columns stay white).
            for i in 0..n_stripes_per_cell {
                if i % 2 != 0 {
                    continue;
                }
                let left = i as f32 * stripe_w;
                if left >= cell {
                    break;
                }
                let w = stripe_w.min(cell - left);
                pairs.push((
                    id,
                    rect(x + left, y, w, cell, solid(0, 0, 0, 255)),
                ));
                roots.push(id);
                id += 1;
            }

            // 3) Glass: no fill/stroke, rounded rect, L0-style liquid glass (scaled depth for tile).
            let gw = cell - 2.0 * inset;
            let gh = cell - 2.0 * inset;
            let gx = x + inset;
            let gy = y + inset;
            let corner = (gw * (60.0 / 300.0)).clamp(6.0, 18.0);
            let depth = (100.0 * (gw / 300.0)).clamp(24.0, 100.0);

            pairs.push((
                id,
                Node::Rectangle(RectangleNodeRec {
                    active: true,
                    opacity: 1.0,
                    blend_mode: LayerBlendMode::PassThrough,
                    mask: None,
                    transform: AffineTransform::from_box_center(gx, gy, gw, gh, 0.0),
                    size: Size {
                        width: gw,
                        height: gh,
                    },
                    corner_radius: RectangularCornerRadius::circular(corner),
                    corner_smoothing: CornerSmoothing(0.0),
                    fills: Paints::new(vec![]),
                    strokes: Paints::new(vec![]),
                    stroke_style: StrokeStyle::default(),
                    stroke_width: StrokeWidth::None,
                    effects: LayerEffects {
                        glass: Some(FeLiquidGlass {
                            active: true,
                            light_intensity: 0.7,
                            light_angle: 45.0,
                            refraction: 1.0,
                            depth,
                            blur_radius: 0.0,
                            dispersion: 1.0,
                        }),
                        ..LayerEffects::default()
                    },
                    layout_child: None,
                }),
            ));
            roots.push(id);
            id += 1;
        }
    }

    build_scene("bench-glass-grid", None, pairs, HashMap::new(), roots)
}

/// Opacity grid: 5 000 rects with fill only, varying opacity (0.1–0.9).
/// Exercises the save_layer path for per-node opacity.
fn scene_opacity_fill_only() -> Scene {
    let cols = 100;
    let rows = 50;
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
            let opacity = 0.1 + ((col + row) % 9) as f32 * 0.1; // 0.1 to 0.9
            nodes.push(rect_opacity(x, y, cell, cell, solid(r, g, b, 255), opacity));
        }
    }
    flat_scene("bench-opacity-fill-only", nodes)
}

/// Opacity grid: 5 000 rects with fill + stroke, varying opacity (0.1–0.9).
/// This is the critical case: fill+stroke overlap makes per-paint alpha
/// technically incorrect, but the save_layer cost is 39-60x higher.
fn scene_opacity_fill_stroke() -> Scene {
    let cols = 100;
    let rows = 50;
    let cell = 24.0_f32;
    let gap = 2.0_f32;

    let mut nodes = Vec::with_capacity(cols * rows);
    for row in 0..rows {
        for col in 0..cols {
            let x = col as f32 * (cell + gap);
            let y = row as f32 * (cell + gap);
            let r = ((col * 7) % 256) as u8;
            let g = ((row * 7) % 256) as u8;
            let b = (((col + row) * 5) % 256) as u8;
            let opacity = 0.1 + ((col + row) % 9) as f32 * 0.1;
            nodes.push(rect_opacity_fill_stroke(
                x, y, cell, cell,
                solid(r, g, b, 255),
                solid(0, 0, 0, 255),
                2.0,
                opacity,
            ));
        }
    }
    flat_scene("bench-opacity-fill-stroke", nodes)
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
        ("bench-text-stroke-heavy", scene_text_stroke_heavy()),
        ("bench-stroke-rect-grid", scene_stroke_rect_grid()),
        ("bench-shadow-grid", scene_shadow_grid()),
        ("bench-blur-grid", scene_blur_grid()),
        ("bench-mixed-effects", scene_mixed_effects()),
        ("bench-blur-container", scene_blur_container()),
        ("bench-blur-children-in-container", scene_blur_children_in_container()),
        ("bench-progressive-blur-grid", scene_progressive_blur_grid()),
        ("bench-backdrop-blur-grid", scene_backdrop_blur_grid()),
        ("bench-noise-grid", scene_noise_grid()),
        ("bench-glass-grid", scene_glass_grid()),
        ("bench-opacity-fill-only", scene_opacity_fill_only()),
        ("bench-opacity-fill-stroke", scene_opacity_fill_stroke()),
    ];

    let total_nodes: usize = scenes
        .iter()
        .map(|(_, s)| s.graph.node_count())
        .sum();
    eprintln!("Generating bench.grida with {} scenes, ~{} total nodes", scenes.len(), total_nodes);

    write_multi_fixture_zip(&scenes, "bench");
}
