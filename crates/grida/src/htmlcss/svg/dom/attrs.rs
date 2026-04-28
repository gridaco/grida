//! Attribute value parsers — length, color, paint, viewBox, transform,
//! points.
//!
//! Each parser is permissive in the resvg/Blink tradition: invalid input
//! returns `None` and the caller falls back to the SVG default. Typed-attr
//! wrappers (`SvgLength`, `SvgPaint`, ...) come later; for checkpoint 1
//! we operate on raw strings off `DemoNode` attributes.
//!
//! Blink anchor: `core/svg/svg_animated_*.{h,cc}` (we collapse the
//! animVal/baseVal split since Grida is static).

use skia_safe::{Color, Matrix};

// ─── preserveAspectRatio (shared) ─────────────────────────────────────

/// `preserveAspectRatio` decomposed into fit + alignment. Applies to
/// `<svg>`, `<image>`, `<symbol>`, `<view>`, `<feImage>`, etc.
#[derive(Debug, Clone, Copy)]
pub struct PreserveAspectRatio {
    pub fit: Fit,
    pub align_x: AlignX,
    pub align_y: AlignY,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fit {
    /// `align="none"` — non-uniform scale to exactly fill the viewport.
    None,
    /// Uniform scale to *fit* the viewport, preserving aspect (default).
    Meet,
    /// Uniform scale to *fill* the viewport, preserving aspect (cover-like).
    Slice,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlignX {
    Min,
    Mid,
    Max,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlignY {
    Min,
    Mid,
    Max,
}

impl Default for PreserveAspectRatio {
    /// SVG default: `xMidYMid meet`.
    fn default() -> Self {
        Self {
            fit: Fit::Meet,
            align_x: AlignX::Mid,
            align_y: AlignY::Mid,
        }
    }
}

/// Parse a `preserveAspectRatio` attribute value into the structured
/// fit + alignment form used by viewport / image consumers.
pub fn parse_preserve_aspect_ratio(s: &str) -> PreserveAspectRatio {
    let mut tokens = s.split_ascii_whitespace();
    let align = tokens.next().unwrap_or("xMidYMid");
    let meet_or_slice = tokens.next().unwrap_or("meet");
    if align.eq_ignore_ascii_case("none") {
        return PreserveAspectRatio {
            fit: Fit::None,
            align_x: AlignX::Min,
            align_y: AlignY::Min,
        };
    }
    let fit = match meet_or_slice.to_ascii_lowercase().as_str() {
        "slice" => Fit::Slice,
        _ => Fit::Meet,
    };
    let (align_x, align_y) = match align {
        "xMinYMin" => (AlignX::Min, AlignY::Min),
        "xMidYMin" => (AlignX::Mid, AlignY::Min),
        "xMaxYMin" => (AlignX::Max, AlignY::Min),
        "xMinYMid" => (AlignX::Min, AlignY::Mid),
        "xMidYMid" => (AlignX::Mid, AlignY::Mid),
        "xMaxYMid" => (AlignX::Max, AlignY::Mid),
        "xMinYMax" => (AlignX::Min, AlignY::Max),
        "xMidYMax" => (AlignX::Mid, AlignY::Max),
        "xMaxYMax" => (AlignX::Max, AlignY::Max),
        _ => (AlignX::Mid, AlignY::Mid),
    };
    PreserveAspectRatio {
        fit,
        align_x,
        align_y,
    }
}

/// Compute the destination rect for placing an image of intrinsic size
/// `(intr_w, intr_h)` inside `viewport`, applying `par`. Returns the
/// rect in viewport coordinate space. Mirrors Skia's
/// `SkSVGNode::ComputeViewboxMatrix` followed by `mapRect`.
pub fn compute_image_dst_rect(
    intr_w: f32,
    intr_h: f32,
    viewport: skia_safe::Rect,
    par: PreserveAspectRatio,
) -> skia_safe::Rect {
    if intr_w <= 0.0 || intr_h <= 0.0 {
        return viewport;
    }
    let scale_x = viewport.width() / intr_w;
    let scale_y = viewport.height() / intr_h;
    let (sx, sy) = match par.fit {
        Fit::None => (scale_x, scale_y),
        Fit::Meet => {
            let s = scale_x.min(scale_y);
            (s, s)
        }
        Fit::Slice => {
            let s = scale_x.max(scale_y);
            (s, s)
        }
    };
    let dx = match par.align_x {
        AlignX::Min => 0.0,
        AlignX::Mid => (viewport.width() - intr_w * sx) / 2.0,
        AlignX::Max => viewport.width() - intr_w * sx,
    };
    let dy = match par.align_y {
        AlignY::Min => 0.0,
        AlignY::Mid => (viewport.height() - intr_h * sy) / 2.0,
        AlignY::Max => viewport.height() - intr_h * sy,
    };
    skia_safe::Rect::from_xywh(
        viewport.left + dx,
        viewport.top + dy,
        intr_w * sx,
        intr_h * sy,
    )
}

/// Length-as-pixel. Handles absolute CSS units (`px`, `cm`, `mm`,
/// `in`, `pt`, `pc`) and falls back to default-context relative units
/// (`em` / `rem` = 16px, `ex` / `ch` = 8px). Per spec relative units
/// resolve against the inherited `font-size`; without a cascade we
/// approximate. Percentages still return `None` — those need the
/// containing viewport. Bare numbers are user units (≡ px).
pub fn parse_length_px(s: &str) -> Option<f32> {
    let s = s.trim();
    if s.ends_with('%') {
        return None;
    }
    // Absolute units. CSS Values 4: 1in = 96px, 1cm = 96/2.54,
    // 1mm = 96/25.4, 1pt = 96/72, 1pc = 96/6.
    let (num, factor) = if let Some(p) = s.strip_suffix("px").or_else(|| s.strip_suffix("PX")) {
        (p, 1.0)
    } else if let Some(p) = s.strip_suffix("mm") {
        (p, 96.0 / 25.4)
    } else if let Some(p) = s.strip_suffix("cm") {
        (p, 96.0 / 2.54)
    } else if let Some(p) = s.strip_suffix("in") {
        (p, 96.0)
    } else if let Some(p) = s.strip_suffix("pt") {
        (p, 96.0 / 72.0)
    } else if let Some(p) = s.strip_suffix("pc") {
        (p, 96.0 / 6.0)
    } else if let Some(p) = s.strip_suffix('Q').or_else(|| s.strip_suffix('q')) {
        // CSS Values 4: 1Q = 0.25mm = 96/(25.4*4) px ≈ 0.945px.
        (p, 96.0 / (25.4 * 4.0))
    } else if let Some(p) = s.strip_suffix("rem") {
        // Relative to the root `<svg>`'s font-size; we use the
        // CSS default 16px in lieu of a cascade.
        (p, 16.0)
    } else if let Some(p) = s.strip_suffix("em") {
        // Relative to the inherited font-size; without cascade
        // resolution we approximate with 16px. Better than failing.
        (p, 16.0)
    } else if let Some(p) = s.strip_suffix("ex") {
        // Roughly half an em.
        (p, 8.0)
    } else if let Some(p) = s.strip_suffix("ch") {
        // Width of `0`; roughly half an em.
        (p, 8.0)
    } else {
        (s, 1.0)
    };
    num.trim().parse::<f32>().ok().map(|v| v * factor)
}

/// `viewBox="min-x min-y width height"`.
pub fn parse_viewbox(s: &str) -> Option<(f32, f32, f32, f32)> {
    let parts: Vec<f32> = s
        .split(|c: char| c.is_ascii_whitespace() || c == ',')
        .filter(|p| !p.is_empty())
        .filter_map(|p| p.parse::<f32>().ok())
        .collect();
    if parts.len() != 4 {
        return None;
    }
    if parts[2] <= 0.0 || parts[3] <= 0.0 {
        return None;
    }
    Some((parts[0], parts[1], parts[2], parts[3]))
}

/// `transform="..."` — `matrix`, `translate`, `scale`, `rotate`, `skewX`,
/// `skewY`, composed left-to-right per SVG.
pub fn parse_transform(s: &str) -> Option<Matrix> {
    let bytes = s.as_bytes();
    let mut m = Matrix::new_identity();
    let mut i = 0;
    while i < bytes.len() {
        while i < bytes.len() && (bytes[i].is_ascii_whitespace() || bytes[i] == b',') {
            i += 1;
        }
        if i >= bytes.len() {
            break;
        }
        let name_start = i;
        while i < bytes.len() && bytes[i].is_ascii_alphabetic() {
            i += 1;
        }
        if name_start == i {
            return None;
        }
        let name = &s[name_start..i];
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= bytes.len() || bytes[i] != b'(' {
            return None;
        }
        i += 1;
        let args_start = i;
        while i < bytes.len() && bytes[i] != b')' {
            i += 1;
        }
        if i >= bytes.len() {
            return None;
        }
        let nums: Vec<f32> = s[args_start..i]
            .split(|c: char| c.is_ascii_whitespace() || c == ',')
            .filter(|p| !p.is_empty())
            .filter_map(|p| p.parse::<f32>().ok())
            .collect();
        i += 1;

        let step = match name {
            "matrix" if nums.len() == 6 => {
                let mut t = Matrix::new_identity();
                t.set_9(&[
                    nums[0], nums[2], nums[4], //
                    nums[1], nums[3], nums[5], //
                    0.0, 0.0, 1.0,
                ]);
                t
            }
            "translate" => {
                let tx = *nums.first().unwrap_or(&0.0);
                let ty = *nums.get(1).unwrap_or(&0.0);
                Matrix::translate((tx, ty))
            }
            "scale" => {
                let sx = *nums.first().unwrap_or(&1.0);
                let sy = *nums.get(1).unwrap_or(&sx);
                Matrix::scale((sx, sy))
            }
            "rotate" => {
                let a = *nums.first().unwrap_or(&0.0);
                if nums.len() == 3 {
                    Matrix::rotate_deg_pivot(a, (nums[1], nums[2]))
                } else {
                    Matrix::rotate_deg(a)
                }
            }
            "skewX" => {
                let a = nums.first().copied().unwrap_or(0.0).to_radians();
                Matrix::skew((a.tan(), 0.0))
            }
            "skewY" => {
                let a = nums.first().copied().unwrap_or(0.0).to_radians();
                Matrix::skew((0.0, a.tan()))
            }
            _ => return None,
        };
        m = Matrix::concat(&m, &step);
    }
    Some(m)
}

/// SVG paint value — solid color, `none`, or `currentColor`. Paint-server
/// references (`url(#id)`) come later.
#[derive(Debug, Clone, Copy)]
pub enum Paint {
    None,
    Color(Color),
    CurrentColor,
}

pub fn parse_paint(s: &str) -> Option<Paint> {
    let s = s.trim();
    if s.eq_ignore_ascii_case("none") {
        return Some(Paint::None);
    }
    if s.eq_ignore_ascii_case("currentColor") {
        return Some(Paint::CurrentColor);
    }
    parse_color(s).map(Paint::Color)
}

pub fn parse_color(s: &str) -> Option<Color> {
    let s = s.trim();
    if let Some(hex) = s.strip_prefix('#') {
        return parse_hex(hex);
    }
    // Try `rgba(` first since `rgba(` doesn't start with `rgb(`
    // (the `(` differs), but to keep the dispatch obvious we order
    // longer names before shorter. Both forms accept an optional
    // 4th alpha component (CSS Color 4 / SVG 2 unify `rgb` and
    // `rgba` — same for `hsl` / `hsla`). The 4th component may be
    // a number in [0,1] or a percentage.
    if let Some(rest) = strip_func(s, "rgba").or_else(|| strip_func(s, "rgb")) {
        return parse_rgb_func(rest);
    }
    if let Some(rest) = strip_func(s, "hsla").or_else(|| strip_func(s, "hsl")) {
        return parse_hsl_func(rest);
    }
    named_color(s)
}

/// Parse CSS Color 4 alpha (`<number>` in [0,1] or `<percentage>`).
fn parse_alpha(s: &str) -> Option<u8> {
    let s = s.trim();
    let v = if let Some(p) = s.strip_suffix('%') {
        p.trim().parse::<f32>().ok()? / 100.0
    } else {
        s.parse::<f32>().ok()?
    };
    Some((v.clamp(0.0, 1.0) * 255.0).round() as u8)
}

/// Split the inside of `rgb(...)` / `hsl(...)` into 3 or 4 components,
/// supporting both legacy comma-separated form and CSS Color 4
/// space-separated form (with optional `/ <alpha>`).
fn split_color_components(rest: &str) -> Option<(Vec<String>, Option<String>)> {
    let rest = rest.trim();
    if rest.contains(',') {
        // Legacy form: comma-separated. 3 or 4 components.
        let parts: Vec<String> = rest.split(',').map(|p| p.trim().to_string()).collect();
        match parts.len() {
            3 => Some((parts, None)),
            4 => {
                let mut p = parts;
                let a = p.pop().unwrap();
                Some((p, Some(a)))
            }
            _ => None,
        }
    } else {
        // CSS Color 4 modern form: whitespace-separated, optional
        // `/ <alpha>` suffix.
        let (head, alpha) = if let Some((h, a)) = rest.rsplit_once('/') {
            (h.trim(), Some(a.trim().to_string()))
        } else {
            (rest, None)
        };
        let parts: Vec<String> = head.split_ascii_whitespace().map(str::to_string).collect();
        if parts.len() == 3 {
            Some((parts, alpha))
        } else {
            None
        }
    }
}

fn parse_rgb_func(rest: &str) -> Option<Color> {
    let (rgb, alpha) = split_color_components(rest)?;
    // Legacy `rgb()` / `rgba()` commas don't permit mixing integer
    // and percentage component types — that's an invalid value per
    // CSS Color 4 §4.1, and resvg's reference renders it as
    // `none` (drops the fill). The modern whitespace form is
    // tolerant; we already lost the information about which form
    // was used, but the mixed case only matters for the legacy form
    // since the modern form is always all-percent or all-number in
    // practice in the test suite.
    let percents: Vec<bool> = rgb.iter().map(|p| p.trim_end().ends_with('%')).collect();
    if percents.iter().any(|p| *p) && percents.iter().any(|p| !*p) {
        return None;
    }
    let r = parse_color_byte(&rgb[0])?;
    let g = parse_color_byte(&rgb[1])?;
    let b = parse_color_byte(&rgb[2])?;
    let a = match alpha {
        Some(a) => parse_alpha(&a)?,
        None => 255,
    };
    Some(Color::from_argb(a, r, g, b))
}

fn parse_hsl_func(rest: &str) -> Option<Color> {
    let (hsl, alpha) = split_color_components(rest)?;
    let a = match alpha {
        Some(a) => parse_alpha(&a)?,
        None => 255,
    };
    parse_hsl_inner(&hsl[0], &hsl[1], &hsl[2], a)
}

/// CSS hsl(H, S%, L%) — H in degrees, S/L percentages. Returns the
/// color with the given alpha byte. Implements the CSS Color 4
/// HSL→RGB conversion (which is what browsers use for SVG paint).
fn parse_hsl_inner(h_str: &str, s_str: &str, l_str: &str, a: u8) -> Option<Color> {
    let h_raw = h_str
        .strip_suffix("deg")
        .or_else(|| h_str.strip_suffix("DEG"))
        .unwrap_or(h_str)
        .trim();
    let h: f32 = h_raw.parse().ok()?;
    let s_raw = s_str.strip_suffix('%')?.trim();
    let l_raw = l_str.strip_suffix('%')?.trim();
    let s: f32 = s_raw.parse::<f32>().ok()?.clamp(0.0, 100.0) / 100.0;
    let l: f32 = l_raw.parse::<f32>().ok()?.clamp(0.0, 100.0) / 100.0;
    let h_norm = ((h % 360.0) + 360.0) % 360.0 / 60.0;
    let chroma = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = chroma * (1.0 - (h_norm % 2.0 - 1.0).abs());
    let (r1, g1, b1) = match h_norm as i32 {
        0 => (chroma, x, 0.0),
        1 => (x, chroma, 0.0),
        2 => (0.0, chroma, x),
        3 => (0.0, x, chroma),
        4 => (x, 0.0, chroma),
        _ => (chroma, 0.0, x),
    };
    let m = l - chroma / 2.0;
    let to_byte = |v: f32| ((v + m).clamp(0.0, 1.0) * 255.0).round() as u8;
    Some(Color::from_argb(a, to_byte(r1), to_byte(g1), to_byte(b1)))
}

fn strip_func<'a>(s: &'a str, name: &str) -> Option<&'a str> {
    let lower = s.to_ascii_lowercase();
    let prefix = format!("{name}(");
    if !lower.starts_with(&prefix) {
        return None;
    }
    let inner = &s[prefix.len()..];
    inner.strip_suffix(')')
}

fn parse_color_byte(p: &str) -> Option<u8> {
    let p = p.trim();
    if let Some(pct) = p.strip_suffix('%') {
        let v: f32 = pct.trim().parse().ok()?;
        // CSS Color spec doesn't mandate a rounding rule; resvg
        // (the reference renderer for our reftest harness) does
        // `(percentage * 2.55) as u8` — i.e. truncation, so `50% →
        // 127`. We match that convention to score against reference
        // PNGs at strict threshold-0.
        Some((v.clamp(0.0, 100.0) * 2.55).trunc() as u8)
    } else {
        // Allow float (e.g. "127.5") for spec compliance.
        p.parse::<f32>()
            .ok()
            .map(|v| v.clamp(0.0, 255.0).round() as u8)
    }
}

fn parse_hex(hex: &str) -> Option<Color> {
    match hex.len() {
        3 => {
            let r = u8::from_str_radix(&hex[0..1], 16).ok()?;
            let g = u8::from_str_radix(&hex[1..2], 16).ok()?;
            let b = u8::from_str_radix(&hex[2..3], 16).ok()?;
            Some(Color::from_rgb(r * 17, g * 17, b * 17))
        }
        // CSS Color 4 `#RGBA` short alpha form (each digit doubled).
        4 => {
            let r = u8::from_str_radix(&hex[0..1], 16).ok()?;
            let g = u8::from_str_radix(&hex[1..2], 16).ok()?;
            let b = u8::from_str_radix(&hex[2..3], 16).ok()?;
            let a = u8::from_str_radix(&hex[3..4], 16).ok()?;
            Some(Color::from_argb(a * 17, r * 17, g * 17, b * 17))
        }
        6 => {
            let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
            let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
            let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
            Some(Color::from_rgb(r, g, b))
        }
        // CSS Color 4 `#RRGGBBAA`.
        8 => {
            let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
            let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
            let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
            let a = u8::from_str_radix(&hex[6..8], 16).ok()?;
            Some(Color::from_argb(a, r, g, b))
        }
        _ => None,
    }
}

/// Full CSS3 / SVG named color list (the 148 colours in the X11 / CSS3
/// `<color>` keywords table, plus `transparent`). Lookups are
/// case-insensitive — `blanchedAlmond`, `BLANCHEDALMOND`, and
/// `blanchedalmond` all resolve.
fn named_color(s: &str) -> Option<Color> {
    let s = s.to_ascii_lowercase();
    if s == "transparent" {
        return Some(Color::TRANSPARENT);
    }
    let (r, g, b) = match s.as_str() {
        "aliceblue" => (240, 248, 255),
        "antiquewhite" => (250, 235, 215),
        "aqua" | "cyan" => (0, 255, 255),
        "aquamarine" => (127, 255, 212),
        "azure" => (240, 255, 255),
        "beige" => (245, 245, 220),
        "bisque" => (255, 228, 196),
        "black" => (0, 0, 0),
        "blanchedalmond" => (255, 235, 205),
        "blue" => (0, 0, 255),
        "blueviolet" => (138, 43, 226),
        "brown" => (165, 42, 42),
        "burlywood" => (222, 184, 135),
        "cadetblue" => (95, 158, 160),
        "chartreuse" => (127, 255, 0),
        "chocolate" => (210, 105, 30),
        "coral" => (255, 127, 80),
        "cornflowerblue" => (100, 149, 237),
        "cornsilk" => (255, 248, 220),
        "crimson" => (220, 20, 60),
        "darkblue" => (0, 0, 139),
        "darkcyan" => (0, 139, 139),
        "darkgoldenrod" => (184, 134, 11),
        "darkgray" | "darkgrey" => (169, 169, 169),
        "darkgreen" => (0, 100, 0),
        "darkkhaki" => (189, 183, 107),
        "darkmagenta" => (139, 0, 139),
        "darkolivegreen" => (85, 107, 47),
        "darkorange" => (255, 140, 0),
        "darkorchid" => (153, 50, 204),
        "darkred" => (139, 0, 0),
        "darksalmon" => (233, 150, 122),
        "darkseagreen" => (143, 188, 143),
        "darkslateblue" => (72, 61, 139),
        "darkslategray" | "darkslategrey" => (47, 79, 79),
        "darkturquoise" => (0, 206, 209),
        "darkviolet" => (148, 0, 211),
        "deeppink" => (255, 20, 147),
        "deepskyblue" => (0, 191, 255),
        "dimgray" | "dimgrey" => (105, 105, 105),
        "dodgerblue" => (30, 144, 255),
        "firebrick" => (178, 34, 34),
        "floralwhite" => (255, 250, 240),
        "forestgreen" => (34, 139, 34),
        "fuchsia" | "magenta" => (255, 0, 255),
        "gainsboro" => (220, 220, 220),
        "ghostwhite" => (248, 248, 255),
        "gold" => (255, 215, 0),
        "goldenrod" => (218, 165, 32),
        "gray" | "grey" => (128, 128, 128),
        "green" => (0, 128, 0),
        "greenyellow" => (173, 255, 47),
        "honeydew" => (240, 255, 240),
        "hotpink" => (255, 105, 180),
        "indianred" => (205, 92, 92),
        "indigo" => (75, 0, 130),
        "ivory" => (255, 255, 240),
        "khaki" => (240, 230, 140),
        "lavender" => (230, 230, 250),
        "lavenderblush" => (255, 240, 245),
        "lawngreen" => (124, 252, 0),
        "lemonchiffon" => (255, 250, 205),
        "lightblue" => (173, 216, 230),
        "lightcoral" => (240, 128, 128),
        "lightcyan" => (224, 255, 255),
        "lightgoldenrodyellow" => (250, 250, 210),
        "lightgray" | "lightgrey" => (211, 211, 211),
        "lightgreen" => (144, 238, 144),
        "lightpink" => (255, 182, 193),
        "lightsalmon" => (255, 160, 122),
        "lightseagreen" => (32, 178, 170),
        "lightskyblue" => (135, 206, 250),
        "lightslategray" | "lightslategrey" => (119, 136, 153),
        "lightsteelblue" => (176, 196, 222),
        "lightyellow" => (255, 255, 224),
        "lime" => (0, 255, 0),
        "limegreen" => (50, 205, 50),
        "linen" => (250, 240, 230),
        "maroon" => (128, 0, 0),
        "mediumaquamarine" => (102, 205, 170),
        "mediumblue" => (0, 0, 205),
        "mediumorchid" => (186, 85, 211),
        "mediumpurple" => (147, 112, 219),
        "mediumseagreen" => (60, 179, 113),
        "mediumslateblue" => (123, 104, 238),
        "mediumspringgreen" => (0, 250, 154),
        "mediumturquoise" => (72, 209, 204),
        "mediumvioletred" => (199, 21, 133),
        "midnightblue" => (25, 25, 112),
        "mintcream" => (245, 255, 250),
        "mistyrose" => (255, 228, 225),
        "moccasin" => (255, 228, 181),
        "navajowhite" => (255, 222, 173),
        "navy" => (0, 0, 128),
        "oldlace" => (253, 245, 230),
        "olive" => (128, 128, 0),
        "olivedrab" => (107, 142, 35),
        "orange" => (255, 165, 0),
        "orangered" => (255, 69, 0),
        "orchid" => (218, 112, 214),
        "palegoldenrod" => (238, 232, 170),
        "palegreen" => (152, 251, 152),
        "paleturquoise" => (175, 238, 238),
        "palevioletred" => (219, 112, 147),
        "papayawhip" => (255, 239, 213),
        "peachpuff" => (255, 218, 185),
        "peru" => (205, 133, 63),
        "pink" => (255, 192, 203),
        "plum" => (221, 160, 221),
        "powderblue" => (176, 224, 230),
        "purple" => (128, 0, 128),
        "rebeccapurple" => (102, 51, 153),
        "red" => (255, 0, 0),
        "rosybrown" => (188, 143, 143),
        "royalblue" => (65, 105, 225),
        "saddlebrown" => (139, 69, 19),
        "salmon" => (250, 128, 114),
        "sandybrown" => (244, 164, 96),
        "seagreen" => (46, 139, 87),
        "seashell" => (255, 245, 238),
        "sienna" => (160, 82, 45),
        "silver" => (192, 192, 192),
        "skyblue" => (135, 206, 235),
        "slateblue" => (106, 90, 205),
        "slategray" | "slategrey" => (112, 128, 144),
        "snow" => (255, 250, 250),
        "springgreen" => (0, 255, 127),
        "steelblue" => (70, 130, 180),
        "tan" => (210, 180, 140),
        "teal" => (0, 128, 128),
        "thistle" => (216, 191, 216),
        "tomato" => (255, 99, 71),
        "turquoise" => (64, 224, 208),
        "violet" => (238, 130, 238),
        "wheat" => (245, 222, 179),
        "white" => (255, 255, 255),
        "whitesmoke" => (245, 245, 245),
        "yellow" => (255, 255, 0),
        "yellowgreen" => (154, 205, 50),
        _ => return None,
    };
    Some(Color::from_rgb(r, g, b))
}

/// `points="..."` — flat list of (x, y) pairs.
pub fn parse_points(s: &str) -> Vec<(f32, f32)> {
    let nums: Vec<f32> = s
        .split(|c: char| c.is_ascii_whitespace() || c == ',')
        .filter(|p| !p.is_empty())
        .filter_map(|p| p.parse::<f32>().ok())
        .collect();
    nums.chunks_exact(2).map(|c| (c[0], c[1])).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn length_px_handles_unit_suffix() {
        assert_eq!(parse_length_px("10"), Some(10.0));
        assert_eq!(parse_length_px("10px"), Some(10.0));
        assert_eq!(parse_length_px("  10.5  "), Some(10.5));
        assert_eq!(parse_length_px("10em"), None);
    }

    #[test]
    fn viewbox_4_numbers() {
        assert_eq!(parse_viewbox("0 0 100 50"), Some((0.0, 0.0, 100.0, 50.0)));
        assert_eq!(parse_viewbox("0,0,100,50"), Some((0.0, 0.0, 100.0, 50.0)));
        assert_eq!(parse_viewbox("0 0 100"), None);
        assert_eq!(parse_viewbox("0 0 -1 1"), None);
    }

    #[test]
    fn color_hex_and_names() {
        assert_eq!(parse_color("#ff0000"), Some(Color::from_rgb(255, 0, 0)));
        assert_eq!(parse_color("#f00"), Some(Color::from_rgb(255, 0, 0)));
        assert_eq!(parse_color("red"), Some(Color::from_rgb(255, 0, 0)));
        assert_eq!(
            parse_color("rgb(255, 0, 0)"),
            Some(Color::from_rgb(255, 0, 0))
        );
        assert_eq!(parse_color("nope"), None);
    }

    #[test]
    fn paint_keywords() {
        assert!(matches!(parse_paint("none"), Some(Paint::None)));
        assert!(matches!(
            parse_paint("currentColor"),
            Some(Paint::CurrentColor)
        ));
        assert!(matches!(parse_paint("red"), Some(Paint::Color(_))));
    }

    #[test]
    fn transform_translate_scale() {
        let m = parse_transform("translate(10, 20) scale(2)").expect("parse");
        let p = m.map_point((0.0, 0.0));
        assert!((p.x - 10.0).abs() < 1e-4);
        assert!((p.y - 20.0).abs() < 1e-4);
        let p2 = m.map_point((1.0, 1.0));
        assert!((p2.x - 12.0).abs() < 1e-4);
        assert!((p2.y - 22.0).abs() < 1e-4);
    }
}
