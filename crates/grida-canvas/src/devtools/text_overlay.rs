use crate::cache::scene::SceneCache;
use crate::cg::types::TextAlignVertical;
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
        if let Some((baseline_info, layout_height)) = cache
            .paragraph
            .borrow()
            .get_baseline_info_if_cached_by_id(&layer.id, layer.width)
        {
            // Calculate vertical offset based on alignment and container height
            let y_offset = match layer.height {
                Some(h) => match layer.text_align_vertical {
                    TextAlignVertical::Top => 0.0,
                    TextAlignVertical::Center => (h - layout_height) / 2.0,
                    TextAlignVertical::Bottom => h - layout_height,
                },
                None => 0.0,
            };

            // Create a path with just the baselines
            let mut path = Path::new();
            for baseline in baseline_info {
                // Add a line segment for the baseline with vertical offset
                let y = baseline.baseline_y + y_offset;
                path.move_to((baseline.left, y));
                path.line_to((baseline.left + baseline.width, y));
            }
            Some(path)
        } else {
            // Return None if text layer is not in cache
            None
        }
    }
}
