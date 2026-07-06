//! The gradient paint session (`docs/wg/canvas/paint-session/gradient.md`).
//!
//! The split mirrors vector edit:
//! - [`frame`] — the agnostic control-point math: the `{origin,
//!   primary, secondary}` frame and its round-trip with the gradient's
//!   user transform (`GRAD-1..5`).
//! - [`ops`] — pure value edits on the stops, and the ramp
//!   parametrization that places a stop on the frame (`GRAD-6/7`).
//! - [`hit`] — pure hover resolution over the frame points, stops, and
//!   the track, in screen-px thresholds.
//! - [`chrome`] — the pure state → [`HudDraw`](crate::hud::HudDraw)
//!   build.
//! - [`mode`] — the stateful session: entry/exit, selection, the drag
//!   machine and its gesture framing.

pub mod chrome;
pub mod frame;
pub mod hit;
pub mod mode;
pub mod ops;
