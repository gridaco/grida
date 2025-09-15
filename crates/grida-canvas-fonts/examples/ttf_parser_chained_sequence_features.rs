use fonts::parse::Parser;

fn main() {
    // Load Inter font
    let font_data =
        include_bytes!("../../../fixtures/fonts/Inter/Inter-VariableFont_opsz,wght.ttf");
    let parser = Parser::new(font_data).unwrap();
    let face = parser.face();

    println!("=== CHAINED SEQUENCE FEATURES APPROACH ===");

    // Build glyph map for ID to character conversion
    let glyph_map = build_glyph_map(face);

    // Try to extract features using ChainedSequenceRuleSets approach
    let chained_features = extract_features_via_chained_sequences(face, &glyph_map);

    println!("\n🔍 CHAINED SEQUENCE APPROACH RESULTS:");
    println!("Found {} features", chained_features.len());

    // Group by feature tag
    let mut feature_groups: std::collections::HashMap<String, Vec<_>> =
        std::collections::HashMap::new();
    for feature in &chained_features {
        feature_groups
            .entry(feature.tag.clone())
            .or_default()
            .push(feature);
    }

    for (tag, features) in feature_groups {
        println!("\n📋 Feature: {}", tag);
        println!("  Variants: {}", features.len());

        let total_glyphs: std::collections::HashSet<_> =
            features.iter().flat_map(|f| &f.glyphs).collect();

        println!("  Total unique glyphs: {}", total_glyphs.len());
        if !total_glyphs.is_empty() {
            let sample: Vec<_> = total_glyphs.iter().take(10).collect();
            println!("  Sample glyphs: {:?}", sample);
        }
    }

    // Compare with our current approach
    println!("\n🔄 COMPARISON WITH CURRENT APPROACH:");
    let current_features = parser.ffeatures();
    let current_kern: Vec<_> = current_features
        .iter()
        .filter(|f| f.tag == "kern")
        .collect();
    let chained_kern: Vec<_> = chained_features
        .iter()
        .filter(|f| f.tag == "kern")
        .collect();

    println!("Current approach - kern features: {}", current_kern.len());
    for (i, feature) in current_kern.iter().enumerate() {
        println!("  Kern {}: {} glyphs", i + 1, feature.glyphs.len());
    }

    println!("Chained approach - kern features: {}", chained_kern.len());
    for (i, feature) in chained_kern.iter().enumerate() {
        println!("  Kern {}: {} glyphs", i + 1, feature.glyphs.len());
    }

    // Check if we can extract the same glyph coverage
    let current_glyphs: std::collections::HashSet<_> =
        current_kern.iter().flat_map(|f| &f.glyphs).collect();
    let chained_glyphs: std::collections::HashSet<_> =
        chained_kern.iter().flat_map(|f| &f.glyphs).collect();

    println!("\n📊 GLYPH COVERAGE COMPARISON:");
    println!("Current approach unique glyphs: {}", current_glyphs.len());
    println!("Chained approach unique glyphs: {}", chained_glyphs.len());

    let intersection: std::collections::HashSet<_> =
        current_glyphs.intersection(&chained_glyphs).collect();
    let current_only: std::collections::HashSet<_> =
        current_glyphs.difference(&chained_glyphs).collect();
    let chained_only: std::collections::HashSet<_> =
        chained_glyphs.difference(&current_glyphs).collect();

    println!("Intersection: {} glyphs", intersection.len());
    println!("Current only: {} glyphs", current_only.len());
    println!("Chained only: {} glyphs", chained_only.len());

    if !current_only.is_empty() {
        println!(
            "Current-only sample: {:?}",
            current_only.iter().take(5).collect::<Vec<_>>()
        );
    }
    if !chained_only.is_empty() {
        println!(
            "Chained-only sample: {:?}",
            chained_only.iter().take(5).collect::<Vec<_>>()
        );
    }
}

#[derive(Debug, Clone)]
struct ChainedFeature {
    pub tag: String,
    pub name: String,
    pub glyphs: Vec<String>,
    pub source_table: String,
}

fn build_glyph_map(face: &ttf_parser::Face) -> std::collections::HashMap<u16, char> {
    let mut glyph_map = std::collections::HashMap::new();

    // Use cmap to build glyph ID to character mapping
    if let Some(cmap) = face.tables().cmap {
        for subtable in cmap.subtables {
            subtable.codepoints(|ch| {
                if let Some(glyph_id) = subtable.glyph_index(ch) {
                    if let Some(c) = char::from_u32(ch) {
                        glyph_map.insert(glyph_id.0, c);
                    }
                }
            });
        }
    }

    glyph_map
}

fn extract_features_via_chained_sequences(
    face: &ttf_parser::Face,
    glyph_map: &std::collections::HashMap<u16, char>,
) -> Vec<ChainedFeature> {
    let mut features = Vec::new();

    // Process GSUB table - simplified approach
    if let Some(gsub_table) = face.tables().gsub {
        features.extend(extract_gsub_features_simplified(
            face, gsub_table, glyph_map,
        ));
    }

    // Process GPOS table - simplified approach
    if let Some(gpos_table) = face.tables().gpos {
        features.extend(extract_gpos_features_simplified(
            face, gpos_table, glyph_map,
        ));
    }

    features
}

fn extract_gsub_features_simplified(
    face: &ttf_parser::Face,
    gsub_table: ttf_parser::opentype_layout::LayoutTable,
    glyph_map: &std::collections::HashMap<u16, char>,
) -> Vec<ChainedFeature> {
    let mut features = Vec::new();

    // Iterate through features directly
    for i in 0..gsub_table.features.len() {
        if let Some(feature) = gsub_table.features.get(i as u16) {
            let tag = feature.tag.to_string();
            let name = get_feature_name_from_font(face, &tag);

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
                                        println!("  Found ChainContext subtable in GSUB lookup {} subtable {}", lookup_index, k);
                                    }
                                    _ => {
                                        // For other subtable types, we can't easily extract glyphs
                                        println!("  Found other subtable type in GSUB lookup {} subtable {}", lookup_index, k);
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

            features.push(ChainedFeature {
                tag,
                name,
                glyphs: glyph_chars,
                source_table: "GSUB".to_string(),
            });
        }
    }

    features
}

fn extract_gpos_features_simplified(
    face: &ttf_parser::Face,
    gpos_table: ttf_parser::opentype_layout::LayoutTable,
    glyph_map: &std::collections::HashMap<u16, char>,
) -> Vec<ChainedFeature> {
    let mut features = Vec::new();

    // Iterate through features directly
    for i in 0..gpos_table.features.len() {
        if let Some(feature) = gpos_table.features.get(i as u16) {
            let tag = feature.tag.to_string();
            let name = get_feature_name_from_font(face, &tag);

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
                                        println!("  Found ChainContext subtable in GPOS lookup {} subtable {}", lookup_index, k);
                                    }
                                    _ => {
                                        // For other subtable types, we can't easily extract glyphs
                                        println!("  Found other subtable type in GPOS lookup {} subtable {}", lookup_index, k);
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

            features.push(ChainedFeature {
                tag,
                name,
                glyphs: glyph_chars,
                source_table: "GPOS".to_string(),
            });
        }
    }

    features
}

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

fn get_feature_name_from_font(_face: &ttf_parser::Face, tag: &str) -> String {
    // Simplified feature name mapping
    match tag {
        "kern" => "Kerning".to_string(),
        "liga" => "Ligatures".to_string(),
        "ss01" => "Stylistic Set 1".to_string(),
        "cv01" => "Character Variant 1".to_string(),
        "locl" => "Localized Forms".to_string(),
        "zero" => "Slashed Zero".to_string(),
        "sinf" => "Scientific Inferiors".to_string(),
        "aalt" => "Access All Alternates".to_string(),
        "numr" => "Numerators".to_string(),
        "ordn" => "Ordinals".to_string(),
        "case" => "Case-Sensitive Forms".to_string(),
        "pnum" => "Proportional Numbers".to_string(),
        "ccmp" => "Glyph Composition/Decomposition".to_string(),
        "dlig" => "Discretionary Ligatures".to_string(),
        "sups" => "Superscript".to_string(),
        "tnum" => "Tabular Numbers".to_string(),
        "subs" => "Subscript".to_string(),
        "salt" => "Stylistic Alternates".to_string(),
        "dnom" => "Denominators".to_string(),
        "frac" => "Fractions".to_string(),
        "calt" => "Contextual Alternates".to_string(),
        _ => format!("Feature {}", tag),
    }
}
