//! E4 — resolver spike: throughput + scaling of the four-phase resolution
//! on realistic scene shapes. Run with `cargo run --release --bin e4`.

use anchor_lab::model::*;
use anchor_lab::resolve::{resolve, ResolveOptions};
use std::time::Instant;

/// (a) flat canvas: N free shapes under the root (typical canvas board).
fn scene_flat(n: usize) -> Document {
    let mut b = DocBuilder::new();
    for i in 0..n {
        let (mut h, p) = shape_hp(60.0, 40.0);
        h.x = AxisBinding::start((i % 100) as f32 * 70.0);
        h.y = AxisBinding::start((i / 100) as f32 * 50.0);
        if i % 7 == 0 {
            h.rotation = (i % 360) as f32;
        }
        b.add(0, h, p);
    }
    b.build()
}

/// (b) flex-heavy: rows of flex cards, each card a flex column of
/// rect + two texts (a list UI). ~7 nodes per card.
fn scene_flex(cards: usize) -> Document {
    let mut b = DocBuilder::new();
    let per_row = 20;
    let rows = cards.div_ceil(per_row);
    for r in 0..rows {
        let mut rh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
        rh.x = AxisBinding::start(0.0);
        rh.y = AxisBinding::start(r as f32 * 130.0);
        let row = b.add(
            0,
            rh,
            Payload::Frame {
                layout: LayoutBehavior {
                    mode: LayoutMode::Flex,
                    direction: Direction::Row,
                    gap_main: 8.0,
                    padding: EdgeInsets::all(8.0),
                    ..Default::default()
                },
                clips_content: false,
            },
        );
        for c in 0..per_row.min(cards - r * per_row) {
            let card = b.add(
                row,
                Header::new(SizeIntent::Fixed(120.0), SizeIntent::Auto),
                Payload::Frame {
                    layout: LayoutBehavior {
                        mode: LayoutMode::Flex,
                        direction: Direction::Column,
                        gap_main: 4.0,
                        padding: EdgeInsets::all(6.0),
                        cross_align: CrossAlign::Stretch,
                        ..Default::default()
                    },
                    clips_content: false,
                },
            );
            let (hh, hp) = shape_hp(100.0, 60.0);
            b.add(card, hh, hp);
            b.add(
                card,
                Header::new(SizeIntent::Auto, SizeIntent::Auto),
                Payload::Text {
                    content: format!("Card number {c} title"),
                    font_size: 14.0,
                },
            );
            b.add(
                card,
                Header::new(SizeIntent::Auto, SizeIntent::Auto),
                Payload::Text {
                    content: "Some longer descriptive body text that wraps a few times".into(),
                    font_size: 11.0,
                },
            );
        }
    }
    b.build()
}

/// (c) mixed: groups of rotated shapes interleaved with flex frames.
fn scene_mixed(n: usize) -> Document {
    let mut b = DocBuilder::new();
    let mut count = 0;
    let mut i = 0;
    while count < n {
        if i % 3 == 0 {
            let mut gh = Header::new(SizeIntent::Auto, SizeIntent::Auto);
            gh.x = AxisBinding::start((i % 50) as f32 * 90.0);
            gh.y = AxisBinding::start((i / 50) as f32 * 90.0);
            gh.rotation = (i % 45) as f32;
            let g = b.add(0, gh, Payload::Group);
            for k in 0..4 {
                let (mut h, p) = shape_hp(30.0, 30.0);
                h.x = AxisBinding::start(k as f32 * 35.0);
                h.rotation = (k * 15) as f32;
                b.add(g, h, p);
            }
            count += 5;
        } else {
            let mut fh = Header::new(SizeIntent::Fixed(200.0), SizeIntent::Fixed(80.0));
            fh.x = AxisBinding::start((i % 50) as f32 * 90.0);
            fh.y = AxisBinding::start((i / 50) as f32 * 90.0);
            let f = b.add(
                0,
                fh,
                Payload::Frame {
                    layout: LayoutBehavior {
                        mode: LayoutMode::Flex,
                        gap_main: 5.0,
                        padding: EdgeInsets::all(5.0),
                        ..Default::default()
                    },
                    clips_content: false,
                },
            );
            for k in 0..3 {
                let (mut h, p) = shape_hp(40.0, 40.0);
                if k == 1 {
                    h.rotation = 30.0; // rotated-in-flow on the hot path
                }
                b.add(f, h, p);
            }
            count += 4;
        }
        i += 1;
    }
    b.build()
}

fn shape_hp(w: f32, h: f32) -> (Header, Payload) {
    (
        Header::new(SizeIntent::Fixed(w), SizeIntent::Fixed(h)),
        Payload::Shape {
            desc: ShapeDesc::Rect,
        },
    )
}

fn bench(name: &str, doc: &Document) {
    // Pinned to the E1 arm: E4's recorded history (REPORT, SPIKE tables)
    // was measured under AabbParticipates; keep the series comparable.
    // The default arm (VisualOnly, DEC-0) is strictly cheaper — no
    // envelope math in sizing.
    let opts = ResolveOptions {
        rotation_in_flow: anchor_lab::resolve::RotationInFlow::AabbParticipates,
        ..ResolveOptions::default()
    };
    let n = doc.len();
    // warmup + median of 9
    let mut times = vec![];
    for _ in 0..11 {
        let t = Instant::now();
        let r = resolve(doc, &opts);
        let dt = t.elapsed();
        assert!(r.resolved_count() > n / 2);
        times.push(dt.as_secs_f64() * 1000.0);
    }
    times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let med = times[times.len() / 2];
    println!(
        "{name:<28} {n:>6} nodes   {med:>8.3} ms   {:>8.1} nodes/ms",
        n as f64 / med
    );
}

fn main() {
    println!("E4 resolver spike — full-resolve wall time (median of 11, release)");
    for scale in [1_000, 10_000] {
        bench(&format!("flat canvas ({scale})"), &scene_flat(scale));
        bench(&format!("flex cards (~{scale})"), &scene_flex(scale / 7));
        bench(
            &format!("mixed groups+flex (~{scale})"),
            &scene_mixed(scale),
        );
    }
    // locality proxy: cost of re-resolving one card subtree (what an
    // incremental engine pays for a leaf edit under clean parents)
    let one_card = scene_flex(1);
    bench("single card (locality bound)", &one_card);
}
