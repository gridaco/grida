use crate::cache::scene::SceneCache;
use crate::painter::layer::PainterPictureTextLayer;
use skia_safe::Path;

pub struct TextOverlay;

impl TextOverlay {
    /// Creates a path with just the baselines for a text layer
    /// This is much more efficient than rendering the entire text outline
    /// Returns None if the text layer is not found in cache
    pub fn text_layer_baseline(
        cache: &SceneCache,
        layer: &PainterPictureTextLayer,
    ) -> Option<Path> {
        // Get baseline information from the paragraph cache using the layer's ID
        if let Some(baseline_info) = cache
            .paragraph
            .borrow()
            .get_baseline_info_if_cached_by_id(&layer.id, layer.width)
        {
            // Create a path with just the baselines
            let mut path = Path::new();
            for baseline in baseline_info {
                // Add a line segment for the baseline
                path.move_to((baseline.left, baseline.baseline_y));
                path.line_to((baseline.left + baseline.width, baseline.baseline_y));
            }
            Some(path)
        } else {
            // Return None if text layer is not in cache
            None
        }
    }
}
