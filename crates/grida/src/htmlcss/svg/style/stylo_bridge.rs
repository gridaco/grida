//! Stylo cascade bridge — placeholder for the future replacement of
//! the in-tree CSS matcher (`stylesheet.rs`).
//!
//! The current matcher is a 942-LOC subset that handles selector
//! matching, specificity, the cascade order, and `@import` recursion.
//! It exists only because plugging Stylo into this module wasn't
//! ready when V1 landed. Once Stylo is wired up, every call into
//! `stylesheet` should route through `style::cascade` (which today is
//! a thin re-export but will become the Stylo entry point), and this
//! file will hold the Stylo glue.
//!
//! See: `docs/wg/feat-2d/htmlcss-svg.md` §S4 for the migration plan.

// Intentionally empty. The first commit that wires Stylo lives here.
