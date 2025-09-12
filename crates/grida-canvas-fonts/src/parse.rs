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

use std::collections::{HashMap, HashSet};
use ttf_parser::{
    gpos, gsub,
    opentype_layout::{Coverage, LookupSubtable},
    Face, Tag,
};

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
}

/// Font metadata parser backed by `ttf-parser`.
///
/// This parser provides access to various OpenType table data including
/// variation axes, style information, and font features.
pub struct Parser<'a> {
    face: Face<'a>,
}

impl<'a> Parser<'a> {
    /// Creates a new parser from raw font data.
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
        let face = Face::parse(data, 0)?;
        Ok(Self { face })
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
        let mut features = Vec::new();

        // Parse GSUB features using raw table access for compatibility
        if let Some(data) = self.face.raw_face().table(Tag::from_bytes(b"GSUB")) {
            features.extend(parse_gsub_features_raw(&self.face, data));
        }

        // Parse GPOS features using high-level API
        if let Some(gpos_table) = self.face.tables().gpos {
            features.extend(parse_gpos_features(&self.face, gpos_table));
        }

        features
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

    /// Gets access to the underlying font face for debugging purposes.
    ///
    /// # Returns
    ///
    /// Returns a reference to the parsed font face.
    pub fn face(&self) -> &Face<'a> {
        &self.face
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

/// Parses GSUB features from raw table data using manual parsing for compatibility.
///
/// This function uses raw table access to maintain compatibility with existing
/// functionality while extracting comprehensive feature information.
///
/// # Arguments
///
/// * `face` - The parsed font face
/// * `data` - Raw GSUB table data
///
/// # Returns
///
/// Returns a vector of `FontFeature` objects from the GSUB table.
fn parse_gsub_features_raw(face: &Face<'_>, data: &[u8]) -> Vec<FontFeature> {
    if data.len() < 10 {
        return Vec::new();
    }
    let feature_list_offset = be_u16(data, 6) as usize;
    let lookup_list_offset = be_u16(data, 8) as usize;

    let glyph_map = build_glyph_map(face);

    if feature_list_offset >= data.len() {
        return Vec::new();
    }
    let fl_base = feature_list_offset;
    let feature_count = be_u16(data, fl_base) as usize;
    let mut features: Vec<FontFeature> = Vec::new();

    for i in 0..feature_count {
        let rec_off = fl_base + 2 + i * 6;
        if rec_off + 6 > data.len() {
            break;
        }
        let tag = tag_to_string(&data[rec_off..rec_off + 4]);
        let feature_off = fl_base + be_u16(data, rec_off + 4) as usize;
        if feature_off + 4 > data.len() {
            continue;
        }
        let params_offset = be_u16(data, feature_off) as usize;
        let lookup_count = be_u16(data, feature_off + 2) as usize;
        let mut lookup_indices = Vec::new();
        for j in 0..lookup_count {
            let li_off = feature_off + 4 + j * 2;
            if li_off + 2 > data.len() {
                break;
            }
            lookup_indices.push(be_u16(data, li_off));
        }

        let mut name = None;
        let mut tooltip = None;
        let mut sample_text = None;
        let mut param_labels: Vec<String> = Vec::new();
        if params_offset != 0 && feature_off + params_offset + 2 <= data.len() {
            let po = feature_off + params_offset;
            if tag.starts_with("ss") {
                // Stylistic Set features only have UI name, no sample text
                if po + 4 <= data.len() {
                    let ui = be_u16(data, po + 2);
                    name = lookup_name(face, ui);
                }
            } else if tag.starts_with("cv") {
                // Character Variant features have UI name, tooltip, sample text, and parameter labels
                if po + 12 <= data.len() {
                    let ui = be_u16(data, po + 2);
                    let ti = be_u16(data, po + 4);
                    let si = be_u16(data, po + 6);
                    let pcnt = be_u16(data, po + 8) as usize;
                    let first = be_u16(data, po + 10);
                    name = lookup_name(face, ui);
                    tooltip = lookup_name(face, ti);
                    sample_text = lookup_name(face, si);

                    for k in 0..pcnt {
                        if let Some(label) = lookup_name(face, first + k as u16) {
                            param_labels.push(label);
                        }
                    }
                }
            }
        }

        let mut glyph_set: HashSet<u16> = HashSet::new();
        for &lookup_index in &lookup_indices {
            glyph_set.extend(parse_lookup_glyphs(data, lookup_list_offset, lookup_index));
        }
        let glyphs: Vec<String> = glyph_set
            .into_iter()
            .filter_map(|gid| glyph_map.get(&gid).copied())
            .map(|c| c.to_string())
            .collect();

        let feature_name = name
            .clone()
            .unwrap_or_else(|| get_feature_name_from_font(face, &tag));
        features.push(FontFeature {
            tag: tag.clone(),
            name: feature_name,
            tooltip,
            sample_text,
            glyphs,
            param_labels,
            lookup_indices,
        });
    }

    features
}

/// Extracts glyph IDs from a GSUB lookup table.
///
/// # Arguments
///
/// * `data` - Raw GSUB table data
/// * `lookup_list_offset` - Offset to the lookup list
/// * `lookup_index` - Index of the lookup to extract
///
/// # Returns
///
/// Returns a vector of glyph IDs covered by the lookup.
fn parse_lookup_glyphs(data: &[u8], lookup_list_offset: usize, lookup_index: u16) -> Vec<u16> {
    let mut glyphs = Vec::new();
    let ll_offset = lookup_list_offset;
    if ll_offset + 2 > data.len() {
        return glyphs;
    }
    let lookup_count = be_u16(data, ll_offset);
    if lookup_index as usize >= lookup_count as usize {
        return glyphs;
    }
    let lookup_offset_pos = ll_offset + 2 + lookup_index as usize * 2;
    if lookup_offset_pos + 2 > data.len() {
        return glyphs;
    }
    let lookup_offset = ll_offset + be_u16(data, lookup_offset_pos) as usize;
    if lookup_offset + 6 > data.len() {
        return glyphs;
    }
    let lookup_type = be_u16(data, lookup_offset);
    let sub_count = be_u16(data, lookup_offset + 4) as usize;
    for i in 0..sub_count {
        let sub_off_pos = lookup_offset + 6 + i * 2;
        if sub_off_pos + 2 > data.len() {
            break;
        }
        let sub_off = lookup_offset + be_u16(data, sub_off_pos) as usize;
        if sub_off > data.len() {
            continue;
        }
        if let Some(subtable) = gsub::SubstitutionSubtable::parse(&data[sub_off..], lookup_type) {
            match subtable {
                gsub::SubstitutionSubtable::Single(s) => {
                    glyphs.extend(coverage_glyphs(s.coverage()));
                }
                gsub::SubstitutionSubtable::Ligature(l) => {
                    let sets = l.ligature_sets;
                    for si in 0..sets.len() {
                        if let Some(set) = sets.get(si) {
                            for li in 0..set.len() {
                                if let Some(lig) = set.get(li) {
                                    glyphs.push(lig.glyph.0);
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }
    glyphs
}

/// Extracts glyph IDs from a Coverage table.
///
/// # Arguments
///
/// * `cov` - The coverage table to extract from
///
/// # Returns
///
/// Returns a vector of glyph IDs covered by the table.
fn coverage_glyphs(cov: Coverage) -> Vec<u16> {
    match cov {
        Coverage::Format1 { glyphs } => (0..glyphs.len())
            .filter_map(|i| glyphs.get(i))
            .map(|g| g.0)
            .collect(),
        Coverage::Format2 { records } => {
            let mut res = Vec::new();
            for i in 0..records.len() {
                if let Some(rec) = records.get(i) {
                    for g in rec.start.0..=rec.end.0 {
                        res.push(g);
                    }
                }
            }
            res
        }
    }
}

/// Builds a map from glyph IDs to Unicode characters using the font's character map.
///
/// # Arguments
///
/// * `face` - The parsed font face
///
/// # Returns
///
/// Returns a HashMap mapping glyph IDs to their corresponding Unicode characters.
fn build_glyph_map(face: &Face<'_>) -> HashMap<u16, char> {
    let mut map = HashMap::new();
    if let Some(cmap) = face.tables().cmap {
        for sub in cmap.subtables.into_iter() {
            if sub.is_unicode() {
                sub.codepoints(|cp| {
                    if let Some(gid) = sub.glyph_index(cp) {
                        if gid.0 != 0 && !map.contains_key(&gid.0) {
                            if let Some(ch) = char::from_u32(cp) {
                                map.insert(gid.0, ch);
                            }
                        }
                    }
                });
            }
        }
    }
    map
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
///
/// # Arguments
///
/// * `data` - The data buffer
/// * `offset` - Byte offset to read from
///
/// # Returns
///
/// Returns the u16 value read from the buffer.
fn be_u16(data: &[u8], offset: usize) -> u16 {
    let b = [data[offset], data[offset + 1]];
    u16::from_be_bytes(b)
}

/// Reads a big-endian fixed-point number from the given offset in the data.
///
/// # Arguments
///
/// * `data` - The data buffer
/// * `offset` - Byte offset to read from
///
/// # Returns
///
/// Returns the fixed-point value as f32.
fn be_fixed(data: &[u8], offset: usize) -> f32 {
    let b = [
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ];
    let v = i32::from_be_bytes(b);
    v as f32 / 65536.0
}

/// Parses GPOS features using the high-level `ttf-parser` API.
///
/// This function extracts features from the GPOS table using the parsed layout table,
/// providing clean access to positioning features like kerning.
///
/// # Arguments
///
/// * `face` - The parsed font face
/// * `gpos_table` - The parsed GPOS layout table
///
/// # Returns
///
/// Returns a vector of `FontFeature` objects from the GPOS table.
fn parse_gpos_features(
    face: &Face<'_>,
    gpos_table: ttf_parser::opentype_layout::LayoutTable<'_>,
) -> Vec<FontFeature> {
    let mut features = Vec::new();

    for feature in gpos_table.features {
        let tag = feature.tag.to_string();
        let lookup_indices: Vec<u16> = feature.lookup_indices.into_iter().collect();

        // Extract glyph coverage for this feature using the gpos module
        let glyphs = analyze_gpos_feature(&gpos_table, &lookup_indices, face);
        let name = get_feature_name_from_font(face, &tag);

        features.push(FontFeature {
            tag,
            name,
            tooltip: None,
            sample_text: None,
            glyphs,
            param_labels: Vec::new(),
            lookup_indices,
        });
    }

    features
}

/// Analyzes a GPOS feature to extract glyph coverage and convert to characters.
///
/// This function processes GPOS positioning subtables to extract which glyphs
/// are covered by the feature, then converts glyph IDs to Unicode characters.
///
/// # Arguments
///
/// * `gpos_table` - The parsed GPOS layout table
/// * `lookup_indices` - Indices of lookups used by this feature
/// * `face` - The parsed font face for character mapping
///
/// # Returns
///
/// Returns a vector of Unicode characters covered by this GPOS feature.
fn analyze_gpos_feature(
    gpos_table: &ttf_parser::opentype_layout::LayoutTable<'_>,
    lookup_indices: &[u16],
    face: &Face<'_>,
) -> Vec<String> {
    let mut covered_glyphs = std::collections::HashSet::new();

    for &lookup_index in lookup_indices {
        if let Some(lookup) = gpos_table.lookups.get(lookup_index) {
            // Try to parse the first subtable to extract coverage
            if let Some(pos_subtable) = lookup.subtables.get::<gpos::PositioningSubtable>(0) {
                match pos_subtable {
                    gpos::PositioningSubtable::Single(single_adj) => {
                        extract_coverage_glyphs(&single_adj.coverage(), &mut covered_glyphs);
                    }
                    gpos::PositioningSubtable::Pair(pair_adj) => {
                        extract_coverage_glyphs(&pair_adj.coverage(), &mut covered_glyphs);
                    }
                    gpos::PositioningSubtable::MarkToBase(mark_to_base) => {
                        extract_coverage_glyphs(&mark_to_base.mark_coverage, &mut covered_glyphs);
                    }
                    gpos::PositioningSubtable::MarkToMark(mark_to_mark) => {
                        extract_coverage_glyphs(&mark_to_mark.mark1_coverage, &mut covered_glyphs);
                    }
                    gpos::PositioningSubtable::Cursive(cursive_adj) => {
                        extract_coverage_glyphs(&cursive_adj.coverage, &mut covered_glyphs);
                    }
                    gpos::PositioningSubtable::MarkToLigature(mark_to_lig) => {
                        extract_coverage_glyphs(&mark_to_lig.mark_coverage, &mut covered_glyphs);
                    }
                    gpos::PositioningSubtable::Context(ctx) => {
                        extract_coverage_glyphs(&ctx.coverage(), &mut covered_glyphs);
                    }
                    gpos::PositioningSubtable::ChainContext(chain_ctx) => {
                        extract_coverage_glyphs(&chain_ctx.coverage(), &mut covered_glyphs);
                    }
                }
            }
        }
    }

    // Build glyph map for converting glyph IDs to characters
    let glyph_map = build_glyph_map(face);

    // Convert glyph IDs to characters
    covered_glyphs
        .into_iter()
        .filter_map(|gid_str| {
            gid_str
                .parse::<u16>()
                .ok()
                .and_then(|gid| glyph_map.get(&gid).copied())
                .map(|c| c.to_string())
        })
        .collect()
}

/// Extracts glyph IDs from a Coverage table and adds them to the set.
///
/// # Arguments
///
/// * `coverage` - The coverage table to extract from
/// * `covered_glyphs` - Mutable set to add glyph IDs to
fn extract_coverage_glyphs(
    coverage: &ttf_parser::opentype_layout::Coverage<'_>,
    covered_glyphs: &mut std::collections::HashSet<String>,
) {
    match coverage {
        ttf_parser::opentype_layout::Coverage::Format1 { glyphs } => {
            for i in 0..glyphs.len() {
                if let Some(glyph_id) = glyphs.get(i) {
                    covered_glyphs.insert(format!("{}", glyph_id.0));
                }
            }
        }
        ttf_parser::opentype_layout::Coverage::Format2 { records } => {
            for i in 0..records.len() {
                if let Some(record) = records.get(i) {
                    // Add all glyphs in the range
                    for glyph_id in record.start.0..=record.end.0 {
                        covered_glyphs.insert(format!("{}", glyph_id));
                    }
                }
            }
        }
    }
}

/// Attempts to get a human-readable feature name from the font's data.
///
/// This function tries to extract feature names from the font's `feat` table
/// or name table, falling back to the tag itself if no name is found.
///
/// # Arguments
///
/// * `face` - The parsed font face
/// * `tag` - The feature tag to look up
///
/// # Returns
///
/// Returns the feature name if found, or the tag itself as fallback.
fn get_feature_name_from_font(face: &Face<'_>, tag: &str) -> String {
    // First, try to get the name from the feat table if available
    if let Some(feat_table) = face.tables().feat {
        // Convert tag to feature ID by looking up the feature in the feat table
        // The feat table uses feature IDs, not tags, so we need to find the matching feature
        for i in 0..feat_table.names.len() {
            if let Some(feature_name) = feat_table.names.get(i) {
                // For now, we'll use a simple approach: try to find a feature name
                // that might correspond to our tag. This is not perfect but works for common cases.
                if let Some(name) = lookup_name(face, feature_name.name_index) {
                    // Check if this name might be related to our tag
                    // This is a heuristic approach - in a real implementation,
                    // you'd need proper tag-to-ID mapping
                    if name.to_lowercase().contains(&tag.to_lowercase())
                        || tag.to_lowercase().contains(&name.to_lowercase())
                    {
                        return name;
                    }
                }
            }
        }

        // If no specific match found, try to get any name from the feat table
        for feature_name in feat_table.names {
            if let Some(name) = lookup_name(face, feature_name.name_index) {
                return name;
            }
        }
    }

    // If feat table is not available or doesn't have the feature,
    // fall back to the tag itself as the name
    tag.to_string()
}
