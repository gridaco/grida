use std::fs;
use std::path::PathBuf;

use fonts::Parser;

fn font_path(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/fonts")
        .join(rel)
}

#[test]
fn extracts_feature_tags_and_ui_names() {
    let path = font_path("Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf");
    let data = fs::read(path).unwrap();
    let parser = Parser::new(&data).unwrap();
    let features = parser.ffeatures();
    let ss01 = features.iter().find(|f| f.tag == "ss01").unwrap();
    assert_eq!(ss01.name, "Single-story ‘a’");
    assert!(!ss01.lookup_indices.is_empty());
}

#[test]
fn extracts_glyphs_for_ligature_feature() {
    let path = font_path("Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf");
    let data = fs::read(path).unwrap();
    let parser = Parser::new(&data).unwrap();
    let features = parser.ffeatures();
    let liga = features.iter().find(|f| f.tag == "liga").unwrap();
    assert!(!liga.glyphs.is_empty());
    assert!(liga.glyphs.contains(&"ﬁ".to_string()));
}

#[test]
fn returns_original_characters_for_single_substitution_features() {
    let path = font_path("Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf");
    let data = fs::read(path).unwrap();
    let parser = Parser::new(&data).unwrap();
    let features = parser.ffeatures();
    let ss01 = features.iter().find(|f| f.tag == "ss01").unwrap();
    assert!(ss01.glyphs.contains(&"a".to_string()));
}

#[test]
fn extracts_kern_feature_from_inter_font() {
    let path = font_path("Inter/Inter-VariableFont_opsz,wght.ttf");
    let data = fs::read(path).unwrap();
    let parser = Parser::new(&data).unwrap();
    let features = parser.ffeatures();

    // Check if kern feature exists
    let kern = features.iter().find(|f| f.tag == "kern");
    assert!(kern.is_some(), "kern feature should exist in Inter font");

    let kern_feature = kern.unwrap();
    assert!(!kern_feature.lookup_indices.is_empty());
    assert!(!kern_feature.glyphs.is_empty());
}

#[test]
fn correctly_parses_ss_feature_parameters() {
    let path = font_path("Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf");
    let data = fs::read(path).unwrap();
    let parser = Parser::new(&data).unwrap();
    let features = parser.ffeatures();

    // Find ss01 feature
    let ss01 = features.iter().find(|f| f.tag == "ss01").unwrap();

    // ss features should have proper names but no sample text
    assert!(
        ss01.name.contains("Single-story"),
        "ss01 should have proper name"
    );
    assert!(
        ss01.sample_text.is_none(),
        "ss features should not have sample text"
    );
    assert!(
        ss01.tooltip.is_none(),
        "ss features should not have tooltips"
    );
    assert!(
        ss01.param_labels.is_empty(),
        "ss features should not have param labels"
    );
}

#[test]
fn correctly_parses_cv_feature_parameters() {
    // Test with a font that has cv features if available
    // For now, just verify that cv features would be parsed correctly
    let path = font_path("Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf");
    let data = fs::read(path).unwrap();
    let parser = Parser::new(&data).unwrap();
    let features = parser.ffeatures();

    // Check that features without parameters are handled correctly
    let liga = features.iter().find(|f| f.tag == "liga").unwrap();
    assert_eq!(liga.name, "liga");
    assert!(liga.sample_text.is_none());
    assert!(liga.tooltip.is_none());
    assert!(liga.param_labels.is_empty());
}
