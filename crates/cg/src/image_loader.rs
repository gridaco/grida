use std::collections::HashMap;
use tokio::sync::mpsc;
use winit::event_loop::EventLoopProxy;

/// Represents an image loading mode
pub enum ImageLoadingMode {
    /// Simple mode - direct loading without lifecycle management
    Simple,
    /// Lifecycle mode - full lifecycle management with async loading
    Lifecycle {
        tx: mpsc::UnboundedSender<ImageMessage>,
        proxy: EventLoopProxy<()>,
    },
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
                eprintln!("Failed to load image {}: {}", src, e);
                return None;
            }
        };

        // Cache the data
        self.cache.insert(src.to_string(), data.clone());

        // If in lifecycle mode, send the image data through the channel
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
        if path.starts_with("http") {
            let response = reqwest::get(path).await?;
            Ok(response.bytes().await?.to_vec())
        } else {
            Ok(std::fs::read(path)?)
        }
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

/// Helper function to extract image URLs from a scene
pub fn extract_image_urls(scene: &crate::schema::Scene) -> Vec<String> {
    scene
        .nodes
        .iter()
        .filter_map(|(_, n)| match n {
            crate::schema::Node::Rectangle(rect) => match (&rect.fill, &rect.stroke) {
                (crate::schema::Paint::Image(img), _) => Some(img._ref.clone()),
                (_, crate::schema::Paint::Image(img)) => Some(img._ref.clone()),
                _ => None,
            },
            _ => None,
        })
        .collect()
}

/// Helper function to load all images in a scene
pub async fn load_scene_images(loader: &mut ImageLoader, scene: &crate::schema::Scene) {
    let urls = extract_image_urls(scene);
    for url in urls {
        let _ = loader.load_image(&url).await;
    }
}
