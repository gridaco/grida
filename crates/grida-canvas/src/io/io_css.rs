//! CSS-style types and utilities for parsing CSS-like values in JSON.
//!
//! This module provides types and functions for handling CSS-style dimension values
//! that can be either automatic or fixed pixel values.
//!
//! # Example
//!
//! ```
//! use serde::Deserialize;
//! use cg::io::io_css::{CSSDimension, de_css_dimension};
//!
//! #[derive(Deserialize)]
//! struct MyNode {
//!     #[serde(deserialize_with = "de_css_dimension")]
//!     width: CSSDimension,
//!     #[serde(deserialize_with = "de_css_dimension")]
//!     height: CSSDimension,
//! }
//!
//! // This JSON:
//! // {"width": "auto", "height": 100}
//! // Will deserialize to:
//! // MyNode { width: CSSDimension::Auto, height: CSSDimension::LengthPX(100.0) }
//! ```

use serde::Deserialize;
use serde_json::Value;

/// CSS-style dimension value that can be either auto or a fixed length in pixels.
#[derive(Debug, PartialEq)]
pub enum CSSDimension {
    Auto,
    LengthPX(f32),
}

impl CSSDimension {
    /// Returns the length value, using the provided fallback for Auto values.
    ///
    /// # Arguments
    /// * `fallback` - The value to return when the dimension is Auto
    ///
    /// # Examples
    /// ```
    /// use cg::io::io_css::CSSDimension;
    ///
    /// let auto = CSSDimension::Auto;
    /// assert_eq!(auto.length(42.0), 42.0);
    ///
    /// let length = CSSDimension::LengthPX(100.0);
    /// assert_eq!(length.length(42.0), 100.0);
    /// ```
    pub fn length(&self, fallback: f32) -> f32 {
        match self {
            CSSDimension::Auto => fallback,
            CSSDimension::LengthPX(length) => *length,
        }
    }
}

/// Default function for CSSDimension width - defaults to Auto
pub fn default_width_css() -> CSSDimension {
    CSSDimension::Auto
}

/// Default function for CSSDimension height - defaults to Auto
pub fn default_height_css() -> CSSDimension {
    CSSDimension::Auto
}

/// Custom deserializer for CSSDimension that handles various input formats.
///
/// Supports:
/// - String "auto" -> CSSDimension::Auto
/// - Numbers -> CSSDimension::LengthPX(value)
/// - Strings with "px" suffix -> CSSDimension::LengthPX(value)
/// - Plain number strings -> CSSDimension::LengthPX(value)
/// - Invalid values -> CSSDimension::Auto (fallback)
pub fn de_css_dimension<'de, D>(deserializer: D) -> Result<CSSDimension, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value: Value = Deserialize::deserialize(deserializer)?;
    match value {
        Value::String(s) => {
            if s == "auto" {
                Ok(CSSDimension::Auto)
            } else {
                // Try to parse as a number with "px" suffix
                if let Some(px_value) = s.strip_suffix("px") {
                    if let Ok(num) = px_value.parse::<f32>() {
                        Ok(CSSDimension::LengthPX(num))
                    } else {
                        Ok(CSSDimension::Auto)
                    }
                } else {
                    // Try to parse as a plain number
                    if let Ok(num) = s.parse::<f32>() {
                        Ok(CSSDimension::LengthPX(num))
                    } else {
                        Ok(CSSDimension::Auto)
                    }
                }
            }
        }
        Value::Number(n) => {
            if let Some(num) = n.as_f64() {
                Ok(CSSDimension::LengthPX(num as f32))
            } else {
                Ok(CSSDimension::Auto)
            }
        }
        _ => Ok(CSSDimension::Auto),
    }
}

#[derive(Debug, PartialEq, Deserialize)]
pub enum CSSFontKerning {
    #[serde(rename = "auto")]
    Auto,
    #[serde(rename = "normal")]
    Normal,
    #[serde(rename = "none")]
    None,
}

impl Default for CSSFontKerning {
    fn default() -> Self {
        CSSFontKerning::Auto
    }
}

pub trait UserAgentAutoTaste {
    /// converts a enum with "auto", that requires user agent default behaviour, to a boolean flag.
    fn to_flag_with_auto(&self) -> bool;
}

impl UserAgentAutoTaste for CSSFontKerning {
    fn to_flag_with_auto(&self) -> bool {
        match self {
            CSSFontKerning::Auto => true,
            CSSFontKerning::Normal => true,
            CSSFontKerning::None => false,
        }
    }
}

#[derive(Debug, PartialEq, Deserialize)]
pub enum CSSObjectFit {
    #[serde(rename = "cover")]
    Cover,
    #[serde(rename = "contain")]
    Contain,
    #[serde(rename = "fill")]
    Fill,
    #[serde(rename = "none")]
    None,
    // not supported
    // #[serde(rename = "scale-down")]
    // ScaleDown,
}

impl Default for CSSObjectFit {
    fn default() -> Self {
        CSSObjectFit::Contain
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn css_dimension_length_method() {
        let auto = CSSDimension::Auto;
        assert_eq!(auto.length(42.0), 42.0);

        let length = CSSDimension::LengthPX(100.0);
        assert_eq!(length.length(42.0), 100.0);
    }

    #[test]
    fn default_functions() {
        assert_eq!(default_width_css(), CSSDimension::Auto);
        assert_eq!(default_height_css(), CSSDimension::Auto);
    }

    #[test]
    fn css_dimension_equality() {
        assert_eq!(CSSDimension::Auto, CSSDimension::Auto);
        assert_eq!(CSSDimension::LengthPX(100.0), CSSDimension::LengthPX(100.0));
        assert_ne!(CSSDimension::Auto, CSSDimension::LengthPX(0.0));
        assert_ne!(CSSDimension::LengthPX(100.0), CSSDimension::LengthPX(200.0));
    }
}
