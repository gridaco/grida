use serde::de::Error;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Debug, Clone, Copy, Hash)]
pub struct CGColor(pub u8, pub u8, pub u8, pub u8);

impl CGColor {
    pub const TRANSPARENT: Self = Self(0, 0, 0, 0);
    pub const BLACK: Self = Self(0, 0, 0, 0xff);
    pub const WHITE: Self = Self(0xff, 0xff, 0xff, 0xff);
    pub const RED: Self = Self(0xff, 0, 0, 0xff);
    pub const GREEN: Self = Self(0, 0xff, 0, 0xff);
    pub const BLUE: Self = Self(0, 0, 0xff, 0xff);

    pub fn from_rgba(r: u8, g: u8, b: u8, a: u8) -> Self {
        Self(r, g, b, a)
    }

    pub fn from_rgb(r: u8, g: u8, b: u8) -> Self {
        Self(r, g, b, 0xff)
    }

    pub fn r(&self) -> u8 {
        self.0
    }
    pub fn g(&self) -> u8 {
        self.1
    }
    pub fn b(&self) -> u8 {
        self.2
    }
    pub fn a(&self) -> u8 {
        self.3
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

// ---------- Serialize: always [r, g, b, a] ----------
impl Serialize for CGColor {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let CGColor(r, g, b, a) = *self;
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
            Repr::Array3([r, g, b]) => Ok(CGColor(r, g, b, 0xff)),
            Repr::Array4([r, g, b, a]) => Ok(CGColor(r, g, b, a)),
            Repr::Object { r, g, b, a } => Ok(CGColor(r, g, b, a.unwrap_or(0xff))),
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

    Ok(CGColor(r, g, b, a))
}

fn dup_hex(d: &str) -> Result<u8, String> {
    let s = format!("{d}{d}");
    u8::from_str_radix(&s, 16).map_err(to_string)
}

fn to_string<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}
