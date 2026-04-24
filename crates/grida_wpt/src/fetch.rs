//! HTTP fetch helper for `--url` mode.
//!
//! WPT tests are served from a local `wpt serve` (or equivalent). We
//! fetch the HTML as a string and render it with the `cg::htmlcss`
//! pipeline exactly as if it had been read from disk. External
//! asset URLs (`<link href>`, `<img src>`) are *not* resolved here —
//! the cg htmlcss renderer does not yet support a base URL. When
//! external-stylesheet support lands (plan P4) this module should
//! grow to thread a base URL through to the renderer.

use std::time::Duration;

/// Fetch a URL as UTF-8 text. Panics on non-2xx or network errors —
/// the CLI is expected to be supervised by `wptrunner`, which treats
/// a non-zero exit as a CRASH and surfaces it in the log.
pub fn fetch_text(url: &str) -> String {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(5))
        .timeout_read(Duration::from_secs(30))
        .build();
    let resp = agent
        .get(url)
        .call()
        .unwrap_or_else(|e| panic!("GET {url} failed: {e}"));
    resp.into_string()
        .unwrap_or_else(|e| panic!("GET {url} body read failed: {e}"))
}

/// Derive a filename stem from a URL path. Strips the leading path
/// and trailing `.html`/`.xht`/`.xhtml`/`.htm` extension. Falls back
/// to `"page"` if the URL has no path component.
pub fn stem_from_url(url: &str) -> String {
    let parsed = match url::Url::parse(url) {
        Ok(u) => u,
        Err(_) => return "page".to_string(),
    };
    let last = parsed
        .path_segments()
        .and_then(|mut s| s.rfind(|p| !p.is_empty()))
        .unwrap_or("page");
    let lower = last.to_ascii_lowercase();
    for ext in [".xhtml", ".html", ".htm", ".xht"] {
        if let Some(stem) = lower.strip_suffix(ext) {
            return last[..stem.len()].to_string();
        }
    }
    last.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stem_basic() {
        assert_eq!(
            stem_from_url("http://web-platform.test:8000/css/css-transforms/2d-rotate-001.html"),
            "2d-rotate-001"
        );
    }

    #[test]
    fn stem_xht() {
        assert_eq!(
            stem_from_url("http://example.com/foo/bar-baz.xht"),
            "bar-baz"
        );
    }

    #[test]
    fn stem_no_extension() {
        assert_eq!(stem_from_url("http://example.com/foo/bar"), "bar");
    }

    #[test]
    fn stem_empty_path() {
        assert_eq!(stem_from_url("http://example.com/"), "page");
    }
}
