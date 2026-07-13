//! E10 — the feel spike. `cargo run --release` opens the editor window;
//! `--play-svg <input.svg>` opens the isolated live animation host;
//! `--shot out.png [state]` renders headless to PNG (self-verification);
//! `--bench` prints resolve+paint timings.
//!
//! The loop is the thesis: `document -> resolve + drawlist -> paint`,
//! immediate, no caches. Live geometry and paint share the host-font text
//! oracle, while the editor still holds no derived state (see TEXTBOOK.md).

mod camera;
mod interaction;
mod paint;
mod scene;
mod shell;

use anchor_engine::frame::{FrameBuildError, FrameProduct};
use anchor_engine::paint::PaintCtx;
use anchor_lab::model::{Document, NodeId};
use anchor_lab::ops::Op;
use anchor_lab::resolve::{resolve, ResolveOptions, Resolved};
use camera::Camera;

/// The resolve viewport — the root frame spans it; think "world extent
/// of the infinite canvas' initial container", not the window.
pub const RESOLVE_VIEWPORT: (f32, f32) = (2000.0, 1400.0);

pub fn resolve_doc(doc: &Document) -> Resolved {
    resolve(
        doc,
        &ResolveOptions {
            viewport: RESOLVE_VIEWPORT,
            ..Default::default()
        },
    )
}

/// Resolve with the spike's host font environment and retain the exact shaped
/// fonts in the resulting display list. Rendering paths use this boundary;
/// [`resolve_doc`] remains the deterministic glyphless helper for recorded
/// scripts and benchmarks.
pub fn resolve_and_build_doc(
    doc: &Document,
    ctx: &PaintCtx,
) -> Result<FrameProduct, FrameBuildError> {
    anchor_engine::frame::resolve_and_build(
        doc,
        &ResolveOptions {
            viewport: RESOLVE_VIEWPORT,
            ..Default::default()
        },
        ctx,
    )
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if let Some(i) = args.iter().position(|argument| argument == "--play-svg") {
        let Some(path) = args.get(i + 1) else {
            eprintln!("usage: anchor-spike --play-svg <input.svg>");
            std::process::exit(2);
        };
        if let Err(error) = shell::play_svg(std::path::Path::new(path)) {
            eprintln!("anchor-spike: {error}");
            std::process::exit(1);
        }
        return;
    }
    if let Some(i) = args.iter().position(|a| a == "--shot") {
        let path = args.get(i + 1).cloned().unwrap_or("spike.png".into());
        // The state arg is positional but optional; a following flag is not it.
        let state = args
            .get(i + 2)
            .filter(|s| !s.starts_with("--"))
            .cloned()
            .unwrap_or_default();
        shot(&path, &state);
        return;
    }
    if let Some(i) = args.iter().position(|a| a == "--record") {
        let path = args.get(i + 1).cloned().unwrap_or("out.replay".into());
        let state = args
            .get(i + 2)
            .filter(|s| !s.starts_with("--"))
            .cloned()
            .unwrap_or_default();
        record(&path, &state);
        return;
    }
    if args.iter().any(|a| a == "--bench") {
        bench();
        return;
    }
    shell::run();
}

/// A scripted state as a typed op sequence — the SAME writes the gesture would
/// issue, expressed as data so both `--shot` (apply + render) and `--record`
/// (serialize to a `.replay`) share one definition. Ops address nodes by name
/// so they survive the recorder's `parse(print(doc))` normalization.
fn state_ops(doc: &Document, state: &str) -> Vec<Op> {
    match state {
        "crosszero" => {
            // Drag card.a's right edge THROUGH the left edge (E-A14).
            let id = find(doc, "card.a");
            let r = resolve_doc(doc);
            let drag = anchor_lab::ops::ResizeDrag::begin(
                doc,
                &r,
                id,
                anchor_lab::ops::Axis::X,
                anchor_lab::model::AnchorEdge::End,
            )
            .unwrap();
            let b = r.box_of(id);
            vec![Op::ResizeDrag {
                id,
                drag,
                target: b.x + b.w + 50.0, // 50px past the FIXED right edge
            }]
        }
        "ungroup" => vec![Op::Ungroup {
            id: find(doc, "chips"),
        }],
        "rot45" => vec![Op::SetRotation {
            id: find(doc, "card.rot"),
            deg: 45.0,
        }],
        _ => vec![],
    }
}

/// The HUD selection a shot shows for a state (chrome only).
fn shot_selection(doc: &Document, state: &str) -> Option<NodeId> {
    match state {
        "crosszero" => Some(find(doc, "card.a")),
        "ungroup" => None,
        _ => Some(find(doc, "card.rot")), // rot45 and default
    }
}

/// Record the starter + a scripted state as a `.replay` file (ENG-5.2). The
/// document is normalized so recorded ids are the parse-assigned ones; ops are
/// built against the normalized doc (by name), so the file is self-consistent.
fn record(path: &str, state: &str) {
    let (starter, _) = scene::starter();
    let doc = anchor_lab::textir::parse(&anchor_lab::textir::print(&starter)).expect("normalize");
    let ops = state_ops(&doc, state);
    let opts = ResolveOptions {
        viewport: RESOLVE_VIEWPORT,
        ..Default::default()
    };
    let text = anchor_engine::replay::write_string(
        &doc,
        &ops,
        &anchor_engine::oracle::OracleTags::default(),
        &opts,
    );
    std::fs::write(path, text).expect("write replay");
    println!("recorded {} op(s) to {path}", ops.len());
}

/// Headless render: paint the starter scene (after an optional scripted
/// state) into a raster surface and encode PNG — no window, no GL. The SCENE
/// is painted by the engine pipeline (`frame::resolve_and_build` -> checked
/// `FrameProduct::execute`);
/// the HUD is spike chrome on top. These shots are the gate's goldens.
fn shot(path: &str, state: &str) {
    let (mut doc, artboard) = scene::starter();

    // Apply the scripted state as typed ops (byte-identical to the free-fn
    // script — apply is pure dispatch), each with a fresh resolve.
    for op in state_ops(&doc, state) {
        let r = resolve_doc(&doc);
        anchor_lab::ops::apply(&mut doc, &r, &op).expect("scripted op");
    }
    let selection = shot_selection(&doc, state);

    let (w, h) = (1360, 900);
    let mut surface = skia_safe::surfaces::raster_n32_premul((w, h)).expect("raster surface");
    let ctx = paint::paint_ctx();
    let product = resolve_and_build_doc(&doc, &ctx).expect("spike scene must pass paint preflight");
    let resolved = product.resolved();
    let mut cam = Camera::new();
    let ab = resolved.aabb_of(artboard);
    cam.fit((ab.x, ab.y, ab.w, ab.h), (w as f32, h as f32), 48.0);

    let canvas = surface.canvas();
    canvas.clear(skia_safe::Color::from_argb(255, 0xF7, 0xF8, 0xF9));
    product
        .execute(canvas, &cam.view(), &ctx)
        .expect("shot uses the frame's unchanged paint environment");
    shell::hud::paint_hud(canvas, &doc, resolved, &cam, selection, None, &ctx);

    let image = surface.image_snapshot();
    let data = image
        .encode(None, skia_safe::EncodedImageFormat::PNG, None)
        .expect("png encode");
    std::fs::write(path, data.as_bytes()).expect("write png");
    println!("wrote {path} ({} bytes)", data.len());
}

fn find(doc: &Document, name: &str) -> anchor_lab::model::NodeId {
    scene::find_named(doc, name).expect("named node")
}

/// Per-stage frame cost on raster, across scene sizes. Separates the three
/// pipeline stages — resolve (lab) / drawlist build (engine, CPU) / skia
/// execute (the draw calls) — so the paint wall is visible, and packs each
/// heavy scene so every node is ON the surface (the honest all-visible worst
/// case; real editing culls to the viewport). fps is against the 120fps
/// (8.33ms) budget. Every frame here is a FULL redraw — which is exactly the
/// architecture problem: a pan changes nothing in the document yet pays all
/// three stages, and a one-node mutation pays the whole scene's execute.
fn bench() {
    use anchor_lab::model::*;
    use std::time::Instant;

    const W: i32 = 1360;
    const H: i32 = 900;
    let mut surface = skia_safe::surfaces::raster_n32_premul((W, H)).unwrap();
    let ctx = paint::paint_ctx();
    let view = Camera::new().view();

    let mut run = |label: &str, doc: &Document| {
        let (mut resolve_ms, mut build_ms, mut exec_ms) = (f64::MAX, f64::MAX, f64::MAX);
        for _ in 0..11 {
            let t0 = Instant::now();
            let resolved = resolve_doc(doc);
            let t1 = Instant::now();
            // This benchmark intentionally preserves the deterministic,
            // glyphless lab-stage baseline. Live and shot rendering use the
            // shaped `resolve_and_build_doc` path above.
            let list = anchor_engine::drawlist::build_glyphless_unchecked(doc, &resolved);
            let t2 = Instant::now();
            let canvas = surface.canvas();
            canvas.clear(skia_safe::Color::WHITE);
            anchor_engine::paint::execute_unchecked(canvas, &list, &view, &ctx);
            let t3 = Instant::now();
            let ms = |a: Instant, b: Instant| (b - a).as_secs_f64() * 1000.0;
            resolve_ms = resolve_ms.min(ms(t0, t1));
            build_ms = build_ms.min(ms(t1, t2));
            exec_ms = exec_ms.min(ms(t2, t3));
        }
        let frame = resolve_ms + build_ms + exec_ms;
        println!(
            "{label:20} {:>7} nodes  resolve {resolve_ms:8.3}  build {build_ms:8.3}  execute {exec_ms:8.3}  frame {frame:8.3} ms  {:6.1} fps",
            doc.len(),
            1000.0 / frame
        );
    };

    // Pack n nodes into the W×H surface so all are visible (worst case).
    let packed = |n: usize| -> Document {
        let cols = ((n as f32 * W as f32 / H as f32).sqrt().ceil() as usize).max(1);
        let cell = W as f32 / cols as f32;
        let mut b = DocBuilder::new();
        for i in 0..n {
            let mut h = Header::new(
                SizeIntent::Fixed((cell * 0.8).max(1.0)),
                SizeIntent::Fixed((cell * 0.8).max(1.0)),
            );
            h.x = AxisBinding::start((i % cols) as f32 * cell);
            h.y = AxisBinding::start((i / cols) as f32 * cell);
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
    };

    println!("== full-redraw cost (raster, min of 11); 120fps budget = 8.33 ms ==");
    let (starter, _) = scene::starter();
    run("starter", &starter);
    // The realistic nested workload (the live `ANCHOR_SCENE=pages` scene):
    // flex-nested cards, not a flat packed grid — a truer per-node paint mix.
    run("pages 100", &scene::pages(10, 10).0);
    run("pages 400", &scene::pages(20, 20).0);
    for n in [1_000usize, 10_000, 50_000, 100_000] {
        run(&format!("packed {n}"), &packed(n));
    }
}
