//! Built-in ttf-parser feature parser
//!
//! This parser uses ttf-parser's built-in feature access methods,
//! providing simpler but faster feature extraction.

use super::{utils, FeatureParser};
use crate::parse::FontFeature;
use crate::parse_feature_params;

/// Built-in ttf-parser feature parser
pub struct BuiltinFeatureParser {
    // No state needed for this parser
}

impl BuiltinFeatureParser {
    pub fn new() -> Self {
        Self {}
    }
}

impl FeatureParser for BuiltinFeatureParser {
    fn parse_features(&self, face: &ttf_parser::Face, font_data: &[u8]) -> Vec<FontFeature> {
        let mut features = Vec::new();

        // Parse feature parameters once for the entire font (performance optimization)
        let cached_ui_names = parse_feature_params::parse_feature_ui_names(font_data);

        // Process GSUB table using built-in methods
        if let Some(gsub_table) = face.tables().gsub {
            features.extend(parse_gsub_features_builtin(
                face,
                gsub_table,
                font_data,
                &cached_ui_names,
            ));
        }

        // Process GPOS table using built-in methods
        if let Some(gpos_table) = face.tables().gpos {
            features.extend(parse_gpos_features_builtin(
                face,
                gpos_table,
                font_data,
                &cached_ui_names,
            ));
        }

        features
    }

    fn name(&self) -> &'static str {
        "builtin"
    }
}

/// Parses GSUB features using ttf-parser's built-in methods.
///
/// This function provides a simpler, faster approach to feature extraction
/// by using ttf-parser's built-in feature access methods.
fn parse_gsub_features_builtin(
    face: &ttf_parser::Face,
    gsub_table: ttf_parser::opentype_layout::LayoutTable,
    font_data: &[u8],
    cached_ui_names: &std::collections::HashMap<String, String>,
) -> Vec<FontFeature> {
    let mut features = Vec::new();

    // Build glyph map once for all features (performance optimization)
    let glyph_map = utils::build_glyph_map(face);

    // Iterate through features directly (similar to our chained approach)
    for i in 0..gsub_table.features.len() {
        if let Some(feature) = gsub_table.features.get(i as u16) {
            let tag = feature.tag.to_string();
            let name = utils::get_feature_name_from_name_table(
                face,
                &tag,
                font_data,
                Some(cached_ui_names),
            );

            // Extract glyphs from all lookups in this feature
            let mut all_glyphs = std::collections::HashSet::new();

            // Iterate through lookup indices manually
            for j in 0..feature.lookup_indices.len() {
                if let Some(lookup_index) = feature.lookup_indices.get(j) {
                    if let Some(lookup) = gsub_table.lookups.get(lookup_index) {
                        // Extract glyphs from all subtables in this lookup
                        for k in 0..lookup.subtables.len() {
                            if let Some(subtable) =
                                lookup
                                    .subtables
                                    .get::<ttf_parser::gsub::SubstitutionSubtable>(k)
                            {
                                match subtable {
                                    // Handle Single substitution
                                    ttf_parser::gsub::SubstitutionSubtable::Single(single_sub) => {
                                        let coverage_glyphs =
                                            extract_coverage_glyphs(&single_sub.coverage());
                                        all_glyphs.extend(coverage_glyphs);
                                    }
                                    // Handle Ligature substitution
                                    ttf_parser::gsub::SubstitutionSubtable::Ligature(lig_sub) => {
                                        let sets = lig_sub.ligature_sets;
                                        for si in 0..sets.len() {
                                            if let Some(set) = sets.get(si) {
                                                for li in 0..set.len() {
                                                    if let Some(lig) = set.get(li) {
                                                        all_glyphs.insert(lig.glyph.0);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    // Handle Chain Context (ChainedSequenceRuleSets)
                                    ttf_parser::gsub::SubstitutionSubtable::ChainContext(
                                        _chain_ctx,
                                    ) => {
                                        // Note: ChainedContextLookup is private, so we can't access its internals
                                        // This demonstrates the limitation of this approach
                                    }
                                    _ => {
                                        // For other subtable types, we can't easily extract glyphs
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Convert glyph IDs to characters
            let glyph_chars: Vec<String> = all_glyphs
                .iter()
                .filter_map(|&gid| glyph_map.get(&gid).copied())
                .map(|c| c.to_string())
                .collect();

            features.push(FontFeature {
                tag: tag.clone(),
                name,
                tooltip: None,
                sample_text: None,
                glyphs: glyph_chars,
                param_labels: Vec::new(),
                lookup_indices: feature.lookup_indices.into_iter().collect(),
                script: "DFLT".to_string(),
                language: "DFLT".to_string(),
                source_table: "GSUB".to_string(),
            });
        }
    }

    features
}

/// Parses GPOS features using ttf-parser's built-in methods.
///
/// This function provides a simpler, faster approach to feature extraction
/// by using ttf-parser's built-in feature access methods.
fn parse_gpos_features_builtin(
    face: &ttf_parser::Face,
    gpos_table: ttf_parser::opentype_layout::LayoutTable,
    font_data: &[u8],
    cached_ui_names: &std::collections::HashMap<String, String>,
) -> Vec<FontFeature> {
    let mut features = Vec::new();

    // Build glyph map once for all features (performance optimization)
    let glyph_map = utils::build_glyph_map(face);

    // Iterate through features directly
    for i in 0..gpos_table.features.len() {
        if let Some(feature) = gpos_table.features.get(i as u16) {
            let tag = feature.tag.to_string();
            let name = utils::get_feature_name_from_name_table(
                face,
                &tag,
                font_data,
                Some(cached_ui_names),
            );

            // Extract glyphs from all lookups in this feature
            let mut all_glyphs = std::collections::HashSet::new();

            // Iterate through lookup indices manually
            for j in 0..feature.lookup_indices.len() {
                if let Some(lookup_index) = feature.lookup_indices.get(j) {
                    if let Some(lookup) = gpos_table.lookups.get(lookup_index) {
                        // Extract glyphs from all subtables in this lookup
                        for k in 0..lookup.subtables.len() {
                            if let Some(subtable) = lookup
                                .subtables
                                .get::<ttf_parser::gpos::PositioningSubtable>(k)
                            {
                                match subtable {
                                    // Handle Single positioning
                                    ttf_parser::gpos::PositioningSubtable::Single(single_pos) => {
                                        let coverage_glyphs =
                                            extract_coverage_glyphs(&single_pos.coverage());
                                        all_glyphs.extend(coverage_glyphs);
                                    }
                                    // Handle Pair positioning
                                    ttf_parser::gpos::PositioningSubtable::Pair(pair_pos) => {
                                        let coverage_glyphs =
                                            extract_coverage_glyphs(&pair_pos.coverage());
                                        all_glyphs.extend(coverage_glyphs);
                                    }
                                    // Handle Chain Context (ChainedSequenceRuleSets)
                                    ttf_parser::gpos::PositioningSubtable::ChainContext(
                                        _chain_ctx,
                                    ) => {
                                        // Note: ChainedContextLookup is private, so we can't access its internals
                                        // This demonstrates the limitation of this approach
                                    }
                                    _ => {
                                        // For other subtable types, we can't easily extract glyphs
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Convert glyph IDs to characters
            let glyph_chars: Vec<String> = all_glyphs
                .iter()
                .filter_map(|&gid| glyph_map.get(&gid).copied())
                .map(|c| c.to_string())
                .collect();

            features.push(FontFeature {
                tag: tag.clone(),
                name,
                tooltip: None,
                sample_text: None,
                glyphs: glyph_chars,
                param_labels: Vec::new(),
                lookup_indices: feature.lookup_indices.into_iter().collect(),
                script: "DFLT".to_string(),
                language: "DFLT".to_string(),
                source_table: "GPOS".to_string(),
            });
        }
    }

    features
}

/// Extracts glyph IDs from a Coverage table.
///
/// This function processes OpenType coverage tables to extract all glyph IDs
/// that are covered by the given coverage table.
fn extract_coverage_glyphs(coverage: &ttf_parser::opentype_layout::Coverage) -> Vec<u16> {
    let mut glyphs = Vec::new();

    match coverage {
        ttf_parser::opentype_layout::Coverage::Format1 {
            glyphs: glyph_array,
        } => {
            for i in 0..glyph_array.len() {
                if let Some(glyph_id) = glyph_array.get(i) {
                    glyphs.push(glyph_id.0);
                }
            }
        }
        ttf_parser::opentype_layout::Coverage::Format2 { records } => {
            for i in 0..records.len() {
                if let Some(record) = records.get(i) {
                    for glyph_id in record.start.0..=record.end.0 {
                        glyphs.push(glyph_id);
                    }
                }
            }
        }
    }

    glyphs
}
