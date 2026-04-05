//! Criterion benchmarks for the static image export pipeline.
//!
//! Measures the full `export_node_as` path including scene clone, layout,
//! geometry, effect tree, layer flattening, rendering, and encoding.
//!
//! Scenes are synthetic (no fixture files required). The benchmark matrix
//! covers different scene sizes and export targets (whole scene vs single
//! leaf node) to quantify the O(N_total) overhead of exporting a subset.
//!
//! ```sh
//! # Run all export benchmarks
//! cargo bench -p cg --bench bench_export
//!
//! # Filter to a specific scene/target
//! cargo bench -p cg --bench bench_export -- grid_1k/leaf
//! cargo bench -p cg --bench bench_export -- grid_10k/root
//! ```

use cg::cache::geometry::GeometryCache;
use cg::cg::prelude::*;
use cg::export::{export_node_as, ExportAs};
use cg::node::factory::NodeFactory;
use cg::node::scene_graph::{Parent, SceneGraph};
use cg::node::schema::*;
use cg::resources::ByteStore;
use cg::runtime::font_repository::FontRepository;
use cg::runtime::image_repository::ImageRepository;
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use math2::transform::AffineTransform;
use std::sync::{Arc, Mutex};

// ── Scene constructors ──────────────────────────────────────────────────

struct GridScene {
    scene: Scene,
    /// The root group node.
    root_id: NodeId,
    /// A single leaf rectangle (the last one added).
    leaf_id: NodeId,
    /// Total node count (including root group).
    node_count: usize,
}

/// Create a grid of colored rectangles under a single root group.
fn create_grid_scene(cols: u32, rows: u32) -> GridScene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let root_group = GroupNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::default(),
        mask: None,
        transform: None,
    };
    let root_id = graph.append_child(Node::Group(root_group), Parent::Root);

    let size = 50.0_f32;
    let stride = 60.0_f32;
    let mut last_id = root_id;

    for y in 0..rows {
        for x in 0..cols {
            let mut rect = nf.create_rectangle_node();
            rect.transform = AffineTransform::new(x as f32 * stride, y as f32 * stride, 0.0);
            rect.size = Size {
                width: size,
                height: size,
            };
            rect.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
                ((x * 37) % 256) as u8,
                ((y * 73) % 256) as u8,
                150,
                255,
            )))]);
            last_id = graph.append_child(Node::Rectangle(rect), Parent::NodeId(root_id));
        }
    }

    let node_count = graph.node_count();
    GridScene {
        scene: Scene {
            name: format!("Grid {}x{}", cols, rows),
            background_color: Some(CGColor::WHITE),
            graph,
        },
        root_id,
        leaf_id: last_id,
        node_count,
    }
}

/// Create a scene with nested groups (depth levels).
/// Each level has a group containing `children_per_level` rectangles
/// plus a child group that continues the nesting.
fn create_nested_scene(depth: u32, children_per_level: u32) -> GridScene {
    let nf = NodeFactory::new();
    let mut graph = SceneGraph::new();

    let root_group = GroupNodeRec {
        active: true,
        opacity: 1.0,
        blend_mode: LayerBlendMode::default(),
        mask: None,
        transform: None,
    };
    let root_id = graph.append_child(Node::Group(root_group), Parent::Root);

    let mut current_parent = root_id;
    let mut last_leaf = root_id;

    for d in 0..depth {
        // Add leaf rectangles at this level
        for i in 0..children_per_level {
            let mut rect = nf.create_rectangle_node();
            rect.transform =
                AffineTransform::new(d as f32 * 20.0 + i as f32 * 60.0, d as f32 * 60.0, 0.0);
            rect.size = Size {
                width: 50.0,
                height: 50.0,
            };
            rect.fills = Paints::new([Paint::Solid(SolidPaint::new_color(CGColor::from_rgba(
                100, 150, 200, 255,
            )))]);
            last_leaf = graph.append_child(Node::Rectangle(rect), Parent::NodeId(current_parent));
        }

        // Add a child group for the next level (except at max depth)
        if d < depth - 1 {
            let child_group = GroupNodeRec {
                active: true,
                opacity: 0.95, // slight opacity to trigger isolation
                blend_mode: LayerBlendMode::default(),
                mask: None,
                transform: None,
            };
            current_parent =
                graph.append_child(Node::Group(child_group), Parent::NodeId(current_parent));
        }
    }

    let node_count = graph.node_count();
    GridScene {
        scene: Scene {
            name: format!("Nested d={} c={}", depth, children_per_level),
            background_color: None,
            graph,
        },
        root_id,
        leaf_id: last_leaf,
        node_count,
    }
}

// ── Shared export setup ─────────────────────────────────────────────────

struct ExportSetup {
    fonts: FontRepository,
    images: ImageRepository,
    geometry: GeometryCache,
}

fn setup_export(scene: &Scene) -> ExportSetup {
    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store.clone());
    let images = ImageRepository::new(store);
    let geometry = GeometryCache::from_scene(scene, &fonts);
    ExportSetup {
        fonts,
        images,
        geometry,
    }
}

// ── Benchmarks ──────────────────────────────────────────────────────────

fn bench_export_grid(c: &mut Criterion) {
    let sizes: &[(u32, u32, &str)] = &[
        (32, 32, "1k"),    // ~1024 nodes
        (100, 100, "10k"), // ~10000 nodes
    ];

    let format = ExportAs::png();

    for &(cols, rows, label) in sizes {
        let grid = create_grid_scene(cols, rows);
        let setup = setup_export(&grid.scene);

        let mut group = c.benchmark_group(format!("export_grid_{label}"));
        // Fewer samples for larger scenes
        if grid.node_count > 5000 {
            group.sample_size(10);
            group.measurement_time(std::time::Duration::from_secs(30));
        } else {
            group.sample_size(20);
            group.measurement_time(std::time::Duration::from_secs(15));
        }

        // Export root (the entire scene) — baseline cost
        group.bench_function("root", |b| {
            b.iter(|| {
                let result = export_node_as(
                    &grid.scene,
                    &setup.geometry,
                    &setup.fonts,
                    &setup.images,
                    &grid.root_id,
                    format.clone(),
                );
                black_box(result)
            })
        });

        // Export a single leaf rectangle — should ideally be much faster
        // but currently pays the same O(N) cost as root export
        group.bench_function("leaf", |b| {
            b.iter(|| {
                let result = export_node_as(
                    &grid.scene,
                    &setup.geometry,
                    &setup.fonts,
                    &setup.images,
                    &grid.leaf_id,
                    format.clone(),
                );
                black_box(result)
            })
        });

        group.finish();
    }
}

fn bench_export_nested(c: &mut Criterion) {
    // Nested scene: 10 levels x 100 children = ~1010 nodes
    let nested = create_nested_scene(10, 100);
    let setup = setup_export(&nested.scene);
    let format = ExportAs::png();

    let mut group = c.benchmark_group("export_nested");
    group.sample_size(20);
    group.measurement_time(std::time::Duration::from_secs(15));

    group.bench_function("root", |b| {
        b.iter(|| {
            let result = export_node_as(
                &nested.scene,
                &setup.geometry,
                &setup.fonts,
                &setup.images,
                &nested.root_id,
                format.clone(),
            );
            black_box(result)
        })
    });

    group.bench_function("leaf", |b| {
        b.iter(|| {
            let result = export_node_as(
                &nested.scene,
                &setup.geometry,
                &setup.fonts,
                &setup.images,
                &nested.leaf_id,
                format.clone(),
            );
            black_box(result)
        })
    });

    group.finish();
}

/// Benchmark just the scene clone cost (no rendering) to isolate
/// the data-copy overhead that every export currently pays.
fn bench_scene_clone(c: &mut Criterion) {
    let sizes: &[(u32, u32, &str)] = &[(32, 32, "1k"), (100, 100, "10k")];

    let mut group = c.benchmark_group("export_scene_clone");
    group.sample_size(50);

    for &(cols, rows, label) in sizes {
        let grid = create_grid_scene(cols, rows);
        group.bench_with_input(
            BenchmarkId::new("clone", format!("{label}_n{}", grid.node_count)),
            &grid.scene,
            |b, scene| b.iter(|| black_box(scene.clone())),
        );
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_export_grid,
    bench_export_nested,
    bench_scene_clone
);
criterion_main!(benches);
