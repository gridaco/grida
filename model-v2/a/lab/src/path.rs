//! Backend-independent SVG path analysis for boxed unit-reference paths.
//!
//! Authored `d` remains the inspectable source value. Analysis happens once
//! at the model boundary and produces absolute move/line/quad/cubic/rational-
//! conic commands that every later internal consumer can share. SVG arcs are
//! lowered once to at most four exact rational quadratics, quantized once to
//! the same f32 values consumed by bounds and raster materialization.

use std::fmt;
use std::sync::Arc;

use kurbo::{CubicBez, Line, Point, QuadBez, Rect, Shape as _};
use svgtypes::{PathParser, PathSegment};

use crate::math::RectF;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum FillRule {
    #[default]
    NonZero,
    EvenOdd,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PathCommand {
    MoveTo {
        x: f32,
        y: f32,
    },
    LineTo {
        x: f32,
        y: f32,
    },
    QuadTo {
        x1: f32,
        y1: f32,
        x: f32,
        y: f32,
    },
    CubicTo {
        x1: f32,
        y1: f32,
        x2: f32,
        y2: f32,
        x: f32,
        y: f32,
    },
    ConicTo {
        x1: f32,
        y1: f32,
        x: f32,
        y: f32,
        weight: f32,
    },
    Close,
}

/// One validated path parse, shared verbatim by resolution and rendering.
#[derive(Debug, Clone)]
pub struct PathArtifact {
    pub d: Arc<str>,
    pub commands: Arc<[PathCommand]>,
    pub fill_rule: FillRule,
    pub unit_bounds: RectF,
    pub all_contours_closed: bool,
}

impl PartialEq for PathArtifact {
    fn eq(&self, other: &Self) -> bool {
        self.d == other.d
            && self.commands == other.commands
            && self.fill_rule == other.fill_rule
            && self.unit_bounds == other.unit_bounds
            && self.all_contours_closed == other.all_contours_closed
    }
}

impl PathArtifact {
    /// Equality of everything that can change rendered path geometry. The
    /// authored `d` spelling is deliberately excluded: relative commands and
    /// whitespace-only rewrites that normalize to the same absolute commands
    /// are not visual damage.
    pub fn same_visual_geometry(&self, other: &Self) -> bool {
        self.commands == other.commands
            && self.fill_rule == other.fill_rule
            && self.unit_bounds == other.unit_bounds
            && self.all_contours_closed == other.all_contours_closed
    }
}

/// The one box-mapped command stream consumed by resolved bounds, damage,
/// drawlist construction, and raster materialization. Every coordinate has
/// already undergone the exact f32 multiply by the resolved width/height.
#[derive(Debug, Clone)]
pub struct ResolvedPathArtifact {
    pub source: Arc<PathArtifact>,
    pub commands: Arc<[PathCommand]>,
    pub fill_rule: FillRule,
    pub local_bounds: RectF,
    pub all_contours_closed: bool,
}

impl PartialEq for ResolvedPathArtifact {
    fn eq(&self, other: &Self) -> bool {
        self.commands == other.commands
            && self.fill_rule == other.fill_rule
            && self.local_bounds == other.local_bounds
            && self.all_contours_closed == other.all_contours_closed
    }
}

impl ResolvedPathArtifact {
    pub fn same_visual_geometry(&self, other: &Self) -> bool {
        self == other
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PathError(String);

impl PathError {
    fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl fmt::Display for PathError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for PathError {}

#[derive(Clone, Copy)]
enum PreviousCurve {
    Cubic(f64, f64),
    Quadratic(f64, f64),
    Other,
}

/// Validate and analyze an SVG path in Grida's fixed unit reference box.
pub fn analyze(
    d: impl Into<Arc<str>>,
    fill_rule: FillRule,
) -> Result<Arc<PathArtifact>, PathError> {
    let d = d.into();
    if d.trim().is_empty() {
        return Err(PathError::new("path data must not be empty"));
    }

    let mut commands = Vec::new();
    let mut current = (0.0_f64, 0.0_f64);
    let mut contour_start = current;
    let mut contour_has_geometry = false;
    let mut contour_closed = false;
    let mut has_geometry = false;
    let mut all_contours_closed = true;
    let mut after_close = false;
    let mut previous = PreviousCurve::Other;

    let finish_contour = |has_geometry: bool, closed: bool, all_closed: &mut bool| {
        if has_geometry && !closed {
            *all_closed = false;
        }
    };

    for parsed in PathParser::from(d.as_ref()) {
        let segment =
            parsed.map_err(|error| PathError::new(format!("invalid SVG path data: {error}")))?;

        if after_close
            && !matches!(
                segment,
                PathSegment::MoveTo { .. } | PathSegment::ClosePath { .. }
            )
        {
            commands.push(PathCommand::MoveTo {
                x: finite_f32(contour_start.0)?,
                y: finite_f32(contour_start.1)?,
            });
            current = contour_start;
            contour_has_geometry = false;
            contour_closed = false;
            after_close = false;
        }

        match segment {
            PathSegment::MoveTo { abs, x, y } => {
                finish_contour(
                    contour_has_geometry,
                    contour_closed,
                    &mut all_contours_closed,
                );
                let point = absolute_point(abs, current, x, y);
                commands.push(PathCommand::MoveTo {
                    x: finite_f32(point.0)?,
                    y: finite_f32(point.1)?,
                });
                current = point;
                contour_start = point;
                contour_has_geometry = false;
                contour_closed = false;
                after_close = false;
                previous = PreviousCurve::Other;
            }
            PathSegment::LineTo { abs, x, y } => {
                let point = absolute_point(abs, current, x, y);
                commands.push(PathCommand::LineTo {
                    x: finite_f32(point.0)?,
                    y: finite_f32(point.1)?,
                });
                current = point;
                contour_has_geometry = true;
                has_geometry = true;
                previous = PreviousCurve::Other;
            }
            PathSegment::HorizontalLineTo { abs, x } => {
                let point = (if abs { x } else { current.0 + x }, current.1);
                commands.push(PathCommand::LineTo {
                    x: finite_f32(point.0)?,
                    y: finite_f32(point.1)?,
                });
                current = point;
                contour_has_geometry = true;
                has_geometry = true;
                previous = PreviousCurve::Other;
            }
            PathSegment::VerticalLineTo { abs, y } => {
                let point = (current.0, if abs { y } else { current.1 + y });
                commands.push(PathCommand::LineTo {
                    x: finite_f32(point.0)?,
                    y: finite_f32(point.1)?,
                });
                current = point;
                contour_has_geometry = true;
                has_geometry = true;
                previous = PreviousCurve::Other;
            }
            PathSegment::CurveTo {
                abs,
                x1,
                y1,
                x2,
                y2,
                x,
                y,
            } => {
                let control1 = absolute_point(abs, current, x1, y1);
                let control2 = absolute_point(abs, current, x2, y2);
                let point = absolute_point(abs, current, x, y);
                commands.push(PathCommand::CubicTo {
                    x1: finite_f32(control1.0)?,
                    y1: finite_f32(control1.1)?,
                    x2: finite_f32(control2.0)?,
                    y2: finite_f32(control2.1)?,
                    x: finite_f32(point.0)?,
                    y: finite_f32(point.1)?,
                });
                current = point;
                contour_has_geometry = true;
                has_geometry = true;
                previous = PreviousCurve::Cubic(control2.0, control2.1);
            }
            PathSegment::SmoothCurveTo { abs, x2, y2, x, y } => {
                let control1 = match previous {
                    PreviousCurve::Cubic(px, py) => (2.0 * current.0 - px, 2.0 * current.1 - py),
                    _ => current,
                };
                let control2 = absolute_point(abs, current, x2, y2);
                let point = absolute_point(abs, current, x, y);
                commands.push(PathCommand::CubicTo {
                    x1: finite_f32(control1.0)?,
                    y1: finite_f32(control1.1)?,
                    x2: finite_f32(control2.0)?,
                    y2: finite_f32(control2.1)?,
                    x: finite_f32(point.0)?,
                    y: finite_f32(point.1)?,
                });
                current = point;
                contour_has_geometry = true;
                has_geometry = true;
                previous = PreviousCurve::Cubic(control2.0, control2.1);
            }
            PathSegment::Quadratic { abs, x1, y1, x, y } => {
                let control = absolute_point(abs, current, x1, y1);
                let point = absolute_point(abs, current, x, y);
                commands.push(PathCommand::QuadTo {
                    x1: finite_f32(control.0)?,
                    y1: finite_f32(control.1)?,
                    x: finite_f32(point.0)?,
                    y: finite_f32(point.1)?,
                });
                current = point;
                contour_has_geometry = true;
                has_geometry = true;
                previous = PreviousCurve::Quadratic(control.0, control.1);
            }
            PathSegment::SmoothQuadratic { abs, x, y } => {
                let control = match previous {
                    PreviousCurve::Quadratic(px, py) => {
                        (2.0 * current.0 - px, 2.0 * current.1 - py)
                    }
                    _ => current,
                };
                let point = absolute_point(abs, current, x, y);
                commands.push(PathCommand::QuadTo {
                    x1: finite_f32(control.0)?,
                    y1: finite_f32(control.1)?,
                    x: finite_f32(point.0)?,
                    y: finite_f32(point.1)?,
                });
                current = point;
                contour_has_geometry = true;
                has_geometry = true;
                previous = PreviousCurve::Quadratic(control.0, control.1);
            }
            PathSegment::EllipticalArc {
                abs,
                rx,
                ry,
                x_axis_rotation,
                large_arc,
                sweep,
                x,
                y,
            } => {
                if !rx.is_finite() || !ry.is_finite() || rx < 0.0 || ry < 0.0 {
                    return Err(PathError::new(
                        "SVG arc radii must be finite and non-negative",
                    ));
                }
                if !x_axis_rotation.is_finite() {
                    return Err(PathError::new("SVG arc rotation must be finite"));
                }
                let point = absolute_point(abs, current, x, y);
                let rx = finite_f32(rx)?;
                let ry = finite_f32(ry)?;
                let x = finite_f32(point.0)?;
                let y = finite_f32(point.1)?;
                let start = (finite_f32(current.0)?, finite_f32(current.1)?);
                if (rx == 0.0 || ry == 0.0) && (x, y) != start {
                    commands.push(PathCommand::LineTo { x, y });
                } else if (x, y) != start {
                    commands.extend(center_arc_commands(
                        start,
                        (x, y),
                        (rx, ry),
                        x_axis_rotation,
                        large_arc,
                        sweep,
                    )?);
                }
                current = point;
                if (x, y) != start {
                    contour_has_geometry = true;
                    has_geometry = true;
                }
                previous = PreviousCurve::Other;
            }
            PathSegment::ClosePath { .. } => {
                commands.push(PathCommand::Close);
                current = contour_start;
                contour_closed = true;
                after_close = true;
                previous = PreviousCurve::Other;
            }
        }
    }

    finish_contour(
        contour_has_geometry,
        contour_closed,
        &mut all_contours_closed,
    );
    if !has_geometry {
        return Err(PathError::new(
            "path data must contain at least one drawing segment",
        ));
    }

    let commands = drawable_commands(commands);
    let bounds = command_bounds(&commands, true)?;

    Ok(Arc::new(PathArtifact {
        d,
        commands: commands.into(),
        fill_rule,
        unit_bounds: bounds,
        all_contours_closed,
    }))
}

/// Map a validated unit-reference artifact into one resolved local box.
/// Multiplication occurs exactly once here; later consumers must not rescale
/// the commands independently.
pub fn materialize(
    source: Arc<PathArtifact>,
    width: f32,
    height: f32,
) -> Result<Arc<ResolvedPathArtifact>, PathError> {
    if !width.is_finite() || width < 0.0 || !height.is_finite() || height < 0.0 {
        return Err(PathError::new(
            "resolved path box must have finite non-negative dimensions",
        ));
    }
    let commands: Vec<PathCommand> = source
        .commands
        .iter()
        .map(|command| {
            Ok(match *command {
                PathCommand::MoveTo { x, y } => PathCommand::MoveTo {
                    x: scaled_f32(x, width)?,
                    y: scaled_f32(y, height)?,
                },
                PathCommand::LineTo { x, y } => PathCommand::LineTo {
                    x: scaled_f32(x, width)?,
                    y: scaled_f32(y, height)?,
                },
                PathCommand::QuadTo { x1, y1, x, y } => PathCommand::QuadTo {
                    x1: scaled_f32(x1, width)?,
                    y1: scaled_f32(y1, height)?,
                    x: scaled_f32(x, width)?,
                    y: scaled_f32(y, height)?,
                },
                PathCommand::CubicTo {
                    x1,
                    y1,
                    x2,
                    y2,
                    x,
                    y,
                } => PathCommand::CubicTo {
                    x1: scaled_f32(x1, width)?,
                    y1: scaled_f32(y1, height)?,
                    x2: scaled_f32(x2, width)?,
                    y2: scaled_f32(y2, height)?,
                    x: scaled_f32(x, width)?,
                    y: scaled_f32(y, height)?,
                },
                PathCommand::ConicTo {
                    x1,
                    y1,
                    x,
                    y,
                    weight,
                } => PathCommand::ConicTo {
                    x1: scaled_f32(x1, width)?,
                    y1: scaled_f32(y1, height)?,
                    x: scaled_f32(x, width)?,
                    y: scaled_f32(y, height)?,
                    weight,
                },
                PathCommand::Close => PathCommand::Close,
            })
        })
        .collect::<Result<_, PathError>>()?;
    let local_bounds = command_bounds(&commands, false)?;
    Ok(Arc::new(ResolvedPathArtifact {
        commands: commands.into(),
        fill_rule: source.fill_rule,
        local_bounds,
        all_contours_closed: source.all_contours_closed,
        source,
    }))
}

fn scaled_f32(value: f32, scale: f32) -> Result<f32, PathError> {
    let mapped = value * scale;
    if mapped.is_finite() {
        Ok(if mapped == 0.0 { 0.0 } else { mapped })
    } else {
        Err(PathError::new(
            "resolved path coordinates exceed finite f32 geometry",
        ))
    }
}

/// Remove move-only contours. They have no fill or stroke geometry and must
/// not perturb tight bounds or visual-damage identity.
fn drawable_commands(commands: Vec<PathCommand>) -> Vec<PathCommand> {
    let mut out = Vec::with_capacity(commands.len());
    let mut contour = Vec::new();
    let flush = |contour: &mut Vec<PathCommand>, out: &mut Vec<PathCommand>| {
        if contour.iter().any(|command| {
            matches!(
                command,
                PathCommand::LineTo { .. }
                    | PathCommand::QuadTo { .. }
                    | PathCommand::CubicTo { .. }
                    | PathCommand::ConicTo { .. }
            )
        }) {
            out.append(contour);
        } else {
            contour.clear();
        }
    };
    for command in commands {
        if matches!(command, PathCommand::MoveTo { .. }) && !contour.is_empty() {
            flush(&mut contour, &mut out);
        }
        if matches!(command, PathCommand::Close)
            && matches!(contour.last(), Some(PathCommand::Close))
        {
            continue;
        }
        contour.push(command);
    }
    flush(&mut contour, &mut out);
    out
}

fn absolute_point(abs: bool, current: (f64, f64), x: f64, y: f64) -> (f64, f64) {
    if abs {
        (x, y)
    } else {
        (current.0 + x, current.1 + y)
    }
}

fn finite_f32(value: f64) -> Result<f32, PathError> {
    let value = value as f32;
    if value.is_finite() {
        Ok(if value == 0.0 { 0.0 } else { value })
    } else {
        Err(PathError::new("path coordinates must be finite f32 values"))
    }
}

fn command_bounds(commands: &[PathCommand], require_unit_box: bool) -> Result<RectF, PathError> {
    let mut bounds: Option<Rect> = None;
    let mut current: Option<Point> = None;
    let mut contour_start: Option<Point> = None;
    for command in commands {
        match *command {
            PathCommand::MoveTo { x, y } => {
                let point = Point::new(x.into(), y.into());
                current = Some(point);
                contour_start = Some(point);
            }
            PathCommand::LineTo { x, y } => {
                let next = Point::new(x.into(), y.into());
                include_bounds(
                    &mut bounds,
                    Line::new(required_current(current), next).bounding_box(),
                );
                current = Some(next);
            }
            PathCommand::QuadTo { x1, y1, x, y } => {
                let next = Point::new(x.into(), y.into());
                include_bounds(
                    &mut bounds,
                    QuadBez::new(
                        required_current(current),
                        Point::new(x1.into(), y1.into()),
                        next,
                    )
                    .bounding_box(),
                );
                current = Some(next);
            }
            PathCommand::CubicTo {
                x1,
                y1,
                x2,
                y2,
                x,
                y,
            } => {
                let next = Point::new(x.into(), y.into());
                include_bounds(
                    &mut bounds,
                    CubicBez::new(
                        required_current(current),
                        Point::new(x1.into(), y1.into()),
                        Point::new(x2.into(), y2.into()),
                        next,
                    )
                    .bounding_box(),
                );
                current = Some(next);
            }
            PathCommand::ConicTo {
                x1,
                y1,
                x,
                y,
                weight,
            } => {
                let next = Point::new(x.into(), y.into());
                include_bounds(
                    &mut bounds,
                    conic_bounds(
                        required_current(current),
                        Point::new(x1.into(), y1.into()),
                        next,
                        weight.into(),
                    ),
                );
                current = Some(next);
            }
            PathCommand::Close => {
                let start = contour_start.expect("validated close follows a move command");
                include_bounds(
                    &mut bounds,
                    Line::new(required_current(current), start).bounding_box(),
                );
                current = Some(start);
            }
        }
    }
    let bounds = bounds.expect("validated path contains drawable geometry");
    if !bounds.is_finite() {
        return Err(PathError::new("path coordinates must be finite"));
    }
    if require_unit_box
        && (bounds.x0 < 0.0 || bounds.y0 < 0.0 || bounds.x1 > 1.0 || bounds.y1 > 1.0)
    {
        return Err(PathError::new(format!(
            "path geometry must stay inside the unit reference box 0..1; tight bounds are {} {} {} {}",
            bounds.x0,
            bounds.y0,
            bounds.width(),
            bounds.height()
        )));
    }
    rectf_covering(bounds)
}

/// Encode f64 LTRB bounds in RectF without letting separate f32 rounding of
/// origin and extent move the reconstructed right/bottom edge inward.
fn rectf_covering(bounds: Rect) -> Result<RectF, PathError> {
    let (x, w) = covering_axis(bounds.x0, bounds.x1)?;
    let (y, h) = covering_axis(bounds.y0, bounds.y1)?;
    Ok(RectF { x, y, w, h })
}

fn covering_axis(min: f64, max: f64) -> Result<(f32, f32), PathError> {
    let start = floor_f32(min)?;
    let target_end = ceil_f32(max)?;
    let mut extent = ceil_f32(f64::from(target_end) - f64::from(start))?;
    while start + extent < target_end {
        extent = next_up_f32(extent);
    }
    Ok((start, extent))
}

fn floor_f32(value: f64) -> Result<f32, PathError> {
    let rounded = finite_f32(value)?;
    Ok(if f64::from(rounded) > value {
        next_down_f32(rounded)
    } else {
        rounded
    })
}

fn ceil_f32(value: f64) -> Result<f32, PathError> {
    let rounded = finite_f32(value)?;
    Ok(if f64::from(rounded) < value {
        next_up_f32(rounded)
    } else {
        rounded
    })
}

fn next_up_f32(value: f32) -> f32 {
    if value == f32::INFINITY {
        return value;
    }
    if value == 0.0 {
        return f32::from_bits(1);
    }
    let bits = value.to_bits();
    f32::from_bits(if value > 0.0 { bits + 1 } else { bits - 1 })
}

fn next_down_f32(value: f32) -> f32 {
    if value == f32::NEG_INFINITY {
        return value;
    }
    if value == 0.0 {
        return -f32::from_bits(1);
    }
    let bits = value.to_bits();
    f32::from_bits(if value > 0.0 { bits - 1 } else { bits + 1 })
}

fn required_current(current: Option<Point>) -> Point {
    current.expect("validated path drawing command follows a move command")
}

fn include_bounds(bounds: &mut Option<Rect>, next: Rect) {
    *bounds = Some(bounds.map_or(next, |bounds| bounds.union(next)));
}

#[derive(Clone, Copy)]
struct CenterArc {
    center_x: f64,
    center_y: f64,
    radius_x: f64,
    radius_y: f64,
    x_axis_rotation: f64,
}

/// SVG endpoint-to-center conversion without a geometric tolerance. Exact
/// zero radii and coincident endpoints are normalized by the caller; every
/// positive-radius, distinct-endpoint arc reaches this conversion.
fn center_arc_commands(
    start: (f32, f32),
    end: (f32, f32),
    radii: (f32, f32),
    x_axis_rotation_degrees: f64,
    large_arc: bool,
    sweep: bool,
) -> Result<Vec<PathCommand>, PathError> {
    let (start_x, start_y) = (f64::from(start.0), f64::from(start.1));
    let (end_x, end_y) = (f64::from(end.0), f64::from(end.1));
    let mut radius_x = f64::from(radii.0);
    let mut radius_y = f64::from(radii.1);
    // A circle has no distinguished ellipse axis. Canonicalizing its inert
    // authored rotation avoids injecting trig residue into the conic stream.
    let x_axis_rotation = if radii.0 == radii.1 {
        0.0
    } else {
        x_axis_rotation_degrees.rem_euclid(360.0).to_radians()
    };
    let (sin_rotation, cos_rotation) = sin_cos_quadrant_exact(x_axis_rotation);

    let half_dx = (start_x - end_x) * 0.5;
    let half_dy = (start_y - end_y) * 0.5;
    let x_prime = cos_rotation * half_dx + sin_rotation * half_dy;
    let y_prime = -sin_rotation * half_dx + cos_rotation * half_dy;

    // SVG radii correction. `hypot` avoids overflow in the ratio sum and
    // makes tiny positive radii ordinary arcs rather than pseudo-degenerate.
    let radii_scale = (x_prime / radius_x).hypot(y_prime / radius_y);
    if radii_scale > 1.0 {
        radius_x *= radii_scale;
        radius_y *= radii_scale;
    }

    let normalized_x = x_prime / radius_x;
    let normalized_y = y_prime / radius_y;
    let normalized_squared = normalized_x * normalized_x + normalized_y * normalized_y;
    if normalized_squared == 0.0 || !normalized_squared.is_finite() {
        return Err(PathError::new(
            "SVG arc center conversion produced invalid normalized geometry",
        ));
    }
    let sign = if large_arc == sweep { -1.0 } else { 1.0 };
    let coefficient = sign * ((1.0 - normalized_squared).max(0.0) / normalized_squared).sqrt();
    let center_prime_x = coefficient * radius_x * normalized_y;
    let center_prime_y = coefficient * -radius_y * normalized_x;
    let center_x =
        cos_rotation * center_prime_x - sin_rotation * center_prime_y + (start_x + end_x) * 0.5;
    let center_y =
        sin_rotation * center_prime_x + cos_rotation * center_prime_y + (start_y + end_y) * 0.5;

    let ux = (x_prime - center_prime_x) / radius_x;
    let uy = (y_prime - center_prime_y) / radius_y;
    let start_angle = uy.atan2(ux);
    // The endpoint-vector atan2 formula loses a nearly-full sweep when its
    // tiny complementary chord rounds to zero. The corrected normalized
    // half-chord directly defines the small central angle and remains stable
    // across that range.
    let small_sweep = 2.0 * normalized_squared.sqrt().clamp(0.0, 1.0).asin();
    let sweep_magnitude = if large_arc {
        std::f64::consts::TAU - small_sweep
    } else {
        small_sweep
    };
    let sweep_angle = if sweep {
        sweep_magnitude
    } else {
        -sweep_magnitude
    };

    if [
        center_x,
        center_y,
        radius_x,
        radius_y,
        x_axis_rotation,
        start_angle,
        sweep_angle,
    ]
    .into_iter()
    .any(|value| !value.is_finite())
    {
        return Err(PathError::new(
            "SVG arc center conversion produced non-finite geometry",
        ));
    }

    let arc = CenterArc {
        center_x,
        center_y,
        radius_x,
        radius_y,
        x_axis_rotation,
    };
    let raw_count = sweep_angle.abs() / std::f64::consts::FRAC_PI_2;
    let nearest_count = raw_count.round();
    let stable_count =
        if (raw_count - nearest_count).abs() <= 32.0 * f64::EPSILON * raw_count.max(1.0) {
            nearest_count
        } else {
            raw_count
        };
    let count = stable_count.ceil().clamp(1.0, 4.0) as usize;
    let step = sweep_angle / count as f64;
    let mut commands = Vec::with_capacity(count);
    for index in 0..count {
        let end_angle = start_angle + step * (index + 1) as f64;
        let middle_angle = end_angle - step * 0.5;
        let weight = (step * 0.5).cos();
        let (middle_sin, middle_cos) = sin_cos_quadrant_exact(middle_angle);
        let control = arc_point_from_unit(
            arc,
            snap_unit_trig_identity(middle_cos / weight),
            snap_unit_trig_identity(middle_sin / weight),
        );
        let endpoint = if index + 1 == count {
            end
        } else {
            let point = arc_point(arc, end_angle);
            (finite_f32(point.x)?, finite_f32(point.y)?)
        };
        commands.push(PathCommand::ConicTo {
            x1: finite_f32(control.x)?,
            y1: finite_f32(control.y)?,
            x: endpoint.0,
            y: endpoint.1,
            weight: finite_f32(weight)?,
        });
    }
    Ok(commands)
}

/// Tight bounds of the exact stored rational quadratic with weights
/// `[1, weight, 1]`. Extrema are roots of the rational derivative, a
/// quadratic after its cubic term cancels.
fn conic_bounds(start: Point, control: Point, end: Point, weight: f64) -> Rect {
    let mut bounds = Rect::from_points(start, end);
    for axis in 0..2 {
        let p0 = if axis == 0 { start.x } else { start.y };
        let p1 = if axis == 0 { control.x } else { control.y };
        let p2 = if axis == 0 { end.x } else { end.y };
        let numerator_a = p0 - 2.0 * weight * p1 + p2;
        let numerator_b = 2.0 * (weight * p1 - p0);
        let numerator_c = p0;
        let denominator_d = 2.0 * (1.0 - weight);
        let denominator_e = 2.0 * (weight - 1.0);
        let derivative_0 = numerator_b - numerator_c * denominator_e;
        let derivative_1 = 2.0 * (numerator_a - numerator_c * denominator_d);
        let derivative_2 = numerator_a * denominator_e - numerator_b * denominator_d;
        for t in kurbo::common::solve_quadratic(derivative_0, derivative_1, derivative_2) {
            if t > 0.0 && t < 1.0 {
                bounds = bounds.union_pt(conic_point(start, control, end, weight, t));
            }
        }
    }
    bounds
}

fn conic_point(start: Point, control: Point, end: Point, weight: f64, t: f64) -> Point {
    let one_minus_t = 1.0 - t;
    let start_factor = one_minus_t * one_minus_t;
    let control_factor = 2.0 * weight * one_minus_t * t;
    let end_factor = t * t;
    let denominator = start_factor + control_factor + end_factor;
    let point = Point::new(
        (start_factor * start.x + control_factor * control.x + end_factor * end.x) / denominator,
        (start_factor * start.y + control_factor * control.y + end_factor * end.y) / denominator,
    );
    // Positive rational weights keep the curve inside its control hull.
    // Clamp only arithmetic that violates that exact invariant.
    Point::new(
        point.x.clamp(
            start.x.min(control.x).min(end.x),
            start.x.max(control.x).max(end.x),
        ),
        point.y.clamp(
            start.y.min(control.y).min(end.y),
            start.y.max(control.y).max(end.y),
        ),
    )
}

fn arc_point(arc: CenterArc, angle: f64) -> Point {
    let (sin_angle, cos_angle) = sin_cos_quadrant_exact(angle);
    arc_point_from_unit(arc, cos_angle, sin_angle)
}

fn sin_cos_quadrant_exact(angle: f64) -> (f64, f64) {
    let quadrant = (angle / std::f64::consts::FRAC_PI_2).round();
    if (angle - quadrant * std::f64::consts::FRAC_PI_2).abs()
        <= 32.0 * f64::EPSILON * angle.abs().max(1.0)
    {
        return match (quadrant as i64).rem_euclid(4) {
            0 => (0.0, 1.0),
            1 => (1.0, 0.0),
            2 => (0.0, -1.0),
            _ => (-1.0, 0.0),
        };
    }
    angle.sin_cos()
}

fn snap_unit_trig_identity(value: f64) -> f64 {
    for exact in [-1.0, 0.0, 1.0] {
        if (value - exact).abs() <= 32.0 * f64::EPSILON {
            return exact;
        }
    }
    value
}

fn arc_point_from_unit(arc: CenterArc, unit_x: f64, unit_y: f64) -> Point {
    let (sin_rotation, cos_rotation) = sin_cos_quadrant_exact(arc.x_axis_rotation);
    Point::new(
        arc.center_x + arc.radius_x * unit_x * cos_rotation - arc.radius_y * unit_y * sin_rotation,
        arc.center_y + arc.radius_x * unit_x * sin_rotation + arc.radius_y * unit_y * cos_rotation,
    )
}
