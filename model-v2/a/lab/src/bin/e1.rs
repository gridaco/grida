//! E1 — rotation-in-flow prototype driver.
//!
//! Builds the triage-#27 scene ("rotate a card inside an auto-flowing
//! list; animate the turn"), sweeps the middle card's rotation 0→360 under
//! BOTH semantics, and emits:
//!
//! - `metrics.csv` — per-frame measurements (container width, sibling
//!   position, overlap areas, per-step displacement)
//! - `frames/theta_*.svg` — side-by-side snapshots at key angles
//! - `demo.html` — interactive scrubber over the precomputed frames
//! - stdout — the measured summary that feeds `verdict.md`
//!
//! Every θ step is applied through the op layer (1 document write),
//! proving OP-ROT under flow stays a single-field gesture in both modes.

use anchor_lab::model::*;
use anchor_lab::ops;
use anchor_lab::resolve::{resolve, ResolveOptions, RotationInFlow};
use anchor_lab::svgout;
use std::fmt::Write as _;
use std::fs;
use std::path::Path;

const OUT: &str = "../e1-rotation-in-flow";
const STEP: f32 = 2.0;

struct Scene {
    doc: Document,
    frame: NodeId,
    cards: [NodeId; 3],
}

/// The E1 scene: hug row of three portrait cards (60×100), gap 10, pad 10.
/// `fixed_w`: Some → fixed-width container (no breathing possible), None →
/// hug (container reacts).
fn scene(fixed_w: Option<f32>) -> Scene {
    let mut b = DocBuilder::new();
    let mut fh = Header::new(
        match fixed_w {
            Some(w) => SizeIntent::Fixed(w),
            None => SizeIntent::Auto,
        },
        SizeIntent::Fixed(140.0),
    );
    fh.x = AxisBinding::start(20.0);
    fh.y = AxisBinding::start(20.0);
    let fp = Payload::Frame {
        layout: LayoutBehavior {
            mode: LayoutMode::Flex,
            direction: Direction::Row,
            gap_main: 10.0,
            padding: EdgeInsets::all(10.0),
            cross_align: CrossAlign::Center,
            ..Default::default()
        },
        clips_content: false,
    };
    let f = b.add(0, fh, fp);
    let mut cards = vec![];
    for (i, color) in ["#4a90d9", "#e2574c", "#57b894"].iter().enumerate() {
        let h = Header::new(SizeIntent::Fixed(60.0), SizeIntent::Fixed(100.0));
        let c = b.add(
            f,
            h,
            Payload::Shape {
                desc: ShapeDesc::Rect,
            },
        );
        b.node_mut(c).fill = Some(color.to_string());
        let _ = i;
        cards.push(c);
    }
    Scene {
        doc: b.build(),
        frame: f,
        cards: [cards[0], cards[1], cards[2]],
    }
}

#[derive(Clone, Copy)]
struct Frame {
    theta: f32,
    container_w: f32,
    card2_x: f32,
    overlap01: f32,
    overlap12: f32,
}

fn sweep(mode: RotationInFlow, fixed_w: Option<f32>) -> Vec<Frame> {
    let opts = ResolveOptions {
        viewport: (1000.0, 1000.0),
        rotation_in_flow: mode,
    };
    let mut s = scene(fixed_w);
    let mut frames = vec![];
    let mut theta = 0.0f32;
    while theta <= 360.0 {
        // the gesture: exactly one document write per step
        let writes = ops::set_rotation(&mut s.doc, s.cards[1], theta).unwrap();
        assert_eq!(writes, 1, "rotation stays a 1-field gesture in flow");
        let r = resolve(&s.doc, &opts);
        frames.push(Frame {
            theta,
            container_w: r.box_of(s.frame).w,
            card2_x: r.box_of(s.cards[2]).x,
            overlap01: r
                .aabb_of(s.cards[0])
                .intersection_area(&r.aabb_of(s.cards[1])),
            overlap12: r
                .aabb_of(s.cards[1])
                .intersection_area(&r.aabb_of(s.cards[2])),
        });
        theta += STEP;
    }
    frames
}

fn summarize(name: &str, frames: &[Frame]) -> String {
    let wmin = frames
        .iter()
        .map(|f| f.container_w)
        .fold(f32::MAX, f32::min);
    let wmax = frames.iter().map(|f| f.container_w).fold(0.0f32, f32::max);
    let peak_overlap = frames
        .iter()
        .map(|f| f.overlap01.max(f.overlap12))
        .fold(0.0f32, f32::max);
    let max_step = frames
        .windows(2)
        .map(|w| (w[1].card2_x - w[0].card2_x).abs())
        .fold(0.0f32, f32::max);
    let peak_theta = frames
        .iter()
        .max_by(|a, b| a.card2_x.total_cmp(&b.card2_x))
        .map(|f| f.theta)
        .unwrap_or(0.0);
    format!(
        "{name}: container_w ∈ [{wmin:.1}, {wmax:.1}] (breathing {:.1}px), \
         peak sibling overlap {peak_overlap:.0}px², \
         max |Δsibling_x| per {STEP}° = {max_step:.2}px, \
         sibling_x peaks at θ={peak_theta}°",
        wmax - wmin
    )
}

fn write_csv(path: &Path, aabb: &[Frame], visual: &[Frame], fixed: &[Frame]) {
    let mut out = String::from(
        "theta,aabb_container_w,aabb_card2_x,aabb_overlap,visual_container_w,visual_card2_x,visual_overlap,fixedw_aabb_card2_x,fixedw_aabb_overlap\n",
    );
    for i in 0..aabb.len() {
        let _ = writeln!(
            out,
            "{},{:.3},{:.3},{:.3},{:.3},{:.3},{:.3},{:.3},{:.3}",
            aabb[i].theta,
            aabb[i].container_w,
            aabb[i].card2_x,
            aabb[i].overlap01.max(aabb[i].overlap12),
            visual[i].container_w,
            visual[i].card2_x,
            visual[i].overlap01.max(visual[i].overlap12),
            fixed[i].card2_x,
            fixed[i].overlap01.max(fixed[i].overlap12),
        );
    }
    fs::write(path, out).unwrap();
}

fn snapshot(theta: f32) -> String {
    let mut svg = String::new();
    let _ = writeln!(
        svg,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420" font-family="monospace">"#
    );
    for (i, (mode, label)) in [
        (
            RotationInFlow::AabbParticipates,
            "anchor: AABB participates",
        ),
        (RotationInFlow::VisualOnly, "control: visual-only (CSS)"),
    ]
    .iter()
    .enumerate()
    {
        let opts = ResolveOptions {
            viewport: (640.0, 200.0),
            rotation_in_flow: *mode,
        };
        let mut s = scene(None);
        ops::set_rotation(&mut s.doc, s.cards[1], theta).unwrap();
        let r = resolve(&s.doc, &opts);
        let inner = svgout::render(
            &s.doc,
            &r,
            &svgout::SvgOptions {
                show_aabb: true,
                width: 640.0,
                height: 200.0,
            },
        );
        let y = 10 + i * 200;
        let _ = writeln!(svg, r#"<g transform="translate(0 {y})">"#);
        let _ = writeln!(
            svg,
            r##"<text x="20" y="12" font-size="11" fill="#555">{label} — θ={theta}°</text>"##
        );
        // strip outer <svg> wrapper of the inner render
        let body: String = inner
            .lines()
            .filter(|l| !l.starts_with("<svg") && !l.starts_with("</svg"))
            .collect::<Vec<_>>()
            .join("\n");
        let _ = writeln!(svg, "{body}");
        let _ = writeln!(svg, "</g>");
    }
    let _ = writeln!(svg, "</svg>");
    svg
}

fn demo_html() -> String {
    // Precompute per-frame card boxes for both modes for the scrubber.
    let mut data = String::from("[");
    for mode in [RotationInFlow::AabbParticipates, RotationInFlow::VisualOnly] {
        let opts = ResolveOptions {
            viewport: (1000.0, 1000.0),
            rotation_in_flow: mode,
        };
        let mut s = scene(None);
        data.push('[');
        let mut theta = 0.0f32;
        while theta <= 360.0 {
            ops::set_rotation(&mut s.doc, s.cards[1], theta).unwrap();
            let r = resolve(&s.doc, &opts);
            let fb = r.box_of(s.frame);
            let mut entry = format!("[[{:.2},{:.2},{:.2},{:.2}]", fb.x, fb.y, fb.w, fb.h);
            for (ci, c) in s.cards.iter().enumerate() {
                let b = r.box_of(*c);
                // box in frame space + rotation (cards are frame children)
                let rot = if ci == 1 { theta } else { 0.0 };
                let _ = write!(
                    entry,
                    ",[{:.2},{:.2},{:.2},{:.2},{:.2}]",
                    b.x, b.y, b.w, b.h, rot
                );
            }
            entry.push(']');
            data.push_str(&entry);
            if theta < 360.0 {
                data.push(',');
            }
            theta += STEP;
        }
        data.push(']');
        if mode == RotationInFlow::AabbParticipates {
            data.push(',');
        }
    }
    data.push(']');

    format!(
        r###"<!doctype html>
<meta charset="utf-8">
<title>E1 — rotation-in-flow: anchor vs visual-only</title>
<style>
  body {{ font: 13px/1.5 ui-monospace, monospace; margin: 24px; color: #222; }}
  .row {{ margin-bottom: 8px; }}
  canvas {{ border: 1px solid #ddd; display: block; margin-bottom: 16px; }}
  label {{ margin-right: 12px; }}
</style>
<h2>E1 — rotate a card inside an auto-flowing list</h2>
<p>Top: <b>anchor</b> (rotated AABB participates — siblings make room, container breathes).<br>
Bottom: <b>visual-only control</b> (CSS transform semantics — layout frozen, overlap).</p>
<div class="row">
  <label>θ = <span id="deg">0</span>°</label>
  <input id="s" type="range" min="0" max="180" value="0" style="width:420px">
  <button id="play">play</button>
</div>
<canvas id="c0" width="680" height="180"></canvas>
<canvas id="c1" width="680" height="180"></canvas>
<script>
const FRAMES = {data};
const COLORS = ["#4a90d9", "#e2574c", "#57b894"];
function draw(canvas, frame) {{
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const [f, ...cards] = frame;
  ctx.strokeStyle = "#999"; ctx.lineWidth = 1;
  ctx.strokeRect(f[0], f[1], f[2], f[3]);
  cards.forEach(([x, y, w, h, rot], i) => {{
    ctx.save();
    ctx.translate(f[0] + x + w / 2, f[1] + y + h / 2);
    ctx.rotate(rot * Math.PI / 180);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = COLORS[i];
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }});
}}
const slider = document.getElementById("s"), deg = document.getElementById("deg");
function render() {{
  const i = +slider.value;
  deg.textContent = (i * {STEP}).toFixed(0);
  draw(document.getElementById("c0"), FRAMES[0][i]);
  draw(document.getElementById("c1"), FRAMES[1][i]);
}}
slider.addEventListener("input", render);
let timer = null;
document.getElementById("play").addEventListener("click", () => {{
  if (timer) {{ clearInterval(timer); timer = null; return; }}
  timer = setInterval(() => {{
    slider.value = (+slider.value + 1) % (FRAMES[0].length);
    render();
  }}, 30);
}});
render();
</script>
"###
    )
}

fn main() {
    let out = Path::new(OUT);
    fs::create_dir_all(out.join("frames")).unwrap();

    let aabb = sweep(RotationInFlow::AabbParticipates, None);
    let visual = sweep(RotationInFlow::VisualOnly, None);
    let fixed = sweep(RotationInFlow::AabbParticipates, Some(400.0));

    println!("E1 sweep: 0..360 step {STEP}°, hug row of 60×100 cards, gap 10, pad 10");
    println!("  {}", summarize("anchor/hug   ", &aabb));
    println!("  {}", summarize("visual/hug   ", &visual));
    println!("  {}", summarize("anchor/fixedW", &fixed));

    // analytic continuity bound of the AABB envelope:
    // w'(θ) = w|cosθ|+h|sinθ| ⇒ |dw'/dθ| ≤ √(w²+h²) per radian.
    // The envelope (and thus sibling displacement) peaks at θ* = atan(h/w).
    let bound = (60.0f32 * 60.0 + 100.0 * 100.0).sqrt() * STEP.to_radians();
    let peak = (100.0f32 / 60.0).atan().to_degrees();
    println!(
        "  analytic continuity bound: {bound:.2}px per {STEP}° step; envelope peak θ* = {peak:.1}°"
    );

    write_csv(&out.join("metrics.csv"), &aabb, &visual, &fixed);
    for theta in [0.0f32, 15.0, 30.0, 45.0, 60.0, 75.0, 90.0] {
        fs::write(
            out.join("frames")
                .join(format!("theta_{:03}.svg", theta as u32)),
            snapshot(theta),
        )
        .unwrap();
    }
    fs::write(out.join("demo.html"), demo_html()).unwrap();
    println!("wrote metrics.csv, frames/*.svg, demo.html → {OUT}/");
}
