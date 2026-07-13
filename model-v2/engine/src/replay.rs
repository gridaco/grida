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
use anchor_lab::path::{PathCommand, ResolvedPathArtifact};
use anchor_lab::resolve::{resolve, ResolveOptions, Resolved, RotationInFlow};
use anchor_lab::text_layout::TextLayout;
use anchor_lab::textir;

use crate::oracle::{OracleTags, TEXT_STUB};

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

/// Play a replay under its recorded oracle and options.
///
/// Replay v0 can reproduce only the deterministic lab text metric: it carries
/// no font manifest capable of reconstructing a Skia Paragraph environment.
/// Any other tag therefore fails closed instead of silently resolving under
/// the stub and claiming faithful replay.
pub fn play(replay: &Replay) -> Result<(Document, Vec<OpResult>), String> {
    if replay.tags.text != TEXT_STUB {
        return Err(format!(
            "unsupported replay text oracle {:?}; replay v0 supports only {:?}",
            replay.tags.text, TEXT_STUB
        ));
    }
    let mut doc = replay.doc.clone();
    let mut results = Vec::with_capacity(replay.ops.len());
    for op in &replay.ops {
        let r = resolve(&doc, &replay.opts);
        results.push(apply(&mut doc, &r, op));
    }
    Ok((doc, results))
}

/// Bit-for-bit equality of two resolved tiers across the hot columns, content
/// artifacts, and spatial traversal/clip snapshot — the determinism oracle.
/// `==` would pass -0.0/0.0 and fail NaN==NaN; bits are exact, which is what
/// "same computation" means.
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
        if !opt_text_layout_eq(a.text_layout_opt(id), b.text_layout_opt(id)) {
            return false;
        }
        if !opt_resolved_path_eq(a.resolved_path_opt(id), b.resolved_path_opt(id)) {
            return false;
        }
    }
    a.query_snapshot_bits_eq(b)
}

fn scalar_eq(a: f32, b: f32) -> bool {
    a.to_bits() == b.to_bits()
}

fn rect_eq(a: RectF, b: RectF) -> bool {
    scalar_eq(a.x, b.x) && scalar_eq(a.y, b.y) && scalar_eq(a.w, b.w) && scalar_eq(a.h, b.h)
}

fn opt_rect_eq(a: Option<RectF>, b: Option<RectF>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(a), Some(b)) => rect_eq(a, b),
        _ => false,
    }
}

fn opt_scalar_eq(a: Option<f32>, b: Option<f32>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(a), Some(b)) => scalar_eq(a, b),
        _ => false,
    }
}

fn opt_text_layout_eq(
    a: Option<&std::sync::Arc<TextLayout>>,
    b: Option<&std::sync::Arc<TextLayout>>,
) -> bool {
    let (Some(a), Some(b)) = (a, b) else {
        return a.is_none() && b.is_none();
    };
    a.oracle == b.oracle
        && a.environment == b.environment
        && opt_scalar_eq(a.width_constraint, b.width_constraint)
        && rect_eq(a.assigned_box, b.assigned_box)
        && scalar_eq(a.width, b.width)
        && scalar_eq(a.height, b.height)
        && a.lines.len() == b.lines.len()
        && a.lines.iter().zip(&b.lines).all(|(a, b)| {
            a.text == b.text
                && a.byte_range == b.byte_range
                && a.source_range == b.source_range
                && a.end == b.end
                && scalar_eq(a.left, b.left)
                && scalar_eq(a.width, b.width)
                && scalar_eq(a.top, b.top)
                && scalar_eq(a.height, b.height)
                && scalar_eq(a.baseline, b.baseline)
                && scalar_eq(a.ascent, b.ascent)
                && scalar_eq(a.descent, b.descent)
        })
        && a.glyph_runs.len() == b.glyph_runs.len()
        && a.glyph_runs.iter().zip(&b.glyph_runs).all(|(a, b)| {
            a.line_index == b.line_index
                && a.source_run == b.source_run
                && a.font == b.font
                && a.font_identity == b.font_identity
                && a.glyphs.len() == b.glyphs.len()
                && a.glyphs.iter().zip(&b.glyphs).all(|(a, b)| {
                    a.id == b.id
                        && a.cluster == b.cluster
                        && scalar_eq(a.x, b.x)
                        && scalar_eq(a.y, b.y)
                        && opt_rect_eq(a.bounds, b.bounds)
                })
        })
        && opt_rect_eq(a.logical_bounds, b.logical_bounds)
        && opt_rect_eq(a.ink_bounds, b.ink_bounds)
        && a.unresolved_glyphs == b.unresolved_glyphs
}

fn opt_resolved_path_eq(
    a: Option<&std::sync::Arc<ResolvedPathArtifact>>,
    b: Option<&std::sync::Arc<ResolvedPathArtifact>>,
) -> bool {
    let (Some(a), Some(b)) = (a, b) else {
        return a.is_none() && b.is_none();
    };
    a.fill_rule == b.fill_rule
        && a.all_contours_closed == b.all_contours_closed
        && rect_eq(a.local_bounds, b.local_bounds)
        && a.commands.len() == b.commands.len()
        && a.commands
            .iter()
            .zip(b.commands.iter())
            .all(|(a, b)| path_command_eq(*a, *b))
}

fn path_command_eq(a: PathCommand, b: PathCommand) -> bool {
    match (a, b) {
        (PathCommand::MoveTo { x: ax, y: ay }, PathCommand::MoveTo { x: bx, y: by })
        | (PathCommand::LineTo { x: ax, y: ay }, PathCommand::LineTo { x: bx, y: by }) => {
            scalar_eq(ax, bx) && scalar_eq(ay, by)
        }
        (
            PathCommand::QuadTo {
                x1: ax1,
                y1: ay1,
                x: ax,
                y: ay,
            },
            PathCommand::QuadTo {
                x1: bx1,
                y1: by1,
                x: bx,
                y: by,
            },
        ) => scalar_eq(ax1, bx1) && scalar_eq(ay1, by1) && scalar_eq(ax, bx) && scalar_eq(ay, by),
        (
            PathCommand::CubicTo {
                x1: ax1,
                y1: ay1,
                x2: ax2,
                y2: ay2,
                x: ax,
                y: ay,
            },
            PathCommand::CubicTo {
                x1: bx1,
                y1: by1,
                x2: bx2,
                y2: by2,
                x: bx,
                y: by,
            },
        ) => {
            scalar_eq(ax1, bx1)
                && scalar_eq(ay1, by1)
                && scalar_eq(ax2, bx2)
                && scalar_eq(ay2, by2)
                && scalar_eq(ax, bx)
                && scalar_eq(ay, by)
        }
        (
            PathCommand::ConicTo {
                x1: ax1,
                y1: ay1,
                x: ax,
                y: ay,
                weight: aw,
            },
            PathCommand::ConicTo {
                x1: bx1,
                y1: by1,
                x: bx,
                y: by,
                weight: bw,
            },
        ) => {
            scalar_eq(ax1, bx1)
                && scalar_eq(ay1, by1)
                && scalar_eq(ax, bx)
                && scalar_eq(ay, by)
                && scalar_eq(aw, bw)
        }
        (PathCommand::Close, PathCommand::Close) => true,
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
