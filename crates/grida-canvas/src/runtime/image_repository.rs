use std::{
    cell::RefCell,
    collections::{HashMap, HashSet},
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
    /// Image refs encountered during render that were not found in the repository.
    /// Uses `RefCell` for interior mutability — `get_by_size` remains `&self` so the
    /// painter can hold an immutable borrow while recording misses.
    missing_refs: RefCell<HashSet<String>>,
    /// Image refs already surfaced to the caller via `drain_missing`.
    /// Prevents re-reporting the same ref on every frame.
    reported_refs: HashSet<String>,
}

impl ImageRepository {
    /// Creates a new empty image repository backed by a [`ByteStore`].
    pub fn new(store: Arc<Mutex<ByteStore>>) -> Self {
        Self {
            images: HashMap::new(),
            config: MipmapConfig::default(),
            store,
            missing_refs: RefCell::new(HashSet::new()),
            reported_refs: HashSet::new(),
        }
    }

    /// Creates a repository with custom mipmap configuration.
    pub fn with_config(store: Arc<Mutex<ByteStore>>, config: MipmapConfig) -> Self {
        Self {
            images: HashMap::new(),
            config,
            store,
            missing_refs: RefCell::new(HashSet::new()),
            reported_refs: HashSet::new(),
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
                self.images.insert(src.clone(), set);
                // Clear from tracking — this ref is now satisfied.
                self.missing_refs.borrow_mut().remove(&src);
                self.reported_refs.remove(&src);
                return Some((width, height));
            }
        }
        None
    }

    /// Gets a reference to an image by its source URL and desired size.
    /// Records the ref as missing if not found (for lazy loading).
    pub fn get_by_size(&self, src: &str, width: f32, height: f32) -> Option<&Image> {
        if let Some(set) = self.images.get(src) {
            set.best_for_size(width, height)
        } else {
            self.missing_refs.borrow_mut().insert(src.to_owned());
            None
        }
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

    /// Returns image refs that were requested during render but not found,
    /// excluding refs already reported in a previous drain.
    /// After draining, these refs are marked as reported.
    pub fn drain_missing(&mut self) -> Vec<String> {
        let mut missing = self.missing_refs.borrow_mut();
        let new: Vec<String> = missing
            .difference(&self.reported_refs)
            .cloned()
            .collect();
        self.reported_refs.extend(new.iter().cloned());
        missing.clear();
        new
    }

    /// Clears all missing/reported tracking state.
    /// Call on document reset or scene load.
    pub fn clear_missing_tracking(&mut self) {
        self.missing_refs.borrow_mut().clear();
        self.reported_refs.clear();
    }
}
