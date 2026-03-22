//! Per-node layer compositing cache.
//!
//! Each "promoted" node gets metadata tracked here. The actual pixel data
//! is sourced either from an individual `SkImage` (fallback) or from a
//! sub-rect of a shared texture atlas (batch-friendly compositing).
//! See [`ImageSource`] for the distinction.

pub mod cache;
pub mod invalidation;
pub mod promotion;

pub use cache::{ImageSource, LayerImage, LayerImageCache, LayerImageCacheStats};
pub use invalidation::InvalidationEvent;
pub use promotion::PromotionStatus;
