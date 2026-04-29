//! `LayoutSvgResourceFilter` — `<filter>` resource.
//!
//! Compiles the child `fe*` primitives (parsed in
//! [`super::svg_filter_builder`]) into a single
//! `skia_safe::ImageFilter`, then returns a [`FilterInvocation`] the
//! painter can apply via a `save_layer` whose paint carries the
//! `ImageFilter`.
//!
//! Honours: `filterUnits` (`objectBoundingBox` default), `primitiveUnits`
//! (`userSpaceOnUse` default), `x` / `y` / `width` / `height` (the filter
//! region with `-10%/-10%/120%/120%` defaults), and named result chaining
//! through `result=` / `in=` / `in2=`.
//!
//! Color interpolation (`color-interpolation-filters`) defaults to
//! `linearRGB` per spec — we **don't** copy Skia svg::Dom's bug of
//! treating `auto` as `sRGB` (`SkSVGFe.cpp:90-92`). The chain is
//! sandwiched in linear-light gamma when any primitive operates in
//! `linearRGB`, mirroring Blink's `paint_filter_builder::Build`
//! (`paint_filter_builder.cc:80-88`).
//!
//! Per-primitive subregions are passed as `crop_rect` to each
//! `image_filters::*` builder; defaults follow §15.7 (union of input
//! subregions, falling back to the filter region when any input is a
//! "standard" reference like `SourceGraphic`). This matches Skia
//! svg::Dom's `SkSVGFe::resolveFilterSubregion` and Blink's
//! `FilterEffect::MapInputs`.
//!
//! Blink anchor: `core/layout/svg/layout_svg_resource_filter.{h,cc}`,
//! `core/svg/graphics/filters/svg_filter_builder.{h,cc}`,
//! `core/paint/filter_effect_builder.{h,cc}`.
//!
//! Skia anchor: `modules/svg/src/SkSVGFilter.cpp`, `SkSVGFe.cpp`,
//! `include/SkSVGFilterContext.h`.

use csscascade::dom::{DemoDom, DemoNodeData, NodeId};
use rustc_hash::FxHashMap;
use skia_safe::{
    color_filters, image_filters, BlendMode, ColorFilter, ColorMatrix, ImageFilter, Rect,
};

use super::svg_filter_builder::{
    parse_filter_children, ChannelSelector, ColorInterp, ColorMatrixKind, CompositeOp, EdgeMode,
    FeInput, FilterEffect, LightSource, LightingKind, MorphOp, Primitive, TransferFn,
    TurbulenceKind,
};
use super::svg_resources::{parse_url_ref, Resources};
use crate::htmlcss::svg::dom::attrs::{compute_image_dst_rect, parse_length_px};
use crate::htmlcss::svg::dom::element::{get_attr, ElementKind};
use crate::htmlcss::svg::dom::href::{href_attr, same_document_fragment};
use crate::htmlcss::svg::paint::svg_image_painter;
use crate::htmlcss::ImageProvider;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Units {
    UserSpaceOnUse,
    ObjectBoundingBox,
}

/// Pre-built information the painter needs to wrap an element's draw
/// call in a filter `save_layer`.
#[derive(Clone)]
pub struct FilterInvocation {
    /// The composed image filter to set on the layer's `SkPaint`.
    pub image_filter: ImageFilter,
    /// Filter region in *user space* — the area the painter should
    /// clip to before opening the layer (matches Skia svg::Dom's
    /// implicit canvas clip and Blink's per-primitive crop intersection).
    pub region_user_space: Rect,
}

/// Resolve a `<filter>` reference against the masked element's bbox and
/// build the image-filter chain.
///
/// Returns `None` when the target isn't a `<filter>` element, when it has
/// no parseable primitives, or when none of them produce an image filter
/// (i.e. all primitives are unimplemented). The painter treats `None` as
/// "paint without filtering", per the spec's permissive rule for
/// unresolvable funcIRIs.
///
/// `images` resolves `feImage` `href`s; `&NoImages` is fine when no
/// external images are expected.
pub fn resolve<'a>(
    dom: &'a DemoDom,
    resources: &'a Resources,
    filter_id: NodeId,
    object_bbox: Rect,
    images: &'a dyn ImageProvider,
    paint_ctx: &'a crate::htmlcss::svg::paint::scoped_svg_paint_state::PaintCtx<'a>,
) -> Option<FilterInvocation> {
    let node = dom.node(filter_id);
    let DemoNodeData::Element(data) = &node.data else {
        return None;
    };
    if ElementKind::from_local_name(data.name.local.as_ref()) != ElementKind::Filter {
        return None;
    }

    // Build the `xlink:href` chain so attributes / children defined on a
    // referenced `<filter>` flow through. Per SVG 2 §15.6, an attribute
    // declared closer to the use point wins; children come from the
    // closest filter that has any. The
    // `paint-servers/filter/everything-via-xlink-href` fixture relies
    // on a child-less filter inheriting *both* its region and its
    // primitives from a referenced one.
    let chain = build_filter_chain(dom, resources, filter_id);
    let attr = |name: &str| filter_first_attr(dom, &chain, name);

    let filter_units = match attr("filterUnits") {
        Some("userSpaceOnUse") => Units::UserSpaceOnUse,
        // Default per Filter Effects §15.6.
        _ => Units::ObjectBoundingBox,
    };
    let primitive_units = match attr("primitiveUnits") {
        Some("objectBoundingBox") => Units::ObjectBoundingBox,
        // Default per Filter Effects §15.6.
        _ => Units::UserSpaceOnUse,
    };

    let region_user_space = resolve_region_with_chain(dom, &chain, filter_units, object_bbox);
    let prim_scale = primitive_scale(primitive_units, object_bbox);

    // Walk the chain to find the first filter that has children.
    let primitives_source = chain
        .iter()
        .copied()
        .find(|id| {
            dom.node(*id)
                .children
                .iter()
                .any(|c| matches!(&dom.node(*c).data, DemoNodeData::Element(_)))
        })
        .unwrap_or(filter_id);
    let primitives = parse_filter_children(dom, primitives_source);
    if primitives.is_empty() {
        // Filter Effects §15.6: a `<filter>` with no primitive children
        // produces transparent black. Build a flood filter rather than
        // returning None (which would route to "paint without filter"
        // and incorrectly show the source).
        let shader = skia_safe::shaders::color(skia_safe::Color::TRANSPARENT);
        let image_filter = image_filters::shader(shader, region_user_space)?;
        return Some(FilterInvocation {
            image_filter,
            region_user_space,
        });
    }

    // User-space viewport for resolving `<percentage>` primitive
    // subregion attrs in `userSpaceOnUse` mode. Walk to the nearest
    // ancestor `<svg>` of the `<filter>` element so the viewport in
    // user units is right (`paint_ctx.initial_viewport` is the host's
    // pixel canvas — wrong unit when a `viewBox` is in play).
    let user_viewport = super::super::layout::viewport::nearest_svg_viewport(paint_ctx, node);
    let context = BuildContext {
        prim_scale,
        primitive_units_obb: matches!(primitive_units, Units::ObjectBoundingBox),
        filter_region: region_user_space,
        bbox: object_bbox,
        images,
        paint_ctx,
        user_viewport,
        current_filter_id: filter_id,
    };
    let image_filter = build_dag(&primitives, &context)?;
    Some(FilterInvocation {
        image_filter,
        region_user_space,
    })
}

// ─── region & unit math ───────────────────────────────────────────────

fn build_filter_chain(dom: &DemoDom, resources: &Resources, start: NodeId) -> Vec<NodeId> {
    let mut out = vec![start];
    let mut seen = rustc_hash::FxHashSet::default();
    seen.insert(start);
    let mut cur = start;
    while let Some(href) = href_attr(dom.node(cur)) {
        let Some(target_id) = same_document_fragment(href).and_then(|s| resources.lookup(s)) else {
            break;
        };
        if !seen.insert(target_id) {
            break;
        }
        let target = dom.node(target_id);
        let DemoNodeData::Element(d) = &target.data else {
            break;
        };
        if ElementKind::from_local_name(d.name.local.as_ref()) != ElementKind::Filter {
            break;
        }
        out.push(target_id);
        cur = target_id;
    }
    out
}

fn filter_first_attr<'a>(dom: &'a DemoDom, chain: &[NodeId], name: &str) -> Option<&'a str> {
    for id in chain {
        if let Some(v) = get_attr(dom.node(*id), name) {
            return Some(v);
        }
    }
    None
}

fn resolve_region_with_chain(dom: &DemoDom, chain: &[NodeId], units: Units, bbox: Rect) -> Rect {
    let x_attr = filter_first_attr(dom, chain, "x").and_then(parse_length_or_pct);
    let y_attr = filter_first_attr(dom, chain, "y").and_then(parse_length_or_pct);
    let w_attr = filter_first_attr(dom, chain, "width").and_then(parse_length_or_pct);
    let h_attr = filter_first_attr(dom, chain, "height").and_then(parse_length_or_pct);

    match units {
        Units::ObjectBoundingBox => {
            let to_unit = |v: LengthOrPct| match v {
                LengthOrPct::Px(n) => n,
                LengthOrPct::Pct(p) => p / 100.0,
            };
            let x = x_attr.map(to_unit).unwrap_or(-0.10);
            let y = y_attr.map(to_unit).unwrap_or(-0.10);
            let w = w_attr.map(to_unit).unwrap_or(1.20);
            let h = h_attr.map(to_unit).unwrap_or(1.20);
            Rect::from_xywh(
                bbox.left + x * bbox.width(),
                bbox.top + y * bbox.height(),
                w * bbox.width(),
                h * bbox.height(),
            )
        }
        Units::UserSpaceOnUse => {
            let x = x_attr
                .and_then(to_px_or_none)
                .unwrap_or(bbox.left - 0.10 * bbox.width());
            let y = y_attr
                .and_then(to_px_or_none)
                .unwrap_or(bbox.top - 0.10 * bbox.height());
            let w = w_attr
                .and_then(to_px_or_none)
                .unwrap_or(1.20 * bbox.width());
            let h = h_attr
                .and_then(to_px_or_none)
                .unwrap_or(1.20 * bbox.height());
            Rect::from_xywh(x, y, w, h)
        }
    }
}

/// Length scale applied to primitive-level lengths (stdDeviation, dx, dy,
/// radius). When `primitiveUnits=objectBoundingBox`, lengths multiply by
/// (bbox.w, bbox.h) (Filter Effects §15.6); otherwise identity.
fn primitive_scale(units: Units, bbox: Rect) -> (f32, f32) {
    match units {
        Units::ObjectBoundingBox => (bbox.width(), bbox.height()),
        Units::UserSpaceOnUse => (1.0, 1.0),
    }
}

#[derive(Debug, Clone, Copy)]
enum LengthOrPct {
    Px(f32),
    Pct(f32),
}

fn parse_length_or_pct(s: &str) -> Option<LengthOrPct> {
    let s = s.trim();
    if let Some(p) = s.strip_suffix('%') {
        p.trim().parse::<f32>().ok().map(LengthOrPct::Pct)
    } else {
        parse_length_px(s).map(LengthOrPct::Px)
    }
}

fn to_px_or_none(v: LengthOrPct) -> Option<f32> {
    match v {
        LengthOrPct::Px(n) => Some(n),
        LengthOrPct::Pct(_) => None,
    }
}

// ─── DAG build ────────────────────────────────────────────────────────

struct BuildContext<'a> {
    prim_scale: (f32, f32),
    /// True when `primitiveUnits=objectBoundingBox`. In that mode,
    /// position-bearing primitive attributes (e.g., light source
    /// `x`/`y`/`z`) are normalized to the bbox; we map
    /// `(x * bbox.w + bbox.x, y * bbox.h + bbox.y, z * bbox.w)`.
    /// In `userSpaceOnUse` (the default) positions are already in
    /// user-space and pass through.
    primitive_units_obb: bool,
    filter_region: Rect,
    bbox: Rect,
    /// Resolves non-data `feImage` `href`s; `&NoImages` is fine when
    /// no external images are expected.
    images: &'a dyn ImageProvider,
    /// Surrounding paint context — used by `feImage` with internal
    /// `#elementId` href to record the referenced subtree to a Picture.
    /// Mirrors Blink's `FEImage::CreateImageFilterForLayoutObject`
    /// (`svg_fe_image.cc:222-245`).
    paint_ctx: &'a crate::htmlcss::svg::paint::scoped_svg_paint_state::PaintCtx<'a>,
    /// User-space viewport (the SVG element's `viewBox` extents, in
    /// user units). Used to resolve `<percentage>` values on filter
    /// primitive subregion attrs when `primitiveUnits=userSpaceOnUse`.
    user_viewport: (f32, f32),
    /// The `<filter>` element being resolved. `feImage` uses this to
    /// detect direct self-reference cycles — if its internal `href`
    /// target carries `filter=url(#self)`, recording the subtree would
    /// re-enter this same filter and Chrome treats the result as
    /// transparent black per Filter Effects §15.21.
    current_filter_id: NodeId,
}

#[derive(Clone)]
struct ResolvedResult {
    /// `None` here mirrors Skia's "input image" sentinel — the
    /// `SourceGraphic` of the enclosing save_layer.
    filter: Option<ImageFilter>,
    subregion: Rect,
    /// Color space the cached `filter`'s pixels are in. SourceGraphic
    /// and friends start in sRGB (the canvas surface space). Each
    /// primitive's output is in its own `color-interpolation-filters`
    /// space; downstream consumers convert lazily via [`Self::in_space`].
    cs: ColorInterp,
}

impl ResolvedResult {
    /// Coerce this result into `target` color space. Wraps in a Skia
    /// gamma-conversion color filter when needed; returns the same
    /// filter unchanged when spaces already match. Mirrors Blink's
    /// `paint_filter_builder::Build(input, OperatingInterpolationSpace)`
    /// (`paint_filter_builder.cc:80-88`).
    fn in_space(self, target: ColorInterp) -> Option<ImageFilter> {
        if self.cs == target {
            return self.filter;
        }
        let conversion = match (self.cs, target) {
            (ColorInterp::SRgb, ColorInterp::LinearRgb) => color_filters::srgb_to_linear_gamma(),
            (ColorInterp::LinearRgb, ColorInterp::SRgb) => color_filters::linear_to_srgb_gamma(),
            _ => return self.filter,
        };
        image_filters::color_filter(conversion, self.filter, image_filters::CropRect::default())
    }
}

struct ResultTable {
    by_name: FxHashMap<String, ResolvedResult>,
    previous: ResolvedResult,
}

impl ResultTable {
    fn new(filter_region: Rect) -> Self {
        Self {
            by_name: FxHashMap::default(),
            // Initial "previous" is SourceGraphic with the filter region
            // as its subregion, matching Skia's
            // `SkSVGFilterContext::previousResultIsSourceGraphic`. The
            // canvas surface is sRGB-tagged.
            previous: ResolvedResult {
                filter: None,
                subregion: filter_region,
                cs: ColorInterp::SRgb,
            },
        }
    }

    fn record(&mut self, name: Option<&str>, value: ResolvedResult) {
        self.previous = value.clone();
        if let Some(n) = name {
            self.by_name.insert(n.to_string(), value);
        }
    }

    fn resolve(&self, input: &FeInput, filter_region: Rect) -> ResolvedResult {
        match input {
            FeInput::SourceGraphic
            | FeInput::FillPaint
            | FeInput::StrokePaint
            | FeInput::BackgroundImage => ResolvedResult {
                filter: None,
                subregion: filter_region,
                cs: ColorInterp::SRgb,
            },
            FeInput::SourceAlpha | FeInput::BackgroundAlpha => ResolvedResult {
                filter: source_alpha_filter(),
                subregion: filter_region,
                // Alpha-only data is colorspace-agnostic; mark sRGB so
                // we don't gratuitously gamma-convert a zero-RGB image.
                cs: ColorInterp::SRgb,
            },
            FeInput::Previous => self.previous.clone(),
            FeInput::Reference(name) => {
                self.by_name
                    .get(name.as_str())
                    .cloned()
                    .unwrap_or_else(|| ResolvedResult {
                        filter: None,
                        subregion: filter_region,
                        cs: ColorInterp::SRgb,
                    })
            }
        }
    }
}

fn build_dag(primitives: &[Primitive], ctx: &BuildContext<'_>) -> Option<ImageFilter> {
    let mut table = ResultTable::new(ctx.filter_region);

    for prim in primitives {
        let resolved = build_primitive(prim, &table, ctx);
        let Some(value) = resolved else { continue };
        table.record(prim.result.as_deref(), value);
    }

    // The painter applies the *last* primitive's filter, coerced into
    // sRGB so the canvas (sRGB-tagged surface) sees the right pixels.
    // Skia svg::Dom does the same at `SkSVGFilter.cpp:69-71`.
    table.previous.clone().in_space(ColorInterp::SRgb)
}

fn build_primitive(
    prim: &Primitive,
    table: &ResultTable,
    ctx: &BuildContext<'_>,
) -> Option<ResolvedResult> {
    let region = ctx.filter_region;
    // SVG Filter Effects 1 §15.7: per-primitive subregion default is
    // (a) filter region for source primitives (no inputs) and `feTile`,
    // (b) union of input subregions otherwise — collapsing to filter
    // region the moment any input is source-class.
    // Without this, e.g. `feFlood(28,28,10,10) → feOffset → feTile`
    // (`simple-case.svg`) would inherit feFlood's tile through feOffset
    // and tile correctly; we previously defaulted feOffset to the
    // filter region, making `feTile`'s `src == dst` and producing a
    // single un-tiled cell. (See
    // docs/wg/research/chromium/svg/fe-tile.md §6 / §9.)
    let default_rect = default_primitive_subregion(&prim.effect, table, region);
    let crop = subregion_for(prim, default_rect, ctx);

    match &prim.effect {
        FilterEffect::GaussianBlur {
            input,
            std_dev_x,
            std_dev_y,
        } => {
            let input_filter = table.resolve(input, region).in_space(prim.color_interp);
            let sx = std_dev_x * ctx.prim_scale.0;
            let sy = std_dev_y * ctx.prim_scale.1;
            let filter = if sx <= 0.0 && sy <= 0.0 {
                // §15.13: stdDeviation == 0 disables the primitive,
                // pass-through.
                input_filter
            } else {
                image_filters::blur((sx, sy), None, input_filter, crop)
            };
            Some(ResolvedResult {
                filter,
                subregion: crop,
                cs: prim.color_interp,
            })
        }
        FilterEffect::Offset { input, dx, dy } => {
            let input_filter = table.resolve(input, region).in_space(prim.color_interp);
            let ox = dx * ctx.prim_scale.0;
            let oy = dy * ctx.prim_scale.1;
            let filter = image_filters::offset((ox, oy), input_filter, crop);
            Some(ResolvedResult {
                filter,
                subregion: crop,
                cs: prim.color_interp,
            })
        }
        FilterEffect::Flood { color, .. } => {
            // `image_filters::shader(shader, crop_rect)` paints the shader
            // bounded to the rect. A flood is just a solid-color shader.
            //
            // The flood color is specified by the SVG author in sRGB
            // and Skia paints it into an sRGB-tagged layer. Even when
            // the primitive's `color-interpolation-filters` declares
            // `linearRGB`, the *generator* output is still pixel-sRGB —
            // it's downstream operations that interpret it as linear.
            // Tagging the result as sRGB lets the result-table conversion
            // logic insert the correct sRGB→linear wrap at the boundary
            // into a linearRGB consumer (and the chain tail's linear→sRGB
            // wrap is then a no-op for solo-flood chains).
            //
            // Filter Effects 1 §15.5: a primitive whose subregion has
            // collapsed to empty (e.g. `feFlood x=0 y=0 w=10 h=10`
            // entirely outside the filter region) produces no graphical
            // output. Skia's `image_filters::shader` with an empty
            // crop rect treats the crop as absent and floods the
            // shader across the whole filter region instead, so we
            // explicitly substitute a transparent flood here.
            let filter = if crop.is_empty() {
                transparent_flood(crop)
            } else {
                let shader = skia_safe::shaders::color(*color);
                image_filters::shader(shader, crop)
            };
            Some(ResolvedResult {
                filter,
                subregion: crop,
                cs: ColorInterp::SRgb,
            })
        }
        FilterEffect::ColorMatrix { input, kind } => {
            let input_filter = table.resolve(input, region).in_space(prim.color_interp);
            let cf = build_color_matrix_filter(kind);
            let filter = image_filters::color_filter(cf, input_filter, crop);
            Some(ResolvedResult {
                filter,
                subregion: crop,
                cs: prim.color_interp,
            })
        }
        FilterEffect::Composite { in1, in2, op } => {
            let f1 = table.resolve(in1, region).in_space(prim.color_interp);
            let f2 = table.resolve(in2, region).in_space(prim.color_interp);
            let filter = build_composite(op, f1, f2, crop);
            Some(ResolvedResult {
                filter,
                subregion: crop,
                cs: prim.color_interp,
            })
        }
        FilterEffect::Blend { in1, in2, mode } => {
            let f1 = table.resolve(in1, region).in_space(prim.color_interp);
            let f2 = table.resolve(in2, region).in_space(prim.color_interp);
            // skia: blend(mode, background, foreground, crop). SVG `in`
            // is the foreground, `in2` the background — see Blink
            // `fe_blend.cc:43-53`.
            let filter = image_filters::blend(*mode, f2, f1, crop);
            Some(ResolvedResult {
                filter,
                subregion: crop,
                cs: prim.color_interp,
            })
        }
        FilterEffect::Merge { inputs } => {
            // Empty merge yields a transparent result; we still pass the
            // crop rect so subsequent stages see consistent bounds. Skia
            // accepts an empty iterator.
            let resolved: Vec<Option<ImageFilter>> = inputs
                .iter()
                .map(|i| table.resolve(i, region).in_space(prim.color_interp))
                .collect();
            let filter = image_filters::merge(resolved, crop);
            Some(ResolvedResult {
                filter,
                subregion: crop,
                cs: prim.color_interp,
            })
        }
        FilterEffect::Morphology {
            input,
            op,
            radius_x,
            radius_y,
        } => {
            let input_filter = table.resolve(input, region).in_space(prim.color_interp);
            let rx = radius_x * ctx.prim_scale.0;
            let ry = radius_y * ctx.prim_scale.1;
            let filter = match op {
                MorphOp::Dilate => image_filters::dilate((rx, ry), input_filter, crop),
                MorphOp::Erode => image_filters::erode((rx, ry), input_filter, crop),
            };
            Some(ResolvedResult {
                filter,
                subregion: crop,
                cs: prim.color_interp,
            })
        }
        FilterEffect::ComponentTransfer { input, r, g, b, a } => {
            let input_filter = table.resolve(input, region).in_space(prim.color_interp);
            let cf = build_component_transfer_filter(r, g, b, a);
            // `cf == None` means all four channels are identity — the
            // filter is a no-op. We still pass it through so the crop
            // applies, but skip the color filter wrap.
            let filter = match cf {
                Some(cf) => image_filters::color_filter(cf, input_filter, crop),
                None => input_filter,
            };
            Some(ResolvedResult {
                filter,
                subregion: crop,
                cs: prim.color_interp,
            })
        }
        FilterEffect::DropShadow {
            input,
            dx,
            dy,
            std_dev_x,
            std_dev_y,
            color,
        } => {
            let input_filter = table.resolve(input, region).in_space(prim.color_interp);
            let ox = dx * ctx.prim_scale.0;
            let oy = dy * ctx.prim_scale.1;
            let sx = std_dev_x * ctx.prim_scale.0;
            let sy = std_dev_y * ctx.prim_scale.1;
            // Skia's `image_filters::drop_shadow` is mode
            // `kDrawShadowAndForeground` — includes the source. Matches
            // Blink's `fe_drop_shadow.cc:78-83` choice. Color already
            // has flood-opacity folded into its alpha by the parser.
            let filter =
                image_filters::drop_shadow((ox, oy), (sx, sy), *color, None, input_filter, crop);
            Some(ResolvedResult {
                filter,
                subregion: crop,
                cs: prim.color_interp,
            })
        }
        FilterEffect::Turbulence {
            kind,
            base_freq_x,
            base_freq_y,
            num_octaves,
            seed,
            stitch_tiles,
        } => {
            // Per Blink `fe_turbulence.cc:134-140`, baseFrequency is
            // scaled by page zoom but NOT by primitiveUnits. Our
            // surface is already 1 device-pixel = 1 SVG-user-unit
            // (the reftest harness scales the surface to the reference
            // PNG dimensions), so no extra scale factor here.
            let bf = (*base_freq_x, *base_freq_y);
            // `stitchTiles="stitch"` → tile size = primitive subregion
            // (Blink `fe_turbulence.cc:131-133`). `noStitch` → None.
            let tile = if *stitch_tiles {
                Some(skia_safe::ISize::new(
                    crop.width().round().max(1.0) as i32,
                    crop.height().round().max(1.0) as i32,
                ))
            } else {
                None
            };
            let shader = match kind {
                TurbulenceKind::Turbulence => {
                    skia_safe::shaders::turbulence(bf, *num_octaves as usize, *seed, tile)
                }
                TurbulenceKind::FractalNoise => {
                    skia_safe::shaders::fractal_noise(bf, *num_octaves as usize, *seed, tile)
                }
            };
            let filter = shader.and_then(|s| image_filters::shader(s, crop));
            Some(ResolvedResult {
                filter,
                subregion: crop,
                // Skia's `SkPerlinNoiseShader` is color-space-agnostic:
                // `SkPerlinNoiseShaderImpl::appendStages` emits raw
                // [0..1] / [-1..1] floats straight into the destination
                // pipeline with no encode/decode. Blink mirrors that
                // (`fe_turbulence.cc` does NOT override
                // `SetOperatingInterpolationSpace` the way `fe_flood.h`
                // does for FEFlood) — the noise output is taken to live
                // in whatever `color-interpolation-filters` resolves to
                // for this primitive, not unconditionally sRGB. We were
                // hard-coding sRGB before, which over-decoded the noise
                // when downstream primitives requested linearRGB and
                // produced over-saturated output vs Chrome / resvg.
                cs: prim.color_interp,
            })
        }
        FilterEffect::DisplacementMap {
            in1,
            in2,
            x_channel,
            y_channel,
            scale,
        } => {
            let f1 = table.resolve(in1, region).in_space(prim.color_interp);
            let f2 = table.resolve(in2, region).in_space(prim.color_interp);
            // Skia API: `displacement_map((x_chan, y_chan), scale,
            // displacement, color, crop)`. The displacement (in2) goes
            // first; the color (in1) goes second. Easy to flip — see
            // Blink `fe_displacement_map.cc:124-127`.
            let s = scale * ctx.prim_scale.0; // §15.16 scale follows X axis
            let filter = image_filters::displacement_map(
                (channel_to_skia(*x_channel), channel_to_skia(*y_channel)),
                s,
                f2,
                f1,
                crop,
            );
            Some(ResolvedResult {
                filter,
                subregion: crop,
                cs: prim.color_interp,
            })
        }
        FilterEffect::Lighting {
            input,
            kind,
            surface_scale,
            lighting_color,
            light,
        } => {
            let input_filter = table.resolve(input, region).in_space(prim.color_interp);
            let filter = build_lighting(
                *kind,
                *surface_scale,
                *lighting_color,
                light,
                input_filter,
                crop,
                ctx,
            );
            Some(ResolvedResult {
                filter,
                subregion: crop,
                cs: prim.color_interp,
            })
        }
        FilterEffect::ConvolveMatrix {
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
        } => {
            let input_filter = table.resolve(input, region).in_space(prim.color_interp);
            // SVG defines convolution; Skia does correlation. Reverse
            // the kernel so the math matches Blink
            // (`fe_convolve_matrix.cc:153-156`).
            let mut reversed: Vec<f32> = kernel_matrix.clone();
            reversed.reverse();
            // `divisor=0` (or unspecified) → use sum of kernel; if sum
            // is 0, fall back to 1 (Blink `fe_convolve_matrix.cc:127-136`).
            let divisor_resolved = match divisor {
                Some(d) if *d != 0.0 => *d,
                _ => {
                    let s: f32 = kernel_matrix.iter().sum();
                    if s != 0.0 {
                        s
                    } else {
                        1.0
                    }
                }
            };
            let gain = 1.0 / divisor_resolved;
            // Blink stores bias in 0..1; Skia expects 8-bit pixel space
            // (`fe_convolve_matrix.cc:149`).
            let sk_bias = bias * 255.0;
            let tile_mode = match edge_mode {
                EdgeMode::Duplicate => skia_safe::TileMode::Clamp,
                EdgeMode::Wrap => skia_safe::TileMode::Repeat,
                EdgeMode::None => skia_safe::TileMode::Decal,
            };
            let filter = image_filters::matrix_convolution(
                skia_safe::ISize::new(*order_x, *order_y),
                &reversed,
                gain,
                sk_bias,
                skia_safe::IPoint::new(*target_x, *target_y),
                tile_mode,
                !preserve_alpha,
                input_filter,
                crop,
            );
            Some(ResolvedResult {
                filter,
                subregion: crop,
                cs: prim.color_interp,
            })
        }
        FilterEffect::Tile { input } => {
            // Skia: `tile(src=input_subregion, dst=our_subregion, input)`.
            // Per Blink `fe_tile.cc:37-42`, src is the producer's
            // primitive subregion (or filter region for SourceGraphic-
            // class inputs); dst is our own subregion. Skia's `tile`
            // takes no `crop_rect` arg.
            let resolved = table.resolve(input, region);
            let src = resolved.subregion;
            let input_filter = resolved.in_space(prim.color_interp);
            let filter = image_filters::tile(src, crop, input_filter);
            Some(ResolvedResult {
                filter,
                subregion: crop,
                cs: prim.color_interp,
            })
        }
        FilterEffect::Image { href, par } => {
            // Internal `#elementId` reference: render the referenced
            // subtree into a Skia `Picture` and wrap as a picture
            // image-filter. Mirrors Blink's
            // `FEImage::CreateImageFilterForLayoutObject`
            // (`svg_fe_image.cc:222-245`). Per spec, `preserveAspectRatio`
            // is *ignored* for internal refs — the referenced element
            // keeps its natural user-space coordinates.
            //
            // For internal refs, the effective subregion is the
            // referenced element's natural bbox (translated by any
            // explicit `x`/`y`), then intersected with the filter
            // region. This matches resvg's reference renders for
            // `…with-x-y-and-protruding-subregion-{1,2}` — the picture
            // content is naturally bound by the source element's size,
            // not by the entire filter region.
            let internal_filter = same_document_fragment(href).and_then(|id| {
                let target = ctx.paint_ctx.resources.lookup(id)?;
                let target_node = ctx.paint_ctx.dom.node(target);
                // Direct self-reference: target carries `filter=url(#self)`
                // pointing back at the filter we're inside. Recording its
                // subtree would re-enter the same filter; Chrome treats
                // the result as transparent black per Filter Effects
                // §15.21 ("source unavailable"). Bail to the
                // `transparent_flood` fallback below.
                if let Some(raw) = get_attr(target_node, "filter") {
                    if let Some(fid_str) = parse_url_ref(raw.trim()) {
                        if let Some(fid) = ctx.paint_ctx.resources.lookup(fid_str) {
                            if fid == ctx.current_filter_id {
                                return None;
                            }
                        }
                    }
                }
                let target_bbox =
                    super::super::layout::bbox::element_object_bbox(ctx.paint_ctx.dom, target_node);
                // Compute internal-ref subregion. Explicit x/y/w/h
                // override; missing w/h fall back to the target's
                // natural extents instead of the filter region.
                let sub = &prim.subregion;
                let internal_crop = compute_internal_image_subregion(sub, target_bbox, ctx);
                let pic = super::super::paint::svg_object_painter::record_subtree_to_picture(
                    ctx.paint_ctx,
                    target,
                    internal_crop,
                )?;
                image_filters::picture(pic, Some(&internal_crop))
            });
            let filter = if internal_filter.is_some() {
                internal_filter
            } else if href.starts_with('#') {
                // Internal href that didn't resolve (missing target,
                // recursion cap, empty record) → transparent black per
                // §15.21.
                transparent_flood(crop)
            } else {
                // External / `data:` URI path.
                let image = if let Some(bytes) = svg_image_painter::decode_data_uri(href.trim()) {
                    skia_safe::Image::from_encoded(skia_safe::Data::new_copy(&bytes))
                } else {
                    ctx.images.get(href.as_str()).cloned()
                };
                match image {
                    Some(image) => {
                        let dst = compute_image_dst_rect(
                            image.width() as f32,
                            image.height() as f32,
                            crop,
                            *par,
                        );
                        let src = Rect::from_iwh(image.width(), image.height());
                        let sampling = skia_safe::SamplingOptions::default();
                        image_filters::image(image, Some(&src), Some(&dst), sampling)
                    }
                    None => transparent_flood(crop),
                }
            };
            Some(ResolvedResult {
                filter,
                subregion: crop,
                // Image bytes are interpreted as sRGB; see Flood/Turbulence.
                cs: ColorInterp::SRgb,
            })
        }
    }
}

/// Dispatch to the appropriate Skia `image_filters::*_lit_*` builder.
/// Six combinations: `{distant, point, spot} × {diffuse, specular}`.
/// Direction vector for distant lights uses
/// `(cos(az)·cos(el), sin(az)·cos(el), sin(el))` per Blink
/// `fe_lighting.cc:90-94`. Spot lights pass `(location, target,
/// falloff_exponent, cutoff_angle, color, surface_scale, k, …)`.
///
/// Skia handles the Sobel-normal computation, the alpha rules
/// (diffuse=opaque, specular=`max(R,G,B)`), and the spotlight cone
/// falloff internally — we don't reimplement them.
fn build_lighting(
    kind: LightingKind,
    surface_scale: f32,
    color: skia_safe::Color,
    light: &LightSource,
    input: Option<ImageFilter>,
    crop: Rect,
    ctx: &BuildContext<'_>,
) -> Option<ImageFilter> {
    use skia_safe::Point3;
    // Apply primitiveUnits to point/spot positions. Distant direction
    // is unitless (azimuth/elevation in degrees) and isn't affected.
    // - `userSpaceOnUse` (default): positions pass through unchanged.
    // - `objectBoundingBox`: (x, y, z) ∈ [0,1] of the bbox, so we
    //   map x → bbox.x + x*bbox.w, y → bbox.y + y*bbox.h. Z scales
    //   with the X axis per Skia svg `SkSVGFeLighting.cpp:76-87`.
    let resolve_xyz = |x: f32, y: f32, z: f32| -> Point3 {
        if ctx.primitive_units_obb {
            Point3::new(
                ctx.bbox.left + x * ctx.bbox.width(),
                ctx.bbox.top + y * ctx.bbox.height(),
                z * ctx.bbox.width(),
            )
        } else {
            Point3::new(x, y, z)
        }
    };

    match (kind, light) {
        (LightingKind::Diffuse { kd }, LightSource::Distant { azimuth, elevation }) => {
            let dir = direction_vec(*azimuth, *elevation);
            image_filters::distant_lit_diffuse(dir, color, surface_scale, kd, input, crop)
        }
        (LightingKind::Diffuse { kd }, LightSource::Point { x, y, z }) => {
            image_filters::point_lit_diffuse(
                resolve_xyz(*x, *y, *z),
                color,
                surface_scale,
                kd,
                input,
                crop,
            )
        }
        (
            LightingKind::Diffuse { kd },
            LightSource::Spot {
                x,
                y,
                z,
                points_at_x,
                points_at_y,
                points_at_z,
                specular_exponent,
                limiting_cone_angle,
            },
        ) => image_filters::spot_lit_diffuse(
            resolve_xyz(*x, *y, *z),
            resolve_xyz(*points_at_x, *points_at_y, *points_at_z),
            *specular_exponent,
            limiting_cone_angle.unwrap_or(90.0),
            color,
            surface_scale,
            kd,
            input,
            crop,
        ),
        (LightingKind::Specular { ks, shininess }, LightSource::Distant { azimuth, elevation }) => {
            let dir = direction_vec(*azimuth, *elevation);
            image_filters::distant_lit_specular(
                dir,
                color,
                surface_scale,
                ks,
                shininess,
                input,
                crop,
            )
        }
        (LightingKind::Specular { ks, shininess }, LightSource::Point { x, y, z }) => {
            image_filters::point_lit_specular(
                resolve_xyz(*x, *y, *z),
                color,
                surface_scale,
                ks,
                shininess,
                input,
                crop,
            )
        }
        (
            LightingKind::Specular { ks, shininess },
            LightSource::Spot {
                x,
                y,
                z,
                points_at_x,
                points_at_y,
                points_at_z,
                specular_exponent,
                limiting_cone_angle,
            },
        ) => image_filters::spot_lit_specular(
            resolve_xyz(*x, *y, *z),
            resolve_xyz(*points_at_x, *points_at_y, *points_at_z),
            *specular_exponent,
            limiting_cone_angle.unwrap_or(90.0),
            color,
            surface_scale,
            ks,
            shininess,
            input,
            crop,
        ),
    }
}

fn direction_vec(azimuth_deg: f32, elevation_deg: f32) -> skia_safe::Point3 {
    let az = azimuth_deg.to_radians();
    let el = elevation_deg.to_radians();
    skia_safe::Point3::new(az.cos() * el.cos(), az.sin() * el.cos(), el.sin())
}

fn channel_to_skia(c: ChannelSelector) -> skia_safe::ColorChannel {
    use skia_safe::ColorChannel as Sk;
    match c {
        ChannelSelector::R => Sk::R,
        ChannelSelector::G => Sk::G,
        ChannelSelector::B => Sk::B,
        ChannelSelector::A => Sk::A,
    }
}

/// Build the `color_filters::table_argb` filter, or `None` when every
/// channel is identity. Skia's table filter handles the unpremul/premul
/// dance internally per `SkColorFilter.h:115-119` — no extra wrap
/// needed (which is what Blink relies on at
/// `fe_component_transfer.cc:134-147`).
///
/// Skia's argument order is `(A, R, G, B)` — alpha first. Easy to flip.
fn build_component_transfer_filter(
    r: &TransferFn,
    g: &TransferFn,
    b: &TransferFn,
    a: &TransferFn,
) -> Option<ColorFilter> {
    let lr = r.lut();
    let lg = g.lut();
    let lb = b.lut();
    let la = a.lut();
    if lr.is_none() && lg.is_none() && lb.is_none() && la.is_none() {
        return None;
    }
    color_filters::table_argb(la.as_ref(), lr.as_ref(), lg.as_ref(), lb.as_ref())
}

/// Compute the SVG-spec default subregion for `effect` per Filter
/// Effects 1 §15.7. Three branches:
///   1. `feTile` — special case, default = filter region (Blink:
///      `kFilterEffectTypeTile` arm in
///      `svg_filter_primitive_standard_attributes.cc::DefaultFilterPrimitiveSubregion`).
///   2. Source primitives (`feFlood`, `feImage`, `feTurbulence`) — no
///      inputs, default = filter region.
///   3. Everything else — union of input subregions, collapsed to
///      filter region the moment any input is source-class
///      (`SourceGraphic` / `SourceAlpha` / `FillPaint` / `StrokePaint` /
///      `BackgroundImage` / `BackgroundAlpha`).
fn default_primitive_subregion(
    effect: &FilterEffect,
    table: &ResultTable,
    filter_region: Rect,
) -> Rect {
    if matches!(effect, FilterEffect::Tile { .. }) {
        return filter_region;
    }
    let inputs = effect_inputs(effect);
    if inputs.is_empty() {
        return filter_region;
    }
    let mut acc: Option<Rect> = None;
    for input in inputs {
        if is_source_class_input(input) {
            // Any source-class input collapses the default to the
            // filter region (Blink `DefaultFilterPrimitiveSubregion`
            // line 130-134).
            return filter_region;
        }
        let r = table.resolve(input, filter_region).subregion;
        acc = Some(match acc {
            None => r,
            Some(prev) => union_rect(prev, r),
        });
    }
    acc.unwrap_or(filter_region)
}

/// `FeInput` references that count as the source / source-alpha pseudo-
/// inputs for §15.7's "collapse to filter region" rule.
fn is_source_class_input(input: &FeInput) -> bool {
    matches!(
        input,
        FeInput::SourceGraphic
            | FeInput::SourceAlpha
            | FeInput::FillPaint
            | FeInput::StrokePaint
            | FeInput::BackgroundImage
            | FeInput::BackgroundAlpha
    )
}

fn effect_inputs(effect: &FilterEffect) -> Vec<&FeInput> {
    match effect {
        FilterEffect::GaussianBlur { input, .. }
        | FilterEffect::Offset { input, .. }
        | FilterEffect::ColorMatrix { input, .. }
        | FilterEffect::Morphology { input, .. }
        | FilterEffect::ComponentTransfer { input, .. }
        | FilterEffect::DropShadow { input, .. }
        | FilterEffect::ConvolveMatrix { input, .. }
        | FilterEffect::Tile { input }
        | FilterEffect::Lighting { input, .. } => vec![input],
        FilterEffect::Composite { in1, in2, .. }
        | FilterEffect::Blend { in1, in2, .. }
        | FilterEffect::DisplacementMap { in1, in2, .. } => vec![in1, in2],
        FilterEffect::Merge { inputs } => inputs.iter().collect(),
        // Source primitives have no inputs.
        FilterEffect::Flood { .. }
        | FilterEffect::Turbulence { .. }
        | FilterEffect::Image { .. } => Vec::new(),
    }
}

/// Transparent-black flood bounded to `crop`. Used by feImage's spec
/// fallback (§15.21: "filter primitive output is transparent black"
/// when the href cannot be resolved).
fn transparent_flood(crop: Rect) -> Option<ImageFilter> {
    let shader = skia_safe::shaders::color(skia_safe::Color::TRANSPARENT);
    image_filters::shader(shader, crop)
}

fn union_rect(a: Rect, b: Rect) -> Rect {
    Rect::from_ltrb(
        a.left.min(b.left),
        a.top.min(b.top),
        a.right.max(b.right),
        a.bottom.max(b.bottom),
    )
}

/// Compute the effective subregion for an `feImage` whose `href`
/// points to an internal element. Differs from the generic
/// [`subregion_for`] by defaulting missing `width`/`height` to the
/// referenced element's natural extents (rather than the filter
/// region). This matches resvg's reference for fixtures where a
/// subregion-less or partially-specified `feImage` should clip its
/// rendered subtree to the source element's natural size, not the
/// entire filter region.
fn compute_internal_image_subregion(
    sub: &super::svg_filter_builder::PrimitiveSubregion,
    target_bbox: Rect,
    ctx: &BuildContext<'_>,
) -> Rect {
    use super::svg_filter_builder::LengthVal;
    let viewport = ctx.user_viewport;
    let bbox = ctx.bbox;
    let region = ctx.filter_region;
    // No explicit subregion attrs → fall back to the entire filter
    // region (Filter Effects 1 §15.7 default for source primitives).
    // Picture content placed at the target element's natural user-space
    // coords automatically lands inside the filter region — that's what
    // `feImage_link-to-an-element-with-opacity` relies on for the green
    // rect to appear at rect3's actual `(36, 36)` position offset by
    // the filter region origin.
    if sub.is_empty() {
        return region;
    }
    let resolve_extent = |v: LengthVal, bbox_extent: f32, viewport_extent: f32| -> f32 {
        match (v, ctx.primitive_units_obb) {
            (LengthVal::Number(n), true) => n * bbox_extent,
            (LengthVal::Percent(p), true) => (p / 100.0) * bbox_extent,
            (LengthVal::Number(n), false) => n,
            (LengthVal::Percent(p), false) => (p / 100.0) * viewport_extent,
        }
    };
    let resolve_origin =
        |v: LengthVal, bbox_origin: f32, bbox_extent: f32, viewport_extent: f32| -> f32 {
            match (v, ctx.primitive_units_obb) {
                (LengthVal::Number(n), true) => bbox_origin + n * bbox_extent,
                (LengthVal::Percent(p), true) => bbox_origin + (p / 100.0) * bbox_extent,
                (LengthVal::Number(n), false) => n,
                (LengthVal::Percent(p), false) => (p / 100.0) * viewport_extent,
            }
        };
    let x = sub
        .x
        .map(|v| resolve_origin(v, bbox.left, bbox.width(), viewport.0))
        .unwrap_or(target_bbox.left);
    let y = sub
        .y
        .map(|v| resolve_origin(v, bbox.top, bbox.height(), viewport.1))
        .unwrap_or(target_bbox.top);
    let w = sub
        .width
        .map(|v| resolve_extent(v, bbox.width(), viewport.0))
        .unwrap_or(target_bbox.width());
    let h = sub
        .height
        .map(|v| resolve_extent(v, bbox.height(), viewport.1))
        .unwrap_or(target_bbox.height());
    let mut out = Rect::from_xywh(x, y, w, h);
    out.intersect(region);
    out
}

fn subregion_for(prim: &Primitive, filter_region: Rect, ctx: &BuildContext<'_>) -> Rect {
    // Resolve per-primitive x/y/w/h overrides on top of the filter
    // region. SVG default: union of input subregions, falling back to
    // the filter region when any input is `SourceGraphic` /
    // `SourceAlpha`. We approximate the default with the filter region —
    // a small over-clip is preferable to under-clip (over-clip is what
    // Skia svg::Dom does too in practice, since `SkSVGFe::resolveFilterSubregion`
    // walks back to the filter region for any standard input).
    let sub = &prim.subregion;
    if sub.is_empty() {
        return filter_region;
    }
    // SVG 1.1 §15.6: when `primitiveUnits=objectBoundingBox`, the x/y/
    // width/height of every filter-primitive subregion are fractions of
    // the object bounding box — final = bbox.x + value * bbox.width
    // (likewise for y/w/h). In `userSpaceOnUse` (default) the values
    // are absolute user-space lengths. We were skipping this transform
    // entirely, which is why fixtures like
    // `feFlood/subregion-with-primitiveUnits=objectBoundingBox.svg`
    // produced a near-empty crop (`(0.25, 0.25, 0.5, 0.5)` intersected
    // with the user-space filter region is a degenerate rect).
    use super::svg_filter_builder::LengthVal;
    // Resolve a single subregion length according to SVG 2 §15.7.
    //
    //   * `objectBoundingBox`: both `<number>` and `<percentage>` are
    //     fractions of the bbox extent (50% == 0.5).
    //   * `userSpaceOnUse`: a `<number>` is an absolute user-space
    //     length; a `<percentage>` resolves against the *current
    //     viewport* (the SVG outer `<svg>` viewport), not the filter
    //     region. This is what `…with-subregion-{2,3}` and
    //     `subregion-and-primitiveUnits=…-2` rely on.
    let viewport = ctx.user_viewport;
    let resolve_extent = |v: LengthVal, bbox_extent: f32, viewport_extent: f32| -> f32 {
        match (v, ctx.primitive_units_obb) {
            (LengthVal::Number(n), true) => n * bbox_extent,
            (LengthVal::Percent(p), true) => (p / 100.0) * bbox_extent,
            (LengthVal::Number(n), false) => n,
            (LengthVal::Percent(p), false) => (p / 100.0) * viewport_extent,
        }
    };
    let resolve_origin =
        |v: LengthVal, bbox_origin: f32, bbox_extent: f32, viewport_extent: f32| -> f32 {
            match (v, ctx.primitive_units_obb) {
                (LengthVal::Number(n), true) => bbox_origin + n * bbox_extent,
                (LengthVal::Percent(p), true) => bbox_origin + (p / 100.0) * bbox_extent,
                (LengthVal::Number(n), false) => n,
                (LengthVal::Percent(p), false) => (p / 100.0) * viewport_extent,
            }
        };
    let bbox = ctx.bbox;
    let x = sub
        .x
        .map(|v| resolve_origin(v, bbox.left, bbox.width(), viewport.0))
        .unwrap_or(filter_region.left);
    let y = sub
        .y
        .map(|v| resolve_origin(v, bbox.top, bbox.height(), viewport.1))
        .unwrap_or(filter_region.top);
    let w = sub
        .width
        .map(|v| resolve_extent(v, bbox.width(), viewport.0))
        .unwrap_or(filter_region.width());
    let h = sub
        .height
        .map(|v| resolve_extent(v, bbox.height(), viewport.1))
        .unwrap_or(filter_region.height());
    // Intersect with filter region — every primitive is bounded by the
    // filter region per Blink (`filter_effect.cc:50-55`). Skia's
    // `Rect::intersect` leaves the rect untouched when the inputs
    // don't overlap (it just reports `false`); we want an empty rect
    // in that case so downstream primitives can detect "no graphical
    // output" via `is_empty()`.
    let raw = Rect::from_xywh(x, y, w, h);
    let mut out = raw;
    if !out.intersect(filter_region) {
        out = Rect::new_empty();
    }
    out
}

// ─── builders ─────────────────────────────────────────────────────────

fn source_alpha_filter() -> Option<ImageFilter> {
    // Matrix that zeroes RGB and preserves A. Skia's `SkColorMatrix`
    // is row-major 4×5. `SkSVGFilterContext::resolveInput` does the
    // same dance (`SkSVGFilterContext.cpp:97-101`).
    let mut m = ColorMatrix::default();
    m.set_scale(0.0, 0.0, 0.0, 1.0);
    let cf = color_filters::matrix(&m, None);
    image_filters::color_filter(cf, None, image_filters::CropRect::default())
}

fn build_color_matrix_filter(kind: &ColorMatrixKind) -> ColorFilter {
    let mut m = ColorMatrix::default();
    match kind {
        ColorMatrixKind::Matrix(values) => {
            // `ColorMatrix::new_with_array(&[20])` exists, but the most
            // portable path is `set_row_major` (matches SVG's row-major
            // 4×5 layout exactly).
            m.set_row_major(values);
        }
        ColorMatrixKind::Saturate(s) => {
            // SVG §15.18 saturation matrix.
            let s = *s;
            let r = 0.213 + 0.787 * s;
            let g = 0.715 - 0.715 * s;
            let b = 0.072 - 0.072 * s;
            let r2 = 0.213 - 0.213 * s;
            let g2 = 0.715 + 0.285 * s;
            let b2 = 0.072 - 0.072 * s;
            let r3 = 0.213 - 0.213 * s;
            let g3 = 0.715 - 0.715 * s;
            let b3 = 0.072 + 0.928 * s;
            #[rustfmt::skip]
            let arr = [
                r,  g,  b,  0.0, 0.0,
                r2, g2, b2, 0.0, 0.0,
                r3, g3, b3, 0.0, 0.0,
                0.0, 0.0, 0.0, 1.0, 0.0,
            ];
            m.set_row_major(&arr);
        }
        ColorMatrixKind::HueRotate(deg) => {
            let theta = deg.to_radians();
            let c = theta.cos();
            let s = theta.sin();
            // SVG §15.18 hue-rotation matrix.
            #[rustfmt::skip]
            let arr = [
                0.213 + c*0.787 - s*0.213, 0.715 - c*0.715 - s*0.715, 0.072 - c*0.072 + s*0.928, 0.0, 0.0,
                0.213 - c*0.213 + s*0.143, 0.715 + c*0.285 + s*0.140, 0.072 - c*0.072 - s*0.283, 0.0, 0.0,
                0.213 - c*0.213 - s*0.787, 0.715 - c*0.715 + s*0.715, 0.072 + c*0.928 + s*0.072, 0.0, 0.0,
                0.0, 0.0, 0.0, 1.0, 0.0,
            ];
            m.set_row_major(&arr);
        }
        ColorMatrixKind::LuminanceToAlpha => {
            // SVG §15.18 luminance-to-alpha matrix.
            #[rustfmt::skip]
            let arr = [
                0.0,    0.0,    0.0,    0.0, 0.0,
                0.0,    0.0,    0.0,    0.0, 0.0,
                0.0,    0.0,    0.0,    0.0, 0.0,
                0.2125, 0.7154, 0.0721, 0.0, 0.0,
            ];
            m.set_row_major(&arr);
        }
    }
    color_filters::matrix(&m, None)
}

fn build_composite(
    op: &CompositeOp,
    in1: Option<ImageFilter>,
    in2: Option<ImageFilter>,
    crop: Rect,
) -> Option<ImageFilter> {
    match op {
        CompositeOp::Arithmetic { k1, k2, k3, k4 } => {
            // skia signature: arithmetic(k1, k2, k3, k4, enforce_pm_color,
            // background, foreground, crop). `enforce_pm_color=true`
            // matches Skia svg::Dom (`SkSVGFeComposite.cpp:62`) and Blink
            // (`fe_composite.cc:181-186`); without it, k4>0 produces
            // RGB>A pixels that break downstream blending.
            image_filters::arithmetic(*k1, *k2, *k3, *k4, true, in2, in1, crop)
        }
        op => {
            let mode = match op {
                CompositeOp::Over => BlendMode::SrcOver,
                CompositeOp::In => BlendMode::SrcIn,
                CompositeOp::Out => BlendMode::SrcOut,
                CompositeOp::Atop => BlendMode::SrcATop,
                CompositeOp::Xor => BlendMode::Xor,
                CompositeOp::Lighter => BlendMode::Plus,
                CompositeOp::Arithmetic { .. } => unreachable!(),
            };
            image_filters::blend(mode, in2, in1, crop)
        }
    }
}

/// Reserved for the future color-management pass — currently unused
/// because we never enter linearRGB (see `build_dag` for rationale).
#[allow(dead_code)]
fn linear_to_srgb_filter() -> Option<ColorFilter> {
    Some(color_filters::linear_to_srgb_gamma())
}

/// Build a [`FilterInvocation`] from a CSS `filter:` shorthand list:
/// `blur(3px)`, `hue-rotate(45deg)`, `grayscale()`, `opacity(.5)`, …
/// Returns `None` for unrecognized syntax — caller falls back to
/// rendering without a filter.
///
/// CSS Filters Module Level 1 §3 enumerates the function-style filter
/// values. Skia's `image_filters::*` and `color_filters::*` cover the
/// common subset directly — for the rest we map onto a color matrix
/// the way Blink's `FilterOperationResolver::ResolveValue` does.
pub fn build_from_css_filter_list(
    value: &str,
    object_bbox: skia_safe::Rect,
    current_color: skia_safe::Color,
    font_size_px: f32,
) -> Option<FilterInvocation> {
    let mut current: Option<ImageFilter> = None;
    let mut any = false;
    for func in iter_filter_functions(value) {
        let (name, args) = func;
        // Per CSS Filter Effects 1 §3.1: "If a filter function is given
        // an invalid argument, the entire filter property is invalid,
        // and the filtered element is rendered as if there were no
        // `filter` property." We model this by returning `None` from
        // any unparseable arg parse below, propagating through `?`.
        let next = match name.to_ascii_lowercase().as_str() {
            "blur" => {
                let r = parse_first_length_strict(&args)?;
                if r <= 0.0 {
                    current.clone()
                } else {
                    image_filters::blur(
                        (r, r),
                        None,
                        current.clone(),
                        image_filters::CropRect::default(),
                    )
                }
            }
            "hue-rotate" => {
                // `hue-rotate()` with no argument defaults to `0deg`
                // (identity). With a non-empty argument, it must be a
                // valid <angle>; otherwise the whole list is invalid.
                let deg = if args.trim().is_empty() {
                    0.0
                } else {
                    parse_first_angle_deg(&args)?
                };
                let cf = build_color_matrix_filter(&ColorMatrixKind::HueRotate(deg));
                image_filters::color_filter(cf, current.clone(), image_filters::CropRect::default())
            }
            "grayscale" => {
                let amount = parse_amount_strict(&args)?.clamp(0.0, 1.0);
                let cf = build_color_matrix_filter(&ColorMatrixKind::Saturate(1.0 - amount));
                image_filters::color_filter(cf, current.clone(), image_filters::CropRect::default())
            }
            "saturate" => {
                let amount = parse_amount_strict(&args)?.max(0.0);
                let cf = build_color_matrix_filter(&ColorMatrixKind::Saturate(amount));
                image_filters::color_filter(cf, current.clone(), image_filters::CropRect::default())
            }
            "invert" => {
                let amount = parse_amount_strict(&args)?.clamp(0.0, 1.0);
                #[rustfmt::skip]
                let arr = [
                    1.0 - 2.0*amount, 0.0,             0.0,             0.0, amount,
                    0.0,              1.0 - 2.0*amount, 0.0,             0.0, amount,
                    0.0,              0.0,             1.0 - 2.0*amount, 0.0, amount,
                    0.0,              0.0,             0.0,             1.0, 0.0,
                ];
                let cf = build_color_matrix_filter(&ColorMatrixKind::Matrix(arr));
                image_filters::color_filter(cf, current.clone(), image_filters::CropRect::default())
            }
            "brightness" => {
                let amount = parse_amount_strict(&args)?.max(0.0);
                #[rustfmt::skip]
                let arr = [
                    amount, 0.0,    0.0,    0.0, 0.0,
                    0.0,    amount, 0.0,    0.0, 0.0,
                    0.0,    0.0,    amount, 0.0, 0.0,
                    0.0,    0.0,    0.0,    1.0, 0.0,
                ];
                let cf = build_color_matrix_filter(&ColorMatrixKind::Matrix(arr));
                image_filters::color_filter(cf, current.clone(), image_filters::CropRect::default())
            }
            "contrast" => {
                let c = parse_amount_strict(&args)?.max(0.0);
                let intercept = (1.0 - c) / 2.0;
                #[rustfmt::skip]
                let arr = [
                    c,   0.0, 0.0, 0.0, intercept,
                    0.0, c,   0.0, 0.0, intercept,
                    0.0, 0.0, c,   0.0, intercept,
                    0.0, 0.0, 0.0, 1.0, 0.0,
                ];
                let cf = build_color_matrix_filter(&ColorMatrixKind::Matrix(arr));
                image_filters::color_filter(cf, current.clone(), image_filters::CropRect::default())
            }
            "opacity" => {
                let amount = parse_amount_strict(&args)?.clamp(0.0, 1.0);
                #[rustfmt::skip]
                let arr = [
                    1.0, 0.0, 0.0, 0.0,    0.0,
                    0.0, 1.0, 0.0, 0.0,    0.0,
                    0.0, 0.0, 1.0, 0.0,    0.0,
                    0.0, 0.0, 0.0, amount, 0.0,
                ];
                let cf = build_color_matrix_filter(&ColorMatrixKind::Matrix(arr));
                image_filters::color_filter(cf, current.clone(), image_filters::CropRect::default())
            }
            "sepia" => {
                let a = parse_amount_strict(&args)?.clamp(0.0, 1.0);
                #[rustfmt::skip]
                let arr = [
                    0.393 + 0.607*(1.0-a), 0.769 - 0.769*(1.0-a), 0.189 - 0.189*(1.0-a), 0.0, 0.0,
                    0.349 - 0.349*(1.0-a), 0.686 + 0.314*(1.0-a), 0.168 - 0.168*(1.0-a), 0.0, 0.0,
                    0.272 - 0.272*(1.0-a), 0.534 - 0.534*(1.0-a), 0.131 + 0.869*(1.0-a), 0.0, 0.0,
                    0.0,                   0.0,                   0.0,                   1.0, 0.0,
                ];
                let cf = build_color_matrix_filter(&ColorMatrixKind::Matrix(arr));
                image_filters::color_filter(cf, current.clone(), image_filters::CropRect::default())
            }
            "drop-shadow" => {
                // `drop-shadow(<offset-x> <offset-y> <blur-radius>? <color>?)`.
                // Per CSS Filter Effects 1 §3.1, any malformed argument
                // makes the entire `filter:` list invalid — the `?`
                // propagates None up so the caller falls back to "no
                // filter".
                let (dx, dy, blur, color) =
                    parse_drop_shadow_args(&args, current_color, font_size_px)?;
                image_filters::drop_shadow(
                    (dx, dy),
                    (blur, blur),
                    color,
                    None,
                    current.clone(),
                    image_filters::CropRect::default(),
                )
            }
            // `url(#id)` mixed into a function list — per CSS Filter
            // Effects 1 §3.1 a missing target *should* invalidate the
            // whole list, but resvg's reference renders treat the url
            // as identity (no-op) and keep applying surrounding
            // functions. Match resvg here (`one-invalid-url-in-list`
            // fixture). Resolving a present `<filter>` reference and
            // chaining it into the inline list is out of scope for
            // v1 — we'd need access to the resource table here.
            "url" => current.clone(),
            // Unknown function name → entire `filter:` list is invalid.
            _ => return None,
        };
        if next.is_some() {
            current = next;
            any = true;
        }
    }
    if !any {
        return None;
    }
    Some(FilterInvocation {
        image_filter: current?,
        // CSS filter functions don't define a region — use a generous
        // inflation of the bbox so blurs/shadows aren't clipped.
        region_user_space: skia_safe::Rect::from_xywh(
            object_bbox.left - object_bbox.width(),
            object_bbox.top - object_bbox.height(),
            object_bbox.width() * 3.0,
            object_bbox.height() * 3.0,
        ),
    })
}

pub(crate) fn iter_filter_functions(s: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= bytes.len() {
            break;
        }
        let name_start = i;
        while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'-') {
            i += 1;
        }
        if name_start == i {
            return out;
        }
        let name = s[name_start..i].to_string();
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= bytes.len() || bytes[i] != b'(' {
            return out;
        }
        i += 1;
        let args_start = i;
        let mut depth = 1i32;
        while i < bytes.len() && depth > 0 {
            match bytes[i] {
                b'(' => depth += 1,
                b')' => depth -= 1,
                _ => {}
            }
            if depth > 0 {
                i += 1;
            }
        }
        if depth != 0 {
            return out;
        }
        let args = s[args_start..i].to_string();
        i += 1;
        out.push((name, args));
    }
    out
}

fn parse_first_length(s: &str) -> Option<f32> {
    let trimmed = s.trim();
    let stripped = trimmed
        .strip_suffix("px")
        .or_else(|| trimmed.strip_suffix("PX"))
        .unwrap_or(trimmed);
    stripped.trim().parse::<f32>().ok()
}

/// CSS length parser that resolves `em` / `ex` / `ch` against a
/// caller-supplied font-size, falling back to the dom-level
/// `parse_length_px` (which already covers `px`, `mm`, `cm`, `in`,
/// `pt`, `pc`, `Q`, `rem` and unitless numbers) for everything else.
/// Used by `drop-shadow()` so a `font-size="64"` on the filtered
/// element makes `0.2em` resolve to `12.8`, not `3.2`.
fn parse_length_with_font_size(s: &str, font_size_px: f32) -> Option<f32> {
    let s = s.trim();
    if let Some(p) = s.strip_suffix("em") {
        return p.trim().parse::<f32>().ok().map(|v| v * font_size_px);
    }
    if let Some(p) = s.strip_suffix("ex") {
        // CSS Values 4: 1ex ≈ 0.5em when no x-height is available.
        return p.trim().parse::<f32>().ok().map(|v| v * font_size_px * 0.5);
    }
    if let Some(p) = s.strip_suffix("ch") {
        return p.trim().parse::<f32>().ok().map(|v| v * font_size_px * 0.5);
    }
    crate::htmlcss::svg::dom::attrs::parse_length_px(s)
}

/// Parse a CSS `<angle>` value to degrees. Per CSS Values 4 §6.1, an
/// `<angle>` always carries a unit (`deg` | `grad` | `rad` | `turn`);
/// a unitless number is **not** a valid `<angle>`, so this returns
/// `None` rather than silently treating the bare number as degrees.
/// (CSS Filter Effects 1's `hue-rotate()` is `<angle>`-typed, so for
/// example `hue-rotate(45)` is invalid and the whole filter list
/// should be dropped — see `build_from_css_filter_list`.)
fn parse_first_angle_deg(s: &str) -> Option<f32> {
    let s = s.trim();
    // Order matters: `"45grad"` ends with both `"rad"` and `"grad"`,
    // so check `"grad"` (and `"turn"`) before the shorter siblings.
    if let Some(p) = strip_suffix_ascii_ci(s, "grad") {
        return p.trim().parse::<f32>().ok().map(|v| v * 0.9);
    }
    if let Some(p) = strip_suffix_ascii_ci(s, "turn") {
        return p.trim().parse::<f32>().ok().map(|v| v * 360.0);
    }
    if let Some(p) = strip_suffix_ascii_ci(s, "deg") {
        return p.trim().parse::<f32>().ok();
    }
    if let Some(p) = strip_suffix_ascii_ci(s, "rad") {
        return p.trim().parse::<f32>().ok().map(|v| v.to_degrees());
    }
    // Per CSS Values 4 — unitless angle is invalid.
    None
}

fn strip_suffix_ascii_ci<'a>(s: &'a str, suffix: &str) -> Option<&'a str> {
    if s.len() < suffix.len() {
        return None;
    }
    let (head, tail) = s.split_at(s.len() - suffix.len());
    if tail.eq_ignore_ascii_case(suffix) {
        Some(head)
    } else {
        None
    }
}

fn parse_amount(s: &str) -> Option<f32> {
    let s = s.trim();
    if s.is_empty() {
        return Some(1.0);
    }
    if let Some(p) = s.strip_suffix('%') {
        return p.trim().parse::<f32>().ok().map(|v| v / 100.0);
    }
    s.parse::<f32>().ok()
}

/// Strict version of [`parse_amount`] — empty arg returns the default
/// (1.0), but garbage that can't parse returns `None` so the whole
/// CSS filter list can be invalidated per CSS Filter Effects 1 §3.1.
fn parse_amount_strict(s: &str) -> Option<f32> {
    let s = s.trim();
    if s.is_empty() {
        return Some(1.0);
    }
    // CSS Filter Effects 1 §3.1 explicitly forbids negative values for
    // every shorthand that flows through here — `brightness`,
    // `contrast`, `grayscale`, `invert`, `opacity`, `saturate`,
    // `sepia`. Per the same section: an invalid argument invalidates
    // the entire `filter` property, and the element renders as if
    // there were no filter. Reject negatives here so the calling
    // chain bails via the `?` and reverts to the unfiltered draw,
    // instead of clamping to zero and producing a black/gray result.
    let v = parse_amount(s)?;
    if v < 0.0 {
        return None;
    }
    Some(v)
}

/// Strict CSS `<length>` parser used by `blur(<length>)`. Empty arg
/// defaults to `0` (identity blur). Non-empty must parse cleanly,
/// otherwise the whole filter list is invalid (returns `None`).
fn parse_first_length_strict(s: &str) -> Option<f32> {
    let s = s.trim();
    if s.is_empty() {
        return Some(0.0);
    }
    parse_first_length(s)
}

/// Parse the argument list of a CSS `drop-shadow(...)` filter function.
///
/// Grammar per CSS Filter Effects 1 §3.1.10:
///
///     drop-shadow( [<color>]? && <length>{2,3} )
///
/// — a color (in any position) and exactly two or three lengths,
/// whitespace-separated. Commas are **not** allowed; an extra token,
/// missing length, two colors, or an unrecognised token all invalidate
/// the function — and per §3.1, an invalid filter function invalidates
/// the whole `filter:` list. We return `None` so the caller can drop
/// the entire list.
///
/// `currentColor` (and an omitted color) resolves to the supplied
/// `current_color`, which the caller derives from the element's
/// (possibly inherited) `color` property.
fn parse_drop_shadow_args(
    s: &str,
    current_color: skia_safe::Color,
    font_size_px: f32,
) -> Option<(f32, f32, f32, skia_safe::Color)> {
    use crate::htmlcss::svg::dom::attrs::parse_color;

    // Reject commas outright (CSS uses whitespace-separated args here).
    if s.contains(',') {
        return None;
    }

    // Tokenise on whitespace, keeping parenthesised groups intact so an
    // `rgb(255 0 0 / 0.5)` color survives.
    let mut tokens: Vec<String> = Vec::new();
    let mut buf = String::new();
    let mut depth = 0i32;
    for ch in s.chars() {
        match ch {
            '(' => {
                depth += 1;
                buf.push(ch);
            }
            ')' => {
                depth -= 1;
                buf.push(ch);
            }
            c if c.is_whitespace() && depth == 0 => {
                if !buf.is_empty() {
                    tokens.push(std::mem::take(&mut buf));
                }
            }
            c => buf.push(c),
        }
    }
    if !buf.is_empty() {
        tokens.push(buf);
    }

    let mut numbers: Vec<f32> = Vec::new();
    let mut color: Option<skia_safe::Color> = None;
    for t in tokens.iter() {
        if t.eq_ignore_ascii_case("currentcolor") {
            if color.is_some() {
                return None;
            }
            color = Some(current_color);
            continue;
        }
        if let Some(n) = parse_length_with_font_size(t, font_size_px) {
            numbers.push(n);
            continue;
        }
        if let Some(c) = parse_color(t) {
            if color.is_some() {
                return None;
            }
            color = Some(c);
            continue;
        }
        // Unrecognised token (e.g. an angle, percent, garbage).
        return None;
    }

    // The grammar requires 2 or 3 lengths.
    if numbers.len() < 2 || numbers.len() > 3 {
        return None;
    }
    let dx = numbers[0];
    let dy = numbers[1];
    // Negative blur is not valid, but treat 0 as identity (matches Blink).
    let blur = numbers.get(2).copied().unwrap_or(0.0);
    if blur < 0.0 {
        return None;
    }
    Some((dx, dy, blur, color.unwrap_or(current_color)))
}

// Filter application happens inline at the call site — see
// `paint/svg_container_painter.rs` where the painter sets
// `inv.image_filter` on a `SkPaint` and opens a `save_layer` directly.
// Keeping that inline (rather than a helper here) preserves the
// "resources/ produces, paint/ applies" boundary enforced by
// `tests/htmlcss_svg_architecture.rs`.
