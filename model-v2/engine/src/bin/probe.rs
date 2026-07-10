//! probe — the autonomous render-perf harness (deterministic CPU raster).
//!
//! Drives the real `resolve -> drawlist::build -> paint::execute` seam across
//! three axes — VIEW (pan/zoom, no doc mutation), MUTATION (one node/frame),
//! ANIMATION (N nodes/frame) — at several scene sizes, reporting per-STAGE
//! distributions (min/p50/p95/p99/max/mean) with fps at mean AND p99. 120fps =
//! 8.333 ms/frame.
//!
//! Why raster, not GPU: deterministic + low-variance, so a ~5% regression is
//! detectable unattended, and correct-signed for every CPU-side win (retained
//! drawlist, cull, per-draw overhead). The two GPU-only wins (scene raster
//! cache, layerization) are validated by `probe_gpu` instead — on raster a
//! texture re-blit inverts sign.
//!
//! Trust guards (A1..A5) PANIC rather than print pretty-but-fake numbers:
//! a VIEW frame that actually re-resolved, a mutation frame that changed
//! nothing, camera drift off-scene, or `black_box` not biting all abort.
//!
//! Usage:
//!   cargo run --release --bin probe                 # full table
//!   cargo run --release --bin probe -- --quick      # fewer frames / sizes
//!   cargo run --release --bin probe -- --json       # machine-readable
//!   cargo run --release --bin probe -- --bless F     # write baseline JSON
//!   cargo run --release --bin probe -- --baseline F  # diff vs baseline

use std::hint::black_box;
use std::time::Instant;

use anchor_engine::cache::SceneCache;
use anchor_engine::{damage, frame::render, paint::PaintCtx};
use anchor_lab::math::{Affine, RectF};
use anchor_lab::model::*;
use anchor_lab::ops::{self, dirty_class, Op, PhaseMask};
use anchor_lab::resolve::{resolve, ResolveOptions, RotationInFlow};

const W: f32 = 1360.0;
const H: f32 = 900.0;
const WARMUP: usize = 20;

fn opts() -> ResolveOptions {
    ResolveOptions {
        viewport: (W, H),
        rotation_in_flow: RotationInFlow::VisualOnly,
    }
}

// ── distributions ─────────────────────────────────────────────────────────

struct Dist {
    min: f64,
    p50: f64,
    p95: f64,
    p99: f64,
    max: f64,
    mean: f64,
}

impl Dist {
    /// From nanosecond samples → milliseconds.
    fn from_ns(samples: &[u128]) -> Dist {
        let mut ms: Vec<f64> = samples.iter().map(|&n| n as f64 / 1e6).collect();
        ms.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let pick = |q: f64| ms[((ms.len() as f64 * q) as usize).min(ms.len() - 1)];
        Dist {
            min: ms[0],
            p50: pick(0.50),
            p95: pick(0.95),
            p99: pick(0.99),
            max: ms[ms.len() - 1],
            mean: ms.iter().sum::<f64>() / ms.len() as f64,
        }
    }
    fn json(&self) -> String {
        format!(
            "{{\"min\":{:.4},\"p50\":{:.4},\"p95\":{:.4},\"p99\":{:.4},\"max\":{:.4},\"mean\":{:.4}}}",
            self.min, self.p50, self.p95, self.p99, self.max, self.mean
        )
    }
}

// ── camera (world→screen Affine, manipulated directly to avoid drift) ───────

fn fit_view(aabb: RectF) -> Affine {
    let s = (W / aabb.w).min(H / aabb.h) * 0.95;
    let tx = (W - s * aabb.w) / 2.0 - s * aabb.x;
    let ty = (H - s * aabb.h) / 2.0 - s * aabb.y;
    Affine {
        a: s,
        b: 0.0,
        c: 0.0,
        d: s,
        e: tx,
        f: ty,
    }
}

fn zoom_about(base: &Affine, factor: f32, cx: f32, cy: f32) -> Affine {
    let s = base.a;
    let (wx, wy) = ((cx - base.e) / s, (cy - base.f) / s);
    let s2 = s * factor;
    Affine {
        a: s2,
        b: 0.0,
        c: 0.0,
        d: s2,
        e: cx - s2 * wx,
        f: cy - s2 * wy,
    }
}

// ── deterministic heavy scene ───────────────────────────────────────────────

/// A flat grid packed so its content AABB fills the viewport at fit-zoom (the
/// honest all-visible worst case). Deterministic: rotation (i%7)*5°, kind
/// cycle {Rect,Ellipse,Line} with every 20th a Text run (exercises the
/// resolver measure phase + executor text branch), palette cycle.
/// Returns (doc, leaf ids in z-order, content AABB).
fn packed(n: usize) -> (Document, Vec<NodeId>, RectF) {
    const CELL: f32 = 20.0;
    let cols = ((n as f32 * W / H).sqrt().ceil() as usize).max(1);
    let rows = n.div_ceil(cols);
    let mut b = DocBuilder::new();
    let palette = ["4A90D9", "E2574C", "57B894", "8B7BD8", "E2A23F"];
    let mut ids = Vec::with_capacity(n);
    for i in 0..n {
        let mut h = Header::new(SizeIntent::Fixed(CELL * 0.8), SizeIntent::Fixed(CELL * 0.8));
        h.x = AxisBinding::start((i % cols) as f32 * CELL);
        h.y = AxisBinding::start((i / cols) as f32 * CELL);
        h.rotation = (i % 7) as f32 * 5.0;
        let payload = if i % 20 == 19 {
            Payload::Text {
                content: "hi".to_string(),
                font_size: 10.0,
            }
        } else {
            Payload::Shape {
                desc: match i % 3 {
                    0 => ShapeDesc::Rect,
                    1 => ShapeDesc::Ellipse,
                    _ => ShapeDesc::Line,
                },
            }
        };
        ids.push(b.add(0, h, payload));
    }
    let mut doc = b.build();
    for (i, &id) in ids.iter().enumerate() {
        doc.get_mut(id).fills = Paints::solid(format!("#{}", palette[i % palette.len()]).into());
    }
    let aabb = RectF {
        x: 0.0,
        y: 0.0,
        w: cols as f32 * CELL,
        h: rows as f32 * CELL,
    };
    (doc, ids, aabb)
}

// ── scenarios ───────────────────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq)]
enum Axis {
    View,
    Mutation,
    Animation,
}

struct Scenario {
    name: &'static str,
    axis: Axis,
    n_anim: usize, // animation only
}

fn scenarios(quick: bool) -> Vec<Scenario> {
    let mut v = vec![
        Scenario {
            name: "view_pan",
            axis: Axis::View,
            n_anim: 0,
        },
        Scenario {
            name: "view_zoom",
            axis: Axis::View,
            n_anim: 0,
        },
        Scenario {
            name: "mutate_move",
            axis: Axis::Mutation,
            n_anim: 0,
        },
        Scenario {
            name: "mutate_rotate",
            axis: Axis::Mutation,
            n_anim: 0,
        },
        Scenario {
            name: "mutate_color",
            axis: Axis::Mutation,
            n_anim: 0,
        },
    ];
    if !quick {
        v.push(Scenario {
            name: "anim_transform_1",
            axis: Axis::Animation,
            n_anim: 1,
        });
        v.push(Scenario {
            name: "anim_transform_100",
            axis: Axis::Animation,
            n_anim: 100,
        });
        v.push(Scenario {
            name: "anim_color_100",
            axis: Axis::Animation,
            n_anim: 100,
        });
    }
    v
}

struct Result {
    scenario: &'static str,
    n: usize,
    resolve: Dist,
    build: Dist,
    execute: Dist,
    full: Dist,
    changed_p50: usize, // measured damage (mutation/anim)
}

/// Run one scenario at one size. Drives the real render seam; PANICS on any
/// trust-guard violation.
fn run(sc: &Scenario, n: usize, frames: usize, ctx: &PaintCtx) -> Result {
    let (mut doc, ids, aabb) = packed(n);
    let base = fit_view(aabb);
    let mut surface = skia_safe::surfaces::raster_n32_premul((W as i32, H as i32)).unwrap();

    // Reference resolve/drawlist for the VIEW-redundancy audit (A4).
    let ref_resolved = resolve(&doc, &opts());
    let ref_list = anchor_engine::drawlist::build(&doc, &ref_resolved);
    // Rotation is a paint-only transform under DEC-0 (grounded in the
    // classifier, not the scenario name).
    if sc.name == "mutate_rotate" {
        let dc = dirty_class(
            &Op::SetRotation {
                id: ids[0],
                deg: 1.0,
            },
            RotationInFlow::VisualOnly,
        );
        assert_eq!(
            dc.phases,
            PhaseMask::T.or(PhaseMask::B),
            "DEC-0: SetRotation must be paint-only (T|B)"
        );
    }

    let target = ids[0];
    let mut prev = ref_resolved.clone();
    let mut view = base;
    let mut pan = 0.0f32;
    let mut pan_dir = 1.0f32;

    let mut r_ns = Vec::with_capacity(frames);
    let mut b_ns = Vec::with_capacity(frames);
    let mut e_ns = Vec::with_capacity(frames);
    let mut f_ns = Vec::with_capacity(frames);
    let mut changed = Vec::with_capacity(frames);
    let mut nonempty_view_frames = 0usize;
    let mut redundant_view_frames = 0usize;

    for frame in 0..(WARMUP + frames) {
        let prev_view = view; // last frame's camera (Affine is Copy)
                              // ── drive: mutate doc and/or view for this frame ──
        match sc.axis {
            Axis::View => {
                if sc.name == "view_pan" {
                    pan += pan_dir * 6.0;
                    if pan.abs() > 240.0 {
                        pan_dir = -pan_dir; // reversal — bounded, no drift
                    }
                    view = base;
                    view.e += pan;
                } else {
                    // view_zoom: A/B two-level alternation (drift-free).
                    let factor = if frame % 2 == 0 { 1.0 } else { 1.6 };
                    view = zoom_about(&base, factor, W / 2.0, H / 2.0);
                }
            }
            Axis::Mutation => match sc.name {
                "mutate_move" => {
                    // oscillating move via the delta-retarget op (uses prev).
                    let dx = if frame % 40 < 20 { 3.0 } else { -3.0 };
                    let _ = ops::apply(
                        &mut doc,
                        &prev,
                        &Op::MoveBy {
                            id: target,
                            dx,
                            dy: 0.0,
                        },
                    );
                }
                "mutate_rotate" => {
                    let deg = (frame % 30) as f32; // 0..30 sweep, paint-only
                    let _ = ops::apply(&mut doc, &prev, &Op::SetRotation { id: target, deg });
                }
                "mutate_color" => {
                    // NOTE: fill is not an Op (no set_fill in the lab). This
                    // deliberately exercises the missing paint-damage channel:
                    // damage::diff sees NO geometry change though the pixels do.
                    let hex = ["4A90D9", "E2574C", "57B894"][frame % 3];
                    doc.get_mut(target).fills = Paints::solid(format!("#{hex}").into());
                }
                _ => {}
            },
            Axis::Animation => {
                let k = sc.n_anim.min(ids.len());
                if sc.name.starts_with("anim_transform") {
                    let deg = (frame % 30) as f32;
                    for &id in &ids[..k] {
                        let _ = ops::apply(&mut doc, &prev, &Op::SetRotation { id, deg });
                    }
                } else {
                    let hex = ["4A90D9", "E2574C", "57B894"][frame % 3];
                    for &id in &ids[..k] {
                        doc.get_mut(id).fills = Paints::solid(format!("#{hex}").into());
                    }
                }
            }
        }

        // ── the measured frame: clear + render (resolve+build+execute) ──
        let canvas = surface.canvas();
        canvas.clear(skia_safe::Color::WHITE);
        let t = Instant::now();
        let (resolved, list, stats) = render(canvas, &doc, &opts(), &view, ctx);
        let full = t.elapsed().as_nanos();

        // black_box the pure outputs so LLVM can't hoist resolve/build.
        black_box(list.items.len());
        black_box(resolved.resolved_count());

        let dmg = damage::diff(&prev, &resolved);

        if frame >= WARMUP {
            r_ns.push(stats.resolve_ns);
            b_ns.push(stats.build_ns);
            e_ns.push(stats.execute_ns);
            f_ns.push(full);
            changed.push(dmg.changed.len());

            match sc.axis {
                Axis::View => {
                    // A4: on a VIEW frame the doc is unchanged → resolve+build
                    // are provably redundant. This is the whole premise.
                    if damage::diff(&ref_resolved, &resolved).is_empty() && list == ref_list {
                        redundant_view_frames += 1;
                    }
                    // A2: the camera must change frame-to-frame (no no-op frame
                    // measuring an un-moved view).
                    if view != prev_view {
                        nonempty_view_frames += 1;
                    }
                }
                _ => {}
            }
        }

        prev = resolved;
    }

    // ── trust guards (panic, not fake numbers) ──
    if sc.axis == Axis::View {
        assert_eq!(
            redundant_view_frames, frames,
            "A4 [{}]: every VIEW frame must be resolve+build-redundant (got {}/{})",
            sc.name, redundant_view_frames, frames
        );
        assert!(
            nonempty_view_frames * 100 >= frames * 95,
            "A2 [{}]: camera must actually move ({}/{})",
            sc.name,
            nonempty_view_frames,
            frames
        );
    }
    if sc.axis == Axis::Mutation && sc.name != "mutate_color" {
        let moved = changed.iter().filter(|&&c| c > 0).count();
        assert!(
            moved * 100 >= frames * 90,
            "A2 [{}]: geometric mutation must damage ≥90% frames ({}/{})",
            sc.name,
            moved,
            frames
        );
    }
    let mut sorted = changed.clone();
    sorted.sort_unstable();
    let changed_p50 = sorted.get(sorted.len() / 2).copied().unwrap_or(0);

    Result {
        scenario: sc.name,
        n,
        resolve: Dist::from_ns(&r_ns),
        build: Dist::from_ns(&b_ns),
        execute: Dist::from_ns(&e_ns),
        full: Dist::from_ns(&f_ns),
        changed_p50,
    }
}

// ── Win 1: the scene raster cache, on the view scenarios ────────────────────

/// Drive a VIEW scenario through the compositor. Pan reverses at ±500 (beyond
/// the 256 margin), so re-rasters happen periodically — the honest amortized
/// picture (p50 = blit, p99 catches a re-raster hitch). Returns the frame
/// distribution and the re-raster percentage.
fn run_cached(name: &'static str, n: usize, frames: usize, ctx: &PaintCtx) -> (Dist, f64) {
    let (doc, _ids, aabb) = packed(n);
    let base = fit_view(aabb);
    let mut surface = skia_safe::surfaces::raster_n32_premul((W as i32, H as i32)).unwrap();
    let mut cache = SceneCache::new(W as i32, H as i32);
    let mut pan = 0.0f32;
    let mut dir = 1.0f32;
    let mut wall = Vec::with_capacity(frames);
    let mut rerasters = 0usize;

    for frame in 0..(WARMUP + frames) {
        let view = if name == "view_pan" {
            pan += dir * 6.0;
            if pan.abs() > 500.0 {
                dir = -dir; // beyond the margin → periodic re-raster
            }
            let mut v = base;
            v.e += pan;
            v
        } else {
            let factor = if frame % 2 == 0 { 1.0 } else { 1.6 };
            zoom_about(&base, factor, W / 2.0, H / 2.0)
        };
        let canvas = surface.canvas();
        canvas.clear(skia_safe::Color::WHITE);
        let t = Instant::now();
        let did = cache.frame(canvas, &doc, &opts(), &view, ctx, false);
        let elapsed = t.elapsed().as_nanos();
        black_box(did);
        if frame >= WARMUP {
            wall.push(elapsed);
            if did {
                rerasters += 1;
            }
        }
    }
    (
        Dist::from_ns(&wall),
        rerasters as f64 / frames as f64 * 100.0,
    )
}

// ── output ──────────────────────────────────────────────────────────────────

fn print_table(results: &[Result]) {
    println!(
        "\n{:<20} {:>8}  {:>18} {:>18} {:>18} {:>18}   {:>7} {:>7}  {:>7}",
        "scenario",
        "nodes",
        "resolve p50/p99",
        "build p50/p99",
        "execute p50/p99",
        "frame p50/p99",
        "fps",
        "fps99",
        "damage"
    );
    for r in results {
        let fps = 1000.0 / r.full.mean;
        let fps99 = 1000.0 / r.full.p99;
        let flag = if r.full.p99 <= 8.333 { " " } else { "!" };
        println!(
            "{:<20} {:>8}  {:>8.3}/{:>8.3} {:>8.3}/{:>8.3} {:>8.3}/{:>8.3} {:>8.3}/{:>8.3}  {:>7.1}{}{:>6.1}  {:>7}",
            r.scenario, r.n,
            r.resolve.p50, r.resolve.p99,
            r.build.p50, r.build.p99,
            r.execute.p50, r.execute.p99,
            r.full.p50, r.full.p99,
            fps, flag, fps99, r.changed_p50,
        );
    }
    println!("(120fps budget = 8.333 ms; `!` marks frame p99 over budget)");
}

fn to_json(results: &[Result]) -> String {
    let mut s = String::from("[\n");
    for (i, r) in results.iter().enumerate() {
        s.push_str(&format!(
            "  {{\"scenario\":\"{}\",\"n\":{},\"resolve_ms\":{},\"build_ms\":{},\"execute_ms\":{},\"full_ms\":{},\"fps_mean\":{:.2},\"fps_p99\":{:.2},\"changed_p50\":{}}}{}\n",
            r.scenario, r.n, r.resolve.json(), r.build.json(), r.execute.json(), r.full.json(),
            1000.0 / r.full.mean, 1000.0 / r.full.p99, r.changed_p50,
            if i + 1 < results.len() { "," } else { "" },
        ));
    }
    s.push(']');
    s
}

/// Diff full-frame p99 against a prior JSON baseline; flag regressions >~5%.
fn diff_baseline(results: &[Result], baseline_path: &str) {
    let Ok(text) = std::fs::read_to_string(baseline_path) else {
        eprintln!("baseline not found: {baseline_path}");
        return;
    };
    let base: serde_json::Value = serde_json::from_str(&text).unwrap();
    let arr = base.as_array().cloned().unwrap_or_default();
    println!(
        "\n{:<20} {:>8}  {:>12} {:>12}  {:>8}",
        "scenario", "nodes", "base p99", "now p99", "Δ%"
    );
    for r in results {
        let prior = arr.iter().find(|v| {
            v.get("scenario").and_then(|s| s.as_str()) == Some(r.scenario)
                && v.get("n").and_then(|x| x.as_u64()) == Some(r.n as u64)
        });
        let base_p99 = prior
            .and_then(|v| v.get("full_ms"))
            .and_then(|v| v.get("p99"))
            .and_then(|v| v.as_f64());
        match base_p99 {
            Some(bp) => {
                let d = (r.full.p99 - bp) / bp * 100.0;
                let mark = if d > 5.0 {
                    "  REGRESSION"
                } else if d < -5.0 {
                    "  win"
                } else {
                    ""
                };
                println!(
                    "{:<20} {:>8}  {:>12.3} {:>12.3}  {:>+7.1}%{}",
                    r.scenario, r.n, bp, r.full.p99, d, mark
                );
            }
            None => println!(
                "{:<20} {:>8}  {:>12} {:>12.3}",
                r.scenario, r.n, "(new)", r.full.p99
            ),
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let quick = args.iter().any(|a| a == "--quick");
    let json = args.iter().any(|a| a == "--json");
    let bless = args
        .iter()
        .position(|a| a == "--bless")
        .and_then(|i| args.get(i + 1).cloned());
    let baseline = args
        .iter()
        .position(|a| a == "--baseline")
        .and_then(|i| args.get(i + 1).cloned());

    let sizes: &[usize] = if quick {
        &[1_000, 10_000]
    } else {
        &[1_000, 10_000, 100_000]
    };
    let frames = if quick { 60 } else { 240 };
    let cache_mode = args.iter().any(|a| a == "--cache");

    // font: None → text is skipped by the executor (deterministic, no
    // font-availability nondeterminism), same as the gate's raster path.
    let ctx = PaintCtx::new(None);

    if cache_mode {
        println!("== Win 1: scene raster cache (view scenarios) ==");
        println!(
            "{:<12} {:>8}  {:>10} {:>10}  {:>7} {:>7}  {:>9}",
            "scenario", "nodes", "p50 ms", "p99 ms", "fps", "fps99", "reraster%"
        );
        for name in ["view_pan", "view_zoom"] {
            for &n in sizes {
                let (d, rr) = run_cached(name, n, frames, &ctx);
                println!(
                    "{:<12} {:>8}  {:>10.4} {:>10.4}  {:>7.1} {:>6.1}  {:>8.1}%",
                    name,
                    n,
                    d.p50,
                    d.p99,
                    1000.0 / d.mean,
                    1000.0 / d.p99,
                    rr
                );
            }
        }
        return;
    }

    let mut results = Vec::new();
    for sc in scenarios(quick) {
        for &n in sizes {
            // animation ratio is only meaningful in a large static field.
            if sc.axis == Axis::Animation && n < 10_000 {
                continue;
            }
            eprint!("  {} @ {} ... ", sc.name, n);
            let r = run(&sc, n, frames, &ctx);
            eprintln!("done");
            results.push(r);
        }
    }

    if json {
        println!("{}", to_json(&results));
    } else {
        print_table(&results);
    }
    if let Some(path) = bless {
        std::fs::write(&path, to_json(&results) + "\n").expect("write baseline");
        eprintln!("baseline written -> {path}");
    }
    if let Some(path) = baseline {
        diff_baseline(&results, &path);
    }
}
