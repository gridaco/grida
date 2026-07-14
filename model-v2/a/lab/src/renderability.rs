//! Pure capability validation for model states consumed by the proving
//! renderer.
//!
//! Source writing and immutable effective values share this fence. It rejects
//! model states that either consumer would otherwise silently narrow or drop;
//! source-only spelling restrictions remain at the source boundary.

use crate::math::Affine;
use crate::model::*;
use crate::path::PathGeometry;

fn payload_name(payload: &Payload) -> &'static str {
    match payload {
        Payload::Frame { .. } => "container",
        Payload::Shape {
            desc: ShapeDesc::Rect,
        } => "rect",
        Payload::Shape {
            desc: ShapeDesc::Ellipse,
        } => "ellipse",
        Payload::Shape {
            desc: ShapeDesc::Line,
        } => "line",
        Payload::Shape {
            desc: ShapeDesc::Path(_),
        } => "path",
        Payload::Text { .. } | Payload::AttributedText { .. } => "text",
        Payload::Group => "group",
        Payload::Lens { .. } => "lens",
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderabilityError(String);

impl RenderabilityError {
    fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }

    pub fn message(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for RenderabilityError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for RenderabilityError {}

/// Validate the complete geometry tuple consumed by resolution. This is a
/// whole-state rule: no individual X/Y/size/aspect value can establish these
/// invariants without seeing its related fields.
pub fn validate_geometry(header: &Header, payload: &Payload) -> Result<(), RenderabilityError> {
    if matches!(
        payload,
        Payload::Shape {
            desc: ShapeDesc::Line
        }
    ) {
        if matches!(header.y, AxisBinding::Span { .. }) {
            return Err(RenderabilityError::new("<line> must not declare a y Span"));
        }
        if header.height != SizeIntent::Fixed(0.0) {
            return Err(RenderabilityError::new("<line> height is locked to zero"));
        }
        if header.min_height.is_some() || header.max_height.is_some() {
            return Err(RenderabilityError::new(
                "<line> must not declare min-height/max-height",
            ));
        }
        if header.aspect_ratio.is_some() {
            return Err(RenderabilityError::new(
                "<line> must not declare aspect-ratio",
            ));
        }
    }
    if matches!(header.x, AxisBinding::Span { .. })
        && (matches!(header.width, SizeIntent::Fixed(_))
            || header.min_width.is_some()
            || header.max_width.is_some())
    {
        return Err(RenderabilityError::new(
            "a span x binding cannot also declare width/min-width/max-width",
        ));
    }
    if matches!(header.y, AxisBinding::Span { .. })
        && (matches!(header.height, SizeIntent::Fixed(_))
            || header.min_height.is_some()
            || header.max_height.is_some())
    {
        return Err(RenderabilityError::new(
            "a span y binding cannot also declare height/min-height/max-height",
        ));
    }

    if payload.box_is_derived() {
        if !matches!(header.width, SizeIntent::Auto)
            || !matches!(header.height, SizeIntent::Auto)
            || header.min_width.is_some()
            || header.max_width.is_some()
            || header.min_height.is_some()
            || header.max_height.is_some()
            || header.aspect_ratio.is_some()
        {
            return Err(RenderabilityError::new(
                "a derived box cannot carry size constraints or aspect-ratio",
            ));
        }
        if matches!(header.x, AxisBinding::Span { .. })
            || matches!(header.y, AxisBinding::Span { .. })
        {
            return Err(RenderabilityError::new(
                "a derived origin cannot use Span bindings",
            ));
        }
        return Ok(());
    }

    let has_aspect = match header.aspect_ratio {
        None => false,
        Some((width, height))
            if width.is_finite() && height.is_finite() && width > 0.0 && height > 0.0 =>
        {
            true
        }
        Some(_) => {
            return Err(RenderabilityError::new(
                "aspect-ratio terms must be finite and greater than zero",
            ));
        }
    };
    let width_supplied = matches!(header.width, SizeIntent::Fixed(_))
        || matches!(header.x, AxisBinding::Span { .. });
    let height_supplied = matches!(header.height, SizeIntent::Fixed(_))
        || matches!(header.y, AxisBinding::Span { .. });

    match payload {
        Payload::Shape {
            desc: ShapeDesc::Rect | ShapeDesc::Ellipse,
        } => {
            if !matches!(
                (width_supplied, height_supplied, has_aspect),
                (true, true, false) | (true, false, true) | (false, true, true)
            ) {
                return Err(RenderabilityError::new(
                    "<rect> and <ellipse> require both axes supplied by a fixed size or Span, or exactly one supplied axis plus aspect-ratio",
                ));
            }
        }
        Payload::Shape {
            desc: ShapeDesc::Path(_),
        } => {
            if !matches!(
                (width_supplied, height_supplied, has_aspect),
                (true, true, false) | (true, false, true) | (false, true, true)
            ) {
                return Err(RenderabilityError::new(
                    "<path> requires both axes supplied by a fixed size or Span, or exactly one supplied axis plus aspect-ratio",
                ));
            }
        }
        Payload::Shape {
            desc: ShapeDesc::Line,
        } => {
            if !width_supplied {
                return Err(RenderabilityError::new(
                    "<line> requires a fixed width or x Span",
                ));
            }
        }
        Payload::Frame { .. } | Payload::Text { .. } | Payload::AttributedText { .. } => {
            if has_aspect {
                return Err(RenderabilityError::new(
                    "aspect-ratio is only valid on <rect>, <ellipse>, or <path>",
                ));
            }
        }
        Payload::Group | Payload::Lens { .. } => unreachable!("handled above"),
    }
    Ok(())
}

fn validate_opacity(opacity: f32, tag: &str) -> Result<(), RenderabilityError> {
    if !opacity.is_finite() || !(0.0..=1.0).contains(&opacity) {
        return Err(RenderabilityError::new(format!(
            "<{tag}> opacity must be finite and between 0 and 1"
        )));
    }
    Ok(())
}

fn validate_affine(transform: Affine, tag: &str) -> Result<(), RenderabilityError> {
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
        return Err(RenderabilityError::new(format!(
            "<{tag}> transform must contain only finite numbers"
        )));
    }

    // Skia's gradient factories reject a local matrix when it cannot be
    // inverted. The renderer composes this authored transform with the
    // resolved paint box before constructing the shader, so Skia's numerical
    // conditioning cutoff is box-dependent and does not belong at this pure
    // paint boundary. Exact singularity of the authored linear part is the
    // invariant case: multiplying by any non-degenerate paint box cannot make
    // it invertible. Evaluate the determinant in f64 so finite f32 products do
    // not overflow or underflow before the comparison.
    let determinant = f64::from(transform.a) * f64::from(transform.d)
        - f64::from(transform.b) * f64::from(transform.c);
    if !determinant.is_finite() || determinant == 0.0 {
        return Err(RenderabilityError::new(format!(
            "<{tag}> transform must be invertible"
        )));
    }
    Ok(())
}

/// Linear gradients at or below this unit-space length become a
/// backend-selected degenerate shader/fallback in the pinned Skia backend
/// instead of preserving a linear ramp. Draft 0 rejects that implicit
/// narrowing.
pub const LINEAR_GRADIENT_DEGENERATE_THRESHOLD: f32 = 1.0 / (1 << 15) as f32;

/// Reproduce Skia's f32 `SkPoint::Length` path. In particular, endpoint
/// subtraction and the ordinary squared length happen in f32; only an
/// overflowing squared length is retried in f64.
fn skia_point_length(dx: f32, dy: f32) -> f32 {
    let squared = dx * dx + dy * dy;
    if squared.is_finite() {
        squared.sqrt()
    } else {
        let dx = f64::from(dx);
        let dy = f64::from(dy);
        (dx * dx + dy * dy).sqrt() as f32
    }
}

fn alignment_uv_component(value: f32) -> f32 {
    ((f64::from(value) + 1.0) * 0.5) as f32
}

fn validate_linear_gradient_endpoints(
    from: Alignment,
    to: Alignment,
) -> Result<(), RenderabilityError> {
    if !from.0.is_finite() || !from.1.is_finite() || !to.0.is_finite() || !to.1.is_finite() {
        return Err(RenderabilityError::new(
            "<gradient kind=\"linear\"> endpoints must be finite",
        ));
    }

    // Match the renderer's centered-alignment -> UV lowering before applying
    // Skia's endpoint test. Distinct model values can quantize to the same f32
    // UV coordinate, so comparing `Alignment` values is insufficient.
    let from = (
        alignment_uv_component(from.0),
        alignment_uv_component(from.1),
    );
    let to = (alignment_uv_component(to.0), alignment_uv_component(to.1));
    let distance = skia_point_length(to.0 - from.0, to.1 - from.1);
    if !distance.is_finite() {
        return Err(RenderabilityError::new(
            "<gradient kind=\"linear\"> endpoint distance must be finite in unit space",
        ));
    }
    if distance <= LINEAR_GRADIENT_DEGENERATE_THRESHOLD {
        return Err(RenderabilityError::new(format!(
            "<gradient kind=\"linear\"> endpoints must be farther apart than {} in unit space",
            LINEAR_GRADIENT_DEGENERATE_THRESHOLD
        )));
    }
    Ok(())
}

fn validate_gradient_stops(stops: &[GradientStop], tag: &str) -> Result<(), RenderabilityError> {
    if stops.len() < 2 {
        return Err(RenderabilityError::new(format!(
            "<{tag}> requires at least two stops"
        )));
    }
    let mut previous = None;
    for stop in stops {
        if !stop.offset.is_finite() || !(0.0..=1.0).contains(&stop.offset) {
            return Err(RenderabilityError::new(format!(
                "<{tag}> stop offset must be finite and between 0 and 1"
            )));
        }
        if previous.is_some_and(|offset| stop.offset < offset) {
            return Err(RenderabilityError::new(format!(
                "<{tag}> stop offsets must be nondecreasing"
            )));
        }
        previous = Some(stop.offset);
    }
    Ok(())
}

pub fn validate_paint(paint: &Paint) -> Result<(), RenderabilityError> {
    match paint {
        Paint::Solid(_) => Ok(()),
        Paint::LinearGradient(gradient) => {
            validate_opacity(gradient.opacity, "gradient")?;
            validate_affine(gradient.transform, "gradient")?;
            validate_gradient_stops(&gradient.stops, "gradient")?;
            validate_linear_gradient_endpoints(gradient.xy1, gradient.xy2)
        }
        Paint::RadialGradient(gradient) => {
            validate_opacity(gradient.opacity, "gradient")?;
            validate_affine(gradient.transform, "gradient")?;
            validate_gradient_stops(&gradient.stops, "gradient")
        }
        Paint::SweepGradient(gradient) => {
            validate_opacity(gradient.opacity, "gradient")?;
            validate_affine(gradient.transform, "gradient")?;
            validate_gradient_stops(&gradient.stops, "gradient")
        }
        Paint::DiamondGradient(gradient) => {
            validate_opacity(gradient.opacity, "gradient")?;
            validate_affine(gradient.transform, "gradient")?;
            validate_gradient_stops(&gradient.stops, "gradient")
        }
        Paint::Image(image) => {
            validate_opacity(image.opacity, "image")?;
            let resource = match &image.image {
                ResourceRef::Hash(value) | ResourceRef::Rid(value) => value,
            };
            if resource.trim().is_empty() {
                return Err(RenderabilityError::new(
                    "<image> resource must not be empty",
                ));
            }
            if image.quarter_turns != 0 {
                return Err(RenderabilityError::new(
                    "the proving renderer does not support image quarter-turns",
                ));
            }
            if image.alignment != Alignment::CENTER {
                return Err(RenderabilityError::new(
                    "the proving renderer does not support non-centered image alignment",
                ));
            }
            if image.filters != ImageFilters::default() {
                return Err(RenderabilityError::new(
                    "the proving renderer does not support image filters",
                ));
            }
            match image.fit {
                ImagePaintFit::Fit(_) => {}
                ImagePaintFit::Transform(_) => {
                    return Err(RenderabilityError::new(
                        "the proving renderer does not support transformed image fit",
                    ));
                }
                ImagePaintFit::Tile(_) => {
                    return Err(RenderabilityError::new(
                        "the proving renderer does not support tiled image fit",
                    ));
                }
            }
            Ok(())
        }
    }
}

pub fn validate_paints(paints: &Paints) -> Result<(), RenderabilityError> {
    for paint in paints.iter() {
        validate_paint(paint)?;
    }
    Ok(())
}

pub fn validate_smooth_corner_radii(
    corner_radius: RectangularCornerRadius,
    corner_smoothing: CornerSmoothing,
) -> Result<(), RenderabilityError> {
    if !corner_smoothing.is_zero() && !corner_radius.is_circular() {
        Err(RenderabilityError::new(
            "the proving renderer requires circular corner radii (rx must equal ry) when corner-smoothing is nonzero",
        ))
    } else {
        Ok(())
    }
}

pub fn validate_stroke(
    stroke: &Stroke,
    payload: &Payload,
    corner_smoothing: CornerSmoothing,
) -> Result<(), RenderabilityError> {
    validate_stroke_impl(stroke, payload, corner_smoothing, None)
}

/// Validate a stroke against an effective path value while retaining the
/// authored payload for every non-geometric path property.
pub(crate) fn validate_stroke_with_path_geometry(
    stroke: &Stroke,
    payload: &Payload,
    corner_smoothing: CornerSmoothing,
    path_geometry: &PathGeometry,
) -> Result<(), RenderabilityError> {
    validate_stroke_impl(stroke, payload, corner_smoothing, Some(path_geometry))
}

fn validate_stroke_impl(
    stroke: &Stroke,
    payload: &Payload,
    corner_smoothing: CornerSmoothing,
    path_geometry: Option<&PathGeometry>,
) -> Result<(), RenderabilityError> {
    validate_stroke_value(stroke)?;
    let default = Stroke::default_for(payload).ok_or_else(|| {
        RenderabilityError::new(format!("<{}> cannot carry strokes", payload_name(payload)))
    })?;

    match payload {
        Payload::Shape {
            desc: ShapeDesc::Line,
        } => {
            if stroke.align != StrokeAlign::Center {
                return Err(RenderabilityError::new(
                    "a <line> stroke must use align=\"center\"",
                ));
            }
            if stroke.join != default.join || stroke.miter_limit != default.miter_limit {
                return Err(RenderabilityError::new(
                    "a <line> stroke cannot carry join or miter-limit state",
                ));
            }
        }
        Payload::Frame { .. }
        | Payload::Shape {
            desc: ShapeDesc::Rect,
        } => {
            if stroke.cap != default.cap {
                return Err(RenderabilityError::new(
                    "a container/rect stroke cannot carry cap state",
                ));
            }
        }
        Payload::Shape {
            desc: ShapeDesc::Ellipse,
        } => {
            if stroke.cap != default.cap
                || stroke.join != default.join
                || stroke.miter_limit != default.miter_limit
            {
                return Err(RenderabilityError::new(
                    "an ellipse stroke cannot carry cap, join, or miter-limit state",
                ));
            }
        }
        Payload::Shape {
            desc: ShapeDesc::Path(path),
        } => {
            let all_contours_closed = path_geometry
                .map_or(path.geometry().all_contours_closed, |path| {
                    path.all_contours_closed
                });
            if !all_contours_closed && stroke.align != StrokeAlign::Center {
                return Err(RenderabilityError::new(
                    "a <path> stroke may use inside/outside alignment only when every drawable contour is explicitly closed",
                ));
            }
        }
        Payload::Text { .. } | Payload::AttributedText { .. } => {
            if stroke.cap != default.cap
                || stroke.join != default.join
                || stroke.miter_limit != default.miter_limit
                || stroke.dash_array.is_some()
            {
                return Err(RenderabilityError::new(
                    "a text stroke cannot carry cap, join, miter-limit, or dash-array state",
                ));
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
            return Err(RenderabilityError::new(format!(
                "<{}> cannot carry per-side stroke width",
                payload_name(payload)
            )));
        }
        if !corner_smoothing.is_zero() {
            return Err(RenderabilityError::new(
                "the proving renderer requires corner-smoothing=\"0\" for per-side stroke width",
            ));
        }
        if stroke.join != default.join || stroke.miter_limit != default.miter_limit {
            return Err(RenderabilityError::new(
                "the proving renderer requires the default join=\"miter\" and miter-limit=\"4\" for per-side stroke width",
            ));
        }
    }
    Ok(())
}

/// Validate fields that are intrinsic to a stroke, independent of the
/// geometry that will carry it. Payload-specific alignment and topology rules
/// are checked by [`validate_stroke`] against the complete effective state.
pub(crate) fn validate_stroke_value(stroke: &Stroke) -> Result<(), RenderabilityError> {
    validate_paints(&stroke.paints)?;
    match stroke.width {
        StrokeWidth::None => {}
        StrokeWidth::Uniform(width) => {
            if !width.is_finite() || width < 0.0 {
                return Err(RenderabilityError::new(
                    "<stroke> width must be finite and non-negative",
                ));
            }
        }
        StrokeWidth::Rectangular(widths) => {
            for (side, width) in ["top", "right", "bottom", "left"]
                .into_iter()
                .zip(widths.values())
            {
                if !width.is_finite() || width < 0.0 {
                    return Err(RenderabilityError::new(format!(
                        "<stroke> width {side} must be finite and non-negative"
                    )));
                }
            }
        }
    }
    if !stroke.miter_limit.is_finite() || stroke.miter_limit <= 0.0 {
        return Err(RenderabilityError::new(
            "<stroke> miter-limit must be finite and positive",
        ));
    }
    if let Some(values) = &stroke.dash_array {
        if values.is_empty()
            || values
                .iter()
                .any(|value| !value.is_finite() || *value < 0.0)
            || values.iter().all(|value| *value == 0.0)
        {
            return Err(RenderabilityError::new(
                "<stroke> dash-array must contain non-negative finite values and not be all zero",
            ));
        }
    }

    Ok(())
}
