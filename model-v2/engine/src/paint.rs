//! ENG-2.1 · the paint executor — the ONLY module that touches skia
//! (containment rule S-1; a later core/paint crate split is then
//! mechanical). `execute(canvas, drawlist, view, ctx)` (step 6) replays a
//! [`DrawList`](crate::drawlist::DrawList) onto a skia `Canvas`,
//! composing `view.then(&item.world)` per item in the exact mathematical
//! form the current spike painter uses — pixel identity is a property of
//! doing the same float ops in the same order, not a tolerance.

use std::collections::BTreeMap;

use anchor_lab::math::Affine;
use anchor_lab::model::{
    Alignment, BlendMode, BoxFit, DiamondGradientPaint, GradientStop, ImageFilters, ImagePaint,
    ImagePaintFit, LinearGradientPaint, Paint as ModelPaint, RadialGradientPaint, ResourceRef,
    Stroke, StrokeAlign, StrokeCap, StrokeJoin, SweepGradientPaint, TileMode,
};
use skia_safe::canvas::{SaveLayerFlags, SaveLayerRec};
use skia_safe::gradient_shader::{Gradient, GradientColors, Interpolation};
use skia_safe::{
    image::CachingHint, path_effect::PathEffect, shaders, stroke_rec::InitStyle, Blender, Canvas,
    Color, CubicResampler, Data, Font, Image, ImageInfo, Matrix, Paint, PaintCap, PaintJoin,
    PaintStyle, Path, PathBuilder, PathDirection, PathOp, Rect, SamplingOptions, Shader, StrokeRec,
};

use crate::drawlist::{DrawList, ItemKind, TextLine};

/// Host-supplied paint state the pure drawlist does not carry: resolved fonts
/// and decoded image resources. Images are keyed by the authored RID so path
/// resolution remains a host concern and the drawlist stays I/O-free.
#[derive(Default)]
pub struct PaintCtx {
    pub font: Option<skia_safe::Typeface>,
    images: BTreeMap<String, Image>,
}

impl PaintCtx {
    pub fn new(font: Option<skia_safe::Typeface>) -> Self {
        Self {
            font,
            images: BTreeMap::new(),
        }
    }

    /// Register an already-decoded image under the exact authored resource id.
    pub fn insert_image(&mut self, rid: impl Into<String>, image: Image) {
        let image = image.with_default_mipmaps().unwrap_or(image);
        self.images.insert(rid.into(), image);
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

/// Convert a stroke application into filled geometry so every existing paint
/// variant (including images and gradients) follows the same ordered painter
/// path. Open contours are necessarily centered; inside/outside are defined
/// only for closed outlines.
fn stroke_geometry(source: &Path, stroke: &Stroke) -> Path {
    let align = if source.is_last_contour_closed() {
        stroke.align
    } else {
        StrokeAlign::Center
    };
    let stroke_width = match align {
        StrokeAlign::Center => stroke.width,
        StrokeAlign::Inside | StrokeAlign::Outside => stroke.width * 2.0,
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

fn draw_stroke(
    canvas: &Canvas,
    source: &Path,
    stroke: &Stroke,
    paint_box: PaintBox,
    ctx: &PaintCtx,
) {
    let geometry = stroke_geometry(source, stroke);
    if geometry.is_empty() {
        return;
    }
    for model in stroke.paints.iter() {
        if let Some(paint) = sk_paint(model, paint_box, ctx) {
            canvas.draw_path(&geometry, &paint);
        }
    }
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
    let mut paint = sk_paint(model, paint_box, ctx)?;
    paint.set_style(PaintStyle::Stroke);
    paint.set_stroke_width(stroke.width);
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

fn text_path(lines: &[TextLine], font: &Font) -> Path {
    let mut builder = PathBuilder::new();
    for line in lines {
        let path = Path::from_str(line.text.as_str(), (0.0, line.baseline_y), font);
        builder.add_path(&path);
    }
    builder.snapshot()
}

/// Replay a [`DrawList`] onto a skia canvas under `view`. Drawing items compose
/// `view.then(&item.world)` and set that matrix absolutely. Balanced scope
/// commands persist across drawing items: opacity opens a backdrop-preserving
/// group layer, while a content clip saves the node-local rectangular clip
/// until `EndClip`.
pub fn execute(canvas: &Canvas, list: &DrawList, view: &Affine, ctx: &PaintCtx) {
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum Scope {
        Opacity,
        Clip,
    }

    let initial_save_count = canvas.save_count();
    let mut scopes = Vec::new();
    for item in &list.items {
        let total = view.then(&item.world);
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
            ItemKind::BeginClipRect { w, h } => {
                canvas.save();
                canvas.set_matrix(&skia_matrix(&total).into());
                canvas.clip_rect(Rect::from_wh(*w, *h), None, false);
                scopes.push(Scope::Clip);
            }
            ItemKind::EndClip => {
                let scope = scopes.pop();
                debug_assert_eq!(scope, Some(Scope::Clip));
                if scope.is_some() {
                    canvas.restore();
                }
            }
            ItemKind::RectFill { w, h, paints } => {
                canvas.save();
                canvas.set_matrix(&skia_matrix(&total).into());
                let paint_box = PaintBox::from_size(*w, *h);
                for model in paints.iter() {
                    if let Some(paint) = sk_paint(model, paint_box, ctx) {
                        canvas.draw_rect(Rect::from_wh(*w, *h), &paint);
                    }
                }
                canvas.restore();
            }
            ItemKind::OvalFill { w, h, paints } => {
                canvas.save();
                canvas.set_matrix(&skia_matrix(&total).into());
                let paint_box = PaintBox::from_size(*w, *h);
                for model in paints.iter() {
                    if let Some(paint) = sk_paint(model, paint_box, ctx) {
                        canvas.draw_oval(Rect::from_wh(*w, *h), &paint);
                    }
                }
                canvas.restore();
            }
            ItemKind::TextFill {
                lines,
                font_size,
                paint_w,
                paint_h,
                paints,
            } => {
                canvas.save();
                canvas.set_matrix(&skia_matrix(&total).into());
                if let Some(tf) = &ctx.font {
                    let font = Font::new(tf.clone(), *font_size);
                    let paint_box = PaintBox::from_size(*paint_w, *paint_h);
                    for model in paints.iter() {
                        if let Some(paint) = sk_paint(model, paint_box, ctx) {
                            for line in lines.iter() {
                                canvas.draw_str(
                                    line.text.as_str(),
                                    (0.0, line.baseline_y),
                                    &font,
                                    &paint,
                                );
                            }
                        }
                    }
                }
                canvas.restore();
            }
            ItemKind::RectStroke { w, h, stroke } => {
                canvas.save();
                canvas.set_matrix(&skia_matrix(&total).into());
                let paint_box = PaintBox::from_size(*w, *h);
                if stroke.align == StrokeAlign::Center {
                    draw_native_centered_stroke(stroke, paint_box, ctx, |paint| {
                        canvas.draw_rect(Rect::from_wh(*w, *h), paint);
                    });
                } else {
                    draw_stroke(canvas, &rect_path(*w, *h), stroke, paint_box, ctx);
                }
                canvas.restore();
            }
            ItemKind::OvalStroke { w, h, stroke } => {
                canvas.save();
                canvas.set_matrix(&skia_matrix(&total).into());
                let paint_box = PaintBox::from_size(*w, *h);
                if stroke.align == StrokeAlign::Center {
                    draw_native_centered_stroke(stroke, paint_box, ctx, |paint| {
                        canvas.draw_oval(Rect::from_wh(*w, *h), paint);
                    });
                } else {
                    draw_stroke(canvas, &oval_path(*w, *h), stroke, paint_box, ctx);
                }
                canvas.restore();
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
                canvas.save();
                canvas.set_matrix(&skia_matrix(&total).into());
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
                canvas.restore();
            }
            ItemKind::TextStroke {
                lines,
                font_size,
                paint_w,
                paint_h,
                stroke,
            } => {
                canvas.save();
                canvas.set_matrix(&skia_matrix(&total).into());
                if let Some(tf) = &ctx.font {
                    let font = Font::new(tf.clone(), *font_size);
                    let paint_box = PaintBox::from_size(*paint_w, *paint_h);
                    if stroke.align == StrokeAlign::Center {
                        draw_native_centered_stroke(stroke, paint_box, ctx, |paint| {
                            for line in lines.iter() {
                                canvas.draw_str(
                                    line.text.as_str(),
                                    (0.0, line.baseline_y),
                                    &font,
                                    paint,
                                );
                            }
                        });
                    } else {
                        let source = text_path(lines, &font);
                        draw_stroke(canvas, &source, stroke, paint_box, ctx);
                    }
                }
                canvas.restore();
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
