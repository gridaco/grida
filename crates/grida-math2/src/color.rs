use super::vector4::Vector4;

/// The RGBA structure itself. The value range (0-1 or 0-255)
/// depends on the context using this color.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TRGBA {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

/// Floating-Point RGBA (Normalized RGBA) used in graphics pipelines.
pub type RGBAf = TRGBA;

/// 8-bit Integer RGBA (Standard RGBA) used in web graphics.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RGBA8888 {
    /// Red channel value, between 0 and 255.
    pub r: u8,
    /// Green channel value, between 0 and 255.
    pub g: u8,
    /// Blue channel value, between 0 and 255.
    pub b: u8,
    /// Alpha channel value, between 0 and 1.
    pub a: f32,
}

/// Converts a HEX color string to an [`RGBA8888`].
///
/// Supports both short (`#RGB`) and long (`#RRGGBB`) HEX formats.
///
/// # Parameters
/// - `hex`: HEX color string to convert. Must start with `#` and contain
///   3 or 6 characters after the `#`.
///
/// # Panics
/// If the input HEX string is invalid.
///
/// # Examples
/// ```
/// use math2::hex_to_rgba8888;
/// let c = hex_to_rgba8888("#F80");
/// assert_eq!(c.r, 255);
/// assert_eq!(c.g, 136);
/// assert_eq!(c.b, 0);
/// assert_eq!(c.a, 1.0);
/// ```
pub fn hex_to_rgba8888(hex: &str) -> RGBA8888 {
    let hex = hex.trim_start_matches('#');
    let (r, g, b, a) = match hex.len() {
        3 => (
            u8::from_str_radix(&hex[0..1].repeat(2), 16).unwrap(),
            u8::from_str_radix(&hex[1..2].repeat(2), 16).unwrap(),
            u8::from_str_radix(&hex[2..3].repeat(2), 16).unwrap(),
            255u8,
        ),
        6 => (
            u8::from_str_radix(&hex[0..2], 16).unwrap(),
            u8::from_str_radix(&hex[2..4], 16).unwrap(),
            u8::from_str_radix(&hex[4..6], 16).unwrap(),
            255u8,
        ),
        8 => (
            u8::from_str_radix(&hex[0..2], 16).unwrap(),
            u8::from_str_radix(&hex[2..4], 16).unwrap(),
            u8::from_str_radix(&hex[4..6], 16).unwrap(),
            u8::from_str_radix(&hex[6..8], 16).unwrap(),
        ),
        _ => panic!("Invalid hex format. Expected #RGB, #RRGGBB or #RRGGBBAA."),
    };
    RGBA8888 {
        r,
        g,
        b,
        a: a as f32 / 255.0,
    }
}

/// Converts an [`RGBA8888`] color to a 4-component vector `[r, g, b, a]`
/// where the alpha is in the 0-255 range.
pub fn rgba_to_unit8_chunk(rgba: RGBA8888) -> Vector4 {
    [
        rgba.r as f32,
        rgba.g as f32,
        rgba.b as f32,
        (rgba.a * 255.0).round(),
    ]
}

/// Converts a normalized RGBA color to an 8-bit integer RGBA color.
///
/// # Example
/// ```
/// use math2::{rgbaf_to_rgba8888, RGBAf};
/// let c = rgbaf_to_rgba8888(RGBAf { r: 1.0, g: 0.5, b: 0.0, a: 0.75 });
/// assert_eq!(c.r, 255);
/// assert_eq!(c.g, 128);
/// assert_eq!(c.b, 0);
/// assert!((c.a - 0.75).abs() < 1e-6);
/// ```
pub fn rgbaf_to_rgba8888(rgba: RGBAf) -> RGBA8888 {
    RGBA8888 {
        r: (rgba.r * 255.0).round() as u8,
        g: (rgba.g * 255.0).round() as u8,
        b: (rgba.b * 255.0).round() as u8,
        a: rgba.a,
    }
}

/// Multiplies the alpha channel of the color by `alpha`.
pub fn rgbaf_multiply_alpha(color: TRGBA, alpha: f32) -> TRGBA {
    TRGBA {
        a: color.a * alpha,
        ..color
    }
}

/// Returns a HEX color string (with leading `#`).
///
/// # Example
/// ```
/// use math2::{rgba8888_to_hex, RGBA8888};
/// let hex = rgba8888_to_hex(RGBA8888 { r: 255, g: 255, b: 255, a: 1.0 });
/// assert_eq!(hex, "#ffffffff");
/// ```
pub fn rgba8888_to_hex(color: RGBA8888) -> String {
    let a = (color.a * 255.0).round() as u8;
    format!("#{:02x}{:02x}{:02x}{:02x}", color.r, color.g, color.b, a)
}
