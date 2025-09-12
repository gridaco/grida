//! Grida Canvas Fonts
//!
//! A high-performance font parsing and selection library for the Grida design tool.
//! This library provides font metadata parsing, italic detection, and font selection
//! functionality using the Blink (Chrome) font selection model.

pub mod parse;
pub mod parse_feature;
pub mod parse_feature_params;
pub mod parse_ui;
pub mod selection;
pub mod selection_italic;

#[cfg(feature = "serde")]
pub mod serde;

// Re-export core types and functionality
pub use parse::{
    FontFeature, FvarAxis, FvarData, FvarInstance, Parser, StatAxis, StatAxisValue,
    StatCombination, StatData,
};
pub use parse_feature::{FeatureParser, ParserType, DEFAULT_PARSER};
pub use selection::{
    FaceClassification, FaceRecord, FamilyScenario, FontSelection, FontSelectionCapabilityMap,
    FontSelectionParser, FontStyle, InstanceInfo, ParserConfig, VfRecipe,
};
pub use selection_italic::{
    build_italic_capability_map, classify_face_for_italic, extract_face_record,
    extract_italic_instances, has_italic_named_instances, is_italic_by_name, select_italic_face,
    select_normal_face, ItalicCapabilityMap, ItalicKind, ItalicParser, ItalicSelectionParser,
};

// Note: FaceRecord, FamilyScenario, ParserConfig, and VfRecipe are already re-exported above

// Re-export high-level UI API as the primary interface
pub use parse_ui::{
    AxisDiff, CurrentTextStyle, FaceType, ItalicMatch, UIFontFace, UIFontFaceOwned,
    UIFontFamilyResult, UIFontItalicCapability, UIFontItalicRecipe, UIFontItalicStrategy,
    UIFontParser,
};

#[cfg(feature = "wasm_bind")]
pub mod wasm_bind;
