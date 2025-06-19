use std::collections::HashMap;

use async_trait::async_trait;

use crate::resource_loader::ResourceLoader;

#[cfg(not(target_arch = "wasm32"))]
use reqwest;
#[cfg(not(target_arch = "wasm32"))]
use tokio::sync::mpsc;
#[cfg(not(target_arch = "wasm32"))]
use winit::event_loop::EventLoopProxy;

/// Represents a font loading mode
#[cfg(not(target_arch = "wasm32"))]
pub enum FontLoadingMode {
    /// Simple mode - direct loading without lifecycle management
    Simple,
    /// Lifecycle mode - full lifecycle management with async loading
    Lifecycle {
        tx: mpsc::UnboundedSender<FontMessage>,
        proxy: EventLoopProxy<()>,
    },
}

#[cfg(target_arch = "wasm32")]
pub enum FontLoadingMode {
    /// Simple mode - direct loading without lifecycle management
    Simple,
}

/// Message type for font loading
#[derive(Debug, Clone)]
pub struct FontMessage {
    /// The font family name. This will be used when resolving fonts in
    /// `TextStyle`.
    pub family: String,
    /// Alias used when registering the font with Skia. For static font files
    /// that represent different styles of the same family, this allows us to
    /// register multiple fonts under a shared family without overwriting the
    /// previous ones in the repository.
    pub alias: String,
    pub data: Vec<u8>,
}

/// Manages font loading and caching
pub struct FontLoader {
    mode: FontLoadingMode,
    // cache keyed by alias so that multiple fonts of the same family can exist
    // without replacing each other
    cache: HashMap<String, Vec<u8>>,
}

impl FontLoader {
    /// Create a new FontLoader with the specified mode
    pub fn new(mode: FontLoadingMode) -> Self {
        Self {
            mode,
            cache: HashMap::new(),
        }
    }

    /// Create a simple font loader without lifecycle management
    pub fn new_simple() -> Self {
        Self::new(FontLoadingMode::Simple)
    }

    #[cfg(not(target_arch = "wasm32"))]
    /// Create a lifecycle-based font loader
    pub fn new_lifecycle(
        tx: mpsc::UnboundedSender<FontMessage>,
        proxy: EventLoopProxy<()>,
    ) -> Self {
        Self::new(FontLoadingMode::Lifecycle { tx, proxy })
    }

    /// Load a font from a URL or file path using a specific alias. The alias
    /// is used as the key for caching and will be passed through the channel
    /// so the renderer can register the font with that alias.
    pub async fn load_font_with_alias(
        &mut self,
        family: &str,
        alias: &str,
        src: &str,
    ) -> Option<Vec<u8>> {
        // Check cache first
        if let Some(data) = self.cache.get(alias) {
            return Some(data.clone());
        }

        // Load the font
        let data = match self.fetch_font_data(src).await {
            Ok(data) => data,
            Err(e) => {
                eprintln!("Failed to load font {}: {}", src, e);
                return None;
            }
        };

        // Cache the data using the alias as the key
        self.cache.insert(alias.to_string(), data.clone());

        // If in lifecycle mode, send the font data through the channel
        #[cfg(not(target_arch = "wasm32"))]
        if let FontLoadingMode::Lifecycle { tx, proxy } = &self.mode {
            let _ = tx.send(FontMessage {
                family: family.to_string(),
                alias: alias.to_string(),
                data: data.clone(),
            });
            let _ = proxy.send_event(());
        }

        Some(data)
    }

    /// Convenience wrapper that uses the same string for both the family and
    /// alias.
    pub async fn load_font(&mut self, family: &str, src: &str) -> Option<Vec<u8>> {
        self.load_font_with_alias(family, family, src).await
    }

    /// Fetch font data from URL or file
    async fn fetch_font_data(&self, path: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        #[cfg(not(target_arch = "wasm32"))]
        if path.starts_with("http") {
            let response = reqwest::get(path).await?;
            Ok(response.bytes().await?.to_vec())
        } else {
            Ok(std::fs::read(path)?)
        }

        #[cfg(target_arch = "wasm32")]
        Err("Font loading not supported in wasm".into())
    }

    /// Clear the font cache
    pub fn clear_cache(&mut self) {
        self.cache.clear();
    }

    /// Remove a specific font from the cache using its alias
    pub fn remove_from_cache(&mut self, alias: &str) {
        self.cache.remove(alias);
    }
}

#[async_trait]
impl ResourceLoader for FontLoader {
    type Output = Vec<u8>;

    async fn load(&mut self, key: &str, src: &str) -> Option<Self::Output> {
        self.load_font_with_alias(key, key, src).await
    }

    async fn unload(&mut self, key: &str) {
        self.remove_from_cache(key);
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub async fn load_font(path: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let response = reqwest::get(path).await?;
    let bytes = response.bytes().await?;
    Ok(bytes.to_vec())
}

#[cfg(target_arch = "wasm32")]
pub async fn load_font(path: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    // Stub for wasm
    Err("Font loading not supported in wasm".into())
}
