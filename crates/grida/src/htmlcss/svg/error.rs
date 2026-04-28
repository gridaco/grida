//! Errors produced by the SVG pipeline.
//!
//! Sole owner of the error surface for `htmlcss::svg`. Re-exported from
//! the parent module via `pub use`. Kept in its own file so that
//! introducing new variants doesn't churn `mod.rs`.

/// Errors produced by the SVG pipeline.
#[derive(Debug)]
pub enum SvgError {
    /// XML / HTML parse error (malformed input, unexpected EOF, etc.).
    Xml(String),
    /// Required structural element missing (e.g. no `<svg>` element).
    Structure(String),
    /// Unsupported feature encountered. Renderer is permissive by default;
    /// this variant is reserved for cases where a fallback would be silently
    /// wrong rather than visually incomplete.
    Unsupported(String),
}

impl std::fmt::Display for SvgError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SvgError::Xml(m) => write!(f, "SVG XML error: {m}"),
            SvgError::Structure(m) => write!(f, "SVG structure error: {m}"),
            SvgError::Unsupported(m) => write!(f, "SVG unsupported: {m}"),
        }
    }
}

impl std::error::Error for SvgError {}
