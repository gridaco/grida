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
        // Try to get paragraph from cache first
        if let Some(entry) = cache.paragraph.borrow().get(&layer.base.id) {
            let paragraph = &entry.paragraph;
            let paragraph_ref = paragraph.borrow_mut();

            // // Apply layout if width is specified
            // if let Some(width) = layer.width {
            //     paragraph_ref.layout(width);
            // }

            // Create a path with just the baselines
            let mut path = Path::new();
            let lines = paragraph_ref.line_number();
            for i in 0..lines {
                if let Some(line_metrics) = paragraph_ref.get_line_metrics_at(i) {
                    let baseline_y = line_metrics.baseline as f32;

                    // Use the actual line bounds from metrics
                    // left: The left edge of the line
                    // width: Width of the line
                    // right edge: left + width
                    let line_start_x = line_metrics.left as f32;
                    let line_end_x = (line_metrics.left + line_metrics.width) as f32;

                    // Add a line segment for the baseline
                    path.move_to((line_start_x, baseline_y));
                    path.line_to((line_end_x, baseline_y));
                }
            }
            Some(path)
        } else {
            // Return None if text layer is not in cache
            None
        }
    }
}
