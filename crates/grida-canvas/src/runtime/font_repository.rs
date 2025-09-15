use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};

use skia_safe::{
    textlayout::{FontCollection, TypefaceFontProvider},
    FontMgr,
};

use crate::resources::ByteStore;

/// A repository for managing fonts and their availability state.
#[derive(Clone)]
pub struct FontRepository {
    embedded_provider: TypefaceFontProvider,
    user_provider: TypefaceFontProvider,
    fallback_provider: TypefaceFontProvider,
    font_collection: FontCollection,
    loader: FontMgr,
    fonts: HashMap<String, Vec<u64>>,
    missing: HashSet<String>,
    requested: HashSet<String>,
    generation: usize,
    user_fallback_fonts: Vec<String>,
    store: Arc<Mutex<ByteStore>>,
}

impl FontRepository {
    /// Create a new empty font repository backed by a [`ByteStore`].
    pub fn new(store: Arc<Mutex<ByteStore>>) -> Self {
        let embedded_provider = TypefaceFontProvider::new();
        let user_provider = TypefaceFontProvider::new();
        let fallback_provider = TypefaceFontProvider::new();

        let mut font_collection = FontCollection::new();
        font_collection.set_asset_font_manager(Some(embedded_provider.clone().into()));
        font_collection.set_dynamic_font_manager(Some(user_provider.clone().into()));
        font_collection.set_test_font_manager(Some(fallback_provider.clone().into()));

        let mut this = Self {
            embedded_provider,
            user_provider,
            fallback_provider,
            font_collection,
            loader: FontMgr::new(),
            fonts: HashMap::new(),
            missing: HashSet::new(),
            requested: HashSet::new(),
            generation: 0,
            user_fallback_fonts: Vec::new(),
            store,
        };
        this.refresh_collection_defaults();
        this
    }

    /// Access the underlying [`ByteStore`].
    pub fn store(&self) -> Arc<Mutex<ByteStore>> {
        Arc::clone(&self.store)
    }

    /// Insert a font for the given family referenced by `hash`.
    pub fn insert(&mut self, family: String, hash: u64) {
        if let Some(bytes) = self.store.lock().unwrap().get(hash) {
            if let Some(tf) = self.loader.new_from_data(bytes, None) {
                self.user_provider
                    .register_typeface(tf, Some(family.as_str()));
            }
        }
        self.missing.remove(&family);
        self.fonts.entry(family).or_insert_with(Vec::new).push(hash);
        self.generation += 1;
        self.font_collection.clear_caches();
    }

    /// Add a font to an existing family.
    pub fn add(&mut self, hash: u64, family: &str) {
        if let Some(bytes) = self.store.lock().unwrap().get(hash) {
            if let Some(tf) = self.loader.new_from_data(bytes, None) {
                self.user_provider.register_typeface(tf, Some(family));
            }
        }
        self.fonts
            .entry(family.to_string())
            .or_insert_with(Vec::new)
            .push(hash);
        self.missing.remove(family);
        self.generation += 1;
        self.font_collection.clear_caches();
    }

    /// Register the built-in embedded fonts bundled with the renderer.
    pub fn register_embedded_fonts(&mut self) {
        self.register_embedded_font(
            crate::fonts::embedded::geist::BYTES,
            crate::fonts::embedded::geist::FAMILY,
        );
        self.register_embedded_font(
            crate::fonts::embedded::geistmono::BYTES,
            crate::fonts::embedded::geistmono::FAMILY,
        );
    }

    fn register_embedded_font(&mut self, bytes: &[u8], family: &str) {
        if let Some(tf) = self.loader.new_from_data(bytes, None) {
            self.embedded_provider.register_typeface(tf, Some(family));
        }
        self.font_collection.clear_caches();
    }

    fn refresh_collection_defaults(&mut self) {
        self.font_collection
            .set_default_font_manager(Some(self.embedded_provider.clone().into()), None);
    }

    /// Total number of font families loaded.
    pub fn len(&self) -> usize {
        self.fonts.len()
    }

    /// Total number of fonts loaded across all families.
    pub fn len_total(&self) -> usize {
        self.fonts.values().map(|fonts| fonts.len()).sum()
    }

    /// Get hashes of fonts loaded for a family.
    pub fn get_family_fonts(&self, family: &str) -> Option<&Vec<u64>> {
        self.fonts.get(family)
    }

    /// Current generation count.
    pub fn generation(&self) -> usize {
        self.generation
    }

    /// Number of font families.
    pub fn family_count(&self) -> usize {
        self.len()
    }

    /// Total number of fonts across all families.
    pub fn total_font_count(&self) -> usize {
        self.len_total()
    }

    /// Iterate over loaded fonts.
    pub fn iter(&self) -> std::collections::hash_map::Iter<'_, String, Vec<u64>> {
        self.fonts.iter()
    }

    /// Access the underlying Skia font collection.
    pub fn font_collection(&self) -> &FontCollection {
        &self.font_collection
    }

    /// Whether there are fonts requested but not yet provided.
    pub fn has_pending_fonts(&self) -> bool {
        !self.missing.is_empty()
    }

    /// Alias for [`has_pending_fonts`].
    pub fn has_missing(&self) -> bool {
        self.has_pending_fonts()
    }

    /// Request a font family.
    pub fn request_font(&mut self, family: &str) {
        self.requested.insert(family.to_string());
        if !self.fonts.contains_key(family) {
            self.missing.insert(family.to_string());
        }
    }

    /// Fonts that are still missing.
    pub fn missing_fonts(&self) -> HashSet<String> {
        self.missing.clone()
    }

    /// Alias for [`missing_fonts`].
    pub fn missing_families(&self) -> HashSet<String> {
        self.missing_fonts()
    }

    /// Requested font families.
    pub fn requested_fonts(&self) -> HashSet<String> {
        self.requested.clone()
    }

    /// Available font family names.
    pub fn available_families(&self) -> Vec<String> {
        self.fonts.keys().cloned().collect()
    }

    /// Clear missing set.
    pub fn clear_missing(&mut self) {
        self.missing.clear();
    }

    /// Set user-provided fallback fonts.
    pub fn set_fallback_fonts(&mut self, families: Vec<String>) {
        self.user_fallback_fonts = families;
        self.refresh_fallback_provider();
    }

    /// Alias for [`set_fallback_fonts`].
    pub fn set_user_fallback_families(&mut self, families: Vec<String>) {
        self.set_fallback_fonts(families)
    }

    /// User-provided fallback families.
    pub fn user_fallback_families(&self) -> Vec<String> {
        self.user_fallback_fonts.clone()
    }

    /// Mark a font family as missing.
    pub fn mark_missing(&mut self, family: &str) {
        self.missing.insert(family.to_string());
    }

    /// Set the set of requested font families.
    pub fn set_requested_families<I>(&mut self, families: I)
    where
        I: IntoIterator<Item = String>,
    {
        self.requested = families.into_iter().collect();
        self.missing = self
            .requested
            .iter()
            .filter(|f| !self.fonts.contains_key(*f))
            .cloned()
            .collect();
    }

    fn refresh_fallback_provider(&mut self) {
        self.fallback_provider = TypefaceFontProvider::new();
        for family in &self.user_fallback_fonts {
            if let Some(hashes) = self.fonts.get(family) {
                for hash in hashes {
                    if let Some(bytes) = self.store.lock().unwrap().get(*hash) {
                        if let Some(tf) = self.loader.new_from_data(bytes, None) {
                            self.fallback_provider
                                .register_typeface(tf, Some(family.as_str()));
                        }
                    }
                }
            }
        }
        self.font_collection
            .set_test_font_manager(Some(self.fallback_provider.clone().into()));
        self.font_collection.clear_caches();
    }
}
