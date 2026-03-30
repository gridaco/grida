use std::{
    cell::RefCell,
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};

use skia_safe::{self, Image};

use crate::resources::ByteStore;

/// A repository for managing images with Skia built-in mipmaps.
///
/// Images are stored with Skia's native mipmap chain attached via
/// [`Image::with_default_mipmaps()`]. Mipmap level selection happens
/// automatically at rasterization time based on the final canvas transform,
/// which correctly handles `Picture` playback at different zoom levels.
#[derive(Debug, Clone)]
pub struct ImageRepository {
    images: HashMap<String, Image>,
    store: Arc<Mutex<ByteStore>>,
    /// Image refs encountered during render that were not found in the repository.
    /// Uses `RefCell` for interior mutability — `get` remains `&self` so the
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
    ///
    /// The image is decoded and a Skia-native mipmap chain is attached.
    /// Skia evaluates the mipmap LOD at rasterization time based on the
    /// final transform, so this works correctly with `PictureCache`.
    pub fn insert(&mut self, src: String, hash: u64) -> Option<(u32, u32)> {
        if let Some(bytes) = self.store.lock().unwrap().get(hash) {
            let data = skia_safe::Data::new_copy(bytes);
            if let Some(image) = Image::from_encoded(data) {
                let width = image.width() as u32;
                let height = image.height() as u32;
                // Attach Skia's built-in mipmap chain. Falls back to the
                // original image if generation fails (e.g. 1×1 images).
                let mipmapped = image.with_default_mipmaps().unwrap_or(image);
                self.images.insert(src.clone(), mipmapped);
                // Clear from tracking — this ref is now satisfied.
                self.missing_refs.borrow_mut().remove(&src);
                self.reported_refs.remove(&src);
                return Some((width, height));
            }
        }
        None
    }

    /// Gets a reference to an image by its source URL.
    /// Records the ref as missing if not found (for lazy loading).
    pub fn get(&self, src: &str) -> Option<&Image> {
        if let Some(image) = self.images.get(src) {
            Some(image)
        } else {
            self.missing_refs.borrow_mut().insert(src.to_owned());
            None
        }
    }

    /// Gets the dimensions of an image by its source URL.
    pub fn get_size(&self, src: &str) -> Option<(u32, u32)> {
        self.images
            .get(src)
            .map(|img| (img.width() as u32, img.height() as u32))
    }

    /// Removes an image from the repository by its source URL.
    pub fn remove(&mut self, src: &str) -> Option<Image> {
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
        let new: Vec<String> = missing.difference(&self.reported_refs).cloned().collect();
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
