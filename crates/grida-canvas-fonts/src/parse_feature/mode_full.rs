//! Comprehensive feature parser
//!
//! This parser extracts features with full script/language context,
//! providing the most detailed information about feature availability.

use super::{utils, FeatureParser};
use crate::parse::FontFeature;
use crate::parse_feature_params;
use std::collections::{HashMap, HashSet};
use ttf_parser::opentype_layout::Coverage;
use ttf_parser::{gpos, gsub};

/// Comprehensive feature parser that extracts script/language context
pub struct ComprehensiveFeatureParser {
    // No state needed for this parser
}

impl ComprehensiveFeatureParser {
    pub fn new() -> Self {
        Self {}
    }
}

impl FeatureParser for ComprehensiveFeatureParser {
    fn parse_features(&self, face: &ttf_parser::Face, font_data: &[u8]) -> Vec<FontFeature> {
        let mut features = Vec::new();

        // Parse feature parameters once for the entire font (performance optimization)
        let cached_ui_names = parse_feature_params::parse_feature_ui_names(font_data);

        // Process GSUB table with context
        if let Some(gsub_table) = face.tables().gsub {
            features.extend(parse_gsub_features_with_context(
                face,
                gsub_table,
                font_data,
                &cached_ui_names,
            ));
        }

        // Process GPOS table with context
        if let Some(gpos_table) = face.tables().gpos {
            features.extend(parse_gpos_features_with_context(
                face,
                gpos_table,
                font_data,
                &cached_ui_names,
            ));
        }

        features
    }

    fn name(&self) -> &'static str {
        "comprehensive"
    }
}

/// Parses GSUB features with script/language context preserved.
///
/// This function extracts features from the GSUB table while maintaining
/// script and language system information, providing comprehensive feature data.
fn parse_gsub_features_with_context(
    face: &ttf_parser::Face,
    gsub_table: ttf_parser::opentype_layout::LayoutTable,
    font_data: &[u8],
    cached_ui_names: &std::collections::HashMap<String, String>,
) -> Vec<FontFeature> {
    let mut features = Vec::new();
    let glyph_map = utils::build_glyph_map(face);

    for script in gsub_table.scripts {
        let script_tag = script.tag.to_string();

        for language in script.languages {
            let language_tag = language.tag.to_string();

            // Get features for this language
            for i in 0..language.feature_indices.len() {
                if let Some(feature_index) = language.feature_indices.get(i) {
                    if let Some(feature) = gsub_table.features.get(feature_index) {
                        let tag = feature.tag.to_string();
                        let lookup_indices: Vec<u16> = feature.lookup_indices.into_iter().collect();

                        // Extract glyph coverage for this feature
                        let glyphs =
                            analyze_gsub_feature_simple(&gsub_table, &lookup_indices, &glyph_map);
                        let name = utils::get_feature_name_from_name_table(
                            face,
                            &tag,
                            font_data,
                            Some(cached_ui_names),
                        );

                        features.push(FontFeature {
                            tag: tag.clone(),
                            name,
                            tooltip: None,
                            sample_text: None,
                            glyphs,
                            param_labels: Vec::new(),
                            lookup_indices,
                            script: script_tag.clone(),
                            language: language_tag.clone(),
                            source_table: "GSUB".to_string(),
                        });
                    }
                }
            }
        }
    }

    features
}

/// Parses GPOS features with script/language context preserved.
///
/// This function extracts features from the GPOS table while maintaining
/// script and language system information, providing comprehensive feature data.
fn parse_gpos_features_with_context(
    face: &ttf_parser::Face,
    gpos_table: ttf_parser::opentype_layout::LayoutTable,
    font_data: &[u8],
    cached_ui_names: &std::collections::HashMap<String, String>,
) -> Vec<FontFeature> {
    let mut features = Vec::new();

    // Check if any scripts have languages
    let mut has_language_systems = false;
    for i in 0..gpos_table.scripts.len() {
        if let Some(script) = gpos_table.scripts.get(i as u16) {
            if script.languages.len() > 0 {
                has_language_systems = true;
                break;
            }
        }
    }

    if has_language_systems {
        // Parse features through script/language hierarchy (like GSUB)
        for i in 0..gpos_table.scripts.len() {
            if let Some(script) = gpos_table.scripts.get(i as u16) {
                let script_tag = script.tag.to_string();

                for language in script.languages {
                    let language_tag = language.tag.to_string();

                    // Get features for this language
                    for j in 0..language.feature_indices.len() {
                        if let Some(feature_index) = language.feature_indices.get(j) {
                            if let Some(feature) = gpos_table.features.get(feature_index) {
                                let tag = feature.tag.to_string();
                                let lookup_indices: Vec<u16> =
                                    feature.lookup_indices.into_iter().collect();

                                // Extract glyph coverage for this feature using the gpos module
                                let glyphs =
                                    analyze_gpos_feature(&gpos_table, &lookup_indices, face);
                                let name = utils::get_feature_name_from_name_table(
                                    face,
                                    &tag,
                                    font_data,
                                    Some(cached_ui_names),
                                );

                                features.push(FontFeature {
                                    tag: tag.clone(),
                                    name,
                                    tooltip: None,
                                    sample_text: None,
                                    glyphs,
                                    param_labels: Vec::new(),
                                    lookup_indices,
                                    script: script_tag.clone(),
                                    language: language_tag.clone(),
                                    source_table: "GPOS".to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    } else {
        // No language systems - parse features directly (like Inter font)
        for i in 0..gpos_table.features.len() {
            if let Some(feature) = gpos_table.features.get(i as u16) {
                let tag = feature.tag.to_string();
                let lookup_indices: Vec<u16> = feature.lookup_indices.into_iter().collect();

                // Extract glyph coverage for this feature using the gpos module
                let glyphs = analyze_gpos_feature(&gpos_table, &lookup_indices, face);
                let name = utils::get_feature_name_from_name_table(
                    face,
                    &tag,
                    font_data,
                    Some(cached_ui_names),
                );

                features.push(FontFeature {
                    tag: tag.clone(),
                    name,
                    tooltip: None,
                    sample_text: None,
                    glyphs,
                    param_labels: Vec::new(),
                    lookup_indices,
                    script: "DFLT".to_string(),
                    language: "DFLT".to_string(),
                    source_table: "GPOS".to_string(),
                });
            }
        }
    }

    features
}

/// Simple GSUB feature analysis that extracts glyph coverage.
///
/// This is a simplified version that doesn't try to parse complex subtables.
/// It focuses on extracting glyph coverage information for feature analysis.
fn analyze_gsub_feature_simple(
    gsub_table: &ttf_parser::opentype_layout::LayoutTable,
    lookup_indices: &[u16],
    glyph_map: &HashMap<u16, char>,
) -> Vec<String> {
    let mut covered_glyphs = std::collections::HashSet::new();

    for &lookup_index in lookup_indices {
        if let Some(lookup) = gsub_table.lookups.get(lookup_index) {
            // Try to parse the first subtable to extract coverage
            if let Some(sub_subtable) = lookup.subtables.get::<gsub::SubstitutionSubtable>(0) {
                match sub_subtable {
                    gsub::SubstitutionSubtable::Single(single_sub) => {
                        let glyph_ids = coverage_glyphs(single_sub.coverage());
                        for glyph_id in glyph_ids {
                            covered_glyphs.insert(glyph_id);
                        }
                    }
                    gsub::SubstitutionSubtable::Ligature(lig_sub) => {
                        // For ligature subtables, we extract the first glyph of each ligature
                        let sets = lig_sub.ligature_sets;
                        for si in 0..sets.len() {
                            if let Some(set) = sets.get(si) {
                                for li in 0..set.len() {
                                    if let Some(lig) = set.get(li) {
                                        covered_glyphs.insert(lig.glyph.0);
                                    }
                                }
                            }
                        }
                    }
                    _ => {
                        // For other subtable types, we'll skip for now
                        // This is a simplified implementation
                    }
                }
            }
        }
    }

    // Convert glyph IDs to characters
    covered_glyphs
        .into_iter()
        .filter_map(|gid| glyph_map.get(&gid).copied())
        .map(|c| c.to_string())
        .collect()
}

/// Analyzes a GPOS feature to extract glyph coverage.
///
/// This function processes GPOS lookups to determine which glyphs are affected
/// by positioning features like kerning.
fn analyze_gpos_feature(
    gpos_table: &ttf_parser::opentype_layout::LayoutTable,
    lookup_indices: &[u16],
    face: &ttf_parser::Face,
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
    let glyph_map = utils::build_glyph_map(face);

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
/// This function processes OpenType coverage tables to extract glyph IDs
/// and convert them to Unicode characters for feature analysis.
fn extract_coverage_glyphs(coverage: &Coverage, glyph_set: &mut HashSet<String>) {
    let glyph_ids = coverage_glyphs(coverage.clone());
    for glyph_id in glyph_ids {
        glyph_set.insert(glyph_id.to_string());
    }
}

/// Extracts glyph IDs from a Coverage table.
///
/// This function processes OpenType coverage tables to extract all glyph IDs
/// that are covered by the given coverage table.
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
