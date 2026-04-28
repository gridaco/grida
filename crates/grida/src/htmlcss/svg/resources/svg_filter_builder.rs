//! `FilterEffect` IR — DOM-resolved primitives ready for DAG build.
//!
//! Each `fe*` primitive parses into one [`FilterEffect`] variant. The
//! [`Primitive`] wrapper carries cross-cutting fields (`result=`, the
//! primitive subregion before resolution, the explicit `in=` fallback to
//! `Previous`). Building the actual `skia_safe::ImageFilter` chain is in
//! [`super::filter`] (`build_filter_dag`).
//!
//! Per-primitive Skia mapping (target table — implemented incrementally):
//!
//! | Primitive             | Skia ImageFilter                          |
//! | --------------------- | ----------------------------------------- |
//! | feGaussianBlur        | `image_filters::blur`                     |
//! | feOffset              | `image_filters::offset`                   |
//! | feColorMatrix         | `image_filters::color_filter` (matrix)    |
//! | feComposite           | `image_filters::arithmetic` / `blend`     |
//! | feMerge               | `image_filters::merge`                    |
//! | feFlood               | `image_filters::shader` (flood color)     |
//! | feBlend               | `image_filters::blend`                    |
//! | feMorphology          | `image_filters::dilate` / `erode`         |
//!
//! Blink anchor: `core/svg/graphics/filters/svg_filter_builder.{h,cc}`
//! plus the `FilterEffect` family in `platform/graphics/filters/`.
//!
//! Skia anchor: `modules/svg/include/SkSVGFe.h` and the per-primitive
//! `SkSVGFe*.cpp` files. We follow Skia's single-pass shape (one named
//! result table, per-primitive `crop_rect`) but fix Skia svg::Dom's bugs
//! against the spec (`color-interpolation-filters: auto → linearRGB`,
//! the SVG-2 blend modes Skia doesn't support, etc.).

use csscascade::dom::{DemoDom, DemoNode, DemoNodeData, NodeId};
use skia_safe::Color;

use crate::htmlcss::svg::dom::attrs::parse_length_px;
use crate::htmlcss::svg::dom::element::get_attr;
use crate::htmlcss::svg::dom::href::href_attr;

/// Where an `in=` / `in2=` reference resolves to.
#[derive(Debug, Clone)]
pub enum FeInput {
    /// `SourceGraphic` (or absent `in=` on the first primitive). Maps to
    /// `None` when fed to a `skia_safe::image_filters::*` builder, which
    /// Skia documents as "the input image being filtered."
    SourceGraphic,
    /// `SourceAlpha` — RGB zeroed, alpha preserved. Realized as
    /// `image_filters::color_filter` with a `(0,0,0,1)` diagonal matrix.
    SourceAlpha,
    /// `FillPaint`/`StrokePaint`. We don't have access to the host
    /// element's fill/stroke at filter-build time (that would require
    /// threading `SkPaint` through the apply call site, mirroring
    /// `SkSVGFilterContext::fillPaint`). Treated as `SourceGraphic` for
    /// now — this is the same fallback Skia svg::Dom uses when the
    /// shader extraction fails.
    FillPaint,
    StrokePaint,
    /// `BackgroundImage` / `BackgroundAlpha` — the parent enable-background
    /// stack. SVG 2 deprecated these and most renderers don't implement
    /// them. We don't either; treated as `SourceGraphic`.
    BackgroundImage,
    BackgroundAlpha,
    /// Named `result=` of an earlier primitive in this filter.
    Reference(String),
    /// Empty `in=` after the first primitive — falls back to the previous
    /// primitive's result. The last-result is tracked by the builder.
    Previous,
}

impl FeInput {
    pub fn parse(value: Option<&str>, is_first: bool) -> Self {
        let Some(s) = value.map(str::trim).filter(|s| !s.is_empty()) else {
            // §15.7 "If no value is provided and this is the first
            // filter primitive, then this filter primitive will use
            // SourceGraphic as its input. If no value is provided and
            // this is a subsequent filter primitive, then this filter
            // primitive will use the result from the previous filter
            // primitive as its input."
            return if is_first {
                FeInput::SourceGraphic
            } else {
                FeInput::Previous
            };
        };
        match s {
            "SourceGraphic" => FeInput::SourceGraphic,
            "SourceAlpha" => FeInput::SourceAlpha,
            "FillPaint" => FeInput::FillPaint,
            "StrokePaint" => FeInput::StrokePaint,
            "BackgroundImage" => FeInput::BackgroundImage,
            "BackgroundAlpha" => FeInput::BackgroundAlpha,
            other => FeInput::Reference(other.to_string()),
        }
    }
}

/// Color-interpolation mode for a primitive.
///
/// Per Filter Effects §15.4, the SVG default is `linearRGB`. Skia
/// svg::Dom incorrectly treats `auto` as `sRGB` (see `SkSVGFe.cpp:90-92`);
/// we follow Blink/the spec.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColorInterp {
    SRgb,
    LinearRgb,
}

/// Discriminator for `feColorMatrix/@type`.
#[derive(Debug, Clone)]
pub enum ColorMatrixKind {
    /// `type="matrix"` — 4×5 row-major matrix (20 floats). Default to
    /// identity if `values=` is absent / malformed.
    Matrix([f32; 20]),
    /// `type="saturate"` — `values` is a single number `[0,1]`.
    Saturate(f32),
    /// `type="hueRotate"` — `values` is a number of degrees.
    HueRotate(f32),
    /// `type="luminanceToAlpha"`. No `values=`.
    LuminanceToAlpha,
}

/// Discriminator for `feComposite/@operator`.
#[derive(Debug, Clone)]
pub enum CompositeOp {
    Over,
    In,
    Out,
    Atop,
    Xor,
    /// SVG 1.1 `lighter`, equivalent to CSS `plus-lighter` and Skia
    /// `BlendMode::Plus`.
    Lighter,
    /// `operator="arithmetic"` — `result = k1*i1*i2 + k2*i1 + k3*i2 + k4`,
    /// computed in premultiplied space with PM-validation.
    Arithmetic {
        k1: f32,
        k2: f32,
        k3: f32,
        k4: f32,
    },
}

/// Discriminator for `feMorphology/@operator`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MorphOp {
    Erode,
    Dilate,
}

/// One channel function from a `<feComponentTransfer>` (`<feFuncR/G/B/A>`).
///
/// Per Filter Effects §15.16, each `<feFunc*>` carries `type` ∈ {identity,
/// table, discrete, linear, gamma}. We pre-resolve to a 256-entry LUT
/// (or `None` for identity) so the builder can hand straight to
/// `color_filters::table_argb` without per-pixel branching. Cite Blink
/// `fe_component_transfer.cc:47-97` for the math.
#[derive(Debug, Clone)]
pub struct TransferFn {
    pub kind: TransferKind,
}

#[derive(Debug, Clone)]
pub enum TransferKind {
    Identity,
    Table(Vec<f32>),
    Discrete(Vec<f32>),
    Linear {
        slope: f32,
        intercept: f32,
    },
    Gamma {
        amplitude: f32,
        exponent: f32,
        offset: f32,
    },
}

impl TransferFn {
    /// Build the 256-byte LUT for this channel, or `None` if the
    /// function is identity (which `color_filters::table_argb` accepts
    /// as the per-channel "do nothing" sentinel).
    ///
    /// Math mirrors Blink's `fe_component_transfer.cc:47-97`. Outputs
    /// are clamped to `[0, 255]` per the Blink helper `ClampToU8`.
    pub fn lut(&self) -> Option<[u8; 256]> {
        match &self.kind {
            TransferKind::Identity => None,
            TransferKind::Table(vals) => {
                if vals.is_empty() {
                    return None;
                }
                let n = vals.len();
                let mut out = [0u8; 256];
                for (i, slot) in out.iter_mut().enumerate() {
                    let c = i as f32 / 255.0;
                    let kf = c * (n - 1) as f32;
                    let k = kf.floor() as usize;
                    let v1 = vals[k.min(n - 1)];
                    let v2 = vals[(k + 1).min(n - 1)];
                    let val = v1 + (kf - k as f32) * (v2 - v1);
                    *slot = clamp_u8(val * 255.0);
                }
                Some(out)
            }
            TransferKind::Discrete(vals) => {
                if vals.is_empty() {
                    return None;
                }
                let n = vals.len();
                let mut out = [0u8; 256];
                for (i, slot) in out.iter_mut().enumerate() {
                    let k = ((i as f32 * n as f32 / 255.0).floor() as usize).min(n - 1);
                    *slot = clamp_u8(vals[k] * 255.0);
                }
                Some(out)
            }
            TransferKind::Linear { slope, intercept } => {
                let mut out = [0u8; 256];
                for (i, slot) in out.iter_mut().enumerate() {
                    *slot = clamp_u8(slope * i as f32 + intercept * 255.0);
                }
                Some(out)
            }
            TransferKind::Gamma {
                amplitude,
                exponent,
                offset,
            } => {
                let mut out = [0u8; 256];
                for (i, slot) in out.iter_mut().enumerate() {
                    let val = amplitude * (i as f32 / 255.0).powf(*exponent) + offset;
                    *slot = clamp_u8(val * 255.0);
                }
                Some(out)
            }
        }
    }
}

fn clamp_u8(v: f32) -> u8 {
    v.round().clamp(0.0, 255.0) as u8
}

/// One DOM-parsed primitive, ready to be turned into an
/// `skia_safe::ImageFilter`.
#[derive(Debug, Clone)]
pub enum FilterEffect {
    GaussianBlur {
        input: FeInput,
        std_dev_x: f32,
        std_dev_y: f32,
    },
    Offset {
        input: FeInput,
        dx: f32,
        dy: f32,
    },
    ColorMatrix {
        input: FeInput,
        kind: ColorMatrixKind,
    },
    Composite {
        in1: FeInput,
        in2: FeInput,
        op: CompositeOp,
    },
    Blend {
        in1: FeInput,
        in2: FeInput,
        mode: skia_safe::BlendMode,
    },
    Merge {
        inputs: Vec<FeInput>,
    },
    Flood {
        color: Color,
        /// Pre-multiplied into `color`'s alpha by the parser. Tracked
        /// separately for diagnostics.
        opacity: f32,
    },
    Morphology {
        input: FeInput,
        op: MorphOp,
        radius_x: f32,
        radius_y: f32,
    },
    /// `feComponentTransfer` — per-channel transfer function. Each of the
    /// four channel slots maps directly onto a `color_filters::table_argb`
    /// 256-byte LUT (or `None` for identity / absent). See
    /// `TransferFn::lut`. Cite Blink `fe_component_transfer.cc:47-97`.
    ComponentTransfer {
        input: FeInput,
        r: TransferFn,
        g: TransferFn,
        b: TransferFn,
        a: TransferFn,
    },
    /// `feDropShadow` — SVG 2 §15.18 syntactic sugar for the
    /// blur+offset+flood+composite+merge chain. Skia's
    /// `image_filters::drop_shadow` realizes the entire chain in one
    /// `DropShadowPaintFilter` (mode `kDrawShadowAndForeground` —
    /// includes the source). Cite Blink `fe_drop_shadow.cc:66-83`.
    DropShadow {
        input: FeInput,
        dx: f32,
        dy: f32,
        std_dev_x: f32,
        std_dev_y: f32,
        /// `flood-color` × `flood-opacity`, pre-multiplied. Skia takes
        /// a single `Color` for the shadow, so the opacity must fold
        /// into the alpha channel before the call.
        color: Color,
    },
    /// `feTurbulence` — Perlin-noise procedural source. No inputs;
    /// produces noise across the primitive subregion. Cite Blink
    /// `fe_turbulence.cc:127-140` and Skia
    /// `SkSVGFeTurbulence.cpp:71-78`.
    Turbulence {
        kind: TurbulenceKind,
        /// `baseFrequency` — one or two values; single value duplicates
        /// to both axes.
        base_freq_x: f32,
        base_freq_y: f32,
        /// `numOctaves`, default 1, capped to 9 (Blink
        /// `fe_turbulence.cc:144`).
        num_octaves: u32,
        /// `seed`, default 0.
        seed: f32,
        /// `stitchTiles` — when true, the primitive subregion size is
        /// passed as the tile size so the noise tiles seamlessly.
        stitch_tiles: bool,
    },
    /// `feDisplacementMap` — per-pixel offset of `in1` (color) by the
    /// channel-selected values of `in2` (the displacement map). Cite
    /// Blink `fe_displacement_map.cc:90-127`.
    DisplacementMap {
        in1: FeInput,
        in2: FeInput,
        /// `xChannelSelector`, default A.
        x_channel: ChannelSelector,
        /// `yChannelSelector`, default A.
        y_channel: ChannelSelector,
        /// `scale`, default 0.
        scale: f32,
    },
    /// `feConvolveMatrix` — N×M kernel applied per-pixel. Maps to
    /// `image_filters::matrix_convolution`. Cite Blink
    /// `fe_convolve_matrix.cc:138-161`.
    ///
    /// The two non-obvious unit conversions are baked into the builder:
    /// (a) the kernel is **reversed** before being handed to Skia
    /// (SVG defines convolution, Skia does correlation); (b) `bias` is
    /// multiplied by 255 because Skia's bias is in 8-bit pixel space
    /// while SVG declares it in 0..1.
    ConvolveMatrix {
        input: FeInput,
        order_x: i32,
        order_y: i32,
        kernel_matrix: Vec<f32>,
        /// `None` means "use sum of kernel; if 0, use 1".
        divisor: Option<f32>,
        /// SVG `bias` in 0..1 — multiplied by 255 at build time.
        bias: f32,
        target_x: i32,
        target_y: i32,
        edge_mode: EdgeMode,
        preserve_alpha: bool,
    },
    /// `feTile` — repeat the input across this primitive's subregion.
    /// Maps to `image_filters::tile(src=input_subregion, dst=our_subregion)`.
    /// Cite Blink `fe_tile.cc:33-56`. Note: Skia's `tile` takes no
    /// `crop_rect` argument.
    Tile {
        input: FeInput,
    },
    /// `feImage` — external image (data URI or `ImageProvider` href)
    /// projected into the primitive subregion. `preserveAspectRatio`
    /// laid out via `compute_image_dst_rect`. Internal `#elementId`
    /// references (where the primitive renders an in-document subtree)
    /// are not yet supported — we fall back to a transparent-black
    /// flood per Filter Effects §15.21 ("if the source is unavailable,
    /// the filter primitive output is transparent black"), which
    /// matches Blink's `svg_fe_image.cc:273-277`.
    Image {
        href: String,
        par: crate::htmlcss::svg::dom::attrs::PreserveAspectRatio,
    },
    /// `feDiffuseLighting` / `feSpecularLighting` — Phong lighting
    /// applied with the input alpha as a height field. Cite Blink
    /// `fe_lighting.cc` and Skia `SkSVGFeLighting.cpp`.
    Lighting {
        input: FeInput,
        kind: LightingKind,
        /// `surfaceScale`, default 1 (Blink
        /// `svg_fe_diffuse_lighting_element.cc:39-54`).
        surface_scale: f32,
        /// CSS `lighting-color`, default white. Skia consumes it as a
        /// raw `Color` (sRGB).
        lighting_color: Color,
        /// The (single) light-source child. SVG requires exactly one;
        /// the parser picks the first matching child per Blink
        /// (`svg_fe_light_element.cc:91-94`). When absent, the
        /// primitive is skipped.
        light: LightSource,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TurbulenceKind {
    Turbulence,
    FractalNoise,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChannelSelector {
    R,
    G,
    B,
    A,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EdgeMode {
    Duplicate,
    Wrap,
    None,
}

/// SVG lighting light-source children (`feDistantLight`, `fePointLight`,
/// `feSpotLight`). Cite Blink `fe_lighting.cc:90-133` for math.
#[derive(Debug, Clone)]
pub enum LightSource {
    /// `feDistantLight` — `azimuth`, `elevation` in degrees. Direction
    /// vector is `(cos(az)·cos(el), sin(az)·cos(el), sin(el))`.
    Distant { azimuth: f32, elevation: f32 },
    /// `fePointLight` — light position in user-space coordinates.
    Point { x: f32, y: f32, z: f32 },
    /// `feSpotLight` — light position + `pointsAt*` target + falloff
    /// exponent + `limitingConeAngle` (degrees). Blink defaults the
    /// cone to 90° when absent or out of range
    /// (`fe_lighting.cc:125-127`).
    Spot {
        x: f32,
        y: f32,
        z: f32,
        points_at_x: f32,
        points_at_y: f32,
        points_at_z: f32,
        /// Spotlight falloff exponent (distinct from `feSpecularLighting`'s
        /// `specularExponent` / shininess). Clamped `[1, 128]` per
        /// `spot_light_source.cc:54`.
        specular_exponent: f32,
        /// `limitingConeAngle` in degrees. `None` => use Blink's 90°
        /// fallback.
        limiting_cone_angle: Option<f32>,
    },
}

/// Diffuse vs specular lighting equation discriminator.
#[derive(Debug, Clone, Copy)]
pub enum LightingKind {
    Diffuse {
        /// `diffuseConstant` (kd), default 1, clamped non-negative.
        kd: f32,
    },
    Specular {
        /// `specularConstant` (ks), default 1, clamped non-negative.
        ks: f32,
        /// `specularExponent` (shininess), default 1, clamped `[1, 128]`.
        shininess: f32,
    },
}

/// One primitive plus its cross-cutting attributes.
#[derive(Debug, Clone)]
pub struct Primitive {
    pub effect: FilterEffect,
    /// Optional `result=` name. When `Some`, the produced
    /// `skia_safe::ImageFilter` is stored under this key in the result
    /// table for downstream `in=`/`in2=` references.
    pub result: Option<String>,
    /// Per-primitive subregion, in *pre-resolution* form. `None` means
    /// the spec default applies (union of input subregions, falling back
    /// to the filter region for `SourceGraphic`/`SourceAlpha` inputs).
    pub subregion: PrimitiveSubregion,
    /// `color-interpolation-filters` resolved on this element.
    pub color_interp: ColorInterp,
}

/// One of x/y/width/height on a primitive subregion. Stored unresolved
/// because the meaning of a percentage depends on `primitiveUnits` and
/// the filter region (only known later, in `subregion_for`):
///
/// * In `userSpaceOnUse` (default), a `<number>` is an absolute
///   user-space length, and `<percentage>` is relative to the filter
///   region (SVG 2 §15.7).
/// * In `objectBoundingBox`, a `<number>` is a fraction of the bbox,
///   and `<percentage>` is the same fraction expressed differently
///   (50% == 0.5).
#[derive(Debug, Clone, Copy)]
pub enum LengthVal {
    Number(f32),
    Percent(f32),
}

#[derive(Debug, Clone, Copy, Default)]
pub struct PrimitiveSubregion {
    pub x: Option<LengthVal>,
    pub y: Option<LengthVal>,
    pub width: Option<LengthVal>,
    pub height: Option<LengthVal>,
}

impl PrimitiveSubregion {
    pub fn is_empty(&self) -> bool {
        self.x.is_none() && self.y.is_none() && self.width.is_none() && self.height.is_none()
    }
}

// ─── DOM parsing ──────────────────────────────────────────────────────

/// Walk the children of a `<filter>` node, parsing each `fe*` primitive
/// into a [`Primitive`]. Non-fe children are skipped (per §15 only
/// `fe*` elements contribute).
///
/// `is_first` semantics for [`FeInput::parse`] are tracked across the
/// walk so the very first primitive's empty `in=` resolves to
/// `SourceGraphic` rather than `Previous`.
pub fn parse_filter_children(dom: &DemoDom, filter_id: NodeId) -> Vec<Primitive> {
    let mut out = Vec::new();
    let parent = dom.node(filter_id);
    // `color-interpolation-filters` cascades through the DOM: usually
    // declared on `<filter>` and inherited by every primitive child.
    // Each primitive may still override locally.
    let parent_color_interp = parse_color_interp_or(dom, parent, ColorInterp::LinearRgb);
    let mut is_first = true;
    for &child_id in &parent.children {
        let child = dom.node(child_id);
        let DemoNodeData::Element(data) = &child.data else {
            continue;
        };
        let tag = data.name.local.as_ref();
        let Some(prim) = parse_one(dom, child, tag, is_first, parent_color_interp) else {
            continue;
        };
        out.push(prim);
        is_first = false;
    }
    out
}

fn parse_one(
    dom: &DemoDom,
    node: &DemoNode,
    tag: &str,
    is_first: bool,
    inherited_color_interp: ColorInterp,
) -> Option<Primitive> {
    let result = get_attr(node, "result").map(str::to_string);
    let subregion = parse_subregion(node);
    let color_interp = parse_color_interp_or(dom, node, inherited_color_interp);
    let effect = match tag {
        "feGaussianBlur" => parse_gaussian_blur(node, is_first)?,
        "feOffset" => parse_offset(node, is_first)?,
        "feFlood" => parse_flood(dom, node)?,
        "feColorMatrix" => parse_color_matrix(node, is_first)?,
        "feComposite" => parse_composite(node, is_first)?,
        "feBlend" => parse_blend(node, is_first)?,
        "feMerge" => parse_merge(dom, node)?,
        "feMorphology" => parse_morphology(node, is_first)?,
        "feComponentTransfer" => parse_component_transfer(dom, node, is_first)?,
        "feDropShadow" => parse_drop_shadow(node, is_first)?,
        "feTurbulence" => parse_turbulence(node)?,
        "feDisplacementMap" => parse_displacement_map(node, is_first)?,
        "feImage" => parse_fe_image(node)?,
        "feConvolveMatrix" => parse_convolve_matrix(node, is_first)?,
        "feTile" => parse_tile(node, is_first)?,
        "feDiffuseLighting" => parse_lighting(dom, node, is_first, /*specular=*/ false)?,
        "feSpecularLighting" => parse_lighting(dom, node, is_first, /*specular=*/ true)?,
        // Recognized-but-unimplemented primitives (Image,
        // ConvolveMatrix, Tile, Diffuse/SpecularLighting). Skipping
        // yields a gap in output; a future feature loop fills them in.
        _ => return None,
    };
    Some(Primitive {
        effect,
        result,
        subregion,
        color_interp,
    })
}

fn parse_subregion(node: &DemoNode) -> PrimitiveSubregion {
    PrimitiveSubregion {
        x: get_attr(node, "x").and_then(parse_subregion_value),
        y: get_attr(node, "y").and_then(parse_subregion_value),
        width: get_attr(node, "width").and_then(parse_subregion_value),
        height: get_attr(node, "height").and_then(parse_subregion_value),
    }
}

fn parse_subregion_value(s: &str) -> Option<LengthVal> {
    let s = s.trim();
    if let Some(p) = s.strip_suffix('%') {
        p.trim().parse::<f32>().ok().map(LengthVal::Percent)
    } else {
        parse_length_px(s).map(LengthVal::Number)
    }
}

fn parse_color_interp_or(_dom: &DemoDom, node: &DemoNode, inherited: ColorInterp) -> ColorInterp {
    // Attribute first, then `style="color-interpolation-filters:..."`.
    let raw = get_attr(node, "color-interpolation-filters").or_else(|| {
        get_attr(node, "style").and_then(|s| {
            for d in s.split(';') {
                if let Some((k, v)) = d.split_once(':') {
                    if k.trim().eq_ignore_ascii_case("color-interpolation-filters") {
                        return Some(v.trim());
                    }
                }
            }
            None
        })
    });
    match raw.map(str::trim) {
        Some(s) if s.eq_ignore_ascii_case("sRGB") => ColorInterp::SRgb,
        Some(s) if s.eq_ignore_ascii_case("linearRGB") => ColorInterp::LinearRgb,
        // `auto` (and missing) inherits from the cascade. SVG default
        // when unset all the way up is `linearRGB` per Filter Effects
        // §15.4 — that's the caller's job to seed.
        _ => inherited,
    }
}

fn parse_gaussian_blur(node: &DemoNode, is_first: bool) -> Option<FilterEffect> {
    let input = FeInput::parse(get_attr(node, "in"), is_first);
    let raw = get_attr(node, "stdDeviation").unwrap_or("0");
    let nums: Vec<f32> = raw
        .split(|c: char| c.is_ascii_whitespace() || c == ',')
        .filter(|p| !p.is_empty())
        .filter_map(|p| p.parse::<f32>().ok())
        .collect();
    let (sx, sy) = match nums.as_slice() {
        [] => (0.0, 0.0),
        [a] => (*a, *a),
        [a, b, ..] => (*a, *b),
    };
    // Negative values are an error per §15.13; fall back to 0.
    let std_dev_x = sx.max(0.0);
    let std_dev_y = sy.max(0.0);
    Some(FilterEffect::GaussianBlur {
        input,
        std_dev_x,
        std_dev_y,
    })
}

fn parse_offset(node: &DemoNode, is_first: bool) -> Option<FilterEffect> {
    let input = FeInput::parse(get_attr(node, "in"), is_first);
    let dx = get_attr(node, "dx")
        .and_then(parse_length_px)
        .unwrap_or(0.0);
    let dy = get_attr(node, "dy")
        .and_then(parse_length_px)
        .unwrap_or(0.0);
    Some(FilterEffect::Offset { input, dx, dy })
}

fn parse_flood(dom: &DemoDom, node: &DemoNode) -> Option<FilterEffect> {
    // `flood-color` and `flood-opacity` are inherited presentation
    // properties (CSS Filter Effects 1 §10.13/§10.14). The local
    // `read_presentation` lookup misses values set on the enclosing
    // `<filter>` ancestor — we route through the cascade walker so
    // both `flood-color="green"` on `<filter>` and the explicit CSS
    // `inherit` keyword on `<feFlood>` resolve to the same value.
    let base = resolve_color_property(
        dom,
        node,
        "flood-color",
        Color::BLACK, // CSS Filter Effects 1 §10.13: default black.
        /*inheritable=*/ false,
    );
    let opacity =
        resolve_opacity_property(dom, node, "flood-opacity", /*inheritable=*/ false).unwrap_or(1.0);
    let alpha = (base.a() as f32 * opacity).round().clamp(0.0, 255.0) as u8;
    let color = Color::from_argb(alpha, base.r(), base.g(), base.b());
    Some(FilterEffect::Flood { color, opacity })
}

/// Resolve a color presentation property. `inheritable` selects the
/// CSS cascade rule per spec:
///   - `lighting-color` is inheritable (CSS Filter Effects 1 §10.16);
///   - `flood-color`, `flood-opacity` are **not** (§10.13/§10.14) —
///     ancestor lookup happens only when the local value is the
///     explicit `inherit` keyword.
///
/// `currentColor` resolves via the `color` cascade; absent / invalid
/// falls back to `default`.
fn resolve_color_property(
    dom: &DemoDom,
    node: &DemoNode,
    name: &str,
    default: Color,
    inheritable: bool,
) -> Color {
    use crate::htmlcss::svg::dom::attrs::{parse_paint, Paint};

    let raw = read_property_with_inheritance(dom, node, name, inheritable);
    let Some(s) = raw else {
        return default;
    };
    if let Some(p) = parse_paint(&s) {
        match p {
            Paint::Color(c) => return c,
            Paint::CurrentColor => return resolve_current_color(dom, node),
            _ => {}
        }
    }
    default
}

/// Resolve a non-inheritable opacity property (`flood-opacity` etc.).
fn resolve_opacity_property(
    dom: &DemoDom,
    node: &DemoNode,
    name: &str,
    inheritable: bool,
) -> Option<f32> {
    let raw = read_property_with_inheritance(dom, node, name, inheritable)?;
    parse_alpha_value(&raw)
}

/// Parse a CSS `<alpha-value>`: either `<number>` (0..1) or
/// `<percentage>` (0..100%). Out-of-range values clamp.
fn parse_alpha_value(s: &str) -> Option<f32> {
    let s = s.trim();
    let v = if let Some(p) = s.strip_suffix('%') {
        p.trim().parse::<f32>().ok().map(|v| v / 100.0)?
    } else {
        s.parse::<f32>().ok()?
    };
    Some(v.clamp(0.0, 1.0))
}

/// Resolve a presentation property honouring CSS cascade rules.
///
/// At each element along the walk, the COMPUTED value follows three
/// cases:
/// 1. Explicit non-`inherit` value → use it.
/// 2. Explicit `inherit` keyword → take the parent's computed value
///    (continue walking).
/// 3. Property absent:
///    - inheritable property → take the parent's computed value
///      (continue walking).
///    - non-inheritable property → COMPUTED = initial; stop walking
///      and return `None` (caller falls back to initial). This is
///      what makes `flood-color/inheritance-4.svg` resolve to black:
///      `<feFlood flood-color="inherit">` walks to its parent
///      `<filter>` which has no `flood-color`; since flood-color is
///      not inheritable, the filter's computed value is *initial*
///      (black), regardless of what the `<g>` above it says.
fn read_property_with_inheritance(
    dom: &DemoDom,
    node: &DemoNode,
    name: &str,
    inheritable: bool,
) -> Option<String> {
    let mut cur = node;
    loop {
        match read_presentation(cur, name).as_deref() {
            Some(v) if v.trim().eq_ignore_ascii_case("inherit") => {
                // Explicit `inherit` — always recurse into parent.
            }
            Some(v) => return Some(v.to_string()),
            None => {
                if !inheritable {
                    // Non-inheritable + absent → computed is initial.
                    return None;
                }
                // Inheritable + absent → take parent's computed value.
            }
        }
        cur = match cur.parent {
            Some(id) => dom.node(id),
            None => return None,
        };
    }
}

/// Resolve `lighting-color` for a `<feDiffuseLighting>` /
/// `<feSpecularLighting>` element. Per CSS Filter Effects 1 §10.16:
///   - the property is **inherited**, so a `lighting-color=` on an
///     ancestor (commonly the enclosing `<filter>`) propagates to
///     primitives that don't set it themselves;
///   - the special value `currentColor` resolves to the cascaded
///     `color` property — also inherited;
///   - default is `white` when neither is set.
fn resolve_lighting_color(dom: &DemoDom, node: &DemoNode) -> Color {
    resolve_color_property(
        dom,
        node,
        "lighting-color",
        Color::WHITE,
        /*inheritable=*/ true,
    )
}

/// Walk up from `start` collecting the first ancestor that sets
/// `color=` (attribute or inline-style). Returns black per CSS spec
/// fallback when nothing is set.
pub(crate) fn resolve_current_color(dom: &DemoDom, start: &DemoNode) -> Color {
    use crate::htmlcss::svg::dom::attrs::parse_color;

    fn check(node: &DemoNode) -> Option<Color> {
        let raw = read_presentation(node, "color")?;
        parse_color(raw.trim())
    }
    if let Some(c) = check(start) {
        return c;
    }
    let mut cur = start.parent;
    while let Some(id) = cur {
        let n = dom.node(id);
        if let Some(c) = check(n) {
            return c;
        }
        cur = n.parent;
    }
    Color::BLACK
}

fn read_presentation(node: &DemoNode, name: &str) -> Option<String> {
    if let Some(v) = get_attr(node, name) {
        return Some(v.to_string());
    }
    if let Some(style) = get_attr(node, "style") {
        for d in style.split(';') {
            if let Some((k, v)) = d.split_once(':') {
                if k.trim().eq_ignore_ascii_case(name) {
                    return Some(v.trim().to_string());
                }
            }
        }
    }
    None
}

fn parse_color_matrix(node: &DemoNode, is_first: bool) -> Option<FilterEffect> {
    let input = FeInput::parse(get_attr(node, "in"), is_first);
    let ty = get_attr(node, "type").map(str::trim).unwrap_or("matrix");
    let raw = get_attr(node, "values").unwrap_or("").trim();
    let nums: Vec<f32> = raw
        .split(|c: char| c.is_ascii_whitespace() || c == ',')
        .filter(|p| !p.is_empty())
        .filter_map(|p| p.parse::<f32>().ok())
        .collect();
    let kind = match ty {
        "saturate" => {
            let s = nums.first().copied().unwrap_or(1.0).clamp(0.0, 1.0);
            ColorMatrixKind::Saturate(s)
        }
        "hueRotate" => {
            let deg = nums.first().copied().unwrap_or(0.0);
            ColorMatrixKind::HueRotate(deg)
        }
        "luminanceToAlpha" => ColorMatrixKind::LuminanceToAlpha,
        // "matrix" or unknown
        _ => {
            let mut m = identity_color_matrix();
            if nums.len() == 20 {
                for (i, v) in nums.iter().enumerate() {
                    m[i] = *v;
                }
            }
            ColorMatrixKind::Matrix(m)
        }
    };
    Some(FilterEffect::ColorMatrix { input, kind })
}

fn identity_color_matrix() -> [f32; 20] {
    let mut m = [0.0; 20];
    m[0] = 1.0;
    m[6] = 1.0;
    m[12] = 1.0;
    m[18] = 1.0;
    m
}

fn parse_composite(node: &DemoNode, is_first: bool) -> Option<FilterEffect> {
    let in1 = FeInput::parse(get_attr(node, "in"), is_first);
    let in2 = FeInput::parse(get_attr(node, "in2"), false);
    let op_raw = get_attr(node, "operator").map(str::trim).unwrap_or("over");
    let op = match op_raw {
        "over" => CompositeOp::Over,
        "in" => CompositeOp::In,
        "out" => CompositeOp::Out,
        "atop" => CompositeOp::Atop,
        "xor" => CompositeOp::Xor,
        "lighter" => CompositeOp::Lighter,
        "arithmetic" => {
            let k = |name: &str| {
                get_attr(node, name)
                    .and_then(parse_length_px)
                    .unwrap_or(0.0)
            };
            CompositeOp::Arithmetic {
                k1: k("k1"),
                k2: k("k2"),
                k3: k("k3"),
                k4: k("k4"),
            }
        }
        _ => CompositeOp::Over,
    };
    Some(FilterEffect::Composite { in1, in2, op })
}

fn parse_blend(node: &DemoNode, is_first: bool) -> Option<FilterEffect> {
    let in1 = FeInput::parse(get_attr(node, "in"), is_first);
    let in2 = FeInput::parse(get_attr(node, "in2"), false);
    let raw = get_attr(node, "mode").map(str::trim).unwrap_or("normal");
    let mode = blend_mode_from_keyword(raw);
    Some(FilterEffect::Blend { in1, in2, mode })
}

/// SVG-2 blend mode keyword → `skia_safe::BlendMode`.
///
/// Cite: `chromium/.../platform/graphics/blend_mode.cc:47-83`. Skia's
/// own svg::Dom only handles the SVG-1.1 subset (`SkSVGFeBlend.cpp:28-43`);
/// we cover the full set so SVG-2 fixtures render correctly.
pub fn blend_mode_from_keyword(s: &str) -> skia_safe::BlendMode {
    use skia_safe::BlendMode as B;
    match s {
        "normal" => B::SrcOver,
        "multiply" => B::Multiply,
        "screen" => B::Screen,
        "darken" => B::Darken,
        "lighten" => B::Lighten,
        "overlay" => B::Overlay,
        "color-dodge" | "colorDodge" => B::ColorDodge,
        "color-burn" | "colorBurn" => B::ColorBurn,
        "hard-light" | "hardLight" => B::HardLight,
        "soft-light" | "softLight" => B::SoftLight,
        "difference" => B::Difference,
        "exclusion" => B::Exclusion,
        "hue" => B::Hue,
        "saturation" => B::Saturation,
        "color" => B::Color,
        "luminosity" => B::Luminosity,
        "plus-lighter" => B::Plus,
        _ => B::SrcOver,
    }
}

fn parse_merge(dom: &DemoDom, node: &DemoNode) -> Option<FilterEffect> {
    // `<feMerge>` takes its inputs from `<feMergeNode>` children, each
    // with its own `in=`. An empty `feMerge` is legal (transparent
    // result). See `SkSVGFeMerge.cpp:23-37`.
    let mut inputs = Vec::new();
    for &child_id in &node.children {
        let child = dom.node(child_id);
        let DemoNodeData::Element(d) = &child.data else {
            continue;
        };
        if d.name.local.as_ref() != "feMergeNode" {
            continue;
        }
        // §15: each <feMergeNode>'s `in=` independently resolves
        // against the result table; missing `in=` falls back to the
        // last result (Previous), matching Blink's ordering.
        let input = FeInput::parse(get_attr(child, "in"), false);
        inputs.push(input);
    }
    Some(FilterEffect::Merge { inputs })
}

fn parse_morphology(node: &DemoNode, is_first: bool) -> Option<FilterEffect> {
    let input = FeInput::parse(get_attr(node, "in"), is_first);
    let op_raw = get_attr(node, "operator").map(str::trim).unwrap_or("erode");
    let op = if op_raw == "dilate" {
        MorphOp::Dilate
    } else {
        MorphOp::Erode
    };
    // SVG 2 §15.13: `radius` is a `<number-optional-number>` — at most
    // two numbers. More tokens (parseable or not) make the value
    // invalid, in which case the spec falls back to the default
    // (`0 0`, i.e. no morphology applied). The
    // `…radius-with-too-many-values` fixture verifies this.
    let raw = get_attr(node, "radius").unwrap_or("0");
    let tokens: Vec<&str> = raw
        .split(|c: char| c.is_ascii_whitespace() || c == ',')
        .filter(|p| !p.is_empty())
        .collect();
    let (rx, ry) = if tokens.len() > 2 {
        (0.0, 0.0)
    } else {
        let nums: Vec<f32> = tokens
            .iter()
            .filter_map(|p| p.parse::<f32>().ok())
            .collect();
        match nums.as_slice() {
            [] => (0.0, 0.0),
            [a] => (*a, *a),
            [a, b, ..] => (*a, *b),
        }
    };
    Some(FilterEffect::Morphology {
        input,
        op,
        radius_x: rx.max(0.0),
        radius_y: ry.max(0.0),
    })
}

fn parse_component_transfer(
    dom: &DemoDom,
    node: &DemoNode,
    is_first: bool,
) -> Option<FilterEffect> {
    // Default channels are identity (Blink `fe_component_transfer.cc`
    // L153-154 seeds the LUTs with identity before per-channel dispatch).
    let mut r = TransferFn {
        kind: TransferKind::Identity,
    };
    let mut g = TransferFn {
        kind: TransferKind::Identity,
    };
    let mut b = TransferFn {
        kind: TransferKind::Identity,
    };
    let mut a = TransferFn {
        kind: TransferKind::Identity,
    };
    for &child_id in &node.children {
        let child = dom.node(child_id);
        let DemoNodeData::Element(d) = &child.data else {
            continue;
        };
        let func = parse_transfer_fn(child);
        match d.name.local.as_ref() {
            "feFuncR" => r = func,
            "feFuncG" => g = func,
            "feFuncB" => b = func,
            "feFuncA" => a = func,
            _ => {}
        }
    }
    Some(FilterEffect::ComponentTransfer {
        input: FeInput::parse(get_attr(node, "in"), is_first),
        r,
        g,
        b,
        a,
    })
}

fn parse_transfer_fn(node: &DemoNode) -> TransferFn {
    let ty = get_attr(node, "type").map(str::trim).unwrap_or("identity");
    let kind = match ty {
        "table" => {
            let vals = parse_number_list(get_attr(node, "tableValues").unwrap_or(""));
            if vals.is_empty() {
                TransferKind::Identity
            } else {
                TransferKind::Table(vals)
            }
        }
        "discrete" => {
            let vals = parse_number_list(get_attr(node, "tableValues").unwrap_or(""));
            if vals.is_empty() {
                TransferKind::Identity
            } else {
                TransferKind::Discrete(vals)
            }
        }
        "linear" => {
            // SVG 2 §15.10: `slope` / `intercept` are `<number>`
            // (no units). Per CSS Values 4 §3, an unparseable value is
            // treated as if the attribute were not specified, so we
            // fall back to the per-attribute default (slope=1,
            // intercept=0) rather than collapsing the whole feFunc.
            // When *every* attribute is missing or invalid, the
            // resulting Linear becomes identity anyway, so this
            // preserves the behaviour of the
            // `…linear-with-invalid-values` fixtures while also
            // producing the correct partial-default output for
            // `…with-an-invalid-{slope,intercept}` cases.
            let slope = get_attr(node, "slope")
                .and_then(parse_unitless_number)
                .unwrap_or(1.0);
            let intercept = get_attr(node, "intercept")
                .and_then(parse_unitless_number)
                .unwrap_or(0.0);
            TransferKind::Linear { slope, intercept }
        }
        "gamma" => {
            // Defaults when absent OR invalid: amplitude=1, exponent=1,
            // offset=0. Same per-attribute fallback rule as `linear`.
            // The `…gamma-with-an-invalid-offset` fixture relies on
            // amplitude/exponent staying live while only the offset
            // resets to its default.
            let amplitude = get_attr(node, "amplitude")
                .and_then(parse_unitless_number)
                .unwrap_or(1.0);
            let exponent = get_attr(node, "exponent")
                .and_then(parse_unitless_number)
                .unwrap_or(1.0);
            let offset = get_attr(node, "offset")
                .and_then(parse_unitless_number)
                .unwrap_or(0.0);
            TransferKind::Gamma {
                amplitude,
                exponent,
                offset,
            }
        }
        // "identity" or unknown
        _ => TransferKind::Identity,
    };
    TransferFn { kind }
}

/// Parse a strict CSS `<number>` — no unit suffix allowed. Used for
/// SVG attributes like `slope`/`intercept`/`amplitude`/`exponent`
/// that are typed as `<number>` per spec; values like `0.5px` or
/// `50%` are invalid and the caller should fall back to identity.
fn parse_unitless_number(s: &str) -> Option<f32> {
    let s = s.trim();
    s.parse::<f32>().ok()
}

fn parse_number_list(s: &str) -> Vec<f32> {
    s.split(|c: char| c.is_ascii_whitespace() || c == ',')
        .filter(|p| !p.is_empty())
        .filter_map(|p| p.parse::<f32>().ok())
        .collect()
}

fn parse_drop_shadow(node: &DemoNode, is_first: bool) -> Option<FilterEffect> {
    let input = FeInput::parse(get_attr(node, "in"), is_first);
    // Defaults from Blink `svg_fe_drop_shadow_element.cc:37-46`.
    let dx = get_attr(node, "dx")
        .and_then(parse_length_px)
        .unwrap_or(2.0);
    let dy = get_attr(node, "dy")
        .and_then(parse_length_px)
        .unwrap_or(2.0);
    let raw = get_attr(node, "stdDeviation").unwrap_or("2");
    let nums = parse_number_list(raw);
    let (sx, sy) = match nums.as_slice() {
        [] => (2.0, 2.0),
        [a] => (*a, *a),
        [a, b, ..] => (*a, *b),
    };
    let raw_color = read_presentation(node, "flood-color").unwrap_or_else(|| "black".to_string());
    let base = match crate::htmlcss::svg::dom::attrs::parse_paint(&raw_color) {
        Some(crate::htmlcss::svg::dom::attrs::Paint::Color(c)) => c,
        _ => Color::BLACK,
    };
    let opacity = read_presentation(node, "flood-opacity")
        .as_deref()
        .and_then(parse_length_px)
        .unwrap_or(1.0)
        .clamp(0.0, 1.0);
    let alpha = (base.a() as f32 * opacity).round().clamp(0.0, 255.0) as u8;
    let color = Color::from_argb(alpha, base.r(), base.g(), base.b());
    Some(FilterEffect::DropShadow {
        input,
        dx,
        dy,
        std_dev_x: sx.max(0.0),
        std_dev_y: sy.max(0.0),
        color,
    })
}

fn parse_turbulence(node: &DemoNode) -> Option<FilterEffect> {
    let kind = match get_attr(node, "type").map(str::trim) {
        Some("fractalNoise") => TurbulenceKind::FractalNoise,
        // Default is `turbulence` per Blink
        // `svg_fe_turbulence_element.cc:74`.
        _ => TurbulenceKind::Turbulence,
    };
    let raw = get_attr(node, "baseFrequency").unwrap_or("0");
    let nums = parse_number_list(raw);
    let (fx, fy) = match nums.as_slice() {
        [] => (0.0, 0.0),
        [a] => (*a, *a),
        [a, b, ..] => (*a, *b),
    };
    // Negatives are clamped to 0 per Blink `fe_turbulence.cc:119-124`.
    let base_freq_x = fx.max(0.0);
    let base_freq_y = fy.max(0.0);
    let num_octaves = get_attr(node, "numOctaves")
        .and_then(|s| s.trim().parse::<i32>().ok())
        .unwrap_or(1)
        // Blink caps at 9 (`fe_turbulence.cc:144`).
        .clamp(1, 9) as u32;
    let seed = get_attr(node, "seed")
        .and_then(parse_length_px)
        .unwrap_or(0.0);
    let stitch_tiles = matches!(get_attr(node, "stitchTiles").map(str::trim), Some("stitch"));
    Some(FilterEffect::Turbulence {
        kind,
        base_freq_x,
        base_freq_y,
        num_octaves,
        seed,
        stitch_tiles,
    })
}

fn parse_displacement_map(node: &DemoNode, is_first: bool) -> Option<FilterEffect> {
    let in1 = FeInput::parse(get_attr(node, "in"), is_first);
    let in2 = FeInput::parse(get_attr(node, "in2"), false);
    let parse_chan = |attr: Option<&str>| match attr.map(str::trim) {
        Some("R") => ChannelSelector::R,
        Some("G") => ChannelSelector::G,
        Some("B") => ChannelSelector::B,
        // Default A per Blink `svg_fe_displacement_map_element.cc:46-63`.
        _ => ChannelSelector::A,
    };
    let x_channel = parse_chan(get_attr(node, "xChannelSelector"));
    let y_channel = parse_chan(get_attr(node, "yChannelSelector"));
    let scale = get_attr(node, "scale")
        .and_then(parse_length_px)
        .unwrap_or(0.0);
    Some(FilterEffect::DisplacementMap {
        in1,
        in2,
        x_channel,
        y_channel,
        scale,
    })
}

fn parse_convolve_matrix(node: &DemoNode, is_first: bool) -> Option<FilterEffect> {
    let input = FeInput::parse(get_attr(node, "in"), is_first);
    // `order` default 3×3 (Blink `svg_fe_convolve_matrix_element.cc:58`).
    // Single value duplicates to both dims.
    let order_raw = get_attr(node, "order").unwrap_or("3");
    let order_nums: Vec<i32> = order_raw
        .split(|c: char| c.is_ascii_whitespace() || c == ',')
        .filter(|p| !p.is_empty())
        .filter_map(|p| p.parse::<i32>().ok())
        .collect();
    let (order_x, order_y) = match order_nums.as_slice() {
        [] => (3, 3),
        [a] => (*a, *a),
        [a, b, ..] => (*a, *b),
    };
    // Per Filter Effects §15.20: invalid order → primitive output is
    // *transparent black*, not "filter is skipped." We emit a fully
    // transparent flood so the output of this primitive — and hence
    // anything chaining off it — collapses to transparent. Same rule
    // for missing/short/oversized kernel below.
    if order_x <= 0 || order_y <= 0 {
        return Some(transparent_flood());
    }
    let kernel_matrix = parse_number_list(get_attr(node, "kernelMatrix").unwrap_or(""));
    if kernel_matrix.is_empty() || kernel_matrix.len() != (order_x as usize) * (order_y as usize) {
        return Some(transparent_flood());
    }
    // `divisor` is unspecified → 0 sentinel (Blink
    // `svg_fe_convolve_matrix_element.cc:169-175`); `0` triggers
    // "use sum of kernel" at build time.
    let divisor = get_attr(node, "divisor")
        .and_then(parse_length_px)
        .filter(|d| *d != 0.0);
    let bias = get_attr(node, "bias")
        .and_then(parse_length_px)
        .unwrap_or(0.0);
    // Defaults: `targetX = floor(orderX/2)` (and same for Y) per Blink
    // `svg_fe_convolve_matrix_element.cc:156-167`.
    let target_x = get_attr(node, "targetX")
        .and_then(|s| s.trim().parse::<i32>().ok())
        .unwrap_or(order_x / 2);
    let target_y = get_attr(node, "targetY")
        .and_then(|s| s.trim().parse::<i32>().ok())
        .unwrap_or(order_y / 2);
    if target_x < 0 || target_x >= order_x || target_y < 0 || target_y >= order_y {
        return Some(transparent_flood());
    }
    let edge_mode = match get_attr(node, "edgeMode").map(str::trim) {
        Some("wrap") => EdgeMode::Wrap,
        Some("none") => EdgeMode::None,
        // Default `duplicate` per Blink line 94-98.
        _ => EdgeMode::Duplicate,
    };
    let preserve_alpha = matches!(get_attr(node, "preserveAlpha").map(str::trim), Some("true"));
    Some(FilterEffect::ConvolveMatrix {
        input,
        order_x,
        order_y,
        kernel_matrix,
        divisor,
        bias,
        target_x,
        target_y,
        edge_mode,
        preserve_alpha,
    })
}

fn parse_tile(node: &DemoNode, is_first: bool) -> Option<FilterEffect> {
    Some(FilterEffect::Tile {
        input: FeInput::parse(get_attr(node, "in"), is_first),
    })
}

/// Sentinel "transparent black flood" — Filter Effects §15.20
/// requires invalid primitives to emit transparent black, which is
/// what this builds.
fn transparent_flood() -> FilterEffect {
    FilterEffect::Flood {
        color: Color::TRANSPARENT,
        opacity: 0.0,
    }
}

fn parse_fe_image(node: &DemoNode) -> Option<FilterEffect> {
    use crate::htmlcss::svg::dom::attrs::parse_preserve_aspect_ratio;
    let href = href_attr(node)?.to_string();
    let par = get_attr(node, "preserveAspectRatio")
        .map(parse_preserve_aspect_ratio)
        .unwrap_or_default();
    Some(FilterEffect::Image { href, par })
}

fn parse_lighting(
    dom: &DemoDom,
    node: &DemoNode,
    is_first: bool,
    specular: bool,
) -> Option<FilterEffect> {
    let input = FeInput::parse(get_attr(node, "in"), is_first);
    let surface_scale = get_attr(node, "surfaceScale")
        .and_then(parse_length_px)
        // Blink `svg_fe_diffuse_lighting_element.cc:39-54` (and
        // specular sibling) default = 1.
        .unwrap_or(1.0);
    let lighting_color = resolve_lighting_color(dom, node);

    let kind = if specular {
        let ks = get_attr(node, "specularConstant")
            .and_then(parse_length_px)
            .unwrap_or(1.0)
            .max(0.0);
        // `specularExponent` (shininess) clamp `[1, 128]` — Blink
        // `fe_lighting.cc:54`.
        let shininess = get_attr(node, "specularExponent")
            .and_then(parse_length_px)
            .unwrap_or(1.0)
            .clamp(1.0, 128.0);
        LightingKind::Specular { ks, shininess }
    } else {
        let kd = get_attr(node, "diffuseConstant")
            .and_then(parse_length_px)
            .unwrap_or(1.0)
            .max(0.0);
        LightingKind::Diffuse { kd }
    };

    // First-child rule per Blink `svg_fe_light_element.cc:91-94`.
    // Iterate children, return the first recognized light-source.
    let light = node.children.iter().find_map(|&child_id| {
        let child = dom.node(child_id);
        let DemoNodeData::Element(d) = &child.data else {
            return None;
        };
        match d.name.local.as_ref() {
            "feDistantLight" => Some(LightSource::Distant {
                azimuth: get_attr(child, "azimuth")
                    .and_then(parse_length_px)
                    .unwrap_or(0.0),
                elevation: get_attr(child, "elevation")
                    .and_then(parse_length_px)
                    .unwrap_or(0.0),
            }),
            "fePointLight" => Some(LightSource::Point {
                x: get_attr(child, "x")
                    .and_then(parse_length_px)
                    .unwrap_or(0.0),
                y: get_attr(child, "y")
                    .and_then(parse_length_px)
                    .unwrap_or(0.0),
                z: get_attr(child, "z")
                    .and_then(parse_length_px)
                    .unwrap_or(0.0),
            }),
            "feSpotLight" => {
                let cone_raw = get_attr(child, "limitingConeAngle").and_then(parse_length_px);
                // Blink fallback: out-of-range `[-90, 90]` or absent → 90°.
                let limiting_cone_angle = cone_raw.and_then(|v| {
                    if (-90.0..=90.0).contains(&v) {
                        Some(v)
                    } else {
                        None
                    }
                });
                let specular_exponent = get_attr(child, "specularExponent")
                    .and_then(parse_length_px)
                    .unwrap_or(1.0)
                    .clamp(1.0, 128.0);
                Some(LightSource::Spot {
                    x: get_attr(child, "x")
                        .and_then(parse_length_px)
                        .unwrap_or(0.0),
                    y: get_attr(child, "y")
                        .and_then(parse_length_px)
                        .unwrap_or(0.0),
                    z: get_attr(child, "z")
                        .and_then(parse_length_px)
                        .unwrap_or(0.0),
                    points_at_x: get_attr(child, "pointsAtX")
                        .and_then(parse_length_px)
                        .unwrap_or(0.0),
                    points_at_y: get_attr(child, "pointsAtY")
                        .and_then(parse_length_px)
                        .unwrap_or(0.0),
                    points_at_z: get_attr(child, "pointsAtZ")
                        .and_then(parse_length_px)
                        .unwrap_or(0.0),
                    specular_exponent,
                    limiting_cone_angle,
                })
            }
            _ => None,
        }
    });

    // Per Blink `fe_lighting.cc:79-80`, a lighting primitive with no
    // recognized light-source child renders as transparent black. Match
    // that rather than silently skipping the primitive.
    let Some(light) = light else {
        return Some(transparent_flood());
    };

    Some(FilterEffect::Lighting {
        input,
        kind,
        surface_scale,
        lighting_color,
        light,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fe_input_parsing() {
        assert!(matches!(FeInput::parse(None, true), FeInput::SourceGraphic));
        assert!(matches!(FeInput::parse(None, false), FeInput::Previous));
        assert!(matches!(
            FeInput::parse(Some("SourceAlpha"), false),
            FeInput::SourceAlpha
        ));
        match FeInput::parse(Some("blur1"), false) {
            FeInput::Reference(s) => assert_eq!(s, "blur1"),
            _ => panic!("expected Reference"),
        }
    }

    #[test]
    fn blend_mode_table() {
        use skia_safe::BlendMode as B;
        assert_eq!(blend_mode_from_keyword("normal"), B::SrcOver);
        assert_eq!(blend_mode_from_keyword("multiply"), B::Multiply);
        assert_eq!(blend_mode_from_keyword("color-dodge"), B::ColorDodge);
        assert_eq!(blend_mode_from_keyword("colorDodge"), B::ColorDodge);
        assert_eq!(blend_mode_from_keyword("plus-lighter"), B::Plus);
        assert_eq!(blend_mode_from_keyword("luminosity"), B::Luminosity);
        assert_eq!(blend_mode_from_keyword("invalid"), B::SrcOver);
    }
}
