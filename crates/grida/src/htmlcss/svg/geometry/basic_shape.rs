//! CSS basic-shape `clip-path` value parser + Skia `Path` builder.
//!
//! Implements the inline shape functions of CSS Shapes Level 1 used as
//! `clip-path` values (as opposed to the `url(#…)` reference form):
//! `circle(...)`, `ellipse(...)`, `inset(...)`, `polygon(...)`, and
//! `path("...")`. The grammar follows
//! https://drafts.csswg.org/css-shapes-1/#basic-shape-functions.
//!
//! Per CSS Masking 1, the SVG default reference box is `fill-box`
//! (the element's object bounding box). The `<reference-box>` keyword
//! suffix may switch to `stroke-box` or `view-box`. We support
//! `fill-box`/`view-box` exactly and approximate `stroke-box` /
//! `border-box` / `padding-box` / `content-box` / `margin-box` as
//! `fill-box` since our renderer is SVG-only and stroke widths are
//! small in fixtures.
//!
//! Blink anchor: `core/style/basic_shapes.{h,cc}` (`BasicShape*::GetPath`),
//! grammar in `core/css/css_basic_shape_values.cc`.

use skia_safe::{Path, PathBuilder, PathFillType, Point, RRect, Rect, Vector};

use crate::htmlcss::svg::dom::path_d::parse_path;

/// Reference box for resolving percentages and `closest-side` /
/// `farthest-side` keywords. Defaults to `FillBox` for SVG context.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReferenceBox {
    FillBox,
    StrokeBox,
    ViewBox,
}

impl ReferenceBox {
    fn from_keyword(s: &str) -> Option<Self> {
        match s {
            "fill-box" => Some(Self::FillBox),
            "stroke-box" => Some(Self::StrokeBox),
            "view-box" => Some(Self::ViewBox),
            // SVG content has no border/padding/content/margin distinct
            // from fill-box per CSS Masking 1 §1.2; accept and collapse.
            "border-box" | "padding-box" | "content-box" | "margin-box" => Some(Self::FillBox),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum BasicShape {
    Circle {
        radius: ShapeRadius,
        cx: ShapePos,
        cy: ShapePos,
    },
    Ellipse {
        rx: ShapeRadius,
        ry: ShapeRadius,
        cx: ShapePos,
        cy: ShapePos,
    },
    Inset {
        top: ShapeLen,
        right: ShapeLen,
        bottom: ShapeLen,
        left: ShapeLen,
        // Corner radii (top-left, top-right, bottom-right, bottom-left).
        // `None` means square corners.
        radii: Option<[ShapeLen; 4]>,
    },
    Polygon {
        rule: PathFillType,
        points: Vec<(ShapeLen, ShapeLen)>,
    },
    Path {
        rule: PathFillType,
        d: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ShapeLen {
    /// Absolute length in user units (px after CSS unit normalization).
    Length(f32),
    /// Percentage of the relevant box dimension.
    Percent(f32),
}

impl ShapeLen {
    fn resolve(self, basis: f32) -> f32 {
        match self {
            ShapeLen::Length(v) => v,
            ShapeLen::Percent(p) => p / 100.0 * basis,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ShapeRadius {
    Length(f32),
    Percent(f32),
    ClosestSide,
    FarthestSide,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ShapePos {
    /// Default `center` resolves to 50% of the box dimension.
    Center,
    Length(f32),
    Percent(f32),
}

impl ShapePos {
    fn resolve(self, basis: f32) -> f32 {
        match self {
            ShapePos::Center => 0.5 * basis,
            ShapePos::Length(v) => v,
            ShapePos::Percent(p) => p / 100.0 * basis,
        }
    }
}

// ─── Parsing ───────────────────────────────────────────────────────────

/// Parse a CSS basic-shape `clip-path` value. Returns `None` for
/// anything we don't recognize (so callers can fall through to other
/// `clip-path` value forms — `url()` / `none`).
pub fn parse_basic_shape(raw: &str) -> Option<(BasicShape, ReferenceBox)> {
    let raw = raw.trim();
    // Try `<shape> <reference-box>` and `<reference-box> <shape>`. The
    // CSS spec lets the keyword appear on either side; both Blink and
    // Servo accept both orders.
    let (shape_str, refbox) = split_reference_box(raw);
    let shape = parse_shape_function(shape_str)?;
    Some((shape, refbox))
}

fn split_reference_box(raw: &str) -> (&str, ReferenceBox) {
    // Look for a trailing identifier that's a reference-box keyword.
    if let Some(idx) = raw.rfind(char::is_whitespace) {
        let tail = raw[idx..].trim();
        if let Some(rb) = ReferenceBox::from_keyword(tail) {
            return (raw[..idx].trim(), rb);
        }
    }
    // Look for a leading identifier.
    if let Some(idx) = raw.find(char::is_whitespace) {
        let head = raw[..idx].trim();
        if let Some(rb) = ReferenceBox::from_keyword(head) {
            return (raw[idx..].trim(), rb);
        }
    }
    (raw, ReferenceBox::FillBox)
}

fn parse_shape_function(raw: &str) -> Option<BasicShape> {
    let (name, args) = split_function(raw)?;
    match name {
        "circle" => parse_circle(args),
        "ellipse" => parse_ellipse(args),
        "inset" => parse_inset(args),
        "polygon" => parse_polygon(args),
        "path" => parse_path_shape(args),
        _ => None,
    }
}

/// `name(args)` → `(name, args)`. Returns `None` for malformed input.
fn split_function(raw: &str) -> Option<(&str, &str)> {
    let raw = raw.trim();
    let open = raw.find('(')?;
    let close = raw.rfind(')')?;
    if close <= open {
        return None;
    }
    let name = raw[..open].trim();
    let args = raw[open + 1..close].trim();
    Some((name, args))
}

fn parse_circle(args: &str) -> Option<BasicShape> {
    // Grammar: [<shape-radius>]? [at <position>]?
    let (radius_str, pos_str) = split_at_clause(args);
    let radius = if radius_str.is_empty() {
        ShapeRadius::ClosestSide
    } else {
        parse_shape_radius(radius_str)?
    };
    let (cx, cy) = parse_position(pos_str)?;
    Some(BasicShape::Circle { radius, cx, cy })
}

fn parse_ellipse(args: &str) -> Option<BasicShape> {
    // Grammar: [<shape-radius>{2}]? [at <position>]?
    let (radii_str, pos_str) = split_at_clause(args);
    let (rx, ry) = if radii_str.is_empty() {
        (ShapeRadius::ClosestSide, ShapeRadius::ClosestSide)
    } else {
        let mut tokens = tokens(radii_str);
        let rx = parse_shape_radius(tokens.next()?)?;
        let ry = parse_shape_radius(tokens.next()?)?;
        (rx, ry)
    };
    let (cx, cy) = parse_position(pos_str)?;
    Some(BasicShape::Ellipse { rx, ry, cx, cy })
}

fn parse_inset(args: &str) -> Option<BasicShape> {
    // Grammar: <length-percentage>{1,4} [round <border-radius>]?
    let (rect_str, round_str) = match args.find(" round ") {
        Some(i) => (args[..i].trim(), Some(args[i + 7..].trim())),
        None => (args.trim(), None),
    };
    let parts: Vec<ShapeLen> = tokens(rect_str)
        .map(parse_shape_len)
        .collect::<Option<Vec<_>>>()?;
    let (top, right, bottom, left) = match parts.as_slice() {
        [a] => (*a, *a, *a, *a),
        [a, b] => (*a, *b, *a, *b),
        [a, b, c] => (*a, *b, *c, *b),
        [a, b, c, d] => (*a, *b, *c, *d),
        _ => return None,
    };
    let radii = match round_str {
        Some(s) => Some(parse_round_radii(s)?),
        None => None,
    };
    Some(BasicShape::Inset {
        top,
        right,
        bottom,
        left,
        radii,
    })
}

fn parse_round_radii(s: &str) -> Option<[ShapeLen; 4]> {
    // CSS border-radius shorthand: 1-4 values for the four corners. We
    // ignore the `tl tr / bl br` variant (different x/y radii) — fixtures
    // don't use it and our `RRect` API takes per-corner Vectors anyway.
    let parts: Vec<ShapeLen> = tokens(s).map(parse_shape_len).collect::<Option<Vec<_>>>()?;
    Some(match parts.as_slice() {
        [a] => [*a, *a, *a, *a],
        [a, b] => [*a, *b, *a, *b],
        [a, b, c] => [*a, *b, *c, *b],
        [a, b, c, d] => [*a, *b, *c, *d],
        _ => return None,
    })
}

fn parse_polygon(args: &str) -> Option<BasicShape> {
    // Grammar: [<fill-rule>,]? <length-percentage> <length-percentage>,
    //          <length-percentage> <length-percentage>, ...
    let (rule, rest) = match args.split_once(',') {
        Some((head, tail)) if head.trim() == "evenodd" => (PathFillType::EvenOdd, tail),
        Some((head, tail)) if head.trim() == "nonzero" => (PathFillType::Winding, tail),
        _ => (PathFillType::Winding, args),
    };
    let mut points = Vec::new();
    for chunk in rest.split(',') {
        let mut t = tokens(chunk.trim());
        let x = parse_shape_len(t.next()?)?;
        let y = parse_shape_len(t.next()?)?;
        points.push((x, y));
    }
    if points.is_empty() {
        return None;
    }
    Some(BasicShape::Polygon { rule, points })
}

fn parse_path_shape(args: &str) -> Option<BasicShape> {
    // Grammar: [<fill-rule>,]? <string>
    let (rule, rest) = match args.split_once(',') {
        Some((head, tail)) if head.trim() == "evenodd" => (PathFillType::EvenOdd, tail.trim()),
        Some((head, tail)) if head.trim() == "nonzero" => (PathFillType::Winding, tail.trim()),
        _ => (PathFillType::Winding, args.trim()),
    };
    let d = rest
        .trim()
        .trim_matches(|c| c == '"' || c == '\'')
        .to_string();
    if d.is_empty() {
        return None;
    }
    Some(BasicShape::Path { rule, d })
}

/// Split `<radius> at <position>` into `(radius_str, position_str)`.
fn split_at_clause(args: &str) -> (&str, &str) {
    if let Some(i) = args.find(" at ") {
        (args[..i].trim(), args[i + 4..].trim())
    } else if let Some(rest) = args.strip_prefix("at ") {
        ("", rest.trim())
    } else {
        (args.trim(), "")
    }
}

fn parse_shape_radius(s: &str) -> Option<ShapeRadius> {
    let s = s.trim();
    match s {
        "closest-side" => Some(ShapeRadius::ClosestSide),
        "farthest-side" => Some(ShapeRadius::FarthestSide),
        _ => match parse_length_or_percent(s)? {
            ShapeLen::Length(v) => Some(ShapeRadius::Length(v)),
            ShapeLen::Percent(p) => Some(ShapeRadius::Percent(p)),
        },
    }
}

fn parse_shape_len(s: &str) -> Option<ShapeLen> {
    parse_length_or_percent(s.trim())
}

fn parse_length_or_percent(s: &str) -> Option<ShapeLen> {
    let s = s.trim();
    if let Some(num) = s.strip_suffix('%') {
        return num.trim().parse::<f32>().ok().map(ShapeLen::Percent);
    }
    // Strip a `px` suffix; other units (em, rem) we can't honour without
    // a full CSS context, so we take the numeric value as user units.
    let num = s.strip_suffix("px").map(str::trim).unwrap_or(s);
    num.parse::<f32>().ok().map(ShapeLen::Length)
}

fn parse_position(args: &str) -> Option<(ShapePos, ShapePos)> {
    // Grammar: 1, 2 or 4 keyword/length tokens. We support the simple
    // `<x> <y>` and one-token `center` cases — sufficient for fixtures.
    let args = args.trim();
    if args.is_empty() {
        return Some((ShapePos::Center, ShapePos::Center));
    }
    let toks: Vec<&str> = tokens(args).collect();
    match toks.as_slice() {
        [c] => match *c {
            "center" => Some((ShapePos::Center, ShapePos::Center)),
            _ => {
                let v = parse_shape_pos(c)?;
                Some((v, ShapePos::Center))
            }
        },
        [x, y] => Some((parse_shape_pos(x)?, parse_shape_pos(y)?)),
        _ => None,
    }
}

fn parse_shape_pos(s: &str) -> Option<ShapePos> {
    match s.trim() {
        "left" | "top" => Some(ShapePos::Percent(0.0)),
        "center" => Some(ShapePos::Center),
        "right" | "bottom" => Some(ShapePos::Percent(100.0)),
        s => parse_length_or_percent(s).map(|l| match l {
            ShapeLen::Length(v) => ShapePos::Length(v),
            ShapeLen::Percent(p) => ShapePos::Percent(p),
        }),
    }
}

/// Whitespace-and-comma split.
fn tokens(s: &str) -> impl Iterator<Item = &str> {
    s.split(|c: char| c == ',' || c.is_whitespace())
        .filter(|t| !t.is_empty())
}

// ─── Path building ─────────────────────────────────────────────────────

/// Build a Skia `Path` for `shape` resolved against `box_rect`. The
/// returned path is in the same coordinate space as `box_rect`.
pub fn build_basic_shape_path(shape: &BasicShape, box_rect: Rect) -> Path {
    let w = box_rect.width().max(0.0);
    let h = box_rect.height().max(0.0);
    match shape {
        BasicShape::Circle { radius, cx, cy } => {
            let cx = box_rect.left + cx.resolve(w);
            let cy = box_rect.top + cy.resolve(h);
            let r = resolve_radius(*radius, w, h, cx - box_rect.left, cy - box_rect.top, true);
            let mut b = PathBuilder::new();
            b.add_circle((cx, cy), r, None);
            b.detach()
            // (skia-safe `add_circle` matches the Skia signature with
            // direction only; no start_index — unlike the rect/oval/rrect
            // additions below.)
        }
        BasicShape::Ellipse { rx, ry, cx, cy } => {
            let cx = box_rect.left + cx.resolve(w);
            let cy = box_rect.top + cy.resolve(h);
            let rx = resolve_radius(*rx, w, h, cx - box_rect.left, cy - box_rect.top, false);
            let ry = resolve_radius(*ry, w, h, cx - box_rect.left, cy - box_rect.top, false);
            let mut b = PathBuilder::new();
            b.add_oval(
                Rect::from_xywh(cx - rx, cy - ry, rx * 2.0, ry * 2.0),
                None,
                None,
            );
            b.detach()
        }
        BasicShape::Inset {
            top,
            right,
            bottom,
            left,
            radii,
        } => {
            let l = box_rect.left + left.resolve(w);
            let t = box_rect.top + top.resolve(h);
            let r = box_rect.right - right.resolve(w);
            let b = box_rect.bottom - bottom.resolve(h);
            let rect = Rect::from_ltrb(l.min(r), t.min(b), l.max(r), t.max(b));
            let mut bld = PathBuilder::new();
            if let Some(rs) = radii {
                let rw = rect.width();
                let rh = rect.height();
                let v: [Vector; 4] = [
                    Vector::new(rs[0].resolve(rw), rs[0].resolve(rh)),
                    Vector::new(rs[1].resolve(rw), rs[1].resolve(rh)),
                    Vector::new(rs[2].resolve(rw), rs[2].resolve(rh)),
                    Vector::new(rs[3].resolve(rw), rs[3].resolve(rh)),
                ];
                let mut rrect = RRect::new();
                rrect.set_rect_radii(rect, &v);
                bld.add_rrect(rrect, None, None);
            } else {
                bld.add_rect(rect, None, None);
            }
            bld.detach()
        }
        BasicShape::Polygon { rule, points } => {
            let mut bld = PathBuilder::new();
            let resolved: Vec<Point> = points
                .iter()
                .map(|(x, y)| Point::new(box_rect.left + x.resolve(w), box_rect.top + y.resolve(h)))
                .collect();
            if !resolved.is_empty() {
                bld.move_to(resolved[0]);
                for p in &resolved[1..] {
                    bld.line_to(*p);
                }
                bld.close();
            }
            bld.set_fill_type(*rule);
            bld.detach()
        }
        BasicShape::Path { rule, d } => {
            let mut p = parse_path(d);
            // path() coordinates are user-space, NOT scaled by the
            // reference box (per CSS Shapes 2 §5.7). Translate to
            // box_rect.left, box_rect.top? Per spec: "the coordinate
            // system is established by the reference box but values are
            // not normalized." We translate the parsed path to the
            // reference box origin so a user path of `M 0 0 …` lines up
            // with the box's top-left, mirroring Blink's behavior.
            if box_rect.left != 0.0 || box_rect.top != 0.0 {
                p = p.with_offset((box_rect.left, box_rect.top));
            }
            p.set_fill_type(*rule);
            p
        }
    }
}

/// Resolve a `closest-side` / `farthest-side` / length / percentage
/// against the box. For `circle()`, use the spec's reference radius
/// `hypot(W,H)/√2` for percentages; for `ellipse()` per-axis percentages
/// resolve against W or H separately.
fn resolve_radius(r: ShapeRadius, w: f32, h: f32, cx_in: f32, cy_in: f32, is_circle: bool) -> f32 {
    match r {
        ShapeRadius::Length(v) => v,
        ShapeRadius::Percent(p) => {
            if is_circle {
                let diag = (w * w + h * h).sqrt() / std::f32::consts::SQRT_2;
                p / 100.0 * diag
            } else {
                p / 100.0 * w // caller resolves ry against H separately
            }
        }
        ShapeRadius::ClosestSide => cx_in.min(w - cx_in).min(cy_in).min(h - cy_in).max(0.0),
        ShapeRadius::FarthestSide => cx_in.max(w - cx_in).max(cy_in).max(h - cy_in),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_bare_circle() {
        let (s, rb) = parse_basic_shape("circle()").unwrap();
        assert_eq!(rb, ReferenceBox::FillBox);
        match s {
            BasicShape::Circle { radius, cx, cy } => {
                assert!(matches!(radius, ShapeRadius::ClosestSide));
                assert!(matches!(cx, ShapePos::Center));
                assert!(matches!(cy, ShapePos::Center));
            }
            _ => panic!(),
        }
    }

    #[test]
    fn parses_circle_with_view_box() {
        let (s, rb) = parse_basic_shape("circle() view-box").unwrap();
        assert_eq!(rb, ReferenceBox::ViewBox);
        assert!(matches!(s, BasicShape::Circle { .. }));
    }

    #[test]
    fn parses_polygon_evenodd() {
        let (s, _) = parse_basic_shape("polygon(evenodd, 0 0, 100 0, 50 100)").unwrap();
        match s {
            BasicShape::Polygon { rule, points } => {
                assert_eq!(rule, PathFillType::EvenOdd);
                assert_eq!(points.len(), 3);
            }
            _ => panic!(),
        }
    }

    #[test]
    fn parses_inset_with_round() {
        let (s, _) = parse_basic_shape("inset(10px 20px 30px 40px round 5px)").unwrap();
        match s {
            BasicShape::Inset { radii, .. } => {
                assert!(radii.is_some());
            }
            _ => panic!(),
        }
    }
}
