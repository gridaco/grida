use serde::{Deserialize, Serialize};

/// A single stop in a variable-width profile.
///
/// `pos` is the normalized position along the stroke in [0, 1].
/// `r` is the half-width at this position in pixels.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct WidthStop {
    /// Normalized position along the stroke [0, 1].
    #[serde(rename = "u")]
    pub u: f32,
    /// Half-width at this position in pixels.
    #[serde(rename = "r")]
    pub r: f32,
}

/// Definition of a variable-width profile for a stroke.
///
/// Contains a base width and a set of width stops.
/// Can build a sampler for efficient runtime queries.
#[derive(Clone, Debug)]
pub struct VarWidthProfile {
    /// Base half-width used when no stops are defined.
    pub base: f32,
    /// Width stops defining the profile at various normalized positions.
    pub stops: Vec<WidthStop>,
}

/// Preprocessed, immutable sampler built from a `VarWidthProfile`.
///
/// Provides efficient runtime queries of half-width at any normalized position.
#[derive(Clone, Debug)]
pub struct VarWidthSampler {
    /// Base half-width used when no stops are defined.
    base: f32,
    /// Sorted and deduplicated width stops for interpolation.
    stops: Vec<WidthStop>,
}

impl VarWidthSampler {
    /// Build a sampler from a variable width profile.
    pub fn build_sampler(profile: &VarWidthProfile) -> VarWidthSampler {
        let mut stops = profile.stops.clone();
        stops.sort_by(|a, b| a.u.partial_cmp(&b.u).unwrap());
        // dedupe tiny pos deltas
        let mut dedup: Vec<WidthStop> = Vec::with_capacity(stops.len());
        for s in stops.into_iter() {
            if let Some(last) = dedup.last_mut() {
                if (last.u - s.u).abs() < 1e-6 {
                    last.r = s.r;
                    continue;
                }
            }
            dedup.push(s);
        }
        VarWidthSampler {
            base: profile.base,
            stops: dedup,
        }
    }

    /// Sample half-width at u∈[0,1] with Catmull-Rom spline interpolation.
    pub fn r(&self, u: f32) -> f32 {
        let x = u.clamp(0.0, 1.0);
        if self.stops.is_empty() {
            return self.base.max(0.0);
        }
        if x <= self.stops[0].u {
            return self.stops[0].r.max(0.0);
        }
        if x >= self.stops[self.stops.len() - 1].u {
            return self.stops.last().unwrap().r.max(0.0);
        }
        // binary search segment
        let mut lo = 0usize;
        let mut hi = self.stops.len() - 1;
        while lo + 1 < hi {
            let mid = (lo + hi) / 2;
            if self.stops[mid].u <= x {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        let a = self.stops[lo];
        let b = self.stops[lo + 1];
        let span = (b.u - a.u).max(1e-9);
        let local = (x - a.u) / span;
        let r0 = if lo == 0 { a.r } else { self.stops[lo - 1].r };
        let r1 = a.r;
        let r2 = b.r;
        let r3 = self.stops.get(lo + 2).map(|s| s.r).unwrap_or(b.r);
        let y = catmull_rom(r0, r1, r2, r3, local);
        // clamp to the local span [min(r1,r2), max(r1,r2)] to prevent ringing/overshoot
        let (mn, mx) = if r1 <= r2 { (r1, r2) } else { (r2, r1) };
        y.max(mn).min(mx).max(0.0)
    }
}

// TODO: move to math2
#[inline]
fn catmull_rom(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
    let t2 = t * t;
    let t3 = t2 * t;
    0.5 * (2.0 * p1
        + (p2 - p0) * t
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3)
}
