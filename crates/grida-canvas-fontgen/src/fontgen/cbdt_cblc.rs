use crate::fontgen::png_processor::PngInfo;

/// CBDT (Color Bitmap Data) table generator
pub struct CbdtGenerator;

impl CbdtGenerator {
    /// Generate CBDT table with PNG data
    pub fn generate_cbdt(png_infos: &[PngInfo]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let mut cbdt_data = Vec::new();
        
        // CBDT header: version 0x00030000
        cbdt_data.extend_from_slice(&0x00030000u32.to_be_bytes());
        
        // For each PNG, write glyph data
        for png_info in png_infos {
            // Write glyph metrics (format 18: PNG with big glyph metrics)
            Self::write_glyph_metrics(&mut cbdt_data, png_info)?;
            
            // Write PNG data length and data
            let png_length = png_info.raw_png_data.len() as u32;
            cbdt_data.extend_from_slice(&png_length.to_be_bytes());
            cbdt_data.extend_from_slice(&png_info.raw_png_data);
        }
        
        Ok(cbdt_data)
    }
    
    /// Write glyph metrics for format 18 (PNG with big glyph metrics)
    fn write_glyph_metrics(cbdt_data: &mut Vec<u8>, png_info: &PngInfo) -> Result<(), Box<dyn std::error::Error>> {
        let metrics = png_info.calculate_glyph_metrics();
        
        // Format 18 metrics structure:
        // height, width, x_bearing, y_bearing, advance,
        // vert_x_bearing, vert_y_bearing, vert_advance
        cbdt_data.push(png_info.height as u8);           // height
        cbdt_data.push(png_info.width as u8);            // width
        cbdt_data.push(0i8 as u8);                      // x_bearing (0)
        cbdt_data.push(0i8 as u8);                      // y_bearing (0)
        cbdt_data.push(metrics.advance_width as u8);    // advance
        cbdt_data.push((png_info.width as i16 / 2) as u8); // vert_x_bearing
        cbdt_data.push(0i8 as u8);                      // vert_y_bearing
        cbdt_data.push(png_info.height as u8);          // vert_advance
        
        Ok(())
    }
}

/// CBLC (Color Bitmap Location) table generator
pub struct CblcGenerator;

impl CblcGenerator {
    /// Generate CBLC table with glyph location data
    pub fn generate_cblc(png_infos: &[PngInfo]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let mut cblc_data = Vec::new();
        
        // CBLC header: version 0x00030000
        cblc_data.extend_from_slice(&0x00030000u32.to_be_bytes());
        
        // Number of strikes (we only support 1 for now)
        let num_strikes = 1u32;
        cblc_data.extend_from_slice(&num_strikes.to_be_bytes());
        
        // Generate bitmap size table
        Self::write_bitmap_size_table(&mut cblc_data, png_infos)?;
        
        Ok(cblc_data)
    }
    
    /// Write bitmap size table for the strike
    fn write_bitmap_size_table(cblc_data: &mut Vec<u8>, png_infos: &[PngInfo]) -> Result<(), Box<dyn std::error::Error>> {
        if png_infos.is_empty() {
            return Err("No PNG infos provided".into());
        }
        
        // Calculate metrics for the strike
        let total_width: u32 = png_infos.iter().map(|p| p.width).sum();
        let total_height: u32 = png_infos.iter().map(|p| p.height).sum();
        let avg_width = total_width / png_infos.len() as u32;
        let avg_height = total_height / png_infos.len() as u32;
        
        // Bitmap size table structure (48 bytes per strike)
        let index_subtable_array_offset: u32 = 8 + 48; // 8 bytes header + 48 bytes per strike
        cblc_data.extend_from_slice(&index_subtable_array_offset.to_be_bytes());
        
        // Index tables size (we'll use a simple structure)
        let index_tables_size = 32u32; // Simplified size
        cblc_data.extend_from_slice(&index_tables_size.to_be_bytes());
        
        // Number of index subtables
        let num_index_subtables = 1u32;
        cblc_data.extend_from_slice(&num_index_subtables.to_be_bytes());
        
        // Color reference (not used, set to 0)
        cblc_data.extend_from_slice(&0u32.to_be_bytes());
        
        // Horizontal line metrics (simplified)
        Self::write_sbit_line_metrics(cblc_data, avg_width, avg_height);
        
        // Vertical line metrics (same as horizontal for simplicity)
        Self::write_sbit_line_metrics(cblc_data, avg_width, avg_height);
        
        // Glyph index range
        cblc_data.extend_from_slice(&0u16.to_be_bytes()); // startGlyphIndex
        cblc_data.extend_from_slice(&(png_infos.len() as u16 - 1).to_be_bytes()); // endGlyphIndex
        
        // PPEM and bit depth
        cblc_data.push(16u8); // ppemX (16 pixels per em)
        cblc_data.push(16u8); // ppemY (16 pixels per em)
        cblc_data.push(32u8); // bitDepth (32-bit RGBA)
        cblc_data.push(0x01i8 as u8); // flags (horizontal)
        
        Ok(())
    }
    
    /// Write sbit line metrics (simplified)
    fn write_sbit_line_metrics(cblc_data: &mut Vec<u8>, width: u32, height: u32) {
        // Simplified line metrics: 12 bytes
        cblc_data.push(16i8 as u8);   // ascender
        cblc_data.push(-16i8 as u8);  // descender
        cblc_data.push(width as u8);  // widthMax
        cblc_data.push(0i8 as u8);    // caretSlopeNumerator
        cblc_data.push(0i8 as u8);    // caretSlopeDenominator
        cblc_data.push(0i8 as u8);    // caretOffset
        cblc_data.push(0i8 as u8);    // minOriginSB
        cblc_data.push(0i8 as u8);    // minAdvanceSB
        cblc_data.push(0i8 as u8);    // maxBeforeBL
        cblc_data.push(0i8 as u8);    // minAfterBL
        cblc_data.push(0i8 as u8);    // pad1
        cblc_data.push(0i8 as u8);    // pad2
    }
}
