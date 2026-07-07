//! The agent text IR — an XML-ish projection of the anchor document
//! (triage amendment 3). Audience: LLMs. The grammar is specified in
//! `model-v2/a/e3-text-ir/grammar.md`; this module is the reference
//! parser + canonical printer.
//!
//! Round-trip law: `parse(print(doc)) == doc` for documents whose ids were
//! assigned in document order (the IR does not carry ids — id stability is
//! a binary-format concern; recorded as an E3 finding).

use crate::model::*;
use quick_xml::events::Event;
use quick_xml::Reader;
use std::collections::BTreeMap;
use std::fmt::Write as _;

#[derive(Debug, Clone, PartialEq)]
pub struct ParseError(pub String);

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "textir: {}", self.0)
    }
}

fn err<T>(msg: impl Into<String>) -> Result<T, ParseError> {
    Err(ParseError(msg.into()))
}

fn parse_num(s: &str, what: &str) -> Result<f32, ParseError> {
    let v: f32 = s
        .trim()
        .parse()
        .map_err(|_| ParseError(format!("bad number `{s}` in {what}")))?;
    if !v.is_finite() {
        return err(format!("non-finite number `{s}` in {what} (N-2)"));
    }
    Ok(v)
}

fn parse_binding(s: &str, what: &str) -> Result<AxisBinding, ParseError> {
    let parts: Vec<&str> = s.split_whitespace().collect();
    match parts.as_slice() {
        [n] if n.chars().next().map(|c| c.is_ascii_digit() || c == '-' || c == '.') == Some(true) => {
            Ok(AxisBinding::start(parse_num(n, what)?))
        }
        ["start", n] => Ok(AxisBinding::start(parse_num(n, what)?)),
        ["end", n] => Ok(AxisBinding::end(parse_num(n, what)?)),
        ["center"] => Ok(AxisBinding::center(0.0)),
        ["center", n] => Ok(AxisBinding::center(parse_num(n, what)?)),
        ["span", a, b] => Ok(AxisBinding::Span {
            start: parse_num(a, what)?,
            end: parse_num(b, what)?,
        }),
        _ => err(format!("bad binding `{s}` in {what}")),
    }
}

fn parse_size(s: &str, what: &str) -> Result<SizeIntent, ParseError> {
    if s.trim() == "auto" {
        Ok(SizeIntent::Auto)
    } else {
        Ok(SizeIntent::Fixed(parse_num(s, what)?))
    }
}

fn parse_lens_ops(s: &str) -> Result<Vec<LensOp>, ParseError> {
    let mut ops = vec![];
    for raw in s.split(')') {
        let raw = raw.trim().trim_start_matches(',').trim();
        if raw.is_empty() {
            continue;
        }
        let (name, args) = raw
            .split_once('(')
            .ok_or_else(|| ParseError(format!("bad lens op `{raw}`")))?;
        let nums: Vec<f32> = args
            .split(',')
            .filter(|a| !a.trim().is_empty())
            .map(|a| parse_num(a, "lens ops"))
            .collect::<Result<_, _>>()?;
        let op = match (name.trim(), nums.as_slice()) {
            ("translate", [x, y]) => LensOp::Translate { x: *x, y: *y },
            ("rotate", [d]) => LensOp::Rotate { deg: *d },
            ("scale", [s]) => LensOp::Scale { x: *s, y: *s },
            ("scale", [x, y]) => LensOp::Scale { x: *x, y: *y },
            ("skew-x", [d]) => LensOp::Skew {
                x_deg: *d,
                y_deg: 0.0,
            },
            ("skew-y", [d]) => LensOp::Skew {
                x_deg: 0.0,
                y_deg: *d,
            },
            ("skew", [x, y]) => LensOp::Skew {
                x_deg: *x,
                y_deg: *y,
            },
            ("matrix", [a, b, c, d, e, f]) => LensOp::Matrix {
                m: [*a, *b, *c, *d, *e, *f],
            },
            _ => return err(format!("bad lens op `{raw}`")),
        };
        ops.push(op);
    }
    Ok(ops)
}

struct Pending {
    id: NodeId,
    text_content: String,
    is_text: bool,
}

pub fn parse(input: &str) -> Result<Document, ParseError> {
    let mut reader = Reader::from_str(input);
    reader.config_mut().trim_text(true);

    let mut nodes: BTreeMap<NodeId, Node> = BTreeMap::new();
    let mut stack: Vec<Pending> = vec![];
    let mut next_id: NodeId = 0;
    let mut root: Option<NodeId> = None;

    loop {
        match reader.read_event() {
            Err(e) => return err(format!("xml: {e}")),
            Ok(Event::Eof) => break,
            Ok(ev @ (Event::Start(_) | Event::Empty(_))) => {
                let is_empty = matches!(ev, Event::Empty(_));
                let el = match ev {
                    Event::Start(e) | Event::Empty(e) => e,
                    _ => unreachable!(),
                };
                let tag = String::from_utf8_lossy(el.name().as_ref()).to_string();
                let mut header = Header::new(SizeIntent::Auto, SizeIntent::Auto);
                let mut layout = LayoutBehavior::default();
                let mut shape_kind: Option<ShapeDesc> = None;
                let mut font_size = 16.0f32;
                let mut lens_ops: Vec<LensOp> = vec![];
                let mut clips = false;
                let mut fill: Option<String> = None;

                for attr in el.attributes() {
                    let attr = attr.map_err(|e| ParseError(format!("attr: {e}")))?;
                    let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                    let val = attr
                        .unescape_value()
                        .map_err(|e| ParseError(format!("attr value: {e}")))?
                        .to_string();
                    match key.as_str() {
                        "name" => header.name = Some(val),
                        "x" => header.x = parse_binding(&val, "x")?,
                        "y" => header.y = parse_binding(&val, "y")?,
                        "w" => header.width = parse_size(&val, "w")?,
                        "h" => header.height = parse_size(&val, "h")?,
                        "min-w" => header.min_width = Some(parse_num(&val, "min-w")?),
                        "max-w" => header.max_width = Some(parse_num(&val, "max-w")?),
                        "min-h" => header.min_height = Some(parse_num(&val, "min-h")?),
                        "max-h" => header.max_height = Some(parse_num(&val, "max-h")?),
                        "aspect" => {
                            let (a, b) = val
                                .split_once(':')
                                .ok_or_else(|| ParseError("aspect needs `w:h`".into()))?;
                            header.aspect_ratio =
                                Some((parse_num(a, "aspect")?, parse_num(b, "aspect")?));
                        }
                        "rotation" => header.rotation = parse_num(&val, "rotation")?,
                        "flip-x" => header.flip_x = val == "true",
                        "flip-y" => header.flip_y = val == "true",
                        "flow" => {
                            header.flow = match val.as_str() {
                                "absolute" => Flow::Absolute,
                                "in" => Flow::InFlow,
                                _ => return err(format!("bad flow `{val}`")),
                            }
                        }
                        "grow" => header.grow = parse_num(&val, "grow")?,
                        "align" => {
                            header.self_align = match val.as_str() {
                                "start" => SelfAlign::Start,
                                "center" => SelfAlign::Center,
                                "end" => SelfAlign::End,
                                "stretch" => SelfAlign::Stretch,
                                _ => return err(format!("bad align `{val}`")),
                            }
                        }
                        "opacity" => header.opacity = parse_num(&val, "opacity")?,
                        "hidden" => header.active = val != "true",
                        "layout" => {
                            layout.mode = match val.as_str() {
                                "flex" => LayoutMode::Flex,
                                "none" => LayoutMode::None,
                                _ => return err(format!("bad layout `{val}`")),
                            }
                        }
                        "direction" => {
                            layout.direction = match val.as_str() {
                                "row" => Direction::Row,
                                "column" => Direction::Column,
                                _ => return err(format!("bad direction `{val}`")),
                            }
                        }
                        "wrap" => layout.wrap = val == "true",
                        "main" => {
                            layout.main_align = match val.as_str() {
                                "start" => MainAlign::Start,
                                "center" => MainAlign::Center,
                                "end" => MainAlign::End,
                                "space-between" => MainAlign::SpaceBetween,
                                "space-around" => MainAlign::SpaceAround,
                                "space-evenly" => MainAlign::SpaceEvenly,
                                _ => return err(format!("bad main `{val}`")),
                            }
                        }
                        "cross" => {
                            layout.cross_align = match val.as_str() {
                                "start" => CrossAlign::Start,
                                "center" => CrossAlign::Center,
                                "end" => CrossAlign::End,
                                "stretch" => CrossAlign::Stretch,
                                _ => return err(format!("bad cross `{val}`")),
                            }
                        }
                        "gap" => {
                            let parts: Vec<&str> = val.split_whitespace().collect();
                            match parts.as_slice() {
                                [g] => {
                                    layout.gap_main = parse_num(g, "gap")?;
                                    layout.gap_cross = layout.gap_main;
                                }
                                [m, c] => {
                                    layout.gap_main = parse_num(m, "gap")?;
                                    layout.gap_cross = parse_num(c, "gap")?;
                                }
                                _ => return err("gap takes 1 or 2 numbers"),
                            }
                        }
                        "padding" => {
                            let nums: Vec<f32> = val
                                .split_whitespace()
                                .map(|p| parse_num(p, "padding"))
                                .collect::<Result<_, _>>()?;
                            layout.padding = match nums.as_slice() {
                                [a] => EdgeInsets::all(*a),
                                [t, r, b, l] => EdgeInsets {
                                    top: *t,
                                    right: *r,
                                    bottom: *b,
                                    left: *l,
                                },
                                _ => return err("padding takes 1 or 4 numbers"),
                            };
                        }
                        "clips" => clips = val == "true",
                        "kind" => {
                            shape_kind = Some(match val.as_str() {
                                "rect" => ShapeDesc::Rect,
                                "ellipse" => ShapeDesc::Ellipse,
                                "line" => ShapeDesc::Line,
                                _ => return err(format!("bad shape kind `{val}`")),
                            })
                        }
                        "size" => font_size = parse_num(&val, "size")?,
                        "ops" => lens_ops = parse_lens_ops(&val)?,
                        "fill" => fill = Some(val),
                        _ => return err(format!("unknown attribute `{key}` on <{tag}>")),
                    }
                }

                let payload = match tag.as_str() {
                    "frame" => {
                        // Kind defaults (§4): frame sizes are Fixed-required;
                        // the IR treats missing w/h as auto (hug) which is
                        // legal for frames.
                        Payload::Frame {
                            layout,
                            clips_content: clips,
                        }
                    }
                    "shape" => {
                        let desc = shape_kind
                            .ok_or_else(|| ParseError("<shape> requires kind".into()))?;
                        if matches!(desc, ShapeDesc::Line) {
                            header.height = SizeIntent::Fixed(0.0); // §3.2 locked
                        }
                        Payload::Shape { desc }
                    }
                    "text" => Payload::Text {
                        content: String::new(), // filled at End
                        font_size,
                    },
                    "group" => Payload::Group,
                    "lens" => Payload::Lens { ops: lens_ops },
                    _ => return err(format!("unknown element <{tag}>")),
                };

                let id = next_id;
                next_id += 1;
                let node = Node {
                    id,
                    header,
                    payload,
                    children: vec![],
                    fill,
                };
                nodes.insert(id, node);
                if let Some(parent) = stack.last() {
                    let pid = parent.id;
                    nodes.get_mut(&pid).unwrap().children.push(id);
                } else if root.is_none() {
                    root = Some(id);
                } else {
                    return err("multiple root elements");
                }

                let is_text = tag == "text";
                stack.push(Pending {
                    id,
                    text_content: String::new(),
                    is_text,
                });
                // Self-closing (`Event::Empty`) has no matching End event.
                if is_empty {
                    finish(&mut stack, &mut nodes)?;
                }
            }
            Ok(Event::Text(t)) => {
                if let Some(p) = stack.last_mut() {
                    let txt = t
                        .unescape()
                        .map_err(|e| ParseError(format!("text: {e}")))?;
                    p.text_content.push_str(&txt);
                }
            }
            Ok(Event::End(_)) => {
                finish(&mut stack, &mut nodes)?;
            }
            Ok(_) => {}
        }
    }

    if !stack.is_empty() {
        return err("unclosed elements");
    }
    let root = root.ok_or_else(|| ParseError("empty document".into()))?;
    // The scene root spans the viewport unless bindings were given.
    Ok(Document::from_map(nodes, root))
}

fn finish(stack: &mut Vec<Pending>, nodes: &mut BTreeMap<NodeId, Node>) -> Result<(), ParseError> {
    let p = stack.pop().ok_or_else(|| ParseError("unbalanced end".into()))?;
    if p.is_text {
        if let Payload::Text { content, .. } = &mut nodes.get_mut(&p.id).unwrap().payload {
            *content = p.text_content;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Canonical printer — shortest honest form, defaults omitted
// ---------------------------------------------------------------------------

fn fmt_num(v: f32) -> String {
    if v == v.trunc() && v.abs() < 1e7 {
        format!("{}", v as i64)
    } else {
        format!("{v}")
    }
}

fn fmt_binding(b: AxisBinding) -> Option<String> {
    match b {
        AxisBinding::Pin {
            anchor: AnchorEdge::Start,
            offset,
        } => {
            if offset == 0.0 {
                None // default
            } else {
                Some(fmt_num(offset))
            }
        }
        AxisBinding::Pin {
            anchor: AnchorEdge::End,
            offset,
        } => Some(format!("end {}", fmt_num(offset))),
        AxisBinding::Pin {
            anchor: AnchorEdge::Center,
            offset,
        } => Some(if offset == 0.0 {
            "center".to_string()
        } else {
            format!("center {}", fmt_num(offset))
        }),
        AxisBinding::Span { start, end } => {
            Some(format!("span {} {}", fmt_num(start), fmt_num(end)))
        }
    }
}

fn push_attr(out: &mut String, key: &str, val: &str) {
    let _ = write!(out, " {key}=\"{val}\"");
}

pub fn print(doc: &Document) -> String {
    let mut out = String::new();
    print_node(doc, doc.root, 0, &mut out);
    out
}

fn print_node(doc: &Document, id: NodeId, depth: usize, out: &mut String) {
    let node = doc.get(id);
    let indent = "  ".repeat(depth);
    let tag = node.payload.kind_name();
    let _ = write!(out, "{indent}<{tag}");

    if let Some(name) = &node.header.name {
        push_attr(out, "name", name);
    }
    if let Some(b) = fmt_binding(node.header.x) {
        push_attr(out, "x", &b);
    }
    if let Some(b) = fmt_binding(node.header.y) {
        push_attr(out, "y", &b);
    }
    if !node.payload.box_is_derived() {
        match node.header.width {
            SizeIntent::Fixed(v) => push_attr(out, "w", &fmt_num(v)),
            SizeIntent::Auto => {
                if matches!(node.payload, Payload::Frame { .. }) {
                    push_attr(out, "w", "auto");
                }
                // text: auto is the kind default — omitted
            }
        }
        let is_line = matches!(
            node.payload,
            Payload::Shape {
                desc: ShapeDesc::Line
            }
        );
        match node.header.height {
            SizeIntent::Fixed(v) => {
                if !is_line {
                    push_attr(out, "h", &fmt_num(v));
                }
            }
            SizeIntent::Auto => {
                if matches!(node.payload, Payload::Frame { .. }) {
                    push_attr(out, "h", "auto");
                }
            }
        }
    }
    if let Some(v) = node.header.min_width {
        push_attr(out, "min-w", &fmt_num(v));
    }
    if let Some(v) = node.header.max_width {
        push_attr(out, "max-w", &fmt_num(v));
    }
    if let Some(v) = node.header.min_height {
        push_attr(out, "min-h", &fmt_num(v));
    }
    if let Some(v) = node.header.max_height {
        push_attr(out, "max-h", &fmt_num(v));
    }
    if let Some((a, b)) = node.header.aspect_ratio {
        push_attr(out, "aspect", &format!("{}:{}", fmt_num(a), fmt_num(b)));
    }
    if node.header.rotation != 0.0 {
        push_attr(out, "rotation", &fmt_num(node.header.rotation));
    }
    if node.header.flip_x {
        push_attr(out, "flip-x", "true");
    }
    if node.header.flip_y {
        push_attr(out, "flip-y", "true");
    }
    if node.header.flow == Flow::Absolute {
        push_attr(out, "flow", "absolute");
    }
    if node.header.grow != 0.0 {
        push_attr(out, "grow", &fmt_num(node.header.grow));
    }
    match node.header.self_align {
        SelfAlign::Auto => {}
        SelfAlign::Start => push_attr(out, "align", "start"),
        SelfAlign::Center => push_attr(out, "align", "center"),
        SelfAlign::End => push_attr(out, "align", "end"),
        SelfAlign::Stretch => push_attr(out, "align", "stretch"),
    }
    if node.header.opacity != 1.0 {
        push_attr(out, "opacity", &fmt_num(node.header.opacity));
    }
    if !node.header.active {
        push_attr(out, "hidden", "true");
    }

    match &node.payload {
        Payload::Frame {
            layout,
            clips_content,
        } => {
            if layout.mode == LayoutMode::Flex {
                push_attr(out, "layout", "flex");
                if layout.direction != Direction::Row {
                    push_attr(out, "direction", "column");
                }
                if layout.wrap {
                    push_attr(out, "wrap", "true");
                }
                match layout.main_align {
                    MainAlign::Start => {}
                    MainAlign::Center => push_attr(out, "main", "center"),
                    MainAlign::End => push_attr(out, "main", "end"),
                    MainAlign::SpaceBetween => push_attr(out, "main", "space-between"),
                    MainAlign::SpaceAround => push_attr(out, "main", "space-around"),
                    MainAlign::SpaceEvenly => push_attr(out, "main", "space-evenly"),
                }
                match layout.cross_align {
                    CrossAlign::Start => {}
                    CrossAlign::Center => push_attr(out, "cross", "center"),
                    CrossAlign::End => push_attr(out, "cross", "end"),
                    CrossAlign::Stretch => push_attr(out, "cross", "stretch"),
                }
                if layout.gap_main != 0.0 || layout.gap_cross != 0.0 {
                    if layout.gap_main == layout.gap_cross {
                        push_attr(out, "gap", &fmt_num(layout.gap_main));
                    } else {
                        push_attr(
                            out,
                            "gap",
                            &format!(
                                "{} {}",
                                fmt_num(layout.gap_main),
                                fmt_num(layout.gap_cross)
                            ),
                        );
                    }
                }
            }
            let p = layout.padding;
            if p != EdgeInsets::default() {
                if p.top == p.right && p.right == p.bottom && p.bottom == p.left {
                    push_attr(out, "padding", &fmt_num(p.top));
                } else {
                    push_attr(
                        out,
                        "padding",
                        &format!(
                            "{} {} {} {}",
                            fmt_num(p.top),
                            fmt_num(p.right),
                            fmt_num(p.bottom),
                            fmt_num(p.left)
                        ),
                    );
                }
            }
            if *clips_content {
                push_attr(out, "clips", "true");
            }
        }
        Payload::Shape { desc } => {
            let kind = match desc {
                ShapeDesc::Rect => "rect",
                ShapeDesc::Ellipse => "ellipse",
                ShapeDesc::Line => "line",
            };
            push_attr(out, "kind", kind);
        }
        Payload::Text { font_size, .. } => {
            if *font_size != 16.0 {
                push_attr(out, "size", &fmt_num(*font_size));
            }
        }
        Payload::Group => {}
        Payload::Lens { ops } => {
            let parts: Vec<String> = ops
                .iter()
                .map(|op| match op {
                    LensOp::Translate { x, y } => {
                        format!("translate({},{})", fmt_num(*x), fmt_num(*y))
                    }
                    LensOp::Rotate { deg } => format!("rotate({})", fmt_num(*deg)),
                    LensOp::Scale { x, y } => {
                        if x == y {
                            format!("scale({})", fmt_num(*x))
                        } else {
                            format!("scale({},{})", fmt_num(*x), fmt_num(*y))
                        }
                    }
                    LensOp::Skew { x_deg, y_deg } => {
                        if *y_deg == 0.0 {
                            format!("skew-x({})", fmt_num(*x_deg))
                        } else if *x_deg == 0.0 {
                            format!("skew-y({})", fmt_num(*y_deg))
                        } else {
                            format!("skew({},{})", fmt_num(*x_deg), fmt_num(*y_deg))
                        }
                    }
                    LensOp::Matrix { m } => format!(
                        "matrix({},{},{},{},{},{})",
                        fmt_num(m[0]),
                        fmt_num(m[1]),
                        fmt_num(m[2]),
                        fmt_num(m[3]),
                        fmt_num(m[4]),
                        fmt_num(m[5])
                    ),
                })
                .collect();
            push_attr(out, "ops", &parts.join(" "));
        }
    }
    if let Some(fill) = &node.fill {
        push_attr(out, "fill", fill);
    }

    let is_text = matches!(node.payload, Payload::Text { .. });
    if is_text {
        let content = match &node.payload {
            Payload::Text { content, .. } => content.clone(),
            _ => unreachable!(),
        };
        let escaped = content
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;");
        let _ = writeln!(out, ">{escaped}</text>");
    } else if node.children.is_empty() {
        let _ = writeln!(out, "/>");
    } else {
        let _ = writeln!(out, ">");
        for c in &node.children {
            print_node(doc, *c, depth + 1, out);
        }
        let _ = writeln!(out, "{indent}</{tag}>");
    }
}
