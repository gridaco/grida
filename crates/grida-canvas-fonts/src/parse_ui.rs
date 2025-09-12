//! High-Level UI Font Parser
//!
//! This module provides a simplified, opinionated API for UI consumption.
//! It focuses on family-level analysis and provides clear, actionable results
//! for font rendering and user interface display.

use crate::parse::Parser;
use crate::selection::{FaceRecord, FamilyScenario};
use crate::selection_italic::{ItalicCapabilityMap, ItalicParser};
use std::collections::HashMap;

/// Represents a font face with user-specified ID, data, and optional style declaration.
/// Uses zero-copy approach with borrowed data to avoid memory duplication.
#[derive(Debug)]
pub struct UIFontFace<'a> {
    /// User-specified face identifier (e.g., filename, URL, index)
    pub face_id: String,
    /// Raw font data (borrowed to avoid copying)
    pub data: &'a [u8],
    /// User-declared italic style (highest priority when set)
    ///
    /// This field allows users to explicitly declare whether a font face is italic,
    /// which is especially useful when working with trustworthy font providers like
    /// Google Fonts where the API response indicates the font style.
    ///
    /// - `Some(true)` - User declares this face is italic (highest priority)
    /// - `Some(false)` - User declares this face is not italic (highest priority)  
    /// - `None` - No user declaration, rely on font metadata analysis
    pub user_font_style_italic: Option<bool>,
}

/// Copy-based version of UIFontFace for convenience when working with owned data.
/// This is a wrapper around the zero-copy version that handles the lifetime management.
#[derive(Debug)]
pub struct UIFontFaceOwned {
    /// User-specified face identifier (e.g., filename, URL, index)
    pub face_id: String,
    /// Raw font data (owned)
    pub data: Vec<u8>,
    /// User-declared italic style (highest priority when set)
    pub user_font_style_italic: Option<bool>,
}

impl UIFontFaceOwned {
    /// Create a new UIFontFaceOwned from owned data
    pub fn new(face_id: String, data: Vec<u8>, user_font_style_italic: Option<bool>) -> Self {
        Self {
            face_id,
            data,
            user_font_style_italic,
        }
    }

    /// Convert to zero-copy version for internal processing
    pub fn as_borrowed(&self) -> UIFontFace {
        UIFontFace {
            face_id: self.face_id.clone(),
            data: &self.data,
            user_font_style_italic: self.user_font_style_italic,
        }
    }
}

/// Represents the current text style being used, with only relevant properties for matching.
#[derive(Debug, Clone)]
pub struct CurrentTextStyle {
    /// Font weight (100-900, or None if not specified)
    pub weight: Option<u16>,
    /// Font width/stretch (50-200, or None if not specified)
    pub width: Option<u16>,
    /// Font slant angle (-90 to 90 degrees, or None if not specified)
    pub slant: Option<f32>,
    /// Additional custom axis values (tag -> value)
    pub custom_axes: HashMap<String, f32>,
}

/// Specifies the type of font faces to retrieve.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FaceType {
    /// Retrieve italic (slanted) font variants
    Italic,
    /// Retrieve roman (upright) font variants
    Roman,
}

/// Represents a matching italic variant with distance and axis differences.
#[derive(Debug, Clone)]
pub struct ItalicMatch {
    /// The matched italic recipe
    pub recipe: UIFontItalicRecipe,
    /// Distance score (lower is closer match)
    pub distance: f32,
    /// Axis differences for variable fonts (None if identical or static font)
    pub axis_diffs: Option<Vec<AxisDiff>>,
}

/// Represents a difference in a variable font axis.
#[derive(Debug, Clone, PartialEq)]
pub struct AxisDiff {
    /// Axis tag (e.g., "wght", "wdth", "slnt")
    pub tag: String,
    /// Target/specified value
    pub spec: f32,
    /// Difference (spec - current)
    pub diff: f32,
}

/// High-level font parser designed for UI consumption.
///
/// This parser provides opinionated, family-level analysis that abstracts away
/// the complexity of individual font faces and provides clear, actionable results
/// for UI rendering and user interaction.
pub struct UIFontParser {
    italic_parser: ItalicParser,
}

impl UIFontParser {
    /// Creates a new UI font parser with default configuration.
    pub fn new() -> Self {
        Self {
            italic_parser: ItalicParser::new(),
        }
    }

    /// Analyzes one or more fonts belonging to the same family.
    ///
    /// This is the main entry point for UI font analysis. It takes a family name
    /// and font data with user-specified face IDs, returning a comprehensive
    /// family-level analysis including italic capabilities, variable font
    /// information, and face-level details.
    ///
    /// Uses zero-copy approach - font data is borrowed and not duplicated in memory.
    ///
    /// # Arguments
    /// * `family_name` - Family name (if None, will be extracted from first font)
    /// * `font_faces` - List of font faces with borrowed data and user-specified IDs
    ///
    /// # Returns
    /// * `UIFontFamilyResult` - Complete family analysis
    ///
    /// # Example
    /// ```rust
    /// use fonts::parse_ui::{UIFontParser, UIFontFace};
    ///
    /// let parser = UIFontParser::new();
    /// // Note: In real usage, you would load actual font files
    /// let font_data: Vec<u8> = vec![]; // Empty data for example
    /// // let font_faces = vec![
    /// //     UIFontFace {
    /// //         face_id: "Inter-VariableFont_opsz,wght.ttf".to_string(),
    /// //         data: &font_data, // Borrowed data - no copying!
    /// //         user_font_style_italic: Some(false), // User declares this is not italic
    /// //     },
    /// // ];
    ///
    /// // For this example, we'll show the expected result structure
    /// // let result = parser.analyze_family(Some("Inter".to_string()), font_faces)?;
    /// // println!("Family: {}", result.family_name);
    /// // println!("Italic capability: {}", result.italic_capability.has_italic);
    /// ```
    pub fn analyze_family<'a>(
        &self,
        family_name: Option<String>,
        font_faces: Vec<UIFontFace<'a>>,
    ) -> Result<UIFontFamilyResult, String> {
        if font_faces.is_empty() {
            return Err("Font faces list cannot be empty".to_string());
        }

        // Parse all fonts
        let mut parsers = Vec::new();
        let mut face_records = Vec::new();

        for font_face in &font_faces {
            let parser = Parser::new(&font_face.data)
                .map_err(|e| format!("Failed to parse font '{}': {}", font_face.face_id, e))?;

            let face_record = parser
                .extract_face_record(font_face.face_id.clone(), font_face.user_font_style_italic)
                .map_err(|e| {
                    format!(
                        "Failed to extract face record for '{}': {}",
                        font_face.face_id, e
                    )
                })?;

            parsers.push(parser);
            face_records.push(face_record);
        }

        // Determine family name
        let family_name = family_name.unwrap_or_else(|| face_records[0].family_name.clone());

        // Analyze italic capabilities
        let italic_capability = self.analyze_italic_capability(&face_records)?;

        // Analyze face-level information
        let face_info = self.analyze_face_info(&parsers, &face_records)?;

        // Analyze family-level axes
        let axes = self.analyze_family_axes(&parsers)?;

        // Generate font styles for UI style picker
        let styles = generate_font_styles(&face_info, &face_records, &italic_capability);

        Ok(UIFontFamilyResult {
            family_name,
            axes,
            italic_capability,
            faces: face_info,
            styles,
        })
    }

    /// Copy-based version of analyze_family for convenience when working with owned data.
    /// This method takes Vec<UIFontFaceOwned> and converts them to the zero-copy version internally.
    pub fn analyze_family_owned(
        &self,
        family_name: Option<String>,
        font_faces: Vec<UIFontFaceOwned>,
    ) -> Result<UIFontFamilyResult, String> {
        // Convert owned faces to borrowed faces for internal processing
        let borrowed_faces: Vec<UIFontFace> =
            font_faces.iter().map(|face| face.as_borrowed()).collect();

        // Use the zero-copy implementation
        self.analyze_family(family_name, borrowed_faces)
    }

    /// Analyzes italic capabilities for a font family.
    fn analyze_italic_capability(
        &self,
        face_records: &[FaceRecord],
    ) -> Result<UIFontItalicCapability, String> {
        let capability_map = self
            .italic_parser
            .build_capability_map(face_records.to_vec());

        let has_italic = !capability_map.italic_slots.is_empty();
        let has_upright = !capability_map.upright_slots.is_empty();

        // Determine the primary italic strategy
        let italic_strategy = self.determine_italic_strategy(&capability_map);

        // Generate italic recipes for UI consumption
        let italic_recipes = self.generate_italic_recipes(&capability_map)?;

        Ok(UIFontItalicCapability {
            has_italic,
            has_upright,
            strategy: italic_strategy,
            recipes: italic_recipes,
            scenario: capability_map.scenario,
        })
    }

    /// Determines the primary italic strategy for the family.
    fn determine_italic_strategy(
        &self,
        capability_map: &ItalicCapabilityMap,
    ) -> UIFontItalicStrategy {
        match capability_map.scenario {
            FamilyScenario::SingleStatic => {
                if !capability_map.italic_slots.is_empty() {
                    UIFontItalicStrategy::StaticItalicOnly
                } else {
                    UIFontItalicStrategy::StaticUprightOnly
                }
            }
            FamilyScenario::MultiStatic => UIFontItalicStrategy::StaticFamily,
            FamilyScenario::SingleVf => UIFontItalicStrategy::VariableFont,
            FamilyScenario::DualVf => UIFontItalicStrategy::DualVariableFonts,
        }
    }

    /// Generates italic recipes for UI consumption.
    fn generate_italic_recipes(
        &self,
        capability_map: &ItalicCapabilityMap,
    ) -> Result<Vec<UIFontItalicRecipe>, String> {
        let mut recipes = Vec::new();

        // Add upright recipe
        if !capability_map.upright_slots.is_empty() {
            recipes.push(UIFontItalicRecipe {
                name: "Regular".to_string(),
                description: "Upright/roman style".to_string(),
                is_italic: false,
                face_id: capability_map
                    .upright_slots
                    .values()
                    .next()
                    .unwrap()
                    .face_id
                    .clone(),
                vf_recipe: None,
            });
        }

        // Add italic recipes
        for ((weight_key, stretch_key), face) in &capability_map.italic_slots {
            let recipe_name = self.generate_recipe_name(*weight_key, *stretch_key, true);
            let description = self.generate_recipe_description(*weight_key, *stretch_key, true);

            recipes.push(UIFontItalicRecipe {
                name: recipe_name,
                description,
                is_italic: true,
                face_id: face.face_id.clone(),
                vf_recipe: face.vf_recipe.clone(),
            });
        }

        Ok(recipes)
    }

    /// Generates a user-friendly recipe name.
    fn generate_recipe_name(&self, weight_key: u16, stretch_key: u16, is_italic: bool) -> String {
        let weight_name = self.weight_key_to_name(weight_key);
        let stretch_name = self.stretch_key_to_name(stretch_key);

        if is_italic {
            if weight_key == 400 && stretch_key == 5 {
                "Italic".to_string()
            } else {
                format!("{} {} Italic", weight_name, stretch_name)
            }
        } else {
            if weight_key == 400 && stretch_key == 5 {
                "Regular".to_string()
            } else {
                format!("{} {}", weight_name, stretch_name)
            }
        }
    }

    /// Generates a user-friendly recipe description.
    fn generate_recipe_description(
        &self,
        weight_key: u16,
        stretch_key: u16,
        is_italic: bool,
    ) -> String {
        let weight_desc = self.weight_key_to_description(weight_key);
        let stretch_desc = self.stretch_key_to_description(stretch_key);

        if is_italic {
            format!(
                "Italic style with {} weight and {} width",
                weight_desc, stretch_desc
            )
        } else {
            format!(
                "Upright style with {} weight and {} width",
                weight_desc, stretch_desc
            )
        }
    }

    /// Converts weight key to user-friendly name.
    fn weight_key_to_name(&self, weight_key: u16) -> &'static str {
        match weight_key {
            100 => "Thin",
            200 => "Extra Light",
            300 => "Light",
            400 => "Regular",
            500 => "Medium",
            600 => "Semi Bold",
            700 => "Bold",
            800 => "Extra Bold",
            900 => "Black",
            _ => "Custom",
        }
    }

    /// Converts weight key to user-friendly description.
    fn weight_key_to_description(&self, weight_key: u16) -> &'static str {
        match weight_key {
            100..=300 => "light",
            400..=500 => "normal",
            600..=700 => "bold",
            800..=900 => "heavy",
            _ => "custom",
        }
    }

    /// Converts stretch key to user-friendly name.
    fn stretch_key_to_name(&self, stretch_key: u16) -> &'static str {
        match stretch_key {
            1 => "Ultra Condensed",
            2 => "Extra Condensed",
            3 => "Condensed",
            4 => "Semi Condensed",
            5 => "Normal",
            6 => "Semi Expanded",
            7 => "Expanded",
            8 => "Extra Expanded",
            9 => "Ultra Expanded",
            _ => "Custom",
        }
    }

    /// Converts stretch key to user-friendly description.
    fn stretch_key_to_description(&self, stretch_key: u16) -> &'static str {
        match stretch_key {
            1..=3 => "condensed",
            4..=6 => "normal",
            7..=9 => "expanded",
            _ => "custom",
        }
    }

    /// Analyzes family-level axes (min/max across all faces, no default values).
    fn analyze_family_axes(&self, parsers: &[Parser]) -> Result<Vec<UIFontFamilyAxis>, String> {
        let mut axis_map: std::collections::HashMap<String, (String, f32, f32)> =
            std::collections::HashMap::new();

        for parser in parsers {
            if parser.is_variable() {
                let fvar_data = parser.fvar();
                for (_, axis) in &fvar_data.axes {
                    let entry = axis_map.entry(axis.tag.clone()).or_insert((
                        axis.name.clone(),
                        axis.min,
                        axis.max,
                    ));

                    // Update min/max across all faces
                    entry.1 = entry.1.min(axis.min);
                    entry.2 = entry.2.max(axis.max);
                }
            }
        }

        let mut axes: Vec<UIFontFamilyAxis> = axis_map
            .into_iter()
            .map(|(tag, (name, min, max))| UIFontFamilyAxis {
                tag,
                name,
                min,
                max,
            })
            .collect();

        axes.sort_by(|a, b| a.tag.cmp(&b.tag));
        Ok(axes)
    }

    /// Analyzes face-level information.
    fn analyze_face_info(
        &self,
        parsers: &[Parser],
        face_records: &[FaceRecord],
    ) -> Result<Vec<UIFontFaceInfo>, String> {
        let mut face_info = Vec::new();

        for (_index, (parser, face_record)) in parsers.iter().zip(face_records.iter()).enumerate() {
            let features = parser.ffeatures();

            // Get face-specific axes and instances if this is a variable font
            let (axes, instances) = if parser.is_variable() {
                let fvar_data = parser.fvar();
                let axes = fvar_data
                    .axes
                    .iter()
                    .map(|(_, axis)| UIFontAxis {
                        tag: axis.tag.clone(),
                        name: axis.name.clone(),
                        min: axis.min,
                        default: axis.def,
                        max: axis.max,
                    })
                    .collect();

                let instances = fvar_data
                    .instances
                    .iter()
                    .map(|instance| UIFontInstance {
                        name: instance.name.clone(),
                        coordinates: instance.coordinates.clone(),
                    })
                    .collect();

                (axes, Some(instances))
            } else {
                (Vec::new(), None)
            };

            face_info.push(UIFontFaceInfo {
                face_id: face_record.face_id.clone(),
                family_name: face_record.family_name.clone(),
                subfamily_name: face_record.subfamily_name.clone(),
                postscript_name: face_record.ps_name.clone(),
                weight_class: face_record.weight_class,
                width_class: face_record.width_class,
                is_variable: face_record.is_variable,
                axes,
                instances,
                features: features
                    .into_iter()
                    .map(|f| UIFontFeature {
                        tag: f.tag,
                        name: f.name,
                        tooltip: f.tooltip,
                        sample_text: f.sample_text,
                        glyphs: f.glyphs,
                    })
                    .collect(),
            });
        }

        Ok(face_info)
    }
}

impl Default for UIFontParser {
    fn default() -> Self {
        Self::new()
    }
}

/// Complete family-level analysis result for UI consumption.
#[derive(Debug, Clone)]
pub struct UIFontFamilyResult {
    /// Family name
    pub family_name: String,
    /// Family-level axes (no default values as they vary per face)
    pub axes: Vec<UIFontFamilyAxis>,
    /// Italic capabilities and recipes
    pub italic_capability: UIFontItalicCapability,
    /// Face-level information
    pub faces: Vec<UIFontFaceInfo>,
    /// Available font styles for UI style picker
    pub styles: Vec<UIFontStyleInstance>,
}

/// Italic capability analysis for UI consumption.
#[derive(Debug, Clone)]
pub struct UIFontItalicCapability {
    /// Whether the family has italic variants
    pub has_italic: bool,
    /// Whether the family has upright variants
    pub has_upright: bool,
    /// Primary italic strategy for this family
    pub strategy: UIFontItalicStrategy,
    /// Available italic recipes for UI display
    pub recipes: Vec<UIFontItalicRecipe>,
    /// Family scenario type
    pub scenario: FamilyScenario,
}

/// Italic strategy types for UI display.
#[derive(Debug, Clone, PartialEq)]
pub enum UIFontItalicStrategy {
    /// Single static font, upright only
    StaticUprightOnly,
    /// Single static font, italic only
    StaticItalicOnly,
    /// Multiple static fonts with italic variants
    StaticFamily,
    /// Single variable font with italic axis
    VariableFont,
    /// Two variable fonts (Roman + Italic)
    DualVariableFonts,
}

/// Italic recipe for UI consumption.
#[derive(Debug, Clone)]
pub struct UIFontItalicRecipe {
    /// User-friendly name (e.g., "Bold Italic", "Regular")
    pub name: String,
    /// User-friendly description
    pub description: String,
    /// Whether this recipe produces italic text
    pub is_italic: bool,
    /// Face ID to use for this recipe
    pub face_id: String,
    /// Variable font recipe (if applicable)
    pub vf_recipe: Option<crate::selection::VfRecipe>,
}

/// Family-level axis information (no default values as they vary per face).
#[derive(Debug, Clone)]
pub struct UIFontFamilyAxis {
    /// Axis tag (e.g., "wght", "ital", "slnt")
    pub tag: String,
    /// Human-readable axis name
    pub name: String,
    /// Minimum value across all faces
    pub min: f32,
    /// Maximum value across all faces
    pub max: f32,
}

/// Face-specific axis information (includes default values).
#[derive(Debug, Clone)]
pub struct UIFontAxis {
    /// Axis tag (e.g., "wght", "ital", "slnt")
    pub tag: String,
    /// Human-readable axis name
    pub name: String,
    /// Minimum value
    pub min: f32,
    /// Default value for this face
    pub default: f32,
    /// Maximum value
    pub max: f32,
}

/// Variable font instance information.
#[derive(Debug, Clone)]
pub struct UIFontInstance {
    /// Instance name
    pub name: String,
    /// Axis coordinates
    pub coordinates: HashMap<String, f32>,
}

/// Face-level information for UI consumption.
#[derive(Debug, Clone)]
pub struct UIFontFaceInfo {
    /// Face identifier
    pub face_id: String,
    /// Family name
    pub family_name: String,
    /// Subfamily name
    pub subfamily_name: String,
    /// PostScript name
    pub postscript_name: String,
    /// Weight class
    pub weight_class: u16,
    /// Width class
    pub width_class: u16,
    /// Whether this is a variable font
    pub is_variable: bool,
    /// Face-specific axes (includes default values)
    pub axes: Vec<UIFontAxis>,
    /// Variable font instances (if this is a variable font)
    pub instances: Option<Vec<UIFontInstance>>,
    /// Available font features
    pub features: Vec<UIFontFeature>,
}

/// Font feature information for UI consumption.
#[derive(Debug, Clone)]
pub struct UIFontFeature {
    /// Feature tag
    pub tag: String,
    /// Feature name
    pub name: String,
    /// Tooltip text
    pub tooltip: Option<String>,
    /// Sample text
    pub sample_text: Option<String>,
    /// Characters covered by this feature
    pub glyphs: Vec<String>,
}

/// Font style instance for UI consumption.
/// Represents either a static font face or a variable font instance that can be selected in a style picker.
#[derive(Debug, Clone)]
pub struct UIFontStyleInstance {
    /// User-friendly style name (e.g., "Regular", "Bold", "Light Italic")
    pub name: String,
    /// PostScript name for this style
    pub postscript_name: String,
    /// Whether this style is italic
    pub italic: bool,
}

/// Font style mapping utility functions.
impl UIFontStyleInstance {
    /// Create a new font style instance
    pub fn new(name: String, postscript_name: String, italic: bool) -> Self {
        Self {
            name,
            postscript_name,
            italic,
        }
    }
}

/// Generate font styles from face information, face records, and variable font instances.
/// Uses the analyzed italic capability data to determine italic status for each style.
fn generate_font_styles(
    face_info: &[UIFontFaceInfo],
    face_records: &[crate::selection::FaceRecord],
    italic_capability: &UIFontItalicCapability,
) -> Vec<UIFontStyleInstance> {
    let mut styles = Vec::new();

    // Create a map from face_id to italic status using the analyzed recipes
    let face_italic_map: std::collections::HashMap<String, bool> = italic_capability
        .recipes
        .iter()
        .map(|recipe| (recipe.face_id.clone(), recipe.is_italic))
        .collect();

    // For each face, generate styles
    for (face, face_record) in face_info.iter().zip(face_records.iter()) {
        if let Some(ref instances) = face.instances {
            // For variable fonts, generate styles from instances
            for instance in instances {
                let style_name = instance.name.clone();
                let postscript_name = instance.name.clone();

                // Determine italic status for this instance
                let italic = if italic_capability.scenario == FamilyScenario::SingleVf {
                    // For Scenario 3-1 (SingleVf with slnt axis and italic instances),
                    // analyze each instance individually using the selection module
                    crate::selection_italic::is_instance_italic_scenario_3_1(
                        &instance.name,
                        &instance.coordinates,
                    )
                } else {
                    // For other scenarios, use face-level italic status
                    face_italic_map
                        .get(&face_record.face_id)
                        .copied()
                        .unwrap_or(false)
                };

                styles.push(UIFontStyleInstance::new(
                    style_name,
                    postscript_name,
                    italic,
                ));
            }
        } else {
            // For static fonts, generate one style per face
            let style_name = face.subfamily_name.clone();
            let postscript_name = face.postscript_name.clone();

            // Use the analyzed italic status from the capability map
            let italic = face_italic_map
                .get(&face_record.face_id)
                .copied()
                .unwrap_or(false); // Default to false if not found

            styles.push(UIFontStyleInstance::new(
                style_name,
                postscript_name,
                italic,
            ));
        }
    }

    // Remove duplicates based on postscript name
    styles.sort_by(|a, b| a.postscript_name.cmp(&b.postscript_name));
    styles.dedup_by(|a, b| a.postscript_name == b.postscript_name);

    styles
}

impl UIFontParser {
    /// Finds the closest italic variants to the current text style.
    ///
    /// This method analyzes the font family and returns italic variants sorted by
    /// proximity to the current style. For variable fonts, it calculates axis
    /// differences and provides detailed matching information.
    ///
    /// Uses zero-copy approach - font data is borrowed and not duplicated in memory.
    ///
    /// # Arguments
    /// * `family_name` - Family name (if None, will be extracted from first font)
    /// * `font_faces` - List of font faces with borrowed data and user-specified IDs
    /// * `current_style` - Current text style to match against (None for all italics)
    /// * `max_results` - Maximum number of results to return (None for no limit)
    ///
    /// # Returns
    /// * `Vec<ItalicMatch>` - Sorted list of italic matches (closest first)
    ///
    /// # Example
    /// ```rust
    /// use fonts::parse_ui::{UIFontParser, UIFontFace, CurrentTextStyle};
    /// use std::collections::HashMap;
    ///
    /// let parser = UIFontParser::new();
    /// // Note: In real usage, you would load actual font files
    /// let font_data: Vec<u8> = vec![]; // Empty data for example
    /// // let font_faces = vec![
    /// //     UIFontFace {
    /// //         face_id: "Inter-VariableFont_opsz,wght.ttf".to_string(),
    /// //         data: &font_data, // Borrowed data - no copying!
    /// //         user_font_style_italic: Some(false),
    /// //     },
    /// // ];
    ///
    /// let current_style = CurrentTextStyle {
    ///     weight: Some(400),
    ///     width: Some(100),
    ///     slant: None,
    ///     custom_axes: HashMap::new(),
    /// };
    ///
    /// // For this example, we'll show the expected result structure
    /// // let matches = parser.get_italics(
    /// //     Some("Inter".to_string()),
    /// //     font_faces,
    /// //     Some(current_style),
    /// //     Some(3)
    /// // )?;
    ///
    /// // if let Some(closest) = matches.first() {
    /// //     println!("Closest italic: {}", closest.recipe.name);
    /// //     println!("Distance: {}", closest.distance);
    /// // }
    /// ```
    pub fn get_italics<'a>(
        &self,
        family_name: Option<String>,
        font_faces: Vec<UIFontFace<'a>>,
        current_style: Option<CurrentTextStyle>,
        max_results: Option<usize>,
    ) -> Result<Vec<ItalicMatch>, String> {
        // First, analyze the family to get italic capabilities
        let family_result = self.analyze_family(family_name, font_faces)?;

        // Filter to only italic recipes
        let italic_recipes: Vec<_> = family_result
            .italic_capability
            .recipes
            .into_iter()
            .filter(|recipe| recipe.is_italic)
            .collect();

        if italic_recipes.is_empty() {
            return Ok(vec![]);
        }

        // If no current style provided, return all italics
        let current_style = match current_style {
            Some(style) => style,
            None => {
                return Ok(italic_recipes
                    .into_iter()
                    .map(|recipe| ItalicMatch {
                        recipe,
                        distance: 0.0,
                        axis_diffs: None,
                    })
                    .collect());
            }
        };

        // Calculate matches with distances
        let mut matches: Vec<ItalicMatch> = italic_recipes
            .into_iter()
            .map(|recipe| {
                let (distance, axis_diffs) =
                    self.calculate_style_distance(&current_style, &recipe, &family_result.axes);
                ItalicMatch {
                    recipe,
                    distance,
                    axis_diffs,
                }
            })
            .collect();

        // Sort by distance (closest first)
        matches.sort_by(|a, b| {
            a.distance
                .partial_cmp(&b.distance)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Apply max_results limit
        if let Some(max) = max_results {
            matches.truncate(max);
        }

        Ok(matches)
    }

    /// Copy-based version of get_italics for convenience when working with owned data.
    pub fn get_italics_owned(
        &self,
        family_name: Option<String>,
        font_faces: Vec<UIFontFaceOwned>,
        current_style: Option<CurrentTextStyle>,
        max_results: Option<usize>,
    ) -> Result<Vec<ItalicMatch>, String> {
        // Convert owned faces to borrowed faces for internal processing
        let borrowed_faces: Vec<UIFontFace> =
            font_faces.iter().map(|face| face.as_borrowed()).collect();

        // Use the zero-copy implementation
        self.get_italics(family_name, borrowed_faces, current_style, max_results)
    }

    /// Calculates the distance between current style and an italic recipe.
    fn calculate_style_distance(
        &self,
        current_style: &CurrentTextStyle,
        recipe: &UIFontItalicRecipe,
        family_axes: &[UIFontFamilyAxis],
    ) -> (f32, Option<Vec<AxisDiff>>) {
        let mut total_distance = 0.0;
        let mut axis_diffs = Vec::new();

        // Weight distance (normalized to 0-1 range) - uses smart resolution
        if let (Some(current_weight), Some(target_weight)) = (
            self.get_current_axis_value(current_style, "wght"),
            self.get_recipe_weight(recipe),
        ) {
            let weight_diff = (current_weight - target_weight).abs();
            total_distance += weight_diff / 800.0; // Normalize by weight range (100-900)
        }

        // Width distance (normalized to 0-1 range) - uses smart resolution
        if let (Some(current_width), Some(target_width)) = (
            self.get_current_axis_value(current_style, "wdth"),
            self.get_recipe_width(recipe),
        ) {
            let width_diff = (current_width - target_width).abs();
            total_distance += width_diff / 150.0; // Normalize by width range (50-200)
        }

        // Slant distance (normalized to 0-1 range) - uses smart resolution
        if let (Some(current_slant), Some(target_slant)) = (
            self.get_current_axis_value(current_style, "slnt"),
            self.get_recipe_slant(recipe),
        ) {
            let slant_diff = (current_slant - target_slant).abs();
            total_distance += slant_diff / 180.0; // Normalize by slant range (-90 to 90)
        }

        // For variable fonts, calculate axis differences
        for axis in family_axes {
            let current_value = self.get_current_axis_value(current_style, &axis.tag);
            let target_value = self.get_recipe_axis_value(recipe, &axis.tag);

            if let (Some(current), Some(target)) = (current_value, target_value) {
                let diff = target - current;
                if diff.abs() > 0.001 {
                    // Only include significant differences
                    axis_diffs.push(AxisDiff {
                        tag: axis.tag.clone(),
                        spec: target,
                        diff,
                    });
                    // Add to total distance
                    let normalized_diff = diff.abs() / (axis.max - axis.min);
                    total_distance += normalized_diff * 0.1; // Weight axis differences less
                }
            }
        }

        (
            total_distance,
            if axis_diffs.is_empty() {
                None
            } else {
                Some(axis_diffs)
            },
        )
    }

    /// Gets the current value for a specific axis from the current style with smart auto-resolution.
    ///
    /// Smart Resolution Rules:
    /// - Explicit properties (weight, width, slant) take priority over custom_axes
    /// - Only resolves to custom_axes if the explicit property is None
    /// - Only resolves to custom_axes if the target font actually has that axis
    /// - For non-variable fonts, only explicit properties are used
    pub fn get_current_axis_value(
        &self,
        current_style: &CurrentTextStyle,
        axis_tag: &str,
    ) -> Option<f32> {
        match axis_tag {
            "wght" => {
                // Weight resolution: explicit weight takes priority over custom_axes["wght"]
                if let Some(weight) = current_style.weight {
                    Some(weight as f32)
                } else {
                    // Fallback to custom_axes only if explicit weight is None
                    current_style.custom_axes.get("wght").copied()
                }
            }
            "wdth" => {
                // Width resolution: explicit width takes priority over custom_axes["wdth"]
                if let Some(width) = current_style.width {
                    Some(width as f32)
                } else {
                    // Fallback to custom_axes only if explicit width is None
                    current_style.custom_axes.get("wdth").copied()
                }
            }
            "slnt" => {
                // Slant resolution: explicit slant takes priority over custom_axes["slnt"]
                if let Some(slant) = current_style.slant {
                    Some(slant)
                } else {
                    // Fallback to custom_axes only if explicit slant is None
                    current_style.custom_axes.get("slnt").copied()
                }
            }
            _ => {
                // For other axes, only use custom_axes (no explicit properties exist)
                current_style.custom_axes.get(axis_tag).copied()
            }
        }
    }

    /// Gets the target value for a specific axis from a recipe.
    fn get_recipe_axis_value(&self, recipe: &UIFontItalicRecipe, axis_tag: &str) -> Option<f32> {
        recipe
            .vf_recipe
            .as_ref()?
            .axis_values
            .get(axis_tag)
            .copied()
    }

    /// Gets the weight value from a recipe.
    fn get_recipe_weight(&self, recipe: &UIFontItalicRecipe) -> Option<f32> {
        self.get_recipe_axis_value(recipe, "wght")
    }

    /// Gets the width value from a recipe.
    fn get_recipe_width(&self, recipe: &UIFontItalicRecipe) -> Option<f32> {
        self.get_recipe_axis_value(recipe, "wdth")
    }

    /// Gets the slant value from a recipe.
    fn get_recipe_slant(&self, recipe: &UIFontItalicRecipe) -> Option<f32> {
        self.get_recipe_axis_value(recipe, "slnt")
    }

    /// Finds the closest roman (non-italic) variants to the current style.
    ///
    /// This is the inverse of `get_italics()` - it finds roman variants that match
    /// the current style as closely as possible. Results are sorted by proximity
    /// (nearest match first).
    ///
    /// Uses zero-copy approach - font data is borrowed and not duplicated in memory.
    ///
    /// # Arguments
    ///
    /// * `family_name` - Optional family name for analysis
    /// * `font_faces` - Font faces with borrowed data to analyze
    /// * `current_style` - Current text style to match against
    /// * `max_results` - Maximum number of results to return (None for all)
    ///
    /// # Returns
    ///
    /// * `Ok(Vec<ItalicMatch>)` - List of roman matches sorted by distance
    /// * `Err(String)` - Error message if analysis fails
    ///
    /// # Examples
    ///
    /// ```rust
    /// use fonts::{UIFontParser, UIFontFace, CurrentTextStyle};
    /// use std::collections::HashMap;
    ///
    /// let parser = UIFontParser::new();
    /// let font_data: Vec<u8> = vec![]; // Empty data for example
    /// let font_faces = vec![
    ///     UIFontFace {
    ///         face_id: "Inter-VariableFont_opsz,wght.ttf".to_string(),
    ///         data: &font_data, // Borrowed data - no copying!
    ///         user_font_style_italic: Some(false),
    ///     },
    ///     UIFontFace {
    ///         face_id: "Inter-Italic-VariableFont_opsz,wght.ttf".to_string(),
    ///         data: &font_data, // Borrowed data - no copying!
    ///         user_font_style_italic: Some(true),
    ///     },
    /// ];
    ///
    /// let current_style = CurrentTextStyle {
    ///     weight: Some(400),
    ///     width: Some(100),
    ///     slant: None,
    ///     custom_axes: HashMap::new(),
    /// };
    ///
    /// // Example usage (would work with real font data):
    /// // let roman_matches = parser.get_romans(
    /// //     Some("Inter".to_string()),
    /// //     font_faces,
    /// //     Some(current_style),
    /// //     Some(3), // Max 3 results
    /// // )?;
    ///
    /// // if let Some(closest) = roman_matches.first() {
    /// //     println!("Closest roman: {}", closest.recipe.name);
    /// //     println!("Distance: {}", closest.distance);
    /// // }
    /// ```
    pub fn get_romans<'a>(
        &self,
        family_name: Option<String>,
        font_faces: Vec<UIFontFace<'a>>,
        current_style: Option<CurrentTextStyle>,
        max_results: Option<usize>,
    ) -> Result<Vec<ItalicMatch>, String> {
        // First, analyze the family to get all capabilities
        let family_result = self.analyze_family(family_name, font_faces)?;

        // Filter for roman (non-italic) capabilities only
        let roman_capabilities: Vec<_> = family_result
            .italic_capability
            .recipes
            .into_iter()
            .filter(|recipe| {
                // Roman variants are those that are NOT italic
                // We need to check the strategy to determine if this recipe is roman
                match &family_result.italic_capability.strategy {
                    UIFontItalicStrategy::StaticUprightOnly => true, // All recipes are roman
                    UIFontItalicStrategy::StaticItalicOnly => false, // All recipes are italic
                    UIFontItalicStrategy::StaticFamily => {
                        // For static families, check if the recipe name suggests it's roman
                        !recipe.name.to_lowercase().contains("italic")
                    }
                    UIFontItalicStrategy::VariableFont => {
                        // For variable fonts, roman means no italic axis or italic axis = 0
                        // Check if the recipe has italic axis set to 0 or no italic axis
                        if let Some(vf_recipe) = &recipe.vf_recipe {
                            vf_recipe
                                .axis_values
                                .get("ital")
                                .map_or(true, |&val| val == 0.0)
                        } else {
                            // No variable recipe - check the is_italic field
                            !recipe.is_italic
                        }
                    }
                    UIFontItalicStrategy::DualVariableFonts => {
                        // For dual variable fonts, roman means no italic axis
                        if let Some(vf_recipe) = &recipe.vf_recipe {
                            !vf_recipe.axis_values.contains_key("ital")
                        } else {
                            // No variable recipe - check the is_italic field
                            !recipe.is_italic
                        }
                    }
                }
            })
            .collect();

        if roman_capabilities.is_empty() {
            return Ok(vec![]);
        }

        // If no current style provided, return all roman capabilities as matches
        let current_style = match current_style {
            Some(style) => style,
            None => {
                return Ok(roman_capabilities
                    .into_iter()
                    .map(|recipe| ItalicMatch {
                        recipe,
                        distance: 0.0, // No current style, so no distance calculation
                        axis_diffs: None,
                    })
                    .collect());
            }
        };

        // Calculate distances and create matches
        let mut matches: Vec<ItalicMatch> = roman_capabilities
            .into_iter()
            .filter_map(|recipe| {
                // Calculate distance between current style and this roman recipe
                let (distance, axis_diffs) =
                    self.calculate_style_distance(&current_style, &recipe, &family_result.axes);

                Some(ItalicMatch {
                    recipe,
                    distance,
                    axis_diffs,
                })
            })
            .collect();

        // Sort by distance (closest first)
        matches.sort_by(|a, b| {
            a.distance
                .partial_cmp(&b.distance)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Apply max_results limit
        if let Some(max) = max_results {
            matches.truncate(max);
        }

        Ok(matches)
    }

    /// Copy-based version of get_romans for convenience when working with owned data.
    pub fn get_romans_owned(
        &self,
        family_name: Option<String>,
        font_faces: Vec<UIFontFaceOwned>,
        current_style: Option<CurrentTextStyle>,
        max_results: Option<usize>,
    ) -> Result<Vec<ItalicMatch>, String> {
        // Convert owned faces to borrowed faces for internal processing
        let borrowed_faces: Vec<UIFontFace> =
            font_faces.iter().map(|face| face.as_borrowed()).collect();

        // Use the zero-copy implementation
        self.get_romans(family_name, borrowed_faces, current_style, max_results)
    }

    /// Unified interface for getting italic or roman font variants.
    ///
    /// This method provides a convenient way to toggle between italic and roman variants
    /// using a single API. It delegates to either `get_italics()` or `get_romans()` based
    /// on the `face_type` parameter.
    ///
    /// Uses zero-copy approach - font data is borrowed and not duplicated in memory.
    ///
    /// # Arguments
    ///
    /// * `face_type` - Type of faces to retrieve (`FaceType::Italic` or `FaceType::Roman`)
    /// * `family_name` - Optional family name for analysis
    /// * `font_faces` - Font faces with borrowed data to analyze
    /// * `current_style` - Current text style to match against
    /// * `max_results` - Maximum number of results to return (None for all)
    ///
    /// # Returns
    ///
    /// * `Ok(Vec<ItalicMatch>)` - List of matches sorted by distance
    /// * `Err(String)` - Error message if analysis fails
    ///
    /// # Examples
    ///
    /// ```rust
    /// use fonts::{UIFontParser, UIFontFace, CurrentTextStyle, FaceType};
    /// use std::collections::HashMap;
    ///
    /// let parser = UIFontParser::new();
    /// let font_data: Vec<u8> = vec![]; // Empty data for example
    /// let font_faces = vec![
    ///     UIFontFace {
    ///         face_id: "Inter-VariableFont_opsz,wght.ttf".to_string(),
    ///         data: &font_data, // Borrowed data - no copying!
    ///         user_font_style_italic: Some(false),
    ///     },
    ///     UIFontFace {
    ///         face_id: "Inter-Italic-VariableFont_opsz,wght.ttf".to_string(),
    ///         data: &font_data, // Borrowed data - no copying!
    ///         user_font_style_italic: Some(true),
    ///     },
    /// ];
    ///
    /// let current_style = CurrentTextStyle {
    ///     weight: Some(400),
    ///     width: Some(100),
    ///     slant: None,
    ///     custom_axes: HashMap::new(),
    /// };
    ///
    /// // Example usage (would work with real font data):
    /// // let italic_matches = parser.get_faces(
    /// //     FaceType::Italic,
    /// //     Some("Inter".to_string()),
    /// //     font_faces.clone(),
    /// //     Some(current_style.clone()),
    /// //     Some(3),
    /// // )?;
    /// ```
    pub fn get_faces<'a>(
        &self,
        face_type: FaceType,
        family_name: Option<String>,
        font_faces: Vec<UIFontFace<'a>>,
        current_style: Option<CurrentTextStyle>,
        max_results: Option<usize>,
    ) -> Result<Vec<ItalicMatch>, String> {
        match face_type {
            FaceType::Italic => {
                self.get_italics(family_name, font_faces, current_style, max_results)
            }
            FaceType::Roman => self.get_romans(family_name, font_faces, current_style, max_results),
        }
    }

    /// Copy-based version of get_faces for convenience when working with owned data.
    pub fn get_faces_owned(
        &self,
        face_type: FaceType,
        family_name: Option<String>,
        font_faces: Vec<UIFontFaceOwned>,
        current_style: Option<CurrentTextStyle>,
        max_results: Option<usize>,
    ) -> Result<Vec<ItalicMatch>, String> {
        // Convert owned faces to borrowed faces for internal processing
        let borrowed_faces: Vec<UIFontFace> =
            font_faces.iter().map(|face| face.as_borrowed()).collect();

        // Use the zero-copy implementation
        self.get_faces(
            face_type,
            family_name,
            borrowed_faces,
            current_style,
            max_results,
        )
    }
}
