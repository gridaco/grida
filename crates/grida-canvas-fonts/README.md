# Grida Canvas Fonts

A high-performance font parsing and selection library for the Grida design tool, providing comprehensive font selection capabilities, italic detection, variable font support, font style management, and JSON serialization for WASM communication. This library implements the Blink (Chrome) font selection model for professional-grade font handling.

## Overview

This crate implements a complete font selection pipeline that follows the Blink (Chrome) font selection model. It provides reliable font selection and italic classification using structured font table data (OS/2 bits, `ital` axis, and `slnt` axis). The library is organized around the concept of "Font Selection" with a clean, modular architecture that supports both high-level UI APIs and low-level font parsing.

**Key Features:**

- 🎯 **Smart Font Selection** - Intelligent font matching following Blink (Chrome) model
- 🔤 **True Italic Detection** - Reliable italic classification using OS/2 bits and variable font axes
- 📊 **Variable Font Support** - Full support for `fvar` table parsing with axes and instances
- 🎨 **Font Style Management** - UI-friendly font style instances for style pickers
- 🎨 **UI-Friendly API** - High-level interface designed for design tool integration
- ⚡ **High Performance** - Zero-copy parsing with minimal allocations
- 🌐 **WASM Ready** - JSON serialization for web integration

## Quick Start

```rust
use fonts::{UIFontParser, UIFontFace};

// Create parser and load font data
let parser = UIFontParser::new();
let font_faces = vec![
    UIFontFace {
        face_id: "Inter-Regular.ttf".to_string(),
        data: std::fs::read("Inter-Regular.ttf")?,
        user_font_style_italic: Some(false), // User declares this is not italic
    },
    UIFontFace {
        face_id: "Inter-Italic.ttf".to_string(),
        data: std::fs::read("Inter-Italic.ttf")?,
        user_font_style_italic: Some(true), // User declares this is italic
    },
];

// Analyze font family
let result = parser.analyze_family(Some("Inter".to_string()), font_faces)?;

// Check italic capabilities
println!("Family: {}", result.family_name);
println!("Has italic: {}", result.italic_capability.has_italic);
println!("Strategy: {:?}", result.italic_capability.strategy);

// Display available font styles
println!("Available styles: {}", result.styles.len());
for style in &result.styles {
    println!("- {} ({})", style.name, style.postscript_name);
    println!("  Italic: {}", style.italic);
}

// Find closest italic variants
let italic_matches = parser.get_italics(
    Some("Inter".to_string()),
    font_faces,
    None, // No current style specified
    Some(3), // Max 3 results
)?;

if let Some(closest) = italic_matches.first() {
    println!("Closest italic: {}", closest.recipe.name);
}
```

## Table of Contents

- [Features](#features)
- [Module Structure](#module-structure)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Font Family Scenarios](#font-family-scenarios)
- [Implementation Status](#implementation-status)
- [Examples](#examples)
- [Installation](#installation)
- [Testing](#testing)
- [Performance](#performance)
- [Dependencies](#dependencies)
- [Related Documentation](#related-documentation)
- [Contributing](#contributing)
- [License](#license)
- [Changelog](#changelog)

## Features

### Core Font Parsing

- **Font Metadata Extraction**: Parse font names, features, and properties using `ttf-parser`
- **Variable Font Support**: Full support for `fvar` table parsing with axes and instances (Level 1)
- **STAT Table Support**: Parse Style Attributes table for advanced font information
- **Font Feature Analysis**: Extract and analyze OpenType features from `GSUB` table

### Font Selection Pipeline

- **User Font Style Declaration**: Highest priority explicit user declarations
- **OS/2 ITALIC Bit Detection**: Reliable detection using OS/2 table bit 0
- **Variable Font `ital` Axis**: Support for variable fonts with italic axis
- **Variable Font `slnt` Axis**: Support for slant-based italic in variable fonts
- **Scenario 3-1 Support**: Variable fonts with `slnt` axis and italic instances
- **Family Aggregation**: Intelligent grouping and selection of font families
- **Parser Configuration**: Configurable trust levels for user declarations
- **Style Matching**: Find closest italic variants to current text style with axis differences
- **Font Selection Pipeline**: Complete font selection workflow following Blink (Chrome) model
- **Font Style Generation**: Automatic generation of UI-friendly font style instances

### WASM Bindings (Optional)

- **Web Integration**: WASM bindings for browser-based font analysis
- **JSON Serialization**: Automatic JSON serialization for WASM communication
- **High-Level API**: Same API surface as native Rust code
- **TypeScript Support**: Full TypeScript declarations for web development

## Module Structure

The library is organized into focused modules following the Selection terminology:

- **`parse`**: Low-level font parsing functionality using ttf-parser
- **`parse_feature_params`**: Feature parameters parsing and UI name extraction
- **`parse_feature`**: Configurable feature parsing with different parser types and modes
- **`selection`**: Core font selection logic and classification
- **`selection_italic`**: Italic-specific selection functionality with legacy compatibility
- **`parse_ui`**: High-level UI-friendly API for font analysis
- **`serde`**: JSON serialization support for WASM communication (optional feature)
- **`wasm_bind`**: WASM bindings for web integration (optional feature)

### API Layers

1. **High-Level UI API** (`parse_ui`) - Recommended for most use cases
2. **Core Selection API** (`selection`) - For advanced font selection logic
3. **Feature Parsing API** (`parse_feature`, `parse_feature_params`) - For OpenType feature analysis
4. **Low-Level Parsing API** (`parse`) - For direct font file analysis
5. **Serialization API** (`serde`) - For JSON serialization and WASM communication
6. **Legacy Compatibility** (`selection_italic`) - Backward compatibility layer

## Quick Start

### Font Selection API (Core)

```rust
use fonts::{FontSelectionParser, FaceRecord, FontStyle};

// Create font selection parser
let parser = FontSelectionParser::new();

// Create face records (typically from font files)
let face_records = vec![
    FaceRecord {
        face_id: "Inter-Regular.ttf".to_string(),
        ps_name: "Inter-Regular".to_string(),
        family_name: "Inter".to_string(),
        subfamily_name: "Regular".to_string(),
        is_variable: false,
        axes: std::collections::HashMap::new(),
        os2_italic_bit: false,
        weight_class: 400,
        width_class: 5,
        user_font_style_italic: None,
        // ... other fields
    },
];

// Build capability map for font selection
let capability_map = parser.build_capability_map(face_records);

// Select a font face based on style requirements
let selection = parser.select_face(&capability_map, 400, 5, FontStyle::Italic);

match selection {
    FontSelection::Selected { face_id, vf_recipe, .. } => {
        println!("Selected face: {}", face_id);
        if let Some(recipe) = vf_recipe {
            println!("Variable font recipe: {:?}", recipe.axis_values);
        }
    }
    FontSelection::Unavailable => {
        println!("No suitable face found");
    }
}
```

### High-Level UI API (Recommended)

```rust
use fonts::UIFontParser;

// Create UI parser
let parser = UIFontParser::new();

// Load font family data with user-specified IDs
let font_faces = vec![
    UIFontFace {
        face_id: "Inter-Regular.ttf".to_string(),
        data: std::fs::read("Inter-Regular.ttf")?,
        user_font_style_italic: Some(false), // User declares this is not italic
    },
    UIFontFace {
        face_id: "Inter-Italic.ttf".to_string(),
        data: std::fs::read("Inter-Italic.ttf")?,
        user_font_style_italic: Some(true), // User declares this is italic
    },
];

// Analyze entire family
let result = parser.analyze_family(Some("Inter".to_string()), font_faces)?;

// Display family information
println!("Family: {}", result.family_name);
println!("Italic available: {}", result.italic_capability.has_italic);
println!("Strategy: {:?}", result.italic_capability.strategy);

// Show available styles
for recipe in &result.italic_capability.recipes {
    println!("Style: {} - {}", recipe.name, recipe.description);
    if let Some(vf_recipe) = &recipe.vf_recipe {
        println!("  VF Recipe: {:?}", vf_recipe.axis_values);
    }
}

// Show font style instances for UI picker
println!("Font style instances: {}", result.styles.len());
for style in &result.styles {
    println!("- {} ({})", style.name, style.postscript_name);
    println!("  Italic: {}", style.italic);
}

// Show family-level axes
for axis in &result.axes {
    println!("Axis: {} ({}): {} to {}", axis.tag, axis.name, axis.min, axis.max);
}

// Show face-specific information including instances
for face in &result.faces {
    println!("Face: {} ({})", face.subfamily_name, face.postscript_name);
    if face.is_variable {
        println!("  Variable font with {} axes", face.axes.len());
        if let Some(instances) = &face.instances {
            println!("  Instances: {}", instances.len());
        }
    }
}
```

### Low-Level API (Advanced Usage)

```rust
use fonts::{Parser, FontSelectionParser};

// Parse individual font files
let font_data = std::fs::read("font.ttf")?;
let parser = Parser::new(&font_data)?;
let face_record = parser.extract_face_record("font-face-id".to_string(), None)?;

// Manual font selection
let selection_parser = FontSelectionParser::new();
let classification = selection_parser.classify_face(face_record);

// Build capability map
let faces = vec![face_record1, face_record2, face_record3];
let capability_map = selection_parser.build_capability_map(faces);
```

### WASM Bindings (with `wasm_bind` feature)

```rust
// Enable wasm_bind feature: cargo build --features wasm_bind

// WASM functions are automatically available and return JSON:
// - _grida_fonts_analyze_family: Analyze font family
// - _grida_fonts_parse_font: Parse single font
// - _grida_fonts_version: Get version

// Example usage in JavaScript/TypeScript:
// const result = await fontsModule.analyzeFamily(familyName, fontFaces);
// console.log(result.family_name);
// console.log(result.axes);        // Family-level axes
// console.log(result.faces);       // Face-level information with instances
// console.log(result.styles);      // UI-friendly font style instances
```

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
grida-canvas-fonts = "0.1.0"

# Optional: Enable WASM bindings for web integration
[dependencies.grida-canvas-fonts]
version = "0.1.0"
features = ["wasm_bind"]
```

## API Reference

### High-Level UI API

#### `UIFontParser`

Main high-level parser for UI consumption.

```rust
pub struct UIFontParser {
    // Main analysis method
    pub fn analyze_family(
        &self,
        family_name: Option<String>,
        font_faces: Vec<UIFontFace>,
    ) -> Result<UIFontFamilyResult, String>,

    // Style matching methods
    pub fn get_italics(
        &self,
        family_name: Option<String>,
        font_faces: Vec<UIFontFace>,
        current_style: Option<CurrentTextStyle>,
        max_results: Option<usize>,
    ) -> Result<Vec<ItalicMatch>, String>

    pub fn get_romans(
        &self,
        family_name: Option<String>,
        font_faces: Vec<UIFontFace>,
        current_style: Option<CurrentTextStyle>,
        max_results: Option<usize>,
    ) -> Result<Vec<ItalicMatch>, String>

    pub fn get_faces(
        &self,
        face_type: FaceType,
        family_name: Option<String>,
        font_faces: Vec<UIFontFace>,
        current_style: Option<CurrentTextStyle>,
        max_results: Option<usize>,
    ) -> Result<Vec<ItalicMatch>, String>
}
```

#### `UIFontFace`

Represents a font face with user-specified ID, data, and optional style declaration.

```rust
pub struct UIFontFace {
    pub face_id: String,                    // User-specified identifier (e.g., filename, URL, index)
    pub data: Vec<u8>,                      // Raw font data
    pub user_font_style_italic: Option<bool>, // User-declared italic style (highest priority when set)
}
```

#### `CurrentTextStyle`

Represents the current text style being used, with only relevant properties for matching.

```rust
pub struct CurrentTextStyle {
    pub weight: Option<u16>,                // Font weight (100-900)
    pub width: Option<u16>,                 // Font width/stretch (50-200)
    pub slant: Option<f32>,                 // Font slant angle (-90 to 90 degrees)
    pub custom_axes: HashMap<String, f32>,  // Additional custom axis values
}
```

**Smart Auto-Resolution**: The parser intelligently handles duplicated values between explicit properties and custom axes:

- **Weight Resolution**: `weight` property takes priority over `custom_axes["wght"]` if both are set
- **Width Resolution**: `width` property takes priority over `custom_axes["wdth"]` if both are set
- **Slant Resolution**: `slant` property takes priority over `custom_axes["slnt"]` if both are set
- **Axis Seeding**: Only resolves to axis values if the target font actually has that axis
- **Non-VF Fallback**: For non-variable fonts, only explicit properties are used (custom_axes ignored)

This allows flexible input while ensuring consistent, predictable behavior across different font types.

#### `FaceType`

Specifies the type of font faces to retrieve using the unified `get_faces()` interface.

```rust
pub enum FaceType {
    Italic,  // Retrieve italic (slanted) font variants
    Roman,   // Retrieve roman (upright) font variants
}
```

#### `ItalicMatch`

Represents a matching italic variant with distance and axis differences.

```rust
pub struct ItalicMatch {
    pub recipe: UIFontItalicRecipe,         // The matched italic recipe
    pub distance: f32,                      // Distance score (lower is closer match)
    pub axis_diffs: Option<Vec<AxisDiff>>,  // Axis differences for variable fonts
}
```

#### `AxisDiff`

Represents a difference in a variable font axis.

```rust
pub struct AxisDiff {
    pub tag: String,                        // Axis tag (e.g., "wght", "wdth", "slnt")
    pub spec: f32,                          // Target/specified value
    pub diff: f32,                          // Difference (spec - current)
}
```

#### `UIFontFamilyResult`

Complete family-level analysis result.

```rust
pub struct UIFontFamilyResult {
    pub family_name: String,                    // Family name
    pub axes: Vec<UIFontFamilyAxis>,            // Family-level axes (min/max across all faces)
    pub italic_capability: UIFontItalicCapability, // Italic capabilities
    pub faces: Vec<UIFontFaceInfo>,             // Face-level information
    pub styles: Vec<UIFontStyleInstance>,       // UI-friendly font style instances
}
```

#### `UIFontFamilyAxis`

Family-level axis information (no default values as they vary per face).

```rust
pub struct UIFontFamilyAxis {
    pub tag: String,                            // Axis tag (e.g., "wght", "ital", "slnt")
    pub name: String,                           // Human-readable axis name
    pub min: f32,                              // Minimum value across all faces
    pub max: f32,                              // Maximum value across all faces
}
```

#### `UIFontItalicCapability`

Italic capability analysis for UI consumption.

```rust
pub struct UIFontItalicCapability {
    pub has_italic: bool,                       // Whether family has italic variants
    pub has_upright: bool,                      // Whether family has upright variants
    pub strategy: UIFontItalicStrategy,         // Primary italic strategy
    pub recipes: Vec<UIFontItalicRecipe>,       // Available italic recipes
    pub scenario: FamilyScenario,               // Family scenario type
}
```

#### `UIFontItalicRecipe`

Italic recipe for UI consumption.

```rust
pub struct UIFontItalicRecipe {
    pub name: String,                           // User-friendly name (e.g., "Bold Italic")
    pub description: String,                    // User-friendly description
    pub is_italic: bool,                        // Whether this recipe produces italic text
    pub face_id: String,                        // Face ID to use for this recipe
    pub vf_recipe: Option<VfRecipe>,            // Variable font recipe (if applicable)
}
```

#### `UIFontStyleInstance`

Font style instance for UI consumption. Represents either a static font face or a variable font instance that can be selected in a style picker.

```rust
pub struct UIFontStyleInstance {
    pub name: String,                           // User-friendly style name (e.g., "Regular", "Bold", "Light Italic")
    pub postscript_name: String,                // PostScript name for this style
    pub italic: bool,                           // Whether this style is italic
}
```

### Low-Level API (Advanced)

#### `Parser`

Low-level font parser backed by `ttf-parser`.

```rust
pub struct Parser<'a> {
    // Font parsing methods
    pub fn new(data: &'a [u8]) -> Result<Self, ttf_parser::FaceParsingError>
    pub fn extract_face_record(&self, face_id: String, user_font_style_italic: Option<bool>) -> Result<FaceRecord, String>
    pub fn fvar(&self) -> FvarData
    pub fn stat(&self) -> StatData
    pub fn ffeatures(&self) -> Vec<FontFeature>
}
```

#### `FontSelectionParser`

Core font selection pipeline.

```rust
pub struct FontSelectionParser {
    pub config: ParserConfig,
}

impl FontSelectionParser {
    pub fn new() -> Self
    pub fn classify_face(&self, face_record: FaceRecord) -> ClassifiedFace
    pub fn build_capability_map(&self, faces: Vec<FaceRecord>) -> FontSelectionCapabilityMap
    pub fn select_face(&self, capability_map: &FontSelectionCapabilityMap, weight: u16, stretch: u16, style: FontStyle) -> FontSelection
}
```

#### `FaceClassification`

Result of font classification for a single face.

```rust
pub struct FaceClassification {
    pub font_style: FontStyle,             // Normal or Italic
    pub vf_recipe: Option<VfRecipe>,       // Variable font recipe
    pub weight_key: u16,                   // Weight for family aggregation
    pub stretch_key: u16,                  // Stretch for family aggregation
    pub is_variable: bool,                 // Whether this is a variable font
    pub instance_info: Option<InstanceInfo>, // Instance information (Scenario 3-1)

    // Legacy compatibility
    pub fn italic_kind(&self) -> FontStyle // Backward compatibility getter
}
```

#### `FontSelectionCapabilityMap`

Family-level font selection capability mapping.

```rust
pub struct FontSelectionCapabilityMap {
    pub upright_slots: HashMap<(u16, u16), FaceOrVfWithRecipe>, // (weight, stretch) -> face
    pub italic_slots: HashMap<(u16, u16), FaceOrVfWithRecipe>,  // (weight, stretch) -> face
    pub scenario: FamilyScenario,                               // Family scenario type
}
```

### WASM Bindings (with `wasm_bind` feature)

#### `WasmFontAnalysisResult`

WASM response structure for font family analysis.

```rust
pub struct WasmFontAnalysisResult {
    pub success: bool,
    pub family_name: String,
    pub axes: Vec<WasmFontFamilyAxis>,        // Family-level axes
    pub has_italic: bool,
    pub has_upright: bool,
    pub strategy: String,
    pub scenario: String,
    pub recipe_count: usize,
    pub faces: Vec<WasmFaceInfo>,             // Face-level information with instances
    pub styles: Vec<WasmFontStyle>,           // UI-friendly font style instances
}
```

#### `WasmFaceInfo`

WASM response structure for individual font face information.

```rust
pub struct WasmFaceInfo {
    pub face_id: String,
    pub family_name: String,
    pub subfamily_name: String,
    pub postscript_name: String,
    pub weight_class: u16,
    pub width_class: u16,
    pub is_variable: bool,
    pub axes: Vec<WasmFontAxis>,              // Face-specific axes with defaults
    pub instances: Option<Vec<WasmFontInstance>>, // Variable font instances
    pub features: Vec<WasmFontFeature>,
}
```

## Font Family Scenarios

The library handles various font family configurations:

### Scenario 1: One Static Font

- Single static font (either normal or italic-only)
- Example: `Allerta-Regular.ttf`, `Molle-Italic.ttf`

### Scenario 2: Many Static Fonts

- Multiple static fonts with italic/oblique variants
- Example: PT Serif family (`PTSerif-Regular.ttf`, `PTSerif-Italic.ttf`, etc.)

### Scenario 3: One Variable Font with `ital` Axis

- Single variable font providing both upright and italic
- Uses `ital` axis (0 = normal, 1 = italic)

### Scenario 3-1: Variable Font with `slnt` Axis & Italic Instances

- Variable font with `slnt` axis and explicit italic instances
- Examples: Recursive, Roboto Flex
- Requires italic-named instances in name table

### Scenario 4: Two Variable Fonts

- Separate Roman VF and Italic VF
- Examples: Inter family, Noto Sans family

## Implementation Status

### ✅ **Current Features (Level 1)**

- **User Font Style Declaration** - Highest priority explicit user declarations
- **OS/2 ITALIC Bit Detection** - Reliable detection using OS/2 table bit 0
- **Variable Font `ital` Axis** - Support for variable fonts with italic axis
- **Variable Font `slnt` Axis** - Support for slant-based italic in variable fonts
- **Scenario 3-1 Support** - Variable fonts with `slnt` axis and italic instances
- **Family Aggregation** - Intelligent grouping and selection of font families
- **Style Matching** - Find closest italic variants with axis differences
- **Parser Configuration** - Configurable trust levels for user declarations
- **Font Style Generation** - Automatic generation of UI-friendly font style instances

### 🔄 **Future Features (Level 2+)**

- **STAT Table Analysis** - Advanced font metadata parsing
- **Advanced `fvar.instances` Analysis** - Complex edge cases and malformed fonts
- **Advanced Name Table Parsing** - All name table entries analysis
- **Complex Edge Case Handling** - Conflicting metadata, malformed fonts
- **CJK/Mixed-Script Fallback** - Advanced fallback strategies
- **Advanced Validation** - Comprehensive diagnostics and validation

## Examples

### Basic Font Analysis

```rust
use fonts::{UIFontParser, UIFontFace};

let parser = UIFontParser::new();
let font_faces = vec![UIFontFace {
    face_id: "Inter-VariableFont.ttf".to_string(),
    data: std::fs::read("Inter-VariableFont.ttf")?,
    user_font_style_italic: None, // Let the parser analyze the font metadata
}];

let result = parser.analyze_family(None, font_faces)?;
println!("Family: {}", result.family_name);
println!("Italic available: {}", result.italic_capability.has_italic);
println!("Strategy: {:?}", result.italic_capability.strategy);
```

### Family Analysis

```rust
let font_faces = vec![
    UIFontFace {
        face_id: "Inter-Regular.ttf".to_string(),
        data: std::fs::read("Inter-Regular.ttf")?,
        user_font_style_italic: Some(false), // User declares this is not italic
    },
    UIFontFace {
        face_id: "Inter-Italic.ttf".to_string(),
        data: std::fs::read("Inter-Italic.ttf")?,
        user_font_style_italic: Some(true), // User declares this is italic
    },
];

let result = parser.analyze_family(Some("Inter".to_string()), font_faces)?;
println!("Family scenario: {:?}", result.italic_capability.scenario);
println!("Upright available: {}", result.italic_capability.has_upright);
println!("Italic available: {}", result.italic_capability.has_italic);
```

### Style Matching

Find the closest italic or roman variants to your current text style:

```rust
use fonts::{UIFontParser, UIFontFace, CurrentTextStyle};
use std::collections::HashMap;

let parser = UIFontParser::new();
let font_faces = vec![
    UIFontFace {
        face_id: "Inter-Regular.ttf".to_string(),
        data: std::fs::read("Inter-Regular.ttf")?,
        user_font_style_italic: Some(false),
    },
    UIFontFace {
        face_id: "Inter-Italic.ttf".to_string(),
        data: std::fs::read("Inter-Italic.ttf")?,
        user_font_style_italic: Some(true),
    },
];

// Define current text style with smart auto-resolution
let mut custom_axes = HashMap::new();
custom_axes.insert("wght".to_string(), 500.0);  // Will be overridden by weight: 400
custom_axes.insert("wdth".to_string(), 120.0);  // Will be overridden by width: 100
custom_axes.insert("slnt".to_string(), 5.0);    // Will be used since slant is None

let current_style = CurrentTextStyle {
    weight: Some(400),        // Takes priority over custom_axes["wght"]
    width: Some(100),         // Takes priority over custom_axes["wdth"]
    slant: None,              // Falls back to custom_axes["slnt"] if font has slnt axis
    custom_axes,
};

// Find closest italic variants
let italic_matches = parser.get_italics(
    Some("Inter".to_string()),
    font_faces.clone(),
    Some(current_style.clone()),
    Some(3), // Max 3 results
)?;

// Find closest roman (non-italic) variants
let roman_matches = parser.get_romans(
    Some("Inter".to_string()),
    font_faces,
    Some(current_style),
    Some(3), // Max 3 results
)?;

if let Some(closest_italic) = italic_matches.first() {
    println!("Closest italic: {}", closest_italic.recipe.name);
    println!("Distance: {}", closest_italic.distance);

    // Check axis differences for variable fonts
    if let Some(axis_diffs) = &closest_italic.axis_diffs {
        for diff in axis_diffs {
            println!("Axis {}: spec={} (diff: {})",
                diff.tag, diff.spec, diff.diff);
        }
    }
}

if let Some(closest_roman) = roman_matches.first() {
    println!("Closest roman: {}", closest_roman.recipe.name);
    println!("Distance: {}", closest_roman.distance);
}
```

### Unified Interface

For easier toggling between italic and roman variants, use the unified `get_faces()` interface:

```rust
use fonts::{UIFontParser, UIFontFace, CurrentTextStyle, FaceType};
use std::collections::HashMap;

let parser = UIFontParser::new();
let font_faces = vec![
    UIFontFace {
        face_id: "Inter-Regular.ttf".to_string(),
        data: std::fs::read("Inter-Regular.ttf")?,
        user_font_style_italic: Some(false),
    },
    UIFontFace {
        face_id: "Inter-Italic.ttf".to_string(),
        data: std::fs::read("Inter-Italic.ttf")?,
        user_font_style_italic: Some(true),
    },
];

let current_style = CurrentTextStyle {
    weight: Some(400),
    width: Some(100),
    slant: None,
    custom_axes: HashMap::new(),
};

// Toggle to italic
let italic_matches = parser.get_faces(
    FaceType::Italic,
    Some("Inter".to_string()),
    font_faces.clone(),
    Some(current_style.clone()),
    Some(1),
)?;

// Toggle to roman
let roman_matches = parser.get_faces(
    FaceType::Roman,
    Some("Inter".to_string()),
    font_faces,
    Some(current_style),
    Some(1),
)?;

// Easy toggling in UI code
let toggle_to_italic = parser.get_faces(
    FaceType::Italic,
    Some("Inter".to_string()),
    font_faces,
    Some(current_style),
    Some(1),
)?;
```

### Font Style Management

The library provides comprehensive font style management for UI integration:

```rust
use fonts::{UIFontParser, UIFontFace};

let parser = UIFontParser::new();
let font_faces = vec![
    UIFontFace {
        face_id: "Inter-Regular.ttf".to_string(),
        data: std::fs::read("Inter-Regular.ttf")?,
        user_font_style_italic: Some(false),
    },
    UIFontFace {
        face_id: "Inter-Italic.ttf".to_string(),
        data: std::fs::read("Inter-Italic.ttf")?,
        user_font_style_italic: Some(true),
    },
];

let result = parser.analyze_family(Some("Inter".to_string()), font_faces)?;

// Get all available styles for a style picker
let styles = &result.styles;
println!("Available styles: {}", styles.len());

for style in styles {
    println!("- {} ({})", style.name, style.postscript_name);
    println!("  Italic: {}", style.italic);
}

// Filter styles by italic status
let italic_styles: Vec<_> = styles.iter()
    .filter(|s| s.italic)
    .collect();

let roman_styles: Vec<_> = styles.iter()
    .filter(|s| !s.italic)
    .collect();

println!("Italic styles: {}", italic_styles.len());
println!("Roman styles: {}", roman_styles.len());
```

### Variable Font Style Generation

For variable fonts, styles are generated from font instances:

```rust
let font_faces = vec![
    UIFontFace {
        face_id: "Inter-VariableFont.ttf".to_string(),
        data: std::fs::read("Inter-VariableFont.ttf")?,
        user_font_style_italic: None, // Let the parser analyze the font metadata
    },
];

let result = parser.analyze_family(Some("Inter".to_string()), font_faces)?;

// Display variable font styles
for style in &result.styles {
    println!("Variable Style: {} ({})", style.name, style.postscript_name);
    println!("  Italic: {}", style.italic);
}
```

### WASM Communication

The library provides WASM bindings for web integration. The WASM API exposes the same high-level functionality with JSON serialization:

```rust
// Enable wasm_bind feature
// cargo build --features wasm_bind

// WASM functions are automatically available:
// - _grida_fonts_analyze_family: Analyze font family with multiple faces
// - _grida_fonts_parse_font: Parse single font file
// - _grida_fonts_version: Get library version

// The WASM API returns JSON with the same structure as UIFontFamilyResult:
// {
//   "success": true,
//   "family_name": "Inter",
//   "axes": [...],           // Family-level axes
//   "has_italic": true,
//   "has_upright": true,
//   "strategy": "DualVariableFonts",
//   "scenario": "DualVf",
//   "recipe_count": 2,
//   "faces": [...],          // Face-level information with instances
//   "styles": [...]          // UI-friendly font style instances
// }
```

## Performance

- **Zero-copy parsing**: Uses `ttf-parser` for efficient font data access
- **Minimal allocations**: Optimized data structures and conversion paths
- **Fast classification**: O(1) OS/2 bit checks, O(n) axis iteration
- **Efficient aggregation**: HashMap-based family grouping

## Contributing

1. Follow the Level 1 specification in the working group documentation
2. Add comprehensive tests for new features
3. Update documentation for API changes
4. Ensure all tests pass: `cargo test --all-targets --all-features`

## License

This project is part of the Grida design tool ecosystem. See the main project license for details.

---

**For technical details, testing information, dependencies, and changelog, see [AGENTS.md](./AGENTS.md).**
