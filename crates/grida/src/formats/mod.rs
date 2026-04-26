//! Format-internal toolings.
//!
//! Tools that operate on a single external format and **do not** produce or
//! consume Grida types — pure format-in / format-out, or format → standard
//! parser tree. See [`crate::import`] for the convert-to-Grida pipelines and
//! [`crate::htmlcss`] for render-time engines.

pub mod markdown;
pub mod svg;
