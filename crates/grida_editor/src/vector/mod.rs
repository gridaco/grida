//! Vector editing — the vector content-edit mode and the pen.
//!
//! Reference implementation of `docs/wg/feat-vector-network/vector-edit.md`
//! (`VEC-*` contracts). The module splits along testing seams:
//!
//! - [`ops`] — pure network editing operations over the engine's
//!   [`grida::vectornetwork::VectorNetwork`] value: topology (add,
//!   delete, split), tangents (update with mirroring, bend), refit,
//!   optimize. No editor, no document, no mode state — the `VEC-6/9/10`
//!   math cores are unit-testable here.
//! - [`hit`] — pure hover / pen-target / marquee resolution over a
//!   network + local cursor + zoom (`VEC-8/12` at the unit level).
//! - [`mode`] — the mode machine: the edit-mode slot's vector member
//!   ([`crate::mode`]), pen state, sub-selection, gestures, lifecycle.
//!
//! **Deferred, named (no fakes):** the lasso tool (marquee sub-select
//! ships; the freeform lasso joins it), the width facet
//! (`edit-mode.md` MODE-4), vector-mode snapping beyond the network's
//! own geometry (`snap-vector.md` — VSNAP is a reserved placeholder;
//! the pen's vertex/segment thresholds in [`hit`] are contract-bound
//! now and are not VSNAP), and region *derivation* (closed pen loops
//! do not synthesize fillable regions — regions are derived, never
//! authored; the planarize port is its own feature).

pub mod chrome;
pub mod hit;
pub mod mode;
pub mod ops;

/// Which end of a segment a tangent belongs to: `A` addresses `ta`,
/// `B` addresses `tb`.
///
/// Tangents are addressed `(segment, end)` — the truth the network
/// model stores. The spec's "vertex + side" view is derivable from it
/// for the degree ≤ 2 chrome and is not a second address space.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum SegEnd {
    A,
    B,
}
