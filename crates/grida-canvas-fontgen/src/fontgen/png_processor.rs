use std::error::Error;
use std::io::Cursor;

/// Minimal PNG processor for WASM-friendly font generation
pub struct PngProcessor;

impl PngProcessor {
    /// Extract PNG dimensions and data without heavy processing
    pub fn process_png(png_bytes: &[u8]) -> Result<PngInfo, Box<dyn Error>> {
        let mut decoder = png::Decoder::new(Cursor::new(png_bytes));
        decoder.set_transformations(png::Transformations::IDENTITY);
        
        let mut reader = decoder.read_info()?;
        let info = reader.info().clone();
        
        // Read the image data
        let buffer_size = reader.output_buffer_size().expect("Failed to get buffer size");
        let mut buffer = vec![0; buffer_size];
        reader.next_frame(&mut buffer)?;
        
        Ok(PngInfo {
            width: info.width as u32,
            height: info.height as u32,
            raw_png_data: png_bytes.to_vec(),
            pixel_data: buffer,
        })
    }
}

/// Information extracted from PNG file
#[derive(Debug, Clone)]
pub struct PngInfo {
    pub width: u32,
    pub height: u32,
    pub raw_png_data: Vec<u8>,
    pub pixel_data: Vec<u8>,
}

impl PngInfo {
    /// Calculate basic glyph metrics from image dimensions
    pub fn calculate_glyph_metrics(&self) -> GlyphMetrics {
        // Simple metrics: advance width = image width, side bearing = 0
        GlyphMetrics {
            advance_width: self.width as u16,
            left_side_bearing: 0,
            right_side_bearing: 0,
        }
    }
}

/// Basic glyph metrics for font generation
#[derive(Debug, Clone)]
pub struct GlyphMetrics {
    pub advance_width: u16,
    pub left_side_bearing: i16,
    pub right_side_bearing: i16,
}
