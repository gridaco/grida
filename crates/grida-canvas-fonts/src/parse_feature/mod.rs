//! Feature parsing modules
//!
//! This module provides different strategies for parsing OpenType features from fonts.
//! Each parser implements the `FeatureParser` trait and can be used interchangeably.

pub mod mode_full;
pub mod mode_simple;
pub mod utils;

use crate::parse::FontFeature;

/// Trait for parsing OpenType features from a font face
pub trait FeatureParser {
    /// Parse all features from the given font face and raw font data
    fn parse_features(&self, face: &ttf_parser::Face, font_data: &[u8]) -> Vec<FontFeature>;

    /// Get the name of this parser for debugging/logging
    fn name(&self) -> &'static str;
}

/// Available feature parsers
#[derive(Debug, Clone, Copy)]
pub enum ParserType {
    /// Comprehensive parser that extracts script/language context
    Comprehensive,
    /// Built-in ttf-parser approach (simpler, faster)
    Builtin,
}

impl ParserType {
    /// Create a parser instance of the specified type
    pub fn create_parser(self) -> Box<dyn FeatureParser> {
        match self {
            ParserType::Comprehensive => Box::new(mode_full::ComprehensiveFeatureParser::new()),
            ParserType::Builtin => Box::new(mode_simple::BuiltinFeatureParser::new()),
        }
    }
}

/// Default parser type to use
pub const DEFAULT_PARSER: ParserType = ParserType::Comprehensive;
