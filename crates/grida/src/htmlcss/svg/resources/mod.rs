//! SVG resources — paint servers, clip/mask/filter/marker definitions.
//!
//! Mirrors Blink's `core/layout/svg/layout_svg_resource_*` family. Each
//! resource type lives behind a hidden container in the layout tree; the
//! `ResourceTable` (in `mod.rs`) maps `id` → resource and is the
//! single point through which `url(#id)` is resolved.
//!
//! Per-client realization caches are key-per-client because
//! `objectBoundingBox` units make the realized form bbox-dependent.
//!
//! Blink anchor: `core/layout/svg/layout_svg_resource_*.{h,cc}` and
//! `core/layout/svg/svg_resources.{h,cc}`.

pub mod cache;
pub mod clipper;
pub mod filter;
pub mod gradient;
pub mod masker;
pub mod paint_server;
pub mod pattern;
pub mod svg_filter_builder;
pub mod svg_resource_container;
pub mod svg_resources;
