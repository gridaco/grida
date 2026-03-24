//! `load-bench` — measures `load_scene()` per-stage timings.
//!
//! This subcommand loads one or more `.grida` files and reports the time
//! spent in each stage of `Renderer::load_scene()`:
//!   - fonts: collecting font families
//!   - layout: Taffy flexbox + Skia paragraph measurement
//!   - geometry: DFS transform/bounds propagation
//!   - effects: effect tree classification
//!   - layers: flatten + clip path + sort + RTree
//!
//! The breakdown helps identify which stage dominates cold-start cost.
//!
//! # Usage
//!
//! ```sh
//! cargo run -p grida-dev --release -- load-bench path/to/file.grida
//! cargo run -p grida-dev --release -- load-bench path/to/file.grida --scene 0
//! cargo run -p grida-dev --release -- load-bench path/to/file.grida --list-scenes
//! cargo run -p grida-dev --release -- load-bench path/to/file.grida --iterations 5
//! ```

use super::runner::AsyncSceneLoader;
use anyhow::{anyhow, Result};
use cg::cache;
use cg::layout::engine::LayoutEngine;
use cg::node::schema::{Scene, Size};
use cg::resources::ByteStore;
use cg::runtime::camera::Camera2D;
use cg::runtime::font_repository::FontRepository;
use cg::runtime::scene::{Backend, Renderer};
use clap::Args;
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Args, Debug)]
pub struct LoadBenchArgs {
    /// Path to a `.grida` file.
    pub path: String,
    /// Scene index to benchmark (0-based). Use --list-scenes to see available.
    #[arg(long = "scene")]
    pub scene_index: Option<usize>,
    /// List available scene names and exit.
    #[arg(long = "list-scenes", default_value_t = false)]
    pub list_scenes: bool,
    /// Number of iterations for averaging.
    #[arg(long = "iterations", default_value_t = 3)]
    pub iterations: usize,
    /// Viewport width.
    #[arg(long = "width", default_value_t = 1000)]
    pub width: i32,
    /// Viewport height.
    #[arg(long = "height", default_value_t = 1000)]
    pub height: i32,
    /// Skip Skia text measurement (returns zero-size stubs). For A/B comparison.
    #[arg(long = "skip-text", default_value_t = false)]
    pub skip_text: bool,
    /// Skip Taffy layout entirely — derive layout from schema positions/sizes.
    /// Simulates `RuntimeRendererConfig::skip_layout = true`.
    #[arg(long = "skip-layout", default_value_t = false)]
    pub skip_layout: bool,
    /// Compare layout results between full Taffy and schema-only paths.
    /// Reports all nodes where the computed layout differs.
    #[arg(long = "layout-diff", default_value_t = false)]
    pub layout_diff: bool,
    /// Threshold for layout-diff: ignore differences smaller than this (in px).
    /// Default 0.01. Use e.g. `--layout-diff-threshold 1.0` to ignore sub-pixel diffs.
    #[arg(long = "layout-diff-threshold", default_value_t = 0.01)]
    pub layout_diff_threshold: f32,
}

struct StageTimings {
    fonts_us: u64,
    layout_us: u64,
    geometry_us: u64,
    effects_us: u64,
    layers_us: u64,
    total_us: u64,
    /// Paragraph measurement stats from the layout phase.
    para_stats: cg::cache::paragraph::ParagraphMeasureStats,
}

/// Measure load_scene by running each stage independently with timing.
fn measure_load_scene(
    scene: &Scene,
    width: i32,
    height: i32,
    skip_text: bool,
    skip_layout: bool,
) -> StageTimings {
    let viewport_size = Size {
        width: width as f32,
        height: height as f32,
    };
    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store);

    let t_total = Instant::now();

    // Stage 0: Collect font families
    let t0 = Instant::now();
    {
        let requested = cg::runtime::scene::collect_scene_font_families(scene);
        // Simulate set_requested_families cost (just drop the result)
        std::hint::black_box(requested);
    }
    let fonts_us = t0.elapsed().as_micros() as u64;

    // Stage 1: Layout
    let t1 = Instant::now();
    let mut engine = LayoutEngine::new();
    let mut paragraph_cache = cache::paragraph::ParagraphCache::new();
    paragraph_cache.skip_text_measure = skip_text;
    if skip_layout {
        engine.compute_schema_only(scene);
    } else {
        engine.compute(
            scene,
            viewport_size,
            Some(cg::layout::tree::TextMeasureProvider {
                paragraph_cache: &mut paragraph_cache,
                fonts: &fonts,
            }),
        );
    }
    let layout_us = t1.elapsed().as_micros() as u64;
    let para_stats = paragraph_cache.stats.clone();

    // Stage 2: Geometry
    let t2 = Instant::now();
    let layout_result = engine.result();
    let mut scene_cache = cache::scene::SceneCache::new();
    scene_cache.update_geometry_with_layout(scene, &fonts, layout_result, viewport_size);
    let geometry_us = t2.elapsed().as_micros() as u64;

    // Stage 3: Effect tree
    let t3 = Instant::now();
    scene_cache.update_effect_tree(scene);
    let effects_us = t3.elapsed().as_micros() as u64;

    // Stage 4: Layers
    let t4 = Instant::now();
    scene_cache.update_layers(scene);
    let layers_us = t4.elapsed().as_micros() as u64;

    let total_us = t_total.elapsed().as_micros() as u64;

    StageTimings {
        fonts_us,
        layout_us,
        geometry_us,
        effects_us,
        layers_us,
        total_us,
        para_stats,
    }
}

/// Compare layout results between full Taffy path and schema-only path.
/// Reports every node where the computed layout differs beyond `threshold` px.
fn layout_diff(scene: &Scene, width: i32, height: i32, threshold: f32) {
    let viewport_size = Size {
        width: width as f32,
        height: height as f32,
    };
    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store);

    // Full Taffy path
    let mut engine_full = LayoutEngine::new();
    let mut paragraph_cache = cache::paragraph::ParagraphCache::new();
    engine_full.compute(
        scene,
        viewport_size,
        Some(cg::layout::tree::TextMeasureProvider {
            paragraph_cache: &mut paragraph_cache,
            fonts: &fonts,
        }),
    );
    let result_full = engine_full.result().clone();

    // Schema-only path
    let mut engine_schema = LayoutEngine::new();
    engine_schema.compute_schema_only(scene);
    let result_schema = engine_schema.result();

    // Compare
    let mut diffs = Vec::new();
    let eps = threshold;
    for (id, full) in result_full.iter() {
        if let Some(schema) = result_schema.get(&id) {
            let dx = (full.x - schema.x).abs();
            let dy = (full.y - schema.y).abs();
            let dw = (full.width - schema.width).abs();
            let dh = (full.height - schema.height).abs();
            if dx > eps || dy > eps || dw > eps || dh > eps {
                let node_type = scene
                    .graph
                    .get_node(&id)
                    .map(|n| format!("{:?}", std::mem::discriminant(n)))
                    .unwrap_or_else(|_| "?".to_string());

                // Get node type name cleanly
                let type_name = scene
                    .graph
                    .get_node(&id)
                    .map(|n| match n {
                        cg::node::schema::Node::Container(_) => "Container",
                        cg::node::schema::Node::Rectangle(_) => "Rectangle",
                        cg::node::schema::Node::Ellipse(_) => "Ellipse",
                        cg::node::schema::Node::Image(_) => "Image",
                        cg::node::schema::Node::Line(_) => "Line",
                        cg::node::schema::Node::Polygon(_) => "Polygon",
                        cg::node::schema::Node::RegularPolygon(_) => "RegularPolygon",
                        cg::node::schema::Node::RegularStarPolygon(_) => "RegularStarPolygon",
                        cg::node::schema::Node::TextSpan(_) => "TextSpan",
                        cg::node::schema::Node::Vector(_) => "Vector",
                        cg::node::schema::Node::Path(_) => "Path",
                        cg::node::schema::Node::Group(_) => "Group",
                        cg::node::schema::Node::BooleanOperation(_) => "BoolOp",
                        cg::node::schema::Node::InitialContainer(_) => "ICB",
                        cg::node::schema::Node::Error(_) => "Error",
                    })
                    .unwrap_or("?");
                let _ = node_type; // suppress unused

                // Check if parent is a container (to understand context)
                let parent_info = scene
                    .graph
                    .get_parent(&id)
                    .and_then(|pid| {
                        scene.graph.get_node(&pid).ok().map(|p| match p {
                            cg::node::schema::Node::Container(_) => "Container",
                            cg::node::schema::Node::Group(_) => "Group",
                            cg::node::schema::Node::BooleanOperation(_) => "BoolOp",
                            cg::node::schema::Node::InitialContainer(_) => "ICB",
                            _ => "Leaf",
                        })
                    })
                    .unwrap_or("root");

                diffs.push((
                    id,
                    type_name,
                    parent_info,
                    *full,
                    *schema,
                    (dx, dy, dw, dh),
                ));
            }
        } else {
            // Node in full but not in schema — should not happen
            eprintln!(
                "  WARN: node {:?} in full result but missing from schema result",
                id
            );
        }
    }

    // Also check for nodes in schema but not in full
    for (id, _) in result_schema.iter() {
        if result_full.get(&id).is_none() {
            eprintln!(
                "  WARN: node {:?} in schema result but missing from full result",
                id
            );
        }
    }

    if diffs.is_empty() {
        println!(
            "  layout-diff: IDENTICAL ({} nodes compared, threshold={:.2}px)",
            result_full.len(),
            threshold
        );
    } else {
        // Sort by largest delta for readability
        diffs.sort_by(|a, b| {
            let max_a = a.5 .0.max(a.5 .1).max(a.5 .2).max(a.5 .3);
            let max_b = b.5 .0.max(b.5 .1).max(b.5 .2).max(b.5 .3);
            max_b.partial_cmp(&max_a).unwrap()
        });

        println!(
            "  layout-diff: {} DIFFERENCES out of {} nodes (threshold={:.2}px):\n",
            diffs.len(),
            result_full.len(),
            threshold
        );
        println!(
            "    {:>8} {:>12} {:>8}  {:>36}  {:>36}  {:>24}",
            "NodeId",
            "Type",
            "Parent",
            "Full (x, y, w, h)",
            "Schema (x, y, w, h)",
            "Delta (dx, dy, dw, dh)"
        );
        println!("    {}", "-".repeat(130));

        let show_limit = 50;
        for (i, (id, type_name, parent_info, full, schema, delta)) in diffs.iter().enumerate() {
            if i >= show_limit {
                println!("    ... and {} more", diffs.len() - show_limit);
                break;
            }
            println!(
                "    {:>8} {:>12} {:>8}  ({:>8.1}, {:>8.1}, {:>8.1}, {:>8.1})  ({:>8.1}, {:>8.1}, {:>8.1}, {:>8.1})  ({:>+7.1}, {:>+7.1}, {:>+7.1}, {:>+7.1})",
                id, type_name, parent_info,
                full.x, full.y, full.width, full.height,
                schema.x, schema.y, schema.width, schema.height,
                delta.0, delta.1, delta.2, delta.3,
            );
        }

        // Summary by node type
        let mut type_counts: std::collections::HashMap<&str, usize> =
            std::collections::HashMap::new();
        for (_, type_name, _, _, _, _) in &diffs {
            *type_counts.entry(type_name).or_default() += 1;
        }
        println!("\n  By node type:");
        let mut type_vec: Vec<_> = type_counts.into_iter().collect();
        type_vec.sort_by(|a, b| b.1.cmp(&a.1));
        for (t, count) in &type_vec {
            println!("    {}: {}", t, count);
        }

        // Examples per type (3 each)
        println!("\n  Examples per type:");
        for (t, _) in &type_vec {
            let examples: Vec<_> = diffs
                .iter()
                .filter(|(_, tn, _, _, _, _)| tn == t)
                .take(3)
                .collect();
            for (id, type_name, parent_info, full, schema, delta) in examples {
                println!(
                    "    {:>8} {:>12} {:>8}  ({:>8.1}, {:>8.1}, {:>8.1}, {:>8.1})  ({:>8.1}, {:>8.1}, {:>8.1}, {:>8.1})  ({:>+7.1}, {:>+7.1}, {:>+7.1}, {:>+7.1})",
                    id, type_name, parent_info,
                    full.x, full.y, full.width, full.height,
                    schema.x, schema.y, schema.width, schema.height,
                    delta.0, delta.1, delta.2, delta.3,
                );
            }
        }

        // Summary by parent type
        let mut parent_counts: std::collections::HashMap<&str, usize> =
            std::collections::HashMap::new();
        for (_, _, parent_info, _, _, _) in &diffs {
            *parent_counts.entry(parent_info).or_default() += 1;
        }
        println!("  By parent type:");
        let mut parent_vec: Vec<_> = parent_counts.into_iter().collect();
        parent_vec.sort_by(|a, b| b.1.cmp(&a.1));
        for (p, count) in &parent_vec {
            println!("    {}: {}", p, count);
        }
    }
}

/// Also measure via Renderer::load_scene for an end-to-end comparison.
fn measure_load_scene_via_renderer(scene: Scene, width: i32, height: i32) -> u64 {
    let mut renderer = Renderer::new(
        Backend::new_from_raster(width, height),
        None,
        Camera2D::new(Size {
            width: width as f32,
            height: height as f32,
        }),
    );
    let t = Instant::now();
    renderer.load_scene(scene);
    let elapsed = t.elapsed().as_micros() as u64;
    renderer.free();
    elapsed
}

fn print_timings(label: &str, timings: &StageTimings) {
    let total_ms = timings.total_us as f64 / 1000.0;
    let fonts_ms = timings.fonts_us as f64 / 1000.0;
    let layout_ms = timings.layout_us as f64 / 1000.0;
    let geometry_ms = timings.geometry_us as f64 / 1000.0;
    let effects_ms = timings.effects_us as f64 / 1000.0;
    let layers_ms = timings.layers_us as f64 / 1000.0;

    let pct = |v: f64| -> f64 { v / total_ms * 100.0 };

    println!("  {label}:");
    println!("    total:    {total_ms:>10.1} ms");
    println!(
        "    fonts:    {:>10.1} ms  ({:>5.1}%)",
        fonts_ms,
        pct(fonts_ms)
    );
    println!(
        "    layout:   {:>10.1} ms  ({:>5.1}%)",
        layout_ms,
        pct(layout_ms)
    );
    println!(
        "    geometry: {:>10.1} ms  ({:>5.1}%)",
        geometry_ms,
        pct(geometry_ms)
    );
    println!(
        "    effects:  {:>10.1} ms  ({:>5.1}%)",
        effects_ms,
        pct(effects_ms)
    );
    println!(
        "    layers:   {:>10.1} ms  ({:>5.1}%)",
        layers_ms,
        pct(layers_ms)
    );

    // Paragraph measurement sub-stats (within layout phase)
    let ps = &timings.para_stats;
    if ps.calls > 0 {
        println!("    --- paragraph stats (within layout) ---");
        println!(
            "    calls: {} (hits: {}, misses: {})",
            ps.calls, ps.cache_hits, ps.cache_misses
        );
    }
}

pub async fn run_load_bench(args: LoadBenchArgs, loader: impl AsyncSceneLoader) -> Result<()> {
    let scenes = loader.load(&args.path).await?;

    if args.list_scenes {
        println!("Available scenes ({}):", scenes.len());
        for (i, s) in scenes.iter().enumerate() {
            println!("  [{}] {} ({} nodes)", i, s.name, s.graph.node_count());
        }
        return Ok(());
    }

    // Determine which scenes to bench
    let scene_indices: Vec<usize> = if let Some(idx) = args.scene_index {
        if idx >= scenes.len() {
            return Err(anyhow!(
                "scene index {} out of range (0..{}). Use --list-scenes.",
                idx,
                scenes.len()
            ));
        }
        vec![idx]
    } else {
        (0..scenes.len()).collect()
    };

    println!(
        "load-bench: {} scene(s), {} iteration(s), viewport {}x{}{}\n",
        scene_indices.len(),
        args.iterations,
        args.width,
        args.height,
        match (args.skip_text, args.skip_layout) {
            (true, true) => ", skip_text=ON, skip_layout=ON",
            (true, false) => ", skip_text=ON",
            (false, true) => ", skip_layout=ON",
            (false, false) => "",
        }
    );

    for &idx in &scene_indices {
        let scene = &scenes[idx];
        let node_count = scene.graph.node_count();

        // Count text nodes
        let text_count = scene
            .graph
            .nodes_iter()
            .filter(|(_, n)| matches!(n, cg::node::schema::Node::TextSpan(_)))
            .count();
        let container_count = scene
            .graph
            .nodes_iter()
            .filter(|(_, n)| matches!(n, cg::node::schema::Node::Container(_)))
            .count();

        println!(
            "Scene [{}] \"{}\" — {} nodes ({} containers, {} text spans)",
            idx, scene.name, node_count, container_count, text_count
        );

        // Per-stage breakdown (multiple iterations)
        let mut all_timings: Vec<StageTimings> = Vec::new();
        for i in 0..args.iterations {
            let timings = measure_load_scene(
                scene,
                args.width,
                args.height,
                args.skip_text,
                args.skip_layout,
            );
            print_timings(&format!("iter {}", i + 1), &timings);
            all_timings.push(timings);
        }

        // Averages
        if args.iterations > 1 {
            let n = all_timings.len() as u64;
            let avg = StageTimings {
                fonts_us: all_timings.iter().map(|t| t.fonts_us).sum::<u64>() / n,
                layout_us: all_timings.iter().map(|t| t.layout_us).sum::<u64>() / n,
                geometry_us: all_timings.iter().map(|t| t.geometry_us).sum::<u64>() / n,
                effects_us: all_timings.iter().map(|t| t.effects_us).sum::<u64>() / n,
                layers_us: all_timings.iter().map(|t| t.layers_us).sum::<u64>() / n,
                total_us: all_timings.iter().map(|t| t.total_us).sum::<u64>() / n,
                para_stats: cg::cache::paragraph::ParagraphMeasureStats {
                    calls: all_timings.iter().map(|t| t.para_stats.calls).sum::<u64>() / n,
                    cache_hits: all_timings
                        .iter()
                        .map(|t| t.para_stats.cache_hits)
                        .sum::<u64>()
                        / n,
                    cache_misses: all_timings
                        .iter()
                        .map(|t| t.para_stats.cache_misses)
                        .sum::<u64>()
                        / n,
                },
            };
            print_timings("average", &avg);
        }

        // Layout diff A/B comparison
        if args.layout_diff {
            layout_diff(scene, args.width, args.height, args.layout_diff_threshold);
        }

        // End-to-end via Renderer::load_scene
        let e2e_us = measure_load_scene_via_renderer(scene.clone(), args.width, args.height);
        println!(
            "  renderer load_scene (e2e): {:.1} ms\n",
            e2e_us as f64 / 1000.0
        );
    }

    Ok(())
}
