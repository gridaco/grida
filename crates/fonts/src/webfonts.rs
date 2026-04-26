//! Grida Webfonts service client.
//!
//! A thin client for `https://fonts.grida.co` that fetches the webfont
//! metadata JSON and resolves font URLs by family.
//!
//! This module is gated behind the `webfonts` feature so the base `fonts`
//! crate stays focused on font parsing. Pull it in only when you need to
//! load fonts from the Grida webfont service:
//!
//! ```toml
//! fonts = { path = "...", features = ["webfonts"] }
//! ```
//!
//! The network functions are native-only. On `wasm32` they compile but
//! return an error at runtime; resolve URLs server-side or via a
//! different transport in browser builds.

use serde_json::Value;

/// Resolved webfont entry: a single file URL for a family/style/postscript triple.
#[derive(Debug, Clone)]
pub struct FontFileInfo {
    pub family: String,
    pub postscript_name: String,
    pub style: String,
    pub url: String,
}

/// Fetch `https://fonts.grida.co/webfonts.metadata.json` and parse it as JSON.
#[cfg(not(target_arch = "wasm32"))]
pub async fn load_webfonts_metadata() -> Result<Value, String> {
    let url = "https://fonts.grida.co/webfonts.metadata.json";
    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to fetch webfonts metadata: {}", e))?;

    let content = response
        .text()
        .await
        .map_err(|e| format!("Failed to read webfonts metadata response: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse webfonts metadata: {}", e))
}

/// `wasm32` stub — the webfont service must be reached via a different transport.
#[cfg(target_arch = "wasm32")]
pub async fn load_webfonts_metadata() -> Result<Value, String> {
    Err("Webfonts metadata fetching not supported in wasm".into())
}

/// Resolve every available file URL for the given families against the metadata document.
///
/// Family lookup is case-insensitive. The returned entries enumerate every style
/// listed in `files` for each matched family.
pub fn find_font_files_by_family(metadata: &Value, font_families: &[String]) -> Vec<FontFileInfo> {
    let mut font_files = Vec::new();

    for family in font_families {
        let font_data = metadata.as_object().and_then(|obj| {
            obj.iter()
                .find(|(key, _)| key.to_lowercase() == family.to_lowercase())
                .map(|(_, value)| value)
        });

        if let Some(font_data) = font_data {
            if let Some(files) = font_data.get("files").and_then(|v| v.as_object()) {
                for (style, url) in files {
                    if let Some(url) = url.as_str() {
                        font_files.push(FontFileInfo {
                            family: family.clone(),
                            postscript_name: style.clone(),
                            style: style.clone(),
                            url: url.to_string(),
                        });
                    }
                }
            }
        }
    }

    font_files
}
