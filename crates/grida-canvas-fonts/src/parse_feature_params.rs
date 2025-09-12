//! Feature parameters table parser
//!
//! This module implements manual parsing of OpenType feature parameters tables
//! to extract UI names, exactly like the JavaScript Typr library does.

use std::collections::HashMap;

/// Parses feature parameters from raw font data to extract UI names.
/// This implements the same logic as the JavaScript Typr library.
pub fn parse_feature_ui_names(font_data: &[u8]) -> HashMap<String, String> {
    let mut ui_names = HashMap::new();

    // Find the GSUB table
    if let Some(gsub_offset) = find_table_offset(font_data, b"GSUB") {
        if let Some(names) = parse_gsub_feature_params(font_data, gsub_offset) {
            ui_names.extend(names);
        }
    }

    ui_names
}

/// Finds the offset of a specific table in the font data
fn find_table_offset(font_data: &[u8], table_tag: &[u8; 4]) -> Option<usize> {
    if font_data.len() < 12 {
        return None;
    }

    // Read the number of tables
    let num_tables = u16::from_be_bytes([font_data[4], font_data[5]]) as usize;

    // Search through the table directory
    for i in 0..num_tables {
        let table_record_offset = 12 + i * 16;
        if table_record_offset + 16 > font_data.len() {
            break;
        }

        let tag = &font_data[table_record_offset..table_record_offset + 4];
        if tag == table_tag {
            let offset = u32::from_be_bytes([
                font_data[table_record_offset + 8],
                font_data[table_record_offset + 9],
                font_data[table_record_offset + 10],
                font_data[table_record_offset + 11],
            ]) as usize;
            return Some(offset);
        }
    }

    None
}

/// Parses GSUB table to extract feature parameters and UI names
fn parse_gsub_feature_params(
    font_data: &[u8],
    _gsub_offset: usize,
) -> Option<HashMap<String, String>> {
    if _gsub_offset + 10 > font_data.len() {
        return None;
    }

    // Read GSUB header
    let feature_list_offset =
        u16::from_be_bytes([font_data[_gsub_offset + 6], font_data[_gsub_offset + 7]]) as usize;

    let feature_list_abs_offset = _gsub_offset + feature_list_offset;

    // Parse feature list
    parse_feature_list(font_data, feature_list_abs_offset, _gsub_offset)
}

/// Parses the feature list to extract feature parameters
fn parse_feature_list(
    font_data: &[u8],
    feature_list_offset: usize,
    _gsub_offset: usize,
) -> Option<HashMap<String, String>> {
    if feature_list_offset + 2 > font_data.len() {
        return None;
    }

    let feature_count = u16::from_be_bytes([
        font_data[feature_list_offset],
        font_data[feature_list_offset + 1],
    ]) as usize;

    let mut ui_names = HashMap::new();

    // Parse each feature record
    for i in 0..feature_count {
        let feature_record_offset = feature_list_offset + 2 + i * 6;
        if feature_record_offset + 6 > font_data.len() {
            break;
        }

        // Read feature tag
        let tag_bytes = &font_data[feature_record_offset..feature_record_offset + 4];
        let tag = String::from_utf8_lossy(tag_bytes).to_string();

        // Read feature offset
        let feature_offset = u16::from_be_bytes([
            font_data[feature_record_offset + 4],
            font_data[feature_record_offset + 5],
        ]) as usize;

        let feature_abs_offset = feature_list_offset + feature_offset;

        // Parse feature table to get parameters offset
        if let Some(ui_name) = parse_feature_table(font_data, feature_abs_offset, &tag) {
            ui_names.insert(tag, ui_name);
        }
    }

    Some(ui_names)
}

/// Parses a feature table to extract UI name from parameters
fn parse_feature_table(font_data: &[u8], feature_offset: usize, tag: &str) -> Option<String> {
    if feature_offset + 4 > font_data.len() {
        return None;
    }

    // Read feature parameters offset
    let params_offset =
        u16::from_be_bytes([font_data[feature_offset], font_data[feature_offset + 1]]) as usize;

    // If no parameters, return None
    if params_offset == 0 {
        return None;
    }

    let params_abs_offset = feature_offset + params_offset;

    // Parse feature parameters based on feature type (like JavaScript version)
    if tag.starts_with("ss") && tag.len() == 4 {
        // Stylistic set parameters
        parse_stylistic_set_params(font_data, params_abs_offset)
    } else if tag.starts_with("cv") && tag.len() == 4 {
        // Character variant parameters
        parse_character_variant_params(font_data, params_abs_offset)
    } else {
        None
    }
}

/// Parses stylistic set parameters (like JavaScript version)
fn parse_stylistic_set_params(font_data: &[u8], params_offset: usize) -> Option<String> {
    if params_offset + 4 > font_data.len() {
        return None;
    }

    // Read UI name ID (offset +2 like JavaScript version)
    let ui_name_id =
        u16::from_be_bytes([font_data[params_offset + 2], font_data[params_offset + 3]]);

    // Look up name in name table
    lookup_name_by_id(font_data, ui_name_id)
}

/// Parses character variant parameters (like JavaScript version)
fn parse_character_variant_params(font_data: &[u8], params_offset: usize) -> Option<String> {
    if params_offset + 4 > font_data.len() {
        return None;
    }

    // Read UI name ID (offset +2 like JavaScript version)
    let ui_name_id =
        u16::from_be_bytes([font_data[params_offset + 2], font_data[params_offset + 3]]);

    // Look up name in name table
    lookup_name_by_id(font_data, ui_name_id)
}

/// Looks up a name by ID in the name table
fn lookup_name_by_id(font_data: &[u8], name_id: u16) -> Option<String> {
    let name_offset = find_table_offset(font_data, b"name")?;

    if name_offset + 6 > font_data.len() {
        return None;
    }

    // Read name table header
    let count =
        u16::from_be_bytes([font_data[name_offset + 2], font_data[name_offset + 3]]) as usize;

    let string_offset =
        u16::from_be_bytes([font_data[name_offset + 4], font_data[name_offset + 5]]) as usize;

    // Search for the name record with matching ID
    for i in 0..count {
        let name_record_offset = name_offset + 6 + i * 12;
        if name_record_offset + 12 > font_data.len() {
            break;
        }

        let record_name_id = u16::from_be_bytes([
            font_data[name_record_offset + 6],
            font_data[name_record_offset + 7],
        ]);

        if record_name_id == name_id {
            // Found matching name record, extract the string
            let length = u16::from_be_bytes([
                font_data[name_record_offset + 8],
                font_data[name_record_offset + 9],
            ]) as usize;

            let offset = u16::from_be_bytes([
                font_data[name_record_offset + 10],
                font_data[name_record_offset + 11],
            ]) as usize;

            let string_abs_offset = name_offset + string_offset + offset;

            if string_abs_offset + length <= font_data.len() {
                let string_data = &font_data[string_abs_offset..string_abs_offset + length];

                // Check platform and encoding to determine how to decode
                let platform_id = u16::from_be_bytes([
                    font_data[name_record_offset],
                    font_data[name_record_offset + 1],
                ]);

                let encoding_id = u16::from_be_bytes([
                    font_data[name_record_offset + 2],
                    font_data[name_record_offset + 3],
                ]);

                // Decode string based on platform and encoding (like JavaScript version)
                if platform_id == 3 && (encoding_id == 0 || encoding_id == 1) {
                    // Unicode encoding
                    return decode_utf16_be(string_data);
                } else if platform_id == 0 {
                    // Unicode platform
                    return decode_utf16_be(string_data);
                } else {
                    // ASCII fallback
                    return Some(String::from_utf8_lossy(string_data).to_string());
                }
            }
        }
    }

    None
}

/// Decodes UTF-16 BE string data
fn decode_utf16_be(data: &[u8]) -> Option<String> {
    if data.len() % 2 != 0 {
        return None;
    }

    let mut utf16_chars = Vec::new();
    for chunk in data.chunks(2) {
        let char_code = u16::from_be_bytes([chunk[0], chunk[1]]);
        utf16_chars.push(char_code);
    }

    String::from_utf16(&utf16_chars).ok()
}
