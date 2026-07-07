//! E10 — the feel spike. `cargo run --release` opens the window;
//! `--shot out.png [state]` renders headless to PNG (self-verification);
//! `--bench` prints resolve+paint timings.
//!
//! The loop is the thesis: `document -> resolve (full) -> paint`,
//! immediate, no caches — the lab resolver is fast enough that the
//! editor holds no derived state at all (see TEXTBOOK.md).

mod camera;
mod interaction;
mod paint;
mod scene;
mod shell;

use anchor_lab::model::Document;
use anchor_lab::resolve::{resolve, Resolved, ResolveOptions};
use camera::Camera;
use paint::Painter;

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

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if let Some(i) = args.iter().position(|a| a == "--shot") {
        let path = args.get(i + 1).cloned().unwrap_or("spike.png".into());
        let state = args.get(i + 2).cloned().unwrap_or_default();
        shot(&path, &state);
        return;
    }
    if args.iter().any(|a| a == "--bench") {
        bench();
        return;
    }
    shell::run();
}

/// Headless render: paint the starter scene (after an optional scripted
/// state) into a raster surface and encode PNG — no window, no GL.
fn shot(path: &str, state: &str) {
    let (mut doc, artboard) = scene::starter();
    let mut selection: Option<anchor_lab::model::NodeId> = None;

    match state {
        "crosszero" => {
            // Drag card.a's right edge THROUGH the left edge: |extent| +
            // flip toggle + re-pin (E-A14). Scripted exactly as the
            // gesture would issue it.
            let id = find(&doc, "card.a");
            let r = resolve_doc(&doc);
            let drag = anchor_lab::ops::ResizeDrag::begin(
                &doc,
                &r,
                id,
                anchor_lab::ops::Axis::X,
                anchor_lab::model::AnchorEdge::End,
            )
            .unwrap();
            let b = r.box_of(id);
            let target = b.x + b.w + 50.0; // 50px past the FIXED right edge
            let r = resolve_doc(&doc);
            anchor_lab::ops::resize_drag(&mut doc, &r, id, &drag, target).unwrap();
            selection = Some(id);
        }
        "ungroup" => {
            let id = find(&doc, "chips");
            let r = resolve_doc(&doc);
            anchor_lab::ops::ungroup(&mut doc, &r, id).unwrap();
        }
        "rot45" => {
            let id = find(&doc, "card.rot");
            anchor_lab::ops::set_rotation(&mut doc, id, 45.0).unwrap();
            selection = Some(id);
        }
        _ => {
            selection = Some(find(&doc, "card.rot"));
        }
    }

    let (w, h) = (1360, 900);
    let mut surface =
        skia_safe::surfaces::raster_n32_premul((w, h)).expect("raster surface");
    let resolved = resolve_doc(&doc);
    let mut cam = Camera::new();
    let ab = resolved.aabb_of(artboard);
    cam.fit((ab.x, ab.y, ab.w, ab.h), (w as f32, h as f32), 48.0);

    let canvas = surface.canvas();
    canvas.clear(skia_safe::Color::from_argb(255, 0xF7, 0xF8, 0xF9));
    let painter = Painter::new();
    painter.paint_scene(canvas, &doc, &resolved, &cam);
    shell::hud::paint_hud(canvas, &doc, &resolved, &cam, selection, None, &painter);

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

/// Resolve + paint wall time on raster, starter scene and synthetic
/// flat canvases — the seam numbers phase 4 wants (native, no boundary).
fn bench() {
    use anchor_lab::model::*;
    use std::time::Instant;

    let mut surface = skia_safe::surfaces::raster_n32_premul((1360, 900)).unwrap();
    let painter = Painter::new();
    let cam = Camera::new();

    let mut run = |label: &str, doc: &Document| {
        let mut resolve_ms = f64::MAX;
        let mut paint_ms = f64::MAX;
        for _ in 0..11 {
            let t0 = Instant::now();
            let resolved = resolve_doc(doc);
            let t1 = Instant::now();
            let canvas = surface.canvas();
            canvas.clear(skia_safe::Color::WHITE);
            painter.paint_scene(canvas, doc, &resolved, &cam);
            let t2 = Instant::now();
            resolve_ms = resolve_ms.min((t1 - t0).as_secs_f64() * 1000.0);
            paint_ms = paint_ms.min((t2 - t1).as_secs_f64() * 1000.0);
        }
        println!(
            "{label:26} {:5} nodes   resolve {resolve_ms:7.3} ms   paint {paint_ms:7.3} ms   frame {:7.3} ms",
            doc.len(),
            resolve_ms + paint_ms
        );
    };

    let (starter, _) = scene::starter();
    run("starter scene", &starter);

    for n in [100usize, 1000, 10000] {
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
        let doc = b.build();
        run(&format!("flat canvas ({n})"), &doc);
    }
}
