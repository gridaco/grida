//! SVG DOM view over `csscascade::DemoDom`.
//!
//! Same approach as Chromium: there is **no separate SVG parser**. Inline
//! `<svg>` and standalone `.svg` are both fed through the existing
//! `csscascade::DemoDom` (html5ever foreign-content handling) so SVG nodes
//! arrive in the same tree as HTML — namespace-tagged via `ns!(svg)`.
//! Stylo cascade applies to them with no special-casing, exactly like
//! Blink.
//!
//! This subdirectory exposes thin helpers for navigating that tree as SVG:
//! - [`parser`]: parse SVG bytes into a `DemoDom` and locate the `<svg>`
//!   root.
//! - [`element`]: tag-kind dispatch, attribute lookup, child iteration.
//! - [`attrs`]: parsers for `length`, `color`, `viewBox`, `transform`,
//!   `points`, etc.
//! - [`href`], [`path_d`]: URL/fragment reference and path-data helpers.
//!
//! Blink anchor: `core/svg/svg_*_element.{h,cc}` — but the *parsing* and
//! *cascade* anchors are unified with the HTML side at
//! `core/dom/document.cc` + `core/css/`.

pub mod attrs;
pub mod element;
pub mod href;
pub mod parser;
pub mod path_d;
