use skia_safe::{
    FontMgr, Image,
    textlayout::{FontCollection, TypefaceFontProvider},
};

use crate::mipmap::{ImageMipmaps, MipmapConfig};
use std::collections::HashMap;

/// Generic repository trait for storing resources keyed by an identifier.
pub trait ResourceRepository<T> {
    type Id;

    /// Insert a resource with an identifier.
    fn insert(&mut self, id: Self::Id, item: T);

    /// Get a reference to a resource by id.
    fn get(&self, id: &Self::Id) -> Option<&T>;

    /// Get a mutable reference to a resource by id.
    fn get_mut(&mut self, id: &Self::Id) -> Option<&mut T>;

    /// Remove a resource, returning it if present.
    fn remove(&mut self, id: &Self::Id) -> Option<T>;

    /// Iterator over the resources.
    type Iter<'a>: Iterator<Item = (&'a Self::Id, &'a T)>
    where
        Self: 'a,
        T: 'a;

    fn iter(&self) -> Self::Iter<'_>;

    /// Number of stored resources.
    fn len(&self) -> usize;

    /// Whether repository is empty.
    fn is_empty(&self) -> bool;
}

/// A repository for managing images with automatic ID indexing.
#[derive(Debug, Clone)]
pub struct ImageRepository {
    /// The map of all images indexed by their source URLs
    images: HashMap<String, ImageMipmaps>,
    config: MipmapConfig,
}

impl ImageRepository {
    /// Creates a new empty image repository
    pub fn new() -> Self {
        Self {
            images: HashMap::new(),
            config: MipmapConfig::default(),
        }
    }

    /// Creates a repository with custom mipmap configuration
    pub fn with_config(config: MipmapConfig) -> Self {
        Self {
            images: HashMap::new(),
            config,
        }
    }

    /// Adds an image to the repository
    pub fn insert(&mut self, src: String, image: Image) {
        let set = ImageMipmaps::from_image(image, &self.config);
        self.images.insert(src, set);
    }

    /// Gets a reference to an image by its source URL and desired size
    pub fn get_by_size(&self, src: &str, width: f32, height: f32) -> Option<&Image> {
        self.images
            .get(src)
            .and_then(|set| set.best_for_size(width, height))
    }

    /// Removes an image from the repository by its source URL
    pub fn remove(&mut self, src: &str) -> Option<ImageMipmaps> {
        self.images.remove(src)
    }
}

impl ResourceRepository<ImageMipmaps> for ImageRepository {
    type Id = String;
    type Iter<'a> = std::collections::hash_map::Iter<'a, String, ImageMipmaps>;

    fn insert(&mut self, id: Self::Id, item: ImageMipmaps) {
        self.images.insert(id, item);
    }

    fn get(&self, id: &Self::Id) -> Option<&ImageMipmaps> {
        self.images.get(id)
    }

    fn get_mut(&mut self, id: &Self::Id) -> Option<&mut ImageMipmaps> {
        self.images.get_mut(id)
    }

    fn remove(&mut self, id: &Self::Id) -> Option<ImageMipmaps> {
        self.images.remove(id)
    }

    fn iter(&self) -> Self::Iter<'_> {
        self.images.iter()
    }

    fn len(&self) -> usize {
        self.images.len()
    }

    fn is_empty(&self) -> bool {
        self.images.is_empty()
    }
}

/// A repository for managing fonts.
pub struct FontRepository {
    provider: TypefaceFontProvider,
    fonts: HashMap<String, Vec<Vec<u8>>>,
}

impl FontRepository {
    pub fn new() -> Self {
        Self {
            provider: TypefaceFontProvider::new(),
            fonts: HashMap::new(),
        }
    }

    pub fn insert(&mut self, family: String, bytes: Vec<u8>) {
        let family_fonts = self.fonts.entry(family.clone()).or_insert_with(Vec::new);

        if let Some(tf) = FontMgr::new().new_from_data(&bytes, None) {
            self.provider.register_typeface(tf, Some(family.as_str()));
        }

        family_fonts.push(bytes);
    }

    pub fn add(&mut self, bytes: &[u8], family: &str) {
        let family_fonts = self
            .fonts
            .entry(family.to_string())
            .or_insert_with(Vec::new);

        if let Some(tf) = FontMgr::new().new_from_data(bytes, None) {
            self.provider.register_typeface(tf, Some(family));
        }

        family_fonts.push(bytes.to_vec());
    }

    pub fn font_collection(&self) -> FontCollection {
        let mut collection = FontCollection::new();
        collection.set_asset_font_manager(Some(self.provider.clone().into()));
        collection
    }

    pub fn family_count(&self) -> usize {
        self.fonts.len()
    }

    pub fn total_font_count(&self) -> usize {
        self.fonts.values().map(|fonts| fonts.len()).sum()
    }

    pub fn get_family_fonts(&self, family: &str) -> Option<&Vec<Vec<u8>>> {
        self.fonts.get(family)
    }
}

impl ResourceRepository<Vec<Vec<u8>>> for FontRepository {
    type Id = String;
    type Iter<'a> = std::collections::hash_map::Iter<'a, String, Vec<Vec<u8>>>;

    fn insert(&mut self, id: Self::Id, item: Vec<Vec<u8>>) {
        for font_data in &item {
            if let Some(tf) = FontMgr::new().new_from_data(font_data, None) {
                self.provider.register_typeface(tf, Some(id.as_str()));
            }
        }
        self.fonts.insert(id, item);
    }

    fn get(&self, id: &Self::Id) -> Option<&Vec<Vec<u8>>> {
        self.fonts.get(id)
    }

    fn get_mut(&mut self, id: &Self::Id) -> Option<&mut Vec<Vec<u8>>> {
        self.fonts.get_mut(id)
    }

    fn remove(&mut self, id: &Self::Id) -> Option<Vec<Vec<u8>>> {
        self.fonts.remove(id)
    }

    fn iter(&self) -> Self::Iter<'_> {
        self.fonts.iter()
    }

    fn len(&self) -> usize {
        self.fonts.len()
    }

    fn is_empty(&self) -> bool {
        self.fonts.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use skia_safe::surfaces;

    #[test]
    fn image_repository_basic() {
        let mut repo = ImageRepository::new();
        let mut surface = surfaces::raster_n32_premul((1, 1)).expect("failed to create surface");
        let image = surface.image_snapshot();
        repo.insert("img".to_string(), image.clone());
        assert!(repo.get_by_size("img", 1.0, 1.0).is_some());
        assert_eq!(repo.len(), 1);
        repo.remove("img");
        assert!(repo.is_empty());
    }

    #[test]
    fn font_repository_basic() {
        let mut repo = FontRepository::new();
        repo.insert("f1".to_string(), vec![0u8; 4]);
        assert!(repo.get(&"f1".to_string()).is_some());
        assert_eq!(repo.len(), 1);
        repo.remove(&"f1".to_string());
        assert!(repo.is_empty());
    }
}
