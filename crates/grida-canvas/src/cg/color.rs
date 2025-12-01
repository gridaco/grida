use serde::de::Error;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq)]
pub struct CGColor {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
}

impl CGColor {
    pub const TRANSPARENT: Self = Self::from_u32(0x00000000);
    pub const BLACK: Self = Self::from_u32(0x000000FF);
    pub const WHITE: Self = Self::from_u32(0xFFFFFFFF);
    pub const RED: Self = Self::from_u32(0xFF0000FF);
    pub const GREEN: Self = Self::from_u32(0x00FF00FF);
    pub const BLUE: Self = Self::from_u32(0x0000FFFF);

    /// Initialize from a RGBA u32: 0xRRGGBBAA
    #[inline]
    pub const fn from_u32(rgba: u32) -> Self {
        // Direct struct construction is allowed here as this is the base constructor
        Self {
            r: ((rgba >> 24) & 0xff) as u8,
            g: ((rgba >> 16) & 0xff) as u8,
            b: ((rgba >> 8) & 0xff) as u8,
            a: (rgba & 0xff) as u8,
        }
    }

    /// Initialize from a ARGB u32: 0xAARRGGBB
    #[inline]
    pub const fn from_u32_argb(argb: u32) -> Self {
        // Direct struct construction is allowed here as this is the base constructor
        Self {
            a: ((argb >> 24) & 0xff) as u8,
            r: ((argb >> 16) & 0xff) as u8,
            g: ((argb >> 8) & 0xff) as u8,
            b: (argb & 0xff) as u8,
        }
    }

    pub const fn from_rgba(r: u8, g: u8, b: u8, a: u8) -> Self {
        Self::from_u32((r as u32) << 24 | (g as u32) << 16 | (b as u32) << 8 | (a as u32))
    }

    pub const fn from_rgb(r: u8, g: u8, b: u8) -> Self {
        Self::from_u32((r as u32) << 24 | (g as u32) << 16 | (b as u32) << 8 | 0xff)
    }

    pub fn r(&self) -> u8 {
        self.r
    }
    pub fn g(&self) -> u8 {
        self.g
    }
    pub fn b(&self) -> u8 {
        self.b
    }
    pub fn a(&self) -> u8 {
        self.a
    }

    /// Returns a new color whose alpha channel is multiplied by `opacity` (0–1).
    /// Leaves RGB untouched; handy for chaining fill/layer opacity without
    /// mutating the original color.
    pub fn with_multiplier(&self, opacity: f32) -> Self {
        let clamped = opacity.clamp(0.0, 1.0);
        let existing = self.a() as f32 / 255.0;
        let combined = (existing * clamped).clamp(0.0, 1.0);
        let alpha = (combined * 255.0).round() as u8;
        CGColor::from_rgba(self.r(), self.g(), self.b(), alpha)
    }
}

impl Default for CGColor {
    fn default() -> Self {
        Self::TRANSPARENT
    }
}

// ---------- Serialize: always [r, g, b, a] ----------
impl Serialize for CGColor {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let CGColor { r, g, b, a } = *self;
        [r, g, b, a].serialize(serializer)
    }
}

// ---------- Deserialize: many shapes accepted ----------
impl<'de> Deserialize<'de> for CGColor {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        // Helper enum that can parse multiple shapes
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Repr {
            Array3([u8; 3]),
            Array4([u8; 4]),
            Object { r: u8, g: u8, b: u8, a: Option<u8> },
            Hex(String),
        }

        let repr = Repr::deserialize(deserializer)?;

        match repr {
            Repr::Array3([r, g, b]) => Ok(CGColor::from_rgba(r, g, b, 0xff)),
            Repr::Array4([r, g, b, a]) => Ok(CGColor::from_rgba(r, g, b, a)),
            Repr::Object { r, g, b, a } => Ok(CGColor::from_rgba(r, g, b, a.unwrap_or(0xff))),
            Repr::Hex(s) => parse_hex(&s).map_err(D::Error::custom),
        }
    }
}

// Simple hex parser: #rgb, #rgba, #rrggbb, #rrggbbaa
fn parse_hex(s: &str) -> Result<CGColor, String> {
    let s = s.trim();
    let s = s.strip_prefix('#').unwrap_or(s);

    let (r, g, b, a) = match s.len() {
        3 => {
            let r = &s[0..1];
            let g = &s[1..2];
            let b = &s[2..3];
            (dup_hex(r)?, dup_hex(g)?, dup_hex(b)?, 0xff)
        }
        4 => {
            let r = &s[0..1];
            let g = &s[1..2];
            let b = &s[2..3];
            let a = &s[3..4];
            (dup_hex(r)?, dup_hex(g)?, dup_hex(b)?, dup_hex(a)?)
        }
        6 => {
            let r = &s[0..2];
            let g = &s[2..4];
            let b = &s[4..6];
            (
                u8::from_str_radix(r, 16).map_err(to_string)?,
                u8::from_str_radix(g, 16).map_err(to_string)?,
                u8::from_str_radix(b, 16).map_err(to_string)?,
                0xff,
            )
        }
        8 => {
            let r = &s[0..2];
            let g = &s[2..4];
            let b = &s[4..6];
            let a = &s[6..8];
            (
                u8::from_str_radix(r, 16).map_err(to_string)?,
                u8::from_str_radix(g, 16).map_err(to_string)?,
                u8::from_str_radix(b, 16).map_err(to_string)?,
                u8::from_str_radix(a, 16).map_err(to_string)?,
            )
        }
        _ => return Err("invalid hex color length".into()),
    };

    Ok(CGColor::from_rgba(r, g, b, a))
}

fn dup_hex(d: &str) -> Result<u8, String> {
    let s = format!("{d}{d}");
    u8::from_str_radix(&s, 16).map_err(to_string)
}

fn to_string<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Serde adapters for `CGColor` in various formats.
///
/// This module provides different serialization formats for color values,
/// each optimized for different use cases and compatibility requirements.
pub mod color_formats {
    /// Object-based formats that serialize as JSON objects `{ "r": ..., "g": ..., "b": ..., "a": ... }`.
    pub mod object {
        /// RGBA32F format: All channels as f32 (0.0-1.0).
        ///
        /// **Format**: `{ "r": 1.0, "g": 0.5, "b": 0.0, "a": 0.75 }`
        /// - All channels: `f32` (0.0-1.0)
        ///
        /// This is a normalized, scientific color format where all channels use the same type.
        /// Useful for mathematical operations and consistent data models.
        ///
        /// **Usage:**
        /// ```rust
        /// use cg::cg::prelude::*;
        /// use serde::*;
        ///
        /// #[derive(Serialize, Deserialize)]
        /// struct Style {
        ///     #[serde(with = "color_formats::object::RGBA32F")]
        ///     color: CGColor,
        /// }
        /// ```
        #[allow(non_snake_case)]
        pub mod RGBA32F {
            use super::super::super::CGColor;
            use serde::{Deserialize, Deserializer, Serialize, Serializer};

            #[derive(Serialize, Deserialize)]
            struct Helper {
                r: f32,
                g: f32,
                b: f32,
                a: f32,
            }

            pub fn serialize<S>(c: &CGColor, s: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                Helper {
                    r: c.r() as f32 / 255.0,
                    g: c.g() as f32 / 255.0,
                    b: c.b() as f32 / 255.0,
                    a: c.a() as f32 / 255.0,
                }
                .serialize(s)
            }

            pub fn deserialize<'de, D>(d: D) -> Result<CGColor, D::Error>
            where
                D: Deserializer<'de>,
            {
                // Handle null values by treating them as missing (use default)
                let helper: Option<Helper> = Option::deserialize(d)?;
                match helper {
                    Some(h) => {
                        let r = (h.r.clamp(0.0, 1.0) * 255.0).round() as u8;
                        let g = (h.g.clamp(0.0, 1.0) * 255.0).round() as u8;
                        let b = (h.b.clamp(0.0, 1.0) * 255.0).round() as u8;
                        let a = (h.a.clamp(0.0, 1.0) * 255.0).round() as u8;
                        Ok(CGColor::from_rgba(r, g, b, a))
                    }
                    None => Ok(CGColor::default()),
                }
            }

            /// Optional color wrapper for RGBA32F format.
            ///
            /// Handles `null` values and missing fields by deserializing to `None`.
            ///
            /// **Usage:**
            /// ```rust
            /// use cg::cg::prelude::*;
            /// use serde::*;
            ///
            /// #[derive(Serialize, Deserialize)]
            /// struct Style {
            ///     #[serde(with = "color_formats::object::RGBA32F::option")]
            ///     color: Option<CGColor>,
            /// }
            /// ```
            pub mod option {
                use super::*;
                use serde::{Deserialize, Deserializer, Serializer};

                pub fn serialize<S>(value: &Option<CGColor>, s: S) -> Result<S::Ok, S::Error>
                where
                    S: Serializer,
                {
                    match value {
                        Some(color) => super::serialize(color, s),
                        None => s.serialize_none(),
                    }
                }

                pub fn deserialize<'de, D>(d: D) -> Result<Option<CGColor>, D::Error>
                where
                    D: Deserializer<'de>,
                {
                    let helper: Option<Helper> = Option::deserialize(d)?;
                    Ok(helper.map(|h| {
                        let r = (h.r.clamp(0.0, 1.0) * 255.0).round() as u8;
                        let g = (h.g.clamp(0.0, 1.0) * 255.0).round() as u8;
                        let b = (h.b.clamp(0.0, 1.0) * 255.0).round() as u8;
                        let a = (h.a.clamp(0.0, 1.0) * 255.0).round() as u8;
                        CGColor::from_rgba(r, g, b, a)
                    }))
                }
            }
        }

        /// RGBA8888 format: All channels as u8 (0-255).
        ///
        /// **Format**: `{ "r": 255, "g": 128, "b": 0, "a": 192 }`
        /// - All channels: `u8` (0-255)
        ///
        /// This is a consistent, integer-based format where all channels use the same type.
        /// Matches common image formats and is efficient for storage.
        ///
        /// **Usage:**
        /// ```rust
        /// use cg::cg::prelude::*;
        /// use serde::*;
        ///
        /// #[derive(Serialize, Deserialize)]
        /// struct Style {
        ///     #[serde(with = "color_formats::object::RGBA8888")]
        ///     color: CGColor,
        /// }
        /// ```
        #[allow(non_snake_case)]
        pub mod RGBA8888 {
            use super::super::super::CGColor;
            use serde::{Deserialize, Deserializer, Serialize, Serializer};

            #[derive(Serialize, Deserialize)]
            struct Helper {
                r: u8,
                g: u8,
                b: u8,
                a: u8,
            }

            pub fn serialize<S>(c: &CGColor, s: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                Helper {
                    r: c.r(),
                    g: c.g(),
                    b: c.b(),
                    a: c.a(),
                }
                .serialize(s)
            }

            pub fn deserialize<'de, D>(d: D) -> Result<CGColor, D::Error>
            where
                D: Deserializer<'de>,
            {
                // Handle null values by treating them as missing (use default)
                let helper: Option<Helper> = Option::deserialize(d)?;
                match helper {
                    Some(h) => Ok(CGColor::from_rgba(h.r, h.g, h.b, h.a)),
                    None => Ok(CGColor::default()),
                }
            }

            /// Optional color wrapper for RGBA8888 format.
            ///
            /// Handles `null` values and missing fields by deserializing to `None`.
            ///
            /// **Usage:**
            /// ```rust
            /// use cg::cg::prelude::*;
            /// use serde::*;
            ///
            /// #[derive(Serialize, Deserialize)]
            /// struct Style {
            ///     #[serde(with = "color_formats::object::RGBA8888::option")]
            ///     color: Option<CGColor>,
            /// }
            /// ```
            pub mod option {
                use super::*;
                use serde::{Deserialize, Deserializer, Serializer};

                pub fn serialize<S>(value: &Option<CGColor>, s: S) -> Result<S::Ok, S::Error>
                where
                    S: Serializer,
                {
                    match value {
                        Some(color) => super::serialize(color, s),
                        None => s.serialize_none(),
                    }
                }

                pub fn deserialize<'de, D>(d: D) -> Result<Option<CGColor>, D::Error>
                where
                    D: Deserializer<'de>,
                {
                    let helper: Option<Helper> = Option::deserialize(d)?;
                    Ok(helper.map(|h| CGColor::from_rgba(h.r, h.g, h.b, h.a)))
                }
            }
        }

        /// RGB888A32F format: RGB as u8 (0-255), Alpha as f32 (0.0-1.0).
        ///
        /// **Format**: `{ "r": 255, "g": 128, "b": 0, "a": 0.75 }`
        /// - `r`, `g`, `b`: `u8` (0-255)
        /// - `a`: `f32` (0.0-1.0) - matches CSS `rgba()` format
        ///
        /// **Note**: This format is inconsistent (mixing u8 and f32) and is not a scientific model.
        /// Should only be used if the format is in CSS-rgba-like format for compatibility with
        /// JavaScript/TypeScript codebases. Not recommended for new code.
        ///
        /// This format matches the CSS `rgba()` function where alpha is specified as 0.0-1.0,
        /// while RGB values are typically 0-255 in many JavaScript color libraries.
        ///
        /// **Usage:**
        /// ```rust
        /// use cg::cg::prelude::*;
        /// use serde::*;
        ///
        /// #[derive(Serialize, Deserialize)]
        /// struct Style {
        ///     #[serde(with = "color_formats::object::RGB888A32F")]
        ///     color: CGColor,
        /// }
        /// ```
        ///
        // #[deprecated(
        //     since = "0.0.0",
        //     note = "This format (RGB888A32F: r/g/b as u8 0-255, a as f32 0.0-1.0) matches CSS rgba() format where alpha is 0.0-1.0. This is not a scientific model and should only be used if the format is in CSS-rgba-like format. Not recommended for new code."
        // )]
        #[allow(non_snake_case)]
        pub mod RGB888A32F {
            use super::super::super::CGColor;
            use serde::{Deserialize, Deserializer, Serialize, Serializer};

            #[derive(Serialize, Deserialize)]
            struct Helper {
                r: u8,
                g: u8,
                b: u8,
                a: f32, // f32 (0.0-1.0) instead of u8 (0-255)
            }

            pub fn serialize<S>(c: &CGColor, s: S) -> Result<S::Ok, S::Error>
            where
                S: Serializer,
            {
                Helper {
                    r: c.r(),
                    g: c.g(),
                    b: c.b(),
                    a: c.a() as f32 / 255.0, // Convert u8 (0-255) to f32 (0.0-1.0)
                }
                .serialize(s)
            }

            pub fn deserialize<'de, D>(d: D) -> Result<CGColor, D::Error>
            where
                D: Deserializer<'de>,
            {
                // Handle null values by treating them as missing (use default)
                let helper: Option<Helper> = Option::deserialize(d)?;
                match helper {
                    Some(h) => {
                        // Convert f32 (0.0-1.0) to u8 (0-255)
                        let a = (h.a.clamp(0.0, 1.0) * 255.0).round() as u8;
                        Ok(CGColor::from_rgba(h.r, h.g, h.b, a))
                    }
                    None => Ok(CGColor::default()),
                }
            }

            /// Optional color wrapper for RGB888A32F format.
            ///
            /// Handles `null` values and missing fields by deserializing to `None`.
            ///
            /// **Usage:**
            /// ```rust
            /// use cg::cg::prelude::*;
            /// use serde::*;
            ///
            /// #[derive(Serialize, Deserialize)]
            /// struct Style {
            ///     #[serde(with = "color_formats::object::RGB888A32F::option")]
            ///     color: Option<CGColor>,
            /// }
            /// ```
            pub mod option {
                use super::*;
                use serde::{Deserialize, Deserializer, Serializer};

                pub fn serialize<S>(value: &Option<CGColor>, s: S) -> Result<S::Ok, S::Error>
                where
                    S: Serializer,
                {
                    match value {
                        Some(color) => super::serialize(color, s),
                        None => s.serialize_none(),
                    }
                }

                pub fn deserialize<'de, D>(d: D) -> Result<Option<CGColor>, D::Error>
                where
                    D: Deserializer<'de>,
                {
                    let helper: Option<Helper> = Option::deserialize(d)?;
                    Ok(helper.map(|h| {
                        // Convert f32 (0.0-1.0) to u8 (0-255)
                        let a = (h.a.clamp(0.0, 1.0) * 255.0).round() as u8;
                        CGColor::from_rgba(h.r, h.g, h.b, a)
                    }))
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[test]
    fn test_formats_object_rgba32f() {
        #[derive(Serialize, Deserialize)]
        struct TestStruct {
            #[serde(with = "color_formats::object::RGBA32F")]
            color: CGColor,
        }

        // Test with all channels as f32 (0.0-1.0)
        let json = r#"{"color": {"r": 1.0, "g": 0.5, "b": 0.25, "a": 0.75}}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color.r(), 255);
        assert_eq!(obj.color.g(), 128); // 0.5 * 255 = 127.5, rounded to 128
        assert_eq!(obj.color.b(), 64); // 0.25 * 255 = 63.75, rounded to 64
        assert_eq!(obj.color.a(), 191); // 0.75 * 255 = 191.25, rounded to 191

        // Test serialization (should convert back to f32)
        let serialized = serde_json::to_string(&obj).unwrap();
        let value: serde_json::Value = serde_json::from_str(&serialized).unwrap();
        assert_eq!(value["color"]["r"], 1.0);
        assert!((value["color"]["g"].as_f64().unwrap() - 0.502).abs() < 0.01); // 128/255 ≈ 0.502
        assert!((value["color"]["b"].as_f64().unwrap() - 0.251).abs() < 0.01); // 64/255 ≈ 0.251
        assert!((value["color"]["a"].as_f64().unwrap() - 0.749).abs() < 0.01); // 191/255 ≈ 0.749
    }

    #[test]
    fn test_formats_object_rgba32f_opt() {
        #[derive(Serialize, Deserialize)]
        struct TestStruct {
            #[serde(with = "color_formats::object::RGBA32F::option")]
            color: Option<CGColor>,
        }

        let json = r#"{"color": null}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color, None);

        let json = r#"{"color": {"r": 0.0, "g": 1.0, "b": 0.0, "a": 1.0}}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color, Some(CGColor::GREEN));

        // Test serialization
        let serialized = serde_json::to_string(&obj).unwrap();
        let deserialized: TestStruct = serde_json::from_str(&serialized).unwrap();
        assert_eq!(deserialized.color, obj.color);
    }

    #[test]
    fn test_formats_object_rgba32f_default() {
        #[derive(Serialize, Deserialize)]
        struct TestStruct {
            #[serde(with = "color_formats::object::RGBA32F", default)]
            color: CGColor,
        }

        // Test with missing field
        let json = r#"{}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color, CGColor::TRANSPARENT);

        // Test with null field
        let json = r#"{"color": null}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color, CGColor::TRANSPARENT);

        // Test with present field
        let json = r#"{"color": {"r": 1.0, "g": 0.0, "b": 0.0, "a": 1.0}}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color, CGColor::RED);
    }

    #[test]
    fn test_formats_object_rgba8888() {
        #[derive(Serialize, Deserialize)]
        struct TestStruct {
            #[serde(with = "color_formats::object::RGBA8888")]
            color: CGColor,
        }

        // Test with all channels as u8 (0-255)
        let json = r#"{"color": {"r": 255, "g": 128, "b": 64, "a": 192}}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color.r(), 255);
        assert_eq!(obj.color.g(), 128);
        assert_eq!(obj.color.b(), 64);
        assert_eq!(obj.color.a(), 192);

        // Test serialization
        let serialized = serde_json::to_string(&obj).unwrap();
        let deserialized: TestStruct = serde_json::from_str(&serialized).unwrap();
        assert_eq!(deserialized.color, obj.color);
    }

    #[test]
    fn test_formats_object_rgba8888_opt() {
        #[derive(Serialize, Deserialize)]
        struct TestStruct {
            #[serde(with = "color_formats::object::RGBA8888::option")]
            color: Option<CGColor>,
        }

        let json = r#"{"color": null}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color, None);

        let json = r#"{"color": {"r": 0, "g": 255, "b": 0, "a": 255}}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color, Some(CGColor::GREEN));

        // Test serialization
        let serialized = serde_json::to_string(&obj).unwrap();
        let deserialized: TestStruct = serde_json::from_str(&serialized).unwrap();
        assert_eq!(deserialized.color, obj.color);
    }

    #[test]
    fn test_formats_object_rgba8888_default() {
        #[derive(Serialize, Deserialize)]
        struct TestStruct {
            #[serde(with = "color_formats::object::RGBA8888", default)]
            color: CGColor,
        }

        // Test with missing field
        let json = r#"{}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color, CGColor::TRANSPARENT);

        // Test with null field
        let json = r#"{"color": null}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color, CGColor::TRANSPARENT);

        // Test with present field
        let json = r#"{"color": {"r": 255, "g": 0, "b": 0, "a": 255}}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color, CGColor::RED);
    }

    #[test]
    fn test_formats_object_rgb888a32f() {
        #[derive(Serialize, Deserialize)]
        struct TestStruct {
            #[serde(with = "color_formats::object::RGB888A32F")]
            color: CGColor,
        }

        // Test with RGB as u8, alpha as f32
        let json = r#"{"color": {"r": 255, "g": 128, "b": 64, "a": 0.75}}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color.r(), 255);
        assert_eq!(obj.color.g(), 128);
        assert_eq!(obj.color.b(), 64);
        assert_eq!(obj.color.a(), 191); // 0.75 * 255 = 191.25, rounded to 191

        // Test serialization (should convert back to f32 for alpha)
        let serialized = serde_json::to_string(&obj).unwrap();
        let value: serde_json::Value = serde_json::from_str(&serialized).unwrap();
        assert_eq!(value["color"]["r"], 255);
        assert_eq!(value["color"]["g"], 128);
        assert_eq!(value["color"]["b"], 64);
        assert!((value["color"]["a"].as_f64().unwrap() - 0.749).abs() < 0.01); // 191/255 ≈ 0.749
    }

    #[test]
    fn test_formats_object_rgb888a32f_opt() {
        #[derive(Serialize, Deserialize)]
        struct TestStruct {
            #[serde(with = "color_formats::object::RGB888A32F::option")]
            color: Option<CGColor>,
        }

        let json = r#"{"color": null}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color, None);

        let json = r#"{"color": {"r": 0, "g": 255, "b": 0, "a": 1.0}}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color, Some(CGColor::GREEN));

        // Test serialization
        let serialized = serde_json::to_string(&obj).unwrap();
        let deserialized: TestStruct = serde_json::from_str(&serialized).unwrap();
        assert_eq!(deserialized.color, obj.color);
    }

    #[test]
    fn test_formats_object_rgb888a32f_default() {
        #[derive(Serialize, Deserialize)]
        struct TestStruct {
            #[serde(with = "color_formats::object::RGB888A32F", default)]
            color: CGColor,
        }

        // Test with missing field
        let json = r#"{}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color, CGColor::TRANSPARENT);

        // Test with null field
        let json = r#"{"color": null}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color, CGColor::TRANSPARENT);

        // Test with present field
        let json = r#"{"color": {"r": 255, "g": 0, "b": 0, "a": 1.0}}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color, CGColor::RED);
    }

    #[test]
    fn test_formats_object_rgba32f_alpha_conversion() {
        #[derive(Serialize, Deserialize)]
        struct TestStruct {
            #[serde(with = "color_formats::object::RGBA32F")]
            color: CGColor,
        }

        // Test full opacity (1.0 -> 255)
        let json = r#"{"color": {"r": 1.0, "g": 1.0, "b": 1.0, "a": 1.0}}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color.a(), 255);

        // Test transparency (0.0 -> 0)
        let json = r#"{"color": {"r": 1.0, "g": 1.0, "b": 1.0, "a": 0.0}}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color.a(), 0);

        // Test half opacity (0.5 -> 128)
        let json = r#"{"color": {"r": 1.0, "g": 1.0, "b": 1.0, "a": 0.5}}"#;
        let obj: TestStruct = serde_json::from_str(json).unwrap();
        assert_eq!(obj.color.a(), 128);
    }
}
