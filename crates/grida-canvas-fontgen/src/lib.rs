//! Grida Canvas Font Generation
//!
//! This crate provides utilities for generating fonts from various sources,
//! with a focus on PNG to font conversion for emoji and bitmap fonts.
//!
//! ## Features
//!
//! - **PNG Processing**: Extract PNG data and dimensions for font generation
//! - **CBDT/CBLC Tables**: Generate color bitmap font tables
//! - **Font Validation**: Comprehensive font validation using multiple libraries
//! - **TTF Generation**: Create functional TTF font files
//!
//! ## Example
//!
//! ```rust
//! use grida_canvas_fontgen::fontgen::{
//!     DynFontManager, FontFamily, FontGlyph
//! };
//! use grida_canvas_fontgen::PngProcessor;
//!
//! // Create a font manager and add PNG-based glyphs
//! let mut manager = DynFontManager::new();
//! // ... add fonts and glyphs
//! ```
//!
//! ## Architecture
//!
//! The crate is organized into several modules:
//!
//! - `fontgen`: Core font generation logic
//! - `png_processor`: PNG data extraction and processing
//! - `cbdt_cblc`: Color bitmap font table generation
//! - `font_validator`: Font validation utilities
//!
//! ## Dependencies
//!
//! - `png`: PNG image processing
//! - `write-fonts`: Font table construction and serialization
//! - `read-fonts`: Font parsing and validation
//! - `ttf-parser`: Additional TTF validation

pub mod fontgen;

// Re-export main types for convenience
pub use fontgen::cbdt_cblc::{CbdtGenerator, CblcGenerator};
pub use fontgen::font_validator::FontValidator;
pub use fontgen::png_processor::PngProcessor;
pub use fontgen::{DynFontManager, FontFamily, FontGlyph};
