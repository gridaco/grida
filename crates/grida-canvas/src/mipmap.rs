use skia_safe::{Image, Paint as SkPaint, Rect, surfaces};

/// Configuration for generating mipmaps for images.
#[derive(Debug, Clone)]
pub enum MipmapConfig {
    /// Use the provided fixed scale steps.
    Fixed(Vec<f32>),
    /// Generate a power-of-two chain down to 1x1 for each image.
    FullChain,
}

impl Default for MipmapConfig {
    fn default() -> Self {
        Self::FullChain
    }
}

#[derive(Debug, Clone)]
pub struct ImageMipmaps {
    levels: Vec<(f32, Image)>,
}

impl ImageMipmaps {
    pub fn from_image(image: Image, config: &MipmapConfig) -> Self {
        let mut levels = Vec::new();

        let scales: Vec<f32> = match config {
            MipmapConfig::Fixed(steps) => steps.clone(),
            MipmapConfig::FullChain => {
                let max_dim = image.width().max(image.height()).max(1) as f32;
                let levels = max_dim.log2().ceil() as u32 + 1;
                (0..levels).map(|i| 1.0 / 2f32.powi(i as i32)).collect()
            }
        };

        for &scale in &scales {
            let img = if (scale - 1.0).abs() < f32::EPSILON {
                image.clone()
            } else {
                scale_image(&image, scale)
            };
            levels.push((scale, img));
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
    let mut surface = surfaces::raster_n32_premul((width, height)).unwrap();
    let mut canvas = surface.canvas();
    let paint = SkPaint::default();
    canvas.draw_image_rect(
        image,
        None,
        Rect::from_xywh(0.0, 0.0, width as f32, height as f32),
        &paint,
    );
    surface.image_snapshot()
}
