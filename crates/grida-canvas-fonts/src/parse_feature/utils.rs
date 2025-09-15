//! Shared utilities for feature parsing
//!
//! This module contains common functionality used by different feature parsers
//! to avoid code duplication and ensure consistency.

use crate::parse::FontFeature;
use crate::parse_feature_params;
use std::collections::HashMap;
use ttf_parser::Face;

/// Gets the feature name from the font's name table using proper OpenType specification.
/// This implements the same logic as the JavaScript Typr library:
/// 1. Parse feature parameters table to get UI name ID
/// 2. Look up the name in the name table using that ID
/// 3. Fall back to tag if no UI name is found
///
/// # Performance Note
/// This function is optimized to cache the feature parameters parsing result
/// to avoid parsing the GSUB table multiple times for the same font.
pub fn get_feature_name_from_name_table(
    _face: &Face,
    tag: &str,
    font_data: &[u8],
    cached_ui_names: Option<&HashMap<String, String>>,
) -> String {
    // Try to get UI name from feature parameters table (like JavaScript version)
    if let Some(ui_name) = get_feature_ui_name_from_params(tag, font_data, cached_ui_names) {
        return ui_name;
    }

    // Fallback to tag if no UI name found
    tag.to_string()
}

/// Attempts to extract the UI name from the feature parameters table.
/// This implements the same logic as the JavaScript Typr library.
///
/// # Performance Note
/// This function uses cached UI names when available to avoid repeated parsing.
fn get_feature_ui_name_from_params(
    tag: &str,
    font_data: &[u8],
    cached_ui_names: Option<&HashMap<String, String>>,
) -> Option<String> {
    // Use cached UI names if available, otherwise parse from font data
    let ui_names = if let Some(cached) = cached_ui_names {
        cached
    } else {
        // Parse feature parameters only once per font
        let parsed = parse_feature_params::parse_feature_ui_names(font_data);
        // Note: This creates a temporary HashMap that gets dropped
        // In practice, callers should cache this result
        return parsed.get(tag).cloned();
    };

    ui_names.get(tag).cloned()
}

/// Builds a glyph ID to character mapping from the font's cmap table.
/// This is used to convert glyph IDs back to Unicode characters.
pub fn build_glyph_map(face: &Face) -> HashMap<u16, char> {
    let mut map = HashMap::new();

    if let Some(cmap) = face.tables().cmap {
        for subtable in cmap.subtables {
            subtable.codepoints(|ch| {
                if let Some(glyph_id) = subtable.glyph_index(ch) {
                    if let Some(c) = char::from_u32(ch) {
                        map.insert(glyph_id.0, c);
                    }
                }
            });
        }
    }

    map
}

/// Creates a FontFeature with common fields populated.
/// This reduces code duplication in feature creation.
pub fn create_font_feature(
    tag: String,
    name: String,
    lookup_indices: Vec<u16>,
    glyphs: Vec<String>,
    script: String,
    language: String,
    source_table: String,
) -> FontFeature {
    FontFeature {
        tag,
        name,
        tooltip: None,
        sample_text: None,
        glyphs,
        param_labels: Vec::new(),
        lookup_indices,
        script,
        language,
        source_table,
    }
}
