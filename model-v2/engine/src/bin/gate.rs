//! ENG-0.2 / S-5 · the rig. `cargo run --release --bin gate` runs the checks
//! that keep every optimization honest, before the engine grows:
//!
//! 1. **shots** — the re-hosted spike's `--shot` output is byte-identical to
//!    the committed goldens (the pixel gate; the spike owns golden pixels).
//! 2. **replays** — each corpus `.replay` plays twice to a bit-identical
//!    document and result sequence (determinism, ENG-5.2).
//! 3. **diff** — the oracle law (ENG-0.2): every render optimization proves
//!    `optimized == reference` (pixel/drawlist). Empty until the first win;
//!    pins the reference oracle's determinism meanwhile.
//! 4. **bench** — resolve + drawlist timings stay within the checked-in
//!    budgets (`rig/baselines.json`), fail past `max(1.5x, +50us)`.
//!
//! `--bless-shots` / `--bless-bench` re-record the baselines. Paint TIMING is
//! deliberately not gated (GPU-noisy); paint CORRECTNESS is the shot gate.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

use anchor_engine::cache::{composited_to_bytes, SceneCache};
use anchor_engine::{drawlist, paint, replay};
use anchor_lab::math::Affine;
use anchor_lab::model::*;
use anchor_lab::resolve::{resolve, ResolveOptions, RotationInFlow};

const STATES: [&str; 4] = ["default", "crosszero", "rot45", "ungroup"];
const CORPUS: [&str; 3] = ["crosszero", "rot45", "ungroup"];

fn manifest() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let bless_shots = args.iter().any(|a| a == "--bless-shots");
    let bless_bench = args.iter().any(|a| a == "--bless-bench");

    println!("== anchor-engine gate ==");
    let mut ok = true;
    ok &= gate_shots(bless_shots);
    ok &= gate_replays();
    ok &= gate_diff();
    ok &= gate_bench(bless_bench);

    if ok {
        println!("\nGATE: PASS");
    } else {
        eprintln!("\nGATE: FAIL");
        std::process::exit(1);
    }
}

// ── 1. shots ────────────────────────────────────────────────────────────

fn gate_shots(bless: bool) -> bool {
    println!("\n[shots] spike --shot vs goldens");
    let spike = manifest().join("../../target/release/anchor-spike");
    let goldens = manifest().join("../a/spike-canvas/shots");
    if !spike.exists() {
        eprintln!(
            "  MISSING spike binary: {}\n  build it first: (cd model-v2/a/spike-canvas && cargo build --release)",
            spike.display()
        );
        return false;
    }
    let mut all = true;
    for state in STATES {
        let tmp = std::env::temp_dir().join(format!("anchor-gate-{state}.png"));
        let status = Command::new(&spike)
            .arg("--shot")
            .arg(&tmp)
            .arg(state)
            .status();
        let golden = goldens.join(format!("{state}.png"));
        if bless {
            if let (Ok(_), Ok(bytes)) = (status, std::fs::read(&tmp)) {
                std::fs::write(&golden, bytes).expect("bless golden");
                println!("  {state:10} blessed");
            }
            continue;
        }
        let same = matches!(status, Ok(s) if s.success()) && files_equal(&tmp, &golden);
        println!("  {state:10} {}", if same { "IDENTICAL" } else { "DIFF" });
        all &= same;
    }
    all
}

fn files_equal(a: &Path, b: &Path) -> bool {
    match (std::fs::read(a), std::fs::read(b)) {
        (Ok(x), Ok(y)) => x == y,
        _ => false,
    }
}

// ── 2. replays ──────────────────────────────────────────────────────────

fn gate_replays() -> bool {
    println!("\n[replays] play twice, bit-identical");
    let dir = manifest().join("rig/corpus");
    let mut all = true;
    for name in CORPUS {
        let path = dir.join(format!("{name}.replay"));
        let text = match std::fs::read_to_string(&path) {
            Ok(t) => t,
            Err(e) => {
                eprintln!("  {name:10} unreadable: {e}");
                all = false;
                continue;
            }
        };
        let rep = match replay::parse_string(&text) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("  {name:10} parse error: {e}");
                all = false;
                continue;
            }
        };
        let (d1, res1) = replay::play(&rep);
        let (d2, res2) = replay::play(&rep);
        let deterministic = anchor_lab::textir::print(&d1) == anchor_lab::textir::print(&d2)
            && replay::resolved_bits_eq(&resolve(&d1, &rep.opts), &resolve(&d2, &rep.opts))
            && res1 == res2;
        println!(
            "  {name:10} {} ({} op{})",
            if deterministic {
                "DETERMINISTIC"
            } else {
                "DIVERGED"
            },
            rep.ops.len(),
            if rep.ops.len() == 1 { "" } else { "s" }
        );
        all &= deterministic;
    }
    all
}

// ── 3. differential (the oracle law, ENG-0.2) ─────────────────────────────

/// Every render optimization ships a row here proving `optimized(input) ==
/// reference(input)` — a fast-but-wrong cache aborts the build before anyone
/// reads a speedup. Today it holds ZERO optimization rows (each lands with its
/// win); it instead pins the L2 reference oracle itself — `raster_to_bytes`
/// must be deterministic (ENG-0.3), so every future pixel row can trust it.
fn gate_diff() -> bool {
    println!("\n[diff] oracle-law differential (ENG-0.2)");
    let opts = ResolveOptions {
        viewport: (2000.0, 1400.0),
        rotation_in_flow: RotationInFlow::VisualOnly,
    };
    let ctx = paint::PaintCtx { font: None };
    let view = Affine::scale(0.6, 0.6); // fit-ish so the frame has real draws
    let (w, h) = (1360, 900);
    let mut all = true;
    for name in CORPUS {
        let path = manifest().join(format!("rig/corpus/{name}.replay"));
        let rep = match std::fs::read_to_string(&path)
            .ok()
            .and_then(|t| replay::parse_string(&t).ok())
        {
            Some(r) => r,
            None => {
                eprintln!("  {name:10} corpus unreadable");
                all = false;
                continue;
            }
        };
        let (doc, _) = replay::play(&rep);
        let resolved = resolve(&doc, &opts);
        let list = drawlist::build(&doc, &resolved);
        let a = paint::raster_to_bytes(&list, &view, w, h, &ctx);
        let b = paint::raster_to_bytes(&list, &view, w, h, &ctx);
        let same = a == b;
        println!(
            "  {name:10} reference {}",
            if same {
                "DETERMINISTIC"
            } else {
                "NONDETERMINISTIC"
            }
        );
        all &= same;

        // Win 1 · scene raster cache (L2): an integer-pan blit is byte-identical
        // to a fresh render. Prime the cache at `view`, pan by a whole pixel,
        // and compare the composite against a fresh render at the panned view.
        let panned = Affine {
            e: view.e + 40.0,
            f: view.f + 24.0,
            ..view
        };
        let mut cache = SceneCache::new(w, h);
        let _ = composited_to_bytes(&mut cache, &doc, &opts, &view, &ctx, false, w, h); // cold
        let blit = composited_to_bytes(&mut cache, &doc, &opts, &panned, &ctx, false, w, h);
        let fresh = {
            let r = resolve(&doc, &opts);
            paint::raster_to_bytes(&drawlist::build(&doc, &r), &panned, w, h, &ctx)
        };
        let cache_ok = blit == fresh;
        println!(
            "  {name:10} scene-cache  {}",
            if cache_ok {
                "MATCHES fresh (integer pan)"
            } else {
                "DIFFERS"
            }
        );
        all &= cache_ok;
    }
    all
}

// ── 4. bench ────────────────────────────────────────────────────────────

fn gate_bench(bless: bool) -> bool {
    println!("\n[bench] resolve + drawlist (min of 11, microseconds)");
    let baselines_path = manifest().join("rig/baselines.json");
    let machine = format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS);

    // "starter" = the corpus's normalized starter doc (no dependency on the
    // spike's scene builder); "flat10k" = a synthetic stress canvas.
    let starter = starter_doc();
    let starter_opts = ResolveOptions {
        viewport: (2000.0, 1400.0),
        rotation_in_flow: RotationInFlow::VisualOnly,
    };
    let flat = flat_canvas(10_000);

    let measured = [
        ("starter", bench_doc(&starter, &starter_opts)),
        ("flat10k", bench_doc(&flat, &starter_opts)),
    ];

    let prior = std::fs::read_to_string(&baselines_path)
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok());

    let same_machine = prior
        .as_ref()
        .and_then(|v| v.get("machine"))
        .and_then(|m| m.as_str())
        .map(|m| m == machine)
        .unwrap_or(false);

    let mut all = true;
    for (name, (r_us, b_us)) in measured {
        print!("  {name:10} resolve {r_us:8.1}  build {b_us:8.1}");
        if bless || prior.is_none() {
            println!("   (recording)");
            continue;
        }
        if !same_machine {
            println!("   (other machine — comparison skipped)");
            continue;
        }
        let base = prior
            .as_ref()
            .and_then(|v| v.get("entries"))
            .and_then(|e| e.get(name));
        let br = base
            .and_then(|b| b.get("resolve_us"))
            .and_then(|v| v.as_f64());
        let bb = base
            .and_then(|b| b.get("build_us"))
            .and_then(|v| v.as_f64());
        let r_ok = br.map(|base| within(r_us, base)).unwrap_or(true);
        let b_ok = bb.map(|base| within(b_us, base)).unwrap_or(true);
        println!(
            "   resolve {}  build {}",
            verdict(r_ok, r_us, br),
            verdict(b_ok, b_us, bb)
        );
        all &= r_ok && b_ok;
    }

    if bless || prior.is_none() {
        let json = serde_json::json!({
            "machine": machine,
            "note": "min-of-11 microseconds; regenerate with `gate --bless-bench`",
            "entries": {
                "starter": { "resolve_us": measured[0].1.0, "build_us": measured[0].1.1 },
                "flat10k": { "resolve_us": measured[1].1.0, "build_us": measured[1].1.1 },
            }
        });
        std::fs::write(
            &baselines_path,
            serde_json::to_string_pretty(&json).unwrap() + "\n",
        )
        .expect("write baselines");
        println!("  baselines written -> {}", baselines_path.display());
    }
    all
}

/// Budget rule: pass under `max(1.5x baseline, baseline + 50us)` — the floor
/// stops timer noise from failing sub-microsecond-ish entries.
fn within(measured: f64, baseline: f64) -> bool {
    measured <= (baseline * 1.5).max(baseline + 50.0)
}

fn verdict(ok: bool, measured: f64, baseline: Option<f64>) -> String {
    match baseline {
        Some(b) => format!("{}({measured:.1}/{b:.1})", if ok { "OK " } else { "OVER " }),
        None => "OK(new)".to_string(),
    }
}

fn bench_doc(doc: &Document, opts: &ResolveOptions) -> (f64, f64) {
    let mut r_min = f64::MAX;
    let mut b_min = f64::MAX;
    for _ in 0..11 {
        let t0 = Instant::now();
        let resolved = resolve(doc, opts);
        let t1 = Instant::now();
        let _ = drawlist::build(doc, &resolved);
        let t2 = Instant::now();
        r_min = r_min.min((t1 - t0).as_secs_f64() * 1e6);
        b_min = b_min.min((t2 - t1).as_secs_f64() * 1e6);
    }
    (r_min, b_min)
}

fn starter_doc() -> Document {
    // The normalized starter IR lives in every corpus replay's header.
    let path = manifest().join("rig/corpus/crosszero.replay");
    let text = std::fs::read_to_string(&path).expect("corpus present for bench");
    replay::parse_string(&text).expect("parse corpus").doc
}

fn flat_canvas(n: usize) -> Document {
    let mut b = DocBuilder::new();
    for i in 0..n {
        let mut h = Header::new(SizeIntent::Fixed(40.0), SizeIntent::Fixed(28.0));
        h.x = AxisBinding::start((i % 100) as f32 * 19.0);
        h.y = AxisBinding::start((i / 100) as f32 * 13.0);
        h.rotation = (i % 7) as f32 * 5.0;
        b.add(
            0,
            h,
            Payload::Shape {
                desc: ShapeDesc::Rect,
            },
        );
    }
    b.build()
}
