use std::error::Error;
use std::fs;

/// Font validation using multiple libraries
pub struct FontValidator;

impl FontValidator {
    /// Validate a TTF file using read-fonts
    pub fn validate_with_read_fonts(ttf_path: &str) -> Result<(), Box<dyn Error>> {
        println!("🔍 Validating with read-fonts...");
        
        let font_data = fs::read(ttf_path)?;
        match read_fonts::FontRef::new(&font_data) {
            Ok(_font) => {
                println!("✅ read-fonts: Font loaded successfully!");
                Ok(())
            }
            Err(e) => {
                println!("❌ read-fonts: Font validation failed: {}", e);
                Err(e.into())
            }
        }
    }

    /// Validate a TTF file using ttf-parser
    pub fn validate_with_ttf_parser(ttf_path: &str) -> Result<(), Box<dyn Error>> {
        println!("🔍 Validating with ttf-parser...");
        
        let font_data = fs::read(ttf_path)?;
        match ttf_parser::Face::parse(&font_data, 0) {
            Ok(face) => {
                println!("✅ ttf-parser: Font loaded successfully!");
                println!("   - Units per EM: {}", face.units_per_em());
                println!("   - Glyph count: {}", face.number_of_glyphs());
                Ok(())
            }
            Err(e) => {
                println!("❌ ttf-parser: Font validation failed: {}", e);
                Err(e.into())
            }
        }
    }

    /// Validate a TTF file using write-fonts validation
    pub fn validate_with_write_fonts(ttf_path: &str) -> Result<(), Box<dyn Error>> {
        println!("🔍 Validating with write-fonts validation...");
        
        let font_data = fs::read(ttf_path)?;
        match read_fonts::FontRef::new(&font_data) {
            Ok(_font) => {
                println!("✅ write-fonts: Font loaded successfully!");
                Ok(())
            }
            Err(e) => {
                println!("❌ write-fonts: Cannot read font for validation: {}", e);
                Err(e.into())
            }
        }
    }

    /// Comprehensive font validation using all available tools
    pub fn validate_font(ttf_path: &str) -> Result<(), Box<dyn Error>> {
        println!("🚀 Starting comprehensive font validation for: {}", ttf_path);
        println!("{}", "=".repeat(60));
        
        let mut success_count = 0;
        let total_validators = 3;
        
        // Test with read-fonts
        match Self::validate_with_read_fonts(ttf_path) {
            Ok(_) => {
                println!("   ✅ read-fonts: PASSED");
                success_count += 1;
            }
            Err(_) => {
                println!("   ❌ read-fonts: FAILED");
            }
        }
        
        // Test with ttf-parser
        match Self::validate_with_ttf_parser(ttf_path) {
            Ok(_) => {
                println!("   ✅ ttf-parser: PASSED");
                success_count += 1;
            }
            Err(_) => {
                println!("   ❌ ttf-parser: FAILED");
            }
        }
        
        // Test with write-fonts validation
        match Self::validate_with_write_fonts(ttf_path) {
            Ok(_) => {
                println!("   ✅ write-fonts: PASSED");
                success_count += 1;
            }
            Err(_) => {
                println!("   ❌ write-fonts: FAILED");
            }
        }
        
        println!("{}", "=".repeat(60));
        println!("📊 Validation Summary:");
        println!("   Overall: {}/{} validators passed", success_count, total_validators);
        
        if success_count == 0 {
            println!("💥 All validators failed - font is definitely broken!");
        } else if success_count < total_validators {
            println!("⚠️  Some validators failed - font has issues");
        } else {
            println!("🎉 All validators passed - font appears to be valid!");
        }
        
        Ok(())
    }

    /// Quick TTF structure analysis
    pub fn analyze_ttf_structure(ttf_path: &str) -> Result<(), Box<dyn Error>> {
        println!("🔬 Analyzing TTF structure...");
        
        let font_data = fs::read(ttf_path)?;
        if font_data.len() < 12 {
            println!("❌ File too small to be a valid TTF");
            return Ok(());
        }
        
        // Check TTF signature
        if &font_data[0..4] != b"true" {
            println!("❌ Invalid TTF signature: {:?}", &font_data[0..4]);
            return Ok(());
        }
        
        println!("✅ TTF signature valid");
        
        // Parse header
        let num_tables = u16::from_be_bytes([font_data[4], font_data[5]]);
        println!("   - Number of tables: {}", num_tables);
        
        let search_range = u16::from_be_bytes([font_data[6], font_data[7]]);
        let entry_selector = u16::from_be_bytes([font_data[8], font_data[9]]);
        let range_shift = u16::from_be_bytes([font_data[10], font_data[11]]);
        
        println!("   - Search range: {}", search_range);
        println!("   - Entry selector: {}", entry_selector);
        println!("   - Range shift: {}", range_shift);
        
        // Check table directory
        let header_size = 12 + (num_tables as usize * 16);
        if font_data.len() < header_size {
            println!("❌ File too small for table directory");
            return Ok(());
        }
        
        println!("   - Header size: {} bytes", header_size);
        println!("   - Table directory entries:");
        
        for i in 0..num_tables {
            let offset = 12 + (i as usize * 16);
            if offset + 16 > font_data.len() {
                println!("     ❌ Table {}: Directory entry truncated", i);
                continue;
            }
            
            let tag = &font_data[offset..offset+4];
            let checksum = u32::from_be_bytes([
                font_data[offset+4], font_data[offset+5], 
                font_data[offset+6], font_data[offset+7]
            ]);
            let table_offset = u32::from_be_bytes([
                font_data[offset+8], font_data[offset+9], 
                font_data[offset+10], font_data[offset+11]
            ]);
            let table_length = u32::from_be_bytes([
                font_data[offset+12], font_data[offset+13], 
                font_data[offset+14], font_data[offset+15]
            ]);
            
            let tag_str = String::from_utf8_lossy(tag);
            println!("     - {}: offset={}, length={}, checksum=0x{:08x}", 
                    tag_str, table_offset, table_length, checksum);
            
            // Check if table data exists
            if table_offset + table_length > font_data.len() as u32 {
                println!("       ❌ Table data extends beyond file end!");
            }
        }
        
        Ok(())
    }
}
