//! Texture atlas for batch-friendly GPU compositing.
//!
//! Packs per-node cached images into shared large textures so that
//! compositing blits use same-texture sub-rect draws instead of
//! switching between thousands of individual GPU textures.
//!
//! # Module Structure
//!
//! - [`packing`] — Pure-geometry shelf-based rectangle packing. No GPU types.
//! - [`atlas`] — Single atlas page: GPU surface + packer + slot-to-node mapping.
//! - [`atlas_set`] — Manages multiple atlas pages with overflow and eviction.

#[allow(clippy::module_inception)]
pub mod atlas;
pub mod atlas_set;
pub mod packing;
