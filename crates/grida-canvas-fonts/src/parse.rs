//! Font Parsing Module
//!
//! This module provides comprehensive font parsing functionality using `ttf-parser`.
//! It extracts font metadata, variation axes, OpenType features, and other font table information.
//!
//! # Features
//!
//! - **Variable Font Support**: Parses `fvar` and `STAT` tables for font variations
//! - **OpenType Features**: Extracts both GSUB and GPOS features with glyph coverage
//! - **Font Selection**: Provides face record extraction for font matching
//! - **Clean API**: No hardcoded UI labels, relies only on font data

use std::collections::HashMap;
use ttf_parser::{Face, Tag};

use crate::parse_feature::{FeatureParser, ParserType, DEFAULT_PARSER};

/// Represents a single variation axis from the `fvar` table.
#[derive(Debug, Clone)]
pub struct FvarAxis {
    /// The axis tag (e.g., "wght", "wdth", "slnt")
    pub tag: String,
    /// Minimum value for this axis
    pub min: f32,
    /// Default value for this axis
    pub def: f32,
    /// Maximum value for this axis
    pub max: f32,
    /// Whether this axis is hidden
    pub hidden: bool,
    /// Human-readable name for this axis
    pub name: String,
}

/// Represents a named instance from the `fvar` table.
#[derive(Debug, Clone)]
pub struct FvarInstance {
    /// Instance name
    pub name: String,
    /// Coordinate values for each axis
    pub coordinates: HashMap<String, f32>,
    /// Instance flags
    pub flags: u16,
    /// PostScript name if available
    pub postscript_name: Option<String>,
}

/// Parsed data from the `fvar` table containing all variation information.
#[derive(Debug, Clone, Default)]
pub struct FvarData {
    /// All variation axes indexed by tag
    pub axes: HashMap<String, FvarAxis>,
    /// All named instances
    pub instances: Vec<FvarInstance>,
}

/// Represents an axis value in the `STAT` table.
#[derive(Debug, Clone)]
pub struct StatAxisValue {
    /// Value name
    pub name: String,
    /// Axis value
    pub value: f32,
    /// Linked value if applicable
    pub linked_value: Option<f32>,
    /// Range minimum value if applicable
    pub range_min_value: Option<f32>,
    /// Range maximum value if applicable
    pub range_max_value: Option<f32>,
}

/// Represents an axis in the `STAT` table.
#[derive(Debug, Clone)]
pub struct StatAxis {
    /// Axis tag
    pub tag: String,
    /// Axis name
    pub name: String,
    /// All values for this axis
    pub values: Vec<StatAxisValue>,
}

/// Represents a style combination in the `STAT` table.
#[derive(Debug, Clone)]
pub struct StatCombination {
    /// Combination name
    pub name: String,
    /// Values for each axis in this combination
    pub values: Vec<(String, f32)>,
}

/// Parsed data from the `STAT` table containing style information.
#[derive(Debug, Clone, Default)]
pub struct StatData {
    /// All axes with their values
    pub axes: Vec<StatAxis>,
    /// All style combinations
    pub combinations: Vec<StatCombination>,
    /// Elided fallback name if available
    pub elided_fallback_name: Option<String>,
}

/// Represents a font feature parsed from OpenType tables (GSUB/GPOS).
#[derive(Debug, Clone, Default)]
pub struct FontFeature {
    /// Feature tag (e.g., "kern", "liga", "ss01")
    pub tag: String,
    /// Human-readable feature name
    pub name: String,
    /// Tooltip text if available
    pub tooltip: Option<String>,
    /// Sample text if available
    pub sample_text: Option<String>,
    /// Characters covered by this feature
    pub glyphs: Vec<String>,
    /// Parameter labels if available
    pub param_labels: Vec<String>,
    /// Lookup table indices used by this feature
    pub lookup_indices: Vec<u16>,
    /// Script system this feature belongs to (e.g., "latn", "cyrl", "grek", "DFLT")
    pub script: String,
    /// Language system this feature belongs to (e.g., "CAT", "MOL", "ROM", "DFLT")
    pub language: String,
    /// Source table this feature comes from ("GSUB" or "GPOS")
    pub source_table: String,
}

/// Font metadata parser backed by `ttf-parser`.
///
/// This parser provides access to various OpenType table data including
/// variation axes, style information, and font features.
pub struct Parser<'a> {
    face: Face<'a>,
    font_data: &'a [u8],
    feature_parser: Box<dyn FeatureParser>,
}

impl<'a> Parser<'a> {
    /// Creates a new parser from raw font data using the default feature parser.
    ///
    /// # Arguments
    ///
    /// * `data` - Raw font file bytes
    ///
    /// # Returns
    ///
    /// * `Ok(Parser)` - Successfully parsed font
    /// * `Err(FaceParsingError)` - Failed to parse font data
    pub fn new(data: &'a [u8]) -> Result<Self, ttf_parser::FaceParsingError> {
        Self::with_feature_parser(data, DEFAULT_PARSER)
    }

    /// Creates a new parser from raw font data with a specific feature parser.
    ///
    /// # Arguments
    ///
    /// * `data` - Raw font file bytes
    /// * `parser_type` - Type of feature parser to use
    ///
    /// # Returns
    ///
    /// * `Ok(Parser)` - Successfully parsed font
    /// * `Err(FaceParsingError)` - Failed to parse font data
    pub fn with_feature_parser(
        data: &'a [u8],
        parser_type: ParserType,
    ) -> Result<Self, ttf_parser::FaceParsingError> {
        let face = Face::parse(data, 0)?;
        let feature_parser = parser_type.create_parser();
        Ok(Self {
            face,
            font_data: data,
            feature_parser,
        })
    }

    /// Parses the `fvar` table, returning variation axes and named instances.
    ///
    /// # Returns
    ///
    /// Returns `FvarData` containing all variation information, or empty data
    /// if the font is not variable or the `fvar` table is missing.
    pub fn fvar(&self) -> FvarData {
        if !self.face.is_variable() {
            return FvarData::default();
        }

        // Use ttf-parser's built-in variation_axes() for axes
        let mut axes: HashMap<String, FvarAxis> = HashMap::new();
        for axis in self.face.variation_axes() {
            let tag = axis.tag.to_string();
            let name = lookup_name(&self.face, axis.name_id).unwrap_or_default();
            axes.insert(
                tag.clone(),
                FvarAxis {
                    tag,
                    min: axis.min_value,
                    def: axis.def_value,
                    max: axis.max_value,
                    hidden: axis.hidden,
                    name,
                },
            );
        }

        // For instances, we still need manual parsing since ttf-parser doesn't expose them
        // See: https://github.com/harfbuzz/ttf-parser/issues/129
        let instances = if let Some(table) = self.face.raw_face().table(Tag::from_bytes(b"fvar")) {
            parse_fvar_instances(&self.face, table, &axes.keys().cloned().collect::<Vec<_>>())
        } else {
            Vec::new()
        };

        FvarData { axes, instances }
    }

    /// Parses the `STAT` table providing axis values and combinations.
    ///
    /// # Returns
    ///
    /// Returns `StatData` containing style information, or empty data
    /// if the `STAT` table is missing.
    pub fn stat(&self) -> StatData {
        let table = match self.face.raw_face().table(Tag::from_bytes(b"STAT")) {
            Some(t) => t,
            None => return StatData::default(),
        };
        parse_stat(&self.face, table)
    }

    /// Parses both `GSUB` and `GPOS` tables to extract available font features.
    ///
    /// This method combines features from both substitution (GSUB) and positioning (GPOS)
    /// tables, providing a comprehensive list of all available OpenType features.
    ///
    /// # Returns
    ///
    /// Returns a vector of `FontFeature` objects containing:
    /// - Feature tags and names
    /// - Glyph coverage (characters affected by the feature)
    /// - Lookup table indices
    /// - Additional metadata when available
    ///
    // note: keep the name ffeatures (with double "ff") - this is to avoid rust compiler errors
    pub fn ffeatures(&self) -> Vec<FontFeature> {
        self.feature_parser
            .parse_features(&self.face, self.font_data)
    }

    /// Gets a reference to the underlying font face.
    pub fn face(&self) -> &Face<'a> {
        &self.face
    }

    /// Extracts a face record for font selection.
    ///
    /// # Arguments
    ///
    /// * `face_id` - Unique identifier for the face
    /// * `user_font_style_italic` - User preference for italic style
    ///
    /// # Returns
    ///
    /// * `Ok(FaceRecord)` - Successfully extracted face record
    /// * `Err(String)` - Failed to extract face record
    pub fn extract_face_record(
        &self,
        face_id: String,
        user_font_style_italic: Option<bool>,
    ) -> Result<crate::selection::FaceRecord, String> {
        crate::selection::extract_face_record(&self.face, face_id, user_font_style_italic)
    }

    /// Checks if this is a variable font.
    ///
    /// # Returns
    ///
    /// Returns `true` if the font contains variation data, `false` otherwise.
    pub fn is_variable(&self) -> bool {
        self.face.is_variable()
    }

    /// Checks if this is a strict (OS/2) italic font.
    pub fn is_strict_italic(&self) -> bool {
        self.face.is_italic()
    }
}

/// Parses only the instances from the `fvar` table.
///
/// This function manually parses the instance records from the raw `fvar` table data,
/// as `ttf-parser` does not currently provide a high-level API for this.
///
/// **Note**: This is a temporary implementation. See [ttf-parser issue #129](https://github.com/harfbuzz/ttf-parser/issues/129)
/// for the feature request to add built-in support for `fvar` instances parsing.
/// This manual parsing should be replaced once `ttf-parser` adds official support.
///
/// # Arguments
///
/// * `face` - The parsed font face
/// * `data` - Raw `fvar` table data
/// * `axis_tags` - List of axis tags in order
///
/// # Returns
///
/// Returns a vector of `FvarInstance` objects.
fn parse_fvar_instances(face: &Face<'_>, data: &[u8], axis_tags: &[String]) -> Vec<FvarInstance> {
    if data.len() < 16 {
        return Vec::new();
    }
    let axis_offset = be_u16(data, 4) as usize;
    let axis_count = be_u16(data, 8) as usize;
    let axis_size = be_u16(data, 10) as usize;
    let instance_count = be_u16(data, 12) as usize;
    let instance_size = be_u16(data, 14) as usize;

    let mut instances: Vec<FvarInstance> = Vec::new();
    let mut inst_off = axis_offset + axis_count * axis_size;
    for _ in 0..instance_count {
        if inst_off + instance_size > data.len() {
            break;
        }
        let name_id = be_u16(data, inst_off);
        let flags = be_u16(data, inst_off + 2);
        let mut coords = HashMap::new();
        let mut coord_off = inst_off + 4;
        for tag in axis_tags {
            if coord_off + 4 > data.len() {
                break;
            }
            let v = be_fixed(data, coord_off);
            coords.insert(tag.clone(), v);
            coord_off += 4;
        }
        let mut postscript_name = None;
        if instance_size >= 4 + axis_tags.len() * 4 + 2 {
            let ps_id = be_u16(data, inst_off + instance_size - 2);
            if ps_id != 0 && ps_id != 0xFFFF {
                postscript_name = lookup_name(face, ps_id);
            }
        }
        let name = lookup_name(face, name_id).unwrap_or_default();
        instances.push(FvarInstance {
            name,
            coordinates: coords,
            flags,
            postscript_name,
        });
        inst_off += instance_size;
    }

    instances
}

/// Parses the `STAT` table from raw font data.
///
/// # Arguments
///
/// * `face` - The parsed font face
/// * `data` - Raw `STAT` table data
///
/// # Returns
///
/// Returns `StatData` containing all style information and axis values.
fn parse_stat(face: &Face<'_>, data: &[u8]) -> StatData {
    let table = match ttf_parser::stat::Table::parse(data) {
        Some(t) => t,
        None => return StatData::default(),
    };

    let mut axes: Vec<StatAxis> = Vec::new();
    let mut tags: Vec<String> = Vec::new();
    for record in table.axes.clone() {
        let tag = tag_to_string(&record.tag.to_bytes());
        let name = lookup_name(face, record.name_id).unwrap_or_default();
        tags.push(tag.clone());
        axes.push(StatAxis {
            tag,
            name,
            values: Vec::new(),
        });
    }

    let mut combinations: Vec<StatCombination> = Vec::new();
    for sub in table.subtables() {
        match sub {
            ttf_parser::stat::AxisValueSubtable::Format1(v) => {
                if let Some(axis) = axes.get_mut(v.axis_index as usize) {
                    let name = lookup_name(face, v.value_name_id).unwrap_or_default();
                    axis.values.push(StatAxisValue {
                        name,
                        value: v.value.0,
                        linked_value: None,
                        range_min_value: None,
                        range_max_value: None,
                    });
                }
            }
            ttf_parser::stat::AxisValueSubtable::Format2(v) => {
                if let Some(axis) = axes.get_mut(v.axis_index as usize) {
                    let name = lookup_name(face, v.value_name_id).unwrap_or_default();
                    axis.values.push(StatAxisValue {
                        name,
                        value: v.nominal_value.0,
                        linked_value: None,
                        range_min_value: Some(v.range_min_value.0),
                        range_max_value: Some(v.range_max_value.0),
                    });
                }
            }
            ttf_parser::stat::AxisValueSubtable::Format3(v) => {
                if let Some(axis) = axes.get_mut(v.axis_index as usize) {
                    let name = lookup_name(face, v.value_name_id).unwrap_or_default();
                    axis.values.push(StatAxisValue {
                        name,
                        value: v.value.0,
                        linked_value: Some(v.linked_value.0),
                        range_min_value: None,
                        range_max_value: None,
                    });
                }
            }
            ttf_parser::stat::AxisValueSubtable::Format4(v) => {
                let name = lookup_name(face, v.value_name_id).unwrap_or_default();
                let mut values = Vec::new();
                for av in v.values {
                    if let Some(tag) = tags.get(av.axis_index as usize) {
                        values.push((tag.clone(), av.value.0));
                    }
                }
                combinations.push(StatCombination { name, values });
            }
        }
    }

    let elided_fallback_name = table.fallback_name_id.and_then(|id| lookup_name(face, id));

    StatData {
        axes,
        combinations,
        elided_fallback_name,
    }
}

/// Looks up a name from the font's name table by ID.
///
/// # Arguments
///
/// * `face` - The parsed font face
/// * `id` - Name table ID to look up
///
/// # Returns
///
/// Returns the name string if found, `None` otherwise.
fn lookup_name(face: &Face<'_>, id: u16) -> Option<String> {
    face.names()
        .into_iter()
        .find(|n| n.name_id == id && n.is_unicode())
        .and_then(|n| n.to_string())
}

/// Converts a 4-byte tag to a string.
///
/// # Arguments
///
/// * `bytes` - 4-byte tag data
///
/// # Returns
///
/// Returns the tag as a string, or empty string if invalid UTF-8.
fn tag_to_string(bytes: &[u8]) -> String {
    std::str::from_utf8(bytes).unwrap_or("").to_string()
}

/// Reads a big-endian u16 from the given offset in the data.
fn be_u16(data: &[u8], offset: usize) -> u16 {
    if offset + 2 > data.len() {
        return 0;
    }
    u16::from_be_bytes([data[offset], data[offset + 1]])
}

/// Reads a big-endian fixed-point 16.16 number from the given offset in the data.
fn be_fixed(data: &[u8], offset: usize) -> f32 {
    if offset + 4 > data.len() {
        return 0.0;
    }
    let int_part = be_u16(data, offset) as f32;
    let frac_part = be_u16(data, offset + 2) as f32 / 65536.0;
    int_part + frac_part
}
