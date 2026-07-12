//! The agent text IR — an XML-ish projection of the anchor document
//! (triage amendment 3). Audience: LLMs. The grammar is specified in
//! `model-v2/a/e3-text-ir/grammar.md`; this module is the reference
//! parser + canonical printer.
//!
//! Round-trip law: `parse(print(doc)) == doc` for documents whose ids were
//! assigned in document order (the IR does not carry ids — id stability is
//! a binary-format concern; recorded as an E3 finding).

use crate::model::*;
use crate::path;
use quick_xml::events::attributes::Attributes;
use quick_xml::events::{BytesDecl, BytesStart, Event};
use quick_xml::Reader;
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::sync::Arc;

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

fn parse_num_f64(s: &str, what: &str) -> Result<f64, ParseError> {
    let v: f64 = s
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
        [n] if n
            .chars()
            .next()
            .map(|c| c.is_ascii_digit() || c == '+' || c == '-' || c == '.')
            == Some(true) =>
        {
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

fn parse_bool(s: &str, what: &str, strict: bool) -> Result<bool, ParseError> {
    if !strict {
        return Ok(s == "true");
    }
    match s {
        "true" => Ok(true),
        "false" => Ok(false),
        _ => err(format!("{what} must be exactly `true` or `false`")),
    }
}

fn parse_size(s: &str, what: &str, strict: bool) -> Result<SizeIntent, ParseError> {
    if s.trim() == "auto" {
        Ok(SizeIntent::Auto)
    } else {
        let value = parse_num(s, what)?;
        if strict && value < 0.0 {
            return err(format!("{what} must be non-negative"));
        }
        Ok(SizeIntent::Fixed(value))
    }
}

fn parse_non_negative(s: &str, what: &str, strict: bool) -> Result<f32, ParseError> {
    let value = parse_num(s, what)?;
    if strict && value < 0.0 {
        return err(format!("{what} must be non-negative"));
    }
    Ok(value)
}

/// Parse one axis of Draft 0 corner radii. The deliberately small grammar is
/// either one value for every corner or four explicit values in TL, TR, BR,
/// BL order; CSS's two- and three-value shorthands are not aliases.
fn parse_corner_axis(s: &str, what: &str) -> Result<[f32; 4], ParseError> {
    let values: Vec<f32> = s
        .split_whitespace()
        .map(|part| parse_non_negative(part, what, true))
        .collect::<Result<_, _>>()?;
    match values.as_slice() {
        [all] => Ok([*all; 4]),
        [tl, tr, br, bl] => Ok([*tl, *tr, *br, *bl]),
        _ => err(format!(
            "{what} takes 1 or 4 numbers per axis in TL TR BR BL order"
        )),
    }
}

fn parse_corner_radius(s: &str) -> Result<RectangularCornerRadius, ParseError> {
    if s.matches('/').count() > 1 {
        return err("corner-radius takes at most one `/`");
    }
    let (rx_source, ry_source) = match s.split_once('/') {
        Some((rx, ry)) if rx.trim().is_empty() || ry.trim().is_empty() => {
            return err("corner-radius needs radii on both sides of `/`");
        }
        Some((rx, ry)) => (rx, Some(ry)),
        None => (s, None),
    };
    let rx = parse_corner_axis(rx_source, "corner-radius")?;
    let ry = match ry_source {
        Some(source) => parse_corner_axis(source, "corner-radius after `/`")?,
        None => rx,
    };
    Ok(RectangularCornerRadius {
        tl: Radius {
            rx: rx[0],
            ry: ry[0],
        },
        tr: Radius {
            rx: rx[1],
            ry: ry[1],
        },
        br: Radius {
            rx: rx[2],
            ry: ry[2],
        },
        bl: Radius {
            rx: rx[3],
            ry: ry[3],
        },
    })
}

fn parse_positive(s: &str, what: &str, strict: bool) -> Result<f32, ParseError> {
    let value = parse_num(s, what)?;
    if strict && value <= 0.0 {
        return err(format!("{what} must be greater than zero"));
    }
    Ok(value)
}

fn parse_lens_ops(s: &str, strict: bool) -> Result<Vec<LensOp>, ParseError> {
    if strict {
        let mut ops = vec![];
        let mut rest = s.trim();
        while !rest.is_empty() {
            let open = rest
                .find('(')
                .ok_or_else(|| ParseError(format!("bad lens op `{rest}`")))?;
            let close = rest[open + 1..]
                .find(')')
                .map(|index| open + 1 + index)
                .ok_or_else(|| ParseError(format!("unclosed lens op `{rest}`")))?;
            let raw = &rest[..close];
            ops.push(parse_lens_op(raw, true)?);

            let after = &rest[close + 1..];
            if after.is_empty() {
                break;
            }
            if !after.chars().next().is_some_and(char::is_whitespace) {
                return err("lens ops must be separated by whitespace");
            }
            rest = after.trim_start();
        }
        return Ok(ops);
    }

    let mut ops = vec![];
    for raw in s.split(')') {
        let raw = raw.trim().trim_start_matches(',').trim();
        if raw.is_empty() {
            continue;
        }
        ops.push(parse_lens_op(raw, false)?);
    }
    Ok(ops)
}

fn parse_lens_op(raw: &str, strict: bool) -> Result<LensOp, ParseError> {
    let (name, args) = raw
        .split_once('(')
        .ok_or_else(|| ParseError(format!("bad lens op `{raw}`")))?;
    let arg_parts: Vec<&str> = args.split(',').collect();
    if strict && arg_parts.iter().any(|arg| arg.trim().is_empty()) {
        return err(format!("empty argument in lens op `{raw}`"));
    }
    let nums: Vec<f32> = arg_parts
        .into_iter()
        .filter(|a| !a.trim().is_empty())
        .map(|a| parse_num(a, "lens ops"))
        .collect::<Result<_, _>>()?;
    match (name.trim(), nums.as_slice()) {
        ("translate", [x, y]) => Ok(LensOp::Translate { x: *x, y: *y }),
        ("rotate", [d]) => Ok(LensOp::Rotate { deg: *d }),
        ("scale", [s]) => Ok(LensOp::Scale { x: *s, y: *s }),
        ("scale", [x, y]) => Ok(LensOp::Scale { x: *x, y: *y }),
        ("skew-x", [d]) => Ok(LensOp::Skew {
            x_deg: *d,
            y_deg: 0.0,
        }),
        ("skew-y", [d]) => Ok(LensOp::Skew {
            x_deg: 0.0,
            y_deg: *d,
        }),
        ("skew", [x, y]) => Ok(LensOp::Skew {
            x_deg: *x,
            y_deg: *y,
        }),
        ("matrix", [a, b, c, d, e, f]) => Ok(LensOp::Matrix {
            m: [*a, *b, *c, *d, *e, *f],
        }),
        _ => err(format!("bad lens op `{raw}`")),
    }
}

fn validate_grida_xml_declaration(decl: &BytesDecl<'_>) -> Result<(), ParseError> {
    let raw = std::str::from_utf8(decl.as_ref())
        .map_err(|_| ParseError("XML declaration must be UTF-8".into()))?;
    let mut fields = vec![];
    for attr in Attributes::new(raw, 3) {
        let attr = attr.map_err(|error| ParseError(format!("XML declaration: {error}")))?;
        let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
        let value = attr
            .unescape_value()
            .map_err(|error| ParseError(format!("XML declaration: {error}")))?
            .to_string();
        fields.push((key, value));
    }

    let valid = match fields.as_slice() {
        [(version_key, version)] => version_key == "version" && version == "1.0",
        [(version_key, version), (encoding_key, encoding)] => {
            version_key == "version"
                && version == "1.0"
                && encoding_key == "encoding"
                && encoding.eq_ignore_ascii_case("UTF-8")
        }
        _ => false,
    };
    if !valid {
        return err(
            "XML declaration must be version=\"1.0\" with optional encoding=\"UTF-8\" only",
        );
    }
    Ok(())
}

fn collect_attributes(el: &BytesStart<'_>) -> Result<BTreeMap<String, String>, ParseError> {
    let tag = String::from_utf8_lossy(el.name().as_ref()).to_string();
    let mut attributes = BTreeMap::new();
    for attr in el.attributes() {
        let attr = attr.map_err(|error| ParseError(format!("attr on <{tag}>: {error}")))?;
        let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
        let value = attr
            .unescape_value()
            .map_err(|error| ParseError(format!("attr value on <{tag}>: {error}")))?
            .to_string();
        if attributes.insert(key.clone(), value).is_some() {
            return err(format!("duplicate `{key}` on <{tag}>"));
        }
    }
    Ok(attributes)
}

fn take_required(
    attributes: &mut BTreeMap<String, String>,
    key: &str,
    tag: &str,
) -> Result<String, ParseError> {
    attributes
        .remove(key)
        .ok_or_else(|| ParseError(format!("<{tag}> requires `{key}`")))
}

fn reject_unknown_attribute(
    attributes: &BTreeMap<String, String>,
    tag: &str,
) -> Result<(), ParseError> {
    if let Some(key) = attributes.keys().next() {
        return err(format!("unknown attribute `{key}` on <{tag}>"));
    }
    Ok(())
}

fn parse_color(s: &str, what: &str) -> Result<Color, ParseError> {
    Color::from_grida_hex(s).ok_or_else(|| ParseError(format!("{what} must be #RGB or #RRGGBB")))
}

fn parse_opacity(s: &str, what: &str) -> Result<f32, ParseError> {
    let opacity = parse_num(s, what)?;
    if !(0.0..=1.0).contains(&opacity) {
        return err(format!("{what} must be between 0 and 1 inclusive"));
    }
    Ok(opacity)
}

fn parse_pair_f64(s: &str, what: &str) -> Result<(f64, f64), ParseError> {
    let parts: Vec<_> = s.split_whitespace().collect();
    let [x, y] = parts.as_slice() else {
        return err(format!("{what} requires exactly two numbers"));
    };
    Ok((parse_num_f64(x, what)?, parse_num_f64(y, what)?))
}

fn parse_affine(s: &str, what: &str) -> Result<crate::math::Affine, ParseError> {
    let parts: Vec<_> = s.split_whitespace().collect();
    let [a, b, c, d, e, f] = parts.as_slice() else {
        return err(format!("{what} requires exactly six numbers"));
    };
    Ok(crate::math::Affine {
        a: parse_num(a, what)?,
        b: parse_num(b, what)?,
        c: parse_num(c, what)?,
        d: parse_num(d, what)?,
        e: parse_num(e, what)?,
        f: parse_num(f, what)?,
    })
}

fn parse_blend_mode(s: &str) -> Result<BlendMode, ParseError> {
    match s {
        "normal" => Ok(BlendMode::Normal),
        "multiply" => Ok(BlendMode::Multiply),
        "screen" => Ok(BlendMode::Screen),
        "overlay" => Ok(BlendMode::Overlay),
        "darken" => Ok(BlendMode::Darken),
        "lighten" => Ok(BlendMode::Lighten),
        "color-dodge" => Ok(BlendMode::ColorDodge),
        "color-burn" => Ok(BlendMode::ColorBurn),
        "hard-light" => Ok(BlendMode::HardLight),
        "soft-light" => Ok(BlendMode::SoftLight),
        "difference" => Ok(BlendMode::Difference),
        "exclusion" => Ok(BlendMode::Exclusion),
        "hue" => Ok(BlendMode::Hue),
        "saturation" => Ok(BlendMode::Saturation),
        "color" => Ok(BlendMode::Color),
        "luminosity" => Ok(BlendMode::Luminosity),
        "pass-through" => err("pass-through is a layer mode, not a paint blend-mode"),
        _ => err(format!("unknown paint blend-mode `{s}`")),
    }
}

fn parse_tile_mode(s: &str) -> Result<TileMode, ParseError> {
    match s {
        "clamp" => Ok(TileMode::Clamp),
        "repeated" => Ok(TileMode::Repeated),
        "mirror" => Ok(TileMode::Mirror),
        "decal" => Ok(TileMode::Decal),
        _ => err(format!("bad tile-mode `{s}`")),
    }
}

fn parse_box_fit(s: &str) -> Result<BoxFit, ParseError> {
    match s {
        "contain" => Ok(BoxFit::Contain),
        "cover" => Ok(BoxFit::Cover),
        "fill" => Ok(BoxFit::Fill),
        "none" => Ok(BoxFit::None),
        _ => err(format!("bad image fit `{s}`")),
    }
}

#[derive(Debug, Clone, Copy)]
struct PaintCommon {
    active: bool,
    opacity: f32,
    blend_mode: BlendMode,
}

fn take_paint_common(
    attributes: &mut BTreeMap<String, String>,
    tag: &str,
) -> Result<PaintCommon, ParseError> {
    let active = match attributes.remove("visible") {
        Some(value) => parse_bool(&value, &format!("visible on <{tag}>"), true)?,
        None => true,
    };
    let opacity = match attributes.remove("opacity") {
        Some(value) => parse_opacity(&value, &format!("opacity on <{tag}>"))?,
        None => 1.0,
    };
    let blend_mode = match attributes.remove("blend-mode") {
        Some(value) => parse_blend_mode(&value)?,
        None => BlendMode::Normal,
    };
    Ok(PaintCommon {
        active,
        opacity,
        blend_mode,
    })
}

fn parse_solid(mut attributes: BTreeMap<String, String>) -> Result<Paint, ParseError> {
    let color = parse_color(
        &take_required(&mut attributes, "color", "solid")?,
        "solid color",
    )?;
    let common = take_paint_common(&mut attributes, "solid")?;
    reject_unknown_attribute(&attributes, "solid")?;
    Ok(Paint::Solid(SolidPaint {
        active: common.active,
        color: color.with_opacity(common.opacity),
        blend_mode: common.blend_mode,
    }))
}

fn parse_image_paint(mut attributes: BTreeMap<String, String>) -> Result<Paint, ParseError> {
    let src = take_required(&mut attributes, "src", "image")?;
    if src.trim().is_empty() {
        return err("image src must not be empty");
    }
    let fit = match attributes.remove("fit") {
        Some(value) => parse_box_fit(&value)?,
        None => BoxFit::Cover,
    };
    let common = take_paint_common(&mut attributes, "image")?;
    reject_unknown_attribute(&attributes, "image")?;
    let mut image = ImagePaint::from_rid(src);
    image.fit = ImagePaintFit::Fit(fit);
    image.active = common.active;
    image.opacity = common.opacity;
    image.blend_mode = common.blend_mode;
    Ok(Paint::Image(image))
}

fn parse_stop(mut attributes: BTreeMap<String, String>) -> Result<GradientStop, ParseError> {
    let offset = parse_num(
        &take_required(&mut attributes, "offset", "stop")?,
        "stop offset",
    )?;
    if !(0.0..=1.0).contains(&offset) {
        return err("stop offset must be between 0 and 1 inclusive");
    }
    let color = parse_color(
        &take_required(&mut attributes, "color", "stop")?,
        "stop color",
    )?;
    let opacity = match attributes.remove("opacity") {
        Some(value) => parse_opacity(&value, "stop opacity")?,
        None => 1.0,
    };
    reject_unknown_attribute(&attributes, "stop")?;
    Ok(GradientStop {
        offset,
        color: color.with_opacity(opacity),
    })
}

fn parse_gradient_stops(
    reader: &mut Reader<&[u8]>,
    gradient_tag: &str,
) -> Result<Vec<GradientStop>, ParseError> {
    let mut stops: Vec<GradientStop> = vec![];
    loop {
        match reader.read_event() {
            Err(error) => return err(format!("xml in <{gradient_tag}>: {error}")),
            Ok(Event::Eof) => return err(format!("unclosed <{gradient_tag}>")),
            Ok(Event::Empty(el)) => {
                let tag = String::from_utf8_lossy(el.name().as_ref()).to_string();
                if tag != "stop" {
                    return err(format!(
                        "<{gradient_tag}> may contain only empty <stop> elements, found <{tag}>"
                    ));
                }
                let stop = parse_stop(collect_attributes(&el)?)?;
                if let Some(previous) = stops.last() {
                    if stop.offset < previous.offset {
                        return err(format!(
                            "gradient stop offsets must be nondecreasing ({} follows {})",
                            stop.offset, previous.offset
                        ));
                    }
                }
                stops.push(stop);
            }
            Ok(Event::Start(el)) => {
                let tag = String::from_utf8_lossy(el.name().as_ref()).to_string();
                if tag == "stop" {
                    return err("<stop> must be empty; use <stop .../>");
                }
                return err(format!(
                    "<{gradient_tag}> may contain only empty <stop> elements, found <{tag}>"
                ));
            }
            Ok(Event::End(el)) => {
                let tag = String::from_utf8_lossy(el.name().as_ref()).to_string();
                if tag != gradient_tag {
                    return err(format!("mismatched end tag </{tag}> in <{gradient_tag}>"));
                }
                if stops.len() < 2 {
                    return err(format!("<{gradient_tag}> requires at least two stops"));
                }
                return Ok(stops);
            }
            Ok(Event::Text(text)) => {
                let text = text
                    .unescape()
                    .map_err(|error| ParseError(format!("text in <{gradient_tag}>: {error}")))?;
                if !text.trim().is_empty() {
                    return err(format!(
                        "character content is not allowed in <{gradient_tag}>"
                    ));
                }
            }
            Ok(Event::Comment(_)) => {}
            Ok(Event::CData(_) | Event::Decl(_) | Event::PI(_) | Event::DocType(_)) => {
                return err(format!("unsupported XML event in <{gradient_tag}>"));
            }
        }
    }
}

fn parse_gradient(
    mut attributes: BTreeMap<String, String>,
    stops: Vec<GradientStop>,
) -> Result<Paint, ParseError> {
    let kind = take_required(&mut attributes, "kind", "gradient")?;
    let common = take_paint_common(&mut attributes, "gradient")?;
    let transform = match attributes.remove("transform") {
        Some(value) => parse_affine(&value, "transform on <gradient>")?,
        None => crate::math::Affine::IDENTITY,
    };

    let paint = match kind.as_str() {
        "linear" => {
            let from = match attributes.remove("from") {
                Some(value) => parse_pair_f64(&value, "from on <gradient kind=\"linear\">")?,
                None => (0.0, 0.5),
            };
            let to = match attributes.remove("to") {
                Some(value) => parse_pair_f64(&value, "to on <gradient kind=\"linear\">")?,
                None => (1.0, 0.5),
            };
            let xy1 = Alignment::from_uv_f64(from.0, from.1);
            let xy2 = Alignment::from_uv_f64(to.0, to.1);
            if !xy1.0.is_finite() || !xy1.1.is_finite() || !xy2.0.is_finite() || !xy2.1.is_finite()
            {
                return err("linear gradient endpoints overflow after lowering to model alignment");
            }
            if xy1 == xy2 {
                return err(
                    "linear gradient from and to must differ after lowering to model alignment",
                );
            }
            let tile_mode = match attributes.remove("tile-mode") {
                Some(value) => parse_tile_mode(&value)?,
                None => TileMode::Clamp,
            };
            Paint::LinearGradient(LinearGradientPaint {
                active: common.active,
                xy1,
                xy2,
                tile_mode,
                transform,
                stops,
                opacity: common.opacity,
                blend_mode: common.blend_mode,
            })
        }
        "radial" => {
            let tile_mode = match attributes.remove("tile-mode") {
                Some(value) => parse_tile_mode(&value)?,
                None => TileMode::Clamp,
            };
            Paint::RadialGradient(RadialGradientPaint {
                active: common.active,
                transform,
                stops,
                opacity: common.opacity,
                blend_mode: common.blend_mode,
                tile_mode,
            })
        }
        "sweep" => Paint::SweepGradient(SweepGradientPaint {
            active: common.active,
            transform,
            stops,
            opacity: common.opacity,
            blend_mode: common.blend_mode,
        }),
        "diamond" => Paint::DiamondGradient(DiamondGradientPaint {
            active: common.active,
            transform,
            stops,
            opacity: common.opacity,
            blend_mode: common.blend_mode,
        }),
        _ => {
            return err(format!(
                "gradient kind must be `linear`, `radial`, `sweep`, or `diamond`, found `{kind}`"
            ));
        }
    };
    reject_unknown_attribute(&attributes, "gradient")?;
    Ok(paint)
}

fn is_typed_paint_tag(tag: &str) -> bool {
    matches!(tag, "solid" | "gradient" | "image")
}

fn is_legacy_gradient_tag(tag: &str) -> bool {
    matches!(
        tag,
        "linear-gradient" | "radial-gradient" | "sweep-gradient" | "diamond-gradient"
    )
}

fn parse_paint_element(
    reader: &mut Reader<&[u8]>,
    el: &BytesStart<'_>,
    is_empty: bool,
    channel_tag: &str,
) -> Result<Paint, ParseError> {
    let tag = String::from_utf8_lossy(el.name().as_ref()).to_string();
    let attributes = collect_attributes(el)?;
    match (tag.as_str(), is_empty) {
        ("solid", true) => parse_solid(attributes),
        ("image", true) => parse_image_paint(attributes),
        ("gradient", false) => {
            let stops = parse_gradient_stops(reader, "gradient")?;
            parse_gradient(attributes, stops)
        }
        ("gradient", true) => err("<gradient> requires at least two stops"),
        ("solid" | "image", false) => err(format!("<{tag}> must be empty; use <{tag} .../>")),
        ("fill" | "stroke", _) => err(format!("nested <{tag}> is not allowed")),
        _ if is_legacy_gradient_tag(&tag) => {
            err("kind-specific gradient tags are not Draft 0; use <gradient kind=\"…\">")
        }
        _ => err(format!("unknown paint element <{tag}> in <{channel_tag}>")),
    }
}

fn parse_paint_channel(
    reader: &mut Reader<&[u8]>,
    channel_tag: &str,
) -> Result<Paints, ParseError> {
    let mut paints = Paints::default();
    loop {
        match reader.read_event() {
            Err(error) => return err(format!("xml in <{channel_tag}>: {error}")),
            Ok(Event::Eof) => return err(format!("unclosed <{channel_tag}>")),
            Ok(Event::Empty(el)) => {
                paints.push(parse_paint_element(reader, &el, true, channel_tag)?);
            }
            Ok(Event::Start(el)) => {
                paints.push(parse_paint_element(reader, &el, false, channel_tag)?);
            }
            Ok(Event::End(el)) => {
                let tag = String::from_utf8_lossy(el.name().as_ref()).to_string();
                if tag != channel_tag {
                    return err(format!("mismatched end tag </{tag}> in <{channel_tag}>"));
                }
                return Ok(paints);
            }
            Ok(Event::Text(text)) => {
                let text = text
                    .unescape()
                    .map_err(|error| ParseError(format!("text in <{channel_tag}>: {error}")))?;
                if !text.trim().is_empty() {
                    return err(format!(
                        "character content is not allowed in <{channel_tag}>"
                    ));
                }
            }
            Ok(Event::Comment(_)) => {}
            Ok(Event::CData(_) | Event::Decl(_) | Event::PI(_) | Event::DocType(_)) => {
                return err(format!("unsupported XML event in <{channel_tag}>"));
            }
        }
    }
}

fn supports_fill(payload: &Payload) -> bool {
    matches!(
        payload,
        Payload::Frame { .. } | Payload::Text { .. } | Payload::AttributedText { .. }
    ) || matches!(
        payload,
        Payload::Shape {
            desc: ShapeDesc::Rect | ShapeDesc::Ellipse | ShapeDesc::Path(_)
        }
    )
}

fn path_aware_kind_name(payload: &Payload) -> &'static str {
    if matches!(
        payload,
        Payload::Shape {
            desc: ShapeDesc::Path(_)
        }
    ) {
        "path"
    } else {
        payload.kind_name()
    }
}

fn grida_xml_default_fills(payload: &Payload) -> Paints {
    match payload {
        Payload::Shape {
            desc: ShapeDesc::Rect | ShapeDesc::Ellipse | ShapeDesc::Path(_),
        }
        | Payload::Text { .. }
        | Payload::AttributedText { .. } => Paints::solid(Color::BLACK),
        Payload::Frame { .. }
        | Payload::Shape {
            desc: ShapeDesc::Line,
        }
        | Payload::Group
        | Payload::Lens { .. } => Paints::default(),
    }
}

fn parse_stroke_align(value: &str) -> Result<StrokeAlign, ParseError> {
    match value {
        "inside" => Ok(StrokeAlign::Inside),
        "center" => Ok(StrokeAlign::Center),
        "outside" => Ok(StrokeAlign::Outside),
        _ => err(format!(
            "stroke align must be `inside`, `center`, or `outside`, found `{value}`"
        )),
    }
}

fn parse_stroke_cap(value: &str) -> Result<StrokeCap, ParseError> {
    match value {
        "butt" => Ok(StrokeCap::Butt),
        "round" => Ok(StrokeCap::Round),
        "square" => Ok(StrokeCap::Square),
        _ => err(format!(
            "stroke cap must be `butt`, `round`, or `square`, found `{value}`"
        )),
    }
}

fn parse_stroke_join(value: &str) -> Result<StrokeJoin, ParseError> {
    match value {
        "miter" => Ok(StrokeJoin::Miter),
        "round" => Ok(StrokeJoin::Round),
        "bevel" => Ok(StrokeJoin::Bevel),
        _ => err(format!(
            "stroke join must be `miter`, `round`, or `bevel`, found `{value}`"
        )),
    }
}

fn parse_dash_array(value: &str) -> Result<Vec<f32>, ParseError> {
    let mut values: Vec<f32> = value
        .split_whitespace()
        .map(|part| parse_non_negative(part, "dash-array", true))
        .collect::<Result<_, _>>()?;
    if values.is_empty() {
        return err("dash-array requires at least one non-negative number");
    }
    if values.iter().all(|value| *value == 0.0) {
        return err("dash-array must not be all zero");
    }
    if values.len() % 2 == 1 {
        let repeated = values.clone();
        values.extend(repeated);
    }
    Ok(values)
}

fn parse_stroke_width(value: &str, payload: &Payload) -> Result<StrokeWidth, ParseError> {
    let parts: Vec<&str> = value.split_whitespace().collect();
    match parts.as_slice() {
        [width] => {
            Ok(StrokeWidth::Uniform(parse_non_negative(width, "stroke width", true)?).normalized())
        }
        [top, right, bottom, left] => {
            let supports_per_side = matches!(payload, Payload::Frame { .. })
                || matches!(
                    payload,
                    Payload::Shape {
                        desc: ShapeDesc::Rect
                    }
                );
            if !supports_per_side {
                return err(format!(
                    "four-value stroke width is valid only on <container> and <rect>, not <{}>",
                    path_aware_kind_name(payload)
                ));
            }
            let top = parse_non_negative(top, "stroke width top", true)?;
            let right = parse_non_negative(right, "stroke width right", true)?;
            let bottom = parse_non_negative(bottom, "stroke width bottom", true)?;
            let left = parse_non_negative(left, "stroke width left", true)?;
            Ok(StrokeWidth::Rectangular(RectangularStrokeWidth {
                stroke_top_width: top,
                stroke_right_width: right,
                stroke_bottom_width: bottom,
                stroke_left_width: left,
            })
            .normalized())
        }
        _ => err(format!(
            "stroke width takes 1 or exactly 4 numbers in top right bottom left order; got {}",
            parts.len()
        )),
    }
}

fn parse_stroke(
    mut attributes: BTreeMap<String, String>,
    payload: &Payload,
    corner_smoothing: CornerSmoothing,
    paints: Paints,
) -> Result<Stroke, ParseError> {
    let mut stroke = Stroke::default_for(payload).ok_or_else(|| {
        ParseError(format!(
            "<stroke> is not valid on <{}>",
            path_aware_kind_name(payload)
        ))
    })?;
    stroke.paints = paints;

    if let Some(value) = attributes.remove("width") {
        stroke.width = parse_stroke_width(&value, payload)?;
    }
    if let Some(value) = attributes.remove("align") {
        stroke.align = parse_stroke_align(&value)?;
    }

    let is_line = matches!(
        payload,
        Payload::Shape {
            desc: ShapeDesc::Line
        }
    );
    let path = match payload {
        Payload::Shape {
            desc: ShapeDesc::Path(path),
        } => Some(path),
        _ => None,
    };
    let supports_join = matches!(
        payload,
        Payload::Frame { .. }
            | Payload::Shape {
                desc: ShapeDesc::Rect
            }
    ) || path.is_some();
    let supports_dash = matches!(
        payload,
        Payload::Frame { .. }
            | Payload::Shape {
                desc: ShapeDesc::Rect | ShapeDesc::Ellipse | ShapeDesc::Line | ShapeDesc::Path(_)
            }
    );

    if let Some(value) = attributes.remove("cap") {
        if !is_line && path.is_none() {
            return err("stroke attribute `cap` is valid only on <line> and <path>");
        }
        stroke.cap = parse_stroke_cap(&value)?;
    }
    if let Some(value) = attributes.remove("join") {
        if !supports_join {
            return err("stroke attribute `join` is valid only on <container>, <rect>, and <path>");
        }
        stroke.join = parse_stroke_join(&value)?;
    }
    if let Some(value) = attributes.remove("miter-limit") {
        if !supports_join {
            return err(
                "stroke attribute `miter-limit` is valid only on <container>, <rect>, and <path>",
            );
        }
        stroke.miter_limit = parse_positive(&value, "stroke miter-limit", true)?;
    }
    if let Some(value) = attributes.remove("dash-array") {
        if !supports_dash {
            return err("stroke attribute `dash-array` is not valid on <text>");
        }
        stroke.dash_array = Some(parse_dash_array(&value)?);
    }
    if is_line && stroke.align != StrokeAlign::Center {
        return err("a <line> stroke must use align=\"center\"");
    }
    if path.is_some_and(|path| !path.all_contours_closed) && stroke.align != StrokeAlign::Center {
        return err(
            "a <path> stroke may use inside/outside alignment only when every drawable contour is explicitly closed",
        );
    }
    if matches!(stroke.width, StrokeWidth::Rectangular(_)) {
        if !corner_smoothing.is_zero() {
            return err("per-side stroke width requires corner-smoothing=\"0\" in Draft 0");
        }
        let default = Stroke::default_for(payload).expect("validated stroke target");
        if stroke.join != default.join || stroke.miter_limit != default.miter_limit {
            return err(
                "per-side stroke width requires the default join=\"miter\" and miter-limit=\"4\" in Draft 0",
            );
        }
    }
    reject_unknown_attribute(&attributes, "stroke")?;
    Ok(stroke)
}

fn parse_font_weight(value: &str, tag: &str) -> Result<u32, ParseError> {
    let weight: u32 = value.trim().parse().map_err(|_| {
        ParseError(format!(
            "font-weight on <{tag}> must be an integer from 1 through 1000"
        ))
    })?;
    if !(1..=1000).contains(&weight) {
        return err(format!(
            "font-weight on <{tag}> must be an integer from 1 through 1000"
        ));
    }
    Ok(weight)
}

fn parse_font_style(value: &str, tag: &str) -> Result<bool, ParseError> {
    match value {
        "normal" => Ok(false),
        "italic" => Ok(true),
        _ => err(format!(
            "font-style on <{tag}> must be `normal` or `italic`"
        )),
    }
}

fn is_html_inline_semantic_tag(tag: &str) -> bool {
    matches!(
        tag,
        "strong" | "em" | "b" | "i" | "code" | "mark" | "a" | "small" | "sub" | "sup" | "br"
    )
}

fn html_inline_semantic_error<T>(tag: &str) -> Result<T, ParseError> {
    err(format!(
        "HTML inline <{tag}> has no lossless attributed-text destination; use explicit <tspan> styling{}",
        if tag == "br" { " and a newline character" } else { "" }
    ))
}

#[derive(Debug, Clone, PartialEq)]
struct PendingTextSegment {
    text: String,
    style: TextStyleRec,
    fills: Option<Paints>,
}

/// Parse one complete inline run. A tspan is source structure only: it does
/// not enter the scene-node stack and lowers directly to a flat byte range.
fn parse_tspan(
    reader: &mut Reader<&[u8]>,
    el: &BytesStart<'_>,
    inherited_style: TextStyleRec,
) -> Result<PendingTextSegment, ParseError> {
    let mut attributes = collect_attributes(el)?;
    let mut style = inherited_style;
    if let Some(value) = attributes.remove("font-size") {
        style.font_size = parse_positive(&value, "font-size on <tspan>", true)?;
    }
    if let Some(value) = attributes.remove("font-weight") {
        style.font_weight = parse_font_weight(&value, "tspan")?;
    }
    if let Some(value) = attributes.remove("font-style") {
        style.font_style_italic = parse_font_style(&value, "tspan")?;
    }
    let mut fills = attributes
        .remove("fill")
        .map(|value| parse_color(&value, "fill on <tspan>").map(Paints::solid))
        .transpose()?;

    if let Some(attribute) = ["x", "y", "dx", "dy", "rotate"]
        .into_iter()
        .find(|name| attributes.contains_key(*name))
    {
        return err(format!(
            "SVG positioning attribute `{attribute}` is not valid on <tspan>; Grida text runs carry style, not independent geometry"
        ));
    }
    reject_unknown_attribute(&attributes, "tspan")?;

    let mut text = String::new();
    let mut fill_child_seen = false;
    let mut event_before_fill = false;
    loop {
        match reader.read_event() {
            Err(error) => return err(format!("xml in <tspan>: {error}")),
            Ok(Event::Eof) => return err("unclosed <tspan>"),
            Ok(Event::Text(value)) => {
                let value = value
                    .unescape()
                    .map_err(|error| ParseError(format!("text in <tspan>: {error}")))?;
                // Mixed text is exact. Even whitespace-only XML character
                // data is content, so a structural fill must precede it.
                event_before_fill = true;
                text.push_str(&value);
            }
            Ok(event @ (Event::Start(_) | Event::Empty(_))) => {
                let is_empty = matches!(event, Event::Empty(_));
                let child = match event {
                    Event::Start(child) | Event::Empty(child) => child,
                    _ => unreachable!(),
                };
                let child_tag = String::from_utf8_lossy(child.name().as_ref()).to_string();
                match child_tag.as_str() {
                    "fill" => {
                        if event_before_fill {
                            return err(
                                "<fill> inside <tspan> must be the first child/event and precede all character content",
                            );
                        }
                        if fill_child_seen {
                            return err("duplicate <fill> inside <tspan>");
                        }
                        if fills.is_some() {
                            return err(
                                "<tspan> cannot use both the `fill` attribute and <fill>",
                            );
                        }
                        let fill_attributes = collect_attributes(&child)?;
                        reject_unknown_attribute(&fill_attributes, "fill")?;
                        fills = Some(if is_empty {
                            Paints::default()
                        } else {
                            parse_paint_channel(reader, "fill")?
                        });
                        fill_child_seen = true;
                    }
                    "tspan" => return err("nested <tspan> is not allowed; text runs are flat"),
                    "span" => return err("<span> is not canonical Grida XML; use <tspan>"),
                    "stroke" => {
                        return err(
                            "<stroke> inside <tspan> is not supported until run stroke geometry matches the production model",
                        )
                    }
                    tag if is_html_inline_semantic_tag(tag) => {
                        return html_inline_semantic_error(tag)
                    }
                    _ => {
                        return err(format!(
                            "<{child_tag}> is not allowed inside <tspan>; only a leading <fill> property and character data are valid"
                        ))
                    }
                }
            }
            Ok(Event::End(end)) => {
                let tag = String::from_utf8_lossy(end.name().as_ref()).to_string();
                if tag != "tspan" {
                    return err(format!("mismatched end tag </{tag}> in <tspan>"));
                }
                if text.is_empty() {
                    return err("<tspan> must contain at least one character");
                }
                return Ok(PendingTextSegment { text, style, fills });
            }
            Ok(Event::Comment(_)) => {
                if !fill_child_seen {
                    event_before_fill = true;
                }
            }
            Ok(Event::CData(_) | Event::Decl(_) | Event::PI(_) | Event::DocType(_)) => {
                return err("unsupported XML event in <tspan>")
            }
        }
    }
}

struct Pending {
    id: NodeId,
    tag: String,
    text_content: String,
    text_segments: Vec<PendingTextSegment>,
    default_text_style: Option<TextStyleRec>,
    is_text: bool,
    fill_seen: bool,
    stroke_seen: bool,
    legacy_fill_seen: bool,
    content_started: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Dialect {
    TextIr,
    GridaXml,
}

pub fn parse(input: &str) -> Result<Document, ParseError> {
    parse_with_dialect(input, Dialect::TextIr)
}

/// Shared parser core for the first-class `.grida.xml` surface. Kept
/// crate-private so the historical [`parse`] contract remains exactly the
/// experiment grammar while `grida_xml` owns its public error vocabulary.
pub(crate) fn parse_grida_xml(input: &str) -> Result<Document, ParseError> {
    parse_with_dialect(input, Dialect::GridaXml)
}

fn parse_with_dialect(input: &str, dialect: Dialect) -> Result<Document, ParseError> {
    let mut reader = Reader::from_str(input);
    let grida_xml = dialect == Dialect::GridaXml;
    // Draft 0 preserves authored whitespace inside <text>. Historical TextIr
    // keeps its experiment-era trimming behavior for compatibility.
    reader.config_mut().trim_text(!grida_xml);

    let mut nodes: BTreeMap<NodeId, Node> = BTreeMap::new();
    let mut stack: Vec<Pending> = vec![];
    let mut next_id: NodeId = 0;
    let mut root: Option<NodeId> = None;
    let mut render_root: Option<NodeId> = None;
    let mut envelope_open = false;
    let mut envelope_closed = false;
    let mut declaration_seen = false;
    let mut pre_declaration_content = false;

    if grida_xml {
        // `.grida.xml`'s envelope is structural, while the model's root is
        // the canonical viewport-spanning frame. The one authored render
        // root is attached beneath it rather than replacing it.
        let root_doc = DocBuilder::new().build();
        let root_id = root_doc.root;
        nodes.insert(root_id, root_doc.get(root_id).clone());
        next_id = 1;
        root = Some(root_id);
    }

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

                if grida_xml && tag == "grida" {
                    if is_empty {
                        return err("<grida> must contain exactly one render root");
                    }
                    if envelope_open || envelope_closed || !stack.is_empty() {
                        return err("<grida> must be the single document envelope");
                    }
                    let mut version: Option<String> = None;
                    for attr in el.attributes() {
                        let attr = attr.map_err(|e| ParseError(format!("attr: {e}")))?;
                        let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                        let val = attr
                            .unescape_value()
                            .map_err(|e| ParseError(format!("attr value: {e}")))?
                            .to_string();
                        if key != "version" {
                            return err(format!("unknown attribute `{key}` on <grida>"));
                        }
                        if version.replace(val).is_some() {
                            return err("duplicate `version` on <grida>");
                        }
                    }
                    match version.as_deref() {
                        Some("0") => {}
                        Some(v) => return err(format!("unsupported <grida> version `{v}`")),
                        None => return err("<grida> requires version=\"0\""),
                    }
                    envelope_open = true;
                    continue;
                }

                if grida_xml && (!envelope_open || envelope_closed) {
                    return err(format!("<{tag}> must be inside <grida version=\"0\">"));
                }
                if grida_xml && tag == "tspan" {
                    let parent = stack.last_mut().ok_or_else(|| {
                        ParseError("<tspan> must be a direct child of <text>".into())
                    })?;
                    if !parent.is_text {
                        return err(format!(
                            "<tspan> must be a direct child of <text>, not <{}>",
                            parent.tag
                        ));
                    }
                    if is_empty {
                        return err("<tspan> must contain at least one character");
                    }
                    let inherited_style = parent
                        .default_text_style
                        .expect("text pending state carries its default style");
                    if !parent.text_content.is_empty() {
                        parent.text_segments.push(PendingTextSegment {
                            text: std::mem::take(&mut parent.text_content),
                            style: inherited_style,
                            fills: None,
                        });
                    }
                    parent.content_started = true;
                    let segment = parse_tspan(&mut reader, &el, inherited_style)?;
                    stack
                        .last_mut()
                        .expect("parent remains open")
                        .text_segments
                        .push(segment);
                    continue;
                }
                if grida_xml
                    && stack.last().is_some_and(|parent| parent.is_text)
                    && is_html_inline_semantic_tag(&tag)
                {
                    return html_inline_semantic_error(&tag);
                }
                if grida_xml && tag == "span" && stack.last().is_some_and(|parent| parent.is_text) {
                    return err("<span> is not canonical Grida XML; use <tspan>");
                }
                if grida_xml && matches!(tag.as_str(), "fill" | "stroke") {
                    let attributes = collect_attributes(&el)?;
                    let parent = stack.last().ok_or_else(|| {
                        ParseError(format!(
                            "<{tag}> must be a direct child of a paintable node"
                        ))
                    })?;
                    if parent.content_started {
                        return err(format!(
                            "<{tag}> must appear before content or scene children in <{}>",
                            parent.tag
                        ));
                    }
                    let parent_id = parent.id;
                    let parent_tag = parent.tag.clone();
                    let parent_node = nodes.get(&parent_id).unwrap();
                    let payload = parent_node.payload.clone();
                    let corner_smoothing = parent_node.corner_smoothing;

                    // Whitespace before or between leading text properties is
                    // formatting, not character content. The same buffer is
                    // retained when no later property appears, preserving all
                    // authored text after the final property.
                    if parent.is_text {
                        debug_assert!(parent.text_content.trim().is_empty());
                        stack.last_mut().unwrap().text_content.clear();
                    }

                    match tag.as_str() {
                        "fill" => {
                            let parent = stack.last().expect("parent remains open");
                            if parent.fill_seen {
                                return err(format!("duplicate <fill> on <{}>", parent.tag));
                            }
                            if parent.stroke_seen {
                                return err(format!(
                                    "<fill> must precede <stroke> elements in <{}>",
                                    parent.tag
                                ));
                            }
                            if parent.legacy_fill_seen {
                                return err(format!(
                                    "<{}> cannot use both the `fill` attribute and <fill>",
                                    parent.tag
                                ));
                            }
                            if !supports_fill(&payload) {
                                return err(format!("<fill> is not valid on <{parent_tag}>"));
                            }
                            reject_unknown_attribute(&attributes, "fill")?;
                            let paints = if is_empty {
                                Paints::default()
                            } else {
                                parse_paint_channel(&mut reader, "fill")?
                            };
                            nodes.get_mut(&parent_id).unwrap().fills = paints;
                            stack.last_mut().unwrap().fill_seen = true;
                        }
                        "stroke" => {
                            if matches!(payload, Payload::Group | Payload::Lens { .. }) {
                                return err(format!("<stroke> is not valid on <{parent_tag}>"));
                            }
                            let paints = if is_empty {
                                Paints::default()
                            } else {
                                parse_paint_channel(&mut reader, "stroke")?
                            };
                            let stroke =
                                parse_stroke(attributes, &payload, corner_smoothing, paints)?;
                            if stroke.paints.is_empty() && stroke.geometry_is_default_for(&payload)
                            {
                                return err(format!(
                                    "default empty <stroke> (empty stroke) on <{parent_tag}> is indistinguishable from omission"
                                ));
                            }
                            nodes.get_mut(&parent_id).unwrap().strokes.push(stroke);
                            stack.last_mut().unwrap().stroke_seen = true;
                        }
                        _ => unreachable!(),
                    }
                    continue;
                }
                if grida_xml && matches!(tag.as_str(), "fills" | "strokes") {
                    return err(format!(
                        "plural <{tag}> is not Draft 0; use singular <{}>",
                        if tag == "fills" { "fill" } else { "stroke" }
                    ));
                }
                if grida_xml && is_legacy_gradient_tag(&tag) {
                    return err(
                        "kind-specific gradient tags are not Draft 0; use <gradient kind=\"…\">",
                    );
                }
                if grida_xml && is_typed_paint_tag(&tag) {
                    if tag == "image" {
                        return err(
                            "scene <image> is not supported in Draft 0; place <image> directly inside <fill> or <stroke> for an image paint",
                        );
                    }
                    return err(format!(
                        "<{tag}> is a paint and must be a direct child of <fill> or <stroke>"
                    ));
                }
                if grida_xml && tag == "stop" {
                    return err("<stop> must be a direct child of a gradient paint");
                }
                if grida_xml && tag == "frame" {
                    return err("<frame> belongs to historical textir; use <container>");
                }
                if grida_xml && tag == "shape" {
                    return err(
                        "<shape> is reserved in Draft 0; use <rect>, <ellipse>, <line>, or <path>",
                    );
                }
                let is_authored_root = grida_xml && stack.is_empty() && render_root.is_none();
                if is_authored_root && tag != "container" {
                    return err(format!(
                        "the authored render root must be <container>, found <{tag}>"
                    ));
                }
                if stack.last().is_some_and(|parent| {
                    !nodes
                        .get(&parent.id)
                        .expect("open parent exists")
                        .payload
                        .accepts_children()
                }) {
                    let parent = stack.last().expect("checked above");
                    return err(format!(
                        "<{}> cannot contain child elements; use <container> for local composition",
                        parent.tag
                    ));
                }
                if let Some(parent) = stack.last_mut() {
                    parent.content_started = true;
                }

                let (node_tag, direct_shape_kind) = match (dialect, tag.as_str()) {
                    (Dialect::GridaXml, "container") => ("frame", None),
                    (Dialect::GridaXml, "rect") => ("shape", Some(ShapeDesc::Rect)),
                    (Dialect::GridaXml, "ellipse") => ("shape", Some(ShapeDesc::Ellipse)),
                    (Dialect::GridaXml, "line") => ("shape", Some(ShapeDesc::Line)),
                    (Dialect::GridaXml, "path") => ("path", None),
                    _ => (tag.as_str(), None),
                };
                let mut header = Header::new(SizeIntent::Auto, SizeIntent::Auto);
                let mut layout = LayoutBehavior::default();
                let mut shape_kind: Option<ShapeDesc> = direct_shape_kind;
                let mut path_d: Option<String> = None;
                let mut path_fill_rule = FillRule::NonZero;
                let mut font_size = 16.0f32;
                let mut font_weight = TextStyleRec::DEFAULT_FONT_WEIGHT;
                let mut font_style_italic = false;
                let mut lens_ops: Vec<LensOp> = vec![];
                let mut clips = false;
                let mut corner_radius = RectangularCornerRadius::default();
                let mut corner_smoothing = CornerSmoothing::default();
                let mut legacy_fill: Option<Color> = None;
                let mut width_seen = false;
                let mut height_seen = false;
                let mut x_seen = false;
                let mut y_seen = false;
                let mut flow_seen = false;
                let mut grow_seen = false;
                let mut align_seen = false;
                let mut box_constraint_seen = false;
                let mut aspect_seen = false;
                let mut corner_radius_seen = false;
                let mut corner_smoothing_seen = false;
                let mut frame_only_attr: Option<String> = None;
                let mut flex_only_attr: Option<String> = None;
                let mut shape_only_attr: Option<String> = None;
                let mut text_only_attr: Option<String> = None;
                let mut lens_only_attr: Option<String> = None;
                let mut path_only_attr: Option<String> = None;
                let strict = grida_xml;

                let mut source_attributes = el.attributes();
                source_attributes.with_checks(false);
                let mut seen_source_attributes = BTreeSet::new();
                for attr in source_attributes {
                    let attr = attr.map_err(|e| ParseError(format!("attr: {e}")))?;
                    let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                    if !seen_source_attributes.insert(key.clone()) {
                        return err(format!("duplicate `{key}` on <{tag}>"));
                    }
                    let val = attr
                        .unescape_value()
                        .map_err(|e| ParseError(format!("attr value: {e}")))?
                        .to_string();
                    match key.as_str() {
                        "name" => header.name = Some(val),
                        "x" => {
                            x_seen = true;
                            header.x = parse_binding(&val, "x")?;
                        }
                        "y" => {
                            y_seen = true;
                            header.y = parse_binding(&val, "y")?;
                        }
                        "w" if !grida_xml => {
                            if width_seen {
                                return err(format!("duplicate width attribute on <{tag}>"));
                            }
                            width_seen = true;
                            header.width = parse_size(&val, "width", false)?;
                        }
                        "width" if grida_xml => {
                            if width_seen {
                                return err(format!("duplicate width attribute on <{tag}>"));
                            }
                            width_seen = true;
                            header.width = parse_size(&val, "width", true)?;
                        }
                        "h" if !grida_xml => {
                            if height_seen {
                                return err(format!("duplicate height attribute on <{tag}>"));
                            }
                            height_seen = true;
                            header.height = parse_size(&val, "height", false)?;
                        }
                        "height" if grida_xml => {
                            if height_seen {
                                return err(format!("duplicate height attribute on <{tag}>"));
                            }
                            height_seen = true;
                            header.height = parse_size(&val, "height", true)?;
                        }
                        "min-w" if !grida_xml => {
                            header.min_width = Some(parse_non_negative(&val, "min-w", false)?)
                        }
                        "min-width" if grida_xml => {
                            box_constraint_seen = true;
                            header.min_width = Some(parse_non_negative(&val, "min-width", true)?)
                        }
                        "max-w" if !grida_xml => {
                            header.max_width = Some(parse_non_negative(&val, "max-w", false)?)
                        }
                        "max-width" if grida_xml => {
                            box_constraint_seen = true;
                            header.max_width = Some(parse_non_negative(&val, "max-width", true)?)
                        }
                        "min-h" if !grida_xml => {
                            header.min_height = Some(parse_non_negative(&val, "min-h", false)?)
                        }
                        "min-height" if grida_xml => {
                            box_constraint_seen = true;
                            header.min_height = Some(parse_non_negative(&val, "min-height", true)?)
                        }
                        "max-h" if !grida_xml => {
                            header.max_height = Some(parse_non_negative(&val, "max-h", false)?)
                        }
                        "max-height" if grida_xml => {
                            box_constraint_seen = true;
                            header.max_height = Some(parse_non_negative(&val, "max-height", true)?)
                        }
                        "aspect" if !grida_xml => {
                            let (a, b) = val
                                .split_once(':')
                                .ok_or_else(|| ParseError("aspect needs `w:h`".into()))?;
                            header.aspect_ratio =
                                Some((parse_num(a, "aspect")?, parse_num(b, "aspect")?));
                        }
                        "aspect-ratio" if grida_xml => {
                            box_constraint_seen = true;
                            aspect_seen = true;
                            let (a, b) = val
                                .split_once(':')
                                .ok_or_else(|| ParseError("aspect-ratio needs `w:h`".into()))?;
                            header.aspect_ratio = Some((
                                parse_positive(a, "aspect-ratio", true)?,
                                parse_positive(b, "aspect-ratio", true)?,
                            ));
                        }
                        "corner-radius" if grida_xml => {
                            if corner_radius_seen {
                                return err(format!(
                                    "duplicate corner-radius attribute on <{tag}>"
                                ));
                            }
                            corner_radius_seen = true;
                            corner_radius = parse_corner_radius(&val)?;
                        }
                        "corner-smoothing" if grida_xml => {
                            if corner_smoothing_seen {
                                return err(format!(
                                    "duplicate corner-smoothing attribute on <{tag}>"
                                ));
                            }
                            corner_smoothing_seen = true;
                            let value = parse_num(&val, "corner-smoothing")?;
                            if !(0.0..=1.0).contains(&value) {
                                return err("corner-smoothing must be between 0 and 1 inclusive");
                            }
                            corner_smoothing = CornerSmoothing(value);
                        }
                        "rotation" => header.rotation = parse_num(&val, "rotation")?,
                        "flip-x" => header.flip_x = parse_bool(&val, "flip-x", strict)?,
                        "flip-y" => header.flip_y = parse_bool(&val, "flip-y", strict)?,
                        "flow" => {
                            if is_authored_root {
                                return err("the authored root <container> cannot declare `flow`");
                            }
                            flow_seen = true;
                            header.flow = match val.as_str() {
                                "absolute" => Flow::Absolute,
                                "in" => Flow::InFlow,
                                _ => return err(format!("bad flow `{val}`")),
                            }
                        }
                        "grow" => {
                            if is_authored_root {
                                return err("the authored root <container> cannot declare `grow`");
                            }
                            grow_seen = true;
                            header.grow = parse_non_negative(&val, "grow", strict)?;
                        }
                        "align" => {
                            if is_authored_root {
                                return err("the authored root <container> cannot declare `align`");
                            }
                            align_seen = true;
                            header.self_align = match val.as_str() {
                                "start" => SelfAlign::Start,
                                "center" => SelfAlign::Center,
                                "end" => SelfAlign::End,
                                "stretch" => SelfAlign::Stretch,
                                _ => return err(format!("bad align `{val}`")),
                            }
                        }
                        "opacity" => {
                            let opacity = parse_num(&val, "opacity")?;
                            if strict && !(0.0..=1.0).contains(&opacity) {
                                return err("opacity must be between 0 and 1 inclusive");
                            }
                            header.opacity = opacity;
                        }
                        "hidden" => header.active = !parse_bool(&val, "hidden", strict)?,
                        "layout" => {
                            frame_only_attr.get_or_insert_with(|| key.clone());
                            layout.mode = match val.as_str() {
                                "flex" => LayoutMode::Flex,
                                "none" => LayoutMode::None,
                                _ => return err(format!("bad layout `{val}`")),
                            }
                        }
                        "direction" => {
                            frame_only_attr.get_or_insert_with(|| key.clone());
                            flex_only_attr.get_or_insert_with(|| key.clone());
                            layout.direction = match val.as_str() {
                                "row" => Direction::Row,
                                "column" => Direction::Column,
                                _ => return err(format!("bad direction `{val}`")),
                            }
                        }
                        "wrap" => {
                            frame_only_attr.get_or_insert_with(|| key.clone());
                            flex_only_attr.get_or_insert_with(|| key.clone());
                            layout.wrap = parse_bool(&val, "wrap", strict)?;
                        }
                        "main" => {
                            frame_only_attr.get_or_insert_with(|| key.clone());
                            flex_only_attr.get_or_insert_with(|| key.clone());
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
                            frame_only_attr.get_or_insert_with(|| key.clone());
                            flex_only_attr.get_or_insert_with(|| key.clone());
                            layout.cross_align = match val.as_str() {
                                "start" => CrossAlign::Start,
                                "center" => CrossAlign::Center,
                                "end" => CrossAlign::End,
                                "stretch" => CrossAlign::Stretch,
                                _ => return err(format!("bad cross `{val}`")),
                            }
                        }
                        "gap" => {
                            frame_only_attr.get_or_insert_with(|| key.clone());
                            flex_only_attr.get_or_insert_with(|| key.clone());
                            let parts: Vec<&str> = val.split_whitespace().collect();
                            match parts.as_slice() {
                                [g] => {
                                    layout.gap_main = parse_non_negative(g, "gap", strict)?;
                                    layout.gap_cross = layout.gap_main;
                                }
                                [m, c] => {
                                    layout.gap_main = parse_non_negative(m, "gap", strict)?;
                                    layout.gap_cross = parse_non_negative(c, "gap", strict)?;
                                }
                                _ => return err("gap takes 1 or 2 numbers"),
                            }
                        }
                        "padding" => {
                            frame_only_attr.get_or_insert_with(|| key.clone());
                            let nums: Vec<f32> = val
                                .split_whitespace()
                                .map(|p| parse_non_negative(p, "padding", strict))
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
                        "clips" => {
                            frame_only_attr.get_or_insert_with(|| key.clone());
                            clips = parse_bool(&val, "clips", strict)?;
                        }
                        "kind" if !grida_xml => {
                            shape_only_attr.get_or_insert_with(|| key.clone());
                            shape_kind = Some(match val.as_str() {
                                "rect" => ShapeDesc::Rect,
                                "ellipse" => ShapeDesc::Ellipse,
                                "line" => ShapeDesc::Line,
                                _ => return err(format!("bad shape kind `{val}`")),
                            })
                        }
                        "size" if !grida_xml => {
                            text_only_attr.get_or_insert_with(|| key.clone());
                            font_size = parse_positive(&val, "size", false)?;
                        }
                        "font-size" if grida_xml => {
                            text_only_attr.get_or_insert_with(|| key.clone());
                            font_size = parse_positive(&val, "font-size", true)?;
                        }
                        "size" if grida_xml => return err(
                            "text attribute `size` belongs to historical textir; use `font-size`",
                        ),
                        "font-weight" if grida_xml => {
                            text_only_attr.get_or_insert_with(|| key.clone());
                            font_weight = parse_font_weight(&val, "text")?;
                        }
                        "font-style" if grida_xml => {
                            text_only_attr.get_or_insert_with(|| key.clone());
                            font_style_italic = parse_font_style(&val, "text")?;
                        }
                        "ops" => {
                            lens_only_attr.get_or_insert_with(|| key.clone());
                            lens_ops = parse_lens_ops(&val, strict)?;
                        }
                        "d" if grida_xml => {
                            path_only_attr.get_or_insert_with(|| key.clone());
                            path_d = Some(val);
                        }
                        "fill-rule" if grida_xml => {
                            path_only_attr.get_or_insert_with(|| key.clone());
                            path_fill_rule = match val.as_str() {
                                "nonzero" => FillRule::NonZero,
                                "evenodd" => FillRule::EvenOdd,
                                _ => {
                                    return err(format!(
                                        "fill-rule on <path> must be `nonzero` or `evenodd`, found `{val}`"
                                    ))
                                }
                            };
                        }
                        "fill" => {
                            let fillable = matches!(node_tag, "frame" | "text")
                                || node_tag == "path"
                                || matches!(
                                    shape_kind.as_ref(),
                                    Some(ShapeDesc::Rect | ShapeDesc::Ellipse)
                                );
                            if strict && !fillable {
                                return err(format!("fill is not valid on <{tag}>"));
                            }
                            if legacy_fill.is_some() {
                                return err(format!("duplicate `fill` on <{tag}>"));
                            }
                            if strict {
                                legacy_fill = Some(parse_color(&val, "fill")?);
                            } else {
                                legacy_fill = Some(val.into());
                            }
                        }
                        _ => return err(format!("unknown attribute `{key}` on <{tag}>")),
                    }
                }

                if grida_xml {
                    let parent_is_flex = stack.last().is_some_and(|parent| {
                        matches!(
                            &nodes.get(&parent.id).expect("open parent exists").payload,
                            Payload::Frame { layout, .. } if layout.mode == LayoutMode::Flex
                        )
                    });
                    if flow_seen && !parent_is_flex {
                        return err("flow is only valid on a child of a flex container");
                    }
                    if parent_is_flex && header.flow == Flow::InFlow && (x_seen || y_seen) {
                        return err("x/y are not valid on an in-flow child of a flex container");
                    }
                    if (!parent_is_flex || header.flow != Flow::InFlow) && (grow_seen || align_seen)
                    {
                        return err(
                            "grow/align are only valid on an in-flow child of a flex container",
                        );
                    }
                    if node_tag != "frame" {
                        if let Some(attr) = frame_only_attr {
                            return err(format!("attribute `{attr}` is only valid on <container>"));
                        }
                    }
                    if node_tag != "shape" {
                        if let Some(attr) = shape_only_attr {
                            return err(format!("attribute `{attr}` is only valid on <shape>"));
                        }
                    }
                    if node_tag != "text" {
                        if let Some(attr) = text_only_attr {
                            return err(format!("attribute `{attr}` is only valid on <text>"));
                        }
                    }
                    if node_tag != "lens" {
                        if let Some(attr) = lens_only_attr {
                            return err(format!("attribute `{attr}` is only valid on <lens>"));
                        }
                    }
                    if node_tag != "path" {
                        if let Some(attr) = path_only_attr {
                            return err(format!("attribute `{attr}` is only valid on <path>"));
                        }
                    }
                    if layout.mode != LayoutMode::Flex {
                        if let Some(attr) = flex_only_attr {
                            return err(format!("attribute `{attr}` requires layout=\"flex\""));
                        }
                    }
                    if matches!(node_tag, "group" | "lens")
                        && (width_seen || height_seen || box_constraint_seen)
                    {
                        return err(format!(
                            "<{tag}> has a derived box and cannot declare size constraints"
                        ));
                    }
                    if matches!(node_tag, "group" | "lens")
                        && (matches!(header.x, AxisBinding::Span { .. })
                            || matches!(header.y, AxisBinding::Span { .. }))
                    {
                        return err(format!(
                            "<{tag}> has a derived origin and cannot use Span bindings"
                        ));
                    }
                    if aspect_seen && !matches!(node_tag, "shape" | "path") {
                        return err(
                            "aspect-ratio is only valid on <rect> and <ellipse>, or on <path>",
                        );
                    }
                    let supports_corners =
                        node_tag == "frame" || matches!(shape_kind.as_ref(), Some(ShapeDesc::Rect));
                    if (corner_radius_seen || corner_smoothing_seen) && !supports_corners {
                        return err(format!(
                            "corner-radius and corner-smoothing are only valid on <container> and <rect>, not <{tag}>"
                        ));
                    }
                    if !corner_smoothing.is_zero() && !corner_radius.is_circular() {
                        return err(
                            "nonzero corner-smoothing requires circular corner radii (rx must equal ry) in Draft 0",
                        );
                    }
                    if matches!(header.x, AxisBinding::Span { .. })
                        && (width_seen || header.min_width.is_some() || header.max_width.is_some())
                    {
                        return err(
                            "a span x binding cannot also declare width/min-width/max-width",
                        );
                    }
                    if matches!(header.y, AxisBinding::Span { .. })
                        && (height_seen
                            || header.min_height.is_some()
                            || header.max_height.is_some())
                    {
                        return err(
                            "a span y binding cannot also declare height/min-height/max-height",
                        );
                    }
                    if matches!(node_tag, "shape" | "path") {
                        match shape_kind.as_ref() {
                            Some(ShapeDesc::Rect | ShapeDesc::Ellipse) => {
                                let width_supplied = matches!(
                                    (header.width, header.x),
                                    (SizeIntent::Fixed(_), _) | (_, AxisBinding::Span { .. })
                                );
                                let height_supplied = matches!(
                                    (header.height, header.y),
                                    (SizeIntent::Fixed(_), _) | (_, AxisBinding::Span { .. })
                                );
                                let valid = matches!(
                                    (width_supplied, height_supplied, aspect_seen),
                                    (true, true, false) | (true, false, true) | (false, true, true)
                                );
                                if !valid {
                                    return err(
                                        "<rect> and <ellipse> require both axes supplied by a fixed size or Span, or exactly one supplied axis plus aspect-ratio",
                                    );
                                }
                            }
                            Some(ShapeDesc::Line) => {
                                let width_supplied = matches!(
                                    (header.width, header.x),
                                    (SizeIntent::Fixed(_), _) | (_, AxisBinding::Span { .. })
                                );
                                if !width_supplied {
                                    return err("<line> requires a fixed width or x Span");
                                }
                                if matches!(header.y, AxisBinding::Span { .. }) {
                                    return err("<line> must not declare a y Span");
                                }
                                if height_seen {
                                    return err("<line> must not declare height");
                                }
                                if header.min_height.is_some() || header.max_height.is_some() {
                                    return err("<line> must not declare min-height/max-height");
                                }
                                if header.aspect_ratio.is_some() {
                                    return err("<line> must not declare aspect-ratio");
                                }
                            }
                            Some(ShapeDesc::Path(_)) => unreachable!("path is analyzed below"),
                            None if node_tag == "path" => {
                                let width_supplied = matches!(
                                    (header.width, header.x),
                                    (SizeIntent::Fixed(_), _) | (_, AxisBinding::Span { .. })
                                );
                                let height_supplied = matches!(
                                    (header.height, header.y),
                                    (SizeIntent::Fixed(_), _) | (_, AxisBinding::Span { .. })
                                );
                                let valid = matches!(
                                    (width_supplied, height_supplied, aspect_seen),
                                    (true, true, false) | (true, false, true) | (false, true, true)
                                );
                                if !valid {
                                    return err(
                                        "<path> requires both axes supplied by a fixed size or Span, or exactly one supplied axis plus aspect-ratio",
                                    );
                                }
                            }
                            None => {}
                        }
                    }
                }

                let payload = match node_tag {
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
                            .take()
                            .ok_or_else(|| ParseError("<shape> requires kind".into()))?;
                        if matches!(desc, ShapeDesc::Line) {
                            header.height = SizeIntent::Fixed(0.0); // §3.2 locked
                        }
                        Payload::Shape { desc }
                    }
                    "path" => {
                        let d = path_d.ok_or_else(|| ParseError("<path> requires `d`".into()))?;
                        let artifact = path::analyze(d, path_fill_rule)
                            .map_err(|error| ParseError(format!("<path> d: {error}")))?;
                        Payload::Shape {
                            desc: ShapeDesc::Path(artifact),
                        }
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
                let legacy_fill_seen = legacy_fill.is_some();
                let fills = match legacy_fill {
                    Some(color) => Paints::solid(color),
                    None if grida_xml => grida_xml_default_fills(&payload),
                    None => Paints::default(),
                };
                let node = Node {
                    id,
                    header,
                    payload,
                    children: vec![],
                    corner_radius,
                    corner_smoothing,
                    fills,
                    strokes: vec![],
                };
                nodes.insert(id, node);
                if let Some(parent) = stack.last() {
                    let pid = parent.id;
                    nodes.get_mut(&pid).unwrap().children.push(id);
                } else if grida_xml {
                    if render_root.is_some() {
                        return err("multiple render roots in <grida>");
                    }
                    let root_id = root.expect("grida.xml root initialized");
                    nodes.get_mut(&root_id).unwrap().children.push(id);
                    render_root = Some(id);
                } else if root.is_none() {
                    root = Some(id);
                } else {
                    return err("multiple root elements");
                }

                let is_text = node_tag == "text";
                stack.push(Pending {
                    id,
                    tag,
                    text_content: String::new(),
                    text_segments: vec![],
                    default_text_style: is_text.then_some(TextStyleRec {
                        font_size,
                        font_weight,
                        font_style_italic,
                    }),
                    is_text,
                    fill_seen: false,
                    stroke_seen: false,
                    legacy_fill_seen,
                    content_started: false,
                });
                // Self-closing (`Event::Empty`) has no matching End event.
                if is_empty {
                    finish(&mut stack, &mut nodes, None)?;
                }
            }
            Ok(Event::Text(t)) => {
                let txt = t.unescape().map_err(|e| ParseError(format!("text: {e}")))?;
                if grida_xml && !declaration_seen && !txt.is_empty() {
                    pre_declaration_content = true;
                }
                if let Some(p) = stack.last_mut() {
                    if grida_xml && !p.is_text && !txt.trim().is_empty() {
                        return err(format!("character content is not allowed in <{}>", p.tag));
                    }
                    if p.is_text && !txt.trim().is_empty() {
                        p.content_started = true;
                    }
                    p.text_content.push_str(&txt);
                } else if grida_xml && !txt.trim().is_empty() {
                    return err("character content is not allowed outside the document envelope");
                }
            }
            Ok(Event::End(e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if grida_xml && tag == "grida" {
                    if !envelope_open || envelope_closed {
                        return err("unbalanced </grida>");
                    }
                    if !stack.is_empty() {
                        return err("</grida> closed before its render root");
                    }
                    if render_root.is_none() {
                        return err("<grida> must contain exactly one render root");
                    }
                    envelope_open = false;
                    envelope_closed = true;
                    continue;
                }
                finish(&mut stack, &mut nodes, Some(&tag))?;
            }
            Ok(Event::Decl(decl)) if grida_xml => {
                if declaration_seen {
                    return err("duplicate XML declaration");
                }
                if pre_declaration_content || envelope_open || envelope_closed {
                    return err("XML declaration must be the first document event");
                }
                validate_grida_xml_declaration(&decl)?;
                declaration_seen = true;
            }
            Ok(Event::Comment(_)) if grida_xml => {
                if !declaration_seen {
                    pre_declaration_content = true;
                }
            }
            Ok(Event::CData(_)) if grida_xml => {
                return err("CDATA is not supported; use escaped text content");
            }
            Ok(Event::PI(_) | Event::DocType(_)) if grida_xml => {
                return err("processing instructions and doctypes are not supported");
            }
            Ok(_) => {}
        }
    }

    if !stack.is_empty() {
        return err("unclosed elements");
    }
    if grida_xml {
        if envelope_open {
            return err("unclosed <grida> envelope");
        }
        if !envelope_closed {
            return err("missing <grida version=\"0\"> envelope");
        }
        if render_root.is_none() {
            return err("<grida> must contain exactly one render root");
        }
    }
    let root = root.ok_or_else(|| ParseError("empty document".into()))?;
    // The scene root spans the viewport unless bindings were given.
    Ok(Document::from_map(nodes, root))
}

fn finish(
    stack: &mut Vec<Pending>,
    nodes: &mut BTreeMap<NodeId, Node>,
    end_tag: Option<&str>,
) -> Result<(), ParseError> {
    if let Some(end_tag) = end_tag {
        let start_tag = stack
            .last()
            .ok_or_else(|| ParseError("unbalanced end".into()))?
            .tag
            .as_str();
        if start_tag != end_tag {
            return err(format!("mismatched end tag </{end_tag}> for <{start_tag}>"));
        }
    }
    let mut p = stack
        .pop()
        .ok_or_else(|| ParseError("unbalanced end".into()))?;
    if p.is_text {
        let default_style = p
            .default_text_style
            .expect("text pending state carries its default style");
        if !p.text_content.is_empty() {
            p.text_segments.push(PendingTextSegment {
                text: p.text_content,
                style: default_style,
                fills: None,
            });
        }

        let mut text = String::new();
        let mut runs = Vec::new();
        for segment in p.text_segments {
            if segment.text.is_empty() {
                continue;
            }
            let start = u32::try_from(text.len())
                .map_err(|_| ParseError("attributed text exceeds u32 byte offsets".into()))?;
            text.push_str(&segment.text);
            let end = u32::try_from(text.len())
                .map_err(|_| ParseError("attributed text exceeds u32 byte offsets".into()))?;
            runs.push(StyledTextRun {
                start,
                end,
                style: segment.style,
                fills: segment.fills,
            });
        }
        let mut attributed = if text.is_empty() {
            AttributedString::new(text, default_style)
        } else {
            AttributedString::from_runs(text, runs).map_err(ParseError)?
        };
        attributed.merge_adjacent_runs();

        let can_use_uniform_payload = default_style.font_weight
            == TextStyleRec::DEFAULT_FONT_WEIGHT
            && !default_style.font_style_italic
            && attributed.is_uniform_default(default_style);
        nodes.get_mut(&p.id).unwrap().payload = if can_use_uniform_payload {
            Payload::Text {
                content: attributed.text,
                font_size: default_style.font_size,
            }
        } else {
            Payload::AttributedText {
                attributed_string: attributed,
                default_style,
            }
        };
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

fn fmt_corner_axis(values: [f32; 4]) -> String {
    if values[1..].iter().all(|value| *value == values[0]) {
        fmt_num(values[0])
    } else {
        values.map(fmt_num).join(" ")
    }
}

fn fmt_corner_radius(radius: RectangularCornerRadius) -> String {
    let rx = [radius.tl.rx, radius.tr.rx, radius.br.rx, radius.bl.rx];
    let ry = [radius.tl.ry, radius.tr.ry, radius.br.ry, radius.bl.ry];
    let rx_text = fmt_corner_axis(rx);
    if rx == ry {
        rx_text
    } else {
        format!("{rx_text} / {}", fmt_corner_axis(ry))
    }
}

fn fmt_num_f64(v: f64) -> String {
    format!("{v}")
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
    let escaped = val
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    let _ = write!(out, " {key}=\"{escaped}\"");
}

fn escape_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn validate_text_style_for_write(style: TextStyleRec, target: &str) -> Result<(), String> {
    if !style.font_size.is_finite() || style.font_size <= 0.0 {
        return Err(format!(
            "font-size on <{target}> must be finite and greater than zero"
        ));
    }
    if !(1..=1000).contains(&style.font_weight) {
        return Err(format!(
            "font-weight on <{target}> must be an integer from 1 through 1000"
        ));
    }
    Ok(())
}

fn push_text_style_overrides(out: &mut String, style: TextStyleRec, inherited: TextStyleRec) {
    if style.font_size != inherited.font_size {
        push_attr(out, "font-size", &fmt_num(style.font_size));
    }
    if style.font_weight != inherited.font_weight {
        push_attr(out, "font-weight", &style.font_weight.to_string());
    }
    if style.font_style_italic != inherited.font_style_italic {
        push_attr(
            out,
            "font-style",
            if style.font_style_italic {
                "italic"
            } else {
                "normal"
            },
        );
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrintError(pub String);

impl std::fmt::Display for PrintError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "textir: {}", self.0)
    }
}

impl std::error::Error for PrintError {}

/// Historical E3 TextIr has only a singleton opaque solid `fill` attribute.
/// This fallible entry point refuses richer model state instead of narrowing
/// it. New file-first documents should use [`crate::grida_xml::print`].
pub fn try_print(doc: &Document) -> Result<String, PrintError> {
    let mut out = String::new();
    print_node(doc, doc.root, 0, Dialect::TextIr, &mut out).map_err(PrintError)?;
    Ok(out)
}

pub fn print(doc: &Document) -> String {
    try_print(doc).expect("document is not representable by historical E3 TextIr")
}

pub(crate) fn print_grida_xml_render_root(
    doc: &Document,
    id: NodeId,
    depth: usize,
    out: &mut String,
) -> Result<(), String> {
    print_node(doc, id, depth, Dialect::GridaXml, out)
}

#[derive(Debug, Clone, Copy)]
enum FillEmission<'a> {
    Omit,
    Attribute(Color),
    Empty,
    Stack(&'a Paints),
}

fn grida_xml_fill_emission(node: &Node) -> Result<FillEmission<'_>, String> {
    if !supports_fill(&node.payload) && !node.fills.is_empty() {
        return Err(format!(
            "<{}> cannot carry fills",
            path_aware_kind_name(&node.payload)
        ));
    }
    let default = grida_xml_default_fills(&node.payload);
    if node.fills == default {
        Ok(FillEmission::Omit)
    } else if let [Paint::Solid(solid)] = node.fills.as_slice() {
        if solid.active && solid.color.alpha() == 255 && solid.blend_mode == BlendMode::Normal {
            Ok(FillEmission::Attribute(solid.color))
        } else {
            Ok(FillEmission::Stack(&node.fills))
        }
    } else if node.fills.is_empty() {
        Ok(FillEmission::Empty)
    } else {
        Ok(FillEmission::Stack(&node.fills))
    }
}

fn grida_xml_run_fill_emission(fills: &Paints) -> FillEmission<'_> {
    if let [Paint::Solid(solid)] = fills.as_slice() {
        if solid.active && solid.color.alpha() == 255 && solid.blend_mode == BlendMode::Normal {
            FillEmission::Attribute(solid.color)
        } else {
            FillEmission::Stack(fills)
        }
    } else if fills.is_empty() {
        FillEmission::Empty
    } else {
        FillEmission::Stack(fills)
    }
}

fn historical_fill(node: &Node) -> Result<Option<Color>, String> {
    if node
        .strokes
        .iter()
        .any(|stroke| !(stroke.paints.is_empty() && stroke.geometry_is_default_for(&node.payload)))
    {
        return Err(format!(
            "node {} has strokes historical E3 TextIr cannot represent",
            node.id
        ));
    }
    match node.fills.as_slice() {
        [] => Ok(None),
        [Paint::Solid(solid)]
            if solid.active
                && solid.blend_mode == BlendMode::Normal
                && solid.color.alpha() == 255 =>
        {
            Ok(Some(solid.color))
        }
        _ => Err(format!(
            "node {} has a paint stack historical E3 TextIr cannot represent",
            node.id
        )),
    }
}

fn validate_corner_style_for_write(node: &Node, grida_xml: bool) -> Result<(), String> {
    let radii = [
        node.corner_radius.tl,
        node.corner_radius.tr,
        node.corner_radius.br,
        node.corner_radius.bl,
    ];
    if radii
        .iter()
        .any(|radius| !radius.rx.is_finite() || !radius.ry.is_finite())
    {
        return Err(format!("node {} has non-finite corner radii", node.id));
    }
    if radii
        .iter()
        .any(|radius| radius.rx < 0.0 || radius.ry < 0.0)
    {
        return Err(format!("node {} has negative corner radii", node.id));
    }
    let smoothing = node.corner_smoothing.value();
    if !smoothing.is_finite() || !(0.0..=1.0).contains(&smoothing) {
        return Err(format!(
            "node {} corner-smoothing must be finite and between 0 and 1",
            node.id
        ));
    }

    let has_corner_style = !node.corner_radius.is_zero() || !node.corner_smoothing.is_zero();
    if !has_corner_style {
        return Ok(());
    }
    if !grida_xml {
        return Err(format!(
            "node {} has corner geometry historical E3 TextIr cannot represent",
            node.id
        ));
    }
    let supports_corners = matches!(node.payload, Payload::Frame { .. })
        || matches!(
            node.payload,
            Payload::Shape {
                desc: ShapeDesc::Rect
            }
        );
    if !supports_corners {
        return Err(format!(
            "<{}> cannot carry corner-radius or corner-smoothing",
            path_aware_kind_name(&node.payload)
        ));
    }
    if !node.corner_smoothing.is_zero() && !node.corner_radius.is_circular() {
        return Err(format!(
            "node {} uses nonzero corner-smoothing with elliptical radii; Draft 0 cannot render that state losslessly",
            node.id
        ));
    }
    Ok(())
}

fn validate_path_box_for_write(node: &Node) -> Result<(), String> {
    if !matches!(
        &node.payload,
        Payload::Shape {
            desc: ShapeDesc::Path(_)
        }
    ) {
        return Ok(());
    }

    let validate_size = |intent: SizeIntent, axis: &str| match intent {
        SizeIntent::Auto => Ok(()),
        SizeIntent::Fixed(value) if value.is_finite() && value >= 0.0 => Ok(()),
        SizeIntent::Fixed(_) => Err(format!(
            "<path> {axis} must be a finite non-negative number"
        )),
    };
    validate_size(node.header.width, "width")?;
    validate_size(node.header.height, "height")?;

    let validate_binding = |binding: AxisBinding, axis: &str| {
        let finite = match binding {
            AxisBinding::Pin { offset, .. } => offset.is_finite(),
            AxisBinding::Span { start, end } => start.is_finite() && end.is_finite(),
        };
        if finite {
            Ok(())
        } else {
            Err(format!("<path> {axis} binding must contain finite numbers"))
        }
    };
    validate_binding(node.header.x, "x")?;
    validate_binding(node.header.y, "y")?;

    for (name, value) in [
        ("min-width", node.header.min_width),
        ("max-width", node.header.max_width),
        ("min-height", node.header.min_height),
        ("max-height", node.header.max_height),
    ] {
        if value.is_some_and(|value| !value.is_finite() || value < 0.0) {
            return Err(format!(
                "<path> {name} must be a finite non-negative number"
            ));
        }
    }

    if matches!(node.header.x, AxisBinding::Span { .. })
        && (matches!(node.header.width, SizeIntent::Fixed(_))
            || node.header.min_width.is_some()
            || node.header.max_width.is_some())
    {
        return Err("a span x binding cannot also declare width/min-width/max-width".into());
    }
    if matches!(node.header.y, AxisBinding::Span { .. })
        && (matches!(node.header.height, SizeIntent::Fixed(_))
            || node.header.min_height.is_some()
            || node.header.max_height.is_some())
    {
        return Err("a span y binding cannot also declare height/min-height/max-height".into());
    }

    let has_aspect = match node.header.aspect_ratio {
        None => false,
        Some((a, b)) if a.is_finite() && b.is_finite() && a > 0.0 && b > 0.0 => true,
        Some(_) => {
            return Err("<path> aspect-ratio terms must be finite and greater than zero".into())
        }
    };
    let width_supplied = matches!(node.header.width, SizeIntent::Fixed(_))
        || matches!(node.header.x, AxisBinding::Span { .. });
    let height_supplied = matches!(node.header.height, SizeIntent::Fixed(_))
        || matches!(node.header.y, AxisBinding::Span { .. });
    if !matches!(
        (width_supplied, height_supplied, has_aspect),
        (true, true, false) | (true, false, true) | (false, true, true)
    ) {
        return Err(
            "<path> requires both axes supplied by a fixed size or Span, or exactly one supplied axis plus aspect-ratio"
                .into(),
        );
    }
    Ok(())
}

pub(crate) fn validate_path_for_write(node: &Node) -> Result<(), String> {
    let Payload::Shape {
        desc: ShapeDesc::Path(artifact),
    } = &node.payload
    else {
        return Ok(());
    };
    validate_path_box_for_write(node)?;
    let validated = path::analyze(Arc::clone(&artifact.d), artifact.fill_rule)
        .map_err(|error| format!("node {} has invalid path data: {error}", node.id))?;
    // Reanalysis starts from the same authored d and must reproduce every
    // derived field consumed by bounds, damage, and paint.
    if validated.as_ref() != artifact.as_ref() {
        return Err(format!(
            "node {} has a path artifact inconsistent with its authored d",
            node.id
        ));
    }
    Ok(())
}

fn validate_common_paint(opacity: f32, tag: &str) -> Result<(), String> {
    if !opacity.is_finite() || !(0.0..=1.0).contains(&opacity) {
        return Err(format!(
            "<{tag}> opacity must be finite and between 0 and 1"
        ));
    }
    Ok(())
}

fn push_common_paint_attrs(
    out: &mut String,
    active: bool,
    opacity: f32,
    blend_mode: BlendMode,
    tag: &str,
) -> Result<(), String> {
    validate_common_paint(opacity, tag)?;
    if !active {
        push_attr(out, "visible", "false");
    }
    if opacity != 1.0 {
        push_attr(out, "opacity", &fmt_num(opacity));
    }
    if blend_mode != BlendMode::Normal {
        push_attr(out, "blend-mode", blend_mode.as_str());
    }
    Ok(())
}

fn validate_gradient_stops(stops: &[GradientStop], tag: &str) -> Result<(), String> {
    if stops.len() < 2 {
        return Err(format!("<{tag}> requires at least two stops"));
    }
    let mut previous = None;
    for stop in stops {
        if !stop.offset.is_finite() || !(0.0..=1.0).contains(&stop.offset) {
            return Err(format!(
                "<{tag}> stop offset must be finite and between 0 and 1"
            ));
        }
        if previous.is_some_and(|offset| stop.offset < offset) {
            return Err(format!("<{tag}> stop offsets must be nondecreasing"));
        }
        previous = Some(stop.offset);
    }
    Ok(())
}

fn validate_affine(transform: crate::math::Affine, tag: &str) -> Result<(), String> {
    if [
        transform.a,
        transform.b,
        transform.c,
        transform.d,
        transform.e,
        transform.f,
    ]
    .iter()
    .any(|value| !value.is_finite())
    {
        return Err(format!(
            "<{tag}> transform must contain only finite numbers"
        ));
    }
    Ok(())
}

fn push_transform_attr(
    out: &mut String,
    transform: crate::math::Affine,
    tag: &str,
) -> Result<(), String> {
    validate_affine(transform, tag)?;
    if transform != crate::math::Affine::IDENTITY {
        push_attr(
            out,
            "transform",
            &format!(
                "{} {} {} {} {} {}",
                fmt_num(transform.a),
                fmt_num(transform.b),
                fmt_num(transform.c),
                fmt_num(transform.d),
                fmt_num(transform.e),
                fmt_num(transform.f)
            ),
        );
    }
    Ok(())
}

fn write_gradient_stops(
    stops: &[GradientStop],
    tag: &str,
    depth: usize,
    out: &mut String,
) -> Result<(), String> {
    validate_gradient_stops(stops, tag)?;
    let indent = "  ".repeat(depth);
    for stop in stops {
        let _ = write!(out, "{indent}<stop");
        push_attr(out, "offset", &fmt_num(stop.offset));
        push_attr(out, "color", &stop.color.to_hex());
        if stop.color.alpha() != 255 {
            push_attr(out, "opacity", &fmt_num(stop.color.opacity()));
        }
        let _ = writeln!(out, "/>");
    }
    Ok(())
}

fn write_gradient(paint: &Paint, depth: usize, out: &mut String) -> Result<(), String> {
    let (kind, transform, stops, tile_mode, endpoints) = match paint {
        Paint::LinearGradient(gradient) => (
            "linear",
            gradient.transform,
            gradient.stops.as_slice(),
            Some(gradient.tile_mode),
            Some((gradient.xy1, gradient.xy2)),
        ),
        Paint::RadialGradient(gradient) => (
            "radial",
            gradient.transform,
            gradient.stops.as_slice(),
            Some(gradient.tile_mode),
            None,
        ),
        Paint::SweepGradient(gradient) => (
            "sweep",
            gradient.transform,
            gradient.stops.as_slice(),
            None,
            None,
        ),
        Paint::DiamondGradient(gradient) => (
            "diamond",
            gradient.transform,
            gradient.stops.as_slice(),
            None,
            None,
        ),
        Paint::Solid(_) | Paint::Image(_) => unreachable!("gradient writer requires a gradient"),
    };
    let endpoints = match endpoints {
        Some((from, to)) => {
            if !from.0.is_finite() || !from.1.is_finite() || !to.0.is_finite() || !to.1.is_finite()
            {
                return Err("<gradient kind=\"linear\"> endpoints must be finite".into());
            }
            if from == to {
                return Err("<gradient kind=\"linear\"> from and to must differ".into());
            }
            Some((
                from.try_to_uv().ok_or_else(|| {
                    "<gradient kind=\"linear\"> from alignment is not representable: binary64 UV arithmetic cannot reproduce its stored f32 components".to_string()
                })?,
                to.try_to_uv().ok_or_else(|| {
                    "<gradient kind=\"linear\"> to alignment is not representable: binary64 UV arithmetic cannot reproduce its stored f32 components".to_string()
                })?,
                from != Alignment::CENTER_LEFT || to != Alignment::CENTER_RIGHT,
            ))
        }
        None => None,
    };

    let indent = "  ".repeat(depth);
    let _ = write!(out, "{indent}<gradient");
    push_attr(out, "kind", kind);
    if let Some((from, to, write_endpoints)) = endpoints {
        if write_endpoints {
            push_attr(
                out,
                "from",
                &format!("{} {}", fmt_num_f64(from.0), fmt_num_f64(from.1)),
            );
            push_attr(
                out,
                "to",
                &format!("{} {}", fmt_num_f64(to.0), fmt_num_f64(to.1)),
            );
        }
    }
    if let Some(tile_mode) = tile_mode.filter(|mode| *mode != TileMode::Clamp) {
        push_attr(out, "tile-mode", tile_mode.as_str());
    }
    push_transform_attr(out, transform, "gradient")?;
    push_common_paint_attrs(
        out,
        paint.active(),
        paint.opacity(),
        paint.blend_mode(),
        "gradient",
    )?;
    let _ = writeln!(out, ">");
    write_gradient_stops(stops, "gradient", depth + 1, out)?;
    let _ = writeln!(out, "{indent}</gradient>");
    Ok(())
}

fn write_paint(paint: &Paint, depth: usize, out: &mut String) -> Result<(), String> {
    let indent = "  ".repeat(depth);
    match paint {
        Paint::Solid(solid) => {
            let _ = write!(out, "{indent}<solid");
            push_attr(out, "color", &solid.color.to_hex());
            push_common_paint_attrs(
                out,
                solid.active,
                solid.opacity(),
                solid.blend_mode,
                "solid",
            )?;
            let _ = writeln!(out, "/>");
        }
        paint @ (Paint::LinearGradient(_)
        | Paint::RadialGradient(_)
        | Paint::SweepGradient(_)
        | Paint::DiamondGradient(_)) => {
            write_gradient(paint, depth, out)?;
        }
        Paint::Image(image) => {
            let src = match &image.image {
                ResourceRef::Rid(src) if !src.trim().is_empty() => src,
                ResourceRef::Rid(_) => return Err("<image> src must not be empty".into()),
                ResourceRef::Hash(_) => {
                    return Err("Draft 0 XML cannot represent a hash image resource".into());
                }
            };
            if image.quarter_turns != 0 {
                return Err("Draft 0 XML cannot represent image quarter-turns".into());
            }
            if image.alignment != Alignment::CENTER {
                return Err("Draft 0 XML cannot represent non-centered image alignment".into());
            }
            if image.filters != ImageFilters::default() {
                return Err("Draft 0 XML cannot represent image filters".into());
            }
            let fit = match image.fit {
                ImagePaintFit::Fit(fit) => fit,
                ImagePaintFit::Transform(_) => {
                    return Err("Draft 0 XML cannot represent transformed image fit".into());
                }
                ImagePaintFit::Tile(_) => {
                    return Err("Draft 0 XML cannot represent tiled image fit".into());
                }
            };
            let _ = write!(out, "{indent}<image");
            push_attr(out, "src", src);
            if fit != BoxFit::Cover {
                push_attr(out, "fit", fit.as_str());
            }
            push_common_paint_attrs(out, image.active, image.opacity, image.blend_mode, "image")?;
            let _ = writeln!(out, "/>");
        }
    }
    Ok(())
}

fn write_fill(
    emission: FillEmission<'_>,
    depth: usize,
    inline: bool,
    out: &mut String,
) -> Result<(), String> {
    match emission {
        FillEmission::Omit | FillEmission::Attribute(_) => {}
        FillEmission::Empty => {
            if !inline {
                let _ = write!(out, "{}", "  ".repeat(depth));
            }
            if inline {
                let _ = write!(out, "<fill/>");
            } else {
                let _ = writeln!(out, "<fill/>");
            }
        }
        FillEmission::Stack(paints) => {
            if !inline {
                let _ = write!(out, "{}", "  ".repeat(depth));
            }
            let _ = writeln!(out, "<fill>");
            for paint in paints.iter() {
                write_paint(paint, depth + 1, out)?;
            }
            if inline {
                let _ = write!(out, "{}</fill>", "  ".repeat(depth));
            } else {
                let _ = writeln!(out, "{}</fill>", "  ".repeat(depth));
            }
        }
    }
    Ok(())
}

fn write_attributed_text_content(
    attributed: &AttributedString,
    default_style: TextStyleRec,
    depth: usize,
    out: &mut String,
) -> Result<(), String> {
    attributed.validate()?;
    let mut attributed = attributed.clone();
    attributed.merge_adjacent_runs();
    if attributed.text.is_empty() && !attributed.is_uniform_default(default_style) {
        return Err(
            "empty attributed text cannot preserve a styled or painted zero-length run".into(),
        );
    }

    for run in &attributed.runs {
        validate_text_style_for_write(run.style, "tspan")?;
        let run_text = escape_text(attributed.run_text(run));
        if run.style == default_style && run.fills.is_none() {
            let _ = write!(out, "{run_text}");
            continue;
        }

        let _ = write!(out, "<tspan");
        push_text_style_overrides(out, run.style, default_style);
        let fill_emission = run.fills.as_ref().map(grida_xml_run_fill_emission);
        if let Some(FillEmission::Attribute(color)) = fill_emission {
            push_attr(out, "fill", &color.to_hex());
        }
        let _ = write!(out, ">");
        if let Some(emission @ (FillEmission::Empty | FillEmission::Stack(_))) = fill_emission {
            write_fill(emission, depth + 1, true, out)?;
        }
        let _ = write!(out, "{run_text}</tspan>");
    }
    Ok(())
}

fn normalized_dash_array(values: &[f32]) -> Vec<f32> {
    if values.len().is_multiple_of(2) {
        values.to_vec()
    } else {
        values.iter().chain(values).copied().collect()
    }
}

pub(crate) fn validate_stroke_for_write(
    stroke: &Stroke,
    payload: &Payload,
    corner_smoothing: CornerSmoothing,
) -> Result<(), String> {
    let default = Stroke::default_for(payload)
        .ok_or_else(|| format!("<{}> cannot carry strokes", path_aware_kind_name(payload)))?;
    match stroke.width {
        StrokeWidth::None => {}
        StrokeWidth::Uniform(width) => {
            if !width.is_finite() || width < 0.0 {
                return Err("<stroke> width must be finite and non-negative".into());
            }
        }
        StrokeWidth::Rectangular(widths) => {
            for (side, width) in ["top", "right", "bottom", "left"]
                .into_iter()
                .zip(widths.values())
            {
                if !width.is_finite() || width < 0.0 {
                    return Err(format!(
                        "<stroke> width {side} must be finite and non-negative"
                    ));
                }
            }
        }
    }
    if !stroke.miter_limit.is_finite() || stroke.miter_limit <= 0.0 {
        return Err("<stroke> miter-limit must be finite and positive".into());
    }
    if let Some(values) = &stroke.dash_array {
        if values.is_empty()
            || values
                .iter()
                .any(|value| !value.is_finite() || *value < 0.0)
            || values.iter().all(|value| *value == 0.0)
        {
            return Err(
                "<stroke> dash-array must contain non-negative finite values and not be all zero"
                    .into(),
            );
        }
    }

    match payload {
        Payload::Shape {
            desc: ShapeDesc::Line,
        } => {
            if stroke.align != StrokeAlign::Center {
                return Err("a <line> stroke must use align=\"center\"".into());
            }
            if stroke.join != default.join || stroke.miter_limit != default.miter_limit {
                return Err("a <line> stroke cannot carry join or miter-limit state".into());
            }
        }
        Payload::Frame { .. }
        | Payload::Shape {
            desc: ShapeDesc::Rect,
        } => {
            if stroke.cap != default.cap {
                return Err("a container/rect stroke cannot carry cap state".into());
            }
        }
        Payload::Shape {
            desc: ShapeDesc::Ellipse,
        } => {
            if stroke.cap != default.cap
                || stroke.join != default.join
                || stroke.miter_limit != default.miter_limit
            {
                return Err(
                    "an ellipse stroke cannot carry cap, join, or miter-limit state".into(),
                );
            }
        }
        Payload::Shape {
            desc: ShapeDesc::Path(path),
        } => {
            if !path.all_contours_closed && stroke.align != StrokeAlign::Center {
                return Err(
                    "a <path> stroke may use inside/outside alignment only when every drawable contour is explicitly closed"
                        .into(),
                );
            }
        }
        Payload::Text { .. } | Payload::AttributedText { .. } => {
            if stroke.cap != default.cap
                || stroke.join != default.join
                || stroke.miter_limit != default.miter_limit
                || stroke.dash_array.is_some()
            {
                return Err(
                    "a text stroke cannot carry cap, join, miter-limit, or dash-array state".into(),
                );
            }
        }
        Payload::Group | Payload::Lens { .. } => unreachable!("checked above"),
    }
    if matches!(stroke.width.normalized(), StrokeWidth::Rectangular(_)) {
        let supports_per_side = matches!(payload, Payload::Frame { .. })
            || matches!(
                payload,
                Payload::Shape {
                    desc: ShapeDesc::Rect
                }
            );
        if !supports_per_side {
            return Err(format!(
                "<{}> cannot carry per-side stroke width",
                path_aware_kind_name(payload)
            ));
        }
        if !corner_smoothing.is_zero() {
            return Err("per-side stroke width requires corner-smoothing=\"0\" in Draft 0".into());
        }
        if stroke.join != default.join || stroke.miter_limit != default.miter_limit {
            return Err(
                "per-side stroke width requires the default join=\"miter\" and miter-limit=\"4\" in Draft 0"
                    .into(),
            );
        }
    }
    Ok(())
}

fn stroke_is_omitted(stroke: &Stroke, payload: &Payload) -> bool {
    stroke.paints.is_empty() && stroke.geometry_is_default_for(payload)
}

fn write_stroke(
    stroke: &Stroke,
    payload: &Payload,
    corner_smoothing: CornerSmoothing,
    depth: usize,
    inline: bool,
    out: &mut String,
) -> Result<(), String> {
    validate_stroke_for_write(stroke, payload, corner_smoothing)?;
    if stroke_is_omitted(stroke, payload) {
        return Ok(());
    }
    let default = Stroke::default_for(payload).expect("validated stroke target");
    if !inline {
        let _ = write!(out, "{}", "  ".repeat(depth));
    }
    let _ = write!(out, "<stroke");
    let width = stroke.width.normalized();
    if width != default.width.normalized() {
        let value = match width {
            StrokeWidth::None => fmt_num(0.0),
            StrokeWidth::Uniform(width) => fmt_num(width),
            StrokeWidth::Rectangular(widths) => widths.values().map(fmt_num).join(" "),
        };
        push_attr(out, "width", &value);
    }
    if stroke.align != default.align {
        push_attr(out, "align", stroke.align.as_str());
    }
    if matches!(
        payload,
        Payload::Shape {
            desc: ShapeDesc::Line
        } | Payload::Shape {
            desc: ShapeDesc::Path(_)
        }
    ) && stroke.cap != default.cap
    {
        push_attr(out, "cap", stroke.cap.as_str());
    }
    if matches!(
        payload,
        Payload::Frame { .. }
            | Payload::Shape {
                desc: ShapeDesc::Rect
            }
            | Payload::Shape {
                desc: ShapeDesc::Path(_)
            }
    ) {
        if stroke.join != default.join {
            push_attr(out, "join", stroke.join.as_str());
        }
        if stroke.miter_limit != default.miter_limit {
            push_attr(out, "miter-limit", &fmt_num(stroke.miter_limit));
        }
    }
    if let Some(values) = &stroke.dash_array {
        let value = normalized_dash_array(values)
            .iter()
            .map(|value| fmt_num(*value))
            .collect::<Vec<_>>()
            .join(" ");
        push_attr(out, "dash-array", &value);
    }
    if stroke.paints.is_empty() {
        if inline {
            let _ = write!(out, "/>");
        } else {
            let _ = writeln!(out, "/>");
        }
        return Ok(());
    }
    let _ = writeln!(out, ">");
    for paint in stroke.paints.iter() {
        write_paint(paint, depth + 1, out)?;
    }
    if inline {
        let _ = write!(out, "{}</stroke>", "  ".repeat(depth));
    } else {
        let _ = writeln!(out, "{}</stroke>", "  ".repeat(depth));
    }
    Ok(())
}

fn print_node(
    doc: &Document,
    id: NodeId,
    depth: usize,
    dialect: Dialect,
    out: &mut String,
) -> Result<(), String> {
    let node = doc.get(id);
    let indent = "  ".repeat(depth);
    let grida_xml = dialect == Dialect::GridaXml;
    if !grida_xml
        && matches!(
            &node.payload,
            Payload::Shape {
                desc: ShapeDesc::Path(_)
            }
        )
    {
        return Err(format!(
            "node {} is a path historical E3 TextIr cannot represent",
            node.id
        ));
    }
    let tag = match (dialect, &node.payload) {
        (Dialect::GridaXml, Payload::Frame { .. }) => "container",
        (
            Dialect::GridaXml,
            Payload::Shape {
                desc: ShapeDesc::Rect,
            },
        ) => "rect",
        (
            Dialect::GridaXml,
            Payload::Shape {
                desc: ShapeDesc::Ellipse,
            },
        ) => "ellipse",
        (
            Dialect::GridaXml,
            Payload::Shape {
                desc: ShapeDesc::Line,
            },
        ) => "line",
        (
            Dialect::GridaXml,
            Payload::Shape {
                desc: ShapeDesc::Path(_),
            },
        ) => "path",
        _ => node.payload.kind_name(),
    };
    validate_corner_style_for_write(node, grida_xml)?;
    let width_attr = if grida_xml { "width" } else { "w" };
    let height_attr = if grida_xml { "height" } else { "h" };
    let (min_width_attr, max_width_attr, min_height_attr, max_height_attr, aspect_attr) =
        if grida_xml {
            (
                "min-width",
                "max-width",
                "min-height",
                "max-height",
                "aspect-ratio",
            )
        } else {
            ("min-w", "max-w", "min-h", "max-h", "aspect")
        };
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
            SizeIntent::Fixed(v) => push_attr(out, width_attr, &fmt_num(v)),
            SizeIntent::Auto => {
                if matches!(node.payload, Payload::Frame { .. })
                    && !matches!(node.header.x, AxisBinding::Span { .. })
                {
                    push_attr(out, width_attr, "auto");
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
                    push_attr(out, height_attr, &fmt_num(v));
                }
            }
            SizeIntent::Auto => {
                if matches!(node.payload, Payload::Frame { .. })
                    && !matches!(node.header.y, AxisBinding::Span { .. })
                {
                    push_attr(out, height_attr, "auto");
                }
            }
        }
    }
    if let Some(v) = node.header.min_width {
        push_attr(out, min_width_attr, &fmt_num(v));
    }
    if let Some(v) = node.header.max_width {
        push_attr(out, max_width_attr, &fmt_num(v));
    }
    if let Some(v) = node.header.min_height {
        push_attr(out, min_height_attr, &fmt_num(v));
    }
    if let Some(v) = node.header.max_height {
        push_attr(out, max_height_attr, &fmt_num(v));
    }
    if let Some((a, b)) = node.header.aspect_ratio {
        push_attr(out, aspect_attr, &format!("{}:{}", fmt_num(a), fmt_num(b)));
    }
    if grida_xml && !node.corner_radius.is_zero() {
        push_attr(out, "corner-radius", &fmt_corner_radius(node.corner_radius));
    }
    if grida_xml && !node.corner_smoothing.is_zero() {
        push_attr(
            out,
            "corner-smoothing",
            &fmt_num(node.corner_smoothing.value()),
        );
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
                            &format!("{} {}", fmt_num(layout.gap_main), fmt_num(layout.gap_cross)),
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
            if let ShapeDesc::Path(artifact) = desc {
                debug_assert!(grida_xml, "historical path rejected above");
                push_attr(out, "d", artifact.d.as_ref());
                if artifact.fill_rule == FillRule::EvenOdd {
                    push_attr(out, "fill-rule", "evenodd");
                }
            } else if !grida_xml {
                let kind = match desc {
                    ShapeDesc::Rect => "rect",
                    ShapeDesc::Ellipse => "ellipse",
                    ShapeDesc::Line => "line",
                    ShapeDesc::Path(_) => unreachable!(),
                };
                push_attr(out, "kind", kind);
            }
        }
        Payload::Text { font_size, .. } => {
            if grida_xml {
                validate_text_style_for_write(TextStyleRec::from_font_size(*font_size), "text")?;
            }
            if *font_size != 16.0 {
                push_attr(
                    out,
                    if grida_xml { "font-size" } else { "size" },
                    &fmt_num(*font_size),
                );
            }
        }
        Payload::AttributedText {
            attributed_string,
            default_style,
        } => {
            if !grida_xml {
                return Err(format!(
                    "node {} has attributed text historical E3 TextIr cannot represent",
                    node.id
                ));
            }
            validate_text_style_for_write(*default_style, "text")?;
            attributed_string.validate()?;
            push_text_style_overrides(out, *default_style, TextStyleRec::default());
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
    let fill_emission = match dialect {
        Dialect::TextIr => {
            if let Some(fill) = historical_fill(node)? {
                push_attr(out, "fill", &fill.to_hex());
            }
            FillEmission::Omit
        }
        Dialect::GridaXml => grida_xml_fill_emission(node)?,
    };
    if let FillEmission::Attribute(color) = fill_emission {
        push_attr(out, "fill", &color.to_hex());
    }
    let strokes: Vec<&Stroke> = match dialect {
        Dialect::TextIr => vec![],
        Dialect::GridaXml => {
            for stroke in &node.strokes {
                validate_stroke_for_write(stroke, &node.payload, node.corner_smoothing)?;
            }
            node.strokes
                .iter()
                .filter(|stroke| !stroke_is_omitted(stroke, &node.payload))
                .collect()
        }
    };
    let has_fill_child = matches!(fill_emission, FillEmission::Empty | FillEmission::Stack(_));
    let has_properties = has_fill_child || !strokes.is_empty();

    let is_text = node.payload.as_text().is_some();
    if is_text {
        let _ = write!(out, ">");
        if has_fill_child {
            write_fill(fill_emission, depth + 1, true, out)?;
        }
        for stroke in strokes {
            write_stroke(
                stroke,
                &node.payload,
                node.corner_smoothing,
                depth + 1,
                true,
                out,
            )?;
        }
        match &node.payload {
            Payload::Text { content, .. } => {
                let _ = write!(out, "{}", escape_text(content));
            }
            Payload::AttributedText {
                attributed_string,
                default_style,
            } => write_attributed_text_content(attributed_string, *default_style, depth, out)?,
            _ => unreachable!(),
        }
        let _ = writeln!(out, "</text>");
    } else if node.children.is_empty() && !has_properties {
        let _ = writeln!(out, "/>");
    } else {
        let _ = writeln!(out, ">");
        if has_fill_child {
            write_fill(fill_emission, depth + 1, false, out)?;
        }
        for stroke in strokes {
            write_stroke(
                stroke,
                &node.payload,
                node.corner_smoothing,
                depth + 1,
                false,
                out,
            )?;
        }
        for c in &node.children {
            print_node(doc, *c, depth + 1, dialect, out)?;
        }
        let _ = writeln!(out, "{indent}</{tag}>");
    }
    Ok(())
}
