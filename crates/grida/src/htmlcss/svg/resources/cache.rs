//! Per-client resource cache (scaffolding).
//!
//! Per the design study, SVG resources realize differently per client
//! because `*Units="objectBoundingBox"` makes the realized form
//! bbox-dependent. Today every paint of a clipped/gradient-filled/
//! filtered shape re-walks the resource subtree; this module reserves
//! the API surface so the caching plumbing can be wired without later
//! threading a parameter through every `resolve_*` call.
//!
//! Blink anchor: `core/layout/svg/svg_resources.h::SVGElementResourceClient`
//! holds the per-client cache and the invalidation mask
//! (`InvalidationMode`). We mirror only the cache; static rendering
//! has nothing to invalidate.
//!
//! TODO: implement actual storage. Today the [`ResourceCache`] is a
//! zero-sized type whose methods are no-ops; behavior is unchanged
//! from "compute fresh every time".

/// Per-paint resource cache. Currently a no-op placeholder.
///
/// Cache keys are intentionally not part of the public surface yet —
/// once we have a profile that demands caching we'll know which
/// `(NodeId, bbox_hash, …)` tuples are worth keying on.
#[derive(Default, Debug)]
pub struct ResourceCache {
    _private: (),
}

impl ResourceCache {
    pub fn new() -> Self {
        Self { _private: () }
    }
}
