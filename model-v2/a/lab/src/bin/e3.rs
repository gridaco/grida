//! E3 — text-IR ground truth + prediction scoring.
//!
//! `cargo run --bin e3 -- truth`          → prints the truth lines
//! `cargo run --bin e3 -- score <file>`   → scores a prediction file
//!
//! Line format (both truth and predictions):
//!   `p1,a,box,10,20,120,80`      — box in parent space (pre-rotation)
//!   `p4,tile,aabb,53.0,54.0,133.9,112.0` — world AABB (rotated nodes only)
//!
//! Tolerance: |Δ| ≤ 0.5 px per component.

use anchor_lab::model::{Document, NodeId, Payload};
use anchor_lab::resolve::{resolve, Resolved, ResolveOptions, RotationInFlow};
use anchor_lab::textir;
use std::collections::BTreeMap;
use std::fs;

const PROBES: &[&str] = &["p1", "p2", "p3", "p4", "p5", "p6"];
const DIR: &str = "../e3-text-ir/probes";
const TOL: f32 = 0.5;

fn truth_lines() -> Vec<String> {
    let opts = ResolveOptions {
        viewport: (1000.0, 1000.0),
        rotation_in_flow: RotationInFlow::AabbParticipates,
    };
    let mut lines = vec![];
    for probe in PROBES {
        let src = fs::read_to_string(format!("{DIR}/{probe}.xml")).unwrap();
        let doc = textir::parse(&src).unwrap();
        let r = resolve(&doc, &opts);
        collect(&doc, &r, doc.root, probe, &mut lines);
    }
    lines
}

fn collect(doc: &Document, r: &Resolved, id: NodeId, probe: &str, out: &mut Vec<String>) {
    let node = doc.get(id);
    if let Some(name) = &node.header.name {
        if name != "root" {
            let b = r.box_of(id);
            out.push(format!(
                "{probe},{name},box,{:.3},{:.3},{:.3},{:.3}",
                b.x, b.y, b.w, b.h
            ));
            if node.header.rotation != 0.0 && !matches!(node.payload, Payload::Group) {
                let a = r.aabb_of(id);
                out.push(format!(
                    "{probe},{name},aabb,{:.3},{:.3},{:.3},{:.3}",
                    a.x, a.y, a.w, a.h
                ));
            }
        }
    }
    for c in &node.children {
        collect(doc, r, *c, probe, out);
    }
}

fn parse_line(line: &str) -> Option<(String, [f32; 4])> {
    let parts: Vec<&str> = line.trim().split(',').map(|p| p.trim()).collect();
    if parts.len() != 7 {
        return None;
    }
    let key = format!("{},{},{}", parts[0], parts[1], parts[2]);
    let mut nums = [0.0f32; 4];
    for (i, p) in parts[3..].iter().enumerate() {
        nums[i] = p.parse().ok()?;
    }
    Some((key, nums))
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(|s| s.as_str()) {
        Some("truth") => {
            for l in truth_lines() {
                println!("{l}");
            }
        }
        Some("score") => {
            let truth: BTreeMap<String, [f32; 4]> =
                truth_lines().iter().filter_map(|l| parse_line(l)).collect();
            let pred_src = fs::read_to_string(&args[2]).unwrap();
            let preds: BTreeMap<String, [f32; 4]> = pred_src
                .lines()
                .filter(|l| !l.trim().is_empty() && !l.trim().starts_with('#'))
                .filter_map(parse_line)
                .collect();

            let mut ok = 0;
            let mut miss = 0;
            let mut wrong: Vec<String> = vec![];
            for (key, t) in &truth {
                match preds.get(key) {
                    None => {
                        miss += 1;
                        wrong.push(format!("MISSING {key} (truth {t:?})"));
                    }
                    Some(p) => {
                        let hit = t.iter().zip(p.iter()).all(|(a, b)| (a - b).abs() <= TOL);
                        if hit {
                            ok += 1;
                        } else {
                            wrong.push(format!("WRONG   {key}: pred {p:?} vs truth {t:?}"));
                        }
                    }
                }
            }
            let total = truth.len();
            println!("score: {ok}/{total} lines correct (tolerance {TOL}px); {miss} missing");
            for w in &wrong {
                println!("  {w}");
            }
        }
        _ => eprintln!("usage: e3 truth | e3 score <prediction-file>"),
    }
}
