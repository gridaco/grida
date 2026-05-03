//! SVG `path` `d=` attribute → `skia_safe::Path`.
//!
//! The grammar is the SVG 2 `data` production: a stream of single-letter
//! commands (M/L/H/V/C/S/Q/T/A/Z and lowercase relative variants) each
//! followed by a fixed-arity numeric argument list, with the convention
//! that "implicit" repeats (additional argument groups after a command
//! letter) inherit that command — except that `M` / `m` after the first
//! point becomes `L` / `l`. Numbers can be separated by whitespace,
//! commas, or sign characters (e.g. `10-20` is two numbers).
//!
//! Skia accepts cubics directly, so we keep cubic-Béziers as cubics, but
//! convert quadratic-to-cubic (Skia has `quad_to`, but we use
//! cubic-to via PathBuilder for consistency) and arc-to-cubic as Skia's
//! `PathBuilder::arc_to` API has rotation+sweep semantics matching SVG.
//!
//! Blink anchor: `core/svg/svg_path_string_source.cc` +
//! `core/svg/svg_path_blender.cc`.

use skia_safe::{Path, PathBuilder, PathDirection, Point};

/// Parse `d=` and produce a closed `Path`. Permissive: returns whatever
/// drawn so far on parse error (Blink behaviour — partial paths render).
pub fn parse_path(d: &str) -> Path {
    let mut p = Parser::new(d);
    let mut b = PathBuilder::new();
    let mut current = Point::new(0.0, 0.0);
    let mut subpath_start = Point::new(0.0, 0.0);
    // Last cubic / quadratic control point in absolute coords (for S/T
    // smooth-continuation). `None` means "no previous cubic/quadratic
    // command", so the smooth variants reflect about `current`.
    let mut last_cubic_ctrl: Option<Point> = None;
    let mut last_quad_ctrl: Option<Point> = None;

    let mut prev_cmd: u8 = 0;
    let mut first = true;
    while let Some(c) = p.next_command() {
        let cmd = c;
        // SVG 2 §9.3.3: a path data string MUST start with a `MoveTo`
        // command. If it doesn't, the entire path is invalid and
        // produces no output. (Blink does the same — see
        // `SVGPathStringSource::ParseSegment`.)
        if first {
            if cmd != b'M' && cmd != b'm' {
                return Path::new();
            }
            first = false;
        }
        loop {
            match cmd {
                b'M' | b'm' => {
                    let Some((x, y)) = p.read_coord_pair() else {
                        break;
                    };
                    let pt = if cmd == b'm' && prev_cmd != 0 {
                        Point::new(current.x + x, current.y + y)
                    } else {
                        Point::new(x, y)
                    };
                    b.move_to(pt);
                    current = pt;
                    subpath_start = pt;
                    last_cubic_ctrl = None;
                    last_quad_ctrl = None;
                    // After an `M` / `m`, implicit repeats are `L` / `l`.
                    while p.peek_argument() {
                        let Some((nx, ny)) = p.read_coord_pair() else {
                            break;
                        };
                        let pt = if cmd == b'm' {
                            Point::new(current.x + nx, current.y + ny)
                        } else {
                            Point::new(nx, ny)
                        };
                        b.line_to(pt);
                        current = pt;
                    }
                }
                b'L' | b'l' => {
                    let Some((x, y)) = p.read_coord_pair() else {
                        break;
                    };
                    let pt = if cmd == b'l' {
                        Point::new(current.x + x, current.y + y)
                    } else {
                        Point::new(x, y)
                    };
                    b.line_to(pt);
                    current = pt;
                    last_cubic_ctrl = None;
                    last_quad_ctrl = None;
                }
                b'H' | b'h' => {
                    let Some(x) = p.read_number() else {
                        break;
                    };
                    let pt = if cmd == b'h' {
                        Point::new(current.x + x, current.y)
                    } else {
                        Point::new(x, current.y)
                    };
                    b.line_to(pt);
                    current = pt;
                    last_cubic_ctrl = None;
                    last_quad_ctrl = None;
                }
                b'V' | b'v' => {
                    let Some(y) = p.read_number() else {
                        break;
                    };
                    let pt = if cmd == b'v' {
                        Point::new(current.x, current.y + y)
                    } else {
                        Point::new(current.x, y)
                    };
                    b.line_to(pt);
                    current = pt;
                    last_cubic_ctrl = None;
                    last_quad_ctrl = None;
                }
                b'C' | b'c' => {
                    let Some(c1) = p.read_coord_pair() else {
                        break;
                    };
                    let Some(c2) = p.read_coord_pair() else {
                        break;
                    };
                    let Some(end) = p.read_coord_pair() else {
                        break;
                    };
                    let (c1, c2, end) = if cmd == b'c' {
                        (
                            Point::new(current.x + c1.0, current.y + c1.1),
                            Point::new(current.x + c2.0, current.y + c2.1),
                            Point::new(current.x + end.0, current.y + end.1),
                        )
                    } else {
                        (
                            Point::new(c1.0, c1.1),
                            Point::new(c2.0, c2.1),
                            Point::new(end.0, end.1),
                        )
                    };
                    b.cubic_to(c1, c2, end);
                    last_cubic_ctrl = Some(c2);
                    last_quad_ctrl = None;
                    current = end;
                }
                b'S' | b's' => {
                    let Some(c2) = p.read_coord_pair() else {
                        break;
                    };
                    let Some(end) = p.read_coord_pair() else {
                        break;
                    };
                    let (c2, end) = if cmd == b's' {
                        (
                            Point::new(current.x + c2.0, current.y + c2.1),
                            Point::new(current.x + end.0, current.y + end.1),
                        )
                    } else {
                        (Point::new(c2.0, c2.1), Point::new(end.0, end.1))
                    };
                    let c1 = match last_cubic_ctrl {
                        Some(prev) => {
                            Point::new(2.0 * current.x - prev.x, 2.0 * current.y - prev.y)
                        }
                        None => current,
                    };
                    b.cubic_to(c1, c2, end);
                    last_cubic_ctrl = Some(c2);
                    last_quad_ctrl = None;
                    current = end;
                }
                b'Q' | b'q' => {
                    let Some(c1) = p.read_coord_pair() else {
                        break;
                    };
                    let Some(end) = p.read_coord_pair() else {
                        break;
                    };
                    let (c1, end) = if cmd == b'q' {
                        (
                            Point::new(current.x + c1.0, current.y + c1.1),
                            Point::new(current.x + end.0, current.y + end.1),
                        )
                    } else {
                        (Point::new(c1.0, c1.1), Point::new(end.0, end.1))
                    };
                    b.quad_to(c1, end);
                    last_quad_ctrl = Some(c1);
                    last_cubic_ctrl = None;
                    current = end;
                }
                b'T' | b't' => {
                    let Some(end) = p.read_coord_pair() else {
                        break;
                    };
                    let end = if cmd == b't' {
                        Point::new(current.x + end.0, current.y + end.1)
                    } else {
                        Point::new(end.0, end.1)
                    };
                    let c1 = match last_quad_ctrl {
                        Some(prev) => {
                            Point::new(2.0 * current.x - prev.x, 2.0 * current.y - prev.y)
                        }
                        None => current,
                    };
                    b.quad_to(c1, end);
                    last_quad_ctrl = Some(c1);
                    last_cubic_ctrl = None;
                    current = end;
                }
                b'A' | b'a' => {
                    let Some(rx) = p.read_number() else {
                        break;
                    };
                    let Some(ry) = p.read_number() else {
                        break;
                    };
                    let Some(angle_deg) = p.read_number() else {
                        break;
                    };
                    let Some(large) = p.read_flag() else {
                        break;
                    };
                    let Some(sweep) = p.read_flag() else {
                        break;
                    };
                    let Some((ex, ey)) = p.read_coord_pair() else {
                        break;
                    };
                    let end = if cmd == b'a' {
                        Point::new(current.x + ex, current.y + ey)
                    } else {
                        Point::new(ex, ey)
                    };
                    arc_to_cubics(&mut b, current, rx, ry, angle_deg, large, sweep, end);
                    current = end;
                    last_cubic_ctrl = None;
                    last_quad_ctrl = None;
                }
                b'Z' | b'z' => {
                    b.close();
                    current = subpath_start;
                    last_cubic_ctrl = None;
                    last_quad_ctrl = None;
                    break;
                }
                _ => break,
            }
            // Implicit repeat: another argument list follows the same
            // command without an intervening command letter.
            if !p.peek_argument() {
                break;
            }
        }
        prev_cmd = cmd;
    }
    b.detach()
}

// ─── arc → cubic decomposition (SVG implementation notes appendix B.2) ──

#[allow(clippy::too_many_arguments)]
fn arc_to_cubics(
    b: &mut PathBuilder,
    start: Point,
    rx_in: f32,
    ry_in: f32,
    angle_deg: f32,
    large: bool,
    sweep: bool,
    end: Point,
) {
    if start == end {
        return;
    }
    let mut rx = rx_in.abs();
    let mut ry = ry_in.abs();
    if rx == 0.0 || ry == 0.0 {
        b.line_to(end);
        return;
    }
    let phi = angle_deg.to_radians();
    let cos_phi = phi.cos();
    let sin_phi = phi.sin();

    // Step 1 — compute (x1', y1').
    let dx = (start.x - end.x) / 2.0;
    let dy = (start.y - end.y) / 2.0;
    let x1p = cos_phi * dx + sin_phi * dy;
    let y1p = -sin_phi * dx + cos_phi * dy;

    // Step 2 — radii correction.
    let mut rx2 = rx * rx;
    let mut ry2 = ry * ry;
    let x1p2 = x1p * x1p;
    let y1p2 = y1p * y1p;
    let radii_check = x1p2 / rx2 + y1p2 / ry2;
    if radii_check > 1.0 {
        let scale = radii_check.sqrt();
        rx *= scale;
        ry *= scale;
        rx2 = rx * rx;
        ry2 = ry * ry;
    }

    // Step 3 — compute (cx', cy').
    let sign = if large == sweep { -1.0_f32 } else { 1.0_f32 };
    let denom = rx2 * y1p2 + ry2 * x1p2;
    let factor_sq = ((rx2 * ry2 - denom) / denom).max(0.0);
    let factor = sign * factor_sq.sqrt();
    let cxp = factor * (rx * y1p) / ry;
    let cyp = factor * (-(ry * x1p) / rx);

    // Step 4 — compute (cx, cy).
    let cx = cos_phi * cxp - sin_phi * cyp + (start.x + end.x) / 2.0;
    let cy = sin_phi * cxp + cos_phi * cyp + (start.y + end.y) / 2.0;

    // Step 5 — angles.
    let theta1 = vec_angle(1.0, 0.0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let mut delta = vec_angle(
        (x1p - cxp) / rx,
        (y1p - cyp) / ry,
        (-x1p - cxp) / rx,
        (-y1p - cyp) / ry,
    );
    if !sweep && delta > 0.0 {
        delta -= std::f32::consts::TAU;
    } else if sweep && delta < 0.0 {
        delta += std::f32::consts::TAU;
    }

    // Approximate the arc with cubic Béziers, ≤ ~90° per segment.
    let segments = (delta.abs() / (std::f32::consts::PI / 2.0)).ceil() as i32;
    let segments = segments.max(1);
    let dtheta = delta / segments as f32;
    let alpha = (dtheta / 2.0).sin() * (((4.0 + (dtheta / 2.0).cos() * 4.0) / 3.0).sqrt() - 1.0)
        / (dtheta / 2.0).cos();
    let mut t = theta1;
    for _ in 0..segments {
        let t1 = t;
        let t2 = t + dtheta;
        let p1 = arc_point(cx, cy, rx, ry, cos_phi, sin_phi, t1);
        let p2 = arc_point(cx, cy, rx, ry, cos_phi, sin_phi, t2);
        let d1 = arc_derivative(rx, ry, cos_phi, sin_phi, t1);
        let d2 = arc_derivative(rx, ry, cos_phi, sin_phi, t2);
        let c1 = Point::new(p1.x + alpha * d1.x, p1.y + alpha * d1.y);
        let c2 = Point::new(p2.x - alpha * d2.x, p2.y - alpha * d2.y);
        b.cubic_to(c1, c2, p2);
        t = t2;
    }
    let _ = PathDirection::CW; // keep import alive even if unused
}

fn vec_angle(ux: f32, uy: f32, vx: f32, vy: f32) -> f32 {
    let dot = (ux * vx + uy * vy).clamp(-1.0, 1.0);
    let len = ((ux * ux + uy * uy) * (vx * vx + vy * vy))
        .sqrt()
        .max(1e-12);
    let cos = (dot / len).clamp(-1.0, 1.0);
    let s = (ux * vy - uy * vx).signum();
    s * cos.acos()
}

fn arc_point(cx: f32, cy: f32, rx: f32, ry: f32, cos_phi: f32, sin_phi: f32, t: f32) -> Point {
    let cos_t = t.cos();
    let sin_t = t.sin();
    Point::new(
        cx + cos_phi * rx * cos_t - sin_phi * ry * sin_t,
        cy + sin_phi * rx * cos_t + cos_phi * ry * sin_t,
    )
}

fn arc_derivative(rx: f32, ry: f32, cos_phi: f32, sin_phi: f32, t: f32) -> Point {
    let cos_t = t.cos();
    let sin_t = t.sin();
    Point::new(
        -cos_phi * rx * sin_t - sin_phi * ry * cos_t,
        -sin_phi * rx * sin_t + cos_phi * ry * cos_t,
    )
}

// ─── tokenizer ─────────────────────────────────────────────────────────

struct Parser<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Parser<'a> {
    fn new(s: &'a str) -> Self {
        Self {
            bytes: s.as_bytes(),
            pos: 0,
        }
    }

    fn skip_ws_or_comma(&mut self) {
        while self.pos < self.bytes.len() {
            let c = self.bytes[self.pos];
            if c == b',' || c.is_ascii_whitespace() {
                self.pos += 1;
            } else {
                break;
            }
        }
    }

    fn next_command(&mut self) -> Option<u8> {
        self.skip_ws_or_comma();
        while self.pos < self.bytes.len() {
            let c = self.bytes[self.pos];
            if c.is_ascii_alphabetic() {
                self.pos += 1;
                return Some(c);
            }
            // Skip stray separators.
            if c == b',' || c.is_ascii_whitespace() {
                self.pos += 1;
                continue;
            }
            return None;
        }
        None
    }

    /// Returns true iff the next token (after whitespace/commas) looks
    /// like the start of a number — i.e. another argument can be read.
    fn peek_argument(&mut self) -> bool {
        self.skip_ws_or_comma();
        self.pos < self.bytes.len() && {
            let c = self.bytes[self.pos];
            c == b'+' || c == b'-' || c == b'.' || c.is_ascii_digit()
        }
    }

    fn read_number(&mut self) -> Option<f32> {
        self.skip_ws_or_comma();
        if self.pos >= self.bytes.len() {
            return None;
        }
        let start = self.pos;
        // Optional sign.
        if matches!(self.bytes[self.pos], b'+' | b'-') {
            self.pos += 1;
        }
        let mut saw_digit = false;
        while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_digit() {
            self.pos += 1;
            saw_digit = true;
        }
        if self.pos < self.bytes.len() && self.bytes[self.pos] == b'.' {
            self.pos += 1;
            while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_digit() {
                self.pos += 1;
                saw_digit = true;
            }
        }
        // Exponent.
        if self.pos < self.bytes.len() && matches!(self.bytes[self.pos], b'e' | b'E') {
            self.pos += 1;
            if self.pos < self.bytes.len() && matches!(self.bytes[self.pos], b'+' | b'-') {
                self.pos += 1;
            }
            while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_digit() {
                self.pos += 1;
            }
        }
        if !saw_digit {
            self.pos = start;
            return None;
        }
        std::str::from_utf8(&self.bytes[start..self.pos])
            .ok()
            .and_then(|s| s.parse::<f32>().ok())
    }

    fn read_coord_pair(&mut self) -> Option<(f32, f32)> {
        let x = self.read_number()?;
        let y = self.read_number()?;
        Some((x, y))
    }

    /// Arc large/sweep flags are single 0/1 digits, separated only by
    /// optional whitespace/comma — no sign or fraction.
    fn read_flag(&mut self) -> Option<bool> {
        self.skip_ws_or_comma();
        if self.pos >= self.bytes.len() {
            return None;
        }
        let c = self.bytes[self.pos];
        let v = match c {
            b'0' => false,
            b'1' => true,
            _ => return None,
        };
        self.pos += 1;
        Some(v)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_lines() {
        let p = parse_path("M 10 10 L 90 10 L 90 90 L 10 90 Z");
        assert!(!p.is_empty());
    }

    #[test]
    fn handles_implicit_repeat() {
        // "M" with two pairs => second pair becomes implicit L.
        let p = parse_path("M0 0 10 10 20 0");
        assert!(!p.is_empty());
    }

    #[test]
    fn parses_cubic_and_smooth() {
        let p = parse_path("M0 0 C10 10 20 10 30 0 S 50 -10 60 0");
        assert!(!p.is_empty());
    }

    #[test]
    fn parses_arc_quarter_circle() {
        // 90° arc from (10,0) → (0,10) over a unit-ish ellipse.
        let p = parse_path("M10 0 A 10 10 0 0 1 0 10");
        assert!(!p.is_empty());
    }
}
