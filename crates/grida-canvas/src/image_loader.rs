use crate::node::schema::*;
use std::collections::HashMap;

use async_trait::async_trait;

use crate::resource_loader::ResourceLoader;

#[cfg(not(target_arch = "wasm32"))]
use reqwest;
#[cfg(not(target_arch = "wasm32"))]
use tokio::sync::mpsc;
#[cfg(not(target_arch = "wasm32"))]
use winit::event_loop::EventLoopProxy;

/// Represents an image loading mode
#[cfg(not(target_arch = "wasm32"))]
pub enum ImageLoadingMode {
    /// Simple mode - direct loading without lifecycle management
    Simple,
    /// Lifecycle mode - full lifecycle management with async loading
    Lifecycle {
        tx: mpsc::UnboundedSender<ImageMessage>,
        proxy: EventLoopProxy<()>,
    },
}

#[cfg(target_arch = "wasm32")]
pub enum ImageLoadingMode {
    /// Simple mode - direct loading without lifecycle management
    Simple,
}

/// Message type for image loading
#[derive(Debug, Clone)]
pub struct ImageMessage {
    pub src: String,
    pub data: Vec<u8>,
}

/// Manages image loading and caching
pub struct ImageLoader {
    mode: ImageLoadingMode,
    cache: HashMap<String, Vec<u8>>,
}

impl ImageLoader {
    /// Create a new ImageLoader with the specified mode
    pub fn new(mode: ImageLoadingMode) -> Self {
        Self {
            mode,
            cache: HashMap::new(),
        }
    }

    /// Create a simple image loader without lifecycle management
    pub fn new_simple() -> Self {
        Self::new(ImageLoadingMode::Simple)
    }

    #[cfg(not(target_arch = "wasm32"))]
    /// Create a lifecycle-based image loader
    pub fn new_lifecycle(
        tx: mpsc::UnboundedSender<ImageMessage>,
        proxy: EventLoopProxy<()>,
    ) -> Self {
        Self::new(ImageLoadingMode::Lifecycle { tx, proxy })
    }

    /// Load an image from a URL or file path
    pub async fn load_image(&mut self, src: &str) -> Option<Vec<u8>> {
        // Check cache first
        if let Some(data) = self.cache.get(src) {
            return Some(data.clone());
        }

        // Load the image
        let data = match self.fetch_image_data(src).await {
            Ok(data) => data,
            Err(e) => {
                // eprintln!("Failed to load image {}: {}", src, e);
                return None;
            }
        };

        // Cache the data
        self.cache.insert(src.to_string(), data.clone());

        // If in lifecycle mode, send the image data through the channel
        #[cfg(not(target_arch = "wasm32"))]
        if let ImageLoadingMode::Lifecycle { tx, proxy } = &self.mode {
            let _ = tx.send(ImageMessage {
                src: src.to_string(),
                data: data.clone(),
            });
            let _ = proxy.send_event(());
        }

        Some(data)
    }

    /// Fetch image data from URL or file
    async fn fetch_image_data(&self, path: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        #[cfg(not(target_arch = "wasm32"))]
        if path.starts_with("http") {
            let response = reqwest::get(path).await?;
            Ok(response.bytes().await?.to_vec())
        } else {
            Ok(std::fs::read(path)?)
        }

        #[cfg(target_arch = "wasm32")]
        Err("Image loading not supported in wasm".into())
    }

    /// Clear the image cache
    pub fn clear_cache(&mut self) {
        self.cache.clear();
    }

    /// Remove a specific image from the cache
    pub fn remove_from_cache(&mut self, src: &str) {
        self.cache.remove(src);
    }
}

#[async_trait]
impl ResourceLoader for ImageLoader {
    type Output = Vec<u8>;

    async fn load(&mut self, key: &str, src: &str) -> Option<Self::Output> {
        // For images, the key and src are generally the same
        let path = if src.is_empty() { key } else { src };
        self.load_image(path).await
    }

    async fn unload(&mut self, key: &str) {
        self.remove_from_cache(key);
    }
}

/// Helper function to extract image URLs from a scene
pub fn extract_image_urls(scene: &Scene) -> Vec<String> {
    scene
        .nodes
        .iter()
        .filter_map(|(_, n)| match n {
            Node::Rectangle(rect) => match (&rect.fill, &rect.stroke) {
                (Paint::Image(img), _) => Some(img._ref.clone()),
                (_, Paint::Image(img)) => Some(img._ref.clone()),
                _ => None,
            },
            _ => None,
        })
        .collect()
}

/// Helper function to load all images in a scene
pub async fn load_scene_images<L>(loader: &mut L, scene: &Scene)
where
    L: ResourceLoader<Output = Vec<u8>> + Send,
{
    let urls = extract_image_urls(scene);
    for url in urls {
        let _ = loader.load(&url, &url).await;
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub async fn load_image(path: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let response = reqwest::get(path).await?;
    let bytes = response.bytes().await?;
    Ok(bytes.to_vec())
}

#[cfg(target_arch = "wasm32")]
pub async fn load_image(path: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    // Stub for wasm
    Err("Image loading not supported in wasm".into())
}
