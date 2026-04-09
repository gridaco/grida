//! Image loader for the grida-dev runtime.
//!
//! Resolves image URLs (local paths and remote HTTP) into decoded bytes
//! and a [`PreloadedImages`] provider for the htmlcss rendering pipeline.
//!
//! This module is host-specific — it uses `std::fs` for local files and
//! `reqwest` for remote fetches. The htmlcss module itself is host-agnostic
//! and only sees the [`ImageProvider`] trait.

use std::path::Path;

use cg::htmlcss::PreloadedImages;
use cg::resources::ImageMessage;

/// Pre-loaded images: `(url_key, raw_bytes)`.
///
/// Keys match what `htmlcss::collect_image_urls()` returns — relative
/// paths for local files, full URLs for remote resources.
pub type ImageData = Vec<(String, Vec<u8>)>;

/// Resolve image URLs and load them from disk or network.
///
/// - **Local paths**: resolved relative to `base_dir` via `std::fs::read`
/// - **Remote URLs** (`http://`, `https://`): fetched in parallel via `reqwest`
///   with a 15s timeout and HTTP status validation
///
/// Returns a [`PreloadedImages`] for htmlcss measurement/rendering and a
/// list of `(url, bytes)` pairs for registering with the canvas renderer.
pub async fn load_images(urls: &[String], base_dir: &Path) -> (PreloadedImages, ImageData) {
    let mut preloaded = PreloadedImages::new();
    let mut loaded = Vec::new();

    let mut local_results: Vec<(String, Option<Vec<u8>>)> = Vec::new();
    let mut remote_futures = Vec::new();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap_or_default();

    for url in urls {
        if url.starts_with("http://") || url.starts_with("https://") {
            let url = url.clone();
            let client = client.clone();
            remote_futures.push(async move {
                eprintln!("  [img] fetching {url} ...");
                let result = match client.get(&url).send().await {
                    Ok(resp) => match resp.error_for_status() {
                        Ok(resp) => match resp.bytes().await {
                            Ok(b) => {
                                eprintln!("  [img] fetched {url} ({} bytes)", b.len());
                                Some(b.to_vec())
                            }
                            Err(e) => {
                                eprintln!("  [img] fetch body failed {url}: {e}");
                                None
                            }
                        },
                        Err(e) => {
                            eprintln!("  [img] fetch rejected {url}: {e}");
                            None
                        }
                    },
                    Err(e) => {
                        eprintln!("  [img] fetch failed {url}: {e}");
                        None
                    }
                };
                (url, result)
            });
        } else {
            let resolved = base_dir.join(url);
            let bytes = match std::fs::read(&resolved) {
                Ok(b) => Some(b),
                Err(e) => {
                    eprintln!(
                        "  [img] read failed {} (resolved: {}): {e}",
                        url,
                        resolved.display()
                    );
                    None
                }
            };
            local_results.push((url.clone(), bytes));
        }
    }

    // Fetch all remote images concurrently
    let remote_results = futures::future::join_all(remote_futures).await;

    for (url, bytes) in local_results.into_iter().chain(remote_results) {
        if let Some(bytes) = bytes {
            preloaded.insert_bytes(url.clone(), &bytes);
            loaded.push((url, bytes));
        }
    }

    if !loaded.is_empty() {
        eprintln!("  [img] loaded {}/{} images", loaded.len(), urls.len());
    }

    (preloaded, loaded)
}

/// Convert `ImageData` into `ImageMessage`s for the renderer's image channel.
///
/// The application's `process_image_queue()` detects non-`res://` keys
/// and routes them to `add_image_by_url()`.
pub fn into_image_messages(data: ImageData) -> Vec<ImageMessage> {
    data.into_iter()
        .map(|(url, bytes)| ImageMessage {
            src: url,
            data: bytes,
        })
        .collect()
}
