use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use skia_safe::{self, Image};

use crate::{
    cache::mipmap::{ImageMipmaps, MipmapConfig},
    resources::ByteStore,
};

/// A repository for managing images with automatic ID indexing.
#[derive(Debug, Clone)]
pub struct ImageRepository {
    images: HashMap<String, ImageMipmaps>,
    config: MipmapConfig,
    store: Arc<Mutex<ByteStore>>,
}

impl ImageRepository {
    /// Creates a new empty image repository backed by a [`ByteStore`].
    pub fn new(store: Arc<Mutex<ByteStore>>) -> Self {
        Self {
            images: HashMap::new(),
            config: MipmapConfig::default(),
            store,
        }
    }

    /// Creates a repository with custom mipmap configuration.
    pub fn with_config(store: Arc<Mutex<ByteStore>>, config: MipmapConfig) -> Self {
        Self {
            images: HashMap::new(),
            config,
            store,
        }
    }

    /// Access the underlying [`ByteStore`].
    pub fn store(&self) -> Arc<Mutex<ByteStore>> {
        Arc::clone(&self.store)
    }

    /// Adds an image to the repository from bytes referenced by `hash`.
    pub fn insert(&mut self, src: String, hash: u64) -> Option<(u32, u32)> {
        if let Some(bytes) = self.store.lock().unwrap().get(hash) {
            let data = skia_safe::Data::new_copy(bytes);
            if let Some(image) = Image::from_encoded(data) {
                let width = image.width() as u32;
                let height = image.height() as u32;
                let set = ImageMipmaps::from_image(image, &self.config);
                self.images.insert(src, set);
                return Some((width, height));
            }
        }
        None
    }

    /// Gets a reference to an image by its source URL and desired size.
    pub fn get_by_size(&self, src: &str, width: f32, height: f32) -> Option<&Image> {
        self.images
            .get(src)
            .and_then(|set| set.best_for_size(width, height))
    }

    /// Gets the dimensions of an image by its source URL.
    pub fn get_size(&self, src: &str) -> Option<(u32, u32)> {
        self.images.get(src).and_then(|set| set.dimensions())
    }

    /// Removes an image from the repository by its source URL.
    pub fn remove(&mut self, src: &str) -> Option<ImageMipmaps> {
        self.images.remove(src)
    }

    /// Number of stored images.
    pub fn len(&self) -> usize {
        self.images.len()
    }

    /// Whether repository is empty.
    pub fn is_empty(&self) -> bool {
        self.images.is_empty()
    }
}
