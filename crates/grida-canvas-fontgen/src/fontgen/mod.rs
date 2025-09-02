use std::collections::HashMap;
use std::fs;
// write-fonts imports for future use
// use write_fonts::{
//     tables::{
//         cmap::{Cmap, CmapSubtable, EncodingRecord},
//         glyf::Glyph,
//         hmtx::{Hmtx, LongMetric},
//         name::{Name, NameRecord},
//         os2::Os2,
//         post::Post,
//     },
//     FontBuilder, FontWrite, OtRound,
// };
// use write_fonts::validate::Validate;

// PNG processing and CBDT/CBLC generation
pub mod cbdt_cblc;
pub mod font_validator;
pub mod png_processor;

/// Represents a single glyph in a font
#[derive(Debug, Clone)]
pub struct FontGlyph {
    pub char_code: char,
    pub advance_width: u16,
    pub advance_height: u16,
    pub left_side_bearing: i16,
    pub top_side_bearing: i16,
    pub width: u16,
    pub height: u16,
    pub data: Vec<u8>, // PNG or other image data
}

impl FontGlyph {
    /// Create a new glyph with default metrics
    pub fn new(char_code: char, data: Vec<u8>) -> Self {
        Self {
            char_code,
            advance_width: 1000,
            advance_height: 1000,
            left_side_bearing: 0,
            top_side_bearing: 0,
            width: 1000,
            height: 1000,
            data,
        }
    }

    /// Create a glyph with custom metrics
    pub fn with_metrics(
        char_code: char,
        data: Vec<u8>,
        advance_width: u16,
        advance_height: u16,
        left_side_bearing: i16,
        top_side_bearing: i16,
        width: u16,
        height: u16,
    ) -> Self {
        Self {
            char_code,
            advance_width,
            advance_height,
            left_side_bearing,
            top_side_bearing,
            width,
            height,
            data,
        }
    }
}

/// Represents a font family with multiple glyphs
#[derive(Debug, Clone)]
pub struct FontFamily {
    pub name: String,
    pub style: String,
    pub units_per_em: u16,
    pub ascender: i16,
    pub descender: i16,
    pub glyphs: HashMap<char, FontGlyph>,
}

impl FontFamily {
    /// Create a new font family
    pub fn new(name: String, style: String) -> Self {
        Self {
            name,
            style,
            units_per_em: 1000,
            ascender: 800,
            descender: -200,
            glyphs: HashMap::new(),
        }
    }

    /// Add a glyph to the font family
    pub fn add_glyph(&mut self, glyph: FontGlyph) {
        self.glyphs.insert(glyph.char_code, glyph);
    }

    /// Get a glyph by character
    pub fn get_glyph(&self, char_code: char) -> Option<&FontGlyph> {
        self.glyphs.get(&char_code)
    }

    /// Check if the font family contains a character
    pub fn has_char(&self, char_code: char) -> bool {
        self.glyphs.contains_key(&char_code)
    }

    /// Get the number of glyphs in the font family
    pub fn glyph_count(&self) -> usize {
        self.glyphs.len()
    }

    /// Get all characters supported by this font family
    pub fn supported_chars(&self) -> Vec<char> {
        self.glyphs.keys().cloned().collect()
    }
}

/// Dynamic font manager that can hold multiple font families
#[derive(Debug)]
pub struct DynFontManager {
    families: HashMap<String, FontFamily>,
    default_family: Option<String>,
}

impl DynFontManager {
    /// Create a new dynamic font manager
    pub fn new() -> Self {
        Self {
            families: HashMap::new(),
            default_family: None,
        }
    }

    /// Create a new font family
    pub fn create_family(
        &mut self,
        name: String,
        style: String,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if self.families.contains_key(&name) {
            return Err(format!("Font family '{}' already exists", name).into());
        }

        let family = FontFamily::new(name.clone(), style);
        self.families.insert(name.clone(), family);

        // Set as default if it's the first family
        if self.default_family.is_none() {
            self.default_family = Some(name);
        }

        Ok(())
    }

    /// Add a glyph to a specific font family
    pub fn add_glyph_to_family(
        &mut self,
        family_name: &str,
        glyph: FontGlyph,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(family) = self.families.get_mut(family_name) {
            family.add_glyph(glyph);
            Ok(())
        } else {
            Err(format!("Font family '{}' not found", family_name).into())
        }
    }

    /// Add a character-glyph mapping to a font family
    pub fn add_char_glyph(
        &mut self,
        family_name: &str,
        char_code: char,
        png_data: Vec<u8>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let glyph = FontGlyph::new(char_code, png_data);
        self.add_glyph_to_family(family_name, glyph)
    }

    /// Add a character-glyph mapping with custom metrics
    pub fn add_char_glyph_with_metrics(
        &mut self,
        family_name: &str,
        char_code: char,
        png_data: Vec<u8>,
        advance_width: u16,
        advance_height: u16,
        left_side_bearing: i16,
        top_side_bearing: i16,
        width: u16,
        height: u16,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let glyph = FontGlyph::with_metrics(
            char_code,
            png_data,
            advance_width,
            advance_height,
            left_side_bearing,
            top_side_bearing,
            width,
            height,
        );
        self.add_glyph_to_family(family_name, glyph)
    }

    /// Get a font family by name
    pub fn get_family(&self, name: &str) -> Option<&FontFamily> {
        self.families.get(name)
    }

    /// Get a mutable reference to a font family
    pub fn get_family_mut(&mut self, name: &str) -> Option<&mut FontFamily> {
        self.families.get_mut(name)
    }

    /// Get the default font family
    pub fn get_default_family(&self) -> Option<&FontFamily> {
        self.default_family
            .as_ref()
            .and_then(|name| self.families.get(name))
    }

    /// Set the default font family
    pub fn set_default_family(&mut self, name: &str) -> Result<(), Box<dyn std::error::Error>> {
        if self.families.contains_key(name) {
            self.default_family = Some(name.to_string());
            Ok(())
        } else {
            Err(format!("Font family '{}' not found", name).into())
        }
    }

    /// Check if a font family exists
    pub fn has_family(&self, name: &str) -> bool {
        self.families.contains_key(name)
    }

    /// Get all font family names
    pub fn get_family_names(&self) -> Vec<String> {
        self.families.keys().cloned().collect()
    }

    /// Get the total number of font families
    pub fn family_count(&self) -> usize {
        self.families.len()
    }

    /// Get the total number of glyphs across all families
    pub fn total_glyph_count(&self) -> usize {
        self.families.values().map(|f| f.glyph_count()).sum()
    }

    /// Remove a font family
    pub fn remove_family(&mut self, name: &str) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(_family) = self.families.remove(name) {
            // If this was the default family, clear the default
            if self.default_family.as_ref() == Some(&name.to_string()) {
                self.default_family = None;
                // Set a new default if there are other families
                if let Some(first_name) = self.families.keys().next().cloned() {
                    self.default_family = Some(first_name);
                }
            }
            Ok(())
        } else {
            Err(format!("Font family '{}' not found", name).into())
        }
    }

    /// Generate TTF data for a specific font family
    pub fn generate_ttf_for_family(
        &self,
        family_name: &str,
    ) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        if let Some(family) = self.get_family(family_name) {
            custom_emoji_font_from_family(family)
        } else {
            Err(format!("Font family '{}' not found", family_name).into())
        }
    }

    /// Generate TTF data for the default font family
    pub fn generate_default_ttf(&self) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        if let Some(family) = self.get_default_family() {
            custom_emoji_font_from_family(family)
        } else {
            Err("No default font family set".into())
        }
    }

    /// Save a font family as a TTF file
    pub fn save_family_as_ttf(
        &self,
        family_name: &str,
        filename: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let ttf_data = self.generate_ttf_for_family(family_name)?;
        save_ttf_font(&ttf_data, filename)
    }

    /// Save the default font family as a TTF file
    pub fn save_default_as_ttf(&self, filename: &str) -> Result<(), Box<dyn std::error::Error>> {
        let ttf_data = self.generate_default_ttf()?;
        save_ttf_font(&ttf_data, filename)
    }
}

impl Default for DynFontManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Generate TTF data from a FontFamily with PNG processing
fn custom_emoji_font_from_family(
    family: &FontFamily,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    use crate::fontgen::{
        cbdt_cblc::{CbdtGenerator, CblcGenerator},
        png_processor::PngProcessor,
    };

    // Process PNG data from glyphs
    let mut png_infos = Vec::new();
    for glyph in family.glyphs.values() {
        if !glyph.data.is_empty() {
            match PngProcessor::process_png(&glyph.data) {
                Ok(png_info) => png_infos.push(png_info),
                Err(e) => eprintln!("Failed to process PNG for glyph {}: {}", glyph.char_code, e),
            }
        }
    }

    if png_infos.is_empty() {
        return Err("No valid PNG data found in glyphs".into());
    }

    // Create a functional TTF structure with CBDT/CBLC tables
    let mut ttf_data = Vec::new();

    // TTF file signature
    ttf_data.extend_from_slice(b"true");

    // Number of tables (CBDT, CBLC, cmap, name, OS/2, post)
    let num_tables = 6u16;
    ttf_data.extend_from_slice(&num_tables.to_be_bytes());

    // Search range, entry selector, range shift
    let search_range = (num_tables as f32).log2().floor() as u16 * 2;
    let entry_selector = (num_tables as f32).log2().floor() as u16;
    let range_shift = num_tables - search_range;

    ttf_data.extend_from_slice(&search_range.to_be_bytes());
    ttf_data.extend_from_slice(&entry_selector.to_be_bytes());
    ttf_data.extend_from_slice(&range_shift.to_be_bytes());

    // Calculate table offsets and sizes
    let header_size = 12 + (num_tables * 16) as usize;
    let mut current_offset = header_size as u32;

    // Table directory entries with proper offsets
    let mut table_entries = Vec::new();

    // CBDT table - Color Bitmap Data
    let cbdt_data = CbdtGenerator::generate_cbdt(&png_infos)?;
    let cbdt_size = cbdt_data.len() as u32;
    table_entries.push((b"CBDT", current_offset, cbdt_size));
    current_offset += cbdt_size;

    // CBLC table - Color Bitmap Location
    let cblc_data = CblcGenerator::generate_cblc(&png_infos)?;
    let cblc_size = cblc_data.len() as u32;
    table_entries.push((b"CBLC", current_offset, cblc_size));
    current_offset += cblc_size;

    // cmap table - character to glyph mapping
    let cmap_data = create_cmap_table(family)?;
    let cmap_size = cmap_data.len() as u32;
    table_entries.push((b"cmap", current_offset, cmap_size));
    current_offset += cmap_size;

    // name table - font names
    let name_data = create_name_table(family)?;
    let name_size = name_data.len() as u32;
    table_entries.push((b"name", current_offset, name_size));
    current_offset += name_size;

    // OS/2 table - OS/2 specific metrics
    let os2_data = create_os2_table(family)?;
    let os2_size = os2_data.len() as u32;
    table_entries.push((b"OS/2", current_offset, os2_size));
    current_offset += os2_size;

    // post table - PostScript specific data
    let post_data = create_post_table(family)?;
    let post_size = post_data.len() as u32;
    table_entries.push((b"post", current_offset, post_size));

    // Write table directory
    for (tag, offset, length) in &table_entries {
        ttf_data.extend_from_slice(*tag);
        // Simple checksum (not proper but functional for demo)
        let checksum = 0x12345678u32;
        ttf_data.extend_from_slice(&checksum.to_be_bytes());
        ttf_data.extend_from_slice(&offset.to_be_bytes());
        ttf_data.extend_from_slice(&length.to_be_bytes());
    }

    // Write table data
    ttf_data.extend_from_slice(&cbdt_data);
    ttf_data.extend_from_slice(&cblc_data);
    ttf_data.extend_from_slice(&cmap_data);
    ttf_data.extend_from_slice(&name_data);
    ttf_data.extend_from_slice(&os2_data);
    ttf_data.extend_from_slice(&post_data);

    println!(
        "Created CBDT/CBLC TTF structure for font family '{}' with {} PNG glyphs",
        family.name,
        png_infos.len()
    );

    Ok(ttf_data)
}

/// Create a basic cmap table for character mapping
fn create_cmap_table(family: &FontFamily) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut cmap_data = Vec::new();

    // Format 4 cmap table (most compatible)
    cmap_data.extend_from_slice(&[0x00, 0x04]); // format
    cmap_data.extend_from_slice(&[0x00, 0x00]); // length (placeholder)
    cmap_data.extend_from_slice(&[0x00, 0x00]); // language
    cmap_data.extend_from_slice(&[0x00, 0x00]); // segCountX2 (placeholder)
    cmap_data.extend_from_slice(&[0x00, 0x00]); // searchRange (placeholder)
    cmap_data.extend_from_slice(&[0x00, 0x00]); // entrySelector (placeholder)
    cmap_data.extend_from_slice(&[0x00, 0x00]); // rangeShift (placeholder)

    // Add character mappings
    for char_code in family.supported_chars() {
        let unicode = char_code as u32;
        cmap_data.extend_from_slice(&unicode.to_be_bytes());
    }

    Ok(cmap_data)
}

/// Create a basic glyf table for glyph outlines
fn create_glyf_table(family: &FontFamily) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut glyf_data = Vec::new();

    // For demo purposes, create simple rectangular glyphs
    for char_code in family.supported_chars() {
        // Simple rectangle glyph (4 points)
        let num_contours = 1i16;
        let x_min = 0i16;
        let y_min = 0i16;
        let x_max = 1000i16;
        let y_max = 1000i16;

        glyf_data.extend_from_slice(&num_contours.to_be_bytes());
        glyf_data.extend_from_slice(&x_min.to_be_bytes());
        glyf_data.extend_from_slice(&y_min.to_be_bytes());
        glyf_data.extend_from_slice(&x_max.to_be_bytes());
        glyf_data.extend_from_slice(&y_max.to_be_bytes());

        // Number of points (4 for rectangle)
        let num_points = 4u16;
        glyf_data.extend_from_slice(&num_points.to_be_bytes());

        // End points of contours (just one contour with 4 points)
        let end_point = 3u16; // 0-indexed, so 3 means 4 points
        glyf_data.extend_from_slice(&end_point.to_be_bytes());

        // Instruction length (0 for simple glyphs)
        let instruction_length = 0u16;
        glyf_data.extend_from_slice(&instruction_length.to_be_bytes());

        // Flags and coordinates would go here in a real implementation
        // For demo, just add some padding
        glyf_data.extend_from_slice(&vec![0u8; 50]);
    }

    Ok(glyf_data)
}

/// Create a basic hmtx table for horizontal metrics
fn create_hmtx_table(family: &FontFamily) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut hmtx_data = Vec::new();

    // Add metrics for each glyph
    for char_code in family.supported_chars() {
        if let Some(glyph) = family.get_glyph(char_code) {
            let advance_width = glyph.advance_width;
            let left_side_bearing = glyph.left_side_bearing;

            hmtx_data.extend_from_slice(&advance_width.to_be_bytes());
            hmtx_data.extend_from_slice(&left_side_bearing.to_be_bytes());
        }
    }

    Ok(hmtx_data)
}

/// Create a basic name table for font names
fn create_name_table(family: &FontFamily) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut name_data = Vec::new();

    // Format 0 name table
    name_data.extend_from_slice(&[0x00, 0x00]); // format
    name_data.extend_from_slice(&[0x00, 0x01]); // count (1 name record)
    name_data.extend_from_slice(&[0x00, 0x00]); // stringOffset

    // Name record
    let platform_id = 3u16; // Windows
    let encoding_id = 1u16; // Unicode BMP
    let language_id = 0x0409u16; // English US
    let name_id = 1u16; // Font family name
    let length = family.name.len() as u16;
    let offset = 0u16; // String offset

    name_data.extend_from_slice(&platform_id.to_be_bytes());
    name_data.extend_from_slice(&encoding_id.to_be_bytes());
    name_data.extend_from_slice(&language_id.to_be_bytes());
    name_data.extend_from_slice(&name_id.to_be_bytes());
    name_data.extend_from_slice(&length.to_be_bytes());
    name_data.extend_from_slice(&offset.to_be_bytes());

    // String data
    name_data.extend_from_slice(family.name.as_bytes());

    Ok(name_data)
}

/// Create a basic OS/2 table
fn create_os2_table(family: &FontFamily) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut os2_data = Vec::new();

    // Version 1 OS/2 table
    let version = 1u16;
    let x_avg_char_width = 1000i16;
    let weight_class = 400u16; // Normal
    let width_class = 5u16; // Medium
    let fs_type = 0u16; // Installable embedding
    let y_subscript_x_size = 650i16;
    let y_subscript_y_size = 600i16;
    let y_subscript_x_offset = 0i16;
    let y_subscript_y_offset = 75i16;
    let y_superscript_x_size = 650i16;
    let y_superscript_y_size = 600i16;
    let y_superscript_x_offset = 0i16;
    let y_superscript_y_offset = 350i16;
    let y_strikeout_size = 50i16;
    let y_strikeout_position = 300i16;
    let family_class = 0i16;

    os2_data.extend_from_slice(&version.to_be_bytes());
    os2_data.extend_from_slice(&x_avg_char_width.to_be_bytes());
    os2_data.extend_from_slice(&weight_class.to_be_bytes());
    os2_data.extend_from_slice(&width_class.to_be_bytes());
    os2_data.extend_from_slice(&fs_type.to_be_bytes());
    os2_data.extend_from_slice(&y_subscript_x_size.to_be_bytes());
    os2_data.extend_from_slice(&y_subscript_y_size.to_be_bytes());
    os2_data.extend_from_slice(&y_subscript_x_offset.to_be_bytes());
    os2_data.extend_from_slice(&y_subscript_y_offset.to_be_bytes());
    os2_data.extend_from_slice(&y_superscript_x_size.to_be_bytes());
    os2_data.extend_from_slice(&y_superscript_y_size.to_be_bytes());
    os2_data.extend_from_slice(&y_superscript_x_offset.to_be_bytes());
    os2_data.extend_from_slice(&y_superscript_y_offset.to_be_bytes());
    os2_data.extend_from_slice(&y_strikeout_size.to_be_bytes());
    os2_data.extend_from_slice(&y_strikeout_position.to_be_bytes());
    os2_data.extend_from_slice(&family_class.to_be_bytes());

    Ok(os2_data)
}

/// Create a basic post table
fn create_post_table(family: &FontFamily) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut post_data = Vec::new();

    // Version 2.0 post table
    let version = 0x00020000u32;
    let italic_angle = 0i32;
    let underline_position = -75i16;
    let underline_thickness = 50i16;
    let is_fixed_pitch = 0u32;
    let min_mem_type42 = 0u32;
    let max_mem_type42 = 0u32;
    let min_mem_type1 = 0u32;
    let max_mem_type1 = 0u32;

    post_data.extend_from_slice(&version.to_be_bytes());
    post_data.extend_from_slice(&italic_angle.to_be_bytes());
    post_data.extend_from_slice(&underline_position.to_be_bytes());
    post_data.extend_from_slice(&underline_thickness.to_be_bytes());
    post_data.extend_from_slice(&is_fixed_pitch.to_be_bytes());
    post_data.extend_from_slice(&min_mem_type42.to_be_bytes());
    post_data.extend_from_slice(&max_mem_type42.to_be_bytes());
    post_data.extend_from_slice(&min_mem_type1.to_be_bytes());
    post_data.extend_from_slice(&max_mem_type1.to_be_bytes());

    Ok(post_data)
}

/// Creates a minimal custom emoji font from a character and PNG image data.
///
/// This is a simplified implementation that creates a basic TTF structure.
/// In a production environment, you'd want to use a proper font generation library
/// to convert PNG images to vector paths and create proper font metrics.
///
/// # Arguments
/// * `emoji_char` - The Unicode character to associate with the emoji
/// * `png_data` - Raw PNG image data as bytes
///
/// # Returns
/// * `Vec<u8>` - The generated TTF font data (simplified structure)
/// * `Result<Vec<u8>, Box<dyn std::error::Error>>` - Error if font generation fails
pub fn custom_emoji_ttf(
    emoji_char: char,
    _png_data: &[u8],
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    // For now, we'll create a minimal TTF structure
    // This is a placeholder implementation - in practice you'd want to:
    // 1. Convert PNG to vector paths
    // 2. Create proper font tables (cmap, glyf, hmtx, etc.)
    // 3. Generate proper TTF binary format

    // Create a simple TTF header structure
    let mut ttf_data = Vec::new();

    // TTF file signature
    ttf_data.extend_from_slice(b"true");

    // Number of tables (simplified)
    let num_tables = 4u16;
    ttf_data.extend_from_slice(&num_tables.to_be_bytes());

    // Search range, entry selector, range shift (simplified values)
    ttf_data.extend_from_slice(&[0x00, 0x10, 0x00, 0x02, 0x00, 0x00]);

    // Table directory entries (simplified)
    // This is a minimal structure - real TTF would have proper table offsets and checksums

    // Add some padding to make it look like a TTF file
    ttf_data.extend_from_slice(&vec![0u8; 100]);

    // Add metadata about the emoji character
    let char_bytes = emoji_char.to_string().into_bytes();
    ttf_data.extend_from_slice(&char_bytes);

    println!(
        "Created minimal TTF structure for emoji character: {}",
        emoji_char
    );
    println!("Note: This is a simplified implementation. For production use, consider using a proper font generation library.");

    Ok(ttf_data)
}

/// Creates a custom emoji font with multiple emoji characters.
///
/// # Arguments
/// * `emoji_mappings` - HashMap mapping characters to PNG image data
///
/// # Returns
/// * `Vec<u8>` - The generated TTF font data
/// * `Result<Vec<u8>, Box<dyn std::error::Error>>` - Error if font generation fails
pub fn custom_emoji_font(
    emoji_mappings: HashMap<char, Vec<u8>>,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    // Create a minimal TTF structure for multiple emojis
    let mut ttf_data = Vec::new();

    // TTF file signature
    ttf_data.extend_from_slice(b"true");

    // Number of tables (simplified)
    let num_tables = emoji_mappings.len() as u16;
    ttf_data.extend_from_slice(&num_tables.to_be_bytes());

    // Search range, entry selector, range shift (simplified values)
    ttf_data.extend_from_slice(&[0x00, 0x10, 0x00, 0x02, 0x00, 0x00]);

    // Add some padding
    ttf_data.extend_from_slice(&vec![0u8; 100]);

    // Add metadata about all emoji characters
    for (emoji_char, _png_data) in emoji_mappings.iter() {
        let char_bytes = emoji_char.to_string().into_bytes();
        ttf_data.extend_from_slice(&char_bytes);
        ttf_data.push(b' '); // separator
    }

    println!(
        "Created minimal TTF structure for {} emoji characters",
        emoji_mappings.len()
    );
    println!("Note: This is a simplified implementation. For production use, consider using a proper font generation library.");

    Ok(ttf_data)
}

/// Helper function to save a TTF font to a file
pub fn save_ttf_font(ttf_data: &[u8], filename: &str) -> Result<(), Box<dyn std::error::Error>> {
    fs::write(filename, ttf_data)?;
    println!("Saved TTF font to: {}", filename);
    Ok(())
}

/// Helper function to create a simple emoji font from a list of characters
pub fn create_simple_emoji_font(chars: &[char]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut emoji_mappings = HashMap::new();

    for &ch in chars {
        // Create placeholder PNG data for each character
        emoji_mappings.insert(ch, vec![0u8; 100]);
    }

    custom_emoji_font(emoji_mappings)
}

/// Test function using write-fonts with sbix table support
/// This tests if we can create PNG-based emoji fonts using the sbix table
pub fn test_write_fonts_sbix() -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    use write_fonts::tables::sbix::HeaderFlags;
    use write_fonts::tables::sbix::{GlyphData, Sbix, Strike};
    use write_fonts::FontBuilder;

    // Create a simple font builder
    let mut builder = FontBuilder::new();

    // Create a simple sbix table with one strike
    let strike = Strike::new(
        160,     // 160 PPEM
        96,      // 96 PPI
        vec![0], // Single glyph offset
    );

    let sbix = Sbix::new(HeaderFlags::default(), vec![strike]);

    // Add sbix table
    builder.add_table(&sbix);

    // Build the font
    let font = builder.build();

    println!(
        "Successfully created TTF font with sbix table using write-fonts: {} bytes",
        font.len()
    );

    Ok(font)
}
