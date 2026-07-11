//! ENG-2.1 · the paint executor — the only module that touches Skia's raster
//! API. [`crate::text_layout`] uses Skia Paragraph strictly as the shaping
//! oracle. `execute(canvas, drawlist, view, ctx)` (step 6) replays a
//! [`DrawList`](crate::drawlist::DrawList) onto a skia `Canvas`,
//! composing `view.then(&item.world)` per item in the exact mathematical
//! form the current spike painter uses — pixel identity is a property of
//! doing the same float ops in the same order, not a tolerance.

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};

use anchor_lab::math::Affine;
use anchor_lab::model::{
    Alignment, BlendMode, BoxFit, DiamondGradientPaint, GradientStop, ImageFilters, ImagePaint,
    ImagePaintFit, LinearGradientPaint, Paint as ModelPaint, Paints, RadialGradientPaint,
    RectangularCornerRadius, RectangularStrokeWidth, ResourceRef, Stroke, StrokeAlign, StrokeCap,
    StrokeJoin, StrokeWidth, SweepGradientPaint, TileMode,
};
use anchor_lab::path::{FillRule, PathCommand, ResolvedPathArtifact};
use skia_safe::canvas::{SaveLayerFlags, SaveLayerRec};
use skia_safe::gradient_shader::{Gradient, GradientColors, Interpolation};
use skia_safe::{
    image::CachingHint, path_effect::PathEffect, shaders, stroke_rec::InitStyle, Blender, Canvas,
    ClipOp, Color, CubicResampler, Data, Font, Image, ImageInfo, Matrix, Paint, PaintCap,
    PaintJoin, PaintStyle, Path, PathBuilder, PathDirection, PathFillType, PathOp, Point, RRect,
    Rect, SamplingOptions, Shader, StrokeRec,
};

use crate::drawlist::{DrawList, ItemKind};

/// Host-supplied resources: the typeface offered to text resolution and decoded
/// images used at paint time. Exact shaped fonts live with the drawlist; images
/// stay keyed by authored RID so path resolution remains a host concern.
pub struct PaintCtx {
    id: u64,
    resource_revision: u64,
    font: Option<skia_safe::Typeface>,
    images: BTreeMap<String, Image>,
}

impl PaintCtx {
    pub fn new(font: Option<skia_safe::Typeface>) -> Self {
        static NEXT_ID: AtomicU64 = AtomicU64::new(1);
        Self {
            id: NEXT_ID.fetch_add(1, Ordering::Relaxed),
            resource_revision: 0,
            font,
            images: BTreeMap::new(),
        }
    }

    pub(crate) fn identity(&self) -> (u64, u64) {
        (self.id, self.resource_revision)
    }

    fn bump_resource_revision(&mut self) {
        self.resource_revision = self
            .resource_revision
            .checked_add(1)
            .expect("paint context revision exhausted");
    }

    /// Typeface offered to text resolution. The value is immutable through a
    /// shared reference so a cache cannot miss an environment change.
    pub fn font(&self) -> Option<&skia_safe::Typeface> {
        self.font.as_ref()
    }

    /// Replace the host typeface and invalidate every cache keyed by this
    /// context. Existing drawlists keep their exact resolved fonts.
    pub fn set_font(&mut self, font: Option<skia_safe::Typeface>) {
        self.font = font;
        self.bump_resource_revision();
    }

    /// Register an already-decoded image under the exact authored resource id.
    pub fn insert_image(&mut self, rid: impl Into<String>, image: Image) {
        let image = image.with_default_mipmaps().unwrap_or(image);
        self.images.insert(rid.into(), image);
        self.bump_resource_revision();
    }

    /// Eagerly decode encoded PNG/JPEG/WebP bytes and register them under `rid`.
    pub fn insert_encoded(&mut self, rid: impl Into<String>, bytes: &[u8]) -> Result<(), String> {
        let rid = rid.into();
        let image = Image::from_encoded(Data::new_copy(bytes))
            .ok_or_else(|| format!("could not decode image resource `{rid}`"))?;
        let image = image
            .make_raster_image(None, CachingHint::Allow)
            .ok_or_else(|| format!("could not decode image resource `{rid}`"))?;
        self.insert_image(rid, image);
        Ok(())
    }

    pub fn contains_image(&self, rid: &str) -> bool {
        self.images.contains_key(rid)
    }

    fn image(&self, rid: &str) -> Option<&Image> {
        self.images.get(rid)
    }
}

impl Default for PaintCtx {
    fn default() -> Self {
        Self::new(None)
    }
}

#[cfg(test)]
mod paint_ctx_tests {
    use super::{sk_paint, PaintBox, PaintCtx};
    use anchor_lab::model::{
        Color as ModelColor, GradientStop, LinearGradientPaint, Paint as ModelPaint,
    };

    #[test]
    fn encoded_resources_are_eager_raster_images() {
        const IMAGE: &[u8] = include_bytes!("../../../fixtures/images/border-diamonds.png");
        let mut ctx = PaintCtx::new(None);
        ctx.insert_encoded("fixture.png", IMAGE).unwrap();
        let image = ctx.image("fixture.png").unwrap();
        assert!(
            !image.is_lazy_generated(),
            "resource registration must finish pixel decode before rendering"
        );
    }

    #[test]
    fn shader_paint_opacity_remains_float_precision() {
        let opacity = 0.123_456_7;
        let gradient = LinearGradientPaint {
            opacity,
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: ModelColor::BLACK,
                },
                GradientStop {
                    offset: 1.0,
                    color: ModelColor(0xFFFF_FFFF),
                },
            ],
            ..Default::default()
        };
        let model = ModelPaint::LinearGradient(gradient);
        let paint = sk_paint(
            &model,
            PaintBox::from_size(10.0, 10.0),
            &PaintCtx::new(None),
        )
        .expect("valid gradient paint");
        assert_eq!(paint.alpha_f().to_bits(), opacity.to_bits());
    }
}

/// Row-major `Affine` -> skia `Matrix`, byte-identical to the spike
/// painter's `skia_matrix` (SVG a b c d e f order).
fn skia_matrix(t: &Affine) -> Matrix {
    Matrix::new_all(t.a, t.c, t.e, t.b, t.d, t.f, 0.0, 0.0, 1.0)
}

fn with_local_transform(canvas: &Canvas, view: &Affine, world: &Affine, draw: impl FnOnce()) {
    let total = view.then(world);
    canvas.save();
    canvas.set_matrix(&skia_matrix(&total).into());
    draw();
    canvas.restore();
}

fn sk_blend_mode(mode: BlendMode) -> skia_safe::BlendMode {
    match mode {
        BlendMode::Normal => skia_safe::BlendMode::SrcOver,
        BlendMode::Multiply => skia_safe::BlendMode::Multiply,
        BlendMode::Screen => skia_safe::BlendMode::Screen,
        BlendMode::Overlay => skia_safe::BlendMode::Overlay,
        BlendMode::Darken => skia_safe::BlendMode::Darken,
        BlendMode::Lighten => skia_safe::BlendMode::Lighten,
        BlendMode::ColorDodge => skia_safe::BlendMode::ColorDodge,
        BlendMode::ColorBurn => skia_safe::BlendMode::ColorBurn,
        BlendMode::HardLight => skia_safe::BlendMode::HardLight,
        BlendMode::SoftLight => skia_safe::BlendMode::SoftLight,
        BlendMode::Difference => skia_safe::BlendMode::Difference,
        BlendMode::Exclusion => skia_safe::BlendMode::Exclusion,
        BlendMode::Hue => skia_safe::BlendMode::Hue,
        BlendMode::Saturation => skia_safe::BlendMode::Saturation,
        BlendMode::Color => skia_safe::BlendMode::Color,
        BlendMode::Luminosity => skia_safe::BlendMode::Luminosity,
    }
}

fn sk_tile_mode(mode: TileMode) -> skia_safe::TileMode {
    match mode {
        TileMode::Clamp => skia_safe::TileMode::Clamp,
        TileMode::Repeated => skia_safe::TileMode::Repeat,
        TileMode::Mirror => skia_safe::TileMode::Mirror,
        TileMode::Decal => skia_safe::TileMode::Decal,
    }
}

fn gradient_stops(stops: &[GradientStop]) -> (Vec<skia_safe::Color4f>, Vec<f32>) {
    let colors = stops
        .iter()
        .map(|stop| skia_safe::Color4f::from(Color::new(stop.color.argb())))
        .collect();
    let positions = stops.iter().map(|stop| stop.offset).collect();
    (colors, positions)
}

fn gradient<'a>(
    colors: &'a [skia_safe::Color4f],
    positions: &'a [f32],
    tile_mode: skia_safe::TileMode,
) -> Gradient<'a> {
    Gradient::new(
        GradientColors::new(colors, Some(positions), tile_mode, None),
        Interpolation::default(),
    )
}

/// Node-local box used by every non-solid paint. A degenerate axis becomes a
/// centered one-pixel interval so line and zero-axis paints retain a stable,
/// finite unit-space mapping.
#[derive(Debug, Clone, Copy)]
struct PaintBox {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

impl PaintBox {
    fn from_size(w: f32, h: f32) -> Self {
        let (x, w) = if w == 0.0 { (-0.5, 1.0) } else { (0.0, w) };
        let (y, h) = if h == 0.0 { (-0.5, 1.0) } else { (0.0, h) };
        PaintBox { x, y, w, h }
    }
}

fn paint_box_matrix(paint_box: PaintBox, transform: &Affine) -> Matrix {
    let mut matrix = Matrix::new_all(
        paint_box.w,
        0.0,
        paint_box.x,
        0.0,
        paint_box.h,
        paint_box.y,
        0.0,
        0.0,
        1.0,
    );
    matrix.pre_concat(&skia_matrix(transform));
    matrix
}

/// Convert the model's centered-normalized gradient point to UV for Skia.
/// The f64 intermediate avoids overflowing or needlessly rounding finite f32
/// model values before the result returns to Skia's f32 coordinate space.
fn alignment_uv(alignment: Alignment) -> (f32, f32) {
    (
        ((f64::from(alignment.0) + 1.0) * 0.5) as f32,
        ((f64::from(alignment.1) + 1.0) * 0.5) as f32,
    )
}

fn linear_gradient_shader(paint: &LinearGradientPaint, paint_box: PaintBox) -> Option<Shader> {
    let (colors, positions) = gradient_stops(&paint.stops);
    let from = alignment_uv(paint.xy1);
    let to = alignment_uv(paint.xy2);
    let stops = gradient(&colors, &positions, sk_tile_mode(paint.tile_mode));
    let matrix = paint_box_matrix(paint_box, &paint.transform);
    shaders::linear_gradient((from, to), &stops, Some(&matrix))
}

fn radial_gradient_shader(paint: &RadialGradientPaint, paint_box: PaintBox) -> Option<Shader> {
    let (colors, positions) = gradient_stops(&paint.stops);
    let stops = gradient(&colors, &positions, sk_tile_mode(paint.tile_mode));
    let matrix = paint_box_matrix(paint_box, &paint.transform);
    shaders::radial_gradient(((0.5, 0.5), 0.5), &stops, Some(&matrix))
}

fn sweep_gradient_shader(paint: &SweepGradientPaint, paint_box: PaintBox) -> Option<Shader> {
    let (colors, positions) = gradient_stops(&paint.stops);
    let stops = gradient(&colors, &positions, skia_safe::TileMode::Clamp);
    let matrix = paint_box_matrix(paint_box, &paint.transform);
    shaders::sweep_gradient((0.5, 0.5), (0.0, 360.0), &stops, Some(&matrix))
}

fn diamond_gradient_shader(paint: &DiamondGradientPaint, paint_box: PaintBox) -> Option<Shader> {
    let (colors, positions) = gradient_stops(&paint.stops);
    let stops = gradient(&colors, &positions, skia_safe::TileMode::Clamp);
    let ramp = shaders::linear_gradient(((0.0, 0.0), (1.0, 0.0)), &stops, None)?;
    const SKSL: &str = r#"
        uniform shader gradient;
        half4 main(float2 coord) {
            float2 p = coord - float2(0.5, 0.5);
            float t = (abs(p.x) + abs(p.y)) * 2.0;
            t = clamp(t, 0.0, 1.0);
            return gradient.eval(float2(t, 0.0));
        }
    "#;
    let effect = skia_safe::RuntimeEffect::make_for_shader(SKSL, None).ok()?;
    let matrix = paint_box_matrix(paint_box, &paint.transform);
    effect.make_shader(Data::new_copy(&[]), &[ramp.into()], Some(&matrix))
}

fn image_fit_matrix(image: &Image, paint_box: PaintBox, fit: BoxFit) -> Matrix {
    let iw = image.width() as f32;
    let ih = image.height() as f32;
    let w = paint_box.w;
    let h = paint_box.h;
    let (sx, sy) = match fit {
        BoxFit::Contain => {
            let scale = (w / iw).min(h / ih);
            (scale, scale)
        }
        BoxFit::Cover => {
            let scale = (w / iw).max(h / ih);
            (scale, scale)
        }
        BoxFit::Fill => (w / iw, h / ih),
        BoxFit::None => (1.0, 1.0),
    };
    let tx = paint_box.x + (w - iw * sx) * 0.5;
    let ty = paint_box.y + (h - ih * sy) * 0.5;
    Matrix::new_all(sx, 0.0, tx, 0.0, sy, ty, 0.0, 0.0, 1.0)
}

fn image_shader(paint: &ImagePaint, paint_box: PaintBox, ctx: &PaintCtx) -> Option<Shader> {
    if paint.quarter_turns != 0
        || paint.alignment != anchor_lab::model::Alignment::CENTER
        || paint.filters != ImageFilters::default()
    {
        return None;
    }
    let ImagePaintFit::Fit(fit) = paint.fit else {
        return None;
    };
    let rid = match &paint.image {
        ResourceRef::Rid(rid) | ResourceRef::Hash(rid) => rid,
    };
    let image = ctx.image(rid)?;
    let matrix = image_fit_matrix(image, paint_box, fit);
    let sampling = SamplingOptions::from(CubicResampler::mitchell());
    let shader = image.to_shader(
        Some((skia_safe::TileMode::Decal, skia_safe::TileMode::Decal)),
        sampling,
        Some(&matrix),
    )?;
    Some(shader)
}

/// Materialize one model paint. The caller draws these in list order instead
/// of precomposing a stack: each entry's blend mode must see the actual canvas
/// result of the paints below it, including the scene backdrop.
fn sk_paint(model: &ModelPaint, paint_box: PaintBox, ctx: &PaintCtx) -> Option<Paint> {
    let mut paint = Paint::default();
    paint.set_anti_alias(true);
    paint.set_blend_mode(sk_blend_mode(model.blend_mode()));
    match model {
        ModelPaint::Solid(solid) => {
            paint.set_color(Color::new(solid.color.argb()));
        }
        ModelPaint::LinearGradient(model) => {
            paint.set_shader(linear_gradient_shader(model, paint_box)?);
        }
        ModelPaint::RadialGradient(model) => {
            paint.set_shader(radial_gradient_shader(model, paint_box)?);
        }
        ModelPaint::SweepGradient(model) => {
            paint.set_shader(sweep_gradient_shader(model, paint_box)?);
        }
        ModelPaint::DiamondGradient(model) => {
            paint.set_shader(diamond_gradient_shader(model, paint_box)?);
        }
        ModelPaint::Image(model) => {
            paint.set_shader(image_shader(model, paint_box, ctx)?);
        }
    }
    // Solids store opacity in their RGBA8 color. Gradient and image opacity
    // remains the model's independent f32 value and must not be quantized into
    // an 8-bit shader mask before stack compositing.
    if !matches!(model, ModelPaint::Solid(_)) {
        paint.set_alpha_f(model.opacity().clamp(0.0, 1.0));
    }
    Some(paint)
}

fn sk_stroke_cap(cap: StrokeCap) -> PaintCap {
    match cap {
        StrokeCap::Butt => PaintCap::Butt,
        StrokeCap::Round => PaintCap::Round,
        StrokeCap::Square => PaintCap::Square,
    }
}

fn sk_stroke_join(join: StrokeJoin) -> PaintJoin {
    match join {
        StrokeJoin::Miter => PaintJoin::Miter,
        StrokeJoin::Round => PaintJoin::Round,
        StrokeJoin::Bevel => PaintJoin::Bevel,
    }
}

/// Normalize an authored dash array to the even-length form Skia requires.
/// Invalid/non-finite or all-zero programmatic values produce no geometry;
/// the XML boundary rejects those values before they reach this stage.
fn normalized_dash_array(values: &[f32]) -> Option<Vec<f32>> {
    if values
        .iter()
        .any(|value| !value.is_finite() || *value < 0.0)
        || values.iter().all(|value| *value == 0.0)
    {
        return None;
    }
    let mut normalized = values.to_vec();
    if normalized.len() % 2 == 1 {
        normalized.extend_from_slice(values);
    }
    Some(normalized)
}

fn uniform_stroke_width(stroke: &Stroke) -> Option<f32> {
    match stroke.width.normalized() {
        StrokeWidth::None => None,
        StrokeWidth::Uniform(width) => Some(width),
        StrokeWidth::Rectangular(_) => None,
    }
}

/// Convert a stroke application into filled geometry so every existing paint
/// variant (including images and gradients) follows the same ordered painter
/// path. Open contours are necessarily centered; inside/outside are defined
/// only for closed outlines.
fn stroke_geometry(source: &Path, stroke: &Stroke) -> Path {
    let Some(width) = uniform_stroke_width(stroke) else {
        return Path::new();
    };
    let align = if source.is_last_contour_closed() {
        stroke.align
    } else {
        StrokeAlign::Center
    };
    let stroke_width = match align {
        StrokeAlign::Center => width,
        StrokeAlign::Inside | StrokeAlign::Outside => width * 2.0,
    };

    let mut path_to_stroke = source.clone();
    if let Some(values) = stroke.dash_array.as_deref() {
        if !values.is_empty() {
            let Some(intervals) = normalized_dash_array(values) else {
                return Path::new();
            };
            let Some(effect) = PathEffect::dash(&intervals, 0.0) else {
                return Path::new();
            };
            let filter_rec = StrokeRec::new(InitStyle::Hairline);
            let Some((dashed, _)) = effect.filter_path(source, &filter_rec, source.bounds()) else {
                return Path::new();
            };
            path_to_stroke = dashed.snapshot();
        }
    }

    let mut record = StrokeRec::new(InitStyle::Hairline);
    record.set_stroke_style(stroke_width, false);
    record.set_stroke_params(
        sk_stroke_cap(stroke.cap),
        sk_stroke_join(stroke.join),
        stroke.miter_limit,
    );
    let mut builder = PathBuilder::new();
    if !record.apply_to_path(&mut builder, &path_to_stroke) {
        return Path::new();
    }
    let outline = builder.snapshot();
    match align {
        StrokeAlign::Center => outline,
        StrokeAlign::Inside => {
            skia_safe::op(&outline, source, PathOp::Intersect).unwrap_or_default()
        }
        StrokeAlign::Outside => {
            skia_safe::op(&outline, source, PathOp::Difference).unwrap_or_default()
        }
    }
}

fn rect_path(w: f32, h: f32) -> Path {
    let mut builder = PathBuilder::new();
    builder.add_rect(Rect::from_wh(w, h), Some(PathDirection::CW), Some(0));
    builder.snapshot()
}

fn ordinary_rrect_path_at(rect: Rect, radius: &RectangularCornerRadius) -> Path {
    let rrect = RRect::new_rect_radii(
        rect,
        &[
            (radius.tl.rx, radius.tl.ry).into(),
            (radius.tr.rx, radius.tr.ry).into(),
            (radius.br.rx, radius.br.ry).into(),
            (radius.bl.rx, radius.bl.ry).into(),
        ],
    );
    // Point 0 is where the top-left curve joins the top edge. Keeping the
    // authored clockwise origin makes dash traversal deterministic.
    Path::rrect_with_start_index(rrect, PathDirection::CW, 0)
}

fn ordinary_rrect_path(w: f32, h: f32, radius: &RectangularCornerRadius) -> Path {
    ordinary_rrect_path_at(Rect::from_wh(w, h), radius)
}

#[derive(Debug, Clone, Copy)]
struct SmoothCornerParams {
    radius: f32,
    extent: f32,
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    bezier_angle: f32,
}

fn smooth_corner_params(radius: f32, smoothing: f32, shortest_side: f32) -> SmoothCornerParams {
    let smoothing = smoothing.clamp(0.0, 1.0);
    let radius = radius.min(shortest_side / 2.0).max(0.0);
    let extent = ((1.0 + smoothing) * radius).min(shortest_side / 2.0);
    let (circle_angle, bezier_angle) = if radius > shortest_side / 4.0 {
        let change = (radius - shortest_side / 4.0) / (shortest_side / 4.0);
        (
            90.0 * (1.0 - smoothing * (1.0 - change)),
            45.0 * smoothing * (1.0 - change),
        )
    } else {
        (90.0 * (1.0 - smoothing), 45.0 * smoothing)
    };

    let bezier_radians = bezier_angle.to_radians();
    let circle_radians = circle_angle.to_radians();
    let tangent = bezier_radians.tan();
    let longest = radius * (bezier_radians / 2.0).tan();
    let arc_chord = (circle_radians / 2.0).sin() * radius * 2.0_f32.sqrt();
    let c = longest * bezier_radians.cos();
    let d = c * tangent;
    let b = ((extent - arc_chord) - (1.0 + tangent) * c) / 3.0;

    SmoothCornerParams {
        radius,
        extent,
        a: 2.0 * b,
        b,
        c,
        d,
        bezier_angle,
    }
}

/// Mirror the production engine's orthogonal smooth-corner construction.
///
/// That construction is circular-only today, so the XML boundary rejects
/// nonzero smoothing when any authored `rx != ry`. The defensive `min` here
/// retains production behavior for programmatically-built documents that do
/// not pass through the XML validator.
fn smooth_rrect_path(w: f32, h: f32, radius: &RectangularCornerRadius, smoothing: f32) -> Path {
    let shortest_side = w.min(h);
    let tl = smooth_corner_params(radius.tl.rx.min(radius.tl.ry), smoothing, shortest_side);
    let tr = smooth_corner_params(radius.tr.rx.min(radius.tr.ry), smoothing, shortest_side);
    let br = smooth_corner_params(radius.br.rx.min(radius.br.ry), smoothing, shortest_side);
    let bl = smooth_corner_params(radius.bl.rx.min(radius.bl.ry), smoothing, shortest_side);
    let mut builder = PathBuilder::new();

    // Start where the top-left curve joins the top edge, then wind clockwise.
    // This preserves the documented dash origin while tracing the same curve
    // as the production path, which starts midway along that top edge.
    builder.move_to((tl.extent.min(w / 2.0), 0.0));
    builder.line_to(((w - tr.extent).max(w / 2.0), 0.0));

    if tr.radius > 0.0 {
        builder.cubic_to(
            (w - (tr.extent - tr.a), 0.0),
            (w - (tr.extent - tr.a - tr.b), 0.0),
            (w - (tr.extent - tr.a - tr.b - tr.c), tr.d),
        );
        builder.arc_to(
            Rect::from_xywh(w - tr.radius * 2.0, 0.0, tr.radius * 2.0, tr.radius * 2.0),
            270.0 + tr.bezier_angle,
            90.0 - 2.0 * tr.bezier_angle,
            false,
        );
        builder.cubic_to(
            (w, tr.extent - tr.a - tr.b),
            (w, tr.extent - tr.a),
            (w, tr.extent.min(h / 2.0)),
        );
    }

    builder.line_to((w, (h - br.extent).max(h / 2.0)));
    if br.radius > 0.0 {
        builder.cubic_to(
            (w, h - (br.extent - br.a)),
            (w, h - (br.extent - br.a - br.b)),
            (w - br.d, h - (br.extent - br.a - br.b - br.c)),
        );
        builder.arc_to(
            Rect::from_xywh(
                w - br.radius * 2.0,
                h - br.radius * 2.0,
                br.radius * 2.0,
                br.radius * 2.0,
            ),
            br.bezier_angle,
            90.0 - 2.0 * br.bezier_angle,
            false,
        );
        builder.cubic_to(
            (w - (br.extent - br.a - br.b), h),
            (w - (br.extent - br.a), h),
            ((w - br.extent).max(w / 2.0), h),
        );
    }

    builder.line_to((bl.extent.min(w / 2.0), h));
    if bl.radius > 0.0 {
        builder.cubic_to(
            (bl.extent - bl.a, h),
            (bl.extent - bl.a - bl.b, h),
            (bl.extent - bl.a - bl.b - bl.c, h - bl.d),
        );
        builder.arc_to(
            Rect::from_xywh(0.0, h - bl.radius * 2.0, bl.radius * 2.0, bl.radius * 2.0),
            90.0 + bl.bezier_angle,
            90.0 - 2.0 * bl.bezier_angle,
            false,
        );
        builder.cubic_to(
            (0.0, h - (bl.extent - bl.a - bl.b)),
            (0.0, h - (bl.extent - bl.a)),
            (0.0, (h - bl.extent).max(h / 2.0)),
        );
    }

    builder.line_to((0.0, tl.extent.min(h / 2.0)));
    if tl.radius > 0.0 {
        builder.cubic_to(
            (0.0, tl.extent - tl.a),
            (0.0, tl.extent - tl.a - tl.b),
            (tl.d, tl.extent - tl.a - tl.b - tl.c),
        );
        builder.arc_to(
            Rect::from_xywh(0.0, 0.0, tl.radius * 2.0, tl.radius * 2.0),
            180.0 + tl.bezier_angle,
            90.0 - 2.0 * tl.bezier_angle,
            false,
        );
        builder.cubic_to(
            (tl.extent - tl.a - tl.b, 0.0),
            (tl.extent - tl.a, 0.0),
            (tl.extent.min(w / 2.0), 0.0),
        );
    }

    builder.close();
    builder.snapshot()
}

fn rounded_rect_path(w: f32, h: f32, radius: &RectangularCornerRadius, smoothing: f32) -> Path {
    if radius.is_zero() {
        rect_path(w, h)
    } else if smoothing == 0.0 {
        ordinary_rrect_path(w, h, radius)
    } else {
        smooth_rrect_path(w, h, radius, smoothing)
    }
}

fn expand_rect_by_widths(rect: Rect, widths: RectangularStrokeWidth, fraction: f32) -> Rect {
    Rect::from_ltrb(
        rect.left - widths.stroke_left_width * fraction,
        rect.top - widths.stroke_top_width * fraction,
        rect.right + widths.stroke_right_width * fraction,
        rect.bottom + widths.stroke_bottom_width * fraction,
    )
}

/// Insets without allowing Skia's `Rect::from_ltrb` normalization to turn an
/// overconsumed inner box inside out. Once either axis is exhausted the inner
/// contour is empty and the ring saturates to its outer contour.
fn inset_rect_by_widths(rect: Rect, widths: RectangularStrokeWidth, fraction: f32) -> Option<Rect> {
    let left = rect.left + widths.stroke_left_width * fraction;
    let top = rect.top + widths.stroke_top_width * fraction;
    let right = rect.right - widths.stroke_right_width * fraction;
    let bottom = rect.bottom - widths.stroke_bottom_width * fraction;
    (left < right && top < bottom).then(|| Rect::from_ltrb(left, top, right, bottom))
}

fn offset_radii_by_widths(
    radius: &RectangularCornerRadius,
    widths: RectangularStrokeWidth,
    fraction: f32,
) -> RectangularCornerRadius {
    let mut adjusted = *radius;
    adjusted.tl.rx = (adjusted.tl.rx + widths.stroke_left_width * fraction).max(0.0);
    adjusted.tl.ry = (adjusted.tl.ry + widths.stroke_top_width * fraction).max(0.0);
    adjusted.tr.rx = (adjusted.tr.rx + widths.stroke_right_width * fraction).max(0.0);
    adjusted.tr.ry = (adjusted.tr.ry + widths.stroke_top_width * fraction).max(0.0);
    adjusted.br.rx = (adjusted.br.rx + widths.stroke_right_width * fraction).max(0.0);
    adjusted.br.ry = (adjusted.br.ry + widths.stroke_bottom_width * fraction).max(0.0);
    adjusted.bl.rx = (adjusted.bl.rx + widths.stroke_left_width * fraction).max(0.0);
    adjusted.bl.ry = (adjusted.bl.ry + widths.stroke_bottom_width * fraction).max(0.0);
    adjusted
}

fn rectangular_stroke_contours(
    w: f32,
    h: f32,
    widths: RectangularStrokeWidth,
    radius: &RectangularCornerRadius,
    align: StrokeAlign,
) -> (Path, Option<Path>) {
    let base = Rect::from_wh(w, h);
    let (outward, inward) = match align {
        StrokeAlign::Inside => (0.0, 1.0),
        StrokeAlign::Center => (0.5, 0.5),
        StrokeAlign::Outside => (1.0, 0.0),
    };
    let outer_rect = expand_rect_by_widths(base, widths, outward);
    let outer_radius = offset_radii_by_widths(radius, widths, outward);
    let outer = ordinary_rrect_path_at(outer_rect, &outer_radius);
    let inner = inset_rect_by_widths(base, widths, inward).map(|inner_rect| {
        let inner_radius = offset_radii_by_widths(radius, widths, -inward);
        ordinary_rrect_path_at(inner_rect, &inner_radius)
    });
    (outer, inner)
}

fn rectangular_stroke_ring(outer: &Path, inner: Option<&Path>) -> Path {
    match inner {
        Some(inner) => skia_safe::op(outer, inner, PathOp::Difference).unwrap_or_default(),
        None => outer.clone(),
    }
}

fn rectangular_stroke_centerline(
    w: f32,
    h: f32,
    widths: RectangularStrokeWidth,
    radius: &RectangularCornerRadius,
    align: StrokeAlign,
) -> Option<Path> {
    let base = Rect::from_wh(w, h);
    let (rect, radius) = match align {
        StrokeAlign::Inside => (
            inset_rect_by_widths(base, widths, 0.5)?,
            offset_radii_by_widths(radius, widths, -0.5),
        ),
        StrokeAlign::Center => (base, *radius),
        StrokeAlign::Outside => (
            expand_rect_by_widths(base, widths, 0.5),
            offset_radii_by_widths(radius, widths, 0.5),
        ),
    };
    Some(ordinary_rrect_path_at(rect, &radius))
}

/// Project Grida's rectangular stroke-width union into one filled ring.
/// Solid strokes use the exact outer-minus-inner ring. Dashed strokes advance
/// once around a shared centerline at the maximum side width, then intersect
/// that outline with the ring so zero/thin sides suppress coverage without
/// resetting dash phase.
fn rectangular_stroke_geometry(
    w: f32,
    h: f32,
    radius: &RectangularCornerRadius,
    widths: RectangularStrokeWidth,
    stroke: &Stroke,
) -> Path {
    if widths.is_none() {
        return Path::new();
    }
    let (outer, inner) = rectangular_stroke_contours(w, h, widths, radius, stroke.align);
    let ring = rectangular_stroke_ring(&outer, inner.as_ref());
    let Some(values) = stroke.dash_array.as_deref() else {
        return ring;
    };
    if values.is_empty() {
        return ring;
    }
    let Some(intervals) = normalized_dash_array(values) else {
        return Path::new();
    };
    let centerline =
        rectangular_stroke_centerline(w, h, widths, radius, stroke.align).unwrap_or(outer);
    let Some(effect) = PathEffect::dash(&intervals, 0.0) else {
        return Path::new();
    };
    let filter_rec = StrokeRec::new(InitStyle::Hairline);
    let Some((dashed, _)) = effect.filter_path(&centerline, &filter_rec, centerline.bounds())
    else {
        return Path::new();
    };
    let mut record = StrokeRec::new(InitStyle::Hairline);
    record.set_stroke_style(widths.max(), false);
    record.set_stroke_params(PaintCap::Butt, PaintJoin::Miter, stroke.miter_limit);
    let mut builder = PathBuilder::new();
    if !record.apply_to_path(&mut builder, &dashed.snapshot()) {
        return Path::new();
    }
    skia_safe::op(&builder.snapshot(), &ring, PathOp::Intersect).unwrap_or_default()
}

fn oval_path(w: f32, h: f32) -> Path {
    let mut builder = PathBuilder::new();
    // Explicit start index keeps dash origin at the rightmost point across
    // Skia versions (the library default changed historically).
    builder.add_oval(Rect::from_wh(w, h), Some(PathDirection::CW), Some(1));
    builder.snapshot()
}

fn line_path(x1: f32, y1: f32, x2: f32, y2: f32) -> Path {
    let mut builder = PathBuilder::new();
    builder.add_line((x1, y1), (x2, y2));
    builder.snapshot()
}

/// Project the already box-mapped, backend-independent command stream into
/// Skia. Resolution performed the only coordinate mapping, so bounds and
/// rasterization consume bit-identical f32 geometry.
fn backend_path(path: &ResolvedPathArtifact) -> Path {
    let fill_type = match path.fill_rule {
        FillRule::NonZero => PathFillType::Winding,
        FillRule::EvenOdd => PathFillType::EvenOdd,
    };
    let mut builder = PathBuilder::new_with_fill_type(fill_type);
    for command in path.commands.iter() {
        match *command {
            PathCommand::MoveTo { x, y } => {
                builder.move_to((x, y));
            }
            PathCommand::LineTo { x, y } => {
                builder.line_to((x, y));
            }
            PathCommand::QuadTo { x1, y1, x, y } => {
                builder.quad_to((x1, y1), (x, y));
            }
            PathCommand::CubicTo {
                x1,
                y1,
                x2,
                y2,
                x,
                y,
            } => {
                builder.cubic_to((x1, y1), (x2, y2), (x, y));
            }
            PathCommand::ConicTo {
                x1,
                y1,
                x,
                y,
                weight,
            } => {
                builder.conic_to((x1, y1), (x, y), weight);
            }
            PathCommand::Close => {
                builder.close();
            }
        }
    }
    builder.snapshot()
}

#[cfg(test)]
mod backend_path_tests {
    use std::sync::Arc;

    use super::backend_path;
    use anchor_lab::path::{analyze, materialize, FillRule};

    #[test]
    fn analytical_arc_bounds_match_the_materialized_conics() {
        let cases = [
            "M .5 0 A .5 .5 0 0 1 1 .5 A .5 .5 0 0 1 .5 1 A .5 .5 0 0 1 0 .5 A .5 .5 0 0 1 .5 0 Z",
            "M .2 .5 A .35 .2 37 0 1 .8 .5",
            "M .2 .2 A .4 .3 25 0 1 .8 .7",
            "M .5 .5 A .000001 .000001 0 0 1 .500001 .500001",
        ];
        for d in cases {
            let artifact = analyze(d, FillRule::NonZero)
                .unwrap_or_else(|error| panic!("arc corpus must be valid: {d}: {error}"));
            let (width, height) = (137.0, 83.0);
            let resolved = materialize(Arc::clone(&artifact), width, height)
                .expect("arc corpus must fit its finite resolved box");
            let actual = backend_path(&resolved).compute_tight_bounds();
            let expected = resolved.local_bounds;
            let epsilon = 2.0e-4;
            assert!(actual.left >= expected.x - epsilon, "{d}: left escaped");
            assert!(actual.top >= expected.y - epsilon, "{d}: top escaped");
            assert!(
                actual.right <= expected.x + expected.w + epsilon,
                "{d}: right escaped"
            );
            assert!(
                actual.bottom <= expected.y + expected.h + epsilon,
                "{d}: bottom escaped"
            );
        }
    }
}

fn draw_stroke(
    canvas: &Canvas,
    source: &Path,
    stroke: &Stroke,
    paint_box: PaintBox,
    ctx: &PaintCtx,
) {
    let geometry = stroke_geometry(source, stroke);
    draw_painted_geometry(canvas, &geometry, &stroke.paints, paint_box, ctx);
}

fn draw_painted_geometry(
    canvas: &Canvas,
    geometry: &Path,
    paints: &Paints,
    paint_box: PaintBox,
    ctx: &PaintCtx,
) {
    if geometry.is_empty() {
        return;
    }
    for model in paints.iter() {
        if let Some(paint) = sk_paint(model, paint_box, ctx) {
            canvas.draw_path(geometry, &paint);
        }
    }
}

fn draw_rectangular_stroke(
    canvas: &Canvas,
    w: f32,
    h: f32,
    radius: &RectangularCornerRadius,
    widths: RectangularStrokeWidth,
    stroke: &Stroke,
    paint_box: PaintBox,
    ctx: &PaintCtx,
) {
    let geometry = rectangular_stroke_geometry(w, h, radius, widths, stroke);
    draw_painted_geometry(canvas, &geometry, &stroke.paints, paint_box, ctx);
}

/// Use Skia's native stroke rasterization for centered strokes. Converting a
/// centered stroke into filled outline geometry is semantically unnecessary
/// and changes edge coverage relative to the native primitive operations.
fn native_stroke_paint(
    model: &ModelPaint,
    stroke: &Stroke,
    paint_box: PaintBox,
    ctx: &PaintCtx,
) -> Option<Paint> {
    let width = uniform_stroke_width(stroke)?;
    let mut paint = sk_paint(model, paint_box, ctx)?;
    paint.set_style(PaintStyle::Stroke);
    paint.set_stroke_width(width);
    paint.set_stroke_cap(sk_stroke_cap(stroke.cap));
    paint.set_stroke_join(sk_stroke_join(stroke.join));
    paint.set_stroke_miter(stroke.miter_limit);
    if let Some(values) = stroke.dash_array.as_deref() {
        if !values.is_empty() {
            let intervals = normalized_dash_array(values)?;
            paint.set_path_effect(PathEffect::dash(&intervals, 0.0)?);
        }
    }
    Some(paint)
}

fn draw_native_centered_stroke(
    stroke: &Stroke,
    paint_box: PaintBox,
    ctx: &PaintCtx,
    mut draw: impl FnMut(&Paint),
) {
    for model in stroke.paints.iter() {
        if let Some(paint) = native_stroke_paint(model, stroke, paint_box, ctx) {
            draw(&paint);
        }
    }
}

#[derive(Default)]
struct GlyphScratch {
    ids: Vec<u16>,
    positions: Vec<Point>,
}

impl GlyphScratch {
    fn with_run(
        &mut self,
        run: &anchor_lab::text_layout::TextGlyphRun,
        list: &DrawList,
        mut use_run: impl FnMut(&Font, &[u16], &[Point]),
    ) {
        self.ids.clear();
        self.positions.clear();
        self.ids.extend(run.glyphs.iter().map(|glyph| glyph.id));
        self.positions
            .extend(run.glyphs.iter().map(|glyph| Point::new(glyph.x, glyph.y)));
        let font = list.text_fonts().font(run.font);
        use_run(&font, &self.ids, &self.positions);
    }
}

fn text_path(
    layout: &anchor_lab::text_layout::TextLayout,
    list: &DrawList,
    scratch: &mut GlyphScratch,
) -> Path {
    let mut builder = PathBuilder::new();
    for run in &layout.glyph_runs {
        scratch.with_run(run, list, |font, glyphs, positions| {
            for (glyph, position) in glyphs.iter().zip(positions) {
                if let Some(path) = font.get_path(*glyph) {
                    let path = path.make_transform(&Matrix::translate((position.x, position.y)));
                    builder.add_path(&path);
                }
            }
        });
    }
    builder.snapshot()
}

/// Replay a [`DrawList`] onto a skia canvas under `view`. Drawing items compose
/// `view.then(&item.world)` and set that matrix absolutely. Balanced scope
/// commands persist across drawing items: opacity opens a backdrop-preserving
/// group layer, while a content clip saves the node-local box outline until
/// `EndClip`.
pub fn execute(canvas: &Canvas, list: &DrawList, view: &Affine, ctx: &PaintCtx) {
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum Scope {
        Opacity,
        Clip,
    }

    let initial_save_count = canvas.save_count();
    let mut scopes = Vec::new();
    let mut glyph_scratch = GlyphScratch::default();
    for item in &list.items {
        match &item.kind {
            ItemKind::BeginOpacity { opacity } => {
                // Copy the current backdrop into the group layer so descendant
                // paint blend modes see the same accumulated result they would
                // see without node opacity. On restore, arithmetic blending
                // computes `opacity * group + (1-opacity) * backdrop` directly
                // in premultiplied space. Plain SrcOver alpha would double a
                // translucent backdrop copied into the source layer.
                let opacity = opacity.clamp(0.0, 1.0);
                let mut restore_paint = Paint::default();
                restore_paint.set_blender(
                    Blender::arithmetic(0.0, opacity, 1.0 - opacity, 0.0, true)
                        .expect("finite opacity produces an arithmetic blender"),
                );
                let layer = SaveLayerRec::default()
                    .paint(&restore_paint)
                    .flags(SaveLayerFlags::INIT_WITH_PREVIOUS);
                canvas.save_layer(&layer);
                scopes.push(Scope::Opacity);
            }
            ItemKind::EndOpacity => {
                let scope = scopes.pop();
                debug_assert_eq!(scope, Some(Scope::Opacity));
                if scope.is_some() {
                    canvas.restore();
                }
            }
            ItemKind::BeginClipRect {
                w,
                h,
                corner_radius,
                corner_smoothing,
            } => {
                let total = view.then(&item.world);
                canvas.save();
                canvas.set_matrix(&skia_matrix(&total).into());
                if corner_radius.is_zero() {
                    canvas.clip_rect(Rect::from_wh(*w, *h), None, false);
                } else {
                    let path = rounded_rect_path(*w, *h, corner_radius, corner_smoothing.value());
                    canvas.clip_path(&path, ClipOp::Intersect, true);
                }
                scopes.push(Scope::Clip);
            }
            ItemKind::EndClip => {
                let scope = scopes.pop();
                debug_assert_eq!(scope, Some(Scope::Clip));
                if scope.is_some() {
                    canvas.restore();
                }
            }
            ItemKind::RectFill {
                w,
                h,
                corner_radius,
                corner_smoothing,
                paints,
            } => {
                with_local_transform(canvas, view, &item.world, || {
                    let paint_box = PaintBox::from_size(*w, *h);
                    if corner_radius.is_zero() {
                        for model in paints.iter() {
                            if let Some(paint) = sk_paint(model, paint_box, ctx) {
                                canvas.draw_rect(Rect::from_wh(*w, *h), &paint);
                            }
                        }
                    } else {
                        let path =
                            rounded_rect_path(*w, *h, corner_radius, corner_smoothing.value());
                        for model in paints.iter() {
                            if let Some(paint) = sk_paint(model, paint_box, ctx) {
                                canvas.draw_path(&path, &paint);
                            }
                        }
                    }
                });
            }
            ItemKind::OvalFill { w, h, paints } => {
                with_local_transform(canvas, view, &item.world, || {
                    let paint_box = PaintBox::from_size(*w, *h);
                    for model in paints.iter() {
                        if let Some(paint) = sk_paint(model, paint_box, ctx) {
                            canvas.draw_oval(Rect::from_wh(*w, *h), &paint);
                        }
                    }
                });
            }
            ItemKind::PathFill { w, h, path, paints } => {
                with_local_transform(canvas, view, &item.world, || {
                    let paint_box = PaintBox::from_size(*w, *h);
                    let geometry = backend_path(path);
                    draw_painted_geometry(canvas, &geometry, paints, paint_box, ctx);
                });
            }
            ItemKind::TextFill {
                layout,
                paints,
                paint_w,
                paint_h,
            } => {
                with_local_transform(canvas, view, &item.world, || {
                    let paint_box = PaintBox::from_size(*paint_w, *paint_h);
                    for run in &layout.glyph_runs {
                        glyph_scratch.with_run(run, list, |font, glyphs, positions| {
                            if let Some(run_paints) = paints.for_source_run(run.source_run) {
                                for model in run_paints.iter() {
                                    if let Some(paint) = sk_paint(model, paint_box, ctx) {
                                        canvas.draw_glyphs_at(
                                            glyphs,
                                            positions,
                                            Point::new(0.0, 0.0),
                                            font,
                                            &paint,
                                        );
                                    }
                                }
                            }
                        });
                    }
                });
            }
            ItemKind::RectStroke {
                w,
                h,
                corner_radius,
                corner_smoothing,
                stroke,
            } => {
                with_local_transform(canvas, view, &item.world, || {
                    let paint_box = PaintBox::from_size(*w, *h);
                    match stroke.width.normalized() {
                        StrokeWidth::None => {}
                        StrokeWidth::Rectangular(widths) => draw_rectangular_stroke(
                            canvas,
                            *w,
                            *h,
                            corner_radius,
                            widths,
                            stroke,
                            paint_box,
                            ctx,
                        ),
                        StrokeWidth::Uniform(_) => {
                            if corner_radius.is_zero() && stroke.align == StrokeAlign::Center {
                                draw_native_centered_stroke(stroke, paint_box, ctx, |paint| {
                                    canvas.draw_rect(Rect::from_wh(*w, *h), paint);
                                });
                            } else {
                                let path = rounded_rect_path(
                                    *w,
                                    *h,
                                    corner_radius,
                                    corner_smoothing.value(),
                                );
                                if stroke.align == StrokeAlign::Center {
                                    draw_native_centered_stroke(stroke, paint_box, ctx, |paint| {
                                        canvas.draw_path(&path, paint);
                                    });
                                } else {
                                    draw_stroke(canvas, &path, stroke, paint_box, ctx);
                                }
                            }
                        }
                    }
                });
            }
            ItemKind::OvalStroke { w, h, stroke } => {
                with_local_transform(canvas, view, &item.world, || {
                    let paint_box = PaintBox::from_size(*w, *h);
                    if stroke.align == StrokeAlign::Center {
                        draw_native_centered_stroke(stroke, paint_box, ctx, |paint| {
                            canvas.draw_oval(Rect::from_wh(*w, *h), paint);
                        });
                    } else {
                        draw_stroke(canvas, &oval_path(*w, *h), stroke, paint_box, ctx);
                    }
                });
            }
            ItemKind::LineStroke {
                x1,
                y1,
                x2,
                y2,
                paint_w,
                paint_h,
                stroke,
            } => {
                with_local_transform(canvas, view, &item.world, || {
                    let paint_box = PaintBox::from_size(*paint_w, *paint_h);
                    if stroke.align == StrokeAlign::Center {
                        draw_native_centered_stroke(stroke, paint_box, ctx, |paint| {
                            canvas.draw_line((*x1, *y1), (*x2, *y2), paint);
                        });
                    } else {
                        draw_stroke(
                            canvas,
                            &line_path(*x1, *y1, *x2, *y2),
                            stroke,
                            paint_box,
                            ctx,
                        );
                    }
                });
            }
            ItemKind::PathStroke { w, h, path, stroke } => {
                with_local_transform(canvas, view, &item.world, || {
                    let paint_box = PaintBox::from_size(*w, *h);
                    let geometry = backend_path(path);
                    if stroke.align == StrokeAlign::Center {
                        draw_native_centered_stroke(stroke, paint_box, ctx, |paint| {
                            canvas.draw_path(&geometry, paint);
                        });
                    } else {
                        draw_stroke(canvas, &geometry, stroke, paint_box, ctx);
                    }
                });
            }
            ItemKind::TextStroke {
                layout,
                paint_w,
                paint_h,
                stroke,
            } => {
                with_local_transform(canvas, view, &item.world, || {
                    let paint_box = PaintBox::from_size(*paint_w, *paint_h);
                    if stroke.align == StrokeAlign::Center {
                        draw_native_centered_stroke(stroke, paint_box, ctx, |paint| {
                            for run in &layout.glyph_runs {
                                glyph_scratch.with_run(run, list, |font, glyphs, positions| {
                                    canvas.draw_glyphs_at(
                                        glyphs,
                                        positions,
                                        Point::new(0.0, 0.0),
                                        font,
                                        paint,
                                    );
                                });
                            }
                        });
                    } else {
                        let source = text_path(layout, list, &mut glyph_scratch);
                        draw_stroke(canvas, &source, stroke, paint_box, ctx);
                    }
                });
            }
        }
    }
    debug_assert!(scopes.is_empty(), "unclosed drawlist scopes: {scopes:?}");
    debug_assert_eq!(canvas.save_count(), initial_save_count);
    // Protect host state even if a hand-authored DrawList violates the internal
    // balancing invariant in a release build.
    canvas.restore_to_count(initial_save_count);
}

/// Render a drawlist to a fresh raster surface and return its premultiplied
/// pixel bytes — the reference for differential pixel tests (`gate_diff` L2).
/// Bytes, NOT PNG: the encoder is not the system under test, and byte
/// equality is exact (ENG-0.3), not a tolerance. `font: None` in the gate
/// removes font-availability nondeterminism.
pub fn raster_to_bytes(list: &DrawList, view: &Affine, w: i32, h: i32, ctx: &PaintCtx) -> Vec<u8> {
    let mut surface = skia_safe::surfaces::raster_n32_premul((w, h)).expect("raster surface");
    let canvas = surface.canvas();
    canvas.clear(Color::WHITE);
    execute(canvas, list, view, ctx);
    read_pixels(&mut surface, w, h)
}

/// Read a raster surface's premultiplied N32 pixels into a byte buffer.
pub fn read_pixels(surface: &mut skia_safe::Surface, w: i32, h: i32) -> Vec<u8> {
    let info = ImageInfo::new_n32_premul((w, h), None);
    let row_bytes = (w * 4) as usize;
    let mut buf = vec![0u8; row_bytes * h as usize];
    let ok = surface.read_pixels(&info, &mut buf, row_bytes, (0, 0));
    assert!(ok, "read_pixels failed");
    buf
}
