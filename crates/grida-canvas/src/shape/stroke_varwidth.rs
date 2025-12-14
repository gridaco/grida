use crate::cg::varwidth::*;
use crate::vectornetwork::vn::PiecewiseVectorNetworkGeometry;
use skia_safe::{Path, PathBuilder};

/// Adapter to keep the demo signature: capture a VarWidthSampler in a closure.
/// Returns half-width r(u).
fn make_width_fn(sampler: VarWidthSampler) -> impl Fn(f32) -> f32 {
    move |u: f32| sampler.r(u)
}

/// Simplified API for creating variable width strokes along a cubic Bezier curve.
///
/// This function provides a high-level interface for creating variable width stroke geometry
/// along a single cubic Bezier curve. It handles all the complexity of path evaluation, tangent
/// calculation, and width sampling internally.
///
/// # Arguments
///
/// * `p0` - Start point of the cubic Bezier curve
/// * `p1` - First control point of the cubic Bezier curve
/// * `p2` - Second control point of the cubic Bezier curve
/// * `p3` - End point of the cubic Bezier curve
/// * `width_profile` - Defines how the stroke width varies along the path
/// * `samples` - Number of sample points along the path (higher = smoother, but slower)
///
/// # Returns
///
/// A `Path` object representing the variable width stroke geometry that can be rendered.
///
/// # Example
///
/// ```rust
/// use cg::cg::varwidth::{VarWidthProfile, WidthStop};
/// use cg::shape::stroke_varwidth::create_variable_width_stroke;
///
/// // Define a tapered width profile
/// let width_profile = VarWidthProfile {
///     base: 2.0,
///     stops: vec![
///         WidthStop { u: 0.0, r: 0.0 },
///         WidthStop { u: 0.5, r: 40.0 },
///         WidthStop { u: 1.0, r: 0.0 },
///     ],
/// };
///
/// // Create the stroke along a cubic Bezier curve
/// let stroke_path = create_variable_width_stroke(
///     (50.0, 200.0),  // p0
///     (150.0, 50.0),  // p1
///     (250.0, 350.0), // p2
///     (350.0, 200.0), // p3
///     width_profile,
///     40,
/// );
/// ```
pub fn create_variable_width_stroke(
    p0: (f32, f32),
    p1: (f32, f32),
    p2: (f32, f32),
    p3: (f32, f32),
    width_profile: VarWidthProfile,
    samples: usize,
) -> Path {
    let sampler = VarWidthSampler::build_sampler(&width_profile);
    let width = make_width_fn(sampler);

    let sample = |t: f32| {
        let mt = 1.0 - t;
        let mt2 = mt * mt;
        let t2 = t * t;
        (
            p0.0 * mt2 * mt + 3.0 * p1.0 * mt2 * t + 3.0 * p2.0 * mt * t2 + p3.0 * t2 * t,
            p0.1 * mt2 * mt + 3.0 * p1.1 * mt2 * t + 3.0 * p2.1 * mt * t2 + p3.1 * t2 * t,
        )
    };
    let tangent = |t: f32| {
        let mt = 1.0 - t;
        let mt2 = mt * mt;
        let t2 = t * t;
        (
            3.0 * (p1.0 - p0.0) * mt2 + 6.0 * (p2.0 - p1.0) * mt * t + 3.0 * (p3.0 - p2.0) * t2,
            3.0 * (p1.1 - p0.1) * mt2 + 6.0 * (p2.1 - p1.1) * mt * t + 3.0 * (p3.1 - p2.1) * t2,
        )
    };
    variable_width_stroke_geometry(sample, tangent, width, samples)
}

/// Create variable width strokes along a piecewise vector network geometry.
///
/// This function creates variable width stroke geometry along multiple cubic Bezier curves
/// defined by a `PiecewiseVectorNetworkGeometry`. Each segment in the geometry is treated
/// as a cubic Bezier curve with optional tangent control points.
///
/// # Arguments
///
/// * `geometry` - The piecewise vector network geometry containing vertices and segments
/// * `width_profile` - Defines how the stroke width varies along the path
/// * `samples_per_segment` - Number of sample points per segment (higher = smoother, but slower)
///
/// # Returns
///
/// A `Path` object representing the variable width stroke geometry that can be rendered.
///
/// # Example
///
/// ```rust
/// use cg::cg::varwidth::{VarWidthProfile, WidthStop};
/// use cg::shape::stroke_varwidth::create_variable_width_stroke_from_geometry;
/// use cg::vectornetwork::vn::{PiecewiseVectorNetworkGeometry, VectorNetworkSegment};
///
/// // Create a piecewise geometry with multiple cubic curves
/// let geometry = PiecewiseVectorNetworkGeometry::new(
///     vec![(0.0, 0.0), (100.0, 0.0), (200.0, 100.0), (300.0, 100.0)],
///     vec![
///         VectorNetworkSegment {
///             a: 0, b: 1,
///             ta: (50.0, 50.0), tb: (-50.0, 50.0)
///         },
///         VectorNetworkSegment {
///             a: 1, b: 2,
///             ta: (50.0, 50.0), tb: (50.0, -50.0)
///         },
///         VectorNetworkSegment {
///             a: 2, b: 3,
///             ta: (50.0, 0.0), tb: (-50.0, 0.0)
///         },
///     ],
/// ).expect("Valid geometry");
///
/// // Define a tapered width profile
/// let width_profile = VarWidthProfile {
///     base: 2.0,
///     stops: vec![
///         WidthStop { u: 0.0, r: 0.0 },
///         WidthStop { u: 0.5, r: 40.0 },
///         WidthStop { u: 1.0, r: 0.0 },
///     ],
/// };
///
/// // Create the stroke along the entire geometry
/// let stroke_path = create_variable_width_stroke_from_geometry(
///     geometry,
///     width_profile,
///     20,
/// );
/// ```
pub fn create_variable_width_stroke_from_geometry(
    geometry: PiecewiseVectorNetworkGeometry,
    width_profile: VarWidthProfile,
    samples_per_segment: usize,
) -> Path {
    let sampler = VarWidthSampler::build_sampler(&width_profile);
    let width = make_width_fn(sampler);

    let mut combined_path = Path::new();
    let total_segments = geometry.segments.len();

    for (segment_idx, segment) in geometry.segments.iter().enumerate() {
        let a = geometry.vertices[segment.a];
        let b = geometry.vertices[segment.b];
        let ta = segment.ta;
        let tb = segment.tb;

        // Convert to cubic Bezier control points
        let p0 = a;
        let p1 = (a.0 + ta.0, a.1 + ta.1);
        let p2 = (b.0 + tb.0, b.1 + tb.1);
        let p3 = b;

        // Create sample and tangent functions for this segment
        let sample = |t: f32| {
            let mt = 1.0 - t;
            let mt2 = mt * mt;
            let t2 = t * t;
            (
                p0.0 * mt2 * mt + 3.0 * p1.0 * mt2 * t + 3.0 * p2.0 * mt * t2 + p3.0 * t2 * t,
                p0.1 * mt2 * mt + 3.0 * p1.1 * mt2 * t + 3.0 * p2.1 * mt * t2 + p3.1 * t2 * t,
            )
        };
        let tangent = |t: f32| {
            let mt = 1.0 - t;
            let mt2 = mt * mt;
            let t2 = t * t;
            (
                3.0 * (p1.0 - p0.0) * mt2 + 6.0 * (p2.0 - p1.0) * mt * t + 3.0 * (p3.0 - p2.0) * t2,
                3.0 * (p1.1 - p0.1) * mt2 + 6.0 * (p2.1 - p1.1) * mt * t + 3.0 * (p3.1 - p2.1) * t2,
            )
        };

        // Create width function that maps segment-local u to global u
        let segment_width = |u: f32| {
            let global_u = (segment_idx as f32 + u) / total_segments as f32;
            width(global_u)
        };

        // Generate stroke geometry for this segment
        let segment_path =
            variable_width_stroke_geometry(sample, tangent, segment_width, samples_per_segment);

        // Combine with the overall path
        if segment_idx == 0 {
            combined_path = segment_path;
        } else {
            let mut builder = PathBuilder::new_path(&combined_path);
            builder.add_path(&segment_path);
            combined_path = builder.detach();
        }
    }

    combined_path
}

/// Compute a smooth path representing a variable width stroke along a center path.
///
/// This is the low-level function that performs the actual variable width stroke computation.
/// It takes functions for path sampling, tangent calculation, and width evaluation,
/// then generates a smooth outline path that can be filled to create the stroke.
///
/// # Arguments
///
/// * `sample` - Function that returns the center position at t ∈ [0, 1]
/// * `tangent` - Function that returns the derivative (dx/dt, dy/dt) at t ∈ [0, 1]
/// * `width` - Function that returns the stroke half-width r(u) at u ∈ [0, 1] (in arc-length space)
/// * `samples` - Number of sample points along the path
///
/// # Returns
///
/// A `Path` object representing the variable width stroke outline.
///
/// # Algorithm
///
/// 1. Builds an arc-length lookup table for stable width sampling
/// 2. Samples the path at regular intervals and offsets by the width perpendicular to the tangent
/// 3. Creates left and right outline paths
/// 4. Connects the outlines using Catmull-Rom splines converted to cubic Bezier curves
/// 5. Closes the path to form a fillable outline
///
/// # Example
///
/// ```rust
/// use cg::shape::stroke_varwidth::variable_width_stroke_geometry;
///
/// // Define a simple line from (0,0) to (100,100)
/// let sample = |t: f32| (100.0 * t, 100.0 * t);
/// let tangent = |_t: f32| (100.0, 100.0);
/// let width = |_u: f32| 10.0; // constant 10px half-width
///
/// let stroke_path = variable_width_stroke_geometry(sample, tangent, width, 20);
/// ```
pub fn variable_width_stroke_geometry<FS, FT, FW>(
    sample: FS,
    tangent: FT,
    width: FW,
    samples: usize,
) -> Path
where
    FS: Fn(f32) -> (f32, f32),
    FT: Fn(f32) -> (f32, f32),
    FW: Fn(f32) -> f32,
{
    // Arc-length LUT (denser than output samples for stability)
    let (ts, us) = build_arc_lut(&sample, samples * 3);

    let mut left = Vec::with_capacity(samples + 1);
    let mut right = Vec::with_capacity(samples + 1);
    for i in 0..=samples {
        let u = i as f32 / samples as f32;
        let t = u_to_t(&ts, &us, u);
        let (x, y) = sample(t);
        let (dx, dy) = tangent(t);
        let len = (dx * dx + dy * dy).sqrt().max(1e-6);
        let nx = -dy / len;
        let ny = dx / len;
        let w = width(u);
        left.push((x + nx * w, y + ny * w));
        right.push((x - nx * w, y - ny * w));
    }

    // Build outline path using Catmull-Rom spline converted to cubic Beziers
    let mut builder = PathBuilder::new();
    add_catmull_segments(&mut builder, &left, false);
    right.reverse();
    add_catmull_segments(&mut builder, &right, true);
    builder.close();
    builder.detach()
}

/// Calculate the Euclidean distance between two points.
#[inline]
fn distance(a: (f32, f32), b: (f32, f32)) -> f32 {
    (b.0 - a.0).hypot(b.1 - a.1)
}

/// Build an arc-length lookup table for stable width sampling.
///
/// This function samples the path at regular intervals and builds two lookup tables:
/// - `ts`: parameter values t ∈ [0, 1]
/// - `us`: normalized arc-length values u ∈ [0, 1]
///
/// The arc-length parameterization ensures that width sampling is uniform
/// in terms of actual distance along the path, not just parameter space.
///
/// # Arguments
///
/// * `sample` - Function that samples the path position
/// * `steps` - Number of steps to use for the lookup table
///
/// # Returns
///
/// A tuple of (ts, us) where ts are parameter values and us are normalized arc-lengths.
fn build_arc_lut<F>(sample: F, steps: usize) -> (Vec<f32>, Vec<f32>)
where
    F: Fn(f32) -> (f32, f32),
{
    let n = steps.max(2);
    let mut ts = Vec::with_capacity(n + 1);
    let mut ss = Vec::with_capacity(n + 1);
    let mut s = 0.0;
    let mut prev = sample(0.0);
    ts.push(0.0);
    ss.push(0.0);
    for i in 1..=n {
        let t = i as f32 / n as f32;
        let p = sample(t);
        s += distance(prev, p);
        ts.push(t);
        ss.push(s);
        prev = p;
    }
    // normalize to u in [0,1]
    if s > 0.0 {
        for v in ss.iter_mut() {
            *v /= s;
        }
    }
    (ts, ss)
}

/// Convert arc-length parameter u to path parameter t using binary search.
///
/// This function performs a binary search on the arc-length lookup table
/// to find the corresponding path parameter t for a given arc-length u.
///
/// # Arguments
///
/// * `ts` - Array of path parameter values
/// * `us` - Array of normalized arc-length values (must be sorted)
/// * `u` - Arc-length parameter to convert (clamped to [0, 1])
///
/// # Returns
///
/// The corresponding path parameter t.
fn u_to_t(ts: &[f32], us: &[f32], u: f32) -> f32 {
    let x = u.clamp(0.0, 1.0);
    // binary search on us
    let mut lo = 0usize;
    let mut hi = us.len() - 1;
    if x <= us[0] {
        return ts[0];
    }
    if x >= us[hi] {
        return ts[hi];
    }
    while lo + 1 < hi {
        let mid = (lo + hi) / 2;
        if us[mid] <= x {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    let u0 = us[lo];
    let u1 = us[hi];
    let t0 = ts[lo];
    let t1 = ts[hi];
    let w = if u1 > u0 { (x - u0) / (u1 - u0) } else { 0.0 };
    t0 + (t1 - t0) * w
}

/// Add Catmull-Rom spline segments to a path, converted to cubic Bezier curves.
///
/// This function creates smooth curves through a sequence of points using
/// Catmull-Rom spline interpolation, which is converted to cubic Bezier curves
/// for compatibility with the Skia path API.
///
/// The control points are clamped to prevent overshoot at sharp turns,
/// ensuring the resulting curves stay within reasonable bounds.
///
/// # Arguments
///
/// * `builder` - The PathBuilder to add segments to
/// * `pts` - Array of points to interpolate through
/// * `continue_path` - Whether to continue from the current path position or start a new subpath
fn add_catmull_segments(builder: &mut PathBuilder, pts: &[(f32, f32)], continue_path: bool) {
    if pts.is_empty() {
        return;
    }
    if !continue_path {
        builder.move_to(pts[0]);
    }
    for i in 0..pts.len() - 1 {
        let p0 = if i == 0 { pts[0] } else { pts[i - 1] };
        let p1 = pts[i];
        let p2 = pts[i + 1];
        let p3 = if i + 2 < pts.len() {
            pts[i + 2]
        } else {
            pts[i + 1]
        };

        let mut c1 = (p1.0 + (p2.0 - p0.0) / 6.0, p1.1 + (p2.1 - p0.1) / 6.0);
        let mut c2 = (p2.0 - (p3.0 - p1.0) / 6.0, p2.1 - (p3.1 - p1.1) / 6.0);

        // Clamp handle lengths to avoid overshoot at sharp turns
        let seg_len_prev = ((p1.0 - p0.0).hypot(p1.1 - p0.1)).max(1e-6);
        let seg_len_next = ((p2.0 - p1.0).hypot(p2.1 - p1.1)).max(1e-6);
        let max_h = 0.5_f32 * seg_len_prev.min(seg_len_next);

        let clamp_handle = |anchor: (f32, f32), ctrl: (f32, f32)| {
            let vx = ctrl.0 - anchor.0;
            let vy = ctrl.1 - anchor.1;
            let d = (vx * vx + vy * vy).sqrt();
            if d <= max_h {
                ctrl
            } else {
                (anchor.0 + vx * (max_h / d), anchor.1 + vy * (max_h / d))
            }
        };

        c1 = clamp_handle(p1, c1);
        c2 = clamp_handle(p2, c2);

        builder.cubic_to(c1, c2, p2);
    }
}
