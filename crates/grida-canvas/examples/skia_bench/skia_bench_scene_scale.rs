//! Scene-Scale Cost Model Benchmark
//!
//! Measures full-engine render cost at scale (1K–136K nodes) with the complete
//! Renderer pipeline: R-tree culling, picture cache, layer compositing, GPU flush.
//!
//! This complements `skia_bench_cost_model` (single-node isolation) by testing
//! whether per-node costs are additive at scale or whether GPU batching,
//! memory pressure, and cache behavior introduce non-linear effects.
//!
//! Run with:
//! ```bash
//! cargo run -p cg --example skia_bench_scene_scale --features native-gl-context --release
//! ```

#[cfg(not(feature = "native-gl-context"))]
fn main() {
    eprintln!("This example requires --features native-gl-context");
}

#[cfg(feature = "native-gl-context")]
fn main() {
    use cg::cg::prelude::*;
    use cg::node::scene_graph::{Parent, SceneGraph};
    use cg::node::schema::*;
    use cg::runtime::scene::FrameFlushResult;
    use cg::window::headless::HeadlessGpu;
    use math2::transform::AffineTransform;
    use std::time::Instant;

    const W: i32 = 1000;
    const H: i32 = 1000;
    const WARMUP: u32 = 5;
    const ITERS: u32 = 20;

    let mut gpu = HeadlessGpu::new(W, H).expect("GPU init");
    gpu.print_gl_info();
    println!();

    // ── Scene builders ──────────────────────────────────────────────

    #[derive(Clone, Copy)]
    enum SceneType {
        Plain,
        WithShadow,
        WithBlur,
        Mixed, // 70% plain, 20% shadow, 10% blur
    }

    impl SceneType {
        fn label(&self) -> &'static str {
            match self {
                SceneType::Plain => "plain rects",
                SceneType::WithShadow => "all with shadow",
                SceneType::WithBlur => "all with blur",
                SceneType::Mixed => "mixed (70/20/10)",
            }
        }
    }

    fn build_scene(count: usize, scene_type: SceneType) -> Scene {
        let mut graph = SceneGraph::new();
        let cols = (count as f64).sqrt().ceil() as usize;

        let rectangles: Vec<Node> = (0..count)
            .map(|i| {
                let col = i % cols;
                let row = i / cols;
                let x = (col as f32) * 10.0;
                let y = (row as f32) * 10.0;

                let effects = match scene_type {
                    SceneType::Plain => LayerEffects::default(),
                    SceneType::WithShadow => LayerEffects::from_array(vec![
                        FilterEffect::DropShadow(FeShadow {
                            dx: 2.0,
                            dy: 2.0,
                            blur: 4.0,
                            spread: 0.0,
                            color: CGColor::from_rgba(0, 0, 0, 128),
                            active: true,
                        }),
                    ]),
                    SceneType::WithBlur => {
                        LayerEffects::new().blur(3.0)
                    }
                    SceneType::Mixed => {
                        let kind = i % 10;
                        if kind < 7 {
                            LayerEffects::default() // 70% plain
                        } else if kind < 9 {
                            LayerEffects::from_array(vec![
                                FilterEffect::DropShadow(FeShadow {
                                    dx: 2.0,
                                    dy: 2.0,
                                    blur: 4.0,
                                    spread: 0.0,
                                    color: CGColor::from_rgba(0, 0, 0, 128),
                                    active: true,
                                }),
                            ]) // 20% shadow
                        } else {
                            LayerEffects::new().blur(3.0) // 10% blur
                        }
                    }
                };

                Node::Rectangle(RectangleNodeRec {
                    active: true,
                    opacity: 1.0,
                    blend_mode: LayerBlendMode::default(),
                    mask: None,
                    transform: AffineTransform::new(x, y, 0.0),
                    size: Size {
                        width: 8.0,
                        height: 8.0,
                    },
                    corner_radius: RectangularCornerRadius::zero(),
                    corner_smoothing: CornerSmoothing::default(),
                    fills: Paints::new([Paint::from(CGColor::from_rgba(
                        66,
                        (133 + i % 50) as u8,
                        244,
                        255,
                    ))]),
                    strokes: Paints::default(),
                    stroke_style: StrokeStyle {
                        stroke_align: StrokeAlign::Inside,
                        stroke_cap: StrokeCap::default(),
                        stroke_join: StrokeJoin::default(),
                        stroke_miter_limit: StrokeMiterLimit::default(),
                        stroke_dash_array: None,
                    },
                    stroke_width: StrokeWidth::default(),
                    effects,
                    layout_child: None,
                })
            })
            .collect();

        graph.append_children(rectangles, Parent::Root);

        Scene {
            name: format!("scale_{}_{}", count, scene_type.label()),
            background_color: Some(CGColor::WHITE),
            graph,
        }
    }

    // ── Benchmark runner ────────────────────────────────────────────

    struct ScaleResult {
        scene_type: &'static str,
        node_count: usize,
        visible_count: usize,
        frame_us: f64,
        flush_us: f64,
        total_us: f64,
        per_visible_us: f64,
        cache_hits: usize,
        live_draws: usize,
    }

    fn run_scale_bench(
        renderer: &mut cg::runtime::scene::Renderer,
        count: usize,
        scene_type: SceneType,
    ) -> ScaleResult {
        let scene = build_scene(count, scene_type);
        renderer.load_scene(scene);

        // Measure stable frames (full draw, no image cache).
        // load_scene queues a stable frame automatically.
        // Each iteration: flush (draws), then queue next stable frame.
        // Stable frames always do a full draw — no pan/zoom image cache reuse.
        let mut frame_times = Vec::with_capacity((WARMUP + ITERS) as usize);
        let mut flush_times = Vec::with_capacity((WARMUP + ITERS) as usize);
        let mut total_times = Vec::with_capacity((WARMUP + ITERS) as usize);
        let mut last_visible = 0usize;
        let mut last_cache_hits = 0usize;
        let mut last_live_draws = 0usize;

        for i in 0..(WARMUP + ITERS) {
            renderer.queue_stable();
            let t0 = Instant::now();
            let result = renderer.flush();
            let wall = t0.elapsed();

            if let FrameFlushResult::OK(stats) = result {
                if i >= WARMUP {
                    frame_times.push(stats.frame_duration.as_nanos() as f64 / 1000.0);
                    flush_times.push(stats.flush_duration.as_nanos() as f64 / 1000.0);
                    total_times.push(wall.as_nanos() as f64 / 1000.0);
                }
                last_visible = stats.draw.live_draw_count + stats.draw.layer_image_cache_hits;
                last_cache_hits = stats.draw.layer_image_cache_hits;
                last_live_draws = stats.draw.live_draw_count;
            }
        }

        // Use median
        frame_times.sort_by(|a, b| a.partial_cmp(b).unwrap());
        flush_times.sort_by(|a, b| a.partial_cmp(b).unwrap());
        total_times.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let frame_us = frame_times.get(frame_times.len() / 2).copied().unwrap_or(0.0);
        let flush_us = flush_times.get(flush_times.len() / 2).copied().unwrap_or(0.0);
        let total_us = total_times.get(total_times.len() / 2).copied().unwrap_or(0.0);
        let per_visible = if last_visible > 0 {
            total_us / last_visible as f64
        } else {
            0.0
        };

        ScaleResult {
            scene_type: scene_type.label(),
            node_count: count,
            visible_count: last_visible,
            frame_us,
            flush_us,
            total_us,
            per_visible_us: per_visible,
            cache_hits: last_cache_hits,
            live_draws: last_live_draws,
        }
    }

    // ── Run all configurations ──────────────────────────────────────

    let counts = [1_000, 5_000, 10_000, 50_000, 100_000, 136_000];
    let scene_types = [
        SceneType::Plain,
        SceneType::WithShadow,
        SceneType::WithBlur,
        SceneType::Mixed,
    ];

    let mut renderer = gpu.create_renderer();
    let mut results: Vec<ScaleResult> = Vec::new();

    let total_configs = counts.len() * scene_types.len();
    let mut done = 0;

    for &scene_type in &scene_types {
        for &count in &counts {
            eprint!("\r  [{}/{}] {} × {}k", done + 1, total_configs, scene_type.label(), count / 1000);
            results.push(run_scale_bench(&mut renderer, count, scene_type));
            done += 1;
        }
    }
    eprintln!("\r  Done.{:60}", "");

    // ── Output Section 1: Scale Table ───────────────────────────────

    println!();
    println!("═══════════════════════════════════════════════════════════════════════════════════════════════════");
    println!("  SECTION 1: Frame Time vs. Node Count (unstable frames, full Renderer pipeline)");
    println!("═══════════════════════════════════════════════════════════════════════════════════════════════════");
    println!(
        "  {:<22} {:>8} {:>8} {:>10} {:>10} {:>10} {:>10} {:>8} {:>8}",
        "Scene Type", "Nodes", "Visible", "Frame(µs)", "Flush(µs)", "Total(µs)", "Per-vis", "Hits", "Live"
    );
    println!(
        "  {:-<22} {:->8} {:->8} {:->10} {:->10} {:->10} {:->10} {:->8} {:->8}",
        "", "", "", "", "", "", "", "", ""
    );

    for r in &results {
        println!(
            "  {:<22} {:>7}k {:>8} {:>10.0} {:>10.0} {:>10.0} {:>9.2} {:>8} {:>8}",
            r.scene_type,
            r.node_count / 1000,
            r.visible_count,
            r.frame_us,
            r.flush_us,
            r.total_us,
            r.per_visible_us,
            r.cache_hits,
            r.live_draws
        );
    }

    // ── Output Section 2: Linearity Check ───────────────────────────

    println!();
    println!("═══════════════════════════════════════════════════════════════════════════════════════════════════");
    println!("  SECTION 2: Per-Node Cost Linearity (total_us / visible_count across scales)");
    println!("═══════════════════════════════════════════════════════════════════════════════════════════════════");
    println!(
        "  {:<22} {:>10} {:>10} {:>10} {:>10} {:>10} {:>10}",
        "Scene Type", "1k", "5k", "10k", "50k", "100k", "136k"
    );
    println!(
        "  {:-<22} {:->10} {:->10} {:->10} {:->10} {:->10} {:->10}",
        "", "", "", "", "", "", ""
    );

    for scene_type in &scene_types {
        let label = scene_type.label();
        let per_vis: Vec<String> = counts
            .iter()
            .map(|&count| {
                results
                    .iter()
                    .find(|r| r.node_count == count && r.scene_type == label)
                    .map(|r| format!("{:.2}", r.per_visible_us))
                    .unwrap_or_else(|| "-".to_string())
            })
            .collect();
        println!(
            "  {:<22} {:>10} {:>10} {:>10} {:>10} {:>10} {:>10}",
            label, per_vis[0], per_vis[1], per_vis[2], per_vis[3], per_vis[4], per_vis[5]
        );
    }
    println!();
    println!("  If per-visible cost is flat → cost model is additive (linear scaling).");
    println!("  If per-visible cost increases with N → non-linear overhead at scale.");
    println!();

    // ── Output Section 3: Predicted vs Measured ─────────────────────

    println!("═══════════════════════════════════════════════════════════════════════════════════════════════════");
    println!("  SECTION 3: Predicted vs. Measured (using cost model)");
    println!("═══════════════════════════════════════════════════════════════════════════════════════════════════");
    println!();

    // Find baseline per-visible cost from plain 1k
    let plain_1k = results
        .iter()
        .find(|r| r.node_count == 1_000 && r.scene_type == "plain rects");

    if let Some(base) = plain_1k {
        let base_per_vis = base.per_visible_us;
        println!("  Baseline per-visible-node cost (plain, 1k): {:.2} µs", base_per_vis);
        println!();
        println!(
            "  {:<22} {:>8} {:>12} {:>12} {:>10}",
            "Scene Type", "Nodes", "Predicted(µs)", "Measured(µs)", "Ratio"
        );
        println!(
            "  {:-<22} {:->8} {:->12} {:->12} {:->10}",
            "", "", "", "", ""
        );

        for r in &results {
            // Prediction: plain baseline per node × visible count × effect multiplier
            let multiplier = match r.scene_type {
                "plain rects" => 1.0,
                "all with shadow" => 6.0, // 1 base + 5 shadow
                "all with blur" => 4.0,   // 1 base + 3 blur(σ=3)
                "mixed (70/20/10)" => 0.7 * 1.0 + 0.2 * 6.0 + 0.1 * 4.0, // 2.3
                _ => 1.0,
            };
            let predicted = base_per_vis * r.visible_count as f64 * multiplier;
            let measured = r.total_us;
            let ratio = measured / predicted;

            println!(
                "  {:<22} {:>7}k {:>12.0} {:>12.0} {:>9.2}×",
                r.scene_type,
                r.node_count / 1000,
                predicted,
                measured,
                ratio
            );
        }
    }

    println!();
}
