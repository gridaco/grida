//! Embedded Grida-flavored Markdown CSS stylesheet.
//!
//! A minimal stylesheet targeting bare HTML elements produced by
//! `pulldown-cmark` (GFM mode). Uses element selectors only — no
//! GitHub-specific classes — with explicit px/rgb values.
//!
//! Source: `fixtures/css/grida-markdown.css`
//! Symlink: `assets/css/grida-markdown.css`
//!
//! To update: edit the fixture file and rebuild.

/// Grida-flavored Markdown CSS (light theme).
///
/// Targets `.markdown-body` to scope styles and avoid leaking to other HTML.
pub static GITHUB_MARKDOWN_CSS: &str = include_str!("../../assets/css/grida-markdown.css");
