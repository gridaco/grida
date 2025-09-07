//! Italic-Specific Font Selection Module
//!
//! This module provides italic-specific font selection functionality, building on
//! the base font selection module. It focuses on italic detection, classification,
//! and selection logic as specified in the working group documentation.

use crate::selection::{
    FaceRecord, FontSelection, FontSelectionCapabilityMap, FontSelectionParser, FontStyle,
};

/// Italic-specific font selection parser.
///
/// This parser extends the base FontSelectionParser with italic-specific functionality
/// and maintains compatibility with the existing italic detection pipeline.
pub struct ItalicSelectionParser {
    base_parser: FontSelectionParser,
}

impl ItalicSelectionParser {
    /// Legacy compatibility accessor for the parser configuration.
    /// This provides backward compatibility with existing code.
    pub fn config(&self) -> &crate::selection::ParserConfig {
        &self.base_parser.config
    }
}

impl ItalicSelectionParser {
    /// Creates a new italic selection parser.
    pub fn new() -> Self {
        Self {
            base_parser: FontSelectionParser::new(),
        }
    }

    /// Creates a new italic selection parser with custom configuration.
    pub fn with_config(config: crate::selection::ParserConfig) -> Self {
        Self {
            base_parser: FontSelectionParser::with_config(config),
        }
    }

    /// Classifies a single font face for italic detection.
    ///
    /// This method provides the same functionality as the original italic classification
    /// but uses the new Selection terminology internally.
    pub fn classify_face(&self, face_record: FaceRecord) -> crate::selection::ClassifiedFace {
        self.base_parser.classify_face(face_record)
    }

    /// Builds an italic capability map for a collection of faces.
    ///
    /// This method provides the same functionality as the original italic capability map
    /// but uses the new Selection terminology internally.
    pub fn build_capability_map(&self, faces: Vec<FaceRecord>) -> FontSelectionCapabilityMap {
        self.base_parser.build_capability_map(faces)
    }

    /// Selects an italic face based on weight, stretch requirements.
    ///
    /// This is a convenience method that specifically requests italic faces.
    pub fn select_italic_face(
        &self,
        capability_map: &FontSelectionCapabilityMap,
        weight: u16,
        stretch: u16,
    ) -> FontSelection {
        self.base_parser
            .select_face(capability_map, weight, stretch, FontStyle::Italic)
    }

    /// Selects a normal/upright face based on weight, stretch requirements.
    ///
    /// This is a convenience method that specifically requests normal faces.
    pub fn select_normal_face(
        &self,
        capability_map: &FontSelectionCapabilityMap,
        weight: u16,
        stretch: u16,
    ) -> FontSelection {
        self.base_parser
            .select_face(capability_map, weight, stretch, FontStyle::Normal)
    }

    /// Checks if a face has italic-named instances via name table analysis (Scenario 3-1).
    ///
    /// This method provides the same functionality as the original italic detection
    /// but uses the new Selection terminology internally.
    pub fn has_italic_named_instances(&self, face: &FaceRecord) -> bool {
        self.base_parser.has_italic_named_instances(face)
    }

    /// Extracts italic instances from the name table for Scenario 3-1 fonts.
    ///
    /// This method provides the same functionality as the original italic detection
    /// but uses the new Selection terminology internally.
    pub fn extract_italic_instances(&self, face: &FaceRecord) -> Vec<String> {
        self.base_parser.extract_italic_instances(face)
    }

    /// Checks if a face is italic based on name analysis (Priority 5 fallback).
    ///
    /// This method provides the same functionality as the original italic detection
    /// but uses the new Selection terminology internally.
    pub fn is_italic_by_name(&self, face: &FaceRecord) -> bool {
        self.base_parser.is_italic_by_name(face)
    }
}

impl Default for ItalicSelectionParser {
    fn default() -> Self {
        Self::new()
    }
}

/// Legacy compatibility types and functions for the italic detection pipeline.
///
/// These types maintain compatibility with existing code while using the new
/// Selection terminology internally.

/// Legacy alias for FontStyle to maintain compatibility.
pub type ItalicKind = FontStyle;

/// Legacy alias for FontSelectionCapabilityMap to maintain compatibility.
pub type ItalicCapabilityMap = FontSelectionCapabilityMap;

/// Legacy alias for FontSelectionParser to maintain compatibility.
pub type ItalicParser = ItalicSelectionParser;

/// Legacy compatibility function for building italic capability maps.
///
/// This function provides the same interface as the original italic detection
/// but uses the new Selection terminology internally.
pub fn build_italic_capability_map(faces: Vec<FaceRecord>) -> ItalicCapabilityMap {
    let parser = ItalicSelectionParser::new();
    parser.build_capability_map(faces)
}

/// Legacy compatibility function for classifying faces for italic detection.
///
/// This function provides the same interface as the original italic detection
/// but uses the new Selection terminology internally.
pub fn classify_face_for_italic(face_record: FaceRecord) -> crate::selection::ClassifiedFace {
    let parser = ItalicSelectionParser::new();
    parser.classify_face(face_record)
}

/// Legacy compatibility function for selecting italic faces.
///
/// This function provides the same interface as the original italic detection
/// but uses the new Selection terminology internally.
pub fn select_italic_face(
    capability_map: &ItalicCapabilityMap,
    weight: u16,
    stretch: u16,
) -> FontSelection {
    let parser = ItalicSelectionParser::new();
    parser.select_italic_face(capability_map, weight, stretch)
}

/// Legacy compatibility function for selecting normal faces.
///
/// This function provides the same interface as the original italic detection
/// but uses the new Selection terminology internally.
pub fn select_normal_face(
    capability_map: &ItalicCapabilityMap,
    weight: u16,
    stretch: u16,
) -> FontSelection {
    let parser = ItalicSelectionParser::new();
    parser.select_normal_face(capability_map, weight, stretch)
}

/// Legacy compatibility function for checking italic-named instances.
///
/// This function provides the same interface as the original italic detection
/// but uses the new Selection terminology internally.
pub fn has_italic_named_instances(face: &FaceRecord) -> bool {
    let parser = ItalicSelectionParser::new();
    parser.has_italic_named_instances(face)
}

/// Legacy compatibility function for extracting italic instances.
///
/// This function provides the same interface as the original italic detection
/// but uses the new Selection terminology internally.
pub fn extract_italic_instances(face: &FaceRecord) -> Vec<String> {
    let parser = ItalicSelectionParser::new();
    parser.extract_italic_instances(face)
}

/// Legacy compatibility function for checking italic by name.
///
/// This function provides the same interface as the original italic detection
/// but uses the new Selection terminology internally.
pub fn is_italic_by_name(face: &FaceRecord) -> bool {
    let parser = ItalicSelectionParser::new();
    parser.is_italic_by_name(face)
}

/// Legacy compatibility function for extracting face records.
///
/// This function provides the same interface as the original italic detection
/// but uses the new Selection terminology internally.
pub fn extract_face_record(
    face: &ttf_parser::Face<'_>,
    face_id: String,
    user_font_style_italic: Option<bool>,
) -> Result<FaceRecord, String> {
    crate::selection::extract_face_record(face, face_id, user_font_style_italic)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;
    use crate::selection::{FamilyScenario, FontStyle};

    #[test]
    fn test_italic_selection_parser_creation() {
        let parser = ItalicSelectionParser::new();
        assert!(parser.base_parser.config.trust_user_font_style);
    }

    #[test]
    fn test_italic_selection_parser_with_config() {
        let config = crate::selection::ParserConfig::level1();
        let parser = ItalicSelectionParser::with_config(config);
        assert!(parser.base_parser.config.trust_user_font_style);
    }

    #[test]
    fn test_legacy_compatibility_types() {
        // Test that legacy types are properly aliased
        let _italic_kind: ItalicKind = FontStyle::Italic;
        let _capability_map: ItalicCapabilityMap = FontSelectionCapabilityMap {
            upright_slots: HashMap::new(),
            italic_slots: HashMap::new(),
            scenario: FamilyScenario::SingleStatic,
        };
        let _parser: ItalicParser = ItalicSelectionParser::new();
    }

    #[test]
    fn test_legacy_compatibility_functions() {
        let face = FaceRecord {
            face_id: "test".to_string(),
            ps_name: "TestFont".to_string(),
            family_name: "Test".to_string(),
            typographic_family: None,
            subfamily_name: "Regular".to_string(),
            typographic_subfamily: None,
            is_variable: false,
            axes: HashMap::new(),
            os2_italic_bit: false,
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: None,
        };

        // Test legacy compatibility functions
        let _classification = classify_face_for_italic(face.clone());
        let _capability_map = build_italic_capability_map(vec![face.clone()]);
        let _has_italic = has_italic_named_instances(&face);
        let _instances = extract_italic_instances(&face);
        let _is_italic = is_italic_by_name(&face);
    }

    #[test]
    fn test_italic_face_selection() {
        let parser = ItalicSelectionParser::new();
        let face = FaceRecord {
            face_id: "test".to_string(),
            ps_name: "TestFont-Italic".to_string(),
            family_name: "Test".to_string(),
            typographic_family: None,
            subfamily_name: "Italic".to_string(),
            typographic_subfamily: None,
            is_variable: false,
            axes: HashMap::new(),
            os2_italic_bit: true,
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: None,
        };

        let capability_map = parser.build_capability_map(vec![face]);
        let selection = parser.select_italic_face(&capability_map, 400, 5);

        match selection {
            FontSelection::Selected { face_id, .. } => {
                assert_eq!(face_id, "test");
            }
            FontSelection::Unavailable => {
                panic!("Expected to find an italic face");
            }
        }
    }

    #[test]
    fn test_normal_face_selection() {
        let parser = ItalicSelectionParser::new();
        let face = FaceRecord {
            face_id: "test".to_string(),
            ps_name: "TestFont-Regular".to_string(),
            family_name: "Test".to_string(),
            typographic_family: None,
            subfamily_name: "Regular".to_string(),
            typographic_subfamily: None,
            is_variable: false,
            axes: HashMap::new(),
            os2_italic_bit: false,
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: None,
        };

        let capability_map = parser.build_capability_map(vec![face]);
        let selection = parser.select_normal_face(&capability_map, 400, 5);

        match selection {
            FontSelection::Selected { face_id, .. } => {
                assert_eq!(face_id, "test");
            }
            FontSelection::Unavailable => {
                panic!("Expected to find a normal face");
            }
        }
    }
}
