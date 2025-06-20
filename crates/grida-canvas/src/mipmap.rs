use skia_safe::{Image, Paint as SkPaint, Rect, surfaces};

/// Strategy for generating the scale levels for mipmaps.
#[derive(Debug, Clone)]
pub enum MipmapLevels {
    /// Use the provided fixed scale steps.
    Fixed(Vec<f32>),
    /// Generate a power-of-two chain down to 1x1 for each image.
    FullChain,
}

/// Configuration for generating mipmaps for images.
#[derive(Debug, Clone)]
pub struct MipmapConfig {
    pub levels: MipmapLevels,
    /// Whether to progressively resize from the previously generated level.
    /// This is usually faster for long chains.
    pub chained: bool,
}

impl Default for MipmapConfig {
    fn default() -> Self {
        Self {
            levels: MipmapLevels::FullChain,
            chained: true,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ImageMipmaps {
    levels: Vec<(f32, Image)>,
}

impl ImageMipmaps {
    pub fn from_image(image: Image, config: &MipmapConfig) -> Self {
        let mut levels = Vec::new();

        let mut scales: Vec<f32> = match &config.levels {
            MipmapLevels::Fixed(steps) => steps.clone(),
            MipmapLevels::FullChain => {
                let max_dim = image.width().max(image.height()).max(1) as f32;
                let levels = max_dim.log2().ceil() as u32 + 1;
                (0..levels).map(|i| 1.0 / 2f32.powi(i as i32)).collect()
            }
        };

        if !scales.is_empty() {
            // ensure the scales are sorted from large to small for efficient chaining
            scales.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));

            if config.chained {
                // start from the original image or the first scale
                let mut prev_scale = 1.0;
                let mut prev_img = image.clone();

                for &scale in &scales {
                    if (scale - 1.0).abs() > f32::EPSILON {
                        let ratio = scale / prev_scale;
                        prev_img = scale_image(&prev_img, ratio);
                        prev_scale = scale;
                    }

                    levels.push((scale, prev_img.clone()));
                }
            } else {
                for &scale in &scales {
                    let img = if (scale - 1.0).abs() < f32::EPSILON {
                        image.clone()
                    } else {
                        scale_image(&image, scale)
                    };
                    levels.push((scale, img));
                }
            }
        }
        Self { levels }
    }

    /// Number of mipmap levels.
    pub fn level_count(&self) -> usize {
        self.levels.len()
    }

    /// Returns the image for the smallest mip level.
    pub fn last_level_image(&self) -> Option<&Image> {
        self.levels.last().map(|(_, img)| img)
    }

    pub fn best_for_zoom(&self, zoom: f32) -> Option<&Image> {
        if self.levels.is_empty() {
            return None;
        }

        for (scale, image) in self.levels.iter().rev() {
            if zoom <= *scale {
                return Some(image);
            }
        }
        Some(&self.levels[0].1)
    }

    pub fn best_for_size(&self, width: f32, height: f32) -> Option<&Image> {
        if self.levels.is_empty() {
            return None;
        }

        let base_width = self.levels[0].1.width() as f32;
        let base_height = self.levels[0].1.height() as f32;
        let required_scale = (width / base_width).max(height / base_height);

        for (scale, image) in self.levels.iter().rev() {
            if required_scale <= *scale {
                return Some(image);
            }
        }

        Some(&self.levels[0].1)
    }
}

fn scale_image(image: &Image, scale: f32) -> Image {
    let width = ((image.width() as f32 * scale).round() as i32).max(1);
    let height = ((image.height() as f32 * scale).round() as i32).max(1);
    let Some(mut surface) = surfaces::raster_n32_premul((width, height)) else {
        return image.clone();
    };
    let canvas = surface.canvas();
    let paint = SkPaint::default();
    canvas.draw_image_rect(
        image,
        None,
        Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
        &paint,
    );
    surface.image_snapshot()
}
