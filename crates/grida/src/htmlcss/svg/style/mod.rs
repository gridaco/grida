//! SVG style — author CSS rules from `<style>` blocks.
//!
//! This module owns CSS parsing and selector matching for `<style>`
//! blocks inside SVG documents, plus `@import` resolution against a
//! host-supplied [`crate::htmlcss::svg::CssLoader`]. It is **not** a full CSS
//! engine: presentation-attribute aliasing, inheritance flattening, and
//! computed-style materialisation live elsewhere (today: in the painter
//! / shape resolver, by direct attribute reads).
//!
//! ## Scope today
//!
//! - Parses `<style>` text into rules.
//! - Resolves `@import "…"` / `@import url(…)` recursively via
//!   `CssLoader`, with cycle and depth caps.
//! - Matches CSS Selectors L3 forms exercised by the resvg-test-suite
//!   (universal, type, id, class, attribute, descendant/child
//!   combinators, `!important`).
//! - Reports the cascaded value of a single property for a node via
//!   [`stylesheet::Stylesheet::match_property`]; callers merge that
//!   with inline `style=""` and presentation attributes.
//!
//! ## Scope **not** here today
//!
//! - No Stylo cascade. The plan's `stylo_bridge` was not wired; doing
//!   so would replace `stylesheet.rs`. See
//!   `docs/wg/feat-2d/htmlcss-svg.md` for the future-work note.
//! - No `SvgComputedStyle` value type. Each painter pulls the
//!   attributes it needs.
//! - No pseudo-classes (`:hover`, `:focus`), pseudo-elements,
//!   `@media`, `@supports`, custom properties, or layered cascade.

pub mod stylesheet;
pub mod stylo_bridge;
