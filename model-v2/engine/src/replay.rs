//! ENG-5.2 / ENG-5.3 · one corpus, four consumers. A `.replay` file is
//! `(initial document, op log)` — canonical IR text for the document plus
//! JSONL ops — and it is simultaneously the bug repro, the perf-bench
//! input, the fuzz seed, and the conformance fixture. Playing it back
//! yields a bit-identical document AND resolved tier (stands on order-
//! determinism, ENG-0.3, and versioned oracles, ENG-4.3).
//!
//! Id constraint (enforced by the recorder, not by convention): record
//! start normalizes `doc = parse(&print(&doc))`, so node ids are the
//! parse-assigned ones the round-trip law already pins; ids minted mid-log
//! are deterministic (append-only arena). Cross-session replay stays
//! walled until format-level stable ids land (ENG-5.4, a.md §12).
//!
//! Lands in step 10 (needs the lab `serde` feature + `anchor_lab::ops::Op`).

use anchor_lab::math::{Affine, RectF};
use anchor_lab::model::Document;
use anchor_lab::ops::{apply, Op, OpResult};
use anchor_lab::resolve::{resolve, ResolveOptions, Resolved, RotationInFlow};
use anchor_lab::textir;

use crate::oracle::OracleTags;

const MAGIC: &str = "#anchor-replay v0";
const IR_MARK: &str = "--- ir ---";
const OPS_MARK: &str = "--- ops ---";

/// A loaded replay: the oracle tags and resolve options it was recorded
/// under (so it replays faithfully with no external context), the initial
/// (canonical) document, and the op log.
#[derive(Debug, Clone)]
pub struct Replay {
    pub tags: OracleTags,
    pub opts: ResolveOptions,
    pub doc: Document,
    pub ops: Vec<Op>,
}

fn arm_word(a: RotationInFlow) -> &'static str {
    match a {
        RotationInFlow::VisualOnly => "visual",
        RotationInFlow::AabbParticipates => "aabb",
    }
}

fn parse_arm(w: &str) -> RotationInFlow {
    match w {
        "aabb" => RotationInFlow::AabbParticipates,
        _ => RotationInFlow::VisualOnly,
    }
}

/// Serialize `(initial, ops)` to the `.replay` text: header + canonical IR +
/// JSONL ops. The document is NORMALIZED (`parse(print(doc))`) so node ids are
/// the parse-assigned ones the round-trip law pins — callers must record ops
/// against that normalized doc (its named nodes keep their ids).
pub fn write_string(
    initial: &Document,
    ops: &[Op],
    tags: &OracleTags,
    opts: &ResolveOptions,
) -> String {
    let doc = textir::parse(&textir::print(initial)).expect("canonical IR round-trips");
    let ir = textir::print(&doc);
    let mut s = String::new();
    s.push_str(MAGIC);
    s.push('\n');
    s.push_str("oracle ");
    s.push_str(&tags.text);
    s.push('\n');
    s.push_str(&format!(
        "viewport {} {}\n",
        opts.viewport.0, opts.viewport.1
    ));
    s.push_str(&format!("arm {}\n", arm_word(opts.rotation_in_flow)));
    s.push_str(IR_MARK);
    s.push('\n');
    s.push_str(&ir);
    if !ir.ends_with('\n') {
        s.push('\n');
    }
    s.push_str(OPS_MARK);
    s.push('\n');
    for op in ops {
        s.push_str(&serde_json::to_string(op).expect("op serializes"));
        s.push('\n');
    }
    s
}

/// Parse `.replay` text back into a [`Replay`].
pub fn parse_string(text: &str) -> Result<Replay, String> {
    let mut lines = text.lines();
    let magic = lines.next().unwrap_or("");
    if magic != MAGIC {
        return Err(format!("bad magic: {magic:?} (want {MAGIC:?})"));
    }

    enum Sec {
        Header,
        Ir,
        Ops,
    }
    let mut sec = Sec::Header;
    let mut oracle_text = OracleTags::default().text;
    let mut viewport = (0.0f32, 0.0f32);
    let mut arm = RotationInFlow::VisualOnly;
    let mut ir_lines: Vec<&str> = Vec::new();
    let mut op_lines: Vec<&str> = Vec::new();

    for line in lines {
        if line == IR_MARK {
            sec = Sec::Ir;
        } else if line == OPS_MARK {
            sec = Sec::Ops;
        } else {
            match sec {
                Sec::Header => {
                    if let Some(rest) = line.strip_prefix("oracle ") {
                        oracle_text = rest.to_string();
                    } else if let Some(rest) = line.strip_prefix("viewport ") {
                        let mut it = rest.split_whitespace();
                        let w = it.next().and_then(|s| s.parse().ok()).unwrap_or(0.0);
                        let h = it.next().and_then(|s| s.parse().ok()).unwrap_or(0.0);
                        viewport = (w, h);
                    } else if let Some(rest) = line.strip_prefix("arm ") {
                        arm = parse_arm(rest.trim());
                    }
                }
                Sec::Ir => ir_lines.push(line),
                Sec::Ops => {
                    if !line.trim().is_empty() {
                        op_lines.push(line);
                    }
                }
            }
        }
    }

    let ir = ir_lines.join("\n");
    let doc = textir::parse(&ir).map_err(|e| format!("ir parse: {}", e.0))?;
    let mut ops = Vec::with_capacity(op_lines.len());
    for (i, l) in op_lines.iter().enumerate() {
        ops.push(serde_json::from_str::<Op>(l).map_err(|e| format!("op {i}: {e}"))?);
    }
    Ok(Replay {
        tags: OracleTags { text: oracle_text },
        opts: ResolveOptions {
            viewport,
            rotation_in_flow: arm,
        },
        doc,
        ops,
    })
}

/// Play a replay: apply each op with a FRESH resolve under the replay's own
/// options (mirrors the editor loop), returning the final document and the
/// result sequence. Deterministic by ENG-0.3 — playing twice is bit-identical.
pub fn play(replay: &Replay) -> (Document, Vec<OpResult>) {
    let mut doc = replay.doc.clone();
    let mut results = Vec::with_capacity(replay.ops.len());
    for op in &replay.ops {
        let r = resolve(&doc, &replay.opts);
        results.push(apply(&mut doc, &r, op));
    }
    (doc, results)
}

/// Bit-for-bit equality of two resolved tiers across all four columns — the
/// determinism oracle. `==` would pass -0.0/0.0 and fail NaN==NaN; bits are
/// exact, which is what "same computation" means.
pub fn resolved_bits_eq(a: &Resolved, b: &Resolved) -> bool {
    if a.slot_count() != b.slot_count() {
        return false;
    }
    for id in 0..a.slot_count() as u32 {
        if !opt_rect_eq(a.box_opt(id), b.box_opt(id)) {
            return false;
        }
        if !opt_aff_eq(a.local_opt(id), b.local_opt(id)) {
            return false;
        }
        if !opt_aff_eq(a.world_opt(id), b.world_opt(id)) {
            return false;
        }
        if !opt_rect_eq(a.aabb_opt(id), b.aabb_opt(id)) {
            return false;
        }
    }
    true
}

fn opt_rect_eq(a: Option<RectF>, b: Option<RectF>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(a), Some(b)) => {
            a.x.to_bits() == b.x.to_bits()
                && a.y.to_bits() == b.y.to_bits()
                && a.w.to_bits() == b.w.to_bits()
                && a.h.to_bits() == b.h.to_bits()
        }
        _ => false,
    }
}

fn opt_aff_eq(a: Option<Affine>, b: Option<Affine>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(a), Some(b)) => {
            a.a.to_bits() == b.a.to_bits()
                && a.b.to_bits() == b.b.to_bits()
                && a.c.to_bits() == b.c.to_bits()
                && a.d.to_bits() == b.d.to_bits()
                && a.e.to_bits() == b.e.to_bits()
                && a.f.to_bits() == b.f.to_bits()
        }
        _ => false,
    }
}
