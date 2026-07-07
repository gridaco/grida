//! E5 — SVG corpus transform measurement.
//!
//! Decides triage amendment 5's open mechanism: how much real SVG content
//! actually needs the lens quarantine (skew / shear / single-axis mirror)
//! vs landing natively in the anchor header (translate / rotate / scale)?
//!
//! Method: scan every `transform="…"` / `gradientTransform="…"` /
//! `patternTransform="…"` attribute (raw text scan — robust to malformed
//! XML), compose each transform list into a 2×3 matrix, then classify by
//! decomposition M = R(θ)·[sx m; 0 sy]:
//!
//!   identity / translate           → native (bindings)
//!   + rotation, scale ≈ (1,1)      → native (header rotation)
//!   + uniform scale                → native (folds into size)
//!   + non-uniform scale (m ≈ 0)    → native (folds into w/h, then rotate)
//!   det < 0 (single-axis mirror)   → flip class (lens or a flip flag)
//!   |m| > ε (shear)                → lens required
//!
//! Usage: `cargo run --release --bin e5scan -- <dir>…`

use std::fs;
use std::path::{Path, PathBuf};

#[derive(Default, Debug, Clone, Copy)]
struct Counts {
    files: usize,
    files_no_transform: usize,
    files_need_lens: usize,
    files_flip_only: usize,
    t_total: usize,
    t_identity: usize,
    t_translate: usize,
    t_rotate: usize,
    t_scale_uniform: usize,
    t_scale_nonuniform: usize,
    t_flip: usize,
    t_shear: usize,
    t_unparsable: usize,
    t_paint: usize,
    t_paint_shear: usize,
    t_paint_unparsable: usize,
}

#[derive(Clone, Copy)]
struct M {
    a: f64,
    b: f64,
    c: f64,
    d: f64,
    e: f64,
    f: f64,
}

const ID: M = M {
    a: 1.0,
    b: 0.0,
    c: 0.0,
    d: 1.0,
    e: 0.0,
    f: 0.0,
};

impl M {
    fn mul(&self, o: &M) -> M {
        M {
            a: self.a * o.a + self.c * o.b,
            b: self.b * o.a + self.d * o.b,
            c: self.a * o.c + self.c * o.d,
            d: self.b * o.c + self.d * o.d,
            e: self.a * o.e + self.c * o.f + self.e,
            f: self.b * o.e + self.d * o.f + self.f,
        }
    }
}

fn parse_transform(s: &str) -> Option<M> {
    let mut m = ID;
    let mut rest = s.trim();
    while !rest.is_empty() {
        let open = rest.find('(')?;
        let name = rest[..open].trim().trim_start_matches(',').trim();
        let close = rest[open..].find(')')? + open;
        let args: Vec<f64> = rest[open + 1..close]
            .split(|ch: char| ch == ',' || ch.is_whitespace())
            .filter(|p| !p.is_empty())
            .map(|p| p.parse::<f64>())
            .collect::<Result<_, _>>()
            .ok()?;
        let t = match (name, args.as_slice()) {
            ("translate", [x]) => M { e: *x, ..ID },
            ("translate", [x, y]) => M { e: *x, f: *y, ..ID },
            ("scale", [s]) => M { a: *s, d: *s, ..ID },
            ("scale", [x, y]) => M { a: *x, d: *y, ..ID },
            ("rotate", [deg]) => rot(*deg),
            ("rotate", [deg, cx, cy]) => M { e: *cx, f: *cy, ..ID }
                .mul(&rot(*deg))
                .mul(&M { e: -*cx, f: -*cy, ..ID }),
            ("skewX", [deg]) => M {
                c: deg.to_radians().tan(),
                ..ID
            },
            ("skewY", [deg]) => M {
                b: deg.to_radians().tan(),
                ..ID
            },
            ("matrix", [a, b, c, d, e, f]) => M {
                a: *a,
                b: *b,
                c: *c,
                d: *d,
                e: *e,
                f: *f,
            },
            _ => return None,
        };
        m = m.mul(&t);
        rest = rest[close + 1..].trim();
    }
    Some(m)
}

fn rot(deg: f64) -> M {
    let (s, c) = deg.to_radians().sin_cos();
    M {
        a: c,
        b: s,
        c: -s,
        d: c,
        e: 0.0,
        f: 0.0,
    }
}

#[derive(PartialEq, Clone, Copy, Debug)]
enum Class {
    Identity,
    Translate,
    Rotate,
    ScaleUniform,
    ScaleNonUniform,
    Flip,
    Shear,
}

fn classify(m: &M) -> Class {
    const EPS: f64 = 1e-4;
    let det = m.a * m.d - m.b * m.c;
    if det < 0.0 {
        return Class::Flip;
    }
    let sx = (m.a * m.a + m.b * m.b).sqrt();
    if sx < EPS {
        return Class::Shear; // degenerate; be conservative
    }
    // shear term of M = R·[sx m; 0 sy]
    let shear = (m.a * m.c + m.b * m.d) / sx;
    let sy = det / sx;
    if shear.abs() > EPS * sx.max(1.0) {
        return Class::Shear;
    }
    let rotated = m.b.abs() > EPS || m.a < 0.0;
    let scaled = (sx - 1.0).abs() > EPS || (sy - 1.0).abs() > EPS;
    let translated = m.e.abs() > EPS || m.f.abs() > EPS;
    match (rotated, scaled) {
        (_, true) if (sx - sy).abs() > EPS * sx.max(sy) => Class::ScaleNonUniform,
        (_, true) => Class::ScaleUniform,
        (true, false) => Class::Rotate,
        (false, false) if translated => Class::Translate,
        (false, false) => Class::Identity,
    }
}

fn scan_file(path: &Path, c: &mut Counts) {
    let Ok(src) = fs::read_to_string(path) else {
        return;
    };
    c.files += 1;
    let mut found = 0usize;
    let mut needs_lens = false;
    let mut flip = false;
    for key in ["transform=\"", "gradientTransform=\"", "patternTransform=\""] {
        let is_paint = key != "transform=\"";
        let mut at = 0usize;
        while let Some(pos) = src[at..].find(key) {
            let start = at + pos + key.len();
            // don't match `gradientTransform="` twice via the `transform="` key
            if key == "transform=\"" && start >= key.len() + 8 {
                let prefix = &src[..at + pos];
                if prefix.ends_with("gradient") || prefix.ends_with("pattern") {
                    at = start;
                    continue;
                }
            }
            let Some(end) = src[start..].find('"') else {
                break;
            };
            let value = &src[start..start + end];
            found += 1;
            c.t_total += 1;
            if is_paint {
                c.t_paint += 1;
                match parse_transform(value) {
                    None => c.t_paint_unparsable += 1,
                    Some(m) => {
                        if classify(&m) == Class::Shear {
                            c.t_paint_shear += 1;
                        }
                    }
                }
                at = start + end;
                continue;
            }
            match parse_transform(value) {
                None => {
                    c.t_unparsable += 1;
                    needs_lens = true; // conservative
                }
                Some(m) => match classify(&m) {
                    Class::Identity => c.t_identity += 1,
                    Class::Translate => c.t_translate += 1,
                    Class::Rotate => c.t_rotate += 1,
                    Class::ScaleUniform => c.t_scale_uniform += 1,
                    Class::ScaleNonUniform => c.t_scale_nonuniform += 1,
                    Class::Flip => {
                        c.t_flip += 1;
                        flip = true;
                    }
                    Class::Shear => {
                        c.t_shear += 1;
                        needs_lens = true;
                    }
                },
            }
            at = start + end;
        }
    }
    if found == 0 {
        c.files_no_transform += 1;
    }
    if needs_lens {
        c.files_need_lens += 1;
    } else if flip {
        c.files_flip_only += 1;
    }
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
            if name == "node_modules" || name == "target" || name == ".git" {
                continue;
            }
            walk(&p, out);
        } else if p.extension().is_some_and(|x| x == "svg") {
            out.push(p);
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    println!("| corpus | files | no-tf | translate | rotate | scale= | scale≠ | flip | shear | unparsable | files needing lens |");
    println!("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    let mut grand = Counts::default();
    let mut grand_transforms = 0usize;
    for dir in &args {
        let mut files = vec![];
        walk(Path::new(dir), &mut files);
        let mut c = Counts::default();
        for f in &files {
            scan_file(f, &mut c);
        }
        println!(
            "| {} | {} | {} | {} | {} | {} | {} | {} | {} | {} | **{} ({:.2}%)** |",
            dir,
            c.files,
            c.files_no_transform,
            c.t_translate + c.t_identity,
            c.t_rotate,
            c.t_scale_uniform,
            c.t_scale_nonuniform,
            c.t_flip,
            c.t_shear,
            c.t_unparsable,
            c.files_need_lens,
            100.0 * c.files_need_lens as f64 / c.files.max(1) as f64
        );
        grand.files += c.files;
        grand.files_no_transform += c.files_no_transform;
        grand.files_need_lens += c.files_need_lens;
        grand.files_flip_only += c.files_flip_only;
        grand.t_translate += c.t_translate + c.t_identity;
        grand.t_rotate += c.t_rotate;
        grand.t_scale_uniform += c.t_scale_uniform;
        grand.t_scale_nonuniform += c.t_scale_nonuniform;
        grand.t_flip += c.t_flip;
        grand.t_shear += c.t_shear;
        grand.t_unparsable += c.t_unparsable;
        grand.t_paint += c.t_paint;
        grand.t_paint_shear += c.t_paint_shear;
        grand.t_paint_unparsable += c.t_paint_unparsable;
        grand_transforms += c.t_total;
    }
    println!();
    println!(
        "TOTAL: {} files, {} transforms | translate {} | rotate {} | scale= {} | scale≠ {} | flip {} | shear {} | unparsable {}",
        grand.files,
        grand_transforms,
        grand.t_translate,
        grand.t_rotate,
        grand.t_scale_uniform,
        grand.t_scale_nonuniform,
        grand.t_flip,
        grand.t_shear,
        grand.t_unparsable,
    );
    println!(
        "files importing 100% natively (no lens, no flip): {} / {} = {:.2}%",
        grand.files - grand.files_need_lens - grand.files_flip_only,
        grand.files,
        100.0 * (grand.files - grand.files_need_lens - grand.files_flip_only) as f64
            / grand.files.max(1) as f64
    );
    println!(
        "paint transforms (gradient/pattern — stored in the paint, NOT node geometry): {} total, {} with shear, {} unparsable",
        grand.t_paint, grand.t_paint_shear, grand.t_paint_unparsable
    );
    println!(
        "files needing ONLY flip handling: {} ({:.2}%) | files needing lens (GEOMETRY shear/unparsable): {} ({:.2}%)",
        grand.files_flip_only,
        100.0 * grand.files_flip_only as f64 / grand.files.max(1) as f64,
        grand.files_need_lens,
        100.0 * grand.files_need_lens as f64 / grand.files.max(1) as f64
    );
}
