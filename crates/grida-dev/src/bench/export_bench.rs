//! `export-bench` subcommand — measures static export (PNG/JPEG) performance
//! and optionally verifies pixel-exact correctness between export strategies.
//!
//! # Usage
//!
//! ```sh
//! # List nodes in a scene to pick a target
//! cargo run -p grida-dev --release -- export-bench file.grida --list-nodes
//!
//! # Benchmark exporting node 42 as PNG (default: 5 iterations)
//! cargo run -p grida-dev --release -- export-bench file.grida --node 42
//!
//! # Export with scale constraint, JPEG format
//! cargo run -p grida-dev --release -- export-bench file.grida --node 42 --format jpeg --scale 2.0
//!
//! # Export all root nodes
//! cargo run -p grida-dev --release -- export-bench file.grida --all-roots
//!
//! # Save the exported image to inspect visually
//! cargo run -p grida-dev --release -- export-bench file.grida --node 42 --save
//!
//! # Compare two strategies pixel-for-pixel (future: baseline vs optimized)
//! cargo run -p grida-dev --release -- export-bench file.grida --node 42 --compare
//! ```

use anyhow::{anyhow, bail, Context, Result};
use clap::Args;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use cg::cache::geometry::GeometryCache;
use cg::export::{ExportAs, ExportConstraints, ExportSize};
use cg::node::schema::{Node, NodeId, Scene, Size};
use cg::resources::ByteStore;
use cg::runtime::camera::Camera2D;
use cg::runtime::font_repository::FontRepository;
use cg::runtime::image_repository::ImageRepository;
use cg::runtime::scene::{Backend, Renderer, RendererOptions};

use super::runner::AsyncSceneLoader;

// ── CLI args ────────────────────────────────────────────────────────────

#[derive(Args, Debug)]
pub struct ExportBenchArgs {
    /// Path to a `.grida` file.
    pub path: String,

    /// Scene index (0-based). Use --list-nodes to see available.
    #[arg(long = "scene", default_value_t = 0)]
    pub scene_index: usize,

    /// List scenes and their nodes, then exit.
    #[arg(long = "list-nodes", default_value_t = false)]
    pub list_nodes: bool,

    /// Internal NodeId to export. Use --list-nodes to find IDs.
    #[arg(long = "node")]
    pub node_id: Option<u64>,

    /// Export all root nodes (one benchmark per root).
    #[arg(long = "all-roots", default_value_t = false)]
    pub all_roots: bool,

    /// Export format: png (default) or jpeg.
    #[arg(long = "format", default_value = "png")]
    pub format: String,

    /// Scale constraint for export (e.g. 2.0 for @2x).
    #[arg(long = "scale", default_value_t = 1.0)]
    pub scale: f32,

    /// JPEG quality (0-100). Only used when --format=jpeg.
    #[arg(long = "quality")]
    pub quality: Option<u32>,

    /// Number of iterations for timing.
    #[arg(long = "iterations", default_value_t = 5)]
    pub iterations: usize,

    /// Save the exported image to /tmp/grida-export-bench/.
    #[arg(long = "save", default_value_t = false)]
    pub save: bool,

    /// Compare baseline vs baseline (self-consistency check).
    /// When optimized export paths are added, this will compare
    /// baseline (current) vs optimized and assert pixel equality.
    #[arg(long = "compare", default_value_t = false)]
    pub compare: bool,
}

// ── Per-stage timing ────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct ExportTimings {
    /// Total wall time for the entire export call.
    total_us: u64,
    // Per-stage breakdown (within load_scene + snapshot):
    scene_clone_us: u64,
    load_scene_us: u64,
    snapshot_us: u64,
    encode_us: u64,
}

impl ExportTimings {
    fn header() {
        eprintln!(
            "{:<12} {:>10} {:>12} {:>12} {:>10} {:>10}",
            "node", "total_ms", "clone_ms", "load_ms", "snap_ms", "enc_ms"
        );
        eprintln!("{}", "-".repeat(70));
    }

    fn print(&self, label: &str) {
        eprintln!(
            "{:<12} {:>10.2} {:>12.2} {:>12.2} {:>10.2} {:>10.2}",
            label,
            self.total_us as f64 / 1000.0,
            self.scene_clone_us as f64 / 1000.0,
            self.load_scene_us as f64 / 1000.0,
            self.snapshot_us as f64 / 1000.0,
            self.encode_us as f64 / 1000.0,
        );
    }
}

#[derive(Debug, Clone)]
struct AggregatedTimings {
    min: ExportTimings,
    max: ExportTimings,
    avg: ExportTimings,
    p50: ExportTimings,
    iterations: usize,
}

impl AggregatedTimings {
    fn from_samples(samples: &[ExportTimings]) -> Self {
        let n = samples.len();
        assert!(n > 0);

        let mut totals: Vec<u64> = samples.iter().map(|s| s.total_us).collect();
        let mut clones: Vec<u64> = samples.iter().map(|s| s.scene_clone_us).collect();
        let mut loads: Vec<u64> = samples.iter().map(|s| s.load_scene_us).collect();
        let mut snaps: Vec<u64> = samples.iter().map(|s| s.snapshot_us).collect();
        let mut encs: Vec<u64> = samples.iter().map(|s| s.encode_us).collect();

        totals.sort_unstable();
        clones.sort_unstable();
        loads.sort_unstable();
        snaps.sort_unstable();
        encs.sort_unstable();

        let sum = |v: &[u64]| -> u64 { v.iter().sum::<u64>() / n as u64 };
        let p50 = |v: &[u64]| -> u64 { v[n / 2] };

        AggregatedTimings {
            min: ExportTimings {
                total_us: totals[0],
                scene_clone_us: clones[0],
                load_scene_us: loads[0],
                snapshot_us: snaps[0],
                encode_us: encs[0],
            },
            max: ExportTimings {
                total_us: *totals.last().unwrap(),
                scene_clone_us: *clones.last().unwrap(),
                load_scene_us: *loads.last().unwrap(),
                snapshot_us: *snaps.last().unwrap(),
                encode_us: *encs.last().unwrap(),
            },
            avg: ExportTimings {
                total_us: sum(&totals),
                scene_clone_us: sum(&clones),
                load_scene_us: sum(&loads),
                snapshot_us: sum(&snaps),
                encode_us: sum(&encs),
            },
            p50: ExportTimings {
                total_us: p50(&totals),
                scene_clone_us: p50(&clones),
                load_scene_us: p50(&loads),
                snapshot_us: p50(&snaps),
                encode_us: p50(&encs),
            },
            iterations: n,
        }
    }

    fn print(&self, label: &str) {
        eprintln!("\n  {} ({} iterations):", label, self.iterations);
        ExportTimings::header();
        self.min.print("min");
        self.p50.print("p50");
        self.avg.print("avg");
        self.max.print("max");
    }
}

// ── Core export measurement ─────────────────────────────────────────────

fn measure_single_export(
    scene: &Scene,
    geometry: &GeometryCache,
    fonts: &FontRepository,
    images: &ImageRepository,
    node_id: &NodeId,
    format: &ExportAs,
) -> Result<(ExportTimings, Vec<u8>)> {
    let constraints = format.get_constraints();

    let Some(rect) = geometry.get_render_bounds(node_id) else {
        bail!("node {node_id} has no render bounds");
    };

    let size = ExportSize {
        width: rect.width,
        height: rect.height,
    };
    let size = size.apply_constraints(constraints);
    let (out_w, out_h) = (size.width, size.height);

    let pixel_w = out_w as i32;
    let pixel_h = out_h as i32;
    if pixel_w <= 0 || pixel_h <= 0 {
        bail!("node {node_id} has zero/negative export dimensions ({pixel_w}x{pixel_h})");
    }

    let scale = if rect.width > 0.0 {
        out_w / rect.width
    } else {
        1.0
    };

    let skfmt = match format {
        ExportAs::PNG(_) => skia_safe::EncodedImageFormat::PNG,
        ExportAs::JPEG(_) => skia_safe::EncodedImageFormat::JPEG,
        _ => skia_safe::EncodedImageFormat::PNG,
    };
    let quality: Option<u32> = None; // quality is in the format config, Skia uses defaults

    // ── Stage 1: Scene clone ────────────────────────────────────────
    let t_clone = Instant::now();
    let scene_copy = scene.clone();
    let scene_clone_us = t_clone.elapsed().as_micros() as u64;

    // ── Stage 2: Renderer creation + load_scene ─────────────────────
    let t_load = Instant::now();
    let mut camera = Camera2D::new_from_bounds(rect);
    camera.set_size(Size {
        width: out_w,
        height: out_h,
    });
    camera.set_zoom(scale);

    let store = fonts.store();
    let mut r = Renderer::new_with_store(
        Backend::new_from_raster(pixel_w, pixel_h),
        None,
        camera,
        store,
        RendererOptions::default(),
    );
    r.fonts = fonts.clone();
    r.images = images.clone();
    r.load_scene(scene_copy);
    let load_scene_us = t_load.elapsed().as_micros() as u64;

    // ── Stage 3: Snapshot (render) ──────────────────────────────────
    let t_snap = Instant::now();
    let image = r.snapshot();
    let snapshot_us = t_snap.elapsed().as_micros() as u64;

    // ── Stage 4: Encode ─────────────────────────────────────────────
    let t_enc = Instant::now();
    let data = image
        .encode(None, skfmt, quality)
        .ok_or_else(|| anyhow!("Skia image encoding failed"))?;
    let bytes = data.to_vec();
    let encode_us = t_enc.elapsed().as_micros() as u64;

    r.free();

    let total_us = t_clone.elapsed().as_micros() as u64;

    Ok((
        ExportTimings {
            total_us,
            scene_clone_us,
            load_scene_us,
            snapshot_us,
            encode_us,
        },
        bytes,
    ))
}

/// Run the export N times and return aggregated timings + last image bytes.
fn benchmark_export(
    scene: &Scene,
    geometry: &GeometryCache,
    fonts: &FontRepository,
    images: &ImageRepository,
    node_id: &NodeId,
    format: &ExportAs,
    iterations: usize,
) -> Result<(AggregatedTimings, Vec<u8>)> {
    let mut samples = Vec::with_capacity(iterations);
    let mut last_bytes = Vec::new();

    for _ in 0..iterations {
        let (timings, bytes) =
            measure_single_export(scene, geometry, fonts, images, node_id, format)?;
        samples.push(timings);
        last_bytes = bytes;
    }

    Ok((AggregatedTimings::from_samples(&samples), last_bytes))
}

// ── Optimized export (reuses warm caches) ───────────────────────────────

/// Measure a single export using the optimized path that reuses the live
/// renderer's warm caches instead of creating a throwaway renderer.
fn measure_single_export_optimized(
    renderer: &Renderer,
    geometry: &GeometryCache,
    node_id: &NodeId,
    format: &ExportAs,
) -> Result<(ExportTimings, Vec<u8>)> {
    let constraints = format.get_constraints();

    let Some(rect) = geometry.get_render_bounds(node_id) else {
        bail!("node {node_id} has no render bounds");
    };

    let size = ExportSize {
        width: rect.width,
        height: rect.height,
    };
    let size = size.apply_constraints(constraints);
    let (out_w, out_h) = (size.width, size.height);

    let skfmt = match format {
        ExportAs::PNG(_) => skia_safe::EncodedImageFormat::PNG,
        ExportAs::JPEG(_) => skia_safe::EncodedImageFormat::JPEG,
        _ => skia_safe::EncodedImageFormat::PNG,
    };

    let t_total = Instant::now();

    // No clone needed — we borrow from the live renderer
    let scene_clone_us = 0u64;

    // No load_scene needed — caches are already warm
    let load_scene_us = 0u64;

    // ── Snapshot (render subtree only) ──────────────────────────────
    let t_snap = Instant::now();
    let image = renderer
        .export_node_image(node_id, rect, (out_w, out_h))
        .ok_or_else(|| anyhow!("export_node_image failed"))?;
    let snapshot_us = t_snap.elapsed().as_micros() as u64;

    // ── Encode ──────────────────────────────────────────────────────
    let t_enc = Instant::now();
    let data = image
        .encode(None, skfmt, None)
        .ok_or_else(|| anyhow!("Skia image encoding failed"))?;
    let bytes = data.to_vec();
    let encode_us = t_enc.elapsed().as_micros() as u64;

    let total_us = t_total.elapsed().as_micros() as u64;

    Ok((
        ExportTimings {
            total_us,
            scene_clone_us,
            load_scene_us,
            snapshot_us,
            encode_us,
        },
        bytes,
    ))
}

/// Run the optimized export N times and return aggregated timings + last image bytes.
fn benchmark_export_optimized(
    renderer: &Renderer,
    geometry: &GeometryCache,
    node_id: &NodeId,
    format: &ExportAs,
    iterations: usize,
) -> Result<(AggregatedTimings, Vec<u8>)> {
    let mut samples = Vec::with_capacity(iterations);
    let mut last_bytes = Vec::new();

    for _ in 0..iterations {
        let (timings, bytes) =
            measure_single_export_optimized(renderer, geometry, node_id, format)?;
        samples.push(timings);
        last_bytes = bytes;
    }

    Ok((AggregatedTimings::from_samples(&samples), last_bytes))
}

// ── Pixel comparison ────────────────────────────────────────────────────

/// Compare two PNG/JPEG byte buffers for pixel-exact equality.
/// Returns Ok(true) if identical, Ok(false) with diff info if not.
fn compare_exports(a: &[u8], b: &[u8]) -> Result<bool> {
    if a == b {
        return Ok(true);
    }

    // Byte-level differ — decode and compare pixel-by-pixel
    let img_a = image::load_from_memory(a)
        .context("failed to decode image A")?
        .to_rgba8();
    let img_b = image::load_from_memory(b)
        .context("failed to decode image B")?
        .to_rgba8();

    if img_a.dimensions() != img_b.dimensions() {
        eprintln!(
            "  DIMENSION MISMATCH: {:?} vs {:?}",
            img_a.dimensions(),
            img_b.dimensions()
        );
        return Ok(false);
    }

    let (w, h) = img_a.dimensions();
    let mut diff_count: u64 = 0;
    let mut max_channel_diff: u8 = 0;

    for y in 0..h {
        for x in 0..w {
            let pa = img_a.get_pixel(x, y);
            let pb = img_b.get_pixel(x, y);
            if pa != pb {
                diff_count += 1;
                for c in 0..4 {
                    let d = (pa[c] as i16 - pb[c] as i16).unsigned_abs() as u8;
                    if d > max_channel_diff {
                        max_channel_diff = d;
                    }
                }
            }
        }
    }

    let total = w as u64 * h as u64;
    let pct = diff_count as f64 / total as f64 * 100.0;
    eprintln!(
        "  PIXEL DIFF: {diff_count}/{total} pixels differ ({pct:.4}%), max channel delta={max_channel_diff}"
    );

    Ok(diff_count == 0)
}

// ── Node listing ────────────────────────────────────────────────────────

fn node_type_label(node: &Node) -> &'static str {
    match node {
        Node::InitialContainer(_) => "InitialContainer",
        Node::Container(_) => "Container",
        Node::Error(_) => "Error",
        Node::Group(_) => "Group",
        Node::Tray(_) => "Tray",
        Node::Rectangle(_) => "Rectangle",
        Node::Ellipse(_) => "Ellipse",
        Node::Polygon(_) => "Polygon",
        Node::RegularPolygon(_) => "RegularPolygon",
        Node::RegularStarPolygon(_) => "RegularStarPolygon",
        Node::Line(_) => "Line",
        Node::TextSpan(_) => "TextSpan",
        Node::AttributedText(_) => "AttributedText",
        Node::Path(_) => "Path",
        Node::Vector(_) => "Vector",
        Node::BooleanOperation(_) => "BooleanOp",
        Node::Image(_) => "Image",
        Node::MarkdownEmbed(_) => "MarkdownEmbed",
        Node::HTMLEmbed(_) => "HTMLEmbed",
    }
}

fn print_node_tree(scene: &Scene, geometry: &GeometryCache) {
    let graph = &scene.graph;

    fn walk(
        graph: &cg::node::scene_graph::SceneGraph,
        geometry: &GeometryCache,
        id: &NodeId,
        depth: usize,
    ) {
        let indent = "  ".repeat(depth);
        let type_label = graph.get_node(id).map(node_type_label).unwrap_or("???");
        let name = graph.get_name(id).unwrap_or("");
        let bounds_str = geometry
            .get_render_bounds(id)
            .map(|r| format!("{:.0}x{:.0}", r.width, r.height))
            .unwrap_or_else(|| "no-bounds".into());

        eprintln!(
            "{indent}[{id}] {type_label} {bounds_str}{}",
            if name.is_empty() {
                String::new()
            } else {
                format!(" \"{}\"", name)
            }
        );

        if let Some(children) = graph.get_children(id) {
            for child in children {
                walk(graph, geometry, child, depth + 1);
            }
        }
    }

    for root_id in graph.roots() {
        walk(graph, geometry, root_id, 0);
    }
}

// ── Format builder ──────────────────────────────────────────────────────

fn build_export_format(args: &ExportBenchArgs) -> ExportAs {
    let constraints = if (args.scale - 1.0).abs() < f32::EPSILON {
        ExportConstraints::None
    } else {
        ExportConstraints::Scale(args.scale)
    };

    match args.format.to_ascii_lowercase().as_str() {
        "jpeg" | "jpg" => ExportAs::jpeg(constraints, args.quality),
        _ => {
            // ExportAsPNG fields are pub(crate), so use serde round-trip
            let json = match &constraints {
                ExportConstraints::None => {
                    r#"{"format":"PNG","constraints":{"type":"none"}}"#.to_string()
                }
                ExportConstraints::Scale(s) => {
                    format!(r#"{{"format":"PNG","constraints":{{"type":"scale","value":{s}}}}}"#)
                }
                _ => r#"{"format":"PNG","constraints":{"type":"none"}}"#.to_string(),
            };
            serde_json::from_str(&json).expect("valid ExportAs JSON")
        }
    }
}

fn format_extension(format: &ExportAs) -> &'static str {
    match format {
        ExportAs::PNG(_) => "png",
        ExportAs::JPEG(_) => "jpeg",
        _ => "png",
    }
}

// ── Output helpers ──────────────────────────────────────────────────────

fn save_to_tmp(bytes: &[u8], node_id: NodeId, ext: &str) -> Result<PathBuf> {
    let dir = PathBuf::from("/tmp/grida-export-bench");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!("node_{node_id}.{ext}"));
    std::fs::write(&path, bytes)?;
    Ok(path)
}

// ── Entry point ─────────────────────────────────────────────────────────

pub async fn run_export_bench<L: AsyncSceneLoader>(args: ExportBenchArgs, loader: L) -> Result<()> {
    // Load scenes
    let scenes = loader.load(&args.path).await?;
    if scenes.is_empty() {
        bail!("no scenes found in {}", args.path);
    }

    if args.scene_index >= scenes.len() {
        bail!(
            "scene index {} out of range (file has {} scene(s))",
            args.scene_index,
            scenes.len()
        );
    }

    let scene = &scenes[args.scene_index];
    let node_count = scene.graph.node_count();

    eprintln!(
        "Scene {}: \"{}\" — {} nodes",
        args.scene_index, scene.name, node_count
    );

    // Build a warm renderer (same as interactive path) for the optimized export.
    // This simulates what the WASM app already has: a live Renderer with all
    // caches warm after load_scene.
    let store = Arc::new(Mutex::new(ByteStore::new()));
    let fonts = FontRepository::new(store.clone());
    let images = ImageRepository::new(store.clone());

    eprintln!("  loading scene into warm renderer...");
    let t_warmup = Instant::now();
    let mut warm_renderer = Renderer::new(
        Backend::new_from_raster(1, 1), // minimal surface — only caches matter
        None,
        Camera2D::new(Size {
            width: 1.0,
            height: 1.0,
        }),
    );
    warm_renderer.fonts = fonts.clone();
    warm_renderer.images = images.clone();
    warm_renderer.load_scene(scene.clone());
    eprintln!(
        "  warm renderer ready ({} ms, one-time cost)\n",
        t_warmup.elapsed().as_millis()
    );

    // Use geometry from the warm renderer (same cache the optimized path uses)
    let geometry = &warm_renderer.get_cache().geometry;

    // ── List nodes mode ─────────────────────────────────────────────
    if args.list_nodes {
        eprintln!("\nNode tree:");
        print_node_tree(scene, geometry);
        return Ok(());
    }

    // ── Determine target nodes ──────────────────────────────────────
    let target_nodes: Vec<NodeId> = if let Some(nid) = args.node_id {
        if !scene.graph.has_node(&nid) {
            bail!("node {nid} not found in scene. Use --list-nodes to see available IDs.");
        }
        vec![nid]
    } else if args.all_roots {
        scene.graph.roots().to_vec()
    } else {
        bail!("specify --node <ID> or --all-roots. Use --list-nodes to discover node IDs.");
    };

    let format = build_export_format(&args);
    let ext = format_extension(&format);

    eprintln!(
        "\nExporting {} node(s) as {} @ {:.1}x, {} iterations\n",
        target_nodes.len(),
        ext.to_uppercase(),
        args.scale,
        args.iterations,
    );

    // ── Benchmark each target ───────────────────────────────────────
    for &node_id in &target_nodes {
        let type_label = scene
            .graph
            .get_node(&node_id)
            .map(node_type_label)
            .unwrap_or("???");
        let name = scene.graph.get_name(&node_id).unwrap_or("");
        let bounds = geometry.get_render_bounds(&node_id);
        let dims = bounds
            .map(|r| format!("{:.0}x{:.0}", r.width, r.height))
            .unwrap_or_else(|| "?x?".into());

        eprintln!(
            "── node {node_id} ({type_label} {dims}{}) ──",
            if name.is_empty() {
                String::new()
            } else {
                format!(" \"{}\"", name)
            }
        );

        // Run baseline benchmark (throwaway renderer — current behavior)
        let (agg_baseline, bytes_baseline) = benchmark_export(
            scene,
            geometry,
            &fonts,
            &images,
            &node_id,
            &format,
            args.iterations,
        )?;

        agg_baseline.print("baseline (throwaway renderer)");

        // Run optimized benchmark (warm cache — new fast path)
        let (agg_optimized, bytes_optimized) = benchmark_export_optimized(
            &warm_renderer,
            geometry,
            &node_id,
            &format,
            args.iterations,
        )?;

        agg_optimized.print("optimized (warm cache)");

        // Print speedup
        let baseline_p50 = agg_baseline.p50.total_us as f64;
        let optimized_p50 = agg_optimized.p50.total_us as f64;
        if optimized_p50 > 0.0 {
            eprintln!(
                "\n  speedup: {:.1}x faster (p50: {:.2}ms → {:.2}ms)",
                baseline_p50 / optimized_p50,
                baseline_p50 / 1000.0,
                optimized_p50 / 1000.0,
            );
        }

        // ── Save mode ───────────────────────────────────────────────
        if args.save {
            let path_b = save_to_tmp(&bytes_baseline, node_id, &format!("baseline.{ext}"))?;
            let path_o = save_to_tmp(&bytes_optimized, node_id, &format!("optimized.{ext}"))?;
            eprintln!("  saved baseline:  {}", path_b.display());
            eprintln!("  saved optimized: {}", path_o.display());
        }

        // ── Compare mode ────────────────────────────────────────────
        // Compare baseline vs optimized to verify pixel-exact correctness.
        if args.compare {
            eprintln!("\n  comparing baseline vs optimized for pixel equality...");

            let identical = compare_exports(&bytes_baseline, &bytes_optimized)?;
            if identical {
                eprintln!("  PASS: baseline and optimized are pixel-identical");
            } else {
                eprintln!("  FAIL: baseline and optimized differ!");
                // Save both for inspection
                let dir = PathBuf::from("/tmp/grida-export-bench/compare");
                std::fs::create_dir_all(&dir)?;
                let pa = dir.join(format!("node_{node_id}_baseline.{ext}"));
                let pb = dir.join(format!("node_{node_id}_optimized.{ext}"));
                std::fs::write(&pa, &bytes_baseline)?;
                std::fs::write(&pb, &bytes_optimized)?;
                eprintln!("  saved: {} and {}", pa.display(), pb.display());
            }
        }

        eprintln!();
    }

    // ── Summary ─────────────────────────────────────────────────────
    eprintln!("Scene: {} nodes total", node_count);
    eprintln!(
        "Tip: For statistical analysis, run the Criterion benchmark:\n  \
         cargo bench -p cg --bench bench_export"
    );

    Ok(())
}
