//! Font Selection Module
//!
//! This module provides font selection functionality, including face classification,
//! family aggregation, and selection logic. It's designed to work with the Blink
//! (Chrome) font selection model.

use std::collections::HashMap;
use ttf_parser::{Face, Style};

/// Represents the classification result for a single font face.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum FontStyle {
    /// Normal/upright face
    Normal,
    /// Italic face (true italic, not oblique)
    Italic,
}

/// Recipe for variable font axis values to achieve specific styling.
#[derive(Debug, Clone, PartialEq)]
pub struct VfRecipe {
    /// Axis values to apply (e.g., {"ital": 1.0})
    pub axis_values: HashMap<String, f32>,
}

impl VfRecipe {
    /// Creates a new recipe with a single axis value.
    pub fn new(axis_tag: &str, value: f32) -> Self {
        let mut axis_values = HashMap::new();
        axis_values.insert(axis_tag.to_string(), value);
        Self { axis_values }
    }

    /// Creates an empty recipe (for static fonts).
    pub fn empty() -> Self {
        Self {
            axis_values: HashMap::new(),
        }
    }
}

/// Classification result for a single font face.
#[derive(Debug, Clone)]
pub struct FaceClassification {
    /// Whether this face is italic or normal
    pub font_style: FontStyle,
    /// Variable font recipe to achieve italic (if applicable)
    pub vf_recipe: Option<VfRecipe>,
    /// Weight key for family aggregation
    pub weight_key: u16,
    /// Stretch key for family aggregation  
    pub stretch_key: u16,
    /// Whether this is a variable font
    pub is_variable: bool,
    /// Instance information for Scenario 3-1 fonts (slnt axis with italic instances)
    pub instance_info: Option<InstanceInfo>,
}

impl FaceClassification {
    /// Legacy compatibility getter for italic_kind field.
    /// This provides backward compatibility with existing code.
    pub fn italic_kind(&self) -> FontStyle {
        self.font_style
    }
}

/// Information about italic instances found in a variable font (Scenario 3-1).
#[derive(Debug, Clone)]
pub struct InstanceInfo {
    /// List of italic instance names found in the name table
    pub italic_instances: Vec<String>,
    /// PostScript name of the font
    pub ps_name: String,
    /// Style name of the font
    pub style_name: String,
}

/// Configuration for the font selection parser.
/// Level 1: Always trusts user font style declarations (non-configurable).
#[derive(Debug, Clone)]
pub struct ParserConfig {
    /// Whether to trust user font style declarations (Level 1: always true)
    pub trust_user_font_style: bool,
}

impl Default for ParserConfig {
    fn default() -> Self {
        Self {
            trust_user_font_style: true,
        }
    }
}

impl ParserConfig {
    /// Creates a Level 1 configuration (always trusts user declarations).
    pub fn level1() -> Self {
        Self {
            trust_user_font_style: true,
        }
    }
}

/// Input record for a font face to be classified.
#[derive(Debug, Clone)]
pub struct FaceRecord {
    /// Stable identifier for the font file
    pub face_id: String,
    /// PostScript name (NameID 6)
    pub ps_name: String,
    /// Legacy family name (NameID 1)
    pub family_name: String,
    /// Typographic family name (NameID 16), if present
    pub typographic_family: Option<String>,
    /// Legacy subfamily name (NameID 2)
    pub subfamily_name: String,
    /// Typographic subfamily name (NameID 17), if present
    pub typographic_subfamily: Option<String>,
    /// Whether this is a variable font
    pub is_variable: bool,
    /// Variable font axes with their ranges
    pub axes: HashMap<String, (f32, f32, f32)>, // (min, default, max)
    /// OS/2 fsSelection bit 0 (ITALIC)
    pub os2_italic_bit: bool,
    /// OS/2 usWeightClass
    pub weight_class: u16,
    /// OS/2 usWidthClass
    pub width_class: u16,
    /// Optional explicit user declaration that this face is italic.
    ///
    /// When `Some(true)`, the face is treated as italic regardless of axes/variants.
    /// When `Some(false)` or `None`, automatic detection is performed.
    ///
    /// This is semantically clearer than an enum because users should only set this
    /// to `true` when they're confident the face is italic. If unsure, they should
    /// leave it as `None` to let the system detect it automatically.
    pub user_font_style_italic: Option<bool>,
}

/// A face with its classification result and recipe information.
#[derive(Debug, Clone)]
pub struct ClassifiedFace {
    /// The original face record
    pub face: FaceRecord,
    /// The classification result
    pub classification: FaceClassification,
}

/// Represents a face or variable font with recipe for font selection.
#[derive(Debug, Clone)]
pub struct FaceOrVfWithRecipe {
    /// Face identifier
    pub face_id: String,
    /// Variable font recipe (if applicable)
    pub vf_recipe: Option<VfRecipe>,
    /// Instance information for Scenario 3-1 fonts (slnt axis with italic instances)
    pub instance_info: Option<InstanceInfo>,
}

/// Font selection capability map for a font family.
#[derive(Debug, Clone)]
pub struct FontSelectionCapabilityMap {
    /// Upright faces organized by (weight, stretch) keys
    pub upright_slots: HashMap<(u16, u16), FaceOrVfWithRecipe>,
    /// Italic faces organized by (weight, stretch) keys
    pub italic_slots: HashMap<(u16, u16), FaceOrVfWithRecipe>,
    /// Scenario type for diagnostics
    pub scenario: FamilyScenario,
}

/// Family scenario type for diagnostics and selection policy.
#[derive(Debug, Clone, PartialEq)]
pub enum FamilyScenario {
    /// Single static font only
    SingleStatic,
    /// Multiple static fonts with at least one italic
    MultiStatic,
    /// Single variable font providing upright and italic
    SingleVf,
    /// Two variable fonts: Roman VF and Italic VF
    DualVf,
}

/// Font selection result for a specific style request.
#[derive(Debug, Clone)]
pub enum FontSelection {
    /// Selected face with optional variable font recipe
    Selected {
        face_id: String,
        vf_recipe: Option<VfRecipe>,
        instance_info: Option<InstanceInfo>,
    },
    /// No suitable face found
    Unavailable,
}

impl FontSelection {
    /// Creates a font selection from a face and recipe.
    pub fn from_face(face: &FaceOrVfWithRecipe) -> Self {
        Self::Selected {
            face_id: face.face_id.clone(),
            vf_recipe: face.vf_recipe.clone(),
            instance_info: face.instance_info.clone(),
        }
    }

    /// Creates a font selection from a face record.
    pub fn from_face_record(face: &FaceRecord, recipe: Option<VfRecipe>) -> Self {
        Self::Selected {
            face_id: face.face_id.clone(),
            vf_recipe: recipe,
            instance_info: None,
        }
    }
}

/// Level 1 font selection parser.
pub struct FontSelectionParser {
    pub config: ParserConfig,
}

impl FontSelectionParser {
    /// Creates a new Level 1 parser (always trusts user declarations).
    pub fn new() -> Self {
        Self {
            config: ParserConfig::level1(),
        }
    }

    /// Creates a new parser with custom configuration (Level 2+ feature).
    /// Note: Level 1 should always use the default configuration.
    pub fn with_config(config: ParserConfig) -> Self {
        Self { config }
    }

    /// Classifies a single font face according to Level 1 rules.
    pub fn classify_face(&self, face_record: FaceRecord) -> ClassifiedFace {
        let classification = self.classify_face_internal(&face_record);
        ClassifiedFace {
            face: face_record,
            classification,
        }
    }

    /// Builds a font selection capability map for a collection of faces belonging to the same family.
    pub fn build_capability_map(&self, faces: Vec<FaceRecord>) -> FontSelectionCapabilityMap {
        if faces.is_empty() {
            return FontSelectionCapabilityMap {
                upright_slots: HashMap::new(),
                italic_slots: HashMap::new(),
                scenario: FamilyScenario::SingleStatic,
            };
        }

        // Classify all faces
        let classified_faces: Vec<ClassifiedFace> = faces
            .into_iter()
            .map(|face| self.classify_face(face))
            .collect();

        // Determine scenario
        let scenario = self.determine_scenario(&classified_faces);

        // Aggregate into slots
        let mut upright_slots = HashMap::new();
        let mut italic_slots = HashMap::new();

        for classified_face in classified_faces {
            let key = (
                classified_face.classification.weight_key,
                classified_face.classification.stretch_key,
            );

            let face_or_vf = FaceOrVfWithRecipe {
                face_id: classified_face.face.face_id,
                vf_recipe: classified_face.classification.vf_recipe,
                instance_info: classified_face.classification.instance_info,
            };

            match classified_face.classification.font_style {
                FontStyle::Normal => {
                    upright_slots.insert(key, face_or_vf);
                }
                FontStyle::Italic => {
                    italic_slots.insert(key, face_or_vf);
                }
            }
        }

        FontSelectionCapabilityMap {
            upright_slots,
            italic_slots,
            scenario,
        }
    }

    /// Selects a font face based on weight, stretch, and style requirements.
    pub fn select_face(
        &self,
        capability_map: &FontSelectionCapabilityMap,
        weight: u16,
        stretch: u16,
        style: FontStyle,
    ) -> FontSelection {
        match style {
            FontStyle::Italic => {
                // Look for exact match first
                if let Some(face) = capability_map.italic_slots.get(&(weight, stretch)) {
                    return FontSelection::from_face(face);
                }

                // Look for nearest match
                if let Some(face) = self.find_nearest_italic(capability_map, weight, stretch) {
                    return FontSelection::from_face(face);
                }

                // Try to synthesize from variable font
                if let Some(face) = self.synthesize_italic_from_vf(capability_map, weight, stretch) {
                    return FontSelection::from_face(&face);
                }

                FontSelection::Unavailable
            }
            FontStyle::Normal => {
                // Look for exact match first
                if let Some(face) = capability_map.upright_slots.get(&(weight, stretch)) {
                    return FontSelection::from_face(face);
                }

                // Look for nearest match
                if let Some(face) = self.find_nearest_upright(capability_map, weight, stretch) {
                    return FontSelection::from_face(face);
                }

                FontSelection::Unavailable
            }
        }
    }

    /// Internal classification logic following Level 1 priority rules.
    fn classify_face_internal(&self, face: &FaceRecord) -> FaceClassification {
        // Priority 0: User font style declaration (highest priority)
        if self.config.trust_user_font_style {
            if let Some(user_italic) = face.user_font_style_italic {
                if user_italic {
                    return FaceClassification {
                        font_style: FontStyle::Italic,
                        vf_recipe: None,
                        weight_key: face.weight_class,
                        stretch_key: face.width_class,
                        is_variable: face.is_variable,
                        instance_info: None,
                    };
                }
                // If user_italic is false, continue with automatic detection
            }
        }

        // Priority 1: OS/2 ITALIC bit (bit 0)
        if face.os2_italic_bit {
            return FaceClassification {
                font_style: FontStyle::Italic,
                vf_recipe: None,
                weight_key: face.weight_class,
                stretch_key: face.width_class,
                is_variable: face.is_variable,
                instance_info: None,
            };
        }

        // Priority 2: Variable font `ital` axis
        if let Some((min, default, max)) = face.axes.get("ital") {
            // Check if default location has ital=1
            if (*default - 1.0).abs() < f32::EPSILON {
                return FaceClassification {
                    font_style: FontStyle::Italic,
                    vf_recipe: Some(VfRecipe::new("ital", 1.0)),
                    weight_key: face.weight_class,
                    stretch_key: face.width_class,
                    is_variable: face.is_variable,
                    instance_info: None,
                };
            }
            // Check if any value in the range could be 1.0
            if *min <= 1.0 && *max >= 1.0 {
                return FaceClassification {
                    font_style: FontStyle::Italic,
                    vf_recipe: Some(VfRecipe::new("ital", 1.0)),
                    weight_key: face.weight_class,
                    stretch_key: face.width_class,
                    is_variable: face.is_variable,
                    instance_info: None,
                };
            }
        }

        // Priority 3: VF with `slnt` axis (Scenario 3-1)
        if let Some((_min, default, _max)) = face.axes.get("slnt") {
            // Scenario 3-1 REQUIRES both slnt axis AND italic-named instances
            if self.has_italic_named_instances(face) {
                // Use the default slnt value or a reasonable italic angle
                let slnt_value = if (*default).abs() > 0.1 {
                    *default
                } else {
                    -10.0
                };

                // Extract instance information for Scenario 3-1 fonts
                let italic_instances = self.extract_italic_instances(face);
                let instance_info = if !italic_instances.is_empty() {
                    Some(InstanceInfo {
                        italic_instances,
                        ps_name: face.ps_name.clone(),
                        style_name: face.subfamily_name.clone(),
                    })
                } else {
                    // For Level 1, even if no italic names found in main entries,
                    // we still provide instance info for slnt-capable fonts
                    Some(InstanceInfo {
                        italic_instances: vec!["slnt-axis-capable".to_string()],
                        ps_name: face.ps_name.clone(),
                        style_name: face.subfamily_name.clone(),
                    })
                };

                return FaceClassification {
                    font_style: FontStyle::Italic,
                    vf_recipe: Some(VfRecipe::new("slnt", slnt_value)),
                    weight_key: face.weight_class,
                    stretch_key: face.width_class,
                    is_variable: face.is_variable,
                    instance_info,
                };
            }
        }

        // Priority 4: Level 1 permissive slnt detection (NOT Scenario 3-1)
        if let Some((_min, default, _max)) = face.axes.get("slnt") {
            // Level 1 permissive detection: any font with slnt axis is italic-capable
            // This is separate from Scenario 3-1 which requires italic-named instances
            let slnt_value = if (*default).abs() > 0.1 {
                *default
            } else {
                -10.0
            };

            return FaceClassification {
                font_style: FontStyle::Italic,
                vf_recipe: Some(VfRecipe::new("slnt", slnt_value)),
                weight_key: face.weight_class,
                stretch_key: face.width_class,
                is_variable: face.is_variable,
                instance_info: Some(InstanceInfo {
                    italic_instances: vec!["slnt-axis-capable".to_string()],
                    ps_name: face.ps_name.clone(),
                    style_name: face.subfamily_name.clone(),
                }),
            };
        }

        // Priority 5: Name-based fallback (with warnings)
        if self.is_italic_by_name(face) {
            // Log warning for name-based detection
            eprintln!(
                "WARNING: Using name-based italic detection for face: {}",
                face.face_id
            );
            return FaceClassification {
                font_style: FontStyle::Italic,
                vf_recipe: None,
                weight_key: face.weight_class,
                stretch_key: face.width_class,
                is_variable: face.is_variable,
                instance_info: None,
            };
        }

        // Default: Normal
        FaceClassification {
            font_style: FontStyle::Normal,
            vf_recipe: None,
            weight_key: face.weight_class,
            stretch_key: face.width_class,
            is_variable: face.is_variable,
            instance_info: None,
        }
    }

    /// Checks if a face has italic-named instances via name table analysis (Scenario 3-1).
    pub fn has_italic_named_instances(&self, face: &FaceRecord) -> bool {
        // For Scenario 3-1, we MUST have italic-named instances in the name table
        // This is strict - we only check the main name table entries
        self.extract_italic_instances(face).len() > 0
    }

    /// Extracts italic instances from the name table for Scenario 3-1 fonts.
    /// Takes instances as input and returns italic instance names found.
    /// IMPORTANT: Only "italic" (case-insensitive) is considered valid, NOT "oblique".
    pub fn extract_italic_instances(&self, face: &FaceRecord) -> Vec<String> {
        let mut italic_instances = Vec::new();

        // Check the subfamily name first (most common case)
        let subfamily_lower = face.subfamily_name.to_lowercase();
        if subfamily_lower.contains("italic") {
            italic_instances.push(face.subfamily_name.clone());
        }

        // Check the PostScript name
        let ps_name_lower = face.ps_name.to_lowercase();
        if ps_name_lower.contains("italic") {
            italic_instances.push(face.ps_name.clone());
        }

        // For Level 1, we focus on the main name table entries
        // In Level 2+, we would parse all name table entries for comprehensive italic detection

        italic_instances
    }

    /// Checks if a face is italic based on name analysis (Priority 5 fallback).
    /// IMPORTANT: Only "italic" (case-insensitive) is considered valid, NOT "oblique".
    pub fn is_italic_by_name(&self, face: &FaceRecord) -> bool {
        let subfamily_lower = face.subfamily_name.to_lowercase();
        let ps_name_lower = face.ps_name.to_lowercase();

        // Check for italic indicators in names (only "italic", not "oblique")
        subfamily_lower.contains("italic") || ps_name_lower.contains("italic")
    }

    /// Determines the family scenario for diagnostics.
    fn determine_scenario(&self, faces: &[ClassifiedFace]) -> FamilyScenario {
        if faces.len() == 1 {
            if faces[0].classification.is_variable {
                FamilyScenario::SingleVf
            } else {
                FamilyScenario::SingleStatic
            }
        } else {
            let has_italic = faces
                .iter()
                .any(|f| f.classification.font_style == FontStyle::Italic);
            let has_variable = faces.iter().any(|f| f.classification.is_variable);

            if has_variable && has_italic {
                FamilyScenario::DualVf
            } else {
                FamilyScenario::MultiStatic
            }
        }
    }

    /// Finds the nearest italic face to the requested weight and stretch.
    fn find_nearest_italic<'a>(
        &self,
        capability_map: &'a FontSelectionCapabilityMap,
        weight: u16,
        stretch: u16,
    ) -> Option<&'a FaceOrVfWithRecipe> {
        // Simple nearest neighbor search
        let mut best_face = None;
        let mut best_distance = f32::INFINITY;

        for ((w, s), face) in &capability_map.italic_slots {
            let distance = ((*w as f32 - weight as f32).powi(2) + (*s as f32 - stretch as f32).powi(2)).sqrt();
            if distance < best_distance {
                best_distance = distance;
                best_face = Some(face);
            }
        }

        best_face
    }

    /// Finds the nearest upright face to the requested weight and stretch.
    fn find_nearest_upright<'a>(
        &self,
        capability_map: &'a FontSelectionCapabilityMap,
        weight: u16,
        stretch: u16,
    ) -> Option<&'a FaceOrVfWithRecipe> {
        // Simple nearest neighbor search
        let mut best_face = None;
        let mut best_distance = f32::INFINITY;

        for ((w, s), face) in &capability_map.upright_slots {
            let distance = ((*w as f32 - weight as f32).powi(2) + (*s as f32 - stretch as f32).powi(2)).sqrt();
            if distance < best_distance {
                best_distance = distance;
                best_face = Some(face);
            }
        }

        best_face
    }

    /// Attempts to synthesize an italic face from a variable font.
    fn synthesize_italic_from_vf(
        &self,
        capability_map: &FontSelectionCapabilityMap,
        _weight: u16,
        _stretch: u16,
    ) -> Option<FaceOrVfWithRecipe> {
        // Look for a variable font that can synthesize italic
        for face in capability_map.upright_slots.values() {
            if face.vf_recipe.is_some() {
                // This is a variable font, try to create an italic recipe
                let italic_recipe = VfRecipe::new("ital", 1.0);
                return Some(FaceOrVfWithRecipe {
                    face_id: face.face_id.clone(),
                    vf_recipe: Some(italic_recipe),
                    instance_info: face.instance_info.clone(),
                });
            }
        }

        None
    }
}

impl Default for FontSelectionParser {
    fn default() -> Self {
        Self::new()
    }
}

/// Helper function to extract face record from ttf-parser Face.
pub fn extract_face_record(
    face: &Face<'_>,
    face_id: String,
    user_font_style_italic: Option<bool>,
) -> Result<FaceRecord, String> {
    // Extract basic name information using ttf-parser's names() method
    let ps_name = face
        .names()
        .into_iter()
        .find(|n| n.name_id == 6 && n.is_unicode()) // PostScript name (NameID 6)
        .and_then(|n| n.to_string())
        .unwrap_or_default();

    let family_name = face
        .names()
        .into_iter()
        .find(|n| n.name_id == 1 && n.is_unicode()) // Family name (NameID 1)
        .and_then(|n| n.to_string())
        .unwrap_or_default();

    let subfamily_name = face
        .names()
        .into_iter()
        .find(|n| n.name_id == 2 && n.is_unicode()) // Subfamily name (NameID 2)
        .and_then(|n| n.to_string())
        .unwrap_or_default();

    // Extract OS/2 information using ttf-parser's built-in methods
    // Use style() instead of is_italic() to only check OS/2 bits, not post.italicAngle
    let os2_italic_bit = face.style() == Style::Italic;
    let weight_class = face.weight().to_number();
    let width_class = face.width().to_number();

    // Extract variable font information using ttf-parser's built-in methods
    let is_variable = face.is_variable();
    let axes = if is_variable {
        extract_variation_axes(face)
    } else {
        HashMap::new()
    };

    Ok(FaceRecord {
        face_id,
        ps_name,
        family_name,
        typographic_family: None, // Not implemented in Level 1
        subfamily_name,
        typographic_subfamily: None, // Not implemented in Level 1
        is_variable,
        axes,
        os2_italic_bit,
        weight_class,
        width_class,
        user_font_style_italic,
    })
}

/// Extract variation axes using ttf-parser's built-in methods.
fn extract_variation_axes(face: &Face<'_>) -> HashMap<String, (f32, f32, f32)> {
    let mut axes = HashMap::new();

    for axis in face.variation_axes() {
        let tag = axis.tag.to_string();
        let min = axis.min_value;
        let default = axis.def_value;
        let max = axis.max_value;

        axes.insert(tag, (min, default, max));
    }

    axes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_font_selection_parser_default_config() {
        let parser = FontSelectionParser::new();
        assert!(parser.config.trust_user_font_style);
    }

    #[test]
    fn test_vf_recipe_creation() {
        let recipe = VfRecipe::new("ital", 1.0);
        assert_eq!(recipe.axis_values.get("ital"), Some(&1.0));

        let empty = VfRecipe::empty();
        assert!(empty.axis_values.is_empty());
    }

    #[test]
    fn test_face_classification_user_style_priority() {
        let parser = FontSelectionParser::new();
        let face = FaceRecord {
            face_id: "test".to_string(),
            ps_name: "TestFont".to_string(),
            family_name: "Test".to_string(),
            typographic_family: None,
            subfamily_name: "Regular".to_string(),
            typographic_subfamily: None,
            is_variable: false,
            axes: HashMap::new(),
            os2_italic_bit: false, // OS/2 says not italic
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: Some(true), // But user says it is italic
        };

        let classification = parser.classify_face(face);
        assert_eq!(
            classification.classification.font_style,
            FontStyle::Italic
        );
    }

    #[test]
    fn test_face_classification_os2_italic() {
        let parser = FontSelectionParser::new();
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

        let classification = parser.classify_face(face);
        assert_eq!(
            classification.classification.font_style,
            FontStyle::Italic
        );
        assert!(classification.classification.vf_recipe.is_none());
    }

    #[test]
    fn test_face_classification_ital_axis() {
        let parser = FontSelectionParser::new();
        let mut axes = HashMap::new();
        axes.insert("ital".to_string(), (0.0, 1.0, 1.0)); // Default ital=1

        let face = FaceRecord {
            face_id: "test".to_string(),
            ps_name: "TestFont-VF".to_string(),
            family_name: "Test".to_string(),
            typographic_family: None,
            subfamily_name: "Variable".to_string(),
            typographic_subfamily: None,
            is_variable: true,
            axes,
            os2_italic_bit: false,
            weight_class: 400,
            width_class: 5,
            user_font_style_italic: None,
        };

        let classification = parser.classify_face(face);
        assert_eq!(
            classification.classification.font_style,
            FontStyle::Italic
        );
        assert!(classification.classification.vf_recipe.is_some());
        assert_eq!(
            classification
                .classification
                .vf_recipe
                .unwrap()
                .axis_values
                .get("ital"),
            Some(&1.0)
        );
    }

    #[test]
    fn test_face_classification_normal() {
        let parser = FontSelectionParser::new();
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

        let classification = parser.classify_face(face);
        assert_eq!(
            classification.classification.font_style,
            FontStyle::Normal
        );
        assert!(classification.classification.vf_recipe.is_none());
    }

    #[test]
    fn test_capability_map_single_static() {
        let parser = FontSelectionParser::new();
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

        let map = parser.build_capability_map(vec![face]);
        assert_eq!(map.scenario, FamilyScenario::SingleStatic);
        assert_eq!(map.upright_slots.len(), 1);
        assert_eq!(map.italic_slots.len(), 0);
    }

    #[test]
    fn test_capability_map_multi_static() {
        let parser = FontSelectionParser::new();
        let regular = FaceRecord {
            face_id: "regular".to_string(),
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

        let italic = FaceRecord {
            face_id: "italic".to_string(),
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

        let map = parser.build_capability_map(vec![regular, italic]);
        assert_eq!(map.scenario, FamilyScenario::MultiStatic);
        assert_eq!(map.upright_slots.len(), 1);
        assert_eq!(map.italic_slots.len(), 1);
    }
}
