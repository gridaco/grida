use skia_safe::{
    textlayout::{FontCollection, TypefaceFontProvider},
    FontMgr, Image,
};

use crate::cache::mipmap::{ImageMipmaps, MipmapConfig};
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
#[derive(Clone)]
pub struct FontRepository {
    provider: TypefaceFontProvider,
    fonts: HashMap<String, Vec<Vec<u8>>>,
    generation: usize,
}

impl FontRepository {
    pub fn new() -> Self {
        Self {
            provider: TypefaceFontProvider::new(),
            fonts: HashMap::new(),
            generation: 0,
        }
    }

    pub fn insert(&mut self, family: String, bytes: Vec<u8>) {
        let family_fonts = self.fonts.entry(family.clone()).or_insert_with(Vec::new);

        if let Some(tf) = FontMgr::new().new_from_data(&bytes, None) {
            self.provider.register_typeface(tf, Some(family.as_str()));
        }

        family_fonts.push(bytes);
        self.generation += 1;
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
        self.generation += 1;
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

    pub fn generation(&self) -> usize {
        self.generation
    }

    pub fn get_family_fonts(&self, family: &str) -> Option<&Vec<Vec<u8>>> {
        self.fonts.get(family)
    }

    /// get Variable Axes for a family
    ///
    /// [More about variable axes](https://grida.co/docs/reference/open-type-variable-axes)
    pub fn variation_design_parameters_for_family(
        &self,
        family: &str,
    ) -> Option<Vec<skia_safe::font_parameters::variation::Axis>> {
        self.variation_design_parameters_for_family_style(family, skia_safe::FontStyle::default())
    }

    /// get Variable Axes for a family and style
    ///
    /// [More about variable axes](https://grida.co/docs/reference/open-type-variable-axes)
    pub fn variation_design_parameters_for_family_style(
        &self,
        family: &str,
        style: skia_safe::FontStyle,
    ) -> Option<Vec<skia_safe::font_parameters::variation::Axis>> {
        // get typeface by family name
        let typeface = self.provider.match_family_style(family, style)?;
        typeface.variation_design_parameters()
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
        self.generation += 1;
    }

    fn get(&self, id: &Self::Id) -> Option<&Vec<Vec<u8>>> {
        self.fonts.get(id)
    }

    fn get_mut(&mut self, id: &Self::Id) -> Option<&mut Vec<Vec<u8>>> {
        self.fonts.get_mut(id)
    }

    fn remove(&mut self, id: &Self::Id) -> Option<Vec<Vec<u8>>> {
        let res = self.fonts.remove(id);
        if res.is_some() {
            self.generation += 1;
        }
        res
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
#[path = "../../tests/fonts.rs"]
mod test_fonts;

#[cfg(test)]
mod tests {
    use super::test_fonts as fonts;
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

    #[test]
    fn variation_design_parameters_for_family_with_roboto_flex() {
        let mut repo = FontRepository::new();

        // Add the font to the repository
        repo.add(fonts::ROBOTO_FLEX_VF, "Roboto Flex");

        // Test that the font was added successfully
        assert_eq!(repo.family_count(), 1);
        assert_eq!(repo.total_font_count(), 1);
        assert!(repo.get_family_fonts("Roboto Flex").is_some());

        // Test variation design parameters
        let variation_params = repo.variation_design_parameters_for_family("Roboto Flex");
        assert!(
            variation_params.is_some(),
            "Should return variation parameters for Roboto Flex"
        );

        let params = variation_params.unwrap();
        assert!(!params.is_empty(), "Roboto Flex should have variation axes");

        // Verify specific axes that Roboto Flex should have
        let axis_tags: Vec<String> = params.iter().map(|axis| axis.tag.to_string()).collect();

        // Create a mapping from numeric tag values to expected tag names
        // These are the actual numeric representations found in the Roboto Flex font
        let tag_mapping = [
            ("1869640570", "opsz"),     // optical size
            ("2003265652", "XTRA"),     // x-transparency
            ("1196572996", "GRAD"),     // grade
            ("2003072104", "YOPQ"),     // y-opacity
            ("1936486004", "slnt"),     // slant
            ("1481592913", "XOPQ"),     // x-opacity
            ("1498370129", "YTAS"),     // y-ascender
            ("1481921089", "YTDE"),     // y-descender
            ("1498699075", "YTFI"),     // y-figure
            ("1498696771", "YTLC"),     // y-lowercase
            ("1498693971", "unknown1"), // unknown axis
            ("1498694725", "YTUC"),     // y-uppercase
            ("1498695241", "unknown2"), // unknown axis
        ];

        // Check that we have the expected number of axes (Roboto Flex has 13 axes)
        assert_eq!(
            params.len(),
            13,
            "Roboto Flex should have 13 variation axes, found: {}",
            params.len()
        );

        // Verify that we have the expected axes by checking their numeric representations
        for (numeric_tag, expected_name) in tag_mapping {
            assert!(
                axis_tags.contains(&numeric_tag.to_string()),
                "Roboto Flex should have '{}' axis (tag: {}), found: {:?}",
                expected_name,
                numeric_tag,
                axis_tags
            );
        }

        // Test specific axis properties
        for axis in &params {
            let tag_str = axis.tag.to_string();
            match tag_str.as_str() {
                "1869640570" => {
                    // opsz - optical size
                    // Optical size axis should have reasonable min/max values
                    assert!(axis.min >= 8.0, "Optical size min should be >= 8");
                    assert!(axis.max <= 144.0, "Optical size max should be <= 144");
                    assert!(
                        axis.def >= axis.min && axis.def <= axis.max,
                        "Default optical size should be within range"
                    );
                }
                "1936486004" => {
                    // slnt - slant
                    // Slant axis should have reasonable min/max values (typically -15 to 0)
                    assert!(axis.min >= -15.0, "Slant min should be >= -15");
                    assert!(axis.max <= 0.0, "Slant max should be <= 0");
                    assert!(
                        axis.def >= axis.min && axis.def <= axis.max,
                        "Default slant should be within range"
                    );
                }
                "1196572996" => {
                    // GRAD - grade
                    // Grade axis should have reasonable min/max values
                    assert!(axis.min >= -200.0, "Grade min should be >= -200");
                    assert!(axis.max <= 200.0, "Grade max should be <= 200");
                    assert!(
                        axis.def >= axis.min && axis.def <= axis.max,
                        "Default grade should be within range"
                    );
                }
                _ => {
                    // For other axes, just verify they have valid ranges
                    assert!(axis.min <= axis.max, "Axis min should be <= max");
                    assert!(
                        axis.def >= axis.min && axis.def <= axis.max,
                        "Default should be within range"
                    );
                }
            }
        }
    }

    #[test]
    fn variation_design_parameters_for_family_style_with_roboto_flex() {
        let mut repo = FontRepository::new();

        // Add the font to the repository
        repo.add(fonts::ROBOTO_FLEX_VF, "Roboto Flex");

        // Test with different font styles
        let styles = vec![
            skia_safe::FontStyle::normal(),
            skia_safe::FontStyle::bold(),
            skia_safe::FontStyle::italic(),
            skia_safe::FontStyle::bold_italic(),
        ];

        for style in styles {
            let variation_params =
                repo.variation_design_parameters_for_family_style("Roboto Flex", style);
            assert!(
                variation_params.is_some(),
                "Should return variation parameters for style {:?}",
                style
            );

            let params = variation_params.unwrap();
            assert!(
                !params.is_empty(),
                "Roboto Flex should have variation axes for style {:?}",
                style
            );

            // Verify that all axes have valid ranges
            for axis in &params {
                assert!(
                    axis.min <= axis.max,
                    "Axis min should be <= max for style {:?}",
                    style
                );
                assert!(
                    axis.def >= axis.min && axis.def <= axis.max,
                    "Default should be within range for style {:?}",
                    style
                );
            }
        }
    }

    #[test]
    fn variation_design_parameters_for_nonexistent_family() {
        let repo = FontRepository::new();

        // Test with a family that doesn't exist
        let variation_params = repo.variation_design_parameters_for_family("Nonexistent Font");
        assert!(
            variation_params.is_none(),
            "Should return None for nonexistent font family"
        );
    }

    #[test]
    fn variation_design_parameters_for_family_with_non_variable_font() {
        let mut repo = FontRepository::new();

        // Create a simple test font (this won't be a real font, but tests the behavior)
        let fake_font_bytes = vec![0u8; 1000]; // This won't be a valid font, but tests the method

        repo.add(&fake_font_bytes, "Fake Font");

        // The method should handle invalid fonts gracefully
        let _variation_params = repo.variation_design_parameters_for_family("Fake Font");
        // This might return None or an empty vector depending on how Skia handles invalid fonts
        // We just test that it doesn't panic
    }
}
