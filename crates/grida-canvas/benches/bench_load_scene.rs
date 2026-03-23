//! Benchmark: `load_scene` per-stage breakdown.
//!
//! Measures the four stages of `Renderer::load_scene()` independently:
//!   1. **layout** — Taffy flexbox + Skia paragraph measurement
//!   2. **geometry** — DFS transform/bounds propagation
//!   3. **effects** — effect tree classification
//!   4. **layers** — flatten + clip path + sort + RTree
//!
//! Scenes are generated synthetically at varying sizes to expose scaling
//! behaviour. Three scene archetypes are tested:
//!
//!   - **flat_rects** — flat list of rectangles (no layout, no text)
//!   - **flex_text** — flex containers with text spans (exercises layout + text measurement)
//!   - **nested_groups** — deeply nested group hierarchy (exercises clip path computation)
//!
//! # Running
//!
//! ```sh
//! cargo bench -p cg --bench bench_load_scene
//!
//! # Only flat_rects at all sizes:
//! cargo bench -p cg --bench bench_load_scene -- flat_rects
//!
//! # Only the 10k size:
//! cargo bench -p cg --bench bench_load_scene -- 10k
//!
//! # Only full load_scene (not per-stage):
//! cargo bench -p cg --bench bench_load_scene -- /load_scene
//! ```

use cg::cache;
use cg::cg::prelude::*;
use cg::layout::engine::LayoutEngine;
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::resources::ByteStore;
use cg::runtime::camera::Camera2D;
use cg::runtime::font_repository::FontRepository;
use cg::runtime::scene::{Backend, Renderer};
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use math2::transform::AffineTransform;
use std::sync::{Arc, Mutex};
use std::time::Duration;

// ─── Scene builders ─────────────────────────────────────────────────

/// Flat list of rectangles — no containers, no text, no grouping.
/// Exercises geometry + effects + layers without layout.
fn create_flat_rects(count: usize) -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let cols = (count as f32).sqrt().ceil() as usize;

    for i in 0..count {
        let x = (i % cols) as f32 * 60.0;
        let y = (i / cols) as f32 * 60.0;
        let mut rect = nf.create_rectangle_node();
        rect.transform = AffineTransform::new(x, y, 0.0);
        rect.size = Size {
            width: 50.0,
            height: 50.0,
        };
        rect.set_fill(Paint::Solid(SolidPaint {
            color: CGColor::from_rgba(((i * 13) % 255) as u8, ((i * 7) % 255) as u8, 180, 255),
            blend_mode: BlendMode::default(),
            active: true,
        }));
        graph.append_child(Node::Rectangle(rect), Parent::Root);
    }

    Scene {
        name: format!("flat_rects_{count}"),
        graph,
        background_color: Some(CGColor::WHITE),
    }
}

/// Flex containers each holding a text span child.
/// `count` is the total number of nodes (count/2 containers + count/2 text spans).
/// Exercises layout (Taffy) + text measurement (Skia paragraph).
fn create_flex_text(count: usize) -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let pairs = count / 2;
    let cols = (pairs as f32).sqrt().ceil() as usize;

    for i in 0..pairs {
        let x = (i % cols) as f32 * 220.0;
        let y = (i / cols) as f32 * 60.0;

        let mut container = nf.create_container_node();
        container.position = LayoutPositioningBasis::Cartesian(CGPoint { x, y });
        container.layout_container.layout_mode = LayoutMode::Flex;
        container.layout_container.layout_direction = Axis::Horizontal;
        container.layout_dimensions.layout_target_width = Some(200.0);
        container.layout_dimensions.layout_target_height = Some(40.0);

        let container_id = graph.append_child(Node::Container(container), Parent::Root);

        let mut text = nf.create_text_span_node();
        text.text = format!("Item {i}");
        text.width = Some(180.0);
        graph.append_child(Node::TextSpan(text), Parent::NodeId(container_id));
    }

    Scene {
        name: format!("flex_text_{count}"),
        graph,
        background_color: Some(CGColor::WHITE),
    }
}

/// Deeply nested group hierarchy — each level has `breadth` children,
/// with leaf nodes at the bottom. Total nodes ≈ count.
/// Container nodes have `clip: true` to exercise `compute_clip_path`.
fn create_nested_groups(count: usize) -> Scene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();
    let depth = 8usize;
    let breadth = ((count as f64).powf(1.0 / depth as f64)).ceil() as usize;

    fn build_level(
        graph: &mut SceneGraph,
        nf: &NodeFactory,
        parent: Parent,
        depth_remaining: usize,
        breadth: usize,
        pos_x: f32,
        pos_y: f32,
        remaining: &mut usize,
    ) {
        if *remaining == 0 {
            return;
        }
        if depth_remaining == 0 {
            // Leaf: rectangle
            let mut rect = nf.create_rectangle_node();
            rect.transform = AffineTransform::new(pos_x, pos_y, 0.0);
            rect.size = Size {
                width: 20.0,
                height: 20.0,
            };
            rect.set_fill(Paint::Solid(SolidPaint {
                color: CGColor::RED,
                blend_mode: BlendMode::default(),
                active: true,
            }));
            graph.append_child(Node::Rectangle(rect), parent);
            *remaining -= 1;
            return;
        }

        // Interior: container with clip
        let mut container = nf.create_container_node();
        container.position = LayoutPositioningBasis::Cartesian(CGPoint { x: pos_x, y: pos_y });
        container.clip = true;
        container.layout_dimensions.layout_target_width = Some(500.0);
        container.layout_dimensions.layout_target_height = Some(500.0);
        let container_id = graph.append_child(Node::Container(container), parent);
        *remaining -= 1;

        for b in 0..breadth {
            if *remaining == 0 {
                break;
            }
            build_level(
                graph,
                nf,
                Parent::NodeId(container_id),
                depth_remaining - 1,
                breadth,
                b as f32 * 30.0,
                0.0,
                remaining,
            );
        }
    }

    let mut remaining = count;
    let top_count = breadth.min(remaining);
    for i in 0..top_count {
        if remaining == 0 {
            break;
        }
        build_level(
            &mut graph,
            &nf,
            Parent::Root,
            depth - 1,
            breadth,
            i as f32 * 600.0,
            0.0,
            &mut remaining,
        );
    }

    Scene {
        name: format!("nested_groups_{count}"),
        graph,
        background_color: Some(CGColor::WHITE),
    }
}

// ─── Helpers ────────────────────────────────────────────────────────

const VP_W: i32 = 1000;
const VP_H: i32 = 1000;

fn make_renderer() -> Renderer {
    Renderer::new(
        Backend::new_from_raster(VP_W, VP_H),
        None,
        Camera2D::new(Size {
            width: VP_W as f32,
            height: VP_H as f32,
        }),
    )
}

fn viewport_size() -> Size {
    Size {
        width: VP_W as f32,
        height: VP_H as f32,
    }
}

// ─── Benchmarks ─────────────────────────────────────────────────────

fn bench_load_scene(c: &mut Criterion) {
    let sizes: &[(usize, &str)] = &[
        (1_000, "1k"),
        (10_000, "10k"),
        (50_000, "50k"),
        (100_000, "100k"),
    ];

    // Scene generators: (name, builder_fn)
    let generators: &[(&str, fn(usize) -> Scene)] = &[
        ("flat_rects", create_flat_rects),
        ("flex_text", create_flex_text),
        ("nested_groups", create_nested_groups),
    ];

    for (gen_name, gen_fn) in generators {
        // ── Full load_scene ──
        {
            let mut group = c.benchmark_group(format!("{gen_name}/load_scene"));
            group.sample_size(10);
            group.measurement_time(Duration::from_secs(30));

            for &(count, label) in sizes {
                let scene = gen_fn(count);
                let node_count = scene.graph.node_count();

                group.bench_with_input(
                    BenchmarkId::new("total", format!("{label}_n{node_count}")),
                    &scene,
                    |b, scene| {
                        b.iter(|| {
                            let mut renderer = make_renderer();
                            renderer.load_scene(black_box(scene.clone()));
                        });
                    },
                );
            }
            group.finish();
        }

        // ── Per-stage: layout ──
        {
            let mut group = c.benchmark_group(format!("{gen_name}/stage_layout"));
            group.sample_size(10);
            group.measurement_time(Duration::from_secs(20));

            for &(count, label) in sizes {
                let scene = gen_fn(count);
                let node_count = scene.graph.node_count();

                group.bench_with_input(
                    BenchmarkId::new("layout", format!("{label}_n{node_count}")),
                    &scene,
                    |b, scene| {
                        let fonts = FontRepository::new(Arc::new(Mutex::new(ByteStore::new())));
                        b.iter(|| {
                            let mut engine = LayoutEngine::new();
                            let mut paragraph_cache = cache::paragraph::ParagraphCache::new();
                            engine.compute(
                                black_box(scene),
                                viewport_size(),
                                Some(cg::layout::tree::TextMeasureProvider {
                                    paragraph_cache: &mut paragraph_cache,
                                    fonts: &fonts,
                                }),
                            );
                        });
                    },
                );
            }
            group.finish();
        }

        // ── Per-stage: geometry ──
        {
            let mut group = c.benchmark_group(format!("{gen_name}/stage_geometry"));
            group.sample_size(10);
            group.measurement_time(Duration::from_secs(20));

            for &(count, label) in sizes {
                let scene = gen_fn(count);
                let node_count = scene.graph.node_count();

                group.bench_with_input(
                    BenchmarkId::new("geometry", format!("{label}_n{node_count}")),
                    &scene,
                    |b, scene| {
                        // Pre-compute layout so we can isolate geometry
                        let fonts = FontRepository::new(Arc::new(Mutex::new(ByteStore::new())));
                        let mut engine = LayoutEngine::new();
                        let mut paragraph_cache = cache::paragraph::ParagraphCache::new();
                        engine.compute(
                            scene,
                            viewport_size(),
                            Some(cg::layout::tree::TextMeasureProvider {
                                paragraph_cache: &mut paragraph_cache,
                                fonts: &fonts,
                            }),
                        );
                        let layout_result = engine.result();

                        b.iter(|| {
                            let mut scene_cache = cache::scene::SceneCache::new();
                            scene_cache.update_geometry_with_layout(
                                black_box(scene),
                                &fonts,
                                layout_result,
                                viewport_size(),
                            );
                        });
                    },
                );
            }
            group.finish();
        }

        // ── Per-stage: effects ──
        {
            let mut group = c.benchmark_group(format!("{gen_name}/stage_effects"));
            group.sample_size(10);
            group.measurement_time(Duration::from_secs(20));

            for &(count, label) in sizes {
                let scene = gen_fn(count);
                let node_count = scene.graph.node_count();

                group.bench_with_input(
                    BenchmarkId::new("effects", format!("{label}_n{node_count}")),
                    &scene,
                    |b, scene| {
                        b.iter(|| {
                            let mut scene_cache = cache::scene::SceneCache::new();
                            scene_cache.update_effect_tree(black_box(scene));
                        });
                    },
                );
            }
            group.finish();
        }

        // ── Per-stage: layers ──
        {
            let mut group = c.benchmark_group(format!("{gen_name}/stage_layers"));
            group.sample_size(10);
            group.measurement_time(Duration::from_secs(20));

            for &(count, label) in sizes {
                let scene = gen_fn(count);
                let node_count = scene.graph.node_count();

                group.bench_with_input(
                    BenchmarkId::new("layers", format!("{label}_n{node_count}")),
                    &scene,
                    |b, scene| {
                        // Pre-build geometry so we can isolate layers
                        let fonts = FontRepository::new(Arc::new(Mutex::new(ByteStore::new())));
                        let mut engine = LayoutEngine::new();
                        let mut paragraph_cache = cache::paragraph::ParagraphCache::new();
                        engine.compute(
                            scene,
                            viewport_size(),
                            Some(cg::layout::tree::TextMeasureProvider {
                                paragraph_cache: &mut paragraph_cache,
                                fonts: &fonts,
                            }),
                        );
                        let layout_result = engine.result();
                        let mut scene_cache = cache::scene::SceneCache::new();
                        scene_cache.update_geometry_with_layout(
                            scene,
                            &fonts,
                            layout_result,
                            viewport_size(),
                        );
                        scene_cache.update_effect_tree(scene);

                        b.iter(|| {
                            // Clone so each iteration rebuilds layers
                            let mut sc = scene_cache.clone();
                            sc.update_layers(black_box(scene));
                        });
                    },
                );
            }
            group.finish();
        }
    }
}

criterion_group!(benches, bench_load_scene);
criterion_main!(benches);
